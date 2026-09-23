const KMATE_MOVE_SOUND_VERSION = '45.1.0';
const KMATE_MOVE_SOUND_STORE_KEY = 'kmate-position-v7';
const KMATE_MOVE_SOUND_ENABLED_KEY = 'kmate-move-sound-v45-enabled';
const KMATE_MOVE_SOUND_MIGRATION_PENDING_KEY = 'kmate-move-sound-v45-migration-pending';
const KMATE_MOVE_SOUND_PATH = '/sounds/live-v28/kmate-reference-move-v28.wav';
const KMATE_MOVE_SOUND_URL = new URL(`./sounds/live-v28/kmate-reference-move-v28.wav?v=${KMATE_MOVE_SOUND_VERSION}`, import.meta.url).href;
const kmateMoveSoundNativeFetch = window.fetch.bind(window);

let kmateMoveSoundContext = null;
let kmateMoveSoundBuffer = null;
let kmateMoveSoundBytesPromise = null;
let kmateMoveSoundDecodePromise = null;
let kmateMoveSoundPoolIndex = 0;
let kmateMoveSoundPrimed = false;
let kmateMoveSoundPlayCount = 0;
let kmateMoveSoundLastPlayedAt = 0;
let kmateMoveSoundLastReason = '';
let kmateMoveSoundInterceptCount = 0;
let kmateMoveSoundObserver = null;
let kmateMoveSoundMigrationAttempts = 0;
let kmateMoveSoundMigrationStartedAt = performance.now();
const kmateMoveSoundSnapshots = new WeakMap();
const kmateMoveSoundTimers = new WeakMap();

function kmateMoveSoundMigrationPending() {
  try { return sessionStorage.getItem(KMATE_MOVE_SOUND_MIGRATION_PENDING_KEY) === '1'; }
  catch { return false; }
}

function kmateMoveSoundSetMigrationPending(value) {
  try {
    if (value) sessionStorage.setItem(KMATE_MOVE_SOUND_MIGRATION_PENDING_KEY, '1');
    else sessionStorage.removeItem(KMATE_MOVE_SOUND_MIGRATION_PENDING_KEY);
  } catch {}
}

function kmateMoveSoundSetEnabled(value) {
  try { localStorage.setItem(KMATE_MOVE_SOUND_ENABLED_KEY, value ? '1' : '0'); }
  catch {}
}

function kmateMoveSoundOwnEnabled() {
  try {
    const value = localStorage.getItem(KMATE_MOVE_SOUND_ENABLED_KEY);
    if (value === null) {
      localStorage.setItem(KMATE_MOVE_SOUND_ENABLED_KEY, '1');
      kmateMoveSoundSetMigrationPending(true);
      return true;
    }
    return value !== '0';
  } catch {
    return true;
  }
}

