from pathlib import Path

path = Path('.github/scripts/kmate_v28_live_coach_principles_crisp_sound.py')
text = path.read_text()
old = '''part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = replace_once(
    part6,
    """  $('#blindCalibration')?.addEventListener('change', () => updateControls());
  $('#autoHints')?.addEventListener('change', () => updateControls());""",
    """  $('#blindCalibration')?.addEventListener('change', () => updateControls());
  $('#autoHints')?.addEventListener('change', () => updateControls());
  $('#liveCoach')?.addEventListener('change', () => updateControls());
  $('#principleReview')?.addEventListener('change', () => updateControls());""",
    "teaching toggle bindings",
)
part6 = replace_once(
'''
new = '''part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
app = read(app_path)
app = replace_once(
    app,
    """  $('#blindCalibration')?.addEventListener('change', () => updateControls());
  $('#autoHints')?.addEventListener('change', () => updateControls());""",
    """  $('#blindCalibration')?.addEventListener('change', () => updateControls());
  $('#autoHints')?.addEventListener('change', () => updateControls());
  $('#liveCoach')?.addEventListener('change', () => updateControls());
  $('#principleReview')?.addEventListener('change', () => updateControls());""",
    "teaching toggle bindings",
)
write(app_path, app)
part6 = replace_once(
'''
if old not in text:
    raise SystemExit('Unable to find the v28 teaching-binding patch block')
path.write_text(text.replace(old, new, 1))
