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


app_path = "kmate-trainer/app-v7-part1.txt"
app = read(app_path)

# ---------------------------------------------------------------------------
# 1. Make move ratings internally consistent, including already-saved sessions.
# ---------------------------------------------------------------------------
quality_pattern = re.compile(r"(const QUALITY_BANDS = \[.*?\n\];)\nconst THEME_ADVICE", re.S)
quality_helpers = r'''

function normalizeUciMove(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-h1-8qrbn]/g, '').slice(0, 5);
}

function sameUciMove(first, second) {
  const a = normalizeUciMove(first);
  const b = normalizeUciMove(second);
  return Boolean(a && b && a === b);
}

function pvWithRootMove(rootMove, pv) {
  const root = normalizeUciMove(rootMove);
  const line = Array.isArray(pv) ? pv.map(normalizeUciMove).filter(Boolean) : [];
  if (!root) return line.slice(0, 12);
  return sameUciMove(line[0], root) ? line.slice(0, 12) : [root, ...line.filter((move) => !sameUciMove(move, root))].slice(0, 12);
}

function effectiveMoveLoss(record) {
  if (!record) return null;
  if (sameUciMove(record.uci, record.bestMove)) return 0;
  return Number.isFinite(record.cpLoss) ? Math.max(0, Number(record.cpLoss)) : null;
}

function qualityBandFromLoss(loss) {
  if (!Number.isFinite(loss)) return { key: 'pending', label: 'Pending' };
  return QUALITY_BANDS.find((band) => loss <= band.max) || QUALITY_BANDS.at(-1);
}

function qualityForMoveRecord(record) {
  return qualityBandFromLoss(effectiveMoveLoss(record));
}

function reconcileMoveAnalysisRecord(record) {
  if (!record || typeof record !== 'object') return false;
  let changed = false;
  record.uci = normalizeUciMove(record.uci) || record.uci;
  record.bestMove = normalizeUciMove(record.bestMove) || record.bestMove || null;
  if (record.bestMove) {
    const line = pvWithRootMove(record.bestMove, record.bestLine);
    if (JSON.stringify(line) !== JSON.stringify(record.bestLine || [])) {
      record.bestLine = line;
      changed = true;
    }
  }
  if (record.uci) {
    const selectedLine = pvWithRootMove(record.uci, record.selectedLine);
    if (Array.isArray(record.selectedLine) && JSON.stringify(selectedLine) !== JSON.stringify(record.selectedLine)) {
      record.selectedLine = selectedLine;
      changed = true;
    }
  }
  if (sameUciMove(record.uci, record.bestMove)) {
    if (record.cpLoss !== 0) { record.cpLoss = 0; changed = true; }
    if (record.quality !== 'best') { record.quality = 'best'; changed = true; }
    if (Number.isFinite(record.bestScore) && record.selectedScore !== record.bestScore) {
      record.selectedScore = record.bestScore;
      changed = true;
    }
    if (record.exactBest !== true) { record.exactBest = true; changed = true; }
    if (record.analysisConsistency !== 'exact-engine-match') {
      record.analysisConsistency = 'exact-engine-match';
      changed = true;
    }
  } else if (Number.isFinite(record.cpLoss)) {
    const key = qualityBandFromLoss(record.cpLoss).key;
    if (record.quality !== key) { record.quality = key; changed = true; }
  }
  return changed;
}

function reconcileSessionAnalysis(session) {
  if (!session || !Array.isArray(session.userMoves)) return false;
  let changed = false;
  for (const move of session.userMoves) changed = reconcileMoveAnalysisRecord(move) || changed;
  const losses = session.userMoves.map(effectiveMoveLoss).filter(Number.isFinite);
  const nextAverage = losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : null;
  if ((Number.isFinite(nextAverage) && session.avgCpLoss !== nextAverage) || (!Number.isFinite(nextAverage) && session.avgCpLoss != null)) {
    session.avgCpLoss = nextAverage;
    changed = true;
  }
  const quality = { best: 0, excellent: 0, good: 0, inaccuracy: 0, miss: 0, blunder: 0 };
  for (const move of session.userMoves) {
    const key = qualityForMoveRecord(move).key;
    if (quality[key] !== undefined) quality[key] += 1;
  }
  if (JSON.stringify(session.quality || {}) !== JSON.stringify(quality)) {
    session.quality = quality;
    changed = true;
  }
  session.analyzedMoves = losses.length;
  return changed;
}
'''
app, count = quality_pattern.subn(lambda match: match.group(1) + quality_helpers + "\nconst THEME_ADVICE", app, count=1)
if count != 1:
    raise SystemExit("QUALITY_BANDS helper insertion failed")

migration_marker = """if (!store.settings.coachVoiceURI || store.settings.coachVoiceURI === 'auto') {
  store.settings.coachVoiceURI = 'british-woman';
}

let settings = { ...store.settings };"""
migration_replacement = """if (!store.settings.coachVoiceURI || store.settings.coachVoiceURI === 'auto') {
  store.settings.coachVoiceURI = 'british-woman';
}

let repairedStoredMoveRatings = false;
for (const session of store.sessions) repairedStoredMoveRatings = reconcileSessionAnalysis(session) || repairedStoredMoveRatings;
if (repairedStoredMoveRatings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
}

let settings = { ...store.settings };"""
app = replace_once(app, migration_marker, migration_replacement, "stored analysis migration")

