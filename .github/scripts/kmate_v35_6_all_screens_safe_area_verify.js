const assert = require('node:assert/strict');
const { webkit } = require('playwright');

const DEFAULT_URL = 'http://127.0.0.1:4173/kmate-trainer/?safe-area=v35.6-local';
const URL = process.env.KMATE_URL || DEFAULT_URL;

function closeEnough(value, expected, tolerance = 1.5) {
  return Math.abs(value - expected) <= tolerance;
}

async function openApp(page) {
  const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.ok(response?.ok(), `HTTP ${response?.status()} for ${URL}`);
  await page.waitForFunction(() => document.documentElement.dataset.appFlow === 'ready', null, { timeout: 60000 });
  await page.waitForFunction(() => Boolean(window.__KMATE__?.showSetupPage), null, { timeout: 60000 });
  const meta = await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute('content');
  assert.equal(meta, 'black', `Expected non-overlay iPhone status bar, got ${meta}`);
  const links = await page.locator('link[rel="stylesheet"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
  assert.ok(links.some((href) => href?.includes('safe-area-v35-6.css?v=35.6.0')), JSON.stringify(links));
}

async function setSafeArea(page, safe) {
  await page.evaluate((values) => {
    const root = document.documentElement;
    root.style.setProperty('--kmate-safe-top', `${values.top}px`);
    root.style.setProperty('--kmate-safe-right', `${values.right}px`);
    root.style.setProperty('--kmate-safe-bottom', `${values.bottom}px`);
    root.style.setProperty('--kmate-safe-left', `${values.left}px`);
    window.scrollTo(0, 0);
  }, safe);
  await page.waitForTimeout(30);
}

async function snapshot(page, selector) {
  return page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!element) return { selector: target, exists: false };
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      selector: target,
      exists: true,
      visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0,
      rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height },
      overflowY: style.overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  }, selector);
}

function assertInside(metric, safe, viewport, label = metric.selector) {
  assert.ok(metric.exists, `${label}: missing`);
  assert.ok(metric.visible, `${label}: not visible ${JSON.stringify(metric)}`);
  assert.ok(metric.rect.top >= safe.top - 1.5, `${label}: top ${metric.rect.top} overlaps safe top ${safe.top}`);
  assert.ok(metric.rect.left >= safe.left - 1.5, `${label}: left ${metric.rect.left} overlaps safe left ${safe.left}`);
  assert.ok(metric.rect.right <= viewport.width - safe.right + 1.5, `${label}: right ${metric.rect.right} overlaps safe right ${safe.right}`);
  assert.ok(metric.rect.bottom <= viewport.height - safe.bottom + 1.5, `${label}: bottom ${metric.rect.bottom} overlaps safe bottom ${safe.bottom}`);
}

async function viewport(page) {
  return page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollY, scrollHeight: document.documentElement.scrollHeight }));
}

async function neutralizeViews(page) {
  await page.evaluate(() => {
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    document.documentElement.classList.remove('game-mode', 'setup-wizard-root', 'principles-screen-open');
    document.body.classList.remove('game-mode', 'setup-wizard-mode', 'live-coach-active', 'principles-screen-open');
    document.querySelector('#setupView').hidden = true;
    document.querySelector('#gameView').hidden = true;
    document.querySelector('#insightsView').hidden = true;
    window.scrollTo(0, 0);
  });
}

async function verifyWizard(page, safe) {
  const results = {};
  for (const name of ['welcome', 'position', 'challenge', 'coaching']) {
    await page.evaluate((pageName) => {
      document.querySelector('#setupView').hidden = false;
      document.querySelector('#gameView').hidden = true;
      document.querySelector('#insightsView').hidden = true;
      document.documentElement.classList.add('setup-wizard-root');
      document.body.classList.add('setup-wizard-mode');
      document.body.classList.remove('game-mode');
      window.__KMATE__.showSetupPage(pageName);
    }, name);
    await page.waitForFunction((pageName) => document.querySelector(`.wizard-page[data-wizard-page="${pageName}"]`)?.hidden === false, name);
    const view = await viewport(page);
    const selectors = name === 'welcome'
      ? ['.wizard-page[data-wizard-page="welcome"] .wizard-welcome-main', '.wizard-page[data-wizard-page="welcome"] .wizard-footer']
      : [
          `.wizard-page[data-wizard-page="${name}"] .wizard-header`,
          `.wizard-page[data-wizard-page="${name}"] .wizard-title`,
          `.wizard-page[data-wizard-page="${name}"] .wizard-content`,
          `.wizard-page[data-wizard-page="${name}"] .wizard-footer`,
        ];
    const metrics = [];
    for (const selector of selectors) {
      const metric = await snapshot(page, selector);
      assertInside(metric, safe, view, `${name}: ${selector}`);
      metrics.push(metric);
    }
    assert.equal(view.scrollY, 0, `${name}: document moved vertically`);
    assert.ok(view.scrollHeight <= view.height + 2, `${name}: document scrolls (${view.scrollHeight} > ${view.height})`);
    results[name] = metrics;
  }
  return results;
}

