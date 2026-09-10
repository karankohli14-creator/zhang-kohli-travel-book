const HARDENING_VERSION = '37.0.0';
const FENSHOT_MODULE_URL = 'https://esm.sh/@scoriiu/fenshot@0.1.4?deps=onnxruntime-web@1.26.0';
const FENSHOT_ASSET_URLS = Object.freeze([
  'https://cdn.jsdelivr.net/npm/@scoriiu/fenshot@0.1.4/model/chess-tiles-v2.onnx',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/ort-wasm-simd-threaded.mjs',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/ort-wasm-simd-threaded.wasm',
]);

let imageWarmupStarted = false;

function $(selector, root = document) {
  return root.querySelector(selector);
}

function afterCurrentEvent(callback) {
  if (typeof queueMicrotask === 'function') queueMicrotask(callback);
  else Promise.resolve().then(callback);
}

function dispatch(element, type) {
  if (!element) return;
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

function applyImageMetadataPreset({ turn = 'w', castling = [], enPassant = '' } = {}) {
  const turnControl = $('#kmImageTurn');
  if (turnControl) {
    turnControl.value = turn === 'b' ? 'b' : 'w';
    dispatch(turnControl, 'change');
  }

  const castlingByControl = {
    kmCastleWK: 'K',
    kmCastleWQ: 'Q',
    kmCastleBK: 'k',
    kmCastleBQ: 'q',
  };
  const rights = new Set(castling);
  for (const [id, right] of Object.entries(castlingByControl)) {
    const control = $(`#${id}`);
    if (!control) continue;
    control.checked = rights.has(right);
    dispatch(control, 'change');
  }

  const enPassantControl = $('#kmImageEnPassant');
  if (enPassantControl) {
    enPassantControl.value = enPassant;
    dispatch(enPassantControl, 'input');
  }
}

function bindImagePresetMetadata() {
  const startingBoard = $('#kmImageStartPreset');
  const clearBoard = $('#kmImageClear');
  if (startingBoard && !startingBoard.dataset.metadataPresetBound) {
    startingBoard.dataset.metadataPresetBound = HARDENING_VERSION;
    startingBoard.title = 'Restore the standard starting board, White to move, and all castling rights';
    startingBoard.addEventListener('click', () => {
      // The original importer restores the pieces. Apply the matching game-state
      // fields after its click handler so the generated FEN is complete.
      afterCurrentEvent(() => applyImageMetadataPreset({ turn: 'w', castling: ['K', 'Q', 'k', 'q'] }));
    });
  }
  if (clearBoard && !clearBoard.dataset.metadataPresetBound) {
    clearBoard.dataset.metadataPresetBound = HARDENING_VERSION;
    clearBoard.title = 'Clear every square and reset side-to-move metadata';
    clearBoard.addEventListener('click', () => {
      afterCurrentEvent(() => applyImageMetadataPreset({ turn: 'w', castling: [] }));
    });
  }
}

function syncTabAccessibility(tabs) {
  tabs.forEach((tab) => {
    const active = tab.getAttribute('aria-selected') === 'true';
    tab.tabIndex = active ? 0 : -1;
  });
}

function bindTabAccessibility() {
  const dialog = $('#positionImportDialog');
  if (!dialog) return;
  const tabs = [...dialog.querySelectorAll('[data-import-tab]')];
  if (!tabs.length) return;
  const panelIds = {
    manual: 'kmImportManualPanel',
    image: 'kmImportImagePanel',
    chess: 'kmImportChessPanel',
  };

  tabs.forEach((tab, index) => {
    const name = tab.dataset.importTab;
    if (panelIds[name]) tab.setAttribute('aria-controls', panelIds[name]);
    if (tab.dataset.keyboardTabsBound) return;
    tab.dataset.keyboardTabsBound = HARDENING_VERSION;
    tab.addEventListener('click', () => afterCurrentEvent(() => syncTabAccessibility(tabs)));
    tab.addEventListener('keydown', (event) => {
      let nextIndex = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex == null) return;
      event.preventDefault();
      tabs[nextIndex].click();
      tabs[nextIndex].focus();
    });
  });
  syncTabAccessibility(tabs);
}

function addPreload(rel, href, as = '') {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  link.crossOrigin = 'anonymous';
  if (as) link.as = as;
  document.head.append(link);
}

function warmImageImporterAssets() {
  if (imageWarmupStarted || navigator.connection?.saveData) return;
  imageWarmupStarted = true;
  addPreload('modulepreload', FENSHOT_MODULE_URL);
  addPreload('preload', FENSHOT_ASSET_URLS[0], 'fetch');
  addPreload('preload', FENSHOT_ASSET_URLS[1], 'script');
  addPreload('preload', FENSHOT_ASSET_URLS[2], 'fetch');

  // Populate the browser HTTP/module caches without creating a second ONNX
  // inference session. The importer itself remains responsible for recognition.
  const tasks = [
    import(FENSHOT_MODULE_URL),
    ...FENSHOT_ASSET_URLS.map((url) => fetch(url, { cache: 'force-cache', mode: 'cors' })),
  ];
  void Promise.allSettled(tasks);
}

function bindImageWarmup() {
  const pictureTab = $('[data-import-tab="image"]');
  const chooseImage = $('#kmChooseImage');
  const dropzone = $('#kmImageDropzone');
  for (const element of [pictureTab, chooseImage, dropzone]) {
    if (!element || element.dataset.imageWarmupBound) continue;
    element.dataset.imageWarmupBound = HARDENING_VERSION;
    element.addEventListener('pointerenter', warmImageImporterAssets, { once: true, passive: true });
    element.addEventListener('focusin', warmImageImporterAssets, { once: true });
    element.addEventListener('click', warmImageImporterAssets, { once: true });
  }
}

function installDiagnostics() {
  window.__KMATE_IMPORTER_QA__ = {
    version: HARDENING_VERSION,
    warmImageAssets: warmImageImporterAssets,
    applyImageMetadataPreset,
    run() {
      const dialog = $('#positionImportDialog');
      const tabs = dialog ? [...dialog.querySelectorAll('[data-import-tab]')] : [];
      const checks = {
        importerApi: Boolean(window.__KMATE_POSITION_IMPORTERS__),
        dialog: Boolean(dialog),
        threeTabs: tabs.length === 3,
        manualPanel: Boolean($('#kmImportManualPanel')),
        imagePanel: Boolean($('#kmImportImagePanel')),
        chessPanel: Boolean($('#kmImportChessPanel')),
        imageEditor: Boolean($('#kmImageBoard') && $('#kmPiecePalette')),
        chessLoader: Boolean($('#kmChessUsername') && $('#kmLoadChessGames')),
        presetMetadataFix: $('#kmImageStartPreset')?.dataset.metadataPresetBound === HARDENING_VERSION,
      };
      return {
        version: HARDENING_VERSION,
        passed: Object.values(checks).every(Boolean),
        checks,
      };
    },
  };
}

function initializeHardening(attempt = 0) {
  if (!window.__KMATE_POSITION_IMPORTERS__ || !$('#kmImportImagePanel') || !$('#kmImportChessPanel')) {
    if (attempt < 60) window.setTimeout(() => initializeHardening(attempt + 1), 100);
    return;
  }
  bindImagePresetMetadata();
  bindTabAccessibility();
  bindImageWarmup();
  installDiagnostics();
}

initializeHardening();
