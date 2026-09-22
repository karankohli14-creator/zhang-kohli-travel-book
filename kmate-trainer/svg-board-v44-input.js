const SVG44_INPUT_VERSION = '44.0.4';
const SVG44_OVERLAY_HIT_SELECTOR = '.svg44-overlay [data-svg-square]';
const SVG44_SOURCE_SELECTOR = '#board.svg44-enabled > .sq,#km42PuzzleBoard.svg44-enabled > .sq';
const SVG44_BOARD_SELECTOR = '#board.svg44-enabled,#km42PuzzleBoard.svg44-enabled';

let svg44InputPointer = null;
let svg44InputLastPointer = null;
let svg44InputFocusObserver = null;
const svg44InputFocusSquares = new WeakMap();

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

function svg44InputSourceButtons(board) {
  if (!board) return [];
  return [...board.children].filter((element) => (
    element instanceof HTMLElement
    && element.classList.contains('sq')
    && Boolean(svg44InputSquareName(element))
  ));
}

function svg44InputSourceButton(board, square) {
  if (!board || !square) return null;
  return svg44InputSourceButtons(board).find((element) => svg44InputSquareName(element) === square) || null;
}

function svg44InputSquareAtPoint(board, x, y) {
  if (!board) return '';
  const rect = board.getBoundingClientRect();
  if (!rect.width || !rect.height) return '';
  const column = Math.max(0, Math.min(7, Math.floor((x - rect.left) / rect.width * 8)));
  const row = Math.max(0, Math.min(7, Math.floor((y - rect.top) / rect.height * 8)));
  return svg44InputSquareName(svg44InputSourceButtons(board)[row * 8 + column]);
}

function svg44InputEventBoardAndSquare(event) {
  const source = svg44InputSourceHit(event.target);
  if (source) return { board: source.parentElement, square: svg44InputSquareName(source), source };
  const overlay = svg44InputOverlayHit(event.target);
  if (overlay) return { board: svg44InputBoard(overlay), square: overlay.dataset.svgSquare || '', source: null };
  const board = event.target instanceof Element ? event.target.closest(SVG44_BOARD_SELECTOR) : null;
  return { board, square: svg44InputSquareAtPoint(board, event.clientX, event.clientY), source: null };
}

function svg44InputRememberOverlayPointer(event) {
  const resolved = svg44InputEventBoardAndSquare(event);
  if (!resolved.board || !resolved.square) {
    for (const board of document.querySelectorAll(SVG44_BOARD_SELECTOR)) svg44InputFocusSquares.delete(board);
    return;
  }
  svg44InputPointer = {
    id: event.pointerId,
    button: event.button,
    board: resolved.board,
    from: resolved.square,
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
    board: svg44InputPointer.board,
    from: svg44InputPointer.from,
    moved: svg44InputPointer.maxDistance > 7,
    at: performance.now(),
  };
  svg44InputPointer = null;
}

function svg44InputCancelPointer(event) {
  if (svg44InputPointer?.id === event.pointerId) svg44InputPointer = null;
}

function svg44InputRecentDrag(board) {
  return Boolean(
    svg44InputLastPointer
    && performance.now() - svg44InputLastPointer.at < 900
    && svg44InputLastPointer.button === 0
    && svg44InputLastPointer.moved
    && (!board || svg44InputLastPointer.board === board)
  );
}

// The SVG hit rectangles are the visible board's authoritative interaction
// layer. Proxy a completed tap to the original K-Mate square button so all
// existing move, promotion, clock, sound, and puzzle logic remains unchanged.
function svg44InputProxyOverlayClick(event) {
  if (event.button !== 0) return;
  const resolved = svg44InputEventBoardAndSquare(event);
  if (!resolved.board || !resolved.square || resolved.source) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (svg44InputRecentDrag(resolved.board)) return;
  svg44InputSourceButton(resolved.board, resolved.square)?.click();
}

// Right-click annotations remain owned by the SVG renderer. A source-square
// context menu is forwarded for compatibility with programmatic activation.
function svg44InputForwardContextMenu(event) {
  const resolved = svg44InputEventBoardAndSquare(event);
  if (!resolved.board || !resolved.square) return;
  const target = resolved.board.querySelector(`.svg44-overlay [data-svg-square="${resolved.square}"]`);
  if (!target || target === event.target || target.contains(event.target)) return;
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

function svg44InputTrackKeyboardFocus(event) {
  const hit = svg44InputOverlayHit(event.target);
  const board = svg44InputBoard(hit);
  if (!hit || !board) return;
  const current = hit.dataset.svgSquare || '';
  if (!current) return;
  if (event.key === 'Enter' || event.key === ' ') {
    svg44InputFocusSquares.set(board, current);
    return;
  }
  const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 })[event.key];
  if (!delta) return;
  const hits = [...board.querySelectorAll('.svg44-overlay [data-svg-square]')];
  const index = hits.indexOf(hit);
  const next = hits[index + delta];
  if (next?.dataset.svgSquare) svg44InputFocusSquares.set(board, next.dataset.svgSquare);
}

function svg44InputRestoreKeyboardFocus(board) {
  const square = svg44InputFocusSquares.get(board);
  if (!square || !board?.classList.contains('svg44-enabled')) return;
  const active = document.activeElement;
  if (active instanceof Element && board.contains(active) && active.matches('[data-svg-square]')) {
    svg44InputFocusSquares.set(board, active.dataset.svgSquare || square);
    return;
  }
  if (active && active !== document.body && active !== document.documentElement && document.documentElement.contains(active)) return;
  const target = board.querySelector(`.svg44-overlay [data-svg-square="${square}"]`);
  target?.focus?.({ preventScroll: true });
}

function svg44InputObserveFocusRepair() {
  if (svg44InputFocusObserver) return;
  svg44InputFocusObserver = new MutationObserver((mutations) => {
    const boards = new Set();
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      const board = target?.closest?.('#board,#km42PuzzleBoard');
      if (board && svg44InputFocusSquares.has(board)) boards.add(board);
    }
    if (!boards.size) return;
    queueMicrotask(() => {
      for (const board of boards) svg44InputRestoreKeyboardFocus(board);
    });
  });
  svg44InputFocusObserver.observe(document.body, { childList: true, subtree: true });
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
  document.addEventListener('keydown', svg44InputTrackKeyboardFocus, true);
  document.addEventListener('click', svg44InputProxyOverlayClick, true);
  document.addEventListener('contextmenu', svg44InputForwardContextMenu, true);
  svg44InputObserveFocusRepair();
  svg44InputUpdateDialogCopy();

  window.__KMATE_SVG_BOARD_INPUT__ = {
    version: SVG44_INPUT_VERSION,
    state: () => ({
      ready: true,
      interactionLayer: 'SVG hit rectangles proxying to the original K-Mate move logic',
      originalTapAndDrag: true,
      overlayKeyboardProxy: true,
      keyboardFocusRepair: true,
      annotationContextBridge: true,
      geometricTapFallback: true,
      activePointer: Boolean(svg44InputPointer),
      lastPointer: svg44InputLastPointer ? {
        button: svg44InputLastPointer.button,
        from: svg44InputLastPointer.from,
        moved: svg44InputLastPointer.moved,
        at: svg44InputLastPointer.at,
      } : null,
    }),
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', svg44InputInitialize, { once: true });
} else {
  svg44InputInitialize();
}
