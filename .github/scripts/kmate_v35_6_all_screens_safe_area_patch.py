from __future__ import annotations

from pathlib import Path

ROOT = Path("kmate-trainer")
INDEX = ROOT / "index.html"
SAFE_CSS = ROOT / "safe-area-v35-6.css"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


index = INDEX.read_text()
index = replace_once(
    index,
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
    "non-overlay iPhone status bar",
)
index = replace_once(
    index,
    '<link rel="stylesheet" href="./styles-v7.css?v=35.5.0">',
    '<link rel="stylesheet" href="./styles-v7.css?v=35.6.0">\n  <link rel="stylesheet" href="./safe-area-v35-6.css?v=35.6.0">',
    "safe-area stylesheet",
)
for filename in ("appflow-v35.js", "app-v7.js", "review-v35-4.js"):
    index = index.replace(f'{filename}?v=35.5.0', f'{filename}?v=35.6.0')
INDEX.write_text(index)

SAFE_CSS.write_text(r'''/* K-Mate v35.6 — every iPhone screen respects the status bar, notch, and home indicator */
:root{
  --kmate-safe-top:max(12px,env(safe-area-inset-top,0px));
  --kmate-safe-right:max(0px,env(safe-area-inset-right,0px));
  --kmate-safe-bottom:max(8px,env(safe-area-inset-bottom,0px));
  --kmate-safe-left:max(0px,env(safe-area-inset-left,0px));
}

/* The background may extend behind iPhone system chrome; controls and text may not. */
@media (max-width:932px){
  .appbar{
    padding-top:calc(10px + var(--kmate-safe-top))!important;
    padding-right:max(14px,calc(var(--kmate-safe-right) + 8px))!important;
    padding-left:max(14px,calc(var(--kmate-safe-left) + 8px))!important;
  }

  body:not(.setup-wizard-mode):not(.game-mode) .shell{
    width:auto!important;
    margin-right:calc(var(--kmate-safe-right) + 8px)!important;
    margin-left:calc(var(--kmate-safe-left) + 8px)!important;
    padding-bottom:calc(74px + var(--kmate-safe-bottom))!important;
  }

  body.setup-wizard-mode .wizard-page{
    padding-top:calc(var(--kmate-safe-top) + 8px)!important;
    padding-right:calc(var(--kmate-safe-right) + 8px)!important;
    padding-bottom:calc(var(--kmate-safe-bottom) + 8px)!important;
    padding-left:calc(var(--kmate-safe-left) + 8px)!important;
  }

  body.game-mode #gameView{
    padding-top:calc(var(--kmate-safe-top) + 4px)!important;
    padding-right:calc(var(--kmate-safe-right) + 5px)!important;
    padding-bottom:calc(var(--kmate-safe-bottom) + 4px)!important;
    padding-left:calc(var(--kmate-safe-left) + 5px)!important;
  }

  body.game-mode .game-panel-backdrop{
    top:var(--kmate-safe-top)!important;
    right:var(--kmate-safe-right)!important;
    bottom:var(--kmate-safe-bottom)!important;
    left:var(--kmate-safe-left)!important;
  }

  /* Position the toast by its lower edge rather than relying on the older bottom rule.
     This keeps temporary messages above the iPhone home indicator even during animation. */
  .toast,
  .toast.show{
    left:calc((100vw + var(--kmate-safe-left) - var(--kmate-safe-right))/2)!important;
    right:auto!important;
    top:calc(100dvh - var(--kmate-safe-bottom) - 12px)!important;
    bottom:auto!important;
    max-width:calc(100vw - var(--kmate-safe-left) - var(--kmate-safe-right) - 20px)!important;
    margin:0!important;
    transform:translate(-50%,-100%)!important;
  }

  /* Compact dialogs are centered inside the usable iPhone rectangle and scroll internally when needed. */
  #positionImportDialog,
  #aboutBetaDialog,
  #promotionDialog,
  #resultDialog,
  #voiceCloneDialog{
    position:fixed!important;
    top:var(--kmate-safe-top)!important;
    right:var(--kmate-safe-right)!important;
    bottom:var(--kmate-safe-bottom)!important;
    left:var(--kmate-safe-left)!important;
    width:min(680px,calc(100vw - var(--kmate-safe-left) - var(--kmate-safe-right) - 16px))!important;
    height:max-content!important;
    max-width:calc(100vw - var(--kmate-safe-left) - var(--kmate-safe-right) - 16px)!important;
    max-height:calc(100dvh - var(--kmate-safe-top) - var(--kmate-safe-bottom))!important;
    margin:auto!important;
    overflow:auto!important;
    box-sizing:border-box!important;
  }

  #promotionDialog{width:min(520px,calc(100vw - var(--kmate-safe-left) - var(--kmate-safe-right) - 16px))!important}
  #resultDialog{width:min(720px,calc(100vw - var(--kmate-safe-left) - var(--kmate-safe-right) - 12px))!important}

  /* Full-screen teaching screens fill only the safe rectangle. Class-qualified selectors
     deliberately outrank the older full-viewport rules in styles-v7.css. */
  #principlesDialog,
  #principlesDialog.kmate-principles-v354,
  #replayDialog,
  #replayDialog.replay-modal{
    position:fixed!important;
    top:var(--kmate-safe-top)!important;
    right:var(--kmate-safe-right)!important;
    bottom:var(--kmate-safe-bottom)!important;
    left:var(--kmate-safe-left)!important;
    inset:var(--kmate-safe-top) var(--kmate-safe-right) var(--kmate-safe-bottom) var(--kmate-safe-left)!important;
    width:auto!important;
    height:auto!important;
    max-width:none!important;
    max-height:none!important;
    margin:0!important;
    padding:0!important;
    overflow:hidden!important;
    box-sizing:border-box!important;
  }

  #principlesDialog .modal-card,
  #principlesDialog.kmate-principles-v354 .modal-card,
  #replayDialog .replay-shell,
  #replayDialog.replay-modal .replay-shell{
    width:100%!important;
    height:100%!important;
    min-height:0!important;
    max-height:100%!important;
    overflow:hidden!important;
    box-sizing:border-box!important;
  }

  #principlesDialog .modal-card,
  #principlesDialog.kmate-principles-v354 .modal-card{border-radius:0!important}
  #replayDialog,
  #replayDialog.replay-modal{border-radius:0!important}
  #replayDialog .replay-header,
  #replayDialog.replay-modal .replay-header{padding-top:2px!important}
}

/* Landscape iPhones reserve the side notch / Dynamic Island as well as the home indicator. */
@media (orientation:landscape) and (max-width:932px){
  body.setup-wizard-mode .wizard-page{
    padding-right:calc(var(--kmate-safe-right) + 7px)!important;
    padding-left:calc(var(--kmate-safe-left) + 7px)!important;
  }
  body.game-mode #gameView{
    padding-right:calc(var(--kmate-safe-right) + 5px)!important;
    padding-left:calc(var(--kmate-safe-left) + 5px)!important;
  }
}

/* End K-Mate v35.6 */
''')
