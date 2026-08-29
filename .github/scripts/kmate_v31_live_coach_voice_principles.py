from __future__ import annotations

from pathlib import Path
import re

ROOT = Path("kmate-trainer")


def read(path: Path) -> str:
    return path.read_text()


def write(path: Path, content: str) -> None:
    path.write_text(content)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Setup and inline Live Coach interface.
# ---------------------------------------------------------------------------
index_path = ROOT / "index.html"
index = read(index_path)

live_coach_toggle = '''          <label class="calibration-toggle live-coach-toggle">
            <input id="liveCoach" type="checkbox">
            <span><b>Live Coach after bad moves</b><small>After an Inaccurate, Miss, or Blunder, pause both clocks, keep the board visible, and compare your move with the best move directly on the board.</small></span>
          </label>'''
live_coach_with_voice = live_coach_toggle + '''

          <label class="calibration-toggle live-coach-audio-toggle">
            <input id="liveCoachVoice" type="checkbox">
            <span><b>Speak Live Coach reviews aloud</b><small>Play a short coaching cue, then narrate the move, the stronger alternative, and the likely chess principle that was overlooked. A Hear coach button remains available if autoplay is blocked.</small></span>
          </label>'''
index = replace_once(index, live_coach_toggle, live_coach_with_voice, "Live Coach voice setup toggle")

old_head = '''              <div class="live-coach-head">
                <div><div class="eyebrow">Live Coach · clock paused</div><h2 id="liveCoachTitle">Reviewing your move</h2></div>
                <span class="move-quality-badge quality-pending" id="liveCoachRating">Analyzing</span>
              </div>'''
new_head = '''              <div class="live-coach-head">
                <div><div class="eyebrow">Live Coach · clock paused</div><h2 id="liveCoachTitle">Reviewing your move</h2></div>
                <div class="live-coach-head-tools">
                  <button class="live-coach-voice-toggle" id="liveCoachVoiceToggle" type="button" aria-pressed="true">🔊 Voice on</button>
                  <span class="move-quality-badge quality-pending" id="liveCoachRating">Analyzing</span>
                </div>
              </div>'''
index = replace_once(index, old_head, new_head, "Live Coach header voice control")

legend_marker = '''              <div class="live-coach-board-legend" aria-label="Board highlight legend">
                <span class="played"><i></i>Your played move</span>
                <span class="best"><i></i>Engine best move</span>
              </div>'''
legend_with_audio = legend_marker + '''
              <div class="live-coach-audio-status" id="liveCoachAudioStatus" role="status">Voice on · narration begins when the analysis is ready.</div>'''
index = replace_once(index, legend_marker, legend_with_audio, "Live Coach audio status")

old_principles = '''              <section class="live-coach-principles" id="liveCoachPrinciples" hidden>
                <small>Principles this move appears to have overlooked</small>
                <div class="live-coach-principle-list" id="liveCoachPrincipleList"></div>
                <span id="liveCoachPrinciplesText" hidden></span>
              </section>'''
new_principles = '''              <section class="live-coach-principles" id="liveCoachPrinciples" hidden>
                <div class="live-coach-principle-heading">
                  <div><small>Likely chess principle overlooked</small><b id="liveCoachPrincipleHeadline">Coach diagnosis</b></div>
                  <span>Engine-supported inference</span>
                </div>
                <div class="live-coach-principle-list" id="liveCoachPrincipleList"></div>
                <p class="live-coach-principle-note" id="liveCoachPrincipleNote">The concrete Stockfish line is the evidence; the principle label explains the likely human lesson.</p>
                <span id="liveCoachPrinciplesText" hidden></span>
              </section>'''
index = replace_once(index, old_principles, new_principles, "Principle diagnosis interface")

index = index.replace('id="liveCoachSpeakButton" type="button">▶ Speak again</button>', 'id="liveCoachSpeakButton" type="button">▶ Hear coach</button>', 1)
index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=31.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=31.0.0", index)
write(index_path, index)


# ---------------------------------------------------------------------------
# Live Coach principle inference and audio narration.
# ---------------------------------------------------------------------------
app_path = ROOT / "app-v7-part1.txt"
app = read(app_path)
app = app.replace("url.search = '?v=20260829-30';", "url.search = '?v=20260829-31';")

