const CHESS_POSITION_VERSION = '38.0.0';

function $(selector, root = document) {
  return root.querySelector(selector);
}

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function installChessPositionStyles() {
  if ($('#kmateChessPositionV38Styles')) return;
  const style = document.createElement('style');
  style.id = 'kmateChessPositionV38Styles';
  style.textContent = `
    .km-chess-position-notice{
      display:flex;align-items:center;justify-content:space-between;gap:12px;
      margin:10px 0 0;padding:11px 12px;border:1px solid #b9f47455;border-radius:14px;
      background:linear-gradient(145deg,#b9f47414,#ffffff05);box-shadow:inset 0 1px #fff1;
    }
    .km-chess-position-notice[hidden]{display:none!important}
    .km-chess-position-notice>div{min-width:0}
    .km-chess-position-notice small,.km-chess-position-notice b,.km-chess-position-notice span{display:block}
    .km-chess-position-notice small{color:var(--accent);font-size:9px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}
    .km-chess-position-notice b{margin-top:2px;overflow:hidden;color:#f3f8ef;font-size:12px;text-overflow:ellipsis;white-space:nowrap}
    .km-chess-position-notice span{margin-top:2px;color:var(--muted);font-size:10px}
    .km-chess-position-notice button{
      flex:0 0 auto;min-height:38px;padding:0 12px;border:1px solid #b9f47477;border-radius:11px;
      background:#b9f4741b;color:var(--accent);font-size:11px;font-weight:900;cursor:pointer;
    }
    #kmChessBackToGames{display:none}
    .km-chess-preview.km-position-revealed{animation:kmPositionReveal .7s ease-out}
    @keyframes kmPositionReveal{
      0%{box-shadow:0 0 0 3px #b9f47400,0 18px 45px #0004}
      35%{box-shadow:0 0 0 3px #b9f47488,0 18px 45px #0004}
      100%{box-shadow:0 0 0 3px #b9f47400,0 18px 45px #0004}
    }
    @media(max-width:900px){
      .position-importer-modal-v1 .km-chess-workspace{display:flex;flex-direction:column}
      .position-importer-modal-v1 .km-chess-preview{order:0;scroll-margin-top:82px}
      .position-importer-modal-v1 .km-chess-game-list{order:1;max-height:290px;margin-top:2px}
      #kmChessBackToGames{display:inline-flex}
    }
    @media(max-width:660px){
      .km-chess-position-notice{align-items:stretch;flex-direction:column}
      .km-chess-position-notice button{width:100%}
      .position-importer-modal-v1 .km-chess-game-list{max-height:245px}
    }
  `;
  document.head.append(style);
}

function selectedPositionReady() {
  const preview = $('#kmChessPreview');
  const board = $('#kmChessBoard');
  return Boolean(preview && !preview.hidden && board?.children?.length === 64);
}

function scrollWithinImporter(target, { behavior = 'smooth', offset = 14 } = {}) {
  if (!target) return false;
  const shell = $('#positionImportDialog .position-importer-shell');
  if (!shell) {
    target.scrollIntoView?.({ behavior, block: 'start' });
    return true;
  }
  const shellRect = shell.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextTop = Math.max(0, shell.scrollTop + targetRect.top - shellRect.top - offset);
  if (typeof shell.scrollTo === 'function') shell.scrollTo({ top: nextTop, behavior });
  else shell.scrollTop = nextTop;
  return true;
}

function revealSelectedPosition({ force = false, behavior = 'smooth' } = {}) {
  const preview = $('#kmChessPreview');
  if (!preview || !selectedPositionReady()) return false;
  const shell = $('#positionImportDialog .position-importer-shell');
  const previewRect = preview.getBoundingClientRect();
  const shellRect = shell?.getBoundingClientRect();
  const narrow = window.matchMedia?.('(max-width: 900px)')?.matches;
  const hiddenBelow = shellRect ? previewRect.top > shellRect.bottom - 110 : previewRect.top > window.innerHeight - 110;
  const hiddenAbove = shellRect ? previewRect.bottom < shellRect.top + 72 : previewRect.bottom < 72;
  if (force || narrow || hiddenBelow || hiddenAbove) {
    const offset = window.matchMedia?.('(max-width: 660px)')?.matches ? 78 : 12;
    scrollWithinImporter(preview, { behavior, offset });
  }
  preview.classList.remove('km-position-revealed');
  window.requestAnimationFrame(() => preview.classList.add('km-position-revealed'));
  window.setTimeout(() => preview.classList.remove('km-position-revealed'), 850);
  return true;
}

function ensurePositionNotice(panel) {
  let notice = $('#kmChessPositionNotice', panel);
  if (notice) return notice;
  notice = document.createElement('div');
  notice.id = 'kmChessPositionNotice';
  notice.className = 'km-chess-position-notice';
  notice.hidden = true;
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.innerHTML = `
    <div>
      <small>Selected position ready</small>
      <b id="kmChessPositionNoticeTitle">Choose a game</b>
      <span id="kmChessPositionNoticeMeta">The board and move selector will appear here.</span>
    </div>
    <button id="kmChessViewPosition" type="button">View board</button>`;
  const status = $('#kmChessStatus', panel);
  status?.insertAdjacentElement('afterend', notice);
  $('#kmChessViewPosition', notice)?.addEventListener('click', () => revealSelectedPosition({ force: true }));
  return notice;
}

