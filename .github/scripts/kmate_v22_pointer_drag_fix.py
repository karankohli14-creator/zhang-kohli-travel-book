from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker: {label}")
    return text.replace(old, new, 1)


path = 'kmate-trainer/app-v7-part1.txt'
app = read(path)
app = replace_once(
    app,
    "let dragSuppressClickUntil = 0;",
    "let dragSuppressClickUntil = 0;\nlet pointerDragState = null;\nlet pointerDragGhost = null;",
    'pointer drag state',
)

pointer_code = r'''function removePointerDragGhost() {
  pointerDragGhost?.remove();
  pointerDragGhost = null;
}

function pointerSquareAt(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest?.('#board .sq') || null;
}

function positionPointerDragGhost(clientX, clientY) {
  if (!pointerDragGhost) return;
  pointerDragGhost.style.left = `${clientX}px`;
  pointerDragGhost.style.top = `${clientY}px`;
}

function activatePointerBoardDrag(event) {
  const state = pointerDragState;
  if (!state || state.active) return;
  state.active = true;
  dragSourceSquare = state.square;
  dragMoveCommitted = false;
  selected = state.square;
  legalMoves = state.moves;
  document.body.classList.add('dragging-piece');
  state.element.classList.add('dragging');
  const sourceCell = $(`#board .sq[data-square="${state.square}"]`);
  sourceCell?.classList.add('selected', 'drag-source');
  for (const move of state.moves) {
    const target = $(`#board .sq[data-square="${move.to}"]`);
    if (!target) continue;
    target.classList.add('drag-target', game.get(move.to) ? 'capture' : 'legal');
  }
  const rect = state.element.getBoundingClientRect();
  pointerDragGhost = state.element.cloneNode(true);
  pointerDragGhost.removeAttribute('draggable');
  pointerDragGhost.classList.remove('dragging');
  pointerDragGhost.classList.add('board-drag-ghost');
  pointerDragGhost.style.width = `${rect.width}px`;
  pointerDragGhost.style.height = `${rect.height}px`;
  document.body.append(pointerDragGhost);
  positionPointerDragGhost(event.clientX, event.clientY);
}

function beginPointerBoardDrag(event, square) {
  if (event.button !== undefined && event.button !== 0) return;
  if (!game || thinking || finalized || game.isGameOver() || game.turn() !== userColor || game.get(square)?.color !== userColor) return;
  const moves = game.moves({ square, verbose: true });
  if (!moves.length) return;
  pointerDragState = {
    pointerId: event.pointerId,
    square,
    moves,
    element: event.currentTarget,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
  };
  try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {}
}

function movePointerBoardDrag(event) {
  const state = pointerDragState;
  if (!state || state.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
  if (!state.active && distance >= 7) activatePointerBoardDrag(event);
  if (!state.active) return;
  event.preventDefault();
  positionPointerDragGhost(event.clientX, event.clientY);
  $$('#board .sq.drag-over').forEach((cell) => cell.classList.remove('drag-over'));
  const cell = pointerSquareAt(event.clientX, event.clientY);
  if (cell && state.moves.some((move) => move.to === cell.dataset.square)) cell.classList.add('drag-over');
}

function finishPointerBoardDrag(event) {
  const state = pointerDragState;
  if (!state || state.pointerId !== event.pointerId) return;
  pointerDragState = null;
  try { state.element.releasePointerCapture?.(event.pointerId); } catch {}
  if (!state.active) return;
  event.preventDefault();
  const cell = pointerSquareAt(event.clientX, event.clientY);
  const targetSquare = cell?.dataset?.square || null;
  const candidates = targetSquare ? state.moves.filter((move) => move.to === targetSquare) : [];
  const from = state.square;
  dragSuppressClickUntil = performance.now() + 700;
  clearBoardDragVisuals();
  removePointerDragGhost();
  dragSourceSquare = null;
  selected = null;
  legalMoves = [];
  if (!candidates.length) {
    renderBoard();
    return;
  }
  dragMoveCommitted = true;
  if (candidates.some((move) => move.promotion)) {
    promotionBase = { from, to: targetSquare };
    openPromotion();
    return;
  }
  makeUserMove({ from, to: targetSquare, promotion: 'q' });
}

function cancelPointerBoardDrag(event) {
  const state = pointerDragState;
  if (!state || (event.pointerId !== undefined && state.pointerId !== event.pointerId)) return;
  pointerDragState = null;
  clearBoardDragVisuals();
  removePointerDragGhost();
  dragSourceSquare = null;
  selected = null;
  legalMoves = [];
  renderBoard();
}

document.addEventListener('pointermove', movePointerBoardDrag, { passive: false });
document.addEventListener('pointerup', finishPointerBoardDrag, { passive: false });
document.addEventListener('pointercancel', cancelPointerBoardDrag);

'''
app = replace_once(app, 'function clearBoardDragVisuals() {', pointer_code + 'function clearBoardDragVisuals() {', 'pointer drag functions')

old_piece = '''      glyph.draggable = piece.color === userColor;
      if (piece.color === userColor) {
        glyph.title = 'Drag this piece or click it';
        glyph.addEventListener('dragstart', (event) => beginBoardDrag(event, square));
        glyph.addEventListener('dragend', endBoardDrag);
      }'''
new_piece = '''      glyph.draggable = false;
      if (piece.color === userColor) {
        glyph.dataset.dragEnabled = 'true';
        glyph.title = 'Drag this piece or click it';
        glyph.addEventListener('pointerdown', (event) => beginPointerBoardDrag(event, square));
      }'''
app = replace_once(app, old_piece, new_piece, 'pointer-enabled pieces')
write(path, app)

styles_path = 'kmate-trainer/styles-v7.css'
styles = read(styles_path)
styles += r'''

/* v22 pointer drag — reliable for mouse, trackpad, and touch */
#board .piece[data-drag-enabled="true"]{cursor:grab;touch-action:none}
#board .piece[data-drag-enabled="true"]:active{cursor:grabbing}
.board-drag-ghost{position:fixed;z-index:1000;pointer-events:none;transform:translate(-50%,-50%) scale(1.08);opacity:.9;filter:drop-shadow(0 10px 9px #0009);will-change:left,top}
.board-drag-ghost svg{width:100%;height:100%;overflow:visible}
'''
write(styles_path, styles)
