from pathlib import Path
import re

ROOT = Path('kmate-trainer')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing marker: {label}')
    return text.replace(old, new, 1)

# Update cache versions and simplify generated setup titles.
index_path = ROOT / 'index.html'
index = index_path.read_text()
index = re.sub(r'styles-v7\.css\?v=\d+\.\d+\.\d+', 'styles-v7.css?v=39.0.0', index)
index = re.sub(r'app-v7\.js\?v=\d+\.\d+\.\d+', 'app-v7.js?v=39.0.0', index)
index = replace_once(
    index,
    '<h2 id="principlesPositionTitle">Principles for this position</h2>',
    '<h2 id="principlesPositionTitle">Before you play: 5 key principles</h2>',
    'principles dialog title',
)
index = replace_once(
    index,
    '<p id="principlesPositionSubtitle">Review the ideas that are most relevant to the board in front of you.</p>',
    '<p id="principlesPositionSubtitle">Five quick reminders for this exact position.</p>',
    'principles dialog subtitle',
)
index_path.write_text(index)

part6_path = ROOT / 'app-v7-part6.txt'
part6 = part6_path.read_text()
part6 = part6.replace("version: '38.0-commercial-beta'", "version: '39.0-commercial-beta'")
part6 = replace_once(
    part6,
    "const challengePage = makeSetupScreen('challenge', 'Step 1 of 2', 'Choose the position and opponent.', 'Set the chess challenge. Your coaching preferences come next.');",
    "const challengePage = makeSetupScreen('challenge', 'Step 1 of 2', 'Set your chess challenge', 'Phase · opening · ratings · clock');",
    'challenge title',
)
part6 = replace_once(
    part6,
    "const coachPage = makeSetupScreen('coach', 'Step 2 of 2', 'Choose how K-Mate coaches you.', 'Decide when the coach intervenes, whether it speaks, and how the board should sound.');",
    "const coachPage = makeSetupScreen('coach', 'Step 2 of 2', 'Choose your coaching', 'Hints · principles · Live Coach · sound');",
    'coach title',
)

# Hide the advanced beta/import controls from the normal setup path. They remain
# in the DOM and can be restored later in a Settings screen without consuming
# the primary onboarding viewport.
part6 = replace_once(
    part6,
    "betaTools.classList.add('compact-beta-tools');\n    coachingGrid.append(betaTools);",
    "betaTools.classList.add('compact-beta-tools', 'setup-advanced-hidden');\n    coachingGrid.append(betaTools);",
    'advanced tools cleanup',
)

# Compact the principles review into five one-line reminders. This observer runs
# after the existing position-specific principle renderer populates the list.
observer_code = r'''
function renderCompactPrincipleReview() {
  const list = $('#principlesList');
  if (!list || !principleReviewPending || list.dataset.compacting === '1') return;
  const principles = currentPositionPrinciples.slice(0, 5);
  if (!principles.length) return;
  list.dataset.compacting = '1';
  const fragment = document.createDocumentFragment();
  principles.forEach((principle, index) => {
    const row = document.createElement('article');
    row.className = 'principle-compact-row';
    const number = document.createElement('span');
    number.className = 'principle-compact-number';
    number.textContent = String(index + 1);
    const title = document.createElement('b');
    title.textContent = principle.title;
    row.append(number, title);
    fragment.append(row);
  });
  list.replaceChildren(fragment);
  list.dataset.compacting = '0';
  const title = $('#principlesPositionTitle');
  if (title) title.textContent = `${principles.length} key principles for this position`;
  const subtitle = $('#principlesPositionSubtitle');
  if (subtitle) subtitle.textContent = 'Keep these in mind, then calculate the concrete position.';
}

function initializeCompactPrincipleReview() {
  const list = $('#principlesList');
  if (!list || list.dataset.compactObserver === '1') return;
  list.dataset.compactObserver = '1';
  const observer = new MutationObserver(() => {
    if (list.dataset.compacting === '1') return;
    queueMicrotask(renderCompactPrincipleReview);
  });
  observer.observe(list, { childList: true, subtree: true });
  $('#principlesDialog')?.addEventListener('transitionend', renderCompactPrincipleReview);
}

'''
part6 = replace_once(part6, "let setupFlowPage = 'intro';\n", observer_code + "let setupFlowPage = 'intro';\n", 'compact principle functions')
part6 = replace_once(
    part6,
    "initializePagedSetup();\napplySettingsToControls();",
    "initializePagedSetup();\ninitializeCompactPrincipleReview();\napplySettingsToControls();",
    'compact principle init',
)
part6_path.write_text(part6)

