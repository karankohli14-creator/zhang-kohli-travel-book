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

app = replace_once(
    app,
    """function normalizeUciMove(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-h1-8qrbn]/g, '').slice(0, 5);
}""",
    """function normalizeUciMove(value) {
  const cleaned = String(value || '').trim().toLowerCase().replace(/[^a-h1-8qrbn]/g, '').slice(0, 5);
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(cleaned) ? cleaned : '';
}""",
    "strict UCI validation",
)

app = replace_once(
    app,
    """      const move = normalizeUciMove(line.split(/\\s+/)[1]);
      const mate = Number(this.lastInfo.mate);""",
    """      const move = normalizeUciMove(line.split(/\\s+/)[1]);
      const mate = Number(this.lastInfo.mate);""",
    "evaluate move normalization",
)
app = replace_once(
    app,
    """        move: move && !['(none)', '0000'].includes(move) ? move : null,
        scoreCp,""",
    """        move: move || null,
        scoreCp,""",
    "evaluate null move handling",
)

analysis_marker = "async function analyzeMoveWithStockfish(fenBefore, moveUci) {"
extender = r'''async function extendPrincipalVariation(engine, fen, pv, targetPlies = 8) {
  const gameLine = new Chess(fen);
  const legalLine = [];
  for (const candidate of Array.isArray(pv) ? pv : []) {
    const move = normalizeUciMove(candidate);
    if (!move) break;
    const object = moveObjectFromUci(move);
    let applied = null;
    try { applied = object ? gameLine.move(object) : null; } catch {}
    if (!applied) break;
    legalLine.push(move);
    if (legalLine.length >= targetPlies || gameLine.isGameOver()) return legalLine;
  }
  while (legalLine.length < targetPlies && !gameLine.isGameOver()) {
    let result = null;
    try { result = await engine.evaluate({ fen: gameLine.fen(), movetime: 260 }); } catch { break; }
    const move = normalizeUciMove(result?.move);
    if (!move) break;
    const object = moveObjectFromUci(move);
    let applied = null;
    try { applied = object ? gameLine.move(object) : null; } catch {}
    if (!applied) break;
    legalLine.push(move);
  }
  return legalLine;
}

'''
app = replace_once(app, analysis_marker, extender + analysis_marker, "principal variation extender")

old_exact = """  if (sameUciMove(selectedMove, bestMove)) {
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
  }"""
new_exact = """  if (sameUciMove(selectedMove, bestMove)) {
    const exactRoot = await engine.evaluate({ fen: fenBefore, movetime: 720, searchMoves: [bestMove] });
    let bestLine = pvWithRootMove(bestMove, exactRoot.pv || discovery.pv);
    bestLine = await extendPrincipalVariation(engine, fenBefore, bestLine, 8);
    const exactScore = Number.isFinite(Number(exactRoot.scoreCp)) ? Number(exactRoot.scoreCp) : Number(discovery.scoreCp) || 0;
    return {
      cpLoss: 0,
      bestMove,
      bestLine,
      selectedLine: bestLine,
      bestScore: exactScore,
      selectedScore: exactScore,
      depth: Math.max(discovery.depth || 0, exactRoot.depth || 0),
      exactBest: true,
      analysisConsistency: 'exact-engine-match',
      source: 'Stockfish 18 equal-root review',
    };
  }"""
app = replace_once(app, old_exact, new_exact, "exact-best richer line")

app = replace_once(
    app,
    """  let bestLine = pvWithRootMove(bestMove, bestRoot.pv || discovery.pv);
  const selectedLine = pvWithRootMove(selectedMove, selectedRoot.pv);""",
    """  let bestLine = pvWithRootMove(bestMove, bestRoot.pv || discovery.pv);
  bestLine = await extendPrincipalVariation(engine, fenBefore, bestLine, 8);
  const selectedLine = pvWithRootMove(selectedMove, selectedRoot.pv);""",
    "non-best richer line",
)

# Remove a duplicated hide sequence introduced during v25 patching.
app = app.replace(
    "comparison.hidden = true; lineBox.hidden = true; bestButton.hidden = true; bestLineButton.hidden = true; bestLineStatus.hidden = true; bestLineButton.hidden = true; bestLineStatus.hidden = true;",
    "comparison.hidden = true; lineBox.hidden = true; bestButton.hidden = true; bestLineButton.hidden = true; bestLineStatus.hidden = true;",
)

# Hide continuation controls on opponent frames, rather than leaving stale controls from the previous user decision.
old_opponent_hide = """    comparison.hidden = true; lineBox.hidden = true; bestButton.hidden = true;
  }
  updateCoachAvatarMood(frame);"""
new_opponent_hide = """    comparison.hidden = true; lineBox.hidden = true; bestButton.hidden = true; bestLineButton.hidden = true; bestLineStatus.hidden = true;
  }
  updateCoachAvatarMood(frame);"""
app = replace_once(app, old_opponent_hide, new_opponent_hide, "opponent-frame continuation controls")

app = app.replace("url.search = '?v=20260828-25';", "url.search = '?v=20260828-25-1';")
write(app_path, app)

index_path = "kmate-trainer/index.html"
index = read(index_path)
index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=25.1.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=25.1.0", index)
write(index_path, index)

loader_path = "kmate-trainer/app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=25.1.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=25.1.0", loader)
write(loader_path, loader)

part6_path = "kmate-trainer/app-v7-part6.txt"
part6 = read(part6_path)
part6 = part6.replace("version: '25.0-commercial-beta'", "version: '25.1-commercial-beta'")
write(part6_path, part6)
