from pathlib import Path
import json
import re

ROOT = Path('kmate-trainer')


def read(path):
    return Path(path).read_text()


def write(path, content):
    Path(path).write_text(content)


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Marker missing for {label}: {old[:120]!r}')
    return text.replace(old, new, 1)


# Assemble the split application into one maintainable source string.
parts = [read(ROOT / f'app-v7-part{n}.txt') for n in range(1, 7)]
if parts[0].endswith('\n  }') and parts[1].startswith(' }\n'):
    parts[0] = parts[0][:-2]
app = ''.join(parts)

# Training goals and calibration scale.
app = replace_once(
    app,
    "const QUALITY_BANDS = [\n",
    """const TRAINING_GOALS = {
  all: { label: 'All themes', description: 'Draw from every suitable structure.' },
  attack: { label: 'Attack the king', description: 'Initiative, pawn storms, and forcing play.', tags: ['king safety', 'pawn breaks', 'calculation'] },
  defend: { label: 'Defend & neutralize', description: 'Prophylaxis, consolidation, and resourcefulness.', tags: ['prophylaxis', 'king safety'] },
  convert: { label: 'Convert an edge', description: 'Simplification, technique, and endgame transitions.', tags: ['conversion', 'endgame transition', 'passed pawns'] },
  structure: { label: 'Pawn structures', description: 'Plans created by chains, weaknesses, and space.', tags: ['pawn structure', 'space', 'pawn breaks'] },
  activity: { label: 'Piece activity', description: 'Improve the worst piece and seize open lines.', tags: ['piece activity', 'rook activity', 'king activity'] },
  tactics: { label: 'Calculation', description: 'Checks, captures, threats, and concrete transitions.', tags: ['calculation'] },
};
const CALIBRATION_RATINGS = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2600, 3000, 3500];

const QUALITY_BANDS = [
""",
    'training goal constants',
)

app = replace_once(
    app,
    "  side: 'random',\n  sound: true,\n};",
    "  side: 'random',\n  sound: true,\n  trainingGoal: 'all',\n  blindCalibration: false,\n};",
    'default settings',
)

app = replace_once(
    app,
    "let audioContext = null;\n",
    "let audioContext = null;\nlet queuedCustomPosition = null;\nlet activeOpponentRating = 1600;\nlet recommendationState = null;\n",
    'commercial beta globals',
)

# Setup controls.
app = replace_once(
    app,
    "  $('#openingSelect').value = settings.opening;\n  updateControls(false);",
    "  $('#openingSelect').value = settings.opening;\n  if ($('#goalSelect')) $('#goalSelect').value = settings.trainingGoal || 'all';\n  if ($('#blindCalibration')) $('#blindCalibration').checked = Boolean(settings.blindCalibration);\n  updateControls(false);",
    'apply settings controls',
)

app = replace_once(
    app,
    "  settings.opening = $('#openingSelect').value;\n  $('#positionValue').textContent = settings.positionRating;",
    "  settings.opening = $('#openingSelect').value;\n  settings.trainingGoal = $('#goalSelect')?.value || settings.trainingGoal || 'all';\n  settings.blindCalibration = Boolean($('#blindCalibration')?.checked);\n  $('#positionValue').textContent = settings.positionRating;",
    'read beta controls',
)

old_pool = """  const base = validPositions.filter((position) => position.phase === settings.phase);
  const openingPool = settings.opening === 'all' || openingDisabled
    ? base
    : base.filter((position) => position.opening === settings.opening);
  const count = openingPool.length;
  $('#openingCount').textContent = `∞ generated · ${count} seed${count === 1 ? '' : 's'}`;

  if (openingPool.length) {
    const distances = openingPool.map((position) => Math.abs(position.rating - settings.positionRating));
    const nearest = Math.min(...distances);
    const ratings = [...new Set(openingPool
      .filter((position) => Math.abs(position.rating - settings.positionRating) === nearest)
      .map((position) => position.rating))]
      .sort((a, b) => a - b);
    $('#positionBand').textContent = nearest <= 100
      ? `Generates a fresh legal ${phaseLabel(settings.phase).toLowerCase()} near ${settings.positionRating} every session.`
      : `Generates from the nearest ${phaseLabel(settings.phase).toLowerCase()} anchors: ${ratings.join(' or ')}.`;
  }
"""
new_pool = """  const base = validPositions.filter((position) => position.phase === settings.phase);
  const openingPool = settings.opening === 'all' || openingDisabled
    ? base
    : base.filter((position) => position.opening === settings.opening);
  const goal = TRAINING_GOALS[settings.trainingGoal] || TRAINING_GOALS.all;
  const goalPool = settings.trainingGoal === 'all'
    ? openingPool
    : openingPool.filter((position) => (position.tags || []).some((tag) => goal.tags?.includes(tag)));
  const usablePool = goalPool.length ? goalPool : openingPool;
  const count = usablePool.length;
  $('#openingCount').textContent = `∞ generated · ${count} curated seed${count === 1 ? '' : 's'}`;
  if ($('#goalCount')) $('#goalCount').textContent = goal.label;
  if ($('#goalDescription')) $('#goalDescription').textContent = goal.description;

  if (usablePool.length) {
    const distances = usablePool.map((position) => Math.abs(position.rating - settings.positionRating));
    const nearest = Math.min(...distances);
    const ratings = [...new Set(usablePool
      .filter((position) => Math.abs(position.rating - settings.positionRating) === nearest)
      .map((position) => position.rating))]
      .sort((a, b) => a - b);
    $('#positionBand').textContent = nearest <= 100
      ? `Fresh ${phaseLabel(settings.phase).toLowerCase()} practice near ${settings.positionRating}, filtered for ${goal.label.toLowerCase()}.`
      : `Uses the nearest curated anchors (${ratings.join(' or ')}) and applies a legal quality-gated continuation.`;
  }
"""
app = replace_once(app, old_pool, new_pool, 'goal-aware setup pool')

