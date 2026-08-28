from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# HTML: setup option, in-game hint card, and cache busting.
# -----------------------------------------------------------------------------
path = "kmate-trainer/index.html"
s = read(path)

blind_block = '''          <label class="calibration-toggle">
            <input id="blindCalibration" type="checkbox">
            <span><b>Blind Elo calibration</b><small>Hide the opponent setting, estimate it after the position, and help validate K-Mate’s scale.</small></span>
          </label>
'''
hint_toggle = blind_block + '''
          <label class="calibration-toggle hint-toggle">
            <input id="autoHints" type="checkbox">
            <span><b>Automatic hints before every move</b><small>Show a strategic idea at the start of each turn. The exact candidate remains hidden unless you reveal it.</small></span>
          </label>
'''
if 'id="autoHints"' not in s:
    s = replace_once(s, blind_block, hint_toggle, "automatic-hints setup toggle")

brief_block = '''            <div class="brief">
              <b>Your assignment</b>
              <span>Play the position out. There is no single prescribed puzzle move.</span>
            </div>
            <div class="live-quality">'''
hint_card = '''            <div class="brief">
              <b>Your assignment</b>
              <span>Play the position out. There is no single prescribed puzzle move.</span>
            </div>
            <section class="hint-card" id="hintCard" aria-live="polite">
              <div class="hint-head">
                <div><small>Coach hint</small><b id="hintTitle">Hidden for this move</b></div>
                <button class="hint-action" id="showHintButton" type="button">Show Hint</button>
              </div>
              <p id="hintText">Try the position first, or reveal a strategic hint whenever you need one.</p>
              <span class="hint-mode-label" id="hintModeLabel">On-demand hints</span>
            </section>
            <div class="live-quality">'''
if 'id="hintCard"' not in s:
    s = replace_once(s, brief_block, hint_card, "in-game hint card")

s = re.sub(r'\./styles-v7\.css\?v=\d+\.\d+\.\d+', './styles-v7.css?v=18.0.0', s)
s = re.sub(r'\./app-v7\.js\?v=\d+\.\d+\.\d+', './app-v7.js?v=18.0.0', s)
write(path, s)


# -----------------------------------------------------------------------------
# Application logic: persistent hint setting, progressive hints, and rated square.
# -----------------------------------------------------------------------------
path = "kmate-trainer/app-v7-part1.txt"
s = read(path)

s = replace_once(
    s,
    "  blindCalibration: false,\n};",
    "  blindCalibration: false,\n  autoHints: false,\n};",
    "default auto-hint setting",
)

s = replace_once(
    s,
    "let recommendationState = null;\n",
    "let recommendationState = null;\nlet ratedMoveSquare = null;\nlet hintRequestId = 0;\nlet hintState = { fen: null, status: 'idle', level: 0, strategicText: '', exactText: '', candidate: null, requestedReveal: false, counted: false, revealCounted: false };\n",
    "hint and rated-square state",
)

s = replace_once(
    s,
    "  if ($('#blindCalibration')) $('#blindCalibration').checked = Boolean(settings.blindCalibration);\n  updateControls(false);",
    "  if ($('#blindCalibration')) $('#blindCalibration').checked = Boolean(settings.blindCalibration);\n  if ($('#autoHints')) $('#autoHints').checked = Boolean(settings.autoHints);\n  updateControls(false);",
    "apply auto-hint control",
)

s = replace_once(
    s,
    "  settings.blindCalibration = Boolean($('#blindCalibration')?.checked);\n  $('#positionValue').textContent = settings.positionRating;",
    "  settings.blindCalibration = Boolean($('#blindCalibration')?.checked);\n  settings.autoHints = Boolean($('#autoHints')?.checked);\n  $('#positionValue').textContent = settings.positionRating;",
    "read auto-hint control",
)

