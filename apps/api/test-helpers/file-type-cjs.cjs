// CJS wrapper for the ESM-only `file-type` package, used in Jest tests.
// Jest runs in CJS mode; this wrapper dynamically imports the ESM module
// and re-exports the functions synchronously via a module-level promise cache.

let _module = null;

async function load() {
  if (!_module) {
    _module = await import('file-type');
  }
  return _module;
}

async function fileTypeFromBuffer(buf) {
  const m = await load();
  return m.fileTypeFromBuffer(buf);
}

module.exports = { fileTypeFromBuffer };
