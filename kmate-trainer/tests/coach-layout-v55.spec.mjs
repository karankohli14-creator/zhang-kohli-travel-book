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

async function prepare(page, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    window.__km55Spoken = [];
    class FakeUtterance {
      constructor(text = '') {
        this.text = text;
        this.lang = 'en-US';
        this.rate = 1;
        this.pitch = 1;
        this.volume = 1;
        this.voice = null;
      }
    }
    const synth = {
      speaking: false,
      pending: false,
      getVoices: () => [{ name: 'Test English', lang: 'en-US' }],
      resume() {},
      pause() {},
      cancel() { this.speaking = false; this.pending = false; },
      speak(utterance) {
        window.__km55Spoken.push(String(utterance?.text || ''));
        this.speaking = true;
        utterance?.onstart?.({ type: 'start' });
        setTimeout(() => {
          this.speaking = false;
          utterance?.onend?.({ type: 'end', elapsedTime: 0, charIndex: 0 });
        }, 15);
      },
    };
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    try {
      Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    } catch {}
    localStorage.setItem('kmate-position-v7', JSON.stringify({
      version: 7,
      sessions: [],
      legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
      settings: {
        phase: 'middlegame', opening: 'all', positionRating: 1400,
        opponentRating: 1400, timeControl: '3+0', side: 'w',
        sound: true, soundTheme: 'reference-crisp',
        trainingGoal: 'all', blindCalibration: false, autoHints: false,
        liveCoach: true, principleReview: false, coachVoice: true,
      },
    }));
  });
  await routeChessJs(page);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__KMATE__?.test?.startLiveCoachPrincipleDemo
      && window.__KMATE_COACH_LAYOUT_V55__?.state?.().ready
      && window.__KMATE_UNIFIED_BUTTON_SOUND_V55__?.state?.().ready
      && window.__KMATE_MOBILE_FIT_V54__?.state?.().ready
    ),
    undefined,
    { timeout: 90_000 },
  );
}

async function openDemo(page) {
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await page.evaluate(() => {
    document.querySelector('#liveCoachQualityBadge').textContent = 'Mistake';
    document.querySelector('#liveCoachYourMove').textContent = 'Re4?';
    document.querySelector('#liveCoachWhy').textContent = 'This leaves the rook undefended and allows an immediate capture.';
    document.querySelector('#liveCoachBestMove').textContent = 'Nf6';
    document.querySelector('#liveCoachBestText').textContent = 'The stronger move protects the rook, improves coordination, and keeps the king safe.';
    document.querySelector('#liveCoachPrincipleList').innerHTML = '<article class="principle-diagnosis-card"><b>Loose pieces drop off</b></article>';
    const panel = document.querySelector('#liveCoachBoardPanel');
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    document.querySelector('#gameView').classList.add('live-coach-active');
    document.querySelector('#boardCoachStage').classList.add('coach-open');
    window.__KMATE_COACH_LAYOUT_V55__.refresh();
  });
  await expect(page.locator('#km55WhyCard')).toBeVisible();
  await expect(page.locator('#km55BestCard')).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_MOBILE_FIT_V54__.state().metrics?.rendered?.contained),
    { timeout: 15_000 },
  ).toBe(true);
}

async function closeCoachAndOpenHint(page, candidate = true) {
  await page.evaluate(({ candidate }) => {
    const panel = document.querySelector('#liveCoachBoardPanel');
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    document.querySelector('#gameView').classList.remove('live-coach-active');
    document.querySelector('#boardCoachStage').classList.remove('coach-open');
    const card = document.querySelector('#hintCard');
    card.hidden = false;
    card.setAttribute('aria-hidden', 'false');
    document.body.classList.add('km50-hint-open');
    const bulb = document.querySelector('#kmateHintEdgeButton');
    bulb.hidden = false;
    bulb.setAttribute('aria-expanded', 'true');
    document.querySelector('#hintTitle').textContent = candidate ? 'Candidate revealed' : 'Strategic hint';
    document.querySelector('#hintText').textContent = candidate
      ? 'Candidate: e4 (e2→e4). Claim central space while keeping the position coordinated.'
      : 'Improve the least active piece before starting a direct attack.';
    document.querySelector('#showHintButton').textContent = candidate ? 'Candidate shown' : 'Reveal candidate';
    window.__KMATE_COACH_LAYOUT_V55__.refresh();
  }, { candidate });
  await expect(page.locator('#km55HintCard')).toBeVisible();
}

