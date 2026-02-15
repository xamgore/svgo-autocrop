import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const TEST_FILE = path.join(ROOT, 'test', 'index.test.ts');
const SNAPSHOT_FILE = path.join(ROOT, 'test', '__snapshots__', 'index.test.ts.snap');
const OUTPUT_FILE = path.join(ROOT, 'test', 'visual-report.html');
const PREVIEW_SIZE = 60;

type VisualReportCase = {
	caseId: string;
	name: string;
	inputSvg: string;
	outputSvg: string | null;
	params: Record<string, unknown>;
};

type VisualReportCaseWithOutput = Omit<VisualReportCase, 'outputSvg'> & {
	outputSvg: string;
};

type OptimizeOptionsLike = {
	path?: string;
	plugins?: Array<{
		name?: string;
		params?: Record<string, unknown>;
	}>;
};

function main() {
	const cases = collectCasesFromTests().map(
		(item): VisualReportCaseWithOutput => ({
		...item,
		outputSvg:
			item.outputSvg || '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
		}),
	);
	const html = renderHtml(cases);
	fs.writeFileSync(OUTPUT_FILE, html, 'utf8');
	console.log(`Generated ${path.relative(ROOT, OUTPUT_FILE)} with ${cases.length} cases`);
}

function collectCasesFromTests(): VisualReportCase[] {
	const snapshotMap = readSnapshotOutputs();
	const cases: VisualReportCase[] = [];
	let currentTestName: string | null = null;
	const globalContext = globalThis as any;
	const previousIt = globalContext.it;
	const previousExpect = globalContext.expect;

	const moduleInternal = Module as any;
	const originalLoad = moduleInternal._load;

	function it(name: string, fn: () => void) {
		currentTestName = name;
		try {
			fn();
		} finally {
			currentTestName = null;
		}
	}

	function expect() {
		return {
			toMatchSnapshot() {},
		};
	}

	moduleInternal._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
		if (request === '@jest/globals') {
			return { it, expect };
		}
		if (request === 'svgo') {
			return {
				optimize(input: unknown, options?: OptimizeOptionsLike) {
					const runPath = String(options?.path ?? '');
					const caseIdMatch = /case-(.+)\.svg\.run1$/.exec(runPath);
					const caseId = caseIdMatch ? caseIdMatch[1] : String(cases.length + 1);
					const name = currentTestName || `Case ${caseId}`;
					const entry: VisualReportCase = {
						caseId,
						name: name,
						inputSvg: normalizeSvg(input),
						outputSvg: snapshotMap.get(name) || null,
						params: getParams(options),
					};
					cases.push(entry);
					return { data: input };
				},
			};
		}
		return originalLoad.call(this, request, parent, isMain);
	};

	globalContext.it = it;
	globalContext.expect = expect;
	const testModulePath = require.resolve(TEST_FILE);
	delete require.cache[testModulePath];
	try {
		require(testModulePath);
	} finally {
		moduleInternal._load = originalLoad;
		if (typeof previousIt === 'undefined') {
			delete globalContext.it;
		} else {
			globalContext.it = previousIt;
		}
		if (typeof previousExpect === 'undefined') {
			delete globalContext.expect;
		} else {
			globalContext.expect = previousExpect;
		}
	}

	return cases.sort((a, b) => compareCaseIds(a.caseId, b.caseId));
}

function readSnapshotOutputs() {
	const snapshotModulePath = require.resolve(SNAPSHOT_FILE);
	delete require.cache[snapshotModulePath];
	const snapshots = require(snapshotModulePath);
	const map = new Map<string, string>();
	for (const [key, value] of Object.entries(snapshots)) {
		const name = key.replace(/\s+1$/, '');
		map.set(name, unwrapSnapshotValue(value));
	}
	return map;
}

function unwrapSnapshotValue(value: unknown): string {
	let text = String(value).trim();
	if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
		text = text.slice(1, -1);
	}
	return text.trim();
}

function getParams(options?: OptimizeOptionsLike): Record<string, unknown> {
	const plugins = options?.plugins ?? [];
	const plugin = plugins.find((item) => item && item.name === 'autocrop');
	return plugin?.params ?? {};
}

function normalizeSvg(svg: unknown): string {
	return String(svg).trim();
}

