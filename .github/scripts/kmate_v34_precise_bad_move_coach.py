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
# Markup: explain that the live screen changes only for bad moves and show two
# concrete engine lines rather than one generic continuation.
# ---------------------------------------------------------------------------
index_path = ROOT / "index.html"
index = read(index_path)
index = replace_once(
    index,
    '<span><b>Live Coach after bad moves</b><small>After an Inaccurate, Miss, or Blunder, pause both clocks, keep the board visible, and compare your move with the best move directly on the board.</small></span>',
    '<span><b>Live Coach after bad moves only</b><small>Open the coach only for an Inaccuracy, Mistake, Miss, or Blunder. Best, Excellent, and Good moves never change the board layout.</small></span>',
    "bad-moves-only setup text",
)
index = replace_once(
    index,
    '''              <section class="live-coach-line-wrap">
                <small>Illustrative best continuation</small>
                <div class="live-coach-line" id="liveCoachLine">Principal variation pending.</div>
              </section>''',
    '''              <div class="live-coach-lines-grid">
                <section class="live-coach-line-wrap played-consequence-line">
                  <small>Concrete line after your move</small>
                  <div class="live-coach-line" id="liveCoachPlayedLine">Played-move continuation pending.</div>
                </section>
                <section class="live-coach-line-wrap best-consequence-line">
                  <small>Concrete line after the best move</small>
                  <div class="live-coach-line" id="liveCoachLine">Best-move continuation pending.</div>
                </section>
              </div>''',
    "dual concrete coach lines",
)
index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=34.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=34.0.0", index)
write(index_path, index)


# ---------------------------------------------------------------------------
# Main application logic.
# ---------------------------------------------------------------------------
app_path = ROOT / "app-v7-part1.txt"
app = read(app_path)
app = app.replace("url.search = '?v=20260830-33';", "url.search = '?v=20260830-34';")

app = replace_once(
    app,
    '''function activeLiveCoachRecord() {
  if (!(liveCoachState.awaiting || liveCoachState.open)) return null;
  return liveCoachState.record || null;
}''',
    '''function activeLiveCoachRecord() {
  // Silent analysis of a normal move must not add arrows, resize the board, or
  // otherwise look like a coach intervention. Board comparison appears only
  // after the move has actually crossed the bad-move threshold.
  if (!liveCoachState.open) return null;
  return liveCoachState.record || null;
}''',
    "coach board visible only after threshold",
)

render_turns_pattern = re.compile(r"function renderTurns\(\) \{.*?\n\}\n\nfunction moveRatingForRecord", re.S)
render_turns_replacement = r'''function renderTurns() {
  if (!game) return;
  const coachPause = !finalized && Boolean(liveCoachState.open);
  const silentReview = !finalized && Boolean(liveCoachState.awaiting && !liveCoachState.open);
  const userLive = !thinking && !finalized && !coachPause && game.turn() === userColor;
  const engineLive = !finalized && !coachPause && game.turn() === engineColor;
  $('#userTurn').textContent = finalized ? 'Finished' : coachPause ? 'Coach review' : userLive ? 'Your move' : 'Waiting';
  $('#userTurn').classList.toggle('live', userLive);
  $('#engineTurn').textContent = finalized ? 'Finished' : coachPause ? 'Clock paused' : (thinking || silentReview) ? 'Thinking…' : engineLive ? 'To move' : 'Waiting';
  $('#engineTurn').classList.toggle('live', engineLive && !silentReview);
  $('#userBar').classList.toggle('active', userLive);
  $('#engineBar').classList.toggle('active', engineLive && !coachPause);
  $('#gameView')?.classList.toggle('live-coach-active', coachPause);
  $('#boardCoachStage')?.classList.toggle('coach-open', coachPause);
}

function moveRatingForRecord'''
app, count = render_turns_pattern.subn(render_turns_replacement, app, count=1)
if count != 1:
    raise SystemExit("Unable to replace renderTurns")

old_user_flow = '''  if (settings.liveCoach) {
    queueLiveCoachReview(moveRecord);
    setStatus('Live Coach is reviewing your move. The clock is paused.', 'thinking');
    renderAll();
    if (finishIfNeeded()) {
      resetLiveCoachFlow({ closeModal: true });
      return;
    }
    return;
  }'''
new_user_flow = '''  if (settings.liveCoach) {
    // Grade silently first. The ordinary board must remain unchanged unless the
    // completed analysis is Inaccurate, Mistake, Miss, or Blunder.
    queueLiveCoachReview(moveRecord);
    setStatus(`${game.isCheck() ? 'Check. ' : ''}Opponent is considering the position.`, 'thinking');
    renderAll();
    if (finishIfNeeded()) {
      resetLiveCoachFlow({ closeModal: true });
      return;
    }
    return;
  }'''
app = replace_once(app, old_user_flow, new_user_flow, "silent user-move review gate")