# New-position reset and session metadata.
s = replace_once(
    s,
    "  finalized = false;\n  startFullmove = Number(current.fen.split(/\\s+/)[5]) || 1;",
    "  finalized = false;\n  ratedMoveSquare = null;\n  resetHintState();\n  startFullmove = Number(current.fen.split(/\\s+/)[5]) || 1;",
    "reset hint and square state",
)

s = replace_once(
    s,
    "    blindCalibration: Boolean(settings.blindCalibration),\n    perceivedRating: null,",
    "    blindCalibration: Boolean(settings.blindCalibration),\n    autoHints: Boolean(settings.autoHints),\n    hintsUsed: 0,\n    candidateReveals: 0,\n    perceivedRating: null,",
    "session hint metadata",
)

s = replace_once(
    s,
    "  $('#liveCpl').textContent = '—';\n\n  showView('game');",
    "  $('#liveCpl').textContent = '—';\n  if ($('#moveQualityBadge')) $('#moveQualityBadge').hidden = true;\n\n  showView('game');",
    "reset live move badge",
)

s = replace_once(
    s,
    "  renderAll();\n\n  if (game.isGameOver()) {",
    "  renderAll();\n  prepareHintForTurn();\n\n  if (game.isGameOver()) {",
    "prepare initial hint",
)

# Destination-square rating class.
s = replace_once(
    s,
    "    if (lastMove && (lastMove.from === square || lastMove.to === square)) button.classList.add('last');\n    const legal = legalMoves.find((move) => move.to === square);",
    "    if (lastMove && (lastMove.from === square || lastMove.to === square)) button.classList.add('last');\n    if (ratedMoveSquare?.square === square) {\n      button.classList.add('move-quality-square', `quality-${ratedMoveSquare.key}`);\n      button.dataset.moveQuality = ratedMoveSquare.label || ratedMoveSquare.key;\n      button.title = `${ratedMoveSquare.label || 'Analyzing'} move destination`;\n    }\n    const legal = legalMoves.find((move) => move.to === square);",
    "rated destination square rendering",
)

# Keep hint UI synchronized with every ordinary render.
s = replace_once(
    s,
    "  renderMaterialAdvantage();\n  renderClocks();",
    "  renderMaterialAdvantage();\n  renderHintPanel();\n  renderClocks();",
    "render hint panel",
)

