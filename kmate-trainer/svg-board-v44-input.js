const SVG44_INPUT_VERSION = '44.0.2';
const SVG44_OVERLAY_HIT_SELECTOR = '.svg44-overlay [data-svg-square]';
const SVG44_SOURCE_SELECTOR = '#board.svg44-enabled > .sq,#km42PuzzleBoard.svg44-enabled > .sq';

let svg44InputPointer = null;
let svg44InputLastPointer = null;

function svg44InputEnsureStyles() {
  if (document.querySelector('#svgBoardV44InteractionStyles')) return;
  const link = document.createElement('link');
  link.id = 'svgBoardV44InteractionStyles';
  link.rel = 'stylesheet';
  link.href = `./svg-board-v44-interaction.css?v=${SVG44_INPUT_VERSION}`;
  document.head.append(link);
}

function svg44InputOverlayHit(target) {
  return target instanceof Element ? target.closest(SVG44_OVERLAY_HIT_SELECTOR) : null;
}

function svg44InputSourceHit(target) {
  return target instanceof Element ? target.closest(SVG44_SOURCE_SELECTOR) : null;
}

function svg44InputBoard(element) {
  return element?.closest('#board,#km42PuzzleBoard') || null;
}

function svg44InputSquareName(source) {
  return source?.dataset?.square || source?.dataset?.km42Square || '';
}

function svg44InputSourceButton(board, square) {
  if (!board || !square) return null;
  return [...board.children].find((element) => (
    element instanceof HTMLElement
    && element.classList.contains('sq')
    && svg44InputSquareName(element) === square
  )) || null;
}

function svg44InputRememberOverlayPointer(event) {
  const hit = svg44InputOverlayHit(event.target);
  if (!hit) return;
  const board = svg44InputBoard(hit);
  if (!board) return;
  svg44InputPointer = {
    id: event.pointerId,
    button: event.button,
    from: hit.dataset.svgSquare,
    startX: event.clientX,
    startY: event.clientY,
    maxDistance: 0,
  };
}

function svg44InputTrackOverlayPointer(event) {
  if (svg44InputPointer?.id !== event.pointerId) return;
  const distance = Math.hypot(
    event.clientX - svg44InputPointer.startX,
    event.clientY - svg44InputPointer.startY,
  );
  svg44InputPointer.maxDistance = Math.max(svg44InputPointer.maxDistance, distance);
}

function svg44InputFinishOverlayPointer(event) {
  if (svg44InputPointer?.id !== event.pointerId) return;
  svg44InputTrackOverlayPointer(event);
  svg44InputLastPointer = {
    button: svg44InputPointer.button,
    from: svg44InputPointer.from,
    moved: svg44InputPointer.maxDistance > 7,
    at: performance.now(),
  };
  svg44InputPointer = null;
}

function svg44InputCancelPointer(event) {
  if (svg44InputPointer?.id === event.pointerId) svg44InputPointer = null;
}

// Programmatic or keyboard activation of an SVG hit rectangle still proxies
// to the original K-Mate square. Normal pointer input lands directly on the
// transparent source square through the interaction stylesheet.
function svg44InputProxyOverlayClick(event) {
  const hit = svg44InputOverlayHit(event.target);
  if (!hit || event.button !== 0) return;
  const board = svg44InputBoard(hit);
  if (!board) return;
  const recentDrag = Boolean(
    svg44InputLastPointer
    && performance.now() - svg44InputLastPointer.at < 900
    && svg44InputLastPointer.button === 0
    && svg44InputLastPointer.moved
  );
  event.preventDefault();
  event.stopImmediatePropagation();
  if (recentDrag) return;
  svg44InputSourceButton(board, hit.dataset.svgSquare)?.click();
}

// Since the invisible, battle-tested square buttons now own pointer input,
// forward a right click to the matching SVG hit rectangle. The base SVG module
// then owns annotation state and redraws the highlight with the board.
function svg44InputForwardContextMenu(event) {
  const source = svg44InputSourceHit(event.target);
  if (!source) return;
  const board = source.parentElement;
  const square = svg44InputSquareName(source);
  const target = board?.querySelector(`.svg44-overlay [data-svg-square="${square}"]`);
  if (!target) return;
  event.preventDefault();
  target.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
    buttons: 0,
    clientX: event.clientX,
    clientY: event.clientY,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  }));
}

function svg44InputUpdateDialogCopy() {
  const note = [...document.querySelectorAll('#svgBoardDialog .svg44-setting-row small')]
    .find((element) => element.textContent?.includes('Right-click'));
  if (note) note.textContent = 'Right-click a square to add or remove an analysis highlight.';
}

function svg44InputInitialize() {
  svg44InputEnsureStyles();
  document.addEventListener('pointerdown', svg44InputRememberOverlayPointer, true);
  document.addEventListener('pointermove', svg44InputTrackOverlayPointer, true);
  document.addEventListener('pointerup', svg44InputFinishOverlayPointer, true);
  document.addEventListener('pointercancel', svg44InputCancelPointer, true);
  document.addEventListener('click', svg44InputProxyOverlayClick, true);
  document.addEventListener('contextmenu', svg44InputForwardContextMenu, true);
  svg44InputUpdateDialogCopy();

  window.__KMATE_SVG_BOARD_INPUT__ = {
    version: SVG44_INPUT_VERSION,
    state: () => ({
      ready: true,
      interactionLayer: 'transparent K-Mate source squares above SVG presentation',
      originalTapAndDrag: true,
      overlayKeyboardProxy: true,
      annotationContextBridge: true,
      activePointer: Boolean(svg44InputPointer),
      lastPointer: svg44InputLastPointer ? { ...svg44InputLastPointer } : null,
    }),
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', svg44InputInitialize, { once: true });
} else {
  svg44InputInitialize();
}
