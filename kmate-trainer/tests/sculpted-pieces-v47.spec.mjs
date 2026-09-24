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

test('v52 renders the detailed uploaded-SVG silhouettes without changing board behavior', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);

  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#board .piece.kmate-reference-piece-v52')).toHaveCount(32, { timeout: 30_000 });
  await expect(page.locator('#board .piece.kmate-reference-piece-v52 > svg[data-kmate-reference-piece]')).toHaveCount(32);
  await expect(page.locator('#board .piece.kmate-simple-piece-v51')).toHaveCount(0);
  await expect(page.locator('#board .piece.kmate-pointed-pawn-v50')).toHaveCount(0);

  for (const type of ['p', 'r', 'n', 'b', 'q', 'k']) {
    expect(await page.locator(`#board .piece.kmate-reference-piece-v52[data-piece-type="${type}"]`).count()).toBeGreaterThan(0);
  }

  const artwork = await page.evaluate(() => {
    const state = window.__KMATE_REFERENCE_THEME_V52__.state();
    const pieces = [...document.querySelectorAll('#board .piece.kmate-reference-piece-v52')];
    const king = document.querySelector('#board .piece[data-piece-type="k"] svg');
    const bishop = document.querySelector('#board .piece[data-piece-type="b"] svg');
    const queen = document.querySelector('#board .piece[data-piece-type="q"] svg');
    return {
      state,
      aliases: [
        window.__KMATE_SIMPLE_PIECES_V51__?.state?.().version,
        window.__KMATE_SCULPTED_PIECES_V47__?.state?.().version,
      ],
      allHaveShapeAndShadow: pieces.every((piece) => (
        piece.querySelectorAll(':scope > svg > .km52-piece-shape').length === 1
        && piece.querySelectorAll(':scope > svg > .km52-piece-shadow').length === 1
      )),
      allUseGradients: pieces.every((piece) => Boolean(piece.querySelector('linearGradient'))),
      kingContourCount: king?.querySelector('.km52-piece-shape')?.getAttribute('d')?.split('M').length - 1 || 0,
      bishopPathLength: bishop?.querySelector('.km52-piece-shape')?.getAttribute('d')?.length || 0,
      queenPathLength: queen?.querySelector('.km52-piece-shape')?.getAttribute('d')?.length || 0,
    };
  });

  expect(artwork.state.version).toBe('52.0.0');
  expect(artwork.state.style).toBe('uploaded-svg-reference-theme');
  expect(artwork.state.exactSilhouetteExtraction).toBe(true);
  expect(artwork.state.texturedSquares).toBe(true);
  expect(artwork.state.woodenFrame).toBe(true);
  expect(artwork.state.orangeCoordinateBadges).toBe(true);
  expect(artwork.aliases).toEqual(['52.0.0', '52.0.0']);
  expect(artwork.allHaveShapeAndShadow).toBe(true);
  expect(artwork.allUseGradients).toBe(true);
  expect(artwork.kingContourCount).toBeGreaterThanOrEqual(3);
  expect(artwork.bishopPathLength).toBeGreaterThan(600);
  expect(artwork.queenPathLength).toBeGreaterThan(900);

  await page.locator('#board > .sq[data-square="e2"]').click();
  await expect(page.locator('#board > .sq[data-square="e2"]')).toHaveClass(/selected/);
  await page.locator('#board > .sq[data-square="e4"]').click();
  await expect(page.locator('#board > .sq[data-square="e4"] .piece.kmate-reference-piece-v52[data-piece-type="p"]')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('#board .piece.kmate-reference-piece-v52')).toHaveCount(32);

  await page.evaluate(() => {
    const square = document.createElement('div');
    square.id = 'v52DynamicPieceFixture';
    square.className = 'sq';
    square.hidden = true;
    const piece = document.createElement('div');
    piece.className = 'piece white';
    piece.dataset.pieceType = 'q';
    piece.dataset.pieceColor = 'w';
    square.append(piece);
    document.body.append(square);
  });
  await expect(page.locator('#v52DynamicPieceFixture .piece.kmate-reference-piece-v52[data-piece-type="q"]')).toHaveCount(1, { timeout: 10_000 });
});
