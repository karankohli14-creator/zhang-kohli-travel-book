const KMATE_BOARD_FOCUS_V49 = '49.0.0';
const KMATE_STORE_KEY_V49 = 'kmate-position-v7';
const KMATE_V48_GAIN = 0.24;
const KMATE_EFFECTIVE_MOVE_VOLUME_V49 = 0.10;

let kmateV49ScaledGainWrites = 0;
let kmateV49ScaledMediaPlays = 0;
let kmateV49SpeechRequests = 0;
let kmateV49SpeechStarts = 0;
let kmateV49SpeechErrors = 0;
let kmateV49SuppressedReadyPrompts = 0;
let kmateV49LastSpeechKey = '';
let kmateV49PendingSpeechKey = '';
let kmateV49LastSpeechRequestedAt = 0;
let kmateV49ForceCoachReplay = false;
let kmateV49CoachFallbackTimer = 0;
let kmateV49Compact = false;
let kmateV49Fullscreen = false;
let kmateV49HintOpen = false;
let kmateV49NativeSpeechSpeak = null;
let kmateV49FallbackSpeechSpeak = null;
let kmateV49SpeechSynthesis = null;
let kmateV49SpeechOverrideInstalled = false;
let kmateV49CoachObserver = null;
let kmateV49BodyObserver = null;
let kmateV49AudioParamPatched = false;
let kmateV49MediaPlayPatched = false;

function kmateV49InstallStyles() {
  if (document.querySelector('#kmateBoardFocusV49Styles')) return;
  const link = document.createElement('link');
  link.id = 'kmateBoardFocusV49Styles';
  link.rel = 'stylesheet';
  link.href = new URL(`./mobile-board-focus-v49.css?v=${KMATE_BOARD_FOCUS_V49}`, import.meta.url).href;
  document.head.append(link);
}

function kmateV49ReadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KMATE_STORE_KEY_V49) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function kmateV49CoachVoiceEnabled() {
  const stored = kmateV49ReadStore()?.settings?.coachVoice;
  const toggle = document.querySelector('#liveCoachVoiceToggle');
  const pressed = toggle?.getAttribute('aria-pressed');
  if (pressed === 'false') return false;
  return stored !== false;
}

function kmateV49IsCompactDevice() {
  const width = Math.round(window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0);
  const coarse = window.matchMedia?.('(pointer:coarse)')?.matches;
  const noHover = window.matchMedia?.('(hover:none)')?.matches;
  const mobileAgent = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || '');
  return Boolean(width <= 1100 || coarse || noHover || mobileAgent);
}

function kmateV49DispatchLayoutRefresh() {
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
    window.visualViewport?.dispatchEvent?.(new Event('resize'));
  });
}

function kmateV49SyncCompactMode() {
  const next = kmateV49IsCompactDevice();
  kmateV49Compact = next;
  document.body?.classList.toggle('km49-compact-game', next);
  document.documentElement.classList.toggle('kmate-board-focus-v49', true);
  if (!document.body?.classList.contains('game-mode')) {
    document.body?.classList.remove('km49-hint-open', 'km49-fullscreen');
    document.body?.classList.remove('board-focus');
    kmateV49HintOpen = false;
    kmateV49Fullscreen = false;
  }
  kmateV49UpdateFullscreenButton();
}

