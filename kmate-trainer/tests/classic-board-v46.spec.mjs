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
      && window.__KMATE_CLASSIC_BOARD_V46__?.state?.().ready
      && window.__KMATE_SIMPLE_PIECES_V51__?.state?.().ready
      && window.__KMATE_MOVE_FEEDBACK_V48__?.state?.().ready
      && window.__KMATE_GAME_UX_V48__?.state?.().ready
      && window.__KMATE_MOBILE_FULL_PAGE_V50__?.state?.().ready
      && window.__KMATE_MOVE_SOUND_V45__?.state?.().ready
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

test('stable board keeps the simpler reference pieces visible and preserves quiet movement feedback', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);

  const startup = await page.evaluate(() => ({
    classic: window.__KMATE_CLASSIC_BOARD_V46__.state(),
    pieces: window.__KMATE_SIMPLE_PIECES_V51__.state(),
    feedback: window.__KMATE_MOVE_FEEDBACK_V48__.state(),
    compatibility: window.__KMATE_MOVE_SOUND_V45__.state(),
    ux: window.__KMATE_GAME_UX_V48__.state(),
    fullPage: window.__KMATE_MOBILE_FULL_PAGE_V50__.state(),
    storedSvg: JSON.parse(localStorage.getItem('kmate-svg-board-v44') || 'null'),
  }));
  expect(startup.classic.active).toBe(true);
  expect(startup.classic.renderer).toBe('native-staunton-grid');
  expect(startup.storedSvg.enabled).toBe(false);
  expect(startup.pieces.version).toBe('51.0.0');
  expect(startup.pieces.style).toBe('flat-reference-silhouette');
  expect(startup.pieces.gradients).toBe(0);
  expect(startup.pieces.decorativeDetailLayers).toBe(0);
  expect(startup.feedback.version).toBe('48.0.0');
  expect(startup.feedback.volume).toBe(0.24);
  expect(startup.feedback.hapticDurationMs).toBe(8);
  expect(startup.feedback.legacyLoudPlayerDisabled).toBe(true);
  expect(startup.compatibility.enabled).toBe(false);
  expect(startup.compatibility.suppressedCoreKinds).toEqual(['move', 'capture', 'check']);
  expect(startup.ux.softButtonSound).toBe(true);
  expect(startup.fullPage.version).toBe('50.0.0');
  expect(startup.fullPage.effectiveMoveGain).toBe(0.10);

  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#board > .svg44-overlay')).toHaveCount(0);
  await expect(page.locator('#board .piece.kmate-simple-piece-v51')).toHaveCount(32, { timeout: 30_000 });
  await expect(page.locator('#board .piece.kmate-simple-piece-v51 svg[data-kmate-simple-piece]')).toHaveCount(32);
  await expect(page.locator('#board .piece.kmate-pointed-pawn-v50')).toHaveCount(0);

  const palette = await page.evaluate(() => {
    const light = document.querySelector('#board > .sq.light');
    const dark = document.querySelector('#board > .sq.dark');
    const white = document.querySelector('#board .piece.kmate-simple-piece-v51.white');
    const black = document.querySelector('#board .piece.kmate-simple-piece-v51.black');
    const whiteStyle = getComputedStyle(white);
    const blackStyle = getComputedStyle(black);
    return {
      light: getComputedStyle(light).backgroundColor,
      dark: getComputedStyle(dark).backgroundColor,
      lightImage: getComputedStyle(light).backgroundImage,
      darkImage: getComputedStyle(dark).backgroundImage,
      whiteFill: whiteStyle.getPropertyValue('--kmate-simple-fill').trim(),
      blackFill: blackStyle.getPropertyValue('--kmate-simple-fill').trim(),
      whiteEdge: whiteStyle.getPropertyValue('--kmate-simple-stroke').trim(),
      blackEdge: blackStyle.getPropertyValue('--kmate-simple-stroke').trim(),
      whiteStroke: getComputedStyle(white.querySelector('.kmate-simple-shape')).strokeWidth,
      blackStroke: getComputedStyle(black.querySelector('.kmate-simple-shape')).strokeWidth,
      gradients: document.querySelectorAll('#board .piece.kmate-simple-piece-v51 linearGradient, #board .piece.kmate-simple-piece-v51 radialGradient').length,
      paths: document.querySelectorAll('#board .piece.kmate-simple-piece-v51 > svg > path').length,
    };
  });
  expect(palette.light).toBe('rgb(248, 248, 232)');
  expect(palette.dark).toBe('rgb(139, 183, 104)');
  expect(palette.lightImage).not.toBe('none');
  expect(palette.darkImage).not.toBe('none');
  expect(palette.whiteFill).toBe('#fffdf7');
  expect(palette.blackFill).toBe('#202422');
  expect(palette.whiteEdge).toBe('#343937');
  expect(palette.blackEdge).toBe('#0f1211');
  expect(Number.parseFloat(palette.whiteStroke)).toBeGreaterThanOrEqual(2);
  expect(Number.parseFloat(palette.blackStroke)).toBeGreaterThanOrEqual(2);
  expect(palette.gradients).toBe(0);
  expect(palette.paths).toBe(32);

  const beforeMove = await page.evaluate(() => window.__KMATE_MOVE_FEEDBACK_V48__.state());
  await page.locator('#board > .sq[data-square="e2"]').click();
  await expect(page.locator('#board > .sq[data-square="e2"]')).toHaveClass(/selected/);

  const probe = page.evaluate(() => new Promise((resolve) => {
    const board = document.querySelector('#board');
    const destination = board.querySelector(':scope > .sq[data-square="e4"]');
    const started = performance.now();
    let frames = 0;
    let minimumPieceCount = Infinity;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve({
        elapsed: performance.now() - started,
        minimumPieceCount,
        moved: Boolean(board.querySelector(':scope > .sq[data-square="e4"] .piece.kmate-simple-piece-v51')),
        overlay: Boolean(board.querySelector(':scope > .svg44-overlay')),
      });
    };
    const sample = () => {
      frames += 1;
      minimumPieceCount = Math.min(minimumPieceCount, board.querySelectorAll('.piece.kmate-simple-piece-v51').length);
      if (board.querySelector(':scope > .sq[data-square="e4"] .piece.kmate-simple-piece-v51') || frames >= 24) {
        finish();
        return;
      }
      requestAnimationFrame(sample);
    };
    destination.click();
    requestAnimationFrame(sample);
  }));

  const move = await probe;
  expect(move.moved).toBe(true);
  expect(move.overlay).toBe(false);
  expect(move.minimumPieceCount).toBe(32);
  expect(move.elapsed).toBeLessThan(250);

  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOVE_FEEDBACK_V48__.state().plays),
    { timeout: 10_000 },
  ).toBeGreaterThan(beforeMove.plays);
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOVE_FEEDBACK_V48__.state().haptics),
    { timeout: 10_000 },
  ).toBeGreaterThan(beforeMove.haptics);
  expect(await page.evaluate(() => window.__kmateVibrations)).toContain(8);

  const finalState = await page.evaluate(() => window.__KMATE_CLASSIC_BOARD_V46__.state());
  expect(finalState.boards.find((board) => board.id === 'board')?.overlay).toBe(false);
});
