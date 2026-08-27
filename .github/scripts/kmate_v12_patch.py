from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


# Result dialog: add a visible session review and expandable move-by-move review.
path = "kmate-trainer/index.html"
s = read(path)
old = '      <div class="result-coach" id="resultCoach">More sessions will sharpen the coaching signal.</div>\n      <div class="dialogactions">'
review = '''      <div class="result-coach" id="resultCoach">More sessions will sharpen the coaching signal.</div>
      <section class="post-review" id="postReview" aria-live="polite">
        <div class="review-head">
          <div><small>Automatic session review</small><h3 id="reviewHeadline">Analysis finishing…</h3></div>
          <span class="review-grade" id="reviewGrade">—</span>
        </div>
        <p class="review-self">Before checking the engine details, ask: What was the opponent threatening? Were any pieces loose? Which checks, captures, or threats did I overlook?</p>
        <div class="review-summary-grid">
          <div><span>Excellent / good</span><b id="reviewGood">—</b></div>
          <div><span>Inaccuracies</span><b id="reviewInaccuracies">—</b></div>
          <div><span>Mistakes</span><b id="reviewMistakes">—</b></div>
          <div><span>Blunders</span><b id="reviewBlunders">—</b></div>
        </div>
        <div class="review-key" id="reviewKeyMoment">K-Mate is preparing the key lesson from this position.</div>
        <details class="review-details" id="reviewDetails">
          <summary>Review every decision</summary>
          <div class="review-moves" id="reviewMoveList"></div>
        </details>
      </section>
      <div class="dialogactions">'''
if old not in s:
    raise SystemExit("Result dialog insertion marker missing")
s = s.replace(old, review, 1)
s = re.sub(r"\./styles-v7\.css\?v=\d+\.\d+\.\d+", "./styles-v7.css?v=12.0.0", s)
s = re.sub(r"\./app-v7\.js\?v=\d+\.\d+\.\d+", "./app-v7.js?v=12.0.0", s)
write(path, s)


