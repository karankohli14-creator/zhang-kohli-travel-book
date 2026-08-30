const { chromium } = require('playwright');
const assert = require('assert');

function installSpeechMock() {
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
        }, 25);
      }, 8);
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: TestUtterance });
}

function collectPageErrors(page) {
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

async function openReadyPage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = collectPageErrors(page);
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.waitForFunction(() => window.__KMATE__?.test && !document.querySelector('#startButton').disabled);
  return { page, errors };
}

async function verifyDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(installSpeechMock);
  const { page, errors } = await openReadyPage(context);

  // Best/Excellent/Good moves are classified silently. The coach panel, arrows,
  // clock pause, and 50/50 layout must not appear while analysis is pending.
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await page.waitForFunction(() => document.body.classList.contains('game-mode'));
  await page.waitForTimeout(100);
  const beforeGood = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    return {
      board: { width: board.width, height: board.height, top: board.top, bottom: board.bottom },
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });
  await page.click('#board .sq[data-square="e2"]');
  await page.click('#board .sq[data-square="e4"]');
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.silentGate);
  await page.waitForTimeout(80);
  const pendingGood = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    return {
      state: window.__KMATE__.state().liveCoach,
      panelHidden: document.querySelector('#liveCoachBoardPanel').hidden,
      activeLayout: document.querySelector('#gameView').classList.contains('live-coach-active'),
      arrows: document.querySelectorAll('#board .live-coach-board-arrows line').length,
      board: { width: board.width, height: board.height, top: board.top, bottom: board.bottom },
      clockPaused: window.__KMATE__.state().clockPaused,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });
  console.log('PENDING_GOOD', JSON.stringify({ beforeGood, pendingGood }));
  assert.ok(pendingGood.state.awaiting && pendingGood.state.silentGate, JSON.stringify(pendingGood));
  assert.ok(pendingGood.panelHidden, JSON.stringify(pendingGood));
  assert.ok(!pendingGood.activeLayout, JSON.stringify(pendingGood));
  assert.strictEqual(pendingGood.arrows, 0, JSON.stringify(pendingGood));
  assert.ok(!pendingGood.clockPaused, JSON.stringify(pendingGood));
  const widthRatio = pendingGood.board.width / beforeGood.board.width;
  assert.ok(widthRatio >= 0.96 && widthRatio <= 1.04, JSON.stringify({ beforeGood, pendingGood, widthRatio }));
  assert.ok(Math.abs(pendingGood.board.top - beforeGood.board.top) <= 14, JSON.stringify({ beforeGood, pendingGood }));
  assert.strictEqual(pendingGood.scrollY, 0, JSON.stringify(pendingGood));
  assert.ok(pendingGood.scrollHeight <= pendingGood.viewportHeight + 2, JSON.stringify(pendingGood));

  const goodResult = await page.evaluate(() => window.__KMATE__.test.forceGoodMoveAnalysis());
  assert.strictEqual(goodResult.quality, 'excellent', JSON.stringify(goodResult));
  await page.waitForFunction(() => !window.__KMATE__.state().liveCoach.awaiting);
  await page.waitForTimeout(80);
  const afterGood = await page.evaluate(() => ({
    panelHidden: document.querySelector('#liveCoachBoardPanel').hidden,
    activeLayout: document.querySelector('#gameView').classList.contains('live-coach-active'),
    arrows: document.querySelectorAll('#board .live-coach-board-arrows line').length,
    clockPaused: window.__KMATE__.state().clockPaused,
    scrollY: window.scrollY,
  }));
  console.log('AFTER_GOOD', JSON.stringify(afterGood));
  assert.ok(afterGood.panelHidden && !afterGood.activeLayout, JSON.stringify(afterGood));
  assert.strictEqual(afterGood.arrows, 0, JSON.stringify(afterGood));
  assert.ok(!afterGood.clockPaused, JSON.stringify(afterGood));
  assert.strictEqual(afterGood.scrollY, 0, JSON.stringify(afterGood));

  // Deterministic tactic: 1.Kf3? permits 1...Nxd4, while 1.Nxf5 removes
  // the attacking knight. The prose must name the exact piece and squares.
  await page.evaluate(() => window.__KMATE__.test.startConcreteTacticDemo());
  await page.waitForFunction(() => window.__KMATE__.state().current === 'v34-concrete-tactic-demo');
  await page.click('#board .sq[data-square="e2"]');
  await page.click('#board .sq[data-square="f3"]');
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.silentGate);
  const beforeBadResult = await page.evaluate(() => ({
    hidden: document.querySelector('#liveCoachBoardPanel').hidden,
    active: document.querySelector('#gameView').classList.contains('live-coach-active'),
    paused: window.__KMATE__.state().clockPaused,
    arrows: document.querySelectorAll('#board .live-coach-board-arrows line').length,
  }));
  assert.ok(beforeBadResult.hidden && !beforeBadResult.active && !beforeBadResult.paused, JSON.stringify(beforeBadResult));
  assert.strictEqual(beforeBadResult.arrows, 0, JSON.stringify(beforeBadResult));

  const badResult = await page.evaluate(() => window.__KMATE__.test.forceConcreteBadMoveAnalysis());
  assert.strictEqual(badResult.quality, 'blunder', JSON.stringify(badResult));
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.open && window.__KMATE__.state().clockPaused);
  await page.waitForSelector('#liveCoachBoardPanel:not([hidden])');
  await page.waitForTimeout(200);

  const review = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    const panel = document.querySelector('#liveCoachBoardPanel').getBoundingClientRect();
    return {
      why: document.querySelector('#liveCoachWhy').textContent.trim(),
      best: document.querySelector('#liveCoachBestText').textContent.trim(),
      summary: document.querySelector('#liveCoachSummary').textContent.trim(),
      playedLine: document.querySelector('#liveCoachPlayedLine').textContent.trim(),
      bestLine: document.querySelector('#liveCoachLine').textContent.trim(),
      principles: document.querySelector('#liveCoachPrincipleList').textContent.replace(/\s+/g, ' ').trim(),
      rating: document.querySelector('#liveCoachRating').textContent.trim(),
      arrows: document.querySelectorAll('#board .live-coach-board-arrows line').length,
      ratio: board.width / panel.width,
      board: { top: board.top, bottom: board.bottom, width: board.width },
      panel: { top: panel.top, bottom: panel.bottom, width: panel.width },
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
    };
  });
  console.log('CONCRETE_REVIEW', JSON.stringify(review));
  assert.strictEqual(review.rating, 'Blunder', JSON.stringify(review));
  assert.ok(review.why.includes('Nxd4'), JSON.stringify(review));
  assert.ok(/knight/i.test(review.why) && review.why.includes('D4'), JSON.stringify(review));
  assert.ok(review.best.includes('Nxf5'), JSON.stringify(review));
  assert.ok(/knight/i.test(review.best) && review.best.includes('F5'), JSON.stringify(review));
  assert.ok(review.playedLine.includes('Kf3') && review.playedLine.includes('Nxd4'), JSON.stringify(review));
  assert.ok(review.bestLine.includes('Nxf5'), JSON.stringify(review));
  assert.ok(review.principles.includes('Nxd4') && review.principles.includes('D4'), JSON.stringify(review));
  assert.ok(review.arrows >= 2, JSON.stringify(review));
  assert.ok(review.ratio >= 0.70 && review.ratio <= 1.10, JSON.stringify(review));
  assert.ok(review.board.top >= 0 && review.board.bottom <= review.viewportHeight + 1, JSON.stringify(review));
  assert.ok(review.panel.top >= 0 && review.panel.bottom <= review.viewportHeight + 1, JSON.stringify(review));
  assert.strictEqual(review.scrollY, 0, JSON.stringify(review));

  await page.click('#liveCoachContinueButton');
  await page.waitForFunction(() => !window.__KMATE__.state().liveCoach.open && !window.__KMATE__.state().clockPaused);
  const resumed = await page.evaluate(() => ({
    hidden: document.querySelector('#liveCoachBoardPanel').hidden,
    active: document.querySelector('#gameView').classList.contains('live-coach-active'),
    scrollY: window.scrollY,
  }));
  assert.ok(resumed.hidden && !resumed.active, JSON.stringify(resumed));
  assert.strictEqual(resumed.scrollY, 0, JSON.stringify(resumed));

  if (errors.length) throw new Error(errors.join('\n'));
  await context.close();
  return { beforeGood, pendingGood, afterGood, beforeBadResult, badResult, review, resumed };
}

