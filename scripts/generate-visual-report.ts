// noinspection CssUnresolvedCustomProperty

import fs, { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';

import { Resvg, renderAsync } from '@resvg/resvg-js';
import pixelmatch from 'pixelmatch';
import { type Config, loadConfig, optimize } from 'svgo';

import autocrop, * as autocropModule from '../index';

const ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(ROOT, 'fixtures');
const SVGO_CONFIG_FILE = path.join(ROOT, 'svgo.config.mjs');
const HOST = '127.0.0.1';
const DEFAULT_PORT = Number(process.env.PORT || 4173);
const PREVIEW_SIZE = 96;
const DIFF_RASTER_SIZE = 96;
const JSON_LIMIT_BYTES = 64 * 1024;
const WATCH_DEBOUNCE_MS = 200;

type ComparisonResult = {
    height: number;
    compareTotalMs: number;
    extraPixels: number;
    expectedProbeMs: number;
    expectedRenderMs: number;
    generatedProbeMs: number;
    generatedRenderMs: number;
    generatedVisiblePixels: number;
    intersectionPixels: number;
    iouPercent: number;
    missingPixels: number;
    mismatchPercentTotal: number;
    mismatchPercentVisible: number;
    mismatchPixels: number;
    pixelmatchMs: number;
    rasterWallMs: number;
    totalPixels: number;
    unionVisiblePixels: number;
    visiblePixels: number;
    width: number;
};

type FixtureCase = {
    comparison: ComparisonResult | null;
    error: string | null;
    expectedPath: string;
    expectedSizeBytes: number | null;
    expectedSvg: string | null;
    generatedDurationMs: number | null;
    generatedSizeBytes: number | null;
    generatedSvg: string | null;
    inputPath: string;
    inputSizeBytes: number;
    inputSvg: string;
    name: string;
};

type ServerState = {
    caseNames: string[];
    cases: Map<string, FixtureCase>;
    config: Config;
    isRefreshing: boolean;
    runProcessedCases: number;
    runTotalCases: number;
    refreshPromise: Promise<void> | null;
};

type FixtureKind = 'input' | 'expected' | 'generated';

async function main(): Promise<void> {
    const config = await loadSvgoConfig();
    const initialCaseNames = discoverCaseNames();
    const state: ServerState = {
        caseNames: initialCaseNames,
        cases: new Map<string, FixtureCase>(),
        config: config,
        isRefreshing: false,
        runProcessedCases: 0,
        runTotalCases: initialCaseNames.length,
        refreshPromise: null,
    };

    const server = createServer(state);
    const port = await listenWithFallback(server, DEFAULT_PORT);

    console.log(`Visual fixture report: http://${HOST}:${String(port)}/`);
    console.log('Watch mode enabled.');
    console.log('Press Ctrl+C to stop.');
    triggerRefresh(state, 'startup');

    startWatchMode(state);
}

function createServer(state: ServerState): http.Server {
    return http.createServer((req, res) => {
        void handleRequest(req, res, state).catch((error) => {
            console.error(error);
            sendText(res, 500, `Internal server error: ${toErrorMessage(error)}`);
        });
    });
}

async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    state: ServerState,
): Promise<void> {
    const method = req.method || 'GET';
    const host = req.headers.host || `${HOST}:${String(DEFAULT_PORT)}`;
    const url = new URL(req.url || '/', `http://${host}`);

    if (method === 'GET' && url.pathname === '/') {
        sendHtml(res, 200, renderHtml(state));
        return;
    }

    if (method === 'GET' && url.pathname === '/favicon.ico') {
        res.statusCode = 204;
        res.end();
        return;
    }

    if (method === 'GET' && url.pathname.startsWith('/svg/')) {
        handleSvgRequest(res, url.pathname, state);
        return;
    }

    if (method === 'POST' && url.pathname === '/api/accept') {
        await handleAcceptRequest(req, res, state);
        return;
    }

    if (method === 'GET' && url.pathname === '/api/row') {
        handleRowRequest(res, url, state);
        return;
    }

    if (method === 'GET' && url.pathname === '/api/rows') {
        handleRowsRequest(res, url, state);
        return;
    }

    if (method === 'POST' && url.pathname === '/api/rebuild') {
        const started = triggerRefresh(state, 'manual');
        sendJson(res, 202, {
            ok: true,
            processing: state.isRefreshing,
            started,
            totalCases: state.caseNames.length,
        });
        return;
    }

    sendText(res, 404, 'Not found.');
}

function handleSvgRequest(res: http.ServerResponse, pathname: string, state: ServerState): void {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length !== 3 || segments[0] !== 'svg') {
        sendText(res, 404, 'SVG route not found.');
        return;
    }

    const kind = segments[1] as FixtureKind;
    const name = decodeURIComponent(segments[2]!);
    const fixture = state.cases.get(name);

    if (!fixture) {
        sendText(res, 404, `Fixture is being processed, wait:: ${name}`);
        return;
    }

    const svg = getFixtureSvgByKind(fixture, kind);
    if (!svg) {
        sendText(res, 404, `SVG '${kind}' is not available for '${name}'.`);
        return;
    }

    res.statusCode = 200;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.end(svg);
}

async function handleAcceptRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    state: ServerState,
): Promise<void> {
    const body = await readJsonBody(req);
    const name = typeof body?.name === 'string' ? body.name : '';
    if (!name) {
        sendJson(res, 400, { ok: false, error: "Expected JSON body with a string field 'name'." });
        return;
    }

    const existing = state.cases.get(name);
    if (!existing) {
        sendJson(res, 404, { ok: false, error: `Fixture is being processed, wait: '${name}'.` });
        return;
    }

    if (!existing.generatedSvg) {
        sendJson(res, 400, {
            ok: false,
            error: `Fixture '${name}' has no generated output to accept.`,
        });
        return;
    }

    fs.writeFileSync(existing.expectedPath, existing.generatedSvg, 'utf8');
    const updated = await buildFixtureCase(name, state.config);
    if (isProcessedCase(updated)) {
        state.cases.set(name, updated);
    } else {
        state.cases.delete(name);
    }

    console.log(`[accept] fixtures/${name}.expected.svg`);

    sendJson(res, 200, {
        comparison: updated.comparison,
        ok: true,
        status: getFixtureStatus(updated),
    });
}

function handleRowRequest(res: http.ServerResponse, url: URL, state: ServerState): void {
    const name = url.searchParams.get('name') || '';
    if (!name) {
        sendJson(res, 400, { ok: false, error: "Expected query parameter 'name'." });
        return;
    }

    const fixture = state.cases.get(name);
    if (!fixture) {
        sendJson(res, 404, { ok: false, error: `Fixture '${name}' is not available yet.` });
        return;
    }

    sendJson(res, 200, {
        ok: true,
        rowHtml: renderRow(fixture),
    });
}

function handleRowsRequest(res: http.ServerResponse, url: URL, state: ServerState): void {
    const namesParam = url.searchParams.get('names') || '';
    const requestedNames = namesParam
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
    const uniqueRequestedNames = [...new Set(requestedNames)];
    const allNames =
        uniqueRequestedNames.length > 0
            ? uniqueRequestedNames
            : [...state.cases.keys()].sort((a, b) => a.localeCompare(b, 'en'));

    const rows: Array<{ name: string; rowHtml: string }> = [];
    for (const name of allNames) {
        const fixture = state.cases.get(name);
        if (!fixture) {
            continue;
        }
        rows.push({
            name,
            rowHtml: renderRow(fixture),
        });
    }

    sendJson(res, 200, {
        ok: true,
        processing: state.isRefreshing,
        rows,
        summary: buildLiveSummary(state),
    });
}

function triggerRefresh(state: ServerState, reason: string): boolean {
    return triggerRefreshTask(state, reason, () => refreshAllCases(state));
}

function triggerRefreshCases(state: ServerState, reason: string, caseNames: string[]): boolean {
    return triggerRefreshTask(state, reason, () => refreshCasesByNames(state, caseNames));
}

function triggerRefreshTask(
    state: ServerState,
    reason: string,
    task: () => Promise<void>,
): boolean {
    if (state.refreshPromise) {
        return false;
    }

    state.isRefreshing = true;
    const startedAt = Date.now();
    state.refreshPromise = task()
        .then(() => {
            const durationMs = Date.now() - startedAt;
            const summary = summarizeCases(state);
            console.log(
                `[refresh:${reason}] Processed ${String(state.cases.size)} cases in ${String(durationMs)}ms ` +
                    `(match: ${String(summary.match)}, changed: ${String(summary.changed)}, ` +
                    `missing: ${String(summary.missing)}, error: ${String(summary.error)}).`,
            );
        })
        .catch((error) => {
            console.error(`[refresh:${reason}] ${toErrorMessage(error)}`);
        })
        .finally(() => {
            state.isRefreshing = false;
            state.refreshPromise = null;
        });
    return true;
}

