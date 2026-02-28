import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE_DIR = path.join(ROOT, 'node_modules', '@strebz');
const PACKAGE_DIR = path.join(SCOPE_DIR, 'svgo-autocrop');
const PACKAGE_JSON_PATH = path.join(PACKAGE_DIR, 'package.json');
const INDEX_MJS_PATH = path.join(PACKAGE_DIR, 'index.mjs');

const SHIM_PACKAGE_JSON = `${JSON.stringify(
    {
        name: '@strebz/svgo-autocrop',
        private: true,
        version: '0.0.0-local',
        type: 'module',
        exports: {
            '.': './index.mjs',
        },
        main: './index.mjs',
    },
    null,
    2,
)}\n`;

const SHIM_INDEX_MJS = [
    "import { createRequire } from 'node:module';",
    '',
    'const require = createRequire(import.meta.url);',
    "const mod = require('../../../index.ts');",
    'const plugin = mod.default ?? mod;',
    '',
    'export default plugin;',
    'export const paramsToBeOptimized = mod.paramsToBeOptimized;',
    '',
].join('\n');

function ensureAlias() {
    fs.mkdirSync(SCOPE_DIR, { recursive: true });
    fs.rmSync(PACKAGE_DIR, { recursive: true, force: true });
    fs.mkdirSync(PACKAGE_DIR, { recursive: true });
    fs.writeFileSync(PACKAGE_JSON_PATH, SHIM_PACKAGE_JSON, 'utf8');
    fs.writeFileSync(INDEX_MJS_PATH, SHIM_INDEX_MJS, 'utf8');
}

ensureAlias();
