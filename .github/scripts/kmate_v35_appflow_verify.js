const assert = require('assert');
const { chromium, webkit } = require('playwright');

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

async function openApp(browserType, name, options, url) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  const errors = collectErrors(page);
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.ok(response?.ok(), `${name}: HTTP ${response?.status()}`);
  await page.waitForFunction(() => document.documentElement.dataset.appFlow === 'ready');
  await page.waitForFunction(() => window.__KMATE__?.version === '35.0-commercial-beta' && window.__KMATE__?.appFlowVersion === '35.1-app-flow');
  return { browser, context, page, errors };
}

async function inspectPage(page, expected) {
  await page.waitForFunction(name => {
    const active = document.querySelector('.wizard-page:not([hidden])');
    return active?.dataset.wizardPage === name;
  }, expected);
  return page.evaluate(expectedName => {
    const pages = [...document.querySelectorAll('.wizard-page')];
    const active = pages.find(page => !page.hidden);
    const content = active?.querySelector('.wizard-content, .wizard-welcome-main');
    const footer = active?.querySelector('.wizard-footer');
    const rect = active?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    return {
      expectedName,
      activeName: active?.dataset.wizardPage || null,
      activeCount: pages.filter(page => !page.hidden).length,
      inactiveInteractive: pages.filter(page => page.hidden && !page.inert).length,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      pageRect: rect ? { top: rect.top, bottom: rect.bottom, height: rect.height } : null,
      contentRect: contentRect ? { top: contentRect.top, bottom: contentRect.bottom, height: contentRect.height } : null,
      footerRect: footerRect ? { top: footerRect.top, bottom: footerRect.bottom, height: footerRect.height } : null,
      contentOverflow: content ? content.scrollHeight > content.clientHeight + 2 : false,
      setupMode: document.body.classList.contains('setup-wizard-mode'),
    };
  }, expected);
}

function assertPage(metrics) {
  assert.strictEqual(metrics.activeName, metrics.expectedName, JSON.stringify(metrics));
  assert.strictEqual(metrics.activeCount, 1, JSON.stringify(metrics));
  assert.strictEqual(metrics.inactiveInteractive, 0, JSON.stringify(metrics));
  assert.strictEqual(metrics.scrollY, 0, JSON.stringify(metrics));
  assert.ok(metrics.scrollHeight <= metrics.viewportHeight + 2, JSON.stringify(metrics));
  assert.ok(!metrics.horizontalOverflow, JSON.stringify(metrics));
  assert.ok(metrics.pageRect.top >= -1 && metrics.pageRect.bottom <= metrics.viewportHeight + 1, JSON.stringify(metrics));
  assert.ok(metrics.contentRect.top >= -1 && metrics.contentRect.bottom <= metrics.viewportHeight + 1, JSON.stringify(metrics));
  assert.ok(metrics.footerRect.top >= -1 && metrics.footerRect.bottom <= metrics.viewportHeight + 1, JSON.stringify(metrics));
  assert.ok(!metrics.contentOverflow, JSON.stringify(metrics));
  assert.ok(metrics.setupMode, JSON.stringify(metrics));
}

async function navigateSetup(page) {
  const welcome = await inspectPage(page, 'welcome');
  assertPage(welcome);
  await page.click('[data-wizard-next="position"]');

  const position = await inspectPage(page, 'position');
  assertPage(position);
  const endgame = page.locator('#phaseSeg [data-phase="endgame"]');
  await endgame.click();
  await page.waitForFunction(() => document.querySelector('#phaseSeg [data-phase="endgame"]')?.classList.contains('active'));
  const phaseButtons = await page.evaluate(() => [...document.querySelectorAll('#phaseSeg button')].map(button => {
    const rect = button.getBoundingClientRect();
    const label = button.querySelector('b')?.getBoundingClientRect();
    return {
      text: button.querySelector('b')?.textContent?.trim(),
      visible: rect.width > 0 && rect.height > 0,
      centeredX: label ? Math.abs((label.left + label.right) / 2 - (rect.left + rect.right) / 2) : 999,
      centeredY: label ? Math.abs((label.top + label.bottom) / 2 - (rect.top + rect.bottom) / 2) : 999,
    };
  }));
  assert.ok(phaseButtons.some(button => button.text === 'Endgame' && button.visible), JSON.stringify(phaseButtons));
  assert.ok(phaseButtons.every(button => button.centeredX <= 3 && button.centeredY <= 12), JSON.stringify(phaseButtons));
  await page.click('.wizard-page[data-wizard-page="position"] [data-wizard-next="challenge"]');

  const challenge = await inspectPage(page, 'challenge');
  assertPage(challenge);
  await page.click('#sideSeg [data-side="w"]');
  await page.waitForFunction(() => document.querySelector('#sideSeg [data-side="w"]')?.classList.contains('active'));
  await page.click('.wizard-page[data-wizard-page="challenge"] [data-wizard-next="coaching"]');

  const coaching = await inspectPage(page, 'coaching');
  assertPage(coaching);
  await page.locator('#autoHints').check();
  await page.locator('#principleReview').uncheck();
  await page.locator('#liveCoach').uncheck();
  await page.locator('#liveCoachVoice').uncheck();
  await page.click('.wizard-page[data-wizard-page="coaching"] [data-wizard-back]');
  const backToChallenge = await inspectPage(page, 'challenge');
  assertPage(backToChallenge);
  await page.click('.wizard-page[data-wizard-page="challenge"] [data-wizard-next="coaching"]');
  const coachingAgain = await inspectPage(page, 'coaching');
  assertPage(coachingAgain);
  return { welcome, position, challenge, coaching, phaseButtons };
}

