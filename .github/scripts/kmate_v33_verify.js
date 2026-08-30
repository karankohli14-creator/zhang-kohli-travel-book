const { chromium } = require('playwright');
const assert = require('assert');

function installSpeechMock() {
  window.__speechCalls = [];
  const voices = [
    { name: 'Serena Enhanced', lang: 'en-GB', voiceURI: 'serena-enhanced', localService: true },
    { name: 'Samantha', lang: 'en-US', voiceURI: 'samantha', localService: true },
  ];
  class TestUtterance {
    constructor(text) {
      this.text = text;
      this.voice = null;
      this.lang = '';
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    }
  }
  const synth = {
    speaking: false,
    pending: false,
    getVoices: () => voices,
    addEventListener: () => {},
    resume() {},
    cancel() { this.speaking = false; this.pending = false; },
    speak(utterance) {
      window.__speechCalls.push({
        text: utterance.text,
        voice: utterance.voice?.name || null,
        volume: utterance.volume,
      });
      this.pending = true;
      setTimeout(() => {
        this.pending = false;
        this.speaking = true;
        utterance.onstart?.();
        setTimeout(() => {
          this.speaking = false;
          utterance.onend?.();
        }, 65);
      }, 20);
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: TestUtterance });
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('Headless test uses focus-mode fallback')) return;
    if (text.includes('Failed to load resource') && text.includes('404')) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

async function waitUntilReady(page) {
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.waitForFunction(() => !document.querySelector('#startButton').disabled);
}

