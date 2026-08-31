from pathlib import Path

path = Path('kmate-trainer/appflow-v35.js')
text = path.read_text()

old = """  let uiAudioContext = null;
  let lastUiSoundAt = 0;
"""
new = """  let uiAudioContext = null;
  let lastUiSoundAt = 0;
  let uiSoundCount = 0;
"""
if old not in text:
    raise SystemExit('UI sound state marker missing')
text = text.replace(old, new, 1)

old = """      click.start(now);
      click.stop(now + 0.026);
    } catch (error) {
"""
new = """      click.start(now);
      click.stop(now + 0.026);
      uiSoundCount += 1;
      document.documentElement.dataset.uiTapCount = String(uiSoundCount);
    } catch (error) {
"""
if old not in text:
    raise SystemExit('UI sound completion marker missing')
text = text.replace(old, new, 1)

old = """        viewportHeight: window.visualViewport?.height || window.innerHeight,
      });
"""
new = """        viewportHeight: window.visualViewport?.height || window.innerHeight,
        uiSoundCount,
      });
"""
if old not in text:
    raise SystemExit('App-flow diagnostics marker missing')
text = text.replace(old, new, 1)

path.write_text(text)
