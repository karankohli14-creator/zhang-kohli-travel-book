const { chromium, webkit } = require('playwright');
const assert = require('assert');

function installNormalSpeechMock() {
  const voices = [{ name: 'Serena Enhanced', lang: 'en-GB', voiceURI: 'serena-enhanced', localService: true }];
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
      this.pending = true;
      setTimeout(() => {
        this.pending = false;
        this.speaking = true;
        utterance.onstart?.();
        setTimeout(() => {
          this.speaking = false;
          utterance.onend?.();
        }, 18);
      }, 5);
    },
  };
  try { Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth }); } catch { window.speechSynthesis = synth; }
  try { Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: TestUtterance }); } catch { window.SpeechSynthesisUtterance = TestUtterance; }
}

function installRestrictedMediaEnvironment() {
  class ThrowingAudioContext {
    constructor() { throw new Error('Simulated WebKit media restriction'); }
  }
  try { Object.defineProperty(window, 'AudioContext', { configurable: true, value: ThrowingAudioContext }); } catch { window.AudioContext = ThrowingAudioContext; }
  try { Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: ThrowingAudioContext }); } catch { window.webkitAudioContext = ThrowingAudioContext; }

  const restrictedSynth = {
    speaking: false,
    pending: false,
    getVoices() { throw new Error('Simulated speech voice restriction'); },
    addEventListener() {},
    resume() { throw new Error('Simulated speech resume restriction'); },
    cancel() {},
    speak() { throw new Error('Simulated speech playback restriction'); },
  };
  try { Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: restrictedSynth }); } catch { window.speechSynthesis = restrictedSynth; }
}

function installThrowingDialogEnvironment() {
  if (!window.HTMLDialogElement) return;
  try {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() { throw new Error('Simulated WebKit showModal failure'); },
    });
  } catch {}
  try {
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() { throw new Error('Simulated WebKit dialog close failure'); },
    });
  } catch {}
}

function seedCorruptLocalState() {
  try {
    localStorage.setItem('kmate-generated-tree-v42', JSON.stringify([
      { id: 'bad-fen', seedId: 'missing-seed', phase: 'middlegame', fen: 'not a fen' },
      { id: 'finished', seedId: 'london-mid-1600', phase: 'middlegame', fen: '7k/5Q2/7K/8/8/8/8/8 b - - 0 1' },
    ]));
    localStorage.setItem('kmate-generated-v42', JSON.stringify(['not a fen']));
  } catch {}
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('Failed to load resource') && text.includes('404')) return;
    // Simulated restricted APIs are expected to be logged as warnings, not errors.
    errors.push(`console: ${text}`);
  });
  return errors;
}

async function navigateToCoachSetup(page) {
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1' && window.__KMATE__?.state);
  await page.click('#introProceedButton');
  await page.waitForFunction(() => window.__KMATE__.state().setupFlow.page === 'challenge');
  await page.click('#challengeNextButton');
  await page.waitForFunction(() => window.__KMATE__.state().setupFlow.page === 'coach');
}

