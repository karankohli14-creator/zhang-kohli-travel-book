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
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><title>K-Mate test lesson</title>',
  }));
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
    id: 'library-tailored-session',
    startedAt: '2026-09-09T20:00:00.000Z',
    endedAt: '2026-09-09T20:07:00.000Z',
    positionId: 'custom-library-test',
    title: 'Chess.com · Kmate_00 vs TestOpponent',
    opening: 'Imported game',
    theme: 'Calculation and loose pieces',
    tags: ['calculation'],
    phase: 'middlegame',
    positionRating: 1400,
    opponentRating: 1400,
    timeControl: '3+0',
    trainingGoal: 'all',
    userColor: 'w',
    outcome: 'loss',
    reason: 'resignation',
    completed: true,
    timeUsedPct: 0.12,
    avgCpLoss: 260,
    userMoves: [{
      id: 'library-tailored-move',
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
        evidence: 'An undefended piece or tactical target needed attention.',
      }],
      ignoredPrinciples: ['loose-pieces'],
    }],
  }],
};

async function prepare(page) {
  await page.addInitScript((store) => {
    localStorage.setItem('kmate-position-v7', JSON.stringify(store));
    localStorage.removeItem('kmate-learning-v40');
    localStorage.removeItem('kmate-personalization-v42');
  }, seededStore);
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE_LEARNING_LIBRARY__
      && window.__KMATE_LEARNING__
      && window.__KMATE_RELEVANCE__
      && window.__KMATE_V42__?.state?.().ready
      && window.__KMATE_V42_AUTHORITY__?.state?.().ready
    ),
    undefined,
    { timeout: 60_000 },
  );
}

test.use({
  viewport: { width: 1280, height: 900 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('players can openly browse puzzle and instructional-video categories', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);

  await expect(page.locator('#wizardLearningButton')).toBeVisible();
  await expect(page.locator('#wizardLearningButton')).toContainText('Puzzles & videos');
  await page.locator('#wizardLearningButton').click();

  await expect(page.locator('#learningView')).toBeVisible();
  await expect(page.locator('#learningOpenLibrary')).toBeVisible();
  await expect(page.locator('[data-library-focus-card]')).toHaveCount(8);
  await expect(page.locator('[data-library-focus-card="calculation"]')).toContainText('puzzles');
  await expect(page.locator('[data-library-focus-card="calculation"]')).toContainText('videos');
  await expect(page.locator('#km41RecommendationEvidence')).toContainText('a3');
  await expect(page.locator('#km42LearningBlueprint')).toBeVisible();

  await page.locator('#learningBrowseAllVideos').click();
  await expect(page.locator('#learningLibraryDialog')).toBeVisible();
  await expect(page.locator('#learningLibraryVideos .learning-library-video')).toHaveCount(21);

  await page.locator('[data-library-video-focus="kingSafety"]').click();
  await expect(page.locator('#learningLibraryVideos .learning-library-video').first()).toBeVisible();
  const kingSafetyCount = await page.locator('#learningLibraryVideos .learning-library-video').count();
  expect(kingSafetyCount).toBeGreaterThan(0);

  await page.locator('#learningLibraryVideos [data-library-play-video]').first().click();
  await expect(page.locator('#learningLibraryPlayer')).toBeVisible();
  await expect(page.locator('#learningLibraryPlayerFrame')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\//);
  await page.locator('#learningLibraryPlayerClose').click();
  await page.locator('#learningLibraryClose').click();

  await page.locator('[data-library-puzzles="calculation"]').click();
  await expect(page.locator('#km42PuzzleMode')).toBeVisible();
  await expect(page.locator('#km42PuzzleBoard .sq')).toHaveCount(64);
  await expect(page.locator('#km42PuzzleMode .playerbar')).toHaveCount(2);
  await page.locator('#km42PuzzleClose').click();
});

test('the results screen presents the authoritative game-and-setup-specific prescription', async ({ page }) => {
  test.setTimeout(90_000);
  await prepare(page);

  await page.evaluate(() => {
    const dialog = document.querySelector('#resultDialog');
    if (dialog?.showModal && !dialog.open) dialog.showModal();
    else dialog?.setAttribute('open', '');
  });

  await expect(page.locator('#resultDialog')).toBeVisible();
  await expect(page.locator('#km42ResultCard')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#km42ResultCard .learning-result-head small')).toContainText('Custom to this game and your setup');
  await expect(page.locator('#km42ResultTitle')).toContainText('Loose pieces');
  await expect(page.locator('#km42ResultEvidence')).toContainText('Moves used');
  await expect(page.locator('#km42ResultEvidence')).toContainText('a3');
  await expect(page.locator('#km42ResultEvidence')).toContainText('Choices used');
  await expect(page.locator('#km42ResultPuzzles')).toBeEnabled();
  await expect(page.locator('#km42ResultLessons')).toBeEnabled();
  await expect(page.locator('#km42ResultLearning')).toBeVisible();
  await expect(page.locator('#learningResultCard')).toBeHidden();
  await expect(page.locator('#learningResultCard')).toHaveClass(/km42-superseded-result/);

  const libraryState = await page.evaluate(() => window.__KMATE_LEARNING_LIBRARY__.state());
  expect(libraryState.ready).toBe(true);
  expect(libraryState.categories).toBe(8);
  expect(libraryState.resultTailoring).toBe(true);
  const v42 = await page.evaluate(() => window.__KMATE_V42__.state());
  expect(v42.movableByTap).toBe(true);
  expect(v42.movableByDrag).toBe(true);
  const authority = await page.evaluate(() => window.__KMATE_V42_AUTHORITY__.state());
  expect(authority.resultCard).toBe(true);
  expect(authority.legacyResultHidden).toBe(true);
});
