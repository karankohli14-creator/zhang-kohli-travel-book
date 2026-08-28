from __future__ import annotations

from array import array
from pathlib import Path
import math
import random
import re
import wave


ROOT = Path("kmate-trainer")


def read(path: str | Path) -> str:
    return Path(path).read_text()


def write(path: str | Path, content: str) -> None:
    Path(path).write_text(content)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# HTML: sound selection, a cleaner selectable coach, and cache versioning.
# -----------------------------------------------------------------------------
index_path = ROOT / "index.html"
index = read(index_path)

sound_marker = '''          <label class="calibration-toggle hint-toggle">
            <input id="autoHints" type="checkbox">
            <span><b>Automatic hints before every move</b><small>Show a strategic idea at the start of each turn. The exact candidate remains hidden unless you reveal it.</small></span>
          </label>

          <div class="beta-tools">'''
sound_replacement = '''          <label class="calibration-toggle hint-toggle">
            <input id="autoHints" type="checkbox">
            <span><b>Automatic hints before every move</b><small>Show a strategic idea at the start of each turn. The exact candidate remains hidden unless you reveal it.</small></span>
          </label>

          <div class="field sound-style-field" id="soundStyleField">
            <div class="fieldhead sound-style-head">
              <label for="soundStyleSelect">Move sound</label>
              <button class="sound-preview" id="previewSoundButton" type="button">Preview</button>
            </div>
            <select class="select" id="soundStyleSelect" aria-label="Move sound style">
              <option value="soft">Soft wood</option>
              <option value="tournament">Tournament wood</option>
              <option value="minimal">Minimal click</option>
            </select>
            <small class="sub">Choose a quieter wooden piece sound, a sharper tournament-board sound, or a very restrained click. The speaker button can still mute everything.</small>
          </div>

          <div class="beta-tools">'''
index = replace_once(index, sound_marker, sound_replacement, "sound-style setup field")

old_avatar_pattern = re.compile(
    r'<div class="coach-avatar" id="coachAvatar" role="img" aria-label="Coach K, an animated chess knight coach">.*?</div>\n              <div class="coach-identity">',
    re.S,
)
new_avatar = '''<div class="coach-avatar" id="coachAvatar" data-style="grandmaster" role="img" aria-label="Coach K, a calm fictional grandmaster coach">
                <div class="coach-avatar-visual coach-avatar-grandmaster">
                  <svg viewBox="0 0 180 192" focusable="false" aria-hidden="true">
                    <defs>
                      <radialGradient id="gmBackdrop" cx="38%" cy="25%" r="78%"><stop offset="0" stop-color="#42624b"/><stop offset=".62" stop-color="#18271e"/><stop offset="1" stop-color="#09110c"/></radialGradient>
                      <linearGradient id="gmJacket" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#405c49"/><stop offset=".52" stop-color="#1d3024"/><stop offset="1" stop-color="#0b1510"/></linearGradient>
                      <linearGradient id="gmSkin" x1=".25" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#e9bd92"/><stop offset=".62" stop-color="#c98760"/><stop offset="1" stop-color="#96583e"/></linearGradient>
                      <linearGradient id="gmHair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#302a24"/><stop offset="1" stop-color="#0b0d0c"/></linearGradient>
                      <filter id="gmShadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-opacity=".46"/></filter>
                    </defs>
                    <circle cx="90" cy="88" r="78" fill="url(#gmBackdrop)" stroke="#91c85a" stroke-opacity=".34" stroke-width="3"/>
                    <g filter="url(#gmShadow)">
                      <path d="M29 184c3-38 25-59 61-59s58 21 61 59z" fill="url(#gmJacket)" stroke="#09110c" stroke-width="4"/>
                      <path d="M66 126l24 26 24-26 11 58H55z" fill="#e9eee7" stroke="#18261d" stroke-width="3"/>
                      <path d="M76 143l14 11 14-11-5 29H81z" fill="#b9f474" stroke="#315027" stroke-width="2.5"/>
                      <path d="M73 116v20c7 7 27 7 34 0v-20z" fill="#b87454" stroke="#683d2c" stroke-width="3"/>
                      <ellipse cx="90" cy="77" rx="39" ry="48" fill="url(#gmSkin)" stroke="#683d2c" stroke-width="4"/>
                      <path d="M51 70c-2-35 16-55 43-55 28 0 44 19 39 53-8-13-18-22-31-26-17 7-32 9-48 4-3 7-4 15-3 24z" fill="url(#gmHair)" stroke="#11120f" stroke-width="4" stroke-linejoin="round"/>
                      <path d="M57 55c13 4 29 1 45-8 12 5 21 13 29 25" fill="none" stroke="#6b5a49" stroke-opacity=".55" stroke-width="4" stroke-linecap="round"/>
                      <ellipse cx="51" cy="82" rx="7" ry="12" fill="#c78360" stroke="#683d2c" stroke-width="3"/>
                      <ellipse cx="129" cy="82" rx="7" ry="12" fill="#c78360" stroke="#683d2c" stroke-width="3"/>
                      <rect x="57" y="65" width="29" height="22" rx="9" fill="#f3f7ef" fill-opacity=".12" stroke="#18231b" stroke-width="4"/>
                      <rect x="94" y="65" width="29" height="22" rx="9" fill="#f3f7ef" fill-opacity=".12" stroke="#18231b" stroke-width="4"/>
                      <path d="M86 74h8M52 72l8-2M121 70l8 2" fill="none" stroke="#18231b" stroke-width="4" stroke-linecap="round"/>
                      <circle cx="73" cy="76" r="3.5" fill="#172019"/><circle cx="107" cy="76" r="3.5" fill="#172019"/>
                      <path d="M90 78l-4 15 8 1" fill="none" stroke="#8c513c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                      <path class="coach-mouth" d="M75 105q15 10 30 0" fill="none" stroke="#6a342d" stroke-width="4" stroke-linecap="round"/>
                      <path d="M63 95q27 17 54 0" fill="none" stroke="#4b2a24" stroke-opacity=".22" stroke-width="8" stroke-linecap="round"/>
                      <path d="M45 85c-1-25 4-42 17-52" fill="none" stroke="#24382b" stroke-width="7" stroke-linecap="round"/>
                      <circle cx="46" cy="89" r="12" fill="#22352a" stroke="#09110c" stroke-width="4"/>
                      <circle cx="46" cy="89" r="4" fill="#b9f474"/>
                      <path d="M45 100c7 4 13 7 19 12" fill="none" stroke="#263b2e" stroke-width="5" stroke-linecap="round"/>
                      <circle cx="126" cy="142" r="16" fill="#b9f474" stroke="#203621" stroke-width="3"/>
                      <path d="M119 151V132h8c7 0 11 3 11 9 0 5-4 8-10 8h-3v2zm6-7h3c3 0 4-1 4-3s-1-3-4-3h-3z" fill="#1a2b1c"/>
                    </g>
                    <g class="coach-sound-waves" fill="none" stroke="#b9f474" stroke-width="4" stroke-linecap="round">
                      <path class="coach-wave wave-one" d="M145 71q10 10 0 20"/>
                      <path class="coach-wave wave-two" d="M154 63q19 18 0 36"/>
                    </g>
                  </svg>
                </div>
                <div class="coach-avatar-visual coach-avatar-crest">
                  <svg viewBox="0 0 180 192" focusable="false" aria-hidden="true">
                    <defs>
                      <radialGradient id="crestBg" cx="35%" cy="25%" r="80%"><stop offset="0" stop-color="#4c704f"/><stop offset="1" stop-color="#09110c"/></radialGradient>
                      <linearGradient id="crestMetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6ffcf"/><stop offset=".45" stop-color="#b9f474"/><stop offset="1" stop-color="#5b8e3d"/></linearGradient>
                      <filter id="crestShadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="8" stdDeviation="7" flood-opacity=".55"/></filter>
                    </defs>
                    <circle cx="90" cy="91" r="78" fill="url(#crestBg)" stroke="#b9f474" stroke-opacity=".45" stroke-width="4"/>
                    <circle cx="90" cy="91" r="63" fill="none" stroke="#eef7de" stroke-opacity=".18" stroke-width="2"/>
                    <g filter="url(#crestShadow)" fill="url(#crestMetal)" stroke="#1b2d1c" stroke-width="5" stroke-linejoin="round">
                      <path d="M52 146c5-27 17-48 36-63-12-8-17-21-13-38 16 1 29-6 40-22 22 16 31 38 23 61-5 15-17 25-30 34h23l10 28z"/>
                      <path d="M69 146h73l8 18H57z"/>
                    </g>
                    <circle cx="108" cy="59" r="5" fill="#142116"/>
                    <path d="M83 84q21 8 38-4" fill="none" stroke="#1b2d1c" stroke-width="5" stroke-linecap="round"/>
                    <text x="90" y="181" text-anchor="middle" fill="#dff4c6" font-size="13" font-family="system-ui,sans-serif" font-weight="900" letter-spacing="3">COACH K</text>
                    <g class="coach-sound-waves" fill="none" stroke="#b9f474" stroke-width="4" stroke-linecap="round">
                      <path class="coach-wave wave-one" d="M145 71q10 10 0 20"/>
                      <path class="coach-wave wave-two" d="M154 63q19 18 0 36"/>
                    </g>
                  </svg>
                </div>
              </div>
              <div class="coach-identity">'''