async function verifyMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(installSpeechMock);
  const { page, errors } = await openReadyPage(context);

  await page.evaluate(() => window.__KMATE__.test.startConcreteTacticDemo());
  await page.click('#board .sq[data-square="e2"]');
  await page.click('#board .sq[data-square="f3"]');
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.silentGate);
  const silent = await page.evaluate(() => ({
    panelHidden: document.querySelector('#liveCoachBoardPanel').hidden,
    active: document.querySelector('#gameView').classList.contains('live-coach-active'),
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    scrollY: window.scrollY,
  }));
  assert.ok(silent.panelHidden && !silent.active, JSON.stringify(silent));
  assert.ok(silent.scrollHeight <= silent.viewportHeight + 2, JSON.stringify(silent));
  assert.strictEqual(silent.scrollY, 0, JSON.stringify(silent));

  await page.evaluate(() => window.__KMATE__.test.forceConcreteBadMoveAnalysis());
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.open);
  await page.waitForTimeout(200);
  const review = await page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    const panel = document.querySelector('#liveCoachBoardPanel').getBoundingClientRect();
    return {
      board: { top: board.top, bottom: board.bottom, height: board.height },
      panel: { top: panel.top, bottom: panel.bottom, height: panel.height },
      ratio: board.height / panel.height,
      playedLine: document.querySelector('#liveCoachPlayedLine').textContent,
      bestLine: document.querySelector('#liveCoachLine').textContent,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
    };
  });
  assert.ok(review.ratio >= 0.70 && review.ratio <= 1.30, JSON.stringify(review));
  assert.ok(review.playedLine.includes('Nxd4') && review.bestLine.includes('Nxf5'), JSON.stringify(review));
  assert.ok(review.noHorizontalOverflow, JSON.stringify(review));
  assert.ok(review.scrollHeight <= review.viewportHeight + 2, JSON.stringify(review));
  assert.strictEqual(review.scrollY, 0, JSON.stringify(review));

  if (errors.length) throw new Error(errors.join('\n'));
  await context.close();
  return { silent, review };
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
