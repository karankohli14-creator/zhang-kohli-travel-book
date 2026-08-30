const { chromium } = require('playwright');
const assert = require('assert');

function installSpeechMock() {
  window.__speechCalls = [];
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
      window.__speechCalls.push(utterance.text);
      this.speaking = true;
      utterance.onstart?.();
      setTimeout(() => {
        this.speaking = false;
        utterance.onend?.();
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
    if (text.includes('Failed to load resource') && text.includes('404')) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

async function openApp(browser, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(installSpeechMock);
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = collectErrors(page);
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1' && window.__KMATE__?.state && window.__KMATE__?.test);
  return { context, page, errors };
}

async function inspectSetupPage(page, expectedPage, expectedTitle, minimumTitleSize) {
  await page.waitForFunction(expected => window.__KMATE__.state().setupFlow.page === expected, expectedPage);
  return page.evaluate(({ expectedPage, expectedTitle, minimumTitleSize }) => {
    const screen = document.querySelector(`.setup-flow-page[data-setup-page="${expectedPage}"]`);
    const header = screen.querySelector('.setup-screen-header');
    const visibleTitles = [...header.querySelectorAll('h1')].filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const title = visibleTitles[0];
    const titleRect = title?.getBoundingClientRect();
    const progressRect = header.querySelector('.setup-progress')?.getBoundingClientRect();
    return {
      expectedTitle,
      titleText: title?.textContent?.trim() || '',
      visibleTitleCount: visibleTitles.length,
      subtitleCount: [...header.querySelectorAll('p')].filter(el => getComputedStyle(el).display !== 'none').length,
      titleSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0,
      titleRect: titleRect ? { top: titleRect.top, right: titleRect.right, bottom: titleRect.bottom, left: titleRect.left } : null,
      progressRect: progressRect ? { top: progressRect.top, right: progressRect.right, bottom: progressRect.bottom, left: progressRect.left } : null,
      minimumTitleSize,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    };
  }, { expectedPage, expectedTitle, minimumTitleSize });
}

function assertSetup(metrics, requireNoOverlap = true) {
  assert.strictEqual(metrics.titleText, metrics.expectedTitle, JSON.stringify(metrics));
  assert.strictEqual(metrics.visibleTitleCount, 1, JSON.stringify(metrics));
  assert.strictEqual(metrics.subtitleCount, 0, JSON.stringify(metrics));
  assert.ok(metrics.titleSize >= metrics.minimumTitleSize, JSON.stringify(metrics));
  assert.ok(metrics.titleRect.top >= 0 && metrics.titleRect.bottom <= metrics.viewportHeight, JSON.stringify(metrics));
  if (requireNoOverlap) assert.ok(metrics.titleRect.right + 8 <= metrics.progressRect.left, JSON.stringify(metrics));
  assert.strictEqual(metrics.scrollY, 0, JSON.stringify(metrics));
  assert.ok(metrics.scrollHeight <= metrics.viewportHeight + 2, JSON.stringify(metrics));
  assert.ok(metrics.noHorizontalOverflow, JSON.stringify(metrics));
}

async function verifyDesktop(browser) {
  const { context, page, errors } = await openApp(browser, { width: 1440, height: 900 });

  await page.click('#introProceedButton');
  const challenge = await inspectSetupPage(page, 'challenge', 'Set your chess challenge', 28);
  assertSetup(challenge);
  await page.click('#sideSeg [data-side="w"]');
  await page.click('#challengeNextButton');
  const coach = await inspectSetupPage(page, 'coach', 'Choose your coaching', 28);
  assertSetup(coach);

  await page.evaluate(() => {
    document.querySelector('#principleReview').checked = false;
    document.querySelector('#liveCoach').checked = false;
  });
  await page.waitForFunction(() => {
    const button = document.querySelector('#startButton');
    return button && !button.disabled && button.textContent.includes('Generate position');
  });
  const speechBeforeStart = await page.evaluate(() => window.__speechCalls.length);
  await page.click('#startButton');
  await page.waitForFunction(() => document.body.classList.contains('game-mode') && !document.querySelector('#gameView').hidden && window.__KMATE__.state().current);
  await page.waitForFunction(() => document.querySelectorAll('#board .piece').length > 0);
  const started = await page.evaluate(() => ({
    current: window.__KMATE__.state().current,
    gameMode: document.body.classList.contains('game-mode'),
    pieces: document.querySelectorAll('#board .piece').length,
    speechCalls: window.__speechCalls.slice(),
    startError: document.querySelector('#loadError')?.textContent?.trim() || '',
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  assert.ok(started.current && started.gameMode && started.pieces >= 2, JSON.stringify(started));
  assert.strictEqual(started.speechCalls.length, speechBeforeStart, JSON.stringify(started));
  assert.ok(!started.speechCalls.some(text => /coach voice ready/i.test(text)), JSON.stringify(started));
  assert.strictEqual(started.startError, '', JSON.stringify(started));
  assert.strictEqual(started.scrollY, 0, JSON.stringify(started));
  assert.ok(started.scrollHeight <= started.viewportHeight + 2, JSON.stringify(started));

  // Use a deterministic local position to build a one-move completed session;
  // this tests post-game navigation without depending on an engine move first.
  await page.evaluate(() => window.__KMATE__.test.startConcreteTacticDemo());
  await page.waitForFunction(() => window.__KMATE__.state().current === 'v34-concrete-tactic-demo');
  await page.click('#board .sq[data-square="e2"]');
  await page.click('#board .sq[data-square="f3"]');
  await page.waitForFunction(() => window.__KMATE__.state().lastMove?.actor === 'user');
  await page.evaluate(() => window.__KMATE__.test.forceTimeout('w'));
  await page.waitForSelector('#resultDialog[open]');
  await page.waitForFunction(() => !document.querySelector('#resultReplay').disabled);
  await page.click('#resultReplay');
  await page.waitForSelector('#replayDialog[open]');

  const exits = await page.evaluate(() => {
    const ids = ['replayBackToReview', 'replayHomeButton', 'replayNewPositionButton'];
    return Object.fromEntries(ids.map(id => {
      const el = document.getElementById(id);
      const rect = el?.getBoundingClientRect();
      return [id, { visible: Boolean(el && rect && rect.width > 0 && rect.height > 0), text: el?.textContent?.trim() || '' }];
    }));
  });
  assert.ok(exits.replayBackToReview.visible, JSON.stringify(exits));
  assert.ok(exits.replayHomeButton.visible, JSON.stringify(exits));
  assert.ok(exits.replayNewPositionButton.visible, JSON.stringify(exits));

  await page.click('#replayHomeButton');
  await page.waitForFunction(() => !document.body.classList.contains('game-mode') && window.__KMATE__.state().setupFlow.page === 'intro');
  const home = await page.evaluate(() => ({
    replayOpen: document.querySelector('#replayDialog').open,
    resultOpen: document.querySelector('#resultDialog').open,
    page: window.__KMATE__.state().setupFlow.page,
    setupHidden: document.querySelector('#setupView').hidden,
  }));
  assert.ok(!home.replayOpen && !home.resultOpen && home.page === 'intro' && !home.setupHidden, JSON.stringify(home));

  await page.evaluate(() => window.__KMATE__.test.openReplay());
  await page.waitForSelector('#replayDialog[open]');
  await page.click('#replayNewPositionButton');
  await page.waitForFunction(() => document.body.classList.contains('game-mode') && !document.querySelector('#gameView').hidden && !document.querySelector('#replayDialog').open);
  const newPosition = await page.evaluate(() => ({
    current: window.__KMATE__.state().current,
    gameMode: document.body.classList.contains('game-mode'),
    replayOpen: document.querySelector('#replayDialog').open,
    resultOpen: document.querySelector('#resultDialog').open,
    pieces: document.querySelectorAll('#board .piece').length,
  }));
  assert.ok(newPosition.current && newPosition.gameMode && !newPosition.replayOpen && !newPosition.resultOpen && newPosition.pieces >= 2, JSON.stringify(newPosition));

  if (errors.length) throw new Error(errors.join('\n'));
  await context.close();
  return { challenge, coach, started, exits, home, newPosition };
}

async function verifyMobile(browser) {
  const { context, page, errors } = await openApp(browser, { width: 390, height: 844 });
  await page.click('#introProceedButton');
  const challenge = await inspectSetupPage(page, 'challenge', 'Set your chess challenge', 22);
  assertSetup(challenge, false);
  await page.click('#challengeNextButton');
  const coach = await inspectSetupPage(page, 'coach', 'Choose your coaching', 22);
  assertSetup(coach, false);

  await page.evaluate(() => document.querySelector('#principleReview').checked = false);
  await page.waitForFunction(() => !document.querySelector('#startButton').disabled);
  await page.click('#startButton');
  await page.waitForFunction(() => document.body.classList.contains('game-mode') && window.__KMATE__.state().current);
  const game = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    return {
      pieces: document.querySelectorAll('#board .piece').length,
      board: { top: board.top, bottom: board.bottom, width: board.width },
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
  assert.ok(game.pieces >= 2, JSON.stringify(game));
  assert.ok(game.board.top >= 0 && game.board.bottom <= game.viewportHeight + 1, JSON.stringify(game));
  assert.strictEqual(game.scrollY, 0, JSON.stringify(game));
  assert.ok(game.scrollHeight <= game.viewportHeight + 2, JSON.stringify(game));

  if (errors.length) throw new Error(errors.join('\n'));
  await context.close();
  return { challenge, coach, game };
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
