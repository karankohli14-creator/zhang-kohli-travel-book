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
  await page.waitForFunction(() => window.__KMATE__?.reviewUiVersion === '35.3-principles-summary');
  return { browser, context, page, errors };
}

async function inspectPrinciples(page, phone) {
  await page.waitForSelector('#principlesDialog[open]');
  await page.waitForFunction(() => document.querySelectorAll('#principlesList .principle-focus-card').length > 0);
  const metrics = await page.evaluate(() => {
    const dialog = document.querySelector('#principlesDialog');
    const card = dialog.querySelector('.modal-card');
    const list = document.querySelector('#principlesList');
    const rows = [...list.querySelectorAll('.principle-focus-card')].filter(row => !row.hidden);
    const actions = [...dialog.querySelectorAll('.dialogactions button')].map(button => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        text: button.textContent.trim(),
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        fontSize: Number.parseFloat(style.fontSize),
        background: style.backgroundImage,
        shadow: style.boxShadow,
      };
    });
    const descriptions = rows.map(row => {
      const description = row.querySelector('.principle-mini-description');
      return description ? { text: description.textContent.trim(), display: getComputedStyle(description).display } : null;
    }).filter(Boolean);
    return {
      title: document.querySelector('#principlesPositionTitle').textContent.trim(),
      rows: rows.length,
      rowTitles: rows.map(row => row.querySelector('.principle-copy>b')?.textContent.trim()),
      descriptions,
      dialogScroll: dialog.scrollHeight - dialog.clientHeight,
      cardScroll: card.scrollHeight - card.clientHeight,
      listScroll: list.scrollHeight - list.clientHeight,
      documentScroll: document.documentElement.scrollHeight - (window.visualViewport?.height || window.innerHeight),
      scrollY: window.scrollY,
      viewportHeight: window.visualViewport?.height || window.innerHeight,
      actions,
    };
  });
  assert.ok(metrics.rows >= 3 && metrics.rows <= 5, JSON.stringify(metrics));
  assert.ok(metrics.title.includes('principles for this position'), JSON.stringify(metrics));
  assert.ok(metrics.rowTitles.every(Boolean), JSON.stringify(metrics));
  assert.ok(metrics.dialogScroll <= 2, JSON.stringify(metrics));
  assert.ok(metrics.cardScroll <= 2, JSON.stringify(metrics));
  assert.ok(metrics.listScroll <= 2, JSON.stringify(metrics));
  assert.ok(metrics.documentScroll <= 2, JSON.stringify(metrics));
  assert.strictEqual(metrics.scrollY, 0, JSON.stringify(metrics));
  assert.strictEqual(metrics.actions.length, 2, JSON.stringify(metrics));
  assert.ok(metrics.actions.some(action => action.text === 'Start clock'), JSON.stringify(metrics));
  for (const action of metrics.actions) {
    assert.ok(action.bottom <= metrics.viewportHeight + 1, JSON.stringify(metrics));
    assert.ok(action.height >= (phone ? 42 : 52), JSON.stringify(metrics));
    assert.ok(action.fontSize >= (phone ? 13 : 16), JSON.stringify(metrics));
    assert.ok(action.background.includes('gradient'), JSON.stringify(metrics));
    assert.ok(action.shadow && action.shadow !== 'none', JSON.stringify(metrics));
  }
  if (phone) assert.ok(metrics.descriptions.every(item => item.display === 'none'), JSON.stringify(metrics));
  else assert.ok(metrics.descriptions.every(item => item.text.length <= 105), JSON.stringify(metrics));
  return metrics;
}

