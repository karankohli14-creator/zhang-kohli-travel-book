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

test.use({
  viewport: { width: 1180, height: 820 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('white and black SVG pieces retain unmistakably different palettes', async ({ page }) => {
  test.setTimeout(90_000);
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
      window.__KMATE__?.test?.startLiveCoachPrincipleDemo
      && window.__KMATE_SVG_BOARD__?.state?.().ready
      && window.__KMATE_SVG_PIECE_CONTRAST__?.state?.().ready
    ),
    undefined,
    { timeout: 60_000 },
  );

  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#board.svg44-enabled')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#board .svg44-piece[data-svg-piece-color="white"]')).toHaveCount(16, { timeout: 30_000 });
  await expect(page.locator('#board .svg44-piece[data-svg-piece-color="black"]')).toHaveCount(16, { timeout: 30_000 });

  const contrast = await page.evaluate(() => {
    const parse = (value) => {
      const numbers = String(value || '').match(/[\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
      return numbers.map((number) => number / 255);
    };
    const channel = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = (value) => {
      const [r, g, b] = parse(value).map(channel);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const inspect = (color) => {
      const wrapper = document.querySelector(`#board .svg44-piece[data-svg-piece-color="${color}"]`);
      const svg = wrapper?.querySelector('.svg44-piece-art');
      const stop = svg?.querySelector('.piece-grad-body-mid');
      return {
        wrapperClass: wrapper?.getAttribute('class') || '',
        svgClass: svg?.getAttribute('class') || '',
        stopColor: stop ? getComputedStyle(stop).stopColor : '',
        filter: svg ? getComputedStyle(svg).filter : '',
      };
    };
    const white = inspect('white');
    const black = inspect('black');
    return {
      white,
      black,
      luminanceGap: Math.abs(luminance(white.stopColor) - luminance(black.stopColor)),
      state: window.__KMATE_SVG_PIECE_CONTRAST__.state(),
    };
  });

  expect(contrast.white.svgClass).toMatch(/staunton-piece/);
  expect(contrast.white.svgClass).toMatch(/white/);
  expect(contrast.black.svgClass).toMatch(/staunton-piece/);
  expect(contrast.black.svgClass).toMatch(/black/);
  expect(contrast.white.stopColor).not.toBe(contrast.black.stopColor);
  expect(contrast.white.filter).not.toBe(contrast.black.filter);
  expect(contrast.luminanceGap).toBeGreaterThan(0.45);
  expect(contrast.state.version).toBe('44.0.1');
});