# Extend both candidate continuations to the same useful teaching depth.
app = replace_once(
    app,
    '''  let bestLine = pvWithRootMove(bestMove, bestRoot.pv || discovery.pv);
  bestLine = await extendPrincipalVariation(engine, fenBefore, bestLine, 8);
  const selectedLine = pvWithRootMove(selectedMove, selectedRoot.pv);''',
    '''  let bestLine = pvWithRootMove(bestMove, bestRoot.pv || discovery.pv);
  bestLine = await extendPrincipalVariation(engine, fenBefore, bestLine, 8);
  let selectedLine = pvWithRootMove(selectedMove, selectedRoot.pv);
  selectedLine = await extendPrincipalVariation(engine, fenBefore, selectedLine, 8);''',
    "extend selected principal variation",
)

# Replace the generic narration engine with a concrete board-and-line analyzer.
coach_block_pattern = re.compile(
    r"function strongestAlternativeAchievement\(record, session\) \{.*?\n\nconst LIVE_COACH_ERROR_KEYS",
    re.S,
)
coach_block = r'''const COACH_MATERIAL_VALUES = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 });
const COACH_CENTRAL_SQUARES = new Set(['c3', 'd3', 'e3', 'f3', 'c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5', 'c6', 'd6', 'e6', 'f6']);

function coachSquare(square) {
  return String(square || '').toUpperCase();
}

function coachOwner(color, perspective) {
  return color === perspective ? 'your' : "the opponent's";
}

function coachMaterialPoints(value) {
  const rounded = Math.abs(Math.round(Number(value) || 0));
  return `${rounded} material point${rounded === 1 ? '' : 's'}`;
}

function boardSquareFromIndexes(row, file) {
  return `${FILES[file]}${8 - row}`;
}

function coachAttackSquares(g, square) {
  const piece = g?.get?.(square);
  if (!piece) return [];
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  const output = [];
  const add = (nextFile, nextRank) => {
    if (nextFile < 0 || nextFile > 7 || nextRank < 1 || nextRank > 8) return false;
    const target = `${FILES[nextFile]}${nextRank}`;
    output.push(target);
    return Boolean(g.get(target));
  };

  if (piece.type === 'p') {
    const direction = piece.color === 'w' ? 1 : -1;
    add(file - 1, rank + direction);
    add(file + 1, rank + direction);
    return output;
  }
  if (piece.type === 'n') {
    for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) add(file + df, rank + dr);
    return output;
  }
  if (piece.type === 'k') {
    for (const [df, dr] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) add(file + df, rank + dr);
    return output;
  }

  const directions = [];
  if (['b', 'q'].includes(piece.type)) directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  if (['r', 'q'].includes(piece.type)) directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
  for (const [df, dr] of directions) {
    let nextFile = file + df;
    let nextRank = rank + dr;
    while (nextFile >= 0 && nextFile <= 7 && nextRank >= 1 && nextRank <= 8) {
      const occupied = add(nextFile, nextRank);
      if (occupied) break;
      nextFile += df;
      nextRank += dr;
    }
  }
  return output;
}

function coachAttackersOfSquare(g, square, color) {
  const attackers = [];
  g.board().forEach((row, rowIndex) => row.forEach((piece, fileIndex) => {
    if (!piece || piece.color !== color) return;
    const from = boardSquareFromIndexes(rowIndex, fileIndex);
    if (coachAttackSquares(g, from).includes(square)) attackers.push({ from, piece: piece.type });
  }));
  return attackers;
}

function coachTargetsForPiece(g, square, perspective) {
  const mover = g.get(square);
  if (!mover) return [];
  return coachAttackSquares(g, square)
    .map((targetSquare) => ({ square: targetSquare, piece: g.get(targetSquare) }))
    .filter((target) => target.piece && target.piece.color !== mover.color)
    .map((target) => ({ ...target, owner: coachOwner(target.piece.color, perspective), value: COACH_MATERIAL_VALUES[target.piece.type] || 0 }))
    .sort((first, second) => second.value - first.value);
}

function coachCaptureSquare(g, move) {
  if (!move?.captured) return null;
  if (g.get(move.to)) return move.to;
  if (move.piece === 'p' && move.from?.[0] !== move.to?.[0]) return `${move.to[0]}${move.from[1]}`;
  return move.to;
}

function analyzeCoachLine(fen, pv, perspective, limit = 10) {
  const g = new Chess(fen);
  const initialMaterial = materialForPerspective(g, perspective);
  const steps = [];
  for (const uci of (Array.isArray(pv) ? pv : []).slice(0, limit)) {
    const object = moveObjectFromUci(uci);
    if (!object) break;
    const movingPiece = g.get(object.from);
    const captureSquare = coachCaptureSquare(g, { ...object, piece: movingPiece?.type, captured: g.get(object.to)?.type || null });
    let move = null;
    try { move = g.move(object); } catch {}
    if (!move) break;
    const actualCaptureSquare = move.captured
      ? (captureSquare || (move.piece === 'p' && move.from[0] !== move.to[0] ? `${move.to[0]}${move.from[1]}` : move.to))
      : null;
    steps.push({
      index: steps.length,
      uci: normalizeUciMove(uci),
      san: move.san,
      color: move.color,
      piece: move.piece,
      from: move.from,
      to: move.to,
      captured: move.captured || null,
      capturedValue: COACH_MATERIAL_VALUES[move.captured] || 0,
      captureSquare: actualCaptureSquare,
      check: move.san.includes('+') || move.san.includes('#'),
      mate: move.san.includes('#'),
      fenAfter: g.fen(),
    });
  }
  const materialDelta = materialForPerspective(g, perspective) - initialMaterial;
  return {
    steps,
    materialDelta,
    lineText: steps.map((step) => step.san).join(' → '),
    firstReply: steps.find((step) => step.index > 0 && step.color !== perspective) || null,
    opponentCaptures: steps.filter((step) => step.color !== perspective && step.captured),
    playerCaptures: steps.filter((step) => step.color === perspective && step.captured),
    mateAgainst: steps.find((step) => step.color !== perspective && step.mate) || null,
    mateFor: steps.find((step) => step.color === perspective && step.mate) || null,
    finalFen: g.fen(),
  };
}

function analyzeCoachRootMove(fen, uci, perspective) {
  const g = new Chess(fen);
  const object = moveObjectFromUci(uci);
  const originalPiece = object ? g.get(object.from) : null;
  let move = null;
  try { move = object ? g.move(object) : null; } catch {}
  if (!move) return { move: null, targets: [], controls: [], centralControls: [], opponentCaptures: [], attackers: [], defenders: [], fenAfter: fen };
  const targets = coachTargetsForPiece(g, move.to, perspective);
  const controls = coachAttackSquares(g, move.to).filter((square) => g.get(square)?.color !== move.color);
  const centralControls = controls.filter((square) => COACH_CENTRAL_SQUARES.has(square));
  const opponentColor = move.color === 'w' ? 'b' : 'w';
  const opponentCaptures = g.moves({ verbose: true })
    .filter((candidate) => candidate.captured)
    .map((candidate) => {
      const victimSquare = candidate.piece === 'p' && candidate.from[0] !== candidate.to[0] && !g.get(candidate.to)
        ? `${candidate.to[0]}${candidate.from[1]}`
        : candidate.to;
      const victim = g.get(victimSquare);
      return {
        san: candidate.san,
        from: candidate.from,
        to: candidate.to,
        attacker: candidate.piece,
        captured: candidate.captured,
        victimSquare,
        victimValue: COACH_MATERIAL_VALUES[candidate.captured] || 0,
        victimOwner: victim?.color || perspective,
        attackers: coachAttackersOfSquare(g, victimSquare, opponentColor),
        defenders: coachAttackersOfSquare(g, victimSquare, perspective),
      };
    })
    .filter((capture) => capture.victimOwner === perspective)
    .sort((first, second) => second.victimValue - first.victimValue || first.defenders.length - second.defenders.length);
  return {
    move,
    originalPiece,
    targets,
    controls,
    centralControls,
    opponentCaptures,
    attackers: coachAttackersOfSquare(g, move.to, opponentColor),
    defenders: coachAttackersOfSquare(g, move.to, move.color),
    fenAfter: g.fen(),
  };
}

function coachTargetPhrase(targets, perspective, limit = 2) {
  return targets.slice(0, limit).map((target) => `${coachOwner(target.piece.color, perspective)} ${pieceName(target.piece.type)} on ${coachSquare(target.square)}`).join(' and ');
}

function coachLineMaterialSentence(line) {
  if (!Number.isFinite(line?.materialDelta) || Math.abs(line.materialDelta) < 1) return '';
  return line.materialDelta < 0
    ? `Over the stored continuation, your material balance falls by ${coachMaterialPoints(line.materialDelta)}.`
    : `Over the stored continuation, your material balance improves by ${coachMaterialPoints(line.materialDelta)}.`;
}

function coachReplyImpact(step, perspective) {
  if (!step) return '';
  if (step.mate) return `${step.san} checkmates your king.`;
  const g = new Chess(step.fenAfter);
  const targets = coachTargetsForPiece(g, step.to, perspective);
  const parts = [];
  if (step.captured) parts.push(`${step.san} takes your ${pieceName(step.captured)} on ${coachSquare(step.captureSquare || step.to)}`);
  else if (step.check) parts.push(`${step.san} checks your king from ${coachSquare(step.to)}`);
  else parts.push(`${step.san} places the opponent's ${pieceName(step.piece)} on ${coachSquare(step.to)}`);
  if (targets.length) parts.push(`from there it attacks ${coachTargetPhrase(targets, perspective)}`);
  const controls = coachAttackSquares(g, step.to).filter((square) => COACH_CENTRAL_SQUARES.has(square));
  if (!targets.length && controls.length) parts.push(`it controls ${controls.slice(0, 3).map(coachSquare).join(', ')}`);
  return `${parts.join('; ')}.`;
}

function evaluationSwingSentence(record) {
  if (!Number.isFinite(record?.bestScore) || !Number.isFinite(record?.selectedScore)) return '';
  const swing = Math.max(0, Math.round(record.bestScore - record.selectedScore));
  return `The evaluation changes from ${evaluationText(record.bestScore)} with best play to ${evaluationText(record.selectedScore)} after your move${swing ? `, a ${Math.max(0.1, swing / 100).toFixed(1)}-pawn swing` : ''}.`;
}

function buildConcreteCoachAnalysis(record, session) {
  const perspective = record?.color || session?.userColor || userColor;
  const selectedPv = pvWithRootMove(record?.uci, record?.selectedLine);
  const bestPv = pvWithRootMove(record?.bestMove, record?.bestLine);
  const selectedLine = analyzeCoachLine(record?.fenBefore, selectedPv, perspective, 10);
  const bestLine = analyzeCoachLine(record?.fenBefore, bestPv, perspective, 10);
  const selectedRoot = analyzeCoachRootMove(record?.fenBefore, record?.uci, perspective);
  const bestRoot = analyzeCoachRootMove(record?.fenBefore, record?.bestMove, perspective);
  const selectedSan = selectedRoot.move?.san || record?.san || readableEngineMove(record?.uci);
  const bestSan = bestRoot.move?.san || readableEngineMove(record?.bestMove);
  const selectedCapture = selectedLine.opponentCaptures[0] || null;
  const immediateCapture = selectedRoot.opponentCaptures[0] || null;
  const bestCapture = bestLine.playerCaptures[0] || null;
  const swingText = evaluationSwingSentence(record);
  const selectedLineText = selectedLine.lineText || selectedSan;
  const bestLineText = bestLine.lineText || bestSan;

  let whyText = '';
  if (selectedLine.mateAgainst) {
    whyText = `${selectedSan} allows a forced mating sequence. The concrete line ${selectedLineText} ends with ${selectedLine.mateAgainst.san}, which checkmates your king.`;
  } else if (Number(record?.selectedScore) <= -90000) {
    whyText = `${selectedSan} allows a forced mating attack against your king. Stockfish's line begins ${selectedLineText}.`;
  } else if (selectedCapture) {
    const immediate = selectedCapture.index === 1 ? 'immediately ' : '';
    const lossVerb = selectedLine.materialDelta <= -Math.max(1, selectedCapture.capturedValue - 1) ? 'wins' : 'takes';
    whyText = `After ${selectedSan}, ${selectedCapture.san} ${immediate}${lossVerb} your ${pieceName(selectedCapture.captured)} on ${coachSquare(selectedCapture.captureSquare || selectedCapture.to)}. ${coachLineMaterialSentence(selectedLine)} Concrete line: ${selectedLineText}.`;
  } else if (immediateCapture) {
    const balance = immediateCapture.attackers.length > immediateCapture.defenders.length
      ? `It has ${immediateCapture.attackers.length} attacker${immediateCapture.attackers.length === 1 ? '' : 's'} and only ${immediateCapture.defenders.length} defender${immediateCapture.defenders.length === 1 ? '' : 's'}.`
      : 'The capture is immediately legal and must be calculated before choosing a quiet continuation.';
    whyText = `${selectedSan} leaves your ${pieceName(immediateCapture.captured)} on ${coachSquare(immediateCapture.victimSquare)} tactically loose: ${immediateCapture.san} is available at once. ${balance}`;
  } else if (selectedLine.firstReply?.check) {
    whyText = `${selectedSan} permits a forcing check. ${coachReplyImpact(selectedLine.firstReply, perspective)} Concrete line: ${selectedLineText}.`;
  } else if (selectedLine.firstReply) {
    whyText = `${selectedSan} allows the concrete reply ${coachReplyImpact(selectedLine.firstReply, perspective)} The engine continuation is ${selectedLineText}.`;
  } else if (selectedRoot.attackers.length > selectedRoot.defenders.length && selectedRoot.move) {
    whyText = `${selectedSan} places your ${pieceName(selectedRoot.move.piece)} on ${coachSquare(selectedRoot.move.to)}, where it is attacked ${selectedRoot.attackers.length} time${selectedRoot.attackers.length === 1 ? '' : 's'} but defended only ${selectedRoot.defenders.length} time${selectedRoot.defenders.length === 1 ? '' : 's'}.`;
  } else {
    const controls = selectedRoot.centralControls.slice(0, 3).map(coachSquare).join(', ');
    whyText = `${selectedSan} does not lose material immediately in the stored line, but it allows ${selectedLineText || 'the opponent’s most forcing continuation'}.${controls ? ` The moved ${pieceName(selectedRoot.move?.piece)} controls ${controls}, but that does not solve the concrete problem shown by the engine line.` : ''}`;
  }
  if (swingText && !whyText.includes('evaluation')) whyText = `${whyText} ${swingText}`;

  let bestText = '';
  const selectedVictim = selectedCapture || (immediateCapture ? {
    captured: immediateCapture.captured,
    captureSquare: immediateCapture.victimSquare,
    from: immediateCapture.from,
    san: immediateCapture.san,
  } : null);
  const bestPreventsVictimCapture = selectedVictim
    && !bestRoot.opponentCaptures.some((capture) => capture.victimSquare === selectedVictim.captureSquare && capture.captured === selectedVictim.captured);

  if (bestLine.mateFor) {
    bestText = `${bestSan} starts a forced mating sequence. The line ${bestLineText} ends with ${bestLine.mateFor.san}.`;
  } else if (bestRoot.move?.captured) {
    bestText = `${bestSan} captures the opponent's ${pieceName(bestRoot.move.captured)} on ${coachSquare(bestRoot.move.to)}.`;
    if (selectedVictim && bestRoot.move.to === selectedVictim.from) {
      bestText += ` It removes the attacker that was threatening ${selectedVictim.san} against your ${pieceName(selectedVictim.captured)} on ${coachSquare(selectedVictim.captureSquare)}.`;
    } else if (bestPreventsVictimCapture) {
      bestText += ` It prevents ${selectedVictim.san}, so your ${pieceName(selectedVictim.captured)} on ${coachSquare(selectedVictim.captureSquare)} is no longer immediately lost.`;
    }
  } else if (bestRoot.move?.san?.includes('+')) {
    bestText = `${bestSan} gives check from ${coachSquare(bestRoot.move.to)}, forcing the opponent to respond before carrying out another threat.`;
  } else if (bestPreventsVictimCapture) {
    if (bestRoot.move?.from === selectedVictim.captureSquare) {
      bestText = `${bestSan} moves your ${pieceName(selectedVictim.captured)} away from ${coachSquare(selectedVictim.captureSquare)}, removing the ${selectedVictim.san} tactic.`;
    } else {
      bestText = `${bestSan} prevents ${selectedVictim.san}, keeping your ${pieceName(selectedVictim.captured)} on ${coachSquare(selectedVictim.captureSquare)} safe.`;
    }
  } else if (bestCapture) {
    bestText = `${bestSan} leads to ${bestCapture.san}, which wins the opponent's ${pieceName(bestCapture.captured)} on ${coachSquare(bestCapture.captureSquare || bestCapture.to)}.`;
  } else if (bestRoot.targets.length) {
    bestText = `${bestSan} places your ${pieceName(bestRoot.move?.piece)} on ${coachSquare(bestRoot.move?.to)}, where it attacks ${coachTargetPhrase(bestRoot.targets, perspective)}.`;
  } else if (bestRoot.move?.san?.startsWith('O-O')) {
    bestText = `${bestSan} moves the king to ${coachSquare(bestRoot.move.to)} and the rook toward the centre, removing the king from the open e-file and connecting the rooks.`;
  } else {
    const controls = (bestRoot.centralControls.length ? bestRoot.centralControls : bestRoot.controls).slice(0, 4).map(coachSquare);
    bestText = `${bestSan} places your ${pieceName(bestRoot.move?.piece)} on ${coachSquare(bestRoot.move?.to)}${controls.length ? `, controlling ${controls.join(', ')}` : ''}.`;
  }
  bestText += ` Concrete line: ${bestLineText}. It preserves ${evaluationText(record?.bestScore)}.`;

  return {
    perspective,
    selectedSan,
    bestSan,
    selectedLine,
    bestLine,
    selectedRoot,
    bestRoot,
    selectedCapture,
    immediateCapture,
    bestCapture,
    selectedLineSan: selectedLine.steps.map((step) => step.san),
    bestLineSan: bestLine.steps.map((step) => step.san),
    selectedLineText,
    bestLineText,
    whyText: whyText.replace(/\s+/g, ' ').trim(),
    bestText: bestText.replace(/\s+/g, ' ').trim(),
  };
}

function strongestAlternativeAchievement(record, session) {
  const concrete = buildConcreteCoachAnalysis(record, session);
  const best = describeMoveFromFen(record.fenBefore, record.bestMove);
  const selected = describeMoveFromFen(record.fenBefore, record.uci);
  return {
    best,
    selected,
    achievement: concrete.bestText,
    concrete,
  };
}

function decisionShortfall(record, session, comparison) {
  return comparison?.concrete?.whyText || buildConcreteCoachAnalysis(record, session).whyText;
}

function coachNarrationForRecord(record, session, decisionNumber) {
  if (!record) return { title: `Decision ${decisionNumber}`, text: 'This move was not linked to a stored analysis record.', whyText: 'No stored explanation is available.', bestText: 'No best move is available.', bestSan: '—', yourSan: '—', bestOutcome: '—', yourOutcome: '—', playedLine: [], line: [], band: { key: 'pending', label: 'Pending' } };
  const band = Number.isFinite(record.cpLoss) ? qualityForLoss(record.cpLoss) : { key: 'pending', label: 'Analyzing' };
  const comparison = strongestAlternativeAchievement(record, session);
  const concrete = comparison.concrete;
  const bestSan = concrete.bestSan;
  const assisted = record.hintLevel ? ` You used ${record.hintLevel >= 2 ? 'the exact candidate reveal' : 'a strategic hint'} before moving.` : '';
  let text;
  let whyText;
  let bestText;
  if (!Number.isFinite(record.cpLoss)) {
    text = `Stockfish is still finishing the review of ${record.san}. The replay will refresh automatically when the evaluation arrives.${assisted}`;
    whyText = 'The engine comparison is still pending.';
    bestText = 'The preferred continuation will appear when analysis finishes.';
  } else if (['best', 'excellent'].includes(band.key)) {
    text = `${comparison.selected.text} This was ${band.label.toLowerCase()} and maintained ${evaluationText(record.selectedScore)}.${assisted}`;
    whyText = `${record.san} preserved the position without allowing a concrete tactical concession in the stored line ${concrete.selectedLineText}.`;
    bestText = sameUciMove(record.uci, record.bestMove)
      ? `${record.san} was Stockfish's principal move. The line is ${concrete.bestLineText}.`
      : concrete.bestText;
  } else if (band.key === 'good') {
    text = `${record.san} remained playable and kept ${evaluationText(record.selectedScore)}. Stockfish preferred ${bestSan} by ${Math.round(record.cpLoss)} centipawns.${assisted}`;
    whyText = `The line after your move is ${concrete.selectedLineText}; it does not contain an immediate material loss or forced mate.`;
    bestText = concrete.bestText;
  } else {
    whyText = concrete.whyText;
    bestText = concrete.bestText;
    text = `${band.label}. ${whyText} ${bestText}${assisted}`;
  }
  return {
    title: `Decision ${decisionNumber} · ${band.label}`,
    text,
    whyText,
    bestText,
    bestSan,
    yourSan: record.san,
    bestOutcome: evaluationText(record.bestScore),
    yourOutcome: evaluationText(record.selectedScore),
    playedLine: concrete.selectedLineSan,
    line: concrete.bestLineSan,
    concrete,
    band,
  };
}


const LIVE_COACH_ERROR_KEYS'''
app, count = coach_block_pattern.subn(coach_block, app, count=1)
if count != 1:
    raise SystemExit("Unable to replace generic coach narration block")

