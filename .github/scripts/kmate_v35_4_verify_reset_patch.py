from pathlib import Path

path = Path('.github/scripts/kmate_v35_4_verify.js')
text = path.read_text()
old = """    const composition = await verifyCompositionApi(page);
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
    const review = await verifyResultAndReplaySummary(page);"""
new = """    const composition = await verifyCompositionApi(page);
    const principles = await verifyPrinciples(page, shortViewport);

    // The principles scenario creates a live teaching session. Reset the exact
    // seeded completed game before testing the independent post-game screens.
    await page.evaluate(seedProfile);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await page.waitForFunction(() => document.documentElement.dataset.reviewUi === 'ready');
    await page.waitForFunction(() => window.__KMATE__?.appFlowVersion === '35.4-summary-first');
    await page.waitForFunction(() => window.__KMATE__?.reviewUiVersion === '35.4-summary-first');
    const review = await verifyResultAndReplaySummary(page);"""
if old not in text:
    raise SystemExit('K-Mate v35.4 verification reset marker was not found')
path.write_text(text.replace(old, new, 1))
