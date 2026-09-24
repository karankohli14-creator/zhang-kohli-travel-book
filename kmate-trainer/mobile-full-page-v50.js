const KMATE_MOBILE_FULL_PAGE_V50 = '50.0.0';
const KMATE_STORE_KEY_V50 = 'kmate-position-v7';
const KMATE_V48_MOVE_GAIN = 0.24;
const KMATE_EFFECTIVE_MOVE_GAIN_V50 = 0.10;

let km50HintOpen = false;
let km50Immersive = false;
let km50HintObserver = null;
let km50BodyObserver = null;
let km50PawnObserver = null;
let km50PawnSerial = 0;
let km50PawnApplications = 0;
let km50SpeechSynth = null;
let km50NativeSpeak = null;
let km50FallbackSpeak = null;
let km50SpeechInstalled = false;
let km50LastCoachKey = '';
let km50PendingCoachKey = '';
let km50SpeechRequests = 0;
let km50SpeechStarts = 0;
let km50SpeechErrors = 0;
let km50SuppressedReadyPrompts = 0;
let km50CoachFallbackTimer = 0;
let km50ScaledGainWrites = 0;
let km50ScaledMediaPlays = 0;

function km50InstallStyles() {
  if (document.querySelector('#kmateMobileFullPageV50Styles')) return;
  const link = document.createElement('link');
  link.id = 'kmateMobileFullPageV50Styles';
  link.rel = 'stylesheet';
  link.href = new URL(`./mobile-full-page-v50.css?v=${KMATE_MOBILE_FULL_PAGE_V50}`, import.meta.url).href;
  document.head.append(link);
}

function km50ReadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KMATE_STORE_KEY_V50) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function km50WriteStore(store) {
  try {
    if (store && typeof store === 'object') localStorage.setItem(KMATE_STORE_KEY_V50, JSON.stringify(store));
  } catch {}
}

function km50DisableAutomaticHints() {
  const store = km50ReadStore();
  if (store?.settings && store.settings.autoHints !== false) {
    store.settings.autoHints = false;
    km50WriteStore(store);
  }
  const checkbox = document.querySelector('#autoHints');
  if (checkbox && checkbox.checked) {
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  }
  checkbox?.closest('label')?.setAttribute('hidden', '');
}

function km50HidePositionTitle() {
  const title = document.querySelector('#positionTitle');
  const meta = document.querySelector('#gameMeta');
  const wrapper = title?.parentElement || meta?.parentElement;
  if (wrapper) {
    wrapper.hidden = true;
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.dataset.kmateHiddenTitle = KMATE_MOBILE_FULL_PAGE_V50;
  }
}

function km50StripOldButtonListener(selector, marker) {
  const existing = document.querySelector(selector);
  if (!existing) return null;
  if (existing.dataset[marker] === KMATE_MOBILE_FULL_PAGE_V50) return existing;
  const replacement = existing.cloneNode(true);
  replacement.dataset[marker] = KMATE_MOBILE_FULL_PAGE_V50;
  existing.replaceWith(replacement);
  return replacement;
}

function km50HintCard() {
  return document.querySelector('#hintCard');
}

function km50HintAction() {
  return document.querySelector('#showHintButton');
}

function km50UpdateHintButton() {
  const button = document.querySelector('#kmateHintEdgeButton');
  if (!button) return;
  button.innerHTML = '<span aria-hidden="true">💡</span>';
  button.hidden = false;
  button.title = km50HintOpen ? 'Close coach hint' : 'Open coach hint';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-expanded', String(km50HintOpen));
}

function km50CloseHint() {
  km50HintOpen = false;
  document.body?.classList.remove('km50-hint-open', 'km48-hint-open', 'km49-hint-open');
  const card = km50HintCard();
  if (card) {
    card.hidden = true;
    card.setAttribute('aria-hidden', 'true');
  }
  km50UpdateHintButton();
}

function km50RequestStrategicHintIfNeeded() {
  if (!km50HintOpen) return;
  const button = km50HintAction();
  const title = document.querySelector('#hintTitle')?.textContent?.trim() || '';
  const label = button?.textContent?.replace(/\s+/g, ' ').trim() || '';
  if (
    button
    && !button.disabled
    && (/^show hint$/i.test(label) || /hidden for this move|automatic hint preparing/i.test(title))
  ) {
    button.click();
  }
}

