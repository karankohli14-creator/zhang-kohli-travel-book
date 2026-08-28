from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


part1_path = "kmate-trainer/app-v7-part1.txt"
app = read(part1_path)

old_toggle = re.compile(r"async function toggleSound\(\) \{.*?\n\}\n", re.S)
match = old_toggle.search(app)
if not match:
    raise SystemExit("toggleSound function missing")
new_toggle = r'''async function toggleSound() {
  // On iOS/PWA, the first speaker tap should unlock and test audio—not mute it.
  if (soundEnabled() && !htmlAudioUnlocked) {
    const unlocked = await unlockMoveAudio(true);
    updateSoundToggle();
    if (unlocked) {
      playMoveSound('move');
      toast('Move sounds ready');
    }
    return;
  }

  settings.sound = !soundEnabled();
  saveStore();
  updateSoundToggle();
  if (settings.sound) {
    await unlockMoveAudio(true);
    playMoveSound('move');
    toast('Move sounds on');
  } else {
    htmlMoveAudio?.pause();
    toast('Move sounds muted');
  }
}
'''
app = app[:match.start()] + new_toggle + app[match.end():]

old_ready = "  button.classList.toggle('audio-ready', soundEnabled() && htmlAudioUnlocked);\n"
new_ready = "  button.classList.toggle('audio-ready', soundEnabled() && htmlAudioUnlocked);\n  button.classList.toggle('audio-needs-tap', soundEnabled() && !htmlAudioUnlocked);\n"
if old_ready not in app:
    raise SystemExit("Sound readiness marker missing")
app = app.replace(old_ready, new_ready, 1)
app = app.replace("url.search = '?v=20260828-19';", "url.search = '?v=20260828-19-1';")
write(part1_path, app)

part6_path = "kmate-trainer/app-v7-part6.txt"
part6 = read(part6_path).replace("version: '19.0-commercial-beta'", "version: '19.1-commercial-beta'")
write(part6_path, part6)

css_path = "kmate-trainer/styles-v7.css"
css = read(css_path)
if ".sound-toggle.audio-needs-tap" not in css:
    css += """
.sound-toggle.audio-needs-tap{border-color:#f4cc7066;color:#ffe09a;animation:soundReadyPulse 1.15s ease-in-out infinite alternate}
@keyframes soundReadyPulse{to{box-shadow:0 0 0 4px #f4cc7012;transform:scale(1.04)}}
"""
write(css_path, css)

index_path = "kmate-trainer/index.html"
index = read(index_path)
index = re.sub(r"\./styles-v7\.css\?v=\d+(?:\.\d+){2}", "./styles-v7.css?v=19.1.0", index)
index = re.sub(r"\./app-v7\.js\?v=\d+(?:\.\d+){2}", "./app-v7.js?v=19.1.0", index)
write(index_path, index)

loader_path = "kmate-trainer/app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+(?:\.\d+){2}", "positions-v7.js?v=19.1.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+(?:\.\d+){2}", "app-v7-part${number}.txt?v=19.1.0", loader)
write(loader_path, loader)