# Review computation and rendering.
path = "kmate-trainer/app-v7-part4.txt"
s = read(path)
marker = "function sessionCoach(session) {\n"
review_js = r'''function reviewGradeForSession(session) {
  if (!Number.isFinite(session.avgCpLoss)) return { grade: '…', headline: 'Analysis is still finishing' };
  if (session.avgCpLoss <= 25) return { grade: 'A+', headline: 'Exceptionally accurate play' };
  if (session.avgCpLoss <= 50) return { grade: 'A', headline: 'Strong, controlled decisions' };
  if (session.avgCpLoss <= 80) return { grade: 'B', headline: 'A solid session with a few improvements' };
  if (session.avgCpLoss <= 120) return { grade: 'C', headline: 'Mixed play — one or two decisions changed the position' };
  if (session.avgCpLoss <= 180) return { grade: 'D', headline: 'Several costly decisions need review' };
  return { grade: 'F', headline: 'Tactical discipline should be the next focus' };
}

function reviewMoveAdvice(move) {
  if (!Number.isFinite(move.cpLoss)) return 'Analysis pending.';
  if (Number.isFinite(move.spentMs) && move.spentMs < 4000 && move.cpLoss > 120) {
    return 'Rushed error: pause for the opponent’s threat, hanging pieces, checks, captures, and threats.';
  }
  if (move.cpLoss > 220) return 'Blunder: first check forcing moves and whether any piece is undefended.';
  if (move.cpLoss > 120) return 'Mistake: compare at least two serious candidate moves before committing.';
  if (move.cpLoss > 60) return 'Inaccuracy: re-check king safety, the opponent’s plan, and your least active piece.';
  if (move.cpLoss > 25) return 'Good practical move, although a more precise continuation was available.';
  return 'Accurate decision.';
}

function readableEngineMove(uci) {
  if (!uci || uci.length < 4) return 'No alternative recorded';
  const promotion = uci[4] ? `=${uci[4].toUpperCase()}` : '';
  return `${uci.slice(0, 2)}→${uci.slice(2, 4)}${promotion}`;
}

function reviewClockLesson(session, analyzedMoves) {
  if (session.reason === 'timeout') return 'Clock lesson: the position was decided by time. Reserve the last 20% of the clock for conversion or defense.';
  const rushed = analyzedMoves.filter((move) => Number.isFinite(move.spentMs) && move.spentMs < 4000 && move.cpLoss > 120);
  if (rushed.length) return `${rushed.length} costly decision${rushed.length === 1 ? '' : 's'} came in under four seconds. Slow down on irreversible moves.`;
  if (Number.isFinite(session.timeUsedPct) && session.timeUsedPct < 0.45 && Number.isFinite(session.avgCpLoss) && session.avgCpLoss > 100) {
    return `You used only ${percent(session.timeUsedPct)} of the clock while leaving significant accuracy available. Spend more time on forcing or structural decisions.`;
  }
  if (Number.isFinite(session.timeUsedPct) && session.timeUsedPct > 0.9) return 'Clock lesson: you reached late time pressure. Decide faster on forced replies and routine recaptures.';
  return 'Clock use did not show a clear problem in this session.';
}

function renderPostGameReview(session) {
  if (!session) return;
  const moves = session.userMoves || [];
  const analyzed = moves.filter((move) => Number.isFinite(move.cpLoss));
  const pending = moves.length - analyzed.length;
  const grade = reviewGradeForSession(session);
  const quality = { excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const move of analyzed) {
    const key = qualityForLoss(move.cpLoss).key;
    if (quality[key] !== undefined) quality[key] += 1;
  }

  $('#reviewGrade').textContent = grade.grade;
  $('#reviewHeadline').textContent = pending
    ? `${grade.headline} · reviewing ${analyzed.length}/${moves.length} decisions`
    : grade.headline;
  $('#reviewGood').textContent = quality.excellent + quality.good;
  $('#reviewInaccuracies').textContent = quality.inaccuracy;
  $('#reviewMistakes').textContent = quality.mistake;
  $('#reviewBlunders').textContent = quality.blunder;

  const worst = analyzed.slice().sort((a, b) => b.cpLoss - a.cpLoss)[0];
  const clockLesson = reviewClockLesson(session, analyzed);
  if (worst) {
    const index = moves.findIndex((move) => move.id === worst.id) + 1;
    const preferred = worst.bestMove ? ` The engine preferred ${readableEngineMove(worst.bestMove)}.` : '';
    $('#reviewKeyMoment').innerHTML = `<b>Key moment — decision ${index}: ${escapeHtml(worst.san)}</b><span>Estimated loss: ${Math.round(worst.cpLoss)} cp.${escapeHtml(preferred)} ${escapeHtml(reviewMoveAdvice(worst))}</span><small>${escapeHtml(clockLesson)}</small>`;
  } else if (moves.length) {
    $('#reviewKeyMoment').innerHTML = `<b>Move analysis is still running</b><span>The result, clock use, and ${escapeHtml(session.theme.toLowerCase())} theme are already recorded. Detailed grades will fill in automatically.</span><small>${escapeHtml(clockLesson)}</small>`;
  } else {
    $('#reviewKeyMoment').innerHTML = '<b>No decisions to review</b><span>This session ended before you made a move.</span>';
  }

  const list = $('#reviewMoveList');
  list.innerHTML = moves.length
    ? moves.map((move, index) => {
        const band = Number.isFinite(move.cpLoss) ? qualityForLoss(move.cpLoss) : { key: 'pending', label: 'Pending' };
        const loss = Number.isFinite(move.cpLoss) ? `${Math.round(move.cpLoss)} cp` : 'Analyzing…';
        const best = move.bestMove ? `Best: ${readableEngineMove(move.bestMove)}` : 'Best move pending';
        const time = Number.isFinite(move.spentMs) ? `${Math.max(0.1, move.spentMs / 1000).toFixed(1)}s` : 'untimed';
        return `<div class="review-move-row quality-${band.key}">
          <span class="review-number">${index + 1}</span>
          <span class="review-move-main"><b>${escapeHtml(move.san)}</b><small>${escapeHtml(reviewMoveAdvice(move))}</small></span>
          <span class="review-move-meta"><b>${escapeHtml(band.label)}</b><small>${loss} · ${time}<br>${escapeHtml(best)}</small></span>
        </div>`;
      }).join('')
    : '<div class="emptyMoves">No user moves were recorded.</div>';
}

'''
if marker not in s:
    raise SystemExit("sessionCoach marker missing")
s = s.replace(marker, review_js + marker, 1)
old = "  $('#resultCoach').textContent = sessionCoach(session);\n  openDialog('resultDialog');"
new = "  $('#resultCoach').textContent = sessionCoach(session);\n  renderPostGameReview(session);\n  openDialog('resultDialog');"
if old not in s:
    raise SystemExit("showResult marker missing")
