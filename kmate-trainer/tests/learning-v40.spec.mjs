import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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

const seededStore = {
  version: 7,
  settings: {
    phase: 'middlegame',
    opening: 'all',
    positionRating: 1400,
    opponentRating: 1400,
    timeControl: '3+0',
    side: 'w',
    sound: false,
    trainingGoal: 'all',
    blindCalibration: false,
    autoHints: false,
    liveCoach: true,
    principleReview: false,
    coachVoice: false,
  },
  legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
  sessions: [{
    id: 'seed-session-loose-piece',
    startedAt: '2026-09-09T20:00:00.000Z',
    endedAt: '2026-09-09T20:07:00.000Z',
    positionId: 'custom-seed',
    seedPositionId: 'custom-seed',
    title: 'Chess.com · Kmate_00 vs TestOpponent',
    opening: 'Imported game',
    theme: 'Loose pieces and calculation',
    tags: ['calculation'],
    phase: 'middlegame',
    positionRating: 1400,
    opponentRating: 1400,
    requestedOpponentRating: 1400,
    timeControl: '3+0',
    userColor: 'w',
    outcome: 'loss',
    reason: 'resignation',
    completed: true,
    timeUsedPct: 0.12,
    avgCpLoss: 260,
    userMoves: [{
      id: 'seed-move-1',
      san: 'a3?',
      uci: 'a2a3',
      from: 'a2',
      to: 'a3',
      fenBefore: START_FEN,
      spentMs: 3200,
      cpLoss: 260,
      bestMove: 'e2e4',
      quality: 'blunder',
      principleDiagnoses: [{
        key: 'loose-pieces',
        title: 'Loose pieces',
        confidence: 'high',
        evidence: 'An undefended piece or tactical target needed attention before committing to the move.',
      }],
      ignoredPrinciples: ['loose-pieces'],
    }],
  }],
};

const puzzleLines = [
  ['e2e4', 'e7e5', 'g1f3'],
  ['d2d4', 'd7d5', 'c2c4'],
  ['g1f3', 'g8f6', 'c2c4'],
  ['c2c4', 'e7e5', 'b1c3'],
  ['b1c3', 'd7d5', 'e2e4'],
];

const puzzles = puzzleLines.map((solutionUci, index) => ({
  id: `learning-puzzle-${index + 1}`,
  practiceFen: START_FEN,
  solutionUci,
  opponentMove: 'a7a6',
  rating: 1280 + index * 10,
  ratingDeviation: 55,
  popularity: 96,
  plays: 5000,
  themes: ['hangingPiece', 'middlegame'],
  openingTags: [],
  sourceGame: `https://lichess.org/game/test${index + 1}`,
  focus: 'loosePieces',
  band: '1200-1399',
}));

const puzzleIndex = {
  version: 40,
  license: 'CC0-1.0',
  total: 11902,
  focuses: {
    loosePieces: { label: 'Loose pieces' },
    calculation: { label: 'Calculation' },
  },
  bands: [
    { key: '1000-1199', minRating: 1000, maxRating: 1199 },
    { key: '1200-1399', minRating: 1200, maxRating: 1399 },
    { key: '1400-1599', minRating: 1400, maxRating: 1599 },
  ],
  shards: [
    { focus: 'loosePieces', band: '1200-1399', minRating: 1200, maxRating: 1399, count: 5, file: 'loosePieces-1200-1399.json' },
    { focus: 'calculation', band: '1200-1399', minRating: 1200, maxRating: 1399, count: 5, file: 'calculation-1200-1399.json' },
  ],
};

const videoCatalog = {
  version: 40,
  contentPolicy: { labels: { externalEmbed: 'External lesson · creator-hosted' } },
  videos: [{
    id: 'Iu1f7axtccQ',
    title: 'How to Identify Hanging Pieces',
    creator: 'IM Alex Astaneh · Chessfactor',
    level: 'beginner',
    focus: ['loosePieces', 'calculation'],
    sourceUrl: 'https://lichess.org/video/Iu1f7axtccQ',
    embedUrl: 'https://www.youtube-nocookie.com/embed/Iu1f7axtccQ',
    licenseClass: 'externalEmbed',
  }],
};

