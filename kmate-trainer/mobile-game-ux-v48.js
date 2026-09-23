const KMATE_GAME_UX_V48 = '48.0.0';
const KMATE_STORE_KEY_V48 = 'kmate-position-v7';
const KMATE_LEGACY_WOOD_ENABLED_KEY_V48 = 'kmate-move-sound-v45-enabled';
const KMATE_MOVE_VOLUME_V48 = 0.24;
const KMATE_MOVE_VIBRATION_MS_V48 = 8;
const KMATE_MOVE_URL_V48 = new URL(
  `./sounds/live-v28/kmate-reference-move-v28.wav?v=${KMATE_GAME_UX_V48}`,
  import.meta.url,
).href;
const kmateV48NativeFetch = window.fetch.bind(window);

let kmateV48UiAudioContext = null;
let kmateV48UiTapCount = 0;
let kmateV48LastUiTapAt = 0;
let kmateV48MoveContext = null;
let kmateV48MoveBuffer = null;
let kmateV48MoveLoadPromise = null;
let kmateV48MovePoolIndex = 0;
let kmateV48MovePlayCount = 0;
let kmateV48HapticCount = 0;
let kmateV48LastMoveReason = '';
let kmateV48BoardRootObserver = null;
let kmateV48CoachObserver = null;
let kmateV48CoachFrame = 0;
let kmateV48SuppressedReadyPrompts = 0;
let kmateV48ConciseNarrations = 0;
let kmateV48SpokenCoachKey = '';
let kmateV48ForceCoachReplay = false;
let kmateV48SpeechPatched = false;
const kmateV48BoardSnapshots = new WeakMap();
const kmateV48BoardTimers = new WeakMap();
const kmateV48ObservedBoards = new WeakSet();

function kmateV48InstallStyles() {
  if (document.querySelector('#kmateGameUxV48Styles')) return;
  const link = document.createElement('link');
  link.id = 'kmateGameUxV48Styles';
  link.rel = 'stylesheet';
  link.href = new URL(`./mobile-game-ux-v48.css?v=${KMATE_GAME_UX_V48}`, import.meta.url).href;
  document.head.append(link);
}

function kmateV48LockLegacyWoodPlayer() {
  try { localStorage.setItem(KMATE_LEGACY_WOOD_ENABLED_KEY_V48, '0'); } catch {}
  const prototype = window.Storage?.prototype;
  if (!prototype || prototype.__kmateV48LegacyWoodLock) return;
  const nativeSetItem = prototype.setItem;
  try {
    Object.defineProperty(prototype, '__kmateV48LegacyWoodLock', { value: true, configurable: true });
    prototype.setItem = function kmateV48StorageSetItem(key, value) {
      if (key === KMATE_LEGACY_WOOD_ENABLED_KEY_V48) {
        try {
          if (this === window.localStorage) return nativeSetItem.call(this, key, '0');
        } catch {}
      }
      return nativeSetItem.call(this, key, value);
    };
  } catch (error) {
    console.warn('K-Mate could not lock the retired loud move player.', error);
  }
}

function kmateV48ReadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KMATE_STORE_KEY_V48) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function kmateV48SoundEnabled() {
  const toggle = document.querySelector('#soundToggle');
  if (toggle?.classList.contains('muted') || String(toggle?.textContent || '').includes('🔇')) return false;
  return kmateV48ReadStore()?.settings?.sound !== false;
}

function kmateV48PlaySoftTap(strong = false) {
  if (!kmateV48SoundEnabled()) return false;
  const nowMs = performance.now();
  if (nowMs - kmateV48LastUiTapAt < 32) return false;
  kmateV48LastUiTapAt = nowMs;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  try {
    kmateV48UiAudioContext ||= new AudioContextClass({ latencyHint: 'interactive' });
    const context = kmateV48UiAudioContext;
    void context.resume?.();
    const now = context.currentTime + 0.002;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(strong ? 345 : 405, now);
    oscillator.frequency.exponentialRampToValueAtTime(strong ? 185 : 225, now + 0.046);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(strong ? 1450 : 1750, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.035 : 0.025, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.058);
    kmateV48UiTapCount += 1;
    document.documentElement.dataset.kmateSoftTapCount = String(kmateV48UiTapCount);
    return true;
  } catch {
    return false;
  }
}

