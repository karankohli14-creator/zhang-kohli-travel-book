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
    window.__kmateSpoken = [];
    window.__kmateVibrations = [];
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
      paused: false,
      getVoices: () => [],
      resume() {},
      pause() {},
      cancel() { this.speaking = false; this.pending = false; },
      speak(utterance) {
        window.__kmateSpoken.push(String(utterance?.text || ''));
        this.speaking = true;
        utterance?.onstart?.({ type: 'start' });
        setTimeout(() => {
          this.speaking = false;
          utterance?.onend?.({ type: 'end', elapsedTime: 0, charIndex: 0 });
        }, 0);
      },
    };
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (duration) => { window.__kmateVibrations.push(duration); return true; },
    });
    localStorage.setItem('kmate-position-v7', JSON.stringify({
      version: 7,
      sessions: [],
      legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
      settings: {
        phase: 'endgame', opening: 'all', positionRating: 1400,
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
      && window.__KMATE_GAME_UX_V48__?.state?.().ready
      && window.__KMATE_MOVE_FEEDBACK_V48__?.state?.().ready
      && window.__KMATE_SCULPTED_PIECES_V47__?.state?.().ready
      && window.__KMATE_COACH_LAYOUT_V55__?.state?.().ready
      && window.__KMATE_UNIFIED_BUTTON_SOUND_V55__?.state?.().ready
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

test('mobile play prioritizes the board, uses one unified control sound, and exposes hints above the board', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#kmateHintEdgeButton')).toBeVisible();

  const layout = await page.evaluate(() => {
    const titleBlock = document.querySelector('.playtop .left > div');
    const board = document.querySelector('#board').getBoundingClientRect();
    const menu = document.querySelector('#panelToggleButton');
    const fullscreen = document.querySelector('#fullscreenButton');
    const back = document.querySelector('#backButton');
    return {
      titleDisplay: getComputedStyle(titleBlock).display,
      boardWidth: board.width,
      boardHeight: board.height,
      menuShadow: getComputedStyle(menu).boxShadow,
      fullscreenShadow: getComputedStyle(fullscreen).boxShadow,
      fullscreenWidth: fullscreen.getBoundingClientRect().width,
      backBackground: getComputedStyle(back).backgroundImage,
      coachAudioDisplay: getComputedStyle(document.querySelector('#gameCoachAudioButton')).display,
    };
  });
  expect(layout.titleDisplay).toBe('none');
  expect(layout.coachAudioDisplay).toBe('grid');
  expect(layout.boardWidth).toBeGreaterThanOrEqual(330);
  expect(Math.abs(layout.boardWidth - layout.boardHeight)).toBeLessThan(2);
  expect(layout.menuShadow).not.toBe('none');
  expect(layout.fullscreenShadow).not.toBe('none');
  expect(layout.fullscreenWidth).toBeGreaterThan(layout.boardWidth / 10);
  expect(layout.backBackground).not.toBe('none');

  const beforeTap = await page.evaluate(() => ({
    ux: window.__KMATE_GAME_UX_V48__.state(),
    move: window.__KMATE_MOVE_FEEDBACK_V48__.state(),
    unified: window.__KMATE_UNIFIED_BUTTON_SOUND_V55__.state(),
  }));
  await page.locator('#kmateHintEdgeButton').click();
  await expect(page.locator('#hintCard')).toBeHidden();
  await expect(page.locator('#km55HintCard')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('#kmateHintEdgeButton')).toHaveAttribute('aria-expanded', 'true');
  const afterTap = await page.evaluate(() => ({
    ux: window.__KMATE_GAME_UX_V48__.state(),
    move: window.__KMATE_MOVE_FEEDBACK_V48__.state(),
    unified: window.__KMATE_UNIFIED_BUTTON_SOUND_V55__.state(),
  }));
  expect(afterTap.unified.taps).toBeGreaterThan(beforeTap.unified.taps);
  expect(afterTap.ux.softButtonTaps).toBe(beforeTap.ux.softButtonTaps);
  expect(afterTap.move.plays).toBe(beforeTap.move.plays);

  const hintPlacement = await page.evaluate(() => {
    const hint = document.querySelector('#km55HintCard').getBoundingClientRect();
    const board = document.querySelector('.live-boardwrap').getBoundingClientRect();
    return { hintBottom: hint.bottom, boardTop: board.top };
  });
  expect(hintPlacement.hintBottom).toBeLessThanOrEqual(hintPlacement.boardTop + 1);

  await page.evaluate(() => window.speechSynthesis.speak(new SpeechSynthesisUtterance('Coach voice ready.')));
  await page.waitForTimeout(30);
  const voiceStartup = await page.evaluate(() => ({
    spoken: window.__kmateSpoken,
    ux: window.__KMATE_GAME_UX_V48__.state(),
    v49: window.__KMATE_BOARD_FOCUS_V49__?.state?.() || null,
    v50: window.__KMATE_MOBILE_FULL_PAGE_V50__?.state?.() || null,
  }));
  expect(voiceStartup.spoken.some((text) => /^coach voice ready/i.test(text))).toBe(false);
  expect(
    (voiceStartup.ux.suppressedReadyPrompts || 0)
    + (voiceStartup.v49?.suppressedReadyPrompts || 0)
    + (voiceStartup.v50?.suppressedReadyPrompts || 0),
  ).toBeGreaterThan(0);
});

test('paused coaching keeps concise why and best-move cards outside the board', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });

  await page.evaluate(() => {
    document.querySelector('#liveCoachWhy').textContent = 'This move leaves your rook undefended and allows an immediate capture. Concrete line: Rxe4 Nxe4 Qxd4.';
    document.querySelector('#liveCoachBestText').textContent = 'The stronger move protects the rook, improves coordination, and keeps your king safe. The engine continuation is Nf6 Re1 O-O.';
    document.querySelector('#liveCoachYourMove').textContent = 'Re4?';
    document.querySelector('#liveCoachBestMove').textContent = 'Nf6';
    document.querySelector('#liveCoachPrincipleList').innerHTML = `
      <article class="principle-diagnosis-card">
        <b>Loose pieces drop off</b>
        <span class="principle-diagnosis-evidence">Your rook was left without enough protection.</span>
      </article>`;
    const panel = document.querySelector('#liveCoachBoardPanel');
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    document.querySelector('#gameView').classList.add('live-coach-active');
    document.querySelector('#boardCoachStage').classList.add('coach-open');
    window.__KMATE_GAME_UX_V48__.refresh();
    window.__KMATE_COACH_LAYOUT_V55__.refresh();
  });

  await expect(page.locator('#km55WhyCard')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#km55BestCard')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#km55Principle')).toContainText('Loose pieces drop off');
  await expect(page.locator('#km55WhyText')).not.toContainText('Concrete line');
  await expect(page.locator('#km55BestText')).not.toContainText('engine continuation');

  const compact = await page.evaluate(() => {
    const board = document.querySelector('.live-boardwrap').getBoundingClientRect();
    const why = document.querySelector('#km55WhyCard').getBoundingClientRect();
    const best = document.querySelector('#km55BestCard').getBoundingClientRect();
    return {
      boardWidth: board.width,
      boardHeight: board.height,
      whyBottom: why.bottom,
      boardTop: board.top,
      bestTop: best.top,
      boardBottom: board.bottom,
      originalPanelDisplay: getComputedStyle(document.querySelector('#liveCoachBoardPanel')).display,
    };
  });
  expect(compact.boardWidth).toBeGreaterThanOrEqual(220);
  expect(Math.abs(compact.boardWidth - compact.boardHeight)).toBeLessThan(2);
  expect(compact.whyBottom).toBeLessThanOrEqual(compact.boardTop + 1);
  expect(compact.bestTop).toBeGreaterThanOrEqual(compact.boardBottom - 1);
  expect(compact.originalPanelDisplay).toBe('none');

  await page.evaluate(() => {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance('Mistake. Mistake. Here is a long move sequence.'));
  });
  await page.waitForTimeout(40);
  const narration = await page.evaluate(() => ({
    spoken: window.__kmateSpoken.at(-1),
    data: window.__KMATE_GAME_UX_V48__.coachNarration(),
  }));
  expect(narration.spoken).toContain('Why your move was bad:');
  expect(narration.spoken).toContain('Principle violated:');
  expect(narration.spoken).toContain('How the stronger move improves your position:');
  expect(narration.spoken).not.toMatch(/mistake|blunder/i);
  expect(narration.spoken).not.toMatch(/Rxe4|Qxd4|Re1|O-O/);
  expect(narration.data.principle).toContain('Loose pieces drop off');
});
