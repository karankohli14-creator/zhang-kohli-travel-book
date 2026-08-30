const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_PATH,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);

  const events = [];
  page.on('console', message => events.push({ type: `console:${message.type()}`, text: message.text() }));
  page.on('pageerror', error => events.push({ type: 'pageerror', text: error.stack || error.message }));
  page.on('requestfailed', request => events.push({
    type: 'requestfailed',
    text: `${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`,
  }));
  page.on('response', response => {
    if (response.status() >= 400) events.push({ type: 'response', text: `${response.status()} ${response.url()}` });
  });

  let gotoError = null;
  try {
    await page.goto('http://127.0.0.1:4173/kmate-v42/', { waitUntil: 'domcontentloaded', timeout: 12000 });
  } catch (error) {
    gotoError = error.stack || error.message;
  }

  await page.waitForTimeout(7000);
  const snapshot = await page.evaluate(() => ({
    href: location.href,
    title: document.title,
    readyState: document.readyState,
    dataReady: document.documentElement.dataset.ready || null,
    kmate: Boolean(window.__KMATE__),
    kmateVersion: window.__KMATE__?.version || null,
    kmBoot: Boolean(window.__KM_BOOT__),
    kmBootKeys: window.__KM_BOOT__ ? Object.keys(window.__KM_BOOT__) : [],
    loadError: document.querySelector('#loadError')?.textContent?.trim() || '',
    loadErrorClass: document.querySelector('#loadError')?.className || '',
    setupHidden: document.querySelector('#setupView')?.hidden,
    setupPage: document.body.dataset.setupPage || null,
    scripts: [...document.scripts].map(script => ({ src: script.src, type: script.type })),
    links: [...document.querySelectorAll('link')].map(link => ({ rel: link.rel, href: link.href })),
    bodyClasses: document.body.className,
    bodyTextStart: document.body.innerText.slice(0, 700),
  })).catch(error => ({ evaluateError: error.stack || error.message }));

  console.log(JSON.stringify({ gotoError, snapshot, events }, null, 2));
  await browser.close();

  if (!snapshot.kmate || snapshot.dataReady !== '1') process.exit(1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
