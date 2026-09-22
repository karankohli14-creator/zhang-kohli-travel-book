const SVG44_VERSION = '44.0.0';
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG44_STORE_KEY = 'kmate-svg-board-v44';
const SVG44_BOARD_SELECTORS = ['#board', '#km42PuzzleBoard'];

const SVG44_THEMES = Object.freeze({
  wood: Object.freeze({
    label: 'Wood', light: '#d7bd8f', light2: '#c8a56f', dark: '#7c4e2f', dark2: '#5f351f',
    frame: '#2d1a10', line: '#f6dfad', accent: '#f4cc70', selected: '#f3d66f',
    last: '#f0b95f', legal: '#dff6ba', check: '#f87373',
  }),
  slate: Object.freeze({
    label: 'Slate', light: '#cbd2d5', light2: '#aeb8bd', dark: '#53636c', dark2: '#35434b',
    frame: '#172127', line: '#edf3f5', accent: '#80d8a4', selected: '#f4cc70',
    last: '#81c8e8', legal: '#b9f474', check: '#ff8e86',
  }),
  sand: Object.freeze({
    label: 'Sand', light: '#ead9b7', light2: '#d7bd88', dark: '#b07b50', dark2: '#8a5939',
    frame: '#493222', line: '#fff5df', accent: '#72d6c7', selected: '#f4cc70',
    last: '#e7a85a', legal: '#cceca0', check: '#ef736f',
  }),
  lapis: Object.freeze({
    label: 'Lapis', light: '#dbe6e9', light2: '#bdd0d7', dark: '#315f78', dark2: '#1f4258',
    frame: '#102b3a', line: '#ecf8ff', accent: '#8dd8ff', selected: '#f4cc70',
    last: '#71c5dc', legal: '#b9f474', check: '#ff8e86',
  }),
});

const SVG44_DEFAULT_SETTINGS = Object.freeze({ enabled: true, theme: 'wood', coordinates: true, annotations: true });
let svg44Settings = svg44LoadSettings();
const svg44BoardStates = new WeakMap();
let svg44GlobalObserver = null;
let svg44ControlTimer = null;

function svg44$(selector, root = document) { return root.querySelector(selector); }
function svg44$$(selector, root = document) { return [...root.querySelectorAll(selector)]; }

function svg44LoadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SVG44_STORE_KEY) || 'null');
    if (parsed && typeof parsed === 'object') {
      return { ...SVG44_DEFAULT_SETTINGS, ...parsed, theme: SVG44_THEMES[parsed.theme] ? parsed.theme : SVG44_DEFAULT_SETTINGS.theme };
    }
  } catch {}
  return { ...SVG44_DEFAULT_SETTINGS };
}

function svg44SaveSettings() {
  try { localStorage.setItem(SVG44_STORE_KEY, JSON.stringify(svg44Settings)); }
  catch (error) { console.warn('K-Mate could not save the SVG board preference.', error); }
}

function svg44Node(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }
  return node;
}

function svg44SourceSquares(board) {
  if (!board) return [];
  return [...board.children].filter((element) => (
    element instanceof HTMLElement && element.classList.contains('sq') && (element.dataset.square || element.dataset.km42Square)
  ));
}

function svg44SquareName(button) { return button?.dataset?.square || button?.dataset?.km42Square || ''; }
function svg44FindSourceButton(board, square) { return svg44SourceSquares(board).find((button) => svg44SquareName(button) === square) || null; }
function svg44Theme() { return SVG44_THEMES[svg44Settings.theme] || SVG44_THEMES.wood; }

function svg44SessionKey(board) {
  if (board.id === 'board') {
    try {
      const state = window.__KMATE__?.state?.();
      return `game:${state?.current || 'none'}:${state?.seedId || ''}`;
    } catch { return `game:${svg44$('#positionTitle')?.textContent || 'none'}`; }
  }
  if (board.id === 'km42PuzzleBoard') {
    return `puzzle:${svg44$('#km42PuzzleTitle')?.textContent || ''}:${svg44$('#km42PuzzleSource')?.getAttribute('href') || ''}`;
  }
  return `board:${board.id || 'anonymous'}`;
}

function svg44ObserveBoard(board, state) {
  state.observer.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-square', 'data-km42-square', 'aria-label'] });
}

function svg44State(board) {
  let state = svg44BoardStates.get(board);
  if (state) return state;
  state = {
    board, observer: null, scheduled: false, rendering: false, overlay: null, serial: 0, sessionKey: '',
    squareHighlights: new Map(), arrows: [], pointer: null, annotationPointer: null,
    suppressClickUntil: 0, ghost: null, squareOrder: [],
  };
  state.observer = new MutationObserver((mutations) => {
    if (state.rendering) return;
    const meaningful = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : null;
      return !target?.closest?.('.svg44-overlay');
    });
    if (meaningful) svg44Schedule(board);
  });
  svg44BoardStates.set(board, state);
  svg44ObserveBoard(board, state);
  return state;
}