# Add concrete, line-derived evidence to principle diagnosis before the older
# thematic heuristics run.
principle_marker = '''  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  const add = (key, score, evidence, confidence = null) => {'''
principle_replacement = '''  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const concrete = comparison.concrete || buildConcreteCoachAnalysis(record, session);

  const add = (key, score, evidence, confidence = null) => {'''
app = replace_once(app, principle_marker, principle_replacement, "concrete principle context")

add_marker = '''  if (best?.san?.includes('#') && !selectedMove?.san?.includes('#')) {'''
add_concrete = '''  if (concrete.selectedLine.mateAgainst) {
    add('king-safety', 100, `${concrete.selectedLineText} ends in ${concrete.selectedLine.mateAgainst.san}, so the move permits a forced mating sequence against your king.`, 'High confidence');
    add('forcing-scan', 98, `The forced line ${concrete.selectedLineText} had to be calculated before choosing ${selectedSan}.`, 'High confidence');
  }
  const concreteCapture = concrete.selectedCapture || concrete.immediateCapture;
  if (concreteCapture) {
    const captured = concreteCapture.captured;
    const square = concreteCapture.captureSquare || concreteCapture.victimSquare || concreteCapture.to;
    const captureSan = concreteCapture.san;
    add('loose-pieces', 99, `${captureSan} takes your ${pieceName(captured)} on ${coachSquare(square)} in the concrete engine continuation.`, 'High confidence');
  }
  if (concrete.bestRoot.move?.captured) {
    add('forcing-scan', 96, `${concrete.bestSan} immediately captures the opponent's ${pieceName(concrete.bestRoot.move.captured)} on ${coachSquare(concrete.bestRoot.move.to)}.`, 'High confidence');
  }

  if (best?.san?.includes('#') && !selectedMove?.san?.includes('#')) {'''
