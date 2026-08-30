from __future__ import annotations

from pathlib import Path
import re

ROOT = Path("kmate-trainer")


def read(path: Path) -> str:
    return path.read_text()


def write(path: Path, text: str) -> None:
    path.write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# HTML: simpler setup copy, compact principle page, and permanent review exits.
# ---------------------------------------------------------------------------
index_path = ROOT / "index.html"
index = read(index_path)
index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=40.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=40.0.0", index)

copy_replacements = {
    "Hide the opponent setting, estimate it after the position, and help validate K-Mate’s scale.": "Hide the rating, then estimate it after the game.",
    "Show a strategic idea at the start of each turn. The exact candidate remains hidden unless you reveal it.": "Show one strategic idea before each move.",
    "K-Mate selects five principles for the exact position and starts the clock only after you review them.": "Review five one-line reminders before the clock starts.",
    "Open the coach only for an Inaccuracy, Mistake, Miss, or Blunder. Best, Excellent, and Good moves never change the board layout.": "Pause only after an inaccuracy, mistake, miss, or blunder.",
    "Use the device’s best available English voice for both Live Coach and post-game Coach Replay. On a Mac, test it once before playing so Safari or Chrome can authorize speech.": "Read Live Coach and post-game reviews aloud.",
}
for old, new in copy_replacements.items():
    index = replace_once(index, old, new, f"short setup copy: {old[:25]}")

index = replace_once(
    index,
    '<button class="btn primary start" id="startButton" type="button" disabled>Loading Stockfish 18…</button>',
    '<button class="btn primary start" id="startButton" type="button">Generate position</button>',
    "enabled generate-position button",
)

old_principles = '''  <dialog id="principlesDialog" class="modal principles-modal">
    <div class="modal-card">
      <div class="eyebrow">Before the clock starts</div>
      <h2 id="principlesPositionTitle">Before you play: 5 key principles</h2>
      <p id="principlesPositionSubtitle">Five quick reminders for this exact position.</p>
      <div class="principles-list" id="principlesList"></div>
      <p class="principles-note">Keep these principles in mind, but still calculate the concrete position. Principles guide candidate selection; they do not replace calculation.</p>
      <div class="dialogactions">
        <button class="btn" id="principlesSetupButton" type="button">Change setup</button>
        <button class="btn primary" id="principlesStartButton" type="button">I reviewed them — start clock</button>
      </div>
    </div>
  </dialog>'''
new_principles = '''  <dialog id="principlesDialog" class="modal principles-modal">
    <div class="modal-card">
      <h2 id="principlesPositionTitle">Before you play: 5 key principles</h2>
      <p id="principlesPositionSubtitle" hidden></p>
      <div class="principles-list" id="principlesList"></div>
      <div class="dialogactions">
        <button class="btn" id="principlesSetupButton" type="button">Change setup</button>
        <button class="btn primary" id="principlesStartButton" type="button">Start clock</button>
      </div>
    </div>
  </dialog>'''
index = replace_once(index, old_principles, new_principles, "single-title principle review")

index = replace_once(
    index,
    '''        <div class="replay-header-actions">
          <button class="btn" id="replayBackToReview" type="button">Back to review</button>
          <button class="roundbtn" type="button" data-close="replayDialog" aria-label="Close replay">×</button>
        </div>''',
    '''        <div class="replay-header-actions">
          <button class="roundbtn" id="replayCloseButton" type="button" aria-label="Return to session summary" title="Return to session summary">×</button>
        </div>''',
    "replay header close action",
)

replay_end = '''      </div>
    </div>
  </dialog>


  <dialog id="voiceCloneDialog"'''
replay_end_new = '''      </div>
      <footer class="replay-exit-bar" aria-label="Coach replay navigation">
        <button class="btn" id="replayBackToReview" type="button">Session summary</button>
        <button class="btn" id="replayHomeButton" type="button">⌂ Home</button>
        <button class="btn primary" id="replayNewPositionButton" type="button">New position</button>
      </footer>
    </div>
  </dialog>


  <dialog id="voiceCloneDialog"'''
index = replace_once(index, replay_end, replay_end_new, "replay navigation footer")
index = replace_once(index, 'id="resultSetup">Change setup</button>', 'id="resultSetup">Home</button>', "result home label")
index = replace_once(index, 'id="resultNext">Play another</button>', 'id="resultNext">New position</button>', "result new-position label")
write(index_path, index)


