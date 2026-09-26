const KMATE_UNIFIED_BUTTON_SOUND_V55 = '56.0.0';
const KMATE_UI_TAP_SIGNATURE_V55 = 'original-soft-button';
const KMATE_UI_TAP_PROFILE_V55 = Object.freeze({
  oscillator: 'sine',
  startFrequency: 405,
  endFrequency: 225,
  filterFrequency: 1750,
  peakGain: 0.025,
  durationMs: 58,
});

let km55AudioContext = null;
let km55TapCount = 0;
let km55SuppressedLegacyTaps = 0;
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
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  try {
    km55AudioContext ||= new AudioContextClass({ latencyHint: 'interactive' });
    const context = km55AudioContext;
    void context.resume?.();
    const now = context.currentTime + 0.002;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    // Preserve the original K-Mate soft interface tap. Every visual button—
    // green, gray, icon-only, dialog, setup, and in-game—uses this identical
    // profile. Chess-piece movement continues to use its separate wood sample.
    oscillator.type = KMATE_UI_TAP_PROFILE_V55.oscillator;
    oscillator.frequency.setValueAtTime(KMATE_UI_TAP_PROFILE_V55.startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(KMATE_UI_TAP_PROFILE_V55.endFrequency, now + 0.046);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(KMATE_UI_TAP_PROFILE_V55.filterFrequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(KMATE_UI_TAP_PROFILE_V55.peakGain, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + KMATE_UI_TAP_PROFILE_V55.durationMs / 1000);

    km55TapCount += 1;
    document.documentElement.dataset.kmateUnifiedTapCount = String(km55TapCount);
    document.documentElement.dataset.kmateUnifiedTapProfile = KMATE_UI_TAP_SIGNATURE_V55;
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
  control.dataset.kmateUiTapProfile = KMATE_UI_TAP_SIGNATURE_V55;
  km55PlayUnifiedTap();

  // Never stop the functional pointer event. Older interface-sound layers opt
  // out whenever the compatibility v55 class is present, leaving one soft tap.
  event.kmateUnifiedButtonSoundHandled = true;
  km55SuppressedLegacyTaps += 1;
}

function km55OnKeyboardClick(event) {
  if (event.detail !== 0) return;
  const control = km55ButtonFromEvent(event);
  if (!control) return;
  km55LastControl = control.id || control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 80) || control.tagName;
  control.dataset.kmateUiTapProfile = KMATE_UI_TAP_SIGNATURE_V55;
  km55PlayUnifiedTap();
}

function km55State() {
  return {
    ready: true,
    version: KMATE_UNIFIED_BUTTON_SOUND_V55,
    signature: KMATE_UI_TAP_SIGNATURE_V55,
    profile: { ...KMATE_UI_TAP_PROFILE_V55 },
    taps: km55TapCount,
    suppressedLegacyTaps: km55SuppressedLegacyTaps,
    lastControl: km55LastControl,
    soundAllowed: km55SoundsAllowed(),
  };
}

document.documentElement.classList.add('kmate-unified-button-sound-v55', 'kmate-unified-button-sound-v56');
document.addEventListener('pointerdown', km55OnPointerDown, { capture: true, passive: true });
document.addEventListener('click', km55OnKeyboardClick, { capture: true, passive: true });
window.__KMATE_UNIFIED_BUTTON_SOUND_V55__ = {
  version: KMATE_UNIFIED_BUTTON_SOUND_V55,
  play: km55PlayUnifiedTap,
  state: km55State,
};
window.__KMATE_UNIFIED_BUTTON_SOUND_V56__ = window.__KMATE_UNIFIED_BUTTON_SOUND_V55__;