# Expose the existing coachVoice preference in setup.
app = replace_once(
    app,
    "  if ($('#liveCoach')) $('#liveCoach').checked = Boolean(settings.liveCoach);\n  if ($('#principleReview')) $('#principleReview').checked = Boolean(settings.principleReview);",
    "  if ($('#liveCoach')) $('#liveCoach').checked = Boolean(settings.liveCoach);\n  if ($('#liveCoachVoice')) $('#liveCoachVoice').checked = settings.coachVoice !== false;\n  if ($('#principleReview')) $('#principleReview').checked = Boolean(settings.principleReview);",
    "apply voice setting to setup",
)
app = replace_once(
    app,
    "  settings.liveCoach = Boolean($('#liveCoach')?.checked);\n  settings.principleReview = Boolean($('#principleReview')?.checked);",
    "  settings.liveCoach = Boolean($('#liveCoach')?.checked);\n  settings.coachVoice = Boolean($('#liveCoachVoice')?.checked);\n  settings.principleReview = Boolean($('#principleReview')?.checked);",
    "read voice setting from setup",
)
app = replace_once(
    app,
    "  const openingDisabled = settings.phase === 'endgame';",
    "  const liveCoachVoiceControl = $('#liveCoachVoice');\n  if (liveCoachVoiceControl) {\n    liveCoachVoiceControl.disabled = !settings.liveCoach;\n    liveCoachVoiceControl.closest('label')?.classList.toggle('disabled', !settings.liveCoach);\n  }\n\n  const openingDisabled = settings.phase === 'endgame';",
    "Live Coach voice dependency",
)

# Track whether the browser has received a user-gesture speech primer.
app = replace_once(
    app,
    "let liveCoachUtterance = null;",
    "let liveCoachUtterance = null;\nlet liveCoachVoicePrimed = false;",
    "Live Coach voice primer state",
)

