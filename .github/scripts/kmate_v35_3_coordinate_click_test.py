from pathlib import Path

path = Path('.github/scripts/kmate_v35_3_verify.js')
text = path.read_text()
old = """    await page.click('#principlesStartButton');
    await page.waitForFunction(() => !document.querySelector('#principlesDialog').open && document.body.classList.contains('game-mode'));"""
new = """    const startButton = page.locator('#principlesStartButton');
    const startBox = await startButton.boundingBox();
    assert.ok(startBox && startBox.width > 0 && startBox.height > 0, JSON.stringify(startBox));
    const startPoint = { x: startBox.x + startBox.width / 2, y: startBox.y + startBox.height / 2 };
    const hitTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest?.('#principlesStartButton')?.id || '', startPoint);
    assert.strictEqual(hitTarget, 'principlesStartButton', JSON.stringify({ startBox, startPoint, hitTarget }));
    if (options.hasTouch) await page.touchscreen.tap(startPoint.x, startPoint.y);
    else await page.mouse.click(startPoint.x, startPoint.y);
    await page.waitForFunction(() => !document.querySelector('#principlesDialog').open && document.body.classList.contains('game-mode'));"""
if old not in text:
    raise SystemExit('Principle start-button click marker was not found')
path.write_text(text.replace(old, new, 1))
