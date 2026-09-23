const SCULPTED_PIECES_VERSION = '47.0.0';
const SCULPTED_PIECES_STYLE_ID = 'kmateSculptedPiecesV47Styles';
const SCULPTED_PIECES_SELECTOR = '.piece[data-piece-type], .sq > .piece';
const SCULPTED_PIECE_GLYPHS = Object.freeze({
  '♙': 'p', '♟': 'p',
  '♖': 'r', '♜': 'r',
  '♘': 'n', '♞': 'n',
  '♗': 'b', '♝': 'b',
  '♕': 'q', '♛': 'q',
  '♔': 'k', '♚': 'k',
});
const SCULPTED_PIECE_NAMES = Object.freeze({
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
});

const SCULPTED_PIECES = Object.freeze({
  p: `
    <ellipse class="ground" cx="50" cy="94" rx="34" ry="3.5"/>
    <circle class="body" cx="50" cy="18" r="10.5"/>
    <path class="band" d="M38 32L50 26L62 32L58 39H42Z"/>
    <path class="body" d="M40 39Q50 34 60 39C66 47 67 57 62 64C59 69 56 72 59 76H41C44 72 41 69 38 64C33 57 34 47 40 39Z"/>
    <path class="band" d="M32 73H68L74 81H26Z"/>
    <path class="base" d="M22 80H78L85 89H15Z"/>
    <path class="base" d="M14 88H86L89 94H11Z"/>
    <path class="highlight" d="M44 42Q39 52 44 63M38 77H62M27 84H69"/>
    <path class="grain" d="M48 8Q53 15 49 25M54 42Q59 51 55 64M34 87Q48 82 66 86"/>
  `,
  r: `
    <ellipse class="ground" cx="50" cy="94" rx="35" ry="3.5"/>
    <path class="body" d="M17 13H28V25H37V13H46V25H55V13H64V25H73V13H84V34H16Z"/>
    <path class="band" d="M18 34H82L76 43H24Z"/>
    <path class="body" d="M30 43H70L65 69H35Z"/>
    <path class="band" d="M29 67H71L76 77H24Z"/>
    <path class="base" d="M20 76H80L86 88H14Z"/>
    <path class="base" d="M12 87H88L91 94H9Z"/>
    <path class="highlight" d="M26 19V30M43 19V30M60 19V30M74 19V30M38 48L35 64M29 81H71"/>
    <path class="grain" d="M58 45Q54 56 57 67M22 36Q49 40 77 36M31 89Q48 84 70 88"/>
  `,
  b: `
    <ellipse class="ground" cx="50" cy="94" rx="34" ry="3.5"/>
    <path class="cap" d="M42 10H58L61 14H39Z"/>
    <path class="body" d="M50 13C63 22 68 31 63 41C60 47 55 50 54 55C54 58 57 61 61 64H39C43 61 46 58 46 55C45 50 40 47 37 41C32 31 37 22 50 13Z"/>
    <path class="cut" d="M57 22L42 42"/>
    <path class="band" d="M34 62H66L72 72H28Z"/>
    <path class="body" d="M34 71H66L72 80H28Z"/>
    <path class="base" d="M21 79H79L85 89H15Z"/>
    <path class="base" d="M13 88H87L90 94H10Z"/>
    <path class="highlight" d="M43 18Q37 29 41 38M44 66H61M31 82H69"/>
    <path class="grain" d="M53 15Q57 26 53 40M38 73Q51 77 63 72M30 89Q47 84 70 88"/>
  `,
  n: `
    <ellipse class="ground" cx="50" cy="94" rx="37" ry="3.5"/>
    <path class="mane" d="M28 72C25 57 28 39 37 25C47 11 66 7 82 17L77 31C67 25 60 25 54 30C49 34 47 39 44 45C38 55 34 64 36 72Z"/>
    <path class="body" d="M29 78C33 65 39 55 47 48C41 43 39 36 40 27C50 27 60 20 66 14C77 22 84 34 81 45C78 55 69 60 63 66H74L82 79H69L76 84H25Z"/>
    <path class="shadow" d="M42 29C53 29 63 34 69 42C60 39 53 41 47 49C43 43 40 36 42 29Z"/>
    <path class="snout" d="M63 45C72 44 80 47 84 53L79 61L70 59L65 64L57 57Z"/>
    <circle class="eye" cx="65" cy="35" r="2.6"/>
    <circle class="nostril" cx="77" cy="54" r="1.8"/>
    <path class="band" d="M30 72H70L76 81H24Z"/>
    <path class="base" d="M18 80H82L88 91H12Z"/>
    <path class="base" d="M11 90H89L91 95H9Z"/>
    <path class="highlight" d="M50 26Q60 27 68 34M46 49Q57 51 65 46M32 83H70"/>
    <path class="grain" d="M34 31L44 24M31 40L42 34M29 50L40 44M29 60L37 55M56 18Q68 26 74 39M40 87Q54 82 72 87"/>
  `,
  q: `
    <ellipse class="ground" cx="50" cy="94" rx="36" ry="3.5"/>
    <circle class="jewel" cx="25" cy="16" r="4.2"/>
    <circle class="jewel" cx="38" cy="11" r="4.2"/>
    <circle class="jewel" cx="50" cy="9" r="4.4"/>
    <circle class="jewel" cx="62" cy="11" r="4.2"/>
    <circle class="jewel" cx="75" cy="16" r="4.2"/>
    <path class="crown" d="M23 21L31 38H69L77 21L64 32L59 17L50 33L41 17L36 32Z"/>
    <path class="band" d="M31 36H69L65 45H35Z"/>
    <path class="body" d="M37 44H63C59 53 58 60 62 68L68 76H32L38 68C42 60 41 53 37 44Z"/>
    <path class="band" d="M29 74H71L77 83H23Z"/>
    <path class="base" d="M18 82H82L88 92H12Z"/>
    <path class="base" d="M10 91H90L92 95H8Z"/>
    <path class="highlight" d="M33 24L38 34M48 18V31M64 24L61 34M43 48Q38 59 43 68M34 78H66"/>
    <path class="grain" d="M53 44Q57 55 53 68M27 87Q49 82 75 87"/>
  `,
  k: `
    <ellipse class="ground" cx="50" cy="94" rx="36" ry="3.5"/>
    <path class="cross" d="M46 4H54V13H63V21H54V31H46V21H37V13H46Z"/>
    <path class="body" d="M50 29C39 29 32 35 33 44C34 51 40 56 45 59H38L34 68H66L62 59H55C60 56 66 51 67 44C68 35 61 29 50 29Z"/>
    <path class="band" d="M32 66H68L74 76H26Z"/>
    <path class="body" d="M31 75H69L75 83H25Z"/>
    <path class="base" d="M18 82H82L88 92H12Z"/>
    <path class="base" d="M10 91H90L92 95H8Z"/>
    <path class="highlight" d="M41 37Q36 45 43 54M42 70H62M31 86H69"/>
    <path class="grain" d="M54 32Q60 42 54 57M38 77Q50 81 64 77M27 88Q47 83 73 88"/>
  `,
});