index, avatar_count = old_avatar_pattern.subn(new_avatar, index, count=1)
if avatar_count != 1:
    raise SystemExit("Coach avatar block was not replaced")

rate_control = '''                <label class="coach-rate-wrap" for="coachRateRange"><span>Pace <b id="coachRateValue">0.92×</b></span><input id="coachRateRange" type="range" min="0.82" max="1.06" step="0.02" value="0.92"></label>'''
rate_with_avatar = rate_control + '''
                <label class="coach-avatar-select-wrap" for="coachAvatarSelect"><span>Coach look</span><select id="coachAvatarSelect" class="coach-voice-select"><option value="grandmaster">Grandmaster</option><option value="crest">Minimal crest</option><option value="none">Text only</option></select></label>'''
index = replace_once(index, rate_control, rate_with_avatar, "coach avatar selector")
index = index.replace('./styles-v7.css?v=22.0.0', './styles-v7.css?v=23.0.0')
index = index.replace('./app-v7.js?v=22.0.0', './app-v7.js?v=23.0.0')
write(index_path, index)


# -----------------------------------------------------------------------------
# Application: sound profiles, open-ended generator, engine move highlighting,
# avatar preference, and diagnostics.
# -----------------------------------------------------------------------------
app_path = ROOT / "app-v7-part1.txt"
app = read(app_path)

app = replace_once(app, "  sound: true,\n  trainingGoal:", "  sound: true,\n  soundTheme: 'soft',\n  trainingGoal:", "default sound theme")
app = replace_once(app, "  coachVoiceRate: 0.92,\n};", "  coachVoiceRate: 0.92,\n  coachAvatar: 'grandmaster',\n};", "default coach avatar")
app = replace_once(app, "let htmlMoveAudio = null;\nlet htmlMoveAudioStopTimer", "let htmlMoveAudio = null;\nlet htmlMoveAudioTheme = null;\nlet htmlMoveAudioStopTimer", "audio theme state")

old_sound_block = '''const SOUND_SPRITE_SEGMENTS = {
  move: { start: 0.08, duration: 0.46, volume: 0.98 },
  capture: { start: 0.70, duration: 0.62, volume: 1.00 },
  check: { start: 1.48, duration: 0.76, volume: 0.98 },
  win: { start: 2.48, duration: 1.00, volume: 0.96 },
  loss: { start: 3.75, duration: 0.94, volume: 0.95 },
  draw: { start: 4.95, duration: 0.76, volume: 0.94 },
  timeout: { start: 5.95, duration: 1.18, volume: 1.00 },
};
const SOUND_SPRITE_URL = new URL('./sounds/kmate-sounds-v21.wav?v=21.0.0', document.baseURI).href;
let soundAudiblyConfirmed = false;

function ensureHtmlMoveAudio() {
  if (htmlMoveAudio) return htmlMoveAudio;
  const audio = new Audio();
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.src = SOUND_SPRITE_URL;
  audio.volume = 0.94;
  htmlMoveAudio = audio;
  try { audio.load(); } catch {}
  return audio;
}'''
new_sound_block = '''const SOUND_SPRITE_SEGMENTS = {
  move: { start: 0.08, duration: 0.46, volume: 0.88 },
  capture: { start: 0.70, duration: 0.62, volume: 0.92 },
  check: { start: 1.48, duration: 0.76, volume: 0.90 },
  win: { start: 2.48, duration: 1.00, volume: 0.90 },
  loss: { start: 3.75, duration: 0.94, volume: 0.88 },
  draw: { start: 4.95, duration: 0.76, volume: 0.86 },
  timeout: { start: 5.95, duration: 1.18, volume: 0.94 },
};
const SOUND_THEME_LABELS = {
  soft: 'Soft wood',
  tournament: 'Tournament wood',
  minimal: 'Minimal click',
};
const SOUND_SPRITE_URLS = {
  soft: new URL('./sounds/kmate-soft-v23.wav?v=23.0.0', document.baseURI).href,
  tournament: new URL('./sounds/kmate-tournament-v23.wav?v=23.0.0', document.baseURI).href,
  minimal: new URL('./sounds/kmate-minimal-v23.wav?v=23.0.0', document.baseURI).href,
};
let soundAudiblyConfirmed = false;

function selectedSoundTheme() {
  return SOUND_SPRITE_URLS[settings.soundTheme] ? settings.soundTheme : 'soft';
}

function ensureHtmlMoveAudio() {
  const theme = selectedSoundTheme();
  if (htmlMoveAudio && htmlMoveAudioTheme === theme) return htmlMoveAudio;
  try { htmlMoveAudio?.pause(); } catch {}
  const audio = new Audio();
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.src = SOUND_SPRITE_URLS[theme];
  audio.volume = 0.90;
  htmlMoveAudio = audio;
  htmlMoveAudioTheme = theme;
  try { audio.load(); } catch {}
  return audio;
}'''
app = replace_once(app, old_sound_block, new_sound_block, "multi-profile sound block")

