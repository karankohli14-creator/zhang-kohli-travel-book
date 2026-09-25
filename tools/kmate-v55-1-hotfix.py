from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Expected {label} block was not found in {path}.")
    path.write_text(text.replace(old, new, 1))


path = Path("kmate-trainer/unified-button-sound-v55.js")
text = path.read_text()
text = text.replace(
    "const KMATE_UNIFIED_BUTTON_SOUND_V55 = '55.0.0';",
    "const KMATE_UNIFIED_BUTTON_SOUND_V55 = '55.1.0';",
)
old = """  // Older K-Mate layers attach their own pointerdown sounds. Stopping only the
  // pointerdown propagation keeps the eventual click/action intact while
  // guaranteeing that exactly one button sound is heard.
  event.stopImmediatePropagation();
  km55SuppressedLegacyTaps += 1;"""
new = """  // Do not stop propagation: play-page controls need their pointer events.
  // Legacy sound layers detect v55 and opt out, preserving one consistent tap.
  event.kmateUnifiedButtonSoundHandled = true;
  km55SuppressedLegacyTaps += 1;"""
if old not in text:
    raise SystemExit("Expected v55 pointer suppression block was not found.")
path.write_text(text.replace(old, new, 1))

replace_once(
    Path("kmate-trainer/mobile-game-ux-v48.js"),
    """  document.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;""",
    """  document.addEventListener('pointerdown', (event) => {
    if (document.documentElement.classList.contains('kmate-unified-button-sound-v55')) return;
    const target = event.target instanceof Element ? event.target : null;""",
    "v48 soft-control listener",
)
replace_once(
    Path("kmate-trainer/appflow-v35.js"),
    """  function playUiWoodTap(strength = 1) {
    if (!uiSoundsAllowed()) return;""",
    """  function playUiWoodTap(strength = 1) {
    if (document.documentElement.classList.contains('kmate-unified-button-sound-v55')) return;
    if (!uiSoundsAllowed()) return;""",
    "app-flow sound function",
)
replace_once(
    Path("kmate-trainer/review-v35-4.js"),
    """  function playInterfaceTap(strong = false) {
    if (!appSoundEnabled()) return false;""",
    """  function playInterfaceTap(strong = false) {
    if (document.documentElement.classList.contains('kmate-unified-button-sound-v55')) return false;
    if (!appSoundEnabled()) return false;""",
    "review sound function",
)

path = Path("kmate-trainer/app-v7.js")
path.write_text(path.read_text().replace(
    "./unified-button-sound-v55.js?v=55.0.0",
    "./unified-button-sound-v55.js?v=55.1.0",
))
path = Path("kmate-trainer/index.html")
path.write_text(path.read_text().replace("app-v7.js?v=55.0.0", "app-v7.js?v=55.1.0"))

path = Path("kmate-trainer/tests/coach-layout-v55.spec.mjs")
text = path.read_text()
marker = "test('desktop coaching and hints sit beside the board rather than covering it'"
test_block = r'''

test('play-page menu and coach-audio buttons receive pointer events and perform their actions', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page, { width: 390, height: 844 });
  await page.evaluate(() => window.__KMATE__.test.startLiveCoachPrincipleDemo());
  await expect(page.locator('#gameView')).toBeVisible();
  await expect(page.locator('#board > .sq')).toHaveCount(64, { timeout: 30_000 });

  await page.evaluate(() => {
    window.__km55TopControlClicks = { menu: 0, audio: 0 };
    document.querySelector('#panelToggleButton').addEventListener('click', () => {
      window.__km55TopControlClicks.menu += 1;
    });
    document.querySelector('#gameCoachAudioButton').addEventListener('click', () => {
      window.__km55TopControlClicks.audio += 1;
    });
  });

  const before = await page.evaluate(() => ({
    unified: window.__KMATE_UNIFIED_BUTTON_SOUND_V55__.state().taps,
    legacy: window.__KMATE_GAME_UX_V48__.state().softButtonTaps,
  }));

  await page.locator('#panelToggleButton').click();
  await expect(page.locator('#panelToggleButton')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('body')).toHaveClass(/game-panel-open/);

  await page.locator('#gameCoachAudioButton').click();
  await expect.poll(
    () => page.evaluate(() => window.__km55TopControlClicks.audio),
    { timeout: 5_000 },
  ).toBe(1);

  const after = await page.evaluate(() => ({
    clicks: window.__km55TopControlClicks,
    unified: window.__KMATE_UNIFIED_BUTTON_SOUND_V55__.state().taps,
    legacy: window.__KMATE_GAME_UX_V48__.state().softButtonTaps,
    voiceState: document.querySelector('#coachVoiceSetupStatus')?.dataset.state || '',
  }));
  expect(after.clicks).toEqual({ menu: 1, audio: 1 });
  expect(after.unified - before.unified).toBe(2);
  expect(after.legacy).toBe(before.legacy);
  expect(['starting', 'speaking', 'ready', 'prepared']).toContain(after.voiceState);
});
'''
if "play-page menu and coach-audio buttons receive pointer events" not in text:
    if marker not in text:
        raise SystemExit("Expected v55 test insertion marker was not found.")
    text = text.replace(marker, test_block + "\n" + marker, 1)
path.write_text(text)