function kmateMoveSoundMigrateSettings({ reinforce = false } = {}) {
  try {
    const parsed = JSON.parse(localStorage.getItem(KMATE_MOVE_SOUND_STORE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return false;
    parsed.settings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {};
    const firstMigration = parsed.settings.uploadedMoveSoundV45 !== KMATE_MOVE_SOUND_VERSION;
    const pending = kmateMoveSoundMigrationPending();
    if (!firstMigration && !pending && !reinforce) return false;

    if (kmateMoveSoundOwnEnabled()) parsed.settings.sound = true;
    parsed.settings.soundTheme = 'reference-crisp';
    parsed.settings.referenceCrispMigrationDone = true;
    parsed.settings.uploadedMoveSoundV45 = KMATE_MOVE_SOUND_VERSION;
    localStorage.setItem(KMATE_MOVE_SOUND_STORE_KEY, JSON.stringify(parsed));
    if (firstMigration) kmateMoveSoundSetMigrationPending(true);
    kmateMoveSoundMigrationAttempts += 1;
    return true;
  } catch (error) {
    console.warn('K-Mate could not migrate the uploaded move-sound preference.', error);
    return false;
  }
}

function kmateMoveSoundStoredSettings() {
  try {
    return JSON.parse(localStorage.getItem(KMATE_MOVE_SOUND_STORE_KEY) || 'null')?.settings || null;
  } catch {
    return null;
  }
}

function kmateMoveSoundUrl(input) {
  try {
    if (typeof input === 'string' || input instanceof URL) return new URL(String(input), document.baseURI);
    if (input instanceof Request) return new URL(input.url, document.baseURI);
  } catch {}
  return null;
}

function kmateMoveSoundSilentWav() {
  const sampleRate = 8000;
  const samples = 80;
  const bytes = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(bytes);
  const write = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples * 2, true);
  return bytes;
}

// The core v28 profile still asks for its original URL. Suppress that ordinary
// move sample only; this module owns the uploaded move sound. Capture and check
// requests continue through unchanged.
window.fetch = function kmateMoveSoundFetch(input, init) {
  const url = kmateMoveSoundUrl(input);
  if (url?.pathname.endsWith(KMATE_MOVE_SOUND_PATH) && url.searchParams.get('v') !== KMATE_MOVE_SOUND_VERSION) {
    kmateMoveSoundInterceptCount += 1;
    return Promise.resolve(new Response(kmateMoveSoundSilentWav(), {
      status: 200,
      headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
    }));
  }
  return kmateMoveSoundNativeFetch(input, init);
};

kmateMoveSoundOwnEnabled();
// Run once before the core app reads its settings. A second startup pass below
// protects against older deferred scripts that may write a stale copy later.
kmateMoveSoundMigrateSettings();

const kmateMoveSoundPool = Array.from({ length: 4 }, () => {
  const audio = new Audio(KMATE_MOVE_SOUND_URL);
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.volume = 1;
  try { audio.load(); } catch {}
  return audio;
});

function kmateMoveSoundBytes() {
  if (!kmateMoveSoundBytesPromise) {
    kmateMoveSoundBytesPromise = kmateMoveSoundNativeFetch(KMATE_MOVE_SOUND_URL, { cache: 'reload' })
      .then((response) => {
        if (!response.ok) throw new Error(`Move sound returned ${response.status}`);
        return response.arrayBuffer();
      });
  }
  return kmateMoveSoundBytesPromise;
}

function kmateMoveSoundAudioContext() {
  if (kmateMoveSoundContext) return kmateMoveSoundContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    kmateMoveSoundContext = new AudioContextClass({ latencyHint: 'interactive' });
  } catch {
    kmateMoveSoundContext = new AudioContextClass();
  }
  return kmateMoveSoundContext;
}

async function kmateMoveSoundDecode() {
  if (kmateMoveSoundBuffer) return kmateMoveSoundBuffer;
  if (kmateMoveSoundDecodePromise) return kmateMoveSoundDecodePromise;
  const context = kmateMoveSoundAudioContext();
  if (!context) return null;
  kmateMoveSoundDecodePromise = kmateMoveSoundBytes()
    .then((bytes) => context.decodeAudioData(bytes.slice(0)))
    .then((buffer) => {
      kmateMoveSoundBuffer = buffer;
      return buffer;
    })
    .catch((error) => {
      console.warn('K-Mate uploaded move sound could not be decoded.', error);
      return null;
    })
    .finally(() => { kmateMoveSoundDecodePromise = null; });
  return kmateMoveSoundDecodePromise;
}

function kmateMoveSoundEnabled() {
  return kmateMoveSoundOwnEnabled();
}

async function kmateMoveSoundPrime() {
  const context = kmateMoveSoundAudioContext();
  void kmateMoveSoundDecode();
  if (kmateMoveSoundPrimed) {
    try { await context?.resume?.(); } catch {}
    return true;
  }

  const audio = kmateMoveSoundPool[0];
  let playPromise = null;
  let resumePromise = null;
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.001;
    // Call both playback APIs before the first await so Safari and embedded
    // iPhone browsers still treat them as part of the user's tap gesture.
    playPromise = audio.play();
    resumePromise = context?.resume?.();
    if (playPromise?.then) await playPromise;
    if (resumePromise?.then) await resumePromise;
    window.setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
    }, 28);
    kmateMoveSoundPrimed = true;
    return true;
  } catch {
    try { if (resumePromise?.then) await resumePromise; } catch {}
    audio.volume = 1;
    kmateMoveSoundPrimed = Boolean(context && context.state === 'running');
    return kmateMoveSoundPrimed;
  }
}

function kmateMoveSoundHtmlFallback() {
  const audio = kmateMoveSoundPool[kmateMoveSoundPoolIndex++ % kmateMoveSoundPool.length];
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    const promise = audio.play();
    if (promise?.catch) promise.catch((error) => console.warn('K-Mate move sound was blocked.', error));
    return true;
  } catch {
    return false;
  }
}