app = replace_once(
    app,
    "let replayState = { session: null, frames: [], index: 0, timer: null, auto: false, showBest: false };",
    "let replayState = { session: null, frames: [], index: 0, timer: null, auto: false, showBest: false, bestLineKey: null, bestLineFrames: [], bestLineIndex: -1, bestLineTimer: null, bestLinePlaying: false };",
    "replay state",
)

app = replace_once(
    app,
    """function qualityForLoss(loss) {
  if (!Number.isFinite(loss)) return { key: 'pending', label: 'Pending' };
  return QUALITY_BANDS.find((band) => loss <= band.max) || QUALITY_BANDS.at(-1);
}""",
    """function qualityForLoss(loss) {
  return qualityBandFromLoss(loss);
}""",
    "qualityForLoss",
)

app = replace_once(
    app,
    """function moveRatingForRecord(record) {
  if (!record || !Number.isFinite(record.cpLoss)) return { key: 'pending', label: 'Analyzing' };
  return qualityForLoss(record.cpLoss);
}""",
    """function moveRatingForRecord(record) {
  if (!record || !Number.isFinite(effectiveMoveLoss(record))) return { key: 'pending', label: 'Analyzing' };
  return qualityForMoveRecord(record);
}""",
    "moveRatingForRecord",
)

app = replace_once(
    app,
    """function renderLiveQuality() {
  const moves = currentSession?.userMoves || [];
  const losses = moves.map((move) => move.cpLoss).filter(Number.isFinite);
  $('#analyzedMoves').textContent = losses.length;
  $('#liveCpl').textContent = losses.length ? `${Math.round(average(losses))} cp` : '—';
  $('#takebackCount').textContent = currentSession?.takebacks || 0;
}""",
    """function renderLiveQuality() {
  const moves = currentSession?.userMoves || [];
  const losses = moves.map(effectiveMoveLoss).filter(Number.isFinite);
  $('#analyzedMoves').textContent = losses.length;
  $('#liveCpl').textContent = losses.length ? `${Math.round(average(losses))} cp` : '—';
  $('#takebackCount').textContent = currentSession?.takebacks || 0;
}""",
    "renderLiveQuality",
)

app = replace_once(
    app,
    """  const band = qualityForLoss(move.cpLoss);
  badge.hidden = false;
  badge.textContent = band.label;
  badge.classList.add(`quality-${band.key}`);
  badge.title = Number.isFinite(move.cpLoss) ? `${Math.round(move.cpLoss)} centipawn estimated loss` : band.label;""",
    """  const band = qualityForMoveRecord(move);
  const loss = effectiveMoveLoss(move);
  badge.hidden = false;
  badge.textContent = band.label;
  badge.classList.add(`quality-${band.key}`);
  badge.title = Number.isFinite(loss) ? `${Math.round(loss)} centipawn estimated loss` : band.label;""",
    "showMoveQualityBadge",
)

# ---------------------------------------------------------------------------
# 2. Compare moves from the same root with equal time, rather than comparing
#    independent before/after searches with unequal budgets.
# ---------------------------------------------------------------------------
old_evaluate = """  evaluate({ fen, movetime = 450 }) {
    const run = async () => {
      await this.ready;
      await this.configureReview();
      this.lastInfo = {};
      this.send(`position fen ${fen}`);
      const bestMoveLine = this.waitFor((line) => line.startsWith('bestmove '), Math.max(18000, movetime + 12000));
      this.send(`go movetime ${Math.max(220, Math.round(movetime))}`);
      const line = await bestMoveLine;
      const move = line.split(/\\s+/)[1];
      const mate = Number(this.lastInfo.mate);
      let scoreCp = Number(this.lastInfo.scoreCp);
      if (Number.isFinite(mate) && mate !== 0) scoreCp = mate > 0 ? 100000 - Math.abs(mate) * 100 : -100000 + Math.abs(mate) * 100;
      if (!Number.isFinite(scoreCp)) scoreCp = 0;
      return { move: move && !['(none)', '0000'].includes(move) ? move : null, scoreCp, ...this.lastInfo };
    };
    const result = this.searchQueue.then(run, run);
    this.searchQueue = result.catch(() => undefined);
    return result;
  }"""
new_evaluate = """  evaluate({ fen, movetime = 450, searchMoves = [] }) {
    const run = async () => {
      await this.ready;
      await this.configureReview();
      this.lastInfo = {};
      this.send(`position fen ${fen}`);
      const thinkTime = Math.max(220, Math.round(movetime));
      const roots = Array.isArray(searchMoves) ? searchMoves.map(normalizeUciMove).filter(Boolean) : [];
      const bestMoveLine = this.waitFor((line) => line.startsWith('bestmove '), Math.max(18000, thinkTime + 12000));
      const rootClause = roots.length ? `searchmoves ${roots.join(' ')} ` : '';
      this.send(`go ${rootClause}movetime ${thinkTime}`);
      const line = await bestMoveLine;
      const move = normalizeUciMove(line.split(/\\s+/)[1]);
      const mate = Number(this.lastInfo.mate);
      let scoreCp = Number(this.lastInfo.scoreCp);
      if (Number.isFinite(mate) && mate !== 0) scoreCp = mate > 0 ? 100000 - Math.abs(mate) * 100 : -100000 + Math.abs(mate) * 100;
      if (!Number.isFinite(scoreCp)) scoreCp = 0;
      return {
        move: move && !['(none)', '0000'].includes(move) ? move : null,
        scoreCp,
        searchMoves: roots,
        ...this.lastInfo,
      };
    };
    const result = this.searchQueue.then(run, run);
    this.searchQueue = result.catch(() => undefined);
    return result;
  }"""
