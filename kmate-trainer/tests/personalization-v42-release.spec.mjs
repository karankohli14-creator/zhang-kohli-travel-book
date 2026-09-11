import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/';
const FEN_14 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 14';
const FEN_21 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 21';
const FEN_27 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 27';

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
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><title>K-Mate lesson fixture</title>',
  }));
}

const store = {
  version: 7,
  settings: {
    phase: 'middlegame',
    opening: 'all',
    positionRating: 1400,
    opponentRating: 1400,
    timeControl: '3+0',
    side: 'w',
    sound: false,
    trainingGoal: 'attack',
    blindCalibration: false,
    autoHints: false,
    liveCoach: true,
    principleReview: true,
    coachVoice: false,
  },
  legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
  sessions: [{
    id: 'v42-release-session',
    startedAt: '2026-09-11T03:00:00.000Z',
    endedAt: '2026-09-11T03:09:00.000Z',
    positionId: 'v42-release-position',
    seedPositionId: 'v42-release-position',
    title: 'Chess.com · Kmate_00 vs ReleaseTest',
    opening: 'London System',
    theme: 'V42 release personalization',
    tags: ['calculation', 'king safety'],
    phase: 'middlegame',
    positionRating: 1400,
    opponentRating: 1400,
    requestedOpponentRating: 1400,
    timeControl: '3+0',
    trainingGoal: 'attack',
    userColor: 'w',
    outcome: 'loss',
    reason: 'resignation',
    completed: true,
    timeUsedPct: 0.16,
    avgCpLoss: 210,
    positionPrinciples: [
      {
        key: 'king-safety',
        title: 'King safety before ambition',
        sessionPrompt: 'Track forcing lines around both kings before attacking.',
        why: 'The player chose an attacking middlegame.',
      },
      {
        key: 'pawn-breaks',
        title: 'Prepare pawn breaks',
        sessionPrompt: 'Calculate which lines each pawn break opens.',
        why: 'The attacking goal often depends on a prepared pawn break.',
      },
    ],
    userMoves: [
      {
        id: 'v42-release-loose',
        san: 'a3?',
        uci: 'a2a3',
        from: 'a2',
        to: 'a3',
        fenBefore: FEN_14,
        spentMs: 2500,
        cpLoss: 260,
        bestMove: 'e2e4',
        quality: 'blunder',
        principleDiagnoses: [{
          key: 'loose-pieces',
          title: 'Loose pieces',
          confidence: 'high',
          evidence: 'An undefended tactical target needed attention.',
        }],
        ignoredPrinciples: ['loose-pieces'],
      },
      {
        id: 'v42-release-calc',
        san: 'h3?',
        uci: 'h2h3',
        from: 'h2',
        to: 'h3',
        fenBefore: FEN_21,
        spentMs: 1900,
        cpLoss: 180,
        bestMove: 'e2e4',
        quality: 'mistake',
        principleDiagnoses: [{
          key: 'forcing-scan',
          title: 'Forcing move scan',
          confidence: 'high',
          evidence: 'Checks, captures, and threats were not compared.',
        }],
        ignoredPrinciples: ['candidate-comparison'],
      },
      {
        id: 'v42-release-defense',
        san: 'a6?',
        uci: 'a7a6',
        from: 'a7',
        to: 'a6',
        fenBefore: FEN_27,
        spentMs: 6200,
        cpLoss: 125,
        bestMove: 'g8f6',
        quality: 'mistake',
        principleDiagnoses: [{
          key: 'opponent-threat',
          title: 'Opponent threat',
          confidence: 'medium',
          evidence: 'The opponent’s most urgent idea was not addressed.',
        }],
        ignoredPrinciples: ['opponent-threat'],
      },
    ],
  }],
};

async function prepare(page) {
  await page.addInitScript((seed) => {
    localStorage.setItem('kmate-position-v7', JSON.stringify(seed));
    localStorage.removeItem('kmate-learning-v40');
    localStorage.removeItem('kmate-personalization-v42');
  }, store);
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE_V42__?.state?.().ready
      && window.__KMATE_V42_AUTHORITY__?.state?.().ready
      && window.__KMATE_PERSONALIZATION__
    ),
    undefined,
    { timeout: 60_000 },
  );
}