function kmateMoveSoundPlay(reason = 'move') {
  if (!kmateMoveSoundEnabled()) return false;
  kmateMoveSoundPlayCount += 1;
  kmateMoveSoundLastPlayedAt = performance.now();
  kmateMoveSoundLastReason = reason;
  const context = kmateMoveSoundAudioContext();
  if (context && context.state === 'running' && kmateMoveSoundBuffer) {
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      const compressor = context.createDynamicsCompressor();
      source.buffer = kmateMoveSoundBuffer;
      gain.gain.setValueAtTime(1.28, context.currentTime);
      compressor.threshold.setValueAtTime(-8, context.currentTime);
      compressor.knee.setValueAtTime(8, context.currentTime);
      compressor.ratio.setValueAtTime(4, context.currentTime);
      compressor.attack.setValueAtTime(0.002, context.currentTime);
      compressor.release.setValueAtTime(0.08, context.currentTime);
      source.connect(gain);
      gain.connect(compressor);
      compressor.connect(context.destination);
      source.start(context.currentTime + 0.001);
      return true;
    } catch (error) {
      console.warn('K-Mate Web Audio move playback failed.', error);
    }
  }
  void kmateMoveSoundPrime();
  return kmateMoveSoundHtmlFallback();
}

function kmateMoveSoundPieceSnapshot(board) {
  const pieces = [];
  for (const square of [...board.children].filter((element) => element.classList?.contains('sq'))) {
    const piece = square.querySelector('.piece');
    if (!piece) continue;
    const name = square.dataset.square || square.dataset.km42Square || '';
    const color = piece.classList.contains('white') ? 'w' : piece.classList.contains('black') ? 'b' : '?';
    const type = piece.dataset.pieceType || piece.getAttribute('data-piece-type') || piece.textContent?.trim() || '?';
    pieces.push(`${name}:${color}${type}`);
  }
  pieces.sort();
  return { signature: pieces.join('|'), count: pieces.length };
}

function kmateMoveSoundCheckBoard(board) {
  const previous = kmateMoveSoundSnapshots.get(board);
  const next = kmateMoveSoundPieceSnapshot(board);
  kmateMoveSoundSnapshots.set(board, next);
  if (!previous || !previous.signature || !next.signature) return;
  if (previous.signature === next.signature) return;
  const previousMap = new Set(previous.signature.split('|'));
  const nextMap = new Set(next.signature.split('|'));
  const changed = [...previousMap].filter((item) => !nextMap.has(item)).length
    + [...nextMap].filter((item) => !previousMap.has(item)).length;
  if (changed < 2 || changed > 8) return;
  if (next.count < previous.count) return; // Capture cue remains separate.
  if ([...board.children].some((element) => element.classList?.contains('sq') && element.classList.contains('check'))) return;
  kmateMoveSoundPlay(board.id === 'km42PuzzleBoard' ? 'puzzle-move' : 'game-move');
}

function kmateMoveSoundScheduleBoard(board) {
  window.clearTimeout(kmateMoveSoundTimers.get(board));
  const timer = window.setTimeout(() => kmateMoveSoundCheckBoard(board), 0);
  kmateMoveSoundTimers.set(board, timer);
}

function kmateMoveSoundObserveBoards() {
  if (kmateMoveSoundObserver) return;
  const attach = (board) => {
    if (!board || board.dataset.kmateMoveSoundObserved) return;
    board.dataset.kmateMoveSoundObserved = KMATE_MOVE_SOUND_VERSION;
    kmateMoveSoundSnapshots.set(board, kmateMoveSoundPieceSnapshot(board));
    const observer = new MutationObserver((mutations) => {
      const sourceChanged = mutations.some((mutation) => {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
        if (target === board && mutation.type === 'childList') return true;
        const square = target?.closest?.('.sq');
        if (square && square.parentElement === board) return true;
        return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => (
          node instanceof Element
          && (node.classList.contains('sq') || Boolean(node.querySelector?.('.sq,.piece')))
        ));
      });
      if (sourceChanged) kmateMoveSoundScheduleBoard(board);
    });
    observer.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  };
  document.querySelectorAll('#board,#km42PuzzleBoard').forEach(attach);
  kmateMoveSoundObserver = new MutationObserver(() => document.querySelectorAll('#board,#km42PuzzleBoard').forEach(attach));
  kmateMoveSoundObserver.observe(document.body, { childList: true, subtree: true });
}

function kmateMoveSoundUpdateInterface() {
  const select = document.querySelector('#soundStyleSelect');
  if (!select) return false;
  select.value = 'reference-crisp';
  select.disabled = true;
  select.setAttribute('aria-label', 'Uploaded K-Mate move sound');
  const label = document.querySelector('label[for="soundStyleSelect"]');
  if (label) label.textContent = 'Uploaded piece-move sound';
  const description = document.querySelector('#soundStyleDescription');
  if (description) description.textContent = 'Your uploaded wooden impact is used for every ordinary move. Captures and checks keep separate cues.';
  return true;
}