app = replace_once(app, add_marker, add_concrete, "line-derived principle diagnoses")

app = replace_once(
    app,
    '''  add(
    'candidate-comparison',
    loss > 220 ? 62 : 54,
    `${bestSan} was substantially stronger than ${selectedSan}. Comparing one forcing candidate with one improving candidate would have made the difference easier to notice.`,
    loss > 220 ? 'Medium confidence' : 'Guiding principle',
  );''',
    '''  add(
    'candidate-comparison',
    loss > 220 ? 72 : 60,
    `Your line was ${concrete.selectedLineText}; Stockfish's stronger line was ${concrete.bestLineText}. Comparing those two concrete continuations exposes the difference.`,
    loss > 220 ? 'Medium confidence' : 'Guiding principle',
  );''',
    "concrete candidate comparison principle",
)

# The waiting screen is no longer displayed. Keep the helper harmless for any
# older internal call, but make it explicitly hidden.
render_pending_pattern = re.compile(r"function renderLiveCoachPending\(record\) \{.*?\n\}\n\nfunction resetLiveCoachFlow", re.S)
render_pending_replacement = r'''function renderLiveCoachPending(record) {
  if (!record) return;
  // v34 grades ordinary moves silently; pending analysis must never resize or
  // replace the active board. This function intentionally keeps the panel shut.
  setLiveCoachBoardOpen(false);
}

function resetLiveCoachFlow'''
app, count = render_pending_pattern.subn(render_pending_replacement, app, count=1)
if count != 1:
    raise SystemExit("Unable to neutralize pending coach panel")

