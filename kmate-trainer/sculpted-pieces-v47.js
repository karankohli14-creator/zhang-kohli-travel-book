const SIMPLE_PIECES_VERSION = '51.0.0';
const SIMPLE_PIECES_STYLE_ID = 'kmateSimplePiecesV51Styles';
const SIMPLE_PIECES_SELECTOR = '.piece[data-piece-type], .sq > .piece';
const SIMPLE_PIECE_GLYPHS = Object.freeze({
  '♙': 'p', '♟': 'p',
  '♖': 'r', '♜': 'r',
  '♘': 'n', '♞': 'n',
  '♗': 'b', '♝': 'b',
  '♕': 'q', '♛': 'q',
  '♔': 'k', '♚': 'k',
});
const SIMPLE_PIECE_NAMES = Object.freeze({
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
});

const SIMPLE_PIECE_PATHS = Object.freeze({
  p: `M 46.08 22.94 L 41.47 26.15 L 39.17 31.19 L 39.63 36.70 L 42.86 41.74 L 38.25 44.50 L 36.87 46.33 L 38.25 50.00 L 43.78 50.00 L 43.78 53.21 L 41.01 59.17 L 38.25 61.93 L 33.18 65.14 L 29.95 68.81 L 28.11 74.31 L 28.11 78.90 L 71.89 78.90 L 71.89 73.85 L 70.05 68.81 L 66.36 64.68 L 58.99 59.17 L 57.14 55.96 L 55.76 51.38 L 56.22 50.00 L 61.75 50.00 L 63.13 47.25 L 61.75 44.50 L 57.14 41.74 L 60.83 35.32 L 60.37 29.36 L 58.53 26.15 L 53.92 22.94 Z`,
  r: `M 30.41 25.35 L 29.49 26.27 L 30.41 38.25 L 31.80 41.01 L 35.02 43.32 L 35.94 45.16 L 33.18 70.05 L 29.03 71.89 L 27.19 73.73 L 25.81 77.42 L 25.81 83.87 L 73.73 84.33 L 73.73 75.58 L 70.97 71.89 L 66.82 70.05 L 64.06 44.70 L 68.20 41.01 L 69.59 38.71 L 70.51 26.27 L 68.66 24.88 L 64.52 23.50 L 62.21 23.50 L 60.37 31.34 L 59.45 32.26 L 56.68 32.26 L 55.76 31.34 L 55.76 22.58 L 45.16 22.12 L 44.24 22.58 L 44.24 31.80 L 40.55 32.26 L 39.17 29.49 L 37.79 23.50 L 35.48 23.50 Z`,
  n: `M 38.07 17.51 L 36.24 19.82 L 35.32 24.42 L 29.82 29.95 L 26.61 39.17 L 20.64 47.00 L 19.27 50.23 L 19.27 53.92 L 20.64 55.76 L 26.61 58.53 L 30.28 58.53 L 34.86 53.00 L 38.53 53.00 L 41.28 52.07 L 46.79 46.54 L 47.71 47.47 L 47.71 51.15 L 36.24 62.67 L 33.94 65.90 L 32.57 70.05 L 29.36 71.89 L 26.61 75.12 L 26.15 84.33 L 74.31 84.33 L 73.85 75.12 L 71.10 71.89 L 67.89 70.05 L 71.56 60.83 L 72.48 55.30 L 72.02 47.47 L 68.35 37.79 L 64.22 31.80 L 60.09 28.11 L 54.13 24.88 L 46.33 23.50 L 40.37 17.51 Z`,
  b: `M 52.07 16.13 L 47.93 16.13 L 44.70 18.43 L 43.78 20.74 L 43.78 23.96 L 45.16 26.73 L 41.47 29.49 L 36.41 35.02 L 31.34 44.24 L 29.95 50.23 L 30.41 58.06 L 33.18 65.44 L 36.41 69.59 L 29.49 71.89 L 26.73 74.65 L 25.81 77.88 L 26.27 84.33 L 74.19 84.33 L 74.19 76.96 L 72.81 73.73 L 69.12 70.97 L 63.59 69.59 L 67.28 64.52 L 69.59 58.06 L 70.05 50.69 L 69.12 46.08 L 64.52 36.41 L 57.60 29.03 L 55.30 34.10 L 53.92 39.63 L 53.46 51.61 L 49.31 51.61 L 49.77 40.09 L 51.61 33.18 L 56.22 23.96 L 56.22 20.28 L 55.30 18.43 Z`,
  q: `M 36.24 18.43 L 34.40 20.28 L 33.03 23.50 L 33.94 28.11 L 37.61 31.34 L 37.16 42.86 L 36.24 48.39 L 29.82 41.94 L 30.73 40.09 L 30.73 35.94 L 27.52 31.80 L 25.23 30.88 L 22.02 30.88 L 18.81 32.72 L 16.97 35.48 L 16.97 40.09 L 20.18 44.24 L 22.48 44.70 L 23.85 46.08 L 33.03 69.12 L 32.57 70.51 L 28.90 71.89 L 27.06 73.73 L 25.69 76.96 L 25.69 83.87 L 73.85 84.33 L 73.85 76.04 L 70.18 71.43 L 66.97 70.05 L 66.97 68.66 L 76.15 45.62 L 80.28 43.78 L 82.57 41.01 L 83.03 36.41 L 82.11 34.10 L 79.82 31.80 L 77.52 30.88 L 74.31 30.88 L 71.56 32.26 L 70.18 33.64 L 68.81 36.87 L 69.72 41.94 L 63.76 47.93 L 62.84 46.54 L 62.39 31.34 L 65.60 28.57 L 66.51 26.73 L 66.51 22.58 L 64.68 19.35 L 61.47 17.51 L 57.80 17.51 L 54.59 19.35 L 52.75 22.58 L 52.75 26.73 L 54.59 29.49 L 54.59 30.88 L 50.00 43.32 L 44.95 29.95 L 47.25 25.81 L 47.25 23.04 L 46.33 20.74 L 44.04 18.43 L 41.74 17.51 L 38.53 17.51 Z`,
  k: `M 46.08 15.21 L 45.62 20.74 L 40.09 21.20 L 40.09 28.57 L 46.54 29.03 L 45.62 35.02 L 44.70 35.94 L 40.55 33.64 L 36.87 32.72 L 30.41 32.72 L 26.27 34.10 L 22.12 36.87 L 19.82 39.63 L 18.43 43.32 L 17.97 51.15 L 20.28 57.14 L 28.11 64.52 L 32.26 70.05 L 29.03 71.89 L 26.27 75.12 L 25.81 84.33 L 73.73 84.33 L 73.73 75.58 L 71.43 72.35 L 68.20 70.97 L 67.74 70.05 L 70.51 65.90 L 80.18 56.22 L 82.03 49.77 L 81.57 43.78 L 80.65 41.01 L 76.50 35.94 L 69.12 32.72 L 60.83 33.18 L 54.84 35.94 L 53.00 29.49 L 53.92 28.57 L 59.91 28.57 L 59.91 21.20 L 54.84 21.20 L 53.92 15.21 Z M 65.90 45.62 L 67.74 47.93 L 67.74 50.23 L 66.82 52.07 L 59.91 59.91 L 57.14 59.91 L 56.68 47.47 L 62.21 44.70 Z M 34.56 45.16 L 39.63 45.16 L 43.32 47.93 L 42.86 59.91 L 40.09 59.91 L 32.72 51.61 L 32.26 47.47 Z`,
});