function startWatchMode(state: ServerState): void {
    let debounceTimer: NodeJS.Timeout | null = null;
    let watchRefreshQueued = false;
    let waitingForCurrentRefresh = false;
    let reloadConfigBeforeNextRefresh = false;
    let watchRefreshAttemptInFlight = false;
    let forceFullRefresh = false;
    const queuedCaseNames = new Set<string>();
    let lastConfigSource: string | null = null;

    try {
        lastConfigSource = fs.readFileSync(SVGO_CONFIG_FILE, 'utf8');
    } catch {
        lastConfigSource = null;
    }

    const runWatchRefresh = (): void => {
        if (watchRefreshAttemptInFlight) {
            watchRefreshQueued = true;
            return;
        }
        watchRefreshAttemptInFlight = true;

        const finalize = (): void => {
            watchRefreshAttemptInFlight = false;
            if (!watchRefreshQueued) {
                return;
            }
            watchRefreshQueued = false;
            runWatchRefresh();
        };

        const startRefresh = (): void => {
            const caseNames = [...queuedCaseNames].sort((a, b) => a.localeCompare(b, 'en'));
            queuedCaseNames.clear();
            const shouldRunFullRefresh = forceFullRefresh || caseNames.length === 0;
            forceFullRefresh = false;
            const started = shouldRunFullRefresh
                ? triggerRefresh(state, 'watch')
                : triggerRefreshCases(
                      state,
                      `watch:${String(caseNames.length)} case(s)`,
                      caseNames,
                  );
            if (started) {
                finalize();
                return;
            }

            if (shouldRunFullRefresh) {
                forceFullRefresh = true;
            } else {
                for (const caseName of caseNames) {
                    queuedCaseNames.add(caseName);
                }
            }
            watchRefreshQueued = true;
            if (waitingForCurrentRefresh || !state.refreshPromise) {
                finalize();
                return;
            }

            waitingForCurrentRefresh = true;
            void state.refreshPromise.finally(() => {
                waitingForCurrentRefresh = false;
                finalize();
            });
        };

        if (!reloadConfigBeforeNextRefresh) {
            startRefresh();
            return;
        }

        reloadConfigBeforeNextRefresh = false;
        forceFullRefresh = true;
        void loadSvgoConfig()
            .then((config) => {
                state.config = config;
                console.log('[watch] Reloaded svgo config.');
            })
            .catch((error) => {
                console.error(`[watch] Could not reload svgo config: ${toErrorMessage(error)}`);
            })
            .finally(() => {
                startRefresh();
            });
    };

    const scheduleRefresh = (): void => {
        watchRefreshQueued = true;
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            watchRefreshQueued = false;
            runWatchRefresh();
        }, WATCH_DEBOUNCE_MS);
    };

    const shouldQueueConfigReload = (): boolean => {
        try {
            const nextSource = fs.readFileSync(SVGO_CONFIG_FILE, 'utf8');
            if (lastConfigSource === nextSource) {
                console.log('[watch] config unchanged, skip refresh.');
                return false;
            }
            lastConfigSource = nextSource;
        } catch {
            console.log('[watch] could not read config, skip refresh.');
            return false;
        }

        reloadConfigBeforeNextRefresh = true;
        return true;
    };

    const attachWatch = (
        watchPath: string,
        label: string,
        recursive: boolean,
        onEvent: (eventType: string, changedPath: string) => boolean,
    ): fs.FSWatcher | null => {
        let watchRoot = watchPath;
        try {
            if (fs.statSync(watchPath).isFile()) {
                watchRoot = path.dirname(watchPath);
            }
        } catch {
            watchRoot = path.dirname(watchPath);
        }

        try {
            const watcher = fs.watch(
                watchPath,
                { persistent: true, recursive },
                (eventType, filename) => {
                    const fileName =
                        typeof filename === 'string' && filename
                            ? filename
                            : path.basename(watchPath);
                    const absolutePath = path.resolve(watchRoot, fileName);
                    const changedPath = path.relative(ROOT, absolutePath).replaceAll('\\', '/');
                    if (onEvent(eventType, changedPath)) {
                        scheduleRefresh();
                    }
                },
            );
            return watcher;
        } catch (error) {
            if (recursive) {
                return attachWatch(watchPath, label, false, onEvent);
            }
            console.warn(`[watch] Failed to watch ${label}: ${toErrorMessage(error)}`);
            return null;
        }
    };

    const watchers: Array<fs.FSWatcher | null> = [
        attachWatch(FIXTURES_DIR, 'fixtures', true, (eventType, changedPath) => {
            console.log(`[watch] ${eventType} ${changedPath}`);
            const caseName = getFixtureCaseNameFromChangedPath(changedPath);
            if (caseName) {
                queuedCaseNames.add(caseName);
                return true;
            }
            return false;
        }),
        attachWatch(
            SVGO_CONFIG_FILE,
            path.basename(SVGO_CONFIG_FILE),
            false,
            (eventType, changedPath) => {
                console.log(`[watch] ${eventType} ${changedPath}`);
                return shouldQueueConfigReload();
            },
        ),
    ];

    process.on('exit', () => {
        for (const watcher of watchers) {
            watcher?.close();
        }
    });
}

async function refreshAllCases(state: ServerState): Promise<void> {
    const names = discoverCaseNames();
    const nextCases = new Map<string, FixtureCase>();

    state.caseNames = names;
    state.runTotalCases = names.length;
    state.runProcessedCases = 0;

    // Start a fresh visible list for this refresh run.
    state.cases = new Map<string, FixtureCase>();

    for (const [index, name] of names.entries()) {
        // Yield so HTTP requests can be handled between case builds.
        await yieldToEventLoop();
        const fixture = await buildFixtureCase(name, state.config);
        state.runProcessedCases = index + 1;
        logCaseResult(index + 1, names.length, fixture);
        if (!isProcessedCase(fixture)) {
            continue;
        }
        nextCases.set(name, fixture);

        // Publish incremental progress so browser requests can see completed rows immediately.
        state.cases = new Map(nextCases);
    }
}

async function refreshCasesByNames(state: ServerState, caseNames: string[]): Promise<void> {
    if (caseNames.length === 0) {
        return;
    }

    const knownCaseNames = new Set(discoverCaseNames());
    const knownCaseNamesSorted = [...knownCaseNames].sort((a, b) => a.localeCompare(b, 'en'));
    const nextCases = new Map(state.cases);
    const names = [...new Set(caseNames)]
        .filter((name) => name.length > 0)
        .sort((a, b) => a.localeCompare(b, 'en'));
    const total = names.length;

    state.caseNames = knownCaseNamesSorted;
    state.runTotalCases = knownCaseNamesSorted.length;
    state.runProcessedCases = 0;

    for (const existingName of [...nextCases.keys()]) {
        if (!knownCaseNames.has(existingName)) {
            nextCases.delete(existingName);
        }
    }

    for (const [index, name] of names.entries()) {
        await yieldToEventLoop();
        state.runProcessedCases = index + 1;

        if (!knownCaseNames.has(name)) {
            nextCases.delete(name);
            console.log(`[case ${String(index + 1)}/${String(total)}] ${name} status=removed`);
            continue;
        }

        const fixture = await buildFixtureCase(name, state.config);
        logCaseResult(index + 1, total, fixture);
        if (isProcessedCase(fixture)) {
            nextCases.set(name, fixture);
        } else {
            nextCases.delete(name);
        }
    }

    state.cases = sortCaseMapByName(nextCases);
    state.runProcessedCases = state.runTotalCases;
}

function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(() => {
            resolve();
        });
    });
}

function logCaseResult(position: number, total: number, fixture: FixtureCase): void {
    const status = getFixtureStatus(fixture);
    const mismatch = fixture.comparison
        ? `${fixture.comparison.mismatchPercentVisible.toFixed(2)}%`
        : 'n/a';
    const mismatchPixels = fixture.comparison
        ? `${String(fixture.comparison.mismatchPixels)}/${String(fixture.comparison.visiblePixels)}`
        : 'n/a';
    const optimizeTiming = ` optimize:${String(fixture.generatedDurationMs ?? 0)}ms`;
    const timings = fixture.comparison
        ? ` timing=compare:${String(fixture.comparison.compareTotalMs)}ms`
        : '';
    const error = fixture.error ? ` error=${truncateForLog(fixture.error, 140)}` : '';
    console.log(
        `[case ${String(position)}/${String(total)}] ${fixture.name} status=${status} mismatch=${mismatch} pixels=${mismatchPixels}${optimizeTiming}${timings}${error}`,
    );
    if (fixture.comparison) {
        console.log(
            `  [timing] new Resvg probe(ms) gen:${String(fixture.comparison.generatedProbeMs)} exp:${String(fixture.comparison.expectedProbeMs)} | renderAsync(ms) gen:${String(fixture.comparison.generatedRenderMs)} exp:${String(fixture.comparison.expectedRenderMs)} wall:${String(fixture.comparison.rasterWallMs)} | pixelmatch:${String(fixture.comparison.pixelmatchMs)} compare:${String(fixture.comparison.compareTotalMs)}`,
        );
    }
}

function truncateForLog(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function discoverCaseNames(): string[] {
    const entries = fs.readdirSync(FIXTURES_DIR, { withFileTypes: true });
    const inputNames = new Set<string>();

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        if (entry.name.endsWith('.svg')) {
            if (entry.name.endsWith('.expected.svg') || entry.name.endsWith('.output.svg')) {
                continue;
            }
            inputNames.add(entry.name.slice(0, -'.svg'.length));
        }
    }

    return [...inputNames].sort((a, b) => a.localeCompare(b, 'en'));
}

function sortCaseMapByName(cases: Map<string, FixtureCase>): Map<string, FixtureCase> {
    return new Map(
        [...cases.entries()].sort((left, right) => left[0].localeCompare(right[0], 'en')),
    );
}

