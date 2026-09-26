const KMATE_TOP_CONTROLS_V56 = '56.0.0';
const KMATE_STORE_KEY_V56 = 'kmate-position-v7';
const KMATE_AUTOMATIC_READY_SPEECH_V56 = /^coach voice ready\.?$/i;
const KMATE_PLAY_READY_SPEECH_V56 = /(?:k\s*mate coach audio is ready|you will hear both live coaching and post[ -]?game reviews)/i;

let km56Observer = null;
let km56SpeechPatched = false;
let km56SuppressedReadySpeech = 0;
let km56MenuToggles = 0;
let km56VoiceToggles = 0;
let km56LastTouchMenuAt = 0;
let km56RefreshFrame = 0;

function km56InstallStyles() {
  if (document.querySelector('#kmateTopControlsV56Styles')) return;
  const link = document.createElement('link');
  link.id = 'kmateTopControlsV56Styles';
  link.rel = 'stylesheet';
  link.href = new URL(`./top-controls-v56.css?v=${KMATE_TOP_CONTROLS_V56}`, import.meta.url).href;
  document.head.append(link);
}

function km56ReadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KMATE_STORE_KEY_V56) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function km56WriteStore(store) {
  try {
    if (store && typeof store === 'object') localStorage.setItem(KMATE_STORE_KEY_V56, JSON.stringify(store));
  } catch {}
}

function km56SetAttribute(element, name, value) {
  if (!(element instanceof Element)) return;
  const next = String(value);
  if (element.getAttribute(name) !== next) element.setAttribute(name, next);
}

function km56SetText(element, value) {
  if (!element) return;
  const next = String(value);
  if (element.textContent !== next) element.textContent = next;
}

function km56ToggleClass(element, name, enabled) {
  if (!element?.classList) return;
  const next = Boolean(enabled);
  if (element.classList.contains(name) !== next) element.classList.toggle(name, next);
}

function km56VoiceCheckbox() {
  return document.querySelector('#liveCoachVoice');
}

function km56VoiceEnabled() {
  const checkbox = km56VoiceCheckbox();
  if (checkbox instanceof HTMLInputElement) return checkbox.checked;
  return km56ReadStore()?.settings?.coachVoice !== false;
}

function km56UpdateVoiceButton(button = document.querySelector('#gameCoachAudioButton')) {
  if (!(button instanceof HTMLButtonElement)) return;
  const enabled = km56VoiceEnabled();
  km56SetText(button, enabled ? '🔊' : '🔇');
  km56SetAttribute(button, 'aria-pressed', enabled);
  km56SetAttribute(button, 'aria-label', enabled ? 'Turn coach voice off' : 'Turn coach voice on');
  const title = button.getAttribute('aria-label') || '';
  if (button.title !== title) button.title = title;
  km56ToggleClass(button, 'audio-ready', enabled);
  km56ToggleClass(button, 'muted', !enabled);
}

