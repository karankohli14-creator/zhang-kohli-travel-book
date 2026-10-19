import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/?nativeBoard=1';
const KEY = 'kmate-woodpecker-v65';

async function prepare(page) {
  const body = fs.readFileSync(path.resolve('node_modules/chess.js/dist/esm/chess.js'), 'utf8');
  await page.route(/https:\/\/(cdn\.jsdelivr\.net\/npm\/chess\.js@1\.4\.0\/\+esm|esm\.sh\/chess\.js@1\.4\.0).*/, (route) => route.fulfill({
    status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body,
  }));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__KMATE_WOODPECKER__?.state().ready, null, { timeout: 60_000 });
  await page.waitForFunction(() => window.__KMATE_REFERENCE_THEME_V52__?.state().ready, null, { timeout: 30_000 });
}

async function createSet(page) {
  await page.locator('#wizardWoodpeckerButton').click();
  await expect(page.locator('#woodpeckerView')).toBeVisible();
  await page.locator('#wpSize').selectOption('25');
  await page.locator('#wpBuild').click();
  await expect(page.locator('#wpContinue')).toBeVisible({ timeout: 30_000 });
  return page.evaluate(() => window.__KMATE_WOODPECKER__.state().store.programs[0]);
}

async function solveCurrent(page) {
  for (let move = 0; move < 8; move++) {
    const state = await page.evaluate(() => window.__KMATE_V42__.state().puzzle);
    if (state.locked) {
      const nextVisible = await page.locator('#km42PuzzleNext').isVisible();
      if (nextVisible) return;
      await page.waitForTimeout(380);
      continue;
    }
    await page.evaluate(() => {
      const api = window.__KMATE_V42__;
      const uci = api.state().puzzle.expectedMove;
      api.playPuzzleMove(uci.slice(0, 2), uci.slice(2, 4));
    });
    await page.waitForTimeout(380);
  }
  await expect(page.locator('#km42PuzzleNext')).toBeVisible();
}

test.use({ viewport: { width: 1280, height: 900 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' });

test('Woodpecker saves the fixed set, corrections, solve time and position across reloads', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  const initial = await createSet(page);
  expect(initial.puzzles).toHaveLength(25);
  await page.locator('#wpContinue').click();
  await expect(page.locator('#km42PuzzleBoard .sq')).toHaveCount(64);
  await page.evaluate(() => {
    const api = window.__KMATE_V42__;
    const state = api.state().puzzle;
    const game = new window.__KM_BOOT__.Chess(state.fen);
    const wrong = game.moves({ verbose: true }).find((move) => `${move.from}${move.to}${move.promotion || ''}` !== state.expectedMove);
    api.playPuzzleMove(wrong.from, wrong.to);
  });
  await page.locator('#km42PuzzleHint').click();
  await page.locator('#km42PuzzleReset').click();
  const beforeHidden = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return window.__KMATE_WOODPECKER__.state().store.programs[0].draft.elapsedMs;
  });
  await page.waitForTimeout(650);
  const afterHidden = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    document.querySelector('#km42PuzzleReset').click();
    return window.__KMATE_WOODPECKER__.state().store.programs[0].draft.elapsedMs;
  });
  expect(afterHidden - beforeHidden).toBeLessThan(200);
  await solveCurrent(page);
  await page.locator('#km42PuzzleNext').click();
  await page.locator('#km42PuzzleHint').click();
  await page.waitForTimeout(400);
  await page.locator('#km42PuzzleClose').click();
  await expect(page.locator('#woodpeckerView')).toBeVisible();
  const saved = await page.evaluate(() => window.__KMATE_WOODPECKER__.state().store.programs[0]);
  expect(saved.cycles[0].results).toHaveLength(1);
  expect(saved.cycles[0].results[0].hints).toBe(1);
  expect(saved.cycles[0].results[0].wrong).toBe(1);
  expect(saved.cycles[0].results[0].clean).toBe(false);
  expect(saved.cycles[0].results[0].elapsedMs).toBeGreaterThan(0);
  expect(saved.draft.index).toBe(1);
  expect(saved.draft.hints).toBe(1);
  await page.reload();
  await page.waitForFunction(() => window.__KMATE_WOODPECKER__?.state().ready);
  await page.locator('#wizardWoodpeckerButton').click();
  await page.locator('#wpContinue').click();
  await expect(page.locator('#km42PuzzleTitle')).toContainText('Position 2 of 25');
  await solveCurrent(page);
  await page.locator('#km42PuzzleClose').click();
  const resumed = await page.evaluate(() => window.__KMATE_WOODPECKER__.state().store.programs[0]);
  expect(resumed.puzzles).toEqual(initial.puzzles);
  expect(resumed.cycles[0].results[1].clean).toBe(false);
  expect(resumed.cycles[0].results[1].hints).toBe(1);
  expect(resumed.cycles[0].results[1].elapsedMs).toBeGreaterThanOrEqual(saved.draft.elapsedMs);
  await page.locator('#wpContinue').click();
  for (let index = 2; index < 12; index++) {
    await page.locator('#km42PuzzleSkip').click();
    await page.locator('#km42PuzzleNext').click();
  }
  await expect(page.locator('#wpSessionContinue')).toHaveText('Continue cycle');
  await page.locator('#wpSessionContinue').click();
  await expect(page.locator('#km42PuzzleTitle')).toContainText('Position 13 of 25 · cycle 1');
  await page.locator('#km42PuzzleClose').click();
  const afterBatch = await page.evaluate(() => window.__KMATE_WOODPECKER__.state().store.programs[0]);
  expect(afterBatch.cycles).toHaveLength(1);
  expect(afterBatch.cycles[0].results).toHaveLength(12);
  await page.locator('#wpHome').click();
  await expect(page.locator('#woodpeckerView')).toBeHidden();
  await expect(page.locator('#wizardWoodpeckerButton')).toBeVisible();
});