# Replace the former pre-game-only principle matcher with a concrete move-based
# diagnosis that works whether or not pre-game principles were enabled.
principle_pattern = re.compile(r"function ignoredPrinciplesForMove\(record, session\) \{.*?\n\}\n\nfunction stopLiveCoachSpeech", re.S)
principle_code = r'''function ignoredPrinciplesForMove(record, session) {
  const comparison = strongestAlternativeAchievement(record, session);
  const best = comparison.best.move;
  const selectedMove = comparison.selected.move;
  const tags = new Set(session?.tags || []);
  const reviewedKeys = new Set((session?.positionPrinciples || []).map((principle) => principle.key));
  const diagnoses = new Map();
  const bestSan = comparison.best.san || readableEngineMove(record?.bestMove);
  const selectedSan = comparison.selected.san || record?.san || readableEngineMove(record?.uci);
  const loss = Math.max(0, Number(record?.cpLoss) || 0);
  const phase = session?.phase || 'middlegame';
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  const add = (key, score, evidence, confidence = null) => {
    const principle = CHESS_PRINCIPLE_BY_KEY[key];
    if (!principle || !evidence) return;
    const reviewed = Boolean(session?.principleReview && reviewedKeys.has(key));
    const positionRelevant = reviewedKeys.has(key);
    const adjustedScore = Number(score) + (reviewed ? 6 : positionRelevant ? 2 : 0);
    const confidenceLabel = confidence || (adjustedScore >= 88 ? 'High confidence' : adjustedScore >= 65 ? 'Medium confidence' : 'Guiding principle');
    const existing = diagnoses.get(key);
    if (!existing || adjustedScore > existing.score) {
      diagnoses.set(key, { ...principle, score: adjustedScore, evidence, confidence: confidenceLabel, reviewed, positionRelevant });
    }
  };

  if (best?.san?.includes('#') && !selectedMove?.san?.includes('#')) {
    add('forcing-scan', 100, `${bestSan} began a forced mating sequence, while ${selectedSan} did not use the forcing opportunity.`, 'High confidence');
  } else if (best?.san?.includes('+') && !selectedMove?.san?.includes('+')) {
    add('forcing-scan', 94, `${bestSan} was a forcing check. Looking at checks before quiet moves would have brought it into the candidate set.`, 'High confidence');
  }

  const bestCaptureValue = values[best?.captured] || 0;
  const selectedCaptureValue = values[selectedMove?.captured] || 0;
  if (best?.captured && bestCaptureValue > selectedCaptureValue) {
    add('forcing-scan', 92, `${bestSan} was the stronger tactical capture, but ${selectedSan} did not win the same material or initiative.`, 'High confidence');
    add('loose-pieces', 90, `Stockfish found that the ${pieceName(best.captured)} was tactically available in the best line.`, 'High confidence');
  }

  if (best?.san?.startsWith('O-O') && !selectedMove?.san?.startsWith('O-O')) {
    add('king-safety', 95, `${bestSan} would have secured the king and connected the rooks before starting another plan.`, 'High confidence');
  } else if (tags.has('king safety') && loss > 110) {
    add('king-safety', 72, `King safety was a central theme of this position, and ${selectedSan} did not address it as directly as ${bestSan}.`);
  }

  if (Number.isFinite(record?.bestScore) && Number.isFinite(record?.selectedScore)) {
    if (record.bestScore >= -35 && record.selectedScore <= -120) {
      add('opponent-threat', 96, `${selectedSan} changed a defensible position into a clear disadvantage, indicating that an opposing threat or tactical resource was not neutralized.`, 'High confidence');
    }
    if (record.bestScore >= 120 && record.selectedScore < 40) {
      add('conversion', 91, `${selectedSan} let a clear advantage drift toward equality; ${bestSan} kept the cleaner conversion route.`, 'High confidence');
    }
    if (record.bestScore > 0 && record.selectedScore < 0) {
      add('opponent-threat', 88, `${selectedSan} reversed which side had the easier position, so the opponent’s counterplay needed more attention.`, 'High confidence');
    }
  }

  if (selectedMove?.piece === 'p' && best?.piece !== 'p' && (tags.has('pawn structure') || tags.has('pawn breaks'))) {
    add('pawn-structure', 76, `${selectedSan} made a permanent pawn commitment while ${bestSan} improved the position without creating the same structural obligation.`);
  }
  if (best?.piece === 'p' && ['c', 'd', 'e', 'f'].includes(best.to?.[0]) && !sameUciMove(record?.uci, record?.bestMove) && tags.has('pawn breaks')) {
    add('pawn-breaks', 78, `${bestSan} was the prepared central or flank break that changed the lines in your favour.`);
  }

  const bestDevelops = best && ['n', 'b'].includes(best.piece)
    && ((best.color === 'w' && best.from?.[1] === '1') || (best.color === 'b' && best.from?.[1] === '8'));
  if (bestDevelops && !(['n', 'b'].includes(selectedMove?.piece)
      && ((selectedMove.color === 'w' && selectedMove.from?.[1] === '1') || (selectedMove.color === 'b' && selectedMove.from?.[1] === '8')))) {
    add('piece-activity', 82, `${bestSan} developed a piece into the game, while ${selectedSan} left that coordination problem unresolved.`);
  } else if ((tags.has('piece activity') || tags.has('space')) && loss > 110) {
    add('piece-activity', 68, `${bestSan} coordinated the pieces more efficiently than ${selectedSan}, which is important in this activity-focused structure.`);
  }

  if (best?.piece === 'r' && tags.has('rook activity')) {
    add('rook-activity', 78, `${bestSan} activated a rook on a more useful line instead of allowing it to remain passive.`);
  }
  if (phase === 'endgame' && best?.piece === 'k' && selectedMove?.piece !== 'k') {
    add('king-activity', 86, `${bestSan} activated the king toward the critical squares, while ${selectedSan} used a different piece.`, 'High confidence');
  }
  if (phase === 'endgame' && tags.has('opposition')) {
    add('opposition', 70, `The king geometry in this ending makes opposition and entry-square calculation especially important.`);
  }
  if (tags.has('passed pawns') && (best?.piece === 'p' || best?.captured)) {
    add('passed-pawns', 72, `${bestSan} handled the passed-pawn race or blockade more directly than ${selectedSan}.`);
  }

  if (tags.has('endgame transition') && selectedMove?.captured) {
    add('endgame-transition', 70, `${selectedSan} changed the material balance and therefore required checking the resulting ending before exchanging.`);
  }
  if (best && ['d4', 'e4', 'd5', 'e5'].includes(best.to) && !['d4', 'e4', 'd5', 'e5'].includes(selectedMove?.to)) {
    add('central-control', 66, `${bestSan} used a central square to improve coordination and restrict counterplay.`);
  }

  // Every substantial engine loss contains at least a candidate-selection lesson,
  // even when no single classical rule fully explains the concrete tactic.
  add(
    'candidate-comparison',
    loss > 220 ? 62 : 54,
    `${bestSan} was substantially stronger than ${selectedSan}. Comparing one forcing candidate with one improving candidate would have made the difference easier to notice.`,
    loss > 220 ? 'Medium confidence' : 'Guiding principle',
  );

  return [...diagnoses.values()]
    .sort((first, second) => second.score - first.score)
    .slice(0, 3);
}

function stopLiveCoachSpeech'''
app, replacements = principle_pattern.subn(principle_code, app, count=1)
if replacements != 1:
    raise SystemExit("Unable to replace Live Coach principle diagnosis")

