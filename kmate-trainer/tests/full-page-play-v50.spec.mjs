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
    localStorage.setItem('kmate-position-v7', JSON.stringify({
      version: 7,
      sessions: [],
      legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
      settings: {
        phase: 'endgame', opening: 'all', positionRating: 1400,
        opponentRating: 1400, timeControl: '3+0', side: 'w',
        sound: true, soundTheme: 'reference-crisp',
        trainingGoal: 'all', blindCalibration: false, autoHints: false,
        liveCoach: true, principleReview: false, coachVoice: false,
      },
    }));
  });
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE__?.test?.startLiveCoachPrincipleDemo
      && window.__KMATE_FULL_PAGE_V50__?.state?.().ready
      && window.__KMATE_CLASSIC_BOARD_V46__?.state?.().ready
      && window.__KMATE_SCULPTED_PIECES_V47__?.state?.().ready
    ),
    undefined,
    { timeout: 90_000 },
  );
}

async function startPosition(page) {
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#board .piece.kmate-sculpted-piece-v47')).toHaveCount(32, { timeout: 30_000 });
  await page.waitForFunction(
    () => window.__KMATE_FULL_PAGE_V50__.state().visiblePointedPawns >= 16,
    undefined,
    { timeout: 30_000 },
  );
}

test.use({
  viewport: { width: 390, height: 844 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('active play fills the viewport and reserves the screen for board plus clocks', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await startPosition(page);

  await expect(page.locator('#km50HintBulb')).toBeVisible();
  await expect(page.locator('#kmateHintEdgeButton')).not.toBeVisible();
  await expect(page.locator('#km50HintOverlay')).toBeHidden();

  const layout = await page.evaluate(() => {
    const game = document.querySelector('#gameView').getBoundingClientRect();
    const board = document.querySelector('#board').getBoundingClientRect();
    const titleWrapper = document.querySelector('#positionTitle').parentElement;
    const appbar = document.querySelector('.appbar');
    const hint = document.querySelector('#hintCard');
    const topClock = document.querySelector('#engineClock').getBoundingClientRect();
    const bottomClock = document.querySelector('#userClock').getBoundingClientRect();
    return {
      game: { x: game.x, y: game.y, width: game.width, height: game.height },
      board: { width: board.width, height: board.height },
      viewport: { width: innerWidth, height: innerHeight },
      appbarDisplay: getComputedStyle(appbar).display,
      titleDisplay: getComputedStyle(titleWrapper).display,
      titleHidden: titleWrapper.hidden,
      hintParent: hint.parentElement?.id,
      hintDisplay: getComputedStyle(hint).display,
      topClockVisible: topClock.width > 0 && topClock.height > 0,
      bottomClockVisible: bottomClock.width > 0 && bottomClock.height > 0,
      state: window.__KMATE_FULL_PAGE_V50__.state(),
    };
  });

  expect(layout.appbarDisplay).toBe('none');
  expect(layout.titleHidden || layout.titleDisplay === 'none').toBe(true);
  expect(layout.hintParent).toBe('km50HintPanel');
  expect(layout.hintDisplay).toBe('none');
  expect(layout.game.width).toBeGreaterThanOrEqual(layout.viewport.width - 1);
  expect(layout.game.height).toBeGreaterThanOrEqual(layout.viewport.height - 1);
  expect(layout.board.width).toBeGreaterThanOrEqual(380);
  expect(Math.abs(layout.board.width - layout.board.height)).toBeLessThan(2);
  expect(layout.topClockVisible).toBe(true);
  expect(layout.bottomClockVisible).toBe(true);
  expect(layout.state.titleRemoved).toBe(true);
  expect(layout.state.hintOverlayMounted).toBe(true);
});

test('bulb is the only hint entry point and reveal candidate completes inside the overlay', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);
  await startPosition(page);

  const boardBefore = await page.locator('#board').boundingBox();
  await expect(page.locator('#hintCard')).not.toBeVisible();
  await page.locator('#km50HintBulb').click();
  await expect(page.locator('#km50HintOverlay')).toBeVisible();
  await expect(page.locator('#hintCard')).toBeVisible();
  await expect(page.locator('#km50HintBulb')).toHaveAttribute('aria-expanded', 'true');

  await expect(page.locator('#hintTitle')).toHaveText(/Strategic hint|Candidate revealed/i, { timeout: 45_000 });
  const hintButton = page.locator('#showHintButton');
  const label = (await hintButton.textContent())?.trim() || '';
  if (/reveal candidate/i.test(label)) {
    await hintButton.click();
  }
  await expect(page.locator('#hintTitle')).toHaveText(/Candidate revealed/i, { timeout: 45_000 });
  await expect(page.locator('#hintText')).toContainText('Candidate:', { timeout: 10_000 });
  await expect(page.locator('#km50HintOverlay')).toBeVisible();

  const boardAfter = await page.locator('#board').boundingBox();
  expect(Math.abs((boardBefore?.width || 0) - (boardAfter?.width || 0))).toBeLessThan(2);
  expect(Math.abs((boardBefore?.height || 0) - (boardAfter?.height || 0))).toBeLessThan(2);

  const state = await page.evaluate(() => window.__KMATE_FULL_PAGE_V50__.state());
  expect(state.strategicRequests).toBeGreaterThan(0);
  expect(state.candidateRequests).toBeGreaterThan(0);
  expect(state.candidateRevealed).toBe(true);

  await page.locator('#km50HintClose').click();
  await expect(page.locator('#km50HintOverlay')).toBeHidden();
  await expect(page.locator('#hintCard')).not.toBeVisible();
});

