from pathlib import Path

path = Path("kmate-trainer/coach-layout-v55.js")
text = path.read_text(encoding="utf-8")
marker = """    layout.querySelector('#km55HintAction')?.addEventListener('click', () => {"""
replacement = """    layout.querySelector('#km55HintCard')?.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    layout.querySelector('#km55HintAction')?.addEventListener('click', () => {"""
if replacement not in text:
    if marker not in text:
        raise SystemExit("Expected v55 hint action listener was not found.")
    text = text.replace(marker, replacement, 1)
path.write_text(text, encoding="utf-8")