# Replace the voice controls with priming, a short original cue, clearer status,
# and a reliable manual replay path when mobile autoplay is restricted.
voice_pattern = re.compile(r"function stopLiveCoachSpeech\(\) \{.*?\n\}\n\n\nfunction setLiveCoachBoardOpen", re.S)
voice_code = r'''function updateLiveCoachAudioControls(message = '') {
  const enabled = settings.coachVoice !== false;
  const speaking = Boolean(liveCoachUtterance || window.speechSynthesis?.speaking);
  const setup = $('#liveCoachVoice');
  if (setup) setup.checked = enabled;
  const toggle = $('#liveCoachVoiceToggle');
  if (toggle) {
    toggle.textContent = enabled ? '🔊 Voice on' : '🔇 Voice off';
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.classList.toggle('active', enabled);
    toggle.classList.toggle('speaking', speaking);
  }
  const speakButton = $('#liveCoachSpeakButton');
  if (speakButton && !speaking) speakButton.textContent = '▶ Hear coach';
  const status = $('#liveCoachAudioStatus');
  if (status) {
    status.textContent = message || (speaking
      ? 'Coach is speaking. Tap Stop voice to pause the narration.'
      : enabled
        ? 'Voice on · narration begins automatically. Tap Hear coach whenever you need a replay.'
        : 'Voice off · the complete written review remains available.');
    status.classList.toggle('speaking', speaking);
    status.classList.toggle('muted', !enabled);
  }
  $('#liveCoachBoardPanel')?.classList.toggle('voice-speaking', speaking);
}

function primeLiveCoachVoice() {
  if (liveCoachVoicePrimed || settings.coachVoice === false || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return false;
  try {
    window.speechSynthesis.resume?.();
    const primer = new SpeechSynthesisUtterance(' ');
    primer.volume = 0;
    primer.rate = 1;
    primer.lang = chooseCoachVoice()?.lang || 'en-GB';
    liveCoachVoicePrimed = true;
    window.speechSynthesis.speak(primer);
    return true;
  } catch (error) {
    console.warn('Unable to prime Live Coach voice.', error);
    return false;
  }
}

function playLiveCoachCue() {
  if (!soundEnabled()) return false;
  const ctx = ensureAudioContext();
  if (!ctx) return false;
  try { ctx.resume?.(); } catch {}
  const now = ctx.currentTime + 0.008;
  scheduleChessKnock(ctx, now, 0.12, 0.022, 3100);
  scheduleChessKnock(ctx, now + 0.070, 0.16, 0.028, 2500);
  scheduleChessTone(ctx, now + 0.095, 520, 690, 0.048, 0.095, 'sine');
  scheduleChessTone(ctx, now + 0.178, 690, 820, 0.040, 0.105, 'sine');
  lastSoundKind = 'coach';
  return true;
}

function stopLiveCoachSpeech() {
  try { window.speechSynthesis?.cancel(); } catch {}
  liveCoachUtterance = null;
  const button = $('#liveCoachSpeakButton');
  if (button) button.textContent = '▶ Hear coach';
  updateLiveCoachAudioControls();
}

function liveCoachSpeechText() {
  const rating = $('#liveCoachRating')?.textContent?.trim() || '';
  const summary = $('#liveCoachSummary')?.textContent?.trim() || '';
  const why = $('#liveCoachWhy')?.textContent?.trim() || '';
  const best = $('#liveCoachBestText')?.textContent?.trim() || '';
  const principles = $('#liveCoachPrinciplesText')?.textContent?.trim() || '';
  return [rating ? `${rating}.` : '', summary, why ? `About your move. ${why}` : '', best ? `The stronger move. ${best}` : '', principles ? `Principle diagnosis. ${principles}` : ''].filter(Boolean).join(' ');
}

function speakLiveCoach(force = false) {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    updateLiveCoachAudioControls('Spoken coaching is unavailable in this browser; the complete written review remains below.');
    return false;
  }
  if (!force && settings.coachVoice === false) return false;
  stopLiveCoachSpeech();
  const text = speechFriendlyText(liveCoachSpeechText());
  if (!text) return false;
  try { window.speechSynthesis.resume?.(); } catch {}
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = chooseCoachVoice();
  utterance.lang = voice?.lang || 'en-GB';
  utterance.rate = Math.max(0.82, Math.min(1.06, Number(settings.coachVoiceRate) || 0.92));
  utterance.pitch = 1;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;
  utterance.onstart = () => {
    liveCoachUtterance = utterance;
    const button = $('#liveCoachSpeakButton');
    if (button) button.textContent = '■ Stop voice';
    updateLiveCoachAudioControls('Coach is speaking: move assessment, best alternative, then principle diagnosis.');
  };
  utterance.onend = () => {
    if (liveCoachUtterance === utterance) liveCoachUtterance = null;
    updateLiveCoachAudioControls('Narration complete. Tap Hear coach to listen again, or Resume game when ready.');
  };
  utterance.onerror = () => {
    if (liveCoachUtterance === utterance) liveCoachUtterance = null;
    updateLiveCoachAudioControls('Automatic narration was blocked. Tap Hear coach to start it with a direct user gesture.');
  };
  liveCoachUtterance = utterance;
  window.speechSynthesis.speak(utterance);
  return true;
}

function toggleLiveCoachVoice() {
  settings.coachVoice = settings.coachVoice === false;
  if (!settings.coachVoice) stopLiveCoachSpeech();
  else {
    primeLiveCoachVoice();
    updateLiveCoachAudioControls('Voice enabled.');
    if (liveCoachState.open) window.setTimeout(() => speakLiveCoach(true), 80);
  }
  saveStore();
  updateCoachVoiceControls();
  updateLiveCoachAudioControls();
}

function handleLiveCoachVoiceSetting(event) {
  settings.coachVoice = Boolean(event?.target?.checked);
  if (settings.coachVoice) primeLiveCoachVoice();
  else stopLiveCoachSpeech();
  saveStore();
  updateCoachVoiceControls();
  updateLiveCoachAudioControls();
}

function setLiveCoachBoardOpen'''
app, replacements = voice_pattern.subn(voice_code, app, count=1)
if replacements != 1:
    raise SystemExit("Unable to replace Live Coach voice functions")