async function routeLearningData(page) {
  const json = (payload) => ({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(payload),
  });
  await page.route(/\/kmate-trainer\/learning\/videos-v40\.json.*/, (route) => route.fulfill(json(videoCatalog)));
  await page.route(/\/kmate-trainer\/learning\/puzzles\/index\.json.*/, (route) => route.fulfill(json(puzzleIndex)));
  await page.route(/\/kmate-trainer\/learning\/puzzles\/(?:loosePieces|calculation)-1200-1399\.json.*/, (route) => route.fulfill(json({
    version: 40,
    focus: route.request().url().includes('calculation') ? 'calculation' : 'loosePieces',
    band: '1200-1399',
    puzzles,
  })));
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><title>Test lesson</title>',
  }));
}

async function prepareLearningApp(page) {
  await page.addInitScript((store) => {
    localStorage.setItem('kmate-position-v7', JSON.stringify(store));
    localStorage.removeItem('kmate-learning-v40');
  }, seededStore);
  await routeChessJs(page);
  await routeLearningData(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(window.__KMATE_LEARNING__ && window.__KMATE_LEARNING_CORE__),
    undefined,
    { timeout: 45_000 },
  );
}

test.use({
  viewport: { width: 1280, height: 860 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('recent Chess.com practice becomes a matched lesson and five-puzzle workout', async ({ page }) => {
  test.setTimeout(120_000);
  await prepareLearningApp(page);

  const state = await page.evaluate(() => window.__KMATE__.state());
  expect(state.learning.focus).toBe('loosePieces');
  expect(state.learning.puzzleBand).toBe('1200-1399');

  const recommendation = await page.evaluate(() => window.__KMATE_LEARNING__.recommendation());
  expect(recommendation.focus.key).toBe('loosePieces');
  expect(recommendation.sourceLabel).toContain('Chess.com');
  expect(recommendation.reasons.join(' ')).toContain('260');

  await page.locator('#learningNavButton').click();
  await expect(page.locator('#learningView')).toBeVisible();
  await expect(page.locator('#learningFocusTitle')).toContainText('loose pieces');
  await expect(page.locator('#learningStartPuzzles')).toContainText('11,902 CC0 available');
  await expect(page.locator('#learningVideoCard')).toContainText('How to Identify Hanging Pieces');
  await expect(page.locator('#learningProfile')).toContainText('Loose pieces');

  await page.locator('#learningWatchLesson').click();
  await expect(page.locator('#learningVideoDialog')).toBeVisible();
  await expect(page.locator('#learningVideoTitle')).toHaveText('How to Identify Hanging Pieces');
  await expect(page.locator('#learningVideoFrame')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/Iu1f7axtccQ/);
  await page.locator('#learningVideoClose').click();

  await page.locator('#learningStartPuzzles').click();
  await expect(page.locator('#learningPuzzleDialog')).toBeVisible();
  await expect(page.locator('#learningPuzzleBoard .learning-puzzle-square')).toHaveCount(64);
  await expect(page.locator('#learningPuzzleCounter')).toHaveText('1 / 5');

  await page.locator('[data-square="e2"]', { has: page.locator('.learning-puzzle-piece') }).click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('#learningPuzzleStatus')).toContainText('Continue', { timeout: 10_000 });
  await page.locator('[data-square="g1"]', { has: page.locator('.learning-puzzle-piece') }).click();
  await page.locator('[data-square="f3"]').click();
  await expect(page.locator('#learningPuzzleStatus')).toContainText('Solved');
  await expect(page.locator('#learningPuzzleNext')).toBeVisible();

  const afterSolve = await page.evaluate(() => JSON.parse(localStorage.getItem('kmate-learning-v40')));
  expect(afterSolve.puzzles['learning-puzzle-1'].solved).toBe(true);

  await page.locator('#learningPuzzleNext').click();
  for (let remaining = 0; remaining < 4; remaining += 1) {
    await page.locator('#learningPuzzleSkip').click();
    await expect(page.locator('#learningPuzzleNext')).toBeVisible();
    await page.locator('#learningPuzzleNext').click();
  }

  await expect(page.locator('#learningPuzzleBody')).toContainText('Workout complete');
  const finalProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('kmate-learning-v40')));
  expect(finalProgress.workouts).toHaveLength(1);
  expect(finalProgress.workouts[0].solved).toBe(1);
  expect(finalProgress.workouts[0].total).toBe(5);
});
