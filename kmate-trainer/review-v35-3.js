(() => {
  'use strict';

  const UI_VERSION = '35.3-principles-summary';
  const QUALITY_KEYS = ['best', 'excellent', 'good', 'inaccuracy', 'miss', 'blunder'];
  const QUALITY_LABELS = {
    best: 'Best', excellent: 'Excellent', good: 'Good',
    inaccuracy: 'Inaccuracies', miss: 'Misses', blunder: 'Blunders',
  };
  const QUALITY_WEIGHTS = { best: 100, excellent: 94, good: 80, inaccuracy: 58, miss: 32, blunder: 8 };

  let resultRefreshTimer = null;
  let replayAdvanceSerial = 0;
  let uiAudioContext = null;
  let lastTapAt = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function dialogIsOpen(dialog) {
    return Boolean(dialog && (dialog.open || dialog.hasAttribute('open')));
  }

  function conciseSentence(value, maxLength = 96) {
    const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    const first = cleaned.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || cleaned;
    if (first.length <= maxLength) return first;
    const clipped = first.slice(0, maxLength - 1).replace(/\s+\S*$/, '').trim();
    return `${clipped || first.slice(0, maxLength - 1)}…`;
  }

  function principleTextParts(item) {
    const titleElement = item.querySelector('h2,h3,h4,b,strong');
    let title = titleElement?.textContent?.replace(/^\s*\d+[.)]?\s*/, '').trim() || '';
    const candidates = $$('p,small,span', item)
      .filter((node) => !titleElement?.contains(node) && !node.classList.contains('principle-number'))
      .map((node) => node.textContent?.trim() || '').filter(Boolean);
    let description = candidates.find((text) => text !== title) || '';
    if (!title) {
      const full = item.textContent?.replace(/\s+/g, ' ').trim() || '';
      const pieces = full.split(/(?<=[.!?])\s+/);
      title = pieces.shift() || 'Position principle';
      description = pieces.join(' ');
    }
    return {
      title: conciseSentence(title, 62).replace(/[.!?]$/, ''),
      description: conciseSentence(description, 104),
    };
  }

  function enhancePrinciplesDialog() {
    const dialog = $('#principlesDialog');
    if (!dialog || !dialogIsOpen(dialog)) return;
    dialog.classList.add('kmate-principles-v353');

    const title = $('#principlesPositionTitle');
    const subtitle = $('#principlesPositionSubtitle');
    const note = dialog.querySelector('.principles-note');
    const eyebrow = dialog.querySelector('.eyebrow');
    const list = $('#principlesList');
    const setup = $('#principlesSetupButton');
    const start = $('#principlesStartButton');

    if (subtitle) subtitle.hidden = true;
    if (note) note.hidden = true;
    if (eyebrow) eyebrow.hidden = true;
    if (setup) {
      setup.textContent = 'Change setup';
      setup.classList.add('principle-action', 'principle-secondary');
    }
    if (start) {
      start.textContent = 'Start clock';
      start.classList.add('principle-action', 'principle-primary');
    }
    if (!list) return;

    const rawItems = [...list.children];
    const visibleItems = rawItems.slice(0, 5);
    rawItems.slice(5).forEach((item) => { item.hidden = true; });
    list.style.setProperty('--principle-count', String(Math.max(1, visibleItems.length)));
    if (title) title.textContent = `${visibleItems.length || 5} principles for this position`;

    visibleItems.forEach((item, index) => {
      const { title: principleTitle, description } = principleTextParts(item);
      item.hidden = false;
      item.className = 'principle-focus-card';
      item.dataset.principleIndex = String(index + 1);
      item.innerHTML = `
        <span class="principle-number" aria-hidden="true">${index + 1}</span>
        <span class="principle-copy">
          <b>${escapeHtml(principleTitle || `Principle ${index + 1}`)}</b>
          ${description ? `<span class="principle-mini-description">${escapeHtml(description)}</span>` : ''}
        </span>`;
    });

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  function moveQualityKey(element) {
    const candidates = [element, ...$$('*', element)];
    for (const candidate of candidates) {
      for (const key of QUALITY_KEYS) {
        if (candidate.classList?.contains(`quality-${key}`)) return key;
      }
    }
    const text = element.textContent?.toLowerCase() || '';
    if (/\bbest\b/.test(text)) return 'best';
    if (/excellent/.test(text)) return 'excellent';
    if (/\bgood\b/.test(text)) return 'good';
    if (/inaccur/.test(text)) return 'inaccuracy';
    if (/\bmiss\b|mistake/.test(text)) return 'miss';
    if (/blunder/.test(text)) return 'blunder';
    return null;
  }

  function compositionFromMoveList() {
    const counts = Object.fromEntries(QUALITY_KEYS.map((key) => [key, 0]));
    let pending = 0;
    const moveElements = $$('#moveList .user-move');
    for (const element of moveElements) {
      const key = moveQualityKey(element);
      if (key) counts[key] += 1;
      else pending += 1;
    }
    return { counts, pending, total: moveElements.length };
  }

  function gameRating(composition) {
    const analyzed = QUALITY_KEYS.reduce((sum, key) => sum + composition.counts[key], 0);
    if (!analyzed) return null;
    const weighted = QUALITY_KEYS.reduce((sum, key) => sum + composition.counts[key] * QUALITY_WEIGHTS[key], 0);
    return Math.max(0, Math.min(100, Math.round(weighted / analyzed)));
  }

  function gameRatingLabel(rating) {
    if (!Number.isFinite(rating)) return 'Analysis finishing';
    if (rating >= 96) return 'Exceptional game';
    if (rating >= 90) return 'Excellent game';
    if (rating >= 82) return 'Strong game';
    if (rating >= 72) return 'Solid game';
    if (rating >= 60) return 'Developing game';
    return 'Important review game';
  }

  function gameRatingGrade(rating) {
    if (!Number.isFinite(rating)) return '—';
    if (rating >= 96) return 'A+';
    if (rating >= 90) return 'A';
    if (rating >= 82) return 'B+';
    if (rating >= 72) return 'B';
    if (rating >= 60) return 'C';
    return 'D';
  }

  function compositionMarkup(composition) {
    return QUALITY_KEYS.map((key) => `
      <div class="game-composition-item quality-${key}">
        <span>${QUALITY_LABELS[key]}</span><b>${composition.counts[key]}</b>
      </div>`).join('');
  }

  function renderResultSummary() {
    const dialog = $('#resultDialog');
    if (!dialog || !dialogIsOpen(dialog)) return;
    const card = dialog.querySelector('.result-card');
    const postReview = $('#postReview');
    if (!card || !postReview) return;

    const composition = compositionFromMoveList();
    const rating = gameRating(composition);
    let summary = $('#kmateGameSummary');
    if (!summary) {
      summary = document.createElement('section');
      summary.id = 'kmateGameSummary';
      summary.className = 'game-summary-v353';
      postReview.before(summary);
    }

    summary.innerHTML = `
      <div class="game-summary-heading">
        <div>
          <small>Coach review</small>
          <h3>${escapeHtml(gameRatingLabel(rating))}</h3>
          <p>${composition.total ? `${composition.total} decision${composition.total === 1 ? '' : 's'} from this position` : 'Your move analysis is being prepared.'}</p>
        </div>
        <div class="game-rating-orb" aria-label="Game rating ${Number.isFinite(rating) ? `${rating} out of 100` : 'pending'}">
          <b>${Number.isFinite(rating) ? rating : '—'}</b><span>/100</span><i>${gameRatingGrade(rating)}</i>
        </div>
      </div>
      <div class="game-composition-grid" aria-label="Move-quality composition">${compositionMarkup(composition)}</div>
      <div class="game-review-prompt">
        <span>${composition.pending
          ? `${composition.pending} move${composition.pending === 1 ? '' : 's'} still being analyzed. Counts update automatically.`
          : 'See every decision on the board, why it changed the position, and what the stronger continuation achieved.'}</span>
        <b>Detailed coach review follows move by move.</b>
      </div>`;

    postReview.hidden = true;
    const genericCoach = $('#resultCoach');
    if (genericCoach) genericCoach.hidden = true;
    const replayButton = $('#resultReplay');
    if (replayButton) {
      replayButton.textContent = replayButton.disabled ? 'Detailed review unavailable' : 'Open detailed coach review →';
      replayButton.classList.add('detailed-review-button');
    }
    dialog.classList.add('kmate-result-v353');
  }

  function scheduleResultSummary() {
    window.clearTimeout(resultRefreshTimer);
    resultRefreshTimer = window.setTimeout(renderResultSummary, 20);
  }

  function replayNeedsAdvance() {
    const title = $('#replayCoachTitle')?.textContent?.trim() || '';
    const rating = $('#replayRating')?.textContent?.trim().toLowerCase() || '';
    return /orient yourself|original position|start with/i.test(title)
      || ['start', 'position', 'opponent'].includes(rating);
  }

  function advanceReplayToFirstDecision(serial, attempts = 0) {
    if (serial !== replayAdvanceSerial) return;
    const dialog = $('#replayDialog');
    if (!dialogIsOpen(dialog)) return;
    const replayTitle = $('#replayTitle');
    const subtitle = $('#replaySubtitle');
    if (replayTitle) replayTitle.textContent = 'Detailed coach review';
    if (subtitle && /\bVarious\b/i.test(subtitle.textContent || '')) subtitle.textContent = 'Move-by-move analysis';

    if (!replayNeedsAdvance() || attempts >= 32) return;
    const next = $('#replayNext');
    if (!next || next.disabled) return;
    next.click();
    window.setTimeout(() => advanceReplayToFirstDecision(serial, attempts + 1), 35);
  }

  function prepareDetailedReplay() {
    const dialog = $('#replayDialog');
    if (!dialog || !dialogIsOpen(dialog)) return;
    dialog.classList.add('kmate-replay-v353');
    const serial = ++replayAdvanceSerial;
    window.requestAnimationFrame(() => advanceReplayToFirstDecision(serial));
  }

  function soundsAllowed() {
    const toggle = $('#soundToggle');
    return !toggle || !toggle.classList.contains('muted');
  }

  function playWoodTap() {
    if (!soundsAllowed()) return;
    const nowMs = performance.now();
    if (nowMs - lastTapAt < 45) return;
    lastTapAt = nowMs;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      uiAudioContext ||= new AudioContextClass();
      const context = uiAudioContext;
      context.resume?.();
      const now = context.currentTime;
      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.05, now + 0.004);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      master.connect(context.destination);
      const body = context.createOscillator();
      const bodyGain = context.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(190, now);
      body.frequency.exponentialRampToValueAtTime(108, now + 0.07);
      bodyGain.gain.setValueAtTime(0.88, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
      body.connect(bodyGain).connect(master);
      body.start(now);
      body.stop(now + 0.085);
    } catch {}
  }

  function handlePointerSound(event) {
    if (event.target.closest('#principlesDialog button, #resultDialog button, #replayDialog button')) playWoodTap();
  }

  function observeDialogs() {
    const principles = $('#principlesDialog');
    const result = $('#resultDialog');
    const replay = $('#replayDialog');
    const moveList = $('#moveList');

    const attributeObserver = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target;
        if (target === principles && dialogIsOpen(principles)) enhancePrinciplesDialog();
        if (target === result && dialogIsOpen(result)) scheduleResultSummary();
        if (target === replay && dialogIsOpen(replay)) prepareDetailedReplay();
      }
    });
    for (const dialog of [principles, result, replay]) {
      if (dialog) attributeObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    }

    const list = $('#principlesList');
    if (list) new MutationObserver(enhancePrinciplesDialog).observe(list, { childList: true });
    if (moveList) new MutationObserver(scheduleResultSummary).observe(moveList, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
    });
  }

  function exposeDiagnostics() {
    const attach = () => {
      if (!window.__KMATE__) {
        window.setTimeout(attach, 40);
        return;
      }
      window.__KMATE__.reviewUiVersion = UI_VERSION;
      window.__KMATE__.refreshGameSummary = renderResultSummary;
      window.__KMATE__.reviewUiState = () => {
        const composition = compositionFromMoveList();
        return {
          version: UI_VERSION,
          principlesOpen: dialogIsOpen($('#principlesDialog')),
          resultOpen: dialogIsOpen($('#resultDialog')),
          replayOpen: dialogIsOpen($('#replayDialog')),
          composition,
          rating: gameRating(composition),
        };
      };
    };
    attach();
  }

  function initialize() {
    document.documentElement.dataset.reviewUi = UI_VERSION;
    document.addEventListener('pointerdown', handlePointerSound, { passive: true });
    observeDialogs();
    exposeDiagnostics();
    enhancePrinciplesDialog();
    renderResultSummary();
    prepareDetailedReplay();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
