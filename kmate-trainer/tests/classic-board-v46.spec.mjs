import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.KMATE_APP_URL || 'http://127.0.0.1:4173/kmate-trainer/?nativeBoard=1';

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

async function prepare(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (duration) => {
        window.__kmateVibrations ||= [];
        window.__kmateVibrations.push(duration);
        return true;
      },
    });
    localStorage.setItem('kmate-position-v7', JSON.stringify({
      version: 7,
      sessions: [],
      legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
      settings: {
        phase: 'middlegame', opening: 'all', positionRating: 1400,
        opponentRating: 1400, timeControl: '3+0', side: 'w',
        sound: true, soundTheme: 'reference-crisp',
        trainingGoal: 'all', blindCalibration: false, autoHints: false,
        liveCoach: false, principleReview: false, coachVoice: false,
      },
    }));
    localStorage.setItem('kmate-svg-board-v44', JSON.stringify({
      enabled: true, theme: 'wood', coordinates: true, annotations: true,
    }));
  });
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE__?.test?.startLiveCoachPrincipleDemo
      && window.__KMATE_CLASSIC_BOARD_V46__?.state?.().ready
      && window.__KMATE_REFERENCE_THEME_V52__?.state?.().ready
      && window.__KMATE_MOVE_FEEDBACK_V48__?.state?.().ready
      && window.__KMATE_MOVE_SOUND_V45__?.state?.().ready
      && window.__KMATE_MOBILE_FULL_PAGE_V50__?.state?.().ready
    ),
    undefined,
    { timeout: 90_000 },
  );
}

test.use({
  viewport: { width: 390, height: 844 },
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
});

test('stable native board uses the uploaded-SVG textures, frame, coordinates, and detailed pieces', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page);

  const startup = await page.evaluate(() => ({
    classic: window.__KMATE_CLASSIC_BOARD_V46__.state(),
    theme: window.__KMATE_REFERENCE_THEME_V52__.state(),
    feedback: window.__KMATE_MOVE_FEEDBACK_V48__.state(),
    compatibility: window.__KMATE_MOVE_SOUND_V45__.state(),
    fullPage: window.__KMATE_MOBILE_FULL_PAGE_V50__.state(),
    storedSvg: JSON.parse(localStorage.getItem('kmate-svg-board-v44') || 'null'),
  }));
  expect(startup.classic.active).toBe(true);
  expect(startup.classic.renderer).toBe('native-staunton-grid');
  expect(startup.storedSvg.enabled).toBe(false);
  expect(startup.theme.version).toBe('52.0.0');
  expect(startup.theme.style).toBe('uploaded-svg-reference-theme');
  expect(startup.feedback.version).toBe('48.0.0');
  expect(startup.feedback.legacyLoudPlayerDisabled).toBe(true);
  expect(startup.compatibility.enabled).toBe(false);
  expect(startup.fullPage.effectiveMoveGain).toBe(0.10);

  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#board > .svg44-overlay')).toHaveCount(0);
  await expect(page.locator('#board .piece.kmate-reference-piece-v52')).toHaveCount(32, { timeout: 30_000 });

  const appearance = await page.evaluate(() => {
    const board = document.querySelector('#board');
    const wrap = document.querySelector('.live-boardwrap');
    const light = board.querySelector(':scope > .sq.light');
    const dark = board.querySelector(':scope > .sq.dark');
    const rank = board.querySelector('.coord.rank');
    const file = board.querySelector('.coord.file');
    const white = board.querySelector('.piece.kmate-reference-piece-v52.white');
    const black = board.querySelector('.piece.kmate-reference-piece-v52.black');
    const boardBox = board.getBoundingClientRect();
    const rankBox = rank.getBoundingClientRect();
    const fileBox = file.getBoundingClientRect();
    return {
      lightColor: getComputedStyle(light).backgroundColor,
      darkColor: getComputedStyle(dark).backgroundColor,
      lightImage: getComputedStyle(light).backgroundImage,
      darkImage: getComputedStyle(dark).backgroundImage,
      frameImage: getComputedStyle(wrap).backgroundImage,
      framePadding: Number.parseFloat(getComputedStyle(wrap).paddingLeft),
      frameBorder: getComputedStyle(wrap).borderTopColor,
      trimContent: getComputedStyle(wrap, '::before').content,
      boardContain: getComputedStyle(board).contain,
      rankBackground: getComputedStyle(rank).backgroundColor,
      rankRadius: getComputedStyle(rank).borderRadius,
      rankOutside: rankBox.right < boardBox.left + 2,
      fileOutside: fileBox.top > boardBox.bottom - 2,
      whiteTop: getComputedStyle(white).getPropertyValue('--km52-piece-top').trim(),
      blackBottom: getComputedStyle(black).getPropertyValue('--km52-piece-bottom').trim(),
      whitePathLength: white.querySelector('.km52-piece-shape')?.getAttribute('d')?.length || 0,
      blackPathLength: black.querySelector('.km52-piece-shape')?.getAttribute('d')?.length || 0,
    };
  });

  expect(appearance.lightColor).toBe('rgb(211, 206, 189)');
  expect(appearance.darkColor).toBe('rgb(117, 142, 114)');
  expect(appearance.lightImage).toContain('repeating-linear-gradient');
  expect(appearance.darkImage).toContain('repeating-linear-gradient');
  expect(appearance.frameImage).toContain('repeating-linear-gradient');
  // v53 reduces the frame proportion slightly on phones so the entire frame,
  // coordinate medallions, and all 64 squares stay inside the viewport.
  expect(appearance.framePadding).toBeGreaterThanOrEqual(16);
  expect(appearance.frameBorder).toBe('rgb(28, 14, 7)');
  expect(appearance.trimContent).not.toBe('none');
  expect(appearance.boardContain).not.toContain('paint');
  expect(appearance.rankBackground).toBe('rgb(213, 82, 54)');
  expect(appearance.rankRadius).toContain('50%');
  expect(appearance.rankOutside).toBe(true);
  expect(appearance.fileOutside).toBe(true);
  expect(appearance.whiteTop).toBe('#fffef9');
  expect(appearance.blackBottom).toBe('#181a19');
  expect(appearance.whitePathLength).toBeGreaterThan(400);
  expect(appearance.blackPathLength).toBeGreaterThan(400);

  const beforeMove = await page.evaluate(() => window.__KMATE_MOVE_FEEDBACK_V48__.state());
  await page.locator('#board > .sq[data-square="e2"]').click();
  await expect(page.locator('#board > .sq[data-square="e2"]')).toHaveClass(/selected/);
  await page.locator('#board > .sq[data-square="e4"]').click();
  await expect(page.locator('#board > .sq[data-square="e4"] .piece.kmate-reference-piece-v52')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('#board .piece.kmate-reference-piece-v52')).toHaveCount(32);
  await expect.poll(() => page.evaluate(() => window.__KMATE_MOVE_FEEDBACK_V48__.state().plays), { timeout: 10_000 }).toBeGreaterThan(beforeMove.plays);
  await expect.poll(() => page.evaluate(() => window.__KMATE_MOVE_FEEDBACK_V48__.state().haptics), { timeout: 10_000 }).toBeGreaterThan(beforeMove.haptics);
});