hint_functions = r'''
function blankHintState(status = 'hidden') {
  return {
    fen: game?.fen() || null,
    status,
    level: 0,
    strategicText: '',
    exactText: '',
    candidate: null,
    requestedReveal: false,
    counted: false,
    revealCounted: false,
  };
}

function resetHintState(status = null) {
  hintRequestId += 1;
  const userTurn = Boolean(game && !finalized && game.turn() === userColor);
  hintState = blankHintState(status || (userTurn ? 'hidden' : 'waiting'));
  renderHintPanel();
}

function pieceName(type) {
  return ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' })[type] || 'piece';
}

function compactThemeHint() {
  const tag = current?.tags?.[0];
  const advice = {
    calculation: 'Calculate checks, captures, and threats before choosing a quiet move.',
    'king safety': 'Compare both kings and look for forcing moves near the less secure one.',
    'pawn breaks': 'Identify which pawn break changes the files and diagonals in your favor.',
    'piece activity': 'Find your least active piece and compare its most forcing improvements.',
    'pawn structure': 'Separate permanent weaknesses from temporary tactical opportunities.',
    conversion: 'Prefer simplification only when the resulting position keeps your advantage.',
    prophylaxis: 'Name the opponent’s strongest idea before beginning your own plan.',
    space: 'Use your space to improve pieces rather than pushing another pawn automatically.',
    'endgame transition': 'Evaluate the resulting ending before exchanging major pieces.',
    'rook activity': 'Look for active files, checks, and ways to cut off the king.',
    'passed pawns': 'Calculate the pawn race and the best blockading square.',
    'king activity': 'Treat the king as an active piece and approach the critical squares.',
    opposition: 'Check direct, distant, and side opposition before moving the king.',
  };
  return advice[tag] || 'Start with the opponent’s threat, then compare checks, captures, and forcing threats.';
}

function buildProgressiveHint(move) {
  const piece = pieceName(move?.piece);
  const source = move?.from || 'its current square';
  let lead;
  if (move?.san?.includes('#')) {
    lead = `There is a mating idea. Begin by examining forcing moves with the ${piece} on ${source}.`;
  } else if (move?.san?.includes('+')) {
    lead = `A forcing check is the key candidate. Focus on the ${piece} on ${source}.`;
  } else if (move?.captured) {
    lead = `A concrete capture changes the position. Calculate with the ${piece} on ${source}, including every recapture.`;
  } else if (move?.flags?.includes('k') || move?.flags?.includes('q')) {
    lead = 'King safety is the priority. Compare castling with immediate tactical alternatives.';
  } else if (move?.piece === 'p') {
    lead = `A pawn move changes the structure. Focus on the pawn on ${source} and calculate what opens afterward.`;
  } else {
    lead = `The strongest candidate improves or activates the ${piece} on ${source}.`;
  }
  return {
    strategicText: `${lead} ${compactThemeHint()}`,
    exactText: move?.san
      ? `Candidate: ${move.san} (${move.from}→${move.to}). Verify the opponent’s strongest reply before playing it.`
      : 'No exact candidate is available; use the strategic hint and compare two serious moves.',
  };
}

function renderHintPanel() {
  const card = $('#hintCard');
  const title = $('#hintTitle');
  const text = $('#hintText');
  const button = $('#showHintButton');
  const mode = $('#hintModeLabel');
  if (!card || !title || !text || !button || !mode) return;

  const automatic = Boolean(settings.autoHints);
  mode.textContent = automatic ? 'Automatic strategic hints' : 'On-demand hints';
  card.classList.toggle('automatic', automatic);
  card.classList.toggle('loading', hintState.status === 'loading');

  if (!game || finalized) {
    title.textContent = 'Hints unavailable';
    text.textContent = 'Start a position to receive coaching hints.';
    button.textContent = 'Show Hint';
    button.disabled = true;
    return;
  }
  if (game.turn() !== userColor || thinking) {
    title.textContent = 'Waiting for your turn';
    text.textContent = 'A fresh hint will be prepared when the opponent finishes moving.';
    button.textContent = 'Show Hint';
    button.disabled = true;
    return;
  }
  if (hintState.status === 'loading') {
    title.textContent = 'Analyzing the position…';
    text.textContent = 'The coach is finding a useful idea without revealing the entire move.';
    button.textContent = 'Analyzing…';
    button.disabled = true;
    return;
  }
  if (hintState.level >= 2) {
    title.textContent = 'Candidate revealed';
    text.textContent = `${hintState.strategicText} ${hintState.exactText}`.trim();
    button.textContent = 'Candidate shown';
    button.disabled = true;
    return;
  }
  if (hintState.level === 1) {
    title.textContent = 'Strategic hint';
    text.textContent = hintState.strategicText || compactThemeHint();
    button.textContent = hintState.candidate ? 'Reveal candidate' : 'Hint shown';
    button.disabled = !hintState.candidate;
    return;
  }

  title.textContent = automatic ? 'Automatic hint preparing' : 'Hidden for this move';
  text.textContent = automatic
    ? 'A strategic clue will appear automatically before you move.'
    : 'Try the position first, or reveal a strategic hint whenever you need one.';
  button.textContent = 'Show Hint';
  button.disabled = false;
}

function countHintUse(level) {
  if (!currentSession) return;
  if (level >= 1 && !hintState.counted) {
    currentSession.hintsUsed = (currentSession.hintsUsed || 0) + 1;
    hintState.counted = true;
  }
  if (level >= 2 && !hintState.revealCounted) {
    currentSession.candidateReveals = (currentSession.candidateReveals || 0) + 1;
    hintState.revealCounted = true;
  }
}

async function requestHint(revealCandidate = false) {
  if (!game || finalized || thinking || game.turn() !== userColor) return;
  const fen = game.fen();

  if (hintState.fen === fen && hintState.status === 'ready') {
    if (revealCandidate && hintState.level < 2 && hintState.candidate) {
      hintState.level = 2;
      countHintUse(2);
      renderHintPanel();
    }
    return;
  }

  if (hintState.fen === fen && hintState.status === 'loading') {
    if (revealCandidate) hintState.requestedReveal = true;
    return;
  }

  const request = ++hintRequestId;
  const sessionId = currentSession?.id;
  hintState = {
    ...blankHintState('loading'),
    fen,
    requestedReveal: revealCandidate,
  };
  renderHintPanel();

  try {
    const result = await getStockfishReviewEngine().evaluate({ fen, movetime: 360 });
    if (request !== hintRequestId || !game || finalized || game.fen() !== fen || game.turn() !== userColor) return;
    const hintGame = new Chess(fen);
    let move = null;
    if (result.move) {
      try {
        move = hintGame.move({
          from: result.move.slice(0, 2),
          to: result.move.slice(2, 4),
          promotion: result.move[4] || 'q',
        });
      } catch {}
    }
    const copy = buildProgressiveHint(move);
    const reveal = Boolean(hintState.requestedReveal);
    hintState = {
      fen,
      status: 'ready',
      level: reveal ? 2 : 1,
      strategicText: copy.strategicText,
      exactText: copy.exactText,
      candidate: result.move || null,
      requestedReveal: false,
      counted: false,
      revealCounted: false,
    };
    if (currentSession?.id === sessionId) countHintUse(hintState.level);
    renderHintPanel();
  } catch (error) {
    console.warn('Stockfish hint failed; using a strategic fallback.', error);
    if (request !== hintRequestId || !game || finalized || game.fen() !== fen || game.turn() !== userColor) return;
    hintState = {
      fen,
      status: 'ready',
      level: 1,
      strategicText: compactThemeHint(),
      exactText: 'No exact candidate is available from the local engine right now.',
      candidate: null,
      requestedReveal: false,
      counted: false,
      revealCounted: false,
    };
    if (currentSession?.id === sessionId) countHintUse(1);
    renderHintPanel();
  }
}

function handleHintButton() {
  if (hintState.level === 1) requestHint(true);
  else requestHint(false);
}

function prepareHintForTurn() {
  if (!game || finalized) {
    resetHintState('finished');
    return;
  }
  if (game.turn() !== userColor || thinking) {
    if (hintState.status !== 'waiting' || hintState.fen !== game.fen()) resetHintState('waiting');
    else renderHintPanel();
    return;
  }
  const fen = game.fen();
  if (hintState.fen !== fen || ['waiting', 'finished', 'idle'].includes(hintState.status)) {
    hintRequestId += 1;
    hintState = { ...blankHintState('hidden'), fen };
  }
  renderHintPanel();
  if (settings.autoHints && hintState.level === 0 && hintState.status === 'hidden') {
    requestHint(false);
  }
}

'''
if "function blankHintState(" not in s:
    s = replace_once(s, "function makeUserMove(moveObject) {", hint_functions + "function makeUserMove(moveObject) {", "hint functions")