function svg44Schedule(board) {
  const state = svg44State(board);
  if (state.scheduled) return;
  state.scheduled = true;
  window.requestAnimationFrame(() => { state.scheduled = false; svg44Render(board); });
}

function svg44RestoreSource(board) {
  board.classList.remove('svg44-enabled');
  const overlay = [...board.children].find((child) => child.classList?.contains('svg44-overlay'));
  overlay?.remove();
  for (const button of svg44SourceSquares(board)) { button.removeAttribute('aria-hidden'); button.removeAttribute('tabindex'); }
}

function svg44ClipId(board, state, suffix) {
  const safe = String(board.id || 'board').replace(/[^a-z0-9_-]+/gi, '-');
  return `km-svg44-${safe}-${state.serial}-${suffix}`;
}

function svg44AppendGradient(defs, id, first, second, vertical = false) {
  const gradient = svg44Node('linearGradient', { id, x1: '0%', y1: '0%', x2: vertical ? '0%' : '100%', y2: '100%' });
  gradient.append(
    svg44Node('stop', { offset: '0%', 'stop-color': first }),
    svg44Node('stop', { offset: '52%', 'stop-color': second }),
    svg44Node('stop', { offset: '100%', 'stop-color': first }),
  );
  defs.append(gradient);
}

function svg44RewriteIds(svg, prefix) {
  const idMap = new Map();
  for (const element of [svg, ...svg.querySelectorAll('[id]')]) {
    const oldId = element.getAttribute?.('id');
    if (!oldId) continue;
    const nextId = `${prefix}-${oldId}`;
    idMap.set(oldId, nextId);
    element.setAttribute('id', nextId);
  }
  if (!idMap.size) return svg;
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      let value = attribute.value;
      for (const [oldId, nextId] of idMap.entries()) {
        value = value.replaceAll(`url(#${oldId})`, `url(#${nextId})`).replaceAll(`href="#${oldId}"`, `href="#${nextId}"`).replaceAll(`#${oldId}`, `#${nextId}`);
      }
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
  }
  return svg;
}

function svg44ClonePiece(button, prefix, x, y) {
  const piece = button.querySelector('.piece');
  if (!piece) return null;
  const sourceSvg = piece.querySelector('svg');
  if (sourceSvg) {
    const clone = svg44RewriteIds(sourceSvg.cloneNode(true), prefix);
    clone.setAttribute('x', String(x + 5)); clone.setAttribute('y', String(y + 4));
    clone.setAttribute('width', '90'); clone.setAttribute('height', '92');
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    clone.classList.add('svg44-piece-art'); clone.removeAttribute('draggable');
    return clone;
  }
  const text = svg44Node('text', { x: x + 50, y: y + 73, 'text-anchor': 'middle', class: `svg44-unicode-piece ${piece.classList.contains('white') ? 'white' : 'black'}` });
  text.textContent = piece.textContent || '';
  return text;
}

function svg44IsMovable(board, button) {
  const piece = button?.querySelector('.piece');
  if (!piece) return false;
  if (piece.getAttribute('draggable') === 'true') return true;
  if (board.id === 'km42PuzzleBoard') {
    const waiting = svg44$('#km42PuzzlePlayerTurn')?.textContent?.trim() === 'Your move';
    const avatar = svg44$('#km42PuzzlePlayerAvatar')?.textContent?.trim();
    const sideClass = avatar === '♟' ? 'black' : 'white';
    return waiting && piece.classList.contains(sideClass);
  }
  return false;
}

function svg44CenterForSquare(state, square) {
  const index = state.squareOrder.indexOf(square);
  if (index < 0) return null;
  return { x: (index % 8) * 100 + 50, y: Math.floor(index / 8) * 100 + 50 };
}

