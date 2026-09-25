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

async function installState(page, fakeVisualViewport = null) {
  await page.addInitScript(({ fakeVisualViewport }) => {
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

    if (fakeVisualViewport) {
      const state = { scale: 1, ...fakeVisualViewport };
      const target = new EventTarget();
      const visualViewport = {
        get width() { return state.width; },
        get height() { return state.height; },
        get offsetLeft() { return state.offsetLeft || 0; },
        get offsetTop() { return state.offsetTop || 0; },
        get pageLeft() { return state.offsetLeft || 0; },
        get pageTop() { return state.offsetTop || 0; },
        get scale() { return state.scale || 1; },
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target),
      };
      try {
        Object.defineProperty(window, 'visualViewport', {
          configurable: true,
          value: visualViewport,
        });
      } catch {}
      window.__setKMateFakeVisualViewport = (next) => {
        Object.assign(state, next || {});
        target.dispatchEvent(new Event('resize'));
      };
    }
  }, { fakeVisualViewport });
}

async function prepare(page, viewport, fakeVisualViewport = null) {
  await page.setViewportSize(viewport);
  await installState(page, fakeVisualViewport);
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE__?.test?.startLiveCoachPrincipleDemo
      && window.__KMATE_REFERENCE_THEME_V52__?.state?.().ready
      && window.__KMATE_MOBILE_FULL_PAGE_V50__?.state?.().ready
      && window.__KMATE_MOBILE_FIT_V54__?.state?.().ready
    ),
    undefined,
    { timeout: 90_000 },
  );
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#board .coord.rank')).toHaveCount(8);
  await expect(page.locator('#board .coord.file')).toHaveCount(8);
  await page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.fit());
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.state().metrics?.rendered?.contained),
    { timeout: 15_000 },
  ).toBe(true);
}

async function geometry(page) {
  return page.evaluate(() => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    };
    const stageElement = document.querySelector('#boardCoachStage');
    const frameElement = document.querySelector('.live-boardwrap');
    const boardElement = document.querySelector('#board');
    const stage = box(stageElement);
    const frame = box(frameElement);
    const board = box(boardElement);
    const squares = [...boardElement.querySelectorAll(':scope > .sq')].map((square) => ({
      square: square.dataset.square,
      ...box(square),
    }));
    const ranks = [...boardElement.querySelectorAll('.coord.rank')].map((coordinate) => ({
      parent: box(coordinate.closest('.sq')),
      ...box(coordinate),
    }));
    const files = [...boardElement.querySelectorAll('.coord.file')].map((coordinate) => ({
      parent: box(coordinate.closest('.sq')),
      ...box(coordinate),
    }));
    const viewport = window.visualViewport
      ? {
          left: visualViewport.offsetLeft,
          top: visualViewport.offsetTop,
          right: visualViewport.offsetLeft + visualViewport.width,
          bottom: visualViewport.offsetTop + visualViewport.height,
          width: visualViewport.width,
          height: visualViewport.height,
        }
      : { left: 0, top: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight };
    const visible = {
      left: Math.max(stage.left, viewport.left),
      top: Math.max(stage.top, viewport.top),
      right: Math.min(stage.right, viewport.right),
      bottom: Math.min(stage.bottom, viewport.bottom),
    };
    const frameStyle = getComputedStyle(frameElement);
    const boardStyle = getComputedStyle(boardElement);
    const coordinateStyle = getComputedStyle(boardElement.querySelector('.coord.rank'));
    return {
      viewport,
      visible,
      stage,
      frame,
      board,
      squares,
      ranks,
      files,
      styles: {
        framePosition: frameStyle.position,
        frameOverflow: frameStyle.overflow,
        frameBoxSizing: frameStyle.boxSizing,
        boardPosition: boardStyle.position,
        boardBoxSizing: boardStyle.boxSizing,
        boardRows: boardStyle.gridTemplateRows.split(/\s+/).filter(Boolean).length,
        boardColumns: boardStyle.gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        squareAspectRatio: getComputedStyle(boardElement.querySelector(':scope > .sq')).aspectRatio,
        coordinateSize: Number.parseFloat(coordinateStyle.width),
      },
      scroll: {
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      },
      state: window.__KMATE_MOBILE_FIT_V54__.state(),
    };
  });
}