# Better generation quality gates and custom-position queue.
app = replace_once(
    app,
    "function freshPosition() {\n",
    """function materialPointBalance(g) {
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
  if (legalCount < (phase === 'endgame' ? 2 : 6)) return false;
  const imbalance = Math.abs(materialPointBalance(g));
  const tolerance = ['convert', 'defend'].includes(goalKey) ? 6 : 4;
  if (imbalance > tolerance) return false;
  const evaluation = Math.abs(quickEval(g, 'w', phase));
  return evaluation < (['convert', 'defend'].includes(goalKey) ? 780 : 520);
}

function freshPosition() {
""",
    'generation quality gate helpers',
)
app = app.replace('for (let attempt = 0; attempt < 14; attempt += 1)', 'for (let attempt = 0; attempt < 28; attempt += 1)', 1)
app = app.replace("if (!genSeen.includes(shortFen(fen)) && phaseFits(g, settings.phase)) {", "if (!genSeen.includes(shortFen(fen)) && positionPassesQualityGate(g, settings.phase, settings.trainingGoal)) {", 1)
app = app.replace("description: `Fresh legal continuation from “${anchor.title}.” K-Mate varied ${line.length} plies while preserving the selected phase and opening family.`", "description: `Quality-gated continuation from “${anchor.title}.” K-Mate varied ${line.length} plies while preserving the opening family, phase, and selected training goal.`", 1)

old_candidate = """function candidatePositions() {
  let pool = validPositions.filter((position) => position.phase === settings.phase);
  if (settings.phase !== 'endgame' && settings.opening !== 'all') {
    const openingPool = pool.filter((position) => position.opening === settings.opening);
    if (openingPool.length) pool = openingPool;
  }
  return pool;
}

function pickPosition() { return freshPosition(); }
"""
new_candidate = """function candidatePositions() {
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

function pickPosition() {
  if (queuedCustomPosition) {
    const position = queuedCustomPosition;
    queuedCustomPosition = null;
    return position;
  }
  return freshPosition();
}

function chooseCalibrationRating(target) {
  const nearest = CALIBRATION_RATINGS.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best, CALIBRATION_RATINGS[0]);
  const index = CALIBRATION_RATINGS.indexOf(nearest);
  const candidates = CALIBRATION_RATINGS.slice(Math.max(0, index - 2), Math.min(CALIBRATION_RATINGS.length, index + 3));
  return candidates[Math.floor(Math.random() * candidates.length)] || nearest;
}

function opponentRatingForSession() {
  return currentSession?.opponentRating || activeOpponentRating || settings.opponentRating;
}
"""
app = replace_once(app, old_candidate, new_candidate, 'goal candidate positions and custom queue')

# Session creation: custom positions, blind calibration, and richer metadata.
app = replace_once(
    app,
    "  current = pickPosition();\n  game = new Chess(current.fen);\n  userColor = chooseUserColor();",
    "  current = pickPosition();\n  game = new Chess(current.fen);\n  activeOpponentRating = settings.blindCalibration ? chooseCalibrationRating(settings.opponentRating) : settings.opponentRating;\n  userColor = current.custom ? game.turn() : chooseUserColor();",
    'session opponent and custom side',
)
app = replace_once(
    app,
    "    opponentRating: settings.opponentRating,\n    timeControl: settings.timeControl,",
    "    opponentRating: activeOpponentRating,\n    requestedOpponentRating: settings.opponentRating,\n    timeControl: settings.timeControl,\n    trainingGoal: settings.trainingGoal,\n    blindCalibration: Boolean(settings.blindCalibration),\n    perceivedRating: null,\n    analysisSource: 'Stockfish 18 review',",
    'session commercial metadata',
)
app = replace_once(
    app,
    "  $('#gameMeta').textContent = `${phaseLabel(current.phase)} · ${current.opening} · fresh variation`;\n  $('#positionBadge').textContent = `${current.rating} level · generated`;",
    "  $('#gameMeta').textContent = current.custom ? `${phaseLabel(current.phase)} · imported position` : `${phaseLabel(current.phase)} · ${current.opening} · curated variation`;\n  $('#positionBadge').textContent = current.custom ? 'Your position' : `${current.rating} level · quality-gated`;",
    'custom position headings',
)
app = replace_once(
    app,
    "  $('#positionTags').innerHTML = [...current.tags, 'generated variation'].map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');\n  $('#engineName').textContent = `K-Mate ${settings.opponentRating}`;\n  $('#engineSub').textContent = `${ratingDescriptor(settings.opponentRating)} · ${timeControl().label}`;",
    "  $('#positionTags').innerHTML = [...(current.tags || []), current.custom ? 'your own game' : 'curated seed'].map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');\n  $('#engineName').textContent = currentSession.blindCalibration ? 'K-Mate ?' : `K-Mate ${activeOpponentRating}`;\n  $('#engineSub').textContent = currentSession.blindCalibration ? `Blind calibration · ${timeControl().label}` : `${ratingDescriptor(activeOpponentRating)} · ${timeControl().label}`;",
    'blind engine identity',
)

# Use the actual per-session engine strength throughout play.
app = app.replace("settings.opponentRating >= 1900 ? 2 : settings.opponentRating >= 1600 ? 4 : 7", "opponentRatingForSession() >= 1900 ? 2 : opponentRatingForSession() >= 1600 ? 4 : 7", 1)
app = app.replace("const baseThinkMs = settings.opponentRating >= 2100", "const sessionRating = opponentRatingForSession();\n  const baseThinkMs = sessionRating >= 2100", 1)
app = app.replace("    : settings.opponentRating >= 1900", "    : sessionRating >= 1900", 1)
app = app.replace("      : settings.opponentRating >= 1700", "      : sessionRating >= 1700", 1)
app = app.replace("        : settings.opponentRating >= 1500", "        : sessionRating >= 1500", 1)
app = app.replace("      rating: settings.opponentRating,", "      rating: sessionRating,", 1)