function kmateV49InstallAudioAttenuation() {
  const audioParamPrototype = window.AudioParam?.prototype;
  if (audioParamPrototype?.setValueAtTime && !audioParamPrototype.__kmateV49MoveGainPatched) {
    const nativeSetValueAtTime = audioParamPrototype.setValueAtTime;
    try {
      Object.defineProperty(audioParamPrototype, '__kmateV49MoveGainPatched', { value: true, configurable: true });
      audioParamPrototype.setValueAtTime = function kmateV49SetValueAtTime(value, startTime) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && Math.abs(numeric - KMATE_V48_GAIN) < 0.000001) {
          kmateV49ScaledGainWrites += 1;
          return nativeSetValueAtTime.call(this, KMATE_EFFECTIVE_MOVE_VOLUME_V49, startTime);
        }
        return nativeSetValueAtTime.call(this, value, startTime);
      };
      kmateV49AudioParamPatched = true;
    } catch (error) {
      console.warn('K-Mate could not attenuate the Web Audio move gain.', error);
    }
  }

  const mediaPrototype = window.HTMLMediaElement?.prototype;
  if (mediaPrototype?.play && !mediaPrototype.__kmateV49MoveVolumePatched) {
    const nativePlay = mediaPrototype.play;
    try {
      Object.defineProperty(mediaPrototype, '__kmateV49MoveVolumePatched', { value: true, configurable: true });
      mediaPrototype.play = function kmateV49MediaPlay(...args) {
        const source = String(this.currentSrc || this.src || '');
        if (source.includes('kmate-reference-move-v28.wav')) {
          try { this.volume = KMATE_EFFECTIVE_MOVE_VOLUME_V49; } catch {}
          kmateV49ScaledMediaPlays += 1;
        }
        return nativePlay.apply(this, args);
      };
      kmateV49MediaPlayPatched = true;
    } catch (error) {
      console.warn('K-Mate could not attenuate the HTML move-audio fallback.', error);
    }
  }
}

