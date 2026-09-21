import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 14';

function chessModuleSource() {
  const candidate = path.resolve('node_modules/chess.js/dist/esm/chess.js');
  if (!fs.existsSync(candidate)) throw new Error('chess.js test dependency is missing.');
  return fs.readFileSync(candidate, 'utf8');
}

async function routeExternalModules(page) {
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
    body: '<!doctype html><title>Training Plan lesson fixture</title>',
  }));
}

const seedStore = {
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
    id: 'v43-training-plan-session',
    startedAt: '2026-09-20T18:00:00.000Z',
    endedAt: '2026-09-20T18:09:00.000Z',
    positionId: 'v43-plan-position',
    seedPositionId: 'v43-plan-position',
    title: 'Chess.com · Kmate_00 vs PlanTest',
    opening: 'London System',
    theme: 'Training Plan personalization',
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
    timeUsedPct: 0.15,
    avgCpLoss: 225,
    userMoves: [
      {
        id: 'v43-loose-piece',
        san: 'a3?',
        uci: 'a2a3',
        from: 'a2',
        to: 'a3',
        fenBefore: START_FEN,
        spentMs: 2600,
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
        id: 'v43-forcing-scan',
        san: 'h3?',
        uci: 'h2h3',
        from: 'h2',
        to: 'h3',
        fenBefore: START_FEN,
        spentMs: 1800,
        cpLoss: 180,
        bestMove: 'd2d4',
        quality: 'mistake',
        principleDiagnoses: [{
          key: 'forcing-scan',
          title: 'Forcing move scan',
          confidence: 'high',
          evidence: 'Checks, captures, and threats were not compared.',
        }],
        ignoredPrinciples: ['candidate-comparison'],
      },
    ],
  }],
};

async function prepare(page) {
  await page.addInitScript((store) => {
    localStorage.setItem('kmate-position-v7', JSON.stringify(store));
    localStorage.removeItem('kmate-learning-v40');
    localStorage.removeItem('kmate-training-plans-v43');
  }, seedStore);
  await routeExternalModules(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE_TRAINING_PLANS__
      && window.__KMATE_V42__?.startPreparedWorkout
      && window.__KMATE_LEARNING_CORE__
    ),
    undefined,
    { timeout: 90_000 },
  );
}

test.use({
  viewport: { width: 1280, height: 900 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('v43 exposes one custom and ten skill-specific training plans', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);

  await expect(page.locator('#wizardTrainingPlanButton')).toBeVisible();
  await page.locator('#wizardTrainingPlanButton').click();
  await expect(page.locator('#trainingPlanView')).toBeVisible();
  await expect(page.locator('[data-tp-plan-card]')).toHaveCount(11, { timeout: 30_000 });
  await expect(page.locator('[data-tp-plan-card="custom"]')).toContainText('Custom Training Plan');
  await expect(page.locator('[data-tp-plan-card="pawn-play"]')).toContainText('Pawn Play');
  await expect(page.locator('[data-tp-plan-card="piece-activity"]')).toContainText('Piece Activity');
  await expect(page.locator('[data-tp-plan-card="prophylaxis"]')).toContainText('Prophylaxis');
  await expect(page.locator('[data-tp-plan-card="custom"]')).toContainText('a3');

  const state = await page.evaluate(() => window.__KMATE_TRAINING_PLANS__.state());
  expect(state.ready).toBe(true);
  expect(state.plans).toBe(11);
  expect(state.namedPlans).toBe(10);
  expect(state.puzzleTarget).toBe(100);
  expect(state.lessonTarget).toBe(20);
});

test('a named plan builds 100 puzzles, 20 lessons, and records category progress', async ({ page }) => {
  test.setTimeout(180_000);
  await prepare(page);
  await page.locator('#wizardTrainingPlanButton').click();
  await expect(page.locator('#trainingPlanView')).toBeVisible();
  await page.locator('[data-tp-open-plan="calculation"]').click();

  await expect(page.locator('#trainingPlanDetail')).toBeVisible();
  await expect(page.locator('#trainingPlanDetail')).toContainText('Calculation & Tactical Vision', { timeout: 90_000 });
  await expect(page.locator('#trainingPlanDetail')).toContainText('100-puzzle curriculum mix');

  await page.locator('[data-tp-tab="puzzles"]').click();
  await expect(page.locator('.tp-puzzle-row')).toHaveCount(100, { timeout: 90_000 });
  await page.locator('[data-tp-start-batch]').click();
  await expect(page.locator('#km42PuzzleMode')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#km42PuzzleBoard .sq')).toHaveCount(64, { timeout: 90_000 });
  const puzzleState = await page.evaluate(() => window.__KMATE_V42__.state());
  expect(puzzleState.puzzleCount).toBe(10);

  await page.locator('#km42PuzzleSkip').click();
  await expect(page.locator('#km42PuzzleNext')).toBeVisible();
  await page.locator('#km42PuzzleClose').click();
  await expect(page.locator('#trainingPlanDetail')).toBeVisible();

  await page.locator('[data-tp-tab="lessons"]').click();
  await expect(page.locator('.tp-video-card')).toHaveCount(20, { timeout: 60_000 });
  await page.locator('.tp-video-card [data-tp-play-video]').first().click();
  await expect(page.locator('#tpVideoDialog')).toBeVisible();
  await expect(page.locator('#tpVideoFrame')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\//);
  await page.locator('#tpVideoComplete').click();
  await expect(page.locator('#tpVideoComplete')).toContainText('completed');
  await page.locator('#tpVideoClose').click();

  const state = await page.evaluate(() => window.__KMATE_TRAINING_PLANS__.state());
  const calculation = state.metrics.find((item) => item.id === 'calculation');
  expect(calculation.attempted).toBe(1);
  expect(calculation.videosCompleted).toBe(1);
  expect(calculation.status).toBe('In progress');
});

test('the custom plan builds from reviewed moves and remains phone-safe', async ({ page }) => {
  test.setTimeout(180_000);
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--kmate-safe-top', '47px');
    document.documentElement.style.setProperty('--kmate-safe-bottom', '34px');
  });
  await page.locator('#wizardTrainingPlanButton').click();
  await page.locator('[data-tp-open-plan="custom"]').click();
  await expect(page.locator('#trainingPlanDetail')).toContainText('Custom Training Plan', { timeout: 90_000 });
  await expect(page.locator('#trainingPlanDetail')).toContainText('a3');
  await page.locator('[data-tp-tab="puzzles"]').click();
  await expect(page.locator('.tp-puzzle-row')).toHaveCount(100, { timeout: 90_000 });

  const layout = await page.evaluate(() => {
    const view = document.querySelector('#trainingPlanView').getBoundingClientRect();
    const hero = document.querySelector('.tp-detail-hero').getBoundingClientRect();
    return { view, hero, width: innerWidth };
  });
  expect(layout.view.width).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.hero.left).toBeGreaterThanOrEqual(0);
  expect(layout.hero.right).toBeLessThanOrEqual(layout.width + 1);
});