test('every non-board button uses one Generate-and-start tap, including ordinary and green controls', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'km55SoundFixture';
    fixture.innerHTML = `
      <button id="km55GreenFixture" class="btn primary" type="button">Start training</button>
      <button id="km55ContinueFixture" class="btn primary" type="button">Continue</button>
      <button id="km55BackFixture" class="roundbtn" type="button">←</button>`;
    document.body.append(fixture);
  });

  const before = await page.evaluate(() => ({
    unified: window.__KMATE_UNIFIED_BUTTON_SOUND_V55__.state(),
    legacy: window.__KMATE_GAME_UX_V48__?.state?.().softButtonTaps || 0,
  }));
  await page.locator('#km55GreenFixture').click();
  await page.locator('#km55ContinueFixture').click();
  await page.locator('#km55BackFixture').click();
  const after = await page.evaluate(() => ({
    unified: window.__KMATE_UNIFIED_BUTTON_SOUND_V55__.state(),
    legacy: window.__KMATE_GAME_UX_V48__?.state?.().softButtonTaps || 0,
  }));

  expect(after.unified.signature).toBe('generate-and-start-position');
  expect(after.unified.taps - before.unified.taps).toBe(3);
  expect(after.unified.suppressedLegacyTaps - before.unified.suppressedLegacyTaps).toBe(3);
  expect(after.legacy).toBe(before.legacy);
});

test('desktop coaching and hints sit beside the board rather than covering it', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page, { width: 1280, height: 820 });
  await openDemo(page);

  const coach = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    return {
      board: rect('.live-boardwrap'),
      why: rect('#km55WhyCard'),
      best: rect('#km55BestCard'),
      originalCoach: getComputedStyle(document.querySelector('#liveCoachBoardPanel')).display,
    };
  });
  expect(coach.why.right).toBeLessThan(coach.board.left);
  expect(coach.best.left).toBeGreaterThan(coach.board.right);
  expect(coach.originalCoach).toBe('none');

  await closeCoachAndOpenHint(page, true);
  const hint = await page.evaluate(() => {
    const board = document.querySelector('.live-boardwrap').getBoundingClientRect();
    const card = document.querySelector('#km55HintCard').getBoundingClientRect();
    return {
      boardLeft: board.left,
      cardRight: card.right,
      originalHint: getComputedStyle(document.querySelector('#hintCard')).display,
    };
  });
  expect(hint.cardRight).toBeLessThan(hint.boardLeft);
  expect(hint.originalHint).toBe('none');
  await expect(page.locator('#board > .km55-candidate-arrow line')).toHaveCount(1);
  await expect(page.locator('#board > .sq[data-square="e2"]')).toHaveClass(/km55-candidate-from/);
  await expect(page.locator('#board > .sq[data-square="e4"]')).toHaveClass(/km55-candidate-to/);
});

