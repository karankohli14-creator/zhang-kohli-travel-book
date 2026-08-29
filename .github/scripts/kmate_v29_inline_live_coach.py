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
# Move the Live Coach from a modal onto the active game board view.
# ---------------------------------------------------------------------------
index_path = ROOT / "index.html"
index = read(index_path)

old_board = '          <div class="boardwrap"><div class="board" id="board" aria-label="Interactive chessboard"></div></div>'
inline_board = '''          <div class="board-coach-stage" id="boardCoachStage">
            <div class="boardwrap live-boardwrap"><div class="board" id="board" aria-label="Interactive chessboard"></div></div>

            <section class="live-coach-board-panel" id="liveCoachBoardPanel" hidden aria-live="polite" aria-label="Live Coach board review">
              <div class="live-coach-head">
                <div><div class="eyebrow">Live Coach · clock paused</div><h2 id="liveCoachTitle">Reviewing your move</h2></div>
                <span class="move-quality-badge quality-pending" id="liveCoachRating">Analyzing</span>
              </div>
              <div class="live-coach-board-legend" aria-label="Board highlight legend">
                <span class="played"><i></i>Your played move</span>
                <span class="best"><i></i>Engine best move</span>
              </div>
              <p class="live-coach-summary" id="liveCoachSummary">K-Mate is comparing your move with the strongest continuation.</p>
              <div class="live-coach-comparison">
                <article class="your-move">
                  <small>Your move</small><b id="liveCoachYourMove">—</b>
                  <p id="liveCoachWhy">Analysis pending.</p>
                </article>
                <article class="best-move">
                  <small>Best move</small><b id="liveCoachBestMove">—</b>
                  <p id="liveCoachBestText">Analysis pending.</p>
                </article>
              </div>
              <section class="live-coach-principles" id="liveCoachPrinciples" hidden>
                <small>Principles this move appears to have overlooked</small>
                <div class="live-coach-principle-list" id="liveCoachPrincipleList"></div>
                <span id="liveCoachPrinciplesText" hidden></span>
              </section>
              <section class="live-coach-line-wrap">
                <small>Illustrative best continuation</small>
                <div class="live-coach-line" id="liveCoachLine">Principal variation pending.</div>
              </section>
              <div class="dialogactions live-coach-actions">
                <button class="btn" id="liveCoachSpeakButton" type="button">▶ Speak again</button>
                <button class="btn primary" id="liveCoachContinueButton" type="button">Continue game</button>
              </div>
            </section>
          </div>'''
index = replace_once(index, old_board, inline_board, "inline board stage")

old_toggle = '<span><b>Live Coach after bad moves</b><small>After an Inaccurate, Miss, or Blunder, pause both clocks and explain your move, the best move, and the principles overlooked.</small></span>'
new_toggle = '<span><b>Live Coach after bad moves</b><small>After an Inaccurate, Miss, or Blunder, pause both clocks, keep the board visible, and compare your move with the best move directly on the board.</small></span>'
index = replace_once(index, old_toggle, new_toggle, "live coach setup description")

modal_pattern = re.compile(
    r'\n  <dialog id="liveCoachDialog" class="modal live-coach-modal">.*?</dialog>\n\n  <dialog id="promotionDialog"',
    re.S,
)
index, replacements = modal_pattern.subn('\n  <dialog id="promotionDialog"', index, count=1)
if replacements != 1:
    raise SystemExit("Unable to remove old Live Coach modal")

index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=29.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=29.0.0", index)
write(index_path, index)


# ---------------------------------------------------------------------------
# Board comparison arrows, inline-panel lifecycle, and compact coach pause.
# ---------------------------------------------------------------------------
app_path = ROOT / "app-v7-part1.txt"
app = read(app_path)

app = app.replace("url.search = '?v=20260829-28';", "url.search = '?v=20260829-29';")

