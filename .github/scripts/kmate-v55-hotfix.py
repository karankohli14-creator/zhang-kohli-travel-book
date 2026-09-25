from pathlib import Path

JS_PATH = Path("kmate-trainer/coach-layout-v55.js")
CSS_PATH = Path("kmate-trainer/coach-layout-v55.css")

OLD_HINT_HANDLER = """    layout.querySelector('#km55HintAction')?.addEventListener('click', () => {
      const original = document.querySelector('#showHintButton');
      if (original instanceof HTMLButtonElement && !original.disabled) original.click();
      km55Schedule('hint-action');
    });"""

NEW_HINT_HANDLER = """    layout.querySelector('#km55HintAction')?.addEventListener('click', () => {
      const original = document.querySelector('#showHintButton');
      const reveal = () => {
        if (!(original instanceof HTMLButtonElement)) return false;
        const restoreDisabled = original.disabled;
        original.dataset.kmateNoUiSound = 'true';
        original.disabled = false;
        try {
          HTMLElement.prototype.click.call(original);
        } finally {
          queueMicrotask(() => {
            delete original.dataset.kmateNoUiSound;
            if (restoreDisabled && !/candidate revealed/i.test(km55Text('#hintTitle'))) {
              original.disabled = true;
            }
          });
        }
        return true;
      };
      reveal();
      km55Schedule('hint-action');
      window.setTimeout(() => {
        if (/strategic hint/i.test(km55Text('#hintTitle'))) reveal();
        km55Schedule('hint-action-120');
      }, 120);
      window.setTimeout(() => km55Schedule('hint-action-450'), 450);
    });"""

ACTIVE_FIT_CSS = """

/* v55 active phone rail fit */
@media (max-width: 820px) {
  html.kmate-coach-layout-v55 body.game-mode .km55-coach-layout[data-state="hint"] > #boardCoachStage {
    width: calc(100% - 12px) !important;
    max-width: calc(100% - 12px) !important;
    justify-self: center !important;
  }

  html.kmate-coach-layout-v55 body.game-mode .km55-coach-layout[data-state="coach"] > #boardCoachStage {
    width: calc(100% - 20px) !important;
    max-width: calc(100% - 20px) !important;
    justify-self: center !important;
  }
}
"""

js = JS_PATH.read_text(encoding="utf-8")
if OLD_HINT_HANDLER in js:
    js = js.replace(OLD_HINT_HANDLER, NEW_HINT_HANDLER, 1)
elif "const reveal = () =>" not in js:
    raise SystemExit("Expected v55 hint action block was not found.")
JS_PATH.write_text(js, encoding="utf-8")

css = CSS_PATH.read_text(encoding="utf-8")
if "/* v55 active phone rail fit */" not in css:
    css += ACTIVE_FIT_CSS
CSS_PATH.write_text(css, encoding="utf-8")
