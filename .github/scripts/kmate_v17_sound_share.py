from pathlib import Path
import re

ROOT = Path('kmate-trainer')


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content)


def load_combined_parts():
    paths = [ROOT / f'app-v7-part{number}.txt' for number in range(1, 7)]
    parts = [path.read_text() for path in paths]
    lengths = [len(part) for part in parts]
    return paths, parts, lengths, ''.join(parts)


def save_combined_parts(paths, lengths, combined):
    parts = []
    cursor = 0
    for length in lengths[:-1]:
        parts.append(combined[cursor:cursor + length])
        cursor += length
    parts.append(combined[cursor:])

    # Avoid the loader's legacy boundary normalization accidentally matching a
    # newly-created transport boundary.
    if parts[0].endswith('\n  }') and parts[1].startswith(' }\n'):
        parts[0] += parts[1][0]
        parts[1] = parts[1][1:]

    for path, part in zip(paths, parts):
        path.write_text(part)


# Header: group the badge and controls, and add a visible sharing button.
index = read('index.html')
old_header_controls = '''    <span class="topbadge" id="topBadge">Loading…</span>
    <button class="sound-toggle" id="soundToggle" type="button" aria-label="Mute move sounds" title="Move sounds">🔊</button>'''
new_header_controls = '''    <div class="header-actions">
      <span class="topbadge" id="topBadge">Loading…</span>
      <button class="share-app-button" id="shareAppButton" type="button" aria-label="Share K-Mate" title="Share K-Mate"><span aria-hidden="true">↗</span><b>Share</b></button>
      <button class="sound-toggle" id="soundToggle" type="button" aria-label="Mute move sounds" title="Move sounds">🔊</button>
    </div>'''
if old_header_controls not in index:
    raise SystemExit('Header controls marker not found')
index = index.replace(old_header_controls, new_header_controls, 1)
index = re.sub(r'\./styles-v7\.css\?v=\d+\.\d+\.\d+', './styles-v7.css?v=17.0.0', index)
index = re.sub(r'\./app-v7\.js\?v=\d+\.\d+\.\d+', './app-v7.js?v=17.0.0', index)
write('index.html', index)


# Upgrade the subtle single oscillator to a clearer wooden click / capture / check palette.
paths, original_parts, lengths, js = load_combined_parts()
js = js.replace('let audioContext = null;\n', 'let audioContext = null;\nlet audioNoiseBuffer = null;\n', 1)

sound_start = js.find("function playMoveSound(kind = 'move') {")
sound_end = js.find('function updateSoundToggle()', sound_start)
if sound_start < 0 or sound_end < 0:
    raise SystemExit('Sound function block not found')

new_sound_code = r'''function getAudioNoiseBuffer(ctx) {
  if (audioNoiseBuffer && audioNoiseBuffer.sampleRate === ctx.sampleRate) return audioNoiseBuffer;
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.12));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    const envelope = Math.pow(1 - index / length, 2.7);
    data[index] = (Math.random() * 2 - 1) * envelope;
  }
  audioNoiseBuffer = buffer;
  return buffer;
}

function scheduleChessTone(ctx, when, startFrequency, endFrequency, volume, duration, type = 'triangle') {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(30, startFrequency), when);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), when + duration);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.01);
}

function scheduleChessKnock(ctx, when, volume = 0.12, duration = 0.055, cutoff = 1250) {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = getAudioNoiseBuffer(ctx);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, when);
  filter.Q.setValueAtTime(0.8, when);
  gain.gain.setValueAtTime(Math.max(0.001, volume), when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(when);
  source.stop(when + duration + 0.01);
}

function playMoveSound(kind = 'move') {
  if (!soundEnabled()) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime + 0.006;

  if (kind === 'capture') {
    scheduleChessKnock(ctx, now, 0.17, 0.082, 850);
    scheduleChessTone(ctx, now, 215, 105, 0.105, 0.105, 'triangle');
    scheduleChessTone(ctx, now + 0.018, 145, 82, 0.075, 0.095, 'sine');
    return;
  }
  if (kind === 'check') {
    scheduleChessKnock(ctx, now, 0.105, 0.052, 1450);
    scheduleChessTone(ctx, now, 510, 650, 0.075, 0.075, 'sine');
    scheduleChessTone(ctx, now + 0.075, 660, 810, 0.065, 0.085, 'sine');
    return;
  }
  if (kind === 'win') {
    scheduleChessTone(ctx, now, 392, 440, 0.07, 0.12, 'sine');
    scheduleChessTone(ctx, now + 0.105, 523, 587, 0.075, 0.14, 'sine');
    scheduleChessTone(ctx, now + 0.22, 659, 784, 0.08, 0.19, 'sine');
    return;
  }
  if (kind === 'loss') {
    scheduleChessTone(ctx, now, 330, 245, 0.065, 0.14, 'triangle');
    scheduleChessTone(ctx, now + 0.12, 245, 165, 0.06, 0.18, 'triangle');
    return;
  }
  if (kind === 'draw') {
    scheduleChessTone(ctx, now, 330, 330, 0.055, 0.11, 'sine');
    scheduleChessTone(ctx, now + 0.1, 294, 294, 0.05, 0.13, 'sine');
    return;
  }

  // A short wooden-board click for ordinary moves.
  scheduleChessKnock(ctx, now, 0.125, 0.055, 1250);
  scheduleChessTone(ctx, now, 310, 185, 0.075, 0.072, 'triangle');
}

'''
js = js[:sound_start] + new_sound_code + js[sound_end:]

