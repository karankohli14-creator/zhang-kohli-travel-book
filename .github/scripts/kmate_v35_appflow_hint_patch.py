from __future__ import annotations

from pathlib import Path

ROOT = Path("kmate-trainer")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


index_path = ROOT / "index.html"
index = index_path.read_text()
index = replace_once(index, "styles-v7.css?v=35.0.0", "styles-v7.css?v=35.1.0", "stylesheet cache version")
index = replace_once(
    index,
    '  <script type="module" src="./app-v7.js?v=35.0.0"></script>',
    '  <script src="./appflow-v35.js?v=35.1.0" defer></script>\n  <script type="module" src="./app-v7.js?v=35.1.0"></script>',
    "app-flow script inclusion",
)
index_path.write_text(index)


appflow = r'''(() => {
  'use strict';

  const FLOW_VERSION = '35.1-app-flow';
  const PAGE_ORDER = ['welcome', 'position', 'challenge', 'coaching'];
  let activePage = 'welcome';
  let initialized = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function setViewportHeight() {
    const height = Math.max(480, Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0));
    document.documentElement.style.setProperty('--kmate-app-height', `${height}px`);
  }

  function pageMarkup(name, title, step) {
    return `
      <section class="wizard-page" data-wizard-page="${name}" hidden inert aria-hidden="true">
        <header class="wizard-header">
          <button class="wizard-home" type="button" data-wizard-home aria-label="Return to K-Mate welcome"><span>♞</span><b>K-Mate</b></button>
          <div class="wizard-progress" aria-label="Setup progress">
            <i data-progress="position"></i><i data-progress="challenge"></i><i data-progress="coaching"></i>
          </div>
        </header>
        <h1 class="wizard-title">${title}</h1>
        <div class="wizard-content wizard-${name}-content" data-wizard-slot="${name}"></div>
        <footer class="wizard-footer">
          <button class="wizard-button wizard-back" type="button" data-wizard-back>← Back</button>
          ${name === 'coaching'
            ? '<div class="wizard-start-slot" data-wizard-slot="start"></div>'
            : `<button class="wizard-button wizard-next" type="button" data-wizard-next="${PAGE_ORDER[step + 1]}">Continue →</button>`}
        </footer>
      </section>`;
  }

  function buildWizard() {
    const setupView = $('#setupView');
    const hero = setupView?.querySelector('.hero');
    const intro = hero?.querySelector('.intro');
    const setupCard = hero?.querySelector('.setup-card');
    if (!setupView || !hero || !intro || !setupCard) throw new Error('K-Mate setup structure was not found.');

    const phaseField = $('#phaseSeg')?.closest('.field');
    const openingField = $('#openingField');
    const goalField = $('#goalField');
    const positionField = $('#positionRating')?.closest('.field');
    const opponentField = $('#opponentRating')?.closest('.field');
    const timeField = $('#timeControlGrid')?.closest('.field');
    const sideField = $('#sideSeg')?.closest('.field');
    const blindToggle = $('#blindCalibration')?.closest('label');
    const hintToggle = $('#autoHints')?.closest('label');
    const principleToggle = $('#principleReview')?.closest('label');
    const liveCoachToggle = $('#liveCoach')?.closest('label');
    const voiceToggle = $('#liveCoachVoice')?.closest('label');
    const audioCheck = $('#coachAudioCheck');
    const soundField = $('#soundStyleField');
    const loadError = $('#loadError');
    const startButton = $('#startButton');
    const summaryGrid = intro.querySelector('.summary-grid');

    const required = {
      phaseField, openingField, goalField, positionField, opponentField, timeField, sideField,
      blindToggle, hintToggle, principleToggle, liveCoachToggle, voiceToggle, audioCheck,
      soundField, loadError, startButton, summaryGrid,
    };
    const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length) throw new Error(`Missing setup controls: ${missing.join(', ')}`);

    const wizard = document.createElement('div');
    wizard.id = 'setupWizard';
    wizard.className = 'setup-wizard';
    wizard.innerHTML = `
      <section class="wizard-page wizard-welcome" data-wizard-page="welcome" aria-hidden="false">
        <div class="wizard-welcome-main">
          <div class="wizard-welcome-brand"><span>♞</span><b>K-Mate</b></div>
          <div class="wizard-kicker">Timed position play</div>
          <h1>Train the positions that decide games.</h1>
          <p>Skip the routine opening moves. Start in a practical middlegame, late middlegame, or endgame, choose the opponent and clock, and receive coaching when it matters.</p>
          <div class="wizard-benefits"><span>Real positions</span><span>Rating control</span><span>Live coaching</span><span>Progress tracking</span></div>
          <div class="wizard-welcome-stats" data-wizard-slot="welcome-stats"></div>
        </div>
        <footer class="wizard-footer wizard-welcome-footer">
          <button class="wizard-button wizard-secondary" id="wizardInsightsButton" type="button">View insights</button>
          <button class="wizard-button wizard-next wizard-primary" type="button" data-wizard-next="position">Let’s get into it →</button>
        </footer>
      </section>
      ${pageMarkup('position', 'Choose your position', 1)}
      ${pageMarkup('challenge', 'Set the challenge', 2)}
      ${pageMarkup('coaching', 'Choose your coaching', 3)}
    `;
    setupView.prepend(wizard);

    const positionSlot = $('[data-wizard-slot="position"]', wizard);
    const challengeSlot = $('[data-wizard-slot="challenge"]', wizard);
    const coachingSlot = $('[data-wizard-slot="coaching"]', wizard);
    const startSlot = $('[data-wizard-slot="start"]', wizard);
    const statsSlot = $('[data-wizard-slot="welcome-stats"]', wizard);

    for (const node of [phaseField, openingField, goalField]) positionSlot.append(node);
    for (const node of [positionField, opponentField, timeField, sideField]) challengeSlot.append(node);
    for (const node of [blindToggle, hintToggle, principleToggle, liveCoachToggle, voiceToggle, audioCheck, soundField, loadError]) coachingSlot.append(node);
    startSlot.append(startButton);
    statsSlot.append(summaryGrid);

    phaseField.classList.add('wizard-phase-field');
    openingField.classList.add('wizard-opening-field');
    goalField.classList.add('wizard-goal-field');
    positionField.classList.add('wizard-rating-field');
    opponentField.classList.add('wizard-rating-field');
    timeField.classList.add('wizard-time-field');
    sideField.classList.add('wizard-side-field');
    for (const toggle of [blindToggle, hintToggle, principleToggle, liveCoachToggle, voiceToggle]) toggle.classList.add('wizard-toggle');
    audioCheck.classList.add('wizard-audio-check');
    soundField.classList.add('wizard-sound-field');

    hero.hidden = true;
    setupView.querySelector('.signal-card')?.setAttribute('hidden', '');
    setupView.querySelector('.recommendation-card')?.setAttribute('hidden', '');

    return wizard;
  }

  function showPage(name, { focus = true } = {}) {
    if (!PAGE_ORDER.includes(name)) name = 'welcome';
    activePage = name;
    const wizard = $('#setupWizard');
    if (!wizard) return;
    wizard.dataset.activePage = name;
    for (const page of $$('.wizard-page', wizard)) {
      const active = page.dataset.wizardPage === name;
      page.hidden = !active;
      page.inert = !active;
      page.setAttribute('aria-hidden', String(!active));
    }
    for (const dot of $$('[data-progress]', wizard)) {
      const currentIndex = PAGE_ORDER.indexOf(name);
      const dotIndex = PAGE_ORDER.indexOf(dot.dataset.progress);
      dot.classList.toggle('active', dotIndex === currentIndex);
      dot.classList.toggle('complete', dotIndex > 0 && dotIndex < currentIndex);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (focus) {
      window.requestAnimationFrame(() => {
        const heading = $(`.wizard-page[data-wizard-page="${name}"] .wizard-title, .wizard-page[data-wizard-page="${name}"] h1`);
        heading?.focus?.({ preventScroll: true });
      });
    }
  }

  function syncAppMode() {
    const setup = $('#setupView');
    const setupActive = Boolean(setup && !setup.hidden && !document.body.classList.contains('game-mode'));
    document.documentElement.classList.toggle('setup-wizard-root', setupActive);
    document.body.classList.toggle('setup-wizard-mode', setupActive);
    setViewportHeight();
    if (setupActive) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  function bindWizard(wizard) {
    wizard.addEventListener('click', (event) => {
      const next = event.target.closest('[data-wizard-next]');
      if (next) {
        showPage(next.dataset.wizardNext);
        return;
      }
      const back = event.target.closest('[data-wizard-back]');
      if (back) {
        const index = PAGE_ORDER.indexOf(activePage);
        showPage(PAGE_ORDER[Math.max(0, index - 1)]);
        return;
      }
      if (event.target.closest('[data-wizard-home]')) showPage('welcome');
    });

    $('#wizardInsightsButton')?.addEventListener('click', () => {
      const insightsButton = $('.topnav [data-view="insights"]');
      insightsButton?.click();
    });

    $('.topnav [data-view="setup"]')?.addEventListener('click', () => showPage('welcome', { focus: false }));
    $('#brandButton')?.addEventListener('click', () => showPage('welcome', { focus: false }));
  }

  function exposeDiagnostics() {
    const attach = () => {
      if (!window.__KMATE__) {
        window.setTimeout(attach, 40);
        return;
      }
      window.__KMATE__.appFlowVersion = FLOW_VERSION;
      window.__KMATE__.showSetupPage = (page) => showPage(page, { focus: false });
      window.__KMATE__.appFlowState = () => ({
        version: FLOW_VERSION,
        page: activePage,
        setupActive: document.body.classList.contains('setup-wizard-mode'),
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.visualViewport?.height || window.innerHeight,
      });
    };
    attach();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    try {
      setViewportHeight();
      const wizard = buildWizard();
      bindWizard(wizard);
      showPage('welcome', { focus: false });
      syncAppMode();

      const setupView = $('#setupView');
      new MutationObserver(syncAppMode).observe(setupView, { attributes: true, attributeFilter: ['hidden'] });
      new MutationObserver(syncAppMode).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      window.addEventListener('resize', setViewportHeight, { passive: true });
      window.visualViewport?.addEventListener?.('resize', setViewportHeight, { passive: true });

      const hintText = $('#hintText');
      if (hintText) hintText.setAttribute('aria-live', 'polite');
      document.documentElement.dataset.appFlow = 'ready';
      exposeDiagnostics();
    } catch (error) {
      initialized = false;
      document.documentElement.dataset.appFlow = 'failed';
      console.error('K-Mate app flow could not initialize; keeping the original setup screen.', error);
      document.documentElement.classList.remove('setup-wizard-root');
      document.body.classList.remove('setup-wizard-mode');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
'''
(ROOT / "appflow-v35.js").write_text(appflow)


