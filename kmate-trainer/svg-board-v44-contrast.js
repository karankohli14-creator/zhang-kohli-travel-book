const SVG44_PIECE_CONTRAST_VERSION = '44.1.0';
const SVG44_CONTRAST_BOARD_SELECTORS = ['#board', '#km42PuzzleBoard'];

const SVG44_CONTRAST_PALETTES = Object.freeze({
  white: Object.freeze({
    variables: Object.freeze({
      '--piece-edge': '#21170f',
      '--piece-glint': '#ffffff',
      '--piece-detail': '#6f431d',
      '--piece-cut': '#24170d',
      '--piece-eye': '#0b0805',
    }),
    stops: Object.freeze({
      '.piece-grad-body-hi': '#fffef9',
      '.piece-grad-body-mid': '#f4e4c4',
      '.piece-grad-body-low': '#c58f4d',
      '.piece-grad-base-hi': '#fff8e6',
      '.piece-grad-base-low': '#9b642d',
      '.piece-grad-band-hi': '#fffdf5',
      '.piece-grad-band-low': '#b77a39',
      '.piece-grad-shadow-hi': '#dfc090',
      '.piece-grad-shadow-low': '#7b4d22',
      '.piece-grad-mane-hi': '#e7cfaa',
      '.piece-grad-mane-low': '#815127',
      '.piece-grad-jewel-hi': '#ffffff',
      '.piece-grad-jewel-low': '#aa6e33',
    }),
    filter: 'drop-shadow(0 0 1.4px rgba(39,28,17,.96)) drop-shadow(0 5px 4px rgba(0,0,0,.58))',
    unicodeFill: '#fffdf6',
    unicodeStroke: '#24170e',
  }),
  black: Object.freeze({
    variables: Object.freeze({
      '--piece-edge': '#f4f7ff',
      '--piece-glint': '#e9f0ff',
      '--piece-detail': '#cbd4e0',
      '--piece-cut': '#ffffff',
      '--piece-eye': '#ffffff',
    }),
    stops: Object.freeze({
      '.piece-grad-body-hi': '#4a5360',
      '.piece-grad-body-mid': '#171c24',
      '.piece-grad-body-low': '#020305',
      '.piece-grad-base-hi': '#323943',
      '.piece-grad-base-low': '#000000',
      '.piece-grad-band-hi': '#515c69',
      '.piece-grad-band-low': '#0a0d12',
      '.piece-grad-shadow-hi': '#222934',
      '.piece-grad-shadow-low': '#000000',
      '.piece-grad-mane-hi': '#39424f',
      '.piece-grad-mane-low': '#05070a',
      '.piece-grad-jewel-hi': '#7b8796',
      '.piece-grad-jewel-low': '#0a0d12',
    }),
    filter: 'drop-shadow(0 0 1.7px rgba(245,249,255,.92)) drop-shadow(0 5px 5px rgba(0,0,0,.82))',
    unicodeFill: '#07090d',
    unicodeStroke: '#f4f7ff',
  }),
});

let svg44ContrastObserver = null;
let svg44ContrastScheduled = false;
let svg44ContrastPaintPasses = 0;

function svg44ContrastSquareName(element) {
  return element?.dataset?.square || element?.dataset?.km42Square || '';
}

function svg44ContrastSourceSquare(board, square) {
  if (!board || !square) return null;
  return [...board.children].find((element) => (
    element instanceof HTMLElement
    && element.classList.contains('sq')
    && svg44ContrastSquareName(element) === square
  )) || null;
}

function svg44ContrastColor(board, square) {
  const piece = svg44ContrastSourceSquare(board, square)?.querySelector('.piece');
  if (piece?.classList.contains('white')) return 'white';
  if (piece?.classList.contains('black')) return 'black';
  return '';
}

function svg44ContrastPaintVectorArt(art, color) {
  const palette = SVG44_CONTRAST_PALETTES[color];
  if (!art || !palette) return;

  art.classList.remove('white', 'black');
  art.classList.add('staunton-piece', color, 'svg44-high-contrast-piece');
  art.style.overflow = 'visible';

  for (const [property, value] of Object.entries(palette.variables)) {
    art.style.setProperty(property, value);
  }
  for (const [selector, value] of Object.entries(palette.stops)) {
    art.querySelectorAll(selector).forEach((stop) => {
      stop.style.stopColor = value;
      stop.setAttribute('stop-color', value);
    });
  }
}