# ---------------------------------------------------------------------------
# Main runtime: start immediately, keep voice checks explicit, and add exits.
# ---------------------------------------------------------------------------
part1_path = ROOT / "app-v7-part1.txt"
part1 = read(part1_path)
part1 = part1.replace("url.search = '?v=20260830-35';", "url.search = '?v=20260830-40';")

prime_pattern = re.compile(
    r"function primeCoachVoiceOnSessionStart\(\) \{.*?\n\}\n\nfunction captureBoardViewportAnchor",
    re.S,
)
prime_replacement = '''function primeCoachVoiceOnSessionStart() {
  // Starting a position must never be gated by, or interrupted by, speech.
  // The dedicated Test coach voice button remains the explicit audible check.
  coachSessionPrimeAttempted = true;
  return primeCoachAudioFromGesture();
}

function captureBoardViewportAnchor'''
part1, count = prime_pattern.subn(prime_replacement, part1, count=1)
if count != 1:
    raise SystemExit("Unable to replace automatic start narration")

principles_pattern = re.compile(
    r"function renderPrinciplesDialog\(\) \{.*?\n\}\n\nfunction beginPreparedPosition",
    re.S,
)
principles_replacement = '''function renderPrinciplesDialog() {
  const list = $('#principlesList');
  const title = $('#principlesPositionTitle');
  const subtitle = $('#principlesPositionSubtitle');
  if (!list || !title) return;
  const principles = currentPositionPrinciples.slice(0, 5);
  title.textContent = `Before you play: ${principles.length} key principles`;
  if (subtitle) subtitle.textContent = '';
  list.innerHTML = principles.map((principle, index) => `
    <article class="principle-compact-row">
      <span class="principle-compact-number">${index + 1}</span>
      <b>${escapeHtml(principle.title)}</b>
    </article>`).join('');
}

function beginPreparedPosition'''
part1, count = principles_pattern.subn(principles_replacement, part1, count=1)
if count != 1:
    raise SystemExit("Unable to replace principle renderer")

runtime_helpers = '''
function setGeneratePositionButtonReady() {
  const button = $('#startButton');
  if (!button) return;
  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.dataset.starting = '0';
  button.textContent = 'Generate position';
  button.title = stockfishLoadError
    ? 'The chess engine had a loading issue; K-Mate can still open the board and use its fallback play.'
    : 'Create a fresh position and begin play';
}

function showGeneratePositionFailure(error) {
  console.error('Unable to generate a K-Mate position.', error);
  const box = $('#loadError');
  if (box) {
    box.textContent = `K-Mate could not open the position: ${error?.message || error}. Please try again.`;
    box.classList.add('show');
  }
  toast('The position did not open. Please try again.');
  setGeneratePositionButtonReady();
}

function handleGeneratePosition() {
  const button = $('#startButton');
  if (!button || button.dataset.starting === '1') return;
  const box = $('#loadError');
  if (box) {
    box.textContent = '';
    box.classList.remove('show');
  }
  button.dataset.starting = '1';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Creating position…';
  // This primes browser permissions silently. It does not speak and cannot block
  // the transition to the board.
  primeCoachVoiceOnSessionStart();
  try {
    updateControls(true);
    startPosition();
    if (!game || !document.body.classList.contains('game-mode') || $('#gameView')?.hidden) {
      throw new Error('The game view did not activate');
    }
    window.requestAnimationFrame(() => {
      button.dataset.starting = '0';
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = 'Generate position';
    });
  } catch (error) {
    showGeneratePositionFailure(error);
  }
}

function stopReviewPlayback() {
  stopReplayAuto();
  stopBestLinePlayback({ reset: true, render: false });
  stopCoachSpeech();
  closeDialog('replayDialog');
}

function returnToSessionSummary() {
  stopReviewPlayback();
  if (currentSession) renderPostGameReview(currentSession);
  openDialog('resultDialog');
}

function goHomeFromReview() {
  stopReviewPlayback();
  closeDialog('resultDialog');
  showView('setup');
  if (typeof resetSetupFlowForNavigation === 'function') resetSetupFlowForNavigation('intro');
}

function generateNewPositionFromReview() {
  stopReviewPlayback();
  closeDialog('resultDialog');
  startPosition({ preservePrevious: true });
}

'''
bind_marker = "function bindControls() {"
if runtime_helpers.strip() not in part1:
    part1 = replace_once(part1, bind_marker, runtime_helpers + bind_marker, "v40 runtime helpers")