styles_path = ROOT / "styles-v7.css"
styles = styles_path.read_text()
styles += r'''

/* K-Mate v35.1 — fixed-screen app flow and always-visible written hints */
html.setup-wizard-root,html.setup-wizard-root body{width:100%;height:100%;overflow:hidden!important;overscroll-behavior:none}
body.setup-wizard-mode .appbar{display:none!important}
body.setup-wizard-mode .shell{position:fixed;inset:0;width:100%;height:var(--kmate-app-height,100dvh);margin:0;padding:0;overflow:hidden!important}
body.setup-wizard-mode #setupView{position:absolute;inset:0;display:block!important;width:100%;height:100%;overflow:hidden!important}
body.setup-wizard-mode #setupView>.hero,
body.setup-wizard-mode #setupView>.signal-card,
body.setup-wizard-mode #setupView>.recommendation-card{display:none!important}
.setup-wizard{position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at 12% -5%,#4b5b332d,transparent 34rem),radial-gradient(circle at 92% 5%,#f4cc7017,transparent 28rem),linear-gradient(145deg,#111a13,#07100b)}
.wizard-page{position:absolute;inset:0;display:grid;grid-template-rows:58px auto minmax(0,1fr) 66px;gap:10px;min-width:0;min-height:0;padding:max(10px,env(safe-area-inset-top)) clamp(12px,3vw,36px) max(10px,env(safe-area-inset-bottom));overflow:hidden}
.wizard-page[hidden]{display:none!important;pointer-events:none!important}
.wizard-header{display:flex;align-items:center;justify-content:space-between;gap:14px;width:min(1060px,100%);margin:0 auto;border-bottom:1px solid #ffffff13}
.wizard-home{display:flex;align-items:center;gap:8px;border:0;background:transparent;color:#fff7e7;font-weight:950;cursor:pointer}
.wizard-home span{display:grid;place-items:center;width:36px;height:36px;border:1px solid #b9f47455;border-radius:12px;background:#b9f47416;color:var(--accent);font:25px Georgia,serif}
.wizard-home b{font-size:17px;letter-spacing:-.02em}
.wizard-progress{display:flex;align-items:center;gap:6px}
.wizard-progress i{display:block;width:28px;height:6px;border-radius:99px;background:#ffffff18;transition:.18s ease}
.wizard-progress i.active{width:44px;background:linear-gradient(90deg,var(--gold),var(--accent))}
.wizard-progress i.complete{background:#b9f4746b}
.wizard-title{width:min(1060px,100%);margin:0 auto;color:#fff9ed;font-size:clamp(28px,4vw,44px);line-height:1;letter-spacing:-.045em}
.wizard-content{display:grid;align-content:center;min-width:0;min-height:0;width:min(1060px,100%);margin:0 auto;overflow:hidden}
.wizard-position-content{grid-template-columns:1fr 1fr;gap:12px}
.wizard-position-content .wizard-phase-field{grid-column:1/-1}
.wizard-challenge-content{grid-template-columns:1fr 1fr;gap:12px}
.wizard-challenge-content .wizard-time-field,
.wizard-challenge-content .wizard-side-field{grid-column:1/-1}
.wizard-coaching-content{grid-template-columns:1fr 1fr;gap:9px 12px;align-content:center}
.wizard-coaching-content .wizard-audio-check,
.wizard-coaching-content .wizard-sound-field,
.wizard-coaching-content .error{grid-column:1/-1}
.wizard-page .field{min-width:0;margin:0;padding:13px 15px;border:1px solid #ffffff16;border-radius:18px;background:linear-gradient(145deg,#ffffff0a,#ffffff04)}
.wizard-page .field:first-of-type{padding-top:13px;border-top:1px solid #ffffff16}
.wizard-page .fieldhead{margin-bottom:7px}
.wizard-page .fieldhead label{font-size:14px}
.wizard-page .value{font-size:13px}
.wizard-page .sub{display:none!important}
.wizard-page .phase-seg button{min-height:58px}
.wizard-page .phase-seg button b{font-size:15px}
.wizard-page .phase-seg button small{font-size:9px}
.wizard-page .select{min-height:45px;font-size:14px}
.wizard-page .rangeRow{grid-template-columns:40px 1fr 40px}
.wizard-page .step{width:40px;height:40px}
.wizard-page .time-grid{grid-template-columns:repeat(6,1fr)}
.wizard-page .time-grid button{min-height:48px}
.wizard-page .time-grid small{display:none}
.wizard-page .side-seg button{font-size:14px;font-weight:850}
.wizard-toggle{display:flex!important;align-items:center;gap:12px;min-width:0;min-height:64px;margin:0!important;padding:10px 12px!important;border:1px solid #ffffff16!important;border-radius:16px!important;background:linear-gradient(145deg,#ffffff0a,#ffffff04)!important}
.wizard-toggle input{flex:0 0 auto;width:20px;height:20px}
.wizard-toggle span{min-width:0}
.wizard-toggle b{display:block;font-size:13px;line-height:1.15}
.wizard-toggle small{display:block!important;margin-top:3px!important;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--muted)!important;font-size:10px!important;line-height:1.15!important}
.wizard-audio-check{display:grid!important;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;margin:0!important;padding:8px 10px!important;border:1px solid #ffffff14;border-radius:14px;background:#ffffff06}
.wizard-audio-check span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:10px}
.wizard-sound-field{padding:10px 12px!important}
.wizard-sound-field .sound-style-head{margin-bottom:5px}
.wizard-sound-field .sound-preview-actions{display:flex}
.wizard-sound-field .select{min-height:40px}
.wizard-footer{display:grid;grid-template-columns:1fr 1.25fr;align-items:center;gap:10px;width:min(1060px,100%);margin:0 auto;padding-top:10px;border-top:1px solid #ffffff13}
.wizard-button{min-height:50px;padding:0 18px;border:1px solid var(--line);border-radius:15px;background:#1b2920;color:var(--text);font-size:14px;font-weight:950;cursor:pointer}
.wizard-next,.wizard-primary{border-color:transparent;background:linear-gradient(135deg,var(--accent),#9ee36b);color:#14200d;box-shadow:0 12px 28px #b9f47422}
.wizard-start-slot{min-width:0}
.wizard-start-slot #startButton{width:100%;min-height:50px;margin:0;font-size:15px;border-radius:15px}
.wizard-welcome{grid-template-rows:minmax(0,1fr) 68px;gap:10px}
.wizard-welcome-main{display:flex;flex-direction:column;justify-content:center;width:min(980px,100%);min-height:0;margin:0 auto;text-align:center}
.wizard-welcome-brand{display:flex;align-items:center;justify-content:center;gap:10px;color:#fff8e8}
.wizard-welcome-brand span{display:grid;place-items:center;width:58px;height:58px;border:1px solid #b9f47466;border-radius:19px;background:linear-gradient(145deg,#b9f47422,#f4cc7012);color:var(--accent);font:40px Georgia,serif;box-shadow:0 16px 36px #0005}
.wizard-welcome-brand b{font-size:28px;letter-spacing:-.035em}
.wizard-kicker{margin-top:16px;color:var(--gold);font-size:11px;font-weight:950;letter-spacing:.17em;text-transform:uppercase}
.wizard-welcome h1{max-width:900px;margin:14px auto 12px;font-size:clamp(44px,7vw,78px);line-height:.95;letter-spacing:-.06em}
.wizard-welcome p{max-width:760px;margin:0 auto;color:#d4ddd5;font-size:clamp(15px,2vw,19px)}
.wizard-benefits{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;margin-top:20px}
.wizard-benefits span{padding:6px 10px;border:1px solid #ffffff17;border-radius:99px;background:#ffffff07;color:#d9e1da;font-size:11px}
.wizard-welcome-stats{width:min(720px,100%);margin:20px auto 0}
.wizard-welcome-stats .summary-grid{margin:0}
.wizard-welcome-stats .summary-grid div{padding:11px}
.wizard-welcome-stats .summary-grid strong{font-size:24px}
.wizard-welcome-footer{grid-template-columns:1fr 1.4fr}

/* The strategic sentence remains visible before Reveal candidate on every screen size. */
body.game-mode #hintCard{overflow:hidden}
body.game-mode #hintCard .hint-head>div{min-width:0}
body.game-mode #hintTitle{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
body.game-mode #hintText{
  display:-webkit-box!important;
  min-height:2.35em!important;
  margin:4px 0 0!important;
  overflow:hidden!important;
  white-space:normal!important;
  text-overflow:clip!important;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:2;
  font-size:10px!important;
  line-height:1.2!important;
  color:#d9e2da!important;
}

@media(max-width:760px){
  .wizard-page{grid-template-rows:48px auto minmax(0,1fr) 56px;gap:6px;padding:max(7px,env(safe-area-inset-top)) 8px max(7px,env(safe-area-inset-bottom))}
  .wizard-header{min-height:48px}
  .wizard-home span{width:32px;height:32px;border-radius:10px;font-size:22px}
  .wizard-home b{font-size:15px}
  .wizard-progress{gap:4px}
  .wizard-progress i{width:16px;height:5px}
  .wizard-progress i.active{width:26px}
  .wizard-title{font-size:26px;line-height:1.02}
  .wizard-position-content,.wizard-challenge-content,.wizard-coaching-content{grid-template-columns:1fr;gap:6px}
  .wizard-position-content .wizard-phase-field,
  .wizard-challenge-content .wizard-time-field,
  .wizard-challenge-content .wizard-side-field,
  .wizard-coaching-content .wizard-audio-check,
  .wizard-coaching-content .wizard-sound-field,
  .wizard-coaching-content .error{grid-column:auto}
  .wizard-page .field{padding:8px 9px;border-radius:12px}
  .wizard-page .field:first-of-type{padding-top:8px}
  .wizard-page .fieldhead{margin-bottom:4px}
  .wizard-page .fieldhead label{font-size:12px}
  .wizard-page .value{font-size:11px}
  .wizard-page .phase-seg{gap:4px}
  .wizard-page .phase-seg button{min-height:46px;padding:5px 3px;border-radius:10px}
  .wizard-page .phase-seg button b{font-size:12px}
  .wizard-page .phase-seg button small{display:none}
  .wizard-page .select{min-height:38px;padding:0 9px;font-size:12px;border-radius:10px}
  .wizard-page .rangeRow{grid-template-columns:34px 1fr 34px;gap:6px}
  .wizard-page .step{width:34px;height:34px;border-radius:9px;font-size:18px}
  .wizard-page .time-grid{grid-template-columns:repeat(3,1fr);gap:4px}
  .wizard-page .time-grid button{min-height:35px;padding:3px;border-radius:9px}
  .wizard-page .time-grid b{font-size:12px}
  .wizard-page .side-seg{gap:4px}
  .wizard-page .side-seg button{min-height:36px;padding:4px;font-size:11px;border-radius:9px}
  .wizard-toggle{min-height:47px;padding:6px 8px!important;border-radius:11px!important;gap:8px}
  .wizard-toggle input{width:18px;height:18px}
  .wizard-toggle b{font-size:11.5px}
  .wizard-toggle small{margin-top:2px!important;font-size:8.5px!important}
  .wizard-audio-check{grid-template-columns:auto minmax(0,1fr);padding:5px 7px!important;border-radius:10px}
  .wizard-audio-check button{min-height:31px;padding:0 8px;font-size:9px}
  .wizard-audio-check span{font-size:8px}
  .wizard-sound-field{padding:6px 8px!important}
  .wizard-sound-field .fieldhead label{font-size:11px}
  .wizard-sound-field .sound-preview{min-height:28px;padding:0 6px;font-size:8px}
  .wizard-sound-field .select{min-height:34px}
  .wizard-footer{grid-template-columns:1fr 1.35fr;gap:6px;padding-top:6px}
  .wizard-button,.wizard-start-slot #startButton{min-height:43px;padding:0 10px;font-size:12px;border-radius:11px}
  .wizard-welcome{grid-template-rows:minmax(0,1fr) 56px}
  .wizard-welcome-brand span{width:48px;height:48px;border-radius:15px;font-size:33px}
  .wizard-welcome-brand b{font-size:24px}
  .wizard-kicker{margin-top:10px;font-size:9px}
  .wizard-welcome h1{margin:10px auto 9px;font-size:clamp(39px,12vw,55px)}
  .wizard-welcome p{font-size:13px;line-height:1.35}
  .wizard-benefits{margin-top:12px;gap:5px}
  .wizard-benefits span{padding:4px 7px;font-size:9px}
  .wizard-welcome-stats{margin-top:12px}
  .wizard-welcome-stats .summary-grid{gap:5px}
  .wizard-welcome-stats .summary-grid div{padding:7px 4px;border-radius:10px}
  .wizard-welcome-stats .summary-grid strong{font-size:18px}
  .wizard-welcome-stats .summary-grid span{font-size:7px;letter-spacing:.05em}
  body.game-mode #hintText{display:-webkit-box!important;min-height:2.35em!important;font-size:9px!important;-webkit-line-clamp:2}
}

@media(max-height:700px){
  .wizard-page{grid-template-rows:42px auto minmax(0,1fr) 49px;gap:4px;padding:5px 8px}
  .wizard-title{font-size:23px}
  .wizard-toggle{min-height:42px}
  .wizard-welcome-brand span{width:42px;height:42px;font-size:29px}
  .wizard-welcome h1{font-size:38px}
  .wizard-benefits{margin-top:8px}
  .wizard-welcome-stats{margin-top:8px}
  body.game-mode #hintText{display:-webkit-box!important;min-height:2.2em!important;-webkit-line-clamp:2}
}
/* End K-Mate v35.1 */
'''
styles_path.write_text(styles)
