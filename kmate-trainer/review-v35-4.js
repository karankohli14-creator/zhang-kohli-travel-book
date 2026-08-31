(() => {
  'use strict';

  const UI_VERSION = '35.4-summary-first';
  const STORAGE_KEY = 'kmate-position-v7';
  const QUALITY_KEYS = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];
  const QUALITY_META = Object.freeze({
    best: { label: 'Best', weight: 100 },
    excellent: { label: 'Excellent', weight: 94 },
    good: { label: 'Good', weight: 80 },
    inaccuracy: { label: 'Inaccuracies', weight: 58 },
    mistake: { label: 'Mistakes', weight: 42 },
    miss: { label: 'Misses', weight: 28 },
    blunder: { label: 'Blunders', weight: 8 },
  });

  let initialized = false;
  let activeReplaySessionId = null;
  let resultRefreshTimer = null;
  let replayRefreshTimer = null;
  let firstDecisionIndex = null;
  let detailedMode = false;
  let audioContext = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function normalizedMove(value) {
    const cleaned = String(value || '').trim().toLowerCase().replace(/[^a-h1-8qrbn]/g, '').slice(0, 5);
    return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(cleaned) ? cleaned : '';
  }

  function moveQuality(record) {
    if (!record) return 'pending';
    if (normalizedMove(record.uci) && normalizedMove(record.uci) === normalizedMove(record.bestMove)) return 'best';
    const stored = String(record.quality || '').toLowerCase();
    if (QUALITY_KEYS.includes(stored)) return stored;
    const loss = Number(record.cpLoss);
    if (!Number.isFinite(loss)) return 'pending';
    if (loss <= 10) return 'best';
    if (loss <= 25) return 'excellent';
    if (loss <= 60) return 'good';
    if (loss <= 110) return 'inaccuracy';
    if (loss <= 180) return 'mistake';
    if (loss <= 220) return 'miss';
    return 'blunder';
  }

  function compositionForRecords(records = []) {
    const counts = Object.fromEntries(QUALITY_KEYS.map((key) => [key, 0]));
    let pending = 0;
    let weighted = 0;
    let analyzed = 0;
    for (const record of Array.isArray(records) ? records : []) {
      const key = moveQuality(record);
      if (!QUALITY_KEYS.includes(key)) {
        pending += 1;
        continue;
      }
      counts[key] += 1;
      weighted += QUALITY_META[key].weight;
      analyzed += 1;
    }
    const rating = analyzed ? Math.max(1, Math.min(100, Math.round(weighted / analyzed))) : null;
    const grade = !Number.isFinite(rating) ? '—'
      : rating >= 96 ? 'A+'
        : rating >= 90 ? 'A'
          : rating >= 82 ? 'B'
            : rating >= 72 ? 'C'
              : rating >= 60 ? 'D' : 'F';
    return {
      total: Array.isArray(records) ? records.length : 0,
      analyzed,
      pending,
      rating,
      grade,
      counts,
    };
  }

  function readStore() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return value && typeof value === 'object' ? value : { sessions: [] };
    } catch {
      return { sessions: [] };
    }
  }

  function latestSession() {
    const sessions = readStore().sessions;
    return Array.isArray(sessions) ? sessions[0] || null : null;
  }

  function sessionById(id) {
    if (!id) return null;
    const sessions = readStore().sessions;
    return Array.isArray(sessions) ? sessions.find((session) => session?.id === id) || null : null;
  }

  function activeSession() {
    return sessionById(activeReplaySessionId) || latestSession();
  }

  function safeText(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function summaryItemsMarkup(summary) {
    return QUALITY_KEYS.map((key) => `
      <div class="kmate-composition-item quality-${key}">
        <b>${summary.counts[key]}</b>
        <span>${QUALITY_META[key].label}</span>
      </div>`).join('');
  }

  function summarySentence(summary) {
    if (!summary.total) return 'No player decisions were recorded in this position.';
    const positive = summary.counts.best + summary.counts.excellent + summary.counts.good;
    const costly = summary.counts.mistake + summary.counts.miss + summary.counts.blunder;
    if (summary.pending) return `${summary.analyzed} of ${summary.total} decisions are graded so far. The summary updates as the final engine reviews finish.`;
    if (!costly) return `${positive} of ${summary.total} decisions were Best, Excellent, or Good.`;
    return `${positive} strong decisions and ${costly} costly decisions across ${summary.total} player moves.`;
  }

  function buildSummaryMarkup(summary, { replay = false } = {}) {
    const rating = Number.isFinite(summary.rating) ? summary.rating : '—';
    const pending = summary.pending
      ? `<p class="kmate-summary-pending">${summary.pending} move${summary.pending === 1 ? '' : 's'} still being analyzed.</p>`
      : '';
    return `
      <div class="kmate-summary-topline"><span>${replay ? 'Coach review' : 'Game complete'}</span><b>${summary.total} move${summary.total === 1 ? '' : 's'}</b></div>
      <div class="kmate-rating-panel">
        <div class="kmate-rating-number"><strong>${rating}</strong><span>/100</span></div>
        <div><small>Game rating</small><b>${summary.grade}</b><p>${safeText(summarySentence(summary))}</p></div>
      </div>
      <div class="kmate-composition-grid">${summaryItemsMarkup(summary)}</div>
      ${pending}`;
  }

  function appSoundEnabled() {
    try {
      const state = window.__KMATE__?.state?.();
      if (state?.sound) return state.sound.enabled !== false;
      return readStore()?.settings?.sound !== false;
    } catch {
      return true;
    }
  }

  function playInterfaceTap(strong = false) {
    if (!appSoundEnabled()) return false;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    try {
      audioContext ||= new AudioCtor();
      audioContext.resume?.();
      const now = audioContext.currentTime + 0.004;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(strong ? 250 : 315, now);
      oscillator.frequency.exponentialRampToValueAtTime(strong ? 105 : 145, now + (strong ? 0.075 : 0.055));
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(strong ? 1450 : 1850, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(strong ? 0.12 : 0.075, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (strong ? 0.085 : 0.064));
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
      return true;
    } catch {
      return false;
    }
  }

  function principleParts(card) {
    const title = card.querySelector('b')?.textContent?.trim() || '';
    const description = card.querySelector('p')?.textContent?.trim() || '';
    return { title, description };
  }

  function enhancePrinciples() {
    const dialog = $('#principlesDialog');
    const list = $('#principlesList');
    if (!dialog || !list) return;
    dialog.classList.add('kmate-principles-v354');
    const cards = [...list.children];
    if (!cards.length) return;
    cards.forEach((card, index) => {
      if (index >= 5) {
        card.hidden = true;
        return;
      }
      const { title, description } = principleParts(card);
      card.hidden = false;
      card.className = 'kmate-principle-row';
      card.innerHTML = `
        <span class="kmate-principle-number">${index + 1}</span>
        <div><b>${safeText(title)}</b>${description ? `<p>${safeText(description)}</p>` : ''}</div>`;
    });
    list.style.setProperty('--principle-count', String(Math.min(5, cards.length)));
    const title = $('#principlesPositionTitle');
    if (title) title.textContent = `Before you play: ${Math.min(5, cards.length)} key principles`;
    const subtitle = $('#principlesPositionSubtitle');
    if (subtitle) subtitle.textContent = '';
    const start = $('#principlesStartButton');
    const setup = $('#principlesSetupButton');
    if (start) {
      start.textContent = 'Start clock';
      start.classList.add('kmate-3d-button', 'kmate-3d-primary');
    }
    setup?.classList.add('kmate-3d-button');
  }

  function syncPrincipleScreen() {
    const dialog = $('#principlesDialog');
    const open = Boolean(dialog?.open);
    document.documentElement.classList.toggle('principles-screen-open', open);
    document.body.classList.toggle('principles-screen-open', open);
    if (!open) return;
    enhancePrinciples();
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  function ensureResultSummary() {
    const card = $('#resultDialog .result-card');
    if (!card) return null;
    let summary = $('#kmateResultSummary');
    if (!summary) {
      summary = document.createElement('section');
      summary.id = 'kmateResultSummary';
      summary.className = 'kmate-result-summary';
      const resultText = $('#resultText');
      resultText?.insertAdjacentElement('afterend', summary);
    }
    $('#resultCoach')?.setAttribute('hidden', '');
    $('#postReview')?.setAttribute('hidden', '');
    const replayButton = $('#resultReplay');
    if (replayButton) {
      replayButton.textContent = 'Open coach review →';
      replayButton.classList.add('kmate-3d-button', 'kmate-3d-primary');
    }
    for (const id of ['resultInsights', 'resultSetup', 'resultNext']) $(`#${id}`)?.classList.add('kmate-3d-button');
    return summary;
  }

  function refreshResultSummary() {
    const container = ensureResultSummary();
    if (!container) return;
    const session = latestSession();
    const summary = compositionForRecords(session?.userMoves || []);
    container.innerHTML = buildSummaryMarkup(summary);
  }

  function ensureReplaySummary() {
    const shell = $('#replayDialog .replay-shell');
    const header = $('#replayDialog .replay-header');
    if (!shell || !header) return null;
    let summary = $('#coachReviewSummary');
    if (!summary) {
      summary = document.createElement('section');
      summary.id = 'coachReviewSummary';
      summary.className = 'coach-review-summary';
      summary.innerHTML = `
        <div class="coach-review-summary-content" id="coachReviewSummaryContent"></div>
        <div class="coach-review-summary-actions">
          <button class="kmate-3d-button kmate-3d-primary" id="startDetailedCoachReview" type="button">Start move-by-move review →</button>
        </div>`;
      header.insertAdjacentElement('afterend', summary);
      $('#startDetailedCoachReview')?.addEventListener('pointerdown', () => playInterfaceTap(true), { passive: true });
      $('#startDetailedCoachReview')?.addEventListener('click', startDetailedReview);
    }
    return summary;
  }

  function replayFrameIsUserDecision() {
    const comparison = $('#replayComparison');
    const title = $('#replayCoachTitle')?.textContent?.trim() || '';
    const badge = $('#replayRating')?.textContent?.trim() || '';
    return Boolean(comparison && !comparison.hidden && (title.startsWith('Decision ') || !['Start', 'Opponent', 'Position'].includes(badge)));
  }

  function replayIndex() {
    try { return Number(window.__KMATE__?.state?.()?.replay?.index) || 0; } catch { return 0; }
  }

  function setReplayHeader(summaryMode) {
    const title = $('#replayTitle');
    const subtitle = $('#replaySubtitle');
    const back = $('#replayBackToReview');
    if (title) title.textContent = summaryMode ? 'Coach review' : 'Move-by-move coach review';
    if (subtitle) subtitle.textContent = summaryMode ? 'Game summary' : 'Your decisions, one move at a time';
    if (back) {
      back.textContent = summaryMode ? 'Back to result' : 'Game summary';
      back.classList.add('kmate-3d-button');
    }
  }

  function showReplaySummary({ refresh = true } = {}) {
    const dialog = $('#replayDialog');
    if (!dialog?.open) return;
    const summary = ensureReplaySummary();
    const layout = $('#replayDialog .replay-layout');
    if (!summary || !layout) return;
    detailedMode = false;
    summary.hidden = false;
    layout.hidden = true;
    $('#replayDialog .replay-shell')?.classList.add('summary-mode');
    $('#replayDialog .replay-shell')?.classList.remove('detailed-mode');
    setReplayHeader(true);
    try { window.speechSynthesis?.cancel(); } catch {}
    if (refresh) refreshReplaySummary();
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  function refreshReplaySummary() {
    const summary = ensureReplaySummary();
    const content = $('#coachReviewSummaryContent');
    if (!summary || !content) return;
    const session = activeSession();
    const composition = compositionForRecords(session?.userMoves || []);
    content.innerHTML = `
      <div class="coach-review-summary-heading">
        <div><span>Game overview</span><h2>Your move composition</h2></div>
        <p>${safeText(summarySentence(composition))}</p>
      </div>
      ${buildSummaryMarkup(composition, { replay: true })}`;
    const hiddenTitle = $('#replayCoachTitle');
    const hiddenText = $('#replayCoachText');
    if (hiddenTitle) hiddenTitle.textContent = `Game rating ${Number.isFinite(composition.rating) ? composition.rating : 'pending'} out of 100`;
    if (hiddenText) hiddenText.textContent = `${summarySentence(composition)} Select Start move-by-move review for the detailed coach analysis.`;
    const start = $('#startDetailedCoachReview');
    if (start) {
      start.disabled = !composition.total;
      start.textContent = composition.total ? 'Start move-by-move review →' : 'No moves to review';
    }
  }

  function startDetailedReview(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const summary = ensureReplaySummary();
    const layout = $('#replayDialog .replay-layout');
    const startButton = $('#startDetailedCoachReview');
    if (!summary || !layout || !startButton) return;
    startButton.disabled = true;
    startButton.textContent = 'Opening first decision…';
    try { window.speechSynthesis?.cancel(); } catch {}

    let steps = 0;
    while (!replayFrameIsUserDecision() && steps < 300) {
      const next = $('#replayNext');
      if (!next || next.disabled) break;
      next.click();
      steps += 1;
    }

    if (!replayFrameIsUserDecision()) {
      startButton.disabled = true;
      startButton.textContent = 'No player decision available';
      return;
    }

    firstDecisionIndex = replayIndex();
    detailedMode = true;
    summary.hidden = true;
    layout.hidden = false;
    $('#replayDialog .replay-shell')?.classList.remove('summary-mode');
    $('#replayDialog .replay-shell')?.classList.add('detailed-mode');
    setReplayHeader(false);
    startButton.disabled = false;
    startButton.textContent = 'Start move-by-move review →';
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  function handleReplayOpen() {
    const dialog = $('#replayDialog');
    if (!dialog?.open) {
      detailedMode = false;
      firstDecisionIndex = null;
      window.clearInterval(replayRefreshTimer);
      replayRefreshTimer = null;
      return;
    }
    ensureReplaySummary();
    showReplaySummary();
    window.clearInterval(replayRefreshTimer);
    replayRefreshTimer = window.setInterval(() => {
      if (!dialog.open) {
        window.clearInterval(replayRefreshTimer);
        replayRefreshTimer = null;
        return;
      }
      if (!detailedMode) refreshReplaySummary();
    }, 800);
  }

  function handleResultOpen() {
    const dialog = $('#resultDialog');
    if (!dialog?.open) {
      window.clearInterval(resultRefreshTimer);
      resultRefreshTimer = null;
      return;
    }
    activeReplaySessionId = latestSession()?.id || null;
    refreshResultSummary();
    window.clearInterval(resultRefreshTimer);
    resultRefreshTimer = window.setInterval(() => {
      if (!dialog.open) {
        window.clearInterval(resultRefreshTimer);
        resultRefreshTimer = null;
        return;
      }
      refreshResultSummary();
    }, 800);
  }

  function bindCaptureNavigation() {
    document.addEventListener('click', (event) => {
      const recent = event.target.closest('[data-replay-session]');
      if (recent) activeReplaySessionId = recent.dataset.replaySession || null;
      if (event.target.closest('#resultReplay')) activeReplaySessionId = latestSession()?.id || null;

      const back = event.target.closest('#replayBackToReview');
      if (back && $('#replayDialog')?.open && detailedMode) {
        event.preventDefault();
        event.stopImmediatePropagation();
        playInterfaceTap();
        showReplaySummary();
        return;
      }

      const first = event.target.closest('#replayFirst');
      if (first && $('#replayDialog')?.open) {
        event.preventDefault();
        event.stopImmediatePropagation();
        playInterfaceTap();
        showReplaySummary();
        return;
      }

      const previous = event.target.closest('#replayPrevious');
      if (previous && $('#replayDialog')?.open && detailedMode && firstDecisionIndex != null && replayIndex() <= firstDecisionIndex) {
        event.preventDefault();
        event.stopImmediatePropagation();
        playInterfaceTap();
        showReplaySummary();
      }
    }, true);

    $('#replaySlider')?.addEventListener('input', (event) => {
      const value = Number(event.target.value) || 0;
      if ($('#replayDialog')?.open && detailedMode && firstDecisionIndex != null && value < firstDecisionIndex) {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.target.value = String(firstDecisionIndex);
        showReplaySummary();
      }
    }, true);
  }

  function bindTapSounds() {
    document.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('#principlesStartButton, #principlesSetupButton, #resultReplay, #resultInsights, #resultSetup, #resultNext, #replayBackToReview, #startDetailedCoachReview');
      if (!button || button.disabled) return;
      playInterfaceTap(button.matches('#principlesStartButton, #resultReplay, #startDetailedCoachReview'));
    }, { passive: true });
  }

  function exposeDiagnostics() {
    const attach = () => {
      if (!window.__KMATE__) {
        window.setTimeout(attach, 50);
        return;
      }
      window.__KMATE__.reviewUiVersion = UI_VERSION;
      window.__KMATE__.reviewSummaryState = () => {
        const session = activeSession();
        return {
          version: UI_VERSION,
          detailedMode,
          firstDecisionIndex,
          sessionId: session?.id || null,
          composition: compositionForRecords(session?.userMoves || []),
          principlesOpen: Boolean($('#principlesDialog')?.open),
          replaySummaryVisible: Boolean($('#coachReviewSummary') && !$('#coachReviewSummary').hidden),
        };
      };
      window.__KMATE__.reviewUiTest = {
        compositionForRecords,
        showSummary: () => showReplaySummary(),
        startDetailed: () => startDetailedReview(),
        refresh: () => { refreshResultSummary(); refreshReplaySummary(); },
      };
    };
    attach();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;

    const principles = $('#principlesDialog');
    const principlesList = $('#principlesList');
    principles?.classList.add('kmate-principles-v354');
    if (principlesList) new MutationObserver(() => queueMicrotask(enhancePrinciples)).observe(principlesList, { childList: true });
    if (principles) new MutationObserver(syncPrincipleScreen).observe(principles, { attributes: true, attributeFilter: ['open'] });

    const result = $('#resultDialog');
    const replay = $('#replayDialog');
    if (result) new MutationObserver(handleResultOpen).observe(result, { attributes: true, attributeFilter: ['open'] });
    if (replay) new MutationObserver(handleReplayOpen).observe(replay, { attributes: true, attributeFilter: ['open'] });

    ensureResultSummary();
    ensureReplaySummary();
    bindCaptureNavigation();
    bindTapSounds();
    exposeDiagnostics();
    enhancePrinciples();
    document.documentElement.dataset.reviewUi = 'ready';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