sound_handlers = '''
async function setSoundTheme(theme, preview = false) {
  settings.soundTheme = SOUND_SPRITE_URLS[theme] ? theme : 'soft';
  const select = $('#soundStyleSelect');
  if (select) select.value = settings.soundTheme;
  try { htmlMoveAudio?.pause(); } catch {}
  htmlMoveAudio = null;
  htmlMoveAudioTheme = null;
  htmlAudioUnlocked = false;
  soundAudiblyConfirmed = false;
  soundPlaybackBackend = 'not-unlocked';
  saveStore();
  updateSoundToggle();
  if (preview && soundEnabled()) {
    const unlocked = await unlockMoveAudio(true);
    if (unlocked) toast(`${SOUND_THEME_LABELS[settings.soundTheme]} selected`);
  }
}

function handleSoundThemeChange(event) {
  setSoundTheme(event?.target?.value || 'soft', true);
}

function previewSoundTheme() {
  setSoundTheme($('#soundStyleSelect')?.value || selectedSoundTheme(), true);
}

'''
app = replace_once(app, "function canonicalShareUrl() {", sound_handlers + "function canonicalShareUrl() {", "sound profile handlers")
app = app.replace("url.search = '?v=20260828-22';", "url.search = '?v=20260828-23';", 1)

app = replace_once(
    app,
    "  if ($('#autoHints')) $('#autoHints').checked = Boolean(settings.autoHints);\n  updateControls(false);",
    "  if ($('#autoHints')) $('#autoHints').checked = Boolean(settings.autoHints);\n  if ($('#soundStyleSelect')) $('#soundStyleSelect').value = selectedSoundTheme();\n  updateControls(false);",
    "apply sound control",
)
app = replace_once(
    app,
    "  settings.autoHints = Boolean($('#autoHints')?.checked);\n  $('#positionValue').textContent",
    "  settings.autoHints = Boolean($('#autoHints')?.checked);\n  settings.soundTheme = $('#soundStyleSelect')?.value || settings.soundTheme || 'soft';\n  $('#positionValue').textContent",
    "persist sound control",
)

app = replace_once(
    app,
    "  const count = usablePool.length;\n  $('#openingCount').textContent = `∞ generated · ${count} curated seed${count === 1 ? '' : 's'}`;",
    "  const count = usablePool.length;\n  const localBranches = Array.isArray(genTree) ? genTree.filter((item) => item.phase === settings.phase && (settings.opening === 'all' || item.opening === settings.opening)).length : 0;\n  $('#openingCount').textContent = `∞ stream · ${count} seed${count === 1 ? '' : 's'} · ${localBranches} branches`;",
    "open-ended generator count",
)
app = replace_once(
    app,
    "      ? `Fresh ${phaseLabel(settings.phase).toLowerCase()} practice near ${settings.positionRating}, filtered for ${goal.label.toLowerCase()}.`\n      : `Uses the nearest curated anchors (${ratings.join(' or ')}) and applies a legal quality-gated continuation.`;",
    "      ? `Open-ended ${phaseLabel(settings.phase).toLowerCase()} stream near ${settings.positionRating}; recent and near-identical boards are rejected.`\n      : `Branches from the nearest anchors (${ratings.join(' or ')}) and expands its local position tree after every accepted position.`;",
    "generator description",
)

