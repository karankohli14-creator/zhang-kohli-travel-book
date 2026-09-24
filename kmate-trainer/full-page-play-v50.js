const KMATE_FULL_PAGE_V50 = '50.0.0';
const KMATE_FULL_PAGE_STYLE_ID_V50 = 'kmateFullPageV50Styles';

let km50HintOpen = false;
let km50HintOverlay = null;
let km50HintPanel = null;
let km50HintBulb = null;
let km50BodyObserver = null;
let km50PieceObserver = null;
let km50PointedPawnSerial = 0;
let km50PointedPawnsApplied = 0;
let km50StrategicRequests = 0;
let km50CandidateRequests = 0;

function km50InstallStyles() {
  if (document.querySelector(`#${KMATE_FULL_PAGE_STYLE_ID_V50}`)) return;
  const link = document.createElement('link');
  link.id = KMATE_FULL_PAGE_STYLE_ID_V50;
  link.rel = 'stylesheet';
  link.href = new URL(`./full-page-play-v50.css?v=${KMATE_FULL_PAGE_V50}`, import.meta.url).href;
  document.head.append(link);
}

function km50HidePositionHeading() {
  const title = document.querySelector('#positionTitle');
  const meta = document.querySelector('#gameMeta');
  const wrapper = title?.parentElement;
  if (wrapper && wrapper.classList.contains('left') === false) {
    wrapper.hidden = true;
    wrapper.setAttribute('aria-hidden', 'true');
  }
  if (title) {
    title.hidden = true;
    title.setAttribute('aria-hidden', 'true');
  }
  if (meta) {
    meta.hidden = true;
    meta.setAttribute('aria-hidden', 'true');
  }
}

function km50EnsureHintOverlay() {
  const card = document.querySelector('#hintCard');
  if (!card || !document.body) return null;

  if (!km50HintOverlay) {
    km50HintOverlay = document.createElement('div');
    km50HintOverlay.id = 'km50HintOverlay';
    km50HintOverlay.hidden = true;
    km50HintOverlay.setAttribute('role', 'dialog');
    km50HintOverlay.setAttribute('aria-modal', 'true');
    km50HintOverlay.setAttribute('aria-label', 'Coach hint');

    km50HintPanel = document.createElement('div');
    km50HintPanel.id = 'km50HintPanel';

    const close = document.createElement('button');
    close.id = 'km50HintClose';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close coach hint');
    close.textContent = '×';
    close.addEventListener('click', () => km50SetHintOpen(false));

    km50HintPanel.append(close);
    km50HintOverlay.append(km50HintPanel);
    document.body.append(km50HintOverlay);

    km50HintOverlay.addEventListener('click', (event) => {
      if (event.target === km50HintOverlay) km50SetHintOpen(false);
    });
  }

  if (card.parentElement !== km50HintPanel) km50HintPanel.append(card);
  card.removeAttribute('hidden');
  card.setAttribute('data-kmate-hint-overlay', KMATE_FULL_PAGE_V50);
  return km50HintOverlay;
}

function km50EnsureHintBulb() {
  if (!document.body) return null;
  if (!km50HintBulb) {
    km50HintBulb = document.createElement('button');
    km50HintBulb.id = 'km50HintBulb';
    km50HintBulb.type = 'button';
    km50HintBulb.title = 'Coach hint';
    km50HintBulb.innerHTML = '<span aria-hidden="true">💡</span>';
    km50HintBulb.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      km50SetHintOpen(!km50HintOpen, { revealStrategic: true });
    });
    document.body.append(km50HintBulb);
  }
  km50HintBulb.setAttribute('aria-expanded', String(km50HintOpen));
  km50HintBulb.setAttribute('aria-label', km50HintOpen ? 'Close coach hint' : 'Open coach hint');
  return km50HintBulb;
}

function km50HintLooksHidden() {
  const title = String(document.querySelector('#hintTitle')?.textContent || '').trim();
  const button = document.querySelector('#showHintButton');
  if (!button || button.disabled) return false;
  return /hidden for this move|show hint|automatic hint preparing/i.test(title)
    || /^show hint$/i.test(String(button.textContent || '').trim());
}

function km50RequestStrategicHint() {
  const button = document.querySelector('#showHintButton');
  if (!button || button.disabled || !km50HintLooksHidden()) return false;
  km50StrategicRequests += 1;
  button.click();
  return true;
}

