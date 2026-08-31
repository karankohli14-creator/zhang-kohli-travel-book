from pathlib import Path

path = Path('.github/scripts/kmate_v35_4_verify.js')
text = path.read_text()
old = """const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function seedProfile() {
  const records = ["""
new = """function seedProfile() {
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const records = ["""
if old not in text:
    raise SystemExit('Seed profile marker was not found')
path.write_text(text.replace(old, new, 1))