async function verifyActualLocalFlow(browserType, name, options, url) {
  const { browser, context, page, errors } = await openApp(browserType, name, options, url);
  try {
    await page.evaluate(() => window.__KMATE__.test.startTeachingDemo());
    const principles = await inspectPrinciples(page, Boolean(options.hasTouch));
    await page.click('#principlesStartButton');
    await page.waitForFunction(() => !document.querySelector('#principlesDialog').open && document.body.classList.contains('game-mode'));

    await page.evaluate(() => window.__KMATE__.test.startConcreteTacticDemo());
    await page.waitForFunction(() => window.__KMATE__.state().current === 'v34-concrete-tactic-demo');
    await page.click('#board .sq[data-square="e2"]');
    await page.click('#board .sq[data-square="f3"]');
    await page.waitForFunction(() => window.__KMATE__.state().lastMove?.actor === 'user');
    const forced = await page.evaluate(() => window.__KMATE__.test.forceConcreteBadMoveAnalysis());
    assert.strictEqual(forced.quality, 'blunder', JSON.stringify(forced));
    await page.waitForFunction(() => window.__KMATE__.state().liveCoach.open);
    await page.click('#liveCoachContinueButton');
    await page.waitForFunction(() => !window.__KMATE__.state().liveCoach.open);
    await page.evaluate(() => window.__KMATE__.test.forceTimeout('w'));
    await page.waitForSelector('#resultDialog[open]');
    await page.waitForSelector('#kmateGameSummary');
    await page.evaluate(() => window.__KMATE__.refreshGameSummary());

    const result = await page.evaluate(() => {
      const state = window.__KMATE__.reviewUiState();
      const summary = document.querySelector('#kmateGameSummary');
      const rating = summary.querySelector('.game-rating-orb b')?.textContent.trim();
      const items = Object.fromEntries([...summary.querySelectorAll('.game-composition-item')].map(item => [
        item.querySelector('span').textContent.trim(),
        Number(item.querySelector('b').textContent),
      ]));
      return {
        state,
        rating,
        items,
        coachHidden: getComputedStyle(document.querySelector('#resultCoach')).display === 'none',
        oldReviewHidden: getComputedStyle(document.querySelector('#postReview')).display === 'none',
        replayText: document.querySelector('#resultReplay').textContent.trim(),
        containsGeneric: document.querySelector('#resultDialog').textContent.includes('Orient yourself before replaying'),
      };
    });
    assert.ok(Number(result.rating) >= 0 && Number(result.rating) <= 100, JSON.stringify(result));
    assert.strictEqual(result.items.Blunders, 1, JSON.stringify(result));
    assert.ok(result.coachHidden && result.oldReviewHidden, JSON.stringify(result));
    assert.ok(result.replayText.includes('Open detailed coach review'), JSON.stringify(result));
    assert.ok(!result.containsGeneric, JSON.stringify(result));

    await page.click('#resultReplay');
    await page.waitForSelector('#replayDialog[open]');
    await page.waitForFunction(() => {
      const title = document.querySelector('#replayCoachTitle')?.textContent || '';
      const rating = document.querySelector('#replayRating')?.textContent?.toLowerCase() || '';
      return !/orient yourself|original position|start with/i.test(title) && !['start', 'position', 'opponent'].includes(rating);
    });
    const replay = await page.evaluate(() => ({
      title: document.querySelector('#replayTitle').textContent.trim(),
      coachTitle: document.querySelector('#replayCoachTitle').textContent.trim(),
      rating: document.querySelector('#replayRating').textContent.trim(),
      index: Number(document.querySelector('#replaySlider').value),
      subtitle: document.querySelector('#replaySubtitle').textContent.trim(),
      generic: /orient yourself|original position|start with/i.test(document.querySelector('#replayCoachTitle').textContent),
    }));
    assert.strictEqual(replay.title, 'Detailed coach review', JSON.stringify(replay));
    assert.ok(replay.index > 0, JSON.stringify(replay));
    assert.ok(!replay.generic, JSON.stringify(replay));
    assert.ok(!/^Various\b/i.test(replay.subtitle), JSON.stringify(replay));

    if (errors.length) throw new Error(errors.join('\n'));
    return { name, principles, result, replay };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function navigatePublicToPrinciples(page) {
  await page.click('[data-wizard-next="position"]');
  await page.click('.wizard-page[data-wizard-page="position"] [data-wizard-next="challenge"]');
  await page.click('#sideSeg [data-side="w"]');
  await page.click('.wizard-page[data-wizard-page="challenge"] [data-wizard-next="coaching"]');
  await page.locator('#principleReview').check();
  await page.locator('#liveCoach').uncheck();
  await page.locator('#liveCoachVoice').uncheck();
  await page.waitForFunction(() => !document.querySelector('#startButton').disabled, null, { timeout: 70000 });
  await page.locator('#startButton').tap();
  await page.waitForSelector('#principlesDialog[open]', { timeout: 20000 });
}

async function verifyPublic(url) {
  const { browser, context, page, errors } = await openApp(webkit, 'Public WebKit phone', {
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  }, url);
  try {
    await navigatePublicToPrinciples(page);
    const principles = await inspectPrinciples(page, true);
    await page.click('#principlesStartButton');
    await page.waitForSelector('#gameView:not([hidden]) #board .piece', { timeout: 20000 });

    // Verify that the deployed result-summary renderer is present and calculates
    // all six move categories without relying on local-only test hooks.
    await page.evaluate(() => {
      const list = document.querySelector('#moveList');
      list.innerHTML = `
        <span class="user-move quality-best"><span class="move-rating quality-best">Best</span></span>
        <span class="user-move quality-excellent"><span class="move-rating quality-excellent">Excellent</span></span>
        <span class="user-move quality-good"><span class="move-rating quality-good">Good</span></span>
        <span class="user-move quality-inaccuracy"><span class="move-rating quality-inaccuracy">Inaccurate</span></span>
        <span class="user-move quality-miss"><span class="move-rating quality-miss">Miss</span></span>
        <span class="user-move quality-blunder"><span class="move-rating quality-blunder">Blunder</span></span>`;
      const dialog = document.querySelector('#resultDialog');
      if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
      else dialog.setAttribute('open', '');
      window.__KMATE__.refreshGameSummary();
    });
    await page.waitForSelector('#kmateGameSummary');
    const summary = await page.evaluate(() => ({
      version: window.__KMATE__.reviewUiVersion,
      rating: document.querySelector('.game-rating-orb b').textContent.trim(),
      cards: [...document.querySelectorAll('.game-composition-item')].map(item => ({
        label: item.querySelector('span').textContent.trim(), count: Number(item.querySelector('b').textContent),
      })),
      replayText: document.querySelector('#resultReplay').textContent.trim(),
      generic: document.querySelector('#resultDialog').textContent.includes('Orient yourself before replaying'),
    }));
    assert.strictEqual(summary.version, '35.3-principles-summary', JSON.stringify(summary));
    assert.strictEqual(summary.cards.length, 6, JSON.stringify(summary));
    assert.ok(summary.cards.every(card => card.count === 1), JSON.stringify(summary));
    assert.ok(Number(summary.rating) > 0, JSON.stringify(summary));
    assert.ok(summary.replayText.includes('detailed coach review') || summary.replayText.includes('Detailed review unavailable'), JSON.stringify(summary));
    assert.ok(!summary.generic, JSON.stringify(summary));
    if (errors.length) throw new Error(errors.join('\n'));
    return { principles, summary };
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  if (process.env.KMATE_PUBLIC_URL) {
    const publicResult = await verifyPublic(process.env.KMATE_PUBLIC_URL);
    console.log(JSON.stringify({ ok: true, publicResult }, null, 2));
    return;
  }
  const url = process.env.KMATE_TEST_URL || 'http://127.0.0.1:4173/kmate-trainer/?review=v35-3-local';
  const desktop = await verifyActualLocalFlow(chromium, 'Chromium desktop', { viewport: { width: 1440, height: 900 } }, url);
  const phone = await verifyActualLocalFlow(webkit, 'WebKit phone', {
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  }, url);
  console.log(JSON.stringify({ ok: true, desktop, phone }, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