async function setSetup(page, { goal, phase, time, side }) {
  await page.evaluate(async (values) => {
    const goalSelect = document.querySelector('#goalSelect');
    goalSelect.value = values.goal;
    goalSelect.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector(`[data-phase="${values.phase}"]`)?.click();
    document.querySelector(`[data-time="${values.time}"]`)?.click();
    document.querySelector(`[data-side="${values.side}"]`)?.click();
    await new Promise((resolve) => setTimeout(resolve, 220));
  }, { goal, phase, time, side });
}

async function openLearning(page) {
  await expect(page.locator('#wizardLearningButton')).toBeVisible();
  await page.locator('#wizardLearningButton').click();
  await expect(page.locator('#learningView')).toBeVisible();
  await expect(page.locator('#km42LearningBlueprint')).toContainText('Gameplay first', { timeout: 20_000 });
}

async function openPuzzle(page) {
  await page.locator('#learningStartPuzzles').click();
  await expect(page.locator('#km42PuzzleMode')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#km42PuzzleBoard .sq')).toHaveCount(64, { timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(window.__KMATE_V42__?.state?.().puzzle?.expectedMove),
    undefined,
    { timeout: 60_000 },
  );
  return page.evaluate(() => window.__KMATE_V42__.state().puzzle);
}