helpers = r'''
function activeLiveCoachRecord() {
  if (!(liveCoachState.awaiting || liveCoachState.open)) return null;
  return liveCoachState.record || null;
}

function liveCoachBoardMoves() {
  const record = activeLiveCoachRecord();
  if (!record) return null;
  const played = normalizeUciMove(record.uci);
  const best = normalizeUciMove(record.bestMove);
  return {
    played,
    playedFrom: played ? played.slice(0, 2) : null,
    playedTo: played ? played.slice(2, 4) : null,
    best,
    bestFrom: best ? best.slice(0, 2) : null,
    bestTo: best ? best.slice(2, 4) : null,
  };
}

function decorateLiveCoachSquare(button, square) {
  const moves = liveCoachBoardMoves();
  if (!moves) return;
  if (square === moves.playedFrom) button.classList.add('live-played-from');
  if (square === moves.playedTo) button.classList.add('live-played-to');
  if (square === moves.bestFrom) button.classList.add('live-best-from');
  if (square === moves.bestTo) button.classList.add('live-best-to');

  const labels = [];
  if (square === moves.playedTo) labels.push({ key: 'played', text: 'PLAYED' });
  if (moves.best && square === moves.bestTo) labels.push({ key: 'best', text: 'BEST' });
  for (const label of labels) {
    const marker = document.createElement('span');
    marker.className = `live-coach-square-label ${label.key}`;
    marker.textContent = label.text;
    marker.setAttribute('aria-hidden', 'true');
    button.append(marker);
  }
}

function boardSquareCenter(square) {
  const squares = orderedSquares();
  const index = squares.indexOf(square);
  if (index < 0) return null;
  return {
    x: ((index % 8) + 0.5) * 12.5,
    y: (Math.floor(index / 8) + 0.5) * 12.5,
  };
}

function renderLiveCoachBoardArrows(board) {
  const moves = liveCoachBoardMoves();
  if (!board || !moves?.playedFrom || !moves?.playedTo) return;
  const playedFrom = boardSquareCenter(moves.playedFrom);
  const playedTo = boardSquareCenter(moves.playedTo);
  const bestFrom = moves.bestFrom ? boardSquareCenter(moves.bestFrom) : null;
  const bestTo = moves.bestTo ? boardSquareCenter(moves.bestTo) : null;
  if (!playedFrom || !playedTo) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'live-coach-board-arrows');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const sameMove = Boolean(moves.best && sameUciMove(moves.played, moves.best));
  svg.innerHTML = `
    <defs>
      <marker id="km-live-played-arrow" viewBox="0 0 10 10" refX="8.3" refY="5" markerWidth="4.6" markerHeight="4.6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#ff9d4d"/></marker>
      <marker id="km-live-best-arrow" viewBox="0 0 10 10" refX="8.3" refY="5" markerWidth="4.6" markerHeight="4.6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#7cf58a"/></marker>
    </defs>
    <line class="played-arrow" x1="${playedFrom.x}" y1="${playedFrom.y}" x2="${playedTo.x}" y2="${playedTo.y}" marker-end="url(#km-live-played-arrow)"/>
    ${!sameMove && bestFrom && bestTo ? `<line class="best-arrow" x1="${bestFrom.x}" y1="${bestFrom.y}" x2="${bestTo.x}" y2="${bestTo.y}" marker-end="url(#km-live-best-arrow)"/>` : ''}
  `;
  board.append(svg);
}

'''
render_board_marker = "function renderBoard() {"
if helpers.strip() not in app:
    app = replace_once(app, render_board_marker, helpers + render_board_marker, "board comparison helpers")

rating_marker = """    if (ratedMoveSquare?.square === square) {
      button.classList.add('move-quality-square', `quality-${ratedMoveSquare.key}`);
      button.dataset.moveQuality = ratedMoveSquare.label || ratedMoveSquare.key;
      button.title = `${ratedMoveSquare.label || 'Analyzing'} move destination`;
    }
    const legal = legalMoves.find((move) => move.to === square);"""
