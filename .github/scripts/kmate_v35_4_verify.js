const assert = require('assert');
const { chromium, webkit } = require('playwright');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function seedProfile() {
  const records = [
    { id: 'm1', san: 'e4', uci: 'e2e4', bestMove: 'e2e4', from: 'e2', to: 'e4', color: 'w', ply: 1, fenBefore: START_FEN, cpLoss: 0, bestScore: 35, selectedScore: 35, quality: 'best', bestLine: ['e2e4'], selectedLine: ['e2e4'] },
    { id: 'm2', san: 'Nf3', uci: 'g1f3', bestMove: 'f1c4', from: 'g1', to: 'f3', color: 'w', ply: 3, fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', cpLoss: 20, bestScore: 30, selectedScore: 10, quality: 'excellent', bestLine: ['f1c4'], selectedLine: ['g1f3'] },
    { id: 'm3', san: 'a3', uci: 'a2a3', bestMove: 'd2d4', cpLoss: 50, quality: 'good' },
    { id: 'm4', san: 'h3', uci: 'h2h3', bestMove: 'e2e4', cpLoss: 90, quality: 'inaccuracy' },
    { id: 'm5', san: 'b3', uci: 'b2b3', bestMove: 'd2d4', cpLoss: 150, quality: 'mistake' },
    { id: 'm6', san: 'c3', uci: 'c2c3', bestMove: 'c2c4', cpLoss: 200, quality: 'miss' },
    { id: 'm7', san: 'f3', uci: 'f2f3', bestMove: 'e2e4', cpLoss: 300, quality: 'blunder' },
  ];
  const session = {
    id: 'summary-session',
    startedAt: new Date(Date.now() - 60000).toISOString(),
    endedAt: new Date().toISOString(),
    completed: true,
    outcome: 'loss',
    reason: 'timeout',
    startFen: START_FEN,
    finalFen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    phase: 'middlegame',
    opening: 'London System',
    theme: 'Calculation and candidate moves',
    tags: ['calculation', 'piece activity'],
    positionRating: 1600,
    requestedPositionRating: 1600,
    opponentRating: 1600,
    requestedOpponentRating: 1600,
    timeControl: '3+0',
    userColor: 'w',
    avgCpLoss: 115.7,
    analyzedMoves: 7,
    takebacks: 0,
    userMoves: records,
    moveSequence: [
      { ply: 1, color: 'w', from: 'e2', to: 'e4', san: 'e4', uci: 'e2e4', piece: 'p', captured: null, promotion: null, flags: 'b' },
      { ply: 2, color: 'b', from: 'e7', to: 'e5', san: 'e5', uci: 'e7e5', piece: 'p', captured: null, promotion: null, flags: 'b' },
      { ply: 3, color: 'w', from: 'g1', to: 'f3', san: 'Nf3', uci: 'g1f3', piece: 'n', captured: null, promotion: null, flags: 'n' },
      { ply: 4, color: 'b', from: 'b8', to: 'c6', san: 'Nc6', uci: 'b8c6', piece: 'n', captured: null, promotion: null, flags: 'n' },
    ],
  };
  const store = {
    version: 7,
    sessions: [session],
    legacy: { sessions: 0, wins: 0, draws: 0, losses: 0, best: 0 },
    settings: {
      phase: 'middlegame', opening: 'all', positionRating: 1600, opponentRating: 1600,
      timeControl: '3+0', side: 'w', sound: false, soundTheme: 'reference-crisp',
      trainingGoal: 'all', blindCalibration: false, autoHints: false, liveCoach: false,
      principleReview: true, coachVoice: false, coachVoiceURI: 'british-woman', coachVoiceRate: 0.92,
      coachAvatar: 'grandmaster',
    },
  };
  localStorage.setItem('kmate-position-v7', JSON.stringify(store));
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

async function openApp(browser, options, url) {
  const context = await browser.newContext(options);
  await context.addInitScript(seedProfile);
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  const errors = collectErrors(page);
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.ok(response?.ok(), `HTTP ${response?.status()}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.waitForFunction(() => document.documentElement.dataset.reviewUi === 'ready');
  await page.waitForFunction(() => window.__KMATE__?.version === '35.0-commercial-beta');
  await page.waitForFunction(() => window.__KMATE__?.appFlowVersion === '35.4-summary-first');
  await page.waitForFunction(() => window.__KMATE__?.reviewUiVersion === '35.4-summary-first');
  return { context, page, errors };
}

async function verifyCompositionApi(page) {
  const result = await page.evaluate(() => window.__KMATE__.reviewUiTest.compositionForRecords([
    { uci: 'e2e4', bestMove: 'e2e4', cpLoss: 0 },
    { uci: 'g1f3', bestMove: 'f1c4', cpLoss: 20 },
    { uci: 'a2a3', bestMove: 'd2d4', cpLoss: 50 },
    { uci: 'h2h3', bestMove: 'e2e4', cpLoss: 90 },
    { uci: 'b2b3', bestMove: 'd2d4', cpLoss: 150 },
    { uci: 'c2c3', bestMove: 'c2c4', cpLoss: 200 },
    { uci: 'f2f3', bestMove: 'e2e4', cpLoss: 300 },
  ]));
  assert.strictEqual(result.total, 7, JSON.stringify(result));
  for (const key of ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder']) {
    assert.strictEqual(result.counts[key], 1, JSON.stringify(result));
  }
  assert.strictEqual(result.rating, 59, JSON.stringify(result));
  return result;
}

async function verifyPrinciples(page, shortViewport = false) {
  await page.evaluate(() => window.__KMATE__.test.startTeachingDemo());
  await page.waitForSelector('#principlesDialog[open]');
  await page.waitForFunction(() => document.querySelectorAll('#principlesList .kmate-principle-row:not([hidden])').length === 5);
  await page.waitForTimeout(120);
  const metrics = await page.evaluate(() => {
    const dialog = document.querySelector('#principlesDialog');
    const card = dialog.querySelector('.modal-card');
    const list = document.querySelector('#principlesList');
    const start = document.querySelector('#principlesStartButton');
    const setup = document.querySelector('#principlesSetupButton');
    const startRect = start.getBoundingClientRect();
    const setupRect = setup.getBoundingClientRect();
    const center = { x: startRect.left + startRect.width / 2, y: startRect.top + startRect.height / 2 };
    const hit = document.elementFromPoint(center.x, center.y);
    return {
      visibleCards: document.querySelectorAll('#principlesList .kmate-principle-row:not([hidden])').length,
      descriptionsVisible: [...document.querySelectorAll('#principlesList .kmate-principle-row p')].filter(el => getComputedStyle(el).display !== 'none').length,
      scrollY: window.scrollY,
      documentScrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.visualViewport?.height || window.innerHeight,
      dialogScroll: { scroll: dialog.scrollHeight, client: dialog.clientHeight, overflow: getComputedStyle(dialog).overflow },
      cardScroll: { scroll: card.scrollHeight, client: card.clientHeight, overflow: getComputedStyle(card).overflow },
      listScroll: { scroll: list.scrollHeight, client: list.clientHeight, overflow: getComputedStyle(list).overflow },
      start: {
        text: start.textContent.trim(), top: startRect.top, bottom: startRect.bottom, height: startRect.height,
        font: parseFloat(getComputedStyle(start).fontSize), shadow: getComputedStyle(start).boxShadow,
        hit: Boolean(hit && (hit === start || start.contains(hit))),
      },
      setup: { top: setupRect.top, bottom: setupRect.bottom, shadow: getComputedStyle(setup).boxShadow },
      bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
    };
  });
  assert.strictEqual(metrics.visibleCards, 5, JSON.stringify(metrics));
  assert.strictEqual(metrics.scrollY, 0, JSON.stringify(metrics));
  assert.ok(metrics.documentScrollHeight <= metrics.viewportHeight + 2, JSON.stringify(metrics));
  assert.ok(metrics.dialogScroll.scroll <= metrics.dialogScroll.client + 2, JSON.stringify(metrics));
  assert.ok(metrics.cardScroll.scroll <= metrics.cardScroll.client + 2, JSON.stringify(metrics));
  assert.ok(metrics.listScroll.scroll <= metrics.listScroll.client + 2, JSON.stringify(metrics));
  assert.strictEqual(metrics.dialogScroll.overflow, 'hidden', JSON.stringify(metrics));
  assert.strictEqual(metrics.cardScroll.overflow, 'hidden', JSON.stringify(metrics));
  assert.strictEqual(metrics.listScroll.overflow, 'hidden', JSON.stringify(metrics));
  assert.strictEqual(metrics.start.text, 'Start clock', JSON.stringify(metrics));
  assert.ok(metrics.start.top >= 0 && metrics.start.bottom <= metrics.viewportHeight + 1, JSON.stringify(metrics));
  assert.ok(metrics.setup.top >= 0 && metrics.setup.bottom <= metrics.viewportHeight + 1, JSON.stringify(metrics));
  assert.ok(metrics.start.font >= 12, JSON.stringify(metrics));
  assert.notStrictEqual(metrics.start.shadow, 'none', JSON.stringify(metrics));
  assert.notStrictEqual(metrics.setup.shadow, 'none', JSON.stringify(metrics));
  assert.ok(metrics.start.hit, JSON.stringify(metrics));
  assert.ok(metrics.bodyLocked, JSON.stringify(metrics));
  if (shortViewport) assert.strictEqual(metrics.descriptionsVisible, 0, JSON.stringify(metrics));

  await page.locator('#principlesStartButton').click();
  await page.waitForFunction(() => !document.querySelector('#principlesDialog').open);
  await page.waitForSelector('#gameView:not([hidden]) #board .piece');
  return metrics;
}

async function openSeededReplay(page) {
  if (!document) throw new Error('unreachable');
}

async function verifyResultAndReplaySummary(page) {
  await page.evaluate(() => {
    const dialog = document.querySelector('#resultDialog');
    if (!dialog.open) dialog.showModal();
  });
  await page.waitForSelector('#resultDialog[open] #kmateResultSummary');
  await page.waitForTimeout(80);
  const result = await page.evaluate(() => ({
    summaryText: document.querySelector('#kmateResultSummary').textContent.replace(/\s+/g, ' ').trim(),
    oldCoachHidden: document.querySelector('#resultCoach').hidden,
    oldReviewHidden: document.querySelector('#postReview').hidden,
    replayLabel: document.querySelector('#resultReplay').textContent.trim(),
    replayShadow: getComputedStyle(document.querySelector('#resultReplay')).boxShadow,
  }));
  assert.ok(result.summaryText.includes('59') && result.summaryText.includes('Best') && result.summaryText.includes('Mistakes') && result.summaryText.includes('Misses') && result.summaryText.includes('Blunders'), JSON.stringify(result));
  assert.ok(result.oldCoachHidden && result.oldReviewHidden, JSON.stringify(result));
  assert.strictEqual(result.replayLabel, 'Open coach review →', JSON.stringify(result));
  assert.notStrictEqual(result.replayShadow, 'none', JSON.stringify(result));
  await page.evaluate(() => document.querySelector('#resultDialog').close());

  await page.click('#wizardInsightsButton');
  await page.waitForFunction(() => !document.querySelector('#insightsView').hidden);
  await page.waitForSelector('[data-replay-session="summary-session"]');
  await page.click('[data-replay-session="summary-session"]');
  await page.waitForSelector('#replayDialog[open] #coachReviewSummary:not([hidden])');
  await page.waitForTimeout(100);

  const summary = await page.evaluate(() => {
    const dialog = document.querySelector('#replayDialog');
    const content = document.querySelector('#coachReviewSummaryContent');
    const layout = dialog.querySelector('.replay-layout');
    const generic = `${document.querySelector('#replayCoachTitle')?.textContent || ''} ${document.querySelector('#replayCoachText')?.textContent || ''}`;
    const button = document.querySelector('#startDetailedCoachReview');
    const rect = button.getBoundingClientRect();
    return {
      title: document.querySelector('#replayTitle').textContent.trim(),
      subtitle: document.querySelector('#replaySubtitle').textContent.trim(),
      content: content.textContent.replace(/\s+/g, ' ').trim(),
      layoutHidden: layout.hidden || getComputedStyle(layout).display === 'none',
      summaryVisible: !document.querySelector('#coachReviewSummary').hidden,
      generic,
      button: { text: button.textContent.trim(), bottom: rect.bottom, shadow: getComputedStyle(button).boxShadow },
      viewportHeight: window.visualViewport?.height || window.innerHeight,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      state: window.__KMATE__.reviewSummaryState(),
    };
  });
  assert.strictEqual(summary.title, 'Coach review', JSON.stringify(summary));
  assert.strictEqual(summary.subtitle, 'Game summary', JSON.stringify(summary));
  assert.ok(summary.layoutHidden && summary.summaryVisible, JSON.stringify(summary));
  assert.ok(summary.content.includes('59') && summary.content.includes('Best') && summary.content.includes('Excellent') && summary.content.includes('Good'), JSON.stringify(summary));
  assert.ok(summary.content.includes('Inaccuracies') && summary.content.includes('Mistakes') && summary.content.includes('Misses') && summary.content.includes('Blunders'), JSON.stringify(summary));
  assert.ok(!/Orient yourself before replaying/i.test(summary.generic), JSON.stringify(summary));
  assert.ok(!/began from “Various”/i.test(summary.generic), JSON.stringify(summary));
  assert.strictEqual(summary.button.text, 'Start move-by-move review →', JSON.stringify(summary));
  assert.notStrictEqual(summary.button.shadow, 'none', JSON.stringify(summary));
  assert.ok(summary.button.bottom <= summary.viewportHeight + 1, JSON.stringify(summary));
  assert.strictEqual(summary.scrollY, 0, JSON.stringify(summary));
  assert.ok(summary.state.replaySummaryVisible, JSON.stringify(summary));

  await page.click('#startDetailedCoachReview');
  await page.waitForFunction(() => !document.querySelector('#replayDialog .replay-layout').hidden && document.querySelector('#coachReviewSummary').hidden);
  await page.waitForFunction(() => !document.querySelector('#replayComparison').hidden);
  const detailed = await page.evaluate(() => ({
    title: document.querySelector('#replayTitle').textContent.trim(),
    subtitle: document.querySelector('#replaySubtitle').textContent.trim(),
    coachTitle: document.querySelector('#replayCoachTitle').textContent.trim(),
    comparisonVisible: !document.querySelector('#replayComparison').hidden,
    index: window.__KMATE__.state().replay.index,
    firstDecisionIndex: window.__KMATE__.reviewSummaryState().firstDecisionIndex,
    backText: document.querySelector('#replayBackToReview').textContent.trim(),
  }));
  assert.strictEqual(detailed.title, 'Move-by-move coach review', JSON.stringify(detailed));
  assert.ok(detailed.comparisonVisible, JSON.stringify(detailed));
  assert.ok(/^Decision 1/.test(detailed.coachTitle), JSON.stringify(detailed));
  assert.ok(!/Orient yourself/i.test(detailed.coachTitle), JSON.stringify(detailed));
  assert.strictEqual(detailed.index, detailed.firstDecisionIndex, JSON.stringify(detailed));
  assert.strictEqual(detailed.backText, 'Game summary', JSON.stringify(detailed));

  await page.click('#replayBackToReview');
  await page.waitForFunction(() => !document.querySelector('#coachReviewSummary').hidden && document.querySelector('#replayDialog .replay-layout').hidden);
  const returned = await page.evaluate(() => ({
    title: document.querySelector('#replayTitle').textContent.trim(),
    visible: !document.querySelector('#coachReviewSummary').hidden,
  }));
  assert.ok(returned.visible && returned.title === 'Coach review', JSON.stringify(returned));
  return { result, summary, detailed, returned };
}

async function runLocalScenario(browserType, name, options, url, shortViewport = false) {
  const browser = await browserType.launch({ headless: true });
  const { context, page, errors } = await openApp(browser, options, url);
  try {
    const composition = await verifyCompositionApi(page);
    const principles = await verifyPrinciples(page, shortViewport);
    await page.evaluate(() => {
      const gameView = document.querySelector('#gameView');
      const setupView = document.querySelector('#setupView');
      const insightsView = document.querySelector('#insightsView');
      gameView.hidden = true;
      setupView.hidden = false;
      insightsView.hidden = true;
      document.body.classList.remove('game-mode');
      document.documentElement.classList.remove('game-mode');
      document.body.classList.add('setup-wizard-mode');
      document.documentElement.classList.add('setup-wizard-root');
      window.__KMATE__.showSetupPage?.('welcome');
    });
    const review = await verifyResultAndReplaySummary(page);
    if (errors.length) throw new Error(`${name}: ${errors.join('\n')}`);
    return { name, composition, principles, review };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runPublicScenario(url) {
  const browser = await webkit.launch({ headless: true });
  const { context, page, errors } = await openApp(browser, {
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  }, url);
  try {
    const composition = await verifyCompositionApi(page);
    const review = await verifyResultAndReplaySummary(page);
    if (errors.length) throw new Error(`Public WebKit: ${errors.join('\n')}`);
    return { composition, review };
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  const publicUrl = process.env.KMATE_PUBLIC_URL;
  if (publicUrl) {
    const result = await runPublicScenario(publicUrl);
    console.log(JSON.stringify({ ok: true, public: result }, null, 2));
    return;
  }

  const url = process.env.KMATE_TEST_URL || 'http://127.0.0.1:4173/kmate-trainer/?review=v35-4-local';
  const desktop = await runLocalScenario(chromium, 'Chromium desktop', { viewport: { width: 1440, height: 900 } }, url, false);
  const phone = await runLocalScenario(webkit, 'WebKit phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, url, true);
  const shortPhone = await runLocalScenario(webkit, 'WebKit short phone', { viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, url, true);
  console.log(JSON.stringify({ ok: true, desktop, phone, shortPhone }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