function compareCaseIds(a: string, b: string): number {
	const aNum = Number(a);
	const bNum = Number(b);
	if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
		return aNum - bNum;
	}
	return String(a).localeCompare(String(b));
}

function renderHtml(cases: VisualReportCaseWithOutput[]): string {
	const rows = cases.map((item) => renderRow(item)).join('\n');
	const generatedAt = new Date().toISOString();
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>svgo-autocrop visual report</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --panel: #ffffff;
      --text: #0b1220;
      --muted: #5b667a;
      --border: #d7dde6;
      --checker-a: #eef3f8;
      --checker-b: #f7f9fb;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f1218;
        --panel: #171d27;
        --text: #ecf3ff;
        --muted: #a3afc2;
        --border: #2b3546;
        --checker-a: #121a26;
        --checker-b: #182130;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at 10% 0%, #d9e7f4 0%, var(--bg) 40%);
      color: var(--text);
      font-family: "IBM Plex Sans", "Avenir Next", Avenir, "Segoe UI", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      body { background: radial-gradient(circle at 10% 0%, #28344a 0%, var(--bg) 40%); }
    }
    .wrap {
      max-width: 1240px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 24px;
    }
    .meta {
      color: var(--muted);
      margin-bottom: 14px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: auto;
      box-shadow: 0 8px 24px rgba(5, 10, 20, 0.08);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 880px;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 10px;
      vertical-align: top;
      text-align: left;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--panel);
      font-size: 13px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    tr:last-child td { border-bottom: 0; }
    .name {
      min-width: 260px;
      font-weight: 600;
    }
    .case-id {
      display: inline-block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
    }
    .preview-cell { width: 180px; }
    .preview {
      width: ${PREVIEW_SIZE}px;
      height: ${PREVIEW_SIZE}px;
      display: grid;
      place-items: center;
      overflow: hidden;
      color: var(--text);
      background: linear-gradient(45deg, var(--checker-a) 25%, transparent 25%), linear-gradient(-45deg, var(--checker-a) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--checker-a) 75%), linear-gradient(-45deg, transparent 75%, var(--checker-a) 75%);
      background-size: 12px 12px;
      background-position: 0 0, 0 6px, 6px -6px, -6px 0px;
    }
    .preview > svg {
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
      color: inherit;
      display: block;
    }
    details { margin-top: 8px; }
    summary {
      cursor: pointer;
      color: var(--muted);
      font-size: 12px;
    }
    pre {
      margin: 8px 0 0;
      max-width: 420px;
      max-height: 200px;
      overflow: auto;
      padding: 8px;
      border: 1px solid var(--border);
      background: var(--checker-b);
      font-size: 11px;
      line-height: 1.35;
    }
    .params {
      max-width: 380px;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 11px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>svgo-autocrop visual report</h1>
    <div class="meta">Generated: ${escapeHtml(generatedAt)} | Cases: ${String(cases.length)} | Preview: ${PREVIEW_SIZE}x${PREVIEW_SIZE}</div>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>Test</th>
            <th>Input</th>
            <th>Output</th>
            <th>Params</th>
          </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>
`;
}

function renderRow(item: VisualReportCaseWithOutput): string {
	const paramsJson = JSON.stringify(item.params, null, 2);
	const inputPreviewSvg = getRenderableSvg(item.inputSvg);
	const outputPreviewSvg = getRenderableSvg(item.outputSvg);
	return `          <tr>
            <td class="name">${escapeHtml(item.name)}<div class="case-id">case-${escapeHtml(item.caseId)}</div></td>
            <td class="preview-cell">
              <div class="preview">${inputPreviewSvg}</div>
              <details><summary>Input SVG</summary><pre>${escapeHtml(item.inputSvg)}</pre></details>
            </td>
            <td class="preview-cell">
              <div class="preview">${outputPreviewSvg}</div>
              <details><summary>Output SVG</summary><pre>${escapeHtml(item.outputSvg)}</pre></details>
            </td>
            <td class="params"><pre>${escapeHtml(paramsJson)}</pre></td>
          </tr>`;
}

function getRenderableSvg(svg: string): string {
	const match = /<svg\b[\s\S]*<\/svg>/i.exec(svg);
	return match ? match[0] : svg;
}

function escapeHtml(text: string): string {
	return String(text)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

main();
