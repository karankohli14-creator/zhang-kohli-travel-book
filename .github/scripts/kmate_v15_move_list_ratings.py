from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


# Use the user's requested wording.
path = "kmate-trainer/app-v7-part1.txt"
s = read(path)
s = s.replace("{ max: 110, key: 'inaccuracy', label: 'Inaccuracy' }", "{ max: 110, key: 'inaccuracy', label: 'Inaccurate' }")
write(path, s)


# Rebuild the move list across the historical part2/part3 transport boundary.
part2_path = "kmate-trainer/app-v7-part2.txt"
part3_path = "kmate-trainer/app-v7-part3.txt"
combined = read(part2_path) + read(part3_path)
start = combined.find("function renderMoveList() {")
end = combined.find("function renderLiveQuality() {")
if start < 0 or end < 0 or end <= start:
    raise SystemExit("Unable to locate renderMoveList block")

new_renderer = r'''function moveRatingForRecord(record) {
  if (!record || !Number.isFinite(record.cpLoss)) return { key: 'pending', label: 'Analyzing' };
  return qualityForLoss(record.cpLoss);
}

function renderMoveCell(cell) {
  if (!cell) return '<span class="move-entry move-empty">—</span>';
  if (!cell.isUser) return `<span class="move-entry"><b>${escapeHtml(cell.san)}</b></span>`;
  const rating = moveRatingForRecord(cell.record);
  const cpText = Number.isFinite(cell.record?.cpLoss)
    ? `${Math.round(cell.record.cpLoss)} cp estimated loss`
    : 'Move analysis in progress';
  const bestText = cell.record?.bestMove ? ` · preferred ${cell.record.bestMove}` : '';
  const title = `${rating.label} · ${cpText}${bestText}`;
  return `<span class="move-entry user-move quality-${rating.key}" title="${escapeHtml(title)}"><b>${escapeHtml(cell.san)}</b><span class="move-rating quality-${rating.key}">${escapeHtml(rating.label)}</span></span>`;
}

function renderMoveList() {
  if (!game) return;
  const history = game.history({ verbose: true });
  const userRecords = currentSession?.userMoves || [];
  const rows = [];
  let userRecordIndex = 0;
  let number = startFullmove;
  let row = null;

  for (const move of history) {
    const isUser = move.color === userColor;
    const record = isUser ? (userRecords[userRecordIndex++] || null) : null;
    const cell = { san: move.san, isUser, record };
    if (move.color === 'w') {
      row = { number, white: cell, black: null };
      rows.push(row);
    } else {
      if (!row || row.black) {
        row = { number, white: { san: '…', isUser: false, record: null }, black: cell };
        rows.push(row);
      } else {
        row.black = cell;
      }
      number += 1;
    }
  }

  const list = $('#moveList');
  list.innerHTML = rows.length
    ? rows.map((item) => `<div class="moverow"><span class="move-number">${item.number}.</span>${renderMoveCell(item.white)}${renderMoveCell(item.black)}</div>`).join('')
    : '<div class="emptyMoves">The move list will appear here.</div>';
  list.scrollTop = list.scrollHeight;
  $('#moveCount').textContent = `${history.length} ${history.length === 1 ? 'ply' : 'plies'}`;
  $('#sessionNote').textContent = history.length >= 40
    ? `You have played ${Math.floor(history.length / 2)} moves from this position. Continue, resign, or draw a new position.`
    : 'Your move ratings appear beside your moves as soon as analysis finishes.';
}

'''
combined = combined[:start] + new_renderer + combined[end:]

# Unlock Web Audio from the user's Start/New Position gesture, including when the engine moves first.
start_marker = "function startPosition({ preservePrevious = false } = {}) {\n"
if start_marker in combined and "function startPosition({ preservePrevious = false } = {}) {\n  ensureAudioContext();\n" not in combined:
    combined = combined.replace(start_marker, start_marker + "  ensureAudioContext();\n", 1)