slow_pattern = re.compile(r"function markLiveCoachAnalysisSlow\(moveRecord\) \{.*?\n\}\n\nfunction replayLiveCoachBoardHighlights", re.S)
slow_replacement = r'''function markLiveCoachAnalysisSlow(moveRecord) {
  if (!liveCoachState.awaiting || finalized || liveCoachState.moveId !== moveRecord?.id) return false;
  if (currentSession && !liveCoachState.slowNoticeShown) {
    currentSession.liveCoachAnalysisTimeouts = (currentSession.liveCoachAnalysisTimeouts || 0) + 1;
  }
  // Do not flash an inconclusive coach screen. Release the silent gate and let
  // the opponent move; a late analysis result is still stored for post-game use.
  liveCoachState.slowNoticeShown = true;
  resetLiveCoachFlow({ closePanel: true });
  thinking = false;
  setStatus('Move analysis is still finishing in the background. Opponent is considering the position.', 'thinking');
  renderAll();
  if (!game?.isGameOver() && game?.turn() === engineColor) askEngine();
  return true;
}

function replayLiveCoachBoardHighlights'''
app, count = slow_pattern.subn(slow_replacement, app, count=1)
if count != 1:
    raise SystemExit("Unable to replace slow coach behavior")

app = replace_once(
    app,
    "  if (!board || !(liveCoachState.awaiting || liveCoachState.open)) return;",
    "  if (!board || !liveCoachState.open) return;",
    "replay highlights only for actual review",
)