# Import a user's own FEN/PGN and restore a locally exported profile.
import_functions = r'''function inferImportedPhase(g) {
  const info = materialInfo(g);
  if (info.pieces <= 20) return 'endgame';
  if (info.pieces <= 25 || info.queens === 0) return 'late-middlegame';
  return 'middlegame';
}

function importTrainingPosition() {
  const raw = $('#positionImportText')?.value?.trim();
  const error = $('#positionImportError');
  if (error) error.textContent = '';
  if (!raw) {
    if (error) error.textContent = 'Paste a FEN or PGN first.';
    return;
  }
  let imported;
  let source = 'FEN';
  try {
    imported = new Chess(raw);
  } catch {
    try {
      imported = new Chess();
      imported.loadPgn(raw, { strict: false });
      source = 'PGN final position';
    } catch (pgnError) {
      if (error) error.textContent = 'K-Mate could not read that FEN or PGN.';
      return;
    }
  }
  if (imported.isGameOver()) {
    if (error) error.textContent = 'That position is already over. Import an earlier position.';
    return;
  }
  const phase = inferImportedPhase(imported);
  queuedCustomPosition = {
    id: `custom-${Date.now()}`,
    custom: true,
    generated: false,
    phase,
    opening: 'Imported game',
    rating: settings.positionRating,
    title: $('#positionImportTitle')?.value?.trim() || 'Your imported position',
    theme: 'Apply your own game lessons',
    tags: ['custom position', 'calculation', 'piece activity'],
    fen: imported.fen(),
    description: `${source}. You will play the side to move and K-Mate will review every decision.`,
  };
  closeDialog('positionImportDialog');
  startPosition();
}

async function importProfileFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const data = payload?.data || payload;
    if (!data || !Array.isArray(data.sessions)) throw new Error('Missing sessions');
    store = {
      version: Number(data.version) || 16,
      sessions: data.sessions.slice(0, 500),
      legacy: { ...emptyStore().legacy, ...(data.legacy || {}) },
      settings: { ...defaultSettings, ...(data.settings || {}) },
    };
    settings = { ...defaultSettings, ...store.settings };
    populateOpenings();
    applySettingsToControls();
    saveStore();
    renderInsights();
    toast(`Restored ${store.sessions.length} detailed sessions`);
  } catch (error) {
    console.warn('Profile import failed', error);
    toast('That file is not a valid K-Mate profile');
  }
}

'''
app = replace_once(app, "function exportData() {\n", import_functions + "function exportData() {\n", 'position and profile import')
app = app.replace("app: 'K-Mate v7'", "app: 'K-Mate commercial beta v16'", 1)
app = app.replace("note: 'Ratings and move-quality values are training approximations.'", "note: 'Includes local training history, calibration guesses, settings, and Stockfish-backed move reviews. No account data is included.'", 1)

# Adaptive next-session prescription.
recommendation_functions = r'''function themeToTrainingGoal(theme) {
  if (['king safety', 'pawn breaks'].includes(theme)) return 'attack';
  if (theme === 'prophylaxis') return 'defend';
  if (['conversion', 'endgame transition', 'passed pawns'].includes(theme)) return 'convert';
  if (['pawn structure', 'space'].includes(theme)) return 'structure';
  if (['piece activity', 'rook activity', 'king activity'].includes(theme)) return 'activity';
  if (theme === 'calculation') return 'tactics';
  return 'all';
}

function buildRecommendation() {
  const completed = completedDetailedSessions();
  if (!completed.length) {
    return {
      phase: 'middlegame', opening: 'London System', trainingGoal: 'activity',
      positionRating: 1600, opponentRating: 1600, timeControl: '5+0', side: 'random',
      title: 'Establish your baseline',
      reason: 'Start with a familiar London middlegame at your current level. K-Mate will adapt after a few reviewed sessions.',
    };
  }
  const openingWeakness = weakestGroup(groupSessions(completed.filter((session) => !['Various', 'Imported game'].includes(session.opening)), (session) => session.opening));
  const phaseWeakness = weakestGroup(groupSessions(completed, (session) => session.phase));
  const themeCandidates = [...themeGroups().entries()]
    .map(([name, sessions]) => ({ name, ...aggregateSessions(sessions) }))
    .filter((item) => item.analyzedMoves >= 3)
    .sort((a, b) => ((b.avgCpLoss || 0) + (1 - (b.score ?? .5)) * 100) - ((a.avgCpLoss || 0) + (1 - (a.score ?? .5)) * 100));
  const theme = themeCandidates[0]?.name || phaseWeakness?.sessions?.[0]?.tags?.[0] || 'calculation';
  const performance = trainingPerformance(completed) || settings.positionRating;
  const target = Math.max(1200, Math.min(2200, Math.round((performance + 75) / 100) * 100));
  const timed = completed.filter((session) => TIME_CONTROLS[session.timeControl]?.base);
  const timeoutRate = timed.length ? timed.filter((session) => session.reason === 'timeout').length / timed.length : 0;
  return {
    phase: phaseWeakness?.name || settings.phase,
    opening: openingWeakness?.name || settings.opening || 'all',
    trainingGoal: themeToTrainingGoal(theme),
    positionRating: Math.max(1200, Math.min(2100, target)),
    opponentRating: target,
    timeControl: timeoutRate >= .15 ? '5+0' : '3+2',
    side: settings.side,
    title: `${openingWeakness?.name || phaseLabel(phaseWeakness?.name || settings.phase)} · ${theme}`,
    reason: `${openingWeakness ? `${openingWeakness.name} is your weakest opening signal. ` : ''}${phaseWeakness ? `${phaseLabel(phaseWeakness.name)} is the phase to reinforce. ` : ''}${THEME_ADVICE[theme] || 'Repeat the structure and compare candidate moves.'}`,
  };
}

function renderRecommendation() {
  const card = $('#recommendationCard');
  if (!card) return;
  recommendationState = buildRecommendation();
  $('#recommendationTitle').textContent = recommendationState.title;
  $('#recommendationText').textContent = recommendationState.reason;
  $('#recommendationMeta').textContent = `${phaseLabel(recommendationState.phase)} · ${recommendationState.opening} · ${TRAINING_GOALS[recommendationState.trainingGoal]?.label || 'All themes'} · ${recommendationState.opponentRating} · ${TIME_CONTROLS[recommendationState.timeControl]?.label}`;
  const calibration = calibrationStats();
  $('#calibrationSummary').textContent = calibration.count
    ? `${calibration.count} blind calibration${calibration.count === 1 ? '' : 's'} · average guess error ${Math.round(calibration.meanError)} points`
    : 'Blind calibration is available to help validate K-Mate’s rating scale.';
}

function applyRecommendation(startNow = true) {
  recommendationState = recommendationState || buildRecommendation();
  settings = { ...settings, ...recommendationState };
  populateOpenings();
  applySettingsToControls();
  saveStore();
  if (startNow) startPosition();
}

function copyRecommendation() {
  recommendationState = recommendationState || buildRecommendation();
  const text = `K-Mate plan: ${recommendationState.title} — ${recommendationState.reason}`;
  navigator.clipboard?.writeText(text).then(() => toast('Training plan copied')).catch(() => toast(text));
}

function calibrationStats() {
  const sessions = store.sessions.filter((session) => session.blindCalibration && Number.isFinite(session.perceivedRating) && Number.isFinite(session.opponentRating));
  return {
    count: sessions.length,
    meanError: average(sessions.map((session) => Math.abs(session.perceivedRating - session.opponentRating))) || 0,
  };
}

'''
app = replace_once(app, "function renderSummary() {\n", recommendation_functions + "function renderSummary() {\n", 'adaptive recommendation')
app = replace_once(app, "  renderSetupSignal();\n}", "  renderSetupSignal();\n  renderRecommendation();\n}", 'render recommendation with summary')