function getFixtureCaseNameFromChangedPath(changedPath: string): string | null {
    const normalized = changedPath.replaceAll('\\', '/');
    if (!normalized.startsWith('fixtures/')) {
        return null;
    }

    const fileName = path.basename(normalized);
    if (!fileName.endsWith('.svg')) {
        return null;
    }
    if (fileName.endsWith('.expected.svg')) {
        return fileName.slice(0, -'.expected.svg'.length) || null;
    }
    if (fileName.endsWith('.output.svg')) {
        return fileName.slice(0, -'.output.svg'.length) || null;
    }
    if (fileName.endsWith('.svg')) {
        return fileName.slice(0, -'.svg'.length) || null;
    }
    return null;
}

function isProcessedCase(fixture: FixtureCase): boolean {
    return Boolean(fixture.generatedSvg || fixture.error);
}

async function buildFixtureCase(name: string, config: Config): Promise<FixtureCase> {
    const inputPath = path.join(FIXTURES_DIR, `${name}.svg`);
    const expectedPath = path.join(FIXTURES_DIR, `${name}.expected.svg`);
    const inputSvg = normalizeSvg(await fs.promises.readFile(inputPath, 'utf8'));
    const expectedLegacyPath = path.join(FIXTURES_DIR, `${name}.output.svg`);
    const expectedSvg =
        (await readOptionalFixtureSvg(expectedPath)) ??
        (await readOptionalFixtureSvg(expectedLegacyPath));
    const comparisonExpectedSvg = expectedSvg ?? inputSvg;

    let generatedSvg: string | null = null;
    let generatedDurationMs: number | null = null;
    let error: string | null = null;
    let comparison: ComparisonResult | null = null;
    const generationStartedAt = Date.now();

    await yieldToEventLoop();
    try {
        generatedSvg = runOptimization(inputSvg, inputPath, config);
    } catch (optimizationError) {
        error = toErrorMessage(optimizationError);
    } finally {
        generatedDurationMs = Date.now() - generationStartedAt;
    }

    await yieldToEventLoop();
    if (generatedSvg) {
        try {
            comparison = await compareRenderedSvgs(generatedSvg, comparisonExpectedSvg);
        } catch (comparisonError) {
            const comparisonMessage = `compare: ${toErrorMessage(comparisonError)}`;
            error = error ? `${error}; ${comparisonMessage}` : comparisonMessage;
        }
    }

    return {
        comparison,
        error,
        expectedPath,
        expectedSizeBytes: getUtf8ByteLength(expectedSvg),
        expectedSvg,
        generatedDurationMs,
        generatedSizeBytes: getUtf8ByteLength(generatedSvg),
        generatedSvg,
        inputPath,
        inputSizeBytes: getUtf8ByteLength(inputSvg) || 0,
        inputSvg,
        name,
    };
}

async function readOptionalFixtureSvg(filePath: string): Promise<string | null> {
    try {
        const svg = await fs.promises.readFile(filePath, 'utf8');
        return normalizeSvg(svg);
    } catch (error) {
        if (isMissingFileError(error)) {
            return null;
        }
        throw error;
    }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return Boolean(
        error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT',
    );
}

function runOptimization(inputSvg: string, inputPath: string, config: Config): string {
    const result = optimize(inputSvg, {
        ...config,
        js2svg: {
            ...config.js2svg,
            pretty: true,
        },
        path: inputPath,
        plugins: config.plugins ? [...config.plugins] : undefined,
    });
    return normalizeSvg(result.data);
}

async function compareRenderedSvgs(
    generatedSvg: string,
    expectedSvg: string,
): Promise<ComparisonResult> {
    const compareStartedAt = Date.now();
    const rasterStartedAt = Date.now();
    const [generated, expected] = await Promise.all([
        rasterizeSvg(generatedSvg),
        rasterizeSvg(expectedSvg),
    ]);
    const rasterWallMs = Date.now() - rasterStartedAt;

    const width = Math.max(generated.width, expected.width);
    const height = Math.max(generated.height, expected.height);
    const totalPixels = width * height;

    const generatedPadded = padPixels(
        generated.pixels,
        generated.width,
        generated.height,
        width,
        height,
    );
    const expectedPadded = padPixels(
        expected.pixels,
        expected.width,
        expected.height,
        width,
        height,
    );

    const pixelmatchStartedAt = Date.now();
    const mismatchPixels = pixelmatch(generatedPadded, expectedPadded, void 0, width, height, {
        aaColor: [255, 214, 0],
        diffColor: [255, 46, 46],
        diffColorAlt: [255, 46, 46],
        diffMask: true,
        includeAA: false,
        threshold: 0.1,
    });
    const pixelmatchMs = Date.now() - pixelmatchStartedAt;

    const maskMetrics = analyzeMaskMetrics(generatedPadded, expectedPadded);
    const visiblePixels = maskMetrics.unionVisiblePixels;
    const mismatchPercentVisible =
        visiblePixels === 0
            ? mismatchPixels === 0
                ? 0
                : 100
            : (mismatchPixels / visiblePixels) * 100;
    const mismatchPercentTotal = totalPixels === 0 ? 0 : (mismatchPixels / totalPixels) * 100;
    const iouPercent =
        maskMetrics.unionVisiblePixels === 0
            ? 100
            : (maskMetrics.intersectionPixels / maskMetrics.unionVisiblePixels) * 100;

    return {
        height,
        compareTotalMs: Date.now() - compareStartedAt,
        extraPixels: maskMetrics.extraPixels,
        expectedProbeMs: expected.probeMs,
        expectedRenderMs: expected.renderMs,
        generatedProbeMs: generated.probeMs,
        generatedRenderMs: generated.renderMs,
        generatedVisiblePixels: maskMetrics.generatedVisiblePixels,
        intersectionPixels: maskMetrics.intersectionPixels,
        iouPercent,
        missingPixels: maskMetrics.missingPixels,
        mismatchPercentTotal,
        mismatchPercentVisible,
        mismatchPixels,
        pixelmatchMs,
        rasterWallMs,
        totalPixels,
        unionVisiblePixels: maskMetrics.unionVisiblePixels,
        visiblePixels,
        width,
    };
}

function analyzeMaskMetrics(
    generatedPixels: Uint8ClampedArray,
    expectedPixels: Uint8ClampedArray,
): {
    extraPixels: number;
    generatedVisiblePixels: number;
    intersectionPixels: number;
    missingPixels: number;
    unionVisiblePixels: number;
} {
    let generatedVisiblePixels = 0;
    let intersectionPixels = 0;
    let missingPixels = 0;
    let extraPixels = 0;

    for (let index = 3; index < generatedPixels.length; index += 4) {
        const alphaIndex = index;
        const generatedVisible = generatedPixels[alphaIndex]! > 0;
        const expectedVisible = expectedPixels[alphaIndex]! > 0;

        if (generatedVisible) {
            generatedVisiblePixels += 1;
        }

        if (generatedVisible && expectedVisible) {
            intersectionPixels += 1;
            continue;
        }
        if (expectedVisible) {
            missingPixels += 1;
            continue;
        }
        if (generatedVisible) {
            extraPixels += 1;
        }
    }

    return {
        extraPixels,
        generatedVisiblePixels,
        intersectionPixels,
        missingPixels,
        unionVisiblePixels: intersectionPixels + missingPixels + extraPixels,
    };
}

async function rasterizeSvg(svg: string): Promise<{
    height: number;
    pixels: Buffer;
    probeMs: number;
    renderMs: number;
    width: number;
}> {
    const resvgBaseOptions = {
        background: 'rgba(0, 0, 0, 0)',
        font: {
            loadSystemFonts: false,
        },
        logLevel: 'off' as const,
    };

    const probeStartedAt = Date.now();
    const original = new Resvg(svg, {
        ...resvgBaseOptions,
        fitTo: { mode: 'original' },
    });
    const probeMs = Date.now() - probeStartedAt;

    const originalWidth = Math.max(1, original.width);
    const originalHeight = Math.max(1, original.height);

    const fitTo =
        originalWidth >= originalHeight
            ? ({ mode: 'width', value: DIFF_RASTER_SIZE } as const)
            : ({ mode: 'height', value: DIFF_RASTER_SIZE } as const);

    const renderStartedAt = Date.now();
    const rendered = await renderAsync(svg, {
        ...resvgBaseOptions,
        fitTo,
    });
    const renderMs = Date.now() - renderStartedAt;

    return {
        height: rendered.height,
        pixels: Buffer.from(rendered.pixels),
        probeMs,
        renderMs,
        width: rendered.width,
    };
}

function padPixels(
    source: Buffer,
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number,
): Uint8ClampedArray {
    const padded = new Uint8ClampedArray(targetWidth * targetHeight * 4);

    for (let row = 0; row < sourceHeight; row += 1) {
        const sourceStart = row * sourceWidth * 4;
        const sourceEnd = sourceStart + sourceWidth * 4;
        const targetStart = row * targetWidth * 4;
        padded.set(source.subarray(sourceStart, sourceEnd), targetStart);
    }

    return padded;
}

async function loadSvgoConfig(): Promise<Config> {
    try {
        const config = await loadConfig(SVGO_CONFIG_FILE, ROOT);
        if (config && typeof config === 'object') {
            return config;
        }
    } catch (error) {
        console.warn(toErrorMessage(error));
        console.warn(`Could not load ${path.relative(ROOT, SVGO_CONFIG_FILE)} directly.`);
    }

    const injected = tryLoadConfigByInjectingAutocrop();
    if (injected) {
        console.warn(`Loaded ${path.relative(ROOT, SVGO_CONFIG_FILE)} via ad-hoc injection.`);
        return injected;
    }

    throw new Error(
        `Could not load ${path.relative(ROOT, SVGO_CONFIG_FILE)}. Fix the config import path and retry.`,
    );
}

