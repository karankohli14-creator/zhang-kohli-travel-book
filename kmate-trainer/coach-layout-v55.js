const KMATE_COACH_LAYOUT_V55 = '55.0.0';
const KMATE_STORE_KEY_V55 = 'kmate-position-v7';
const KMATE_VOICE_ACCESS_KEY_V55 = 'kmate-voice-access-code-v1';
const KMATE_VOICE_BASE_KEY_V55 = 'kmate-voice-api-base-v1';
const KMATE_VOICE_BASE_DEFAULT_V55 = 'https://kmate-voice-api.vercel.app';

let km55Observer = null;
let km55ResizeObserver = null;
let km55FrameRequest = 0;
let km55LastLayoutKey = '';
let km55LastNarrationKey = '';
let km55NarrationTimer = 0;
let km55VoiceAudio = null;
let km55VoiceObjectUrl = '';
let km55VoiceRequests = 0;
let km55VoiceStarts = 0;
let km55VoiceFallbacks = 0;
let km55CandidateArrows = 0;
let km55HomeUses = 0;

const km55Root = document.documentElement;
km55Root.classList.add('kmate-coach-layout-v55');

function km55EnsureStyle() {
  if (document.querySelector('#kmateCoachLayoutV55Styles')) return;
  const link = document.createElement('link');
  link.id = 'kmateCoachLayoutV55Styles';
  link.rel = 'stylesheet';
  link.href = new URL(`./coach-layout-v55.css?v=${KMATE_COACH_LAYOUT_V55}`, import.meta.url).href;
  document.head.append(link);
}

function km55Text(selector, fallback = '') {
  return document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || fallback;
}