function kmateV49CleanCoachCopy(value, limit = 300) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:mistake|blunder|inaccurate|inaccuracy|miss)[\s:,.!–—-]*/i, '');
  text = text.split(/\s+(?:Concrete line:|The engine continuation is|Stockfish(?:'s)? line begins)\s*/i)[0].trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const stop = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf(';'));
  return `${(stop > limit * 0.55 ? clipped.slice(0, stop + 1) : clipped).trim()}…`;
}

function kmateV49PrincipleText() {
  const visible = document.querySelector('#kmateV48PrincipleText')?.textContent?.trim();
  if (visible) return kmateV49CleanCoachCopy(visible, 210);
  const card = document.querySelector('#liveCoachPrincipleList .principle-diagnosis-card');
  const title = card?.querySelector('b')?.textContent?.trim() || '';
  const evidence = card?.querySelector('.principle-diagnosis-evidence')?.textContent?.trim() || '';
  if (title) return kmateV49CleanCoachCopy(`${title}${evidence ? `. ${evidence}` : ''}`, 210);
  const hidden = document.querySelector('#liveCoachPrinciplesText')?.textContent?.trim() || '';
  if (hidden) return kmateV49CleanCoachCopy(hidden, 210);
  return 'Check the opponent’s forcing replies and compare candidate moves before committing.';
}

function kmateV49CoachData() {
  const why = kmateV49CleanCoachCopy(document.querySelector('#liveCoachWhy')?.textContent, 310);
  const principle = kmateV49PrincipleText();
  const best = kmateV49CleanCoachCopy(document.querySelector('#liveCoachBestText')?.textContent, 285);
  const yourMove = document.querySelector('#liveCoachYourMove')?.textContent?.trim() || '';
  const bestMove = document.querySelector('#liveCoachBestMove')?.textContent?.trim() || '';
  const text = [
    why ? `Why your move was bad: ${why}` : '',
    principle ? `Principle violated: ${principle}` : '',
    best ? `How the stronger move improves your position: ${best}` : '',
  ].filter(Boolean).join(' ');
  return {
    why,
    principle,
    best,
    yourMove,
    bestMove,
    text,
    key: `${yourMove}|${bestMove}|${why}|${principle}|${best}`,
  };
}

function kmateV49LiveCoachVisible() {
  const panel = document.querySelector('#liveCoachBoardPanel');
  const view = document.querySelector('#gameView');
  return Boolean(panel && !panel.hidden && view?.classList.contains('live-coach-active'));
}

function kmateV49CompleteSuppressedUtterance(utterance) {
  window.setTimeout(() => {
    try { utterance?.onend?.({ type: 'end', elapsedTime: 0, charIndex: 0, name: '' }); } catch {}
  }, 0);
}

function kmateV49CopyUtteranceSettings(source, target) {
  for (const property of ['voice', 'lang', 'rate', 'pitch', 'volume']) {
    try {
      const value = source?.[property];
      if (value !== undefined && value !== null) target[property] = value;
    } catch {}
  }
}

function kmateV49ChooseFallbackVoice() {
  const voices = kmateV49SpeechSynthesis?.getVoices?.() || [];
  if (!voices.length) return null;
  const preferred = voices.filter((voice) => /^en[-_]GB/i.test(voice.lang || ''));
  return preferred[0] || voices.find((voice) => /^en/i.test(voice.lang || '')) || voices[0] || null;
}

function kmateV49CallNativeSpeak(utterance) {
  if (kmateV49NativeSpeechSpeak) return kmateV49NativeSpeechSpeak.call(kmateV49SpeechSynthesis, utterance);
  if (kmateV49FallbackSpeechSpeak) return kmateV49FallbackSpeechSpeak(utterance);
  throw new Error('Speech synthesis speak method is unavailable');
}

function kmateV49SpeakCoachFromCore(originalUtterance, { force = false } = {}) {
  const data = kmateV49CoachData();
  if (!data.text) {
    kmateV49CompleteSuppressedUtterance(originalUtterance);
    return false;
  }
  if (!force && (data.key === kmateV49LastSpeechKey || data.key === kmateV49PendingSpeechKey)) {
    kmateV49CompleteSuppressedUtterance(originalUtterance);
    return false;
  }

  const replacement = new SpeechSynthesisUtterance(data.text);
  kmateV49CopyUtteranceSettings(originalUtterance, replacement);
  if (!replacement.voice) replacement.voice = kmateV49ChooseFallbackVoice();
  replacement.lang = replacement.voice?.lang || replacement.lang || 'en-GB';
  replacement.rate = Math.max(0.82, Math.min(1.02, Number(replacement.rate) || 0.92));
  replacement.volume = 1;
  replacement.onstart = (event) => {
    kmateV49SpeechStarts += 1;
    kmateV49LastSpeechKey = data.key;
    kmateV49PendingSpeechKey = '';
    try { originalUtterance?.onstart?.(event); } catch {}
  };
  replacement.onend = (event) => {
    kmateV49LastSpeechKey = data.key;
    kmateV49PendingSpeechKey = '';
    try { originalUtterance?.onend?.(event); } catch {}
  };
  replacement.onerror = (event) => {
    kmateV49SpeechErrors += 1;
    kmateV49PendingSpeechKey = '';
    try { originalUtterance?.onerror?.(event); } catch {}
  };

  kmateV49SpeechRequests += 1;
  kmateV49LastSpeechRequestedAt = performance.now();
  kmateV49PendingSpeechKey = data.key;
  kmateV49ForceCoachReplay = false;
  try {
    kmateV49SpeechSynthesis?.resume?.();
    kmateV49CallNativeSpeak(replacement);
    return true;
  } catch (error) {
    kmateV49SpeechErrors += 1;
    kmateV49PendingSpeechKey = '';
    console.warn('K-Mate v49 coach narration could not start.', error);
    try { originalUtterance?.onerror?.({ error: 'synthesis-failed' }); } catch {}
    return false;
  }
}

function kmateV49SpeakCoachDirect({ force = false } = {}) {
  if (!kmateV49CoachVoiceEnabled() || !kmateV49LiveCoachVisible()) return false;
  const data = kmateV49CoachData();
  if (!data.text) return false;
  if (!force && (data.key === kmateV49LastSpeechKey || data.key === kmateV49PendingSpeechKey)) return false;

  const utterance = new SpeechSynthesisUtterance(data.text);
  utterance.voice = kmateV49ChooseFallbackVoice();
  utterance.lang = utterance.voice?.lang || 'en-GB';
  utterance.rate = 0.92;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onstart = () => {
    kmateV49SpeechStarts += 1;
    kmateV49LastSpeechKey = data.key;
    kmateV49PendingSpeechKey = '';
  };
  utterance.onend = () => {
    kmateV49LastSpeechKey = data.key;
    kmateV49PendingSpeechKey = '';
  };
  utterance.onerror = () => {
    kmateV49SpeechErrors += 1;
    kmateV49PendingSpeechKey = '';
  };

  kmateV49SpeechRequests += 1;
  kmateV49LastSpeechRequestedAt = performance.now();
  kmateV49PendingSpeechKey = data.key;
  try {
    kmateV49SpeechSynthesis?.cancel?.();
    kmateV49SpeechSynthesis?.resume?.();
    kmateV49CallNativeSpeak(utterance);
    return true;
  } catch (error) {
    kmateV49SpeechErrors += 1;
    kmateV49PendingSpeechKey = '';
    console.warn('K-Mate v49 fallback narration could not start.', error);
    return false;
  }
}

function kmateV49InstallSpeechOverride() {
  const synth = window.speechSynthesis;
  if (!synth || !window.SpeechSynthesisUtterance || kmateV49SpeechOverrideInstalled) return false;
  kmateV49SpeechSynthesis = synth;
  const prototype = Object.getPrototypeOf(synth);
  kmateV49NativeSpeechSpeak = typeof prototype?.speak === 'function' ? prototype.speak : null;
  kmateV49FallbackSpeechSpeak = typeof synth.speak === 'function' ? synth.speak.bind(synth) : null;

  const speak = (utterance) => {
    const text = String(utterance?.text || '').replace(/\s+/g, ' ').trim();
    if (/^coach voice ready\.?$/i.test(text)) {
      kmateV49SuppressedReadyPrompts += 1;
      kmateV49CompleteSuppressedUtterance(utterance);
      return;
    }
    if (kmateV49LiveCoachVisible()) {
      kmateV49SpeakCoachFromCore(utterance, { force: kmateV49ForceCoachReplay });
      return;
    }
    try {
      kmateV49CallNativeSpeak(utterance);
    } catch (error) {
      kmateV49SpeechErrors += 1;
      console.warn('K-Mate voice playback failed.', error);
      try { utterance?.onerror?.({ error: 'synthesis-failed' }); } catch {}
    }
  };

  try {
    Object.defineProperty(synth, 'speak', { value: speak, configurable: true, writable: true });
    kmateV49SpeechOverrideInstalled = true;
  } catch {
    try {
      synth.speak = speak;
      kmateV49SpeechOverrideInstalled = synth.speak === speak;
    } catch {}
  }
  return kmateV49SpeechOverrideInstalled;
}

function kmateV49PrimeCoachVoice() {
  try { kmateV49SpeechSynthesis?.resume?.(); } catch {}
  return Boolean(kmateV49SpeechSynthesis);
}

function kmateV49ScheduleCoachFallback() {
  window.clearTimeout(kmateV49CoachFallbackTimer);
  if (!kmateV49LiveCoachVisible() || !kmateV49CoachVoiceEnabled()) return;
  const data = kmateV49CoachData();
  if (!data.text) return;
  kmateV49CoachFallbackTimer = window.setTimeout(() => {
    if (!kmateV49LiveCoachVisible() || !kmateV49CoachVoiceEnabled()) return;
    const current = kmateV49CoachData();
    if (!current.text || current.key !== data.key) return;
    const recentRequest = performance.now() - kmateV49LastSpeechRequestedAt < 1800;
    if (!recentRequest && current.key !== kmateV49LastSpeechKey && current.key !== kmateV49PendingSpeechKey) {
      kmateV49SpeakCoachDirect();
    }
  }, 900);
}

function kmateV49ObserveCoach() {
  const panel = document.querySelector('#liveCoachBoardPanel');
  if (!panel || kmateV49CoachObserver) return;
  kmateV49CoachObserver = new MutationObserver(() => kmateV49ScheduleCoachFallback());
  kmateV49CoachObserver.observe(panel, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'class', 'aria-pressed'],
  });
  kmateV49ScheduleCoachFallback();
}

