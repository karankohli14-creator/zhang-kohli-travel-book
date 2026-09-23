import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/';

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
    localStorage.setItem('kmate-position-v7', JSON.stringify({
      version: 7,
      sessions: [],
      legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
      settings: {
        phase: 'middlegame', opening: 'all', positionRating: 1400,
        opponentRating: 1400, timeControl: '3+0', side: 'w',
        sound: false, soundTheme: 'desk-balanced', referenceCrispMigrationDone: true,
        trainingGoal: 'all', blindCalibration: false, autoHints: false,
        liveCoach: false, principleReview: false, coachVoice: false,
      },
    }));
    localStorage.removeItem('kmate-move-sound-v45-enabled');
    localStorage.setItem('kmate-svg-board-v44', JSON.stringify({
      enabled: true, theme: 'wood', coordinates: true, annotations: true,
    }));
  });
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE__?.test?.startLiveCoachPrincipleDemo
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

test('one quieter wood sound owns every board move without the old delay', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);

  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOVE_SOUND_V45__.state().enabled),
    { timeout: 15_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => JSON.parse(localStorage.getItem('kmate-position-v7'))?.settings?.soundTheme),
    { timeout: 15_000 },
  ).toBe('reference-crisp');
  await expect.poll(
    () => page.evaluate(() => JSON.parse(localStorage.getItem('kmate-position-v7'))?.settings?.uploadedMoveSoundV45),
    { timeout: 15_000 },
  ).toBe('45.2.0');
  await expect.poll(
    () => page.evaluate(() => JSON.parse(localStorage.getItem('kmate-position-v7'))?.settings?.uniformWoodMoveSound),
    { timeout: 15_000 },
  ).toBe(true);
  await expect.poll(
    () => page.evaluate(() => JSON.parse(localStorage.getItem('kmate-position-v7'))?.settings?.woodMoveSoundVolume),
    { timeout: 15_000 },
  ).toBe(0.48);
  await expect.poll(
    () => page.locator('#soundToggle').textContent(),
    { timeout: 15_000 },
  ).toContain('🔊');

  await expect(page.locator('#soundStyleSelect')).toBeDisabled({ timeout: 20_000 });
  await expect(page.locator('#soundStyleDescription')).toContainText('same quieter wooden impact');
  const soundState = await page.evaluate(() => window.__KMATE_MOVE_SOUND_V45__.state());
  expect(soundState.version).toBe('45.2.0');
  expect(soundState.enabled).toBe(true);
  expect(soundState.volume).toBe(0.48);
  expect(soundState.uniformBoardSound).toBe(true);
  expect(soundState.suppressedCoreKinds).toEqual(['move', 'capture', 'check']);
  expect(soundState.storedTheme).toBe('reference-crisp');

  const initialPlays = soundState.plays;
  await page.evaluate(async () => {
    await window.__KMATE_MOVE_SOUND_V45__.prime();
    window.__KMATE_MOVE_SOUND_V45__.play('preview-test');
  });
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOVE_SOUND_V45__.state().plays),
    { timeout: 10_000 },
  ).toBeGreaterThan(initialPlays);

  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board.svg44-enabled [data-svg-square]')).toHaveCount(64, { timeout: 30_000 });

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
  expect(visibleMove.elapsed).toBeLessThan(140);

  await expect(page.locator('#board .svg44-overlay animateTransform')).toHaveCount(0);
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOVE_SOUND_V45__.state().plays),
    { timeout: 10_000 },
  ).toBeGreaterThan(initialPlays + 1);
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOVE_SOUND_V45__.state().interceptedLegacyKinds),
    { timeout: 15_000 },
  ).toEqual(['capture', 'check', 'move']);

  const finalSoundState = await page.evaluate(() => window.__KMATE_MOVE_SOUND_V45__.state());
  expect(finalSoundState.interceptedLegacyRequests).toBeGreaterThanOrEqual(3);
  const performanceState = await page.evaluate(() => window.__KMATE_SVG_BOARD_PERFORMANCE__.state());
  expect(performanceState.arrivalAnimationsDisabled).toBe(true);
  expect(performanceState.decorativeFiltersDisabled).toBe(true);
  expect(await page.evaluate(() => typeof window.__KMATE_SVG_BOARD_PERFORMANCE__.snapTap)).toBe('function');
});
