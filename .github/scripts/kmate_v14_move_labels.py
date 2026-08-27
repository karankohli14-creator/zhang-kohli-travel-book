from pathlib import Path
import re

def read(p): return Path(p).read_text()
def write(p,s): Path(p).write_text(s)

# 1) Add live move-quality badge and rename postgame Mistakes -> Misses.
p='kmate-trainer/index.html'; s=read(p)
s=s.replace('<div class="status" id="status"><span class="statusdot"></span><span id="statusText">Choose a piece, then a legal destination.</span></div>', '<div class="status" id="status"><span class="statusdot"></span><span id="statusText">Choose a piece, then a legal destination.</span><span id="moveQualityBadge" class="move-quality-badge" hidden>Analyzing…</span></div>')
s=s.replace('<div><span>Mistakes</span><b id="reviewMistakes">—</b></div>', '<div><span>Misses</span><b id="reviewMistakes">—</b></div>')
s=re.sub(r'./styles-v7\.css\?v=\d+\.\d+\.\d+', './styles-v7.css?v=14.0.0', s)
s=re.sub(r'./app-v7\.js\?v=\d+\.\d+\.\d+', './app-v7.js?v=14.0.0', s)
write(p,s)

# 2) New six-band vocabulary.
p='kmate-trainer/app-v7-part1.txt'; s=read(p)
old="""const QUALITY_BANDS = [
  { max: 25, key: 'excellent', label: 'Excellent' },
  { max: 60, key: 'good', label: 'Good' },
  { max: 120, key: 'inaccuracy', label: 'Inaccuracy' },
  { max: 220, key: 'mistake', label: 'Mistake' },
  { max: Infinity, key: 'blunder', label: 'Blunder' },
];"""
new="""const QUALITY_BANDS = [
  { max: 10, key: 'best', label: 'Best' },
  { max: 25, key: 'excellent', label: 'Excellent' },
  { max: 60, key: 'good', label: 'Good' },
  { max: 110, key: 'inaccuracy', label: 'Inaccuracy' },
  { max: 220, key: 'miss', label: 'Miss' },
  { max: Infinity, key: 'blunder', label: 'Blunder' },
];"""
if old not in s: raise SystemExit('QUALITY_BANDS marker missing')
s=s.replace(old,new,1)
write(p,s)

# 3) Live badge after analysis; show analyzing immediately after move.
p='kmate-trainer/app-v7-part3.txt'; s=read(p)
marker="function makeUserMove(moveObject) {\n"
fn="""function showMoveQualityBadge(move) {
  const badge = $('#moveQualityBadge');
  if (!badge) return;
  badge.className = 'move-quality-badge';
  if (!move) {
    badge.hidden = false;
    badge.textContent = 'Analyzing…';
    badge.classList.add('quality-pending');
    return;
  }
  const band = qualityForLoss(move.cpLoss);
  badge.hidden = false;
  badge.textContent = band.label;
  badge.classList.add(`quality-${band.key}`);
  badge.title = Number.isFinite(move.cpLoss) ? `${Math.round(move.cpLoss)} centipawn estimated loss` : band.label;
}

"""
if marker not in s: raise SystemExit('makeUserMove marker missing')
s=s.replace(marker,fn+marker,1)
s=s.replace("  currentSession.userMoves.push(moveRecord);\n  requestMoveAnalysis(fenBefore, moveRecord);", "  currentSession.userMoves.push(moveRecord);\n  showMoveQualityBadge(null);\n  requestMoveAnalysis(fenBefore, moveRecord);",1)
s=s.replace("      renderLiveQuality();\n      updateStoredCurrentSession();", "      renderLiveQuality();\n      showMoveQualityBadge(targetMove);\n      updateStoredCurrentSession();",1)
write(p,s)

# 4) Post-game review vocabulary and counts.
p='kmate-trainer/app-v7-part4.txt'; s=read(p)
s=s.replace("const quality = { excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };", "const quality = { best: 0, excellent: 0, good: 0, inaccuracy: 0, miss: 0, blunder: 0 };",1)
s=s.replace("  $('#reviewGood').textContent = quality.excellent + quality.good;", "  $('#reviewGood').textContent = quality.best + quality.excellent + quality.good;",1)
s=s.replace("  $('#reviewMistakes').textContent = quality.mistake;", "  $('#reviewMistakes').textContent = quality.miss;",1)
s=s.replace("  if (move.cpLoss > 220) return 'Blunder: first check forcing moves and whether any piece is undefended.';\n  if (move.cpLoss > 120) return 'Mistake: compare at least two serious candidate moves before committing.';\n  if (move.cpLoss > 60) return 'Inaccuracy: re-check king safety, the opponent’s plan, and your least active piece.';\n  if (move.cpLoss > 25) return 'Good practical move, although a more precise continuation was available.';\n  return 'Accurate decision.';", "  if (move.cpLoss > 220) return 'Blunder: first check forcing moves and whether any piece is undefended.';\n  if (move.cpLoss > 110) return 'Miss: a significant opportunity or defensive resource was overlooked. Compare forcing candidates before committing.';\n  if (move.cpLoss > 60) return 'Inaccuracy: re-check king safety, the opponent’s plan, and your least active piece.';\n  if (move.cpLoss > 25) return 'Good practical move, although a more precise continuation was available.';\n  if (move.cpLoss > 10) return 'Excellent move: very close to the engine’s top choice.';\n  return 'Best move: essentially the engine’s top-quality choice.';",1)
write(p,s)

# 5) Color coding: green best, teal excellent, blue good, amber inaccuracy, orange miss, red blunder.
p='kmate-trainer/styles-v7.css'; s=read(p)
css="""
.move-quality-badge{margin-left:auto;flex:0 0 auto;padding:5px 10px;border:1px solid #ffffff22;border-radius:999px;font-size:11px;font-weight:950;letter-spacing:.02em;text-transform:uppercase;box-shadow:inset 0 1px #fff1}
.move-quality-badge.quality-best,.review-move-row.quality-best{border-color:#7cf58a66;background:#7cf58a16;color:#a8ffb1}
.move-quality-badge.quality-excellent,.review-move-row.quality-excellent{border-color:#61e6c566;background:#61e6c516;color:#8af1d7}
.move-quality-badge.quality-good,.review-move-row.quality-good{border-color:#70b8ff66;background:#70b8ff16;color:#9ccfff}
.move-quality-badge.quality-inaccuracy,.review-move-row.quality-inaccuracy{border-color:#f4cc7066;background:#f4cc7016;color:#ffe09a}
.move-quality-badge.quality-miss,.review-move-row.quality-miss{border-color:#ffad596d;background:#ffad5918;color:#ffc787}
.move-quality-badge.quality-blunder,.review-move-row.quality-blunder{border-color:#ff736f77;background:#ff736f1b;color:#ffaaa6}
.move-quality-badge.quality-pending{border-color:#ffffff22;background:#ffffff08;color:var(--muted)}
"""
s += css
# Remove older generic review border rules if present to avoid overriding specific colors.
s=s.replace('.quality-excellent,.quality-good{border-color:#8ee7a229}\n.quality-inaccuracy{border-color:#f4cc7038}\n.quality-mistake,.quality-blunder{border-color:#ff8e8645}\n','')
write(p,s)

# 6) Cache bust loader fetches.
p='kmate-trainer/app-v7.js'; s=read(p)
s=re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=14.0.0', s)
s=re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=14.0.0', s)
write(p,s)