new_generator = r'''const GEN_KEY = 'kmate-generated-v23';
const GEN_TREE_KEY = 'kmate-generation-tree-v23';
const GEN_COUNTER_KEY = 'kmate-generation-counter-v23';
const GEN_LIMIT = 2200;
const GEN_TREE_LIMIT = 420;
let genSeen;
let genTree;
let generationCounter = 0;
let lastGenerationMeta = null;
try {
  const saved = JSON.parse(localStorage.getItem(GEN_KEY) || '[]');
  genSeen = Array.isArray(saved) ? saved.slice(0, GEN_LIMIT) : [];
} catch { genSeen = []; }
try {
  const saved = JSON.parse(localStorage.getItem(GEN_TREE_KEY) || '[]');
  genTree = Array.isArray(saved)
    ? saved.filter((item) => item?.fen && item?.seedId && item?.phase).slice(0, GEN_TREE_LIMIT)
    : [];
} catch { genTree = []; }
try { generationCounter = Number(localStorage.getItem(GEN_COUNTER_KEY)) || 0; } catch {}

function randomFloat() {
  try {
    const values = new Uint32Array(1);
    window.crypto?.getRandomValues(values);
    return values[0] / 4294967296;
  } catch { return Math.random(); }
}
function randomInt(min, max) { return min + Math.floor(randomFloat() * (max - min + 1)); }
function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = randomInt(0, index);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
function shortFen(fen) { return String(fen).split(/\s+/).slice(0, 4).join(' '); }
function expandedPlacement(fen) {
  const placement = String(fen || '').split(/\s+/)[0] || '';
  let output = '';
  for (const char of placement) {
    if (char === '/') continue;
    if (/\d/.test(char)) output += '.'.repeat(Number(char));
    else output += char;
  }
  return output.padEnd(64, '.').slice(0, 64);
}
function positionDistance(firstFen, secondFen) {
  const first = expandedPlacement(firstFen);
  const second = expandedPlacement(secondFen);
  let distance = 0;
  for (let index = 0; index < 64; index += 1) if (first[index] !== second[index]) distance += 1;
  return distance;
}
function rememberFen(fen) {
  const key = shortFen(fen);
  genSeen = [key, ...genSeen.filter((item) => item !== key)].slice(0, GEN_LIMIT);
  try { localStorage.setItem(GEN_KEY, JSON.stringify(genSeen)); } catch {}
}
function rememberGeneratedPosition(position) {
  const record = {
    id: position.id,
    fen: position.fen,
    seedId: position.seedId,
    phase: position.phase,
    opening: position.opening,
    rating: position.rating,
    tags: [...(position.tags || [])],
    title: position.title,
    depth: Number(position.branchDepth) || Number(position.variationPlies) || 0,
  };
  genTree = [record, ...genTree.filter((item) => shortFen(item.fen) !== shortFen(record.fen))].slice(0, GEN_TREE_LIMIT);
  try {
    localStorage.setItem(GEN_TREE_KEY, JSON.stringify(genTree));
    localStorage.setItem(GEN_COUNTER_KEY, String(generationCounter));
  } catch {}
}
function recentlyTooSimilar(fen) {
  const exact = shortFen(fen);
  const minimumDistance = settings.phase === 'endgame' ? 3 : 5;
  for (const recent of genSeen.slice(0, 110)) {
    if (recent === exact) return true;
    if (positionDistance(recent, exact) < minimumDistance) return true;
  }
  return false;
}
function materialInfo(g) {
  const x = { pieces: 0, queens: 0 };
  g.board().forEach((row) => row.forEach((piece) => {
    if (!piece) return;
    x.pieces += 1;
    if (piece.type === 'q') x.queens += 1;
  }));
  return x;
}
function phaseFits(g, phase) {
  if (g.isGameOver() || g.moves().length < (phase === 'endgame' ? 2 : 5)) return false;
  const x = materialInfo(g);
  if (phase === 'middlegame') return x.pieces >= 18 && x.queens >= 1;
  if (phase === 'late-middlegame') return x.pieces >= 12 && x.pieces <= 25;
  return x.pieces <= 20;
}
function quickEval(g, color, phase) {
  if (g.isCheckmate()) return g.turn() === color ? -99999 : 99999;
  if (g.isDraw()) return 0;
  const values = { p: 100, n: 320, b: 335, r: 510, q: 930, k: 0 };
  let score = 0;
  g.board().forEach((row, rank) => row.forEach((piece, file) => {
    if (!piece) return;
    const sign = piece.color === color ? 1 : -1;
    const center = 7 - (Math.abs(3.5 - file) + Math.abs(3.5 - rank));
    let value = values[piece.type];
    if (piece.type === 'p') value += (piece.color === 'w' ? 6 - rank : rank - 1) * (phase === 'endgame' ? 13 : 7);
    if (piece.type === 'n' || piece.type === 'b') value += Math.max(0, center * 4);
    if (piece.type === 'k' && phase === 'endgame') value += Math.max(0, center * 7);
    score += sign * value;
  }));
  if (g.isCheck()) score += g.turn() === color ? -24 : 24;
  return score;
}
function movePriority(move) {
  const values = { p: 100, n: 320, b: 335, r: 510, q: 930, k: 0 };
  return (move.captured ? values[move.captured] + 50 : 0)
    + (move.promotion ? values[move.promotion] + 250 : 0)
    + (move.san?.includes('#') ? 99999 : move.san?.includes('+') ? 80 : 0);
}
function generatedMove(g, rating, phase) {
  const color = g.turn();
  const allMoves = g.moves({ verbose: true });
  if (!allMoves.length) return null;
  const ordered = allMoves.slice().sort((a, b) => movePriority(b) - movePriority(a));
  const candidates = [...ordered.slice(0, 12), ...shuffled(ordered.slice(12)).slice(0, 7)];
  const scored = candidates.map((move) => {
    g.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    let score = quickEval(g, color, phase) + movePriority(move) * 0.10;
    if (!g.isGameOver()) {
      const replies = g.moves({ verbose: true })
        .sort((a, b) => movePriority(b) - movePriority(a))
        .slice(0, rating >= 1800 ? 4 : 3);
      let worst = Infinity;
      for (const reply of replies) {
        g.move({ from: reply.from, to: reply.to, promotion: reply.promotion || 'q' });
        worst = Math.min(worst, quickEval(g, color, phase));
        g.undo();
      }
      if (Number.isFinite(worst)) score = score * 0.42 + worst * 0.58;
    }
    g.undo();
    return { move, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  const window = rating >= 1900 ? 165 : rating >= 1600 ? 215 : 290;
  const viable = scored.filter((item) => item.score >= best - window).slice(0, phase === 'endgame' ? 9 : 11);
  const temperature = rating >= 1900 ? 105 : rating >= 1600 ? 145 : 190;
  const weights = viable.map((item) => Math.exp((item.score - best) / temperature) * (0.84 + randomFloat() * 0.32));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  let target = randomFloat() * total;
  for (let index = 0; index < viable.length; index += 1) {
    target -= weights[index];
    if (target <= 0) return viable[index].move;
  }
  return viable.at(-1)?.move || ordered[0];
}
function materialPointBalance(g) {
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const totals = { w: 0, b: 0 };
  g.board().forEach((row) => row.forEach((piece) => {
    if (piece) totals[piece.color] += values[piece.type] || 0;
  }));
  return totals.w - totals.b;
}
function positionPassesQualityGate(g, phase, goalKey) {
  if (!phaseFits(g, phase)) return false;
  const legalCount = g.moves().length;
  if (legalCount < (phase === 'endgame' ? 2 : 5)) return false;
  const imbalance = Math.abs(materialPointBalance(g));
  const tolerance = ['convert', 'defend'].includes(goalKey) ? 6 : 4;
  if (imbalance > tolerance) return false;
  const evaluation = Math.abs(quickEval(g, 'w', phase));
  return evaluation < (['convert', 'defend'].includes(goalKey) ? 900 : 650);
}
function candidatePositions() {
  let pool = validPositions.filter((position) => position.phase === settings.phase);
  if (settings.phase !== 'endgame' && settings.opening !== 'all') {
    const openingPool = pool.filter((position) => position.opening === settings.opening);
    if (openingPool.length) pool = openingPool;
  }
  const goal = TRAINING_GOALS[settings.trainingGoal] || TRAINING_GOALS.all;
  if (settings.trainingGoal !== 'all') {
    const goalPool = pool.filter((position) => (position.tags || []).some((tag) => goal.tags?.includes(tag)));
    if (goalPool.length) pool = goalPool;
  }
  return pool;
}
function generationRoots(anchors) {
  const anchorIds = new Set(anchors.map((anchor) => anchor.id));
  const descendants = genTree
    .filter((item) => item.phase === settings.phase)
    .filter((item) => settings.opening === 'all' || item.opening === settings.opening)
    .filter((item) => Math.abs((Number(item.rating) || settings.positionRating) - settings.positionRating) <= 300)
    .filter((item) => Number(item.depth) < 30)
    .filter((item) => settings.opening === 'all' || anchorIds.has(item.seedId))
    .map((item) => {
      const seed = validPositions.find((position) => position.id === item.seedId);
      if (!seed) return null;
      return {
        ...seed,
        id: item.id,
        fen: item.fen,
        title: item.title || seed.title,
        seedId: item.seedId,
        generationDepth: Number(item.depth) || 0,
        generatedRoot: true,
      };
    })
    .filter(Boolean);
  return { anchors, descendants };
}
function chooseGenerationRoot(anchors) {
  const roots = generationRoots(anchors);
  const useDescendant = roots.descendants.length && randomFloat() < 0.44;
  let pool = useDescendant ? roots.descendants : roots.anchors;
  if (current?.fen && pool.length > 1) {
    const withoutCurrent = pool.filter((item) => shortFen(item.fen) !== shortFen(current.fen));
    if (withoutCurrent.length) pool = withoutCurrent;
  }
  return pool[randomInt(0, Math.max(0, pool.length - 1))] || anchors[0];
}
function buildGeneratedPosition(root, fen, line, strictGate) {
  const seedId = root.seedId || root.id;
  const seed = validPositions.find((position) => position.id === seedId) || root;
  generationCounter += 1;
  const code = generationCounter.toString(36).toUpperCase().padStart(4, '0');
  const branchDepth = (Number(root.generationDepth) || 0) + line.length;
  const position = {
    ...seed,
    id: `generated-${seed.id}-${Date.now()}-${code}`,
    seedId: seed.id,
    generated: true,
    variationPlies: line.length,
    branchDepth,
    branchCode: code,
    variation: line,
    fen,
    rating: settings.positionRating,
    title: `${seed.opening === 'Various' ? seed.title : seed.opening} · Variation ${code}`,
    description: `${strictGate ? 'Quality-gated' : 'Diversity-gated'} open-ended branch from “${seed.title}.” K-Mate explored ${line.length} new plies (branch depth ${branchDepth}) and rejected exact or near-identical recent boards.`,
  };
  rememberFen(fen);
  rememberGeneratedPosition(position);
  lastGenerationMeta = {
    code,
    seedId: seed.id,
    branchDepth,
    variationPlies: line.length,
    source: root.generatedRoot ? 'expanded local branch' : 'curated seed',
    strictGate,
  };
  return position;
}
function freshPosition() {
  let anchors = candidatePositions();
  if (!anchors.length) anchors = validPositions.filter((position) => position.phase === settings.phase);
  if (!anchors.length) anchors = validPositions;
  const nearest = Math.min(...anchors.map((position) => Math.abs(position.rating - settings.positionRating)));
  let pool = anchors.filter((position) => Math.abs(position.rating - settings.positionRating) <= Math.max(200, nearest));
  if (current?.seedId && pool.length > 1 && randomFloat() < 0.72) {
    const alternate = pool.filter((position) => position.id !== current.seedId);
    if (alternate.length) pool = alternate;
  }

  const deadline = performance.now() + 460;
  let bestRelaxed = null;
  for (let attempt = 0; attempt < 56; attempt += 1) {
    if (attempt > 12 && performance.now() > deadline && bestRelaxed) break;
    const root = chooseGenerationRoot(pool);
    if (!root) break;
    const rootDepth = Number(root.generationDepth) || 0;
    const ranges = settings.phase === 'endgame'
      ? [4, Math.max(7, Math.min(20, 32 - rootDepth))]
      : settings.phase === 'late-middlegame'
        ? [5, Math.max(8, Math.min(18, 30 - rootDepth))]
        : [6, Math.max(9, Math.min(17, 28 - rootDepth))];
    const targetPlies = randomInt(ranges[0], Math.max(ranges[0], ranges[1]));
    const g = new Chess(root.fen);
    const line = [];
    for (let ply = 0; ply < targetPlies && !g.isGameOver(); ply += 1) {
      const jitter = Math.round((randomFloat() - 0.5) * 360);
      const move = generatedMove(g, Math.max(1200, Math.min(2200, settings.positionRating + jitter)), settings.phase);
      if (!move) break;
      const applied = g.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
      if (!applied) break;
      line.push(applied.san);
      if (line.length >= ranges[0] && !phaseFits(g, settings.phase)) {
        g.undo();
        line.pop();
        break;
      }
    }
    const fen = g.fen();
    const exactSeen = genSeen.includes(shortFen(fen));
    const rootDistance = positionDistance(root.fen, fen);
    const currentDistance = current?.fen ? positionDistance(current.fen, fen) : 64;
    const strictGate = positionPassesQualityGate(g, settings.phase, settings.trainingGoal);
    const relaxedGate = phaseFits(g, settings.phase) && Math.abs(materialPointBalance(g)) <= 7;
    const minimumRootDistance = settings.phase === 'endgame' ? 3 : 5;
    const minimumCurrentDistance = settings.phase === 'endgame' ? 3 : 5;
    const noveltyScore = rootDistance * 2 + currentDistance + line.length * 0.7 - Math.abs(quickEval(g, 'w', settings.phase)) / 150 + randomFloat();
    if (!exactSeen && relaxedGate && rootDistance >= 2 && (!bestRelaxed || noveltyScore > bestRelaxed.score)) {
      bestRelaxed = { root, fen, line, score: noveltyScore };
    }
    if (!exactSeen && !recentlyTooSimilar(fen) && strictGate && rootDistance >= minimumRootDistance && currentDistance >= minimumCurrentDistance) {
      return buildGeneratedPosition(root, fen, line, true);
    }
  }
  if (bestRelaxed) return buildGeneratedPosition(bestRelaxed.root, bestRelaxed.fen, bestRelaxed.line, false);

  // Last-resort legal branching still avoids returning the exact same seed board.
  for (let rescue = 0; rescue < 14; rescue += 1) {
    const root = chooseGenerationRoot(pool);
    const g = new Chess(root.fen);
    const line = [];
    for (let ply = 0; ply < randomInt(3, 8) && !g.isGameOver(); ply += 1) {
      const move = generatedMove(g, 1500, settings.phase);
      if (!move) break;
      const applied = g.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
      if (!applied) break;
      line.push(applied.san);
    }
    if (line.length && phaseFits(g, settings.phase) && !genSeen.includes(shortFen(g.fen()))) {
      return buildGeneratedPosition(root, g.fen(), line, false);
    }
  }
  const anchor = pool[randomInt(0, Math.max(0, pool.length - 1))];
  lastGenerationMeta = { seedId: anchor?.id || null, strictGate: false, fallback: true };
  return { ...anchor, id: `fallback-${anchor.id}-${Date.now()}`, seedId: anchor.id, generated: false, variationPlies: 0, rating: settings.positionRating };
}
function pickPosition() {
  if (queuedCustomPosition) {
    const position = queuedCustomPosition;
    queuedCustomPosition = null;
    return position;
  }
  return freshPosition();
}'''