rating_replacement = """    if (ratedMoveSquare?.square === square) {
      button.classList.add('move-quality-square', `quality-${ratedMoveSquare.key}`);
      button.dataset.moveQuality = ratedMoveSquare.label || ratedMoveSquare.key;
      button.title = `${ratedMoveSquare.label || 'Analyzing'} move destination`;
    }
    decorateLiveCoachSquare(button, square);
    const legal = legalMoves.find((move) => move.to === square);"""
app = replace_once(app, rating_marker, rating_replacement, "live coach square decoration")

board_end_marker = """    board.append(button);
  });
}

function renderTurns() {"""
board_end_replacement = """    board.append(button);
  });
  renderLiveCoachBoardArrows(board);
}

function renderTurns() {"""
app = replace_once(app, board_end_marker, board_end_replacement, "board arrows")

render_turns_pattern = re.compile(r"function renderTurns\(\) \{.*?\n\}\n\nfunction moveRatingForRecord", re.S)
render_turns = r'''function renderTurns() {
  if (!game) return;
  const coachPause = !finalized && Boolean(liveCoachState.awaiting || liveCoachState.open);
  const userLive = !thinking && !finalized && !coachPause && game.turn() === userColor;
  const engineLive = !finalized && !coachPause && game.turn() === engineColor;
  $('#userTurn').textContent = finalized ? 'Finished' : coachPause ? 'Coach review' : userLive ? 'Your move' : 'Waiting';
  $('#userTurn').classList.toggle('live', userLive);
  $('#engineTurn').textContent = finalized ? 'Finished' : coachPause ? 'Clock paused' : thinking ? 'Thinking…' : engineLive ? 'To move' : 'Waiting';
  $('#engineTurn').classList.toggle('live', engineLive);
  $('#userBar').classList.toggle('active', userLive);
  $('#engineBar').classList.toggle('active', engineLive);
  $('#gameView')?.classList.toggle('live-coach-active', coachPause);
  $('#boardCoachStage')?.classList.toggle('coach-open', coachPause);
}

function moveRatingForRecord'''
app, replacements = render_turns_pattern.subn(render_turns, app, count=1)
if replacements != 1:
    raise SystemExit("Unable to replace renderTurns")

panel_helpers = r'''
function setLiveCoachBoardOpen(open) {
  const visible = Boolean(open);
  const panel = $('#liveCoachBoardPanel');
  if (panel) panel.hidden = !visible;
  $('#gameView')?.classList.toggle('live-coach-active', visible);
  $('#boardCoachStage')?.classList.toggle('coach-open', visible);
}

function renderLiveCoachPending(record) {
  if (!record) return;
  const rating = $('#liveCoachRating');
  if (rating) {
    rating.className = 'move-quality-badge quality-pending';
    rating.textContent = 'Analyzing';
  }
  if ($('#liveCoachTitle')) $('#liveCoachTitle').textContent = `Checking ${record.san}`;
  if ($('#liveCoachSummary')) $('#liveCoachSummary').textContent = 'Both clocks are paused while Stockfish compares your move with the strongest continuation. Your played move is already highlighted on the board.';
  if ($('#liveCoachYourMove')) $('#liveCoachYourMove').textContent = record.san || readableEngineMove(record.uci);
  if ($('#liveCoachWhy')) $('#liveCoachWhy').textContent = 'The coach is measuring the evaluation change and looking for the concrete reason behind it.';
  if ($('#liveCoachBestMove')) $('#liveCoachBestMove').textContent = 'Analyzing…';
  if ($('#liveCoachBestText')) $('#liveCoachBestText').textContent = 'The best move and its purpose will appear here when analysis finishes.';
  if ($('#liveCoachPrinciples')) $('#liveCoachPrinciples').hidden = true;
  if ($('#liveCoachPrincipleList')) $('#liveCoachPrincipleList').innerHTML = '';
  if ($('#liveCoachPrinciplesText')) $('#liveCoachPrinciplesText').textContent = '';
  if ($('#liveCoachLine')) $('#liveCoachLine').textContent = 'Principal variation pending.';
  setLiveCoachBoardOpen(true);
}

'''
reset_marker = "function resetLiveCoachFlow({ closeModal = false } = {}) {"
if panel_helpers.strip() not in app:
    app = replace_once(app, reset_marker, panel_helpers + reset_marker, "inline panel helpers")

