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
# Clarify that Live Coach is controlled by the player and improve its controls.
# ---------------------------------------------------------------------------
index_path = ROOT / "index.html"
index = read(index_path)

head_marker = '''              <div class="live-coach-head">
                <div><div class="eyebrow">Live Coach · clock paused</div><h2 id="liveCoachTitle">Reviewing your move</h2></div>
                <span class="move-quality-badge quality-pending" id="liveCoachRating">Analyzing</span>
              </div>
              <div class="live-coach-board-legend" aria-label="Board highlight legend">'''
head_replacement = '''              <div class="live-coach-head">
                <div><div class="eyebrow">Live Coach · clock paused</div><h2 id="liveCoachTitle">Reviewing your move</h2></div>
                <span class="move-quality-badge quality-pending" id="liveCoachRating">Analyzing</span>
              </div>
              <div class="live-coach-pause-banner" id="liveCoachPauseBanner">
                <span>Review at your own pace</span>
                <b id="liveCoachPauseText">Both clocks remain paused until you tap Resume game.</b>
              </div>
              <div class="live-coach-board-legend" aria-label="Board highlight legend">'''
index = replace_once(index, head_marker, head_replacement, "Live Coach pause banner")

old_actions = '''              <div class="dialogactions live-coach-actions">
                <button class="btn" id="liveCoachSpeakButton" type="button">▶ Speak again</button>
                <button class="btn primary" id="liveCoachContinueButton" type="button">Continue game</button>
              </div>'''
new_actions = '''              <div class="dialogactions live-coach-actions">
                <button class="btn" id="liveCoachReplayHighlightsButton" type="button">↻ Replay highlights</button>
                <button class="btn" id="liveCoachSpeakButton" type="button">▶ Speak again</button>
                <button class="btn primary live-coach-resume" id="liveCoachContinueButton" type="button">Resume game</button>
              </div>'''
index = replace_once(index, old_actions, new_actions, "Live Coach actions")

index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=30.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=30.0.0", index)
write(index_path, index)


# ---------------------------------------------------------------------------
# Remove automatic resumption, keep the review open, and add highlight replay.
# ---------------------------------------------------------------------------
app_path = ROOT / "app-v7-part1.txt"
app = read(app_path)
app = app.replace("url.search = '?v=20260829-29';", "url.search = '?v=20260829-30';")

pending_marker = '''function renderLiveCoachPending(record) {
  if (!record) return;
  const rating = $('#liveCoachRating');'''
pending_replacement = '''function renderLiveCoachPending(record) {
  if (!record) return;
  const pauseText = $('#liveCoachPauseText');
  if (pauseText) pauseText.textContent = 'Both clocks remain paused until you tap Resume game.';
  const rating = $('#liveCoachRating');'''
app = replace_once(app, pending_marker, pending_replacement, "pending pause message")

slow_helper = r'''
function markLiveCoachAnalysisSlow(moveRecord) {
  if (!liveCoachState.awaiting || finalized || liveCoachState.moveId !== moveRecord?.id) return false;
  if (currentSession && !liveCoachState.slowNoticeShown) {
    currentSession.liveCoachAnalysisTimeouts = (currentSession.liveCoachAnalysisTimeouts || 0) + 1;
  }
  liveCoachState.slowNoticeShown = true;
  const rating = $('#liveCoachRating');
  if (rating) {
    rating.className = 'move-quality-badge quality-pending';
    rating.textContent = 'Still analyzing';
  }
  if ($('#liveCoachTitle')) $('#liveCoachTitle').textContent = `Taking a closer look at ${moveRecord?.san || 'your move'}`;
  if ($('#liveCoachSummary')) $('#liveCoachSummary').textContent = 'This position needs a little more calculation. The review will stay open and both clocks will remain paused. You may wait for the result or resume the game whenever you choose.';
  if ($('#liveCoachPauseText')) $('#liveCoachPauseText').textContent = 'No automatic countdown: the game resumes only when you tap Resume game.';
  if ($('#liveCoachWhy')) $('#liveCoachWhy').textContent = 'Stockfish is still checking whether the apparent evaluation change is stable and concrete.';
  if ($('#liveCoachBestText')) $('#liveCoachBestText').textContent = 'The preferred move and its purpose will appear as soon as the comparison is reliable.';
  setStatus('Live Coach is still analyzing. The clocks remain paused until you resume.', 'thinking');
  setLiveCoachBoardOpen(true);
  renderAll();
  return true;
}

function replayLiveCoachBoardHighlights() {
  const board = $('#board');
  if (!board || !(liveCoachState.awaiting || liveCoachState.open)) return;
  board.classList.remove('replay-live-coach-highlights');
  void board.offsetWidth;
  board.classList.add('replay-live-coach-highlights');
  window.setTimeout(() => board.classList.remove('replay-live-coach-highlights'), 1050);
}

'''
queue_marker = "function queueLiveCoachReview(moveRecord) {"
if slow_helper.strip() not in app:
    app = replace_once(app, queue_marker, slow_helper + queue_marker, "slow analysis and highlight replay helpers")

