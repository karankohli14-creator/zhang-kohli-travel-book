import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
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
    trainingGoal: 'attack',
    blindCalibration: false,
    autoHints: false,
    liveCoach: true,
    principleReview: true,
    coachVoice: false,
  },
  legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
  sessions: [{
    id: 'v42-custom-session',
    startedAt: '2026-09-10T20:00:00.000Z',
    endedAt: '2026-09-10T20:09:00.000Z',
    positionId: 'custom-v42',
    seedPositionId: 'custom-v42',
    title: 'Chess.com · Kmate_00 vs PersonalizationTest',
    opening: 'London System',
    theme: 'Move and setup personalization',
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
    timeUsedPct: 0.18,
    avgCpLoss: 220,
    positionPrinciples: [
      { key: 'king-safety', title: 'King safety before ambition', sessionPrompt: 'Track forcing lines around both kings.', why: 'You chose Attack the king in a middlegame.' },
      { key: 'pawn-breaks', title: 'Prepare pawn breaks', sessionPrompt: 'Calculate the files opened by every pawn break.', why: 'The attacking goal emphasizes pawn breaks.' },
    ],
    userMoves: [
      {
        id: 'v42-loose', san: 'a3?', uci: 'a2a3', from: 'a2', to: 'a3', fenBefore: FEN_14,
        spentMs: 2500, cpLoss: 260, bestMove: 'e2e4', quality: 'blunder',
        principleDiagnoses: [{ key: 'loose-pieces', title: 'Loose pieces', confidence: 'high', evidence: 'An undefended tactical target needed attention.' }],
        ignoredPrinciples: ['loose-pieces'],
      },
      {
        id: 'v42-calc', san: 'h3?', uci: 'h2h3', from: 'h2', to: 'h3', fenBefore: FEN_21,
        spentMs: 1900, cpLoss: 180, bestMove: 'e2e4', quality: 'mistake',
        principleDiagnoses: [{ key: 'forcing-scan', title: 'Forcing move scan', confidence: 'high', evidence: 'Checks, captures, and threats were not compared.' }],
        ignoredPrinciples: ['candidate-comparison'],
      },
      {
        id: 'v42-defense', san: 'a6?', uci: 'a7a6', from: 'a7', to: 'a6', fenBefore: FEN_27,
        spentMs: 6200, cpLoss: 125, bestMove: 'g8f6', quality: 'mistake',
        principleDiagnoses: [{ key: 'opponent-threat', title: 'Opponent threat', confidence: 'medium', evidence: 'The opponent’s most urgent idea was not addressed.' }],
        ignoredPrinciples: ['opponent-threat'],
      },
    ],
  }],
};

const focuses = ['loosePieces', 'calculation', 'kingSafety', 'defense', 'positionalPlay', 'pawnPlay', 'endgames', 'openings'];

function puzzlesFor(focus) {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `${focus}-v42-${index + 1}`,
    practiceFen: START_FEN,
    solutionUci: ['e2e4', 'e7e5', 'g1f3'],
    opponentMove: 'a7a6',
    rating: 1280 + index * 10,
    ratingDeviation: 45,
    popularity: 98 - index,
    plays: 8000 - index * 100,
    themes: focus === 'loosePieces'
      ? ['hangingPiece', 'capturingDefender', 'middlegame']
      : focus === 'kingSafety'
        ? ['kingsideAttack', 'mate', 'middlegame']
        : focus === 'defense'
          ? ['defensiveMove', 'quietMove', 'middlegame']
          : ['fork', 'pin', 'middlegame'],
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
  focuses: Object.fromEntries(focuses.map((focus) => [focus, { label: focus }])),
  bands: [
    { key: '1000-1199', minRating: 1000, maxRating: 1199 },
    { key: '1200-1399', minRating: 1200, maxRating: 1399 },
    { key: '1400-1599', minRating: 1400, maxRating: 1599 },
  ],
  shards: focuses.map((focus) => ({
    focus,
    band: '1200-1399',
    minRating: 1200,
    maxRating: 1399,
    count: 8,
    file: `${focus}-1200-1399.json`,
  })),
};

