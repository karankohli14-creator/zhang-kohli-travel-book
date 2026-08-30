from pathlib import Path

path = Path('kmate-trainer/app-v7-part6.txt')
text = path.read_text()
old = """setGeneratePositionButtonReady();
stockfishEngine?.ready?.then(setGeneratePositionButtonReady).catch((error) => {
  stockfishLoadError = error;
  console.warn('Stockfish is still unavailable; K-Mate will retain its fallback play.', error);
  setGeneratePositionButtonReady();
});"""
new = """setGeneratePositionButtonReady();
const generatePositionButton = $('#startButton');
if (generatePositionButton) {
  const keepGeneratePositionReady = new MutationObserver(() => {
    if (!document.body.classList.contains('game-mode')
      && generatePositionButton.dataset.starting !== '1'
      && (generatePositionButton.disabled || generatePositionButton.textContent.trim() !== 'Generate position')) {
      window.queueMicrotask(setGeneratePositionButtonReady);
    }
  });
  keepGeneratePositionReady.observe(generatePositionButton, { attributes: true, childList: true, subtree: true });
}
stockfishEngine?.ready?.then(setGeneratePositionButtonReady).catch((error) => {
  stockfishLoadError = error;
  console.warn('Stockfish is still unavailable; K-Mate will retain its fallback play.', error);
  setGeneratePositionButtonReady();
});"""
if old not in text:
    raise SystemExit('Generated start-button readiness block was not found')
path.write_text(text.replace(old, new, 1))