function km56SetVoiceEnabled(enabled) {
  const next = Boolean(enabled);
  const checkbox = km56VoiceCheckbox();
  if (checkbox instanceof HTMLInputElement) {
    if (checkbox.checked !== next) {
      checkbox.checked = next;
      checkbox.dispatchEvent(new Event('input', { bubbles: true }));
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } else {
    const store = km56ReadStore() || { version: 7, sessions: [], legacy: {}, settings: {} };
    store.settings ||= {};
    store.settings.coachVoice = next;
    km56WriteStore(store);
  }

  if (!next) {
    try { window.speechSynthesis?.cancel?.(); } catch {}
  }

  const liveToggle = document.querySelector('#liveCoachVoiceToggle');
  if (liveToggle instanceof HTMLButtonElement) {
    km56SetText(liveToggle, next ? '🔊 Voice on' : '🔇 Voice off');
    km56SetAttribute(liveToggle, 'aria-pressed', next);
  }
  const coachCardToggle = document.querySelector('#km55VoiceToggle');
  if (coachCardToggle instanceof HTMLButtonElement) {
    km56SetText(coachCardToggle, next ? '🔊' : '🔇');
    km56SetAttribute(coachCardToggle, 'aria-pressed', next);
  }
  const status = document.querySelector('#coachVoiceSetupStatus');
  if (status) {
    km56SetText(status, next ? 'Coach voice is on.' : 'Coach voice is off.');
    if (status.dataset.state !== (next ? 'ready' : 'off')) status.dataset.state = next ? 'ready' : 'off';
  }

  km56VoiceToggles += 1;
  km56UpdateVoiceButton();
}

function km56ToggleVoice(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  km56SetVoiceEnabled(!km56VoiceEnabled());
}

function km56PanelElements() {
  return {
    button: document.querySelector('#panelToggleButton'),
    panel: document.querySelector('#gameView .sidepanel'),
    backdrop: document.querySelector('#gamePanelBackdrop'),
  };
}

function km56SetPanelOpen(open) {
  const { button, panel, backdrop } = km56PanelElements();
  const gameMode = document.body?.classList.contains('game-mode');
  const narrow = window.matchMedia('(max-width: 980px)').matches;
  const next = Boolean(open && gameMode && narrow);
  const changed = Boolean(document.body?.classList.contains('game-panel-open')) !== next;

  if (changed) document.body?.classList.toggle('game-panel-open', next);
  if (button) {
    km56SetAttribute(button, 'aria-expanded', next);
    km56SetAttribute(button, 'aria-label', next ? 'Close game details' : 'Open game details');
    const title = next ? 'Close game details' : 'Game details';
    if (button.title !== title) button.title = title;
  }
  if (backdrop instanceof HTMLElement) {
    if (backdrop.hidden === next) backdrop.hidden = !next;
    km56SetAttribute(backdrop, 'aria-hidden', !next);
  }
  if (panel instanceof HTMLElement) {
    const inert = !next && narrow;
    if (panel.hasAttribute('inert') !== inert) panel.toggleAttribute('inert', inert);
    km56SetAttribute(panel, 'aria-hidden', inert);
    if (panel.dataset.kmatePanelOpen !== String(next)) panel.dataset.kmatePanelOpen = String(next);
  }

  if (changed) km56MenuToggles += 1;
  return next;
}

function km56TogglePanel(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const open = !document.body?.classList.contains('game-panel-open');
  km56SetPanelOpen(open);
}

function km56MenuTouchFallback(event) {
  if (event.pointerType !== 'touch') return;
  km56LastTouchMenuAt = performance.now();
  km56TogglePanel(event);
}

function km56MenuClick(event) {
  if (performance.now() - km56LastTouchMenuAt < 450) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  km56TogglePanel(event);
}

function km56ReplaceButton(selector, marker) {
  const existing = document.querySelector(selector);
  if (!(existing instanceof HTMLButtonElement)) return null;
  if (existing.dataset[marker] === KMATE_TOP_CONTROLS_V56) return existing;
  const replacement = existing.cloneNode(true);
  replacement.dataset[marker] = KMATE_TOP_CONTROLS_V56;
  existing.replaceWith(replacement);
  return replacement;
}

function km56InstallMenuControl() {
  const button = km56ReplaceButton('#panelToggleButton', 'kmateMenuV56');
  if (!button || button.dataset.kmateMenuListenerV56 === KMATE_TOP_CONTROLS_V56) return;
  button.dataset.kmateMenuListenerV56 = KMATE_TOP_CONTROLS_V56;
  button.type = 'button';
  button.setAttribute('aria-controls', 'gameView');
  button.addEventListener('pointerup', km56MenuTouchFallback);
  button.addEventListener('click', km56MenuClick);

  const originalBackdrop = document.querySelector('#gamePanelBackdrop');
  if (originalBackdrop instanceof HTMLButtonElement && originalBackdrop.dataset.kmateBackdropV56 !== KMATE_TOP_CONTROLS_V56) {
    const backdrop = originalBackdrop.cloneNode(true);
    backdrop.dataset.kmateBackdropV56 = KMATE_TOP_CONTROLS_V56;
    originalBackdrop.replaceWith(backdrop);
    backdrop.addEventListener('click', (event) => {
      event.preventDefault();
      km56SetPanelOpen(false);
    });
  }
  km56SetPanelOpen(document.body?.classList.contains('game-panel-open'));
}

function km56InstallVoiceControl() {
  const button = km56ReplaceButton('#gameCoachAudioButton', 'kmateVoiceV56');
  if (!button || button.dataset.kmateVoiceListenerV56 === KMATE_TOP_CONTROLS_V56) return;
  button.dataset.kmateVoiceListenerV56 = KMATE_TOP_CONTROLS_V56;
  button.type = 'button';
  button.addEventListener('click', km56ToggleVoice);
  km56UpdateVoiceButton(button);
}

function km56InstallSpeechFilter() {
  const synth = window.speechSynthesis;
  if (!synth || typeof synth.speak !== 'function' || km56SpeechPatched) return;
  if (synth.__kmateV56ReadyFilter) {
    km56SpeechPatched = true;
    return;
  }

  const upstreamSpeak = synth.speak.bind(synth);
  const filteredSpeak = function km56Speak(utterance) {
    const text = String(utterance?.text || '').replace(/\s+/g, ' ').trim();
    const inGame = Boolean(document.body?.classList.contains('game-mode'));
    const readinessPrompt = KMATE_AUTOMATIC_READY_SPEECH_V56.test(text)
      || (inGame && KMATE_PLAY_READY_SPEECH_V56.test(text));
    if (!readinessPrompt) return upstreamSpeak(utterance);

    km56SuppressedReadySpeech += 1;
    queueMicrotask(() => {
      try { utterance?.onend?.({ type: 'end', elapsedTime: 0, charIndex: text.length }); } catch {}
    });
    return undefined;
  };

  try {
    synth.speak = filteredSpeak;
    Object.defineProperty(synth, '__kmateV56ReadyFilter', { value: true, configurable: true });
    km56SpeechPatched = true;
  } catch (error) {
    console.warn('K-Mate could not suppress the coach readiness announcement.', error);
  }
}

function km56Refresh() {
  km56InstallStyles();
  km56InstallSpeechFilter();
  km56InstallMenuControl();
  km56InstallVoiceControl();
  km56UpdateVoiceButton();

  if (!document.body?.classList.contains('game-mode') || !window.matchMedia('(max-width: 980px)').matches) {
    km56SetPanelOpen(false);
  } else if (!document.body.classList.contains('game-panel-open')) {
    const { backdrop, panel } = km56PanelElements();
    if (backdrop instanceof HTMLElement && !backdrop.hidden) backdrop.hidden = true;
    if (panel instanceof HTMLElement && !panel.hasAttribute('inert')) panel.toggleAttribute('inert', true);
  }
}

function km56ScheduleRefresh() {
  if (km56RefreshFrame) return;
  km56RefreshFrame = window.requestAnimationFrame(() => {
    km56RefreshFrame = 0;
    km56Refresh();
  });
}

function km56InstallObservers() {
  if (!km56Observer && document.body) {
    km56Observer = new MutationObserver(km56ScheduleRefresh);
    km56Observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
  }
  document.addEventListener('change', (event) => {
    if (event.target === km56VoiceCheckbox()) km56UpdateVoiceButton();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body?.classList.contains('game-panel-open')) km56SetPanelOpen(false);
  });
  window.addEventListener('resize', km56ScheduleRefresh, { passive: true });
  window.visualViewport?.addEventListener?.('resize', km56ScheduleRefresh, { passive: true });
}