const videoCatalog = {
  version: 40,
  contentPolicy: { labels: { externalEmbed: 'External lesson · creator-hosted' } },
  videos: [
    { id: 'loose-v42', title: 'Identify Hanging and Unprotected Pieces', creator: 'Loose Piece Coach', level: 'beginner', focus: ['loosePieces'], tags: ['hanging pieces', 'undefended pieces', 'counting attackers'], sourceUrl: 'https://lichess.org/video/loose-v42', embedUrl: 'https://www.youtube-nocookie.com/embed/loose-v42', licenseClass: 'externalEmbed' },
    { id: 'calc-v42', title: 'Checks, Captures and Threats', creator: 'Calculation Coach', level: 'intermediate', focus: ['calculation'], tags: ['forcing moves', 'candidate moves', 'calculation', 'visualization'], sourceUrl: 'https://lichess.org/video/calc-v42', embedUrl: 'https://www.youtube-nocookie.com/embed/calc-v42', licenseClass: 'externalEmbed' },
    { id: 'defense-v42', title: 'Recognize the Opponent Threat', creator: 'Defense Coach', level: 'intermediate', focus: ['defense'], tags: ['opponent threat', 'prophylaxis', 'active defense'], sourceUrl: 'https://lichess.org/video/defense-v42', embedUrl: 'https://www.youtube-nocookie.com/embed/defense-v42', licenseClass: 'externalEmbed' },
    { id: 'attack-v42', title: 'Build a Kingside Attack', creator: 'Attack Coach', level: 'intermediate', focus: ['kingSafety'], tags: ['king attack', 'mating patterns', 'pawn breaks'], sourceUrl: 'https://lichess.org/video/attack-v42', embedUrl: 'https://www.youtube-nocookie.com/embed/attack-v42', licenseClass: 'externalEmbed' },
    { id: 'london-v42', title: 'London System Plans', creator: 'Opening Coach', level: 'beginner', focus: ['openings', 'positionalPlay'], tags: ['London System', 'opening plans'], openingKeys: ['London System'], sourceUrl: 'https://lichess.org/video/london-v42', embedUrl: 'https://www.youtube-nocookie.com/embed/london-v42', licenseClass: 'externalEmbed' },
    { id: 'activity-v42', title: 'Improve the Worst Piece', creator: 'Strategy Coach', level: 'improver', focus: ['positionalPlay'], tags: ['piece activity', 'coordination', 'planning'], sourceUrl: 'https://lichess.org/video/activity-v42', embedUrl: 'https://www.youtube-nocookie.com/embed/activity-v42', licenseClass: 'externalEmbed' },
    { id: 'structure-v42', title: 'Pawn Structures and Breaks', creator: 'Pawn Coach', level: 'intermediate', focus: ['pawnPlay'], tags: ['pawn structure', 'pawn breaks', 'isolated pawn'], sourceUrl: 'https://lichess.org/video/structure-v42', embedUrl: 'https://www.youtube-nocookie.com/embed/structure-v42', licenseClass: 'externalEmbed' },
    { id: 'endgame-v42', title: 'Convert the Endgame Advantage', creator: 'Endgame Coach', level: 'intermediate', focus: ['endgames'], tags: ['conversion', 'rook endgame', 'pawn endgame'], sourceUrl: 'https://lichess.org/video/endgame-v42', embedUrl: 'https://www.youtube-nocookie.com/embed/endgame-v42', licenseClass: 'externalEmbed' },
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
  await page.route(/\/kmate-trainer\/learning\/puzzles\/([A-Za-z]+)-1200-1399\.json.*/, (route) => {
    const match = route.request().url().match(/\/([A-Za-z]+)-1200-1399\.json/);
    const focus = match?.[1] || 'calculation';
    return route.fulfill(json({ version: 40, focus, band: '1200-1399', puzzles: puzzlesFor(focus) }));
  });
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><title>K-Mate custom lesson test</title>',
  }));
}