# Deep Stockfish review engine. A second worker prevents review from blocking opponent moves.
engine_methods = r'''  async configureReview() {
    this.send('setoption name UCI_LimitStrength value false');
    this.send('setoption name Skill Level value 20');
    this.send('setoption name MultiPV value 1');
    const readyOk = this.waitFor((line) => line === 'readyok', 15000);
    this.send('isready');
    await readyOk;
  }

  evaluate({ fen, movetime = 450 }) {
    const run = async () => {
      await this.ready;
      await this.configureReview();
      this.lastInfo = {};
      this.send(`position fen ${fen}`);
      const bestMoveLine = this.waitFor((line) => line.startsWith('bestmove '), Math.max(18000, movetime + 12000));
      this.send(`go movetime ${Math.max(220, Math.round(movetime))}`);
      const line = await bestMoveLine;
      const move = line.split(/\s+/)[1];
      const mate = Number(this.lastInfo.mate);
      let scoreCp = Number(this.lastInfo.scoreCp);
      if (Number.isFinite(mate) && mate !== 0) scoreCp = mate > 0 ? 100000 - Math.abs(mate) * 100 : -100000 + Math.abs(mate) * 100;
      if (!Number.isFinite(scoreCp)) scoreCp = 0;
      return { move: move && !['(none)', '0000'].includes(move) ? move : null, scoreCp, ...this.lastInfo };
    };
    const result = this.searchQueue.then(run, run);
    this.searchQueue = result.catch(() => undefined);
    return result;
  }

'''
app = replace_once(app, "  stop() {\n", engine_methods + "  stop() {\n", 'Stockfish review methods')
app = replace_once(
    app,
    "let stockfishEngine = null;\nlet stockfishLoadError = null;\nlet analysisWorker = null;",
    "let stockfishEngine = null;\nlet stockfishReviewEngine = null;\nlet stockfishLoadError = null;\nlet analysisWorker = null;\n\nfunction getStockfishReviewEngine() {\n  if (!stockfishReviewEngine) stockfishReviewEngine = new StockfishPlayEngine(STOCKFISH_WORKER_URL);\n  return stockfishReviewEngine;\n}",
    'review engine global',
)

# Replace shallow review request with Stockfish-before/after evaluation, retaining fallback.
start = app.find('function requestMoveAnalysis(fenBefore, moveRecord) {')
end = app.find('function finishIfNeeded() {', start)
if start < 0 or end < 0:
    raise SystemExit('Move-analysis block not found')
review_block = r'''async function analyzeMoveWithStockfish(fenBefore, moveUci) {
  const engine = getStockfishReviewEngine();
  const before = await engine.evaluate({ fen: fenBefore, movetime: 520 });
  const g = new Chess(fenBefore);
  const selected = g.move({ from: moveUci.slice(0, 2), to: moveUci.slice(2, 4), promotion: moveUci[4] || 'q' });
  if (!selected) throw new Error('Unable to reproduce move for review');
  const after = await engine.evaluate({ fen: g.fen(), movetime: 420 });
  const bestScore = before.scoreCp;
  const selectedScore = -after.scoreCp;
  return {
    cpLoss: Math.min(1000, Math.max(0, Math.round(bestScore - selectedScore))),
    bestMove: before.move,
    bestScore,
    selectedScore,
    depth: Math.max(before.depth || 0, after.depth || 0),
    source: 'Stockfish 18',
  };
}

function applyMoveAnalysisResult(sessionId, moveId, data) {
  const targetSession = currentSession?.id === sessionId
    ? currentSession
    : store.sessions.find((session) => session.id === sessionId);
  const targetMove = targetSession?.userMoves?.find((move) => move.id === moveId);
  if (!targetMove || !Number.isFinite(data.cpLoss)) return;
  targetMove.cpLoss = data.cpLoss;
  targetMove.bestMove = data.bestMove || null;
  targetMove.bestScore = data.bestScore ?? null;
  targetMove.selectedScore = data.selectedScore ?? null;
  targetMove.analysisDepth = data.depth || null;
  targetMove.analysisSource = data.source || 'Local fallback';
  targetMove.quality = qualityForLoss(data.cpLoss).key;
  if (currentSession?.id === sessionId) {
    renderLiveQuality();
    renderMoveList();
    showMoveQualityBadge(targetMove);
    updateStoredCurrentSession();
    if (finalized) renderPostGameReview(currentSession);
  } else {
    saveStore();
  }
}

function requestFallbackMoveAnalysis(fenBefore, moveRecord, sessionId, moveId) {
  if (!analysisWorker) return;
  const id = ++analysisRequestId;
  analysisWorker.postMessage({
    task: 'analyze', id, fen: fenBefore, move: moveRecord.uci,
    phase: current?.phase || 'middlegame', perspective: userColor,
  });
  const handler = (event) => {
    if (event.data.task !== 'analyze' || event.data.id !== id) return;
    analysisWorker.removeEventListener('message', handler);
    applyMoveAnalysisResult(sessionId, moveId, { ...event.data, source: 'Local fallback' });
  };
  analysisWorker.addEventListener('message', handler);
}

function requestMoveAnalysis(fenBefore, moveRecord) {
  const sessionId = currentSession.id;
  const moveId = moveRecord.id;
  analyzeMoveWithStockfish(fenBefore, moveRecord.uci)
    .then((data) => applyMoveAnalysisResult(sessionId, moveId, data))
    .catch((error) => {
      console.warn('Stockfish review failed; using local fallback.', error);
      requestFallbackMoveAnalysis(fenBefore, moveRecord, sessionId, moveId);
    });
}

'''
app = app[:start] + review_block + app[end:]