test('completing a cycle repeats identical positions, resets cycle statistics, and stops after seven passes', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  const program = await createSet(page);
  // Keep this UI transition test short; full-size cycle invariants run in Node.
  program.puzzles = program.puzzles.slice(0, 2);
  await page.evaluate(({ key, program }) => localStorage.setItem(key, JSON.stringify({ version: 1, activeId: program.id, programs: [program] })), { key: KEY, program });
  await page.reload();
  await page.waitForFunction(() => window.__KMATE_WOODPECKER__?.state().ready);
  await page.locator('#wizardWoodpeckerButton').click();
  for (let cycle = 1; cycle <= 7; cycle++) {
    await page.locator('#wpContinue').click();
    for (let puzzle = 0; puzzle < 2; puzzle++) {
      await expect(page.locator('#km42PuzzleTitle')).toContainText(`Position ${puzzle + 1} of 2 · cycle ${cycle}`);
      await page.locator('#km42PuzzleSkip').click();
      await page.locator('#km42PuzzleNext').click();
    }
    await expect(page.locator('#wpSessionContinue')).toHaveText('View cycle results');
    await page.locator('#wpSessionContinue').click();
    const stored = await page.evaluate(() => window.__KMATE_WOODPECKER__.state().store.programs[0]);
    expect(stored.puzzles).toEqual(program.puzzles);
    expect(stored.cycles).toHaveLength(cycle);
    expect(stored.cycles.at(-1).results).toHaveLength(2);
    expect(stored.cycles.at(-1).results.every((result) => result.clean === false)).toBe(true);
  }
  await expect(page.locator('#wpContinue')).toHaveCount(0);
  await expect(page.locator('#wpProgram')).toContainText('You completed all seven passes');
});

test('phone layout keeps the board inside its wooden frame and failed downloads preserve saved sets', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  const program = await createSet(page);
  await page.locator('#wpContinue').click();
  await expect(page.locator('#km42PuzzleBoard .sq')).toHaveCount(64);
  const geometry = await page.evaluate(() => {
    const board = document.querySelector('#km42PuzzleBoard').getBoundingClientRect();
    const frame = document.querySelector('#km42PuzzleBoard').parentElement.getBoundingClientRect();
    const rankOne = document.querySelector('#km42PuzzleBoard [data-km42-square="a1"]').getBoundingClientRect();
    return { board, frame, rankOne, viewport: innerWidth };
  });
  expect(geometry.board.left).toBeGreaterThan(geometry.frame.left);
  expect(geometry.board.right).toBeLessThan(geometry.frame.right);
  expect(geometry.rankOne.bottom).toBeLessThan(geometry.frame.bottom);
  expect(geometry.frame.right).toBeLessThanOrEqual(geometry.viewport);
  await page.locator('#km42PuzzleClose').click();
  await page.route('**/learning/puzzles/*-*.json', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.locator('#wpBuild').click();
  await expect(page.locator('#wpError')).toContainText('could not load');
  const saved = await page.evaluate(() => window.__KMATE_WOODPECKER__.state().store.programs);
  expect(saved).toHaveLength(1);
  expect(saved[0].puzzles).toEqual(program.puzzles);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