async function prepare(page) {
  await page.addInitScript((store) => {
    localStorage.setItem('kmate-position-v7', JSON.stringify(store));
    localStorage.removeItem('kmate-learning-v40');
    localStorage.removeItem('kmate-personalization-v42');
  }, seededStore);
  await routeChessJs(page);
  await routeLearningData(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(window.__KMATE_V42__?.state?.().ready && window.__KMATE_PERSONALIZATION__),
    undefined,
    { timeout: 60_000 },
  );
}

test.use({
  viewport: { width: 1280, height: 900 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('pregame principles visibly change with goal, phase, clock, side, and challenge', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);

  const attack = await page.evaluate(() => window.__KMATE_PERSONALIZATION__.preview());
  expect(attack.context.goalKey).toBe('attack');
  expect(attack.principles.map((item) => item.key)).toContain('king-safety');
  expect(attack.principles.every((item) => item.why && item.sessionPrompt)).toBe(true);

  await page.locator('#goalSelect').selectOption('convert');
  await page.locator('[data-phase="endgame"]').click();
  await page.locator('[data-time="10+0"]').click();
  await page.locator('[data-side="b"]').click();
  await page.waitForTimeout(150);
  const conversion = await page.evaluate(() => window.__KMATE_PERSONALIZATION__.preview());
  expect(conversion.context.goalKey).toBe('convert');
  expect(conversion.context.phase).toBe('endgame');
  expect(conversion.principles.map((item) => item.key)).toContain('conversion');
  expect(conversion.principles.map((item) => item.key)).toContain('king-activity');
  expect(conversion.principles.map((item) => item.key)).not.toEqual(attack.principles.map((item) => item.key));

  await page.locator('#goalSelect').selectOption('tactics');
  await page.locator('[data-phase="middlegame"]').click();
  await page.locator('[data-time="1+0"]').click();
  await page.locator('[data-side="w"]').click();
  await page.waitForTimeout(150);
  const tactics = await page.evaluate(() => window.__KMATE_PERSONALIZATION__.preview());
  expect(tactics.principles.map((item) => item.key)).toContain('forcing-scan');
  expect(tactics.principles.map((item) => item.key)).toContain('loose-pieces');
  expect(tactics.principles.map((item) => item.key)).not.toEqual(conversion.principles.map((item) => item.key));

  await expect(page.locator('#km42SetupBlueprint')).toContainText('Calculation');
  await page.evaluate(() => window.__KMATE__.showSetupPage?.('coaching'));
  await expect(page.locator('#km42CoachingBlueprint')).toBeVisible();
  await expect(page.locator('#km42CoachingBlueprint')).toContainText('Checks, captures, and threats first');

  const recommendation = await page.evaluate(() => window.__KMATE_V42__.recommendation());
  expect(recommendation.version).toBe('42.0.0');
  expect(recommendation.customization.mode).toBe('gameplay-plus-intent');
  expect(recommendation.optionEvidence.some((item) => item.value === 'Attack the king')).toBe(true);
  expect(recommendation.puzzlePlan).toHaveLength(5);
  expect(recommendation.puzzlePlan.some((slot) => slot.sourceType === 'session-intent')).toBe(true);
  expect(recommendation.puzzlePlan.some((slot) => slot.sourceType === 'move-evidence')).toBe(true);
});

test('instructional lessons cover separate mistakes and the chosen setup before playback', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await page.locator('#wizardLearningButton').click();
  await expect(page.locator('#learningView')).toBeVisible();
  await expect(page.locator('#km42LearningBlueprint')).toContainText('Gameplay first');
  await expect(page.locator('#km42LearningBlueprint')).toContainText('Attack the king');
  await expect(page.locator('#learningVideoCard .km42-lesson-row')).toHaveCount(3);

  await page.locator('#learningWatchLesson').click();
  await expect(page.locator('#km42LessonDialog')).toBeVisible();
  await expect(page.locator('#km42LessonList .km42-lesson-row')).toHaveCount(5);
  const titles = await page.locator('#km42LessonList .km42-lesson-row b').allTextContents();
  expect(new Set(titles).size).toBe(5);
  const lessonText = await page.locator('#km42LessonList').textContent();
  expect(lessonText).toContain('14. a3');
  expect(lessonText).toContain('21. h3');
  expect(lessonText).toContain('Attack');
  await expect(page.locator('#km42VideoDialog')).not.toBeVisible();

  await page.locator('#km42LessonList [data-km42-watch-video]').first().click();
  await expect(page.locator('#km42VideoDialog')).toBeVisible();
  await expect(page.locator('#km42VideoWhy')).toContainText(/14\. a3|21\. h3|27\.\.\. a6|Attack/i);
  await expect(page.locator('#km42VideoFrame')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\//);

  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('kmate-personalization-v42')));
  expect(meta.lessonExposures).toHaveLength(1);
  expect(new Set(meta.lessonExposures[0].videoIds).size).toBe(5);
});

