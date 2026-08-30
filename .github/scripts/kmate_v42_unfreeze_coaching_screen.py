from __future__ import annotations

from pathlib import Path
import re

ROOT = Path('kmate-trainer')


def read(path: Path) -> str:
    return path.read_text()


def write(path: Path, text: str) -> None:
    path.write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing patch marker: {label}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Cache-bust the application.
# ---------------------------------------------------------------------------
index_path = ROOT / 'index.html'
index = read(index_path)
index = re.sub(r'styles-v7\.css\?v=\d+\.\d+\.\d+', 'styles-v7.css?v=42.0.0', index)
index = re.sub(r'app-v7\.js\?v=\d+\.\d+\.\d+', 'app-v7.js?v=42.0.0', index)
write(index_path, index)

loader_path = ROOT / 'app-v7.js'
loader = read(loader_path)
loader = re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=42.0.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=42.0.0', loader)
write(loader_path, loader)


# ---------------------------------------------------------------------------
# Main runtime: never use a modal top-layer dialog for the pregame principles.
# A hidden/failed showModal() was able to leave the setup screen visually present
# but browser-inert, which exactly matches the reported frozen coaching page.
# ---------------------------------------------------------------------------
part1_path = ROOT / 'app-v7-part1.txt'
part1 = read(part1_path)
part1 = part1.replace("url.search = '?v=20260830-41';", "url.search = '?v=20260830-42';")

old_dialog_helpers = '''function openDialog(id) {
  const dialog = $(`#${id}`);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(id) {
  if (id === 'replayDialog') { stopReplayAuto(); stopCoachSpeech(); }
  const dialog = $(`#${id}`);
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}'''
new_dialog_helpers = '''function dialogIsModal(dialog) {
  if (!dialog) return false;
  try { return dialog.matches(':modal'); } catch { return false; }
}

function closeDialogElement(dialog) {
  if (!dialog) return;
  try {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
  } catch {}
  dialog.removeAttribute('open');
  dialog.classList.remove('nonmodal-app-screen');
  dialog.setAttribute('aria-modal', 'false');
}

function closeSetupBlockingDialogs() {
  // A modal dialog makes every other control in the document inert. Always clear
  // stale top-layer dialogs before showing or activating a setup page.
  $$('dialog[open]').forEach((dialog) => closeDialogElement(dialog));
  $$('#setupView, #setupFlow, .setup-flow-page').forEach((element) => {
    try { element.inert = false; } catch {}
    element.removeAttribute('inert');
  });
}

function openDialog(id) {
  const dialog = $(`#${id}`);
  if (!dialog) return false;

  if (id === 'principlesDialog') {
    // This is intentionally NON-MODAL. It is styled as a full-screen app page,
    // but it never places the coaching setup into the browser's inert state.
    closeDialogElement(dialog);
    dialog.classList.add('nonmodal-app-screen');
    dialog.setAttribute('aria-modal', 'false');
    dialog.setAttribute('open', '');
    return true;
  }

  if (dialog.open) return true;
  try {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  } catch (error) {
    console.warn(`Modal ${id} could not enter the top layer; opening non-modally.`, error);
    dialog.setAttribute('open', '');
  }
  return true;
}

function closeDialog(id) {
  if (id === 'replayDialog') { stopReplayAuto(); stopCoachSpeech(); }
  closeDialogElement($(`#${id}`));
}'''
part1 = replace_once(part1, old_dialog_helpers, new_dialog_helpers, 'dialog helpers')

part1 = replace_once(
    part1,
    '''function handleGeneratePosition(event = null) {
  event?.preventDefault?.();
  const button = $('#startButton');''',
    '''function handleGeneratePosition(event = null) {
  event?.preventDefault?.();
  closeSetupBlockingDialogs();
  const button = $('#startButton');''',
    'generate-position clears stale dialogs',
)

old_principle_open = '''    renderAll();
    openDialog('principlesDialog');
    return;
  }
  beginPreparedPosition();'''