# Store hint assistance and establish a pending destination outline immediately.
s = replace_once(
    s,
    "  const spentMs = spentThisTurn(userColor);\n  let move;",
    "  const spentMs = spentThisTurn(userColor);\n  const hintLevelAtMove = hintState.fen === fenBefore ? hintState.level : 0;\n  let move;",
    "capture hint level for move",
)

s = replace_once(
    s,
    "    san: move.san,\n    uci: uciFromMove(move),",
    "    san: move.san,\n    uci: uciFromMove(move),\n    from: move.from,\n    to: move.to,\n    hintLevel: hintLevelAtMove,\n    hintText: hintLevelAtMove ? hintState.strategicText : null,",
    "move hint metadata",
)

s = replace_once(
    s,
    "  currentSession.userMoves.push(moveRecord);\n  showMoveQualityBadge(null);",
    "  currentSession.userMoves.push(moveRecord);\n  ratedMoveSquare = { square: move.to, key: 'pending', label: 'Analyzing' };\n  resetHintState('waiting');\n  showMoveQualityBadge(null);",
    "pending destination rating",
)

# Once Stockfish finishes, color the landing square using the same move-rating band.
s = replace_once(
    s,
    "  targetMove.quality = qualityForLoss(data.cpLoss).key;\n  if (currentSession?.id === sessionId) {\n    renderLiveQuality();",
    "  targetMove.quality = qualityForLoss(data.cpLoss).key;\n  if (currentSession?.id === sessionId) {\n    const latestMove = currentSession.userMoves[currentSession.userMoves.length - 1];\n    if (latestMove?.id === moveId) {\n      const band = qualityForLoss(data.cpLoss);\n      ratedMoveSquare = { square: targetMove.to || targetMove.uci.slice(2, 4), key: band.key, label: band.label };\n      renderBoard();\n    }\n    renderLiveQuality();",
    "rated square after analysis",
)