# Pending review should advertise voice status.
app = replace_once(
    app,
    "  setLiveCoachBoardOpen(true);\n}\n\nfunction resetLiveCoachFlow",
    "  setLiveCoachBoardOpen(true);\n  updateLiveCoachAudioControls(settings.coachVoice === false ? 'Voice off · the written analysis will remain here until you resume.' : 'Voice on · narration will begin when the analysis is ready.');\n}\n\nfunction resetLiveCoachFlow",
    "pending voice status",
)

# Always show inferred principles and explain the evidence; pre-game review is an
# additional badge rather than a prerequisite.
render_pattern = re.compile(r"function renderLiveCoachIntervention\(record, narration, ignoredPrinciples\) \{.*?\n\}\n\nfunction openLiveCoachIntervention", re.S)
render_code = r'''function renderLiveCoachIntervention(record, narration, ignoredPrinciples) {
  if ($('#liveCoachPauseText')) $('#liveCoachPauseText').textContent = 'Take as long as you need. Both clocks remain paused until you tap Resume game.';
  const rating = $('#liveCoachRating');
  rating.className = `move-quality-badge quality-${narration.band.key}`;
  rating.textContent = narration.band.label;
  $('#liveCoachTitle').textContent = `Pause after ${record.san}`;
  $('#liveCoachSummary').textContent = narration.text;
  $('#liveCoachYourMove').textContent = narration.yourSan;
  $('#liveCoachWhy').textContent = narration.whyText;
  $('#liveCoachBestMove').textContent = narration.bestSan;
  $('#liveCoachBestText').textContent = narration.bestText;
  const line = $('#liveCoachLine');
  const lineText = narration.line?.length ? narration.line.join('  ') : 'The principal variation is not available yet.';
  line.textContent = lineText;

  const principlesSection = $('#liveCoachPrinciples');
  const principleList = $('#liveCoachPrincipleList');
  const principlesText = $('#liveCoachPrinciplesText');
  const principleHeadline = $('#liveCoachPrincipleHeadline');
  const principleNote = $('#liveCoachPrincipleNote');
  const showPrinciples = Boolean(ignoredPrinciples.length);
  principlesSection.hidden = !showPrinciples;
  if (showPrinciples) {
    const reviewedCount = ignoredPrinciples.filter((principle) => principle.reviewed).length;
    principleHeadline.textContent = reviewedCount
      ? `${ignoredPrinciples.length} likely lesson${ignoredPrinciples.length === 1 ? '' : 's'} · ${reviewedCount} reviewed before play`
      : `${ignoredPrinciples.length} likely lesson${ignoredPrinciples.length === 1 ? '' : 's'} from this move`;
    principleList.innerHTML = ignoredPrinciples.map((principle) => `
      <article class="principle-diagnosis-card" data-confidence="${escapeHtml(principle.confidence)}">
        <div class="principle-diagnosis-title"><b>${escapeHtml(principle.title)}</b><em>${escapeHtml(principle.confidence)}</em></div>
        <span class="principle-diagnosis-evidence">${escapeHtml(principle.evidence)}</span>
        <small>${escapeHtml(principle.rule)}</small>
        ${principle.reviewed ? '<mark>Reviewed before this game</mark>' : principle.positionRelevant ? '<mark>Relevant to this position</mark>' : ''}
      </article>`).join('');
    principleNote.textContent = 'The Stockfish comparison supplies the concrete evidence. The principle diagnosis is a coaching inference explaining the likely human decision-making lesson.';
    principlesText.textContent = ignoredPrinciples.map((principle) => `${principle.title}. ${principle.evidence}`).join(' ');
  } else {
    principleList.innerHTML = '';
    principlesText.textContent = '';
    principleHeadline.textContent = 'No single classical principle identified';
  }
  updateLiveCoachAudioControls();
}

function openLiveCoachIntervention'''
app, replacements = render_pattern.subn(render_code, app, count=1)
if replacements != 1:
    raise SystemExit("Unable to replace Live Coach intervention renderer")