test('phone coaching uses top and bottom rails and shrinks the board only while text is shown', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page, { width: 390, height: 844 });
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  const normalBoard = await page.locator('.live-boardwrap').boundingBox();

  await page.evaluate(() => {
    document.querySelector('#liveCoachQualityBadge').textContent = 'Inaccuracy';
    document.querySelector('#liveCoachYourMove').textContent = 'Re4?!';
    document.querySelector('#liveCoachWhy').textContent = 'The rook becomes loose and the move gives your opponent a forcing tempo.';
    document.querySelector('#liveCoachBestMove').textContent = 'Nf6';
    document.querySelector('#liveCoachBestText').textContent = 'The stronger move protects the rook and completes development before taking action.';
    document.querySelector('#liveCoachPrincipleList').innerHTML = '<article class="principle-diagnosis-card"><b>Improve the least active piece</b></article>';
    const panel = document.querySelector('#liveCoachBoardPanel');
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    document.querySelector('#gameView').classList.add('live-coach-active');
    document.querySelector('#boardCoachStage').classList.add('coach-open');
    window.__KMATE_COACH_LAYOUT_V55__.refresh();
  });
  await expect(page.locator('#km55WhyCard')).toBeVisible();
  await expect(page.locator('#km55BestCard')).toBeVisible();

  const active = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const board = box('.live-boardwrap');
    const why = box('#km55WhyCard');
    const best = box('#km55BestCard');
    const topClock = box('#engineBar');
    const bottomClock = box('#userBar');
    return {
      board: { top: board.top, bottom: board.bottom, width: board.width },
      why: { top: why.top, bottom: why.bottom },
      best: { top: best.top, bottom: best.bottom },
      topClockBottom: topClock.bottom,
      bottomClockTop: bottomClock.top,
    };
  });
  expect(active.why.top).toBeGreaterThanOrEqual(active.topClockBottom - 1);
  expect(active.why.bottom).toBeLessThanOrEqual(active.board.top + 1);
  expect(active.best.top).toBeGreaterThanOrEqual(active.board.bottom - 1);
  expect(active.best.bottom).toBeLessThanOrEqual(active.bottomClockTop + 1);
  expect(active.board.width).toBeLessThan(normalBoard.width);
  expect(active.board.width).toBeGreaterThan(220);

  await closeCoachAndOpenHint(page, true);
  const hint = await page.evaluate(() => {
    const board = document.querySelector('.live-boardwrap').getBoundingClientRect();
    const card = document.querySelector('#km55HintCard').getBoundingClientRect();
    return { cardBottom: card.bottom, boardTop: board.top };
  });
  expect(hint.cardBottom).toBeLessThanOrEqual(hint.boardTop + 1);
  await expect(page.locator('#board > .km55-candidate-arrow line')).toHaveCount(1);
});

test('coach voice recites why the move was bad and how the stronger move helps only when enabled', async ({ page }) => {
  test.setTimeout(150_000);
  await prepare(page, { width: 390, height: 844 });
  await openDemo(page);

  const before = await page.evaluate(() => window.__KMATE_COACH_LAYOUT_V55__.state().voiceStarts);
  await page.evaluate(() => window.__KMATE_COACH_LAYOUT_V55__.speak());
  await expect.poll(
    () => page.evaluate(() => window.__KMATE_COACH_LAYOUT_V55__.state().voiceStarts),
    { timeout: 10_000 },
  ).toBeGreaterThan(before);
  const spoken = await page.evaluate(() => window.__km55Spoken.at(-1) || '');
  expect(spoken).toContain('Why your move was bad:');
  expect(spoken).toContain('How the stronger move improves your position:');
  expect(spoken).toContain('rook undefended');
  expect(spoken).toContain('protects the rook');

  await page.locator('#km55VoiceToggle').click();
  await expect(page.locator('#km55VoiceToggle')).toHaveAttribute('aria-pressed', 'false');
  const disabledBefore = await page.evaluate(() => window.__KMATE_COACH_LAYOUT_V55__.state().voiceStarts);
  await page.evaluate(() => window.__KMATE_COACH_LAYOUT_V55__.speak());
  await page.waitForTimeout(120);
  const disabledAfter = await page.evaluate(() => window.__KMATE_COACH_LAYOUT_V55__.state().voiceStarts);
  expect(disabledAfter).toBe(disabledBefore);
});

test('K-Mate home exists in play and dialogs, and top symbols are centered', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page, { width: 390, height: 844 });
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#km55HomeButton')).toBeVisible();
  await expect(page.locator('#km55HomeButton')).toHaveClass(/km55-in-playtop/);

  const centered = await page.evaluate(() => {
    const checks = ['#km55HomeButton', '#gameCoachAudioButton', '#panelToggleButton', '#fullscreenButton', '#flipButton'];
    return checks.map((selector) => {
      const button = document.querySelector(selector);
      const child = button.querySelector('span') || button;
      const b = button.getBoundingClientRect();
      const c = child.getBoundingClientRect();
      return {
        selector,
        dx: Math.abs((b.left + b.width / 2) - (c.left + c.width / 2)),
        dy: Math.abs((b.top + b.height / 2) - (c.top + c.height / 2)),
      };
    });
  });
  for (const item of centered) {
    expect(item.dx, `${item.selector} horizontal center`).toBeLessThan(2.1);
    expect(item.dy, `${item.selector} vertical center`).toBeLessThan(2.1);
  }

  await page.evaluate(() => {
    const dialog = document.querySelector('dialog');
    if (dialog) dialog.showModal();
  });
  await expect(page.locator('dialog[open] .km55-dialog-home')).toBeVisible();
});