# Record source at move creation.
app = app.replace("    quality: 'pending',\n  };", "    quality: 'pending',\n    analysisSource: 'pending',\n  };", 1)

# Calibration result collection.
calibration_functions = r'''function renderCalibrationPanel(session) {
  const panel = $('#calibrationPanel');
  if (!panel) return;
  panel.hidden = !session.blindCalibration;
  if (!session.blindCalibration) return;
  const saved = Number.isFinite(session.perceivedRating);
  $('#calibrationGuess').value = saved ? String(session.perceivedRating) : String(session.requestedOpponentRating || 1600);
  $('#calibrationReveal').textContent = saved
    ? `Actual setting: ${session.opponentRating}. Your estimate was ${session.perceivedRating} (${Math.abs(session.perceivedRating - session.opponentRating)} points away).`
    : 'Estimate the opponent before revealing the actual setting.';
  $('#saveCalibrationGuess').textContent = saved ? 'Update estimate' : 'Reveal & save estimate';
}

function saveCalibrationGuess() {
  if (!currentSession?.blindCalibration) return;
  const guess = Number($('#calibrationGuess').value);
  if (!Number.isFinite(guess)) return;
  currentSession.perceivedRating = guess;
  const index = store.sessions.findIndex((session) => session.id === currentSession.id);
  if (index >= 0) store.sessions[index].perceivedRating = guess;
  saveStore();
  renderCalibrationPanel(currentSession);
  renderInsights();
}

'''
app = replace_once(app, "function showResult(title, text, symbol) {\n", calibration_functions + "function showResult(title, text, symbol) {\n", 'calibration result functions')
app = replace_once(
    app,
    "  $('#resultOpponent').textContent = `${session.opponentRating} · ${TIME_CONTROLS[session.timeControl]?.label || session.timeControl}`;",
    "  $('#resultOpponent').textContent = session.blindCalibration ? `Hidden calibration · ${TIME_CONTROLS[session.timeControl]?.label || session.timeControl}` : `${session.opponentRating} · ${TIME_CONTROLS[session.timeControl]?.label || session.timeControl}`;",
    'blind result opponent',
)
app = replace_once(app, "  renderPostGameReview(session);\n  openDialog('resultDialog');", "  renderPostGameReview(session);\n  renderCalibrationPanel(session);\n  openDialog('resultDialog');", 'render calibration result')
app = app.replace("against the ${settings.opponentRating} setting", "against the ${opponentRatingForSession()} setting", 1)

# Bind the beta tools.
app = replace_once(
    app,
    "  $('#openingSelect').addEventListener('change', () => updateControls());\n  $('#positionRating').addEventListener('input', () => updateControls());",
    "  $('#openingSelect').addEventListener('change', () => updateControls());\n  $('#goalSelect')?.addEventListener('change', () => updateControls());\n  $('#blindCalibration')?.addEventListener('change', () => updateControls());\n  $('#positionRating').addEventListener('input', () => updateControls());",
    'bind goal and calibration controls',
)
app = replace_once(
    app,
    "  $('#exportButton').addEventListener('click', exportData);\n  $('#resetButton').addEventListener('click', resetData);",
    """  $('#exportButton').addEventListener('click', exportData);
  $('#resetButton').addEventListener('click', resetData);
  $('#startRecommendedButton')?.addEventListener('click', () => applyRecommendation(true));
  $('#copyRecommendationButton')?.addEventListener('click', copyRecommendation);
  $('#openPositionImport')?.addEventListener('click', () => openDialog('positionImportDialog'));
  $('#confirmPositionImport')?.addEventListener('click', importTrainingPosition);
  $('#openProfileImport')?.addEventListener('click', () => $('#profileImportFile')?.click());
  $('#profileImportFile')?.addEventListener('change', importProfileFile);
  $('#aboutBetaButton')?.addEventListener('click', () => openDialog('aboutBetaDialog'));
  $('#saveCalibrationGuess')?.addEventListener('click', saveCalibrationGuess);
""",
    'bind commercial beta tools',
)
app = app.replace("version: '9.0'", "version: '16.0-commercial-beta'", 1)
app = app.replace("engine: 'Stockfish 18 lite single-threaded',", "engine: 'Stockfish 18 lite single-threaded',\n    reviewEngine: 'Independent Stockfish 18 move review',\n    commercialBeta: true,\n    cloudSync: false,\n    billing: false,", 1)

# Persist cleaned application in one part; empty transport files remove fragile boundaries.
write(ROOT / 'app-v7-part1.txt', app)
for n in range(2, 7):
    write(ROOT / f'app-v7-part{n}.txt', '')

# HTML: training goal, beta tools, recommendation, import/profile/legal dialogs, calibration feedback.
index_path = ROOT / 'index.html'
html = read(index_path)
opening_marker = '''          <div class="field">
            <div class="fieldhead"><label for="positionRating">Position level</label><span class="value" id="positionValue">1600</span></div>'''
