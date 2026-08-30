from pathlib import Path
import re

ROOT = Path('kmate-trainer')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing patch marker: {label}')
    return text.replace(old, new, 1)

# Index: give the arrow legend explicit dynamic labels and bump cache versions.
index_path = ROOT / 'index.html'
index = index_path.read_text()
index = replace_once(
    index,
    '''              <div class="live-coach-board-legend" aria-label="Board highlight legend">
                <span class="played"><i></i>Your played move</span>
                <span class="best"><i></i>Engine best move</span>
              </div>''',
    '''              <div class="live-coach-board-legend" aria-label="Board highlight legend">
                <span class="played" id="liveCoachPlayedLegend"><i></i>Orange dashed = your move</span>
                <span class="best" id="liveCoachBestLegend"><i></i>Green solid = best move</span>
              </div>''',
    'dynamic arrow legend',
)
index = re.sub(r'styles-v7\.css\?v=\d+\.\d+\.\d+', 'styles-v7.css?v=35.0.0', index)
index = re.sub(r'app-v7\.js\?v=\d+\.\d+\.\d+', 'app-v7.js?v=35.0.0', index)
index_path.write_text(index)

# App: v35 cache, explicit legend text, and concise live-only presentation.
app_path = ROOT / 'app-v7-part1.txt'
app = app_path.read_text()
app = app.replace("url.search = '?v=20260830-34';", "url.search = '?v=20260830-35';")

marker = '''  $('#liveCoachBestMove').textContent = narration.bestSan;
  $('#liveCoachBestText').textContent = narration.bestText;
  const playedLine = $('#liveCoachPlayedLine');'''
replacement = '''  $('#liveCoachBestMove').textContent = narration.bestSan;
  $('#liveCoachBestText').textContent = narration.bestText;
  const playedLegend = $('#liveCoachPlayedLegend');
  const bestLegend = $('#liveCoachBestLegend');
  if (playedLegend) playedLegend.innerHTML = `<i></i><b>Orange dashed</b> = your move ${escapeHtml(narration.yourSan || record.san || '')}`;
  if (bestLegend) bestLegend.innerHTML = `<i></i><b>Green solid</b> = best move ${escapeHtml(narration.bestSan || '')}`;
  const playedLine = $('#liveCoachPlayedLine');'''
app = replace_once(app, marker, replacement, 'live arrow legend values')
app_path.write_text(app)

# Version in debug API.
part6_path = ROOT / 'app-v7-part6.txt'
part6 = part6_path.read_text().replace("version: '34.0-commercial-beta'", "version: '35.0-commercial-beta'")
part6_path.write_text(part6)

# Loader cache.
loader_path = ROOT / 'app-v7.js'
loader = loader_path.read_text()
loader = re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=35.0.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=35.0.0', loader)
loader_path.write_text(loader)

