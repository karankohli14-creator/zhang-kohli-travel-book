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

async function prepare(page, viewport) {
  await page.setViewportSize(viewport);
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
      && window.__KMATE_REFERENCE_THEME_V52__?.state?.().ready
      && window.__KMATE_MOBILE_FULL_PAGE_V50__?.state?.().ready
    ),
    undefined,
    { timeout: 90_000 },
  );
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#board .coord.rank')).toHaveCount(8);
  await expect(page.locator('#board .coord.file')).toHaveCount(8);
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left, top: box.top, right: box.right, bottom: box.bottom,
        width: box.width, height: box.height,
        centerX: box.left + box.width / 2,
        centerY: box.top + box.height / 2,
      };
    };
    const wrapElement = document.querySelector('.live-boardwrap');
    const boardElement = document.querySelector('#board');
    const wrap = rect(wrapElement);
    const board = rect(boardElement);
    const squares = [...boardElement.querySelectorAll(':scope > .sq')].map((square) => ({
      square: square.dataset.square,
      ...rect(square),
    }));
    const ranks = [...boardElement.querySelectorAll('.coord.rank')].map((coord) => ({
      text: coord.textContent.trim(),
      parentSquare: coord.closest('.sq')?.dataset.square || '',
      parent: rect(coord.closest('.sq')),
      ...rect(coord),
    }));
    const files = [...boardElement.querySelectorAll('.coord.file')].map((coord) => ({
      text: coord.textContent.trim(),
      parentSquare: coord.closest('.sq')?.dataset.square || '',
      parent: rect(coord.closest('.sq')),
      ...rect(coord),
    }));
    const wrapStyle = getComputedStyle(wrapElement);
    const boardStyle = getComputedStyle(boardElement);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scroll: {
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
      },
      wrap,
      board,
      squares,
      ranks,
      files,
      style: {
        padding: Number.parseFloat(wrapStyle.paddingLeft),
        wrapBoxSizing: wrapStyle.boxSizing,
        wrapOverflow: wrapStyle.overflow,
        boardBoxSizing: boardStyle.boxSizing,
        coordinateSize: Number.parseFloat(getComputedStyle(ranks[0] ? boardElement.querySelector('.coord.rank') : boardElement).width),
      },
    };
  });
}

function expectContained(layout) {
  const epsilon = 1.25;
  expect(layout.scroll.documentWidth).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.scroll.bodyWidth).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.wrap.left).toBeGreaterThanOrEqual(4);
  expect(layout.wrap.right).toBeLessThanOrEqual(layout.viewport.width - 4);
  expect(layout.wrap.top).toBeGreaterThanOrEqual(42);
  expect(layout.wrap.bottom).toBeLessThanOrEqual(layout.viewport.height - 42);
  expect(Math.abs(layout.wrap.width - layout.wrap.height)).toBeLessThan(2);
  expect(Math.abs(layout.board.width - layout.board.height)).toBeLessThan(2);
  expect(layout.style.wrapBoxSizing).toBe('border-box');
  expect(layout.style.wrapOverflow).toBe('hidden');
  expect(layout.style.boardBoxSizing).toBe('border-box');

  expect(layout.board.left).toBeGreaterThanOrEqual(layout.wrap.left + layout.style.padding - 1);
  expect(layout.board.top).toBeGreaterThanOrEqual(layout.wrap.top + layout.style.padding - 1);
  expect(layout.board.right).toBeLessThanOrEqual(layout.wrap.right - layout.style.padding + 1);
  expect(layout.board.bottom).toBeLessThanOrEqual(layout.wrap.bottom - layout.style.padding + 1);

  for (const square of layout.squares) {
    expect(square.left).toBeGreaterThanOrEqual(layout.board.left - epsilon);
    expect(square.top).toBeGreaterThanOrEqual(layout.board.top - epsilon);
    expect(square.right).toBeLessThanOrEqual(layout.board.right + epsilon);
    expect(square.bottom).toBeLessThanOrEqual(layout.board.bottom + epsilon);
  }

  for (const coord of [...layout.ranks, ...layout.files]) {
    expect(coord.left).toBeGreaterThanOrEqual(layout.wrap.left + 1);
    expect(coord.top).toBeGreaterThanOrEqual(layout.wrap.top + 1);
    expect(coord.right).toBeLessThanOrEqual(layout.wrap.right - 1);
    expect(coord.bottom).toBeLessThanOrEqual(layout.wrap.bottom - 1);
  }

  for (const rank of layout.ranks) {
    expect(Math.abs(rank.centerY - rank.parent.centerY)).toBeLessThan(1.5);
    expect(rank.centerX).toBeLessThan(layout.board.left);
    expect(rank.centerX).toBeGreaterThan(layout.wrap.left);
  }
  for (const file of layout.files) {
    expect(Math.abs(file.centerX - file.parent.centerX)).toBeLessThan(1.5);
    expect(file.centerY).toBeGreaterThan(layout.board.bottom);
    expect(file.centerY).toBeLessThan(layout.wrap.bottom);
  }
}

const phoneViewports = [
  { name: 'compact phone', width: 320, height: 568, maximumCoordinate: 13 },
  { name: 'standard phone', width: 390, height: 844, maximumCoordinate: 16 },
  { name: 'large phone', width: 430, height: 932, maximumCoordinate: 18 },
  { name: 'phone landscape', width: 844, height: 390, maximumCoordinate: 18 },
];

for (const viewport of phoneViewports) {
  test(`${viewport.name}: board, squares, frame, and notation circles remain fully on-screen`, async ({ page }) => {
    test.setTimeout(150_000);
    await prepare(page, viewport);
    const layout = await geometry(page);
    expectContained(layout);
    expect(layout.style.coordinateSize).toBeGreaterThanOrEqual(12);
    expect(layout.style.coordinateSize).toBeLessThanOrEqual(viewport.maximumCoordinate);
  });
}

test('immersive fallback keeps the entire framed board inside a phone viewport', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    try {
      Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    } catch {}
  });
  await page.locator('#fullscreenButton').click();
  await expect(page.locator('body')).toHaveClass(/km50-immersive/);
  const layout = await geometry(page);
  expectContained(layout);
  expect(layout.style.coordinateSize).toBeLessThanOrEqual(16);
});