# Prepare automatic/on-demand hints as soon as the opponent finishes moving.
s = replace_once(
    s,
    "  setStatus(game.isCheck() ? 'Check—your king is under attack.' : 'Your move. Build the position one decision at a time.');\n  renderAll();\n  finishIfNeeded();\n}",
    "  setStatus(game.isCheck() ? 'Check—your king is under attack.' : 'Your move. Build the position one decision at a time.');\n  renderAll();\n  const finished = finishIfNeeded();\n  if (!finished) prepareHintForTurn();\n}",
    "hint after opponent reply",
)

# Restore the prior rated destination and reset the hint when taking a move back.
s = replace_once(
    s,
    "  setStatus('Moves taken back. The clock was not restored; try a different plan.');\n  renderAll();\n  if (game.turn() === engineColor) askEngine();",
    "  const priorRated = currentSession.userMoves[currentSession.userMoves.length - 1];\n  ratedMoveSquare = priorRated\n    ? { square: priorRated.to || priorRated.uci.slice(2, 4), key: priorRated.quality || 'pending', label: qualityForLoss(priorRated.cpLoss).label }\n    : null;\n  resetHintState();\n  setStatus('Moves taken back. The clock was not restored; try a different plan.');\n  renderAll();\n  prepareHintForTurn();\n  if (game.turn() === engineColor) askEngine();",
    "takeback hint and square reset",
)

# Setup control binding and sharing URL.
s = replace_once(
    s,
    "  $('#blindCalibration')?.addEventListener('change', () => updateControls());\n  $('#positionRating').addEventListener('input', () => updateControls());",
    "  $('#blindCalibration')?.addEventListener('change', () => updateControls());\n  $('#autoHints')?.addEventListener('change', () => updateControls());\n  $('#positionRating').addEventListener('input', () => updateControls());",
    "auto-hint checkbox binding",
)

s = s.replace("url.search = '?v=20260827-17';", "url.search = '?v=20260827-18';")
write(path, s)


# -----------------------------------------------------------------------------
# Tail chunk: hint button binding and visible test state.
# -----------------------------------------------------------------------------
path = "kmate-trainer/app-v7-part6.txt"
s = read(path)
s = replace_once(
    s,
    "  $('#changeSetupButton').addEventListener('click', () => navigate('setup'));\n",
    "  $('#changeSetupButton').addEventListener('click', () => navigate('setup'));\n  $('#showHintButton')?.addEventListener('click', handleHintButton);\n",
    "show-hint button binding",
)
s = s.replace("version: '17.0-commercial-beta'", "version: '18.0-commercial-beta'")
s = replace_once(
    s,
    "    clocks: { ...clocks },\n    engine: 'Stockfish 18 lite single-threaded',",
    "    clocks: { ...clocks },\n    ratedMoveSquare: ratedMoveSquare ? { ...ratedMoveSquare } : null,\n    hint: { status: hintState.status, level: hintState.level, automatic: Boolean(settings.autoHints), candidate: hintState.level >= 2 ? hintState.candidate : null },\n    engine: 'Stockfish 18 lite single-threaded',",
    "debug state for hints and square rating",
)
write(path, s)


