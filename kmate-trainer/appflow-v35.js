(() => {
  'use strict';

  const FLOW_VERSION = '35.2-warm-3d';
  const PAGE_ORDER = ['welcome', 'position', 'challenge', 'coaching'];
  let activePage = 'welcome';
  let initialized = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];


  let uiAudioContext = null;
  let lastUiSoundAt = 0;
  let uiSoundCount = 0;

  function uiSoundsAllowed() {
    const toggle = document.querySelector('#soundToggle');
    return !toggle || !toggle.classList.contains('muted');
  }

  function playUiWoodTap(strength = 1) {
    if (!uiSoundsAllowed()) return;
    const nowMs = performance.now();
    if (nowMs - lastUiSoundAt < 35) return;
    lastUiSoundAt = nowMs;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      uiAudioContext ||= new AudioContextClass();
      const context = uiAudioContext;
      context.resume?.();
      const now = context.currentTime;
      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.055 * Math.max(0.65, Math.min(1.15, strength)), now + 0.004);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
      master.connect(context.destination);

      const body = context.createOscillator();
      const bodyGain = context.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(185, now);
      body.frequency.exponentialRampToValueAtTime(112, now + 0.065);
      bodyGain.gain.setValueAtTime(0.9, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.072);
      body.connect(bodyGain).connect(master);
      body.start(now);
      body.stop(now + 0.08);

      const click = context.createOscillator();
      const clickGain = context.createGain();
      click.type = 'square';
      click.frequency.setValueAtTime(1180, now);
      click.frequency.exponentialRampToValueAtTime(520, now + 0.018);
      clickGain.gain.setValueAtTime(0.16, now);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
      click.connect(clickGain).connect(master);
      click.start(now);
      click.stop(now + 0.026);
      uiSoundCount += 1;
      document.documentElement.dataset.uiTapCount = String(uiSoundCount);
    } catch (error) {
      console.debug('K-Mate UI sound unavailable.', error);
    }
  }

  function bindUiSounds(root) {
    root.addEventListener('pointerdown', (event) => {
      const control = event.target.closest('button, select, input[type="checkbox"], input[type="range"]');
      if (!control || control.disabled) return;
      const prominent = Boolean(control.closest('.wizard-bottom-dock') || control.matches('.phase-seg button'));
      playUiWoodTap(prominent ? 1.08 : 0.82);
    }, { passive: true });
  }

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
        <footer class="wizard-footer wizard-bottom-dock">
          <button class="wizard-button wizard-back" type="button" data-wizard-back><span aria-hidden="true">←</span><b>Back</b></button>
          ${name === 'coaching'
            ? '<div class="wizard-start-slot" data-wizard-slot="start"></div>'
            : `<button class="wizard-button wizard-next" type="button" data-wizard-next="${PAGE_ORDER[step + 1]}"><b>Continue</b><span aria-hidden="true">→</span></button>`}
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
          <div class="wizard-kicker">Practice the part that decides the game</div>
          <h1>Play better positions.<br>Make better decisions.</h1>
          <p>Choose a middlegame or endgame, set the strength and clock, then learn from the decisions that actually change the position.</p>
          <div class="wizard-path" aria-label="How K-Mate works">
            <div><i>1</i><b>Choose</b><span>a real position</span></div>
            <div><i>2</i><b>Play</b><span>under pressure</span></div>
            <div><i>3</i><b>Improve</b><span>with clear coaching</span></div>
          </div>
        </div>
        <footer class="wizard-footer wizard-welcome-footer wizard-bottom-dock">
          <button class="wizard-button wizard-secondary" id="wizardInsightsButton" type="button"><span aria-hidden="true">◎</span><b>My insights</b></button>
          <button class="wizard-button wizard-next wizard-primary" type="button" data-wizard-next="position"><b>Start training</b><span aria-hidden="true">→</span></button>
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
    const statsSlot = null;

    for (const node of [phaseField, openingField, goalField]) positionSlot.append(node);
    for (const node of [positionField, opponentField, timeField, sideField]) challengeSlot.append(node);
    for (const node of [blindToggle, hintToggle, principleToggle, liveCoachToggle, voiceToggle, audioCheck, soundField, loadError]) coachingSlot.append(node);
    startSlot.append(startButton);
    summaryGrid.hidden = true;

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
        uiSoundCount,
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
      bindUiSounds(wizard);
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