queue_pattern = re.compile(r"function queueLiveCoachReview\(moveRecord\) \{.*?\n\}\n\nfunction renderLiveCoachIntervention", re.S)
queue_replacement = r'''function queueLiveCoachReview(moveRecord) {
  resetLiveCoachFlow({ closePanel: true });
  thinking = true;
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
  // No clock pause, no arrows, and no coach panel while the move is merely being
  // classified. The engine clock naturally represents the opponent thinking.
  setLiveCoachBoardOpen(false);
  liveCoachReviewTimer = window.setTimeout(() => {
    markLiveCoachAnalysisSlow(moveRecord);
  }, 12000);
}

function renderLiveCoachIntervention'''
app, count = queue_pattern.subn(queue_replacement, app, count=1)
if count != 1:
    raise SystemExit("Unable to replace Live Coach queue")

app = replace_once(
    app,
    '''  $('#liveCoachBestMove').textContent = narration.bestSan;
  $('#liveCoachBestText').textContent = narration.bestText;
  const line = $('#liveCoachLine');
  const lineText = narration.line?.length ? narration.line.join('  ') : 'The principal variation is not available yet.';
  line.textContent = lineText;''',
    '''  $('#liveCoachBestMove').textContent = narration.bestSan;
  $('#liveCoachBestText').textContent = narration.bestText;
  const playedLine = $('#liveCoachPlayedLine');
  if (playedLine) playedLine.textContent = narration.playedLine?.length ? narration.playedLine.join('  →  ') : 'No concrete played-move continuation is available yet.';
  const line = $('#liveCoachLine');
  const lineText = narration.line?.length ? narration.line.join('  →  ') : 'The best-move continuation is not available yet.';
  line.textContent = lineText;''',
    "render both concrete lines",
)

