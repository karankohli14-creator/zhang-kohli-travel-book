const SVG44_CONTRAST_VERSION = '44.0.1';
const SVG44_CONTRAST_BOARDS = ['#board', '#km42PuzzleBoard'];

const SVG44_CONTRAST_PALETTES = Object.freeze({
  white: Object.freeze({
    edge: '#21190f',
    glint: '#ffffff',
    detail: '#6f5739',
    cut: '#302419',
    eye: '#17130e',
    filter: 'drop-shadow(0 0 1.7px rgba(25,17,8,.98)) drop-shadow(0 4px 3px rgba(0,0,0,.82)) drop-shadow(0 8px 7px rgba(0,0,0,.42))',
    stops: Object.freeze({
      'piece-grad-body-hi': '#fffefb',
      'piece-grad-body-mid': '#f3e5ca',
      'piece-grad-body-low': '#c29b65',
      'piece-grad-base-hi': '#fff8e9',
      'piece-grad-base-low': '#9f7440',
      'piece-grad-band-hi': '#fffdf5',
      'piece-grad-band-low': '#ba8f58',
      'piece-grad-shadow-hi': '#d8bd91',
      'piece-grad-shadow-low': '#80613d',
      'piece-grad-mane-hi': '#e2c79b',
      'piece-grad-mane-low': '#896843',
      'piece-grad-jewel-hi': '#ffffff',
      'piece-grad-jewel-low': '#aa7d47',
    }),
  }),
  black: Object.freeze({
    edge: '#edf7ef',
    glint: '#d8eee0',
    detail: '#9ab4a4',
    cut: '#dce9df',
    eye: '#effff3',
    filter: 'drop-shadow(0 0 1.9px rgba(245,255,247,.98)) drop-shadow(0 4px 3px rgba(0,0,0,.94)) drop-shadow(0 8px 7px rgba(0,0,0,.62))',
    stops: Object.freeze({
      'piece-grad-body-hi': '#3f5147',
      'piece-grad-body-mid': '#121c16',
      'piece-grad-body-low': '#000201',
      'piece-grad-base-hi': '#27372f',
      'piece-grad-base-low': '#000100',
      'piece-grad-band-hi': '#465b4f',
      'piece-grad-band-low': '#07100b',
      'piece-grad-shadow-hi': '#24372c',
      'piece-grad-shadow-low': '#000100',
      'piece-grad-mane-hi': '#31463a',
      'piece-grad-mane-low': '#030806',
      'piece-grad-jewel-hi': '#688173',
      'piece-grad-jewel-low': '#07100b',
    }),
  }),
});

let svg44ContrastObserver = null;
let svg44ContrastFrame = 0;

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

function svg44ContrastColorForSquare(board, square) {
  const piece = svg44ContrastSourceSquare(board, square)?.querySelector('.piece');
  if (piece?.classList.contains('white')) return 'white';
  if (piece?.classList.contains('black')) return 'black';
  return '';
}

function svg44ContrastApplyStop(svg, className, color) {
  for (const stop of svg.querySelectorAll(`.${className}`)) {
    stop.setAttribute('stop-color', color);
    stop.style.stopColor = color;
  }
}

function svg44ContrastApplyPiece(wrapper, color) {
  const palette = SVG44_CONTRAST_PALETTES[color];
  const svg = wrapper.querySelector('.svg44-piece-art');
  if (!palette || !svg) return false;

  wrapper.dataset.svgPieceColor = color;
  wrapper.classList.toggle('svg44-white-piece', color === 'white');
  wrapper.classList.toggle('svg44-black-piece', color === 'black');

  svg.classList.remove('white', 'black');
  svg.classList.add('staunton-piece', 'vector-piece', color);
  svg.dataset.pieceColor = color;
  svg.setAttribute('data-svg-piece-color', color);
  svg.style.setProperty('--piece-edge', palette.edge);
  svg.style.setProperty('--piece-glint', palette.glint);
  svg.style.setProperty('--piece-detail', palette.detail);
  svg.style.setProperty('--piece-cut', palette.cut);
  svg.style.setProperty('--piece-eye', palette.eye);
  svg.style.filter = palette.filter;

  for (const [className, stopColor] of Object.entries(palette.stops)) {
    svg44ContrastApplyStop(svg, className, stopColor);
  }
  for (const node of svg.querySelectorAll('.piece-glint')) node.style.stroke = palette.glint;
  for (const node of svg.querySelectorAll('.piece-detail')) node.style.stroke = palette.detail;
  for (const node of svg.querySelectorAll('.piece-cut')) node.style.stroke = palette.cut;
  for (const node of svg.querySelectorAll('.piece-eye')) {
    node.style.fill = palette.eye;
    node.style.stroke = palette.edge;
  }
  return true;
}

function svg44ContrastEnhanceBoard(board) {
  if (!(board instanceof Element) || !board.classList.contains('svg44-enabled')) return { white: 0, black: 0 };
  const counts = { white: 0, black: 0 };
  for (const wrapper of board.querySelectorAll(':scope > .svg44-overlay .svg44-piece[data-svg-piece]')) {
    const color = svg44ContrastColorForSquare(board, wrapper.dataset.svgPiece);
    if (!color || !svg44ContrastApplyPiece(wrapper, color)) continue;
    counts[color] += 1;
  }
  board.dataset.svg44PieceContrast = SVG44_CONTRAST_VERSION;
  return counts;
}

function svg44ContrastEnhanceAll() {
  svg44ContrastFrame = 0;
  for (const selector of SVG44_CONTRAST_BOARDS) {
    const board = document.querySelector(selector);
    if (board) svg44ContrastEnhanceBoard(board);
  }
}

function svg44ContrastSchedule() {
  if (svg44ContrastFrame) return;
  svg44ContrastFrame = window.requestAnimationFrame(svg44ContrastEnhanceAll);
}

function svg44ContrastState() {
  return {
    ready: true,
    version: SVG44_CONTRAST_VERSION,
    boards: SVG44_CONTRAST_BOARDS.map((selector) => document.querySelector(selector)).filter(Boolean).map((board) => ({
      id: board.id,
      appliedVersion: board.dataset.svg44PieceContrast || null,
      white: board.querySelectorAll('.svg44-piece[data-svg-piece-color="white"]').length,
      black: board.querySelectorAll('.svg44-piece[data-svg-piece-color="black"]').length,
    })),
  };
}

function svg44ContrastInitialize() {
  svg44ContrastSchedule();
  svg44ContrastObserver = new MutationObserver((mutations) => {
    const changed = mutations.some((mutation) => (
      mutation.type === 'childList'
      && ([...mutation.addedNodes].some((node) => (
        node instanceof Element
        && (node.matches?.('.svg44-overlay,.svg44-piece') || node.querySelector?.('.svg44-overlay,.svg44-piece'))
      )) || mutation.target instanceof Element && mutation.target.closest?.('.svg44-overlay'))
    ));
    if (changed) svg44ContrastSchedule();
  });
  svg44ContrastObserver.observe(document.body, { childList: true, subtree: true });
  window.__KMATE_SVG_PIECE_CONTRAST__ = {
    version: SVG44_CONTRAST_VERSION,
    refresh: svg44ContrastEnhanceAll,
    state: svg44ContrastState,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', svg44ContrastInitialize, { once: true });
} else {
  svg44ContrastInitialize();
}