function svg44DrawArrow(layer, state, from, to, color, markerId, className = '') {
  const start = svg44CenterForSquare(state, from); const end = svg44CenterForSquare(state, to);
  if (!start || !end || from === to) return;
  const dx = end.x - start.x; const dy = end.y - start.y; const distance = Math.max(1, Math.hypot(dx, dy));
  const x1 = start.x + dx / distance * 17; const y1 = start.y + dy / distance * 17;
  const x2 = end.x - dx / distance * 26; const y2 = end.y - dy / distance * 26;
  layer.append(svg44Node('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 15, 'stroke-linecap': 'round', opacity: 0.86, 'marker-end': `url(#${markerId})`, class: `svg44-arrow ${className}`.trim() }));
}

function svg44Marker(defs, id, color) {
  const marker = svg44Node('marker', { id, viewBox: '0 0 10 10', refX: 8.2, refY: 5, markerWidth: 4.8, markerHeight: 4.8, orient: 'auto-start-reverse' });
  marker.append(svg44Node('path', { d: 'M0 0L10 5L0 10Z', fill: color })); defs.append(marker);
}

function svg44RenderAnnotations(layer, state, defs) {
  const theme = svg44Theme();
  for (const [square, color] of state.squareHighlights.entries()) {
    const center = svg44CenterForSquare(state, square); if (!center) continue;
    layer.append(svg44Node('rect', { x: center.x - 48, y: center.y - 48, width: 96, height: 96, rx: 9, fill: color, opacity: 0.32, class: 'svg44-user-square' }));
  }
  state.arrows.forEach((arrow, index) => {
    const markerId = svg44ClipId(state.board, state, `user-arrow-${index}`);
    svg44Marker(defs, markerId, arrow.color || theme.accent);
    svg44DrawArrow(layer, state, arrow.from, arrow.to, arrow.color || theme.accent, markerId, 'user');
  });
}

function svg44RenderCoachArrows(layer, state, squares, defs) {
  const theme = svg44Theme();
  const byClass = (name) => squares.find((button) => button.classList.contains(name));
  const playedFrom = svg44SquareName(byClass('live-played-from')); const playedTo = svg44SquareName(byClass('live-played-to'));
  const bestFrom = svg44SquareName(byClass('live-best-from')); const bestTo = svg44SquareName(byClass('live-best-to'));
  if (playedFrom && playedTo) { const markerId = svg44ClipId(state.board, state, 'played-arrow'); svg44Marker(defs, markerId, '#ff9d4d'); svg44DrawArrow(layer, state, playedFrom, playedTo, '#ff9d4d', markerId, 'played'); }
  if (bestFrom && bestTo && (bestFrom !== playedFrom || bestTo !== playedTo)) { const markerId = svg44ClipId(state.board, state, 'best-arrow'); svg44Marker(defs, markerId, '#7cf58a'); svg44DrawArrow(layer, state, bestFrom, bestTo, '#7cf58a', markerId, 'best'); }
  const hintFrom = svg44SquareName(byClass('km42-hint-source')); const hintTo = svg44SquareName(byClass('km42-hint-target'));
  if (hintFrom && hintTo) { const markerId = svg44ClipId(state.board, state, 'hint-arrow'); svg44Marker(defs, markerId, theme.legal); svg44DrawArrow(layer, state, hintFrom, hintTo, theme.legal, markerId, 'hint'); }
}

function svg44LastMoveFrom(squares) {
  const explicit = squares.find((button) => button.classList.contains('last-from'));
  if (explicit) return svg44SquareName(explicit);
  const last = squares.filter((button) => button.classList.contains('last'));
  if (last.length !== 2) return '';
  return svg44SquareName(last.find((button) => !button.querySelector('.piece')));
}

function svg44AddArrivalAnimation(group, state, fromSquare, toSquare) {
  if (!fromSquare || !toSquare || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const from = svg44CenterForSquare(state, fromSquare); const to = svg44CenterForSquare(state, toSquare);
  if (!from || !to) return;
  group.append(svg44Node('animateTransform', { attributeName: 'transform', type: 'translate', from: `${from.x - to.x} ${from.y - to.y}`, to: '0 0', dur: '0.18s', calcMode: 'spline', keySplines: '0.22 1 0.36 1' }));
}

function svg44SquareVisualClass(button) {
  const classes = ['svg44-square'];
  if (button.classList.contains('selected')) classes.push('selected');
  if (button.classList.contains('last')) classes.push('last');
  if (button.classList.contains('check')) classes.push('check');
  if (button.classList.contains('move-quality-square')) classes.push('rated');
  if (button.classList.contains('live-played-from') || button.classList.contains('live-played-to')) classes.push('played');
  if (button.classList.contains('live-best-from') || button.classList.contains('live-best-to')) classes.push('best');
  if (button.classList.contains('km42-hint-source') || button.classList.contains('km42-hint-target')) classes.push('hint');
  return classes.join(' ');
}

function svg44CreateOverlay(board, state) {
  const svg = svg44Node('svg', { class: 'svg44-overlay', viewBox: '0 0 800 800', preserveAspectRatio: 'xMidYMid meet', role: 'grid', 'aria-label': board.id === 'km42PuzzleBoard' ? 'K-Mate SVG puzzle board' : 'K-Mate SVG chessboard' });
  svg.dataset.svg44Version = SVG44_VERSION;
  svg.addEventListener('click', (event) => svg44HandleClick(event, board, state));
  svg.addEventListener('keydown', (event) => svg44HandleKeyDown(event, board, state));
  svg.addEventListener('pointerdown', (event) => svg44HandlePointerDown(event, board, state));
  svg.addEventListener('pointermove', (event) => svg44HandlePointerMove(event, board, state));
  svg.addEventListener('pointerup', (event) => svg44HandlePointerUp(event, board, state));
  svg.addEventListener('pointercancel', (event) => svg44HandlePointerCancel(event, board, state));
  svg.addEventListener('contextmenu', (event) => svg44HandleContextMenu(event, board, state));
  return svg;
}

function svg44Render(board) {
  const state = svg44State(board); const squares = svg44SourceSquares(board);
  if (!svg44Settings.enabled || squares.length !== 64) { svg44RestoreSource(board); return; }
  const sessionKey = svg44SessionKey(board);
  if (state.sessionKey && state.sessionKey !== sessionKey) { state.squareHighlights.clear(); state.arrows = []; }
  state.sessionKey = sessionKey; state.serial += 1; state.squareOrder = squares.map(svg44SquareName);
  state.rendering = true; state.observer.disconnect();
  try {
    board.classList.add('svg44-enabled'); board.dataset.svg44Theme = svg44Settings.theme;
    for (const button of squares) { button.setAttribute('aria-hidden', 'true'); button.setAttribute('tabindex', '-1'); }
    let overlay = [...board.children].find((child) => child.classList?.contains('svg44-overlay'));
    if (!overlay) { overlay = svg44CreateOverlay(board, state); board.append(overlay); }
    state.overlay = overlay; overlay.dataset.theme = svg44Settings.theme; overlay.replaceChildren();

    const theme = svg44Theme(); const defs = svg44Node('defs');
    const lightId = svg44ClipId(board, state, 'light'); const darkId = svg44ClipId(board, state, 'dark');
    const clipId = svg44ClipId(board, state, 'clip'); const shadowId = svg44ClipId(board, state, 'shadow');
    svg44AppendGradient(defs, lightId, theme.light, theme.light2, true); svg44AppendGradient(defs, darkId, theme.dark, theme.dark2, true);
    const clip = svg44Node('clipPath', { id: clipId }); clip.append(svg44Node('rect', { x: 0, y: 0, width: 800, height: 800, rx: 14 })); defs.append(clip);
    const shadow = svg44Node('filter', { id: shadowId, x: '-20%', y: '-20%', width: '140%', height: '150%' });
    shadow.append(svg44Node('feDropShadow', { dx: 0, dy: 5, stdDeviation: 5, 'flood-color': '#000000', 'flood-opacity': 0.34 })); defs.append(shadow); overlay.append(defs);

    const boardLayer = svg44Node('g', { 'clip-path': `url(#${clipId})`, class: 'svg44-board-layer' });
    const overlayLayer = svg44Node('g', { 'clip-path': `url(#${clipId})`, class: 'svg44-state-layer' });
    const pieceLayer = svg44Node('g', { 'clip-path': `url(#${clipId})`, class: 'svg44-piece-layer' });
    const arrowLayer = svg44Node('g', { 'clip-path': `url(#${clipId})`, class: 'svg44-arrow-layer' });
    const hitLayer = svg44Node('g', { 'clip-path': `url(#${clipId})`, class: 'svg44-hit-layer' });
    const lastFrom = svg44LastMoveFrom(squares);

    squares.forEach((button, index) => {
      const square = svg44SquareName(button); const x = (index % 8) * 100; const y = Math.floor(index / 8) * 100;
      const light = button.classList.contains('light'); const squareGroup = svg44Node('g', { class: svg44SquareVisualClass(button), 'data-square': square });
      squareGroup.append(svg44Node('rect', { x, y, width: 100, height: 100, fill: `url(#${light ? lightId : darkId})`, class: 'svg44-square-base' }));
      if (svg44Settings.theme === 'wood') squareGroup.append(svg44Node('path', { d: `M${x + 5} ${y + 20} C${x + 28} ${y + 12},${x + 62} ${y + 28},${x + 95} ${y + 17} M${x + 3} ${y + 63} C${x + 30} ${y + 52},${x + 68} ${y + 73},${x + 97} ${y + 59}`, fill: 'none', stroke: light ? '#6d4a2d' : '#e3bc79', 'stroke-width': 2.2, opacity: 0.10, class: 'svg44-grain' }));
      boardLayer.append(squareGroup);
      if (button.classList.contains('last')) overlayLayer.append(svg44Node('rect', { x: x + 2, y: y + 2, width: 96, height: 96, rx: 8, fill: theme.last, opacity: 0.34, class: 'svg44-last-overlay' }));
      if (button.classList.contains('selected')) overlayLayer.append(svg44Node('rect', { x: x + 3, y: y + 3, width: 94, height: 94, rx: 10, fill: theme.selected, opacity: 0.48, class: 'svg44-selected-overlay' }));
      if (button.classList.contains('check')) overlayLayer.append(svg44Node('circle', { cx: x + 50, cy: y + 50, r: 46, fill: theme.check, opacity: 0.48, class: 'svg44-check-overlay' }));
      if (button.classList.contains('move-quality-square')) overlayLayer.append(svg44Node('rect', { x: x + 6, y: y + 6, width: 88, height: 88, rx: 13, fill: 'none', stroke: theme.accent, 'stroke-width': 7, opacity: 0.84, class: 'svg44-quality-overlay' }));
      if (button.classList.contains('legal')) overlayLayer.append(svg44Node('circle', { cx: x + 50, cy: y + 50, r: 12, fill: theme.legal, opacity: 0.72, class: 'svg44-legal-dot' }));
      if (button.classList.contains('capture')) overlayLayer.append(svg44Node('circle', { cx: x + 50, cy: y + 50, r: 41, fill: 'none', stroke: theme.legal, 'stroke-width': 9, opacity: 0.68, class: 'svg44-capture-ring' }));
      const pieceNode = svg44ClonePiece(button, svg44ClipId(board, state, `piece-${index}`), x, y);
      if (pieceNode) {
        const pieceGroup = svg44Node('g', { class: 'svg44-piece', 'data-svg-piece': square, filter: `url(#${shadowId})` }); pieceGroup.append(pieceNode);
        if (button.classList.contains('last-to') || (button.classList.contains('last') && square !== lastFrom)) svg44AddArrivalAnimation(pieceGroup, state, lastFrom, square);
        pieceLayer.append(pieceGroup);
      }
      if (svg44Settings.coordinates) {
        if (index % 8 === 0) { const rank = svg44Node('text', { x: x + 7, y: y + 17, class: `svg44-coordinate ${light ? 'on-light' : 'on-dark'}` }); rank.textContent = square[1]; overlayLayer.append(rank); }
        if (index >= 56) { const file = svg44Node('text', { x: x + 90, y: y + 94, 'text-anchor': 'end', class: `svg44-coordinate ${light ? 'on-light' : 'on-dark'}` }); file.textContent = square[0]; overlayLayer.append(file); }
      }
      hitLayer.append(svg44Node('rect', { x, y, width: 100, height: 100, fill: 'transparent', class: 'svg44-hit', tabindex: 0, role: 'gridcell', 'aria-label': button.getAttribute('aria-label') || square, 'data-svg-square': square, 'data-movable': svg44IsMovable(board, button) ? 'true' : 'false' }));
    });

    svg44RenderAnnotations(overlayLayer, state, defs); svg44RenderCoachArrows(arrowLayer, state, squares, defs);
    overlay.append(boardLayer, overlayLayer, pieceLayer, arrowLayer, hitLayer);
    overlay.append(svg44Node('rect', { x: 3, y: 3, width: 794, height: 794, rx: 14, fill: 'none', stroke: theme.frame, 'stroke-width': 7, class: 'svg44-frame', 'pointer-events': 'none' }));
  } finally { state.rendering = false; svg44ObserveBoard(board, state); }
}

function svg44PointToSquare(board, state, clientX, clientY) {
  const rect = board.getBoundingClientRect(); if (!rect.width || !rect.height) return '';
  const x = Math.max(0, Math.min(rect.width - 0.01, clientX - rect.left)); const y = Math.max(0, Math.min(rect.height - 0.01, clientY - rect.top));
  return state.squareOrder[Math.floor(y / rect.height * 8) * 8 + Math.floor(x / rect.width * 8)] || '';
}

function svg44DispatchSquare(board, square) { const button = svg44FindSourceButton(board, square); if (!button) return false; button.click(); return true; }
function svg44DispatchMove(board, from, to) { const first = svg44FindSourceButton(board, from); if (!first) return false; first.click(); const second = svg44FindSourceButton(board, to); if (!second) return false; second.click(); return true; }

function svg44HandleClick(event, board, state) { const hit = event.target.closest?.('[data-svg-square]'); if (!hit || performance.now() < state.suppressClickUntil || (event.button && event.button !== 0)) return; svg44DispatchSquare(board, hit.dataset.svgSquare); }
function svg44HandleKeyDown(event, board, state) {
  const hit = event.target.closest?.('[data-svg-square]'); if (!hit) return;
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); svg44DispatchSquare(board, hit.dataset.svgSquare); return; }
  const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 })[event.key]; if (!delta) return;
  const index = state.squareOrder.indexOf(hit.dataset.svgSquare); const next = state.overlay?.querySelector(`[data-svg-square="${state.squareOrder[index + delta] || ''}"]`);
  if (next) { event.preventDefault(); next.focus(); }
}