function km56State() {
  const { button, panel, backdrop } = km56PanelElements();
  return {
    ready: true,
    version: KMATE_TOP_CONTROLS_V56,
    menuOpen: Boolean(document.body?.classList.contains('game-panel-open')),
    menuExpanded: button?.getAttribute('aria-expanded') === 'true',
    panelVisible: Boolean(panel && getComputedStyle(panel).display !== 'none' && !panel.hasAttribute('inert')),
    backdropVisible: Boolean(backdrop && !backdrop.hidden),
    voiceEnabled: km56VoiceEnabled(),
    voiceButtonPressed: document.querySelector('#gameCoachAudioButton')?.getAttribute('aria-pressed') === 'true',
    suppressedReadySpeech: km56SuppressedReadySpeech,
    menuToggles: km56MenuToggles,
    voiceToggles: km56VoiceToggles,
  };
}

function km56Initialize() {
  document.documentElement.classList.add('kmate-top-controls-v56');
  km56InstallStyles();
  km56InstallObservers();
  km56Refresh();
  window.__KMATE_TOP_CONTROLS_V56__ = {
    version: KMATE_TOP_CONTROLS_V56,
    refresh: km56Refresh,
    setPanelOpen: km56SetPanelOpen,
    setVoiceEnabled: km56SetVoiceEnabled,
    state: km56State,
  };
  window.setTimeout(km56Refresh, 100);
  window.setTimeout(km56Refresh, 600);
  window.setTimeout(km56Refresh, 1600);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', km56Initialize, { once: true });
else km56Initialize();
