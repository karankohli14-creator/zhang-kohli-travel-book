const PRACTICE_RESTART_VERSION = '39.0.0';

let restartSource = 'game';
let syncQueued = false;
let toastTimer = null;

function $(selector, root = document) {
  return root.querySelector(selector);
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function safeState() {
  try {
    return window.__KMATE__?.state?.() || null;
  } catch (error) {
    console.warn('K-Mate restart state was unavailable.', error);
    return null;
  }
}

function installStyles() {
  if ($('#kmatePracticeRestartStyles')) return;
  const style = document.createElement('style');
  style.id = 'kmatePracticeRestartStyles';
  style.textContent = `
    .restart-practice-button{border-color:#80d8a466!important;background:#80d8a410!important;color:#c6f7db!important}
    .restart-practice-button:hover,.restart-practice-button:focus-visible{background:#80d8a421!important;box-shadow:0 0 0 2px #80d8a416}
    .restart-practice-button:disabled,.restart-practice-tool:disabled,.result-restart-practice:disabled{opacity:.38;cursor:not-allowed}
    .restart-practice-tool{border-color:#80d8a444!important;background:#80d8a40b!important;color:#c6f7db!important}
    .result-restart-practice{border-color:#80d8a45c!important;background:#80d8a40d!important;color:#c6f7db!important}
    .restart-practice-modal{width:min(560px,calc(100% - 22px))}
    .restart-practice-modal .modal-card{padding:24px}
    .restart-practice-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:17px 0}
    .restart-practice-summary div{padding:11px 12px;border:1px solid #ffffff12;border-radius:13px;background:#ffffff06}
    .restart-practice-summary b,.restart-practice-summary span{display:block}
    .restart-practice-summary b{font-size:12px;color:#eef7eb}
    .restart-practice-summary span{margin-top:2px;color:var(--muted);font-size:10px}
    .restart-practice-note{margin:0 0 17px!important;padding:10px 12px;border-left:3px solid #80d8a4;border-radius:9px;background:#80d8a40b;color:#d9e8df!important;font-size:11px;line-height:1.45}
    .restart-practice-modal .dialogactions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
    @media(max-width:560px){
      .restart-practice-summary{grid-template-columns:1fr}
      .restart-practice-modal .dialogactions{display:grid;grid-template-columns:1fr 1.3fr}
      .restart-practice-modal .dialogactions .btn{padding-inline:9px}
    }
  `;
  document.head.append(style);
}

function ensureHeaderButton() {
  let button = $('#restartPracticeButton');
  if (button) return button;
  const actions = $('#gameView .play-actions');
  if (!actions) return null;
  button = document.createElement('button');
  button.id = 'restartPracticeButton';
  button.type = 'button';
  button.className = 'roundbtn restart-practice-button';
  button.setAttribute('aria-label', 'Restart this practice position');
  button.title = 'Restart this position';
  button.textContent = '↻';
  button.addEventListener('click', () => openRestartDialog('game'));
  actions.insertBefore(button, $('#flipButton', actions) || null);
  return button;
}

function ensureToolButton() {
  let button = $('#restartPracticeTool');
  if (button) return button;
  const tools = $('#gameView .tools');
  if (!tools) return null;
  button = document.createElement('button');
  button.id = 'restartPracticeTool';
  button.type = 'button';
  button.className = 'tool wide restart-practice-tool';
  button.textContent = 'Restart this position';
  button.addEventListener('click', () => openRestartDialog('game'));
  tools.insertBefore(button, $('#changeSetupButton', tools) || null);
  return button;
}

function ensureResultButton() {
  let button = $('#resultRestartPractice');
  if (button) return button;
  const actions = $('#resultDialog .result-actions');
  if (!actions) return null;
  button = document.createElement('button');
  button.id = 'resultRestartPractice';
  button.type = 'button';
  button.className = 'btn result-restart-practice';
  button.textContent = 'Retry this position';
  button.addEventListener('click', () => openRestartDialog('result'));
  actions.insertBefore(button, $('#resultNext', actions) || null);
  return button;
}

function ensureDialog() {
  let dialog = $('#restartPracticeDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'restartPracticeDialog';
  dialog.className = 'modal restart-practice-modal';
  dialog.setAttribute('aria-labelledby', 'restartPracticeTitle');
  dialog.innerHTML = `
    <div class="modal-card">
      <div class="eyebrow">Same position · fresh attempt</div>
      <h2 id="restartPracticeTitle">Restart this practice?</h2>
      <p id="restartPracticeText">The board and clocks will return to the exact starting position.</p>
      <div class="restart-practice-summary" aria-label="What restart preserves">
        <div><b>Exact board</b><span>Return to the original FEN</span></div>
        <div><b>Same challenge</b><span>Keep your color and opponent strength</span></div>
        <div><b>Fresh clock</b><span>Reset both sides to the selected time</span></div>
        <div><b>Same coaching</b><span>Keep hints, principles, and Live Coach settings</span></div>
      </div>
      <p class="restart-practice-note" id="restartPracticeNote">Your unfinished attempt will be discarded and will not count in Insights.</p>
      <div class="dialogactions">
        <button class="btn" id="cancelRestartPractice" type="button">Keep playing</button>
        <button class="btn primary" id="confirmRestartPractice" type="button">Restart position</button>
      </div>
    </div>`;
  document.body.append(dialog);
  $('#cancelRestartPractice', dialog)?.addEventListener('click', () => dialog.close?.());
  $('#confirmRestartPractice', dialog)?.addEventListener('click', restartNow);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close?.();
  });
  return dialog;
}

