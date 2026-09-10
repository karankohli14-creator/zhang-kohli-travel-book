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
  viewport: { width: 1280, height: 800 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('live Chess.com games render selectable positions', async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__KMATE_POSITION_IMPORTERS__), undefined, { timeout: 45_000 });
  await page.evaluate(() => window.__KMATE_POSITION_IMPORTERS__.open('chess'));
  await expect(page.locator('#positionImportDialog')).toBeVisible();

  await page.locator('#kmChessUsername').fill('Kmate_00');
  await page.locator('#kmLoadChessGames').click();
  await expect(page.locator('#kmChessStatus')).toContainText('recent completed game', { timeout: 90_000 });

  const gameCount = await page.locator('.km-chess-game').count();
  expect(gameCount).toBeGreaterThan(0);
  const results = [];
  const countToCheck = Math.min(gameCount, 8);
  for (let index = 0; index < countToCheck; index += 1) {
    await page.locator('.km-chess-game').nth(index).click();
    await expect(page.locator('#kmChessPreview')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#kmChessBoard .km-import-square')).toHaveCount(64);
    const title = await page.locator('#kmChessSelectedTitle').innerText();
    const counter = await page.locator('#kmChessMoveCounter').innerText();
    const label = await page.locator('#kmChessMoveLabel').innerText();
    const error = (await page.locator('#kmChessError').innerText()).trim();
    const startDisabled = await page.locator('#kmStartChessPosition').isDisabled();
    results.push({ index, title, counter, label, error, startDisabled });
    expect(counter).toMatch(/^\d+ \/ \d+ plies$/);
    expect(error).toBe('');
    expect(startDisabled).toBe(false);
  }

  console.log(JSON.stringify({ gameCount, results, pageErrors, consoleErrors }, null, 2));
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => !/favicon/i.test(message))).toEqual([]);
});