function tryLoadConfigByInjectingAutocrop(): Config | null {
    const source = fs.readFileSync(SVGO_CONFIG_FILE, 'utf8');
    const configMatch = source.match(/\bconfig\s*=\s*(\{[\s\S]*?\})\s*;/m);
    if (!configMatch) {
        return null;
    }

    const executable = `globalThis.__codexConfig = ${configMatch[1]};`;
    const sandbox: Record<string, unknown> = {
        ...autocropModule,
        autocrop,
    };
    const context = vm.createContext(sandbox);

    new vm.Script(executable, { filename: SVGO_CONFIG_FILE }).runInContext(context);

    const config = sandbox.__codexConfig;
    if (!config || typeof config !== 'object') {
        return null;
    }

    return config as Config;
}

type Summary = {
    changed: number;
    error: number;
    match: number;
    missing: number;
};

type LiveSummary = Summary & {
    processedCases: number;
    remainingCases: number;
    totalCases: number;
    unknown: number;
};

function summarizeCases(state: ServerState): Summary {
    const summary = {
        changed: 0,
        error: 0,
        match: 0,
        missing: 0,
    };

    for (const fixture of state.cases.values()) {
        const status = getFixtureStatus(fixture);
        summary[status] += 1;
    }

    return summary;
}

function buildLiveSummary(state: ServerState): LiveSummary {
    const summary = summarizeCases(state);
    const totalCases = state.caseNames.length;
    const processedCases = Math.min(state.runProcessedCases, totalCases);
    const remainingCases = Math.max(0, totalCases - processedCases);
    const knownCases = summary.match + summary.changed + summary.missing + summary.error;
    const unknown = Math.max(0, totalCases - knownCases);

    return {
        ...summary,
        processedCases,
        remainingCases,
        totalCases,
        unknown,
    };
}

function getFixtureStatus(fixture: FixtureCase): keyof Summary {
    if (fixture.error) {
        return 'error';
    }
    if (!fixture.expectedSvg) {
        return 'missing';
    }
    if (!fixture.comparison) {
        return 'error';
    }
    return fixture.comparison.mismatchPixels === 0 ? 'match' : 'changed';
}

function shouldEnableAccept(fixture: FixtureCase): boolean {
    return Boolean(fixture.generatedSvg);
}

function getFixtureSvgByKind(fixture: FixtureCase, kind: FixtureKind): string | null {
    if (kind === 'input') {
        return injectGeneratedViewBoxRectIntoInputSvg(fixture.inputSvg, fixture.generatedSvg);
    }
    if (kind === 'expected') {
        return getExpectedBaselineSvg(fixture);
    }
    return fixture.generatedSvg;
}

function getExpectedBaselineSvg(fixture: FixtureCase): string {
    return fixture.expectedSvg ?? fixture.inputSvg;
}

