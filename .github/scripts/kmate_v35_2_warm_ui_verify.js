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
  await page.waitForFunction(() => window.__KMATE__?.version === '35.0-commercial-beta' && window.__KMATE__?.appFlowVersion === '35.2-warm-3d');
  return { browser, context, page, errors };
}

async function inspectWizardPage(page, expected, minimumButtonFont, minimumTitleFont) {
  await page.waitForFunction(name => document.querySelector('.wizard-page:not([hidden])')?.dataset.wizardPage === name, expected);
  return page.evaluate(({ expected, minimumButtonFont, minimumTitleFont }) => {
    const active = document.querySelector('.wizard-page:not([hidden])');
    const footer = active?.querySelector('.wizard-footer');
    const title = active?.querySelector('.wizard-title, .wizard-welcome-main h1');
    const buttons = [...(footer?.querySelectorAll('button') || [])].filter(button => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(button).visibility !== 'hidden';
    });
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const footerRect = footer?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    return {
      expected,
      active: active?.dataset.wizardPage || null,
      pageCount: [...document.querySelectorAll('.wizard-page')].filter(node => !node.hidden).length,
      hiddenInteractive: [...document.querySelectorAll('.wizard-page[hidden]')].filter(node => !node.inert).length,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight,
      viewportWidth: window.innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      footer: footerRect ? { top: footerRect.top, bottom: footerRect.bottom, height: footerRect.height } : null,
      title: titleRect ? {
        text: title.textContent.trim().replace(/\s+/g, ' '),
        top: titleRect.top,
        bottom: titleRect.bottom,
        fontSize: Number.parseFloat(getComputedStyle(title).fontSize),
      } : null,
      buttons: buttons.map(button => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          text: button.textContent.trim().replace(/\s+/g, ' '),
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          fontSize: Number.parseFloat(style.fontSize),
          backgroundImage: style.backgroundImage,
          boxShadow: style.boxShadow,
          borderRadius: Number.parseFloat(style.borderRadius),
        };
      }),
      minimumButtonFont,
      minimumTitleFont,
      appFlow: window.__KMATE__.appFlowState(),
    };
  }, { expected, minimumButtonFont, minimumTitleFont });
}

function assertWizardPage(metrics, expectedButtonCount = 2) {
  assert.strictEqual(metrics.active, metrics.expected, JSON.stringify(metrics));
  assert.strictEqual(metrics.pageCount, 1, JSON.stringify(metrics));
  assert.strictEqual(metrics.hiddenInteractive, 0, JSON.stringify(metrics));
  assert.strictEqual(metrics.scrollY, 0, JSON.stringify(metrics));
  assert.ok(metrics.scrollHeight <= metrics.viewportHeight + 2, JSON.stringify(metrics));
  assert.ok(!metrics.horizontalOverflow, JSON.stringify(metrics));
  assert.ok(metrics.footer, JSON.stringify(metrics));
  assert.ok(metrics.footer.bottom >= metrics.viewportHeight - 10, JSON.stringify(metrics));
  assert.ok(metrics.footer.top >= metrics.viewportHeight * 0.82, JSON.stringify(metrics));
  assert.ok(metrics.title && metrics.title.fontSize >= metrics.minimumTitleFont, JSON.stringify(metrics));
  assert.ok(metrics.title.top >= -1 && metrics.title.bottom < metrics.footer.top, JSON.stringify(metrics));
  assert.strictEqual(metrics.buttons.length, expectedButtonCount, JSON.stringify(metrics));
  for (const button of metrics.buttons) {
    assert.ok(button.fontSize >= metrics.minimumButtonFont, JSON.stringify(metrics));
    assert.ok(button.height >= 43, JSON.stringify(metrics));
    assert.ok(button.backgroundImage.includes('gradient'), JSON.stringify(metrics));
    assert.notStrictEqual(button.boxShadow, 'none', JSON.stringify(metrics));
    assert.ok(button.borderRadius >= 11, JSON.stringify(metrics));
    assert.ok(button.bottom <= metrics.viewportHeight + 1, JSON.stringify(metrics));
  }
}

