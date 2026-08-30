from pathlib import Path

path = Path('kmate-trainer/app-v7-part1.txt')
text = path.read_text()
if 'let lastStartDurationMs = null;' not in text:
    marker = 'let lastStartError = null;'
    if marker not in text:
        raise SystemExit('lastStartError declaration not found')
    text = text.replace(marker, marker + '\nlet lastStartDurationMs = null;\nlet lastGenerationDurationMs = null;', 1)
path.write_text(text)