new_principle_open = '''    renderAll();
    openDialog('principlesDialog');
    window.requestAnimationFrame(() => {
      const dialog = $('#principlesDialog');
      const rect = dialog?.getBoundingClientRect?.();
      const visible = Boolean(dialog?.open && rect && rect.width >= 240 && rect.height >= 300);
      if (visible) return;
      console.warn('Principle review could not render; starting the position without trapping the setup screen.');
      closeDialog('principlesDialog');
      principleReviewPending = false;
      beginPreparedPosition();
    });
    return;
  }
  beginPreparedPosition();'''
part1 = replace_once(part1, old_principle_open, new_principle_open, 'principle-screen watchdog')
write(part1_path, part1)


# ---------------------------------------------------------------------------
# Setup runtime: remove every possible hit-test blocker and repair BFCache state.
# ---------------------------------------------------------------------------
part6_path = ROOT / 'app-v7-part6.txt'
part6 = read(part6_path)
part6 = part6.replace("version: '41.0-commercial-beta'", "version: '42.0-commercial-beta'")

old_show_page = '''function showSetupFlowPage(page = 'intro', { focus = true } = {}) {
  const allowed = new Set(['intro', 'challenge', 'coach']);
  setupFlowPage = allowed.has(page) ? page : 'intro';'''
new_show_page = '''function ensureSetupPageInteractive(page = setupFlowPage) {
  const setup = $('#setupView');
  const flow = $('#setupFlow');
  const active = setupFlowPageElement(page);
  if (!setup || !flow || !active) return;

  closeSetupBlockingDialogs();
  try { setup.inert = false; flow.inert = false; active.inert = false; } catch {}
  setup.removeAttribute('inert');
  flow.removeAttribute('inert');
  active.removeAttribute('inert');

  setup.querySelectorAll('.setup-flow-page').forEach((screen) => {
    const selected = screen === active;
    screen.style.pointerEvents = selected ? 'auto' : 'none';
    screen.style.zIndex = selected ? '10' : '0';
    if (!selected) screen.setAttribute('inert', '');
    else screen.removeAttribute('inert');
  });

  // These legacy sections remain only so analytics-rendering code can update
  // their text safely. They must never participate in layout or hit testing.
  for (const selector of ['.hero', '.signal-card', '.recommendation-card']) {
    const element = setup.querySelector(selector);
    if (!element) continue;
    element.hidden = true;
    element.setAttribute('inert', '');
    element.style.display = 'none';
    element.style.pointerEvents = 'none';
  }

  active.querySelectorAll('button, input, select, label').forEach((control) => {
    control.style.pointerEvents = 'auto';
    control.removeAttribute('inert');
  });
}

function showSetupFlowPage(page = 'intro', { focus = true } = {}) {
  const allowed = new Set(['intro', 'challenge', 'coach']);
  setupFlowPage = allowed.has(page) ? page : 'intro';
  closeSetupBlockingDialogs();'''
part6 = replace_once(part6, old_show_page, new_show_page, 'interactive setup-page guard')

old_show_tail = '''  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if (focus) setupFlowPageElement(setupFlowPage)?.querySelector('button, select, input')?.focus?.({ preventScroll: true });
}'''
new_show_tail = '''  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  ensureSetupPageInteractive(setupFlowPage);
  window.requestAnimationFrame(() => ensureSetupPageInteractive(setupFlowPage));
  if (focus) setupFlowPageElement(setupFlowPage)?.querySelector('button, select, input')?.focus?.({ preventScroll: true });
}'''
part6 = replace_once(part6, old_show_tail, new_show_tail, 'setup-page interaction repair')

old_legacy_hide = '''  // Old scrolling setup shell and supplementary cards are no longer part of the visual flow.
  hero.hidden = true;
  setup.querySelector('.signal-card')?.classList.add('setup-supplement-hidden');
  setup.querySelector('.recommendation-card')?.classList.add('setup-supplement-hidden');'''
