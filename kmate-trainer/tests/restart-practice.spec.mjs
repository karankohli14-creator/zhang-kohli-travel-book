import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/';
const PRACTICE_FEN = '7k/8/8/8/8/8/4K3/R7 w - - 0 1';

function chessModuleSource() {
  const modulePath = path.resolve('node_modules/chess.js/dist/esm/chess.js');
  if (!fs.existsSync(modulePath)) throw new Error('The deterministic chess.js test dependency was not installed.');
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

async function startImportedPractice(page) {
  await page.evaluate(() => window.__KMATE_POSITION_IMPORTERS__.open('manual'));
  await expect(page.locator('#positionImportDialog')).toBeVisible();
  await page.locator('#positionImportTitle').fill('Restart regression position');
  await page.locator('#positionImportText').fill(PRACTICE_FEN);
  await page.locator('#confirmPositionImport').click();
  await expect(page.locator('#gameView')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#positionTitle')).toContainText('Restart regression position');
}

async function kmateState(page) {
  return page.evaluate(() => window.__KMATE__.state());
}

test.use({
  viewport: { width: 1180, height: 820 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('restart restores the same position, challenge, and fresh clocks', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(window.__KMATE_POSITION_IMPORTERS__ && window.__KMATE_RESTART__?.state?.().ready),
    undefined,
    { timeout: 45_000 },
  );

  await expect(page.locator('#restartPracticeButton')).toHaveCount(1);
  await expect(page.locator('#restartPracticeTool')).toHaveCount(1);
  await expect(page.locator('#resultRestartPractice')).toHaveCount(1);
  await startImportedPractice(page);

  const initial = await kmateState(page);
  expect(initial.startFen).toBe(PRACTICE_FEN);
  expect(initial.fen).toBe(PRACTICE_FEN);
  expect(initial.restart.available).toBe(true);
  expect(initial.restart.attempt).toBe(0);
  expect(initial.userColor).toBe('w');
  const initialSessionId = initial.restart.currentSessionId;
  const initialOpponent = initial.restart.opponentRating;

  await page.locator('#board .sq[data-square="a1"]').click();
  await page.locator('#board .sq[data-square="a2"]').click();
  await expect.poll(async () => (await kmateState(page)).fen, { timeout: 15_000 }).not.toBe(PRACTICE_FEN);

  await page.locator('#restartPracticeButton').click();
  await expect(page.locator('#restartPracticeDialog')).toBeVisible();
  await expect(page.locator('#restartPracticeNote')).toContainText('unfinished attempt');
  await page.locator('#confirmRestartPractice').click();

  await expect.poll(async () => (await kmateState(page)).restart.attempt, { timeout: 20_000 }).toBe(1);
  const restarted = await kmateState(page);
  expect(restarted.fen).toBe(PRACTICE_FEN);
  expect(restarted.startFen).toBe(PRACTICE_FEN);
  expect(restarted.lastMove).toBeNull();
  expect(restarted.userColor).toBe(initial.userColor);
  expect(restarted.restart.opponentRating).toBe(initialOpponent);
  expect(restarted.restart.currentSessionId).not.toBe(initialSessionId);
  expect(restarted.restart.restartedFromSessionId).toBe(initialSessionId);
  expect(restarted.clocks.w).toBeGreaterThan(178);
  expect(restarted.clocks.b).toBeGreaterThan(178);

  // Complete the restarted attempt and verify that the result screen offers a
  // separate retry while retaining the completed result in the user's history.
  await page.evaluate(() => window.__KMATE__.test.forceTimeout('w'));
  await expect(page.locator('#resultDialog')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#resultRestartPractice')).toBeVisible();
  await page.locator('#resultRestartPractice').click();
  await expect(page.locator('#restartPracticeDialog')).toBeVisible();
  await expect(page.locator('#restartPracticeTitle')).toContainText('Retry');
  await expect(page.locator('#restartPracticeNote')).toContainText('completed result stays');
  await page.locator('#confirmRestartPractice').click();

  await expect(page.locator('#resultDialog')).not.toBeVisible();
  await expect.poll(async () => (await kmateState(page)).restart.attempt, { timeout: 20_000 }).toBe(2);
  const retried = await kmateState(page);
  expect(retried.fen).toBe(PRACTICE_FEN);
  expect(retried.startFen).toBe(PRACTICE_FEN);
  expect(retried.restart.source).toBe('completed-position-retry');
  expect(retried.userColor).toBe('w');
  expect(pageErrors).toEqual([]);
});