function svg44CreateGhost(board, state, square) {
  const button = svg44FindSourceButton(board, square); if (!button?.querySelector('.piece') || !state.overlay) return null;
  const layer = state.overlay.querySelector('.svg44-piece-layer'); if (!layer) return null;
  const group = svg44Node('g', { class: 'svg44-drag-ghost', 'pointer-events': 'none' }); const node = svg44ClonePiece(button, svg44ClipId(board, state, 'ghost'), -50, -50); if (!node) return null;
  node.setAttribute('x', '-45'); node.setAttribute('y', '-46'); group.append(node); layer.append(group); state.ghost = group; state.overlay.classList.add('svg44-dragging'); return group;
}

function svg44UpdateGhost(board, state, clientX, clientY) {
  const rect = board.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const x = (clientX - rect.left) / rect.width * 800; const y = (clientY - rect.top) / rect.height * 800;
  const ghost = state.ghost || svg44CreateGhost(board, state, state.pointer?.from); if (ghost) ghost.setAttribute('transform', `translate(${x} ${y}) scale(1.08)`);
}

function svg44CleanupPointer(state) { state.pointer = null; state.annotationPointer = null; state.ghost?.remove(); state.ghost = null; state.overlay?.classList.remove('svg44-dragging'); }

function svg44HandlePointerDown(event, board, state) {
  const hit = event.target.closest?.('[data-svg-square]'); if (!hit) return; const square = hit.dataset.svgSquare;
  if (event.button === 2) {
    if (!svg44Settings.annotations) return;
    state.annotationPointer = { id: event.pointerId, from: square, startX: event.clientX, startY: event.clientY, moved: false, color: event.altKey ? '#ff7b72' : event.shiftKey ? '#7cf58a' : svg44Theme().accent };
    state.overlay?.setPointerCapture?.(event.pointerId); return;
  }
  if (event.button !== 0) return; const button = svg44FindSourceButton(board, square); if (!svg44IsMovable(board, button)) return;
  state.pointer = { id: event.pointerId, from: square, startX: event.clientX, startY: event.clientY, moved: false }; state.overlay?.setPointerCapture?.(event.pointerId);
}

