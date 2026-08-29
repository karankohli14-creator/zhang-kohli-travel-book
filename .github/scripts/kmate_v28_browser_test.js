const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_PATH,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    const voices = [{ name: 'Sonia Natural', lang: 'en-GB', voiceURI: 'sonia-natural', localService: true }];
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
      getVoices: () => voices,
      addEventListener: () => {},
      cancel() { this.speaking = false; },
      speak(utterance) {
        this.speaking = true;
        utterance.onstart?.();
        setTimeout(() => {
          this.speaking = false;
          utterance.onend?.();
        }, 25);
      },
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: TestUtterance });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('Failed to load resource') && text.includes('404')) return;
    errors.push(`console: ${text}`);
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');

  assert.strictEqual(await page.locator('#soundStyleSelect option[value="reference-crisp"]').count(), 1);
  await page.selectOption('#soundStyleSelect', 'reference-crisp');
  await page.click('#previewSoundButton');
  await page.waitForFunction(() => window.__KMATE__.state().sound.backend === 'decoded-wav-buffer');
  await page.click('#previewCaptureButton');
  await page.waitForFunction(() => window.__KMATE__.state().sound.lastKind === 'capture');
  let state = await page.evaluate(() => window.__KMATE__.state());
  assert.strictEqual(state.sound.theme, 'reference-crisp');
  assert.strictEqual(state.sound.backend, 'decoded-wav-buffer');
  assert.ok(state.sound.unlocked);

  const demo = await page.evaluate(() => window.__KMATE__.test.startTeachingDemo());
  assert.ok(demo.paused);
  assert.ok(demo.principles.length >= 5);
  await page.waitForSelector('#principlesDialog[open]');
  assert.ok(await page.locator('#principlesList .principle-card').count() >= 5);
  state = await page.evaluate(() => window.__KMATE__.state());
  assert.ok(state.clockPaused);
  assert.ok(state.principleReviewPending);

  await page.click('#principlesStartButton');
  await page.waitForFunction(() => !window.__KMATE__.state().principleReviewPending && !window.__KMATE__.state().clockPaused);

  await page.click('#board .sq[data-square="e2"]');
  await page.click('#board .sq[data-square="e4"]');
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.awaiting && window.__KMATE__.state().clockPaused);

  const injected = await page.evaluate(() => window.__KMATE__.test.forceLiveCoachIntervention());
  assert.ok(injected?.moveId);
  await page.waitForSelector('#liveCoachDialog[open]');
  assert.strictEqual((await page.locator('#liveCoachRating').textContent()).trim(), 'Blunder');
  assert.ok((await page.locator('#liveCoachWhy').textContent()).trim().length > 30);
  assert.ok((await page.locator('#liveCoachBestText').textContent()).trim().length > 30);
  assert.ok(await page.locator('#liveCoachPrinciples').isVisible());
  assert.ok(await page.locator('#liveCoachPrincipleList article').count() >= 1);
  assert.ok((await page.locator('#liveCoachLine').textContent()).trim().length > 3);
  state = await page.evaluate(() => window.__KMATE__.state());
  assert.ok(state.clockPaused);
  assert.ok(state.liveCoach.open);

  await page.click('#liveCoachContinueButton');
  await page.waitForFunction(() => !window.__KMATE__.state().liveCoach.open && !window.__KMATE__.state().clockPaused);
  await page.waitForTimeout(150);
  state = await page.evaluate(() => window.__KMATE__.state());
  assert.ok(state.thinking || state.turn === state.userColor || state.finalized);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

  const files = await page.evaluate(async () => {
    const paths = [
      './sounds/live-v28/kmate-reference-move-v28.wav?v=28.0.0',
      './sounds/live-v28/kmate-reference-capture-v28.wav?v=28.0.0',
      './sounds/live-v28/kmate-reference-check-v28.wav?v=28.0.0',
    ];
    return Promise.all(paths.map(async path => {
      const response = await fetch(path, { cache: 'no-store' });
      const bytes = await response.arrayBuffer();
      return { path, ok: response.ok, size: bytes.byteLength };
    }));
  });
  assert.ok(files.every(file => file.ok && file.size > 40_000), files);

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ ok: true, demo, state, files }, null, 2));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