generator_pattern = re.compile(
    r"const GEN_KEY = 'kmate-generated-v8';.*?function pickPosition\(\) \{\n  if \(queuedCustomPosition\) \{\n    const position = queuedCustomPosition;\n    queuedCustomPosition = null;\n    return position;\n  \}\n  return freshPosition\(\);\n\}",
    re.S,
)
app, generator_count = generator_pattern.subn(new_generator, app, count=1)
if generator_count != 1:
    raise SystemExit("Open-ended generator block was not replaced")

app = replace_once(
    app,
    "  $('#gameMeta').textContent = current.custom ? `${phaseLabel(current.phase)} · imported position` : `${phaseLabel(current.phase)} · ${current.opening} · curated variation`;\n  $('#positionBadge').textContent = current.custom ? 'Your position' : `${current.rating} level · quality-gated`;",
    "  $('#gameMeta').textContent = current.custom ? `${phaseLabel(current.phase)} · imported position` : `${phaseLabel(current.phase)} · ${current.opening} · ${current.generated ? 'open-ended branch' : 'curated seed'}`;\n  $('#positionBadge').textContent = current.custom ? 'Your position' : current.generated ? `${current.rating} level · variation ${current.branchCode || 'new'}` : `${current.rating} level · curated seed`;",
    "generated position metadata",
)
app = replace_once(
    app,
    "  $('#positionTags').innerHTML = [...(current.tags || []), current.custom ? 'your own game' : 'curated seed'].map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');",
    "  $('#positionTags').innerHTML = [...(current.tags || []), current.custom ? 'your own game' : current.generated ? 'open-ended branch' : 'curated seed'].map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');",
    "generated position tag",
)