function km50SetHintOpen(open, { revealStrategic = false } = {}) {
  km50EnsureHintOverlay();
  km50EnsureHintBulb();
  km50HintOpen = Boolean(open && document.body?.classList.contains('game-mode'));
  if (km50HintOverlay) km50HintOverlay.hidden = !km50HintOpen;
  document.body?.classList.toggle('km50-hint-open', km50HintOpen);
  document.body?.classList.remove('km48-hint-open', 'km49-hint-open');
  km50HintBulb?.setAttribute('aria-expanded', String(km50HintOpen));
  km50HintBulb?.setAttribute('aria-label', km50HintOpen ? 'Close coach hint' : 'Open coach hint');

  if (km50HintOpen) {
    window.requestAnimationFrame(() => {
      document.querySelector('#km50HintPanel')?.focus?.({ preventScroll: true });
      if (revealStrategic) window.setTimeout(km50RequestStrategicHint, 0);
    });
  }
}

function km50BindHintCandidateDiagnostics() {
  const button = document.querySelector('#showHintButton');
  if (!button || button.dataset.kmateV50Bound === '1') return;
  button.dataset.kmateV50Bound = '1';
  button.addEventListener('click', () => {
    const label = String(button.textContent || '').trim();
    if (/reveal candidate/i.test(label)) km50CandidateRequests += 1;
    // Never let a candidate request collapse the overlay. Core K-Mate owns the
    // actual Stockfish request and changes the title to “Candidate revealed”.
    if (document.body?.classList.contains('game-mode')) {
      km50HintOpen = true;
      if (km50HintOverlay) km50HintOverlay.hidden = false;
      document.body.classList.add('km50-hint-open');
    }
  });
}

function km50PointedPawnSvg(color) {
  const uid = `km50-pawn-${++km50PointedPawnSerial}`;
  return `<svg viewBox="0 0 100 100" focusable="false" aria-hidden="true" data-kmate-sculpted-piece="p" data-kmate-sculpted-color="${color}" data-kmate-pointed-pawn="${KMATE_FULL_PAGE_V50}">
    <defs>
      <linearGradient id="${uid}-body" x1="15%" y1="7%" x2="84%" y2="96%">
        <stop offset="0" class="sculpted-stop-body-hi"/><stop offset=".46" class="sculpted-stop-body-mid"/><stop offset="1" class="sculpted-stop-body-low"/>
      </linearGradient>
      <linearGradient id="${uid}-base" x1="18%" y1="0" x2="80%" y2="100%">
        <stop offset="0" class="sculpted-stop-base-hi"/><stop offset="1" class="sculpted-stop-base-low"/>
      </linearGradient>
      <linearGradient id="${uid}-band" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" class="sculpted-stop-band-hi"/><stop offset="1" class="sculpted-stop-band-low"/>
      </linearGradient>
      <linearGradient id="${uid}-crown" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" class="sculpted-stop-crown-hi"/><stop offset="1" class="sculpted-stop-crown-low"/>
      </linearGradient>
    </defs>
    <title>${color} pointed pawn</title>
    <g class="sculpted-art km50-pointed-pawn-art">
      <ellipse class="ground" cx="50" cy="94" rx="33" ry="3.5"/>
      <path class="crown" fill="url(#${uid}-crown)" d="M50 5L60 20L55 31H45L40 20Z"/>
      <path class="band" fill="url(#${uid}-band)" d="M38 30H62L66 39H34Z"/>
      <path class="body" fill="url(#${uid}-body)" d="M42 38H58L61 55Q62 64 56 73H44Q38 64 39 55Z"/>
      <path class="band" fill="url(#${uid}-band)" d="M32 71H68L75 81H25Z"/>
      <path class="base" fill="url(#${uid}-base)" d="M21 80H79L86 89H14Z"/>
      <path class="base" fill="url(#${uid}-base)" d="M13 88H87L90 94H10Z"/>
      <path class="highlight" d="M47 12L44 20M44 43Q40 54 44 66M37 76H63M27 84H70"/>
      <path class="grain" d="M53 12L56 20M54 42Q58 53 54 67M34 88Q49 83 67 87"/>
    </g>
  </svg>`;
}

function km50ApplyPointedPawn(piece) {
  if (!(piece instanceof HTMLElement)) return false;
  if (!piece.classList.contains('piece') || piece.dataset.pieceType !== 'p') return false;
  if (!piece.classList.contains('kmate-sculpted-piece-v47')) return false;
  const current = piece.querySelector(':scope > svg[data-kmate-pointed-pawn]');
  if (current?.dataset.kmatePointedPawn === KMATE_FULL_PAGE_V50) return false;
  const color = piece.classList.contains('white') ? 'white' : piece.classList.contains('black') ? 'black' : '';
  if (!color) return false;
  piece.dataset.kmatePawnStyle = KMATE_FULL_PAGE_V50;
  piece.innerHTML = km50PointedPawnSvg(color);
  km50PointedPawnsApplied += 1;
  return true;
}

