from pathlib import Path
import re

ROOT = Path('kmate-trainer')

def read(path): return path.read_text()
def write(path, text): path.write_text(text)
def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing marker: {label}')
    return text.replace(old, new, 1)

# Cache busting.
index_path = ROOT / 'index.html'
index = read(index_path)
index = re.sub(r'styles-v7\.css\?v=\d+\.\d+\.\d+', 'styles-v7.css?v=36.0.0', index)
index = re.sub(r'app-v7\.js\?v=\d+\.\d+\.\d+', 'app-v7.js?v=36.0.0', index)
write(index_path, index)

loader_path = ROOT / 'app-v7.js'
loader = read(loader_path)
loader = re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=36.0.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=36.0.0', loader)
write(loader_path, loader)

# Runtime paged setup shell.
part6_path = ROOT / 'app-v7-part6.txt'
part6 = read(part6_path)
part6 = part6.replace("version: '35.0-commercial-beta'", "version: '36.0-commercial-beta'")

init_marker = "populateOpenings();\npopulateSoundProfiles();"
flow_code = r'''
let setupFlowPage = 'intro';

function setupFlowPageElement(page) {
  return document.querySelector(`.setup-flow-page[data-setup-page="${page}"]`);
}

function showSetupFlowPage(page = 'intro', { focus = true } = {}) {
  const allowed = new Set(['intro', 'challenge', 'coach']);
  setupFlowPage = allowed.has(page) ? page : 'intro';
  document.querySelectorAll('.setup-flow-page').forEach((screen) => {
    const active = screen.dataset.setupPage === setupFlowPage;
    screen.hidden = !active;
    screen.classList.toggle('active', active);
    screen.setAttribute('aria-hidden', String(!active));
  });
  document.querySelectorAll('[data-setup-step]').forEach((dot) => {
    dot.classList.toggle('active', dot.dataset.setupStep === setupFlowPage);
  });
  document.body.dataset.setupPage = setupFlowPage;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if (focus) setupFlowPageElement(setupFlowPage)?.querySelector('button, select, input')?.focus?.({ preventScroll: true });
}

function makeSetupScreen(page, stepLabel, title, subtitle) {
  const section = document.createElement('section');
  section.className = 'setup-flow-page';
  section.dataset.setupPage = page;
  section.hidden = true;
  section.innerHTML = `
    <header class="setup-screen-header">
      <div class="setup-screen-brand"><span class="brandmark">♞</span><span><b>K-Mate</b><small>${stepLabel}</small></span></div>
      <div class="setup-progress" aria-label="Setup progress">
        <i data-setup-step="intro"></i><i data-setup-step="challenge"></i><i data-setup-step="coach"></i>
      </div>
      <div class="setup-screen-copy"><h1>${title}</h1><p>${subtitle}</p></div>
    </header>
    <div class="setup-screen-content"></div>
    <footer class="setup-screen-footer"></footer>
  `;
  return section;
}

function initializePagedSetup() {
  const setup = $('#setupView');
  const hero = setup?.querySelector('.hero');
  const intro = hero?.querySelector('.intro');
  const setupCard = hero?.querySelector('.setup-card');
  if (!setup || !hero || !intro || !setupCard || setup.dataset.pagedReady === '1') return;
  setup.dataset.pagedReady = '1';
  setup.classList.add('paged-setup');
  document.body.classList.add('paged-app');

  const flow = document.createElement('div');
  flow.className = 'setup-flow';
  flow.id = 'setupFlow';

  const introPage = makeSetupScreen('intro', 'Train positions, not openings', 'Get better at the part of chess that decides games.', 'Choose a real middlegame or endgame, play it under pressure, and get precise coaching only when it matters.');
  const challengePage = makeSetupScreen('challenge', 'Step 1 of 2', 'Choose the position and opponent.', 'Set the chess challenge. Your coaching preferences come next.');
  const coachPage = makeSetupScreen('coach', 'Step 2 of 2', 'Choose how K-Mate coaches you.', 'Decide when the coach intervenes, whether it speaks, and how the board should sound.');

  flow.append(introPage, challengePage, coachPage);
  setup.prepend(flow);

  // Intro: reuse the product story and personal summary, but make it a true welcome screen.
  intro.classList.add('welcome-card');
  introPage.querySelector('.setup-screen-content').append(intro);
  const introFooter = introPage.querySelector('.setup-screen-footer');
  introFooter.innerHTML = `
    <button class="btn subtle app-flow-secondary" id="introInsightsButton" type="button">View insights</button>
    <button class="btn primary app-flow-primary" id="introProceedButton" type="button">Let's get into it →</button>
  `;

  // Build two compact setup cards and move the existing controls rather than cloning them.
  const challengeCard = document.createElement('article');
  challengeCard.className = 'card setup-step-card challenge-step-card';
  const challengeGrid = document.createElement('div');
  challengeGrid.className = 'setup-fields-grid challenge-fields-grid';
  challengeCard.append(challengeGrid);
  challengePage.querySelector('.setup-screen-content').append(challengeCard);

  const coachingCard = document.createElement('article');
  coachingCard.className = 'card setup-step-card coaching-step-card';
  const coachingGrid = document.createElement('div');
  coachingGrid.className = 'setup-fields-grid coaching-fields-grid';
  coachingCard.append(coachingGrid);
  coachPage.querySelector('.setup-screen-content').append(coachingCard);

  const challengeSelectors = [
    '#phaseSeg', '#openingField', '#goalField', '#positionRating', '#opponentRating', '#timeControlGrid', '#sideSeg'
  ];
  const challengeNodes = [];
  for (const selector of challengeSelectors) {
    const element = setupCard.querySelector(selector);
    const field = element?.closest('.field') || element?.closest('.seg')?.closest('.field');
    if (field && !challengeNodes.includes(field)) challengeNodes.push(field);
  }
  challengeNodes.forEach((node) => challengeGrid.append(node));

  const coachingSelectors = ['#blindCalibration', '#autoHints', '#principleReview', '#liveCoach', '#liveCoachVoice'];
  const coachingNodes = [];
  coachingSelectors.forEach((selector) => {
    const node = setupCard.querySelector(selector)?.closest('.calibration-toggle');
    if (node && !coachingNodes.includes(node)) coachingNodes.push(node);
  });
  coachingNodes.forEach((node) => coachingGrid.append(node));
  const audioCheck = setupCard.querySelector('#coachAudioCheck');
  const soundField = setupCard.querySelector('#soundStyleField');
  if (audioCheck) coachingGrid.append(audioCheck);
  if (soundField) coachingGrid.append(soundField);

  // Keep advanced/import tools available without using page height for them.
  const betaTools = setupCard.querySelector('.beta-tools');
  if (betaTools) {
    betaTools.classList.add('compact-beta-tools');
    coachingGrid.append(betaTools);
  }
  const loadError = setupCard.querySelector('#loadError');
  if (loadError) coachingGrid.append(loadError);

  // Presets and long explanatory copy no longer consume setup-screen space.
  setupCard.querySelector('.quick-presets')?.remove();
  setupCard.querySelector('.fineprint')?.classList.add('setup-fineprint-hidden');
  const oldStart = setupCard.querySelector('#startButton');
  if (oldStart) coachPage.querySelector('.setup-screen-footer').append(oldStart);

  challengePage.querySelector('.setup-screen-footer').innerHTML = `
    <button class="btn app-flow-secondary" id="challengeBackButton" type="button">← Back</button>
    <button class="btn primary app-flow-primary" id="challengeNextButton" type="button">Coaching setup →</button>
  `;
  const coachFooter = coachPage.querySelector('.setup-screen-footer');
  const back = document.createElement('button');
  back.className = 'btn app-flow-secondary';
  back.id = 'coachBackButton';
  back.type = 'button';
  back.textContent = '← Challenge';
  coachFooter.prepend(back);

  // Old scrolling setup shell and supplementary cards are no longer part of the visual flow.
  hero.hidden = true;
  setup.querySelector('.signal-card')?.classList.add('setup-supplement-hidden');
  setup.querySelector('.recommendation-card')?.classList.add('setup-supplement-hidden');

  $('#introProceedButton')?.addEventListener('click', () => showSetupFlowPage('challenge'));
  $('#introInsightsButton')?.addEventListener('click', () => showView('insights'));
  $('#challengeBackButton')?.addEventListener('click', () => showSetupFlowPage('intro'));
  $('#challengeNextButton')?.addEventListener('click', () => showSetupFlowPage('coach'));
  $('#coachBackButton')?.addEventListener('click', () => showSetupFlowPage('challenge'));

  showSetupFlowPage('intro', { focus: false });
}

function resetSetupFlowForNavigation(page = 'intro') {
  if ($('#setupView')?.dataset.pagedReady === '1') showSetupFlowPage(page, { focus: false });
}

'''
part6 = rep(part6, init_marker, flow_code + init_marker, 'insert paged setup runtime')
part6 = rep(part6, "populateOpenings();\npopulateSoundProfiles();\napplySettingsToControls();", "populateOpenings();\npopulateSoundProfiles();\ninitializePagedSetup();\napplySettingsToControls();", 'initialize paged setup')

