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
# Cache-bust every application resource.
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
# Gameplay start: use a bounded, known-valid curated position before invoking
# the normal game initializer. This makes the transition immediate and removes
# the unbounded generated-position tree from the final setup button path.
# ---------------------------------------------------------------------------
part1_path = ROOT / 'app-v7-part1.txt'
part1 = read(part1_path)
part1 = part1.replace("url.search = '?v=20260830-41';", "url.search = '?v=20260830-42';")

safe_marker = '''function gameViewActivated() {
  return Boolean(game && current && document.body.classList.contains('game-mode') && !$('#gameView')?.hidden && $('#board'));
}
'''
safe_addition = '''function immediateCuratedPosition() {
  let pool = validPositions.filter((position) => position.phase === settings.phase);
  if (settings.phase !== 'endgame' && settings.opening && settings.opening !== 'all') {
    const openingPool = pool.filter((position) => position.opening === settings.opening);
    if (openingPool.length) pool = openingPool;
  }
  if (!pool.length) pool = validPositions;
  const ordered = pool
    .filter((position) => safeChessFromFen(position.fen))
    .sort((first, second) =>
      Math.abs((Number(first.rating) || 1600) - settings.positionRating)
        - Math.abs((Number(second.rating) || 1600) - settings.positionRating));
  const shortlist = ordered.slice(0, Math.min(8, ordered.length));
  const seed = shortlist[randomInt(0, Math.max(0, shortlist.length - 1))] || ordered[0];
  if (!seed) throw new Error('No playable curated position is available');
  return {
    ...seed,
    id: `instant-${seed.id}-${Date.now()}`,
    seedId: seed.id,
    generated: false,
    variationPlies: 0,
    branchDepth: 0,
    description: `${seed.description} Opened from a validated curated seed for an immediate, reliable start.`,
  };
}

''' + safe_marker
part1 = replace_once(part1, safe_marker, safe_addition, 'immediate curated position helper')

old_first_start = '''  try {
    startPosition();
    if (!gameViewActivated()) throw new Error('The game view did not activate');
    finishGeneratePositionButton(button);
    return true;
  } catch (firstError) {'''
new_first_start = '''  try {
    queuedCustomPosition = immediateCuratedPosition();
    startPosition();
    if (!gameViewActivated()) throw new Error('The game view did not activate');
    finishGeneratePositionButton(button);
    return true;
  } catch (firstError) {'''
part1 = replace_once(part1, old_first_start, new_first_start, 'bounded first start')

fallback_pattern = re.compile(r'''function installGeneratePositionActivationFallback\(\) \{.*?\n\}\n\nfunction stopReviewPlayback''', re.S)
fallback_replacement = '''function installGeneratePositionActivationFallback() {
  const button = $('#startButton');
  if (!button) return;
  button.dataset.activationFallback = '1';
  button.onclick = handleGeneratePosition;
}

function stopReviewPlayback'''
part1, count = fallback_pattern.subn(fallback_replacement, part1, count=1)
if count != 1:
    raise SystemExit('Unable to simplify Generate position activation fallback')

part1 = part1.replace("  $('#startButton').addEventListener('click', handleGeneratePosition);", "  $('#startButton').onclick = handleGeneratePosition;")
write(part1_path, part1)


# ---------------------------------------------------------------------------
# Setup shell: inactive pages are truly removed from hit testing; obsolete
# website-layout nodes are removed from the DOM; no MutationObserver is allowed
# to fight the start button and starve pointer events on a slow/failed engine.
# ---------------------------------------------------------------------------
part6_path = ROOT / 'app-v7-part6.txt'
part6 = read(part6_path)
part6 = part6.replace("version: '41.0-commercial-beta'", "version: '42.0-commercial-beta'")

show_pattern = re.compile(r'''function showSetupFlowPage\(page = 'intro', \{ focus = true \} = \{\}\) \{.*?\n\}\n\nfunction makeSetupScreen''', re.S)
show_replacement = '''function showSetupFlowPage(page = 'intro', { focus = true } = {}) {
  const allowed = new Set(['intro', 'challenge', 'coach']);
  setupFlowPage = allowed.has(page) ? page : 'intro';

  // A setup page should never be covered by a leftover modal or game drawer.
  if (!document.body.classList.contains('game-mode')) {
    document.querySelectorAll('dialog[open]').forEach((dialog) => {
      try { dialog.close(); } catch { dialog.removeAttribute('open'); }
    });
    document.body.classList.remove('game-panel-open');
  }

  document.querySelectorAll('.setup-flow-page').forEach((screen) => {
    const active = screen.dataset.setupPage === setupFlowPage;
    screen.hidden = !active;
    screen.inert = !active;
    screen.toggleAttribute('inert', !active);
    screen.classList.toggle('active', active);
    screen.setAttribute('aria-hidden', String(!active));
    screen.style.display = active ? 'grid' : 'none';
    screen.style.visibility = active ? 'visible' : 'hidden';
    screen.style.pointerEvents = active ? 'auto' : 'none';
    screen.style.zIndex = active ? '20' : '-1';
  });
  document.querySelectorAll('[data-setup-step]').forEach((dot) => {
    dot.classList.toggle('active', dot.dataset.setupStep === setupFlowPage);
  });
  document.body.dataset.setupPage = setupFlowPage;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

  if (setupFlowPage === 'coach') {
    setGeneratePositionButtonReady();
    installGeneratePositionActivationFallback();
  }
  if (focus) setupFlowPageElement(setupFlowPage)?.querySelector('button, select, input')?.focus?.({ preventScroll: true });
}

function makeSetupScreen'''
part6, count = show_pattern.subn(show_replacement, part6, count=1)
if count != 1:
    raise SystemExit('Unable to replace setup page visibility function')