async function checkWelcome(page, phone) {
  const metrics = await inspectWizardPage(page, 'welcome', phone ? 14 : 17, phone ? 40 : 48);
  assertWizardPage(metrics);
  const welcome = await page.evaluate(() => ({
    benefits: document.querySelectorAll('.wizard-benefits').length,
    statsVisible: Boolean(document.querySelector('.wizard-welcome-stats')?.getBoundingClientRect().height),
    pathCards: document.querySelectorAll('.wizard-path > div').length,
    primaryText: document.querySelector('[data-wizard-next="position"]')?.textContent.trim().replace(/\s+/g, ' '),
    secondaryText: document.querySelector('#wizardInsightsButton')?.textContent.trim().replace(/\s+/g, ' '),
  }));
  assert.strictEqual(welcome.benefits, 0, JSON.stringify(welcome));
  assert.ok(!welcome.statsVisible, JSON.stringify(welcome));
  assert.strictEqual(welcome.pathCards, 3, JSON.stringify(welcome));
  assert.ok(welcome.primaryText.includes('Start training'), JSON.stringify(welcome));
  assert.ok(welcome.secondaryText.includes('My insights'), JSON.stringify(welcome));
  return { metrics, welcome };
}

async function clickAndConfirmSound(page, selector) {
  const before = await page.evaluate(() => window.__KMATE__.appFlowState().uiSoundCount);
  await page.locator(selector).click();
  await page.waitForFunction(previous => window.__KMATE__.appFlowState().uiSoundCount > previous, before);
  return page.evaluate(() => window.__KMATE__.appFlowState().uiSoundCount);
}

async function inspectPhaseButtons(page, phone) {
  return page.evaluate(phone => [...document.querySelectorAll('#phaseSeg button')].map(button => {
    const rect = button.getBoundingClientRect();
    const label = button.querySelector('b');
    const style = getComputedStyle(button);
    return {
      text: label?.textContent?.trim() || '',
      visible: rect.width > 0 && rect.height > 0,
      height: rect.height,
      fontSize: Number.parseFloat(getComputedStyle(label).fontSize),
      minFont: phone ? 15 : 20,
      boxShadow: style.boxShadow,
      backgroundImage: style.backgroundImage,
      borderRadius: Number.parseFloat(style.borderRadius),
    };
  }), phone);
}

async function navigateAndInspect(page, phone) {
  const welcome = await checkWelcome(page, phone);
  const soundAfterWelcome = await clickAndConfirmSound(page, '[data-wizard-next="position"]');

  const position = await inspectWizardPage(page, 'position', phone ? 14 : 17, phone ? 28 : 34);
  assertWizardPage(position);
  const phaseButtons = await inspectPhaseButtons(page, phone);
  assert.strictEqual(phaseButtons.length, 3, JSON.stringify(phaseButtons));
  assert.ok(phaseButtons.some(item => item.text === 'Endgame' && item.visible), JSON.stringify(phaseButtons));
  for (const button of phaseButtons) {
    assert.ok(button.visible, JSON.stringify(phaseButtons));
    assert.ok(button.height >= (phone ? 50 : 68), JSON.stringify(phaseButtons));
    assert.ok(button.fontSize >= button.minFont, JSON.stringify(phaseButtons));
    assert.notStrictEqual(button.boxShadow, 'none', JSON.stringify(phaseButtons));
    assert.ok(button.backgroundImage.includes('gradient'), JSON.stringify(phaseButtons));
    assert.ok(button.borderRadius >= 11, JSON.stringify(phaseButtons));
  }
  const soundAfterPhase = await clickAndConfirmSound(page, '#phaseSeg [data-phase="endgame"]');
  assert.ok(soundAfterPhase > soundAfterWelcome);
  const soundAfterPosition = await clickAndConfirmSound(page, '.wizard-page[data-wizard-page="position"] [data-wizard-next="challenge"]');

  const challenge = await inspectWizardPage(page, 'challenge', phone ? 14 : 17, phone ? 28 : 34);
  assertWizardPage(challenge);
  await page.click('#sideSeg [data-side="w"]');
  const soundAfterChallenge = await clickAndConfirmSound(page, '.wizard-page[data-wizard-page="challenge"] [data-wizard-next="coaching"]');
  assert.ok(soundAfterChallenge > soundAfterPosition);

  const coaching = await inspectWizardPage(page, 'coaching', phone ? 14 : 17, phone ? 28 : 34);
  assertWizardPage(coaching);
  await page.locator('#autoHints').check();
  await page.locator('#principleReview').uncheck();
  await page.locator('#liveCoach').uncheck();
  await page.locator('#liveCoachVoice').uncheck();
  const backSoundBefore = await page.evaluate(() => window.__KMATE__.appFlowState().uiSoundCount);
  await page.click('.wizard-page[data-wizard-page="coaching"] [data-wizard-back]');
  await page.waitForFunction(() => window.__KMATE__.appFlowState().page === 'challenge');
  const backSoundAfter = await page.evaluate(() => window.__KMATE__.appFlowState().uiSoundCount);
  assert.ok(backSoundAfter > backSoundBefore, JSON.stringify({ backSoundBefore, backSoundAfter }));
  await page.click('.wizard-page[data-wizard-page="challenge"] [data-wizard-next="coaching"]');
  await page.waitForFunction(() => window.__KMATE__.appFlowState().page === 'coaching');

  return { welcome, position, challenge, coaching, phaseButtons, soundAfterWelcome, soundAfterPhase, soundAfterPosition, soundAfterChallenge };
}

