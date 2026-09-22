const SVG45_PERFORMANCE_VERSION = '45.1.0';
let svg45PerformanceObserver = null;
let svg45OptimisticMoves = 0;
let svg45RemovedAnimations = 0;
let svg45LastOptimisticAt = 0;

function svg45InjectPerformanceStyles() {
  if (document.querySelector('#svgBoardV45PerformanceStyles')) return;
  const link = document.createElement('link');
  link.id = 'svgBoardV45PerformanceStyles';
  link.rel = 'stylesheet';
  link.href = `./svg-board-v45-performance.css?v=${SVG45_PERFORMANCE_VERSION}`;
  document.head.append(link);
}

function svg45SourceSquares(board) {
  if (!board) return [];
  return [...board.children].filter((element) => (
    element instanceof HTMLElement
    && element.classList.contains('sq')
    && Boolean(element.dataset.square || element.dataset.km42Square)
  ));
}

function svg45SquareName(element) {
  return element?.dataset?.square || element?.dataset?.km42Square || '';
}

function svg45SourceSquare(board, square) {
  return svg45SourceSquares(board).find((element) => svg45SquareName(element) === square) || null;
}

function svg45BoardForHit(hit) {
  return hit?.closest?.('#board,#km42PuzzleBoard') || null;
}

function svg45RemoveArrivalAnimations(root = document) {
  let removed = 0;
  root.querySelectorAll?.('.svg44-overlay animateTransform').forEach((animation) => {
    animation.remove();
    removed += 1;
  });
  svg45RemovedAnimations += removed;
  return removed;
}

function svg45MoveRenderedPiece(board, from, to, targetHit) {
  const overlay = board.querySelector(':scope > .svg44-overlay');
  const group = overlay?.querySelector(`.svg44-piece[data-svg-piece="${from}"]`);
  if (!overlay || !group || !targetHit) return false;
  const x = Number(targetHit.getAttribute('x'));
  const y = Number(targetHit.getAttribute('y'));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  const destination = overlay.querySelector(`.svg44-piece[data-svg-piece="${to}"]`);
  destination?.remove();

  const vector = group.querySelector('.svg44-piece-art');
  if (vector) {
    vector.setAttribute('x', String(x + 5));
    vector.setAttribute('y', String(y + 4));
  }
  const unicode = group.querySelector('.svg44-unicode-piece');
  if (unicode) {
    unicode.setAttribute('x', String(x + 50));
    unicode.setAttribute('y', String(y + 73));
  }
  group.dataset.svgPiece = to;
  group.classList.add('svg45-optimistic-piece');
  board.classList.add('svg45-optimistic');
  window.setTimeout(() => board.classList.remove('svg45-optimistic'), 140);
  svg45OptimisticMoves += 1;
  svg45LastOptimisticAt = performance.now();
  return true;
}

function svg45SnapTap(board, destinationSquare) {
  if (!board?.classList.contains('svg44-enabled') || !destinationSquare) return false;
  const source = svg45SourceSquares(board).find((element) => element.classList.contains('selected'));
  if (!source) return false;
  const destination = svg45SourceSquare(board, destinationSquare);
  if (!destination || !destination.classList.contains('legal') || destination.classList.contains('capture')) return false;
  const from = svg45SquareName(source);
  if (!from || from === destinationSquare) return false;
  const hit = board.querySelector(`:scope > .svg44-overlay [data-svg-square="${destinationSquare}"]`);
  return svg45MoveRenderedPiece(board, from, destinationSquare, hit);
}

// Window capture is a fallback. The v44 input bridge also calls snapTap
// directly before it proxies the destination click to the original board.
function svg45OptimisticTap(event) {
  if (event.button !== 0) return;
  const target = event.target instanceof Element ? event.target : null;
  const hit = target?.closest?.('.svg44-overlay [data-svg-square]');
  if (!hit) return;
  svg45SnapTap(svg45BoardForHit(hit), hit.dataset.svgSquare || '');
}

function svg45ObserveOverlays() {
  if (svg45PerformanceObserver) return;
  svg45PerformanceObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('animateTransform') || node.querySelector?.('animateTransform')) {
          svg45RemoveArrivalAnimations(node.parentElement || node);
        }
      }
    }
  });
  svg45PerformanceObserver.observe(document.body, { childList: true, subtree: true });
  svg45RemoveArrivalAnimations();
}

function svg45Initialize() {
  svg45InjectPerformanceStyles();
  svg45ObserveOverlays();
  window.addEventListener('click', svg45OptimisticTap, true);

  window.__KMATE_SVG_BOARD_PERFORMANCE__ = {
    version: SVG45_PERFORMANCE_VERSION,
    optimize: svg45RemoveArrivalAnimations,
    snapTap: svg45SnapTap,
    state: () => ({
      ready: true,
      version: SVG45_PERFORMANCE_VERSION,
      arrivalAnimationsDisabled: true,
      decorativeFiltersDisabled: true,
      optimisticTapMoves: svg45OptimisticMoves,
      removedAnimations: svg45RemovedAnimations,
      lastOptimisticAt: svg45LastOptimisticAt,
    }),
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', svg45Initialize, { once: true });
} else {
  svg45Initialize();
}