function svg44HandlePointerMove(event, board, state) {
  if (state.annotationPointer?.id === event.pointerId) { if (Math.hypot(event.clientX - state.annotationPointer.startX, event.clientY - state.annotationPointer.startY) > 8) state.annotationPointer.moved = true; return; }
  if (state.pointer?.id !== event.pointerId) return;
  if (!state.pointer.moved && Math.hypot(event.clientX - state.pointer.startX, event.clientY - state.pointer.startY) > 7) state.pointer.moved = true;
  if (!state.pointer.moved) return; event.preventDefault(); svg44UpdateGhost(board, state, event.clientX, event.clientY);
}

function svg44ToggleArrow(state, from, to, color) { const index = state.arrows.findIndex((arrow) => arrow.from === from && arrow.to === to); if (index >= 0) state.arrows.splice(index, 1); else state.arrows.push({ from, to, color }); }

function svg44HandlePointerUp(event, board, state) {
  if (state.annotationPointer?.id === event.pointerId) {
    const annotation = state.annotationPointer; state.annotationPointer = null; state.overlay?.releasePointerCapture?.(event.pointerId);
    if (annotation.moved) { event.preventDefault(); const to = svg44PointToSquare(board, state, event.clientX, event.clientY); if (to && to !== annotation.from) { svg44ToggleArrow(state, annotation.from, to, annotation.color); svg44Render(board); } }
    return;
  }
  if (state.pointer?.id !== event.pointerId) return;
  const pointer = state.pointer; state.overlay?.releasePointerCapture?.(event.pointerId);
  if (pointer.moved) { event.preventDefault(); const to = svg44PointToSquare(board, state, event.clientX, event.clientY); state.suppressClickUntil = performance.now() + 650; svg44CleanupPointer(state); if (to && to !== pointer.from) svg44DispatchMove(board, pointer.from, to); return; }
  svg44CleanupPointer(state);
}