goal_html = '''          <div class="field" id="goalField">
            <div class="fieldhead"><label for="goalSelect">Training goal</label><span class="value" id="goalCount">All themes</span></div>
            <select class="select" id="goalSelect" aria-label="Training goal">
              <option value="all">All themes</option>
              <option value="attack">Attack the king</option>
              <option value="defend">Defend & neutralize</option>
              <option value="convert">Convert an edge</option>
              <option value="structure">Pawn structures</option>
              <option value="activity">Piece activity</option>
              <option value="tactics">Calculation</option>
            </select>
            <small class="sub" id="goalDescription">Draw from every suitable structure.</small>
          </div>

'''
html = replace_once(html, opening_marker, goal_html + opening_marker, 'goal setup HTML')

preset_marker = '''          <div class="quick-presets">
            <button type="button" data-preset="current"><b>Your current zone</b><small>1600 position · 1600 opponent · 3+0</small></button>
            <button type="button" data-preset="stretch"><b>Stretch session</b><small>1800 position · 2000 opponent · 5+0</small></button>
          </div>

          <div id="loadError" class="error"></div>'''
beta_controls = '''          <label class="calibration-toggle">
            <input id="blindCalibration" type="checkbox">
            <span><b>Blind Elo calibration</b><small>Hide the opponent setting, estimate it after the position, and help validate K-Mate’s scale.</small></span>
          </label>

          <div class="beta-tools">
            <button type="button" id="openPositionImport"><b>Import FEN / PGN</b><small>Train from your own game</small></button>
            <button type="button" id="openProfileImport"><b>Restore profile</b><small>Move data between devices</small></button>
            <button type="button" id="aboutBetaButton"><b>Beta & licenses</b><small>What is local vs server-backed</small></button>
            <input id="profileImportFile" type="file" accept="application/json,.json" hidden>
          </div>

          <div id="loadError" class="error"></div>'''
html = replace_once(html, preset_marker, preset_marker.replace('          <div id="loadError" class="error"></div>', beta_controls), 'beta setup controls')

signal_marker = '''      <section class="signal-card card">
        <div>
          <div class="eyebrow">Current coaching signal</div>
          <h2 id="setupSignalTitle">Play a few sessions to build your profile</h2>
          <p id="setupSignalText">K-Mate will compare results across openings, phases, themes, colors, opponent ratings, and time controls.</p>
        </div>
        <button class="btn" type="button" data-view="insights">Open insights</button>
      </section>'''
recommendation_html = signal_marker + '''

      <section class="recommendation-card card" id="recommendationCard">
        <div class="recommendation-copy">
          <div class="eyebrow">Adaptive training prescription</div>
          <h2 id="recommendationTitle">Establish your baseline</h2>
          <p id="recommendationText">K-Mate will recommend the next opening, phase, theme, strength, and clock from your reviewed sessions.</p>
          <div class="recommendation-meta" id="recommendationMeta">Middlegame · London System · 1600 · 5+0</div>
          <small id="calibrationSummary">Blind calibration is available to help validate the rating scale.</small>
        </div>
        <div class="recommendation-actions">
          <button class="btn" id="copyRecommendationButton" type="button">Copy plan</button>
          <button class="btn primary" id="startRecommendedButton" type="button">Start recommended</button>
        </div>
      </section>'''
html = replace_once(html, signal_marker, recommendation_html, 'adaptive recommendation HTML')

result_grid_marker = '''      <div class="result-coach" id="resultCoach">More sessions will sharpen the coaching signal.</div>'''
calibration_panel = '''      <section class="calibration-result" id="calibrationPanel" hidden>
        <div><small>Blind rating calibration</small><b>How strong did the opponent feel?</b></div>
        <div class="calibration-input-row">
          <select id="calibrationGuess" class="select" aria-label="Estimated opponent strength">
            <option value="1000">1000</option><option value="1200">1200</option><option value="1400">1400</option>
            <option value="1600">1600</option><option value="1800">1800</option><option value="2000">2000</option>
            <option value="2200">2200</option><option value="2600">2600</option><option value="3000">3000</option><option value="3500">3500 MAX</option>
          </select>
          <button class="btn" type="button" id="saveCalibrationGuess">Reveal & save estimate</button>
        </div>
        <p id="calibrationReveal">Estimate the opponent before revealing the setting.</p>
      </section>
''' + result_grid_marker
html = replace_once(html, result_grid_marker, calibration_panel, 'calibration result HTML')

promotion_marker = '  <dialog id="promotionDialog" class="modal">'
dialogs = '''  <dialog id="positionImportDialog" class="modal beta-modal">
    <div class="modal-card">
      <div class="eyebrow">Practice from your own game</div>
      <h2>Import a position</h2>
      <p>Paste a FEN, or paste a PGN to use its final non-terminal position. You will play the side to move.</p>
      <input class="select" id="positionImportTitle" placeholder="Optional title, e.g. My London loss">
      <textarea id="positionImportText" class="import-textarea" placeholder="Paste FEN or PGN"></textarea>
      <div class="error-line" id="positionImportError"></div>
      <div class="dialogactions">
        <button class="btn" type="button" data-close="positionImportDialog">Cancel</button>
        <button class="btn primary" type="button" id="confirmPositionImport">Start this position</button>
      </div>
    </div>
  </dialog>

  <dialog id="aboutBetaDialog" class="modal beta-modal">
    <div class="modal-card">
      <div class="eyebrow">Commercial beta foundation</div>
      <h2>What this build does—and does not do</h2>
      <div class="beta-status-grid">
        <div><b>Working locally</b><span>Stockfish play and review, adaptive prescriptions, calibrated-session collection, custom position import, profile export/import, sounds, and weakness analytics.</span></div>
        <div><b>Needs a server before sale</b><span>User accounts, automatic cloud sync, subscriptions, payments, coach dashboards, and aggregate anonymous calibration studies.</span></div>
      </div>
      <p><b>Privacy:</b> training history stays in this browser unless you export it. Restoring a profile is a manual local transfer.</p>
      <p><b>Engine license:</b> K-Mate includes Stockfish under GPLv3. A commercial distribution must retain the license and provide the corresponding Stockfish source or an appropriate source offer.</p>
      <p><b>Position library:</b> current beta positions are K-Mate-curated structures and quality-gated generated continuations. A commercial launch still needs human review and larger licensed datasets.</p>
      <button class="btn primary" type="button" data-close="aboutBetaDialog">Understood</button>
    </div>
  </dialog>

'''
html = replace_once(html, promotion_marker, dialogs + promotion_marker, 'beta dialogs HTML')
html = re.sub(r'\./styles-v7\.css\?v=\d+\.\d+\.\d+', './styles-v7.css?v=16.0.0', html)
html = re.sub(r'\./app-v7\.js\?v=\d+\.\d+\.\d+', './app-v7.js?v=16.0.0', html)
write(index_path, html)