function km50OpenHint() {
  if (!document.body?.classList.contains('game-mode')) return;
  const card = km50HintCard();
  if (!card) return;
  km50HintOpen = true;
  document.body.classList.remove('km48-hint-open', 'km49-hint-open');
  document.body.classList.add('km50-hint-open');
  card.hidden = false;
  card.setAttribute('aria-hidden', 'false');
  km50UpdateHintButton();
  window.setTimeout(km50RequestStrategicHintIfNeeded, 30);
}

function km50ToggleHint() {
  if (km50HintOpen) km50CloseHint();
  else km50OpenHint();
}

function km50RefreshHintState() {
  const title = document.querySelector('#hintTitle')?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const action = km50HintAction();
  const card = km50HintCard();
  if (!card) return;

  const state = /candidate revealed/i.test(title)
    ? 'candidate'
    : /strategic hint/i.test(title)
      ? 'strategic'
      : /analyzing/i.test(title)
        ? 'loading'
        : /waiting for your turn/i.test(title)
          ? 'waiting'
          : 'hidden';
  card.dataset.kmateHintState = state;

  if (action) {
    const label = action.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (/reveal candidate/i.test(label)) {
      action.setAttribute('aria-label', 'Reveal candidate move');
      action.title = 'Reveal candidate move';
    } else if (/candidate shown/i.test(label)) {
      action.setAttribute('aria-label', 'Candidate move shown');
      action.title = 'Candidate move shown';
    } else {
      action.setAttribute('aria-label', label || 'Show coach hint');
      action.title = label || 'Show coach hint';
    }
  }

  if (/waiting for your turn|hints unavailable/i.test(title)) km50CloseHint();
}

function km50EnsureHintControls() {
  const gameView = document.querySelector('#gameView');
  if (!gameView) return;
  let button = document.querySelector('#kmateHintEdgeButton');
  if (!button) {
    button = document.createElement('button');
    button.id = 'kmateHintEdgeButton';
    button.type = 'button';
    gameView.append(button);
  }
  button = km50StripOldButtonListener('#kmateHintEdgeButton', 'kmateV50HintBound') || button;
  button.type = 'button';
  if (button.dataset.kmateV50Listener !== KMATE_MOBILE_FULL_PAGE_V50) {
    button.dataset.kmateV50Listener = KMATE_MOBILE_FULL_PAGE_V50;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      km50ToggleHint();
    });
  }
  km50UpdateHintButton();

  const action = km50HintAction();
  if (action && action.dataset.kmateV50Bound !== KMATE_MOBILE_FULL_PAGE_V50) {
    action.dataset.kmateV50Bound = KMATE_MOBILE_FULL_PAGE_V50;
    action.addEventListener('click', () => {
      if (!km50HintOpen) km50OpenHint();
      window.setTimeout(km50RefreshHintState, 0);
      window.setTimeout(km50RefreshHintState, 450);
    });
  }

  const card = km50HintCard();
  if (card && !km50HintOpen) {
    card.hidden = true;
    card.setAttribute('aria-hidden', 'true');
  }

  if (!km50HintObserver && card) {
    km50HintObserver = new MutationObserver(km50RefreshHintState);
    km50HintObserver.observe(card, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'hidden'],
    });
  }
}

function km50UpdateFullscreenButton() {
  const button = document.querySelector('#fullscreenButton');
  if (!button) return;
  button.innerHTML = `<span aria-hidden="true">${km50Immersive ? '⤡' : '⛶'}</span>`;
  button.setAttribute('aria-pressed', String(km50Immersive));
  button.setAttribute('aria-label', km50Immersive ? 'Exit immersive board' : 'Enter immersive board');
  button.title = button.getAttribute('aria-label');
  button.classList.toggle('active', km50Immersive);
}

async function km50SetImmersive(open) {
  km50Immersive = Boolean(open && document.body?.classList.contains('game-mode'));
  km50CloseHint();
  document.body?.classList.toggle('km50-immersive', km50Immersive);
  document.body?.classList.toggle('board-focus', km50Immersive);
  document.body?.classList.remove('game-panel-open', 'km49-fullscreen');
  km50UpdateFullscreenButton();
  window.dispatchEvent(new Event('resize'));
  window.visualViewport?.dispatchEvent?.(new Event('resize'));

  if (km50Immersive) {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // CSS full-page mode is the intended fallback on iPhone and in-app browsers.
    }
  } else if (document.fullscreenElement) {
    try { await document.exitFullscreen?.(); } catch {}
  }
}