function svg44HandlePointerCancel(event, _board, state) { if (state.pointer?.id === event.pointerId || state.annotationPointer?.id === event.pointerId) svg44CleanupPointer(state); }
function svg44HandleContextMenu(event, board, state) {
  const hit = event.target.closest?.('[data-svg-square]'); if (!hit || !svg44Settings.annotations) return; event.preventDefault(); if (state.annotationPointer?.moved) return;
  const square = hit.dataset.svgSquare; if (state.squareHighlights.has(square)) state.squareHighlights.delete(square); else state.squareHighlights.set(square, event.altKey ? '#ff7b72' : event.shiftKey ? '#7cf58a' : svg44Theme().accent); svg44Render(board);
}

function svg44Attach(board) { if (!(board instanceof Element)) return false; svg44State(board); svg44Schedule(board); return true; }
function svg44RefreshAll() { for (const selector of SVG44_BOARD_SELECTORS) { const board = svg44$(selector); if (board) svg44Schedule(board); } svg44SyncDialog(); }
function svg44SetTheme(theme) { if (!SVG44_THEMES[theme]) return false; svg44Settings.theme = theme; svg44SaveSettings(); svg44RefreshAll(); return true; }
function svg44SetEnabled(enabled) { svg44Settings.enabled = Boolean(enabled); svg44SaveSettings(); svg44RefreshAll(); return svg44Settings.enabled; }
function svg44ClearAnnotations(board = null) { const boards = board ? [board] : SVG44_BOARD_SELECTORS.map((selector) => svg44$(selector)).filter(Boolean); for (const item of boards) { const state = svg44State(item); state.squareHighlights.clear(); state.arrows = []; svg44Schedule(item); } }