# Update the move-list badge as soon as asynchronous analysis returns.
analysis_marker = "      renderLiveQuality();\n      showMoveQualityBadge(targetMove);"
if analysis_marker not in combined:
    raise SystemExit("Analysis refresh marker missing")
combined = combined.replace(
    analysis_marker,
    "      renderLiveQuality();\n      renderMoveList();\n      showMoveQualityBadge(targetMove);",
    1,
)

# Keep aggregate review counters aligned with all six labels.
old_quality = "  const quality = { excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };"
new_quality = "  const quality = { best: 0, excellent: 0, good: 0, inaccuracy: 0, miss: 0, blunder: 0 };"
if old_quality in combined:
    combined = combined.replace(old_quality, new_quality, 1)

# Split only at a complete function boundary; the loader simply concatenates the parts.
split_at = combined.find("function renderLiveQuality() {")
if split_at < 0:
    raise SystemExit("Safe part2/part3 split point missing")
write(part2_path, combined[:split_at])
write(part3_path, combined[split_at:])


# Color-coded move cells and right-aligned written verdicts.
path = "kmate-trainer/styles-v7.css"
s = read(path)
css_marker = ".moverow{display:grid;grid-template-columns:35px 1fr 1fr;gap:5px;min-height:27px;align-items:center}\n"
css = r'''.moverow{display:grid;grid-template-columns:31px minmax(0,1fr) minmax(0,1fr);gap:5px;min-height:31px;align-items:center}
.move-number{color:var(--muted);font-size:11px}
.move-entry{display:flex;align-items:center;justify-content:space-between;gap:5px;min-width:0;padding:4px 5px;border:1px solid transparent;border-radius:9px}
.move-entry b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.move-entry.move-empty{color:var(--muted)}
.move-entry.user-move{border-color:#ffffff10;background:#ffffff04}
.move-rating{flex:0 0 auto;max-width:64px;padding:3px 5px;border:1px solid #ffffff20;border-radius:999px;font-size:8px;font-weight:950;line-height:1.1;letter-spacing:.015em;text-align:center;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.move-entry.quality-best,.move-rating.quality-best{border-color:#7cf58a66;background:#7cf58a16;color:#a8ffb1}
.move-entry.quality-excellent,.move-rating.quality-excellent{border-color:#61e6c566;background:#61e6c516;color:#8af1d7}
.move-entry.quality-good,.move-rating.quality-good{border-color:#70b8ff66;background:#70b8ff16;color:#9ccfff}
.move-entry.quality-inaccuracy,.move-rating.quality-inaccuracy{border-color:#f4cc7066;background:#f4cc7016;color:#ffe09a}
.move-entry.quality-miss,.move-rating.quality-miss{border-color:#ffad596d;background:#ffad5918;color:#ffc787}
.move-entry.quality-blunder,.move-rating.quality-blunder{border-color:#ff736f77;background:#ff736f1b;color:#ffaaa6}
.move-entry.quality-pending,.move-rating.quality-pending{border-color:#ffffff1b;background:#ffffff07;color:var(--muted)}
'''
if css_marker not in s:
    raise SystemExit("Move-row CSS marker missing")
s = s.replace(css_marker, css, 1)

mobile_marker = "  .status{min-height:44px;margin-top:7px;padding:8px 10px;font-size:12px}\n"
mobile_css = "  .move-entry{padding:4px}\n  .move-rating{max-width:59px;padding:3px 4px;font-size:7.5px}\n"
if mobile_marker in s and mobile_css not in s:
    s = s.replace(mobile_marker, mobile_marker + mobile_css, 1)
write(path, s)


# Cache-bust all public assets.
path = "kmate-trainer/index.html"
s = read(path)
s = re.sub(r"\./styles-v7\.css\?v=\d+\.\d+\.\d+", "./styles-v7.css?v=15.0.0", s)
s = re.sub(r"\./app-v7\.js\?v=\d+\.\d+\.\d+", "./app-v7.js?v=15.0.0", s)
write(path, s)

path = "kmate-trainer/app-v7.js"
s = read(path)
s = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=15.0.0", s)
s = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=15.0.0", s)
write(path, s)