function kmateV49EnsureHintButton() {
  const gameView = document.querySelector('#gameView');
  if (!gameView) return null;
  let button = document.querySelector('#kmateHintEdgeButton');
  if (!button) {
    button = document.createElement('button');
    button.id = 'kmateHintEdgeButton';
    button.type = 'button';
    gameView.append(button);
  }
  button.innerHTML = '<span aria-hidden="true">💡</span>';
  button.title = 'Coach hint';
  button.setAttribute('aria-label', kmateV49HintOpen ? 'Close coach hint' : 'Open coach hint');
  button.setAttribute('aria-expanded', String(kmateV49HintOpen));
  return button;
}

function kmateV49SetHintOpen(open) {
  kmateV49HintOpen = Boolean(open && kmateV49Compact && document.body?.classList.contains('game-mode'));
  document.body?.classList.toggle('km49-hint-open', kmateV49HintOpen);
  document.body?.classList.remove('km48-hint-open');
  const button = kmateV49EnsureHintButton();
  button?.setAttribute('aria-expanded', String(kmateV49HintOpen));
  button?.setAttribute('aria-label', kmateV49HintOpen ? 'Close coach hint' : 'Open coach hint');
  if (kmateV49HintOpen) {
    window.setTimeout(() => {
      const reveal = document.querySelector('#showHintButton');
      const title = document.querySelector('#hintTitle')?.textContent?.trim() || '';
      if (reveal && !reveal.disabled && /hidden|strategic clue|show hint/i.test(title)) reveal.click();
    }, 0);
  }
}