app = replace_once(app, old_evaluate, new_evaluate, "Stockfish evaluate searchmoves")

analysis_pattern = re.compile(r"async function analyzeMoveWithStockfish\(fenBefore, moveUci\) \{.*?\n\}\n\nfunction applyMoveAnalysisResult", re.S)
new_analysis = r'''async function analyzeMoveWithStockfish(fenBefore, moveUci) {
  const engine = getStockfishReviewEngine();
  const selectedMove = normalizeUciMove(moveUci);
  if (!selectedMove) throw new Error('Move review received an invalid UCI move');

  // First identify Stockfish's preferred root move. The actual loss comparison
  // below is then run from the SAME FEN, with the SAME time budget, and each
  // candidate forced via UCI searchmoves. This avoids perspective/sign drift and
  // unequal-search contradictions such as “Re5: Blunder / Best move: Re5”.
  const discovery = await engine.evaluate({ fen: fenBefore, movetime: 760 });
  let bestMove = normalizeUciMove(discovery.move);
  if (!bestMove) bestMove = selectedMove;

  if (sameUciMove(selectedMove, bestMove)) {
    const bestLine = pvWithRootMove(bestMove, discovery.pv);
    return {
      cpLoss: 0,
      bestMove,
      bestLine,
      selectedLine: bestLine,
      bestScore: discovery.scoreCp,
      selectedScore: discovery.scoreCp,
      depth: discovery.depth || 0,
      exactBest: true,
      analysisConsistency: 'exact-engine-match',
      source: 'Stockfish 18 equal-root review',
    };
  }

  const comparisonTime = 620;
  const bestRoot = await engine.evaluate({ fen: fenBefore, movetime: comparisonTime, searchMoves: [bestMove] });
  const selectedRoot = await engine.evaluate({ fen: fenBefore, movetime: comparisonTime, searchMoves: [selectedMove] });
  let bestScore = Number(bestRoot.scoreCp);
  let selectedScore = Number(selectedRoot.scoreCp);
  if (!Number.isFinite(bestScore)) bestScore = Number(discovery.scoreCp) || 0;
  if (!Number.isFinite(selectedScore)) selectedScore = bestScore;
  let bestLine = pvWithRootMove(bestMove, bestRoot.pv || discovery.pv);
  const selectedLine = pvWithRootMove(selectedMove, selectedRoot.pv);

  // If the forced search now scores the user's move higher than the discovery
  // move, search variance has shown that the user's move is at least co-best.
  let exactBest = false;
  let cpLoss = Math.max(0, Math.round(bestScore - selectedScore));
  if (selectedScore >= bestScore - 8) {
    cpLoss = 0;
    exactBest = true;
    if (selectedScore > bestScore + 8) {
      bestMove = selectedMove;
      bestScore = selectedScore;
      bestLine = selectedLine;
    }
  }

  return {
    cpLoss: Math.min(1000, cpLoss),
    bestMove,
    bestLine,
    selectedLine,
    bestScore,
    selectedScore,
    depth: Math.max(discovery.depth || 0, bestRoot.depth || 0, selectedRoot.depth || 0),
    exactBest,
    analysisConsistency: 'equal-time-root-restricted',
    source: 'Stockfish 18 equal-root review',
  };
}

function applyMoveAnalysisResult'''
app, count = analysis_pattern.subn(lambda _match: new_analysis, app, count=1)
if count != 1:
    raise SystemExit("analyzeMoveWithStockfish replacement failed")

old_apply = """  targetMove.cpLoss = data.cpLoss;
  targetMove.bestMove = data.bestMove || null;
  targetMove.bestScore = data.bestScore ?? null;
  targetMove.selectedScore = data.selectedScore ?? null;
  targetMove.analysisDepth = data.depth || null;
  targetMove.analysisSource = data.source || 'Local fallback';
  targetMove.bestLine = Array.isArray(data.bestLine) ? data.bestLine.slice(0, 10) : (data.bestMove ? [data.bestMove] : []);
  targetMove.quality = qualityForLoss(data.cpLoss).key;"""
new_apply = """  targetMove.cpLoss = Math.max(0, Number(data.cpLoss) || 0);
  targetMove.bestMove = normalizeUciMove(data.bestMove) || null;
  targetMove.bestScore = data.bestScore ?? null;
  targetMove.selectedScore = data.selectedScore ?? null;
  targetMove.analysisDepth = data.depth || null;
  targetMove.analysisSource = data.source || 'Local fallback';
  targetMove.bestLine = pvWithRootMove(targetMove.bestMove, data.bestLine);
  targetMove.selectedLine = pvWithRootMove(targetMove.uci, data.selectedLine);
  targetMove.exactBest = Boolean(data.exactBest);
  targetMove.analysisConsistency = data.analysisConsistency || null;
  reconcileMoveAnalysisRecord(targetMove);
  targetMove.quality = qualityForMoveRecord(targetMove).key;"""
