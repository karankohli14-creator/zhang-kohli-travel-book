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
    window.__kmateFullscreenRequests = 0;

    class FakeUtterance {
      constructor(text = '') {
        this.text = text;
        this.lang = 'en-GB';
        this.rate = 1;
        this.pitch = 1;
        this.volume = 1;
        this.voice = null;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
      }
    }
    class FakeSpeechSynthesis {
      constructor() {
        this.speaking = false;
        this.pending = false;
        this.paused = false;
      }
      getVoices() { return [{ name: 'Test British Voice', lang: 'en-GB', voiceURI: 'test-en-gb' }]; }
      resume() { this.paused = false; }
      pause() { this.paused = true; }
      cancel() { this.speaking = false; this.pending = false; }
      speak(utterance) {
        window.__kmateSpoken.push(String(utterance?.text || ''));
        this.speaking = true;
        utterance?.onstart?.({ type: 'start' });
        window.setTimeout(() => {
          this.speaking = false;
          utterance?.onend?.({ type: 'end', elapsedTime: 0, charIndex: 0 });
        }, 0);
      }
    }

    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: new FakeSpeechSynthesis() });
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value() {
        window.__kmateFullscreenRequests += 1;
        return Promise.reject(new Error('Native fullscreen intentionally unavailable in this fixture'));
      },
    });
    Object.defineProperty(Document.prototype, 'exitFullscreen', {
      configurable: true,
      value() { return Promise.resolve(); },
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
      && window.__KMATE_BOARD_FOCUS_V49__?.state?.().ready
      && window.__KMATE_FULL_PAGE_V50__?.state?.().ready
      && window.__KMATE_MOVE_FEEDBACK_V48__?.state?.().ready
      && window.__KMATE_SCULPTED_PIECES_V47__?.state?.().ready
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

test('phone play remains full-page while v49 focus controls and the v50 hint overlay coexist', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });
  await expect(page.locator('#km50HintBulb')).toBeVisible();
  await expect(page.locator('#kmateHintEdgeButton')).not.toBeVisible();

  const initial = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    const view = document.querySelector('#gameView').getBoundingClientRect();
    const titleWrapper = document.querySelector('#positionTitle').parentElement;
    return {
      title: getComputedStyle(titleWrapper).display,
      titleHidden: titleWrapper.hidden,
      meta: getComputedStyle(document.querySelector('#gameMeta')).display,
      hint: getComputedStyle(document.querySelector('#hintCard')).display,
      boardWidth: board.width,
      boardHeight: board.height,
      viewWidth: view.width,
      viewHeight: view.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      coachAudio: getComputedStyle(document.querySelector('#gameCoachAudioButton')).display,
      focusState: window.__KMATE_BOARD_FOCUS_V49__.state(),
      fullPageState: window.__KMATE_FULL_PAGE_V50__.state(),
    };
  });
  expect(initial.titleHidden || initial.title === 'none').toBe(true);
  expect(initial.meta).toBe('none');
  expect(initial.hint).toBe('none');
  expect(initial.boardWidth).toBeGreaterThanOrEqual(380);
  expect(Math.abs(initial.boardWidth - initial.boardHeight)).toBeLessThan(2);
  expect(initial.viewWidth).toBeGreaterThanOrEqual(initial.viewportWidth - 1);
  expect(initial.viewHeight).toBeGreaterThanOrEqual(initial.viewportHeight - 1);
  expect(initial.coachAudio).toBe('grid');
  expect(initial.focusState.compact).toBe(true);
  expect(initial.fullPageState.gameMode).toBe(true);

  const boardBeforeHint = await page.locator('#board').boundingBox();
  await page.locator('#km50HintBulb').click();
  await expect(page.locator('#km50HintOverlay')).toBeVisible();
  await expect(page.locator('#hintCard')).toBeVisible();
  await expect(page.locator('#km50HintBulb')).toHaveAttribute('aria-expanded', 'true');
  const boardAfterHint = await page.locator('#board').boundingBox();
  expect(Math.abs((boardBeforeHint?.width || 0) - (boardAfterHint?.width || 0))).toBeLessThan(2);
  await page.locator('#km50HintClose').click();
  await expect(page.locator('#hintCard')).not.toBeVisible();

  await page.locator('#fullscreenButton').click();
  await expect(page.locator('body')).toHaveClass(/km49-fullscreen/);
  await expect(page.locator('#fullscreenButton')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#panelToggleButton')).not.toBeVisible();
  await expect(page.locator('#flipButton')).not.toBeVisible();
  expect(await page.evaluate(() => window.__kmateFullscreenRequests)).toBeGreaterThan(0);

  await page.locator('#fullscreenButton').click();
  await expect(page.locator('body')).not.toHaveClass(/km49-fullscreen/);
  await expect(page.locator('#fullscreenButton')).toHaveAttribute('aria-pressed', 'false');
});

test('coach voice uses the native speech method and reads the concise three-part explanation', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();

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
    document.querySelector('#gameView').classList.add('live-coach-active');
    document.querySelector('#boardCoachStage').classList.add('coach-open');
  });

  await page.waitForTimeout(80);
  await page.evaluate(() => {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance('Mistake. Mistake. Long engine line follows.'));
  });
  await expect.poll(() => page.evaluate(() => window.__kmateSpoken.length), { timeout: 10_000 }).toBeGreaterThan(0);
  const spoken = await page.evaluate(() => window.__kmateSpoken.at(-1));
  expect(spoken).toContain('Why your move was bad:');
  expect(spoken).toContain('Principle violated:');
  expect(spoken).toContain('How the stronger move improves your position:');
  expect(spoken).not.toMatch(/mistake|blunder/i);
  expect(spoken).not.toMatch(/Rxe4|Qxd4|Re1|O-O/);

  const countBeforeReady = await page.evaluate(() => window.__kmateSpoken.length);
  await page.evaluate(() => window.speechSynthesis.speak(new SpeechSynthesisUtterance('Coach voice ready.')));
  await page.waitForTimeout(30);
  expect(await page.evaluate(() => window.__kmateSpoken.length)).toBe(countBeforeReady);

  const state = await page.evaluate(() => window.__KMATE_BOARD_FOCUS_V49__.state());
  expect(state.speechOverrideInstalled).toBe(true);
  expect(state.nativeSpeechAvailable).toBe(true);
  expect(state.speechStarts).toBeGreaterThan(0);
  expect(state.suppressedReadyPrompts).toBeGreaterThan(0);
});

test('wood movement playback is attenuated below the v48 level', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  const before = await page.evaluate(() => window.__KMATE_BOARD_FOCUS_V49__.state());
  expect(before.effectiveMoveVolume).toBe(0.10);
  expect(before.audioParamPatched || before.mediaPlayPatched).toBe(true);

  await page.evaluate(async () => {
    await window.__KMATE_MOVE_FEEDBACK_V48__.prime();
    window.__KMATE_MOVE_FEEDBACK_V48__.play('v49-volume-probe', { haptic: false });
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  const after = await page.evaluate(() => window.__KMATE_BOARD_FOCUS_V49__.state());
  expect(after.scaledGainWrites + after.scaledMediaPlays).toBeGreaterThan(0);
});