test.use({
  viewport: { width: 1280, height: 900 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('v42 changes principles when the player changes the training setup', async ({ page }) => {
  test.setTimeout(90_000);
  await prepare(page);

  const attack = await page.evaluate(() => window.__KMATE_PERSONALIZATION__.preview());
  expect(attack.context.goalKey).toBe('attack');
  expect(attack.principles.map((item) => item.key)).toContain('king-safety');
  expect(attack.principles.every((item) => item.why && item.sessionPrompt)).toBe(true);

  await setSetup(page, { goal: 'convert', phase: 'endgame', time: '10+0', side: 'b' });
  const convert = await page.evaluate(() => window.__KMATE_PERSONALIZATION__.preview());
  expect(convert.context.goalKey).toBe('convert');
  expect(convert.context.phase).toBe('endgame');
  expect(convert.context.timeControl).toBe('10+0');
  expect(convert.context.userColor).toBe('b');
  expect(convert.principles.map((item) => item.key)).toContain('conversion');
  expect(convert.principles.map((item) => item.key)).toContain('king-activity');
  expect(convert.principles.map((item) => item.key)).not.toEqual(attack.principles.map((item) => item.key));

  await setSetup(page, { goal: 'tactics', phase: 'middlegame', time: '1+0', side: 'w' });
  const tactics = await page.evaluate(() => window.__KMATE_PERSONALIZATION__.preview());
  expect(tactics.principles.map((item) => item.key)).toContain('forcing-scan');
  expect(tactics.principles.map((item) => item.key)).toContain('loose-pieces');
  expect(tactics.principles.map((item) => item.key)).not.toEqual(convert.principles.map((item) => item.key));
  expect(tactics.context.fingerprint).not.toBe(convert.context.fingerprint);

  const previewText = await page.locator('#km42SetupBlueprint').textContent();
  expect(previewText).toContain('Calculation');
  expect(previewText).toContain('Checks');
});

test('v42 shows five diverse lessons tied to different moves and the chosen goal', async ({ page }) => {
  test.setTimeout(90_000);
  await prepare(page);
  await openLearning(page);

  const recommendation = await page.evaluate(() => window.__KMATE_V42__.recommendation());
  expect(recommendation.version).toBe('42.0.0');
  expect(recommendation.customization.mode).toBe('gameplay-plus-intent');
  expect(recommendation.puzzlePlan).toHaveLength(5);
  expect(recommendation.puzzlePlan.some((slot) => slot.sourceType === 'move-evidence')).toBe(true);
  expect(recommendation.puzzlePlan.some((slot) => slot.sourceType === 'session-intent')).toBe(true);
  expect(recommendation.optionEvidence.some((item) => item.value === 'Attack the king')).toBe(true);

  await expect(page.locator('#km42LearningBlueprint')).toContainText('Attack the king');
  await page.locator('#learningWatchLesson').click();
  await expect(page.locator('#km42LessonDialog')).toBeVisible();
  await expect(page.locator('#km42LessonList .km42-lesson-row')).toHaveCount(5, { timeout: 30_000 });
  const lessonTitles = await page.locator('#km42LessonList .km42-lesson-row .km41-lesson-copy > b').allTextContents();
  expect(new Set(lessonTitles).size).toBe(5);
  const lessonText = (await page.locator('#km42LessonList').textContent()) || '';
  expect(lessonText).toMatch(/14\. a3|21\. h3|27\.\.\. a6/);
  expect(lessonText).toMatch(/Attack|king|pawn break/i);
  await expect(page.locator('#km42VideoDialog')).not.toBeVisible();
});

test('v42 phone puzzle board supports tap–tap movement and protects safe areas', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--kmate-safe-top', '47px');
    document.documentElement.style.setProperty('--kmate-safe-bottom', '34px');
  });
  await openLearning(page);
  const initial = await openPuzzle(page);

  expect(initial.tapEnabled).toBe(true);
  expect(initial.dragEnabled).toBe(true);
  const from = initial.expectedMove.slice(0, 2);
  const to = initial.expectedMove.slice(2, 4);
  await page.locator(`[data-km42-square="${from}"]`).click();
  await expect(page.locator(`[data-km42-square="${from}"]`)).toHaveClass(/selected/);
  const targetClass = await page.locator(`[data-km42-square="${to}"]`).getAttribute('class');
  expect(targetClass).toMatch(/legal|capture/);
  const selectedState = await page.evaluate(() => window.__KMATE_V42__.state().puzzle);
  expect(selectedState.selected).toBe(from);
  expect(selectedState.legalTargets).toContain(to);

  await page.locator(`[data-km42-square="${to}"]`).click();
  await page.waitForFunction(
    (fen) => window.__KMATE_V42__.state().puzzle.fen !== fen,
    initial.fen,
    { timeout: 15_000 },
  );

  const layout = await page.evaluate(() => {
    const mode = document.querySelector('#km42PuzzleMode').getBoundingClientRect();
    const board = document.querySelector('#km42PuzzleBoard').getBoundingClientRect();
    return { mode, board, viewportHeight: innerHeight };
  });
  expect(layout.mode.top).toBeGreaterThanOrEqual(46);
  expect(layout.mode.bottom).toBeLessThanOrEqual(layout.viewportHeight - 33);
  expect(layout.board.width).toBeGreaterThanOrEqual(350);
  expect(Math.abs(layout.board.width - layout.board.height)).toBeLessThan(2);
  expect(await page.locator('#km42PuzzleBoard .vector-piece').count()).toBeGreaterThan(1);
});

test('v42 puzzle pieces can be dragged with pointer input', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await openLearning(page);
  const initial = await openPuzzle(page);
  const fromSquare = initial.expectedMove.slice(0, 2);
  const toSquare = initial.expectedMove.slice(2, 4);
  const from = await page.locator(`[data-km42-square="${fromSquare}"]`).boundingBox();
  const to = await page.locator(`[data-km42-square="${toSquare}"]`).boundingBox();
  if (!from || !to) throw new Error('Expected puzzle squares were not visible.');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2 + from.width / 2, (from.y + to.y) / 2 + from.height / 2, { steps: 5 });
  await expect(page.locator('.km42-drag-ghost')).toBeVisible();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(
    (fen) => window.__KMATE_V42__.state().puzzle.fen !== fen,
    initial.fen,
    { timeout: 15_000 },
  );
  const authority = await page.evaluate(() => window.__KMATE_V42_AUTHORITY__.state());
  expect(authority.tapHandlerCount).toBe(1);
  expect(authority.dragOwner).toBe('board-pointer-events');
});
