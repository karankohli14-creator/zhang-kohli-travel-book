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

async function prepare(page, viewport = { width: 1280, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.setItem('kmate-svg-board-v44', JSON.stringify({
      enabled: true,
      theme: 'wood',
      coordinates: true,
      annotations: true,
    }));
  });
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE_SVG_BOARD__?.state?.().ready
      && window.__KMATE_SVG_BOARD_INPUT__?.state?.().ready
      && window.__KMATE__?.test?.startLiveCoachPrincipleDemo
    ),
    undefined,
    { timeout: 90_000 },
  );
}

async function waitForInteractionBridge(page, boardSelector) {
  await page.waitForFunction((selector) => {
    const board = document.querySelector(selector);
    const square = board?.querySelector(':scope > .sq');
    const overlay = board?.querySelector(':scope > .svg44-overlay');
    return Boolean(
      square
      && overlay
      && getComputedStyle(square).pointerEvents === 'auto'
      && getComputedStyle(overlay).pointerEvents === 'none'
    );
  }, boardSelector, { timeout: 30_000 });
}

async function startDeterministicGame(page) {
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board.svg44-enabled')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#board .svg44-overlay')).toBeVisible();
  await expect(page.locator('#board [data-svg-square]')).toHaveCount(64);
  await expect(page.locator('#board [data-svg-piece]')).toHaveCount(32);
  await waitForInteractionBridge(page, '#board');
}

async function visibleSquareCenter(page, boardSelector, square) {
  const box = await page.locator(`${boardSelector} [data-svg-square="${square}"]`).boundingBox();
  if (!box) throw new Error(`SVG square ${square} was not measurable.`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

async function clickVisibleSquare(page, boardSelector, square, button = 'left') {
  const point = await visibleSquareCenter(page, boardSelector, square);
  await page.mouse.click(point.x, point.y, { button });
}

async function moveByTap(page, from, to) {
  await clickVisibleSquare(page, '#board', from);
  await expect(page.locator(`#board > .sq[data-square="${from}"]`)).toHaveClass(/selected/);
  await clickVisibleSquare(page, '#board', to);
  await page.waitForFunction(
    ({ target }) => Boolean(document.querySelector(`#board > .sq[data-square="${target}"] .piece`)),
    { target: to },
    { timeout: 20_000 },
  );
}

async function moveByPointerDrag(page, from, to) {
  const source = await visibleSquareCenter(page, '#board', from);
  const target = await visibleSquareCenter(page, '#board', to);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(
    source.box.x + source.box.width * 0.72,
    source.box.y + source.box.height * 0.72,
    { steps: 3 },
  );
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(
    ({ targetSquare }) => Boolean(document.querySelector(`#board > .sq[data-square="${targetSquare}"] .piece`)),
    { targetSquare: to },
    { timeout: 20_000 },
  );
}

test.use({
  viewport: { width: 1280, height: 900 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('normal K-Mate play uses one responsive SVG board with working tap moves and themes', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);
  await startDeterministicGame(page);

  const boardGeometry = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    const overlay = document.querySelector('#board .svg44-overlay').getBoundingClientRect();
    return { board, overlay };
  });
  expect(Math.abs(boardGeometry.board.width - boardGeometry.overlay.width)).toBeLessThan(1.5);
  expect(Math.abs(boardGeometry.board.height - boardGeometry.overlay.height)).toBeLessThan(1.5);

  await moveByTap(page, 'e2', 'e4');
  await expect(page.locator('#board [data-svg-square="e4"]')).toBeVisible();

  await expect(page.locator('#svgBoardStyleButton')).toBeVisible();
  await page.locator('#svgBoardStyleButton').click();
  await expect(page.locator('#svgBoardDialog')).toBeVisible();
  await page.locator('[data-svg44-theme="slate"]').click();
  await expect(page.locator('[data-svg44-theme="slate"]')).toHaveClass(/active/);
  await page.locator('#svg44Done').click();
  await expect(page.locator('#board')).toHaveAttribute('data-svg44-theme', 'slate');

  const state = await page.evaluate(() => ({
    svg: window.__KMATE_SVG_BOARD__.state(),
    input: window.__KMATE_SVG_BOARD_INPUT__.state(),
  }));
  expect(state.svg.enabled).toBe(true);
  expect(state.svg.theme).toBe('slate');
  expect(state.input.originalTapAndDrag).toBe(true);
  expect(state.svg.boards.find((board) => board.id === 'board')).toMatchObject({
    enhanced: true,
    squares: 64,
    overlay: true,
  });
});

test('SVG board supports true pointer dragging and restores the original board on demand', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);
  await startDeterministicGame(page);

  await moveByPointerDrag(page, 'e2', 'e4');

  await page.locator('#svgBoardStyleButton').click();
  await page.locator('#svg44Enabled').uncheck();
  await expect(page.locator('#board')).not.toHaveClass(/svg44-enabled/);
  await expect(page.locator('#board .svg44-overlay')).toHaveCount(0);
  await expect(page.locator('#board > .sq')).toHaveCount(64);
  await page.locator('#svg44Enabled').check();
  await expect(page.locator('#board.svg44-enabled .svg44-overlay')).toBeVisible();
  await waitForInteractionBridge(page, '#board');
  await page.locator('#svg44Done').click();
});

