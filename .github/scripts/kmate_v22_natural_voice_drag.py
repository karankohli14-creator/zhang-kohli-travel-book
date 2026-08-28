from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker: {label}")
    return text.replace(old, new, 1)


def sub_once(pattern: str, replacement: str, text: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Expected one replacement for {label}, found {count}")
    return updated


# -----------------------------------------------------------------------------
# HTML: natural voice selector, pace control, honest own-voice explanation.
# -----------------------------------------------------------------------------
index_path = "kmate-trainer/index.html"
index = read(index_path)

old_voice_row = '''              <div class="coach-voice-row">
                <button class="coach-voice-button active" id="coachVoiceToggle" type="button">🔊 Voice on</button>
                <button class="coach-voice-button" id="coachSpeakButton" type="button">▶ Speak</button>
              </div>
              <h2 id="replayCoachTitle">Start with the original position</h2>'''
new_voice_row = '''              <div class="coach-voice-row">
                <button class="coach-voice-button active" id="coachVoiceToggle" type="button">🔊 Voice on</button>
                <button class="coach-voice-button" id="coachSpeakButton" type="button">▶ Speak</button>
                <button class="coach-voice-button coach-own-voice" id="coachMyVoiceInfo" type="button">My voice?</button>
              </div>
              <div class="coach-voice-settings">
                <label class="coach-voice-select-wrap" for="coachVoiceSelect"><span>Voice</span><select id="coachVoiceSelect" class="coach-voice-select"><option value="auto">Natural — best available</option></select></label>
                <label class="coach-rate-wrap" for="coachRateRange"><span>Pace <b id="coachRateValue">0.92×</b></span><input id="coachRateRange" type="range" min="0.82" max="1.06" step="0.02" value="0.92"></label>
              </div>
              <h2 id="replayCoachTitle">Start with the original position</h2>'''
index = replace_once(index, old_voice_row, new_voice_row, "coach voice controls")

voice_dialog = r'''

  <dialog id="voiceCloneDialog" class="modal beta-modal voice-clone-modal">
    <div class="modal-card">
      <div class="eyebrow">Using your own voice</div>
      <h2>A real voice clone needs a secure speech service</h2>
      <p>K-Mate can now choose the most natural voice exposed by your phone or computer, and you can select any available English voice. That remains device-generated speech.</p>
      <p>Using your actual voice for new, unscripted chess explanations requires a consented voice recording plus a secure server-based text-to-speech provider. This static beta does not record, upload, or imitate your voice.</p>
      <p>The interface is prepared for a verified personal-voice profile when K-Mate gains accounts and a backend.</p>
      <button class="btn primary" type="button" data-close="voiceCloneDialog">Understood</button>
    </div>
  </dialog>
'''
index = replace_once(index, '\n  <div class="toast" id="toast" role="status" aria-live="polite"></div>', voice_dialog + '\n  <div class="toast" id="toast" role="status" aria-live="polite"></div>', "voice clone dialog")
index = re.sub(r'\./styles-v7\.css\?v=\d+(?:\.\d+){2}', './styles-v7.css?v=22.0.0', index)
index = re.sub(r'\./app-v7\.js\?v=\d+(?:\.\d+){2}', './app-v7.js?v=22.0.0', index)
write(index_path, index)


# -----------------------------------------------------------------------------
# Application logic: voice selection/natural phrasing and desktop dragging.
# -----------------------------------------------------------------------------
app_path = "kmate-trainer/app-v7-part1.txt"
app = read(app_path)
app = replace_once(
    app,
    "  coachVoice: true,\n};",
    "  coachVoice: true,\n  coachVoiceURI: 'auto',\n  coachVoiceRate: 0.92,\n};",
    "voice defaults",
)
app = replace_once(
    app,
    "let coachVoiceCache = null;\nlet coachSpeechSerial = 0;",
    "let coachVoiceCache = null;\nlet coachSpeechSerial = 0;\nlet coachSpeechQueue = [];\nlet coachSpeechQueueIndex = 0;\nlet dragSourceSquare = null;\nlet dragMoveCommitted = false;\nlet dragSuppressClickUntil = 0;",
    "voice and drag state",
)

voice_picker_code = r'''function coachVoiceScore(voice) {
  const name = `${voice?.name || ''} ${voice?.voiceURI || ''}`.toLowerCase();
  const lang = String(voice?.lang || '').toLowerCase();
  let score = /^en([_-]|$)/.test(lang) ? 100 : -1000;
  if (/premium|enhanced|natural|neural|high quality|hq/.test(name)) score += 220;
  if (/ava|samantha|serena|daniel|karen|moira|aria|jenny|sonia|olivia|aaron|allison|tom|victoria/.test(name)) score += 90;
  if (/en-us/.test(lang)) score += 25;
  else if (/en-gb|en-au|en-ie|en-ca/.test(lang)) score += 18;
  if (voice?.localService) score += 8;
  if (/compact|robot|espeak|fred|zarvox|whisper|bad news|bubbles|cellos/.test(name)) score -= 180;
  return score;
}

function englishCoachVoices() {
  if (!coachVoiceAvailable()) return [];
  const voices = window.speechSynthesis.getVoices?.() || [];
  const seen = new Set();
  return voices.filter((voice) => {
    if (!/^en([_-]|$)/i.test(voice.lang || '')) return false;
    const key = voice.voiceURI || `${voice.name}-${voice.lang}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chooseCoachVoice() {
  const voices = englishCoachVoices();
  if (!voices.length) return null;
  const selected = settings.coachVoiceURI || 'auto';
  if (selected !== 'auto') {
    const exact = voices.find((voice) => (voice.voiceURI || `${voice.name}-${voice.lang}`) === selected);
    if (exact) {
      coachVoiceCache = exact;
      return exact;
    }
  }
  coachVoiceCache = voices.slice().sort((a, b) => coachVoiceScore(b) - coachVoiceScore(a) || a.name.localeCompare(b.name))[0] || null;
  return coachVoiceCache;
}

function populateCoachVoiceSelect() {
  const select = $('#coachVoiceSelect');
  if (!select) return;
  const voices = englishCoachVoices();
  const resolved = chooseCoachVoice();
  const requested = settings.coachVoiceURI || 'auto';
  select.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = 'auto';
  auto.textContent = resolved ? `Natural — ${resolved.name}` : 'Natural — best available';
  select.append(auto);
  for (const voice of voices.slice().sort((a, b) => coachVoiceScore(b) - coachVoiceScore(a) || a.name.localeCompare(b.name))) {
    const option = document.createElement('option');
    option.value = voice.voiceURI || `${voice.name}-${voice.lang}`;
    const quality = coachVoiceScore(voice) >= 250 ? 'Natural' : 'System';
    option.textContent = `${quality} — ${voice.name} (${voice.lang})`;
    select.append(option);
  }
  select.value = [...select.options].some((option) => option.value === requested) ? requested : 'auto';
  if (select.value !== requested) settings.coachVoiceURI = 'auto';
}

'''
app = sub_once(
    r"function chooseCoachVoice\(\) \{.*?\n\}\n\nfunction updateCoachVoiceControls\(\) \{",
    voice_picker_code + "function updateCoachVoiceControls() {",
    app,
    "voice picker replacement",
    flags=re.S,
)

new_update_controls = r'''function updateCoachVoiceControls() {
  const toggle = $('#coachVoiceToggle');
  const speak = $('#coachSpeakButton');
  const select = $('#coachVoiceSelect');
  const rate = $('#coachRateRange');
  if (!toggle || !speak) return;
  const available = coachVoiceAvailable();
  const enabled = settings.coachVoice !== false;
  populateCoachVoiceSelect();
  toggle.disabled = !available;
  speak.disabled = !available;
  if (select) select.disabled = !available;
  if (rate) {
    rate.disabled = !available;
    rate.value = String(Number(settings.coachVoiceRate) || 0.92);
  }
  const rateValue = $('#coachRateValue');
  if (rateValue) rateValue.textContent = `${(Number(settings.coachVoiceRate) || 0.92).toFixed(2)}×`;
  toggle.classList.toggle('active', available && enabled);
  toggle.textContent = !available ? 'Text only' : enabled ? '🔊 Voice on' : '🔇 Voice off';
  toggle.title = !available ? 'Speech is unavailable in this browser' : enabled ? 'Turn Coach K voice off' : 'Turn Coach K voice on';
  speak.textContent = coachSpeechUtterance || window.speechSynthesis?.speaking ? '■ Stop' : '▶ Speak';
}

function handleCoachVoiceSelect(event) {
  settings.coachVoiceURI = event?.target?.value || 'auto';
  coachVoiceCache = null;
  saveStore();
  updateCoachVoiceControls();
  if ($('#replayDialog')?.open && settings.coachVoice !== false) scheduleCoachSpeech(70, true);
}

function handleCoachRateChange(event) {
  const value = Math.max(0.82, Math.min(1.06, Number(event?.target?.value) || 0.92));
  settings.coachVoiceRate = value;
  saveStore();
  const label = $('#coachRateValue');
  if (label) label.textContent = `${value.toFixed(2)}×`;
}

'''
app = sub_once(
    r"function updateCoachVoiceControls\(\) \{.*?\n\}\n\nfunction setCoachSpeaking\(active\) \{",
    new_update_controls + "function setCoachSpeaking(active) {",
    app,
    "voice control rendering",
    flags=re.S,
)

new_stop_speech = r'''function stopCoachSpeech() {
  coachSpeechSerial += 1;
  if (coachSpeechTimer) window.clearTimeout(coachSpeechTimer);
  coachSpeechTimer = null;
  coachSpeechQueue = [];
  coachSpeechQueueIndex = 0;
  try { window.speechSynthesis?.cancel(); } catch {}
  coachSpeechUtterance = null;
  setCoachSpeaking(false);
}
'''
app = sub_once(
    r"function stopCoachSpeech\(\) \{.*?\n\}",
    new_stop_speech.rstrip(),
    app,
    "stop coach speech",
    flags=re.S,
)

speech_code = r'''function speechFriendlyText(text) {
  const names = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };
  const suffix = (mark) => mark === '#' ? ', checkmate' : mark === '+' ? ', check' : '';
  return String(text || '')
    .replace(/\bO-O-O\b/g, 'castle queenside')
    .replace(/\bO-O\b/g, 'castle kingside')
    .replace(/\b([KQRBN])x([a-h])([1-8])([+#])?/g, (_all, piece, file, rank, mark) => `${names[piece]} takes ${file.toUpperCase()} ${rank}${suffix(mark)}`)
    .replace(/\b([KQRBN])([a-h])([1-8])([+#])?/g, (_all, piece, file, rank, mark) => `${names[piece]} to ${file.toUpperCase()} ${rank}${suffix(mark)}`)
    .replace(/\b([a-h])x([a-h])([1-8])([+#])?/g, (_all, from, file, rank, mark) => `pawn from ${from.toUpperCase()} takes on ${file.toUpperCase()} ${rank}${suffix(mark)}`)
    .replace(/\b([a-h])([1-8])([+#])?/g, (_all, file, rank, mark) => `${file.toUpperCase()} ${rank}${suffix(mark)}`)
    .replace(/\bcp\b/gi, 'centipawns')
    .replace(/−/g, ' minus ')
    .replace(/\+/g, ' plus ')
    .replace(/\s+/g, ' ')
    .trim();
}

function coachSpeechSegmentsForCurrentFrame() {
  const title = $('#replayCoachTitle')?.textContent?.trim() || '';
  const text = $('#replayCoachText')?.textContent?.trim() || '';
  const comparison = $('#replayComparison');
  const visibleComparison = comparison && !comparison.hidden;
  const why = visibleComparison ? $('#replayWhyText')?.textContent?.trim() || '' : '';
  const best = visibleComparison ? $('#replayBestText')?.textContent?.trim() || '' : '';
  return [
    { text: title, pause: 110 },
    { text, pause: 230 },
    { text: why ? `About your move. ${why}` : '', pause: 250 },
    { text: best ? `The stronger move. ${best}` : '', pause: 0 },
  ].filter((segment) => segment.text);
}

function finishCoachSpeech(serial) {
  if (serial !== coachSpeechSerial) return;
  coachSpeechUtterance = null;
  coachSpeechQueue = [];
  coachSpeechQueueIndex = 0;
  setCoachSpeaking(false);
  updateCoachVoiceControls();
  updateCoachAvatarMood(replayState.frames[replayState.index]);
}

function speakCoachQueueSegment(serial) {
  if (serial !== coachSpeechSerial) return;
  const segment = coachSpeechQueue[coachSpeechQueueIndex];
  if (!segment) {
    finishCoachSpeech(serial);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(speechFriendlyText(segment.text));
  utterance.lang = 'en-US';
  utterance.rate = Math.max(0.82, Math.min(1.06, Number(settings.coachVoiceRate) || 0.92));
  utterance.pitch = 1.0;
  utterance.volume = 1;
  const voice = chooseCoachVoice();
  if (voice) utterance.voice = voice;
  utterance.onstart = () => {
    if (serial !== coachSpeechSerial) return;
    coachSpeechUtterance = utterance;
    setCoachSpeaking(true);
    updateCoachVoiceControls();
  };
  utterance.onend = () => {
    if (serial !== coachSpeechSerial) return;
    coachSpeechUtterance = null;
    coachSpeechQueueIndex += 1;
    coachSpeechTimer = window.setTimeout(() => speakCoachQueueSegment(serial), segment.pause || 0);
  };
  utterance.onerror = () => finishCoachSpeech(serial);
  coachSpeechUtterance = utterance;
  try {
    window.speechSynthesis.speak(utterance);
    updateCoachVoiceControls();
  } catch (error) {
    console.warn('Coach voice could not start.', error);
    finishCoachSpeech(serial);
  }
}

function speakCoachFrame(force = false) {
  if (!coachVoiceAvailable()) {
    if (force) toast('Voice narration is not available in this browser');
    updateCoachVoiceControls();
    return false;
  }
  if (!force && settings.coachVoice === false) return false;
  const segments = coachSpeechSegmentsForCurrentFrame();
  if (!segments.length) return false;
  stopCoachSpeech();
  const serial = ++coachSpeechSerial;
  coachSpeechQueue = segments;
  coachSpeechQueueIndex = 0;
  speakCoachQueueSegment(serial);
  return true;
}

'''
app = sub_once(
    r"function speakCoachFrame\(force = false\) \{.*?\n\}\n\nfunction scheduleCoachSpeech",
    speech_code + "function scheduleCoachSpeech",
    app,
    "segmented natural coach speech",
    flags=re.S,
)

app = replace_once(
    app,
    "window.speechSynthesis?.addEventListener?.('voiceschanged', () => {\n  coachVoiceCache = null;\n  chooseCoachVoice();\n  updateCoachVoiceControls();\n});",
    "window.speechSynthesis?.addEventListener?.('voiceschanged', () => {\n  coachVoiceCache = null;\n  populateCoachVoiceSelect();\n  updateCoachVoiceControls();\n});",
    "voices changed handler",
)

# Drag-and-drop helpers inserted immediately before the main board renderer.
drag_code = r'''function clearBoardDragVisuals() {
  document.body.classList.remove('dragging-piece');
  $$('#board .sq.drag-target, #board .sq.drag-over, #board .sq.drag-source').forEach((square) => {
    square.classList.remove('drag-target', 'drag-over', 'drag-source', 'legal', 'capture', 'selected');
  });
  $$('#board .piece.dragging').forEach((piece) => piece.classList.remove('dragging'));
}

function beginBoardDrag(event, square) {
  if (!game || thinking || finalized || game.isGameOver() || game.turn() !== userColor || game.get(square)?.color !== userColor) {
    event.preventDefault();
    return;
  }
  const moves = game.moves({ square, verbose: true });
  if (!moves.length) {
    event.preventDefault();
    return;
  }
  dragSourceSquare = square;
  dragMoveCommitted = false;
  selected = square;
  legalMoves = moves;
  event.dataTransfer?.setData('text/plain', square);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  event.currentTarget.classList.add('dragging');
  document.body.classList.add('dragging-piece');
  const sourceCell = $(`#board .sq[data-square="${square}"]`);
  sourceCell?.classList.add('selected', 'drag-source');
  for (const move of moves) {
    const target = $(`#board .sq[data-square="${move.to}"]`);
    if (!target) continue;
    target.classList.add('drag-target', game.get(move.to) ? 'capture' : 'legal');
  }
}

function dragOverBoardSquare(event, square) {
  if (!dragSourceSquare || !legalMoves.some((move) => move.to === square)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  $$('#board .sq.drag-over').forEach((cell) => cell.classList.remove('drag-over'));
  event.currentTarget.classList.add('drag-over');
}

function leaveBoardDragSquare(event) {
  event.currentTarget.classList.remove('drag-over');
}

function dropBoardPiece(event, square) {
  if (!dragSourceSquare) return;
  const candidates = legalMoves.filter((move) => move.to === square);
  if (!candidates.length) return;
  event.preventDefault();
  dragMoveCommitted = true;
  dragSuppressClickUntil = performance.now() + 650;
  const from = dragSourceSquare;
  clearBoardDragVisuals();
  if (candidates.some((move) => move.promotion)) {
    promotionBase = { from, to: square };
    openPromotion();
    return;
  }
  makeUserMove({ from, to: square, promotion: 'q' });
}

function endBoardDrag() {
  const committed = dragMoveCommitted;
  clearBoardDragVisuals();
  dragSourceSquare = null;
  dragMoveCommitted = false;
  if (!committed) {
    selected = null;
    legalMoves = [];
    renderBoard();
  }
}

'''
app = replace_once(app, "function renderBoard() {", drag_code + "function renderBoard() {", "drag helpers")

old_piece_block = '''    if (piece) {
      const glyph = document.createElement('span');
      glyph.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
      renderPieceGraphic(glyph, piece.type, piece.color);
      button.append(glyph);
    }'''
new_piece_block = '''    if (piece) {
      const glyph = document.createElement('span');
      glyph.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
      renderPieceGraphic(glyph, piece.type, piece.color);
      glyph.draggable = piece.color === userColor;
      if (piece.color === userColor) {
        glyph.title = 'Drag this piece or click it';
        glyph.addEventListener('dragstart', (event) => beginBoardDrag(event, square));
        glyph.addEventListener('dragend', endBoardDrag);
      }
      button.append(glyph);
    }'''
app = replace_once(app, old_piece_block, new_piece_block, "draggable pieces")

old_click = "    button.addEventListener('click', () => tapSquare(square));\n    board.append(button);"
new_click = "    button.addEventListener('dragover', (event) => dragOverBoardSquare(event, square));\n    button.addEventListener('dragenter', (event) => dragOverBoardSquare(event, square));\n    button.addEventListener('dragleave', leaveBoardDragSquare);\n    button.addEventListener('drop', (event) => dropBoardPiece(event, square));\n    button.addEventListener('click', () => {\n      if (performance.now() < dragSuppressClickUntil) return;\n      tapSquare(square);\n    });\n    board.append(button);"
app = replace_once(app, old_click, new_click, "board drag listeners")

app = app.replace("url.search = '?v=20260828-21';", "url.search = '?v=20260828-22';", 1)
write(app_path, app)


# -----------------------------------------------------------------------------
# Bind controls, expose diagnostics, and update version.
# -----------------------------------------------------------------------------
part6_path = "kmate-trainer/app-v7-part6.txt"
part6 = read(part6_path)
part6 = replace_once(
    part6,
    "  $('#coachVoiceToggle')?.addEventListener('click', toggleCoachVoice);\n  $('#coachSpeakButton')?.addEventListener('click', handleCoachSpeak);",
    "  $('#coachVoiceToggle')?.addEventListener('click', toggleCoachVoice);\n  $('#coachSpeakButton')?.addEventListener('click', handleCoachSpeak);\n  $('#coachVoiceSelect')?.addEventListener('change', handleCoachVoiceSelect);\n  $('#coachRateRange')?.addEventListener('input', handleCoachRateChange);\n  $('#coachMyVoiceInfo')?.addEventListener('click', () => openDialog('voiceCloneDialog'));",
    "voice control bindings",
)
part6 = part6.replace("version: '21.0-commercial-beta'", "version: '22.0-commercial-beta'", 1)
part6 = replace_once(
    part6,
    "    replay: { open: Boolean($('#replayDialog')?.open), index: replayState.index, frames: replayState.frames.length, showBest: replayState.showBest, coachVoice: settings.coachVoice !== false, coachSpeaking: Boolean(window.speechSynthesis?.speaking) },",
    "    replay: { open: Boolean($('#replayDialog')?.open), index: replayState.index, frames: replayState.frames.length, showBest: replayState.showBest, coachVoice: settings.coachVoice !== false, coachSpeaking: Boolean(coachSpeechUtterance || window.speechSynthesis?.speaking), resolvedVoice: chooseCoachVoice()?.name || null, voiceURI: settings.coachVoiceURI || 'auto', rate: Number(settings.coachVoiceRate) || 0.92 },\n    dragAndDrop: true,",
    "voice and drag state export",
)
part6 = replace_once(
    part6,
    "    speakCoach: () => speakCoachFrame(true),",
    "    speakCoach: () => speakCoachFrame(true),\n    firstLegalDrag: () => {\n      if (!game || finalized || thinking || game.turn() !== userColor) return null;\n      const move = game.moves({ verbose: true }).find((candidate) => candidate.color === userColor && !candidate.promotion);\n      return move ? { from: move.from, to: move.to } : null;\n    },",
    "drag test helper",
)
write(part6_path, part6)


# -----------------------------------------------------------------------------
# Styling: compact controls, drag feedback, and voice explanation modal.
# -----------------------------------------------------------------------------
styles_path = "kmate-trainer/styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v22 — natural voice selection and desktop piece dragging */
.coach-voice-settings{display:grid;grid-template-columns:minmax(0,1fr) 102px;gap:7px;margin-top:7px}
.coach-voice-select-wrap,.coach-rate-wrap{display:grid;gap:3px;min-width:0;color:var(--muted);font-size:8px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}
.coach-voice-select{width:100%;min-width:0;height:31px;padding:0 7px;border:1px solid #ffffff1b;border-radius:9px;background:#101a13;color:var(--text);font-size:9px;text-transform:none;letter-spacing:0}
.coach-rate-wrap span{display:flex;justify-content:space-between;gap:6px}.coach-rate-wrap b{color:var(--accent);font-size:8px}
.coach-rate-wrap input{width:100%;height:20px;margin:0;accent-color:var(--accent)}
.coach-own-voice{border-color:#f4cc7040;color:#f7db9a}
.voice-clone-modal p{color:#d5ddd6}
#board .piece[draggable="true"]{cursor:grab}
#board .piece[draggable="true"]:active{cursor:grabbing}
#board .piece.dragging{opacity:.32;filter:saturate(.65)}
body.dragging-piece #board .sq.drag-target{cursor:copy}
#board .sq.drag-over{z-index:4;box-shadow:inset 0 0 0 6px #b9f474,inset 0 0 22px #b9f47455!important}
#board .sq.drag-source{box-shadow:inset 0 0 0 5px #f4cc70!important}
@media(max-width:760px){
  .coach-voice-settings{grid-template-columns:minmax(0,1fr) 78px;gap:4px;margin-top:4px}
  .coach-voice-select{height:25px;padding:0 5px;font-size:7px}
  .coach-voice-select-wrap,.coach-rate-wrap{font-size:6.5px}
  .coach-rate-wrap b{font-size:6.5px}
  .coach-rate-wrap input{height:15px}
  .coach-own-voice{display:none}
}
'''
write(styles_path, styles)


# Cache-bust loader assets.
loader_path = "kmate-trainer/app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+(?:\.\d+){2}", "positions-v7.js?v=22.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+(?:\.\d+){2}", "app-v7-part${number}.txt?v=22.0.0", loader)
write(loader_path, loader)