function kmateV49UpdateFullscreenButton() {
  const button = document.querySelector('#fullscreenButton');
  if (!button) return;
  const active = Boolean(document.body?.classList.contains('km49-fullscreen'));
  button.innerHTML = `<span aria-hidden="true">${active ? '⤡' : '⛶'}</span>`;
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Exit board full screen' : 'Make board full screen');
  button.title = active ? 'Exit board full screen' : 'Make board full screen';
  button.classList.toggle('active', active);
}

async function kmateV49SetFullscreen(open) {
  const next = Boolean(open && document.body?.classList.contains('game-mode'));
  kmateV49Fullscreen = next;
  kmateV49SetHintOpen(false);
  document.body?.classList.toggle('km49-fullscreen', next);
  document.body?.classList.toggle('board-focus', next);
  document.body?.classList.remove('game-panel-open');
  kmateV49UpdateFullscreenButton();
  kmateV49DispatchLayoutRefresh();

  if (next) {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // CSS focus mode is the intended iPhone fallback.
    }
  } else if (document.fullscreenElement) {
    try { await document.exitFullscreen?.(); } catch {}
  }
}

function kmateV49HandleClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const fullscreen = target?.closest('#fullscreenButton');
  if (fullscreen) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void kmateV49SetFullscreen(!document.body?.classList.contains('km49-fullscreen'));
    return;
  }

  const hint = target?.closest('#kmateHintEdgeButton');
  if (hint) {
    event.preventDefault();
    event.stopImmediatePropagation();
    kmateV49SetHintOpen(!kmateV49HintOpen);
    return;
  }

  if (target?.closest('#liveCoachSpeakButton')) {
    kmateV49ForceCoachReplay = true;
    kmateV49PrimeCoachVoice();
    return;
  }

  if (kmateV49HintOpen && !target?.closest('#hintCard')) kmateV49SetHintOpen(false);
}

function kmateV49HandleFullscreenChange() {
  if (!document.fullscreenElement && document.body?.classList.contains('km49-fullscreen')) {
    kmateV49Fullscreen = false;
    document.body.classList.remove('km49-fullscreen', 'board-focus');
    kmateV49UpdateFullscreenButton();
    kmateV49DispatchLayoutRefresh();
  }
}

