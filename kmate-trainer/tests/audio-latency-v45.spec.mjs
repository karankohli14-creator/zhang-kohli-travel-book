import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/?legacySvg=1';

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

async function prepare(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (duration) => {
        window.__kmateVibrations ||= [];
        window.__kmateVibrations.push(duration);
        return true;
      },
    });
    localStorage.setItem('kmate-position-v7', JSON.stringify({
      version: 7,
      sessions: [],
      legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
      settings: {
        phase: 'middlegame', opening: 'all', positionRating: 1400,
        opponentRating: 1400, timeControl: '3+0', side: 'w',
        sound: true, soundTheme: 'reference-crisp',
        trainingGoal: 'all', blindCalibration: false, autoHints: false,
        liveCoach: false, principleReview: false, coachVoice: false,
      },
    }));
    localStorage.setItem('kmate-svg-board-v44', JSON.stringify({
      enabled: true, theme: 'wood', coordinates: true, annotations: true,
    }));
  });
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE__?.test?.startLiveCoachPrincipleDemo
      && window.__KMATE_MOVE_FEEDBACK_V48__?.state?.().ready
      && window.__KMATE_MOVE_SOUND_V45__?.state?.().ready
      && window.__KMATE_SVG_BOARD__?.state?.().ready
      && window.__KMATE_SVG_BOARD_INPUT__?.state?.().ready
      && window.__KMATE_SVG_BOARD_PERFORMANCE__?.state?.().ready
    ),
    undefined,
    { timeout: 90_000 },
  );
}

test.use({
  viewport: { width: 390, height: 844 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('v48 owns a 50-percent-quieter move sound and subtle haptic without delaying the SVG fallback', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);

  const startup = await page.evaluate(() => ({
    feedback: window.__KMATE_MOVE_FEEDBACK_V48__.state(),
    compatibility: window.__KMATE_MOVE_SOUND_V45__.state(),
  }));
  expect(startup.feedback.version).toBe('48.0.0');
  expect(startup.feedback.volume).toBe(0.24);
  expect(startup.feedback.hapticDurationMs).toBe(8);
  expect(startup.feedback.legacyLoudPlayerDisabled).toBe(true);
  expect(startup.compatibility.enabled).toBe(false);
  expect(startup.compatibility.suppressedCoreKinds).toEqual(['move', 'capture', 'check']);

  const previewStart = startup.feedback.plays;
  await page.evaluate(async () => {
    await window.__KMATE_MOVE_FEEDBACK_V48__.prime();
    window.__KMATE_MOVE_FEEDBACK_V48__.play('preview-test', { haptic: false });
  });
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOVE_FEEDBACK_V48__.state().plays),
    { timeout: 10_000 },
  ).toBeGreaterThan(previewStart);

  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board.svg44-enabled [data-svg-square]')).toHaveCount(64, { timeout: 30_000 });

  const beforeMove = await page.evaluate(() => window.__KMATE_MOVE_FEEDBACK_V48__.state());
  await page.locator('#board [data-svg-square="e2"]').click();
  await expect(page.locator('#board > .sq[data-square="e2"]')).toHaveClass(/selected/);

  const visibleMove = await page.evaluate(() => new Promise((resolve) => {
    const board = document.querySelector('#board');
    const target = board?.querySelector('[data-svg-square="e4"]');
    const started = performance.now();
    let settled = false;
    const finish = (moved) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      resolve({ moved, elapsed: performance.now() - started });
    };
    const isVisible = () => Boolean(board?.querySelector('.svg44-piece[data-svg-piece="e4"]'));
    const observer = new MutationObserver(() => {
      if (isVisible()) finish(true);
    });
    observer.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-svg-piece'] });
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    if (isVisible()) finish(true);
    window.setTimeout(() => finish(isVisible()), 500);
  }));
  expect(visibleMove.moved).toBe(true);
  expect(visibleMove.elapsed).toBeLessThan(160);
  await expect(page.locator('#board .svg44-overlay animateTransform')).toHaveCount(0);

  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOVE_FEEDBACK_V48__.state().plays),
    { timeout: 10_000 },
  ).toBeGreaterThan(beforeMove.plays);
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOVE_FEEDBACK_V48__.state().haptics),
    { timeout: 10_000 },
  ).toBeGreaterThan(beforeMove.haptics);
  expect(await page.evaluate(() => window.__kmateVibrations)).toContain(8);

  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOVE_SOUND_V45__.state().interceptedLegacyKinds),
    { timeout: 15_000 },
  ).toEqual(['capture', 'check', 'move']);
  const performanceState = await page.evaluate(() => window.__KMATE_SVG_BOARD_PERFORMANCE__.state());
  expect(performanceState.arrivalAnimationsDisabled).toBe(true);
  expect(performanceState.decorativeFiltersDisabled).toBe(true);
});