function ensureBackToGamesButton(panel) {
  if ($('#kmChessBackToGames', panel)) return;
  const actions = $('#kmChessPreview .km-inline-actions', panel);
  if (!actions) return;
  const button = document.createElement('button');
  button.id = 'kmChessBackToGames';
  button.type = 'button';
  button.className = 'km-mini-button';
  button.textContent = 'Choose another game';
  button.addEventListener('click', () => scrollWithinImporter($('#kmChessGameList', panel), { offset: 78 }));
  actions.prepend(button);
}

function syncGameSelectionAttributes(panel) {
  for (const game of panel.querySelectorAll('.km-chess-game')) {
    const selected = game.classList.contains('active');
    const value = selected ? 'true' : 'false';
    if (game.getAttribute('aria-selected') !== value) game.setAttribute('aria-selected', value);
    if (selected) game.setAttribute('aria-current', 'true');
    else game.removeAttribute('aria-current');
  }
}

function syncSelectedPositionUi(panel) {
  const notice = ensurePositionNotice(panel);
  ensureBackToGamesButton(panel);
  syncGameSelectionAttributes(panel);

  const ready = selectedPositionReady();
  notice.hidden = !ready;
  panel.classList.toggle('km-chess-position-ready', ready);
  if (!ready) return false;

  const title = $('#kmChessSelectedTitle', panel)?.textContent?.trim() || 'Selected Chess.com game';
  const move = $('#kmChessMoveLabel', panel)?.textContent?.trim() || 'Selected position';
  const counter = $('#kmChessMoveCounter', panel)?.textContent?.trim() || '';
  setText($('#kmChessPositionNoticeTitle', notice), title);
  setText($('#kmChessPositionNoticeMeta', notice), `${move}${counter ? ` · ${counter}` : ''}`);
  return true;
}

function initializeChessPositionFix(attempt = 0) {
  const panel = $('#kmImportChessPanel');
  if (!window.__KMATE_POSITION_IMPORTERS__ || !panel) {
    if (attempt < 100) window.setTimeout(() => initializeChessPositionFix(attempt + 1), 100);
    else console.warn('K-Mate v38 could not find the Chess.com importer.');
    return;
  }
  if (panel.dataset.chessPositionFix === CHESS_POSITION_VERSION) return;
  panel.dataset.chessPositionFix = CHESS_POSITION_VERSION;
  installChessPositionStyles();
  ensurePositionNotice(panel);
  ensureBackToGamesButton(panel);

  let syncScheduled = false;
  let pendingReveal = false;
  let loadGeneration = 0;
  let autoRevealedGeneration = -1;

  const scheduleSync = ({ reveal = false } = {}) => {
    pendingReveal = pendingReveal || reveal;
    if (syncScheduled) return;
    syncScheduled = true;
    window.requestAnimationFrame(() => {
      syncScheduled = false;
      const ready = syncSelectedPositionUi(panel);
      const shouldReveal = pendingReveal;
      pendingReveal = false;
      if (ready && shouldReveal) revealSelectedPosition({ force: true });

      const status = $('#kmChessStatus', panel);
      if (ready && status?.dataset.state === 'success' && autoRevealedGeneration !== loadGeneration) {
        autoRevealedGeneration = loadGeneration;
        window.setTimeout(() => revealSelectedPosition({ behavior: 'smooth' }), 80);
      }
    });
  };

  $('#kmLoadChessGames', panel)?.addEventListener('click', () => {
    loadGeneration += 1;
    autoRevealedGeneration = -1;
    const notice = $('#kmChessPositionNotice', panel);
    if (notice) notice.hidden = true;
  }, { capture: true });

  $('#kmChessGameList', panel)?.addEventListener('click', (event) => {
    if (!event.target.closest('.km-chess-game')) return;
    window.setTimeout(() => scheduleSync({ reveal: true }), 0);
  }, { capture: true });

  const observer = new MutationObserver(() => scheduleSync());
  observer.observe(panel, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'class', 'data-state'],
  });

  window.addEventListener('resize', () => scheduleSync(), { passive: true });
  syncSelectedPositionUi(panel);

  window.__KMATE_CHESS_POSITION_FIX__ = {
    version: CHESS_POSITION_VERSION,
    reveal: () => revealSelectedPosition({ force: true }),
    state: () => ({
      ready: selectedPositionReady(),
      selectedTitle: $('#kmChessSelectedTitle', panel)?.textContent?.trim() || null,
      move: $('#kmChessMoveLabel', panel)?.textContent?.trim() || null,
      boardSquares: $('#kmChessBoard', panel)?.children?.length || 0,
      narrowLayout: Boolean(window.matchMedia?.('(max-width: 900px)')?.matches),
      noticeVisible: !$('#kmChessPositionNotice', panel)?.hidden,
    }),
  };
}

initializeChessPositionFix();