# Diagnose principles regardless of the pre-game principle-review preference,
# persist the evidence, play a brief cue, and then narrate automatically.
app = replace_once(
    app,
    "  const ignoredPrinciples = settings.principleReview ? ignoredPrinciplesForMove(record, currentSession) : [];\n  record.ignoredPrinciples = ignoredPrinciples.map((principle) => principle.key);",
    "  const ignoredPrinciples = ignoredPrinciplesForMove(record, currentSession);\n  record.ignoredPrinciples = ignoredPrinciples.map((principle) => principle.key);\n  record.principleDiagnoses = ignoredPrinciples.map((principle) => ({ key: principle.key, title: principle.title, confidence: principle.confidence, evidence: principle.evidence, reviewed: principle.reviewed }));",
    "always diagnose principles",
)
app = replace_once(
    app,
    "  replayLiveCoachBoardHighlights();\n  $('#boardCoachStage')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });\n  if (settings.coachVoice !== false) window.setTimeout(() => speakLiveCoach(false), 180);",
    "  replayLiveCoachBoardHighlights();\n  playLiveCoachCue();\n  updateLiveCoachAudioControls();\n  $('#boardCoachStage')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });\n  if (settings.coachVoice !== false) window.setTimeout(() => speakLiveCoach(false), 420);",
    "cue and narrate intervention",
)

# Manual Hear coach should enable voice if it had been switched off.
app = replace_once(
    app,
    "function handleLiveCoachSpeak() {\n  if (liveCoachUtterance || window.speechSynthesis?.speaking) stopLiveCoachSpeech();\n  else speakLiveCoach(true);\n}",
    "function handleLiveCoachSpeak() {\n  if (liveCoachUtterance || window.speechSynthesis?.speaking) {\n    stopLiveCoachSpeech();\n    return;\n  }\n  if (settings.coachVoice === false) {\n    settings.coachVoice = true;\n    saveStore();\n    updateCoachVoiceControls();\n  }\n  primeLiveCoachVoice();\n  speakLiveCoach(true);\n}",
    "manual Hear coach behavior",
)

