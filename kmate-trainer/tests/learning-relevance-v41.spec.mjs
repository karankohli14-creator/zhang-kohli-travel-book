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
    id: 'relevance-session',
    startedAt: '2026-09-10T16:00:00.000Z',
    endedAt: '2026-09-10T16:08:00.000Z',
    positionId: 'custom-relevance',
    seedPositionId: 'custom-relevance',
    title: 'Chess.com · Kmate_00 vs RelevanceTest',
    opening: 'London System',
    theme: 'Move-level relevance test',
    tags: ['calculation', 'piece activity'],
    phase: 'middlegame',
    positionRating: 1400,
    opponentRating: 1400,
    requestedOpponentRating: 1400,
    timeControl: '3+0',
    userColor: 'w',
    outcome: 'loss',
    reason: 'resignation',
    completed: true,
    timeUsedPct: 0.18,
    avgCpLoss: 165,
    userMoves: [
      {
        id: 'move-loose',
        san: 'a3?',
        uci: 'a2a3',
        from: 'a2',
        to: 'a3',
        fenBefore: FEN_14,
        spentMs: 3200,
        cpLoss: 260,
        bestMove: 'e2e4',
        quality: 'blunder',
        principleDiagnoses: [{
          key: 'loose-pieces',
          title: 'Loose pieces',
          confidence: 'high',
          evidence: 'An undefended tactical target needed attention before committing to the move.',
        }],
        ignoredPrinciples: ['loose-pieces'],
      },
      {
        id: 'move-calc',
        san: 'h3?',
        uci: 'h2h3',
        from: 'h2',
        to: 'h3',
        fenBefore: FEN_21,
        spentMs: 2100,
        cpLoss: 180,
        bestMove: 'e2e4',
        quality: 'mistake',
        principleDiagnoses: [{
          key: 'forcing-scan',
          title: 'Forcing move scan',
          confidence: 'high',
          evidence: 'Checks, captures, and threats were not compared before the move was played.',
        }],
        ignoredPrinciples: ['candidate-comparison'],
      },
      {
        id: 'move-defense',
        san: 'a6?',
        uci: 'a7a6',
        from: 'a7',
        to: 'a6',
        fenBefore: FEN_27,
        spentMs: 6700,
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

const puzzleLines = [
  ['e2e4', 'e7e5', 'g1f3'],
  ['d2d4', 'd7d5', 'c2c4'],
  ['g1f3', 'g8f6', 'c2c4'],
  ['c2c4', 'e7e5', 'b1c3'],
  ['b1c3', 'd7d5', 'e2e4'],
];

function puzzleSet(focus, themes) {
  return puzzleLines.map((solutionUci, index) => ({
    id: `${focus}-relevance-${index + 1}`,
    practiceFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    solutionUci,
    opponentMove: 'a7a6',
    rating: 1280 + index * 20,
    ratingDeviation: 55,
    popularity: 97 - index,
    plays: 5000,
    themes: [...themes, 'middlegame'],
    openingTags: focus === 'openings' ? ['London System'] : [],
    sourceGame: `https://lichess.org/game/${focus}${index + 1}`,
    focus,
    band: '1200-1399',
  }));
}

const puzzleIndex = {
  version: 40,
  license: 'CC0-1.0',
  total: 11902,
  focuses: {
    loosePieces: { label: 'Loose pieces' },
    calculation: { label: 'Calculation' },
    defense: { label: 'Defense' },
  },
  bands: [
    { key: '1000-1199', minRating: 1000, maxRating: 1199 },
    { key: '1200-1399', minRating: 1200, maxRating: 1399 },
    { key: '1400-1599', minRating: 1400, maxRating: 1599 },
  ],
  shards: [
    { focus: 'loosePieces', band: '1200-1399', minRating: 1200, maxRating: 1399, count: 5, file: 'loosePieces-1200-1399.json' },
    { focus: 'calculation', band: '1200-1399', minRating: 1200, maxRating: 1399, count: 5, file: 'calculation-1200-1399.json' },
    { focus: 'defense', band: '1200-1399', minRating: 1200, maxRating: 1399, count: 5, file: 'defense-1200-1399.json' },
  ],
};

const videoCatalog = {
  version: 40,
  contentPolicy: { labels: { externalEmbed: 'External lesson · creator-hosted' } },
  videos: [
    {
      id: 'loose-video',
      title: 'How to Identify Hanging Pieces',
      creator: 'IM Relevance Coach',
      level: 'beginner',
      focus: ['loosePieces', 'calculation'],
      tags: ['hanging pieces', 'undefended pieces', 'counting attackers'],
      sourceUrl: 'https://lichess.org/video/loose-video',
      embedUrl: 'https://www.youtube-nocookie.com/embed/loose-video',
      licenseClass: 'externalEmbed',
    },
    {
      id: 'calc-video',
      title: 'Checks, Captures and Threats Method',
      creator: 'IM Calculation Coach',
      level: 'intermediate',
      focus: ['calculation'],
      tags: ['forcing moves', 'candidate moves', 'calculation'],
      sourceUrl: 'https://lichess.org/video/calc-video',
      embedUrl: 'https://www.youtube-nocookie.com/embed/calc-video',
      licenseClass: 'externalEmbed',
    },
    {
      id: 'defense-video',
      title: 'How to Recognize the Opponent Threat',
      creator: 'IM Defense Coach',
      level: 'intermediate',
      focus: ['defense'],
      tags: ['opponent threat', 'prophylaxis', 'defense'],
      sourceUrl: 'https://lichess.org/video/defense-video',
      embedUrl: 'https://www.youtube-nocookie.com/embed/defense-video',
      licenseClass: 'externalEmbed',
    },
    {
      id: 'opening-video',
      title: 'London System Plans',
      creator: 'Opening Coach',
      level: 'beginner',
      focus: ['openings'],
      tags: ['London System', 'opening plans'],
      openingKeys: ['London System'],
      sourceUrl: 'https://lichess.org/video/opening-video',
      embedUrl: 'https://www.youtube-nocookie.com/embed/opening-video',
      licenseClass: 'externalEmbed',
    },
  ],
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
  await page.route(/\/kmate-trainer\/learning\/puzzles\/loosePieces-1200-1399\.json.*/, (route) => route.fulfill(json({ version: 40, focus: 'loosePieces', band: '1200-1399', puzzles: puzzleSet('loosePieces', ['hangingPiece', 'capturingDefender']) })));
  await page.route(/\/kmate-trainer\/learning\/puzzles\/calculation-1200-1399\.json.*/, (route) => route.fulfill(json({ version: 40, focus: 'calculation', band: '1200-1399', puzzles: puzzleSet('calculation', ['fork', 'pin']) })));
  await page.route(/\/kmate-trainer\/learning\/puzzles\/defense-1200-1399\.json.*/, (route) => route.fulfill(json({ version: 40, focus: 'defense', band: '1200-1399', puzzles: puzzleSet('defense', ['defensiveMove', 'quietMove']) })));
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><title>Test lesson</title>',
  }));
}

