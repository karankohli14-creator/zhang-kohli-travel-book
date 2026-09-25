const KMATE_UNIFIED_BUTTON_SOUND_V55 = '55.0.0';
const KMATE_UI_TAP_SIGNATURE_V55 = 'generate-and-start-position';

let km55AudioContext = null;
let km55TapCount = 0;
let km55SuppressedLegacyTaps = 0;
let km55LastTapAt = 0;
let km55LastControl = '';

function km55SoundsAllowed() {
  const toggle = document.querySelector('#soundToggle');
  return !toggle || !toggle.classList.contains('muted');
}

function km55IsBoardInput(control) {
  return Boolean(control?.matches?.(
    '.sq, .km-import-square, .learning-puzzle-square, .replay-board .sq, #board .sq, #km42PuzzleBoard .sq'
  ));
}

function km55ButtonFromEvent(event) {
  const target = event.target instanceof Element ? event.target : null;
  const control = target?.closest?.('button, [role="button"]');
  if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return null;
  if (km55IsBoardInput(control)) return null;
  if (control.matches('[data-kmate-no-ui-sound]')) return null;
  return control;
}

function km55PlayUnifiedTap() {
  if (!km55SoundsAllowed()) return false;
  const nowMs = performance.now();
  if (nowMs - km55LastTapAt < 34) return false;
  km55LastTapAt = nowMs;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  try {
    km55AudioContext ||= new AudioContextClass();
    const context = km55AudioContext;
    void context.resume?.();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.0594, now + 0.004);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
    master.connect(context.destination);

    // This is the exact tactile wood-tap profile used by the existing
    // Generate and start position / Start training controls.
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

    km55TapCount += 1;
    document.documentElement.dataset.kmateUnifiedTapCount = String(km55TapCount);
    return true;
  } catch (error) {
    console.debug('K-Mate unified button sound is unavailable.', error);
    return false;
  }
}

function km55OnPointerDown(event) {
  const control = km55ButtonFromEvent(event);
  if (!control) return;
  km55LastControl = control.id || control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 80) || control.tagName;
  km55PlayUnifiedTap();

  // Older K-Mate layers attach their own pointerdown sounds. Stopping only the
  // pointerdown propagation keeps the eventual click/action intact while
  // guaranteeing that exactly one button sound is heard.
  event.stopImmediatePropagation();
  km55SuppressedLegacyTaps += 1;
}

function km55OnKeyboardClick(event) {
  if (event.detail !== 0) return;
  const control = km55ButtonFromEvent(event);
  if (!control) return;
  km55LastControl = control.id || control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 80) || control.tagName;
  km55PlayUnifiedTap();
}

function km55State() {
  return {
    ready: true,
    version: KMATE_UNIFIED_BUTTON_SOUND_V55,
    signature: KMATE_UI_TAP_SIGNATURE_V55,
    taps: km55TapCount,
    suppressedLegacyTaps: km55SuppressedLegacyTaps,
    lastControl: km55LastControl,
    soundAllowed: km55SoundsAllowed(),
  };
}

document.documentElement.classList.add('kmate-unified-button-sound-v55');
document.addEventListener('pointerdown', km55OnPointerDown, { capture: true, passive: true });
document.addEventListener('click', km55OnKeyboardClick, { capture: true, passive: true });
window.__KMATE_UNIFIED_BUTTON_SOUND_V55__ = {
  version: KMATE_UNIFIED_BUTTON_SOUND_V55,
  play: km55PlayUnifiedTap,
  state: km55State,
};