async function startGame(page, hasTouch) {
  await page.waitForFunction(() => {
    const button = document.querySelector('#startButton');
    return button && !button.disabled;
  }, null, { timeout: 70000 });
  const start = page.locator('#startButton');
  if (hasTouch) await start.tap(); else await start.click();
  await page.waitForSelector('#gameView:not([hidden]) #board .piece', { timeout: 20000 });
  await page.waitForFunction(() => document.body.classList.contains('game-mode'));
  const game = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    return {
      pieces: document.querySelectorAll('#board .piece').length,
      board: { top: board.top, bottom: board.bottom, width: board.width, height: board.height },
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight,
      appbar: getComputedStyle(document.querySelector('.appbar')).display,
      gameMode: document.body.classList.contains('game-mode'),
      setupMode: document.body.classList.contains('setup-wizard-mode'),
    };
  });
  assert.ok(game.pieces >= 2, JSON.stringify(game));
  assert.ok(game.gameMode && !game.setupMode, JSON.stringify(game));
  assert.strictEqual(game.appbar, 'none', JSON.stringify(game));
  assert.strictEqual(game.scrollY, 0, JSON.stringify(game));
  assert.ok(game.scrollHeight <= game.viewportHeight + 2, JSON.stringify(game));
  assert.ok(game.board.top >= -1 && game.board.bottom <= game.viewportHeight + 1, JSON.stringify(game));

  await page.waitForFunction(() => {
    const state = window.__KMATE__.state();
    return !state.finalized && !state.thinking && state.turn === state.userColor;
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__KMATE__.state().hint.level >= 1, null, { timeout: 30000 });
  const hint = await page.evaluate(() => {
    const text = document.querySelector('#hintText');
    const rect = text.getBoundingClientRect();
    return {
      text: text.textContent.trim(),
      display: getComputedStyle(text).display,
      rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
      viewportHeight: window.visualViewport?.height || window.innerHeight,
    };
  });
  assert.ok(hint.text.length >= 35, JSON.stringify(hint));
  assert.notStrictEqual(hint.display, 'none', JSON.stringify(hint));
  assert.ok(hint.rect.height >= 16 && hint.rect.top >= -1 && hint.rect.bottom <= hint.viewportHeight + 1, JSON.stringify(hint));
  return { game, hint };
}

async function runScenario(browserType, name, options, url) {
  const { browser, context, page, errors } = await openApp(browserType, name, options, url);
  try {
    const setup = await navigateAndInspect(page, Boolean(options.hasTouch));
    const play = await startGame(page, Boolean(options.hasTouch));
    if (errors.length) throw new Error(`${name}: ${errors.join('\n')}`);
    return { name, setup, play };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
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

  const url = process.env.KMATE_TEST_URL || 'http://127.0.0.1:4173/kmate-trainer/?ui=v35-2-local';
  const desktop = await runScenario(chromium, 'Chromium desktop', { viewport: { width: 1440, height: 900 } }, url);
  const phone = await runScenario(webkit, 'WebKit phone', {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  }, url);
  console.log(JSON.stringify({ ok: true, desktop, phone }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