# CSS: pieces always sit above arrows; remove stacked-context problem on highlighted
# destination squares; make the live review a one-screen compact teaching surface.
styles_path = ROOT / 'styles-v7.css'
styles = styles_path.read_text()
styles += r'''

/* K-Mate v35 — keep pieces visible and the complete live review on one screen */
body.game-mode .live-coach-active #board .piece.staunton-piece,
body.game-mode .live-coach-active #board .piece.vector-piece{
  position:relative!important;
  z-index:12!important;
  opacity:1!important;
  visibility:visible!important;
  filter:none;
}
body.game-mode .live-coach-active #board .piece.staunton-piece svg,
body.game-mode .live-coach-active #board .piece.vector-piece svg{
  position:relative!important;
  z-index:12!important;
  opacity:1!important;
  visibility:visible!important;
}
/* Do not turn highlighted destination squares into stacking contexts above pieces. */
body.game-mode .live-coach-active #board .sq.live-played-to,
body.game-mode .live-coach-active #board .sq.live-best-to{z-index:auto!important}
body.game-mode .live-coach-active .live-coach-board-arrows{z-index:6!important}
body.game-mode .live-coach-active .live-coach-square-label{z-index:15!important}
body.game-mode .live-coach-active .live-coach-board-arrows .played-arrow{stroke-width:2.15;stroke-dasharray:4 2.4;opacity:.88}
body.game-mode .live-coach-active .live-coach-board-arrows .best-arrow{stroke-width:2.35;opacity:.9}

/* The live review removes duplicated/secondary material so the board, exact reason,
   best move, both concrete lines, and Resume button all remain visible together. */
body.game-mode .live-coach-active .live-coach-summary,
body.game-mode .live-coach-active .live-coach-audio-status,
body.game-mode .live-coach-active .live-coach-principles{display:none!important}
body.game-mode .live-coach-active .live-coach-board-panel{
  overflow:hidden!important;
  padding:9px!important;
  gap:0!important;
}
body.game-mode .live-coach-active .live-coach-head{gap:7px}
body.game-mode .live-coach-active .live-coach-head h2{margin-top:2px;font-size:16px;line-height:1.1}
body.game-mode .live-coach-active .live-coach-pause-banner{margin:5px 0 3px;padding:5px 7px}
body.game-mode .live-coach-active .live-coach-pause-banner span{font-size:7px}
body.game-mode .live-coach-active .live-coach-pause-banner b{font-size:8px;line-height:1.15}
body.game-mode .live-coach-active .live-coach-board-legend{margin:4px 0!important;gap:4px}
body.game-mode .live-coach-active .live-coach-board-legend span{padding:3px 6px;font-size:7.5px;letter-spacing:0;text-transform:none}
body.game-mode .live-coach-active .live-coach-board-legend b{font-weight:950}
body.game-mode .live-coach-active .live-coach-comparison{grid-template-columns:1fr 1fr!important;gap:5px;margin-top:2px}
body.game-mode .live-coach-active .live-coach-comparison article{padding:6px 7px!important;border-radius:9px}
body.game-mode .live-coach-active .live-coach-comparison small{font-size:7px}
body.game-mode .live-coach-active .live-coach-comparison b{margin-top:2px;font-size:15px}
body.game-mode .live-coach-active .live-coach-comparison p{
  margin-top:3px!important;
  font-size:8.6px!important;
  line-height:1.22!important;
  max-height:none!important;
  overflow:visible!important;
}
body.game-mode .live-coach-active .live-coach-lines-grid{grid-template-columns:1fr 1fr!important;gap:5px;margin-top:5px}
body.game-mode .live-coach-active .live-coach-lines-grid .live-coach-line-wrap{padding:5px 6px!important;border-radius:8px}
body.game-mode .live-coach-active .live-coach-lines-grid .live-coach-line-wrap>small{font-size:6.5px;letter-spacing:.035em}
body.game-mode .live-coach-active .live-coach-lines-grid .live-coach-line{margin-top:2px;font-size:7.7px!important;line-height:1.25!important}
body.game-mode .live-coach-active .live-coach-actions{
  position:static!important;
  margin-top:5px!important;
  padding:0!important;
  background:none!important;
  box-shadow:none!important;
}
body.game-mode .live-coach-active .live-coach-actions .btn{min-height:30px!important;padding:0 6px!important;font-size:8px!important}

@media(max-width:760px){
  body.game-mode .live-coach-active .board-coach-stage{
    grid-template-rows:minmax(0,.92fr) minmax(0,1.08fr)!important;
    gap:4px!important;
  }
  body.game-mode .live-coach-active .live-boardwrap{
    width:min(72vw,300px)!important;
    max-height:100%!important;
  }
  body.game-mode .live-coach-active .live-coach-board-panel{padding:6px!important}
  body.game-mode .live-coach-active .live-coach-head h2{font-size:13px}
  body.game-mode .live-coach-active .live-coach-head .eyebrow{font-size:6px}
  body.game-mode .live-coach-active .live-coach-pause-banner{display:none!important}
  body.game-mode .live-coach-active .live-coach-board-legend span{padding:2px 4px;font-size:6.7px}
  body.game-mode .live-coach-active .live-coach-comparison p{font-size:7.35px!important;line-height:1.16!important}
  body.game-mode .live-coach-active .live-coach-comparison b{font-size:12px}
  body.game-mode .live-coach-active .live-coach-lines-grid .live-coach-line{font-size:6.8px!important}
  body.game-mode .live-coach-active .live-coach-actions .btn{min-height:27px!important;font-size:7px!important}
  body.game-mode .live-coach-active #board .piece.staunton-piece{width:83%!important;height:83%!important}
}
@media(max-height:720px) and (max-width:760px){
  body.game-mode .live-coach-active .live-boardwrap{width:min(62vw,230px)!important}
  body.game-mode .live-coach-active .live-coach-board-legend{margin:2px 0!important}
  body.game-mode .live-coach-active .live-coach-comparison p{font-size:6.8px!important;line-height:1.12!important}
  body.game-mode .live-coach-active .live-coach-lines-grid{margin-top:3px}
  body.game-mode .live-coach-active .live-coach-actions{margin-top:3px!important}
}
/* End K-Mate v35 */
'''
styles_path.write_text(styles)