async function verifyStart({
  browserType,
  browserName,
  viewport,
  hasTouch = false,
  restrictedMedia = false,
  throwingDialogs = false,
  principles = false,
  phase = 'middlegame',
  url = 'http://127.0.0.1:4173/kmate-v42/',
}) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport, hasTouch, isMobile: hasTouch });
  if (restrictedMedia) await context.addInitScript(installRestrictedMediaEnvironment);
  else await context.addInitScript(installNormalSpeechMock);
  if (throwingDialogs) await context.addInitScript(installThrowingDialogEnvironment);
  await context.addInitScript(seedCorruptLocalState);

  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = collectErrors(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await navigateToCoachSetup(page);

  if (phase !== 'middlegame') {
    await page.click(`#phaseSeg [data-phase="${phase}"]`);
  }
  await page.evaluate((enabled) => {
    const control = document.querySelector('#principleReview');
    control.checked = enabled;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    // Simulate the stale button state left by a prior interrupted launch.
    const start = document.querySelector('#startButton');
    start.dataset.starting = '1';
    start.dataset.startingAt = '0';
  }, principles);

  const before = await page.evaluate(() => ({
    page: window.__KMATE__.state().setupFlow.page,
    button: document.querySelector('#startButton').outerHTML,
    gameMode: document.body.classList.contains('game-mode'),
  }));
  assert.strictEqual(before.page, 'coach', JSON.stringify(before));
  assert.ok(!before.gameMode, JSON.stringify(before));

  const startedAt = Date.now();
  if (hasTouch) await page.tap('#startButton');
  else await page.click('#startButton');

  // The game shell must become visible immediately, before generation finishes.
  await page.waitForFunction(() => document.body.classList.contains('game-mode') && !document.querySelector('#gameView').hidden, null, { timeout: 3000 });
  const shellElapsed = Date.now() - startedAt;
  const shell = await page.evaluate(() => ({
    stage: document.body.dataset.startStage,
    gameMode: document.body.classList.contains('game-mode'),
    setupHidden: document.querySelector('#setupView').hidden,
    gameHidden: document.querySelector('#gameView').hidden,
    startingState: Boolean(document.querySelector('#board .board-starting-state')),
    scrollY: window.scrollY,
  }));
  assert.ok(shell.gameMode && shell.setupHidden && !shell.gameHidden, JSON.stringify(shell));
  assert.ok(shellElapsed < 3000, JSON.stringify({ shellElapsed, shell }));
  assert.strictEqual(shell.scrollY, 0, JSON.stringify(shell));

  await page.waitForFunction(() => {
    const state = window.__KMATE__.state();
    return state.current && document.querySelectorAll('#board .piece').length >= 2;
  }, null, { timeout: 15000 });

  let principleState = null;
  if (principles) {
    await page.waitForSelector('#principlesDialog[open]', { timeout: 8000 });
    principleState = await page.evaluate(() => ({
      open: document.querySelector('#principlesDialog').hasAttribute('open'),
      stage: window.__KMATE__.state().start.stage,
      pieces: document.querySelectorAll('#board .piece').length,
      gameMode: document.body.classList.contains('game-mode'),
    }));
    assert.ok(principleState.open && principleState.gameMode && principleState.pieces >= 2, JSON.stringify(principleState));
    await page.click('#principlesStartButton');
    await page.waitForFunction(() => !document.querySelector('#principlesDialog').hasAttribute('open') && !window.__KMATE__.state().principleReviewPending);
  }

  const result = await page.evaluate(() => {
    const state = window.__KMATE__.state();
    const board = document.querySelector('#board').getBoundingClientRect();
    return {
      version: window.__KMATE__.version,
      current: state.current,
      phase: state.phase,
      stage: state.start.stage,
      trace: state.start.trace,
      recovery: state.start.lastRecovery,
      lastError: state.start.lastError,
      gameMode: document.body.classList.contains('game-mode'),
      gameHidden: document.querySelector('#gameView').hidden,
      setupHidden: document.querySelector('#setupView').hidden,
      pieces: document.querySelectorAll('#board .piece').length,
      squares: document.querySelectorAll('#board .sq').length,
      board: { top: board.top, bottom: board.bottom, width: board.width, height: board.height },
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

  assert.strictEqual(result.version, '42.0-commercial-beta', JSON.stringify(result));
  assert.ok(result.current && result.gameMode && !result.gameHidden && result.setupHidden, JSON.stringify(result));
  assert.ok(result.pieces >= 2 && result.squares === 64, JSON.stringify(result));
  assert.ok(['ready', 'principles-ready'].includes(result.stage), JSON.stringify(result));
  assert.ok(result.board.top >= 0 && result.board.bottom <= result.viewportHeight + 1, JSON.stringify(result));
  assert.strictEqual(result.scrollY, 0, JSON.stringify(result));
  assert.ok(result.scrollHeight <= result.viewportHeight + 2, JSON.stringify(result));
  assert.ok(!result.horizontalOverflow, JSON.stringify(result));
  assert.strictEqual(result.lastError, null, JSON.stringify(result));

  if (errors.length) throw new Error(`${browserName}: ${errors.join('\n')}`);
  await context.close();
  await browser.close();
  return { browserName, shellElapsed, shell, principleState, result };
}

async function runLocalSuite() {
  const cases = [
    {
      browserType: chromium,
      browserName: 'Chromium desktop normal',
      viewport: { width: 1440, height: 900 },
    },
    {
      browserType: webkit,
      browserName: 'WebKit Mac normal',
      viewport: { width: 1440, height: 900 },
    },
    {
      browserType: webkit,
      browserName: 'WebKit restricted media and broken dialog APIs',
      viewport: { width: 1440, height: 900 },
      restrictedMedia: true,
      throwingDialogs: true,
      principles: true,
    },
    {
      browserType: webkit,
      browserName: 'WebKit iPhone touch endgame',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      restrictedMedia: true,
      throwingDialogs: true,
      principles: true,
      phase: 'endgame',
    },
  ];
  const results = [];
  for (const testCase of cases) results.push(await verifyStart(testCase));
  return results;
}

async function runPublicSuite(url) {
  return [
    await verifyStart({
      browserType: webkit,
      browserName: 'Public WebKit desktop',
      viewport: { width: 1440, height: 900 },
      restrictedMedia: true,
      throwingDialogs: true,
      principles: true,
      url,
    }),
    await verifyStart({
      browserType: webkit,
      browserName: 'Public WebKit iPhone touch',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      restrictedMedia: true,
      throwingDialogs: true,
      principles: false,
      url,
    }),
  ];
}

(async () => {
  const mode = process.argv[2] || 'local';
  const results = mode === 'public'
    ? await runPublicSuite(process.argv[3])
    : await runLocalSuite();
  console.log(JSON.stringify({ ok: true, mode, results }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