reset_pattern = re.compile(r"function resetLiveCoachFlow\(\{ closeModal = false \} = \{\}\) \{.*?\n\}\n\nfunction queueLiveCoachReview", re.S)
reset_replacement = r'''function resetLiveCoachFlow({ closeModal = false, closePanel = false } = {}) {
  if (liveCoachReviewTimer) window.clearTimeout(liveCoachReviewTimer);
  liveCoachReviewTimer = null;
  stopLiveCoachSpeech();
  liveCoachState = { awaiting: false, open: false, sessionId: null, moveId: null, record: null, narration: null, ignoredPrinciples: [] };
  if (closeModal || closePanel) setLiveCoachBoardOpen(false);
}

function queueLiveCoachReview'''
app, replacements = reset_pattern.subn(reset_replacement, app, count=1)
if replacements != 1:
    raise SystemExit("Unable to replace resetLiveCoachFlow")

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
  };
  renderLiveCoachPending(moveRecord);
  liveCoachReviewTimer = window.setTimeout(() => {
    if (!liveCoachState.awaiting || finalized || liveCoachState.moveId !== moveRecord?.id) return;
    if (currentSession) currentSession.liveCoachAnalysisTimeouts = (currentSession.liveCoachAnalysisTimeouts || 0) + 1;
    toast('Live Coach analysis took too long, so play is resuming');
    continueAfterLiveCoach({ automatic: true });
  }, 16000);
}

function renderLiveCoachIntervention'''
app, replacements = queue_pattern.subn(queue_replacement, app, count=1)
if replacements != 1:
    raise SystemExit("Unable to replace queueLiveCoachReview")

open_pattern = re.compile(r"function openLiveCoachIntervention\(record\) \{.*?\n\}\n\nfunction handleLiveCoachAnalysis", re.S)
open_replacement = r'''function openLiveCoachIntervention(record) {
  const decisionNumber = Math.max(1, (currentSession?.userMoves || []).findIndex((move) => move.id === record.id) + 1);
  const narration = coachNarrationForRecord(record, currentSession, decisionNumber);
  const ignoredPrinciples = settings.principleReview ? ignoredPrinciplesForMove(record, currentSession) : [];
  record.ignoredPrinciples = ignoredPrinciples.map((principle) => principle.key);
  record.liveCoachIntervention = true;
  if (currentSession) currentSession.liveCoachInterventions = (currentSession.liveCoachInterventions || 0) + 1;
  liveCoachState = { ...liveCoachState, awaiting: false, open: true, record, narration, ignoredPrinciples };
  renderLiveCoachIntervention(record, narration, ignoredPrinciples);
  setLiveCoachBoardOpen(true);
  setStatus(`${narration.band.label}: compare the orange played move with the green best move on the board.`, 'bad');
  renderAll();
  $('#boardCoachStage')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  if (settings.coachVoice !== false) window.setTimeout(() => speakLiveCoach(false), 180);
}

