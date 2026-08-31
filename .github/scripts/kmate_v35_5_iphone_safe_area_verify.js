const assert = require('node:assert/strict');
const { webkit } = require('playwright');

const url = process.env.KMATE_URL || 'http://127.0.0.1:4173/kmate-trainer/?safe-area=v35.5';

async function metrics(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('#replayDialog');
    const shell = dialog?.querySelector('.replay-shell');
    const header = dialog?.querySelector('.replay-header');
    const rect = dialog?.getBoundingClientRect();
    const shellRect = shell?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    const style = dialog ? getComputedStyle(dialog) : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      dialog: rect && { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height },
      shell: shellRect && { top: shellRect.top, right: shellRect.right, bottom: shellRect.bottom, left: shellRect.left, width: shellRect.width, height: shellRect.height },
      header: headerRect && { top: headerRect.top, bottom: headerRect.bottom, height: headerRect.height },
      computed: style && { position: style.position, top: style.top, bottom: style.bottom, height: style.height, maxHeight: style.maxHeight },
    };
  });
}

async function openReview(page) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#replayDialog .replay-shell');
  await page.evaluate(() => {
    const dialog = document.querySelector('#replayDialog');
    if (dialog.open) dialog.close();
    dialog.showModal();
  });
  await page.waitForTimeout(80);
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

  try {
    await openReview(page);
    const normal = await metrics(page);
    assert.ok(normal.dialog, JSON.stringify(normal));
    assert.ok(normal.shell, JSON.stringify(normal));
    assert.ok(normal.header, JSON.stringify(normal));
    assert.equal(normal.computed.position, 'fixed', JSON.stringify(normal));
    assert.ok(normal.dialog.top >= 11, JSON.stringify(normal));
    assert.ok(normal.viewport.height - normal.dialog.bottom >= 7, JSON.stringify(normal));
    assert.ok(normal.dialog.height < normal.viewport.height - 17, JSON.stringify(normal));
    assert.ok(normal.shell.top >= normal.dialog.top - 1, JSON.stringify(normal));
    assert.ok(normal.shell.bottom <= normal.dialog.bottom + 1, JSON.stringify(normal));
    assert.ok(normal.header.top >= normal.dialog.top + 6, JSON.stringify(normal));

    // Simulate the larger safe-area values used by modern notched iPhones.
    await page.evaluate(() => {
      const dialog = document.querySelector('#replayDialog');
      dialog.style.setProperty('--kmate-review-safe-top', '47px');
      dialog.style.setProperty('--kmate-review-safe-bottom', '34px');
    });
    await page.waitForTimeout(50);
    const notched = await metrics(page);
    assert.ok(notched.dialog.top >= 46.5 && notched.dialog.top <= 47.5, JSON.stringify(notched));
    const bottomGap = notched.viewport.height - notched.dialog.bottom;
    assert.ok(bottomGap >= 33.5 && bottomGap <= 34.5, JSON.stringify(notched));
    assert.ok(notched.dialog.height <= notched.viewport.height - 80, JSON.stringify(notched));
    assert.ok(notched.header.top >= notched.dialog.top + 6, JSON.stringify(notched));

    console.log(JSON.stringify({ normal, notched }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