function updateDialogCopy(source, state) {
  const finalized = Boolean(state?.finalized);
  const fromResult = source === 'result' || finalized;
  const title = $('#restartPracticeTitle');
  const text = $('#restartPracticeText');
  const note = $('#restartPracticeNote');
  const confirm = $('#confirmRestartPractice');
  if (title) title.textContent = fromResult ? 'Retry this position?' : 'Restart this practice?';
  if (text) {
    text.textContent = fromResult
      ? 'Start a new attempt from the exact same position, with the same color, clock, and opponent.'
      : 'Reset the current board and clocks to the exact position where this practice began.';
  }
  if (note) {
    note.textContent = fromResult
      ? 'Your completed result stays in Insights. The retry will be recorded as a separate attempt when it finishes.'
      : 'Your unfinished attempt will be discarded and will not count in Insights.';
  }
  if (confirm) confirm.textContent = fromResult ? 'Retry position' : 'Restart position';
}

function openRestartDialog(source = 'game') {
  const state = safeState();
  if (!state?.restart?.available || typeof window.__KMATE__?.restart !== 'function') {
    showToast('Start a practice position before restarting.');
    return false;
  }
  restartSource = source;
  const dialog = ensureDialog();
  updateDialogCopy(source, state);
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  window.setTimeout(() => $('#confirmRestartPractice', dialog)?.focus(), 0);
  return true;
}

function closeDialog(id) {
  const dialog = $(`#${id}`);
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
}

function restartNow() {
  const dialog = ensureDialog();
  if (dialog.open) dialog.close();
  const source = restartSource;
  restartSource = 'game';

  // Result and replay dialogs otherwise remain above the newly reset board.
  closeDialog('resultDialog');
  closeDialog('replayDialog');

  const result = window.__KMATE__?.restart?.();
  if (!result?.ok) {
    showToast(result?.message || 'K-Mate could not restart this position.');
    return false;
  }

  const attemptText = Number(result.attempt) > 1 ? ` · attempt ${result.attempt}` : '';
  showToast(`${source === 'result' ? 'Retry started' : 'Position restarted'}${attemptText}`);
  syncControls();
  window.requestAnimationFrame(() => $('#board')?.focus?.({ preventScroll: true }));
  return true;
}

function syncControls() {
  const state = safeState();
  const available = Boolean(state?.restart?.available && typeof window.__KMATE__?.restart === 'function');
  const attempt = Number(state?.restart?.attempt || 0);
  const header = ensureHeaderButton();
  const tool = ensureToolButton();
  const result = ensureResultButton();
  for (const button of [header, tool, result]) {
    if (!button) continue;
    button.disabled = !available;
    button.dataset.restartAttempt = String(attempt);
  }
  if (header) header.title = attempt ? `Restart this position · attempt ${attempt + 1}` : 'Restart this position';
  if (tool) tool.textContent = attempt ? `Restart this position · attempt ${attempt + 1}` : 'Restart this position';
}

function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  window.requestAnimationFrame(() => {
    syncQueued = false;
    syncControls();
  });
}

function initializeRestartUi(attempt = 0) {
  if (!window.__KMATE_RESTART_CORE__ || typeof window.__KMATE__?.restart !== 'function' || !$('#gameView')) {
    if (attempt < 100) window.setTimeout(() => initializeRestartUi(attempt + 1), 100);
    else console.warn('K-Mate v39 could not find the restart core.');
    return;
  }
  installStyles();
  ensureDialog();
  syncControls();

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'open', 'class'],
  });

  window.__KMATE_RESTART__ = {
    version: PRACTICE_RESTART_VERSION,
    open: openRestartDialog,
    restart: restartNow,
    state: () => ({
      ready: true,
      available: Boolean(safeState()?.restart?.available),
      attempt: Number(safeState()?.restart?.attempt || 0),
      headerButton: Boolean($('#restartPracticeButton')),
      toolButton: Boolean($('#restartPracticeTool')),
      resultButton: Boolean($('#resultRestartPractice')),
      dialog: Boolean($('#restartPracticeDialog')),
    }),
  };
}

initializeRestartUi();