app = replace_once(app, old_apply, new_apply, "applyMoveAnalysisResult")
app = app.replace("const band = qualityForLoss(data.cpLoss);", "const band = qualityForMoveRecord(targetMove);", 1)

summary_pattern = re.compile(r"function summarizeSession\(session\) \{.*?\n\}\n\nfunction serializeMoveSequence", re.S)
new_summary = r'''function summarizeSession(session) {
  reconcileSessionAnalysis(session);
  const losses = session.userMoves.map(effectiveMoveLoss).filter(Number.isFinite);
  const quality = { best: 0, excellent: 0, good: 0, inaccuracy: 0, miss: 0, blunder: 0 };
  for (const move of session.userMoves) {
    const key = qualityForMoveRecord(move).key;
    if (quality[key] !== undefined) quality[key] += 1;
  }
  const control = TIME_CONTROLS[session.timeControl] || TIME_CONTROLS.untimed;
  const used = control.base
    ? Math.max(0, Math.min(1.5, (control.base * 1000 - (session.remainingMs ?? 0)) / (control.base * 1000)))
    : null;
  return {
    analyzedMoves: losses.length,
    avgCpLoss: average(losses),
    quality,
    avgMoveTimeMs: average(session.userMoves.map((move) => move.spentMs)),
    timeUsedPct: used,
  };
}

function serializeMoveSequence'''
app, count = summary_pattern.subn(lambda _match: new_summary, app, count=1)
if count != 1:
    raise SystemExit("summarizeSession replacement failed")

review_advice_pattern = re.compile(r"function reviewMoveAdvice\(move\) \{.*?\n\}\n\nfunction readableEngineMove", re.S)
new_review_advice = r'''function reviewMoveAdvice(move) {
  const loss = effectiveMoveLoss(move);
  if (!Number.isFinite(loss)) return 'Analysis pending.';
  if (Number.isFinite(move.spentMs) && move.spentMs < 4000 && loss > 110) {
    return 'Rushed error: pause for the opponent’s threat, hanging pieces, checks, captures, and threats.';
  }
  if (loss > 220) return 'Blunder: first check forcing moves and whether any piece is undefended.';
  if (loss > 110) return 'Miss: a significant opportunity or defensive resource was overlooked. Compare forcing candidates before committing.';
  if (loss > 60) return 'Inaccuracy: re-check king safety, the opponent’s plan, and your least active piece.';
  if (loss > 25) return 'Good practical move, although a more precise continuation was available.';
  if (loss > 10) return 'Excellent move: very close to the engine’s top choice.';
  return 'Best move: essentially the engine’s top-quality choice.';
}

function readableEngineMove'''
app, count = review_advice_pattern.subn(lambda _match: new_review_advice, app, count=1)
if count != 1:
    raise SystemExit("reviewMoveAdvice replacement failed")

# Targeted review and coach rendering repairs.
replacements = {
    "const analyzed = moves.filter((move) => Number.isFinite(move.cpLoss));": "const analyzed = moves.filter((move) => Number.isFinite(effectiveMoveLoss(move)));",
    "const key = qualityForLoss(move.cpLoss).key;": "const key = qualityForMoveRecord(move).key;",
    "const worst = analyzed.slice().sort((a, b) => b.cpLoss - a.cpLoss)[0];": "const worst = analyzed.slice().sort((a, b) => effectiveMoveLoss(b) - effectiveMoveLoss(a))[0];",
    "Estimated loss: ${Math.round(worst.cpLoss)} cp.": "Estimated loss: ${Math.round(effectiveMoveLoss(worst))} cp.",
    "const band = Number.isFinite(move.cpLoss) ? qualityForLoss(move.cpLoss) : { key: 'pending', label: 'Pending' };": "const band = Number.isFinite(effectiveMoveLoss(move)) ? qualityForMoveRecord(move) : { key: 'pending', label: 'Pending' };",
    "const loss = Number.isFinite(move.cpLoss) ? `${Math.round(move.cpLoss)} cp` : 'Analyzing…';": "const effectiveLoss = effectiveMoveLoss(move);\n        const loss = Number.isFinite(effectiveLoss) ? `${Math.round(effectiveLoss)} cp` : 'Analyzing…';",
    "const key = qualityForLoss(frame.userRecord?.cpLoss).key;": "const key = qualityForMoveRecord(frame.userRecord).key;",
    "const rated = frame.userRecord ? qualityForLoss(frame.userRecord.cpLoss) : null;": "const rated = frame.userRecord ? qualityForMoveRecord(frame.userRecord) : null;",
    "const band = qualityForLoss(record.cpLoss);": "const band = qualityForMoveRecord(record);",
}
for old, new in replacements.items():
    if old in app:
        app = app.replace(old, new)