function kmateMoveSoundFinishMigration() {
  if (!kmateMoveSoundMigrationPending()) return true;
  kmateMoveSoundMigrateSettings({ reinforce: true });
  const toggle = document.querySelector('#soundToggle');
  if (kmateMoveSoundOwnEnabled() && toggle instanceof HTMLButtonElement && toggle.textContent?.includes('🔇')) toggle.click();
  kmateMoveSoundUpdateInterface();

  const stored = kmateMoveSoundStoredSettings();
  const soundOn = kmateMoveSoundOwnEnabled() && !toggle?.textContent?.includes('🔇');
  const profileReady = stored?.soundTheme === 'reference-crisp'
    && stored?.uploadedMoveSoundV45 === KMATE_MOVE_SOUND_VERSION;
  // Keep reinforcing through the app shell's startup writes. Only then mark
  // the one-time migration complete so future manual mute choices are kept.
  const startupSettled = performance.now() - kmateMoveSoundMigrationStartedAt >= 3500;
  if (soundOn && profileReady && document.querySelector('#soundStyleSelect')?.disabled && startupSettled) {
    kmateMoveSoundSetMigrationPending(false);
    return true;
  }
  return false;
}

function kmateMoveSoundInitialize() {
  kmateMoveSoundMigrationStartedAt = performance.now();
  // Deferred app-shell code may write an older settings snapshot after the
  // early migration. Reapply during the short first-run settling window.
  kmateMoveSoundMigrateSettings({ reinforce: kmateMoveSoundMigrationPending() });
  kmateMoveSoundObserveBoards();
  void kmateMoveSoundBytes();
  const updateTimer = window.setInterval(() => {
    kmateMoveSoundUpdateInterface();
    if (kmateMoveSoundFinishMigration()) window.clearInterval(updateTimer);
  }, 120);
  kmateMoveSoundFinishMigration();
  window.setTimeout(() => window.clearInterval(updateTimer), 15000);

  window.addEventListener('pointerdown', () => { void kmateMoveSoundPrime(); }, { capture: true, passive: true });
  window.addEventListener('touchstart', () => { void kmateMoveSoundPrime(); }, { capture: true, passive: true });
  window.addEventListener('keydown', () => { void kmateMoveSoundPrime(); }, { capture: true });
  window.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#previewSoundButton')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      kmateMoveSoundSetEnabled(true);
      const toggle = document.querySelector('#soundToggle');
      if (toggle instanceof HTMLButtonElement && toggle.textContent?.includes('🔇')) toggle.click();
      void kmateMoveSoundPrime().then(() => kmateMoveSoundPlay('preview'));
      return;
    }
    const toggle = target?.closest('#soundToggle');
    if (toggle) {
      window.setTimeout(() => {
        const muted = toggle.textContent?.includes('🔇');
        kmateMoveSoundSetEnabled(!muted);
        if (!muted) void kmateMoveSoundPrime().then(() => kmateMoveSoundPlay('speaker-test'));
      }, 0);
    }
  }, true);

  window.__KMATE_MOVE_SOUND_V45__ = {
    version: KMATE_MOVE_SOUND_VERSION,
    url: KMATE_MOVE_SOUND_URL,
    play: kmateMoveSoundPlay,
    prime: kmateMoveSoundPrime,
    state: () => ({
      ready: true,
      version: KMATE_MOVE_SOUND_VERSION,
      enabled: kmateMoveSoundOwnEnabled(),
      primed: kmateMoveSoundPrimed,
      bufferReady: Boolean(kmateMoveSoundBuffer),
      contextState: kmateMoveSoundContext?.state || 'not-created',
      plays: kmateMoveSoundPlayCount,
      lastPlayedAt: kmateMoveSoundLastPlayedAt,
      lastReason: kmateMoveSoundLastReason,
      interceptedLegacyRequests: kmateMoveSoundInterceptCount,
      profileLocked: document.querySelector('#soundStyleSelect')?.disabled === true,
      migrationPending: kmateMoveSoundMigrationPending(),
      migrationAttempts: kmateMoveSoundMigrationAttempts,
      storedSound: kmateMoveSoundStoredSettings()?.sound,
      storedTheme: kmateMoveSoundStoredSettings()?.soundTheme || null,
    }),
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', kmateMoveSoundInitialize, { once: true });
} else {
  kmateMoveSoundInitialize();
}