function km50EnsureFullscreenControl() {
  let button = document.querySelector('#fullscreenButton');
  if (!button) return;
  button = km50StripOldButtonListener('#fullscreenButton', 'kmateV50FullscreenBound') || button;
  if (button.dataset.kmateV50Listener !== KMATE_MOBILE_FULL_PAGE_V50) {
    button.dataset.kmateV50Listener = KMATE_MOBILE_FULL_PAGE_V50;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void km50SetImmersive(!km50Immersive);
    });
  }
  km50UpdateFullscreenButton();
}

function km50HandleFullscreenChange() {
  if (!document.fullscreenElement && km50Immersive) {
    km50Immersive = false;
    document.body?.classList.remove('km50-immersive', 'board-focus');
    km50UpdateFullscreenButton();
  }
}

function km50HandleOutsideClick(event) {
  if (!km50HintOpen) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('#hintCard,#kmateHintEdgeButton')) return;
  km50CloseHint();
}

function km50SyncGameMode() {
  const gameMode = Boolean(document.body?.classList.contains('game-mode'));
  document.documentElement.classList.add('kmate-mobile-full-page-v50');
  document.body?.classList.toggle('km50-full-page-game', gameMode);
  km50HidePositionTitle();
  km50DisableAutomaticHints();
  km50EnsureHintControls();
  km50EnsureFullscreenControl();
  if (!gameMode) {
    km50CloseHint();
    km50Immersive = false;
    document.body?.classList.remove('km50-immersive', 'board-focus');
    km50UpdateFullscreenButton();
  }
  window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

function km50InstallGameObserver() {
  if (km50BodyObserver || !document.body) return;
  km50BodyObserver = new MutationObserver(km50SyncGameMode);
  km50BodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function km50InstallAudioAttenuation() {
  const audioParamPrototype = window.AudioParam?.prototype;
  if (audioParamPrototype?.setValueAtTime && !audioParamPrototype.__kmateV50MoveGainPatched) {
    const nativeSetValueAtTime = audioParamPrototype.setValueAtTime;
    try {
      Object.defineProperty(audioParamPrototype, '__kmateV50MoveGainPatched', { value: true, configurable: true });
      audioParamPrototype.setValueAtTime = function km50SetValueAtTime(value, startTime) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && Math.abs(numeric - KMATE_V48_MOVE_GAIN) < 0.000001) {
          km50ScaledGainWrites += 1;
          return nativeSetValueAtTime.call(this, KMATE_EFFECTIVE_MOVE_GAIN_V50, startTime);
        }
        return nativeSetValueAtTime.call(this, value, startTime);
      };
    } catch (error) {
      console.warn('K-Mate v50 could not attenuate Web Audio move feedback.', error);
    }
  }

  const mediaPrototype = window.HTMLMediaElement?.prototype;
  if (mediaPrototype?.play && !mediaPrototype.__kmateV50MoveVolumePatched) {
    const nativePlay = mediaPrototype.play;
    try {
      Object.defineProperty(mediaPrototype, '__kmateV50MoveVolumePatched', { value: true, configurable: true });
      mediaPrototype.play = function km50MediaPlay(...args) {
        const source = String(this.currentSrc || this.src || '');
        if (source.includes('kmate-reference-move-v28.wav')) {
          try { this.volume = KMATE_EFFECTIVE_MOVE_GAIN_V50; } catch {}
          km50ScaledMediaPlays += 1;
        }
        return nativePlay.apply(this, args);
      };
    } catch (error) {
      console.warn('K-Mate v50 could not attenuate HTML move feedback.', error);
    }
  }
}

