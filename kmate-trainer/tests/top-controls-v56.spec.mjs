import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/?nativeBoard=1';

function chessModuleSource() {
  const candidate = path.resolve('node_modules/chess.js/dist/esm/chess.js');
  if (!fs.existsSync(candidate)) throw new Error('chess.js test dependency is missing.');
  return fs.readFileSync(candidate, 'utf8');
}

async function routeChessJs(page) {
  const body = chessModuleSource();
  const fulfill = (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript; charset=utf-8',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body,
  });
  await page.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/chess\.js@1\.4\.0\/\+esm.*/, fulfill);
  await page.route(/https:\/\/esm\.sh\/chess\.js@1\.4\.0.*/, fulfill);
}

async function prepare(page, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    window.__km56Spoken = [];
    class FakeUtterance {
      constructor(text = '') {
        this.text = text;
        this.lang = 'en-US';
        this.rate = 1;
        this.pitch = 1;
        this.volume = 1;
        this.voice = null;
      }
    }
    const synth = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [{ name: 'Test English', lang: 'en-US' }],
      resume() {},
      pause() {},
      cancel() { this.speaking = false; this.pending = false; },
      speak(utterance) {
        window.__km56Spoken.push(String(utterance?.text || ''));
        this.speaking = true;
        utterance?.onstart?.({ type: 'start' });
        setTimeout(() => {
          this.speaking = false;
          utterance?.onend?.({ type: 'end', elapsedTime: 0, charIndex: 0 });
        }, 10);
      },
    };
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    try {
      Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    } catch {}
    localStorage.setItem('kmate-position-v7', JSON.stringify({
      version: 7,
      sessions: [],
      legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
      settings: {
        phase: 'middlegame', opening: 'all', positionRating: 1400,
        opponentRating: 1400, timeControl: '3+0', side: 'w',
        sound: true, soundTheme: 'reference-crisp',
        trainingGoal: 'all', blindCalibration: false, autoHints: false,
        liveCoach: true, principleReview: false, coachVoice: true,
      },
    }));
  });
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE__?.test?.startLiveCoachPrincipleDemo
      && window.__KMATE_TOP_CONTROLS_V56__?.state?.().ready
      && window.__KMATE_UNIFIED_BUTTON_SOUND_V56__?.state?.().ready
      && window.__KMATE_MOBILE_FIT_V54__?.state?.().ready
    ),
    undefined,
    { timeout: 90_000 },
  );
}

async function startPlay(page) {
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#panelToggleButton')).toBeVisible();
  await expect(page.locator('#gameCoachAudioButton')).toBeVisible();
}

test.use({
  viewport: { width: 390, height: 844 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('green, gray, and icon buttons all use the identical original soft tap', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);

  const result = await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'km56SoundFixture';
    fixture.innerHTML = `
      <button id="km56Green" class="btn primary" type="button">Start training</button>
      <button id="km56Gray" class="btn" type="button">Continue</button>
      <button id="km56Icon" class="roundbtn" type="button">☰</button>`;
    document.body.append(fixture);

    const before = {
      unified: window.__KMATE_UNIFIED_BUTTON_SOUND_V56__.state(),
      legacy: window.__KMATE_GAME_UX_V48__?.state?.().softButtonTaps || 0,
    };
    for (const id of ['km56Green', 'km56Gray', 'km56Icon']) {
      const button = document.getElementById(id);
      button.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        pointerType: 'mouse',
        button: 0,
      }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
    }
    return {
      before,
      after: {
        unified: window.__KMATE_UNIFIED_BUTTON_SOUND_V56__.state(),
        legacy: window.__KMATE_GAME_UX_V48__?.state?.().softButtonTaps || 0,
      },
      profiles: ['km56Green', 'km56Gray', 'km56Icon'].map((id) => document.getElementById(id).dataset.kmateUiTapProfile),
    };
  });

  expect(result.after.unified.version).toBe('56.0.0');
  expect(result.after.unified.signature).toBe('original-soft-button');
  expect(result.after.unified.profile).toMatchObject({
    oscillator: 'sine',
    startFrequency: 405,
    endFrequency: 225,
    filterFrequency: 1750,
    peakGain: 0.025,
  });
  expect(result.after.unified.taps - result.before.unified.taps).toBe(3);
  expect(result.after.legacy).toBe(result.before.legacy);
  expect(result.profiles).toEqual(['original-soft-button', 'original-soft-button', 'original-soft-button']);
});

test('the three-line control always opens the mobile details drawer with Resign available', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await startPlay(page);

  await page.locator('#panelToggleButton').click();
  await expect(page.locator('#panelToggleButton')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('body')).toHaveClass(/game-panel-open/);
  await expect(page.locator('#gamePanelBackdrop')).toBeVisible();
  await expect(page.locator('#gameView .sidepanel')).toBeVisible();
  await expect(page.locator('#resignButton')).toBeVisible();
  await expect(page.locator('#resignButton')).toBeEnabled();

  const openState = await page.evaluate(() => window.__KMATE_TOP_CONTROLS_V56__.state());
  expect(openState.menuOpen).toBe(true);
  expect(openState.menuExpanded).toBe(true);
  expect(openState.panelVisible).toBe(true);
  expect(openState.backdropVisible).toBe(true);

  await page.locator('#gamePanelBackdrop').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('body')).not.toHaveClass(/game-panel-open/);
  await expect(page.locator('#panelToggleButton')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#gamePanelBackdrop')).toBeHidden();
});

test('touch activation opens the details drawer once rather than immediately closing it', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await startPlay(page);

  await page.evaluate(() => {
    const button = document.querySelector('#panelToggleButton');
    button.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      composed: true,
      pointerType: 'touch',
      pointerId: 1,
      isPrimary: true,
    }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
  });

  await expect(page.locator('body')).toHaveClass(/game-panel-open/);
  await expect(page.locator('#panelToggleButton')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#resignButton')).toBeVisible();
});

test('the play-page speaker toggles coach voice silently and never announces audio readiness', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await startPlay(page);

  await expect(page.locator('#gameCoachAudioButton')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#gameCoachAudioButton').click();
  await expect(page.locator('#gameCoachAudioButton')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#liveCoachVoice')).not.toBeChecked();

  await page.locator('#gameCoachAudioButton').click();
  await expect(page.locator('#gameCoachAudioButton')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#liveCoachVoice')).toBeChecked();

  const before = await page.evaluate(() => ({
    spoken: [...window.__km56Spoken],
    suppressed: window.__KMATE_TOP_CONTROLS_V56__.state().suppressedReadySpeech,
  }));
  await page.evaluate(() => {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(
      'K Mate coach audio is ready. You will hear both live coaching and post game reviews on this device.'
    ));
  });
  await page.waitForTimeout(50);
  const after = await page.evaluate(() => ({
    spoken: [...window.__km56Spoken],
    suppressed: window.__KMATE_TOP_CONTROLS_V56__.state().suppressedReadySpeech,
  }));

  expect(after.spoken).toEqual(before.spoken);
  expect(after.suppressed).toBeGreaterThan(before.suppressed);
  expect(after.spoken.some((text) => /audio is ready|both live coaching/i.test(text))).toBe(false);
});