async function startAndCheckHint(page, hasTouch) {
  await page.waitForFunction(() => {
    const button = document.querySelector('#startButton');
    return button && !button.disabled;
  }, null, { timeout: 70000 });
  const start = page.locator('#startButton');
  if (hasTouch) await start.tap(); else await start.click();
  await page.waitForSelector('#gameView:not([hidden]) #board .piece', { timeout: 20000 });
  await page.waitForFunction(() => document.body.classList.contains('game-mode'));

  const game = await page.evaluate(() => {
    const board = document.querySelector('#board')?.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    return {
      pieces: document.querySelectorAll('#board .piece').length,
      board: board ? { top: board.top, bottom: board.bottom, width: board.width, height: board.height } : null,
      appbarDisplay: getComputedStyle(document.querySelector('.appbar')).display,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight,
      gameMode: document.body.classList.contains('game-mode'),
      setupMode: document.body.classList.contains('setup-wizard-mode'),
    };
  });
  assert.ok(game.gameMode && !game.setupMode, JSON.stringify(game));
  assert.strictEqual(game.appbarDisplay, 'none', JSON.stringify(game));
  assert.ok(game.pieces >= 2, JSON.stringify(game));
  assert.ok(game.board.top >= -1 && game.board.bottom <= game.viewportHeight + 1, JSON.stringify(game));
  assert.strictEqual(game.scrollY, 0, JSON.stringify(game));
  assert.ok(game.scrollHeight <= game.viewportHeight + 2, JSON.stringify(game));

  await page.waitForFunction(() => {
    const state = window.__KMATE__.state();
    return !state.finalized && !state.thinking && state.turn === state.userColor;
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__KMATE__.state().hint.level >= 1, null, { timeout: 30000 });

  const hint = await page.evaluate(() => {
    const text = document.querySelector('#hintText');
    const title = document.querySelector('#hintTitle');
    const button = document.querySelector('#showHintButton');
    const rect = text?.getBoundingClientRect();
    const style = text ? getComputedStyle(text) : null;
    return {
      title: title?.textContent?.trim() || '',
      text: text?.textContent?.trim() || '',
      button: button?.textContent?.trim() || '',
      display: style?.display || '',
      visibility: style?.visibility || '',
      opacity: style?.opacity || '',
      rect: rect ? { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      viewportHeight: window.visualViewport?.height || window.innerHeight,
      state: window.__KMATE__.state().hint,
    };
  });
  assert.strictEqual(hint.title, 'Strategic hint', JSON.stringify(hint));
  assert.ok(hint.text.length >= 35, JSON.stringify(hint));
  assert.ok(!hint.text.includes('Try the position first'), JSON.stringify(hint));
  assert.notStrictEqual(hint.display, 'none', JSON.stringify(hint));
  assert.notStrictEqual(hint.visibility, 'hidden', JSON.stringify(hint));
  assert.ok(Number(hint.opacity || 1) > 0, JSON.stringify(hint));
  assert.ok(hint.rect.height >= 16 && hint.rect.width >= 100, JSON.stringify(hint));
  assert.ok(hint.rect.top >= -1 && hint.rect.bottom <= hint.viewportHeight + 1, JSON.stringify(hint));
  assert.ok(['Reveal candidate', 'Hint shown'].includes(hint.button), JSON.stringify(hint));
  return { game, hint };
}

async function runScenario(browserType, name, options, url) {
  const { browser, context, page, errors } = await openApp(browserType, name, options, url);
  try {
    const setup = await navigateSetup(page);
    const play = await startAndCheckHint(page, Boolean(options.hasTouch));
    if (errors.length) throw new Error(`${name}: ${errors.join('\n')}`);
    return { name, setup, play };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const localUrl = process.env.KMATE_TEST_URL || 'http://127.0.0.1:4173/kmate-trainer/?appflow=v35-1-local';
  const publicUrl = process.env.KMATE_PUBLIC_URL;
  if (publicUrl) {
    const publicResult = await runScenario(webkit, 'Public WebKit phone', {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    }, publicUrl);
    console.log(JSON.stringify({ ok: true, publicResult }, null, 2));
    return;
  }

  const desktop = await runScenario(chromium, 'Chromium desktop', {
    viewport: { width: 1440, height: 900 },
  }, localUrl);
  const phone = await runScenario(webkit, 'WebKit phone', {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  }, localUrl);
  console.log(JSON.stringify({ ok: true, desktop, phone }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
