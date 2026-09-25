const KMATE_MOBILE_FIT_V54 = '54.0.0';
const KMATE_MIN_FRAME_SIDE_V54 = 176;
const KMATE_SCREEN_GAP_V54 = 3;
const KMATE_FRAME_BORDER_V54 = 2;

let km54FrameRequest = 0;
let km54ResizeObserver = null;
let km54MutationObserver = null;
let km54ObservedStage = null;
let km54Applications = 0;
let km54Corrections = 0;
let km54LastKey = '';
let km54LastReason = 'startup';
let km54LastMetrics = null;

const km54Root = document.documentElement;
km54Root.classList.add('kmate-mobile-fit-v54');

function km54Clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function km54Round(value, precision = 100) {
  return Math.round(value * precision) / precision;
}

function km54VisualViewportRect() {
  const viewport = window.visualViewport;
  const width = Number(viewport?.width) || window.innerWidth || document.documentElement.clientWidth || 0;
  const height = Number(viewport?.height) || window.innerHeight || document.documentElement.clientHeight || 0;
  const left = Number(viewport?.offsetLeft) || 0;
  const top = Number(viewport?.offsetTop) || 0;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    scale: Number(viewport?.scale) || 1,
    source: viewport ? 'visualViewport' : 'layoutViewport',
  };
}

function km54Elements() {
  return {
    stage: document.querySelector('#boardCoachStage'),
    frame: document.querySelector('#gameView .live-boardwrap'),
    board: document.querySelector('#gameView .live-boardwrap > #board'),
  };
}

function km54ApplyVariables(geometry) {
  const variables = {
    '--km54-screen-gap': `${geometry.gap}px`,
    '--km54-frame-side': `${geometry.frameSide}px`,
    '--km54-frame-left': `${geometry.frameLeft}px`,
    '--km54-frame-top': `${geometry.frameTop}px`,
    '--km54-board-inset': `${geometry.boardInset}px`,
    '--km54-board-side': `${geometry.boardSide}px`,
    '--km54-coordinate-size': `${geometry.coordinateSize}px`,
    '--km54-coordinate-anchor': `${geometry.coordinateAnchor}px`,
  };
  Object.entries(variables).forEach(([name, value]) => km54Root.style.setProperty(name, value));
  km54Root.dataset.kmateMobileFitV54 = KMATE_MOBILE_FIT_V54;
}

