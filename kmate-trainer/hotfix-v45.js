/* K-Mate v45 — unfreeze final setup and use one reliable start action. */
(() => {
  'use strict';

  const VERSION = '45.0.1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const setupControlSelectors = [
    '#coachBackButton',
    '#blindCalibration',
    '#autoHints',
    '#principleReview',
    '#liveCoach',
    '#liveCoachVoice',
    '#coachVoiceTestButton',
    '#soundStyleSelect',
    '#previewSoundButton',
    '#previewCaptureButton',
    '#startButton',
  ];

  document.documentElement.classList.add('kmate-v45-hotfix');
  document.documentElement.dataset.kmateHotfix = VERSION;

  const style = document.createElement('style');
  style.id = 'kmateV45HotfixStyle';
  style.textContent = `
    html.kmate-v45-hotfix body:not(.game-mode) .setup-flow-page[hidden],
    html.kmate-v45-hotfix body:not(.game-mode) .setup-flow-page[aria-hidden="true"] {
      display:none!important;
      visibility:hidden!important;
      pointer-events:none!important;
    }
    html.kmate-v45-hotfix body:not(.game-mode) .setup-flow-page.active:not([hidden]) {
      display:grid!important;
      visibility:visible!important;
      pointer-events:auto!important;
      z-index:20!important;
    }
    html.kmate-v45-hotfix body:not(.game-mode) .setup-flow-page.active:not([hidden]) *,
    html.kmate-v45-hotfix body:not(.game-mode) .setup-flow-page.active:not([hidden]) button,
    html.kmate-v45-hotfix body:not(.game-mode) .setup-flow-page.active:not([hidden]) input,
    html.kmate-v45-hotfix body:not(.game-mode) .setup-flow-page.active:not([hidden]) select,
    html.kmate-v45-hotfix body:not(.game-mode) .setup-flow-page.active:not([hidden]) label {
      pointer-events:auto!important;
    }
    html.kmate-v45-hotfix body:not(.game-mode) #setupView .hero[hidden],
    html.kmate-v45-hotfix body:not(.game-mode) #setupView .setup-supplement-hidden,
    html.kmate-v45-hotfix body:not(.game-mode) #setupView > .signal-card,
    html.kmate-v45-hotfix body:not(.game-mode) #setupView > .recommendation-card {
      display:none!important;
      visibility:hidden!important;
      pointer-events:none!important;
    }
    html.kmate-v45-hotfix dialog:not([open]),
    html.kmate-v45-hotfix [data-kmate-v45-closed="1"] {
      display:none!important;
      pointer-events:none!important;
    }
    html.kmate-v45-hotfix dialog[open][data-kmate-nonmodal="1"] {
      position:fixed!important;
      z-index:1000!important;
      pointer-events:auto!important;
    }
    html.kmate-v45-hotfix body:not(.game-mode)[data-setup-page="coach"] dialog[open] {
      display:none!important;
      pointer-events:none!important;
    }
    html.kmate-v45-hotfix body:not(.game-mode) #startButton,
    html.kmate-v45-hotfix body:not(.game-mode) #coachBackButton {
      position:relative!important;
      z-index:50!important;
      pointer-events:auto!important;
      touch-action:manipulation!important;
    }
    html.kmate-v45-hotfix body:not(.game-mode) #startButton[data-kmate-starting="1"] {
      opacity:.82;
      cursor:wait;
    }
  `;
  document.head.append(style);

  const dialogPrototype = window.HTMLDialogElement?.prototype || null;
  const nativeDialogClose = dialogPrototype?.close || null;

  function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  function closeNativeDialog(dialog) {
    if (!dialog) return;
    try {
      if (dialog.open && typeof nativeDialogClose === 'function') {
        nativeDialogClose.call(dialog);
      } else if (dialog.hasAttribute('open')) {
        dialog.removeAttribute('open');
      }
    } catch {
      dialog.removeAttribute('open');
    }
    dialog.removeAttribute('aria-modal');
    setAttributeIfChanged(dialog, 'aria-hidden', 'true');
    if (dialog.dataset.kmateV45Closed !== '1') dialog.dataset.kmateV45Closed = '1';
  }

  // Release any top-layer dialog that an earlier version may have left open.
  $$('dialog[open]').forEach(closeNativeDialog);

  // K-Mate overlays do not need browser-level modality. Native showModal can
  // make the rest of an embedded/mobile document inert even when its visual
  // box is hidden, which is exactly the failure mode of the frozen coach page.
  if (dialogPrototype && !dialogPrototype.__kmateV45NonModal) {
    const openNonModal = function openNonModal() {
      if (this.open) closeNativeDialog(this);
      this.hidden = false;
      this.dataset.kmateV45Closed = '0';
      this.dataset.kmateNonmodal = '1';
      this.setAttribute('open', '');
      setAttributeIfChanged(this, 'aria-hidden', 'false');
      this.removeAttribute('aria-modal');
    };
    const closeNonModal = function closeNonModal(returnValue = '') {
      const wasOpen = this.hasAttribute('open');
      this.returnValue = String(returnValue ?? '');
      this.removeAttribute('open');
      setAttributeIfChanged(this, 'aria-hidden', 'true');
      this.dataset.kmateV45Closed = '1';
      if (wasOpen) this.dispatchEvent(new Event('close'));
    };
    try {
      Object.defineProperty(dialogPrototype, 'showModal', {
        configurable: true,
        writable: true,
        value: openNonModal,
      });
      Object.defineProperty(dialogPrototype, 'show', {
        configurable: true,
        writable: true,
        value: openNonModal,
      });
      Object.defineProperty(dialogPrototype, 'close', {
        configurable: true,
        writable: true,
        value: closeNonModal,
      });
      Object.defineProperty(dialogPrototype, '__kmateV45NonModal', {
        configurable: true,
        value: true,
      });
    } catch (error) {
      console.warn('K-Mate could not replace native dialog modality; setup cleanup remains active.', error);
    }
  }

  function setupIsVisible() {
    const setup = $('#setupView');
    return Boolean(setup && !setup.hidden && !document.body.classList.contains('game-mode'));
  }

  function activeSetupPage() {
    return $('.setup-flow-page.active:not([hidden])')
      || $(`.setup-flow-page[data-setup-page="${document.body.dataset.setupPage || 'intro'}"]`);
  }

  function releaseInertness() {
    const setup = $('#setupView');
    const active = activeSetupPage();
    const candidates = [document.documentElement, document.body, $('.shell'), setup, $('.setup-flow'), active].filter(Boolean);
    for (const element of candidates) {
      try { if (element.inert) element.inert = false; } catch {}
      if (element.hasAttribute('inert')) element.removeAttribute('inert');
      if (element.style.pointerEvents) element.style.pointerEvents = '';
    }
  }

  function normalizeSetupPages() {
    const pageName = document.body.dataset.setupPage || 'intro';
    const pages = $$('.setup-flow-page');
    if (!pages.length) return;
    const active = pages.find((page) => page.classList.contains('active') && !page.hidden)
      || pages.find((page) => page.dataset.setupPage === pageName)
      || pages[0];
    for (const page of pages) {
      const selected = page === active;
      if (page.hidden === selected) page.hidden = !selected;
      if (page.classList.contains('active') !== selected) page.classList.toggle('active', selected);
      setAttributeIfChanged(page, 'aria-hidden', String(!selected));
      try { if (page.inert !== !selected) page.inert = !selected; } catch {}
      if (selected && page.hasAttribute('inert')) page.removeAttribute('inert');
    }
    if (active?.dataset.setupPage && document.body.dataset.setupPage !== active.dataset.setupPage) {
      document.body.dataset.setupPage = active.dataset.setupPage;
    }
  }

  function removeExternalHitBlocker(control) {
    if (!control || control.offsetParent === null) return;
    const rect = control.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    if (!hit || hit === control || control.contains(hit) || hit.contains(control)) return;
    const active = control.closest('.setup-flow-page');
    if (active?.contains(hit)) return;
    const blocker = hit.closest('dialog,.modal,.view,.hero,.signal-card,.recommendation-card,[aria-modal="true"]') || hit;
    if (blocker === document.body || blocker === document.documentElement) return;
    blocker.dataset.kmateV45Blocker = '1';
    blocker.style.setProperty('pointer-events', 'none', 'important');
    blocker.style.setProperty('visibility', 'hidden', 'important');
  }

  function sanitizeSetup() {
    if (!setupIsVisible()) return;
    // A modal top-layer is allowed only while actually playing/reviewing.
    $$('dialog[open]').forEach(closeNativeDialog);
    releaseInertness();
    normalizeSetupPages();
    const active = activeSetupPage();
    if (active?.dataset.setupPage === 'coach') {
      for (const selector of setupControlSelectors) {
        const control = $(selector);
        if (!control) continue;
        try { if (control.inert) control.inert = false; } catch {}
        if (control.hasAttribute('inert')) control.removeAttribute('inert');
        if ('disabled' in control && selector !== '#coachVoiceTestButton' && control.disabled) control.disabled = false;
        control.style.setProperty('pointer-events', 'auto', 'important');
        removeExternalHitBlocker(control);
      }
    }
  }

  function showSetupPageFallback(pageName) {
    const page = $(`.setup-flow-page[data-setup-page="${pageName}"]`);
    if (!page) return false;
    for (const screen of $$('.setup-flow-page')) {
      const selected = screen === page;
      if (screen.hidden === selected) screen.hidden = !selected;
      if (screen.classList.contains('active') !== selected) screen.classList.toggle('active', selected);
      setAttributeIfChanged(screen, 'aria-hidden', String(!selected));
      try { if (screen.inert !== !selected) screen.inert = !selected; } catch {}
      if (selected && screen.hasAttribute('inert')) screen.removeAttribute('inert');
    }
    if (document.body.dataset.setupPage !== pageName) document.body.dataset.setupPage = pageName;
    $$('[data-setup-step]').forEach((dot) => {
      const selected = dot.dataset.setupStep === pageName;
      if (dot.classList.contains('active') !== selected) dot.classList.toggle('active', selected);
    });
    sanitizeSetup();
    page.querySelector('button,select,input')?.focus?.({ preventScroll: true });
    return true;
  }

  function showStartError(message) {
    const box = $('#loadError');
    if (box) {
      box.textContent = message;
      box.classList.add('show');
      box.hidden = false;
    }
  }

  function startSucceeded() {
    const gameView = $('#gameView');
    return Boolean(document.body.classList.contains('game-mode') || (gameView && !gameView.hidden));
  }

  function wireStartButton() {
    const existing = $('#startButton');
    if (!existing || existing.dataset.kmateV45Wired === '1') return;

    // Cloning deliberately removes the accumulated click/pointer/touch handlers
    // from prior revisions. One native click now owns the transition.
    const button = existing.cloneNode(true);
    button.dataset.kmateV45Wired = '1';
    button.dataset.starting = '0';
    button.dataset.kmateStarting = '0';
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.removeAttribute('onclick');
    button.textContent = 'Generate position';
    existing.replaceWith(button);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (button.dataset.kmateStarting === '1' || startSucceeded()) return;

      sanitizeSetup();
      button.dataset.kmateStarting = '1';
      button.dataset.starting = '1';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Opening board…';
      const box = $('#loadError');
      box?.classList.remove('show');

      // Let the pressed state paint before the synchronous position setup.
      window.setTimeout(() => {
        try {
          const start = window.__KMATE__?.start;
          if (typeof start !== 'function') throw new Error('K-Mate is still loading. Reload this page once.');
          start();
        } catch (error) {
          console.error('K-Mate v45 direct start failed.', error);
          // The original recovery routine knows how to purge module-scoped
          // generated-position caches, so use it only as a genuine fallback.
          button.dataset.starting = '0';
          button.dataset.kmateStarting = '0';
          button.disabled = false;
          button.removeAttribute('aria-busy');
          try {
            const recovered = window.__KMATE_GENERATE_POSITION__?.({ preventDefault() {} });
            if (recovered === false && !startSucceeded()) throw error;
          } catch (recoveryError) {
            console.error('K-Mate v45 recovery start failed.', recoveryError);
            button.textContent = 'Generate position';
            showStartError(`The board could not open: ${recoveryError?.message || error?.message || 'unknown error'}`);
            return;
          }
        }

        window.setTimeout(() => {
          if (startSucceeded()) return;
          button.dataset.starting = '0';
          button.dataset.kmateStarting = '0';
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.textContent = 'Generate position';
          showStartError('The board did not open. Please press Generate position once more.');
        }, 1800);
      }, 0);
    });
  }

  // Back should use the app's normal handler. This capture-phase watchdog only
  // supplies a fallback when a previous hidden layer swallowed that handler.
  document.addEventListener('click', (event) => {
    const back = event.target.closest?.('#coachBackButton');
    if (!back) return;
    window.setTimeout(() => {
      if (document.body.dataset.setupPage === 'coach' && setupIsVisible()) showSetupPageFallback('challenge');
    }, 0);
  }, true);

  let maintenanceRunning = false;
  let maintenanceScheduled = false;

  function maintainSetupInteractivity() {
    if (maintenanceRunning) return;
    maintenanceRunning = true;
    try {
      sanitizeSetup();
      wireStartButton();
    } finally {
      maintenanceRunning = false;
    }
  }

  function scheduleMaintenance() {
    if (maintenanceScheduled) return;
    maintenanceScheduled = true;
    window.requestAnimationFrame(() => {
      maintenanceScheduled = false;
      maintainSetupInteractivity();
    });
  }

  const observer = new MutationObserver(scheduleMaintenance);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-setup-page'],
    childList: true,
    subtree: true,
  });

  window.addEventListener('pageshow', scheduleMaintenance);
  window.addEventListener('focus', scheduleMaintenance);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleMaintenance();
  });

  maintainSetupInteractivity();
  window.setInterval(scheduleMaintenance, 500);

  window.__KMATE_V45_HOTFIX__ = {
    version: VERSION,
    sanitize: maintainSetupInteractivity,
    showSetupPage: showSetupPageFallback,
  };
})();