test('board is brighter, pieces have stronger outlines, and pawns use the pointed silhouette', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await startPosition(page);

  const appearance = await page.evaluate(() => {
    const light = document.querySelector('#board > .sq.light');
    const dark = document.querySelector('#board > .sq.dark');
    const white = document.querySelector('#board .piece.kmate-sculpted-piece-v47.white');
    const black = document.querySelector('#board .piece.kmate-sculpted-piece-v47.black');
    const pawn = document.querySelector('#board .piece[data-piece-type="p"] svg[data-kmate-pointed-pawn="50.0.0"]');
    const point = pawn?.querySelector('.crown');
    return {
      light: getComputedStyle(light).backgroundColor,
      dark: getComputedStyle(dark).backgroundColor,
      lightImage: getComputedStyle(light).backgroundImage,
      darkImage: getComputedStyle(dark).backgroundImage,
      lightGlow: getComputedStyle(light).boxShadow,
      darkGlow: getComputedStyle(dark).boxShadow,
      whiteStroke: getComputedStyle(white.querySelector('.sculpted-art')).strokeWidth,
      blackStroke: getComputedStyle(black.querySelector('.sculpted-art')).strokeWidth,
      pointedPawnCount: document.querySelectorAll('#board svg[data-kmate-pointed-pawn="50.0.0"]').length,
      pointPath: point?.getAttribute('d') || '',
    };
  });

  expect(appearance.light).toBe('rgb(248, 250, 234)');
  expect(appearance.dark).toBe('rgb(145, 187, 114)');
  expect(appearance.lightImage).not.toBe('none');
  expect(appearance.darkImage).not.toBe('none');
  expect(appearance.lightGlow).not.toBe('none');
  expect(appearance.darkGlow).not.toBe('none');
  expect(Number.parseFloat(appearance.whiteStroke)).toBeGreaterThanOrEqual(3.1);
  expect(Number.parseFloat(appearance.blackStroke)).toBeGreaterThanOrEqual(2.7);
  expect(appearance.pointedPawnCount).toBe(16);
  expect(appearance.pointPath).toContain('M50 5L60 20');

  await page.locator('#board > .sq[data-square="e2"]').click();
  await page.locator('#board > .sq[data-square="e4"]').click();
  await page.waitForTimeout(120);
  await expect(page.locator('#board svg[data-kmate-pointed-pawn="50.0.0"]')).toHaveCount(16);
});

test('full-page rules do not depend on a narrow mobile breakpoint', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 980, height: 760 });
  await prepare(page);
  await startPosition(page);

  const layout = await page.evaluate(() => {
    const game = document.querySelector('#gameView').getBoundingClientRect();
    const board = document.querySelector('#board').getBoundingClientRect();
    return {
      gameWidth: game.width,
      gameHeight: game.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      boardWidth: board.width,
      boardHeight: board.height,
      title: getComputedStyle(document.querySelector('#positionTitle').parentElement).display,
      appbar: getComputedStyle(document.querySelector('.appbar')).display,
    };
  });
  expect(layout.gameWidth).toBeGreaterThanOrEqual(layout.viewportWidth - 1);
  expect(layout.gameHeight).toBeGreaterThanOrEqual(layout.viewportHeight - 1);
  expect(layout.boardWidth).toBeGreaterThanOrEqual(660);
  expect(Math.abs(layout.boardWidth - layout.boardHeight)).toBeLessThan(2);
  expect(layout.title).toBe('none');
  expect(layout.appbar).toBe('none');
});