function km50RefreshPointedPawns(root = document) {
  const candidates = new Set();
  if (root instanceof Element && root.matches?.('.piece[data-piece-type="p"]')) candidates.add(root);
  root.querySelectorAll?.('.piece[data-piece-type="p"]').forEach((piece) => candidates.add(piece));
  let changed = 0;
  candidates.forEach((piece) => { if (km50ApplyPointedPawn(piece)) changed += 1; });
  return changed;
}

function km50StartPieceObserver() {
  if (km50PieceObserver || !document.body) return;
  km50PieceObserver = new MutationObserver((mutations) => {
    const roots = new Set();
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (target?.classList?.contains('piece')) roots.add(target);
      for (const node of mutation.addedNodes) if (node instanceof Element) roots.add(node);
    }
    roots.forEach(km50RefreshPointedPawns);
  });
  km50PieceObserver.observe(document.body, { childList: true, subtree: true });
}

function km50SyncGameMode() {
  const gameMode = Boolean(document.body?.classList.contains('game-mode'));
  document.documentElement.classList.add('kmate-full-page-v50');
  document.body?.classList.toggle('km50-full-page-active', gameMode);
  km50HidePositionHeading();
  km50EnsureHintOverlay();
  km50EnsureHintBulb();
  km50BindHintCandidateDiagnostics();
  if (!gameMode) km50SetHintOpen(false);
  if (gameMode) {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      window.visualViewport?.dispatchEvent?.(new Event('resize'));
    });
  }
}

function km50ObserveBody() {
  if (km50BodyObserver || !document.body) return;
  km50BodyObserver = new MutationObserver(() => km50SyncGameMode());
  km50BodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function km50ExposeDiagnostics() {
  window.__KMATE_FULL_PAGE_V50__ = {
    version: KMATE_FULL_PAGE_V50,
    setHintOpen: km50SetHintOpen,
    refreshPawns: km50RefreshPointedPawns,
    state: () => {
      const board = document.querySelector('#board');
      const titleWrapper = document.querySelector('#positionTitle')?.parentElement;
      return {
        ready: true,
        version: KMATE_FULL_PAGE_V50,
        gameMode: Boolean(document.body?.classList.contains('game-mode')),
        titleRemoved: Boolean(titleWrapper?.hidden || getComputedStyle(titleWrapper).display === 'none'),
        hintOpen: km50HintOpen,
        hintOverlayMounted: Boolean(document.querySelector('#km50HintOverlay #hintCard')),
        bulbMounted: Boolean(document.querySelector('#km50HintBulb')),
        strategicRequests: km50StrategicRequests,
        candidateRequests: km50CandidateRequests,
        candidateRevealed: /candidate revealed/i.test(String(document.querySelector('#hintTitle')?.textContent || '')),
        pointedPawnsApplied: km50PointedPawnsApplied,
        visiblePointedPawns: document.querySelectorAll('#board svg[data-kmate-pointed-pawn="50.0.0"]').length,
        boardWidth: board?.getBoundingClientRect().width || 0,
        boardHeight: board?.getBoundingClientRect().height || 0,
      };
    },
  };
}

function km50Initialize() {
  document.documentElement.classList.add('kmate-full-page-v50');
  km50InstallStyles();
  km50EnsureHintOverlay();
  km50EnsureHintBulb();
  km50BindHintCandidateDiagnostics();
  km50HidePositionHeading();
  km50ObserveBody();
  km50RefreshPointedPawns();
  km50StartPieceObserver();
  km50ExposeDiagnostics();
  km50SyncGameMode();

  window.setTimeout(() => {
    km50EnsureHintOverlay();
    km50BindHintCandidateDiagnostics();
    km50HidePositionHeading();
    km50RefreshPointedPawns();
    km50ExposeDiagnostics();
    km50SyncGameMode();
  }, 500);
  window.setTimeout(() => {
    km50EnsureHintOverlay();
    km50RefreshPointedPawns();
    km50SyncGameMode();
  }, 1800);
}

km50InstallStyles();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', km50Initialize, { once: true });
} else {
  km50Initialize();
}