# -----------------------------------------------------------------------------
# CSS: matching square borders and mobile-friendly hint card.
# -----------------------------------------------------------------------------
path = "kmate-trainer/styles-v7.css"
s = read(path)
css_marker = "\n\n/* K-Mate v16 commercial-beta additions */"
css = r'''

/* K-Mate v18 progressive hints and destination-square move ratings */
.sq.move-quality-square::after{z-index:4;box-shadow:inset 0 0 0 5px var(--move-quality-color),inset 0 1px #fff3,inset 0 -1px #0003}
.sq.move-quality-square.quality-best{--move-quality-color:#7cf58a}
.sq.move-quality-square.quality-excellent{--move-quality-color:#61e6c5}
.sq.move-quality-square.quality-good{--move-quality-color:#70b8ff}
.sq.move-quality-square.quality-inaccuracy{--move-quality-color:#f4cc70}
.sq.move-quality-square.quality-miss{--move-quality-color:#ffad59}
.sq.move-quality-square.quality-blunder{--move-quality-color:#ff736f}
.sq.move-quality-square.quality-pending{--move-quality-color:#d0d7d1;animation:qualitySquarePulse 1s ease-in-out infinite alternate}
@keyframes qualitySquarePulse{to{filter:brightness(1.13)}}
.hint-toggle{border-color:#80d8a438;background:#80d8a408}
.hint-card{margin-top:12px;padding:13px;border:1px solid #80d8a43b;border-radius:15px;background:linear-gradient(145deg,#80d8a40c,#ffffff04)}
.hint-card.automatic{border-color:#b9f47455;background:linear-gradient(145deg,#b9f4740f,#ffffff04)}
.hint-card.loading{border-color:#f4cc704c}
.hint-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.hint-head small,.hint-head b{display:block}
.hint-head small{color:var(--accent-2);font-size:9px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}
.hint-head b{margin-top:3px;font-size:14px}
.hint-action{flex:0 0 auto;min-height:34px;padding:0 10px;border:1px solid #80d8a455;border-radius:10px;background:#80d8a412;color:#b8f0d0;font-size:11px;font-weight:900;cursor:pointer}
.hint-action:disabled{opacity:.55;cursor:default}
.hint-card p{margin:9px 0 0!important;color:#d9e4dc!important;font-size:12px;line-height:1.48}
.hint-mode-label{display:block;margin-top:7px;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.06em}
'''
if "K-Mate v18 progressive hints" not in s:
    if css_marker not in s:
        raise SystemExit("Missing CSS insertion marker")
    s = s.replace(css_marker, css + css_marker, 1)

mobile_marker = "  .move-rating{max-width:59px;padding:3px 4px;font-size:7.5px}\n"
mobile_css = "  .hint-card{padding:11px}\n  .hint-head{gap:7px}\n  .hint-action{padding:0 8px;font-size:10px}\n  .sq.move-quality-square::after{box-shadow:inset 0 0 0 4px var(--move-quality-color),inset 0 1px #fff3,inset 0 -1px #0003}\n"
if mobile_css not in s:
    s = replace_once(s, mobile_marker, mobile_marker + mobile_css, "mobile hint and square styles")
write(path, s)


# -----------------------------------------------------------------------------
# Loader cache busting.
# -----------------------------------------------------------------------------
path = "kmate-trainer/app-v7.js"
s = read(path)
s = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=18.0.0", s)
s = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=18.0.0", s)
write(path, s)