new_legacy_hide = '''  // Old scrolling setup shell and supplementary cards remain in the DOM only for
  // existing analytics writers. Remove them completely from layout and hit testing.
  hero.hidden = true;
  hero.setAttribute('inert', '');
  hero.style.display = 'none';
  hero.style.pointerEvents = 'none';
  for (const selector of ['.signal-card', '.recommendation-card']) {
    const element = setup.querySelector(selector);
    if (!element) continue;
    element.classList.add('setup-supplement-hidden');
    element.hidden = true;
    element.setAttribute('inert', '');
    element.style.display = 'none';
    element.style.pointerEvents = 'none';
  }'''
part6 = replace_once(part6, old_legacy_hide, new_legacy_hide, 'remove legacy setup hit targets')

old_paged_events = '''window.addEventListener('scroll', pinPagedSetupViewport, { passive: true });
window.visualViewport?.addEventListener?.('resize', pinPagedSetupViewport, { passive: true });'''
new_paged_events = '''window.addEventListener('scroll', pinPagedSetupViewport, { passive: true });
window.visualViewport?.addEventListener?.('resize', pinPagedSetupViewport, { passive: true });
window.addEventListener('pageshow', () => {
  if (!pagedSetupIsActive()) return;
  closeSetupBlockingDialogs();
  ensureSetupPageInteractive(setupFlowPage);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && pagedSetupIsActive()) ensureSetupPageInteractive(setupFlowPage);
});'''
part6 = replace_once(part6, old_paged_events, new_paged_events, 'BFCache and visibility repair')

# Expose useful state to tests and future troubleshooting.
part6 = replace_once(
    part6,
    "setupFlow: { page: setupFlowPage, paged: Boolean($('#setupView')?.dataset.pagedReady === '1') },",
    "setupFlow: { page: setupFlowPage, paged: Boolean($('#setupView')?.dataset.pagedReady === '1'), activeInert: Boolean(setupFlowPageElement(setupFlowPage)?.inert), openDialogs: $$('dialog[open]').map((dialog) => ({ id: dialog.id, modal: dialogIsModal(dialog) })) },",
    'setup interaction diagnostics',
)
write(part6_path, part6)


# ---------------------------------------------------------------------------
# CSS: remove the aggressive fixed-body hit-testing pattern, put the active page
# above all legacy siblings, and make the principle screen full-screen but nonmodal.
# ---------------------------------------------------------------------------
styles_path = ROOT / 'styles-v7.css'
styles = read(styles_path)
styles += r'''

/* K-Mate v42 — interactive setup recovery and nonmodal principle screen */
html.kmate-fixed-app body.paged-app:not(.game-mode){
  position:relative!important;
  inset:auto!important;
  width:100%!important;
  height:100dvh!important;
  min-height:0!important;
  overflow:hidden!important;
  touch-action:auto!important;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .shell{z-index:1!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) #setupView.paged-setup,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow{isolation:isolate!important;pointer-events:auto!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page{
  pointer-events:none!important;
  z-index:0!important;
  touch-action:auto!important;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active:not([hidden]){
  display:grid!important;
  pointer-events:auto!important;
  z-index:10!important;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page[hidden]{
  display:none!important;
  pointer-events:none!important;
  z-index:0!important;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active button,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active input,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active select,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active label{
  pointer-events:auto!important;
  touch-action:manipulation!important;
}
#setupView .hero[hidden],
#setupView .setup-supplement-hidden,
#setupView .signal-card[hidden],
#setupView .recommendation-card[hidden]{
  display:none!important;
  visibility:hidden!important;
  pointer-events:none!important;
}
dialog:not([open]){display:none!important;pointer-events:none!important}
#principlesDialog.nonmodal-app-screen[open]{
  display:block!important;
  position:fixed!important;
  inset:0!important;
  z-index:10000!important;
  pointer-events:auto!important;
  touch-action:auto!important;
}
#principlesDialog.nonmodal-app-screen[open]::backdrop{display:none!important;background:transparent!important}
#principlesDialog.nonmodal-app-screen[open] .modal-card,
#principlesDialog.nonmodal-app-screen[open] button{pointer-events:auto!important}
/* End K-Mate v42 */
'''
write(styles_path, styles)