let sculptedPieceSerial = 0;
let sculptedPieceObserver = null;
let sculptedPiecesApplied = 0;
let sculptedPieceRefreshes = 0;

function sculptedPiecesEnsureStyles() {
  if (document.querySelector(`#${SCULPTED_PIECES_STYLE_ID}`)) return;
  const style = document.createElement('style');
  style.id = SCULPTED_PIECES_STYLE_ID;
  style.textContent = `
    .piece.kmate-sculpted-piece-v47 {
      font-size: 0 !important;
      isolation: isolate;
    }
    .piece.kmate-sculpted-piece-v47 > svg {
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
      pointer-events: none;
      shape-rendering: geometricPrecision;
    }
    .piece.kmate-sculpted-piece-v47 .sculpted-art {
      stroke: var(--kmate-sculpted-edge);
      stroke-width: 2.1;
      stroke-linejoin: round;
      stroke-linecap: round;
      paint-order: stroke fill;
    }
    .piece.kmate-sculpted-piece-v47 .sculpted-stop-body-hi { stop-color: var(--kmate-sculpted-body-hi); }
    .piece.kmate-sculpted-piece-v47 .sculpted-stop-body-mid { stop-color: var(--kmate-sculpted-body-mid); }
    .piece.kmate-sculpted-piece-v47 .sculpted-stop-body-low { stop-color: var(--kmate-sculpted-body-low); }
    .piece.kmate-sculpted-piece-v47 .sculpted-stop-base-hi { stop-color: var(--kmate-sculpted-base-hi); }
    .piece.kmate-sculpted-piece-v47 .sculpted-stop-base-low { stop-color: var(--kmate-sculpted-base-low); }
    .piece.kmate-sculpted-piece-v47 .sculpted-stop-band-hi { stop-color: var(--kmate-sculpted-band-hi); }
    .piece.kmate-sculpted-piece-v47 .sculpted-stop-band-low { stop-color: var(--kmate-sculpted-band-low); }
    .piece.kmate-sculpted-piece-v47 .sculpted-stop-shadow-hi { stop-color: var(--kmate-sculpted-shadow-hi); }
    .piece.kmate-sculpted-piece-v47 .sculpted-stop-shadow-low { stop-color: var(--kmate-sculpted-shadow-low); }
    .piece.kmate-sculpted-piece-v47 .sculpted-stop-crown-hi { stop-color: var(--kmate-sculpted-crown-hi); }
    .piece.kmate-sculpted-piece-v47 .sculpted-stop-crown-low { stop-color: var(--kmate-sculpted-crown-low); }
    .piece.kmate-sculpted-piece-v47 .ground {
      fill: var(--kmate-sculpted-ground);
      opacity: .22;
      stroke: none;
    }
    .piece.kmate-sculpted-piece-v47 .highlight {
      fill: none;
      stroke: var(--kmate-sculpted-highlight);
      stroke-width: 2.2;
      opacity: .56;
    }
    .piece.kmate-sculpted-piece-v47 .grain {
      fill: none;
      stroke: var(--kmate-sculpted-grain);
      stroke-width: 1.5;
      opacity: .42;
    }
    .piece.kmate-sculpted-piece-v47 .cut {
      fill: none;
      stroke: var(--kmate-sculpted-edge);
      stroke-width: 4.5;
    }
    .piece.kmate-sculpted-piece-v47 .eye,
    .piece.kmate-sculpted-piece-v47 .nostril {
      fill: var(--kmate-sculpted-edge);
      stroke: none;
    }
    .piece.kmate-sculpted-piece-v47.white {
      --kmate-sculpted-body-hi: #fff6e6;
      --kmate-sculpted-body-mid: #e7c69d;
      --kmate-sculpted-body-low: #b57942;
      --kmate-sculpted-base-hi: #f1d4ad;
      --kmate-sculpted-base-low: #8f582c;
      --kmate-sculpted-band-hi: #dca56d;
      --kmate-sculpted-band-low: #71411f;
      --kmate-sculpted-shadow-hi: #9c6637;
      --kmate-sculpted-shadow-low: #4d2916;
      --kmate-sculpted-crown-hi: #f4d6a8;
      --kmate-sculpted-crown-low: #9a5f2e;
      --kmate-sculpted-edge: #5b341b;
      --kmate-sculpted-grain: #75451f;
      --kmate-sculpted-highlight: #fff5d9;
      --kmate-sculpted-ground: #2f1b10;
    }
    .piece.kmate-sculpted-piece-v47.black {
      --kmate-sculpted-body-hi: #737780;
      --kmate-sculpted-body-mid: #292b30;
      --kmate-sculpted-body-low: #050506;
      --kmate-sculpted-base-hi: #44474e;
      --kmate-sculpted-base-low: #020203;
      --kmate-sculpted-band-hi: #575b63;
      --kmate-sculpted-band-low: #0b0c0e;
      --kmate-sculpted-shadow-hi: #202226;
      --kmate-sculpted-shadow-low: #000000;
      --kmate-sculpted-crown-hi: #878b93;
      --kmate-sculpted-crown-low: #15171a;
      --kmate-sculpted-edge: #030405;
      --kmate-sculpted-grain: #a7abb2;
      --kmate-sculpted-highlight: #e7e9ed;
      --kmate-sculpted-ground: #000000;
    }
    @media (prefers-reduced-motion: reduce) {
      .piece.kmate-sculpted-piece-v47,
      .piece.kmate-sculpted-piece-v47 > svg {
        transition: none !important;
        animation: none !important;
      }
    }
  `;
  document.head.append(style);
}

