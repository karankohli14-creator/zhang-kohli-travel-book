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
        trainingGoal: 'all', blindCalibration: false, autoHints: true,
        liveCoach: true, principleReview: false, coachVoice: false,
      },
    }));
  });
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE__?.test?.startLiveCoachPrincipleDemo
      && window.__KMATE_MOBILE_FULL_PAGE_V50__?.state?.().ready
      && window.__KMATE_CLASSIC_BOARD_V46__?.state?.().ready
      && window.__KMATE_REFERENCE_THEME_V52__?.state?.().ready
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

test('full-page phone play keeps titles hidden while showing the complete framed reference board', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#board .piece.kmate-reference-piece-v52')).toHaveCount(32, { timeout: 30_000 });

  await page.evaluate(() => {
    document.querySelector('#positionTitle').textContent = 'Rook against Knight pressure · Variation OOOJ';
    document.querySelector('#gameMeta').textContent = 'Endgame · open-ended branch';
  });

  const layout = await page.evaluate(() => {
    const shell = document.querySelector('.shell').getBoundingClientRect();
    const wrap = document.querySelector('.live-boardwrap').getBoundingClientRect();
    const board = document.querySelector('#board').getBoundingClientRect();
    const engineBar = document.querySelector('#engineBar').getBoundingClientRect();
    const userBar = document.querySelector('#userBar').getBoundingClientRect();
    const title = document.querySelector('#positionTitle');
    const meta = document.querySelector('#gameMeta');
    return {
      appbar: getComputedStyle(document.querySelector('.appbar')).display,
      shell: { top: shell.top, left: shell.left, width: shell.width, height: shell.height },
      wrap: { left: wrap.left, right: wrap.right, width: wrap.width, height: wrap.height },
      board: { left: board.left, right: board.right, width: board.width, height: board.height },
      engineTop: engineBar.top,
      userBottom: userBar.bottom,
      titleDisplay: getComputedStyle(title).display,
      metaDisplay: getComputedStyle(meta).display,
      titleParentHidden: title.parentElement.hidden,
      framePadding: Number.parseFloat(getComputedStyle(document.querySelector('.live-boardwrap')).paddingLeft),
    };
  });

  expect(layout.appbar).toBe('none');
  expect(layout.shell.top).toBeLessThanOrEqual(2);
  expect(layout.shell.left).toBeLessThanOrEqual(2);
  expect(layout.shell.width).toBeGreaterThanOrEqual(388);
  expect(layout.shell.height).toBeGreaterThanOrEqual(842);
  // v53 deliberately leaves a small gutter so the complete brown frame and
  // every notation circle remain inside the phone viewport.
  expect(layout.wrap.width).toBeGreaterThanOrEqual(368);
  expect(layout.wrap.left).toBeGreaterThanOrEqual(6);
  expect(layout.wrap.right).toBeLessThanOrEqual(384);
  expect(Math.abs(layout.wrap.width - layout.wrap.height)).toBeLessThan(2);
  expect(layout.board.width).toBeGreaterThanOrEqual(330);
  expect(layout.board.left).toBeGreaterThan(layout.wrap.left);
  expect(layout.board.right).toBeLessThan(layout.wrap.right);
  expect(Math.abs(layout.board.width - layout.board.height)).toBeLessThan(2);
  expect(layout.framePadding).toBeGreaterThanOrEqual(16);
  expect(layout.engineTop).toBeLessThanOrEqual(4);
  expect(layout.userBottom).toBeGreaterThanOrEqual(838);
  expect(layout.titleDisplay).toBe('none');
  expect(layout.metaDisplay).toBe('none');
  expect(layout.titleParentHidden).toBe(true);
});

test('coach hint remains hidden behind the bulb and Reveal candidate still works', async ({ page }) => {
  test.setTimeout(180_000);
  await prepare(page);
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });

  const hintCard = page.locator('#hintCard');
  const bulb = page.locator('#kmateHintEdgeButton');
  const action = page.locator('#showHintButton');

  await expect(bulb).toBeVisible();
  await expect(bulb).toHaveAttribute('aria-expanded', 'false');
  await expect(hintCard).toBeHidden();

  await bulb.click();
  await expect(bulb).toHaveAttribute('aria-expanded', 'true');
  await expect(hintCard).toBeVisible();
  await expect(page.locator('#hintTitle')).toHaveText('Strategic hint', { timeout: 45_000 });
  await expect(action).toHaveText('Reveal candidate', { timeout: 45_000 });
  await expect(action).toBeEnabled();

  const boardBefore = await page.locator('#board').boundingBox();
  await action.click();
  await expect(page.locator('#hintTitle')).toHaveText('Candidate revealed', { timeout: 10_000 });
  await expect(page.locator('#hintText')).toContainText('Candidate:');
  await expect(action).toHaveText('Candidate shown');
  const boardAfter = await page.locator('#board').boundingBox();
  expect(Math.abs(boardAfter.width - boardBefore.width)).toBeLessThan(2);
  expect(Math.abs(boardAfter.height - boardBefore.height)).toBeLessThan(2);

  await bulb.click();
  await expect(hintCard).toBeHidden();
});

test('fullscreen fallback retains the reference board and hides nonessential controls', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#board .piece.kmate-reference-piece-v52')).toHaveCount(32, { timeout: 30_000 });

  const fullscreen = page.locator('#fullscreenButton');
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveClass(/km50-immersive/);
  await expect(page.locator('#hintCard')).toBeHidden();
  await expect(page.locator('#kmateHintEdgeButton')).toBeHidden();
  await expect(page.locator('#positionTitle')).toBeHidden();
  await expect(page.locator('#board .piece.kmate-reference-piece-v52')).toHaveCount(32);

  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).not.toHaveClass(/km50-immersive/);
  await expect(page.locator('#positionTitle')).toBeHidden();
});