test('annotations and keyboard controls remain available in the SVG interface', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);
  await startDeterministicGame(page);

  await clickVisibleSquare(page, '#board', 'd4', 'right');
  await expect(page.locator('#board .svg44-user-square')).toHaveCount(1);

  const e2 = page.locator('#board [data-svg-square="e2"]');
  await e2.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#board > .sq[data-square="e2"]')).toHaveClass(/selected/);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#board [data-svg-square="e3"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#board [data-svg-square="e4"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => Boolean(document.querySelector('#board > .sq[data-square="e4"] .piece')),
    undefined,
    { timeout: 20_000 },
  );

  await page.locator('#svgBoardStyleButton').click();
  await page.locator('#svg44ClearAnnotations').click();
  await expect(page.locator('#board .svg44-user-square')).toHaveCount(0);
});

test('the same SVG presentation uses the puzzle board’s native taps on a phone viewport', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page, { width: 390, height: 844 });

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--kmate-safe-top', '47px');
    document.documentElement.style.setProperty('--kmate-safe-bottom', '34px');
    const mode = document.querySelector('#km42PuzzleMode');
    const board = document.querySelector('#km42PuzzleBoard');
    if (!mode || !board) throw new Error('K-Mate puzzle board was not initialized.');
    mode.hidden = false;
    window.__svg44FixtureClicks = [];
    board.innerHTML = '';
    const files = 'abcdefgh';
    const ranks = '87654321';
    for (const rank of ranks) {
      for (const file of files) {
        const square = `${file}${rank}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `sq ${((files.indexOf(file) + Number(rank)) % 2) ? 'light' : 'dark'}`;
        button.dataset.km42Square = square;
        button.setAttribute('aria-label', square);
        if (square === 'e2') {
          const piece = document.createElement('span');
          piece.className = 'piece white';
          piece.textContent = '♙';
          button.append(piece);
        }
        button.addEventListener('click', () => window.__svg44FixtureClicks.push(square));
        board.append(button);
      }
    }
    document.querySelector('#km42PuzzlePlayerTurn').textContent = 'Your move';
    document.querySelector('#km42PuzzlePlayerAvatar').textContent = '♙';
    window.__KMATE_SVG_BOARD__.attach(board);
  });

  await expect(page.locator('#km42PuzzleBoard.svg44-enabled .svg44-overlay')).toBeVisible();
  await expect(page.locator('#km42PuzzleBoard [data-svg-square]')).toHaveCount(64);
  await waitForInteractionBridge(page, '#km42PuzzleBoard');
  await clickVisibleSquare(page, '#km42PuzzleBoard', 'e2');
  await clickVisibleSquare(page, '#km42PuzzleBoard', 'e4');
  const clicks = await page.evaluate(() => window.__svg44FixtureClicks);
  expect(clicks.slice(-2)).toEqual(['e2', 'e4']);

  const safeLayout = await page.evaluate(() => {
    const mode = document.querySelector('#km42PuzzleMode').getBoundingClientRect();
    const board = document.querySelector('#km42PuzzleBoard').getBoundingClientRect();
    const overlay = document.querySelector('#km42PuzzleBoard .svg44-overlay').getBoundingClientRect();
    return { mode, board, overlay, viewportHeight: innerHeight, viewportWidth: innerWidth };
  });
  expect(safeLayout.mode.top).toBeGreaterThanOrEqual(46);
  expect(safeLayout.mode.bottom).toBeLessThanOrEqual(safeLayout.viewportHeight - 33);
  expect(safeLayout.board.right).toBeLessThanOrEqual(safeLayout.viewportWidth + 1);
  expect(Math.abs(safeLayout.board.width - safeLayout.overlay.width)).toBeLessThan(1.5);
});
