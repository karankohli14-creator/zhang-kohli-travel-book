const { chromium } = require('playwright');
const assert = require('assert');

const BASE_URL = process.env.KMATE_BASE_URL || 'http://127.0.0.1:4173/kmate-v42/';

function installState() {
  try {
    localStorage.setItem('kmate-generation-tree-v23', JSON.stringify([
      { id: 'broken-old-position', fen: 'not-a-fen', seedId: 'missing-seed', phase: 'middlegame', depth: 3 },
      { id: 'finished-old-position', fen: '7k/5Q2/7K/8/8/8/8/8 b - - 0 1', seedId: 'london-mid-1400', phase: 'middlegame', depth: 2 },
    ]));
    localStorage.setItem('kmate-generated-v23', JSON.stringify(['not-a-fen', '8/8/8/8/8/8/8/8 w - - 0 1']));
  } catch {}

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

async function openApp(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 900 },
    hasTouch: Boolean(options.hasTouch),
    isMobile: Boolean(options.isMobile),
    userAgent: options.userAgent,
  });
  await context.addInitScript(installState);
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  const errors = collectErrors(page);
  await page.goto(`${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}run=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1' && window.__KMATE__?.state && window.__KMATE__?.version === '42.0-commercial-beta');
  return { context, page, errors };
}

async function centerOf(page, selector) {
  return page.evaluate(selector => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
  }, selector);
}

async function hitReport(page, selector) {
  return page.evaluate(selector => {
    const target = document.querySelector(selector);
    if (!target) return { selector, missing: true };
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const stack = document.elementsFromPoint(x, y).slice(0, 8).map(element => ({
      tag: element.tagName,
      id: element.id || '',
      cls: String(element.className || ''),
      pointerEvents: getComputedStyle(element).pointerEvents,
      display: getComputedStyle(element).display,
      visibility: getComputedStyle(element).visibility,
    }));
    const top = document.elementFromPoint(x, y);
    const label = target.closest('label') || document.querySelector(`label[for="${target.id}"]`);
    return {
      selector,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
      top: top ? { tag: top.tagName, id: top.id || '', cls: String(top.className || '') } : null,
      targetOwnsHit: Boolean(top && (target === top || target.contains(top) || top.contains(target) || label?.contains(top))),
      disabled: Boolean(target.disabled),
      inert: Boolean(target.inert || target.closest('[inert]')),
      targetPointerEvents: getComputedStyle(target).pointerEvents,
      stack,
    };
  }, selector);
}

async function clickAt(page, selector, touch = false) {
  const point = await centerOf(page, selector);
  assert.ok(point && point.width > 0 && point.height > 0, `Missing clickable area for ${selector}: ${JSON.stringify(point)}`);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function reachCoachPage(page, touch = false) {
  await clickAt(page, '#introProceedButton', touch);
  await page.waitForFunction(() => window.__KMATE__.state().setupFlow.page === 'challenge');
  await clickAt(page, '#challengeNextButton', touch);
  await page.waitForFunction(() => window.__KMATE__.state().setupFlow.page === 'coach');
  await page.waitForTimeout(4500);
}

async function inspectCoachPage(page) {
  return page.evaluate(() => {
    const activePages = [...document.querySelectorAll('.setup-flow-page')].filter(screen => {
      const style = getComputedStyle(screen);
      const rect = screen.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    return {
      setupPage: window.__KMATE__.state().setupFlow.page,
      activePages: activePages.map(screen => screen.dataset.setupPage),
      openDialogs: [...document.querySelectorAll('dialog[open]')].map(dialog => dialog.id),
      bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
      flowPointerEvents: getComputedStyle(document.querySelector('#setupFlow')).pointerEvents,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      version: window.__KMATE__.version,
      heartbeat: performance.now(),
    };
  });
}

async function verifyCoachInteractivity(browser, mobile = false) {
  const { context, page, errors } = await openApp(browser, mobile ? {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  } : {
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/151 Safari/537.36',
  });
  const touch = mobile;

  await reachCoachPage(page, touch);
  const before = await inspectCoachPage(page);
  assert.strictEqual(before.setupPage, 'coach', JSON.stringify(before));
  assert.deepStrictEqual(before.activePages, ['coach'], JSON.stringify(before));
  assert.deepStrictEqual(before.openDialogs, [], JSON.stringify(before));
  assert.strictEqual(before.bodyPointerEvents, 'auto', JSON.stringify(before));
  assert.strictEqual(before.flowPointerEvents, 'auto', JSON.stringify(before));
  assert.strictEqual(before.scrollY, 0, JSON.stringify(before));
  assert.ok(before.scrollHeight <= before.viewportHeight + 2, JSON.stringify(before));

  const reports = {};
  for (const selector of ['#coachBackButton', '#startButton', '#liveCoach', '#principleReview', '#autoHints']) {
    reports[selector] = await hitReport(page, selector);
    assert.ok(reports[selector].targetOwnsHit, JSON.stringify(reports[selector]));
    assert.ok(!reports[selector].disabled, JSON.stringify(reports[selector]));
    assert.ok(!reports[selector].inert, JSON.stringify(reports[selector]));
    assert.notStrictEqual(reports[selector].targetPointerEvents, 'none', JSON.stringify(reports[selector]));
  }

  const liveCoachBefore = await page.isChecked('#liveCoach');
  await clickAt(page, 'label:has(#liveCoach)', touch);
  await page.waitForFunction(previous => document.querySelector('#liveCoach').checked !== previous, liveCoachBefore);
  const liveCoachAfter = await page.isChecked('#liveCoach');
  assert.notStrictEqual(liveCoachAfter, liveCoachBefore);

  const principleBefore = await page.isChecked('#principleReview');
  await clickAt(page, 'label:has(#principleReview)', touch);
  await page.waitForFunction(previous => document.querySelector('#principleReview').checked !== previous, principleBefore);
  const principleAfter = await page.isChecked('#principleReview');
  assert.notStrictEqual(principleAfter, principleBefore);

  await clickAt(page, '#coachBackButton', touch);
  await page.waitForFunction(() => window.__KMATE__.state().setupFlow.page === 'challenge');
  await clickAt(page, '#challengeNextButton', touch);
  await page.waitForFunction(() => window.__KMATE__.state().setupFlow.page === 'coach');

  // Keep pregame principles off for this immediate transition test.
  if (await page.isChecked('#principleReview')) await clickAt(page, 'label:has(#principleReview)', touch);
  const speechBefore = await page.evaluate(() => window.__speechCalls.length);
  await clickAt(page, '#startButton', touch);
  await page.waitForFunction(() => document.body.classList.contains('game-mode') && !document.querySelector('#gameView').hidden && window.__KMATE__.state().current, null, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#board .piece').length > 0);
  const game = await page.evaluate(() => ({
    current: window.__KMATE__.state().current,
    gameMode: document.body.classList.contains('game-mode'),
    pieces: document.querySelectorAll('#board .piece').length,
    speechCalls: window.__speechCalls.length,
    lastStartError: window.__KMATE__.state().startDiagnostics?.lastError || null,
    scrollY: window.scrollY,
  }));
  assert.ok(game.current && game.gameMode && game.pieces >= 2, JSON.stringify(game));
  assert.strictEqual(game.speechCalls, speechBefore, JSON.stringify(game));
  assert.strictEqual(game.lastStartError, null, JSON.stringify(game));
  assert.strictEqual(game.scrollY, 0, JSON.stringify(game));

  if (errors.length) throw new Error(errors.join('\n'));
  await context.close();
  return { mobile, before, reports, liveCoachBefore, liveCoachAfter, principleBefore, principleAfter, game };
}

async function verifyPrincipleRoute(browser) {
  const { context, page, errors } = await openApp(browser, { viewport: { width: 1280, height: 800 } });
  await reachCoachPage(page, false);
  if (!(await page.isChecked('#principleReview'))) await clickAt(page, 'label:has(#principleReview)', false);
  await clickAt(page, '#startButton', false);
  await page.waitForSelector('#principlesDialog[open]', { timeout: 20000 });
  const review = await page.evaluate(() => ({
    title: document.querySelector('#principlesPositionTitle')?.textContent?.trim(),
    rows: document.querySelectorAll('#principlesList .principle-compact-row').length,
    gameMode: document.body.classList.contains('game-mode'),
    gameHidden: document.querySelector('#gameView').hidden,
  }));
  assert.ok(review.title && review.rows >= 1 && review.gameMode && !review.gameHidden, JSON.stringify(review));
  await clickAt(page, '#principlesStartButton', false);
  await page.waitForFunction(() => !document.querySelector('#principlesDialog').open && document.querySelectorAll('#board .piece').length > 0);
  if (errors.length) throw new Error(errors.join('\n'));
  await context.close();
  return review;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_PATH,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const desktop = await verifyCoachInteractivity(browser, false);
    const mobile = await verifyCoachInteractivity(browser, true);
    const principleRoute = await verifyPrincipleRoute(browser);
    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, desktop, mobile, principleRoute }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