let simplePieceObserver = null;
let simplePiecesApplied = 0;
let simplePieceRefreshes = 0;

function simplePiecesEnsureStyles() {
  if (document.querySelector(`#${SIMPLE_PIECES_STYLE_ID}`)) return;
  const style = document.createElement('style');
  style.id = SIMPLE_PIECES_STYLE_ID;
  style.textContent = `
    .piece.kmate-simple-piece-v51 {
      display: grid !important;
      place-items: center !important;
      font-size: 0 !important;
      isolation: isolate;
    }
    .piece.kmate-simple-piece-v51 > svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
      shape-rendering: geometricPrecision;
    }
    .piece.kmate-simple-piece-v51 .kmate-simple-shape {
      fill: var(--kmate-simple-fill);
      stroke: var(--kmate-simple-stroke);
      stroke-width: var(--kmate-simple-stroke-width);
      stroke-linecap: round;
      stroke-linejoin: round;
      paint-order: stroke fill;
      vector-effect: non-scaling-stroke;
    }
    .piece.kmate-simple-piece-v51.white {
      --kmate-simple-fill: #fffdf7;
      --kmate-simple-stroke: #343937;
      --kmate-simple-stroke-width: 2.15;
    }
    .piece.kmate-simple-piece-v51.black {
      --kmate-simple-fill: #202422;
      --kmate-simple-stroke: #0f1211;
      --kmate-simple-stroke-width: 2.05;
    }
    .piece.kmate-simple-piece-v51.selected,
    .piece.kmate-simple-piece-v51.last-move {
      filter: none !important;
    }
    @media (prefers-reduced-motion: reduce) {
      .piece.kmate-simple-piece-v51,
      .piece.kmate-simple-piece-v51 > svg {
        transition: none !important;
        animation: none !important;
      }
    }
  `;
  document.head.append(style);
}

function simplePieceType(element) {
  const datasetType = String(element?.dataset?.pieceType || '').toLowerCase();
  if (SIMPLE_PIECE_PATHS[datasetType]) return datasetType;
  const legacySvgType = element?.querySelector(':scope > svg')?.dataset?.kmateSculptedPiece;
  if (SIMPLE_PIECE_PATHS[legacySvgType]) return legacySvgType;
  const glyph = String(element?.textContent || '').trim();
  return SIMPLE_PIECE_GLYPHS[glyph] || '';
}