async function verifyDesktop(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  });
  await context.addInitScript(installSpeechMock);
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = collectErrors(page);
  await waitUntilReady(page);

  await page.click('#startButton');
  await page.waitForFunction(() => document.body.classList.contains('game-mode') && !document.querySelector('#gameView').hidden);
  await page.waitForFunction(() => window.__speechCalls.some(item => item.text.includes('Coach voice ready')));
  await page.waitForTimeout(220);

  const initial = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    const side = document.querySelector('.sidepanel').getBoundingClientRect();
    return {
      board: { top: board.top, bottom: board.bottom, width: board.width, height: board.height },
      side: { top: side.top, bottom: side.bottom, width: side.width, height: side.height },
      appbar: getComputedStyle(document.querySelector('.appbar')).display,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      speech: window.__speechCalls.map(item => item.text),
      layout: window.__KMATE__.state().layout,
    };
  });
  assert.strictEqual(initial.appbar, 'none', JSON.stringify(initial));
  assert.strictEqual(initial.scrollY, 0, JSON.stringify(initial));
  assert.ok(initial.scrollHeight <= initial.viewportHeight + 2, JSON.stringify(initial));
  assert.strictEqual(initial.bodyOverflow, 'hidden', JSON.stringify(initial));
  assert.strictEqual(initial.htmlOverflow, 'hidden', JSON.stringify(initial));
  assert.ok(initial.board.width >= 500, JSON.stringify(initial));
  assert.ok(initial.board.top >= 0 && initial.board.bottom <= initial.viewportHeight + 1, JSON.stringify(initial));
  assert.ok(initial.side.top >= 0 && initial.side.bottom <= initial.viewportHeight + 1, JSON.stringify(initial));

  // Headless Chromium does not need to enter an OS-level full-screen window;
  // forcing requestFullscreen to reject verifies the built-in board-focus fallback.
  await page.evaluate(() => {
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: () => Promise.reject(new Error('Headless test uses focus-mode fallback')),
    });
  });
  await page.click('#fullscreenButton');
  await page.waitForFunction(() => document.body.classList.contains('board-focus'));
  await page.waitForTimeout(180);
  const focus = await page.evaluate(() => ({
    focus: document.body.classList.contains('board-focus'),
    sideDisplay: getComputedStyle(document.querySelector('.sidepanel')).display,
    boardWidth: document.querySelector('#board').getBoundingClientRect().width,
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  assert.ok(focus.focus, JSON.stringify(focus));
  assert.strictEqual(focus.sideDisplay, 'none', JSON.stringify(focus));
  assert.ok(focus.boardWidth >= initial.board.width, JSON.stringify({ initial, focus }));
  assert.strictEqual(focus.scrollY, 0, JSON.stringify(focus));
  assert.ok(focus.scrollHeight <= focus.viewportHeight + 2, JSON.stringify(focus));
  await page.click('#fullscreenButton');
  await page.waitForFunction(() => !document.body.classList.contains('board-focus'));

  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await page.click('#board .sq[data-square="e2"]');
  await page.click('#board .sq[data-square="e4"]');
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.awaiting && window.__KMATE__.state().clockPaused);
  const injected = await page.evaluate(() => window.__KMATE__.test.forceLiveCoachIntervention());
  assert.ok(injected && injected.bestMove, JSON.stringify(injected));
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.open);
  await page.waitForFunction(() => window.__speechCalls.some(item => item.text.includes('Principle diagnosis')));
  await page.waitForTimeout(120);

  const coaching = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    const panel = document.querySelector('#liveCoachBoardPanel').getBoundingClientRect();
    const stage = document.querySelector('#boardCoachStage').getBoundingClientRect();
    return {
      board: { top: board.top, bottom: board.bottom, width: board.width, height: board.height },
      panel: { top: panel.top, bottom: panel.bottom, width: panel.width, height: panel.height },
      stage: { width: stage.width, height: stage.height },
      ratio: board.width / panel.width,
      arrows: document.querySelectorAll('#board .live-coach-board-arrows line').length,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      speech: window.__speechCalls.map(item => item.text).join(' '),
      coachAudio: window.__KMATE__.state().coachAudio,
    };
  });
  assert.ok(coaching.ratio >= 0.70 && coaching.ratio <= 1.10, JSON.stringify(coaching));
  assert.ok(coaching.board.top >= 0 && coaching.board.bottom <= coaching.viewportHeight + 1, JSON.stringify(coaching));
  assert.ok(coaching.panel.top >= 0 && coaching.panel.bottom <= coaching.viewportHeight + 1, JSON.stringify(coaching));
  assert.ok(coaching.arrows >= 2, JSON.stringify(coaching));
  assert.strictEqual(coaching.scrollY, 0, JSON.stringify(coaching));
  assert.ok(coaching.scrollHeight <= coaching.viewportHeight + 2, JSON.stringify(coaching));
  assert.ok(coaching.speech.includes('Principle diagnosis'), JSON.stringify(coaching));

  await page.click('#liveCoachContinueButton');
  await page.waitForFunction(() => !window.__KMATE__.state().liveCoach.open && !window.__KMATE__.state().clockPaused);
  await page.waitForTimeout(250);
  const afterResume = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    return {
      board: { top: board.top, bottom: board.bottom, width: board.width },
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      panelHidden: document.querySelector('#liveCoachBoardPanel').hidden,
    };
  });
  assert.ok(afterResume.panelHidden, JSON.stringify(afterResume));
  assert.strictEqual(afterResume.scrollY, 0, JSON.stringify(afterResume));
  assert.ok(afterResume.scrollHeight <= afterResume.viewportHeight + 2, JSON.stringify(afterResume));
  assert.ok(afterResume.board.top >= 0 && afterResume.board.bottom <= afterResume.viewportHeight + 1, JSON.stringify(afterResume));

  const speechBeforeTest = await page.evaluate(() => window.__speechCalls.length);
  await page.click('#gameCoachAudioButton');
  await page.waitForFunction(before => window.__speechCalls.length > before, speechBeforeTest);
  const speechAfterTest = await page.evaluate(() => window.__speechCalls.length);
  assert.ok(speechAfterTest > speechBeforeTest, JSON.stringify({ speechBeforeTest, speechAfterTest }));

  await page.evaluate(() => window.__KMATE__.test.openReplay());
  await page.waitForSelector('#replayDialog[open]');
  const speechBeforeReplay = await page.evaluate(() => window.__speechCalls.length);
  await page.evaluate(() => window.__KMATE__.test.speakCoach());
  await page.waitForFunction(before => window.__speechCalls.length > before, speechBeforeReplay);
  const speechAfterReplay = await page.evaluate(() => window.__speechCalls.length);
  assert.ok(speechAfterReplay > speechBeforeReplay, JSON.stringify({ speechBeforeReplay, speechAfterReplay }));

  if (errors.length) throw new Error(errors.join('\n'));
  await context.close();
  return {
    initial,
    focus,
    coaching,
    afterResume,
    speechBeforeTest,
    speechAfterTest,
    speechBeforeReplay,
    speechAfterReplay,
  };
}