# ---------------------------------------------------------------------------
# 3. Add an animated Stockfish principal-variation player to Coach Replay.
# ---------------------------------------------------------------------------
best_line_helpers = r'''
function bestContinuationMoves(record) {
  if (!record?.bestMove) return [];
  return pvWithRootMove(record.bestMove, record.bestLine).slice(0, 10);
}

function buildBestContinuationFrames(frame) {
  if (!frame?.fenBefore || !frame?.userRecord?.bestMove) return [];
  const line = bestContinuationMoves(frame.userRecord);
  const variation = new Chess(frame.fenBefore);
  const frames = [{ index: 0, fen: variation.fen(), fenBefore: variation.fen(), move: null, san: 'Starting position', uci: null }];
  for (const uci of line) {
    const fenBefore = variation.fen();
    const object = moveObjectFromUci(uci);
    let applied = null;
    try { applied = object ? variation.move(object) : null; } catch {}
    if (!applied) break;
    frames.push({
      index: frames.length,
      fen: variation.fen(),
      fenBefore,
      uci,
      san: applied.san,
      move: { from: applied.from, to: applied.to, san: applied.san, color: applied.color, piece: applied.piece, captured: applied.captured || null, promotion: applied.promotion || null },
    });
  }
  return frames;
}

function ensureBestContinuationFrames(frame) {
  const key = frame?.userRecord?.id || null;
  if (!key) return [];
  if (replayState.bestLineKey !== key) {
    replayState.bestLineKey = key;
    replayState.bestLineFrames = buildBestContinuationFrames(frame);
    replayState.bestLineIndex = -1;
    replayState.bestLinePlaying = false;
    if (replayState.bestLineTimer) window.clearTimeout(replayState.bestLineTimer);
    replayState.bestLineTimer = null;
  }
  return replayState.bestLineFrames;
}

function stopBestLinePlayback({ reset = true, render = false } = {}) {
  if (replayState.bestLineTimer) window.clearTimeout(replayState.bestLineTimer);
  replayState.bestLineTimer = null;
  replayState.bestLinePlaying = false;
  if (reset) {
    replayState.bestLineKey = null;
    replayState.bestLineFrames = [];
    replayState.bestLineIndex = -1;
    replayState.showBest = false;
  }
  if (render && $('#replayDialog')?.open) renderCoachReplay();
}

function currentBestContinuationFrame() {
  if (replayState.bestLineIndex < 0 || !replayState.bestLineFrames.length) return null;
  return replayState.bestLineFrames[Math.min(replayState.bestLineIndex, replayState.bestLineFrames.length - 1)] || null;
}

function bestLineTokenMarkup(frames, currentIndex) {
  return frames.slice(1).map((item, index) => {
    const active = index + 1 === currentIndex ? ' active' : '';
    return `<span class="best-line-token${active}">${escapeHtml(item.san)}</span>`;
  }).join(' ');
}

'''
app = replace_once(app, "function replayDisplayPosition(frame) {", best_line_helpers + "function replayDisplayPosition(frame) {", "best-line helpers")

old_display = """function replayDisplayPosition(frame) {
  if (replayState.showBest && frame?.userRecord?.bestMove) {
    const preview = new Chess(frame.fenBefore);
    const object = moveObjectFromUci(frame.userRecord.bestMove);
    let applied = null;
    try { applied = object ? preview.move(object) : null; } catch {}
    if (applied) return { game: preview, last: { from: applied.from, to: applied.to }, bestPreview: true };
  }
  const replayGame = new Chess(frame.fen);
  return { game: replayGame, last: frame.move ? { from: frame.move.from, to: frame.move.to } : null, bestPreview: false };
}"""
new_display = """function replayDisplayPosition(frame) {
  const continuation = currentBestContinuationFrame();
  if (continuation) {
    return {
      game: new Chess(continuation.fen),
      last: continuation.move ? { from: continuation.move.from, to: continuation.move.to } : null,
      bestPreview: true,
      bestLinePreview: true,
      continuation,
    };
  }
  if (replayState.showBest && frame?.userRecord?.bestMove) {
    const preview = new Chess(frame.fenBefore);
    const object = moveObjectFromUci(frame.userRecord.bestMove);
    let applied = null;
    try { applied = object ? preview.move(object) : null; } catch {}
    if (applied) return { game: preview, last: { from: applied.from, to: applied.to }, bestPreview: true, bestLinePreview: false };
  }
  const replayGame = new Chess(frame.fen);
  return { game: replayGame, last: frame.move ? { from: frame.move.from, to: frame.move.to } : null, bestPreview: false, bestLinePreview: false };
}"""
app = replace_once(app, old_display, new_display, "replayDisplayPosition")

old_board_marks = """    if (display.last && (display.last.from === square || display.last.to === square)) cell.classList.add('last');
    if (display.bestPreview && display.last?.to === square) cell.classList.add('best-preview-square');
    else if (frame.userRecord && frame.move?.to === square) cell.classList.add('move-quality-square', `quality-${rated?.key || 'pending'}`);"""
new_board_marks = """    if (display.last && (display.last.from === square || display.last.to === square)) cell.classList.add('last');
    if (display.bestLinePreview && display.last && (display.last.from === square || display.last.to === square)) cell.classList.add('best-line-preview-square');
    if (display.bestPreview && display.last?.to === square) cell.classList.add('best-preview-square');
    else if (frame.userRecord && frame.move?.to === square && !display.bestLinePreview) cell.classList.add('move-quality-square', `quality-${rated?.key || 'pending'}`);"""
app = replace_once(app, old_board_marks, new_board_marks, "replay board best-line marks")

app = replace_once(
    app,
    """  const lineBox = $('#replayLine');
  const bestButton = $('#replayBestButton');""",
    """  const lineBox = $('#replayLine');
  const bestButton = $('#replayBestButton');
  const bestLineButton = $('#replayBestLineButton');
  const bestLineStatus = $('#replayBestLineStatus');""",
    "replay controls lookup",
)
app = app.replace(
    "comparison.hidden = true; lineBox.hidden = true; bestButton.hidden = true;",
    "comparison.hidden = true; lineBox.hidden = true; bestButton.hidden = true; bestLineButton.hidden = true; bestLineStatus.hidden = true;",
    1,
)