function handleLiveCoachAnalysis'''
app, replacements = open_pattern.subn(open_replacement, app, count=1)
if replacements != 1:
    raise SystemExit("Unable to replace openLiveCoachIntervention")

# The inline panel is no longer a dialog, but existing closeModal callers remain
# compatible through resetLiveCoachFlow above.

write(app_path, app)


# ---------------------------------------------------------------------------
# Event bindings, debug state, and version/cache updates.
# ---------------------------------------------------------------------------
part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = part6.replace("  $('#liveCoachDialog')?.addEventListener('cancel', (event) => { event.preventDefault(); continueAfterLiveCoach(); });\n", "")
part6 = part6.replace("version: '28.0-commercial-beta'", "version: '29.0-commercial-beta'")
part6 = part6.replace(
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, moveId: liveCoachState.moveId, ignoredPrinciples: liveCoachState.ignoredPrinciples.map((principle) => principle.key) },",
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, inline: true, panelVisible: Boolean($('#liveCoachBoardPanel') && !$('#liveCoachBoardPanel').hidden), moveId: liveCoachState.moveId, ignoredPrinciples: liveCoachState.ignoredPrinciples.map((principle) => principle.key) },",
)
write(part6_path, part6)

loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=29.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=29.0.0", loader)
write(loader_path, loader)


# ---------------------------------------------------------------------------
# Responsive inline layout and simultaneous board highlighting.
# ---------------------------------------------------------------------------
styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v29 — inline Live Coach with the board always visible */
.board-coach-stage{min-width:0}
.live-coach-board-panel[hidden]{display:none!important}
.live-coach-board-panel{min-width:0;padding:17px;border:1px solid #f4cc7040;border-radius:18px;background:radial-gradient(circle at 100% 0,#7cf58a14,transparent 18rem),linear-gradient(145deg,#17231a,#0c140f);box-shadow:0 20px 55px #0007;overflow:auto}
.live-coach-board-legend{display:flex;flex-wrap:wrap;gap:7px;margin:9px 0 2px}
.live-coach-board-legend span{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid #ffffff15;border-radius:99px;background:#ffffff06;color:#dce4de;font-size:9px;font-weight:900;letter-spacing:.045em;text-transform:uppercase}
.live-coach-board-legend i{display:block;width:10px;height:10px;border-radius:3px;box-shadow:0 0 0 2px #0003}
.live-coach-board-legend .played i{background:#ff9d4d}.live-coach-board-legend .best i{background:#7cf58a}
.live-coach-active .playgrid{grid-template-columns:minmax(0,1fr)}
.live-coach-active .sidepanel{display:none}
.live-coach-active .boardcol{width:100%;max-width:1120px;margin:0 auto}
.live-coach-active .board-coach-stage{display:grid;grid-template-columns:minmax(300px,.92fr) minmax(360px,1.08fr);gap:13px;align-items:start;padding:10px;border:1px solid #ffffff13;border-radius:20px;background:#09110c;box-shadow:0 24px 70px #0007}
.live-coach-active .live-boardwrap{padding:4px;border:1px solid #ffffff18;border-radius:15px;background:#101a13;box-shadow:0 18px 46px #0009}
.live-coach-active .live-boardwrap #board{border-radius:10px}
.live-coach-active .live-coach-board-panel{max-height:calc(min(760px,100dvh - 170px))}
.live-coach-active .hint-card{display:none}
.live-coach-active .playerbar{max-width:1120px}

#board{position:relative}
#board .sq.live-played-from{box-shadow:inset 0 0 0 4px #ff9d4dcc,inset 0 0 0 999px #ff9d4d22!important}
#board .sq.live-played-to{z-index:5;box-shadow:inset 0 0 0 6px #ff9d4d,inset 0 0 0 999px #ff9d4d38,0 0 17px #ff9d4d88!important}
#board .sq.live-best-from{box-shadow:inset 0 0 0 4px #7cf58acc,inset 0 0 0 999px #7cf58a20!important}
#board .sq.live-best-to{z-index:5;box-shadow:inset 0 0 0 6px #7cf58a,inset 0 0 0 999px #7cf58a35,0 0 18px #7cf58a8a!important}
#board .sq.live-played-from.live-best-from{box-shadow:inset 0 0 0 4px #f4cc70,inset 0 0 0 999px #f4cc702b!important}
.live-coach-square-label{position:absolute;z-index:10;left:3px;bottom:3px;display:grid;place-items:center;min-width:27px;height:16px;padding:0 4px;border:1px solid #fff8;border-radius:99px;color:#10130f;font:950 6.5px/1 system-ui,sans-serif;letter-spacing:.045em;pointer-events:none;box-shadow:0 3px 8px #0008}
.live-coach-square-label.played{background:#ff9d4d}.live-coach-square-label.best{left:auto;right:3px;background:#7cf58a}
.live-coach-board-arrows{position:absolute;inset:0;z-index:7;width:100%;height:100%;overflow:visible;pointer-events:none}
.live-coach-board-arrows line{vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 2px 2px #000b)}
.live-coach-board-arrows .played-arrow{stroke:#ff9d4d;stroke-width:2.5;stroke-dasharray:3.5 2.1;opacity:.94}
.live-coach-board-arrows .best-arrow{stroke:#7cf58a;stroke-width:2.8;opacity:.96}

@media(max-width:760px){
  .live-coach-active .playtop{margin-bottom:7px}
  .live-coach-active .playtop h1{font-size:22px}
  .live-coach-active .board-coach-stage{grid-template-columns:minmax(0,1fr);gap:7px;padding:6px;border-radius:14px}
  .live-coach-active .live-boardwrap{width:min(66vw,270px);margin:0 auto;padding:2px;border-radius:10px}
  .live-coach-active .live-coach-board-panel{max-height:min(37dvh,300px);padding:10px;border-radius:13px}
  .live-coach-active .playerbar{min-height:52px;padding:6px 9px}
  .live-coach-active .playerbar .avatar{width:34px;height:34px;font-size:22px}
  .live-coach-active .clock{min-width:75px;padding:5px 7px;font-size:20px}
  .live-coach-active .status{display:none}
  .live-coach-active .live-coach-head h2{font-size:17px}
  .live-coach-active .live-coach-summary{max-height:54px;overflow:auto;margin:7px 0!important;padding:7px 8px;font-size:9.5px;line-height:1.3}
  .live-coach-active .live-coach-board-legend{margin:5px 0 1px;gap:4px}
  .live-coach-active .live-coach-board-legend span{padding:3px 6px;font-size:7px}
  .live-coach-active .live-coach-comparison{grid-template-columns:1fr 1fr;gap:5px}
  .live-coach-active .live-coach-comparison article{padding:7px;border-radius:9px}
  .live-coach-active .live-coach-comparison small{font-size:7px}.live-coach-active .live-coach-comparison b{font-size:14px}
  .live-coach-active .live-coach-comparison p{max-height:65px;overflow:auto;margin-top:3px!important;font-size:8.3px;line-height:1.25}
  .live-coach-active .live-coach-principles,.live-coach-active .live-coach-line-wrap{margin-top:6px;padding:7px;border-radius:9px}
  .live-coach-active .live-coach-principle-list{gap:4px;margin-top:5px}.live-coach-active .live-coach-principle-list article{padding:5px 6px}.live-coach-active .live-coach-principle-list span{font-size:7.5px}
  .live-coach-active .live-coach-line{font-size:8px;line-height:1.35}
  .live-coach-active .live-coach-actions{margin-top:7px;gap:5px}.live-coach-active .live-coach-actions .btn{min-height:34px;padding:0 8px;font-size:9px}
  .live-coach-square-label{min-width:23px;height:14px;font-size:5.5px}
  .live-coach-board-arrows .played-arrow{stroke-width:2.1}.live-coach-board-arrows .best-arrow{stroke-width:2.35}
}

@media(max-width:430px){
  .live-coach-active .live-boardwrap{width:min(64vw,250px)}
  .live-coach-active .live-coach-board-panel{max-height:min(36dvh,285px)}
}

@media(max-height:720px) and (max-width:760px){
  .live-coach-active .live-boardwrap{width:min(54vw,205px)}
  .live-coach-active .live-coach-board-panel{max-height:250px}
  .live-coach-active .playerbar{min-height:46px}
  .live-coach-active .live-coach-summary{display:none}
}
/* End K-Mate v29 */
'''
write(styles_path, styles)