function expectContained(layout) {
  const epsilon = 1.1;
  expect(layout.scroll.documentWidth).toBeLessThanOrEqual(Math.ceil(layout.viewport.right));
  expect(layout.scroll.bodyWidth).toBeLessThanOrEqual(Math.ceil(layout.viewport.right));

  expect(layout.frame.left).toBeGreaterThanOrEqual(layout.visible.left + 2.25);
  expect(layout.frame.top).toBeGreaterThanOrEqual(layout.visible.top + 2.25);
  expect(layout.frame.right).toBeLessThanOrEqual(layout.visible.right - 2.25);
  expect(layout.frame.bottom).toBeLessThanOrEqual(layout.visible.bottom - 2.25);
  expect(Math.abs(layout.frame.width - layout.frame.height)).toBeLessThan(.75);
  expect(layout.styles.framePosition).toBe('absolute');
  expect(layout.styles.frameOverflow).toBe('hidden');
  expect(layout.styles.frameBoxSizing).toBe('border-box');

  expect(layout.board.left).toBeGreaterThan(layout.frame.left + 10);
  expect(layout.board.top).toBeGreaterThan(layout.frame.top + 10);
  expect(layout.board.right).toBeLessThan(layout.frame.right - 10);
  expect(layout.board.bottom).toBeLessThan(layout.frame.bottom - 10);
  expect(Math.abs(layout.board.width - layout.board.height)).toBeLessThan(.75);
  expect(layout.styles.boardPosition).toBe('absolute');
  expect(layout.styles.boardBoxSizing).toBe('border-box');
  expect(layout.styles.boardRows).toBe(8);
  expect(layout.styles.boardColumns).toBe(8);
  expect(layout.styles.squareAspectRatio).toBe('auto');

  const leftMargin = layout.board.left - layout.frame.left;
  const rightMargin = layout.frame.right - layout.board.right;
  const topMargin = layout.board.top - layout.frame.top;
  const bottomMargin = layout.frame.bottom - layout.board.bottom;
  expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(1.25);
  expect(Math.abs(topMargin - bottomMargin)).toBeLessThan(1.25);

  for (const square of layout.squares) {
    expect(square.left).toBeGreaterThanOrEqual(layout.board.left - epsilon);
    expect(square.top).toBeGreaterThanOrEqual(layout.board.top - epsilon);
    expect(square.right).toBeLessThanOrEqual(layout.board.right + epsilon);
    expect(square.bottom).toBeLessThanOrEqual(layout.board.bottom + epsilon);
  }

  for (const coordinate of [...layout.ranks, ...layout.files]) {
    expect(coordinate.left).toBeGreaterThanOrEqual(layout.frame.left + 1);
    expect(coordinate.top).toBeGreaterThanOrEqual(layout.frame.top + 1);
    expect(coordinate.right).toBeLessThanOrEqual(layout.frame.right - 1);
    expect(coordinate.bottom).toBeLessThanOrEqual(layout.frame.bottom - 1);
  }
  for (const rank of layout.ranks) {
    expect(Math.abs(rank.centerY - rank.parent.centerY)).toBeLessThan(1.25);
    expect(rank.centerX).toBeGreaterThan(layout.frame.left);
    expect(rank.centerX).toBeLessThan(layout.board.left);
  }
  for (const file of layout.files) {
    expect(Math.abs(file.centerX - file.parent.centerX)).toBeLessThan(1.25);
    expect(file.centerY).toBeGreaterThan(layout.board.bottom);
    expect(file.centerY).toBeLessThan(layout.frame.bottom);
  }

  expect(layout.styles.coordinateSize).toBeGreaterThanOrEqual(12);
  expect(layout.styles.coordinateSize).toBeLessThanOrEqual(14);
  expect(layout.state.metrics.rendered.contained).toBe(true);
}

const viewports = [
  { name: 'small iPhone layout', width: 320, height: 568 },
  { name: 'short in-app browser', width: 390, height: 620 },
  { name: 'standard iPhone portrait', width: 390, height: 844 },
  { name: 'large iPhone portrait', width: 430, height: 932 },
  { name: 'phone landscape', width: 844, height: 390 },
];

for (const viewport of viewports) {
  test(`${viewport.name}: complete brown frame and all squares stay within the screen`, async ({ page }) => {
    test.setTimeout(150_000);
    await prepare(page, viewport);
    expectContained(await geometry(page));
  });
}

test('visualViewport smaller than the layout viewport controls frame size and position', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(
    page,
    { width: 430, height: 932 },
    { width: 390, height: 620, offsetLeft: 20, offsetTop: 126, scale: 1 },
  );
  const initial = await geometry(page);
  expectContained(initial);
  expect(initial.frame.left).toBeGreaterThanOrEqual(23);
  expect(initial.frame.bottom).toBeLessThanOrEqual(743);

  await page.evaluate(() => {
    window.__setKMateFakeVisualViewport({ width: 374, height: 540, offsetLeft: 28, offsetTop: 176 });
  });
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.state().visualViewport.height),
    { timeout: 10_000 },
  ).toBe(540);
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.state().metrics?.rendered?.contained),
    { timeout: 10_000 },
  ).toBe(true);
  expectContained(await geometry(page));
});

test('immersive fallback keeps the same exact containment', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page, { width: 390, height: 844 });
  await page.evaluate(() => {
    try {
      Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    } catch {}
  });
  await page.locator('#fullscreenButton').click();
  await expect(page.locator('body')).toHaveClass(/km50-immersive/);
  await page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.fit());
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.state().metrics?.rendered?.contained),
    { timeout: 10_000 },
  ).toBe(true);
  expectContained(await geometry(page));
});