function km50CleanCoachText(value, limit = 310) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:mistake|blunder|inaccurate|inaccuracy|miss)[\s:,.!–—-]*/i, '');
  text = text.split(/\s+(?:Concrete line:|The engine continuation is|Stockfish(?:'s)? line begins)\s*/i)[0].trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const stop = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf(';'));
  return `${(stop > limit * .55 ? clipped.slice(0, stop + 1) : clipped).trim()}…`;
}

function km50CoachData() {
  const why = km50CleanCoachText(document.querySelector('#liveCoachWhy')?.textContent, 310);
  const principle = km50CleanCoachText(
    document.querySelector('#kmateV48PrincipleText')?.textContent
      || document.querySelector('#liveCoachPrincipleList .principle-diagnosis-card b')?.textContent
      || document.querySelector('#liveCoachPrinciplesText')?.textContent,
    210,
  );
  const best = km50CleanCoachText(document.querySelector('#liveCoachBestText')?.textContent, 285);
  const yourMove = document.querySelector('#liveCoachYourMove')?.textContent?.trim() || '';
  const bestMove = document.querySelector('#liveCoachBestMove')?.textContent?.trim() || '';
  const text = [
    why ? `Why your move was bad: ${why}` : '',
    principle ? `Principle violated: ${principle}` : '',
    best ? `How the stronger move improves your position: ${best}` : '',
  ].filter(Boolean).join(' ');
  return { why, principle, best, yourMove, bestMove, text, key: `${yourMove}|${bestMove}|${why}|${principle}|${best}` };
}

function km50CoachVisible() {
  const panel = document.querySelector('#liveCoachBoardPanel');
  return Boolean(panel && !panel.hidden && document.querySelector('#gameView')?.classList.contains('live-coach-active'));
}

function km50CoachVoiceEnabled() {
  const toggle = document.querySelector('#liveCoachVoiceToggle');
  if (toggle?.getAttribute('aria-pressed') === 'false') return false;
  return km50ReadStore()?.settings?.coachVoice !== false;
}

function km50ChooseVoice() {
  const voices = km50SpeechSynth?.getVoices?.() || [];
  return voices.find((voice) => /^en[-_]GB/i.test(voice.lang || ''))
    || voices.find((voice) => /^en/i.test(voice.lang || ''))
    || voices[0]
    || null;
}

function km50CallNativeSpeak(utterance) {
  if (km50NativeSpeak) return km50NativeSpeak.call(km50SpeechSynth, utterance);
  if (km50FallbackSpeak) return km50FallbackSpeak(utterance);
  throw new Error('Speech synthesis is unavailable');
}

function km50CompleteSuppressed(utterance) {
  window.setTimeout(() => {
    try { utterance?.onend?.({ type: 'end', elapsedTime: 0, charIndex: 0 }); } catch {}
  }, 0);
}

function km50SpeakCoach({ force = false, original = null } = {}) {
  if (!km50CoachVisible() || !km50CoachVoiceEnabled()) {
    if (original) km50CompleteSuppressed(original);
    return false;
  }
  const data = km50CoachData();
  if (!data.text) {
    if (original) km50CompleteSuppressed(original);
    return false;
  }
  if (!force && (data.key === km50LastCoachKey || data.key === km50PendingCoachKey)) {
    if (original) km50CompleteSuppressed(original);
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(data.text);
  const voice = original?.voice || km50ChooseVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || original?.lang || 'en-GB';
  utterance.rate = Math.max(.84, Math.min(1.02, Number(original?.rate) || .92));
  utterance.pitch = Number(original?.pitch) || 1;
  utterance.volume = 1;
  utterance.onstart = (event) => {
    km50SpeechStarts += 1;
    km50LastCoachKey = data.key;
    km50PendingCoachKey = '';
    try { original?.onstart?.(event); } catch {}
  };
  utterance.onend = (event) => {
    km50LastCoachKey = data.key;
    km50PendingCoachKey = '';
    try { original?.onend?.(event); } catch {}
  };
  utterance.onerror = (event) => {
    km50SpeechErrors += 1;
    km50PendingCoachKey = '';
    try { original?.onerror?.(event); } catch {}
  };

  km50SpeechRequests += 1;
  km50PendingCoachKey = data.key;
  try {
    km50SpeechSynth?.resume?.();
    km50CallNativeSpeak(utterance);
    return true;
  } catch (error) {
    km50SpeechErrors += 1;
    km50PendingCoachKey = '';
    console.warn('K-Mate v50 coach voice could not start.', error);
    return false;
  }
}

function km50InstallSpeechRepair() {
  const synth = window.speechSynthesis;
  if (!synth || !window.SpeechSynthesisUtterance || km50SpeechInstalled) return false;
  km50SpeechSynth = synth;
  const prototype = Object.getPrototypeOf(synth);
  km50NativeSpeak = typeof prototype?.speak === 'function' ? prototype.speak : null;
  km50FallbackSpeak = typeof synth.speak === 'function' ? synth.speak.bind(synth) : null;

  const speak = (utterance) => {
    const text = String(utterance?.text || '').replace(/\s+/g, ' ').trim();
    if (/^coach voice ready\.?$/i.test(text)) {
      km50SuppressedReadyPrompts += 1;
      km50CompleteSuppressed(utterance);
      return;
    }
    if (km50CoachVisible()) {
      km50SpeakCoach({ original: utterance });
      return;
    }
    try {
      km50CallNativeSpeak(utterance);
    } catch (error) {
      km50SpeechErrors += 1;
      console.warn('K-Mate v50 voice playback failed.', error);
      try { utterance?.onerror?.({ error: 'synthesis-failed' }); } catch {}
    }
  };

  try {
    Object.defineProperty(synth, 'speak', { value: speak, configurable: true, writable: true });
    km50SpeechInstalled = true;
  } catch {
    try {
      synth.speak = speak;
      km50SpeechInstalled = synth.speak === speak;
    } catch {}
  }
  return km50SpeechInstalled;
}

function km50ScheduleCoachFallback() {
  window.clearTimeout(km50CoachFallbackTimer);
  if (!km50CoachVisible() || !km50CoachVoiceEnabled()) return;
  const data = km50CoachData();
  if (!data.text) return;
  km50CoachFallbackTimer = window.setTimeout(() => {
    const current = km50CoachData();
    if (
      km50CoachVisible()
      && km50CoachVoiceEnabled()
      && current.key === data.key
      && current.key !== km50LastCoachKey
      && current.key !== km50PendingCoachKey
    ) km50SpeakCoach();
  }, 1000);
}

function km50PointedPawnSvg(color) {
  const uid = `km50-pawn-${++km50PawnSerial}`;
  return `<svg viewBox="0 0 100 100" focusable="false" aria-hidden="true" data-kmate-sculpted-piece="p" data-kmate-sculpted-color="${color}" data-kmate-pointed-pawn-v50="${KMATE_MOBILE_FULL_PAGE_V50}">
    <defs>
      <linearGradient id="${uid}-body" x1="18%" y1="7%" x2="82%" y2="96%"><stop offset="0" class="sculpted-stop-body-hi"/><stop offset=".48" class="sculpted-stop-body-mid"/><stop offset="1" class="sculpted-stop-body-low"/></linearGradient>
      <linearGradient id="${uid}-base" x1="18%" y1="0" x2="80%" y2="100%"><stop offset="0" class="sculpted-stop-base-hi"/><stop offset="1" class="sculpted-stop-base-low"/></linearGradient>
      <linearGradient id="${uid}-band" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="sculpted-stop-band-hi"/><stop offset="1" class="sculpted-stop-band-low"/></linearGradient>
      <linearGradient id="${uid}-crown" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="sculpted-stop-crown-hi"/><stop offset="1" class="sculpted-stop-crown-low"/></linearGradient>
    </defs>
    <title>${color} pointed pawn</title>
    <g class="sculpted-art">
      <ellipse class="ground" cx="50" cy="94" rx="34" ry="3.5"/>
      <path class="crown pointed-finial" fill="url(#${uid}-crown)" d="M50 5C43 14 39 20 40 25C41 30 45 33 50 35C55 33 59 30 60 25C61 20 57 14 50 5Z"/>
      <path class="band" fill="url(#${uid}-band)" d="M37 32H63L68 41H32Z"/>
      <path class="body" fill="url(#${uid}-body)" d="M41 40H59L62 60L69 73H31L38 60Z"/>
      <path class="band" fill="url(#${uid}-band)" d="M30 71H70L77 82H23Z"/>
      <path class="base" fill="url(#${uid}-base)" d="M18 81H82L88 91H12Z"/>
      <path class="base" fill="url(#${uid}-base)" d="M10 90H90L92 95H8Z"/>
      <path class="highlight" d="M47 13Q43 21 47 28M43 45L40 59M35 76H65M27 86H73"/>
      <path class="grain" d="M53 13Q57 21 53 29M54 44L58 60M32 89Q49 84 69 88"/>
    </g>
  </svg>`;
}

function km50ApplyPointedPawn(piece) {
  if (!(piece instanceof HTMLElement)) return false;
  const type = piece.dataset.pieceType || piece.getAttribute('data-piece-type');
  if (type !== 'p' || !piece.classList.contains('kmate-sculpted-piece-v47')) return false;
  const color = piece.classList.contains('white') ? 'white' : piece.classList.contains('black') ? 'black' : '';
  if (!color) return false;
  const current = piece.querySelector(':scope > svg[data-kmate-pointed-pawn-v50]');
  if (current?.dataset.kmatePointedPawnV50 === KMATE_MOBILE_FULL_PAGE_V50) return false;
  piece.classList.add('kmate-pointed-pawn-v50');
  piece.dataset.kmatePawnStyle = KMATE_MOBILE_FULL_PAGE_V50;
  piece.innerHTML = km50PointedPawnSvg(color);
  km50PawnApplications += 1;
  return true;
}

function km50RefreshPawns(root = document) {
  const pawns = new Set();
  if (root instanceof Element && root.matches('.piece[data-piece-type="p"]')) pawns.add(root);
  root.querySelectorAll?.('.piece[data-piece-type="p"]').forEach((piece) => pawns.add(piece));
  let changed = 0;
  pawns.forEach((pawn) => { if (km50ApplyPointedPawn(pawn)) changed += 1; });
  return changed;
}

function km50ObservePawns() {
  if (km50PawnObserver || !document.body) return;
  km50PawnObserver = new MutationObserver((mutations) => {
    const roots = new Set();
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (target) roots.add(target);
      for (const node of mutation.addedNodes) if (node instanceof Element) roots.add(node);
    }
    roots.forEach((root) => km50RefreshPawns(root));
  });
  km50PawnObserver.observe(document.body, { childList: true, subtree: true });
}

function km50ExposeDiagnostics() {
  window.__KMATE_MOBILE_FULL_PAGE_V50__ = {
    version: KMATE_MOBILE_FULL_PAGE_V50,
    openHint: km50OpenHint,
    closeHint: km50CloseHint,
    setImmersive: km50SetImmersive,
    refreshPawns: km50RefreshPawns,
    speakCoach: (force = true) => km50SpeakCoach({ force }),
    coachData: km50CoachData,
    state: () => ({
      ready: true,
      version: KMATE_MOBILE_FULL_PAGE_V50,
      gameMode: document.body?.classList.contains('game-mode') || false,
      fullPage: document.body?.classList.contains('km50-full-page-game') || false,
      immersive: km50Immersive,
      hintOpen: km50HintOpen,
      titleHidden: Boolean(document.querySelector('#positionTitle')?.parentElement?.hidden),
      hintHidden: Boolean(km50HintCard()?.hidden),
      autoHintsDisabled: document.querySelector('#autoHints')?.checked === false,
      effectiveMoveGain: KMATE_EFFECTIVE_MOVE_GAIN_V50,
      scaledGainWrites: km50ScaledGainWrites,
      scaledMediaPlays: km50ScaledMediaPlays,
      speechInstalled: km50SpeechInstalled,
      speechRequests: km50SpeechRequests,
      speechStarts: km50SpeechStarts,
      speechErrors: km50SpeechErrors,
      suppressedReadyPrompts: km50SuppressedReadyPrompts,
      pointedPawns: document.querySelectorAll('.piece.kmate-pointed-pawn-v50').length,
      pawnApplications: km50PawnApplications,
    }),
  };
}

function km50Initialize() {
  document.documentElement.classList.add('kmate-mobile-full-page-v50');
  km50InstallStyles();
  km50InstallAudioAttenuation();
  km50InstallSpeechRepair();
  km50DisableAutomaticHints();
  km50HidePositionTitle();
  km50EnsureHintControls();
  km50EnsureFullscreenControl();
  km50InstallGameObserver();
  km50ObservePawns();
  km50RefreshPawns();
  km50SyncGameMode();
  km50ExposeDiagnostics();

  const coachPanel = document.querySelector('#liveCoachBoardPanel');
  if (coachPanel) {
    new MutationObserver(km50ScheduleCoachFallback).observe(coachPanel, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'aria-pressed'],
    });
  }

  document.addEventListener('click', km50HandleOutsideClick);
  document.addEventListener('fullscreenchange', km50HandleFullscreenChange);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (km50HintOpen) km50CloseHint();
    else if (km50Immersive) void km50SetImmersive(false);
  });
  window.addEventListener('resize', km50SyncGameMode, { passive: true });
  window.visualViewport?.addEventListener?.('resize', km50SyncGameMode, { passive: true });

  window.setTimeout(() => {
    km50InstallSpeechRepair();
    km50DisableAutomaticHints();
    km50HidePositionTitle();
    km50EnsureHintControls();
    km50EnsureFullscreenControl();
    km50RefreshPawns();
    km50ExposeDiagnostics();
  }, 800);
}

km50InstallStyles();
km50InstallAudioAttenuation();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', km50Initialize, { once: true });
} else {
  km50Initialize();
}