# Distinguish the user's move from the engine reply.
old_last_move = "  lastMove = { from: move.from, to: move.to };"
app = replace_once(app, old_last_move, "  lastMove = { from: move.from, to: move.to, actor: 'user', san: move.san };", "user last move actor")
app = replace_once(app, old_last_move, "  lastMove = { from: move.from, to: move.to, actor: 'engine', san: move.san };", "engine last move actor")
app = replace_once(
    app,
    "  setStatus(game.isCheck() ? 'Check—your king is under attack.' : 'Your move. Build the position one decision at a time.');",
    "  setStatus(game.isCheck() ? `Engine played ${move.san}: check—your king is under attack.` : `Engine played ${move.san}. Your move.`);",
    "engine move status",
)
app = replace_once(
    app,
    "    if (lastMove && (lastMove.from === square || lastMove.to === square)) button.classList.add('last');",
    "    if (lastMove && (lastMove.from === square || lastMove.to === square)) {\n      const actor = lastMove.actor || 'user';\n      button.classList.add('last', `last-${actor}`, square === lastMove.from ? 'last-from' : 'last-to');\n      button.dataset.lastActor = actor;\n    }",
    "last-move board classes",
)
app = replace_once(
    app,
    "    button.setAttribute('aria-label', `${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ' empty'}`);\n\n    if (piece) {",
    "    button.setAttribute('aria-label', `${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ' empty'}`);\n\n    if (lastMove?.actor === 'engine' && lastMove.to === square) {\n      const marker = document.createElement('span');\n      marker.className = 'engine-last-marker';\n      marker.textContent = 'AI';\n      marker.setAttribute('aria-hidden', 'true');\n      button.append(marker);\n    }\n\n    if (piece) {",
    "engine destination marker",
)

avatar_functions = '''function updateCoachAvatarControls() {
  const style = ['grandmaster', 'crest', 'none'].includes(settings.coachAvatar) ? settings.coachAvatar : 'grandmaster';
  settings.coachAvatar = style;
  const avatar = $('#coachAvatar');
  const select = $('#coachAvatarSelect');
  const card = $('#replayCoachCard');
  if (avatar) avatar.dataset.style = style;
  if (select) select.value = style;
  card?.classList.toggle('avatar-hidden', style === 'none');
}

function handleCoachAvatarChange(event) {
  settings.coachAvatar = event?.target?.value || 'grandmaster';
  saveStore();
  updateCoachAvatarControls();
}

'''
app = replace_once(app, "function updateCoachVoiceControls() {", avatar_functions + "function updateCoachVoiceControls() {", "coach avatar controls")
app = replace_once(app, "  populateCoachVoiceSelect();\n  toggle.disabled", "  populateCoachVoiceSelect();\n  updateCoachAvatarControls();\n  toggle.disabled", "refresh coach avatar")

write(app_path, app)


