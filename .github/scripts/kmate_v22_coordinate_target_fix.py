from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker: {label}")
    return text.replace(old, new, 1)


path = Path('kmate-trainer/app-v7-part1.txt')
app = path.read_text()
old = '''function pointerSquareAt(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return element?.closest?.('#board .sq') || null;
}'''
new = '''function pointerSquareAt(clientX, clientY) {
  const board = $('#board');
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return null;
  const column = Math.max(0, Math.min(7, Math.floor(((clientX - rect.left) / rect.width) * 8)));
  const row = Math.max(0, Math.min(7, Math.floor(((clientY - rect.top) / rect.height) * 8)));
  const square = orderedSquares()[row * 8 + column];
  return square ? board.querySelector(`.sq[data-square="${square}"]`) : null;
}'''
path.write_text(replace_once(app, old, new, 'coordinate target resolver'))