old_user_line = """    lineBox.hidden = !narration.line.length;
    $('#replayLineMoves').textContent = narration.line.length ? narration.line.join(' ') : 'No principal variation stored';
    bestButton.hidden = !frame.userRecord?.bestMove;
    bestButton.textContent = replayState.showBest ? 'Return to played move' : 'Show best move on board';"""
new_user_line = """    const continuationFrames = ensureBestContinuationFrames(frame);
    lineBox.hidden = continuationFrames.length <= 1;
    $('#replayLineMoves').innerHTML = continuationFrames.length > 1
      ? bestLineTokenMarkup(continuationFrames, replayState.bestLineIndex)
      : 'No principal variation stored';
    bestButton.hidden = !frame.userRecord?.bestMove;
    bestButton.textContent = replayState.showBest && replayState.bestLineIndex < 0 ? 'Return to played move' : 'Show best move on board';
    bestLineButton.hidden = continuationFrames.length <= 1;
    bestLineButton.textContent = replayState.bestLinePlaying
      ? '❚❚ Pause best continuation'
      : replayState.bestLineIndex >= 0 ? '↺ Replay best continuation' : '▶ Play best continuation';
    const continuation = currentBestContinuationFrame();
    if (continuation) {
      bestLineStatus.hidden = false;
      const total = Math.max(1, continuationFrames.length - 1);
      if (continuation.index === 0) {
        bestLineStatus.innerHTML = `<b>Best continuation ready</b><span>Stockfish will play ${total} half-move${total === 1 ? '' : 's'} from the position before your decision.</span>`;
      } else {
        const description = describeMoveFromFen(continuation.fenBefore, continuation.uci);
        bestLineStatus.innerHTML = `<b>Best line ${continuation.index}/${total}: ${escapeHtml(continuation.san)}</b><span>${escapeHtml(description.text)}</span>`;
        $('#replayPlyLabel').textContent = `Best continuation · ${continuation.san}`;
        $('#replayEval').textContent = 'Stockfish principal variation';
      }
    } else {
      bestLineStatus.hidden = true;
    }"""
app = replace_once(app, old_user_line, new_user_line, "user replay best-line UI")

# Replace the opponent branch's remaining hide statement (the start-position one was replaced above).
app = app.replace(
    "comparison.hidden = true; lineBox.hidden = true; bestButton.hidden = true;",
    "comparison.hidden = true; lineBox.hidden = true; bestButton.hidden = true; bestLineButton.hidden = true; bestLineStatus.hidden = true;",
    1,
)

app = replace_once(
    app,
    """function setReplayIndex(index, playSound = true, speak = true) {
  if (!replayState.frames.length) return;
  const previous = replayState.index;""",
    """function setReplayIndex(index, playSound = true, speak = true) {
  if (!replayState.frames.length) return;
  stopBestLinePlayback({ reset: true, render: false });
  const previous = replayState.index;""",
    "setReplayIndex cleanup",
)
app = replace_once(
    app,
    """function toggleReplayAuto() {
  if (replayState.auto) {""",
    """function toggleReplayAuto() {
  stopBestLinePlayback({ reset: true, render: false });
  if (replayState.auto) {""",
    "toggleReplayAuto cleanup",
)
app = replace_once(
    app,
    "replayState = { session, frames, index: 0, timer: null, auto: false, showBest: false };",
    "replayState = { session, frames, index: 0, timer: null, auto: false, showBest: false, bestLineKey: null, bestLineFrames: [], bestLineIndex: -1, bestLineTimer: null, bestLinePlaying: false };",
    "openCoachReplay state",
)
app = replace_once(
    app,
    """function toggleReplayBestMove() {
  const frame = replayState.frames[replayState.index];""",
    """function toggleReplayBestMove() {
  stopBestLinePlayback({ reset: true, render: false });
  const frame = replayState.frames[replayState.index];""",
    "toggleReplayBestMove cleanup",
)

best_line_player = r'''

function advanceBestLinePlayback() {
  if (!replayState.bestLinePlaying) return;
  const frame = replayState.frames[replayState.index];
  const frames = ensureBestContinuationFrames(frame);
  if (replayState.bestLineIndex >= frames.length - 1) {
    replayState.bestLinePlaying = false;
    replayState.bestLineTimer = null;
    renderCoachReplay();
    return;
  }
  replayState.bestLineIndex += 1;
  replayState.showBest = true;
  const step = frames[replayState.bestLineIndex];
  if (step?.move) replayMoveSound({ move: step.move });
  renderCoachReplay();
  replayState.bestLineTimer = window.setTimeout(advanceBestLinePlayback, 1350);
}

function toggleBestLinePlayback() {
  const frame = replayState.frames[replayState.index];
  if (!frame?.isUser) return;
  stopReplayAuto();
  stopCoachSpeech();
  const frames = ensureBestContinuationFrames(frame);
  if (frames.length <= 1) {
    toast('No Stockfish continuation is stored for this move');
    return;
  }
  if (replayState.bestLinePlaying) {
    replayState.bestLinePlaying = false;
    if (replayState.bestLineTimer) window.clearTimeout(replayState.bestLineTimer);
    replayState.bestLineTimer = null;
    renderCoachReplay();
    return;
  }
  if (replayState.bestLineIndex >= frames.length - 1 || replayState.bestLineIndex < 0) replayState.bestLineIndex = 0;
  replayState.showBest = true;
  replayState.bestLinePlaying = true;
  renderCoachReplay();
  replayState.bestLineTimer = window.setTimeout(advanceBestLinePlayback, 520);
}
'''
app = replace_once(app, "\nfunction sessionCoach(session) {", best_line_player + "\nfunction sessionCoach(session) {", "best-line player")