# -----------------------------------------------------------------------------
# Bindings, state diagnostics, and browser-test helpers.
# -----------------------------------------------------------------------------
part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = replace_once(
    part6,
    "  $('#coachVoiceSelect')?.addEventListener('change', handleCoachVoiceSelect);\n  $('#coachRateRange')?.addEventListener('input', handleCoachRateChange);",
    "  $('#coachVoiceSelect')?.addEventListener('change', handleCoachVoiceSelect);\n  $('#coachRateRange')?.addEventListener('input', handleCoachRateChange);\n  $('#coachAvatarSelect')?.addEventListener('change', handleCoachAvatarChange);\n  $('#soundStyleSelect')?.addEventListener('change', handleSoundThemeChange);\n  $('#previewSoundButton')?.addEventListener('click', previewSoundTheme);",
    "new preference bindings",
)
part6 = part6.replace("version: '22.0-commercial-beta'", "version: '23.0-commercial-beta'", 1)
part6 = replace_once(
    part6,
    "    recentGenerated: genSeen.length,\n    fen:",
    "    recentGenerated: genSeen.length,\n    generator: { mode: 'open-ended branch tree', branches: genTree.length, counter: generationCounter, last: lastGenerationMeta ? { ...lastGenerationMeta } : null },\n    fen:",
    "generator diagnostics",
)
part6 = replace_once(
    part6,
    "    turn: game?.turn() || null,\n    clocks:",
    "    turn: game?.turn() || null,\n    lastMove: lastMove ? { ...lastMove } : null,\n    clocks:",
    "last move diagnostics",
)
part6 = replace_once(
    part6,
    "resolvedVoice: chooseCoachVoice()?.name || null, voiceURI: settings.coachVoiceURI || 'auto', rate: Number(settings.coachVoiceRate) || 0.92 }",
    "resolvedVoice: chooseCoachVoice()?.name || null, voiceURI: settings.coachVoiceURI || 'auto', rate: Number(settings.coachVoiceRate) || 0.92, avatar: settings.coachAvatar || 'grandmaster' }",
    "avatar state",
)
part6 = replace_once(
    part6,
    "    sound: { enabled: soundEnabled(), unlocked: htmlAudioUnlocked, audibleConfirmed: soundAudiblyConfirmed, backend: soundPlaybackBackend, lastKind: lastSoundKind },",
    "    sound: { enabled: soundEnabled(), theme: selectedSoundTheme(), unlocked: htmlAudioUnlocked, audibleConfirmed: soundAudiblyConfirmed, backend: soundPlaybackBackend, lastKind: lastSoundKind },",
    "sound theme state",
)
part6 = replace_once(
    part6,
    "    firstLegalDrag: () => {\n      if (!game || finalized || thinking || game.turn() !== userColor) return null;\n      const move = game.moves({ verbose: true }).find((candidate) => candidate.color === userColor && !candidate.promotion);\n      return move ? { from: move.from, to: move.to } : null;\n    },",
    "    firstLegalDrag: () => {\n      if (!game || finalized || thinking || game.turn() !== userColor) return null;\n      const move = game.moves({ verbose: true }).find((candidate) => candidate.color === userColor && !candidate.promotion);\n      return move ? { from: move.from, to: move.to } : null;\n    },\n    sampleGenerated: (count = 24) => Array.from({ length: Math.max(1, Math.min(60, Number(count) || 24)) }, () => {\n      const position = freshPosition();\n      return { fen: position.fen, id: position.id, seedId: position.seedId, branchDepth: position.branchDepth || 0, generated: Boolean(position.generated) };\n    }),",
    "generator test helper",
)
write(part6_path, part6)


