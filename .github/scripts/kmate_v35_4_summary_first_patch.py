from __future__ import annotations

from pathlib import Path
import re

ROOT = Path('kmate-trainer')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing patch marker: {label}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Load the v35.4 overlay and give every changed asset a new cache version.
# ---------------------------------------------------------------------------
index_path = ROOT / 'index.html'
index = index_path.read_text()
index = re.sub(r'styles-v7\.css\?v=[^"\']+', 'styles-v7.css?v=35.4.0', index)
index = re.sub(r'appflow-v35\.js\?v=[^"\']+', 'appflow-v35.js?v=35.4.0', index)
index = re.sub(r'app-v7\.js\?v=[^"\']+', 'app-v7.js?v=35.4.0', index)
index = re.sub(r'\s*<script[^>]+review-v35-3\.js[^>]*></script>', '', index)
index = re.sub(r'\s*<script[^>]+review-v35-4\.js[^>]*></script>', '', index)
module_tag = '  <script type="module" src="./app-v7.js?v=35.4.0"></script>'
index = replace_once(
    index,
    module_tag,
    module_tag + '\n  <script src="./review-v35-4.js?v=35.4.0" defer></script>',
    'v35.4 review overlay script',
)
index_path.write_text(index)


# ---------------------------------------------------------------------------
# App-flow diagnostic version.
# ---------------------------------------------------------------------------
flow_path = ROOT / 'appflow-v35.js'
flow = flow_path.read_text()
flow = re.sub(r"const FLOW_VERSION = '[^']+';", "const FLOW_VERSION = '35.4-summary-first';", flow, count=1)
flow_path.write_text(flow)


# ---------------------------------------------------------------------------
# Add the missing Mistake category to the app's own move grading, without
# disturbing the existing Best/Excellent/Good/Inaccuracy/Miss/Blunder ranges.
# ---------------------------------------------------------------------------
part1_path = ROOT / 'app-v7-part1.txt'
part1 = part1_path.read_text()
old_bands = """const QUALITY_BANDS = [
  { max: 10, key: 'best', label: 'Best' },
  { max: 25, key: 'excellent', label: 'Excellent' },
  { max: 60, key: 'good', label: 'Good' },
  { max: 110, key: 'inaccuracy', label: 'Inaccurate' },
  { max: 220, key: 'miss', label: 'Miss' },
  { max: Infinity, key: 'blunder', label: 'Blunder' },
];"""
new_bands = """const QUALITY_BANDS = [
  { max: 10, key: 'best', label: 'Best' },
  { max: 25, key: 'excellent', label: 'Excellent' },
  { max: 60, key: 'good', label: 'Good' },
  { max: 110, key: 'inaccuracy', label: 'Inaccurate' },
  { max: 180, key: 'mistake', label: 'Mistake' },
  { max: 220, key: 'miss', label: 'Miss' },
  { max: Infinity, key: 'blunder', label: 'Blunder' },
];"""
part1 = replace_once(part1, old_bands, new_bands, 'quality bands with mistake')
part1 = part1.replace(
    "{ best: 0, excellent: 0, good: 0, inaccuracy: 0, miss: 0, blunder: 0 }",
    "{ best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 }",
)
old_advice = """  if (loss > 220) return 'Blunder: first check forcing moves and whether any piece is undefended.';
  if (loss > 110) return 'Miss: a significant opportunity or defensive resource was overlooked. Compare forcing candidates before committing.';
  if (loss > 60) return 'Inaccuracy: re-check king safety, the opponent’s plan, and your least active piece.';"""
new_advice = """  if (loss > 220) return 'Blunder: first check forcing moves and whether any piece is undefended.';
  if (loss > 180) return 'Miss: a major opportunity or defensive resource was overlooked. Compare forcing candidates before committing.';
  if (loss > 110) return 'Mistake: the move conceded a meaningful part of the position. Re-check the opponent’s threat and your candidate list.';
  if (loss > 60) return 'Inaccuracy: re-check king safety, the opponent’s plan, and your least active piece.';"""
