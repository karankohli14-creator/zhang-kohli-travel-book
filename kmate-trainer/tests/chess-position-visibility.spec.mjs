import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/';

const WHITE_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.09.09"]
[White "Kmate_00"]
[Black "OpponentA"]
[Result "1-0"]
[TimeControl "600"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. O-O O-O 6. Re1 d6 1-0`;

const BLACK_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.09.08"]
[White "OpponentB"]
[Black "Kmate_00"]
[Result "0-1"]
[TimeControl "600"]

1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 0-1`;

function game({ pgn, url, endTime, white, black }) {
  return {
    url,
    pgn,
    time_control: '600',
    end_time: endTime,
    rated: true,
    rules: 'chess',
    time_class: 'rapid',
    white,
    black,
  };
}

const GAMES = [
  game({
    pgn: WHITE_PGN,
    url: 'https://www.chess.com/game/live/100000001',
    endTime: 1788969600,
    white: { username: 'Kmate_00', rating: 1600, result: 'win' },
    black: { username: 'OpponentA', rating: 1580, result: 'resigned' },
  }),
  game({
    pgn: BLACK_PGN,
    url: 'https://www.chess.com/game/live/100000002',
    endTime: 1788883200,
    white: { username: 'OpponentB', rating: 1590, result: 'resigned' },
    black: { username: 'Kmate_00', rating: 1608, result: 'win' },
  }),
];

function chessModuleSource() {
  const candidate = path.resolve('node_modules/chess.js/dist/esm/chess.js');
  if (!fs.existsSync(candidate)) throw new Error('chess.js test dependency is missing.');
  return fs.readFileSync(candidate, 'utf8');
}

async function installRoutes(page) {
  const chessBody = chessModuleSource();
  const chessFulfill = (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript; charset=utf-8',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: chessBody,
  });
  await page.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/chess\.js@1\.4\.0\/\+esm.*/, chessFulfill);
  await page.route(/https:\/\/esm\.sh\/chess\.js@1\.4\.0.*/, chessFulfill);

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
    body: JSON.stringify({ games: GAMES }),
  }));
}

async function geometry(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('#positionImportDialog .position-importer-shell');
    const preview = document.querySelector('#kmChessPreview');
    const list = document.querySelector('#kmChessGameList');
    const shellRect = shell.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    return {
      shellTop: shellRect.top,
      shellBottom: shellRect.bottom,
      previewTop: previewRect.top,
      listTop: listRect.top,
    };
  });
}

test.use({
  viewport: { width: 820, height: 800 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('selected Chess.com position is immediately visible in a narrow pane', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  await installRoutes(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(window.__KMATE_POSITION_IMPORTERS__ && window.__KMATE_CHESS_POSITION_FIX__),
    undefined,
    { timeout: 45_000 },
  );

  await page.evaluate(() => window.__KMATE_POSITION_IMPORTERS__.open('chess'));
  await page.locator('#kmChessUsername').fill('Kmate_00');
  await page.locator('#kmLoadChessGames').click();
  await expect(page.locator('#kmChessStatus')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('.km-chess-game')).toHaveCount(2);
  await expect(page.locator('#kmChessPreview')).toBeVisible();
  await expect(page.locator('#kmChessPositionNotice')).toBeVisible();
  await expect(page.locator('#kmChessBoard .km-import-square')).toHaveCount(64);

  const firstGeometry = await geometry(page);
  expect(firstGeometry.previewTop).toBeLessThan(firstGeometry.listTop);
  expect(firstGeometry.previewTop).toBeLessThan(firstGeometry.shellBottom - 80);

  await page.locator('.km-chess-game').nth(1).click();
  await expect(page.locator('#kmChessSelectedTitle')).toContainText('OpponentB');
  await expect(page.locator('#kmChessPositionNoticeTitle')).toContainText('OpponentB');
  await expect.poll(async () => {
    const current = await geometry(page);
    return current.previewTop >= current.shellTop - 3 && current.previewTop < current.shellBottom - 80;
  }).toBe(true);

  const state = await page.evaluate(() => window.__KMATE_CHESS_POSITION_FIX__.state());
  expect(state).toMatchObject({
    ready: true,
    boardSquares: 64,
    narrowLayout: true,
    noticeVisible: true,
  });
  expect(pageErrors).toEqual([]);
});