open_marker = '''function openLiveCoachIntervention(record) {
  const decisionNumber'''
open_replacement = '''function openLiveCoachIntervention(record) {
  // Only a completed bad-move classification reaches this point.
  pauseClockForTeaching();
  thinking = false;
  const decisionNumber'''
app = replace_once(app, open_marker, open_replacement, "pause only after bad classification")

handle_pattern = re.compile(r"function handleLiveCoachAnalysis\(session, record\) \{.*?\n\}\n\nfunction continueAfterLiveCoach", re.S)
handle_replacement = r'''function handleLiveCoachAnalysis(session, record) {
  if (!settings.liveCoach || finalized) return;
  if (!liveCoachState.awaiting || liveCoachState.sessionId !== session?.id || liveCoachState.moveId !== record?.id) return;
  if (liveCoachReviewTimer) window.clearTimeout(liveCoachReviewTimer);
  liveCoachReviewTimer = null;
  const band = qualityForMoveRecord(record);
  if (LIVE_COACH_ERROR_KEYS.has(band.key)) {
    openLiveCoachIntervention(record);
    return;
  }

  // Best, Excellent, and Good moves finish the silent gate without any layout,
  // scroll, arrow, cue, or narration change.
  const label = band.label;
  resetLiveCoachFlow({ closePanel: true });
  thinking = false;
  setStatus(`${label}. Opponent is considering the position.`, 'thinking');
  renderAll();
  if (!game?.isGameOver() && game?.turn() === engineColor) askEngine();
}

function continueAfterLiveCoach'''
app, count = handle_pattern.subn(handle_replacement, app, count=1)
if count != 1:
    raise SystemExit("Unable to replace Live Coach result gate")

