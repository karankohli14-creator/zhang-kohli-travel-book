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
  await page.setViewportSize({ width: 390, height: 844 });
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
      && window.__KMATE_MOBILE_FIT_V54__?.state?.().ready
    ),
    undefined,
    { timeout: 90_000 },
  );
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.fit());
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.state().metrics?.rendered?.contained),
    { timeout: 10_000 },
  ).toBe(true);
}

test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });

test('v54 keeps the complete title-free framed board inside a standard phone with only a tiny gap', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);

  await page.evaluate(() => {
    document.querySelector('#positionTitle').textContent = 'Rook against Knight pressure · Variation OOOJ';
    document.querySelector('#gameMeta').textContent = 'Endgame · open-ended branch';
  });

  const layout = await page.evaluate(() => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height,
      };
    };
    const frame = document.querySelector('.live-boardwrap');
    const board = document.querySelector('#board');
    const title = document.querySelector('#positionTitle');
    const meta = document.querySelector('#gameMeta');
    return {
      frame: box(frame),
      board: box(board),
      viewport: { width: visualViewport?.width || innerWidth, height: visualViewport?.height || innerHeight },
      appbar: getComputedStyle(document.querySelector('.appbar')).display,
      titleDisplay: getComputedStyle(title).display,
      metaDisplay: getComputedStyle(meta).display,
      titleParentHidden: title.parentElement.hidden,
      frameOverflow: getComputedStyle(frame).overflow,
      state: window.__KMATE_MOBILE_FIT_V54__.state(),
    };
  });

  expect(layout.appbar).toBe('none');
  expect(layout.titleDisplay).toBe('none');
  expect(layout.metaDisplay).toBe('none');
  expect(layout.titleParentHidden).toBe(true);
  expect(layout.frameOverflow).toBe('hidden');

  expect(layout.frame.left).toBeGreaterThanOrEqual(2.25);
  expect(layout.frame.top).toBeGreaterThanOrEqual(42);
  expect(layout.frame.right).toBeLessThanOrEqual(layout.viewport.width - 2.25);
  expect(layout.frame.bottom).toBeLessThanOrEqual(layout.viewport.height - 42);
  expect(Math.abs(layout.frame.width - layout.frame.height)).toBeLessThan(.75);

  expect(layout.board.left).toBeGreaterThan(layout.frame.left + 10);
  expect(layout.board.top).toBeGreaterThan(layout.frame.top + 10);
  expect(layout.board.right).toBeLessThan(layout.frame.right - 10);
  expect(layout.board.bottom).toBeLessThan(layout.frame.bottom - 10);
  expect(Math.abs(layout.board.width - layout.board.height)).toBeLessThan(.75);
  expect(layout.state.metrics.rendered.contained).toBe(true);
});