queue_pattern = re.compile(r"function queueLiveCoachReview\(moveRecord\) \{.*?\n\}\n\nfunction renderLiveCoachIntervention", re.S)
queue_replacement = r'''function queueLiveCoachReview(moveRecord) {
  resetLiveCoachFlow({ closePanel: true });
  pauseClockForTeaching();
  liveCoachState = {
    awaiting: true,
    open: false,
    sessionId: currentSession?.id || null,
    moveId: moveRecord?.id || null,
    record: moveRecord || null,
    narration: null,
    ignoredPrinciples: [],
    slowNoticeShown: false,
  };
  renderLiveCoachPending(moveRecord);
  liveCoachReviewTimer = window.setTimeout(() => {
    markLiveCoachAnalysisSlow(moveRecord);
  }, 16000);
}

function renderLiveCoachIntervention'''
app, replacements = queue_pattern.subn(queue_replacement, app, count=1)
if replacements != 1:
    raise SystemExit("Unable to replace queueLiveCoachReview")

render_intervention_marker = '''function renderLiveCoachIntervention(record, narration, ignoredPrinciples) {
  const rating = $('#liveCoachRating');'''
render_intervention_replacement = '''function renderLiveCoachIntervention(record, narration, ignoredPrinciples) {
  if ($('#liveCoachPauseText')) $('#liveCoachPauseText').textContent = 'Take as long as you need. Both clocks remain paused until you tap Resume game.';
  const rating = $('#liveCoachRating');'''
app = replace_once(app, render_intervention_marker, render_intervention_replacement, "completed review pause message")

open_marker = '''  renderAll();
  $('#boardCoachStage')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  if (settings.coachVoice !== false) window.setTimeout(() => speakLiveCoach(false), 180);'''
open_replacement = '''  renderAll();
  replayLiveCoachBoardHighlights();
  $('#boardCoachStage')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  if (settings.coachVoice !== false) window.setTimeout(() => speakLiveCoach(false), 180);'''
app = replace_once(app, open_marker, open_replacement, "initial comparison animation")

write(app_path, app)


# ---------------------------------------------------------------------------
# Bind controls, expose test state, and bump loader version.
# ---------------------------------------------------------------------------
part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = replace_once(
    part6,
    "  $('#liveCoachContinueButton')?.addEventListener('click', () => continueAfterLiveCoach());\n  $('#liveCoachSpeakButton')?.addEventListener('click', handleLiveCoachSpeak);",
    "  $('#liveCoachContinueButton')?.addEventListener('click', () => continueAfterLiveCoach());\n  $('#liveCoachReplayHighlightsButton')?.addEventListener('click', replayLiveCoachBoardHighlights);\n  $('#liveCoachSpeakButton')?.addEventListener('click', handleLiveCoachSpeak);",
    "Live Coach highlight replay binding",
)
part6 = part6.replace("version: '29.0-commercial-beta'", "version: '30.0-commercial-beta'")
part6 = part6.replace(
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, inline: true, panelVisible: Boolean($('#liveCoachBoardPanel') && !$('#liveCoachBoardPanel').hidden), moveId: liveCoachState.moveId, ignoredPrinciples: liveCoachState.ignoredPrinciples.map((principle) => principle.key) },",
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, inline: true, autoResume: false, slowNoticeShown: Boolean(liveCoachState.slowNoticeShown), panelVisible: Boolean($('#liveCoachBoardPanel') && !$('#liveCoachBoardPanel').hidden), moveId: liveCoachState.moveId, ignoredPrinciples: liveCoachState.ignoredPrinciples.map((principle) => principle.key) },",
)
part6 = replace_once(
    part6,
    "    forceLiveCoachIntervention: () => {",
    "    forceLiveCoachSlowState: () => {\n      const record = liveCoachState.record || currentSession?.userMoves?.[currentSession.userMoves.length - 1];\n      return record ? markLiveCoachAnalysisSlow(record) : false;\n    },\n    forceLiveCoachIntervention: () => {",
    "slow-state test helper",
)
write(part6_path, part6)

loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=30.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=30.0.0", loader)
write(loader_path, loader)


