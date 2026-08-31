from __future__ import annotations

from pathlib import Path
import re

ROOT = Path('kmate-trainer')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing patch marker: {label}')
    return text.replace(old, new, 1)


# Cache-bust and load the review layer after the v35 application.
index_path = ROOT / 'index.html'
index = index_path.read_text()
index = re.sub(r'styles-v7\.css\?v=35\.2\.0', 'styles-v7.css?v=35.3.0', index)
index = re.sub(r'appflow-v35\.js\?v=35\.2\.0', 'appflow-v35.js?v=35.3.0', index)
index = re.sub(r'app-v7\.js\?v=35\.2\.0', 'app-v7.js?v=35.3.0', index)
script_tag = '  <script src="./review-v35-3.js?v=35.3.0" defer></script>\n'
if 'review-v35-3.js?v=35.3.0' not in index:
    marker = '  <script type="module" src="./app-v7.js?v=35.3.0"></script>'
    index = replace_once(index, marker, marker + '\n' + script_tag.rstrip(), 'review-layer script')
index_path.write_text(index)

# Publish a precise UI version while leaving the restored v35 chess runtime intact.
flow_path = ROOT / 'appflow-v35.js'
flow = flow_path.read_text()
flow = replace_once(flow, "const FLOW_VERSION = '35.2-warm-3d';", "const FLOW_VERSION = '35.3-principles-summary';", 'app-flow version')
flow_path.write_text(flow)