# -----------------------------------------------------------------------------
# CSS: stronger engine reply trail, sound controls, and refined avatar options.
# -----------------------------------------------------------------------------
styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v23 — sound profiles, refined Coach K, and engine reply trail */
.sound-style-head{align-items:center}
.sound-preview{min-height:31px;padding:0 11px;border:1px solid #b9f47445;border-radius:10px;background:#b9f47410;color:var(--accent);font-size:11px;font-weight:900;cursor:pointer}
.sound-preview:active{transform:scale(.97)}

.sq.last.last-user{box-shadow:inset 0 0 0 999px #f4cc7138}
.sq.last.last-user.last-to{box-shadow:inset 0 0 0 4px #f4cc70cc,inset 0 0 0 999px #f4cc7138}
.sq.last.last-engine{box-shadow:inset 0 0 0 999px #2d9fd43d!important}
.sq.last.last-engine.last-from{box-shadow:inset 0 0 0 4px #75d6ffcc,inset 0 0 0 999px #287fa339!important}
.sq.last.last-engine.last-to{z-index:4;box-shadow:inset 0 0 0 6px #5bd4ff,inset 0 0 0 999px #168ec655,0 0 18px #43cfff9c!important;animation:engineLandingV23 .72s ease-out}
.engine-last-marker{position:absolute;right:4px;top:4px;z-index:8;display:grid;place-items:center;min-width:22px;height:18px;padding:0 5px;border:1px solid #c7f1ff99;border-radius:99px;background:#075f85e8;color:#e7faff;font:950 8px/1 system-ui,sans-serif;letter-spacing:.06em;box-shadow:0 3px 10px #00364d99;pointer-events:none}
@keyframes engineLandingV23{0%{filter:brightness(1.55);transform:scale(.96)}55%{filter:brightness(1.15);transform:scale(1.015)}100%{filter:none;transform:none}}

.coach-avatar-visual{display:none;width:100%;height:100%}
.coach-avatar-visual svg{display:block;width:100%;height:100%}
.coach-avatar[data-style="grandmaster"] .coach-avatar-grandmaster{display:block}
.coach-avatar[data-style="crest"] .coach-avatar-crest{display:block}
.replay-coach-card.avatar-hidden .coach-avatar-column{display:none}
.replay-coach-card.avatar-hidden .coach-stage{grid-template-columns:minmax(0,1fr)}
.coach-avatar-select-wrap{display:grid;gap:3px;min-width:0;color:var(--muted);font-size:8px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}
.coach-voice-settings{grid-template-columns:minmax(0,1.15fr) 88px minmax(92px,.72fr)}
.coach-avatar-grandmaster .coach-mouth{transform-origin:90px 105px}
.coach-avatar.speaking .coach-avatar-grandmaster .coach-mouth{animation:coachHumanTalk .22s infinite alternate}
.coach-avatar.speaking .coach-avatar-crest{animation:coachCrestSpeak .7s ease-in-out infinite alternate}
@keyframes coachHumanTalk{to{transform:scaleY(1.45) translateY(1px)}}
@keyframes coachCrestSpeak{to{filter:drop-shadow(0 0 11px #b9f47499);transform:translateY(-2px)}}

@media(max-width:760px){
  .coach-voice-settings{grid-template-columns:minmax(0,1fr) 72px minmax(76px,.8fr);gap:4px}
  .coach-avatar-select-wrap{font-size:6.5px}
  .engine-last-marker{right:2px;top:2px;min-width:18px;height:15px;padding:0 3px;font-size:6.5px}
  .sq.last.last-engine.last-to{box-shadow:inset 0 0 0 4px #5bd4ff,inset 0 0 0 999px #168ec655,0 0 12px #43cfff88!important}
}
'''
write(styles_path, styles)


# -----------------------------------------------------------------------------
# Cache-bust the module loader.
# -----------------------------------------------------------------------------
loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+(?:\.\d+){2}", "positions-v7.js?v=23.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+(?:\.\d+){2}", "app-v7-part${number}.txt?v=23.0.0", loader)
write(loader_path, loader)


# -----------------------------------------------------------------------------
# Generate three original, understated acoustic sound sprites with identical
# timing so the browser can switch profiles without changing segment metadata.
# -----------------------------------------------------------------------------
SAMPLE_RATE = 32000
TOTAL_SECONDS = 7.35
SEGMENTS = {
    "move": 0.08,
    "capture": 0.70,
    "check": 1.48,
    "win": 2.48,
    "loss": 3.75,
    "draw": 4.95,
    "timeout": 5.95,
}


def add_wood_knock(buffer: list[float], at: float, *, amplitude: float, body_hz: float, decay: float, brightness: float, seed: int) -> None:
    rng = random.Random(seed)
    duration = min(0.42, decay * 7.5)
    start = int(at * SAMPLE_RATE)
    count = int(duration * SAMPLE_RATE)
    phases = [rng.random() * math.tau for _ in range(5)]
    modes = [body_hz, body_hz * 1.84, body_hz * 2.63, body_hz * 3.77, body_hz * 5.15]
    mode_gains = [0.54, 0.25, 0.13, 0.06, 0.025]
    last_noise = 0.0
    for index in range(count):
        target = start + index
        if target >= len(buffer):
            break
        time = index / SAMPLE_RATE
        envelope = math.exp(-time / decay)
        resonance = sum(gain * math.sin(math.tau * frequency * time + phase) for gain, frequency, phase in zip(mode_gains, modes, phases))
        raw_noise = rng.uniform(-1.0, 1.0)
        last_noise = last_noise * 0.74 + raw_noise * 0.26
        transient = last_noise * math.exp(-time / max(0.004, decay * 0.17)) * brightness
        contact = math.exp(-time * 520.0) * math.sin(math.tau * (body_hz * 7.2) * time) * 0.22
        buffer[target] += amplitude * (resonance * envelope + transient + contact)


def add_muted_tone(buffer: list[float], at: float, *, amplitude: float, frequency: float, duration: float, downward: float = 0.0) -> None:
    start = int(at * SAMPLE_RATE)
    count = int(duration * SAMPLE_RATE)
    for index in range(count):
        target = start + index
        if target >= len(buffer):
            break
        time = index / SAMPLE_RATE
        envelope = math.sin(math.pi * min(1.0, time / max(0.001, duration))) ** 1.7
        envelope *= math.exp(-time / max(0.03, duration * 0.52))
        instantaneous = max(45.0, frequency - downward * time)
        buffer[target] += amplitude * envelope * (math.sin(math.tau * instantaneous * time) + 0.22 * math.sin(math.tau * instantaneous * 2.01 * time))


def make_sprite(style: str) -> list[float]:
    buffer = [0.0] * int(SAMPLE_RATE * TOTAL_SECONDS)
    if style == "soft":
        amp, body, decay, bright = 0.52, 180.0, 0.055, 0.20
    elif style == "tournament":
        amp, body, decay, bright = 0.66, 235.0, 0.042, 0.39
    else:
        amp, body, decay, bright = 0.36, 315.0, 0.024, 0.16

    add_wood_knock(buffer, SEGMENTS["move"], amplitude=amp, body_hz=body, decay=decay, brightness=bright, seed=11)

    add_wood_knock(buffer, SEGMENTS["capture"], amplitude=amp * 0.46, body_hz=body * 1.08, decay=decay * 0.78, brightness=bright, seed=21)
    add_wood_knock(buffer, SEGMENTS["capture"] + 0.105, amplitude=amp * 1.04, body_hz=body * 0.82, decay=decay * 1.18, brightness=bright * 1.08, seed=22)

    add_wood_knock(buffer, SEGMENTS["check"], amplitude=amp * 0.88, body_hz=body * 1.04, decay=decay, brightness=bright, seed=31)
    add_wood_knock(buffer, SEGMENTS["check"] + 0.16, amplitude=amp * 0.52, body_hz=body * 1.42, decay=decay * 0.70, brightness=bright * 0.82, seed=32)

    for offset, ratio in [(0.00, 1.0), (0.15, 1.18), (0.31, 1.42)]:
        add_wood_knock(buffer, SEGMENTS["win"] + offset, amplitude=amp * 0.48, body_hz=body * ratio, decay=decay * 1.18, brightness=bright * 0.65, seed=40 + int(offset * 100))
    add_muted_tone(buffer, SEGMENTS["win"] + 0.12, amplitude=0.07 if style != "minimal" else 0.035, frequency=392, duration=0.45)

    add_wood_knock(buffer, SEGMENTS["loss"], amplitude=amp * 0.56, body_hz=body * 0.82, decay=decay * 1.32, brightness=bright * 0.55, seed=51)
    add_wood_knock(buffer, SEGMENTS["loss"] + 0.22, amplitude=amp * 0.43, body_hz=body * 0.66, decay=decay * 1.42, brightness=bright * 0.45, seed=52)

    add_wood_knock(buffer, SEGMENTS["draw"], amplitude=amp * 0.46, body_hz=body * 0.94, decay=decay, brightness=bright * 0.62, seed=61)
    add_wood_knock(buffer, SEGMENTS["draw"] + 0.18, amplitude=amp * 0.46, body_hz=body * 1.06, decay=decay, brightness=bright * 0.62, seed=62)

    for tick in range(4):
        add_wood_knock(buffer, SEGMENTS["timeout"] + tick * 0.15, amplitude=amp * 0.33, body_hz=body * 1.65, decay=decay * 0.48, brightness=bright * 1.15, seed=70 + tick)
    add_wood_knock(buffer, SEGMENTS["timeout"] + 0.64, amplitude=amp * 0.72, body_hz=body * 0.66, decay=decay * 1.35, brightness=bright * 0.48, seed=79)

    peak = max(0.001, max(abs(sample) for sample in buffer))
    scale = 0.86 / peak
    return [max(-0.96, min(0.96, sample * scale)) for sample in buffer]


def write_wav(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = array("h", (int(sample * 32767) for sample in samples))
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(pcm.tobytes())


for sound_style in ("soft", "tournament", "minimal"):
    write_wav(ROOT / "sounds" / f"kmate-{sound_style}-v23.wav", make_sprite(sound_style))
