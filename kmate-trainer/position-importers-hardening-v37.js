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

function installHardeningStyles() {
  if ($('#kmateImporterHardeningStyles')) return;
  const style = document.createElement('style');
  style.id = 'kmateImporterHardeningStyles';
  style.textContent = `
    .wizard-welcome-footer.kmate-import-footer{grid-template-columns:.85fr .85fr 1.35fr}
    .wizard-position-import-card{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:4px 0 12px;padding:14px 15px;border:1px solid #d8ef7c44;border-radius:17px;background:linear-gradient(145deg,#b9f47412,#171e16);box-shadow:inset 0 1px #fff1}
    .wizard-position-import-card>div{min-width:0;text-align:left}
    .wizard-position-import-card small,.wizard-position-import-card b{display:block}
    .wizard-position-import-card small{color:var(--accent);font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
    .wizard-position-import-card b{margin-top:3px;color:#fff5df;font-size:15px}
    .wizard-position-import-card p{margin:3px 0 0;color:var(--muted);font-size:10px}
    .wizard-position-import-card button{flex:0 0 auto;min-height:43px;padding:0 14px;border:1px solid #d2a75b60;border-radius:13px;background:linear-gradient(180deg,#3b352a,#1a2019);color:#fff5df;font-weight:900;cursor:pointer;box-shadow:inset 0 1px #fff2,0 7px 15px #0004}
    .wizard-position-import-card button:active{transform:translateY(2px)}
    @media(max-width:760px){
      .wizard-welcome-footer.kmate-import-footer{grid-template-columns:.82fr .82fr 1.25fr}
      .wizard-welcome-footer.kmate-import-footer .wizard-button{padding-inline:7px;gap:5px;font-size:12px}
      .wizard-position-import-card{padding:10px 11px;margin-bottom:8px}
      .wizard-position-import-card p{display:none}
      .wizard-position-import-card button{min-height:39px;padding-inline:10px;font-size:11px}
    }
    @media(max-width:430px){
      .wizard-welcome-footer.kmate-import-footer{grid-template-columns:.75fr .75fr 1.2fr}
      #wizardImportPositionButton span{display:none}
      .wizard-position-import-card b{font-size:12px}
    }
  `;
  document.head.append(style);
}

function openImporter(source = 'manual') {
  const importer = window.__KMATE_POSITION_IMPORTERS__;
  if (importer?.open) {
    importer.open(source);
    return true;
  }
  const legacyButton = $('#openPositionImport');
  legacyButton?.click();
  return Boolean(legacyButton);
}

function exposeImporterInWizard() {
  const wizard = $('#setupWizard');
  const welcomeFooter = $('.wizard-welcome-footer', wizard || document);
  const positionSlot = $('[data-wizard-slot="position"]', wizard || document);
  if (!wizard || !welcomeFooter || !positionSlot) return false;

  installHardeningStyles();
  welcomeFooter.classList.add('kmate-import-footer');
  if (!$('#wizardImportPositionButton')) {
    const button = document.createElement('button');
    button.id = 'wizardImportPositionButton';
    button.type = 'button';
    button.className = 'wizard-button wizard-secondary';
    button.setAttribute('aria-label', 'Import a FEN, picture, or completed Chess.com game');
    button.innerHTML = '<span aria-hidden="true">▧</span><b>Import</b>';
    button.addEventListener('click', () => openImporter('manual'));
    const primary = $('[data-wizard-next="position"]', welcomeFooter);
    welcomeFooter.insertBefore(button, primary || null);
  }

  if (!$('#wizardPositionImportCard')) {
    const card = document.createElement('div');
    card.id = 'wizardPositionImportCard';
    card.className = 'wizard-position-import-card';
    card.innerHTML = `
      <div>
        <small>Your position</small>
        <b>Practice from a picture or one of your games</b>
        <p>Paste FEN/PGN, scan a board, or choose a completed Chess.com position.</p>
      </div>
      <button id="wizardPositionImportButton" type="button">Open importer</button>`;
    $('#wizardPositionImportButton', card)?.addEventListener('click', () => openImporter('manual'));
    positionSlot.prepend(card);
  }
  return true;
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

function fixChessStatusGrammar() {
  const status = $('#kmChessStatus');
  if (!status || status.dataset.grammarFixBound) return;
  status.dataset.grammarFixBound = HARDENING_VERSION;
  const correct = () => {
    if (/^1 recent completed games loaded\./.test(status.textContent || '')) {
      status.textContent = status.textContent.replace('1 recent completed games loaded.', '1 recent completed game loaded.');
    }
  };
  new MutationObserver(correct).observe(status, { childList: true, characterData: true, subtree: true });
  correct();
}

function installDiagnostics() {
  window.__KMATE_IMPORTER_QA__ = {
    version: HARDENING_VERSION,
    warmImageAssets: warmImageImporterAssets,
    applyImageMetadataPreset,
    open: openImporter,
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
        welcomeEntry: Boolean($('#wizardImportPositionButton')),
        positionEntry: Boolean($('#wizardPositionImportButton')),
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
  const importerReady = Boolean(window.__KMATE_POSITION_IMPORTERS__ && $('#kmImportImagePanel') && $('#kmImportChessPanel'));
  const wizardReady = Boolean($('#setupWizard'));
  if (!importerReady || !wizardReady) {
    if (attempt < 80) window.setTimeout(() => initializeHardening(attempt + 1), 100);
    else console.warn('K-Mate importer hardening could not find the importer or setup wizard.');
    return;
  }
  exposeImporterInWizard();
  bindImagePresetMetadata();
  bindTabAccessibility();
  bindImageWarmup();
  fixChessStatusGrammar();
  installDiagnostics();
}

initializeHardening();
