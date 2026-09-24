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

test('v51 uses one clean flat silhouette per piece without changing board behavior', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);

  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#board > .svg44-overlay')).toHaveCount(0);
  await expect(page.locator('#board .piece.kmate-simple-piece-v51')).toHaveCount(32, { timeout: 30_000 });
  await expect(page.locator('#board .piece.kmate-simple-piece-v51 > svg[data-kmate-simple-piece]')).toHaveCount(32);
  await expect(page.locator('#board .piece.kmate-sculpted-piece-v47')).toHaveCount(0);
  await expect(page.locator('#board .piece.kmate-pointed-pawn-v50')).toHaveCount(0);

  for (const type of ['p', 'r', 'n', 'b', 'q', 'k']) {
    expect(await page.locator(`#board .piece.kmate-simple-piece-v51[data-piece-type="${type}"]`).count()).toBeGreaterThan(0);
  }

  const artwork = await page.evaluate(() => {
    const moduleState = window.__KMATE_SIMPLE_PIECES_V51__.state();
    const legacyAliasState = window.__KMATE_SCULPTED_PIECES_V47__.state();
    const white = document.querySelector('#board .piece.white.kmate-simple-piece-v51');
    const black = document.querySelector('#board .piece.black.kmate-simple-piece-v51');
    const allPieces = [...document.querySelectorAll('#board .piece.kmate-simple-piece-v51')];
    const whiteStyle = getComputedStyle(white);
    const blackStyle = getComputedStyle(black);
    return {
      moduleState,
      legacyAliasVersion: legacyAliasState.version,
      whiteFill: whiteStyle.getPropertyValue('--kmate-simple-fill').trim(),
      blackFill: blackStyle.getPropertyValue('--kmate-simple-fill').trim(),
      whiteStroke: whiteStyle.getPropertyValue('--kmate-simple-stroke').trim(),
      blackStroke: blackStyle.getPropertyValue('--kmate-simple-stroke').trim(),
      onePathEach: allPieces.every((piece) => piece.querySelectorAll(':scope > svg > path').length === 1),
      noGradients: allPieces.every((piece) => !piece.querySelector('linearGradient, radialGradient')),
      noDecorativePrimitives: allPieces.every((piece) => !piece.querySelector('circle, ellipse, polygon, polyline, line')),
      evenOddPaths: allPieces.every((piece) => piece.querySelector(':scope > svg > path')?.getAttribute('fill-rule') === 'evenodd'),
      sourceImageCopied: moduleState.sourceImageCopied,
    };
  });

  expect(artwork.moduleState.version).toBe('51.0.0');
  expect(artwork.legacyAliasVersion).toBe('51.0.0');
  expect(artwork.moduleState.style).toBe('flat-reference-silhouette');
  expect(artwork.sourceImageCopied).toBe(false);
  expect(artwork.moduleState.gradients).toBe(0);
  expect(artwork.moduleState.decorativeDetailLayers).toBe(0);
  expect(artwork.whiteFill).toBe('#fffdf7');
  expect(artwork.blackFill).toBe('#202422');
  expect(artwork.whiteStroke).toBe('#343937');
  expect(artwork.blackStroke).toBe('#0f1211');
  expect(artwork.onePathEach).toBe(true);
  expect(artwork.noGradients).toBe(true);
  expect(artwork.noDecorativePrimitives).toBe(true);
  expect(artwork.evenOddPaths).toBe(true);

  await page.locator('#board > .sq[data-square="e2"]').click();
  await expect(page.locator('#board > .sq[data-square="e2"]')).toHaveClass(/selected/);
  await page.locator('#board > .sq[data-square="e4"]').click();

  await expect(page.locator('#board > .sq[data-square="e4"] .piece.kmate-simple-piece-v51[data-piece-type="p"]')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('#board > .svg44-overlay')).toHaveCount(0);
  await expect(page.locator('#board .piece.kmate-simple-piece-v51')).toHaveCount(32);

  // Later-created boards and promotion-style controls inherit the same clean
  // silhouette through the lightweight observer.
  await page.evaluate(() => {
    const square = document.createElement('div');
    square.id = 'v51DynamicPieceFixture';
    square.className = 'sq';
    square.hidden = true;
    const piece = document.createElement('div');
    piece.className = 'piece white';
    piece.dataset.pieceType = 'q';
    piece.dataset.pieceColor = 'w';
    square.append(piece);
    document.body.append(square);
  });
  await expect(page.locator('#v51DynamicPieceFixture .piece.kmate-simple-piece-v51[data-piece-type="q"]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('#v51DynamicPieceFixture svg[data-kmate-simple-piece="q"] > path')).toHaveCount(1);
});