styles_path = ROOT / 'styles-v7.css'
styles = styles_path.read_text()
if 'K-Mate v35.3 — compact principles and game-rating summary' not in styles:
    styles += r'''

/* K-Mate v35.3 — compact principles and game-rating summary */
#principlesDialog.kmate-principles-v353{
  position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;
  max-width:none!important;max-height:none!important;margin:0!important;
  padding:max(10px,env(safe-area-inset-top)) 12px max(10px,env(safe-area-inset-bottom))!important;
  overflow:hidden!important;background:#050b08e8!important;overscroll-behavior:none!important;
}
#principlesDialog.kmate-principles-v353 .modal-card{
  display:grid!important;grid-template-rows:auto minmax(0,1fr) auto!important;gap:14px!important;
  width:min(820px,100%)!important;height:min(730px,100%)!important;max-height:100%!important;
  margin:auto!important;padding:clamp(18px,3vw,34px)!important;overflow:hidden!important;
  border:1px solid #e5b95f42!important;border-radius:27px!important;
  background:radial-gradient(circle at 88% 0,#b9f4741b,transparent 25rem),linear-gradient(150deg,#2a2016,#111a13 58%,#09110c)!important;
  box-shadow:inset 0 1px #fff1,0 38px 110px #000d!important;
}
#principlesDialog.kmate-principles-v353 .eyebrow,
#principlesDialog.kmate-principles-v353 #principlesPositionSubtitle,
#principlesDialog.kmate-principles-v353 .principles-note{display:none!important}
#principlesDialog.kmate-principles-v353 #principlesPositionTitle{
  margin:0!important;color:#fff5df!important;font-size:clamp(30px,4.3vw,45px)!important;
  line-height:1.02!important;letter-spacing:-.045em!important;text-align:center!important;
  text-shadow:0 5px 24px #0008!important;
}
#principlesDialog.kmate-principles-v353 .principles-list{
  display:grid!important;grid-template-rows:repeat(var(--principle-count,5),minmax(0,1fr))!important;
  gap:9px!important;min-height:0!important;margin:0!important;overflow:hidden!important;
}
#principlesDialog.kmate-principles-v353 .principle-focus-card{
  display:grid!important;grid-template-columns:50px minmax(0,1fr)!important;align-items:center!important;
  gap:14px!important;min-height:0!important;margin:0!important;padding:9px 15px!important;
  border:1px solid #e4b75c2f!important;border-radius:16px!important;
  background:linear-gradient(155deg,#ffffff0c,#ffffff04)!important;
  box-shadow:inset 0 1px #fff1,0 8px 18px #0002!important;
}
#principlesDialog.kmate-principles-v353 .principle-number{
  display:grid!important;place-items:center!important;width:40px!important;height:40px!important;
  border-radius:13px!important;background:linear-gradient(145deg,#f1c66b,#b9f474)!important;
  color:#17210f!important;font-size:18px!important;font-weight:950!important;
  box-shadow:inset 0 2px #ffffff75,inset 0 -3px #6f9140,0 8px 14px #0004!important;
}
#principlesDialog.kmate-principles-v353 .principle-copy{display:grid!important;gap:3px!important;min-width:0!important}
#principlesDialog.kmate-principles-v353 .principle-copy>b{
  color:#fff5df!important;font-size:clamp(16px,2vw,21px)!important;line-height:1.1!important;
}
#principlesDialog.kmate-principles-v353 .principle-mini-description{
  display:block!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;
  color:#bac5bb!important;font-size:clamp(10px,1.4vw,13px)!important;line-height:1.15!important;
}
#principlesDialog.kmate-principles-v353 .dialogactions{
  display:grid!important;grid-template-columns:1fr 1.45fr!important;gap:10px!important;margin:0!important;
}
#principlesDialog.kmate-principles-v353 .principle-action{
  position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important;
  min-height:58px!important;padding:0 20px!important;border:1px solid #d1a75b66!important;
  border-radius:17px!important;background:linear-gradient(180deg,#3c3529,#292920 58%,#192019)!important;
  color:#fff3da!important;font-size:17px!important;font-weight:950!important;
  box-shadow:inset 0 2px #ffffff20,inset 0 -5px #0b100c,0 12px 22px #0006!important;
  transform:translateY(0)!important;transition:transform .1s ease,filter .1s ease,box-shadow .1s ease!important;
}
#principlesDialog.kmate-principles-v353 .principle-primary{
  border-color:#d8ef7ca8!important;background:linear-gradient(180deg,#e2fc91,#bde96d 52%,#91c34f)!important;
  color:#17210f!important;text-shadow:0 1px #ffffff75!important;
  box-shadow:inset 0 2px #ffffff85,inset 0 -5px #5d8733,0 14px 26px #91c35b34!important;
}
#principlesDialog.kmate-principles-v353 .principle-action:hover{filter:brightness(1.08)!important;transform:translateY(-1px)!important}
#principlesDialog.kmate-principles-v353 .principle-action:active{
  transform:translateY(4px)!important;box-shadow:inset 0 1px #ffffff18,inset 0 -1px #0b100c,0 4px 8px #0005!important;
}

#resultDialog.kmate-result-v353 .result-card{width:min(790px,calc(100vw - 18px))!important}
#resultDialog.kmate-result-v353 #resultCoach,
#resultDialog.kmate-result-v353 #postReview{display:none!important}
.game-summary-v353{
  display:grid;gap:13px;margin:14px 0;padding:16px;border:1px solid #e5b95f35;border-radius:21px;
  background:radial-gradient(circle at 95% 0,#b9f47417,transparent 18rem),linear-gradient(150deg,#241d15,#111a13);
  box-shadow:inset 0 1px #fff1,0 16px 34px #0004;
}
.game-summary-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px}
.game-summary-heading small{color:#e8bd67;font-size:10px;font-weight:950;letter-spacing:.15em;text-transform:uppercase}
.game-summary-heading h3{margin:4px 0 2px;color:#fff5df;font-size:clamp(25px,4vw,36px);line-height:1;letter-spacing:-.04em}
.game-summary-heading p{margin:0;color:#b8c2b9;font-size:12px}
.game-rating-orb{
  position:relative;display:grid;grid-template-columns:auto auto;align-items:end;justify-content:center;
  min-width:112px;padding:12px 14px 10px;border:1px solid #d8ef7c70;border-radius:20px;
  background:linear-gradient(145deg,#405530,#1d2d21);box-shadow:inset 0 2px #ffffff18,inset 0 -4px #10180f,0 12px 22px #0004;
}
.game-rating-orb b{color:#e8ff9c;font-size:38px;line-height:.9;letter-spacing:-.06em}
.game-rating-orb span{padding:0 0 2px 3px;color:#b9c5b8;font-size:11px}
.game-rating-orb i{grid-column:1/-1;margin-top:6px;color:#f1c66b;font-size:11px;font-style:normal;font-weight:950;text-align:center}
.game-composition-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}
.game-composition-item{
  display:grid;gap:4px;padding:9px 5px;border:1px solid #ffffff12;border-radius:12px;background:#ffffff06;text-align:center;
}
.game-composition-item span{overflow:hidden;color:#aeb9af;font-size:9px;font-weight:800;white-space:nowrap;text-overflow:ellipsis}
.game-composition-item b{font-size:22px;line-height:1}
.game-composition-item.quality-best b{color:#8ee8ff}.game-composition-item.quality-excellent b{color:#9ff08b}
.game-composition-item.quality-good b{color:#d6f28a}.game-composition-item.quality-inaccuracy b{color:#f4cf72}
.game-composition-item.quality-miss b{color:#f39a6e}.game-composition-item.quality-blunder b{color:#ff7d7d}
.game-review-prompt{display:grid;gap:3px;padding:11px 13px;border-left:4px solid #b9f474;border-radius:10px;background:#b9f4740c}
.game-review-prompt span{color:#c8d1c9;font-size:11px;line-height:1.35}.game-review-prompt b{color:#e9f7d5;font-size:12px}
#resultDialog.kmate-result-v353 .detailed-review-button{
  border-color:#d8ef7caa!important;background:linear-gradient(180deg,#e2fc91,#bde96d 52%,#91c34f)!important;
  color:#17210f!important;font-weight:950!important;box-shadow:inset 0 2px #ffffff85,inset 0 -5px #5d8733,0 12px 22px #91c35b2c!important;
}
#replayDialog.kmate-replay-v353 #replayTitle{color:#fff5df}

@media(max-width:640px){
  #principlesDialog.kmate-principles-v353{padding:6px!important}
  #principlesDialog.kmate-principles-v353 .modal-card{width:100%!important;height:100%!important;padding:14px 10px!important;gap:8px!important;border-radius:18px!important}
  #principlesDialog.kmate-principles-v353 #principlesPositionTitle{font-size:25px!important}
  #principlesDialog.kmate-principles-v353 .principles-list{gap:6px!important}
  #principlesDialog.kmate-principles-v353 .principle-focus-card{grid-template-columns:39px minmax(0,1fr)!important;gap:9px!important;padding:6px 9px!important;border-radius:11px!important}
  #principlesDialog.kmate-principles-v353 .principle-number{width:31px!important;height:31px!important;border-radius:9px!important;font-size:14px!important}
  #principlesDialog.kmate-principles-v353 .principle-copy>b{font-size:14px!important}
  #principlesDialog.kmate-principles-v353 .principle-mini-description{display:none!important}
  #principlesDialog.kmate-principles-v353 .dialogactions{gap:6px!important}
  #principlesDialog.kmate-principles-v353 .principle-action{min-height:48px!important;padding:0 8px!important;border-radius:13px!important;font-size:14px!important;box-shadow:inset 0 2px #ffffff20,inset 0 -4px #0b100c,0 8px 14px #0005!important}
  #principlesDialog.kmate-principles-v353 .principle-primary{box-shadow:inset 0 2px #ffffff85,inset 0 -4px #5d8733,0 9px 18px #91c35b2c!important}
  .game-summary-v353{gap:9px;margin:9px 0;padding:11px;border-radius:15px}
  .game-summary-heading{gap:9px}.game-summary-heading h3{font-size:24px}.game-summary-heading p{font-size:10px}
  .game-rating-orb{min-width:88px;padding:9px 9px 7px;border-radius:15px}.game-rating-orb b{font-size:31px}
  .game-composition-grid{grid-template-columns:repeat(3,1fr);gap:5px}.game-composition-item{padding:7px 3px}.game-composition-item b{font-size:18px}
}

@media(max-height:700px){
  #principlesDialog.kmate-principles-v353 .modal-card{padding:10px!important;gap:5px!important}
  #principlesDialog.kmate-principles-v353 #principlesPositionTitle{font-size:22px!important}
  #principlesDialog.kmate-principles-v353 .principles-list{gap:4px!important}
  #principlesDialog.kmate-principles-v353 .principle-focus-card{padding:4px 8px!important}
  #principlesDialog.kmate-principles-v353 .principle-action{min-height:42px!important;font-size:13px!important}
}
/* End K-Mate v35.3 */
'''
styles_path.write_text(styles)