function kmateV49ObserveBody() {
  if (kmateV49BodyObserver || !document.body) return;
  let previousGameMode = document.body.classList.contains('game-mode');
  kmateV49BodyObserver = new MutationObserver(() => {
    const gameMode = document.body.classList.contains('game-mode');
    if (gameMode !== previousGameMode) {
      previousGameMode = gameMode;
      kmateV49SetHintOpen(false);
      if (!gameMode) {
        kmateV49Fullscreen = false;
        document.body.classList.remove('km49-fullscreen', 'board-focus');
      }
      kmateV49UpdateFullscreenButton();
      kmateV49DispatchLayoutRefresh();
    }
  });
  kmateV49BodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function kmateV49ExposeDiagnostics() {
  window.__KMATE_BOARD_FOCUS_V49__ = {
    version: KMATE_BOARD_FOCUS_V49,
    setFullscreen: kmateV49SetFullscreen,
    setHintOpen: kmateV49SetHintOpen,
    speakCoach: kmateV49SpeakCoachDirect,
    coachData: kmateV49CoachData,
    state: () => ({
      ready: true,
      version: KMATE_BOARD_FOCUS_V49,
      compact: kmateV49Compact,
      fullscreen: document.body?.classList.contains('km49-fullscreen') || false,
      hintOpen: kmateV49HintOpen,
      effectiveMoveVolume: KMATE_EFFECTIVE_MOVE_VOLUME_V49,
      audioParamPatched: kmateV49AudioParamPatched,
      mediaPlayPatched: kmateV49MediaPlayPatched,
      scaledGainWrites: kmateV49ScaledGainWrites,
      scaledMediaPlays: kmateV49ScaledMediaPlays,
      speechOverrideInstalled: kmateV49SpeechOverrideInstalled,
      nativeSpeechAvailable: Boolean(kmateV49NativeSpeechSpeak),
      speechRequests: kmateV49SpeechRequests,
      speechStarts: kmateV49SpeechStarts,
      speechErrors: kmateV49SpeechErrors,
      suppressedReadyPrompts: kmateV49SuppressedReadyPrompts,
      lastSpeechKey: kmateV49LastSpeechKey,
      titleHidden: Boolean(document.querySelector('#positionTitle') && getComputedStyle(document.querySelector('#positionTitle')).display === 'none'),
      hintIsEdgeControl: Boolean(document.querySelector('#kmateHintEdgeButton')),
    }),
  };
}

function kmateV49Initialize() {
  kmateV49InstallStyles();
  kmateV49InstallAudioAttenuation();
  kmateV49InstallSpeechOverride();
  kmateV49SyncCompactMode();
  kmateV49EnsureHintButton();
  kmateV49ObserveCoach();
  kmateV49ObserveBody();
  kmateV49ExposeDiagnostics();

  window.addEventListener('pointerdown', kmateV49PrimeCoachVoice, { capture: true, passive: true });
  window.addEventListener('touchstart', kmateV49PrimeCoachVoice, { capture: true, passive: true });
  window.addEventListener('keydown', kmateV49PrimeCoachVoice, { capture: true });
  document.addEventListener('click', kmateV49HandleClick, true);
  document.addEventListener('fullscreenchange', kmateV49HandleFullscreenChange);
  window.addEventListener('resize', kmateV49SyncCompactMode, { passive: true });
  window.visualViewport?.addEventListener?.('resize', kmateV49SyncCompactMode, { passive: true });

  window.setTimeout(() => {
    kmateV49InstallSpeechOverride();
    kmateV49EnsureHintButton();
    kmateV49ObserveCoach();
    kmateV49SyncCompactMode();
    kmateV49ExposeDiagnostics();
  }, 1000);
}

kmateV49InstallStyles();
kmateV49InstallAudioAttenuation();
kmateV49InstallSpeechOverride();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', kmateV49Initialize, { once: true });
} else {
  kmateV49Initialize();
}