part1 = replace_once(
    part1,
    "$('#startButton').addEventListener('click', () => { primeCoachVoiceOnSessionStart(); startPosition(); });",
    "$('#startButton').addEventListener('click', handleGeneratePosition);",
    "unblocked generate-position handler",
)
write(part1_path, part1)


# ---------------------------------------------------------------------------
# Setup flow and bindings: one title only, no subtitle, explicit review exits.
# ---------------------------------------------------------------------------
part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)

part6 = replace_once(
    part6,
    '''  $('#replayBackToReview')?.addEventListener('click', () => {
    closeDialog('replayDialog');
    renderPostGameReview(currentSession);
    openDialog('resultDialog');
  });''',
    '''  $('#replayBackToReview')?.addEventListener('click', returnToSessionSummary);
  $('#replayCloseButton')?.addEventListener('click', returnToSessionSummary);
  $('#replayHomeButton')?.addEventListener('click', goHomeFromReview);
  $('#replayNewPositionButton')?.addEventListener('click', generateNewPositionFromReview);''',
    "replay navigation bindings",
)

part6 = replace_once(
    part6,
    '''  $('#resultNext').addEventListener('click', () => {
    closeDialog('resultDialog');
    startPosition({ preservePrevious: true });
  });
  $('#resultSetup').addEventListener('click', () => {
    closeDialog('resultDialog');
    showView('setup');
  });''',
    '''  $('#resultNext').addEventListener('click', generateNewPositionFromReview);
  $('#resultSetup').addEventListener('click', goHomeFromReview);''',
    "result navigation bindings",
)

screen_pattern = re.compile(
    r"function makeSetupScreen\(page, stepLabel, title, subtitle\) \{.*?\n\}\n\nfunction initializePagedSetup",
    re.S,
)
screen_replacement = '''function makeSetupScreen(page, title = '') {
  const section = document.createElement('section');
  section.className = 'setup-flow-page';
  section.dataset.setupPage = page;
  section.hidden = true;
  section.innerHTML = `
    <header class="setup-screen-header">
      <div class="setup-screen-copy">${title ? `<h1>${title}</h1>` : ''}</div>
      <div class="setup-progress" aria-label="Setup progress">
        <i data-setup-step="intro"></i><i data-setup-step="challenge"></i><i data-setup-step="coach"></i>
      </div>
    </header>
    <div class="setup-screen-content"></div>
    <footer class="setup-screen-footer"></footer>
  `;
  return section;
}

function initializePagedSetup'''
part6, count = screen_pattern.subn(screen_replacement, part6, count=1)
if count != 1:
    raise SystemExit("Unable to replace setup screen template")

part6 = replace_once(
    part6,
    "const introPage = makeSetupScreen('intro', 'Train positions, not openings', 'Get better at the part of chess that decides games.', 'Choose a real middlegame or endgame, play it under pressure, and get precise coaching only when it matters.');\n  const challengePage = makeSetupScreen('challenge', 'Step 1 of 2', 'Set your chess challenge', 'Phase · opening · ratings · clock');\n  const coachPage = makeSetupScreen('coach', 'Step 2 of 2', 'Choose your coaching', 'Hints · principles · Live Coach · sound');",
    "const introPage = makeSetupScreen('intro');\n  const challengePage = makeSetupScreen('challenge', 'Set your chess challenge');\n  const coachPage = makeSetupScreen('coach', 'Choose your coaching');",
    "single setup titles",
)

part6 = replace_once(
    part6,
    '<button class="btn primary app-flow-primary" id="challengeNextButton" type="button">Coaching setup →</button>',
    '<button class="btn primary app-flow-primary" id="challengeNextButton" type="button">Next: coaching →</button>',
    "challenge next label",
)
part6 = replace_once(part6, "back.textContent = '← Challenge';", "back.textContent = '← Back';", "coach back label")

part6 = replace_once(
    part6,
    "  if (title) title.textContent = `${principles.length} key principles for this position`;\n  const subtitle = $('#principlesPositionSubtitle');\n  if (subtitle) subtitle.textContent = 'Keep these in mind, then calculate the concrete position.';",
    "  if (title) title.textContent = `Before you play: ${principles.length} key principles`;\n  const subtitle = $('#principlesPositionSubtitle');\n  if (subtitle) subtitle.textContent = '';",
    "compact principle title",
)