# When a best-line preview is active, voice playback should describe the visible step.
app = replace_once(
    app,
    """function coachSpeechSegmentsForCurrentFrame() {
  const title = $('#replayCoachTitle')?.textContent?.trim() || '';""",
    """function coachSpeechSegmentsForCurrentFrame() {
  const continuation = currentBestContinuationFrame();
  if (continuation?.index > 0) {
    const status = $('#replayBestLineStatus')?.textContent?.trim() || `Best continuation: ${continuation.san}`;
    return [{ text: status, pause: 0 }];
  }
  const title = $('#replayCoachTitle')?.textContent?.trim() || '';""",
    "voice best-line narration",
)

# Cache/version updates.
app = app.replace("url.search = '?v=20260828-24';", "url.search = '?v=20260828-25';")
write(app_path, app)

# ---------------------------------------------------------------------------
# HTML: add the best-continuation player alongside the one-move preview.
# ---------------------------------------------------------------------------
index_path = "kmate-trainer/index.html"
index = read(index_path)
old_button = '          <button class="btn replay-best-button" id="replayBestButton" type="button" hidden>Show best move on board</button>'
new_buttons = '''          <div class="replay-best-actions">
            <button class="btn replay-best-button" id="replayBestButton" type="button" hidden>Show best move on board</button>
            <button class="btn replay-best-line-button" id="replayBestLineButton" type="button" hidden>▶ Play best continuation</button>
          </div>
          <div class="replay-best-line-status" id="replayBestLineStatus" hidden></div>'''
index = replace_once(index, old_button, new_buttons, "replay best-line buttons")
index = index.replace(
    'Coach K uses local Stockfish analysis. The explanation is practical training guidance, not a claim that every strategic nuance has been proven.',
    'Coach K uses equal-time, root-restricted Stockfish comparisons. Play the stored principal variation to see how the stronger move could continue.',
)
index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=25.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=25.0.0", index)
write(index_path, index)

