const SVG44_INPUT_VERSION = '44.0.1';
const SVG44_INPUT_SELECTOR = '.svg44-overlay [data-svg-square]';

let svg44InputPointer = null;
let svg44InputLastPointer = null;

function svg44InputHit(target) {
  return target instanceof Element ? target.closest(SVG44_INPUT_SELECTOR) : null;
}

function svg44InputBoard(hit) {
  return hit?.closest('#board,#km42PuzzleBoard') || null;
}

function svg44InputSourceButton(board, square) {
  if (!board || !square) return null;
  return [...board.children].find((element) => (
    element instanceof HTMLElement
    && element.classList.contains('sq')
    && (element.dataset.square || element.dataset.km42Square) === square
  )) || null;
}

function svg44InputSquareAt(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return svg44InputHit(element)?.dataset.svgSquare || '';
}

function svg44InputRememberPointer(event) {
  const hit = svg44InputHit(event.target);
  if (!hit) return;
  const board = svg44InputBoard(hit);
  if (!board) return;
  svg44InputPointer = {
    id: event.pointerId,
    board,
    button: event.button,
    from: hit.dataset.svgSquare,
    startX: event.clientX,
    startY: event.clientY,
    maxDistance: 0,
  };
}

function svg44InputTrackPointer(event) {
  if (svg44InputPointer?.id !== event.pointerId) return;
  const distance = Math.hypot(
    event.clientX - svg44InputPointer.startX,
    event.clientY - svg44InputPointer.startY,
  );
  svg44InputPointer.maxDistance = Math.max(svg44InputPointer.maxDistance, distance);
}

function svg44InputFinishPointer(event) {
  if (svg44InputPointer?.id !== event.pointerId) return;
  svg44InputTrackPointer(event);
  const pointer = svg44InputPointer;
  const to = svg44InputSquareAt(event.clientX, event.clientY) || pointer.from;
  svg44InputLastPointer = {
    button: pointer.button,
    from: pointer.from,
    to,
    moved: pointer.maxDistance > 7 || to !== pointer.from,
    at: performance.now(),
  };
  svg44InputPointer = null;

  // The base SVG module uses pointer movement to distinguish right-drag
  // arrows from a right-click square highlight. Browsers and automation tools
  // can report a few pixels of drift for an ordinary click. Prevent its
  // pointer-up handler from consuming a same-square right click; the normal
  // contextmenu handler will then toggle the square highlight.
  if (pointer.button === 2 && to === pointer.from) {
    event.stopImmediatePropagation();
  }
}

function svg44InputCancelPointer(event) {
  if (svg44InputPointer?.id === event.pointerId) svg44InputPointer = null;
}

function svg44InputProxyClick(event) {
  const hit = svg44InputHit(event.target);
  if (!hit || event.button !== 0) return;
  const board = svg44InputBoard(hit);
  if (!board) return;

  const recent = svg44InputLastPointer;
  const recentDrag = Boolean(
    recent
    && performance.now() - recent.at < 900
    && recent.button === 0
    && recent.moved
    && recent.to !== recent.from
  );

  event.preventDefault();
  event.stopImmediatePropagation();
  if (recentDrag) return;

  const source = svg44InputSourceButton(board, hit.dataset.svgSquare);
  source?.click();
}

function svg44InputInitialize() {
  document.addEventListener('pointerdown', svg44InputRememberPointer, true);
  document.addEventListener('pointermove', svg44InputTrackPointer, true);
  document.addEventListener('pointerup', svg44InputFinishPointer, true);
  document.addEventListener('pointercancel', svg44InputCancelPointer, true);
  document.addEventListener('click', svg44InputProxyClick, true);

  window.__KMATE_SVG_BOARD_INPUT__ = {
    version: SVG44_INPUT_VERSION,
    state: () => ({
      ready: true,
      activePointer: Boolean(svg44InputPointer),
      lastPointer: svg44InputLastPointer ? { ...svg44InputLastPointer } : null,
      tapProxy: true,
      dragSuppression: true,
      sameSquareContextMenuRepair: true,
    }),
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', svg44InputInitialize, { once: true });
} else {
  svg44InputInitialize();
}