# CSS: commercial-beta controls and stronger mobile layout.
css_path = ROOT / 'styles-v7.css'
css = read(css_path)
css = css.replace('grid-template-columns:1fr auto 1fr', 'grid-template-columns:1fr auto auto auto', 1)
css += r'''

/* K-Mate v16 commercial-beta additions */
.calibration-toggle{display:flex;align-items:flex-start;gap:10px;margin:14px 0;padding:12px;border:1px solid #ffffff14;border-radius:14px;background:#ffffff05;cursor:pointer}
.calibration-toggle input{margin-top:4px;accent-color:var(--accent)}
.calibration-toggle b,.calibration-toggle small{display:block}
.calibration-toggle small{margin-top:3px;color:var(--muted);font-size:11px}
.beta-tools{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}
.beta-tools button{min-height:58px;padding:9px;border:1px solid var(--line);border-radius:13px;background:#202d23;text-align:left;cursor:pointer}
.beta-tools b,.beta-tools small{display:block}
.beta-tools small{margin-top:2px;color:var(--muted);font-size:10px}
.recommendation-card{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:12px;padding:24px;background:radial-gradient(circle at 100% 0,#80d8a420,transparent 20rem),linear-gradient(145deg,#18241b,#0f1711)}
.recommendation-copy{min-width:0}
.recommendation-card h2{margin:5px 0 6px;font-size:24px}
.recommendation-card p{max-width:850px;margin:0;color:#d7dfd7}
.recommendation-meta{margin-top:11px;color:var(--accent);font-size:12px;font-weight:900}
.recommendation-card small{display:block;margin-top:6px;color:var(--muted)}
.recommendation-actions{display:flex;flex:0 0 auto;gap:8px}
.beta-modal{width:min(680px,calc(100% - 20px))}
.import-textarea{width:100%;min-height:210px;margin-top:10px;padding:13px;border:1px solid var(--line);border-radius:14px;background:#09110c;color:var(--text);font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
.error-line{min-height:20px;margin-top:6px;color:var(--bad);font-size:12px}
.beta-status-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:15px 0}
.beta-status-grid div{padding:13px;border:1px solid #ffffff12;border-radius:14px;background:#ffffff05}
.beta-status-grid b,.beta-status-grid span{display:block}
.beta-status-grid span{margin-top:5px;color:var(--muted);font-size:12px}
.calibration-result{margin-top:13px;padding:13px;border:1px solid #80d8a444;border-radius:15px;background:#80d8a40b;text-align:left}
.calibration-result small,.calibration-result b{display:block}
.calibration-result small{color:var(--accent);font-size:10px;text-transform:uppercase;letter-spacing:.08em}
.calibration-input-row{display:grid;grid-template-columns:minmax(120px,.45fr) minmax(190px,1fr);gap:8px;margin-top:10px}
.calibration-result p{margin:9px 0 0!important;font-size:12px}
@media(max-width:700px){
  .appbar{grid-template-columns:1fr auto auto}
  .topnav{order:4;grid-column:1/-1}
  .recommendation-card{align-items:flex-start;flex-direction:column;padding:19px}
  .recommendation-actions{width:100%}
  .recommendation-actions .btn{flex:1}
  .beta-tools{grid-template-columns:1fr}
  .beta-status-grid{grid-template-columns:1fr}
}
@media(max-width:560px){
  .calibration-input-row{grid-template-columns:1fr}
  .beta-modal .modal-card{padding:19px}
  .import-textarea{min-height:170px}
  .recommendation-card h2{font-size:21px}
}
'''
write(css_path, css)