part6 = replace_once(
    part6,
    "$('#startButton').disabled = true;\n$('#startButton').textContent = 'Loading Stockfish 18…';",
    "setGeneratePositionButtonReady();\nstockfishEngine?.ready?.then(setGeneratePositionButtonReady).catch((error) => {\n  stockfishLoadError = error;\n  console.warn('Stockfish is still unavailable; K-Mate will retain its fallback play.', error);\n  setGeneratePositionButtonReady();\n});",
    "always-ready generate button",
)
part6 = part6.replace("version: '39.0-commercial-beta'", "version: '40.0-commercial-beta'")
write(part6_path, part6)


# ---------------------------------------------------------------------------
# Cache versions.
# ---------------------------------------------------------------------------
loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=40.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=40.0.0", loader)
write(loader_path, loader)


# ---------------------------------------------------------------------------
# CSS: one welcoming title, larger controls, fixed principle page, replay exits.
# ---------------------------------------------------------------------------
styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v40 — warm single-title setup, reliable start, and review exits */
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page{
  background:
    radial-gradient(circle at 12% 0,#f4cc7024,transparent 27rem),
    radial-gradient(circle at 92% 8%,#b9f47416,transparent 30rem),
    linear-gradient(150deg,#17130e 0%,#0d150f 54%,#07100a 100%);
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="intro"] .setup-screen-header{display:none!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="challenge"] .setup-screen-header,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="coach"] .setup-screen-header{
  display:flex!important;align-items:center;justify-content:space-between;gap:18px;
  width:min(1180px,100%);min-height:78px;max-height:78px;margin:0 auto;padding:11px 4px 10px;
  border-bottom:1px solid #f4cc7028;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-brand,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-copy p{display:none!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-copy{display:block!important;min-width:0;overflow:visible!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-copy h1{
  display:block;margin:0;color:#fff8e9;font-size:clamp(30px,3.5vw,46px);font-weight:950;line-height:1.02;
  letter-spacing:-.045em;white-space:nowrap;overflow:visible;text-shadow:0 4px 24px #0007;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-progress{flex:0 0 auto;gap:7px}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-progress i{width:28px;height:7px;background:#fff4dc20}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-progress i.active{width:45px;background:linear-gradient(90deg,#f4cc70,#b9f474)}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-content{width:min(1180px,100%);margin:0 auto}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-step-card{
  border-color:#f4cc7034;border-radius:24px;background:linear-gradient(145deg,#231d15,#101711 60%,#0b120d);
  box-shadow:0 28px 80px #0008,inset 0 1px #fff1;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid .field,
html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle,
html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid .coach-audio-check,
html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid .sound-style-field{
  border-color:#f4cc7022;background:linear-gradient(145deg,#fff8e808,#ffffff03);
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid label{font-size:15px!important;color:#fff6e5}
html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid .value{font-size:14px!important;color:#d7ff84}
html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid .select{font-size:15px!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg button b{font-size:18px!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid .time-grid b{font-size:15px!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid .side-seg button{font-size:15px!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle b{font-size:15px!important;color:#fff6e5}
html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle small{
  display:block!important;margin-top:4px!important;font-size:11px!important;line-height:1.15!important;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;-webkit-line-clamp:unset!important;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-footer{
  width:min(1180px,100%);min-height:64px;margin:0 auto;border-color:#f4cc7028;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-footer .btn{
  min-height:50px;padding:0 22px;border-radius:15px;font-size:15px;font-weight:950;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) #startButton{
  background:linear-gradient(135deg,#d7ff84,#a7eb67 54%,#f4cc70);color:#17210f;
  box-shadow:0 12px 32px #b9f4742d;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) #startButton[aria-busy="true"]{opacity:.78;cursor:wait}
html.kmate-fixed-app body.paged-app:not(.game-mode) button:focus-visible,
html.kmate-fixed-app body.paged-app:not(.game-mode) select:focus-visible,
html.kmate-fixed-app body.paged-app:not(.game-mode) input:focus-visible{outline:3px solid #f4cc70;outline-offset:2px}

/* Pregame principles are a fixed one-title screen with five concise reminders. */
.principles-modal{width:100vw!important;max-width:none!important;height:100dvh!important;max-height:none!important;padding:max(10px,env(safe-area-inset-top)) 12px max(10px,env(safe-area-inset-bottom))!important;overflow:hidden!important;background:#061009dd!important}
.principles-modal .modal-card{
  display:grid!important;grid-template-rows:auto minmax(0,1fr) auto!important;gap:13px!important;
  width:min(820px,100%)!important;height:min(720px,100%)!important;max-height:100%!important;margin:auto!important;padding:clamp(18px,3vw,34px)!important;
  overflow:hidden!important;border:1px solid #f4cc7040!important;border-radius:26px!important;
  background:radial-gradient(circle at 92% 0,#b9f4741c,transparent 22rem),linear-gradient(145deg,#231c14,#0d1710)!important;
  box-shadow:0 36px 110px #000d!important;
}
.principles-modal #principlesPositionTitle{margin:0!important;color:#fff8e9;font-size:clamp(28px,4vw,42px)!important;line-height:1.03!important;letter-spacing:-.04em!important;text-align:center}
.principles-modal #principlesPositionSubtitle,.principles-modal .principles-note,.principles-modal .eyebrow{display:none!important}
.principles-modal .principles-list{display:grid!important;grid-template-rows:repeat(5,minmax(0,1fr))!important;gap:9px!important;min-height:0!important;overflow:hidden!important}
.principles-modal .principle-compact-row{display:grid!important;grid-template-columns:48px minmax(0,1fr)!important;align-items:center!important;gap:14px!important;min-height:0!important;padding:9px 15px!important;border:1px solid #f4cc7026!important;border-radius:15px!important;background:#fff8e808!important}
.principles-modal .principle-compact-number{display:grid!important;place-items:center!important;width:38px!important;height:38px!important;border-radius:12px!important;background:linear-gradient(145deg,#f4cc70,#b9f474)!important;color:#17210f!important;font-size:17px!important;font-weight:950!important}
.principles-modal .principle-compact-row b{font-size:clamp(15px,2vw,20px)!important;line-height:1.12!important;color:#fff8e9}
.principles-modal .dialogactions{display:grid!important;grid-template-columns:1fr 1.35fr!important;gap:10px!important;margin:0!important}
.principles-modal .dialogactions .btn{min-height:52px!important;font-size:15px!important;border-radius:15px!important}

/* Coach Replay always offers clear exits after a completed game. */
.replay-shell{grid-template-rows:auto minmax(0,1fr) auto!important}
.replay-exit-bar{display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:8px;padding:9px 12px max(9px,env(safe-area-inset-bottom));border-top:1px solid #f4cc7028;background:#09110dec;backdrop-filter:blur(16px)}
.replay-exit-bar .btn{min-height:44px;font-size:12px;font-weight:900}
.replay-header-actions{display:flex;align-items:center;justify-content:flex-end}
.result-actions #resultSetup,.result-actions #resultNext{font-weight:950}

@media(max-width:760px){
  html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="challenge"] .setup-screen-header,
  html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page[data-setup-page="coach"] .setup-screen-header{
    min-height:64px!important;max-height:64px!important;padding:7px 2px 6px!important;
  }
  html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-copy h1{font-size:24px!important;line-height:1!important;white-space:normal}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-progress{gap:4px}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-progress i{width:16px;height:5px}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-progress i.active{width:25px}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-step-card{border-radius:16px}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid label{font-size:12px!important}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid .value{font-size:11px!important}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid .select{font-size:12px!important}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg button b{font-size:14px!important}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid .time-grid b{font-size:11px!important}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .challenge-fields-grid .side-seg button{font-size:12px!important}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle b{font-size:12px!important}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle small{font-size:9px!important}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-footer{min-height:52px!important;max-height:52px!important;padding-top:5px!important}
  html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-footer .btn{min-height:43px!important;padding:0 12px!important;font-size:13px!important}
  .principles-modal{padding:6px!important}
  .principles-modal .modal-card{height:100%!important;padding:14px 11px!important;gap:8px!important;border-radius:18px!important}
  .principles-modal #principlesPositionTitle{font-size:25px!important}
  .principles-modal .principles-list{gap:6px!important}
  .principles-modal .principle-compact-row{grid-template-columns:39px minmax(0,1fr)!important;gap:9px!important;padding:6px 9px!important;border-radius:11px!important}
  .principles-modal .principle-compact-number{width:31px!important;height:31px!important;border-radius:9px!important;font-size:14px!important}
  .principles-modal .principle-compact-row b{font-size:14px!important}
  .principles-modal .dialogactions{gap:6px!important}
  .principles-modal .dialogactions .btn{min-height:45px!important;padding:0 8px!important;font-size:12px!important}
  .replay-exit-bar{grid-template-columns:1fr 1fr 1.15fr;gap:5px;padding:6px}
  .replay-exit-bar .btn{min-height:39px;padding:0 6px;font-size:9.5px}
}
/* End K-Mate v40 */
'''
write(styles_path, styles)
