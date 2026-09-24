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
    // Exercise the CSS fallback used by iPhone and embedded browsers rather
    // than allowing headless Chromium to mask it with the native API.
    try {
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        configurable: true,
        value: undefined,
      });
    } catch {}

    localStorage.setItem('kmate-position-v7', JSON.stringify({
      version: 7,
      sessions: [],
      legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
      settings: {
        phase: 'middlegame',
        opening: 'all',
        positionRating: 1400,
        opponentRating: 1400,
        timeControl: '3+0',
        side: 'w',
        sound: true,
        soundTheme: 'reference-crisp',
        trainingGoal: 'all',
        blindCalibration: false,
        autoHints: true,
        liveCoach: true,
        principleReview: false,
        coachVoice: false,
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
      && window.__KMATE_SIMPLE_PIECES_V51__?.state?.().ready
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

test('phone game is genuinely full-page, title-free, bright, and uses the simpler flat pieces', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);

  const startup = await page.evaluate(() => ({
    fullPage: window.__KMATE_MOBILE_FULL_PAGE_V50__.state(),
    pieces: window.__KMATE_SIMPLE_PIECES_V51__.state(),
  }));
  expect(startup.fullPage.version).toBe('50.0.0');
  expect(startup.fullPage.autoHintsDisabled).toBe(true);
  expect(startup.fullPage.effectiveMoveGain).toBe(0.10);
  expect(startup.pieces.version).toBe('51.0.0');
  expect(startup.pieces.style).toBe('flat-reference-silhouette');

  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#board .piece.kmate-simple-piece-v51')).toHaveCount(32, { timeout: 30_000 });
  await expect(page.locator('#board .piece.kmate-pointed-pawn-v50')).toHaveCount(0);
  await expect(page.locator('#board .piece.kmate-sculpted-piece-v47')).toHaveCount(0);

  await page.evaluate(() => {
    document.querySelector('#positionTitle').textContent = 'Rook against Knight pressure · Variation OOOJ';
    document.querySelector('#gameMeta').textContent = 'Endgame · open-ended branch';
  });

  const layout = await page.evaluate(() => {
    const shell = document.querySelector('.shell').getBoundingClientRect();
    const board = document.querySelector('#board').getBoundingClientRect();
    const wrap = document.querySelector('.live-boardwrap');
    const engineBar = document.querySelector('#engineBar').getBoundingClientRect();
    const userBar = document.querySelector('#userBar').getBoundingClientRect();
    const title = document.querySelector('#positionTitle');
    const titleWrap = title.parentElement;
    const meta = document.querySelector('#gameMeta');
    const light = document.querySelector('#board > .sq.light');
    const dark = document.querySelector('#board > .sq.dark');
    const whitePiece = document.querySelector('#board .piece.kmate-simple-piece-v51.white');
    const blackPiece = document.querySelector('#board .piece.kmate-simple-piece-v51.black');
    const whiteStyle = getComputedStyle(whitePiece);
    const blackStyle = getComputedStyle(blackPiece);
    return {
      appbar: getComputedStyle(document.querySelector('.appbar')).display,
      shell: { top: shell.top, left: shell.left, width: shell.width, height: shell.height },
      board: { width: board.width, height: board.height },
      engineTop: engineBar.top,
      userBottom: userBar.bottom,
      titleHiddenProperty: titleWrap.hidden,
      titleDisplay: getComputedStyle(title).display,
      metaDisplay: getComputedStyle(meta).display,
      wrapShadow: getComputedStyle(wrap).boxShadow,
      lightColor: getComputedStyle(light).backgroundColor,
      darkColor: getComputedStyle(dark).backgroundColor,
      lightImage: getComputedStyle(light).backgroundImage,
      darkImage: getComputedStyle(dark).backgroundImage,
      whiteFill: whiteStyle.getPropertyValue('--kmate-simple-fill').trim(),
      blackFill: blackStyle.getPropertyValue('--kmate-simple-fill').trim(),
      whiteEdge: whiteStyle.getPropertyValue('--kmate-simple-stroke').trim(),
      blackEdge: blackStyle.getPropertyValue('--kmate-simple-stroke').trim(),
      whiteStroke: Number.parseFloat(getComputedStyle(whitePiece.querySelector('.kmate-simple-shape')).strokeWidth),
      blackStroke: Number.parseFloat(getComputedStyle(blackPiece.querySelector('.kmate-simple-shape')).strokeWidth),
      onePathPerPiece: [...document.querySelectorAll('#board .piece.kmate-simple-piece-v51')]
        .every((piece) => piece.querySelectorAll(':scope > svg > path').length === 1),
      gradients: document.querySelectorAll('#board .piece.kmate-simple-piece-v51 linearGradient, #board .piece.kmate-simple-piece-v51 radialGradient').length,
    };
  });

  expect(layout.appbar).toBe('none');
  expect(layout.shell.top).toBeLessThanOrEqual(2);
  expect(layout.shell.left).toBeLessThanOrEqual(2);
  expect(layout.shell.width).toBeGreaterThanOrEqual(388);
  expect(layout.shell.height).toBeGreaterThanOrEqual(842);
  expect(layout.board.width).toBeGreaterThanOrEqual(376);
  expect(Math.abs(layout.board.width - layout.board.height)).toBeLessThan(2);
  expect(layout.engineTop).toBeLessThanOrEqual(4);
  expect(layout.userBottom).toBeLessThanOrEqual(844);
  expect(layout.userBottom).toBeGreaterThanOrEqual(838);
  expect(layout.titleHiddenProperty).toBe(true);
  expect(layout.titleDisplay).toBe('none');
  expect(layout.metaDisplay).toBe('none');
  expect(layout.wrapShadow).not.toBe('none');
  expect(layout.lightColor).toBe('rgb(248, 248, 232)');
  expect(layout.darkColor).toBe('rgb(139, 183, 104)');
  expect(layout.lightImage).not.toBe('none');
  expect(layout.darkImage).not.toBe('none');
  expect(layout.whiteFill).toBe('#fffdf7');
  expect(layout.blackFill).toBe('#202422');
  expect(layout.whiteEdge).toBe('#343937');
  expect(layout.blackEdge).toBe('#0f1211');
  expect(layout.whiteStroke).toBeGreaterThanOrEqual(2);
  expect(layout.blackStroke).toBeGreaterThanOrEqual(2);
  expect(layout.onePathPerPiece).toBe(true);
  expect(layout.gradients).toBe(0);
});

test('coach hint is hidden until the bulb is pressed, then candidate reveal works', async ({ page }) => {
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
  await expect(page.locator('#hintTitle')).toHaveText(/Hidden for this move|Waiting for your turn/);

  await bulb.click();
  await expect(bulb).toHaveAttribute('aria-expanded', 'true');
  await expect(hintCard).toBeVisible();
  await expect(page.locator('#hintTitle')).toHaveText('Strategic hint', { timeout: 45_000 });
  await expect(action).toHaveText('Reveal candidate', { timeout: 45_000 });
  await expect(action).toBeEnabled();
  await expect(page.locator('#hintText')).not.toHaveText(/Candidate:/);

  const boardBeforeCandidate = await page.locator('#board').boundingBox();
  await action.click();
  await expect(page.locator('#hintTitle')).toHaveText('Candidate revealed', { timeout: 10_000 });
  await expect(page.locator('#hintText')).toContainText('Candidate:');
  await expect(action).toHaveText('Candidate shown');
  await expect(action).toBeDisabled();
  const boardAfterCandidate = await page.locator('#board').boundingBox();
  expect(Math.abs(boardAfterCandidate.width - boardBeforeCandidate.width)).toBeLessThan(2);
  expect(Math.abs(boardAfterCandidate.height - boardBeforeCandidate.height)).toBeLessThan(2);

  await bulb.click();
  await expect(hintCard).toBeHidden();
  await expect(bulb).toHaveAttribute('aria-expanded', 'false');
});

test('fullscreen control has a reliable immersive fallback without restoring title or hints', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });

  const fullscreen = page.locator('#fullscreenButton');
  await expect(fullscreen).toBeVisible();
  await fullscreen.click();

  await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveClass(/km50-immersive/);
  await expect(page.locator('#hintCard')).toBeHidden();
  await expect(page.locator('#kmateHintEdgeButton')).toBeHidden();
  await expect(page.locator('#positionTitle')).toBeHidden();
  const active = await page.evaluate(() => window.__KMATE_MOBILE_FULL_PAGE_V50__.state());
  expect(active.fullPage).toBe(true);
  expect(active.immersive).toBe(true);

  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).not.toHaveClass(/km50-immersive/);
  await expect(page.locator('#positionTitle')).toBeHidden();
});
