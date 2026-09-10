import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/';
const ITALIAN_PLACEMENT = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const TEST_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.09.09"]
[Round "-"]
[White "Kmate_00"]
[Black "OpponentA"]
[Result "1-0"]
[TimeControl "600"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. O-O O-O 6. Re1 d6 1-0`;

const COMPLETED_GAME = {
  url: 'https://www.chess.com/game/live/123456789',
  pgn: TEST_PGN,
  time_control: '600',
  end_time: 1788969600,
  rated: true,
  rules: 'chess',
  time_class: 'rapid',
  white: { username: 'Kmate_00', rating: 1324, result: 'win' },
  black: { username: 'OpponentA', rating: 1298, result: 'resigned' },
};

const IN_PROGRESS_GAME = {
  ...COMPLETED_GAME,
  url: 'https://www.chess.com/game/daily/987654321',
  end_time: undefined,
  time_class: 'daily',
};

const VARIANT_GAME = {
  ...COMPLETED_GAME,
  url: 'https://www.chess.com/game/live/111111111',
  rules: 'chess960',
};

function chessModuleSource() {
  const modulePath = path.resolve('node_modules/chess.js/dist/esm/chess.js');
  if (!fs.existsSync(modulePath)) {
    throw new Error('The deterministic chess.js test dependency was not installed.');
  }
  return fs.readFileSync(modulePath, 'utf8');
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

async function routeMockFenshot(page) {
  const moduleBody = `
    const placement = ${JSON.stringify(ITALIAN_PLACEMENT)};
    export function createRecognizer() {
      return {
        warmUp() {},
        async recognize() {
          return {
            placement,
            meanConfidence: 0.98,
            minConfidence: 0.94,
            confidences: Array(64).fill(0.98),
            reliable: true,
            plausible: true,
            corners: { x0: 0, y0: 0, x1: 1, y1: 1 },
          };
        },
      };
    }
    export function resolveOrientation(value) {
      return { placement: value, orientation: 'white' };
    }
  `;
  await page.route(/https:\/\/esm\.sh\/@scoriiu\/fenshot@0\.1\.4.*/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript; charset=utf-8',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: moduleBody,
  }));
  await page.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/@scoriiu\/fenshot@0\.1\.4\/model\/.*/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/octet-stream',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: Buffer.from([0]),
  }));
  await page.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@1\.26\.0\/dist\/ort-wasm-simd-threaded\.mjs.*/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript; charset=utf-8',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: 'export default {};',
  }));
  await page.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@1\.26\.0\/dist\/ort-wasm-simd-threaded\.wasm.*/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/wasm',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: Buffer.from([0]),
  }));
}

async function routeMockChessCom(page) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  };
  await page.route('https://api.chess.com/pub/player/kmate_00/games/archives', (route) => route.fulfill({
    status: 200,
    headers,
    body: JSON.stringify({ archives: ['https://api.chess.com/pub/player/kmate_00/games/2026/09'] }),
  }));
  await page.route('https://api.chess.com/pub/player/kmate_00/games/2026/09', (route) => route.fulfill({
    status: 200,
    headers,
    body: JSON.stringify({ games: [IN_PROGRESS_GAME, VARIANT_GAME, COMPLETED_GAME] }),
  }));
}

async function prepareApp(page, { mockFenshot = true, mockChessCom = false } = {}) {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await routeChessJs(page);
  if (mockFenshot) await routeMockFenshot(page);
  if (mockChessCom) await routeMockChessCom(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(window.__KMATE_POSITION_IMPORTERS__ && window.__KMATE_IMPORTER_QA__),
    undefined,
    { timeout: 45_000 },
  );
  return pageErrors;
}

function importerPanelId(tab) {
  if (tab === 'image') return '#kmImportImagePanel';
  if (tab === 'chess') return '#kmImportChessPanel';
  return '#kmImportManualPanel';
}

async function openImporter(page, tab = 'manual') {
  await page.evaluate((source) => window.__KMATE_POSITION_IMPORTERS__.open(source), tab);
  await expect(page.locator('#positionImportDialog')).toBeVisible();
  await expect(page.locator(`[data-import-tab="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(importerPanelId(tab))).toBeVisible();
}

test.use({
  viewport: { width: 1365, height: 900 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('visible wizard entry, keyboard tabs, and complete image presets', async ({ page }) => {
  const errors = await prepareApp(page);

  await expect(page.locator('#wizardImportPositionButton')).toBeVisible();
  await page.locator('#wizardImportPositionButton').click();
  await expect(page.locator('#positionImportDialog')).toBeVisible();
  await page.locator('[data-import-tab="image"]').click();
  await expect(page.locator('#kmImportImagePanel')).toBeVisible();

  await expect(page.locator('[data-import-tab]')).toHaveCount(3);
  const diagnostics = await page.evaluate(() => window.__KMATE_IMPORTER_QA__.run());
  expect(diagnostics.passed, JSON.stringify(diagnostics, null, 2)).toBeTruthy();

  await page.locator('#kmImageStartPreset').click();
  await expect(page.locator('#kmImageFen')).toHaveText(START_FEN);
  await expect(page.locator('#kmStartImagePosition')).toBeEnabled();

  await page.locator('#kmImageClear').click();
  await expect(page.locator('#kmImageFen')).toHaveText(EMPTY_FEN);
  await expect(page.locator('#kmStartImagePosition')).toBeDisabled();

  const manualTab = page.locator('[data-import-tab="manual"]');
  await manualTab.focus();
  await manualTab.press('End');
  await expect(page.locator('[data-import-tab="chess"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-import-tab="chess"]')).toHaveAttribute('tabindex', '0');

  await page.evaluate(() => document.querySelector('#positionImportDialog')?.close?.());
  await expect(page.locator('#positionImportDialog')).not.toBeVisible();
  await page.evaluate(() => window.__KMATE__.showSetupPage('position'));
  await expect(page.locator('#wizardPositionImportButton')).toBeVisible();
  expect(errors).toEqual([]);
});

test('picture scan reconstructs a position and starts a K-Mate session', async ({ page }) => {
  const errors = await prepareApp(page);
  await openImporter(page, 'image');

  await page.locator('#kmImageFile').setInputFiles({
    name: 'italian-board.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });

  await expect(page.locator('#kmImageScanStatus')).toContainText('Board detected', { timeout: 30_000 });
  await expect(page.locator('#kmImageFen')).toHaveText(`${ITALIAN_PLACEMENT} w - - 0 1`);
  await expect(page.locator('#kmStartImagePosition')).toBeEnabled();

  await page.locator('#kmStartImagePosition').click();
  await expect(page.locator('#gameView')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#gameMeta')).toContainText('imported position');
  await expect(page.locator('#positionTitle')).toContainText('italian-board.png');
  expect(errors).toEqual([]);
});

test('Chess.com import keeps only completed standard games and opens the chosen decision', async ({ page }) => {
  const errors = await prepareApp(page, { mockChessCom: true });
  await openImporter(page, 'chess');

  await page.locator('#kmChessUsername').fill('Kmate_00');
  await page.locator('#kmLoadChessGames').click();
  await expect(page.locator('#kmChessStatus')).toContainText('1 recent completed game loaded', { timeout: 30_000 });
  await expect(page.locator('.km-chess-game')).toHaveCount(1);
  await expect(page.locator('#kmChessPreview')).toBeVisible();
  await expect(page.locator('#kmChessMoveCounter')).toHaveText('10 / 12 plies');

  // At the final saved decision, the control wraps to the first decision and
  // then advances to the next position where the user is about to move.
  await page.locator('#kmChessDecision').click();
  await expect(page.locator('#kmChessMoveCounter')).toHaveText('0 / 12 plies');
  await page.locator('#kmChessDecision').click();
  await expect(page.locator('#kmChessMoveCounter')).toHaveText('2 / 12 plies');
  await expect(page.locator('#kmChessMoveLabel')).toHaveText('1… e5');
  await expect(page.locator('#kmChessBoard .km-import-square')).toHaveCount(64);

  await page.locator('#kmStartChessPosition').click();
  await expect(page.locator('#gameView')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#gameMeta')).toContainText('imported position');
  await expect(page.locator('#positionTitle')).toContainText('Chess.com · Kmate_00 vs OpponentA');
  await expect(page.locator('#userSide')).toHaveText('White');
  expect(errors).toEqual([]);
});

test('importer remains contained on a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await prepareApp(page);
  await expect(page.locator('#wizardImportPositionButton')).toBeVisible();
  await openImporter(page, 'image');
  await page.locator('#kmImageStartPreset').click();

  const imageLayout = await page.evaluate(() => {
    const shell = document.querySelector('.position-importer-shell');
    const rect = shell.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      left: rect.left,
      right: rect.right,
      clientWidth: shell.clientWidth,
      scrollWidth: shell.scrollWidth,
    };
  });
  expect(imageLayout.left).toBeGreaterThanOrEqual(-1);
  expect(imageLayout.right).toBeLessThanOrEqual(imageLayout.viewport + 1);
  expect(imageLayout.scrollWidth).toBeLessThanOrEqual(imageLayout.clientWidth + 2);

  await page.locator('[data-import-tab="chess"]').click();
  const chessLayout = await page.evaluate(() => {
    const shell = document.querySelector('.position-importer-shell');
    const rect = shell.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      left: rect.left,
      right: rect.right,
      clientWidth: shell.clientWidth,
      scrollWidth: shell.scrollWidth,
    };
  });
  expect(chessLayout.left).toBeGreaterThanOrEqual(-1);
  expect(chessLayout.right).toBeLessThanOrEqual(chessLayout.viewport + 1);
  expect(chessLayout.scrollWidth).toBeLessThanOrEqual(chessLayout.clientWidth + 2);
  expect(errors).toEqual([]);
});

test('@real real Fenshot model recognizes a Chess.com fixture', async ({ page }) => {
  test.setTimeout(180_000);
  const fixture = process.env.KMATE_REAL_IMAGE_FIXTURE;
  test.skip(!fixture || !fs.existsSync(fixture), 'Real image fixture was not downloaded.');

  const errors = await prepareApp(page, { mockFenshot: false });
  await openImporter(page, 'image');
  await page.locator('#kmImageFile').setInputFiles(fixture);
  await expect(page.locator('#kmImageScanStatus')).not.toHaveAttribute('data-state', 'loading', { timeout: 150_000 });
  await expect(page.locator('#kmImageScanStatus')).not.toHaveAttribute('data-state', 'error');
  await expect(page.locator('#kmImageFen')).toContainText(ITALIAN_PLACEMENT);
  await expect(page.locator('#kmStartImagePosition')).toBeEnabled();
  expect(errors).toEqual([]);
});