# ---------------------------------------------------------------------------
# CSS: compact best-line controls that still fit the mobile replay viewport.
# ---------------------------------------------------------------------------
styles_path = "kmate-trainer/styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v25 — consistent review and animated best continuation */
.replay-best-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}
.replay-best-actions .btn{width:100%;min-height:40px;padding:0 10px;font-size:11px}
.replay-best-line-button{border-color:#75d6ff55;background:#168ec617;color:#aeeaff}
.replay-best-line-button:hover{border-color:#75d6ffaa;background:#168ec62c}
.replay-best-line-status{display:grid;gap:3px;margin-top:8px;padding:10px 11px;border:1px solid #75d6ff38;border-radius:12px;background:#0a70931a;text-align:left}
.replay-best-line-status b{color:#bdeeff;font-size:12px}
.replay-best-line-status span{color:#cbdadf;font-size:10px;line-height:1.35}
.best-line-token{display:inline-block;margin:2px 1px;padding:3px 5px;border-radius:7px;background:#ffffff08;color:var(--muted);font-size:10px}
.best-line-token.active{background:#168ec64a;color:#d9f7ff;box-shadow:inset 0 0 0 1px #75d6ff77}
.replay-board .sq.best-line-preview-square{box-shadow:inset 0 0 0 5px #5bd4ff,inset 0 0 0 999px #168ec64d!important}
.replay-board .sq.best-line-preview-square.best-preview-square{animation:bestLinePulseV25 .55s ease-out}
@keyframes bestLinePulseV25{0%{filter:brightness(1.55)}100%{filter:none}}
@media(max-width:760px){
  .replay-best-actions{gap:4px;margin-top:5px}
  .replay-best-actions .btn{min-height:31px;padding:0 6px;font-size:8px}
  .replay-best-line-status{margin-top:4px;padding:6px 7px}
  .replay-best-line-status b{font-size:8.5px}.replay-best-line-status span{font-size:7px}
  .best-line-token{padding:2px 3px;font-size:7px}
  .replay-board .sq.best-line-preview-square{box-shadow:inset 0 0 0 3px #5bd4ff,inset 0 0 0 999px #168ec64d!important}
}
'''
write(styles_path, styles)

# ---------------------------------------------------------------------------
# Loader and bindings/state/test hooks.
# ---------------------------------------------------------------------------
loader_path = "kmate-trainer/app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=25.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=25.0.0", loader)
write(loader_path, loader)

part6_path = "kmate-trainer/app-v7-part6.txt"
part6 = read(part6_path)
part6 = replace_once(
    part6,
    "  $('#replayBestButton')?.addEventListener('click', toggleReplayBestMove);",
    "  $('#replayBestButton')?.addEventListener('click', toggleReplayBestMove);\n  $('#replayBestLineButton')?.addEventListener('click', toggleBestLinePlayback);",
    "best-line binding",
)
part6 = replace_once(
    part6,
    "  $('#coachMyVoiceInfo')?.addEventListener('click', () => openDialog('voiceCloneDialog'));",
    """  $('#coachMyVoiceInfo')?.addEventListener('click', () => openDialog('voiceCloneDialog'));
  $('#replayDialog')?.addEventListener('close', () => {
    stopReplayAuto();
    stopBestLinePlayback({ reset: true, render: false });
    stopCoachSpeech();
  });""",
    "replay close cleanup",
)
part6 = part6.replace("version: '24.0-commercial-beta'", "version: '25.0-commercial-beta'")
old_replay_state = "replay: { open: Boolean($('#replayDialog')?.open), index: replayState.index, frames: replayState.frames.length, showBest: replayState.showBest, coachVoice: settings.coachVoice !== false, coachSpeaking: Boolean(coachSpeechUtterance || window.speechSynthesis?.speaking), resolvedVoice: chooseCoachVoice()?.name || null, voiceURI: settings.coachVoiceURI || 'british-woman', voiceProfile: settings.coachVoiceURI === 'british-woman' ? 'generic British woman' : 'device voice', rate: Number(settings.coachVoiceRate) || 0.92, avatar: settings.coachAvatar || 'grandmaster' },"
new_replay_state = "replay: { open: Boolean($('#replayDialog')?.open), index: replayState.index, frames: replayState.frames.length, showBest: replayState.showBest, bestLinePlaying: replayState.bestLinePlaying, bestLineIndex: replayState.bestLineIndex, bestLineFrames: replayState.bestLineFrames.length, coachVoice: settings.coachVoice !== false, coachSpeaking: Boolean(coachSpeechUtterance || window.speechSynthesis?.speaking), resolvedVoice: chooseCoachVoice()?.name || null, voiceURI: settings.coachVoiceURI || 'british-woman', voiceProfile: settings.coachVoiceURI === 'british-woman' ? 'generic British woman' : 'device voice', rate: Number(settings.coachVoiceRate) || 0.92, avatar: settings.coachAvatar || 'grandmaster' },"
part6 = replace_once(part6, old_replay_state, new_replay_state, "state replay details")
part6 = part6.replace("reviewEngine: 'Independent Stockfish 18 move review'", "reviewEngine: 'Equal-time root-restricted Stockfish 18 review'")

sample_marker = """    sampleGenerated: (count = 24) => Array.from({ length: Math.max(1, Math.min(60, Number(count) || 24)) }, () => {
      const position = freshPosition();
      return { fen: position.fen, id: position.id, seedId: position.seedId, branchDepth: position.branchDepth || 0, generated: Boolean(position.generated) };
    }),"""
test_extensions = sample_marker + """
    repairMoveRecord: (record) => {
      const copy = clone(record);
      reconcileMoveAnalysisRecord(copy);
      return { ...copy, effectiveLoss: effectiveMoveLoss(copy), band: qualityForMoveRecord(copy) };
    },
    analyzeBestMove: async (fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') => {
      const discovery = await getStockfishReviewEngine().evaluate({ fen, movetime: 520 });
      const analysis = await analyzeMoveWithStockfish(fen, discovery.move);
      const record = { id: 'test-best', uci: discovery.move, bestMove: analysis.bestMove, bestLine: analysis.bestLine, selectedLine: analysis.selectedLine, cpLoss: analysis.cpLoss, bestScore: analysis.bestScore, selectedScore: analysis.selectedScore };
      const frames = buildBestContinuationFrames({ fenBefore: fen, userRecord: record });
      return { discovery, analysis, frames: frames.map((item) => ({ index: item.index, fen: item.fen, san: item.san, uci: item.uci })) };
    },
    openBestLineDemo: async (fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') => {
      const result = await window.__KMATE__.test.analyzeBestMove(fen);
      const demo = new Chess(fen);
      const object = moveObjectFromUci(result.discovery.move);
      const applied = object ? demo.move(object) : null;
      if (!applied) throw new Error('Unable to build best-line demo');
      const record = {
        id: 'demo-move', san: applied.san, uci: result.discovery.move, from: applied.from, to: applied.to,
        color: applied.color, ply: 1, fenBefore: fen, cpLoss: result.analysis.cpLoss,
        bestMove: result.analysis.bestMove, bestLine: result.analysis.bestLine,
        selectedLine: result.analysis.selectedLine, bestScore: result.analysis.bestScore,
        selectedScore: result.analysis.selectedScore, quality: 'best',
      };
      const session = {
        id: 'demo-session', startFen: fen, finalFen: demo.fen(), phase: 'middlegame', opening: 'Review test',
        theme: 'Move-review consistency', tags: ['calculation'], timeControl: 'untimed', userColor: 'w',
        opponentRating: 1600, outcome: 'draw', reason: 'test', completed: true, takebacks: 0,
        userMoves: [record], moveSequence: [{ ply: 1, color: applied.color, from: applied.from, to: applied.to, san: applied.san, uci: result.discovery.move, piece: applied.piece, captured: applied.captured || null, promotion: applied.promotion || null, flags: applied.flags || '' }],
      };
      reconcileSessionAnalysis(session);
      openCoachReplay(session);
      setReplayIndex(1, false, false);
      return result;
    },"""
part6 = replace_once(part6, sample_marker, test_extensions, "localhost review test helpers")
write(part6_path, part6)