function km54VisibleStage(stageRect, viewport, gap) {
  const left = Math.max(stageRect.left, viewport.left) + gap;
  const top = Math.max(stageRect.top, viewport.top) + gap;
  const right = Math.min(stageRect.right, viewport.right) - gap;
  const bottom = Math.min(stageRect.bottom, viewport.bottom) - gap;
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function km54Geometry(stageRect, viewport) {
  const gap = KMATE_SCREEN_GAP_V54;
  const visible = km54VisibleStage(stageRect, viewport, gap);
  const frameSide = Math.floor(Math.min(visible.width, visible.height));
  if (!Number.isFinite(frameSide) || frameSide < KMATE_MIN_FRAME_SIDE_V54) return null;

  const boardInset = km54Clamp(Math.round(frameSide * 0.044), 14, 18);
  const boardSide = Math.floor(frameSide - (KMATE_FRAME_BORDER_V54 * 2) - (boardInset * 2));
  if (boardSide < 128) return null;

  const coordinateSize = Math.min(
    boardInset - 2,
    km54Clamp(Math.round(frameSide * 0.034), 12, 14),
  );
  const coordinateAnchor = km54Round(-boardInset / 2);

  const globalLeft = visible.left + ((visible.width - frameSide) / 2);
  const globalTop = visible.top + ((visible.height - frameSide) / 2);
  const frameLeft = km54Round(globalLeft - stageRect.left);
  const frameTop = km54Round(globalTop - stageRect.top);

  return {
    version: KMATE_MOBILE_FIT_V54,
    gap,
    frameSide,
    frameLeft,
    frameTop,
    boardInset,
    boardSide,
    coordinateSize,
    coordinateAnchor,
    globalLeft: km54Round(globalLeft),
    globalTop: km54Round(globalTop),
    visible,
    viewport,
    stage: {
      left: km54Round(stageRect.left),
      top: km54Round(stageRect.top),
      right: km54Round(stageRect.right),
      bottom: km54Round(stageRect.bottom),
      width: km54Round(stageRect.width),
      height: km54Round(stageRect.height),
    },
  };
}

function km54RenderedMetrics(frame, board, geometry) {
  const frameRect = frame.getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  const squares = [...board.querySelectorAll(':scope > .sq')].map((square) => {
    const rect = square.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
  const coordinates = [...board.querySelectorAll('.coord')].map((coordinate) => {
    const rect = coordinate.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
  const allowed = geometry.visible;
  const epsilon = 0.75;
  const frameContained = (
    frameRect.left >= allowed.left - epsilon
    && frameRect.top >= allowed.top - epsilon
    && frameRect.right <= allowed.right + epsilon
    && frameRect.bottom <= allowed.bottom + epsilon
  );
  const boardContained = (
    boardRect.left >= frameRect.left + KMATE_FRAME_BORDER_V54 - epsilon
    && boardRect.top >= frameRect.top + KMATE_FRAME_BORDER_V54 - epsilon
    && boardRect.right <= frameRect.right - KMATE_FRAME_BORDER_V54 + epsilon
    && boardRect.bottom <= frameRect.bottom - KMATE_FRAME_BORDER_V54 + epsilon
  );
  const squaresContained = squares.length === 64 && squares.every((rect) => (
    rect.left >= boardRect.left - epsilon
    && rect.top >= boardRect.top - epsilon
    && rect.right <= boardRect.right + epsilon
    && rect.bottom <= boardRect.bottom + epsilon
  ));
  const coordinatesContained = coordinates.length >= 16 && coordinates.every((rect) => (
    rect.left >= frameRect.left + KMATE_FRAME_BORDER_V54 - epsilon
    && rect.top >= frameRect.top + KMATE_FRAME_BORDER_V54 - epsilon
    && rect.right <= frameRect.right - KMATE_FRAME_BORDER_V54 + epsilon
    && rect.bottom <= frameRect.bottom - KMATE_FRAME_BORDER_V54 + epsilon
  ));
  return {
    frame: {
      left: km54Round(frameRect.left), top: km54Round(frameRect.top),
      right: km54Round(frameRect.right), bottom: km54Round(frameRect.bottom),
      width: km54Round(frameRect.width), height: km54Round(frameRect.height),
    },
    board: {
      left: km54Round(boardRect.left), top: km54Round(boardRect.top),
      right: km54Round(boardRect.right), bottom: km54Round(boardRect.bottom),
      width: km54Round(boardRect.width), height: km54Round(boardRect.height),
    },
    squareCount: squares.length,
    coordinateCount: coordinates.length,
    frameContained,
    boardContained,
    squaresContained,
    coordinatesContained,
    contained: frameContained && boardContained && squaresContained && coordinatesContained,
  };
}

function km54CorrectIfNeeded(frame, board, geometry) {
  const rendered = km54RenderedMetrics(frame, board, geometry);
  if (rendered.contained) return rendered;

  const frameRect = frame.getBoundingClientRect();
  let frameLeft = geometry.frameLeft;
  let frameTop = geometry.frameTop;
  let frameSide = geometry.frameSide;
  const allowed = geometry.visible;

  const horizontalOverflow = Math.max(
    0,
    allowed.left - frameRect.left,
    frameRect.right - allowed.right,
  );
  const verticalOverflow = Math.max(
    0,
    allowed.top - frameRect.top,
    frameRect.bottom - allowed.bottom,
  );
  const overflow = Math.max(horizontalOverflow, verticalOverflow);
  if (overflow > 0.25) frameSide = Math.max(KMATE_MIN_FRAME_SIDE_V54, frameSide - Math.ceil(overflow * 2) - 2);

  if (frameRect.left < allowed.left) frameLeft += allowed.left - frameRect.left;
  if (frameRect.right > allowed.right) frameLeft -= frameRect.right - allowed.right;
  if (frameRect.top < allowed.top) frameTop += allowed.top - frameRect.top;
  if (frameRect.bottom > allowed.bottom) frameTop -= frameRect.bottom - allowed.bottom;

  const boardInset = km54Clamp(Math.round(frameSide * 0.044), 14, 18);
  const boardSide = Math.floor(frameSide - (KMATE_FRAME_BORDER_V54 * 2) - (boardInset * 2));
  const coordinateSize = Math.min(boardInset - 2, km54Clamp(Math.round(frameSide * 0.034), 12, 14));
  const corrected = {
    ...geometry,
    frameSide,
    frameLeft: km54Round(frameLeft),
    frameTop: km54Round(frameTop),
    boardInset,
    boardSide,
    coordinateSize,
    coordinateAnchor: km54Round(-boardInset / 2),
  };
  km54Corrections += 1;
  km54ApplyVariables(corrected);
  km54LastMetrics = { ...corrected, rendered: null, reason: `${km54LastReason}:corrected` };
  window.requestAnimationFrame(() => {
    km54LastMetrics = {
      ...corrected,
      rendered: km54RenderedMetrics(frame, board, corrected),
      reason: `${km54LastReason}:verified`,
    };
  });
  return rendered;
}

function km54Fit(reason = 'manual') {
  km54LastReason = reason;
  km54Root.classList.add('kmate-mobile-fit-v54');
  const { stage, frame, board } = km54Elements();
  if (!document.body?.classList.contains('game-mode') || !stage || !frame || !board) {
    km54LastMetrics = {
      version: KMATE_MOBILE_FIT_V54,
      ready: true,
      active: false,
      reason,
    };
    return false;
  }

  const stageRect = stage.getBoundingClientRect();
  if (stageRect.width < 1 || stageRect.height < 1) return false;
  const viewport = km54VisualViewportRect();
  const geometry = km54Geometry(stageRect, viewport);
  if (!geometry) return false;

  const key = [
    geometry.frameSide,
    geometry.frameLeft,
    geometry.frameTop,
    geometry.boardInset,
    geometry.boardSide,
    geometry.coordinateSize,
    viewport.left,
    viewport.top,
    viewport.width,
    viewport.height,
  ].join('|');

  if (key !== km54LastKey) {
    km54LastKey = key;
    km54Applications += 1;
    km54ApplyVariables(geometry);
  }

  km54LastMetrics = { ...geometry, ready: true, active: true, reason, rendered: null };
  window.requestAnimationFrame(() => {
    km54LastMetrics = {
      ...geometry,
      ready: true,
      active: true,
      reason,
      rendered: km54RenderedMetrics(frame, board, geometry),
    };
    km54CorrectIfNeeded(frame, board, geometry);
  });
  return true;
}

function km54Schedule(reason = 'event') {
  km54LastReason = reason;
  if (km54FrameRequest) return;
  km54FrameRequest = window.requestAnimationFrame(() => {
    km54FrameRequest = 0;
    km54Fit(reason);
  });
}

function km54ObserveStage() {
  const stage = document.querySelector('#boardCoachStage');
  if (!stage || stage === km54ObservedStage || typeof ResizeObserver !== 'function') return;
  km54ResizeObserver?.disconnect();
  km54ObservedStage = stage;
  km54ResizeObserver = new ResizeObserver(() => km54Schedule('stage-resize'));
  km54ResizeObserver.observe(stage);
  const boardColumn = stage.closest('.boardcol');
  if (boardColumn) km54ResizeObserver.observe(boardColumn);
}

function km54InstallObservers() {
  if (!km54MutationObserver && document.body) {
    km54MutationObserver = new MutationObserver(() => {
      km54ObserveStage();
      km54Schedule('dom-change');
    });
    km54MutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'hidden'],
      subtree: true,
      childList: true,
    });
  }
  km54ObserveStage();
}

function km54State() {
  return {
    ready: true,
    version: KMATE_MOBILE_FIT_V54,
    active: Boolean(document.body?.classList.contains('game-mode')),
    applications: km54Applications,
    corrections: km54Corrections,
    reason: km54LastReason,
    metrics: km54LastMetrics,
    visualViewport: km54VisualViewportRect(),
    explicitRows: true,
    screenGapPx: KMATE_SCREEN_GAP_V54,
  };
}

function km54Initialize() {
  km54Root.classList.add('kmate-mobile-fit-v54');
  km54InstallObservers();
  window.addEventListener('resize', () => km54Schedule('window-resize'), { passive: true });
  window.addEventListener('orientationchange', () => {
    km54Schedule('orientation-change');
    window.setTimeout(() => km54Schedule('orientation-settled'), 180);
  }, { passive: true });
  document.addEventListener('fullscreenchange', () => km54Schedule('fullscreen-change'));
  window.visualViewport?.addEventListener('resize', () => km54Schedule('visual-viewport-resize'), { passive: true });
  window.visualViewport?.addEventListener('scroll', () => km54Schedule('visual-viewport-scroll'), { passive: true });

  window.__KMATE_MOBILE_FIT_V54__ = {
    version: KMATE_MOBILE_FIT_V54,
    fit: () => km54Fit('api'),
    schedule: () => km54Schedule('api-schedule'),
    state: km54State,
  };

  km54Schedule('initialize');
  window.setTimeout(() => km54Schedule('settle-100'), 100);
  window.setTimeout(() => km54Schedule('settle-450'), 450);
  window.setTimeout(() => km54Schedule('settle-1400'), 1400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', km54Initialize, { once: true });
} else {
  km54Initialize();
}
