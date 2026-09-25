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
  await page.setViewportSize({ width: 430, height: 932 });
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

    const state = {
      width: 390,
      height: 620,
      offsetLeft: 20,
      offsetTop: 126,
      scale: 1,
    };
    const target = new EventTarget();
    const visualViewport = {
      get width() { return state.width; },
      get height() { return state.height; },
      get offsetLeft() { return state.offsetLeft; },
      get offsetTop() { return state.offsetTop; },
      get pageLeft() { return state.offsetLeft; },
      get pageTop() { return state.offsetTop; },
      get scale() { return state.scale; },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    };
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    });
    window.__setKMateFakeVisualViewport = (next) => {
      Object.assign(state, next || {});
      target.dispatchEvent(new Event('resize'));
    };
  });

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
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#board .coord')).toHaveCount(16);
  await page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.fit());
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.state().metrics?.rendered?.contained),
    { timeout: 10_000 },
  ).toBe(true);
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return {
        left: box.left, top: box.top, right: box.right, bottom: box.bottom,
        width: box.width, height: box.height,
      };
    };
    const visual = {
      left: visualViewport.offsetLeft,
      top: visualViewport.offsetTop,
      right: visualViewport.offsetLeft + visualViewport.width,
      bottom: visualViewport.offsetTop + visualViewport.height,
      width: visualViewport.width,
      height: visualViewport.height,
    };
    const stage = rect('#boardCoachStage');
    return {
      layout: { width: innerWidth, height: innerHeight },
      visual,
      stage,
      visible: {
        left: Math.max(stage.left, visual.left),
        top: Math.max(stage.top, visual.top),
        right: Math.min(stage.right, visual.right),
        bottom: Math.min(stage.bottom, visual.bottom),
      },
      frame: rect('.live-boardwrap'),
      board: rect('#board'),
      scroll: {
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      },
      state: window.__KMATE_MOBILE_FIT_V54__.state(),
    };
  });
}

function expectVisualContainment(layout) {
  expect(layout.scroll.documentWidth).toBeLessThanOrEqual(layout.layout.width);
  expect(layout.scroll.bodyWidth).toBeLessThanOrEqual(layout.layout.width);
  expect(layout.frame.left).toBeGreaterThanOrEqual(layout.visible.left + 2.25);
  expect(layout.frame.top).toBeGreaterThanOrEqual(layout.visible.top + 2.25);
  expect(layout.frame.right).toBeLessThanOrEqual(layout.visible.right - 2.25);
  expect(layout.frame.bottom).toBeLessThanOrEqual(layout.visible.bottom - 2.25);
  expect(layout.board.left).toBeGreaterThan(layout.frame.left + 10);
  expect(layout.board.top).toBeGreaterThan(layout.frame.top + 10);
  expect(layout.board.right).toBeLessThan(layout.frame.right - 10);
  expect(layout.board.bottom).toBeLessThan(layout.frame.bottom - 10);
  expect(layout.state.metrics.rendered.contained).toBe(true);
}

test('offset visual viewport keeps the brown frame and inner board inside the actually visible phone area', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);

  const first = await geometry(page);
  expectVisualContainment(first);
  expect(first.frame.left).toBeGreaterThanOrEqual(23);
  expect(first.frame.bottom).toBeLessThanOrEqual(743);

  await page.evaluate(() => {
    window.__setKMateFakeVisualViewport({
      width: 374,
      height: 540,
      offsetLeft: 28,
      offsetTop: 176,
    });
  });
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.state().visualViewport.height),
    { timeout: 10_000 },
  ).toBe(540);
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.state().metrics?.rendered?.contained),
    { timeout: 10_000 },
  ).toBe(true);

  const second = await geometry(page);
  expectVisualContainment(second);
  expect(second.frame.left).toBeGreaterThanOrEqual(31);
  expect(second.frame.bottom).toBeLessThanOrEqual(713);
});
