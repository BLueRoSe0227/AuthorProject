// The app is a set of classic (non-module) <script> files that share one global
// lexical scope in the browser (see IMPROVEMENTS.md DEV-03). To test the real
// source files unmodified, we replay that same loading model inside a Node `vm`
// context: each file is run in order against one persistent sandbox, and the
// top-level `const Models = {...}` / `const DB = {...}` bindings it creates are
// read back out of that same context afterwards.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');

const APP_FILES = ['js/utils.js', 'js/db.js', 'js/models.js'];

// Each call gets a fresh in-memory IndexedDB and a fresh global scope, so tests
// don't leak state into one another.
export function createAppContext() {
  const localStorageStore = {};
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(localStorageStore, k) ? localStorageStore[k] : null),
      setItem: (k, v) => { localStorageStore[k] = String(v); },
      removeItem: (k) => { delete localStorageStore[k]; },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.indexedDB = new IDBFactory();
  sandbox.crypto = globalThis.crypto;
  vm.createContext(sandbox);

  for (const relPath of APP_FILES) {
    const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    vm.runInContext(code, sandbox, { filename: relPath });
  }

  return {
    Models: vm.runInContext('Models', sandbox),
    DB: vm.runInContext('DB', sandbox),
    Utils: vm.runInContext('Utils', sandbox),
  };
}