function svg44EnsureStyles() { if (svg44$('#svgBoardV44Styles')) return; const link = document.createElement('link'); link.id = 'svgBoardV44Styles'; link.rel = 'stylesheet'; link.href = `./svg-board-v44.css?v=${SVG44_VERSION}`; document.head.append(link); }
function svg44ThemeButtons() { return Object.entries(SVG44_THEMES).map(([key, theme]) => `<button type="button" class="svg44-theme-choice" data-svg44-theme="${key}" aria-pressed="${key === svg44Settings.theme}"><span class="svg44-theme-preview" style="--l:${theme.light};--d:${theme.dark}"><i></i><i></i><i></i><i></i></span><b>${theme.label}</b></button>`).join(''); }

function svg44EnsureDialog() {
  let dialog = svg44$('#svgBoardDialog'); if (dialog) return dialog;
  dialog = document.createElement('dialog'); dialog.id = 'svgBoardDialog'; dialog.className = 'modal svg44-dialog';
  dialog.innerHTML = `<div class="svg44-dialog-shell"><header><div><div class="eyebrow">Board appearance</div><h2>SVG chessboard</h2></div><button type="button" class="svg44-close" id="svg44Close" aria-label="Close board settings">×</button></header><p class="svg44-dialog-intro">A responsive, full-SVG board inspired by ilhooq/svgchessboard, while retaining K-Mate’s own pieces, game logic, mobile controls, and coaching overlays.</p><label class="svg44-setting-row"><span><b>Use SVG board</b><small>Switch back to the original K-Mate grid at any time.</small></span><input id="svg44Enabled" type="checkbox"></label><section><div class="svg44-section-title"><b>Board theme</b><span>Applies to normal play and puzzles</span></div><div class="svg44-theme-grid" id="svg44ThemeGrid">${svg44ThemeButtons()}</div></section><label class="svg44-setting-row"><span><b>Show coordinates</b><small>Files and ranks rotate with the board.</small></span><input id="svg44Coordinates" type="checkbox"></label><label class="svg44-setting-row"><span><b>Analysis annotations</b><small>Right-click a square to highlight it; right-drag to draw an arrow.</small></span><input id="svg44Annotations" type="checkbox"></label><div class="svg44-dialog-actions"><button type="button" class="btn" id="svg44ClearAnnotations">Clear annotations</button><a class="btn" href="https://github.com/ilhooq/svgchessboard" target="_blank" rel="noopener noreferrer">View MIT inspiration</a><button type="button" class="btn primary" id="svg44Done">Done</button></div><small class="svg44-license-note">K-Mate uses a modern in-app implementation and does not copy the project’s ChessX piece or texture assets. The MIT attribution is included in K-Mate’s licenses.</small></div>`;
  document.body.append(dialog);
  const close = () => dialog.close?.(); svg44$('#svg44Close', dialog)?.addEventListener('click', close); svg44$('#svg44Done', dialog)?.addEventListener('click', close);
  svg44$('#svg44Enabled', dialog)?.addEventListener('change', (event) => svg44SetEnabled(event.target.checked));
  svg44$('#svg44Coordinates', dialog)?.addEventListener('change', (event) => { svg44Settings.coordinates = Boolean(event.target.checked); svg44SaveSettings(); svg44RefreshAll(); });
  svg44$('#svg44Annotations', dialog)?.addEventListener('change', (event) => { svg44Settings.annotations = Boolean(event.target.checked); svg44SaveSettings(); svg44RefreshAll(); });
  svg44$('#svg44ClearAnnotations', dialog)?.addEventListener('click', () => { svg44ClearAnnotations(); const button = svg44$('#svg44ClearAnnotations', dialog); if (button) { const prior = button.textContent; button.textContent = 'Cleared'; window.setTimeout(() => { button.textContent = prior; }, 900); } });
  for (const button of svg44$$('[data-svg44-theme]', dialog)) button.addEventListener('click', () => svg44SetTheme(button.dataset.svg44Theme));
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); }); return dialog;
}