# Add native Web Share support with a clipboard fallback.
share_marker = '\n\nlet clocks = { w: 0, b: 0 };'
share_code = r'''

function canonicalShareUrl() {
  const url = new URL(window.location.href);
  url.search = '?v=20260827-17';
  url.hash = '';
  return url.href;
}

async function shareApp() {
  const payload = {
    title: 'K-Mate Chess Trainer',
    text: 'Practice opening-specific middlegames and endgames against Stockfish, with clocks and move reviews.',
    url: canonicalShareUrl(),
  };
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share(payload);
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload.url);
      toast('K-Mate link copied');
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.warn('Native sharing failed; using copy fallback.', error);
  }
  window.prompt('Copy this K-Mate link:', payload.url);
}
'''
if share_marker not in js:
    raise SystemExit('Share insertion marker not found')
js = js.replace(share_marker, share_code + share_marker, 1)

# Add a small result cue after the final position outcome appears.
result_marker = "function showResult(title, text, symbol) {\n  const session = currentSession;"
result_replacement = "function showResult(title, text, symbol) {\n  const session = currentSession;\n  window.setTimeout(() => playMoveSound(symbol === '1' ? 'win' : symbol === '0' ? 'loss' : 'draw'), 90);"
if result_marker not in js:
    raise SystemExit('Result sound marker not found')
js = js.replace(result_marker, result_replacement, 1)

# Bind the new header control.
bind_marker = "  $('#soundToggle')?.addEventListener('click', toggleSound);"
if bind_marker not in js:
    raise SystemExit('Sound binding marker not found')
js = js.replace(bind_marker, bind_marker + "\n  $('#shareAppButton')?.addEventListener('click', shareApp);", 1)
js = js.replace("version: '16.0-commercial-beta'", "version: '17.0-commercial-beta'", 1)
save_combined_parts(paths, lengths, js)


# Header and mobile styling.
styles = read('styles-v7.css')
header_marker = '.topbadge{justify-self:end;padding:7px 11px;border:1px solid var(--line);border-radius:99px;background:#ffffff08;color:var(--muted);font-size:12px}\n'
header_css = r'''.header-actions{justify-self:end;display:flex;align-items:center;gap:7px;min-width:0}
.header-actions .topbadge{justify-self:auto}
.share-app-button,.sound-toggle{display:grid;place-items:center;height:36px;border:1px solid var(--line);border-radius:11px;background:#ffffff08;color:var(--text);cursor:pointer}
.share-app-button{grid-template-columns:auto auto;gap:6px;padding:0 11px;font-size:12px}
.share-app-button>span{font-size:16px;line-height:1}
.share-app-button>b{font-size:11px}
.share-app-button:active,.sound-toggle:active{transform:scale(.96)}
'''
if header_marker not in styles:
    raise SystemExit('Header CSS marker not found')
styles = styles.replace(header_marker, header_marker + header_css, 1)

# Replace the older sound button block to avoid competing declarations.
styles = re.sub(
    r'\.sound-toggle\{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border:1px solid var\(--line\);border-radius:11px;background:#ffffff08;color:var\(--text\);font-size:15px;cursor:pointer\}\n\.sound-toggle:active\{transform:scale\(\.96\)\}\n',
    '.sound-toggle{flex:0 0 36px;width:36px;padding:0;font-size:15px}\n',
    styles,
    count=1,
)

mobile_marker = '  .topbadge{display:none}\n'
mobile_css = '  .header-actions{grid-column:2;grid-row:1}\n'
if mobile_marker not in styles:
    raise SystemExit('Mobile header marker not found')
styles = styles.replace(mobile_marker, mobile_marker + mobile_css, 1)

small_marker = '  .brandtext small{display:none}\n'
small_css = '  .share-app-button{width:36px;padding:0}\n  .share-app-button>b{display:none}\n'
if small_marker not in styles:
    raise SystemExit('Small-screen CSS marker not found')
styles = styles.replace(small_marker, small_marker + small_css, 1)
write('styles-v7.css', styles)


# Cache-bust the loader and transport files.
loader = read('app-v7.js')
loader = re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=17.0.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=17.0.0', loader)
write('app-v7.js', loader)