function sculptedPieceType(element) {
  const datasetType = String(element?.dataset?.pieceType || '').toLowerCase();
  if (SCULPTED_PIECES[datasetType]) return datasetType;
  const glyph = String(element?.textContent || '').trim();
  return SCULPTED_PIECE_GLYPHS[glyph] || '';
}

function sculptedPieceColor(element) {
  if (element?.classList?.contains('white')) return 'white';
  if (element?.classList?.contains('black')) return 'black';
  const datasetColor = String(element?.dataset?.pieceColor || '').toLowerCase();
  if (datasetColor === 'w' || datasetColor === 'white') return 'white';
  if (datasetColor === 'b' || datasetColor === 'black') return 'black';
  return '';
}

function sculptedPiecePaint(markup, uid) {
  return markup
    .replaceAll('class="body"', `class="body" fill="url(#${uid}-body)"`)
    .replaceAll('class="base"', `class="base" fill="url(#${uid}-base)"`)
    .replaceAll('class="band"', `class="band" fill="url(#${uid}-band)"`)
    .replaceAll('class="shadow"', `class="shadow" fill="url(#${uid}-shadow)"`)
    .replaceAll('class="mane"', `class="mane" fill="url(#${uid}-shadow)"`)
    .replaceAll('class="snout"', `class="snout" fill="url(#${uid}-body)"`)
    .replaceAll('class="cap"', `class="cap" fill="url(#${uid}-band)"`)
    .replaceAll('class="crown"', `class="crown" fill="url(#${uid}-crown)"`)
    .replaceAll('class="cross"', `class="cross" fill="url(#${uid}-crown)"`)
    .replaceAll('class="jewel"', `class="jewel" fill="url(#${uid}-crown)"`);
}