# Expose flow state for testing.
part6 = part6.replace(
    "layout: { gameMode: document.body.classList.contains('game-mode'), focusMode:",
    "setupFlow: { page: setupFlowPage, paged: Boolean($('#setupView')?.dataset.pagedReady === '1') },\n    layout: { gameMode: document.body.classList.contains('game-mode'), focusMode:",
    1,
)
write(part6_path, part6)

# Make showView('setup') return to the app landing page instead of a long document.
part1_path = ROOT / 'app-v7-part1.txt'
part1 = read(part1_path)
old = """  if (view === 'insights') renderInsights();
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  syncGameViewportLayout();"""
new = """  if (view === 'insights') renderInsights();
  if (view === 'setup' && typeof resetSetupFlowForNavigation === 'function') resetSetupFlowForNavigation('intro');
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  syncGameViewportLayout();"""
part1 = rep(part1, old, new, 'setup landing navigation')
write(part1_path, part1)

# Full-screen paged UI styles.
styles_path = ROOT / 'styles-v7.css'
styles = read(styles_path)
styles += r'''

/* K-Mate v36 — app-style paged onboarding and setup; no document scrolling */
html:has(body.paged-app),body.paged-app{height:100%;min-height:100%;overflow:hidden;overscroll-behavior:none}
body.paged-app:not(.game-mode) .shell{height:calc(100dvh - 64px);min-height:0;margin:0 auto;overflow:hidden}
body.paged-app #setupView.paged-setup{height:100%;min-height:0;padding:0;overflow:hidden}
body.paged-app #setupView.paged-setup[hidden]{display:none!important}
.setup-flow{width:100%;height:100%;min-height:0;overflow:hidden}
.setup-flow-page{display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:100%;height:100%;min-height:0;padding:clamp(12px,2vh,20px) clamp(14px,2.4vw,28px);overflow:hidden}
.setup-flow-page[hidden]{display:none!important}
.setup-screen-header{display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:'brand copy progress';align-items:center;gap:18px;min-height:70px;padding-bottom:10px}
.setup-screen-brand{grid-area:brand;display:flex;align-items:center;gap:9px;min-width:130px}
.setup-screen-brand .brandmark{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:linear-gradient(145deg,#d7ff84,#89d957);color:#12200f;font-size:23px;box-shadow:0 8px 24px #92dd5840}
.setup-screen-brand span:last-child{display:flex;flex-direction:column}.setup-screen-brand b{font-size:16px}.setup-screen-brand small{font-size:9px;color:var(--muted)}
.setup-screen-copy{grid-area:copy;min-width:0}.setup-screen-copy h1{margin:0;font-size:clamp(21px,2.25vw,31px);line-height:1.05}.setup-screen-copy p{margin:4px 0 0;max-width:680px;color:var(--muted);font-size:11px;line-height:1.35}
.setup-progress{grid-area:progress;display:flex;gap:5px;align-items:center;justify-content:flex-end}.setup-progress i{display:block;width:23px;height:5px;border-radius:99px;background:#ffffff19;transition:.18s ease}.setup-progress i.active{width:34px;background:var(--accent);box-shadow:0 0 14px #b9f47445}
.setup-screen-content{display:grid;place-items:stretch;min-height:0;overflow:hidden}
.setup-screen-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:58px;padding-top:9px;border-top:1px solid #ffffff0e}
.setup-screen-footer .btn{min-width:150px}.setup-screen-footer .app-flow-primary{margin-left:auto}
.setup-step-card{height:100%;min-height:0;padding:clamp(11px,1.5vh,17px);overflow:hidden;border-radius:20px}
.setup-fields-grid{display:grid;height:100%;min-height:0;gap:8px}
.challenge-fields-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr))}
.challenge-fields-grid .field{min-width:0;min-height:0;margin:0;padding:8px 10px;border:1px solid #ffffff0d;border-radius:12px;background:#ffffff03;overflow:hidden}
.challenge-fields-grid .field:first-child{grid-column:1/-1}
.challenge-fields-grid .fieldhead{margin-bottom:5px}.challenge-fields-grid label{font-size:10px}.challenge-fields-grid .value{font-size:10px}
.challenge-fields-grid .sub{display:block;margin-top:4px;font-size:8.5px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.challenge-fields-grid .phase-seg button,.challenge-fields-grid .side-seg button{min-height:38px;padding:5px 7px}.challenge-fields-grid .phase-seg button small{display:none}
.challenge-fields-grid .time-grid{grid-template-columns:repeat(6,minmax(0,1fr));gap:4px}.challenge-fields-grid .time-grid button{min-height:40px;padding:4px}.challenge-fields-grid .time-grid small{display:none}
.challenge-fields-grid .select{min-height:37px;padding:0 10px;font-size:11px}.challenge-fields-grid .rangeRow{gap:7px}.challenge-fields-grid .step{width:31px;height:31px}.challenge-fields-grid .range{height:26px}
.coaching-fields-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr))}
.coaching-fields-grid .calibration-toggle{min-height:0;margin:0;padding:9px 10px;border-radius:12px}.coaching-fields-grid .calibration-toggle b{font-size:10px}.coaching-fields-grid .calibration-toggle small{margin-top:2px;font-size:8px;line-height:1.18;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.coaching-fields-grid .coach-audio-check,.coaching-fields-grid .sound-style-field,.coaching-fields-grid .compact-beta-tools{margin:0;padding:8px 10px;border:1px solid #ffffff0d;border-radius:12px;background:#ffffff03;min-height:0;overflow:hidden}
.coaching-fields-grid .coach-audio-check{display:flex;align-items:center;gap:8px}.coaching-fields-grid .coach-audio-check span{font-size:8.5px;line-height:1.2}
.coaching-fields-grid .sound-style-field{grid-column:1/-1}.coaching-fields-grid .sound-style-field .sub{display:none}.coaching-fields-grid .sound-style-head{margin-bottom:4px}.coaching-fields-grid .select{min-height:34px;font-size:10px}
.coaching-fields-grid .compact-beta-tools{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.coaching-fields-grid .compact-beta-tools button{min-height:34px;padding:4px 7px}.coaching-fields-grid .compact-beta-tools button b{font-size:9px}.coaching-fields-grid .compact-beta-tools button small{display:none}
.setup-fineprint-hidden,.setup-supplement-hidden{display:none!important}
.setup-screen-footer #startButton{margin-left:auto;min-width:210px}
.welcome-card{align-self:center;justify-self:center;width:min(980px,100%);height:auto;max-height:100%;padding:clamp(20px,3vw,42px);overflow:hidden}
.welcome-card h1{font-size:clamp(30px,4.3vw,60px);max-width:900px;line-height:.98}.welcome-card>p{max-width:800px;font-size:clamp(12px,1.25vw,16px);line-height:1.5}.welcome-card .featureline{margin-top:18px}.welcome-card .summary-grid{margin-top:22px}

@media(max-width:760px){
  body.paged-app:not(.game-mode) .appbar{height:52px;padding:5px 8px}.appbar .brandtext small,.appbar .topbadge,.appbar .share-app-button b{display:none}.appbar .brand{min-width:0}.appbar .header-actions{gap:4px}
  body.paged-app:not(.game-mode) .shell{height:calc(100dvh - 52px)}
  .setup-flow-page{padding:7px 7px 5px}
  .setup-screen-header{grid-template-columns:auto 1fr;grid-template-areas:'brand progress' 'copy copy';gap:4px 8px;min-height:77px;padding-bottom:5px}.setup-screen-brand{min-width:0}.setup-screen-brand .brandmark{width:30px;height:30px;font-size:19px}.setup-screen-brand b{font-size:13px}.setup-screen-brand small{font-size:7px}.setup-progress i{width:16px;height:4px}.setup-progress i.active{width:24px}.setup-screen-copy h1{font-size:18px}.setup-screen-copy p{margin-top:2px;font-size:8.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .setup-screen-footer{min-height:48px;padding-top:5px}.setup-screen-footer .btn{min-width:0;min-height:38px;padding:0 12px;font-size:10px}.setup-screen-footer #startButton{min-width:0;flex:1}
  .setup-step-card{padding:6px;border-radius:14px}.setup-fields-grid{gap:5px}
  .challenge-fields-grid{grid-template-columns:1fr 1fr;grid-template-rows:1.08fr 1fr 1fr 1fr}.challenge-fields-grid .field{padding:5px 6px;border-radius:9px}.challenge-fields-grid .field:first-child{grid-column:1/-1}.challenge-fields-grid .fieldhead{margin-bottom:2px}.challenge-fields-grid label,.challenge-fields-grid .value{font-size:8px}.challenge-fields-grid .sub{display:none}.challenge-fields-grid .phase-seg{gap:3px}.challenge-fields-grid .phase-seg button{min-height:31px;padding:3px;font-size:8px}.challenge-fields-grid .select{min-height:30px;font-size:9px;padding:0 6px}.challenge-fields-grid .rangeRow{gap:3px}.challenge-fields-grid .step{width:25px;height:25px}.challenge-fields-grid .range{height:22px}.challenge-fields-grid .time-grid{grid-template-columns:repeat(3,1fr);gap:2px}.challenge-fields-grid .time-grid button{min-height:27px;font-size:8px}.challenge-fields-grid .side-seg button{min-height:29px;font-size:8px}
  .coaching-fields-grid{grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,minmax(0,1fr));gap:5px}.coaching-fields-grid .calibration-toggle{padding:5px 6px;border-radius:9px}.coaching-fields-grid .calibration-toggle b{font-size:8.5px}.coaching-fields-grid .calibration-toggle small{font-size:7px;-webkit-line-clamp:2}.coaching-fields-grid .coach-audio-check,.coaching-fields-grid .sound-style-field,.coaching-fields-grid .compact-beta-tools{padding:5px 6px;border-radius:9px}.coaching-fields-grid .coach-audio-check span{display:none}.coaching-fields-grid .coach-audio-test{width:100%;min-height:29px}.coaching-fields-grid .sound-style-field{grid-column:1/-1}.coaching-fields-grid .sound-style-head label{font-size:8px}.coaching-fields-grid .sound-preview-actions .sound-preview{min-width:48px;height:25px;font-size:7px}.coaching-fields-grid .select{min-height:29px;font-size:8px}.coaching-fields-grid .compact-beta-tools{grid-column:1/-1;gap:3px}.coaching-fields-grid .compact-beta-tools button{min-height:27px;padding:2px 4px}.coaching-fields-grid .compact-beta-tools button b{font-size:7.5px}
  .welcome-card{padding:16px 13px}.welcome-card h1{font-size:clamp(26px,9vw,42px)}.welcome-card>p{font-size:11px;line-height:1.38}.welcome-card .featureline{margin-top:10px;gap:4px}.welcome-card .chip{font-size:7.5px;padding:4px 6px}.welcome-card .summary-grid{margin-top:12px;gap:5px}.welcome-card .summary-grid div{padding:8px}.welcome-card .summary-grid strong{font-size:18px}
}

@media(max-height:700px){
  .setup-screen-header{min-height:58px}.setup-screen-copy p{display:none}.setup-screen-footer{min-height:42px}.welcome-card .featureline{display:none}.welcome-card .summary-grid{margin-top:10px}.challenge-fields-grid .sub{display:none}
}
/* End K-Mate v36 */
'''
write(styles_path, styles)