# ---------------------------------------------------------------------------
# Equal 50/50 coach-board layout, persistent controls, and clearer hierarchy.
# ---------------------------------------------------------------------------
styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v30 — persistent, player-controlled Live Coach with a balanced split */
.live-coach-active .board-coach-stage{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:stretch}
.live-coach-active .live-boardwrap{align-self:start}
.live-coach-board-panel{display:flex;flex-direction:column;height:100%;max-height:none;overscroll-behavior:contain}
.live-coach-pause-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0 3px;padding:9px 10px;border:1px solid #70b8ff42;border-radius:12px;background:linear-gradient(90deg,#70b8ff13,#ffffff04)}
.live-coach-pause-banner span{flex:0 0 auto;color:#a9d5ff;font-size:9px;font-weight:950;letter-spacing:.075em;text-transform:uppercase}
.live-coach-pause-banner b{color:#e4edf8;font-size:10px;line-height:1.35;text-align:right}
.live-coach-board-panel .live-coach-summary{font-size:12px}
.live-coach-board-panel .live-coach-comparison{margin-top:2px}
.live-coach-board-panel .live-coach-comparison article{box-shadow:inset 0 1px #fff1}
.live-coach-actions{position:sticky;bottom:-17px;z-index:20;margin-top:auto;padding:12px 0 4px;background:linear-gradient(180deg,transparent 0,#0d1610 32%,#0d1610 100%);box-shadow:0 -12px 18px #0d1610cc}
.live-coach-actions .btn{flex:1 1 0;min-width:0}
.live-coach-actions .live-coach-resume{min-width:148px;font-size:13px}
#board.replay-live-coach-highlights .sq.live-played-from,#board.replay-live-coach-highlights .sq.live-played-to{animation:kmatePlayedPulseV30 .9s ease-out}
#board.replay-live-coach-highlights .sq.live-best-from,#board.replay-live-coach-highlights .sq.live-best-to{animation:kmateBestPulseV30 .9s .08s ease-out}
#board.replay-live-coach-highlights .live-coach-board-arrows{animation:kmateArrowReplayV30 .85s ease-out}
@keyframes kmatePlayedPulseV30{0%{filter:brightness(1.75);transform:scale(.94)}55%{filter:brightness(1.18);transform:scale(1.025)}100%{filter:none;transform:none}}
@keyframes kmateBestPulseV30{0%{filter:brightness(1.9);transform:scale(.93)}55%{filter:brightness(1.22);transform:scale(1.03)}100%{filter:none;transform:none}}
@keyframes kmateArrowReplayV30{0%{opacity:0;transform:scale(.97)}45%{opacity:1}100%{opacity:1;transform:none}}

@media(max-width:760px){
  .live-coach-active .board-coach-stage{
    grid-template-columns:minmax(0,1fr);
    grid-template-rows:minmax(0,1fr) minmax(0,1fr);
    height:clamp(470px,65dvh,610px);
    min-height:0;
    overflow:hidden;
  }
  .live-coach-active .live-boardwrap{
    width:min(86vw,calc(32.5dvh - 10px),290px);
    max-width:100%;
    max-height:100%;
    align-self:center;
    justify-self:center;
  }
  .live-coach-active .live-coach-board-panel{
    width:100%;
    height:100%;
    min-height:0;
    max-height:none;
    overflow:auto;
    padding:10px 10px 0;
  }
  .live-coach-active .live-coach-head{align-items:center}
  .live-coach-active .live-coach-head h2{margin-top:2px;font-size:16px}
  .live-coach-active .live-coach-pause-banner{margin:6px 0 2px;padding:6px 7px}
  .live-coach-active .live-coach-pause-banner span{font-size:7px}
  .live-coach-active .live-coach-pause-banner b{font-size:7.5px}
  .live-coach-active .live-coach-summary{max-height:47px;font-size:8.8px}
  .live-coach-active .live-coach-comparison p{max-height:72px;font-size:8.5px}
  .live-coach-active .live-coach-actions{bottom:0;margin-left:-10px;margin-right:-10px;padding:9px 10px 8px;gap:4px}
  .live-coach-active .live-coach-actions .btn{min-height:36px;padding:0 6px;font-size:8px}
  .live-coach-active .live-coach-actions .live-coach-resume{min-width:105px;font-size:9.5px}
}

@media(max-width:430px){
  .live-coach-active .board-coach-stage{height:clamp(465px,64dvh,570px)}
  .live-coach-active .live-boardwrap{width:min(80vw,calc(32dvh - 10px),270px)}
}

@media(max-height:720px) and (max-width:760px){
  .live-coach-active .board-coach-stage{height:clamp(430px,62dvh,490px)}
  .live-coach-active .live-boardwrap{width:min(67vw,calc(31dvh - 8px),225px)}
  .live-coach-active .live-coach-principles{display:none}
}
/* End K-Mate v30 */
'''
write(styles_path, styles)