part1 = replace_once(part1, old_advice, new_advice, 'move advice with mistake')
part1_path.write_text(part1)


# ---------------------------------------------------------------------------
# Refresh the dynamic application transport URLs so the quality-band change is
# not hidden by an old browser cache.
# ---------------------------------------------------------------------------
loader_path = ROOT / 'app-v7.js'
loader = loader_path.read_text()
loader = re.sub(r'positions-v7\.js\?v=[^\'"`]+', 'positions-v7.js?v=35.4.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=[^\'"`]+', 'app-v7-part${number}.txt?v=35.4.0', loader)
loader_path.write_text(loader)


# ---------------------------------------------------------------------------
# Fixed-screen principles and summary-first Coach Review styling.
# ---------------------------------------------------------------------------
styles_path = ROOT / 'styles-v7.css'
styles = styles_path.read_text()
marker = '/* K-Mate v35.4 — scroll-free principles and summary-first Coach Review */'
if marker not in styles:
    styles += r'''

/* K-Mate v35.4 — scroll-free principles and summary-first Coach Review */
html.principles-screen-open,html.principles-screen-open body{width:100%;height:100%;overflow:hidden!important;overscroll-behavior:none}
#principlesDialog.kmate-principles-v354{
  position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;
  margin:0!important;padding:max(8px,env(safe-area-inset-top)) 10px max(8px,env(safe-area-inset-bottom))!important;
  overflow:hidden!important;border:0!important;background:#061009e8!important;box-sizing:border-box!important;
}
#principlesDialog.kmate-principles-v354::backdrop{background:#030805e8!important;backdrop-filter:blur(8px)}
#principlesDialog.kmate-principles-v354 .modal-card{
  display:grid!important;grid-template-rows:auto minmax(0,1fr) auto!important;gap:clamp(8px,1.6vh,15px)!important;
  width:min(850px,100%)!important;height:100%!important;max-height:100%!important;margin:0 auto!important;
  padding:clamp(14px,2.4vw,28px)!important;overflow:hidden!important;box-sizing:border-box!important;
  border:1px solid #f2cc7040!important;border-radius:clamp(18px,3vw,28px)!important;
  background:radial-gradient(circle at 90% 0,#b9f47420,transparent 25rem),linear-gradient(145deg,#251d14,#0c1710 72%)!important;
  box-shadow:0 34px 100px #000d,inset 0 1px #fff2!important;
}
#principlesDialog.kmate-principles-v354 .eyebrow,
#principlesDialog.kmate-principles-v354 #principlesPositionSubtitle,
#principlesDialog.kmate-principles-v354 .principles-note{display:none!important}
#principlesDialog.kmate-principles-v354 #principlesPositionTitle{
  margin:0!important;color:#fff8e9!important;font-size:clamp(27px,4.2vw,43px)!important;font-weight:950!important;
  line-height:1.02!important;letter-spacing:-.045em!important;text-align:center!important;
}
#principlesDialog.kmate-principles-v354 .principles-list{
  display:grid!important;grid-template-rows:repeat(var(--principle-count,5),minmax(0,1fr))!important;gap:clamp(6px,1vh,10px)!important;
  min-width:0!important;min-height:0!important;max-height:none!important;margin:0!important;overflow:hidden!important;
}
#principlesDialog.kmate-principles-v354 .kmate-principle-row{
  display:grid!important;grid-template-columns:clamp(38px,5vw,52px) minmax(0,1fr)!important;align-items:center!important;
  min-width:0!important;min-height:0!important;margin:0!important;padding:clamp(7px,1.2vh,12px) clamp(10px,1.8vw,16px)!important;
  overflow:hidden!important;border:1px solid #f2cc7028!important;border-radius:clamp(12px,2vw,17px)!important;
  background:linear-gradient(145deg,#fff9e90c,#ffffff04)!important;box-shadow:inset 0 1px #fff1!important;
}
#principlesDialog.kmate-principles-v354 .kmate-principle-number{
  display:grid!important;place-items:center!important;width:clamp(32px,4.3vw,42px)!important;height:clamp(32px,4.3vw,42px)!important;
  border-radius:clamp(9px,1.4vw,13px)!important;background:linear-gradient(145deg,#f5dc87,#a8e76c)!important;color:#17210f!important;
  font-size:clamp(14px,1.8vw,18px)!important;font-weight:1000!important;box-shadow:inset 0 2px #fff8,0 5px 0 #47682f,0 8px 15px #0007!important;
}
#principlesDialog.kmate-principles-v354 .kmate-principle-row>div{min-width:0!important;overflow:hidden!important}
#principlesDialog.kmate-principles-v354 .kmate-principle-row b{
  display:block!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;
  color:#fff8e9!important;font-size:clamp(15px,2.1vw,21px)!important;line-height:1.08!important;
}
#principlesDialog.kmate-principles-v354 .kmate-principle-row p{
  display:-webkit-box!important;margin:4px 0 0!important;overflow:hidden!important;color:#bfc9c0!important;font-size:clamp(10px,1.2vw,12px)!important;
  line-height:1.2!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:1!important;
}
#principlesDialog.kmate-principles-v354 .dialogactions{
  display:grid!important;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)!important;gap:10px!important;min-height:0!important;margin:0!important;
}
.kmate-3d-button{
  position:relative!important;min-height:50px!important;padding:0 18px!important;border:1px solid #ffffff22!important;border-radius:15px!important;
  background:linear-gradient(180deg,#32443a 0%,#1b2c22 64%,#122018 100%)!important;color:#fff8e9!important;
  font-size:14px!important;font-weight:950!important;letter-spacing:.005em!important;text-align:center!important;
  box-shadow:inset 0 2px #ffffff24,inset 0 -2px #0005,0 6px 0 #09140d,0 11px 22px #0008!important;
  transform:translateY(0)!important;transition:transform .08s ease,box-shadow .08s ease,filter .12s ease!important;
}
.kmate-3d-button:hover{filter:brightness(1.08)}
.kmate-3d-button:active{transform:translateY(5px)!important;box-shadow:inset 0 2px #ffffff18,inset 0 -1px #0005,0 1px 0 #09140d,0 5px 10px #0007!important}
.kmate-3d-primary{
  border-color:#d8f69a66!important;background:linear-gradient(180deg,#e8ffae 0%,#b9f474 55%,#8fc957 100%)!important;color:#15200e!important;
  box-shadow:inset 0 2px #fffbd1,inset 0 -2px #567c36,0 6px 0 #41642b,0 12px 25px #8fca5430!important;
}
.kmate-3d-primary:active{box-shadow:inset 0 2px #fff7bd,inset 0 -1px #567c36,0 1px 0 #41642b,0 5px 10px #0007!important}
#principlesDialog.kmate-principles-v354 .dialogactions .kmate-3d-button{min-height:clamp(48px,7vh,58px)!important;font-size:clamp(14px,1.8vw,17px)!important}

/* Compact result summary. */
.kmate-result-summary{margin:12px 0;padding:14px;border:1px solid #f2cc702d;border-radius:18px;background:linear-gradient(145deg,#fff8e90b,#b9f47408)}
.kmate-summary-topline{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#bfc9c0;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
.kmate-summary-topline b{color:#fff8e9;font-size:12px}
.kmate-rating-panel{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:14px;margin-top:9px}
.kmate-rating-number{display:flex;align-items:flex-end;gap:2px;color:#d9ff8c}
.kmate-rating-number strong{font-size:48px;line-height:.88;letter-spacing:-.06em}
.kmate-rating-number span{font-size:14px;font-weight:900}
.kmate-rating-panel small{display:block;color:#aab7ad;font-size:9px;letter-spacing:.12em;text-transform:uppercase}
.kmate-rating-panel>div>b{display:block;margin-top:2px;color:#fff8e9;font-size:21px}
.kmate-rating-panel p{margin:3px 0 0;color:#bcc7be;font-size:11px;line-height:1.3}
.kmate-composition-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:12px}
.kmate-composition-item{min-width:0;padding:8px 4px;border:1px solid #ffffff12;border-radius:10px;background:#ffffff06;text-align:center}
.kmate-composition-item b{display:block;color:#fff8e9;font-size:18px;line-height:1}
.kmate-composition-item span{display:block;margin-top:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#aebbb1;font-size:8px;font-weight:850}
.kmate-summary-pending{margin:8px 0 0;color:#f1d587;font-size:10px;text-align:center}
.quality-mistake,.move-entry.quality-mistake,.move-rating.quality-mistake{--quality-color:#ffb35c;color:#ffbd72!important}
.move-quality-square.quality-mistake{box-shadow:inset 0 0 0 4px #ffab50!important}

/* Coach Review starts with a fixed game-summary page, never the generic replay orientation frame. */
#replayDialog .replay-shell.summary-mode{display:grid!important;grid-template-rows:auto minmax(0,1fr)!important;overflow:hidden!important}
#replayDialog .replay-shell.summary-mode .replay-layout{display:none!important}
#replayDialog .coach-review-summary{
  display:grid;grid-template-rows:minmax(0,1fr) auto;gap:12px;min-width:0;min-height:0;padding:clamp(12px,2vw,24px);overflow:hidden;
  background:radial-gradient(circle at 90% 0,#b9f4741c,transparent 26rem),linear-gradient(145deg,#141d16,#09120c);
}
#replayDialog .coach-review-summary[hidden]{display:none!important}
.coach-review-summary-content{display:flex;flex-direction:column;justify-content:center;width:min(900px,100%);min-height:0;margin:0 auto;overflow:hidden}
.coach-review-summary-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:10px}
.coach-review-summary-heading span{color:#f1d587;font-size:10px;font-weight:950;letter-spacing:.14em;text-transform:uppercase}
.coach-review-summary-heading h2{margin:3px 0 0;color:#fff8e9;font-size:clamp(28px,4vw,44px);line-height:1;letter-spacing:-.045em}
.coach-review-summary-heading p{max-width:420px;margin:0;color:#b9c5bb;font-size:12px;line-height:1.35;text-align:right}
#coachReviewSummary .kmate-rating-panel{margin-top:clamp(10px,2vh,20px);padding:clamp(12px,2vw,20px);border:1px solid #b9f47430;border-radius:18px;background:#b9f4740b}
#coachReviewSummary .kmate-rating-number strong{font-size:clamp(54px,8vw,82px)}
#coachReviewSummary .kmate-rating-panel>div>b{font-size:clamp(24px,3vw,34px)}
#coachReviewSummary .kmate-rating-panel p{font-size:clamp(11px,1.4vw,14px)}
#coachReviewSummary .kmate-composition-grid{margin-top:clamp(10px,2vh,18px);gap:8px}
#coachReviewSummary .kmate-composition-item{padding:clamp(9px,1.5vh,15px) 5px;border-radius:13px}
#coachReviewSummary .kmate-composition-item b{font-size:clamp(20px,3vw,30px)}
#coachReviewSummary .kmate-composition-item span{font-size:clamp(8px,1vw,10px)}
.coach-review-summary-actions{display:grid;width:min(900px,100%);margin:0 auto}
#startDetailedCoachReview{width:100%;min-height:56px!important;font-size:16px!important}
#replayDialog .replay-layout[hidden]{display:none!important}

@media(max-width:600px){
  #principlesDialog.kmate-principles-v354{padding:5px!important}
  #principlesDialog.kmate-principles-v354 .modal-card{gap:7px!important;padding:12px 9px!important;border-radius:17px!important}
  #principlesDialog.kmate-principles-v354 #principlesPositionTitle{font-size:25px!important}
  #principlesDialog.kmate-principles-v354 .principles-list{gap:5px!important}
  #principlesDialog.kmate-principles-v354 .kmate-principle-row{grid-template-columns:36px minmax(0,1fr)!important;padding:5px 8px!important;border-radius:10px!important}
  #principlesDialog.kmate-principles-v354 .kmate-principle-number{width:29px!important;height:29px!important;border-radius:8px!important;font-size:13px!important;box-shadow:inset 0 1px #fff8,0 3px 0 #47682f,0 5px 9px #0007!important}
  #principlesDialog.kmate-principles-v354 .kmate-principle-row b{font-size:14px!important}
  #principlesDialog.kmate-principles-v354 .kmate-principle-row p{display:none!important}
  #principlesDialog.kmate-principles-v354 .dialogactions{gap:6px!important}
  #principlesDialog.kmate-principles-v354 .dialogactions .kmate-3d-button{min-height:45px!important;padding:0 8px!important;font-size:12px!important;border-radius:11px!important;box-shadow:inset 0 1px #ffffff24,inset 0 -2px #0005,0 4px 0 #09140d,0 7px 13px #0008!important}
  #principlesDialog.kmate-principles-v354 .dialogactions .kmate-3d-primary{box-shadow:inset 0 1px #fffbd1,inset 0 -2px #567c36,0 4px 0 #41642b,0 8px 15px #8fca5430!important}
  .kmate-composition-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
  .kmate-composition-item{padding:7px 3px}
  .kmate-composition-item b{font-size:16px}
  .kmate-composition-item span{font-size:7px}
  #replayDialog .coach-review-summary{gap:7px;padding:9px 8px max(9px,env(safe-area-inset-bottom))}
  .coach-review-summary-heading{display:block;margin-bottom:5px;text-align:center}
  .coach-review-summary-heading h2{font-size:27px}
  .coach-review-summary-heading p{display:none}
  #coachReviewSummary .kmate-summary-topline{font-size:8px}
  #coachReviewSummary .kmate-rating-panel{grid-template-columns:auto minmax(0,1fr);gap:9px;margin-top:6px;padding:9px 10px;border-radius:13px}
  #coachReviewSummary .kmate-rating-number strong{font-size:50px}
  #coachReviewSummary .kmate-rating-panel>div>b{font-size:20px}
  #coachReviewSummary .kmate-rating-panel p{font-size:9px;line-height:1.2}
  #coachReviewSummary .kmate-composition-grid{margin-top:7px;gap:5px}
  #coachReviewSummary .kmate-composition-item{padding:7px 3px;border-radius:9px}
  #coachReviewSummary .kmate-composition-item b{font-size:17px}
  #coachReviewSummary .kmate-composition-item span{font-size:7px}
  #startDetailedCoachReview{min-height:47px!important;font-size:13px!important;border-radius:12px!important}
}

@media(max-height:700px){
  #principlesDialog.kmate-principles-v354 .modal-card{gap:5px!important;padding:9px!important}
  #principlesDialog.kmate-principles-v354 #principlesPositionTitle{font-size:23px!important}
  #principlesDialog.kmate-principles-v354 .kmate-principle-row p{display:none!important}
  #principlesDialog.kmate-principles-v354 .dialogactions .kmate-3d-button{min-height:42px!important}
  .coach-review-summary-heading{margin-bottom:4px}
  #coachReviewSummary .kmate-rating-panel{margin-top:4px;padding:7px 9px}
  #coachReviewSummary .kmate-rating-number strong{font-size:44px}
  #coachReviewSummary .kmate-composition-grid{margin-top:5px}
  #coachReviewSummary .kmate-composition-item{padding:5px 3px}
  #startDetailedCoachReview{min-height:43px!important}
}
/* End K-Mate v35.4 */
'''
styles_path.write_text(styles)
