from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSS_PATH = ROOT / "kmate-trainer" / "styles-v7.css"
INDEX_PATH = ROOT / "kmate-trainer" / "index.html"

MARKER = "/* K-Mate v35.5 — iPhone-safe Coach Review frame */"
OVERRIDE = r'''

/* K-Mate v35.5 — iPhone-safe Coach Review frame */
@media (max-width:760px){
  #replayDialog{
    --kmate-review-safe-top:max(12px,env(safe-area-inset-top));
    --kmate-review-safe-right:max(0px,env(safe-area-inset-right));
    --kmate-review-safe-bottom:max(8px,env(safe-area-inset-bottom));
    --kmate-review-safe-left:max(0px,env(safe-area-inset-left));
    position:fixed!important;
    inset:var(--kmate-review-safe-top) var(--kmate-review-safe-right) var(--kmate-review-safe-bottom) var(--kmate-review-safe-left)!important;
    width:auto!important;
    height:auto!important;
    max-width:none!important;
    max-height:none!important;
    margin:0!important;
    padding:0!important;
    overflow:hidden!important;
    border-radius:0!important;
  }
  #replayDialog .replay-shell{
    width:100%!important;
    height:100%!important;
    min-height:0!important;
    max-height:100%!important;
    padding:7px!important;
    overflow:hidden!important;
  }
  #replayDialog .replay-header{
    min-height:42px!important;
    padding-top:2px!important;
  }
}

/* Keep the review inside the notch-safe rectangle on every modern iPhone,
   including landscape models whose CSS viewport can be wider than 760 px. */
@media (min-width:761px) and (max-width:932px) and (hover:none) and (pointer:coarse){
  #replayDialog{
    --kmate-review-safe-top:max(12px,env(safe-area-inset-top));
    --kmate-review-safe-bottom:max(8px,env(safe-area-inset-bottom));
    top:var(--kmate-review-safe-top)!important;
    bottom:var(--kmate-review-safe-bottom)!important;
    max-height:calc(100dvh - var(--kmate-review-safe-top) - var(--kmate-review-safe-bottom))!important;
  }
}
'''

css = CSS_PATH.read_text(encoding="utf-8")
if MARKER not in css:
    CSS_PATH.write_text(css.rstrip() + OVERRIDE + "\n", encoding="utf-8")

index = INDEX_PATH.read_text(encoding="utf-8")
index = index.replace("?v=35.4.0", "?v=35.5.0")
INDEX_PATH.write_text(index, encoding="utf-8")
