from pathlib import Path

path = Path("kmate-trainer/coach-layout-v55.css")
text = path.read_text(encoding="utf-8")
old = """html.kmate-coach-layout-v55 .km55-dialog-home {
  position: absolute;
  z-index: 4;
  top: 10px;
  right: 10px;
  width: 38px;
  height: 38px;
  font-size: 18px;
}"""
new = """html.kmate-coach-layout-v55 .km55-dialog-home {
  position: absolute;
  z-index: 4;
  top: 10px;
  left: 10px;
  right: auto;
  width: 38px;
  height: 38px;
  font-size: 18px;
}"""
if old not in text:
    if new in text:
        raise SystemExit(0)
    raise SystemExit("Expected dialog home positioning block was not found.")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