s = s.replace(old, new, 1)
write(path, s)


# Refresh the open result review as asynchronous move grades arrive.
path = "kmate-trainer/app-v7-part3.txt"
s = read(path)
old = "      renderLiveQuality();\n      updateStoredCurrentSession();"
new = "      renderLiveQuality();\n      updateStoredCurrentSession();\n      if (finalized) renderPostGameReview(currentSession);"
if old not in s:
    raise SystemExit("analysis refresh marker missing")
s = s.replace(old, new, 1)
write(path, s)


# Review presentation: useful on desktop, compact and scrollable on mobile.
path = "kmate-trainer/styles-v7.css"
s = read(path)
marker = ".result-coach{margin-top:13px;padding:13px;border:1px solid #b9f4742f;border-radius:14px;background:#b9f4740d;color:#dfe9da;text-align:left}\n"
css = r'''#resultDialog{width:min(720px,calc(100% - 18px));max-height:92dvh;overflow:auto}
.post-review{margin-top:13px;padding:15px;border:1px solid var(--line);border-radius:17px;background:#071009;text-align:left}
.review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.review-head small{display:block;color:var(--muted);font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
.review-head h3{margin:4px 0 0;font-size:19px}
.review-grade{display:grid;place-items:center;flex:0 0 47px;height:47px;border:1px solid #b9f47455;border-radius:14px;background:#b9f47418;color:var(--accent);font-size:20px;font-weight:950}
.review-self{margin:12px 0!important;padding:10px 11px;border-left:3px solid var(--gold);border-radius:7px;background:#f4cc700c;color:#d9dfd8!important;font-size:12px}
.review-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.review-summary-grid div{padding:9px;border:1px solid #ffffff12;border-radius:12px;background:#ffffff05}
.review-summary-grid span,.review-summary-grid b{display:block}
.review-summary-grid span{color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.05em}
.review-summary-grid b{margin-top:2px;font-size:18px}
.review-key{display:grid;gap:4px;margin-top:10px;padding:12px;border:1px solid #ffffff14;border-radius:13px;background:#ffffff06}
.review-key b,.review-key span,.review-key small{display:block}
.review-key span{color:#dbe3da;font-size:12px}
.review-key small{color:var(--muted)}
.review-details{margin-top:10px;border-top:1px solid #ffffff12;padding-top:9px}
.review-details summary{cursor:pointer;color:var(--accent);font-weight:850}
.review-moves{display:grid;gap:6px;max-height:310px;overflow:auto;margin-top:9px;padding-right:2px}
.review-move-row{display:grid;grid-template-columns:28px minmax(0,1fr) minmax(116px,.55fr);gap:8px;align-items:start;padding:9px;border:1px solid #ffffff10;border-radius:12px;background:#ffffff04}
.review-number{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;background:#ffffff0b;color:var(--muted);font-size:11px;font-weight:900}
.review-move-main,.review-move-meta{min-width:0}
.review-move-main b,.review-move-main small,.review-move-meta b,.review-move-meta small{display:block}
.review-move-main small,.review-move-meta small{margin-top:2px;color:var(--muted);font-size:10px;overflow-wrap:anywhere}
.review-move-meta{text-align:right}
.quality-excellent,.quality-good{border-color:#8ee7a229}
.quality-inaccuracy{border-color:#f4cc7038}
.quality-mistake,.quality-blunder{border-color:#ff8e8645}
.quality-pending{opacity:.72}
'''
if marker not in s:
    raise SystemExit("resultCoach CSS marker missing")
s = s.replace(marker, marker + css, 1)
mobile_marker = "  .result-grid{grid-template-columns:1fr 1fr}\n"
mobile_css = '''  .review-summary-grid{grid-template-columns:repeat(2,1fr)}
  .review-move-row{grid-template-columns:25px minmax(0,1fr)}
  .review-move-meta{grid-column:2;text-align:left}
  .review-moves{max-height:270px}
  .post-review{padding:12px}
'''
if mobile_marker not in s:
    raise SystemExit("mobile result marker missing")
s = s.replace(mobile_marker, mobile_marker + mobile_css, 1)
write(path, s)


# Cache-bust every application asset.
path = "kmate-trainer/app-v7.js"
s = read(path)
s = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=12.0.0", s)
s = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=12.0.0", s)
write(path, s)