function svg44ContrastPaintUnicodeArt(art, color) {
  const palette = SVG44_CONTRAST_PALETTES[color];
  if (!art || !palette) return;
  art.classList.remove('white', 'black');
  art.classList.add(color);
  art.style.fill = palette.unicodeFill;
  art.style.stroke = palette.unicodeStroke;
  art.style.strokeWidth = '2.2px';
  art.style.paintOrder = 'stroke fill';
}

function svg44ContrastPaintGroup(board, group) {
  const square = group?.dataset?.svgPiece || '';
  const color = svg44ContrastColor(board, square);
  const palette = SVG44_CONTRAST_PALETTES[color];
  if (!color || !palette) return false;

  group.classList.remove('white', 'black');
  group.classList.add(color);
  group.dataset.svgPieceColor = color;
  group.style.filter = palette.filter;

  svg44ContrastPaintVectorArt(group.querySelector('.svg44-piece-art'), color);
  svg44ContrastPaintUnicodeArt(group.querySelector('.svg44-unicode-piece'), color);
  return true;
}

function svg44ContrastPaintBoard(board) {
  if (!(board instanceof Element) || !board.classList.contains('svg44-enabled')) return 0;
  let painted = 0;
  board.querySelectorAll(':scope > .svg44-overlay [data-svg-piece]').forEach((group) => {
    if (svg44ContrastPaintGroup(board, group)) painted += 1;
  });
  if (painted) {
    board.dataset.svg44PieceContrast = SVG44_PIECE_CONTRAST_VERSION;
    svg44ContrastPaintPasses += 1;
  }
  return painted;
}

function svg44ContrastRefresh() {
  svg44ContrastScheduled = false;
  let painted = 0;
  for (const selector of SVG44_CONTRAST_BOARD_SELECTORS) {
    const board = document.querySelector(selector);
    if (board) painted += svg44ContrastPaintBoard(board);
  }
  return painted;
}

function svg44ContrastSchedule() {
  if (svg44ContrastScheduled) return;
  svg44ContrastScheduled = true;
  requestAnimationFrame(svg44ContrastRefresh);
}

function svg44ContrastMutationIsRelevant(mutation) {
  if (mutation.type !== 'childList') return false;
  return [...mutation.addedNodes].some((node) => (
    node instanceof Element
    && (
      node.matches?.('.svg44-overlay,.svg44-piece,[data-svg-piece],#board,#km42PuzzleBoard')
      || Boolean(node.querySelector?.('.svg44-piece,[data-svg-piece],.svg44-overlay'))
    )
  ));
}

function svg44ContrastState() {
  const boards = SVG44_CONTRAST_BOARD_SELECTORS
    .map((selector) => document.querySelector(selector))
    .filter(Boolean)
    .map((board) => ({
      id: board.id,
      version: board.dataset.svg44PieceContrast || null,
      white: board.querySelectorAll(':scope > .svg44-overlay [data-svg-piece][data-svg-piece-color="white"]').length,
      black: board.querySelectorAll(':scope > .svg44-overlay [data-svg-piece][data-svg-piece-color="black"]').length,
    }));
  return {
    ready: true,
    version: SVG44_PIECE_CONTRAST_VERSION,
    paintPasses: svg44ContrastPaintPasses,
    boards,
  };
}

function svg44ContrastInitialize() {
  svg44ContrastRefresh();
  svg44ContrastObserver = new MutationObserver((mutations) => {
    if (mutations.some(svg44ContrastMutationIsRelevant)) svg44ContrastSchedule();
  });
  svg44ContrastObserver.observe(document.body, { childList: true, subtree: true });

  window.__KMATE_SVG_PIECE_CONTRAST__ = {
    version: SVG44_PIECE_CONTRAST_VERSION,
    refresh: svg44ContrastRefresh,
    state: svg44ContrastState,
  };
  window.dispatchEvent(new CustomEvent('kmate:svg-piece-contrast-ready', {
    detail: { version: SVG44_PIECE_CONTRAST_VERSION },
  }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', svg44ContrastInitialize, { once: true });
} else {
  svg44ContrastInitialize();
}