test('phone puzzle board supports tap and true pointer dragging inside safe areas', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--kmate-safe-top', '47px');
    document.documentElement.style.setProperty('--kmate-safe-bottom', '34px');
  });

  await page.locator('#wizardLearningButton').click();
  await page.locator('#learningStartPuzzles').click();
  await expect(page.locator('#km42PuzzleMode')).toBeVisible();
  await expect(page.locator('#km41PuzzleMode')).not.toBeVisible();
  await expect(page.locator('#learningPuzzleDialog')).not.toBeVisible();
  await expect(page.locator('#km42PuzzleBoard .sq')).toHaveCount(64);
  await expect(page.locator('#km42PuzzleMode .playerbar')).toHaveCount(2);
  await expect(page.locator('#km42PuzzleBoard .vector-piece').first()).toBeVisible();
  await expect(page.locator('.km42-why')).not.toHaveAttribute('open', '');

  const layout = await page.evaluate(() => {
    const mode = document.querySelector('#km42PuzzleMode').getBoundingClientRect();
    const board = document.querySelector('#km42PuzzleBoard').getBoundingClientRect();
    return { mode, board, height: innerHeight };
  });
  expect(layout.mode.top).toBeGreaterThanOrEqual(46);
  expect(layout.mode.bottom).toBeLessThanOrEqual(layout.height - 33);
  expect(layout.board.width).toBeGreaterThanOrEqual(360);
  expect(Math.abs(layout.board.width - layout.board.height)).toBeLessThan(2);

  await page.locator('[data-km42-square="e2"]').click();
  await expect(page.locator('[data-km42-square="e2"]')).toHaveClass(/selected/);
  await expect(page.locator('[data-km42-square="e4"]')).toHaveClass(/legal/);
  await page.locator('[data-km42-square="e4"]').click();
  await expect(page.locator('#km42PuzzleStatusText')).toContainText('Continue', { timeout: 10_000 });

  const from = await page.locator('[data-km42-square="g1"]').boundingBox();
  const to = await page.locator('[data-km42-square="f3"]').boundingBox();
  if (!from || !to) throw new Error('Drag squares were not visible.');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2 + from.width / 2, (from.y + to.y) / 2 + from.height / 2, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await expect(page.locator('.km42-drag-ghost')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('#km42PuzzleStatusText')).toContainText('Solved', { timeout: 10_000 });

  const state = await page.evaluate(() => window.__KMATE_V42__.state());
  expect(state.puzzle.tapEnabled).toBe(true);
  expect(state.puzzle.dragEnabled).toBe(true);
  expect(state.puzzle.expectedMove).toBeNull();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('kmate-learning-v40')));
  expect(Object.values(progress.puzzles).some((entry) => entry.customizationFingerprint)).toBe(true);
});