write(app_path, app)


# ---------------------------------------------------------------------------
# Debug/test helpers and version.
# ---------------------------------------------------------------------------
part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = part6.replace("version: '33.0-commercial-beta'", "version: '34.0-commercial-beta'")
part6 = part6.replace(
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, inline: true, autoResume: false, viewportPreserved: true,",
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, silentGate: Boolean(liveCoachState.awaiting && !liveCoachState.open), badMovesOnly: true, preciseLineAnalysis: true, inline: true, autoResume: false, viewportPreserved: true,",
)

helper_marker = '''    forceLiveCoachIntervention: () => {
      const record = currentSession?.userMoves?.[currentSession.userMoves.length - 1];'''
helper_addition = '''    forceGoodMoveAnalysis: () => {
      const record = currentSession?.userMoves?.[currentSession.userMoves.length - 1];
      if (!record) return false;
      applyMoveAnalysisResult(currentSession.id, record.id, {
        cpLoss: 18,
        bestMove: record.uci,
        bestLine: [record.uci],
        selectedLine: [record.uci],
        bestScore: 42,
        selectedScore: 42,
        depth: 18,
        exactBest: true,
        analysisConsistency: 'test-good-move',
        source: 'Local v34 good-move gate test',
      });
      return { moveId: record.id, quality: qualityForMoveRecord(record).key };
    },
    startConcreteTacticDemo: () => {
      settings.side = 'w';
      settings.timeControl = '3+0';
      settings.liveCoach = true;
      settings.coachVoice = false;
      settings.principleReview = false;
      settings.autoHints = false;
      queuedCustomPosition = {
        id: 'v34-concrete-tactic-demo', custom: true, generated: false, phase: 'endgame', opening: 'Teaching demo', rating: 1600,
        title: 'Loose knight demonstration', theme: 'Loose pieces and forcing captures',
        tags: ['calculation', 'piece activity', 'prophylaxis'],
        fen: '4k3/8/8/5n2/3N4/8/4K3/8 w - - 0 1',
        description: 'A deterministic position where Kf3 allows Nxd4 and Nxf5 removes the attacker.',
      };
      startPosition();
      return { fen: game?.fen(), paused: clockPaused };
    },
    forceConcreteBadMoveAnalysis: () => {
      const record = currentSession?.userMoves?.[currentSession.userMoves.length - 1];
      if (!record) return false;
      applyMoveAnalysisResult(currentSession.id, record.id, {
        cpLoss: 620,
        bestMove: 'd4f5',
        bestLine: ['d4f5', 'e8e7', 'f5d4'],
        selectedLine: [record.uci, 'f5d4'],
        bestScore: 320,
        selectedScore: -300,
        depth: 22,
        exactBest: false,
        analysisConsistency: 'test-concrete-tactic',
        source: 'Local v34 precise explanation test',
      });
      const narration = coachNarrationForRecord(record, currentSession, 1);
      return { moveId: record.id, quality: qualityForMoveRecord(record).key, narration };
    },
    forceLiveCoachIntervention: () => {
      const record = currentSession?.userMoves?.[currentSession.userMoves.length - 1];'''
part6 = replace_once(part6, helper_marker, helper_addition, "v34 test helpers")
write(part6_path, part6)


# ---------------------------------------------------------------------------
# Cache versions.
# ---------------------------------------------------------------------------
loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=34.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=34.0.0", loader)
write(loader_path, loader)


# ---------------------------------------------------------------------------
# Styles for the side-by-side concrete lines.
# ---------------------------------------------------------------------------
styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v34 — bad-move-only Live Coach and concrete tactical lines */
.live-coach-lines-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin-top:8px}
.live-coach-lines-grid .live-coach-line-wrap{min-width:0;margin-top:0}
.played-consequence-line{border-color:#ff9d4d48!important;background:linear-gradient(145deg,#ff9d4d10,#ffffff03)!important}
.best-consequence-line{border-color:#7cf58a48!important;background:linear-gradient(145deg,#7cf58a10,#ffffff03)!important}
.live-coach-lines-grid .live-coach-line{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.55;overflow-wrap:anywhere}
body.game-mode .live-coach-active .live-coach-lines-grid{position:relative}
@media(max-width:560px){
  .live-coach-lines-grid{grid-template-columns:minmax(0,1fr);gap:5px}
  body.game-mode .live-coach-active .live-coach-lines-grid .live-coach-line-wrap{padding:6px}
  body.game-mode .live-coach-active .live-coach-lines-grid .live-coach-line{font-size:7.6px;line-height:1.35}
}
/* End K-Mate v34 */
'''
write(styles_path, styles)
