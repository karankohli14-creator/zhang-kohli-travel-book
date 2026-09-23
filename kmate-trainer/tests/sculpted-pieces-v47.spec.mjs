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
        phase: 'middlegame', opening: 'all', positionRating: 1400,
        opponentRating: 1400, timeControl: '3+0', side: 'w',
        sound: false, soundTheme: 'reference-crisp',
        trainingGoal: 'all', blindCalibration: false, autoHints: false,
        liveCoach: false, principleReview: false, coachVoice: false,
      },
    }));
  });
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE__?.test?.startLiveCoachPrincipleDemo
      && window.__KMATE_CLASSIC_BOARD_V46__?.state?.().ready
      && window.__KMATE_SCULPTED_PIECES_V47__?.state?.().ready
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

test('v47 uses the sculpted ivory-and-ebony piece set without changing board behavior', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);

  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#board > .svg44-overlay')).toHaveCount(0);
  await expect(page.locator('#board .piece.kmate-sculpted-piece-v47')).toHaveCount(32, { timeout: 30_000 });
  await expect(page.locator('#board .piece.kmate-sculpted-piece-v47 > svg[data-kmate-sculpted-piece]')).toHaveCount(32);

  for (const type of ['p', 'r', 'n', 'b', 'q', 'k']) {
    expect(await page.locator(`#board .piece.kmate-sculpted-piece-v47[data-piece-type="${type}"]`).count()).toBeGreaterThan(0);
  }

  const artwork = await page.evaluate(() => {
    const moduleState = window.__KMATE_SCULPTED_PIECES_V47__.state();
    const white = document.querySelector('#board .piece.white.kmate-sculpted-piece-v47');
    const black = document.querySelector('#board .piece.black.kmate-sculpted-piece-v47');
    const knight = document.querySelector('#board .piece[data-piece-type="n"] svg');
    const queen = document.querySelector('#board .piece[data-piece-type="q"] svg');
    const whiteStyle = getComputedStyle(white);
    const blackStyle = getComputedStyle(black);
    return {
      moduleState,
      whiteBody: whiteStyle.getPropertyValue('--kmate-sculpted-body-mid').trim(),
      blackBody: blackStyle.getPropertyValue('--kmate-sculpted-body-mid').trim(),
      knightPaths: knight?.querySelectorAll('path').length || 0,
      knightHasEye: Boolean(knight?.querySelector('.eye')),
      knightHasMane: Boolean(knight?.querySelector('.mane')),
      queenJewels: queen?.querySelectorAll('.jewel').length || 0,
      sourceImageCopied: moduleState.sourceImageCopied,
    };
  });

  expect(artwork.moduleState.version).toBe('47.0.0');
  expect(artwork.moduleState.style).toBe('original-sculpted-wood-inspired');
  expect(artwork.sourceImageCopied).toBe(false);
  expect(artwork.whiteBody).not.toBe(artwork.blackBody);
  expect(artwork.knightPaths).toBeGreaterThanOrEqual(8);
  expect(artwork.knightHasEye).toBe(true);
  expect(artwork.knightHasMane).toBe(true);
  expect(artwork.queenJewels).toBe(5);

  await page.locator('#board > .sq[data-square="e2"]').click();
  await expect(page.locator('#board > .sq[data-square="e2"]')).toHaveClass(/selected/);
  await page.locator('#board > .sq[data-square="e4"]').click();

  await expect(page.locator('#board > .sq[data-square="e4"] .piece.kmate-sculpted-piece-v47[data-piece-type="p"]')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('#board > .svg44-overlay')).toHaveCount(0);
  await expect(page.locator('#board .piece.kmate-sculpted-piece-v47')).toHaveCount(32);

  // Verify that later-created boards and promotion-style controls inherit the
  // same artwork through the lightweight observer.
  await page.evaluate(() => {
    const square = document.createElement('div');
    square.id = 'v47DynamicPieceFixture';
    square.className = 'sq';
    square.hidden = true;
    const piece = document.createElement('div');
    piece.className = 'piece white';
    piece.dataset.pieceType = 'q';
    piece.dataset.pieceColor = 'w';
    square.append(piece);
    document.body.append(square);
  });
  await expect(page.locator('#v47DynamicPieceFixture .piece.kmate-sculpted-piece-v47[data-piece-type="q"]')).toHaveCount(1, { timeout: 10_000 });
});