function svg44SyncDialog() {
  const dialog = svg44$('#svgBoardDialog'); if (!dialog) return;
  const enabled = svg44$('#svg44Enabled', dialog); const coordinates = svg44$('#svg44Coordinates', dialog); const annotations = svg44$('#svg44Annotations', dialog);
  if (enabled) enabled.checked = svg44Settings.enabled; if (coordinates) coordinates.checked = svg44Settings.coordinates; if (annotations) annotations.checked = svg44Settings.annotations;
  for (const button of svg44$$('[data-svg44-theme]', dialog)) { const active = button.dataset.svg44Theme === svg44Settings.theme; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }
}

function svg44OpenDialog() { const dialog = svg44EnsureDialog(); svg44SyncDialog(); if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal(); else dialog.setAttribute('open', ''); }

function svg44EnsureControls() {
  const playActions = svg44$('.play-actions');
  if (playActions && !svg44$('#svgBoardStyleButton')) { const button = document.createElement('button'); button.id = 'svgBoardStyleButton'; button.className = 'roundbtn svg44-style-button'; button.type = 'button'; button.title = 'SVG board appearance'; button.setAttribute('aria-label', 'Change SVG board appearance'); button.textContent = '◫'; button.addEventListener('click', svg44OpenDialog); const flip = svg44$('#flipButton', playActions); playActions.insertBefore(button, flip || null); }
  const puzzleTopbar = svg44$('#km42PuzzleMode .km42-puzzle-topbar');
  if (puzzleTopbar && !svg44$('#svg44PuzzleStyleButton')) { const button = document.createElement('button'); button.id = 'svg44PuzzleStyleButton'; button.className = 'roundbtn svg44-style-button'; button.type = 'button'; button.title = 'SVG board appearance'; button.setAttribute('aria-label', 'Change SVG board appearance'); button.textContent = '◫'; button.addEventListener('click', svg44OpenDialog); const flip = svg44$('#km42PuzzleFlip', puzzleTopbar); puzzleTopbar.insertBefore(button, flip || null); }
}

function svg44Discover() { svg44EnsureControls(); for (const selector of SVG44_BOARD_SELECTORS) { const board = svg44$(selector); if (board) svg44Attach(board); } }

function svg44Initialize() {
  svg44EnsureStyles(); svg44EnsureDialog(); svg44Discover();
  svg44GlobalObserver = new MutationObserver(() => { window.clearTimeout(svg44ControlTimer); svg44ControlTimer = window.setTimeout(svg44Discover, 20); });
  svg44GlobalObserver.observe(document.body, { childList: true, subtree: true });
  window.__KMATE_SVG_BOARD__ = {
    version: SVG44_VERSION,
    source: 'Modern K-Mate implementation inspired by ilhooq/svgchessboard (MIT)',
    attach: svg44Attach, refresh: svg44RefreshAll, setTheme: svg44SetTheme, setEnabled: svg44SetEnabled,
    clearAnnotations: svg44ClearAnnotations, openSettings: svg44OpenDialog,
    state: () => ({
      ready: true, enabled: svg44Settings.enabled, theme: svg44Settings.theme,
      coordinates: svg44Settings.coordinates, annotations: svg44Settings.annotations,
      boards: SVG44_BOARD_SELECTORS.map((selector) => svg44$(selector)).filter(Boolean).map((board) => ({ id: board.id, enhanced: board.classList.contains('svg44-enabled'), squares: svg44SourceSquares(board).length, overlay: Boolean([...board.children].find((child) => child.classList?.contains('svg44-overlay'))) })),
    }),
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', svg44Initialize, { once: true });
else svg44Initialize();