function sculptedPieceSvg(type, color) {
  const uid = `kmate-sculpted-${++sculptedPieceSerial}`;
  const name = SCULPTED_PIECE_NAMES[type] || 'piece';
  const painted = sculptedPiecePaint(SCULPTED_PIECES[type], uid);
  return `<svg viewBox="0 0 100 100" focusable="false" aria-hidden="true" data-kmate-sculpted-piece="${type}" data-kmate-sculpted-color="${color}">
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
      <linearGradient id="${uid}-shadow" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" class="sculpted-stop-shadow-hi"/><stop offset="1" class="sculpted-stop-shadow-low"/>
      </linearGradient>
      <linearGradient id="${uid}-crown" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" class="sculpted-stop-crown-hi"/><stop offset="1" class="sculpted-stop-crown-low"/>
      </linearGradient>
    </defs>
    <title>${color} ${name}</title>
    <g class="sculpted-art">${painted}</g>
  </svg>`;
}

function sculptedPiecesApply(element) {
  if (!(element instanceof HTMLElement) || !element.classList.contains('piece')) return false;
  const type = sculptedPieceType(element);
  const color = sculptedPieceColor(element);
  if (!type || !color) return false;
  const current = element.querySelector(':scope > svg[data-kmate-sculpted-piece]');
  if (
    element.dataset.kmatePieceStyle === SCULPTED_PIECES_VERSION
    && current?.dataset.kmateSculptedPiece === type
    && current?.dataset.kmateSculptedColor === color
  ) return false;

  element.dataset.kmatePieceStyle = SCULPTED_PIECES_VERSION;
  element.dataset.pieceType = type;
  element.dataset.pieceColor = color === 'white' ? 'w' : 'b';
  element.classList.add('vector-piece', 'staunton-piece', 'kmate-sculpted-piece-v47');
  element.innerHTML = sculptedPieceSvg(type, color);
  sculptedPiecesApplied += 1;
  return true;
}

function sculptedPiecesRefresh(root = document) {
  sculptedPieceRefreshes += 1;
  const pieces = new Set();
  if (root instanceof Element && root.matches(SCULPTED_PIECES_SELECTOR)) pieces.add(root);
  root.querySelectorAll?.(SCULPTED_PIECES_SELECTOR).forEach((piece) => pieces.add(piece));
  let changed = 0;
  pieces.forEach((piece) => {
    if (sculptedPiecesApply(piece)) changed += 1;
  });
  return changed;
}

function sculptedPiecesStartObserver() {
  if (sculptedPieceObserver || !document.body) return;
  sculptedPieceObserver = new MutationObserver((mutations) => {
    const roots = new Set();
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (target?.classList?.contains('piece')) roots.add(target);
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) roots.add(node);
      }
    }
    roots.forEach((root) => sculptedPiecesRefresh(root));
  });
  sculptedPieceObserver.observe(document.body, { childList: true, subtree: true });
}

function sculptedPiecesState() {
  const pieces = [...document.querySelectorAll('.piece.kmate-sculpted-piece-v47')];
  const byType = Object.fromEntries(Object.keys(SCULPTED_PIECES).map((type) => [
    type,
    pieces.filter((piece) => piece.dataset.pieceType === type).length,
  ]));
  return {
    ready: true,
    version: SCULPTED_PIECES_VERSION,
    style: 'original-sculpted-wood-inspired',
    sourceImageCopied: false,
    applied: sculptedPiecesApplied,
    refreshes: sculptedPieceRefreshes,
    visiblePieces: pieces.filter((piece) => piece.getClientRects().length > 0).length,
    totalPieces: pieces.length,
    byType,
    palette: {
      white: 'warm carved ivory',
      black: 'polished ebony',
    },
  };
}

function sculptedPiecesInitialize() {
  document.documentElement.classList.add('kmate-sculpted-pieces-v47');
  sculptedPiecesEnsureStyles();
  sculptedPiecesRefresh();
  sculptedPiecesStartObserver();
  window.setTimeout(() => sculptedPiecesRefresh(), 0);
  window.setTimeout(() => sculptedPiecesRefresh(), 300);
  window.setTimeout(() => sculptedPiecesRefresh(), 1400);
  window.__KMATE_SCULPTED_PIECES_V47__ = {
    version: SCULPTED_PIECES_VERSION,
    refresh: sculptedPiecesRefresh,
    state: sculptedPiecesState,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', sculptedPiecesInitialize, { once: true });
} else {
  sculptedPiecesInitialize();
}