old_obsolete = '''  // Old scrolling setup shell and supplementary cards are no longer part of the visual flow.
  hero.hidden = true;
  setup.querySelector('.signal-card')?.classList.add('setup-supplement-hidden');
  setup.querySelector('.recommendation-card')?.classList.add('setup-supplement-hidden');'''
new_obsolete = '''  // The original website layout is now empty. Remove it rather than merely
  // hiding it, because older CSS could leave a transparent hit-testing layer.
  hero.remove();
  setup.querySelector('.signal-card')?.remove();
  setup.querySelector('.recommendation-card')?.remove();'''
part6 = replace_once(part6, old_obsolete, new_obsolete, 'remove obsolete setup overlay nodes')

interaction_guard = '''
function installSetupInteractionGuard() {
  const flow = $('#setupFlow');
  if (!flow || flow.dataset.interactionGuard === '1') return;
  flow.dataset.interactionGuard = '1';
  flow.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !flow.contains(button)) return;
    if (button.id === 'introProceedButton') {
      event.preventDefault(); event.stopPropagation(); showSetupFlowPage('challenge');
    } else if (button.id === 'challengeBackButton') {
      event.preventDefault(); event.stopPropagation(); showSetupFlowPage('intro');
    } else if (button.id === 'challengeNextButton') {
      event.preventDefault(); event.stopPropagation(); showSetupFlowPage('coach');
    } else if (button.id === 'coachBackButton') {
      event.preventDefault(); event.stopPropagation(); showSetupFlowPage('challenge');
    } else if (button.id === 'startButton') {
      event.preventDefault(); event.stopPropagation(); handleGeneratePosition(event);
    }
  }, true);
}

'''
reset_marker = "function resetSetupFlowForNavigation(page = 'intro') {"
part6 = replace_once(part6, reset_marker, interaction_guard + reset_marker, 'setup capture interaction guard')

observer_pattern = re.compile(r'''setGeneratePositionButtonReady\(\);\nconst generatePositionButton = \$\('#startButton'\);\nif \(generatePositionButton\) \{\n  const keepGeneratePositionReady = new MutationObserver\(\(\) => \{.*?\n\}\nstockfishEngine\?\.ready\?\.then\(setGeneratePositionButtonReady\)''', re.S)
observer_replacement = '''setGeneratePositionButtonReady();
installGeneratePositionActivationFallback();
installSetupInteractionGuard();
stockfishEngine?.ready?.then(setGeneratePositionButtonReady)'''
part6, count = observer_pattern.subn(observer_replacement, part6, count=1)
if count != 1:
    raise SystemExit('Unable to remove start-button MutationObserver')

write(part6_path, part6)


# ---------------------------------------------------------------------------
# CSS: make it impossible for an inactive page, old hero, pseudo-element, or
# backdrop to intercept clicks on the coaching screen.
# ---------------------------------------------------------------------------
styles_path = ROOT / 'styles-v7.css'
styles = read(styles_path)
styles += r'''

/* K-Mate v42 — frozen coaching-screen repair */
html.kmate-fixed-app body.paged-app:not(.game-mode) #setupView,
html.kmate-fixed-app body.paged-app:not(.game-mode) #setupFlow,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active{
  pointer-events:auto!important;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page[hidden],
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page:not(.active){
  display:none!important;
  visibility:hidden!important;
  pointer-events:none!important;
  z-index:-1!important;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active{
  display:grid!important;
  visibility:visible!important;
  pointer-events:auto!important;
  z-index:20!important;
  isolation:isolate;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active .setup-screen-header,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active .setup-screen-content,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active .setup-screen-footer,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active .setup-step-card,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active button,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active label,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active input,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active select{
  position:relative;
  pointer-events:auto!important;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-footer{z-index:60!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow::before,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow::after,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page::before,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page::after,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-step-card::before,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-step-card::after,
html.kmate-fixed-app body.paged-app:not(.game-mode)::before,
html.kmate-fixed-app body.paged-app:not(.game-mode)::after{
  pointer-events:none!important;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .hero[hidden],
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-supplement-hidden,
html.kmate-fixed-app body.paged-app:not(.game-mode) .game-panel-backdrop{
  display:none!important;
  pointer-events:none!important;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle,
html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid .coach-audio-check,
html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid .sound-style-field,
html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid label{
  cursor:pointer;
  touch-action:manipulation;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-footer button,
html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid input,
html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid select{
  touch-action:manipulation;
}
/* End K-Mate v42 */
'''
write(styles_path, styles)


# ---------------------------------------------------------------------------
# New path outside the old app page path, so an older browser/PWA document cache
# cannot serve a mixed setup shell. The base tag still loads current app assets.
# ---------------------------------------------------------------------------
fresh_dir = Path('kmate-v42')
fresh_dir.mkdir(exist_ok=True)
fresh_html = read(index_path)
fresh_html = fresh_html.replace('<head>', '<head>\n  <base href="../kmate-trainer/">\n  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate">\n  <meta http-equiv="Pragma" content="no-cache">', 1)
write(fresh_dir / 'index.html', fresh_html)