function kmateV48IsBoardControl(element) {
  return Boolean(element?.closest?.('#board,#km42PuzzleBoard,.replay-board,.promos'));
}

function kmateV48BindSoftControls() {
  document.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest('button,select,input[type="checkbox"],input[type="range"]');
    if (!control || control.disabled || kmateV48IsBoardControl(control)) return;
    if (control.matches('#previewSoundButton,#previewCaptureButton')) return;
    // Prevent the older wizard/review pointer listeners from layering a wooden
    // knock on top of this one soft interface tap. Click/default behavior remains.
    event.stopPropagation();
    const prominent = control.matches('#startButton,#principlesStartButton,#liveCoachContinueButton,#fullscreenButton,.wizard-primary');
    kmateV48PlaySoftTap(prominent);
  }, true);
}

function kmateV48MoveAudioContext() {
  if (kmateV48MoveContext) return kmateV48MoveContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try { kmateV48MoveContext = new AudioContextClass({ latencyHint: 'interactive' }); }
  catch { kmateV48MoveContext = new AudioContextClass(); }
  return kmateV48MoveContext;
}

function kmateV48LoadMoveBuffer() {
  if (kmateV48MoveBuffer) return Promise.resolve(kmateV48MoveBuffer);
  if (kmateV48MoveLoadPromise) return kmateV48MoveLoadPromise;
  const context = kmateV48MoveAudioContext();
  if (!context) return Promise.resolve(null);
  kmateV48MoveLoadPromise = kmateV48NativeFetch(KMATE_MOVE_URL_V48, { cache: 'reload' })
    .then((response) => {
      if (!response.ok) throw new Error(`Move sound returned ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => context.decodeAudioData(bytes.slice(0)))
    .then((buffer) => {
      kmateV48MoveBuffer = buffer;
      return buffer;
    })
    .catch((error) => {
      console.warn('K-Mate v48 quiet move sound could not be decoded.', error);
      return null;
    })
    .finally(() => { kmateV48MoveLoadPromise = null; });
  return kmateV48MoveLoadPromise;
}

function kmateV48CreateMoveAudio() {
  const audio = new Audio(KMATE_MOVE_URL_V48);
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.volume = KMATE_MOVE_VOLUME_V48;
  try { audio.load(); } catch {}
  return audio;
}

const kmateV48MovePool = Array.from({ length: 4 }, kmateV48CreateMoveAudio);

async function kmateV48PrimeMoveAudio() {
  const context = kmateV48MoveAudioContext();
  const load = kmateV48LoadMoveBuffer();
  try { await context?.resume?.(); } catch {}
  void load;
  return Boolean(context);
}

function kmateV48Vibrate() {
  try {
    if (typeof navigator.vibrate !== 'function') return false;
    const result = navigator.vibrate(KMATE_MOVE_VIBRATION_MS_V48);
    kmateV48HapticCount += 1;
    return result !== false;
  } catch {
    return false;
  }
}

function kmateV48PlayHtmlMove() {
  const audio = kmateV48MovePool[kmateV48MovePoolIndex++ % kmateV48MovePool.length];
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = KMATE_MOVE_VOLUME_V48;
    const promise = audio.play();
    if (promise?.catch) promise.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function kmateV48PlayMoveFeedback(reason = 'move', { haptic = true } = {}) {
  if (haptic) kmateV48Vibrate();
  kmateV48LastMoveReason = reason;
  if (!kmateV48SoundEnabled()) return false;
  kmateV48MovePlayCount += 1;
  const context = kmateV48MoveAudioContext();
  if (context && context.state === 'running' && kmateV48MoveBuffer) {
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = kmateV48MoveBuffer;
      gain.gain.setValueAtTime(KMATE_MOVE_VOLUME_V48, context.currentTime);
      source.connect(gain);
      gain.connect(context.destination);
      source.start(context.currentTime + 0.001);
      return true;
    } catch {}
  }
  void kmateV48PrimeMoveAudio();
  return kmateV48PlayHtmlMove();
}

function kmateV48PieceSnapshot(board) {
  const pieces = [];
  for (const square of [...board.children].filter((element) => element.classList?.contains('sq'))) {
    const piece = square.querySelector('.piece');
    if (!piece) continue;
    const name = square.dataset.square || square.dataset.km42Square || '';
    const color = piece.classList.contains('white') ? 'w' : piece.classList.contains('black') ? 'b' : '?';
    const type = piece.dataset.pieceType || piece.getAttribute('data-piece-type') || '?';
    pieces.push(`${name}:${color}${type}`);
  }
  pieces.sort();
  return { signature: pieces.join('|'), count: pieces.length };
}

function kmateV48MoveReason(board, previous, next) {
  const scope = board.id === 'km42PuzzleBoard' ? 'puzzle' : 'game';
  const capture = next.count < previous.count;
  const check = [...board.children].some((element) => element.classList?.contains('sq') && element.classList.contains('check'));
  if (capture && check) return `${scope}-capture-check`;
  if (capture) return `${scope}-capture`;
  if (check) return `${scope}-check`;
  return `${scope}-move`;
}

function kmateV48CheckBoard(board) {
  const previous = kmateV48BoardSnapshots.get(board);
  const next = kmateV48PieceSnapshot(board);
  kmateV48BoardSnapshots.set(board, next);
  if (!previous?.signature || !next.signature || previous.signature === next.signature) return;
  const previousSet = new Set(previous.signature.split('|'));
  const nextSet = new Set(next.signature.split('|'));
  const changed = [...previousSet].filter((entry) => !nextSet.has(entry)).length
    + [...nextSet].filter((entry) => !previousSet.has(entry)).length;
  if (changed < 2 || changed > 10) return;
  kmateV48PlayMoveFeedback(kmateV48MoveReason(board, previous, next));
}

function kmateV48ScheduleBoard(board) {
  window.clearTimeout(kmateV48BoardTimers.get(board));
  const timer = window.setTimeout(() => kmateV48CheckBoard(board), 0);
  kmateV48BoardTimers.set(board, timer);
}

function kmateV48AttachBoard(board) {
  if (!(board instanceof Element) || kmateV48ObservedBoards.has(board)) return;
  kmateV48ObservedBoards.add(board);
  board.dataset.kmateMoveFeedback = KMATE_GAME_UX_V48;
  kmateV48BoardSnapshots.set(board, kmateV48PieceSnapshot(board));
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (target === board && mutation.type === 'childList') return true;
      const square = target?.closest?.('.sq');
      if (square?.parentElement === board) return true;
      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => (
        node instanceof Element && (node.classList.contains('sq') || Boolean(node.querySelector?.('.sq,.piece')))
      ));
    });
    if (relevant) kmateV48ScheduleBoard(board);
  });
  observer.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

function kmateV48ObserveBoards() {
  const attachAll = () => document.querySelectorAll('#board,#km42PuzzleBoard').forEach(kmateV48AttachBoard);
  attachAll();
  kmateV48BoardRootObserver = new MutationObserver(attachAll);
  kmateV48BoardRootObserver.observe(document.body, { childList: true, subtree: true });
}

function kmateV48SuppressUtterance(utterance) {
  window.setTimeout(() => {
    try { utterance?.onend?.({ type: 'end', elapsedTime: 0, charIndex: 0, name: '' }); } catch {}
  }, 0);
}

function kmateV48CleanCoachCopy(value, limit = 280) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:mistake|blunder|inaccurate|inaccuracy|miss)[\s:,.!–—-]*/i, '');
  text = text.split(/\s+(?:Concrete line:|The engine continuation is|Stockfish(?:'s)? line begins)\s*/i)[0].trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const sentenceEnd = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf(';'));
  return `${(sentenceEnd > limit * 0.55 ? clipped.slice(0, sentenceEnd + 1) : clipped).trim()}…`;
}

function kmateV48PrincipleText() {
  const card = document.querySelector('#liveCoachPrincipleList .principle-diagnosis-card');
  const title = card?.querySelector('b')?.textContent?.trim() || '';
  const evidence = card?.querySelector('.principle-diagnosis-evidence')?.textContent?.trim() || '';
  if (title) return kmateV48CleanCoachCopy(`${title}${evidence ? `. ${evidence}` : ''}`, 190);
  const hidden = document.querySelector('#liveCoachPrinciplesText')?.textContent?.trim() || '';
  if (hidden) return kmateV48CleanCoachCopy(hidden, 190);
  return 'Opponent awareness and candidate comparison. Check forcing moves before committing.';
}

function kmateV48CoachNarrationData() {
  const why = kmateV48CleanCoachCopy(document.querySelector('#liveCoachWhy')?.textContent, 290);
  const principle = kmateV48PrincipleText();
  const best = kmateV48CleanCoachCopy(document.querySelector('#liveCoachBestText')?.textContent, 260);
  const yourMove = document.querySelector('#liveCoachYourMove')?.textContent?.trim() || '';
  const bestMove = document.querySelector('#liveCoachBestMove')?.textContent?.trim() || '';
  const text = [
    why ? `Why your move was bad: ${why}` : '',
    principle ? `Principle violated: ${principle}` : '',
    best ? `How the stronger move improves your position: ${best}` : '',
  ].filter(Boolean).join(' ');
  return { why, principle, best, yourMove, bestMove, text, key: `${yourMove}|${bestMove}|${why}|${principle}|${best}` };
}

function kmateV48CloneUtterance(original, text) {
  if (!window.SpeechSynthesisUtterance) return original;
  const replacement = new SpeechSynthesisUtterance(text);
  for (const property of ['voice', 'lang', 'rate', 'pitch', 'volume', 'onstart', 'onend', 'onerror', 'onpause', 'onresume', 'onboundary', 'onmark']) {
    try { replacement[property] = original[property]; } catch {}
  }
  return replacement;
}

function kmateV48PatchSpeech() {
  const synth = window.speechSynthesis;
  if (!synth?.speak || synth.__kmateV48SpeechPatched) return;
  const nativeSpeak = synth.speak.bind(synth);
  const wrappedSpeak = (utterance) => {
    const originalText = String(utterance?.text || '').trim();
    if (/^coach voice ready\.?$/i.test(originalText)) {
      kmateV48SuppressedReadyPrompts += 1;
      kmateV48SuppressUtterance(utterance);
      return;
    }
    const panel = document.querySelector('#liveCoachBoardPanel');
    const liveCoachVisible = Boolean(panel && !panel.hidden && document.querySelector('#gameView')?.classList.contains('live-coach-active'));
    if (liveCoachVisible) {
      const data = kmateV48CoachNarrationData();
      if (data.text) {
        if (!kmateV48ForceCoachReplay && kmateV48SpokenCoachKey === data.key) {
          kmateV48SuppressUtterance(utterance);
          return;
        }
        kmateV48ForceCoachReplay = false;
        kmateV48SpokenCoachKey = data.key;
        kmateV48ConciseNarrations += 1;
        let nextUtterance = utterance;
        try { utterance.text = data.text; } catch {}
        if (String(utterance?.text || '') !== data.text) nextUtterance = kmateV48CloneUtterance(utterance, data.text);
        nativeSpeak(nextUtterance);
        return;
      }
    }
    nativeSpeak(utterance);
  };
  try {
    synth.speak = wrappedSpeak;
  } catch {
    try { Object.defineProperty(synth, 'speak', { value: wrappedSpeak, configurable: true }); }
    catch { return; }
  }
  synth.__kmateV48SpeechPatched = true;
  kmateV48SpeechPatched = true;
}

function kmateV48ShortenVisibleCoachText(element, limit) {
  if (!element) return;
  const next = kmateV48CleanCoachCopy(element.textContent, limit);
  if (next && next !== element.textContent.trim()) element.textContent = next;
}

function kmateV48RefreshCompactCoach() {
  kmateV48CoachFrame = 0;
  const panel = document.querySelector('#liveCoachBoardPanel');
  if (!panel || panel.hidden) {
    kmateV48SpokenCoachKey = '';
    return;
  }
  panel.dataset.kmateCompactCoach = KMATE_GAME_UX_V48;
  const yourArticle = panel.querySelector('.live-coach-comparison .your-move');
  const bestArticle = panel.querySelector('.live-coach-comparison .best-move');
  const yourLabel = yourArticle?.querySelector(':scope > small');
  const bestLabel = bestArticle?.querySelector(':scope > small');
  if (yourLabel && yourLabel.textContent !== 'Why your move was bad') yourLabel.textContent = 'Why your move was bad';
  if (bestLabel && bestLabel.textContent !== 'How the best move helps') bestLabel.textContent = 'How the best move helps';
  kmateV48ShortenVisibleCoachText(document.querySelector('#liveCoachWhy'), 290);
  kmateV48ShortenVisibleCoachText(document.querySelector('#liveCoachBestText'), 260);

  if (yourArticle) {
    let principle = yourArticle.querySelector('#kmateV48Principle');
    if (!principle) {
      principle = document.createElement('div');
      principle.id = 'kmateV48Principle';
      principle.className = 'km48-principle';
      principle.innerHTML = '<small>Principle violated</small><b id="kmateV48PrincipleText"></b>';
      yourArticle.append(principle);
    }
    const output = principle.querySelector('#kmateV48PrincipleText');
    const text = kmateV48PrincipleText();
    if (output && output.textContent !== text) output.textContent = text;
  }
}

function kmateV48ScheduleCompactCoach() {
  if (kmateV48CoachFrame) return;
  kmateV48CoachFrame = window.requestAnimationFrame(kmateV48RefreshCompactCoach);
}

function kmateV48ObserveCoach() {
  const panel = document.querySelector('#liveCoachBoardPanel');
  if (!panel) return;
  kmateV48CoachObserver = new MutationObserver(kmateV48ScheduleCompactCoach);
  kmateV48CoachObserver.observe(panel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  kmateV48ScheduleCompactCoach();
}

function kmateV48EnsureHintButton() {
  const gameView = document.querySelector('#gameView');
  if (!gameView || document.querySelector('#kmateHintEdgeButton')) return;
  const button = document.createElement('button');
  button.id = 'kmateHintEdgeButton';
  button.type = 'button';
  button.setAttribute('aria-label', 'Open coach hint');
  button.setAttribute('aria-expanded', 'false');
  button.title = 'Coach hint';
  button.innerHTML = '<span aria-hidden="true">💡</span>';
  button.addEventListener('click', () => {
    const open = !document.body.classList.contains('km48-hint-open');
    document.body.classList.toggle('km48-hint-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close coach hint' : 'Open coach hint');
    if (open) {
      const reveal = document.querySelector('#showHintButton');
      const title = document.querySelector('#hintTitle')?.textContent?.trim() || '';
      if (reveal && !reveal.disabled && /hidden|strategic clue|show hint/i.test(title)) reveal.click();
    }
  });
  gameView.append(button);
}

function kmateV48CloseHint(event) {
  if (!document.body.classList.contains('km48-hint-open')) return;
  const target = event?.target instanceof Element ? event.target : null;
  if (target?.closest('#hintCard,#kmateHintEdgeButton')) return;
  document.body.classList.remove('km48-hint-open');
  const button = document.querySelector('#kmateHintEdgeButton');
  button?.setAttribute('aria-expanded', 'false');
  button?.setAttribute('aria-label', 'Open coach hint');
}

function kmateV48BindClicks() {
  window.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#previewSoundButton,#previewCaptureButton')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void kmateV48PrimeMoveAudio().then(() => kmateV48PlayMoveFeedback('preview', { haptic: false }));
      return;
    }
    if (target?.closest('#liveCoachSpeakButton')) kmateV48ForceCoachReplay = true;
    if (target?.closest('#soundToggle')) {
      window.setTimeout(() => {
        try { localStorage.setItem(KMATE_LEGACY_WOOD_ENABLED_KEY_V48, '0'); } catch {}
      }, 0);
    }
    kmateV48CloseHint(event);
  }, true);
}

function kmateV48ExposeDiagnostics() {
  window.__KMATE_GAME_UX_V48__ = {
    version: KMATE_GAME_UX_V48,
    refresh: () => {
      kmateV48EnsureHintButton();
      kmateV48RefreshCompactCoach();
    },
    coachNarration: kmateV48CoachNarrationData,
    state: () => ({
      ready: true,
      version: KMATE_GAME_UX_V48,
      softButtonSound: true,
      softButtonTaps: kmateV48UiTapCount,
      hiddenAutomaticCoachReady: true,
      suppressedReadyPrompts: kmateV48SuppressedReadyPrompts,
      conciseCoachNarrations: kmateV48ConciseNarrations,
      compactCoach: document.querySelector('#liveCoachBoardPanel')?.dataset.kmateCompactCoach === KMATE_GAME_UX_V48,
      hintEdgeButton: Boolean(document.querySelector('#kmateHintEdgeButton')),
      moveVolume: KMATE_MOVE_VOLUME_V48,
      pieceContrast: 'enhanced-ivory-ebony-outline',
    }),
  };
  window.__KMATE_MOVE_FEEDBACK_V48__ = {
    version: KMATE_GAME_UX_V48,
    url: KMATE_MOVE_URL_V48,
    prime: kmateV48PrimeMoveAudio,
    play: kmateV48PlayMoveFeedback,
    state: () => ({
      ready: true,
      version: KMATE_GAME_UX_V48,
      volume: KMATE_MOVE_VOLUME_V48,
      plays: kmateV48MovePlayCount,
      lastReason: kmateV48LastMoveReason,
      hapticDurationMs: KMATE_MOVE_VIBRATION_MS_V48,
      hapticSupported: typeof navigator.vibrate === 'function',
      haptics: kmateV48HapticCount,
      legacyLoudPlayerDisabled: (() => {
        try { return localStorage.getItem(KMATE_LEGACY_WOOD_ENABLED_KEY_V48) === '0'; }
        catch { return true; }
      })(),
      bufferReady: Boolean(kmateV48MoveBuffer),
      contextState: kmateV48MoveContext?.state || 'not-created',
    }),
  };
}

function kmateV48Initialize() {
  document.documentElement.classList.add('kmate-game-ux-v48');
  kmateV48InstallStyles();
  kmateV48LockLegacyWoodPlayer();
  kmateV48PatchSpeech();
  kmateV48BindSoftControls();
  kmateV48BindClicks();
  kmateV48EnsureHintButton();
  kmateV48ObserveBoards();
  kmateV48ObserveCoach();
  kmateV48ExposeDiagnostics();
  void kmateV48LoadMoveBuffer();

  const prime = () => { void kmateV48PrimeMoveAudio(); };
  window.addEventListener('pointerdown', prime, { capture: true, passive: true });
  window.addEventListener('touchstart', prime, { capture: true, passive: true });
  window.addEventListener('keydown', prime, { capture: true });

  // The older module initializes after this one. Reassert the lock while all
  // deferred startup code settles, without touching the user's main sound toggle.
  const guard = window.setInterval(kmateV48LockLegacyWoodPlayer, 160);
  window.setTimeout(() => window.clearInterval(guard), 12000);
  window.setTimeout(() => {
    kmateV48EnsureHintButton();
    kmateV48RefreshCompactCoach();
  }, 1200);
}

kmateV48InstallStyles();
kmateV48LockLegacyWoodPlayer();
kmateV48PatchSpeech();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', kmateV48Initialize, { once: true });
} else {
  kmateV48Initialize();
}