function km55CleanCoachText(value, limit = 390) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:mistake|blunder|inaccuracy|inaccurate|miss)[\s:,.!–—-]*/i, '');
  text = text.split(/\s+(?:Concrete line:|The engine continuation is|Stockfish(?:'s)? line begins)\s*/i)[0].trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const stop = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf(';'));
  return `${(stop > limit * .55 ? clipped.slice(0, stop + 1) : clipped).trim()}…`;
}

function km55ReadStore() {
  try {
    const value = JSON.parse(localStorage.getItem(KMATE_STORE_KEY_V55) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function km55WriteStore(store) {
  try {
    if (store && typeof store === 'object') localStorage.setItem(KMATE_STORE_KEY_V55, JSON.stringify(store));
  } catch {}
}

function km55VoiceEnabled() {
  const checkbox = document.querySelector('#liveCoachVoice');
  if (checkbox instanceof HTMLInputElement) return checkbox.checked;
  const store = km55ReadStore();
  return store?.settings?.coachVoice !== false;
}

function km55SetVoiceEnabled(enabled) {
  const next = Boolean(enabled);
  const checkbox = document.querySelector('#liveCoachVoice');
  if (checkbox instanceof HTMLInputElement && checkbox.checked !== next) {
    checkbox.checked = next;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const store = km55ReadStore() || { version: 7, sessions: [], legacy: {}, settings: {} };
  store.settings ||= {};
  store.settings.coachVoice = next;
  km55WriteStore(store);
  if (!next) {
    km55StopVoice();
  } else {
    km55LastNarrationKey = '';
    window.setTimeout(() => km55ScheduleAutomaticNarration(km55CoachCopy()), 20);
  }
}

function km55CoachOpen() {
  const panel = document.querySelector('#liveCoachBoardPanel');
  const gameView = document.querySelector('#gameView');
  const stage = document.querySelector('#boardCoachStage');
  if (!panel || panel.hidden) return false;
  return Boolean(
    gameView?.classList.contains('live-coach-active')
    || stage?.classList.contains('coach-open')
    || panel.getAttribute('aria-hidden') !== 'true'
  );
}

function km55HintOpen() {
  const button = document.querySelector('#kmateHintEdgeButton');
  return Boolean(
    !km55CoachOpen()
    && document.body?.classList.contains('game-mode')
    && (button?.getAttribute('aria-expanded') === 'true' || document.body.classList.contains('km50-hint-open'))
  );
}

function km55EnsureLayout() {
  const stage = document.querySelector('#boardCoachStage');
  if (!stage) return null;
  let layout = document.querySelector('#km55CoachLayout');
  if (!layout) {
    layout = document.createElement('div');
    layout.id = 'km55CoachLayout';
    layout.className = 'km55-coach-layout';
    layout.innerHTML = `
      <aside class="km55-rail km55-top-rail" id="km55TopRail" hidden>
        <article class="km55-coach-card" id="km55HintCard" data-kind="hint" hidden>
          <div class="km55-card-kicker"><span>Coach hint</span></div>
          <strong class="km55-card-title" id="km55HintTitle">Strategic hint</strong>
          <p class="km55-card-text" id="km55HintText"></p>
          <button class="km55-hint-action" id="km55HintAction" type="button">Reveal candidate</button>
        </article>
        <article class="km55-coach-card" id="km55WhyCard" data-kind="why" hidden>
          <div class="km55-card-kicker"><span>Why your move was bad</span><span class="km55-quality" id="km55Quality"></span></div>
          <strong class="km55-card-title" id="km55WhyMove"></strong>
          <p class="km55-card-text" id="km55WhyText"></p>
          <div class="km55-principle" id="km55Principle" hidden></div>
        </article>
      </aside>
      <aside class="km55-rail km55-bottom-rail" id="km55BottomRail" hidden>
        <article class="km55-coach-card" id="km55BestCard" data-kind="best" hidden>
          <div class="km55-card-kicker"><span>How the best move helps</span></div>
          <strong class="km55-card-title" id="km55BestMove"></strong>
          <p class="km55-card-text" id="km55BestText"></p>
          <div class="km55-card-actions">
            <button id="km55VoiceToggle" type="button" aria-label="Toggle coach voice">🔊</button>
            <button id="km55HearCoach" type="button" aria-label="Hear this coaching again">▶</button>
            <button class="km55-continue" id="km55Continue" type="button">Continue</button>
          </div>
        </article>
      </aside>`;
    stage.parentNode?.insertBefore(layout, stage);
    layout.insertBefore(stage, layout.querySelector('#km55BottomRail'));

    layout.querySelector('#km55HintAction')?.addEventListener('click', () => {
      const original = document.querySelector('#showHintButton');
      if (original instanceof HTMLButtonElement && !original.disabled) original.click();
      km55Schedule('hint-action');
    });
    layout.querySelector('#km55VoiceToggle')?.addEventListener('click', () => {
      km55SetVoiceEnabled(!km55VoiceEnabled());
      km55Schedule('voice-toggle');
    });
    layout.querySelector('#km55HearCoach')?.addEventListener('click', () => {
      void km55SpeakCoach(true);
    });
    layout.querySelector('#km55Continue')?.addEventListener('click', () => {
      const original = document.querySelector('#liveCoachContinueButton');
      if (original instanceof HTMLButtonElement && !original.disabled) original.click();
      km55Schedule('continue');
    });
  } else if (stage.parentElement !== layout) {
    layout.insertBefore(stage, layout.querySelector('#km55BottomRail'));
  }
  return layout;
}

function km55PrincipleText() {
  return (
    km55Text('#kmateV48PrincipleText')
    || km55Text('#liveCoachPrincipleList .principle-diagnosis-card b')
    || km55Text('#liveCoachPrincipleList .principle-diagnosis-card')
  );
}

function km55CoachCopy() {
  return {
    quality: km55Text('#liveCoachRating') || km55Text('#liveCoachQualityBadge'),
    whyMove: km55Text('#liveCoachYourMove'),
    why: km55CleanCoachText(km55Text('#liveCoachWhy')),
    principle: km55CleanCoachText(km55PrincipleText(), 180),
    bestMove: km55Text('#liveCoachBestMove'),
    best: km55CleanCoachText(km55Text('#liveCoachBestText')),
  };
}

function km55Narration(copy = km55CoachCopy()) {
  const parts = [];
  if (copy.why) parts.push(`Why your move was bad: ${copy.why}`);
  if (copy.principle) parts.push(`Principle violated: ${copy.principle}`);
  if (copy.best) parts.push(`How the stronger move improves your position: ${copy.best}`);
  return parts.join(' ');
}

function km55SyncCoachCards(layout) {
  const open = km55CoachOpen();
  const topRail = layout.querySelector('#km55TopRail');
  const bottomRail = layout.querySelector('#km55BottomRail');
  const whyCard = layout.querySelector('#km55WhyCard');
  const bestCard = layout.querySelector('#km55BestCard');
  if (!open) {
    whyCard.hidden = true;
    bestCard.hidden = true;
    return false;
  }

  const copy = km55CoachCopy();
  layout.querySelector('#km55Quality').textContent = copy.quality;
  layout.querySelector('#km55WhyMove').textContent = copy.whyMove;
  layout.querySelector('#km55WhyText').textContent = copy.why || 'Review what changed in the position after your move.';
  layout.querySelector('#km55BestMove').textContent = copy.bestMove;
  layout.querySelector('#km55BestText').textContent = copy.best || 'The stronger move improves the position without allowing the same concession.';
  const principle = layout.querySelector('#km55Principle');
  principle.textContent = copy.principle ? `Principle: ${copy.principle}` : '';
  principle.hidden = !copy.principle;

  const voice = km55VoiceEnabled();
  const voiceButton = layout.querySelector('#km55VoiceToggle');
  voiceButton.textContent = voice ? '🔊' : '🔇';
  voiceButton.setAttribute('aria-pressed', String(voice));
  voiceButton.setAttribute('aria-label', voice ? 'Turn coach voice off' : 'Turn coach voice on');
  const originalContinue = document.querySelector('#liveCoachContinueButton');
  layout.querySelector('#km55Continue').disabled = Boolean(originalContinue?.disabled);

  whyCard.hidden = false;
  bestCard.hidden = false;
  topRail.hidden = false;
  bottomRail.hidden = false;
  km55ScheduleAutomaticNarration(copy);
  return true;
}

function km55SyncHintCard(layout) {
  const open = km55HintOpen();
  const hintCard = layout.querySelector('#km55HintCard');
  if (!open) {
    hintCard.hidden = true;
    km55RemoveCandidateArrow();
    return false;
  }
  const title = km55Text('#hintTitle', 'Strategic hint');
  const text = km55Text('#hintText', 'Look for the move that best improves your position.');
  const originalAction = document.querySelector('#showHintButton');
  const action = layout.querySelector('#km55HintAction');
  layout.querySelector('#km55HintTitle').textContent = title;
  layout.querySelector('#km55HintText').textContent = text;
  action.textContent = originalAction?.textContent?.replace(/\s+/g, ' ').trim() || 'Reveal candidate';
  action.disabled = Boolean(originalAction?.disabled);
  hintCard.hidden = false;
  if (/candidate revealed/i.test(title)) km55DrawCandidateArrow(text);
  else km55RemoveCandidateArrow();
  return true;
}

function km55SyncRails(layout) {
  const coach = km55SyncCoachCards(layout);
  const hint = !coach && km55SyncHintCard(layout);
  const topRail = layout.querySelector('#km55TopRail');
  const bottomRail = layout.querySelector('#km55BottomRail');
  topRail.hidden = !(coach || hint);
  bottomRail.hidden = !coach;
  return { coach, hint };
}

function km55CandidateSquares(text) {
  const match = String(text || '').match(/\(([a-h][1-8])\s*(?:→|->|–|—)\s*([a-h][1-8])\)/i);
  if (match) return { from: match[1].toLowerCase(), to: match[2].toLowerCase() };
  const fallback = String(text || '').match(/\b([a-h][1-8])\s*(?:to|→|->)\s*([a-h][1-8])\b/i);
  return fallback ? { from: fallback[1].toLowerCase(), to: fallback[2].toLowerCase() } : null;
}

function km55RemoveCandidateArrow() {
  document.querySelector('#board > .km55-candidate-arrow')?.remove();
  document.querySelectorAll('#board > .sq.km55-candidate-from, #board > .sq.km55-candidate-to').forEach((square) => {
    square.classList.remove('km55-candidate-from', 'km55-candidate-to');
  });
}

function km55DrawCandidateArrow(text) {
  const move = km55CandidateSquares(text);
  const board = document.querySelector('#board');
  if (!move || !board) {
    km55RemoveCandidateArrow();
    return false;
  }
  const fromSquare = board.querySelector(`:scope > .sq[data-square="${move.from}"]`);
  const toSquare = board.querySelector(`:scope > .sq[data-square="${move.to}"]`);
  if (!fromSquare || !toSquare) {
    km55RemoveCandidateArrow();
    return false;
  }

  km55RemoveCandidateArrow();
  const boardRect = board.getBoundingClientRect();
  const fromRect = fromSquare.getBoundingClientRect();
  const toRect = toSquare.getBoundingClientRect();
  const x1 = fromRect.left - boardRect.left + fromRect.width / 2;
  const y1 = fromRect.top - boardRect.top + fromRect.height / 2;
  const x2 = toRect.left - boardRect.left + toRect.width / 2;
  const y2 = toRect.top - boardRect.top + toRect.height / 2;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('km55-candidate-arrow');
  svg.setAttribute('viewBox', `0 0 ${Math.max(1, boardRect.width)} ${Math.max(1, boardRect.height)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs>
      <marker id="km55CandidateHead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L6,3 L0,6 Z" fill="#9dff7e"></path>
      </marker>
    </defs>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#km55CandidateHead)"></line>`;
  board.append(svg);
  fromSquare.classList.add('km55-candidate-from');
  toSquare.classList.add('km55-candidate-to');
  km55CandidateArrows += 1;
  return true;
}

function km55StopVoice() {
  window.clearTimeout(km55NarrationTimer);
  km55NarrationTimer = 0;
  try {
    km55VoiceAudio?.pause?.();
    if (km55VoiceAudio) km55VoiceAudio.currentTime = 0;
  } catch {}
  km55VoiceAudio = null;
  if (km55VoiceObjectUrl) {
    URL.revokeObjectURL(km55VoiceObjectUrl);
    km55VoiceObjectUrl = '';
  }
  try { window.speechSynthesis?.cancel?.(); } catch {}
}

function km55AccessCode() {
  try { return localStorage.getItem(KMATE_VOICE_ACCESS_KEY_V55) || ''; } catch { return ''; }
}

function km55VoiceBase() {
  let base = '';
  try { base = localStorage.getItem(KMATE_VOICE_BASE_KEY_V55) || ''; } catch {}
  return (base || KMATE_VOICE_BASE_DEFAULT_V55).replace(/\/+$/, '');
}

async function km55SpeakViaApi(text) {
  const accessCode = km55AccessCode();
  if (!accessCode || !text) return false;
  const response = await fetch(`${km55VoiceBase()}/api/speak`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-KMate-Voice-Key': accessCode,
    },
    body: JSON.stringify({ text, context: 'live-coach' }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Voice API returned ${response.status}`);
  const blob = await response.blob();
  km55VoiceObjectUrl = URL.createObjectURL(blob);
  km55VoiceAudio = new Audio(km55VoiceObjectUrl);
  km55VoiceAudio.preload = 'auto';
  km55VoiceAudio.volume = 1;
  km55VoiceAudio.addEventListener('ended', () => {
    if (km55VoiceObjectUrl) URL.revokeObjectURL(km55VoiceObjectUrl);
    km55VoiceObjectUrl = '';
    km55VoiceAudio = null;
  }, { once: true });
  await km55VoiceAudio.play();
  km55VoiceStarts += 1;
  return true;
}

function km55SpeakWithBrowser(text) {
  if (!text || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices?.() || [];
    utterance.voice = voices.find((voice) => /^en(?:-|_)/i.test(voice.lang) && /natural|premium|enhanced|samantha|daniel|serena/i.test(voice.name))
      || voices.find((voice) => /^en(?:-|_)/i.test(voice.lang))
      || null;
    window.speechSynthesis.speak(utterance);
    km55VoiceFallbacks += 1;
    km55VoiceStarts += 1;
    return true;
  } catch (error) {
    console.warn('K-Mate browser coach voice could not start.', error);
    return false;
  }
}

async function km55SpeakCoach(force = false) {
  if (!km55VoiceEnabled() || !km55CoachOpen()) return false;
  const text = km55Narration();
  if (!text) return false;
  const key = text;
  if (!force && key === km55LastNarrationKey) return false;
  km55LastNarrationKey = key;
  km55VoiceRequests += 1;
  km55StopVoice();

  try {
    if (await km55SpeakViaApi(text)) return true;
  } catch (error) {
    console.warn('K-Mate cloned coach voice was unavailable; using the device voice.', error);
  }
  return km55SpeakWithBrowser(text);
}

function km55ScheduleAutomaticNarration(copy) {
  if (!km55VoiceEnabled()) return;
  const text = km55Narration(copy);
  if (!text || text === km55LastNarrationKey) return;
  window.clearTimeout(km55NarrationTimer);
  km55NarrationTimer = window.setTimeout(() => {
    // Let the existing coach layer speak first when it is healthy. If it has
    // already started, mark this review handled so v55 never duplicates it.
    if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) {
      km55LastNarrationKey = text;
      return;
    }
    void km55SpeakCoach(false);
  }, 720);
}

function km55ConfigureVoiceAccess() {
  const current = km55AccessCode();
  const message = current
    ? 'Update the K-Mate Voice access code stored only in this browser. Leave blank to keep the current code.'
    : 'Enter the private K-Mate Voice access code. This is not your ElevenLabs API key. It is stored only in this browser.';
  const entered = window.prompt(message, '');
  if (entered === null) return;
  const value = entered.trim();
  if (!value) return;
  try { localStorage.setItem(KMATE_VOICE_ACCESS_KEY_V55, value); } catch {}
  const status = document.querySelector('#coachVoiceSetupStatus');
  if (status) {
    status.textContent = 'Cloned coach voice connected in this browser.';
    status.dataset.state = 'ready';
  }
}

function km55EnsureVoiceAccessControl() {
  if (document.querySelector('#km55VoiceAccessButton')) return;
  const anchor = document.querySelector('#coachAudioCheck') || document.querySelector('#liveCoachVoice')?.closest('label');
  if (!anchor) return;
  const button = document.createElement('button');
  button.id = 'km55VoiceAccessButton';
  button.type = 'button';
  button.className = 'btn secondary';
  button.textContent = km55AccessCode() ? 'Update cloned voice access' : 'Connect cloned coach voice';
  button.addEventListener('click', () => {
    km55ConfigureVoiceAccess();
    button.textContent = km55AccessCode() ? 'Update cloned voice access' : 'Connect cloned coach voice';
  });
  anchor.insertAdjacentElement('afterend', button);
}

function km55SilentClick(element) {
  if (!(element instanceof HTMLElement)) return;
  element.dataset.kmateNoUiSound = 'true';
  try { element.click(); } finally {
    queueMicrotask(() => delete element.dataset.kmateNoUiSound);
  }
}

function km55Home() {
  km55HomeUses += 1;
  km55StopVoice();
  document.querySelectorAll('dialog[open]').forEach((dialog) => {
    try { dialog.close(); } catch { dialog.removeAttribute('open'); }
  });
  if (document.body?.classList.contains('game-mode')) {
    km55SilentClick(document.querySelector('#backButton'));
  }
  window.setTimeout(() => {
    km55SilentClick(document.querySelector('.topnav [data-view="setup"]'));
    km55SilentClick(document.querySelector('#brandButton'));
    window.__KMATE__?.showSetupPage?.('welcome');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, 0);
}

function km55EnsureHomeButtons() {
  let home = document.querySelector('#km55HomeButton');
  if (!home) {
    home = document.createElement('button');
    home.id = 'km55HomeButton';
    home.type = 'button';
    home.title = 'K-Mate home';
    home.setAttribute('aria-label', 'K-Mate home');
    home.innerHTML = '<span aria-hidden="true">♞</span>';
    home.addEventListener('click', km55Home);
    document.body.append(home);
  }

  const gameMode = document.body?.classList.contains('game-mode');
  const playLeft = document.querySelector('.playtop .left');
  if (gameMode && playLeft) {
    if (home.parentElement !== playLeft) playLeft.append(home);
    home.classList.add('km55-in-playtop');
  } else {
    if (home.parentElement !== document.body) document.body.append(home);
    home.classList.remove('km55-in-playtop');
  }

  document.querySelectorAll('dialog').forEach((dialog) => {
    if (dialog.querySelector(':scope > .km55-dialog-home')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'km55-dialog-home';
    button.title = 'K-Mate home';
    button.setAttribute('aria-label', 'K-Mate home');
    button.innerHTML = '<span aria-hidden="true">♞</span>';
    button.addEventListener('click', km55Home);
    dialog.prepend(button);
  });
}

function km55RefitBoard() {
  window.__KMATE_MOBILE_FIT_V54__?.schedule?.();
  window.setTimeout(() => window.__KMATE_MOBILE_FIT_V54__?.fit?.(), 30);
  window.setTimeout(() => {
    if (km55HintOpen() && /candidate revealed/i.test(km55Text('#hintTitle'))) {
      km55DrawCandidateArrow(km55Text('#hintText'));
    }
  }, 80);
}

function km55Refresh(reason = 'refresh') {
  km55EnsureStyle();
  km55EnsureHomeButtons();
  km55EnsureVoiceAccessControl();
  const layout = km55EnsureLayout();
  if (!layout) return false;
  const state = km55SyncRails(layout);
  const key = [
    document.body?.classList.contains('game-mode'),
    state.coach,
    state.hint,
    km55Text('#hintTitle'),
    km55Text('#liveCoachWhy'),
    km55Text('#liveCoachBestText'),
  ].join('|');
  if (key !== km55LastLayoutKey) {
    km55LastLayoutKey = key;
    layout.dataset.state = state.coach ? 'coach' : state.hint ? 'hint' : 'play';
    km55RefitBoard();
  }
  document.documentElement.dataset.kmateCoachLayoutV55 = reason;
  return true;
}

function km55Schedule(reason = 'event') {
  if (km55FrameRequest) return;
  km55FrameRequest = window.requestAnimationFrame(() => {
    km55FrameRequest = 0;
    km55Refresh(reason);
  });
}

function km55InstallObservers() {
  if (!km55Observer && document.body) {
    km55Observer = new MutationObserver(() => km55Schedule('mutation'));
    km55Observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-expanded', 'aria-hidden', 'disabled', 'aria-pressed'],
    });
  }
  if (!km55ResizeObserver && typeof ResizeObserver === 'function') {
    km55ResizeObserver = new ResizeObserver(() => km55Schedule('resize-observer'));
    const gameView = document.querySelector('#gameView');
    const boardcol = document.querySelector('.boardcol');
    if (gameView) km55ResizeObserver.observe(gameView);
    if (boardcol) km55ResizeObserver.observe(boardcol);
  }
  window.addEventListener('resize', () => km55Schedule('window-resize'), { passive: true });
  window.visualViewport?.addEventListener('resize', () => km55Schedule('visual-resize'), { passive: true });
  window.visualViewport?.addEventListener('scroll', () => km55Schedule('visual-scroll'), { passive: true });
  document.addEventListener('fullscreenchange', () => km55Schedule('fullscreen'));
}

function km55State() {
  const layout = document.querySelector('#km55CoachLayout');
  const arrow = document.querySelector('#board > .km55-candidate-arrow');
  return {
    ready: true,
    version: KMATE_COACH_LAYOUT_V55,
    coachOpen: km55CoachOpen(),
    hintOpen: km55HintOpen(),
    voiceEnabled: km55VoiceEnabled(),
    clonedVoiceConfigured: Boolean(km55AccessCode()),
    voiceRequests: km55VoiceRequests,
    voiceStarts: km55VoiceStarts,
    voiceFallbacks: km55VoiceFallbacks,
    candidateArrows: km55CandidateArrows,
    candidateVisible: Boolean(arrow),
    homeUses: km55HomeUses,
    layoutState: layout?.dataset.state || 'missing',
    topRailVisible: !document.querySelector('#km55TopRail')?.hidden,
    bottomRailVisible: !document.querySelector('#km55BottomRail')?.hidden,
  };
}

function km55Initialize() {
  km55EnsureStyle();
  km55InstallObservers();
  km55Refresh('initialize');
  window.__KMATE_COACH_LAYOUT_V55__ = {
    version: KMATE_COACH_LAYOUT_V55,
    refresh: () => km55Refresh('api'),
    speak: () => km55SpeakCoach(true),
    home: km55Home,
    configureVoice: km55ConfigureVoiceAccess,
    drawCandidate: km55DrawCandidateArrow,
    state: km55State,
  };
  window.setTimeout(() => km55Refresh('settle-100'), 100);
  window.setTimeout(() => km55Refresh('settle-500'), 500);
  window.setTimeout(() => km55Refresh('settle-1400'), 1400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', km55Initialize, { once: true });
} else {
  km55Initialize();
}