function simplePieceColor(element) {
  if (element?.classList?.contains('white')) return 'white';
  if (element?.classList?.contains('black')) return 'black';
  const datasetColor = String(element?.dataset?.pieceColor || '').toLowerCase();
  if (datasetColor === 'w' || datasetColor === 'white') return 'white';
  if (datasetColor === 'b' || datasetColor === 'black') return 'black';
  return '';
}

function simplePieceSvg(type, color) {
  const name = SIMPLE_PIECE_NAMES[type] || 'piece';
  return `<svg viewBox="0 0 100 100" focusable="false" aria-hidden="true" data-kmate-simple-piece="${type}" data-kmate-simple-color="${color}">
    <title>${color} ${name}</title>
    <path class="kmate-simple-shape" fill-rule="evenodd" d="${SIMPLE_PIECE_PATHS[type]}"/>
  </svg>`;
}

function simplePiecesApply(element) {
  if (!(element instanceof HTMLElement) || !element.classList.contains('piece')) return false;
  const type = simplePieceType(element);
  const color = simplePieceColor(element);
  if (!type || !color) return false;

  const current = element.querySelector(':scope > svg[data-kmate-simple-piece]');
  if (
    element.dataset.kmatePieceStyle === SIMPLE_PIECES_VERSION
    && current?.dataset.kmateSimplePiece === type
    && current?.dataset.kmateSimpleColor === color
  ) return false;

  element.dataset.kmatePieceStyle = SIMPLE_PIECES_VERSION;
  element.dataset.pieceType = type;
  element.dataset.pieceColor = color === 'white' ? 'w' : 'b';
  element.classList.remove('kmate-sculpted-piece-v47', 'kmate-pointed-pawn-v50');
  element.classList.add('vector-piece', 'staunton-piece', 'kmate-simple-piece-v51');
  element.innerHTML = simplePieceSvg(type, color);
  simplePiecesApplied += 1;
  return true;
}

function simplePiecesRefresh(root = document) {
  simplePieceRefreshes += 1;
  const pieces = new Set();
  if (root instanceof Element && root.matches(SIMPLE_PIECES_SELECTOR)) pieces.add(root);
  root.querySelectorAll?.(SIMPLE_PIECES_SELECTOR).forEach((piece) => pieces.add(piece));
  let changed = 0;
  pieces.forEach((piece) => {
    if (simplePiecesApply(piece)) changed += 1;
  });
  return changed;
}

function simplePiecesStartObserver() {
  if (simplePieceObserver || !document.body) return;
  simplePieceObserver = new MutationObserver((mutations) => {
    const roots = new Set();
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (target?.classList?.contains('piece')) roots.add(target);
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) roots.add(node);
      }
    }
    roots.forEach((root) => simplePiecesRefresh(root));
  });
  simplePieceObserver.observe(document.body, { childList: true, subtree: true });
}

function simplePiecesState() {
  const pieces = [...document.querySelectorAll('.piece.kmate-simple-piece-v51')];
  const byType = Object.fromEntries(Object.keys(SIMPLE_PIECE_PATHS).map((type) => [
    type,
    pieces.filter((piece) => piece.dataset.pieceType === type).length,
  ]));
  return {
    ready: true,
    version: SIMPLE_PIECES_VERSION,
    style: 'flat-reference-silhouette',
    reference: 'user-supplied green-and-ivory board',
    sourceImageCopied: false,
    gradients: 0,
    decorativeDetailLayers: 0,
    applied: simplePiecesApplied,
    refreshes: simplePieceRefreshes,
    visiblePieces: pieces.filter((piece) => piece.getClientRects().length > 0).length,
    totalPieces: pieces.length,
    byType,
    palette: {
      white: 'flat warm white with charcoal outline',
      black: 'flat near-black with dark outline',
    },
  };
}

function simplePiecesInitialize() {
  document.documentElement.classList.remove('kmate-sculpted-pieces-v47');
  document.documentElement.classList.add('kmate-simple-pieces-v51');
  simplePiecesEnsureStyles();
  simplePiecesRefresh();
  simplePiecesStartObserver();
  window.setTimeout(() => simplePiecesRefresh(), 0);
  window.setTimeout(() => simplePiecesRefresh(), 300);
  window.setTimeout(() => simplePiecesRefresh(), 1400);

  const api = {
    version: SIMPLE_PIECES_VERSION,
    refresh: simplePiecesRefresh,
    state: simplePiecesState,
  };
  window.__KMATE_SIMPLE_PIECES_V51__ = api;
  // Retain the old diagnostic name so older QA and optional layers do not
  // mistake the visual-only replacement for a missing piece renderer.
  window.__KMATE_SCULPTED_PIECES_V47__ = api;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', simplePiecesInitialize, { once: true });
} else {
  simplePiecesInitialize();
}
