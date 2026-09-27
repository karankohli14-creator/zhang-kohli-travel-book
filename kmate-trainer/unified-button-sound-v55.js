const KMATE_UNIFIED_BUTTON_SOUND_V55 = '56.0.0';
const KMATE_UI_TAP_SIGNATURE_V55 = 'soft-interface-tap';

let km55AudioContext = null;
let km55TapCount = 0;
let km55SuppressedLegacyTaps = 0;
let km55LastControl = '';

function km55SoundsAllowed() {
  const toggle = document.querySelector('#soundToggle');
  let storedSound = true;
  try { storedSound = JSON.parse(localStorage.getItem('kmate-position-v7') || 'null')?.settings?.sound !== false; } catch {}
  return (!toggle || !toggle.classList.contains('muted')) && storedSound;
}

function km55IsBoardInput(control) {
  return Boolean(control?.matches?.(
    '.sq, .km-import-square, .learning-puzzle-square, .replay-board .sq, #board .sq, #km42PuzzleBoard .sq'
  ));
}

function km55ButtonFromEvent(event) {
  const target = event.target instanceof Element ? event.target : null;
  const control = target?.closest?.('button, [role="button"], select, input[type="checkbox"], input[type="range"]');
  if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return null;
  if (km55IsBoardInput(control) || control.closest('#board,#km42PuzzleBoard,.replay-board,.promos')) return null;
  if (control.matches('[data-kmate-no-ui-sound]')) return null;
  return control;
}

function km55PlayUnifiedTap() {
  if (!km55SoundsAllowed()) return false;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  try {
    km55AudioContext ||= new AudioContextClass();
    const context = km55AudioContext;
    void context.resume?.();
    const now = context.currentTime;
    // Match the original quiet interface tap, including the gray controls.
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(405, now);
    oscillator.frequency.exponentialRampToValueAtTime(225, now + 0.046);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1750, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.025, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);
    oscillator.connect(filter).connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.058);

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

  // Do not stop propagation: several play-page controls intentionally use
  // pointer events before their click handlers. Legacy sound layers now
  // detect v55 and opt out, so functionality and one-sound consistency
  // are both preserved.
  event.kmateUnifiedButtonSoundHandled = true;
  km55SuppressedLegacyTaps += 1;
}

function km55OnKeyboardClick(event) {
  if (event.detail !== 0 || event.target?.dataset?.kmateNoUiSound) return;
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
