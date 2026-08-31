from pathlib import Path

path = Path('.github/scripts/kmate_v35_2_warm_ui_verify.js')
text = path.read_text()
old = "  const backSoundBefore = await page.evaluate(() => window.__KMATE__.appFlowState().uiSoundCount);"
new = "  await page.waitForTimeout(60);\n  const backSoundBefore = await page.evaluate(() => window.__KMATE__.appFlowState().uiSoundCount);"
if old not in text:
    raise SystemExit('Back-button verifier line missing')
path.write_text(text.replace(old, new, 1))