# Add curated London/Caro-Kann beta anchors.
positions_path = ROOT / 'positions-v7.js'
pos_text = read(positions_path)
new_positions = [
  {
    'id':'london-mid-1500-bd3','phase':'middlegame','opening':'London System','rating':1500,
    'title':'London: prepare the central confrontation','theme':'Development before the break',
    'tags':['piece activity','pawn breaks','king safety'],'fen':'r1bq1rk1/p4ppp/1pnbpn2/2pp4/3P4/2PBPNB1/PP1N1PPP/R2QK2R w KQ - 0 9',
    'description':'Both setups are recognizable and the center is ready to change. Complete coordination before choosing e4, Ne5, or a queenside plan.',
    'source':'K-Mate curated beta','quality':'curated'
  },
  {
    'id':'london-mid-1700-qb6','phase':'middlegame','opening':'London System','rating':1700,
    'title':'London: meet early queenside pressure','theme':'Queen placement and central stability',
    'tags':['prophylaxis','piece activity','pawn structure'],'fen':'r4rk1/pp2bpp1/1qn1pn1p/3p1b2/2pP1B2/2P1PN2/PP1NBPPP/R1Q2RK1 w - - 4 12',
    'description':'Black has developed actively and pressured the queenside. Find a useful plan without letting the queen become a tactical target.',
    'source':'K-Mate curated beta','quality':'curated'
  },
  {
    'id':'london-mid-1800-kingside-fianchetto','phase':'middlegame','opening':'London System','rating':1800,
    'title':'London versus a kingside fianchetto','theme':'Choose the correct wing and break',
    'tags':['pawn breaks','king safety','calculation'],'fen':'2rq1rk1/pb2ppbp/1pnp1np1/2p5/3P4/2P1PN1P/PP1NBPPB/R2Q1RK1 w - - 4 11',
    'description':'The center is flexible and Black is ready for queenside activity. Decide whether to play e4, improve pieces, or restrain ...cxd4.',
    'source':'K-Mate curated beta','quality':'curated'
  },
  {
    'id':'london-mid-1800-ne5','phase':'middlegame','opening':'London System','rating':1800,
    'title':'London: establish or abandon the e5 outpost','theme':'Outposts and tactical justification',
    'tags':['calculation','piece activity','prophylaxis'],'fen':'r2q1rk1/pb2bppp/1pn1pn2/2ppN3/3P1B2/2PBP2P/PP1N1PP1/R2Q1RK1 b - - 2 10',
    'description':'White’s knight is centralized, but Black can challenge it in several ways. Calculate whether the outpost is an asset or a target.',
    'source':'K-Mate curated beta','quality':'curated'
  },
  {
    'id':'london-mid-1900-isolated-structure','phase':'middlegame','opening':'London System','rating':1900,
    'title':'London: isolated-center piece play','theme':'Dynamic play around an isolated pawn',
    'tags':['pawn structure','piece activity','calculation'],'fen':'r3k2r/pp3ppp/2nqpn2/3p1b2/3P1B2/1QP2N2/PP1N1PPP/R3K2R w KQkq - 0 11',
    'description':'The pawn structure has clarified while both kings remain uncommitted. Use activity before the isolated pawn becomes a long-term target.',
    'source':'K-Mate curated beta','quality':'curated'
  },
  {
    'id':'london-late-2000-queenless','phase':'late-middlegame','opening':'London System','rating':2000,
    'title':'London: queenless conversion test','theme':'Rook files and minor-piece quality',
    'tags':['conversion','piece activity','pawn structure'],'fen':'2r2rk1/p4ppp/2p1pn2/3p1b2/3P4/P1P2N2/P2N1PPP/R3R1K1 b - - 0 15',
    'description':'Queens are gone and the opening label matters through the resulting structure. Improve the rooks and identify the favorable exchange.',
    'source':'K-Mate curated beta','quality':'curated'
  },
  {
    'id':'caro-mid-1700-advance-qb6','phase':'middlegame','opening':'Caro-Kann','rating':1700,
    'title':'Caro-Kann Advance: concrete queenside pressure','theme':'Tactics beneath the pawn chain',
    'tags':['calculation','pawn breaks','king safety'],'fen':'r3kbnr/pp3ppp/2n1p3/1NppPb2/3P4/4BN2/PqP1BPPP/R2Q1RK1 b kq - 1 9',
    'description':'A sharp Advance structure has produced immediate queenside threats. Calculate before relying on standard strategic plans.',
    'source':'K-Mate curated beta','quality':'curated'
  },
  {
    'id':'caro-mid-1800-classical','phase':'middlegame','opening':'Caro-Kann','rating':1800,
    'title':'Caro-Kann Classical: complete development','theme':'King safety and harmonious placement',
    'tags':['piece activity','king safety','prophylaxis'],'fen':'r2qk2r/pp1n1pp1/2pbpn1p/7P/2PP4/3Q1NN1/PP3PP1/R1B2RK1 w kq - 1 13',
    'description':'White has space while Black retains a solid structure. Improve the least active piece without allowing a central break with tempo.',
    'source':'K-Mate curated beta','quality':'curated'
  },
  {
    'id':'caro-mid-1700-panov','phase':'middlegame','opening':'Caro-Kann','rating':1700,
    'title':'Caro-Kann Panov: play with the isolated pawn','theme':'Activity versus a structural target',
    'tags':['pawn structure','piece activity','calculation'],'fen':'rnbq1rk1/p4ppp/1p2pn2/8/1bBP4/2N2N2/PP3PPP/R1BQ1RK1 w - - 0 10',
    'description':'White has active pieces and an isolated central pawn. Use the temporary initiative before the structure becomes a weakness.',
    'source':'K-Mate curated beta','quality':'curated'
  },
  {
    'id':'caro-mid-1800-exchange','phase':'middlegame','opening':'Caro-Kann','rating':1800,
    'title':'Caro-Kann Exchange: find imbalance in symmetry','theme':'Create useful asymmetry',
    'tags':['piece activity','pawn structure','prophylaxis'],'fen':'r3k2r/pp1q1ppp/2nbpn2/3p4/3P1Bb1/1QPB1N2/PP1N1PPP/R3K2R w KQkq - 2 10',
    'description':'The pawn structure is symmetrical, so piece placement and timing create the imbalance. Avoid exchanges that leave every piece equal.',
    'source':'K-Mate curated beta','quality':'curated'
  },
  {
    'id':'caro-mid-1900-fantasy','phase':'middlegame','opening':'Caro-Kann','rating':1900,
    'title':'Caro-Kann Fantasy: challenge the expanded center','theme':'Breaks against a broad pawn center',
    'tags':['pawn breaks','calculation','king safety'],'fen':'r1bqk2r/pp1n1ppp/2n1p3/2ppP3/1b1P1P2/2N1BN2/PPP3PP/R2QKB1R w KQkq - 2 9',
    'description':'White has gained space at the cost of king flexibility. Decide whether to consolidate or use the center before Black undermines it.',
    'source':'K-Mate curated beta','quality':'curated'
  },
  {
    'id':'caro-late-2000-rooks','phase':'late-middlegame','opening':'Caro-Kann','rating':2000,
    'title':'Caro-Kann: coordinate the heavy pieces','theme':'Prophylaxis before simplification',
    'tags':['conversion','prophylaxis','piece activity'],'fen':'3rr1k1/ppqn1pp1/2pbpn1p/7P/2PP4/1P1Q1NN1/PB3PP1/3RR1K1 w - - 7 17',
    'description':'The structure is stable but every rook move changes the tactical details. Improve coordination before trading into an ending.',
    'source':'K-Mate curated beta','quality':'curated'
  },
]
if 'london-mid-1500-bd3' not in pos_text:
    payload = ',\n'.join('  ' + json.dumps(item, ensure_ascii=False, indent=2).replace('\n', '\n  ') for item in new_positions)
    head, tail = pos_text.rsplit('\n];', 1)
    pos_text = head + ',\n' + payload + '\n];' + tail
write(positions_path, pos_text)

# Cache-bust the loader.
loader_path = ROOT / 'app-v7.js'
loader = read(loader_path)
loader = re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=16.0.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=16.0.0', loader)
write(loader_path, loader)
