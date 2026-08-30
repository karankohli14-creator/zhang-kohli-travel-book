from pathlib import Path

path = Path('.github/scripts/kmate_v40_verify.js')
text = path.read_text()
old = """  await page.waitForFunction(() => {
    const button = document.querySelector('#startButton');
    return button && !button.disabled && button.textContent.includes('Generate position');
  });"""
new = """  await page.waitForTimeout(500);
  const startButtonState = await page.evaluate(() => {
    const button = document.querySelector('#startButton');
    return {
      exists: Boolean(button),
      disabled: button?.disabled,
      text: button?.textContent?.trim(),
      starting: button?.dataset?.starting,
      html: button?.outerHTML,
    };
  });
  console.log('START_BUTTON_STATE', JSON.stringify(startButtonState));
  assert.ok(startButtonState.exists && !startButtonState.disabled && startButtonState.text === 'Generate position', JSON.stringify(startButtonState));"""
if old not in text:
    raise SystemExit('Desktop start-button verification block was not found')
text = text.replace(old, new, 1)
old_mobile = "  await page.waitForFunction(() => !document.querySelector('#startButton').disabled);"
new_mobile = """  await page.waitForTimeout(300);
  const mobileStartButton = await page.evaluate(() => {
    const button = document.querySelector('#startButton');
    return { disabled: button?.disabled, text: button?.textContent?.trim(), html: button?.outerHTML };
  });
  assert.ok(!mobileStartButton.disabled && mobileStartButton.text === 'Generate position', JSON.stringify(mobileStartButton));"""
if old_mobile not in text:
    raise SystemExit('Mobile start-button verification block was not found')
path.write_text(text.replace(old_mobile, new_mobile, 1))