async function verifyMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(installSpeechMock);
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = collectErrors(page);
  await waitUntilReady(page);

  await page.click('#startButton');
  await page.waitForFunction(() => document.body.classList.contains('game-mode'));
  await page.waitForTimeout(250);

  const initial = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    return {
      board: { top: board.top, bottom: board.bottom, width: board.width, height: board.height },
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      toggle: getComputedStyle(document.querySelector('#panelToggleButton')).display,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    };
  });
  assert.ok(initial.board.width >= 330, JSON.stringify(initial));
  assert.ok(initial.board.top >= 0 && initial.board.bottom <= initial.viewportHeight + 1, JSON.stringify(initial));
  assert.strictEqual(initial.scrollY, 0, JSON.stringify(initial));
  assert.ok(initial.scrollHeight <= initial.viewportHeight + 2, JSON.stringify(initial));
  assert.notStrictEqual(initial.toggle, 'none', JSON.stringify(initial));
  assert.ok(initial.noHorizontalOverflow, JSON.stringify(initial));

  await page.click('#panelToggleButton');
  await page.waitForFunction(() => document.body.classList.contains('game-panel-open'));
  const drawer = await page.evaluate(() => {
    const side = document.querySelector('.sidepanel').getBoundingClientRect();
    return {
      side: { left: side.left, right: side.right, top: side.top, bottom: side.bottom },
      backdropHidden: document.querySelector('#gamePanelBackdrop').hidden,
      scrollY: window.scrollY,
    };
  });
  assert.ok(drawer.side.left >= 0 && drawer.side.right <= 390, JSON.stringify(drawer));
  assert.ok(!drawer.backdropHidden, JSON.stringify(drawer));
  assert.strictEqual(drawer.scrollY, 0, JSON.stringify(drawer));
  await page.click('#gamePanelBackdrop');
  await page.waitForFunction(() => !document.body.classList.contains('game-panel-open'));

  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await page.click('#board .sq[data-square="e2"]');
  await page.click('#board .sq[data-square="e4"]');
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.awaiting);
  await page.evaluate(() => window.__KMATE__.test.forceLiveCoachIntervention());
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.open);
  await page.waitForTimeout(240);

  const coaching = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    const panel = document.querySelector('#liveCoachBoardPanel').getBoundingClientRect();
    return {
      board: { top: board.top, bottom: board.bottom, width: board.width, height: board.height },
      panel: { top: panel.top, bottom: panel.bottom, width: panel.width, height: panel.height },
      ratio: board.height / panel.height,
      arrows: document.querySelectorAll('#board .live-coach-board-arrows line').length,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    };
  });
  assert.ok(coaching.ratio >= 0.70 && coaching.ratio <= 1.30, JSON.stringify(coaching));
  assert.ok(coaching.board.top >= 0 && coaching.board.bottom <= coaching.viewportHeight + 1, JSON.stringify(coaching));
  assert.ok(coaching.panel.top >= 0 && coaching.panel.bottom <= coaching.viewportHeight + 1, JSON.stringify(coaching));
  assert.ok(coaching.arrows >= 2, JSON.stringify(coaching));
  assert.strictEqual(coaching.scrollY, 0, JSON.stringify(coaching));
  assert.ok(coaching.scrollHeight <= coaching.viewportHeight + 2, JSON.stringify(coaching));
  assert.ok(coaching.noHorizontalOverflow, JSON.stringify(coaching));

  await page.click('#liveCoachContinueButton');
  await page.waitForFunction(() => !window.__KMATE__.state().liveCoach.open);
  const afterResume = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  assert.strictEqual(afterResume.scrollY, 0, JSON.stringify(afterResume));
  assert.ok(afterResume.scrollHeight <= afterResume.viewportHeight + 2, JSON.stringify(afterResume));

  if (errors.length) throw new Error(errors.join('\n'));
  await context.close();
  return { initial, drawer, coaching, afterResume };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_PATH,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const desktop = await verifyDesktop(browser);
    const mobile = await verifyMobile(browser);
    console.log(JSON.stringify({ ok: true, desktop, mobile }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