loader_path = ROOT / 'app-v7.js'
loader = loader_path.read_text()
loader = re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=39.0.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=39.0.0', loader)
loader_path.write_text(loader)

styles_path = ROOT / 'styles-v7.css'
styles = styles_path.read_text()
styles += r'''

/* K-Mate v39 — clearer setup headers + fixed one-screen principle review */
.setup-advanced-hidden{display:none!important}

/* Setup header: prioritize the page title over decorative branding. */
body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="challenge"] .setup-screen-header,
body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="coach"] .setup-screen-header{
  grid-template-columns:minmax(0,1fr) auto!important;
  grid-template-areas:'copy progress'!important;
  min-height:76px!important;
  max-height:76px!important;
  padding:5px 2px 8px!important;
  overflow:visible!important;
}
body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="challenge"] .setup-screen-brand,
body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="coach"] .setup-screen-brand{display:none!important}
body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="challenge"] .setup-screen-copy,
body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="coach"] .setup-screen-copy{align-self:center;overflow:visible!important}
body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="challenge"] .setup-screen-copy h1,
body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="coach"] .setup-screen-copy h1{
  display:block!important;margin:0!important;font-size:clamp(27px,3vw,38px)!important;line-height:1.05!important;
  font-weight:950!important;letter-spacing:-.035em!important;white-space:normal!important;overflow:visible!important;
}
body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="challenge"] .setup-screen-copy p,
body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="coach"] .setup-screen-copy p{
  display:block!important;margin:5px 0 0!important;font-size:12px!important;line-height:1.1!important;color:#aebbb2!important;
  white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;
}

/* Use available height for decisions instead of explanations. */
body.paged-app:not(.game-mode) .challenge-fields-grid .sub{display:none!important}
body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle small{
  display:block!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;
  -webkit-line-clamp:unset!important;font-size:9.5px!important;line-height:1.1!important;margin-top:3px!important;
}
body.paged-app:not(.game-mode) .coaching-fields-grid{
  grid-template-rows:repeat(3,minmax(0,1fr))!important;
}
body.paged-app:not(.game-mode) .coaching-fields-grid .sound-style-field{grid-column:1/-1!important}
body.paged-app:not(.game-mode) .coaching-fields-grid .coach-audio-check{min-height:0!important}
body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle b{font-size:15px!important}
body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle{padding:10px 12px!important}

/* Pregame principles are a real app screen, not a scrolling dialog. */
#principlesDialog[open]{
  position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;
  margin:0!important;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))!important;
  overflow:hidden!important;border:0!important;background:radial-gradient(circle at 80% 10%,#b9f4741c,transparent 26rem),#080e0a!important;
}
#principlesDialog::backdrop{background:#050806!important}
#principlesDialog .modal-card{
  width:min(860px,100%)!important;height:100%!important;max-width:860px!important;max-height:100%!important;margin:0 auto!important;
  padding:clamp(16px,2.4vh,26px)!important;border-radius:22px!important;overflow:hidden!important;
  display:grid!important;grid-template-rows:auto auto minmax(0,1fr) auto!important;gap:10px!important;
  background:linear-gradient(150deg,#142018,#0c130e)!important;border:1px solid #ffffff16!important;
}
#principlesDialog .eyebrow{font-size:11px!important;letter-spacing:.12em!important}
#principlesDialog #principlesPositionTitle{margin:0!important;font-size:clamp(29px,4vw,45px)!important;line-height:1.03!important;font-weight:950!important;letter-spacing:-.035em!important}
#principlesDialog #principlesPositionSubtitle{margin:4px 0 0!important;font-size:13px!important;line-height:1.2!important;color:#aebbb2!important}
#principlesDialog .principles-note{display:none!important}
#principlesDialog .principles-list{
  display:grid!important;grid-template-rows:repeat(5,minmax(0,1fr))!important;gap:9px!important;min-height:0!important;max-height:none!important;
  margin:4px 0!important;padding:0!important;overflow:hidden!important;
}
#principlesDialog .principle-compact-row{
  display:grid!important;grid-template-columns:42px minmax(0,1fr)!important;align-items:center!important;gap:13px!important;min-height:0!important;
  padding:8px 14px!important;border:1px solid #ffffff12!important;border-radius:14px!important;background:linear-gradient(145deg,#ffffff07,#ffffff025)!important;
}
#principlesDialog .principle-compact-number{
  display:grid!important;place-items:center!important;width:34px!important;height:34px!important;border-radius:10px!important;background:#b9f474!important;color:#12200f!important;
  font-size:16px!important;font-weight:950!important;
}
#principlesDialog .principle-compact-row b{font-size:clamp(16px,2vw,21px)!important;line-height:1.12!important;font-weight:900!important;color:#f4f7f2!important}
#principlesDialog .dialogactions{display:grid!important;grid-template-columns:auto minmax(220px,1fr)!important;gap:10px!important;margin:0!important;padding-top:2px!important}
#principlesDialog .dialogactions .btn{min-height:50px!important;font-size:14px!important;font-weight:900!important}

@media(max-width:760px){
  body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="challenge"] .setup-screen-header,
  body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="coach"] .setup-screen-header{
    min-height:66px!important;max-height:66px!important;padding:3px 1px 5px!important;
  }
  body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="challenge"] .setup-screen-copy h1,
  body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="coach"] .setup-screen-copy h1{font-size:25px!important;line-height:1!important}
  body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="challenge"] .setup-screen-copy p,
  body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="coach"] .setup-screen-copy p{font-size:9.5px!important;margin-top:4px!important}
  body.paged-app:not(.game-mode) .setup-progress i{width:17px!important}.setup-progress i.active{width:27px!important}
  body.paged-app:not(.game-mode) .coaching-fields-grid{gap:5px!important}
  body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle{padding:6px 7px!important}
  body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle b{font-size:11px!important}
  body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle small{font-size:7.5px!important;margin-top:2px!important}

  #principlesDialog[open]{padding:max(7px,env(safe-area-inset-top)) 7px max(7px,env(safe-area-inset-bottom))!important}
  #principlesDialog .modal-card{padding:12px 10px!important;border-radius:16px!important;gap:6px!important}
  #principlesDialog .eyebrow{font-size:8px!important}
  #principlesDialog #principlesPositionTitle{font-size:27px!important;line-height:1!important}
  #principlesDialog #principlesPositionSubtitle{font-size:10px!important;margin-top:3px!important}
  #principlesDialog .principles-list{gap:5px!important;margin:2px 0!important}
  #principlesDialog .principle-compact-row{grid-template-columns:32px minmax(0,1fr)!important;gap:8px!important;padding:5px 8px!important;border-radius:10px!important}
  #principlesDialog .principle-compact-number{width:27px!important;height:27px!important;border-radius:8px!important;font-size:12px!important}
  #principlesDialog .principle-compact-row b{font-size:14px!important;line-height:1.08!important}
  #principlesDialog .dialogactions{grid-template-columns:110px minmax(0,1fr)!important;gap:6px!important}
  #principlesDialog .dialogactions .btn{min-height:43px!important;padding:0 8px!important;font-size:11px!important}
}

@media(max-height:700px){
  #principlesDialog .modal-card{padding:10px!important;gap:4px!important}
  #principlesDialog #principlesPositionTitle{font-size:24px!important}
  #principlesDialog #principlesPositionSubtitle{display:none!important}
  #principlesDialog .principles-list{gap:4px!important}
  #principlesDialog .principle-compact-row{padding:4px 8px!important}
  #principlesDialog .dialogactions .btn{min-height:40px!important}
}
/* End K-Mate v39 */
'''
styles_path.write_text(styles)