async function prepare(page) {
  await page.addInitScript((store) => {
    localStorage.setItem('kmate-position-v7', JSON.stringify(store));
    localStorage.removeItem('kmate-learning-v40');
  }, seededStore);
  await routeChessJs(page);
  await routeLearningData(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(window.__KMATE_RELEVANCE__?.state?.().ready),
    undefined,
    { timeout: 60_000 },
  );
}

test.use({
  viewport: { width: 1280, height: 900 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('v41 explains exact source moves and lists ranked lessons before playback', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);

  const recommendation = await page.evaluate(() => window.__KMATE_RELEVANCE__.recommendation());
  expect(recommendation.version).toBe('41.0.0');
  expect(recommendation.relevance.mode).toBe('move-level');
  expect(recommendation.moveEvidence.length).toBeGreaterThanOrEqual(3);
  expect(recommendation.moveEvidence[0].moveLabel).toContain('14. a3');
  expect(recommendation.puzzlePlan).toHaveLength(5);
  expect(recommendation.puzzleSetSummary).toContain('14. a3');

  await page.locator('#wizardLearningButton').click();
  await expect(page.locator('#learningView')).toBeVisible();
  await expect(page.locator('#km41RecommendationEvidence')).toBeVisible();
  await expect(page.locator('#km41RecommendationEvidence')).toContainText('14. a3');
  await expect(page.locator('#km41RecommendationEvidence')).toContainText('21. h3');
  await expect(page.locator('#learningVideoCard .km41-lesson-row')).toHaveCount(3);
  await expect(page.locator('#learningVideoCard')).toContainText('How to Identify Hanging Pieces');
  await expect(page.locator('#learningVideoCard')).toContainText('14. a3');

  await page.locator('#learningWatchLesson').click();
  await expect(page.locator('#km41LessonChoices')).toBeVisible();
  await expect(page.locator('#km41LessonChoicesList .km41-lesson-row')).toHaveCount(4);
  await expect(page.locator('#km41LessonPlayer')).not.toBeVisible();
  await expect(page.locator('#km41LessonChoicesList')).toContainText('main reason');
  await page.locator('#km41LessonChoicesList [data-km41-watch-video="loose-video"]').click();
  await expect(page.locator('#km41LessonPlayer')).toBeVisible();
  await expect(page.locator('#km41LessonPlayerWhy')).toContainText('14. a3');
  await expect(page.locator('#km41LessonPlayerFrame')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/loose-video/);

  await page.locator('#km41LessonPlayerClose').click();
  await page.evaluate(() => document.querySelector('#resultDialog')?.showModal?.());
  await expect(page.locator('#learningResultCard')).toBeVisible();
  await expect(page.locator('#km41ResultEvidence')).toContainText('14. a3');
  await expect(page.locator('#learningResultPuzzles')).toContainText('move-matched');
  await expect(page.locator('#learningResultVideo')).toContainText('relevant lessons');
});

test('v41 puzzle practice mirrors the game board and protects the phone safe area', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--kmate-safe-top', '47px');
    document.documentElement.style.setProperty('--kmate-safe-bottom', '34px');
  });

  await page.locator('#wizardLearningButton').click();
  await page.locator('#learningStartPuzzles').click();
  await expect(page.locator('#km41PuzzleMode')).toBeVisible();
  await expect(page.locator('#learningPuzzleDialog')).not.toBeVisible();
  await expect(page.locator('#km41PuzzleBoard .sq')).toHaveCount(64);
  await expect(page.locator('#km41PuzzleMode .playerbar')).toHaveCount(2);
  await expect(page.locator('#km41PuzzleInstruction')).toContainText('to move');
  await expect(page.locator('#km41PuzzleWhyTitle')).toContainText('14. a3');

  const layout = await page.evaluate(() => {
    const mode = document.querySelector('#km41PuzzleMode').getBoundingClientRect();
    const board = document.querySelector('#km41PuzzleBoard').getBoundingClientRect();
    const instruction = getComputedStyle(document.querySelector('#km41PuzzleInstruction'));
    return {
      modeTop: mode.top,
      modeBottom: mode.bottom,
      boardTop: board.top,
      boardBottom: board.bottom,
      boardWidth: board.width,
      boardHeight: board.height,
      instructionSize: Number.parseFloat(instruction.fontSize),
      viewportHeight: window.innerHeight,
    };
  });
  expect(layout.modeTop).toBeGreaterThanOrEqual(46);
  expect(layout.modeBottom).toBeLessThanOrEqual(layout.viewportHeight - 33);
  expect(layout.boardTop).toBeGreaterThanOrEqual(layout.modeTop);
  expect(layout.boardBottom).toBeLessThanOrEqual(layout.modeBottom);
  expect(layout.boardWidth).toBeGreaterThanOrEqual(360);
  expect(Math.abs(layout.boardWidth - layout.boardHeight)).toBeLessThan(2);
  expect(layout.instructionSize).toBeLessThanOrEqual(10);

  await page.locator('#km41PuzzleBoard [data-square="e2"]').click();
  await page.locator('#km41PuzzleBoard [data-square="e4"]').click();
  await expect(page.locator('#km41PuzzleStatusText')).toContainText('Continue', { timeout: 10_000 });
  await page.locator('#km41PuzzleBoard [data-square="g1"]').click();
  await page.locator('#km41PuzzleBoard [data-square="f3"]').click();
  await expect(page.locator('#km41PuzzleStatusText')).toContainText('Solved');
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('kmate-learning-v40')));
  expect(Object.values(progress.puzzles).some((entry) => entry.sourceMove?.includes('14. a3'))).toBe(true);
});