# Prime speech from the Start button's user gesture.
app = replace_once(
    app,
    "  unlockMoveAudio(false);\n  ensureAudioContext();",
    "  unlockMoveAudio(false);\n  ensureAudioContext();\n  primeLiveCoachVoice();",
    "prime Live Coach voice on start",
)

write(app_path, app)


# ---------------------------------------------------------------------------
# Runtime bindings, test surface, and cache versions.
# ---------------------------------------------------------------------------
part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = replace_once(
    part6,
    "  $('#liveCoachSpeakButton')?.addEventListener('click', handleLiveCoachSpeak);",
    "  $('#liveCoachSpeakButton')?.addEventListener('click', handleLiveCoachSpeak);\n  $('#liveCoachVoiceToggle')?.addEventListener('click', toggleLiveCoachVoice);\n  $('#liveCoachVoice')?.addEventListener('change', handleLiveCoachVoiceSetting);",
    "Live Coach voice bindings",
)
part6 = part6.replace("version: '30.0-commercial-beta'", "version: '31.0-commercial-beta'")
part6 = replace_once(
    part6,
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, inline: true, autoResume: false, slowNoticeShown: Boolean(liveCoachState.slowNoticeShown), panelVisible: Boolean($('#liveCoachBoardPanel') && !$('#liveCoachBoardPanel').hidden), moveId: liveCoachState.moveId, ignoredPrinciples: liveCoachState.ignoredPrinciples.map((principle) => principle.key) },",
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, inline: true, autoResume: false, voiceEnabled: settings.coachVoice !== false, voiceSpeaking: Boolean(liveCoachUtterance || window.speechSynthesis?.speaking), slowNoticeShown: Boolean(liveCoachState.slowNoticeShown), panelVisible: Boolean($('#liveCoachBoardPanel') && !$('#liveCoachBoardPanel').hidden), moveId: liveCoachState.moveId, ignoredPrinciples: liveCoachState.ignoredPrinciples.map((principle) => principle.key), principleDiagnoses: liveCoachState.ignoredPrinciples.map((principle) => ({ key: principle.key, confidence: principle.confidence, evidence: principle.evidence, reviewed: Boolean(principle.reviewed) })) },",
    "Live Coach debug state",
)

# Ensure the existing teaching test has voice enabled, then add a no-pregame-
# review variant proving that principle diagnosis still appears.
part6 = replace_once(
    part6,
    "      settings.liveCoach = true;\n      settings.principleReview = true;",
    "      settings.liveCoach = true;\n      settings.coachVoice = true;\n      settings.principleReview = true;",
    "teaching test voice setting",
)

helper_marker = "    startTeachingDemo: () => {"
new_helper = r'''    startLiveCoachPrincipleDemo: () => {
      settings.side = 'w';
      settings.timeControl = '3+0';
      settings.liveCoach = true;
      settings.coachVoice = true;
      settings.principleReview = false;
      settings.autoHints = false;
      settings.sound = true;
      settings.soundTheme = 'reference-crisp';
      queuedCustomPosition = {
        id: 'live-coach-principle-demo', custom: true, generated: false, phase: 'middlegame', opening: 'Teaching demo', rating: 1600,
        title: 'Voice and principle diagnosis demo', theme: 'Candidate moves and piece activity',
        tags: ['calculation', 'piece activity', 'prophylaxis'],
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        description: 'A deterministic local test position for spoken Live Coach principle diagnosis.',
      };
      startPosition();
      return { principleReview: settings.principleReview, voice: settings.coachVoice, paused: clockPaused };
    },
'''
part6 = replace_once(part6, helper_marker, new_helper + helper_marker, "Live Coach principle test helper")
write(part6_path, part6)

loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=31.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=31.0.0", loader)
write(loader_path, loader)


