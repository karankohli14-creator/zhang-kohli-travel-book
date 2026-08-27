from pathlib import Path
import re


def read(path): return Path(path).read_text()
def write(path, content): Path(path).write_text(content)

# Add a compact sound toggle in the app bar and cache bust assets.
path = 'kmate-trainer/index.html'
s = read(path)
old = '    <span class="topbadge" id="topBadge">Loading…</span>\n  </header>'
new = '''    <span class="topbadge" id="topBadge">Loading…</span>
    <button class="sound-toggle" id="soundToggle" type="button" aria-label="Mute move sounds" title="Move sounds">🔊</button>
  </header>'''
if old not in s:
    raise SystemExit('appbar marker missing')
s = s.replace(old, new, 1)
s = re.sub(r'\./styles-v7\.css\?v=\d+\.\d+\.\d+', './styles-v7.css?v=13.0.0', s)
s = re.sub(r'\./app-v7\.js\?v=\d+\.\d+\.\d+', './app-v7.js?v=13.0.0', s)
write(path, s)

# Persist sound preference, generate subtle sounds without external audio files.
path = 'kmate-trainer/app-v7-part1.txt'
s = read(path)
s = s.replace("  side: 'random',\n};", "  side: 'random',\n  sound: true,\n};", 1)
marker = "let toastTimer = null;\n"
audio = r'''let audioContext = null;

function soundEnabled() {
  return settings.sound !== false;
}

function ensureAudioContext() {
  if (!soundEnabled()) return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioContext) audioContext = new AudioCtx();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function playMoveSound(kind = 'move') {
  if (!soundEnabled()) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const osc = ctx.createOscillator();
  const isCapture = kind === 'capture';
  const isCheck = kind === 'check';
  osc.type = 'sine';
  osc.frequency.setValueAtTime(isCapture ? 190 : isCheck ? 520 : 310, now);
  osc.frequency.exponentialRampToValueAtTime(isCapture ? 135 : isCheck ? 650 : 245, now + (isCapture ? 0.075 : 0.055));
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(isCapture ? 0.085 : 0.055, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (isCapture ? 0.105 : 0.08));
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + (isCapture ? 0.11 : 0.085));
}

function updateSoundToggle() {
  const button = $('#soundToggle');
  if (!button) return;
  button.textContent = soundEnabled() ? '🔊' : '🔇';
  button.setAttribute('aria-label', soundEnabled() ? 'Mute move sounds' : 'Turn on move sounds');
  button.title = soundEnabled() ? 'Move sounds on' : 'Move sounds off';
}

function toggleSound() {
  settings.sound = !soundEnabled();
  if (settings.sound) ensureAudioContext();
  saveStore();
  updateSoundToggle();
  if (settings.sound) playMoveSound('move');
}

'''
if marker not in s:
    raise SystemExit('audio insertion marker missing')
s = s.replace(marker, marker + audio, 1)
write(path, s)

# Play sounds after both user and engine moves, selecting capture/check variants.
path = 'kmate-trainer/app-v7-part3.txt'
s = read(path)
old = "  lastMove = { from: move.from, to: move.to };\n  beginNextTurn();\n  setStatus(`${game.isCheck() ? 'Check. ' : ''}Opponent is considering the position.`, 'thinking');"
new = "  lastMove = { from: move.from, to: move.to };\n  playMoveSound(game.isCheck() ? 'check' : move.captured ? 'capture' : 'move');\n  beginNextTurn();\n  setStatus(`${game.isCheck() ? 'Check. ' : ''}Opponent is considering the position.`, 'thinking');"
if old not in s:
    raise SystemExit('user move sound marker missing')
s = s.replace(old, new, 1)
old = "  lastMove = { from: move.from, to: move.to };\n  beginNextTurn();\n  setStatus(game.isCheck() ? 'Check—your king is under attack.' : 'Your move. Build the position one decision at a time.');"
new = "  lastMove = { from: move.from, to: move.to };\n  playMoveSound(game.isCheck() ? 'check' : move.captured ? 'capture' : 'move');\n  beginNextTurn();\n  setStatus(game.isCheck() ? 'Check—your king is under attack.' : 'Your move. Build the position one decision at a time.');"
if old not in s:
    raise SystemExit('engine move sound marker missing')
s = s.replace(old, new, 1)
write(path, s)

# Wire the toggle and initialize its state near existing event setup.
path = 'kmate-trainer/app-v7-part6.txt'
s = read(path)
# Add listener before final bootstrap if possible.
marker = "$('#brandButton').addEventListener('click', () => {"
if marker not in s:
    # fallback to any DOM listener region
    marker = "$$('[data-view]').forEach((button) =>"
if marker not in s:
    raise SystemExit('event listener marker missing')
s = s.replace(marker, "$('#soundToggle')?.addEventListener('click', toggleSound);\nupdateSoundToggle();\n\n" + marker, 1)
write(path, s)

# Styling: compact circular control, especially on mobile.
path = 'kmate-trainer/styles-v7.css'
s = read(path)
css = '''\n.sound-toggle{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border:1px solid var(--line);border-radius:11px;background:#ffffff08;color:var(--text);font-size:15px;cursor:pointer}\n.sound-toggle:active{transform:scale(.96)}\n'''
# append before first media query
idx = s.find('@media')
if idx == -1:
    s += css
else:
    s = s[:idx] + css + s[idx:]
# make top badge less dominant on narrow phones to preserve space
mobile = "  .topbadge{display:none}\n"
if mobile not in s:
    # insert into existing mobile block near appbar rules if marker available
    m = re.search(r'@media\s*\(max-width:\s*\d+px\)\s*\{', s)
    if m:
        insert = m.end()
        s = s[:insert] + '\n' + mobile + s[insert:]
write(path, s)

# Cache bust split part loader.
path = 'kmate-trainer/app-v7.js'
s = read(path)
s = re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=13.0.0', s)
s = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=13.0.0', s)
write(path, s)
