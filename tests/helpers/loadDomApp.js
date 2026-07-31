// Companion to loadApp.js for scripts that touch the DOM (document.createElement,
// DOMParser, etc.) and so need a real jsdom global rather than a plain vm sandbox.
//
// Unlike vm.runInContext against one persistent Context (used by loadApp.js), each
// separate indirect-eval() call in Node gets its OWN throwaway lexical scope for
// top-level `const`/`let` — it does NOT behave like separate classic <script> tags
// sharing one page-level scope (verified empirically; vm.Context does share that,
// eval() does not). So after evaluating each file, we explicitly copy its top-level
// `const X = ...` binding onto globalThis. Everything the app does afterward is a
// bare identifier lookup, which falls through to real globalThis properties anyway
// (that's the same fallback classic <script> tags rely on), so this restores the
// intended sharing without needing every access to be written as globalThis.X.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');

const globalEval = eval;

// FILE_EXPORTS maps each loadable file to the top-level identifier(s) it declares,
// so we know what to promote to globalThis after eval-ing it.
const FILE_EXPORTS = {
  'js/utils.js': ['Utils'],
  'js/zipWriter.js': ['ZipWriter'],
  'js/docxWriter.js': ['DocxWriter'],
  'js/manuscriptExport.js': ['ManuscriptExport'],
};

export function loadDomScripts(relPaths) {
  for (const relPath of relPaths) {
    const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    const names = FILE_EXPORTS[relPath] || [];
    const expose = names.map((n) => `globalThis.${n} = ${n};`).join('\n');
    globalEval(`${code}\n${expose}`);
  }
}