# ---------------------------------------------------------------------------
# Visual hierarchy for voice status and principle evidence.
# ---------------------------------------------------------------------------
styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v31 — spoken Live Coach and always-on principle diagnosis */
.live-coach-audio-toggle{border-color:#80d8a43d;background:#80d8a408}
.live-coach-audio-toggle.disabled{opacity:.48}
.live-coach-head-tools{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}
.live-coach-voice-toggle{min-height:31px;padding:0 9px;border:1px solid #ffffff1b;border-radius:10px;background:#ffffff07;color:var(--muted);font-size:9px;font-weight:950;cursor:pointer;white-space:nowrap}
.live-coach-voice-toggle.active{border-color:#80d8a466;background:#80d8a414;color:#c7f8dc}
.live-coach-voice-toggle.speaking{box-shadow:0 0 0 3px #80d8a411;animation:kmateVoicePulseV31 1.1s ease-in-out infinite}
@keyframes kmateVoicePulseV31{50%{filter:brightness(1.2);transform:translateY(-1px)}}
.live-coach-audio-status{margin:6px 0 1px;padding:6px 8px;border-left:3px solid #80d8a4;border-radius:7px;background:#80d8a40b;color:#cfe7d9;font-size:9px;line-height:1.35}
.live-coach-audio-status.speaking{border-color:#b9f474;background:#b9f4740d;color:#eaffd1}
.live-coach-audio-status.muted{border-color:#ffffff30;background:#ffffff05;color:var(--muted)}
.live-coach-board-panel.voice-speaking{border-color:#80d8a45e;box-shadow:0 20px 55px #0007,0 0 0 3px #80d8a409}

.live-coach-principle-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.live-coach-principle-heading small,.live-coach-principle-heading b{display:block}
.live-coach-principle-heading b{margin-top:2px;color:#fff4c8;font-size:13px}
.live-coach-principle-heading>span{flex:0 0 auto;padding:4px 7px;border:1px solid #f4cc7040;border-radius:99px;background:#f4cc700c;color:#f9dd98;font-size:7px;font-weight:950;letter-spacing:.055em;text-transform:uppercase}
.principle-diagnosis-card{display:grid;gap:5px!important;padding:10px!important;border:1px solid #ffffff13!important;border-left:4px solid #f4cc70!important;border-radius:11px!important;background:linear-gradient(145deg,#ffffff08,#0002)!important}
.principle-diagnosis-title{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.principle-diagnosis-title b{color:#fff4cf;font-size:11px}
.principle-diagnosis-title em{flex:0 0 auto;padding:3px 6px;border:1px solid #ffffff18;border-radius:99px;background:#ffffff08;color:#dbe4dd;font:850 7px/1 system-ui,sans-serif;font-style:normal;white-space:nowrap}
.principle-diagnosis-card[data-confidence="High confidence"]{border-left-color:#ff9d4d!important}.principle-diagnosis-card[data-confidence="High confidence"] .principle-diagnosis-title em{border-color:#ff9d4d55;background:#ff9d4d12;color:#ffc28e}
.principle-diagnosis-card[data-confidence="Medium confidence"]{border-left-color:#f4cc70!important}
.principle-diagnosis-card[data-confidence="Guiding principle"]{border-left-color:#70b8ff!important}.principle-diagnosis-card[data-confidence="Guiding principle"] .principle-diagnosis-title em{border-color:#70b8ff55;background:#70b8ff12;color:#a9d5ff}
.principle-diagnosis-evidence{color:#eef4ef!important;font-size:9.5px!important;line-height:1.38!important}
.principle-diagnosis-card>small{color:#aebcb2;font-size:8.5px;line-height:1.35}
.principle-diagnosis-card mark{justify-self:start;padding:3px 6px;border:1px solid #80d8a43f;border-radius:99px;background:#80d8a40d;color:#bff3d4;font-size:7px;font-weight:900}
.live-coach-principle-note{margin:7px 0 0!important;color:#abb8ae!important;font-size:8px!important;line-height:1.35!important}

@media(max-width:760px){
  .live-coach-head-tools{gap:4px}.live-coach-voice-toggle{min-height:27px;padding:0 6px;font-size:7px}
  .live-coach-audio-status{margin-top:4px;padding:4px 6px;font-size:7.5px}
  .live-coach-principle-heading b{font-size:10px}.live-coach-principle-heading>span{padding:3px 5px;font-size:5.8px}
  .principle-diagnosis-card{gap:3px!important;padding:6px!important}
  .principle-diagnosis-title b{font-size:8.5px}.principle-diagnosis-title em{font-size:5.8px}
  .principle-diagnosis-evidence{font-size:7.5px!important;line-height:1.28!important}
  .principle-diagnosis-card>small{font-size:6.8px}.principle-diagnosis-card mark{font-size:5.8px}
  .live-coach-principle-note{font-size:6.5px!important}
}
/* End K-Mate v31 */
'''
write(styles_path, styles)