function injectGeneratedViewBoxRectIntoInputSvg(
    inputSvg: string,
    generatedSvg: string | null,
): string {
    if (!generatedSvg) {
        return inputSvg;
    }

    // Requirement: input preview must include a red rect from generated viewBox as-is.
    // Do not normalize/fit/pad/expand coordinates; use exact x/y/width/height from generated SVG.
    const match = generatedSvg.match(/<svg\b[^>]*\bviewBox\s*=\s*(['"])(\S+) (\S+) (\S+) (\S+)\1/i);
    if (!match) {
        return inputSvg;
    }

    const [, , x, y, width, height] = match;
    const rect = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#dc2626" fill-opacity="0.2"/>`;
    return inputSvg.replace('</svg>', `${rect}</svg>`);
}

function renderHtml(state: ServerState): string {
    const favicon = readFileSync(path.join(ROOT, './scripts/favicon.svg')).toString();
    const generatedAt = new Date().toISOString();
    const summary = summarizeCases(state);
    const caseNames =
        state.caseNames.length > 0
            ? state.caseNames
            : [...state.cases.keys()].sort((a, b) => a.localeCompare(b, 'en'));
    const totalCases = caseNames.length;
    const processedCases = Math.min(state.runProcessedCases, totalCases);
    const remainingCases = Math.max(0, totalCases - processedCases);
    const knownCases = summary.match + summary.changed + summary.missing + summary.error;
    const unknownCases = Math.max(0, totalCases - knownCases);
    const statusTotal = knownCases + unknownCases;
    const initialSummary = {
        changed: summary.changed,
        error: summary.error,
        match: summary.match,
        missing: summary.missing,
        processedCases,
        remainingCases,
        totalCases,
        unknown: unknownCases,
    };
    const initialSummaryJson = escapeHtml(JSON.stringify(initialSummary));
    const toSegmentWidth = (count: number): string =>
        `${statusTotal > 0 ? ((count / statusTotal) * 100).toFixed(2) : '0.00'}%`;
    const toSegmentPercentLabel = (count: number): string =>
        `${statusTotal > 0 ? ((count / statusTotal) * 100).toFixed(1) : '0.0'}%`;
    const cards = caseNames
        .map((name) => {
            const fixture = state.cases.get(name);
            return fixture ? renderRow(fixture) : renderSkeletonRow(name);
        })
        .join('\n');
    const cardsOrPlaceholder =
        caseNames.length > 0
            ? cards
            : `          <div class="fixtures-empty"><div class="hint">${state.isRefreshing ? 'Processing cases...' : 'No processed cases available.'}</div></div>`;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:image/svg+xml;utf8,${encodeURIComponent(favicon)}"/>
  <title>Fixture report.</title>
  <script>
    (function () {
      try {
        const key = 'visual-report-theme';
        const stored = localStorage.getItem(key);
        if (stored === 'light' || stored === 'dark') {
          document.documentElement.setAttribute('data-theme', stored);
          return;
        }
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      } catch {}
    })();
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  <style>
    :root {
      color-scheme: light;
      --radius: 0.625rem;
      --background: oklch(1 0 0);
      --foreground: oklch(0.145 0 0);
      --card: oklch(1 0 0);
      --card-foreground: oklch(0.145 0 0);
      --popover: oklch(1 0 0);
      --popover-foreground: oklch(0.145 0 0);
      --primary: oklch(0.205 0 0);
      --primary-foreground: oklch(0.985 0 0);
      --secondary: oklch(0.97 0 0);
      --secondary-foreground: oklch(0.205 0 0);
      --muted: oklch(0.97 0 0);
      --muted-foreground: oklch(0.556 0 0);
      --accent: oklch(0.97 0 0);
      --accent-foreground: oklch(0.205 0 0);
      --destructive: oklch(0.577 0.245 27.325);
      --border: oklch(0.922 0 0);
      --input: oklch(0.922 0 0);
      --ring: oklch(0.708 0 0);
      --track-tail-gap: 20px;
      --report-scale: 1.2;

      --bg: var(--background);
      --bg-elev: var(--background);
      --panel: var(--card);
      --panel-2: var(--card);
      --line: var(--border);
      --text: var(--foreground);
      --muted-text: var(--muted-foreground);
      --font-sans: Geist, "Geist Fallback", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      --font-mono: "Geist Mono", "Geist Mono Fallback", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      --changed: hsl(24.6 95% 53.1%);
      --missing: hsl(221.2 83.2% 53.3%);
      --error: hsl(0 72.2% 50.6%);
      --ok: hsl(142.1 76.2% 36.3%);
      --unknown: hsl(215.4 16.3% 46.9%);
      --row-hover: color-mix(in oklab, var(--muted) 50%, transparent);
      --checker-a: color-mix(in oklab, var(--background) 48%, var(--secondary));
      --checker-b: color-mix(in oklab, var(--background) 90%, var(--secondary));
      --link: color-mix(in oklab, var(--primary) 62%, var(--foreground));
      --shadow: 0 12px 32px color-mix(in oklab, var(--foreground) 10%, transparent);
      --fixture-card-bg: #fafafa;
      --fixture-section-padding: 10px;
      --fixture-section-radius: calc(var(--radius) + 8px);
      --fixture-preview-radius: max(0px, calc(var(--fixture-section-radius) - var(--fixture-section-padding)));
    }
    :root[data-theme="dark"] {
      color-scheme: dark;
      --background: oklch(0.145 0 0);
      --foreground: oklch(0.985 0 0);
      --card: oklch(0.205 0 0);
      --card-foreground: oklch(0.985 0 0);
      --popover: oklch(0.205 0 0);
      --popover-foreground: oklch(0.985 0 0);
      --primary: oklch(0.922 0 0);
      --primary-foreground: oklch(0.205 0 0);
      --secondary: oklch(0.269 0 0);
      --secondary-foreground: oklch(0.985 0 0);
      --muted: oklch(0.269 0 0);
      --muted-foreground: oklch(0.708 0 0);
      --accent: oklch(0.269 0 0);
      --accent-foreground: oklch(0.985 0 0);
      --destructive: oklch(0.704 0.191 22.216);
      --border: oklch(1 0 0 / 10%);
      --input: oklch(1 0 0 / 15%);
      --ring: oklch(0.556 0 0);

      --bg-elev: var(--background);
      --panel-2: var(--card);
      --muted-text: var(--muted-foreground);
      --changed: hsl(20.5 90.2% 48.2%);
      --missing: hsl(217.2 91.2% 59.8%);
      --error: hsl(0 72.2% 50.6%);
      --ok: hsl(142.1 70.6% 45.3%);
      --unknown: hsl(215 20.2% 65.1%);
      --row-hover: color-mix(in oklab, var(--muted) 35%, transparent);
      --checker-a: color-mix(in oklab, var(--background) 52%, var(--secondary));
      --checker-b: color-mix(in oklab, var(--background) 82%, var(--secondary));
      --link: color-mix(in oklab, var(--primary) 72%, var(--foreground));
      --shadow: 0 16px 38px rgba(0, 0, 0, 0.5);
      --fixture-card-bg: color-mix(in oklab, var(--muted) 70%, var(--background));
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text);
      background: var(--bg);
      font-family: var(--font-sans);
      font-variant-numeric: tabular-nums;
      font-feature-settings: "tnum" 1, "lnum" 1;
      overflow-x: auto;
      zoom: var(--report-scale);
    }
    .wrap {
      max-width: 1680px;
      margin: 0 auto;
      padding: 0 20px 20px;
    }
    .top-shell {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 50;
      background: var(--bg);
    }
    .top-shell-inner {
      max-width: 1680px;
      margin: 0 auto;
      padding: 20px 20px 8px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 0.01em;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
    }
    @media (min-width: 981px) {
      .header-row {
        padding-inline: 12px;
      }
    }
    .header-left {
      min-width: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      justify-content: center;
    }
    .header-actions {
      margin-top: 0;
    }
    .generated-at {
      color: var(--muted-text);
      font-size: 12px;
      line-height: 1.4;
    }
    .summary-panel {
      flex: 1 1 520px;
      min-width: 420px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: stretch;
    }
    .summary-cards {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(5, minmax(100px, 1fr));
    }
    .summary-card {
      border-radius: 12px;
      padding: 10px 12px;
      background: var(--panel-2);
    }
    .summary-card .k {
      display: block;
      color: var(--muted-text);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      line-height: 1.2;
    }
    .summary-card .v {
      display: block;
      margin-top: 6px;
      color: var(--text);
      font-size: 24px;
      font-weight: 700;
      line-height: 1;
    }
    .summary-card.match { background: color-mix(in oklab, var(--ok) 12%, var(--panel-2)); }
    .summary-card.changed { background: color-mix(in oklab, var(--changed) 12%, var(--panel-2)); }
    .summary-card.missing { background: color-mix(in oklab, var(--missing) 12%, var(--panel-2)); }
    .summary-card.error { background: color-mix(in oklab, var(--error) 12%, var(--panel-2)); }
    .summary-card.unknown { background: color-mix(in oklab, var(--unknown) 12%, var(--panel-2)); }
    .summary-card.is-active .k,
    .summary-card.is-active .v {
      color: #fff;
    }
    .summary-card.match.is-active { background: var(--ok); }
    .summary-card.changed.is-active { background: var(--changed); }
    .summary-card.missing.is-active { background: var(--missing); }
    .summary-card.error.is-active { background: var(--error); }
    .summary-card.unknown.is-active { background: var(--unknown); }
    .summary-bar {
      background: var(--panel-2);
      border-radius: 999px;
      overflow: hidden;
      height: 14px;
      display: flex;
    }
    .summary-meta-row {
      margin-top: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .summary-segment {
      height: 100%;
      min-width: 0;
    }
    .summary-segment.match { background: var(--ok); }
    .summary-segment.changed { background: var(--changed); }
    .summary-segment.missing { background: var(--missing); }
    .summary-segment.error { background: var(--error); }
    .summary-segment.unknown { background: var(--unknown); }
    @media (max-width: 980px) {
      .summary-panel {
        min-width: 100%;
      }
      .summary-cards {
        grid-template-columns: repeat(2, minmax(120px, 1fr));
      }
    }
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: fit-content;
      white-space: nowrap;
      gap: 4px;
      height: 20px;
      min-height: 20px;
      border: none;
      border-radius: 26px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 500;
      line-height: 16px;
      transition: all 120ms ease;
    }
    .pill.match {
      color: color-mix(in oklab, var(--ok) 84%, var(--foreground));
      background: color-mix(in oklab, var(--ok) 16%, var(--background));
    }
    .pill.changed {
      color: color-mix(in oklab, var(--changed) 84%, var(--foreground));
      background: color-mix(in oklab, var(--changed) 16%, var(--background));
    }
    .pill.missing {
      color: color-mix(in oklab, var(--missing) 84%, var(--foreground));
      background: color-mix(in oklab, var(--missing) 16%, var(--background));
    }
    .pill.error {
      color: color-mix(in oklab, var(--error) 84%, var(--foreground));
      background: color-mix(in oklab, var(--error) 16%, var(--background));
    }
    .pill.pill-sm {
      height: 18px;
      min-height: 18px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      line-height: 14px;
    }
    .toolbar-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      white-space: nowrap;
      border: 1px solid var(--input);
      background: var(--background);
      color: var(--text);
      border-radius: calc(var(--radius) + 0px);
      height: 32px;
      padding: 0 10px;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      line-height: 20px;
      cursor: pointer;
      transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
      text-decoration: none;
      box-shadow: 0 1px 2px color-mix(in oklab, var(--foreground) 8%, transparent);
    }
    button:active:enabled {
      opacity: 0.96;
    }
    button:focus-visible {
      outline: none;
      border-color: var(--ring);
      box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 35%, transparent);
    }
    button:disabled {
      pointer-events: none;
      cursor: not-allowed;
      opacity: 0.5;
    }
    .btn-primary {
      border-color: transparent;
      background: var(--primary);
      color: var(--primary-foreground);
    }
    .btn-primary:hover:enabled {
      background: color-mix(in oklab, var(--primary) 90%, var(--background));
      color: var(--primary-foreground);
    }
    .btn-secondary {
      border-color: transparent;
      background: var(--secondary);
      color: var(--secondary-foreground);
    }
    .btn-secondary:hover:enabled {
      background: color-mix(in oklab, var(--secondary) 80%, var(--background));
      color: var(--secondary-foreground);
    }
    .btn-outline {
      border-color: var(--border);
      background: var(--background);
      color: var(--text);
    }
    .btn-outline:hover:enabled {
      background: var(--muted);
      color: var(--text);
    }
    .fixtures-wrap {
      margin-top: 0;
      min-height: max(0px, calc((100vh / var(--report-scale)) - var(--top-shell-height, 0px) - 20px));
      display: flex;
      align-items: center;
      overflow: visible;
    }
    .fixtures-track {
      zoom: 1.1;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: max-content;
      align-items: stretch;
      gap: 14px;
      width: max-content;
      min-width: 100%;
    }
    .fixtures-track::after {
      content: '';
      display: block;
      width: var(--track-tail-gap);
    }
    .fixtures-empty {
      min-width: 360px;
      border: 1px dashed var(--line);
      border-radius: 12px;
      padding: 16px;
    }
    .fixture-card {
      width: fit-content;
      min-width: 330px;
      max-width: 390px;
      display: flex;
      flex-direction: column;
      background: transparent;
      border: 1px solid transparent;
      border-radius: calc(var(--radius) + 4px);
      padding: 12px;
      box-sizing: border-box;
      transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease;
    }
    .fixture-item {
      width: fit-content;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .fixture-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 0 0 8px;
    }
    .fixture-head-main {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      width: 100%;
    }
    .fixture-item.is-skeleton .fixture-card-head {
      min-height: 52px;
      box-sizing: border-box;
    }
    .fixture-title {
      font-weight: 700;
      font-size: 17px;
      line-height: 1.15;
      overflow-wrap: anywhere;
      width: 100%;
      max-width: none;
    }
    .fixture-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .fixture-item-action {
      width: 100%;
      margin-top: 8px;
    }
    .fixture-accept {
      width: 100%;
    }
    .fixture-section {
      display: block;
      padding: var(--fixture-section-padding);
      min-height: 116px;
      background: var(--fixture-card-bg);
      border-radius: var(--fixture-section-radius);
    }
    .generated-missing {
      width: 100%;
    }
    .generated-missing .fixture-label {
      color: var(--text);
    }
    .fixture-section.fixture-section-diff {
      transition: background-color 120ms ease;
    }
    .fixture-section.fixture-section-diff.diff-tone-badge-bg.match {
      background: color-mix(in oklab, var(--ok) 16%, var(--background));
    }
    .fixture-section.fixture-section-diff.diff-tone-badge-bg.changed {
      background: color-mix(in oklab, var(--changed) 16%, var(--background));
    }
    .fixture-section.fixture-section-diff.diff-tone-badge-bg.missing {
      background: color-mix(in oklab, var(--missing) 16%, var(--background));
    }
    .fixture-section.fixture-section-diff.diff-tone-badge-bg.error {
      background: color-mix(in oklab, var(--error) 16%, var(--background));
    }
    .fixture-section-label {
      display: none;
    }
    .fixture-section-main {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: flex-start;
      gap: var(--fixture-section-padding);
    }
    .fixture-section-main.stack {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
    .fixture-section-main.stack .fixture-meta {
      width: 100%;
      max-width: 100%;
    }
    .fixture-section-main.expected-stub {
      visibility: hidden;
    }
    .fixture-section-main > .preview {
      flex: 0 0 auto;
    }
    .fixture-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      min-width: 0;
      max-width: none;
    }
    .table-footer-meta {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 14px;
      font-size: 12px;
      line-height: 1.2;
      font-weight: 500;
      color: var(--muted-text);
    }
    .preview {
      width: ${String(PREVIEW_SIZE)}px;
      height: ${String(PREVIEW_SIZE)}px;
      border: none;
      border-radius: var(--fixture-preview-radius);
      position: relative;
      background:
        linear-gradient(45deg, var(--checker-a) 25%, transparent 25%),
        linear-gradient(-45deg, var(--checker-a) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, var(--checker-a) 75%),
        linear-gradient(-45deg, transparent 75%, var(--checker-a) 75%),
        var(--checker-b);
      background-size: 14px 14px;
      background-position: 0 0, 0 7px, 7px -7px, -7px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .preview > img {
      max-width: 100%;
      max-height: 100%;
      display: block;
    }
    .preview.preview-skeleton {
      background: var(--muted);
    }
    .blend-preview {
      isolation: isolate;
    }
    .blend-preview > img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      object-fit: contain;
    }
    .blend-preview > img.base {
      mix-blend-mode: normal;
    }
    .blend-preview > img.top {
      mix-blend-mode: difference;
      opacity: 1;
      filter: invert(1);
    }
    .links {
      display: flex;
      gap: 8px;
      font-size: 12px;
    }
    .links.is-empty { display: none; }
    .links a {
      color: var(--link);
      text-decoration: none;
    }
    .links a:hover { text-decoration: underline; }
    .fixture-label {
      font-size: 12px;
      line-height: 1.8;
      font-weight: 600;
      color: var(--text);
    }
    .links a .fixture-label {
      color: var(--text);
    }
    .diff-status-label {
      display: inline-block;
      color: var(--text);
    }
    .diff-status-label.match {
      color: color-mix(in oklab, var(--ok) 84%, var(--foreground));
    }
    .diff-status-label.changed {
      color: color-mix(in oklab, var(--changed) 84%, var(--foreground));
    }
    .diff-status-label.missing {
      color: color-mix(in oklab, var(--missing) 84%, var(--foreground));
    }
    .diff-status-label.error {
      color: color-mix(in oklab, var(--error) 84%, var(--foreground));
    }
    .hint {
      font-size: 11px;
      color: var(--muted-text);
      max-width: none;
      overflow-wrap: normal;
      line-height: 1.35;
    }
    .generated-error-message {
      color: var(--muted-text);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .metric {
      font-size: 11px;
      color: var(--muted-text);
      line-height: 1.35;
      font-weight: 400;
    }
    .metric-title-row {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 0;
      margin-bottom: 0;
    }
    .metric-title-row .pill-sm {
      margin-left: -8px;
    }
    .metric.delta {
      color: var(--muted-text);
    }
    .metric-block {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .viewbox-hint {
      font-family: var(--font-sans);
      font-size: 11px;
      line-height: 1.35;
      letter-spacing: normal;
      white-space: nowrap;
    }
    .skeleton {
      background: var(--muted);
      border-radius: calc(var(--radius) - 2px);
      animation: skeleton-pulse 1.6s ease-in-out infinite;
    }
    .skeleton-line {
      height: 12px;
    }
    .skeleton-meta {
      max-width: 170px;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-start;
    }
    .skeleton-meta .line-1 {
      width: 92%;
    }
    .skeleton-meta .line-2 {
      width: 76%;
    }
    .skeleton-meta .line-3 {
      width: 62%;
    }
    .fixture-item.is-skeleton .fixture-title {
      max-width: none;
    }
    @keyframes skeleton-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top-shell" id="top-shell">
      <div class="top-shell-inner">
      <div class="header-row">
        <div class="header-left">
          <h1>Fixture report.</h1>
          <div class="toolbar-actions header-actions">
            <button type="button" class="btn-secondary" id="rebuild-all">Re-run all fixtures</button>
            <button type="button" class="btn-secondary" id="theme-toggle" aria-pressed="false">Dark theme</button>
          </div>
        </div>
        <div class="summary-panel" data-initial-summary="${initialSummaryJson}" x-data="summaryPanel($el.dataset.initialSummary)" x-init="init()">
          <div class="summary-cards">
            <div class="summary-card changed" :class="{ 'is-active': summary.changed > 0 }"><span class="k">Changed</span><span class="v" x-text="summary.changed">${String(summary.changed)}</span></div>
            <div class="summary-card missing" :class="{ 'is-active': summary.missing > 0 }"><span class="k">New</span><span class="v" x-text="summary.missing">${String(summary.missing)}</span></div>
            <div class="summary-card match" :class="{ 'is-active': summary.match > 0 }"><span class="k">Matched</span><span class="v" x-text="summary.match">${String(summary.match)}</span></div>
            <div class="summary-card error" :class="{ 'is-active': summary.error > 0 }"><span class="k">Errors</span><span class="v" x-text="summary.error">${String(summary.error)}</span></div>
            <div class="summary-card unknown" :class="{ 'is-active': summary.unknown > 0 }"><span class="k">Unknown</span><span class="v" x-text="summary.unknown">${String(unknownCases)}</span></div>
          </div>
          <div class="summary-bar" role="img" aria-label="Status distribution">
            <span class="summary-segment changed" :style="{ width: segmentWidth(summary.changed) }" :title="segmentTitle('changed', summary.changed)" style="width: ${toSegmentWidth(summary.changed)}" title="changed: ${String(summary.changed)} (${toSegmentPercentLabel(summary.changed)})"></span>
            <span class="summary-segment missing" :style="{ width: segmentWidth(summary.missing) }" :title="segmentTitle('new', summary.missing)" style="width: ${toSegmentWidth(summary.missing)}" title="new: ${String(summary.missing)} (${toSegmentPercentLabel(summary.missing)})"></span>
            <span class="summary-segment match" :style="{ width: segmentWidth(summary.match) }" :title="segmentTitle('matched', summary.match)" style="width: ${toSegmentWidth(summary.match)}" title="matched: ${String(summary.match)} (${toSegmentPercentLabel(summary.match)})"></span>
            <span class="summary-segment error" :style="{ width: segmentWidth(summary.error) }" :title="segmentTitle('errors', summary.error)" style="width: ${toSegmentWidth(summary.error)}" title="errors: ${String(summary.error)} (${toSegmentPercentLabel(summary.error)})"></span>
            <span class="summary-segment unknown" :style="{ width: segmentWidth(summary.unknown) }" :title="segmentTitle('unknown', summary.unknown)" style="width: ${toSegmentWidth(unknownCases)}" title="unknown: ${String(unknownCases)} (${toSegmentPercentLabel(unknownCases)})"></span>
          </div>
          <div class="summary-meta-row">
            <div class="generated-at">Generated at ${escapeHtml(generatedAt)}</div>
            <div class="table-footer-meta">
              <span x-text="summary.processedCases + ' processed'">${String(processedCases)} processed</span>
              <span x-text="summary.remainingCases + ' remaining'">${String(remainingCases)} remaining</span>
            </div>
          </div>
        </div>
      </div>

      </div>
    </div>
    <div id="top-shell-spacer" aria-hidden="true"></div>

    <div class="fixtures-wrap">
      <div class="fixtures-track">
${cardsOrPlaceholder}
      </div>
    </div>
  </div>

  <script>
    const statusLine = document.getElementById('status-line');
    const rebuildAllButton = document.getElementById('rebuild-all');
    const themeToggleButton = document.getElementById('theme-toggle');
    const topShell = document.getElementById('top-shell');
    const topShellSpacer = document.getElementById('top-shell-spacer');
    const reportTitle = document.querySelector('h1');
    const themeStorageKey = 'visual-report-theme';
    window.__summaryPanel = null;
    window.__summaryPanelRegistered = false;

    function registerSummaryPanelComponent() {
      if (!window.Alpine || window.__summaryPanelRegistered) {
        return;
      }
      window.__summaryPanelRegistered = true;

      window.Alpine.data('summaryPanel', (initialSummaryJson) => {
        let initialSummary = {};
        try {
          if (typeof initialSummaryJson === 'string' && initialSummaryJson) {
            initialSummary = JSON.parse(initialSummaryJson);
          }
        } catch {}

        const safeInitial = initialSummary && typeof initialSummary === 'object' ? initialSummary : {};
        const toInt = (value) => Math.max(0, Number(value || 0));

        return {
          summary: {
            changed: toInt(safeInitial.changed),
            missing: toInt(safeInitial.missing),
            match: toInt(safeInitial.match),
            error: toInt(safeInitial.error),
            unknown: toInt(safeInitial.unknown),
            totalCases: toInt(safeInitial.totalCases),
            processedCases: toInt(safeInitial.processedCases),
            remainingCases: toInt(safeInitial.remainingCases)
          },
          init() {
            window.__summaryPanel = this;
          },
          segmentWidth(value) {
            const total = this.summary.totalCases;
            if (!total) {
              return '0.00%';
            }
            return ((Number(value || 0) / total) * 100).toFixed(2) + '%';
          },
          segmentTitle(label, value) {
            const total = this.summary.totalCases;
            const count = Number(value || 0);
            const percent = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
            return label + ': ' + String(count) + ' (' + percent + '%)';
          },
          updateSummary(nextSummary) {
            if (!nextSummary || typeof nextSummary !== 'object') {
              return;
            }
            this.summary.changed = toInt(nextSummary.changed);
            this.summary.missing = toInt(nextSummary.missing);
            this.summary.match = toInt(nextSummary.match);
            this.summary.error = toInt(nextSummary.error);
            this.summary.unknown = toInt(nextSummary.unknown);
            this.summary.totalCases = toInt(nextSummary.totalCases);
            this.summary.processedCases = toInt(nextSummary.processedCases);
            this.summary.remainingCases = toInt(nextSummary.remainingCases);
          }
        };
      });
    }

    if (window.Alpine) {
      registerSummaryPanelComponent();
    }
    document.addEventListener('alpine:init', registerSummaryPanelComponent);

    function getCurrentTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      return current === 'dark' ? 'dark' : 'light';
    }

    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      if (themeToggleButton) {
        const isDark = theme === 'dark';
        themeToggleButton.textContent = isDark ? 'Light theme' : 'Dark theme';
        themeToggleButton.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      }
    }

    applyTheme(getCurrentTheme());

    function syncTopShellSpacer() {
      if (!(topShell instanceof HTMLElement) || !(topShellSpacer instanceof HTMLElement)) {
        return;
      }
      const shellHeight = Math.ceil(topShell.getBoundingClientRect().height);
      topShellSpacer.style.height = String(shellHeight) + 'px';
      document.documentElement.style.setProperty('--top-shell-height', String(shellHeight) + 'px');
    }

    function syncTrackTailGap() {
      let gap = 20;
      if (reportTitle instanceof HTMLElement) {
        gap = Math.max(0, Math.round(reportTitle.getBoundingClientRect().left));
      }
      document.documentElement.style.setProperty('--track-tail-gap', String(gap) + 'px');
    }

    syncTopShellSpacer();
    syncTrackTailGap();
    window.addEventListener('resize', syncTopShellSpacer);
    window.addEventListener('resize', syncTrackTailGap);
    if (typeof ResizeObserver !== 'undefined' && topShell instanceof HTMLElement) {
      const shellResizeObserver = new ResizeObserver(() => {
        syncTopShellSpacer();
        syncTrackTailGap();
      });
      shellResizeObserver.observe(topShell);
    }

    if (themeToggleButton) {
      themeToggleButton.addEventListener('click', () => {
        const nextTheme = getCurrentTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        try {
          localStorage.setItem(themeStorageKey, nextTheme);
        } catch {}
      });
    }

    function setStatus(message) {
      if (statusLine) {
        statusLine.textContent = message;
      }
    }

    async function postJson(url, body) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
      }

      if (!response.ok) {
        const message = data && typeof data.error === 'string' ? data.error : ('HTTP ' + response.status);
        throw new Error(message);
      }

      return data;
    }

    async function fetchRowsByNames(names) {
      if (!Array.isArray(names) || names.length === 0) {
        return { rows: [], summary: null };
      }
      const response = await fetch('/api/rows?names=' + encodeURIComponent(names.join(',')), {
        cache: 'no-store'
      });
      if (!response.ok) {
        return { rows: [], summary: null };
      }
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.rows)) {
        return { rows: [], summary: null };
      }
      return payload;
    }

    function applySummary(summary) {
      if (window.__summaryPanel && typeof window.__summaryPanel.updateSummary === 'function') {
        window.__summaryPanel.updateSummary(summary);
      }
    }

    if (rebuildAllButton) {
      rebuildAllButton.addEventListener('click', async () => {
        rebuildAllButton.disabled = true;
        setStatus('Re-running all fixtures...');
        try {
          const response = await postJson('/api/rebuild', {});
          if (response && response.started) {
            setStatus('Rebuild started in background. Reload after processing is idle.');
          } else {
            setStatus('Rebuild is already running.');
          }
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error));
        } finally {
          rebuildAllButton.disabled = false;
        }
      });
    }

    function bindAcceptButton(button) {
      if (!button || button.dataset.acceptBound === '1') {
        return;
      }
      button.dataset.acceptBound = '1';

      button.addEventListener('click', async () => {
        const fixtureName = button.getAttribute('data-fixture-name');
        if (!fixtureName) {
          return;
        }

        button.disabled = true;
        setStatus('Approving ' + fixtureName + '...');

        try {
          await postJson('/api/accept', { name: fixtureName });
          const payload = await fetchRowsByNames([fixtureName]);
          applySummary(payload.summary);
          const updatedRow = payload.rows.find((item) => item && item.name === fixtureName && typeof item.rowHtml === 'string');
          if (!updatedRow) {
            throw new Error('Failed to refresh row.');
          }
          replaceRowByName(fixtureName, updatedRow.rowHtml);
          setStatus('Updated fixtures/' + fixtureName + '.expected.svg.');
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error));
          button.disabled = false;
        }
      });
    }

    const acceptButtons = document.querySelectorAll('button[data-fixture-name]');
    for (const button of acceptButtons) {
      bindAcceptButton(button);
    }

    let skeletonPollTimer = null;
    let skeletonPollInFlight = false;

    function getSkeletonFixtureNames() {
      const skeletonCards = document.querySelectorAll('.fixture-item.is-skeleton[data-fixture-name]');
      const names = [];
      for (const card of skeletonCards) {
        const name = card.getAttribute('data-fixture-name');
        if (!name) {
          continue;
        }
        names.push(name);
      }
      return names;
    }

    function replaceRowByName(fixtureName, rowHtml) {
      const currentCard = document.querySelector('.fixture-item[data-fixture-name="' + CSS.escape(fixtureName) + '"]');
      if (!currentCard) {
        return false;
      }
      currentCard.outerHTML = rowHtml;
      const replacementButton = document.querySelector('button[data-fixture-name="' + CSS.escape(fixtureName) + '"]');
      if (replacementButton) {
        bindAcceptButton(replacementButton);
      }
      return true;
    }

    async function pollSkeletonRowsOnce() {
      if (skeletonPollInFlight) {
        return;
      }
      const names = getSkeletonFixtureNames();
      if (names.length === 0) {
        if (skeletonPollTimer !== null) {
          clearInterval(skeletonPollTimer);
          skeletonPollTimer = null;
        }
        return;
      }

      skeletonPollInFlight = true;
      try {
        const payload = await fetchRowsByNames(names);
        applySummary(payload.summary);
        for (const item of payload.rows) {
          if (!item || typeof item.name !== 'string' || typeof item.rowHtml !== 'string') {
            continue;
          }
          replaceRowByName(item.name, item.rowHtml);
        }
      } catch {
      } finally {
        skeletonPollInFlight = false;
      }
    }

    if (getSkeletonFixtureNames().length > 0) {
      void pollSkeletonRowsOnce();
      skeletonPollTimer = window.setInterval(() => {
        void pollSkeletonRowsOnce();
      }, 500);
    }

    window.addEventListener(
      'wheel',
      (event) => {
        // Do not intercept zoom gestures (trackpad pinch / Ctrl+wheel).
        if (event.ctrlKey || event.metaKey || event.altKey || event.deltaZ !== 0) {
          return;
        }
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
          return;
        }
        const hasVerticalOverflow =
          document.documentElement.scrollHeight > window.innerHeight + 1;
        if (hasVerticalOverflow) {
          return;
        }
        const maxHorizontal = document.documentElement.scrollWidth - window.innerWidth;
        if (maxHorizontal <= 0) {
          return;
        }
        const atStart = window.scrollX <= 0 && event.deltaY < 0;
        const atEnd = window.scrollX >= maxHorizontal && event.deltaY > 0;
        if (atStart || atEnd) {
          return;
        }
        window.scrollBy({ left: event.deltaY });
        event.preventDefault();
      },
      { passive: false },
    );
  </script>
