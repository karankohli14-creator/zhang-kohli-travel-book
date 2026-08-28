from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker: {label}")
    return text.replace(old, new, 1)


app_path = Path('kmate-trainer/app-v7-part1.txt')
app = app_path.read_text()

old_begin = '''function beginPointerBoardDrag(event, square) {
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
}'''
new_begin = '''function beginPointerBoardDrag(event, square) {
  if (event.button !== undefined && event.button !== 0) return;
  if (!game || thinking || finalized || game.isGameOver() || game.turn() !== userColor || game.get(square)?.color !== userColor) return;
  const moves = game.moves({ square, verbose: true });
  if (!moves.length) return;
  const squareElement = event.currentTarget;
  const pieceElement = squareElement.querySelector?.('.piece[data-drag-enabled="true"]');
  if (!pieceElement) return;
  pointerDragState = {
    pointerId: event.pointerId,
    square,
    moves,
    element: pieceElement,
    captureElement: squareElement,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
  };
  try { squareElement.setPointerCapture?.(event.pointerId); } catch {}
}'''
app = replace_once(app, old_begin, new_begin, 'square pointer drag start')

app = replace_once(
    app,
    "  try { state.element.releasePointerCapture?.(event.pointerId); } catch {}",
    "  try { state.captureElement?.releasePointerCapture?.(event.pointerId); } catch {}",
    'pointer release target',
)

old_piece_listener = '''        glyph.dataset.dragEnabled = 'true';
        glyph.title = 'Drag this piece or click it';
        glyph.addEventListener('pointerdown', (event) => beginPointerBoardDrag(event, square));'''
new_piece_listener = '''        glyph.dataset.dragEnabled = 'true';
        glyph.title = 'Drag this piece or click it';'''
app = replace_once(app, old_piece_listener, new_piece_listener, 'remove piece pointer listener')

old_button_events = '''    button.addEventListener('dragover', (event) => dragOverBoardSquare(event, square));
    button.addEventListener('dragenter', (event) => dragOverBoardSquare(event, square));'''
new_button_events = '''    button.addEventListener('pointerdown', (event) => beginPointerBoardDrag(event, square));
    button.addEventListener('dragover', (event) => dragOverBoardSquare(event, square));
    button.addEventListener('dragenter', (event) => dragOverBoardSquare(event, square));'''
app = replace_once(app, old_button_events, new_button_events, 'square pointer listener')
app_path.write_text(app)

styles_path = Path('kmate-trainer/styles-v7.css')
styles = styles_path.read_text()
styles += '''
#board .sq:has(.piece[data-drag-enabled="true"]){touch-action:none}
'''
styles_path.write_text(styles)