async function verifyInsights(page, safe) {
  await neutralizeViews(page);
  await page.evaluate(() => {
    document.querySelector('#insightsView').hidden = false;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(20);
  const view = await viewport(page);
  const metrics = [];
  for (const selector of ['.appbar .brand', '.appbar .header-actions', '.appbar .topnav', '#insightsView .insights-head']) {
    const metric = await snapshot(page, selector);
    assertInside(metric, safe, view, `insights: ${selector}`);
    metrics.push(metric);
  }
  return metrics;
}

async function verifyGame(page, safe) {
  await neutralizeViews(page);
  await page.evaluate(() => {
    document.querySelector('#gameView').hidden = false;
    document.documentElement.classList.add('game-mode');
    document.body.classList.add('game-mode');
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(40);
  const view = await viewport(page);
  const metrics = [];
  for (const selector of ['#gameView .playtop', '#gameView .playgrid']) {
    const metric = await snapshot(page, selector);
    assertInside(metric, safe, view, `game: ${selector}`);
    metrics.push(metric);
  }
  assert.equal(view.scrollY, 0, 'game: document moved vertically');
  assert.ok(view.scrollHeight <= view.height + 2, `game: document scrolls (${view.scrollHeight} > ${view.height})`);

  await page.evaluate(() => {
    document.body.classList.add('live-coach-active');
    const panel = document.querySelector('#liveCoachBoardPanel');
    if (panel) panel.hidden = false;
  });
  await page.waitForTimeout(30);
  for (const selector of ['#gameView .playtop', '#gameView .board-coach-stage']) {
    const metric = await snapshot(page, selector);
    assertInside(metric, safe, view, `live coach: ${selector}`);
    metrics.push(metric);
  }
  await page.evaluate(() => {
    document.body.classList.remove('live-coach-active');
    const panel = document.querySelector('#liveCoachBoardPanel');
    if (panel) panel.hidden = true;
  });
  return metrics;
}

async function openDialog(page, id, prepare = null) {
  await page.evaluate(({ dialogId, prepareCode }) => {
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    if (prepareCode === 'principles') {
      const list = document.querySelector('#principlesList');
      list.innerHTML = Array.from({ length: 5 }, (_, index) => `
        <article class="principle-card"><span>${index + 1}</span><div><b>Principle ${index + 1}</b><p>One concise position-specific reminder.</p></div></article>`).join('');
    }
    const dialog = document.getElementById(dialogId);
    dialog.showModal();
  }, { dialogId: id, prepareCode: prepare });
  await page.waitForFunction((dialogId) => document.getElementById(dialogId)?.open, id);
  await page.waitForTimeout(80);
}

async function verifyDialogs(page, safe) {
  await neutralizeViews(page);
  const view = await viewport(page);
  const results = {};
  const compact = [
    ['positionImportDialog', null],
    ['aboutBetaDialog', null],
    ['promotionDialog', null],
    ['resultDialog', null],
    ['voiceCloneDialog', null],
  ];
  for (const [id, prepare] of compact) {
    await openDialog(page, id, prepare);
    const metric = await snapshot(page, `#${id}`);
    assertInside(metric, safe, view, id);
    assert.ok(metric.scrollHeight <= metric.clientHeight + 2 || ['auto', 'scroll'].includes(metric.overflowY), `${id}: tall content cannot scroll internally ${JSON.stringify(metric)}`);
    results[id] = metric;
    await page.evaluate((dialogId) => document.getElementById(dialogId).close(), id);
  }

  await openDialog(page, 'principlesDialog', 'principles');
  for (const selector of ['#principlesDialog', '#principlesDialog .modal-card', '#principlesDialog .dialogactions']) {
    const metric = await snapshot(page, selector);
    assertInside(metric, safe, view, selector);
    results[selector] = metric;
  }
  await page.evaluate(() => document.querySelector('#principlesDialog').close());

  await openDialog(page, 'replayDialog');
  for (const selector of ['#replayDialog', '#replayDialog .replay-shell', '#replayDialog .replay-header']) {
    const metric = await snapshot(page, selector);
    assertInside(metric, safe, view, selector);
    results[selector] = metric;
  }
  await page.evaluate(() => document.querySelector('#replayDialog').close());

  await page.evaluate(() => {
    const toast = document.querySelector('#toast');
    toast.textContent = 'Safe area check';
    toast.classList.add('show');
  });
  await page.waitForTimeout(250);
  const toast = await snapshot(page, '#toast');
  assertInside({ ...toast, visible: true }, safe, view, 'toast');
  results.toast = toast;
  await page.evaluate(() => document.querySelector('#toast').classList.remove('show'));
  return results;
}

async function verifyOrientation(page, viewportSize, safe, label) {
  await page.setViewportSize(viewportSize);
  await setSafeArea(page, safe);
  const actual = await viewport(page);
  assert.ok(closeEnough(actual.width, viewportSize.width, 1), `${label}: unexpected width ${actual.width}`);
  assert.ok(closeEnough(actual.height, viewportSize.height, 1), `${label}: unexpected height ${actual.height}`);
  const wizard = await verifyWizard(page, safe);
  const insights = await verifyInsights(page, safe);
  const game = await verifyGame(page, safe);
  const dialogs = await verifyDialogs(page, safe);
  return { label, viewport: actual, safe, wizard, insights, game, dialogs };
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
  });

  try {
    await openApp(page);
    const portrait = await verifyOrientation(page, { width: 390, height: 844 }, { top: 47, right: 0, bottom: 34, left: 0 }, 'iPhone portrait');
    const landscape = await verifyOrientation(page, { width: 844, height: 390 }, { top: 12, right: 47, bottom: 21, left: 47 }, 'iPhone landscape');
    assert.deepEqual(errors, [], errors.join('\n'));
    console.log(JSON.stringify({ ok: true, url: URL, portrait, landscape }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});