</body>
</html>`;
}

function renderSkeletonRow(name: string): string {
    return `          <div class="fixture-item is-skeleton" data-fixture-name="${escapeHtml(name)}" aria-busy="true">
            <article class="fixture-card">
            <div class="fixture-card-head">
              <div class="fixture-title">${escapeHtml(`${name}.svg`)}</div>
            </div>

            <div class="fixture-body">
              ${renderSkeletonSection()}
              ${renderSkeletonSection()}
              ${renderSkeletonSection()}
              ${renderSkeletonSection()}
            </div>
            </article>
          </div>`;
}

function renderSkeletonSection(): string {
    return `<section class="fixture-section">
                <div class="fixture-section-main">
                  <div class="preview preview-skeleton" aria-hidden="true"></div>
                  <div class="skeleton-meta" aria-hidden="true">
                    <div class="skeleton skeleton-line line-1"></div>
                    <div class="skeleton skeleton-line line-2"></div>
                    <div class="skeleton skeleton-line line-3"></div>
                  </div>
                </div>
              </section>`;
}

function renderRow(fixture: FixtureCase): string {
    const status = getFixtureStatus(fixture);
    const encodedName = encodeURIComponent(fixture.name);
    const inputLabel = 'Input';
    const expectedLabel = 'Expected';
    const generatedLabel = 'Actual';
    const inputLabelHtml = `<span class="fixture-label">${escapeHtml(inputLabel)}</span>`;
    const expectedLabelHtml = `<span class="fixture-label">${escapeHtml(expectedLabel)}</span>`;
    const generatedLabelHtml = `<span class="fixture-label">${escapeHtml(generatedLabel)}</span>`;
    const expectedBaselineSvg = getExpectedBaselineSvg(fixture);
    const inputViewBox = extractSvgViewBox(fixture.inputSvg);
    const generatedViewBox = extractSvgViewBox(fixture.generatedSvg);
    const expectedViewBox = extractSvgViewBox(expectedBaselineSvg);
    const inputSizeLabel = formatKilobytes(fixture.inputSizeBytes);
    const generatedSizeLabel = formatKilobytes(fixture.generatedSizeBytes);
    const generatedDurationLabel = formatDurationMs(fixture.generatedDurationMs);
    const hasExpected = Boolean(fixture.expectedSvg);
    const expectedSizeBytesForDisplay = fixture.expectedSizeBytes ?? fixture.inputSizeBytes;
    const expectedSizeLabel = formatKilobytes(expectedSizeBytesForDisplay);
    const sizeDeltaMetric = renderKilobyteDeltaMetric(
        fixture.generatedSizeBytes,
        expectedSizeBytesForDisplay,
    );
    const hasGenerated = Boolean(fixture.generatedSvg);
    const isNewFixture = status === 'missing';
    const hasGeneratedError = Boolean(fixture.error) && !hasGenerated;
    const isGeneratedMissing = !hasGenerated && !fixture.error;
    const canAccept = shouldEnableAccept(fixture);
    const generatedPreview = hasGenerated
        ? `<div class="preview"><img src="/svg/generated/${encodedName}" alt="Generated ${escapeHtml(fixture.name)}" loading="lazy" decoding="async"></div>`
        : hasGeneratedError
          ? ''
          : '<div class="generated-missing"><span class="fixture-label">Actual is missing.</span></div>';
    const generatedError = fixture.error
        ? `<div class="fixture-label">Actual is missing.</div>
           <div class="metric generated-error-message">${escapeHtml(fixture.error)}</div>`
        : '';
    const generatedDetails = hasGenerated
        ? `${renderLinks(`<a href="/svg/generated/${encodedName}" target="_blank" rel="noreferrer">${generatedLabelHtml}</a>`)}
           <div class="hint viewbox-hint">vbox ${escapeHtml(generatedViewBox)}</div>
           <div class="hint">size ${escapeHtml(generatedSizeLabel)}</div>
           <div class="hint">time ${escapeHtml(generatedDurationLabel)}</div>`
        : '';

    const diffFallbackMessage = hasExpected
        ? 'Diff preview needs generated SVG.'
        : 'Expected output is missing.';
    const metrics = fixture.comparison
        ? `<div class="metric">∩÷U ${fixture.comparison.iouPercent.toFixed(2)}%</div>
           <div class="metric">pixels -${String(fixture.comparison.missingPixels)} +${String(fixture.comparison.extraPixels)} px</div>`
        : hasGenerated
          ? hasExpected
              ? '<div class="metric">No diff metrics available.</div>'
              : '<div class="metric">Expected output is missing.</div>'
          : `<div class="metric">${diffFallbackMessage}</div>`;
    const diffStatusLabel =
        status === 'match'
            ? 'Matched'
            : status === 'changed'
              ? 'Changed'
              : status === 'missing'
                ? 'New'
                : 'Error';
    const diffMetricTitle = `<div class="metric-title-row"><span class="fixture-label diff-status-label ${status}">${diffStatusLabel}</span></div>`;

    const diffPreview = hasGenerated
        ? `<div class="preview blend-preview">
                 <img class="base" src="/svg/expected/${encodedName}" alt="" aria-hidden="true" loading="lazy" decoding="async">
                 <img class="top" src="/svg/generated/${encodedName}" alt="" aria-hidden="true" loading="lazy" decoding="async">
               </div>`
        : '';
    const generatedSectionMainClass = hasGenerated
        ? 'fixture-section-main'
        : 'fixture-section-main stack';
    const generatedSectionClass =
        hasGeneratedError || isGeneratedMissing
            ? 'fixture-section fixture-section-diff diff-tone-badge-bg error'
            : 'fixture-section';
    const diffSectionMainClass = hasGenerated
        ? 'fixture-section-main'
        : 'fixture-section-main stack';
    const diffStatusClass = status === 'missing' ? 'missing' : status;
    const diffSectionClass = `fixture-section fixture-section-diff diff-tone-badge-bg ${diffStatusClass}`;
    const expectedSectionMainClass = isNewFixture
        ? 'fixture-section-main expected-stub'
        : 'fixture-section-main';

    return `          <div class="fixture-item" data-fixture-name="${escapeHtml(fixture.name)}">
            <article class="fixture-card">
            <div class="fixture-card-head">
              <div class="fixture-head-main">
                <div class="fixture-title">${escapeHtml(`${fixture.name}.svg`)}</div>
              </div>
            </div>

            <div class="fixture-body">
              <section class="fixture-section">
                <div class="fixture-section-main">
                  <div class="preview"><img src="/svg/input/${encodedName}" alt="Input ${escapeHtml(fixture.name)}" loading="lazy" decoding="async"></div>
                  <div class="fixture-meta">
                    ${renderLinks(`<a href="/svg/input/${encodedName}" target="_blank" rel="noreferrer">${inputLabelHtml}</a>`)}
                    <div class="hint viewbox-hint">vbox ${escapeHtml(inputViewBox)}</div>
                    <div class="hint">size ${escapeHtml(inputSizeLabel)}</div>
                  </div>
                </div>
              </section>

              <section class="fixture-section">
                <div class="${expectedSectionMainClass}">
                  <div class="preview"><img src="/svg/expected/${encodedName}" alt="Expected ${escapeHtml(fixture.name)}" loading="lazy" decoding="async"></div>
                  <div class="fixture-meta">
                    ${renderLinks(
                        hasExpected
                            ? `<a href="/svg/expected/${encodedName}" target="_blank" rel="noreferrer">${expectedLabelHtml}</a>`
                            : expectedLabelHtml,
                    )}
                    <div class="hint viewbox-hint">vbox ${escapeHtml(expectedViewBox)}</div>
                    <div class="hint">size ${escapeHtml(expectedSizeLabel)}</div>
                  </div>
                </div>
              </section>

              <section class="${generatedSectionClass}">
                <div class="${generatedSectionMainClass}">
                  ${generatedPreview}
                  <div class="fixture-meta">
                    ${generatedError}
                    ${generatedDetails}
                  </div>
                </div>
              </section>

              <section class="${diffSectionClass}">
                <div class="${diffSectionMainClass}">
                  ${diffPreview}
                  <div class="fixture-meta">
                    <div class="metric-block">${diffMetricTitle}${metrics}${sizeDeltaMetric}</div>
                  </div>
                </div>
              </section>
            </div>
            <div class="fixture-item-action">
              <button type="button" class="btn-outline fixture-accept" data-fixture-name="${escapeHtml(fixture.name)}" title="Approve and write generated SVG to fixtures/${escapeHtml(fixture.name)}.expected.svg" ${canAccept ? '' : 'disabled'}>Approve</button>
            </div>
            </article>
          </div>`;
}

function renderLinks(content: string): string {
    const normalized = content.trim();
    const className = normalized ? 'links' : 'links is-empty';
    return `<div class="${className}">${normalized}</div>`;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function extractSvgViewBox(svg: string | null): string {
    if (!svg) {
        return '(no viewBox)';
    }
    const match = svg.match(/<svg\b[^>]*\bviewBox\s*=\s*(['"])(.*?)\1/i);
    if (!match) {
        return '(no viewBox)';
    }
    return match[2]!.trim().replace(/(\.\d{3})\d+/g, '$1') || '(no viewBox)';
}

function getUtf8ByteLength(value: string | null): number | null {
    if (!value) {
        return null;
    }
    return Buffer.byteLength(value, 'utf8');
}

function formatKilobytes(bytes: number | null): string {
    if (bytes === null) {
        return '(none)';
    }
    return `${(bytes / 1024).toFixed(2)} KB`;
}

function renderKilobyteDeltaMetric(
    generatedBytes: number | null,
    expectedBytes: number | null,
): string {
    if (generatedBytes === null || expectedBytes === null) {
        return '';
    }

    const deltaKilobytes = (generatedBytes - expectedBytes) / 1024;
    if (deltaKilobytes > 0) {
        return `<div class="metric delta">size +${deltaKilobytes.toFixed(2)} KB</div>`;
    }
    if (deltaKilobytes < 0) {
        return `<div class="metric delta">size -${Math.abs(deltaKilobytes).toFixed(2)} KB</div>`;
    }
    return '<div class="metric delta">size 0.00 KB</div>';
}

function formatDurationMs(durationMs: number | null): string {
    if (durationMs === null) {
        return '(none)';
    }
    return `${String(durationMs)} ms`;
}

function sendHtml(res: http.ServerResponse, statusCode: number, html: string): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(html);
}

function sendText(res: http.ServerResponse, statusCode: number, text: string): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(payload));
}

function normalizeSvg(svg: string): string {
    return svg.trim().replaceAll('\r\n', '\n');
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += bytes.length;
        if (totalBytes > JSON_LIMIT_BYTES) {
            throw new Error(`Request body too large (max ${String(JSON_LIMIT_BYTES)} bytes).`);
        }
        chunks.push(bytes);
    }

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
        return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Expected JSON object.');
    }

    return parsed as Record<string, unknown>;
}

function listenWithFallback(server: http.Server, preferredPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
        let hasRetried = false;

        const onError = (error: NodeJS.ErrnoException) => {
            if (error.code === 'EADDRINUSE' && !hasRetried) {
                hasRetried = true;
                server.listen(0, HOST);
                return;
            }
            reject(error);
        };

        server.on('error', onError);

        server.listen(preferredPort, HOST, () => {
            server.off('error', onError);
            const address = server.address();
            if (!address || typeof address === 'string') {
                reject(new Error('Could not resolve server port.'));
                return;
            }
            resolve(address.port);
        });
    });
}

if (require.main === module) {
    void main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
