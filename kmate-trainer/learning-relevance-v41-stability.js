const KM41_STABILITY_VERSION = '41.0.0';
let km41StabilityBusy = false;
let km41StabilityTimer = null;
let km41StabilityObserver = null;

function km41Stability$(selector, root = document) {
  return root.querySelector(selector);
}

function km41StabilityEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function km41StabilityLoss(loss) {
  const value = Number(loss);
  if (!Number.isFinite(value)) return 'review';
  return `−${(value / 100).toFixed(value >= 100 ? 1 : 2)}`;
}

function km41StabilityRecommendation() {
  try {
    return window.__KMATE_RELEVANCE__?.recommendation?.() || null;
  } catch (error) {
    console.warn('K-Mate v41 could not restore the move evidence.', error);
    return null;
  }
}

function km41StabilityEvidenceRow(item) {
  return `
    <article class="km41-evidence-row" data-km41-evidence="${km41StabilityEscape(item.id)}">
      <div class="km41-move-badge"><b>${km41StabilityEscape(item.moveLabel || item.san || 'Decision')}</b><span>${km41StabilityEscape(km41StabilityLoss(item.loss))} · ${km41StabilityEscape(item.quality || 'review')}</span></div>
      <div class="km41-evidence-copy"><b>${km41StabilityEscape(item.focusLabel || 'Learning')} · ${km41StabilityEscape(item.skill || 'decision quality')}</b><span>${km41StabilityEscape(item.explanation || item.details?.[0] || 'This move generated the current learning focus.')}${item.bestSan ? ` The engine preferred ${km41StabilityEscape(item.bestSan)}.` : ''}</span></div>
      ${item.bestSan ? `<div class="km41-best-move">Best: ${km41StabilityEscape(item.bestSan)}</div>` : ''}
    </article>`;
}

function km41StabilityPlanChip(slot) {
  const themes = (slot.themes || []).slice(0, 2).map((theme) => String(theme).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()).join(' / ');
  return `<span class="km41-plan-chip"><b>${slot.slot}. ${km41StabilityEscape(slot.focusLabel || slot.focus)}</b><br>${km41StabilityEscape(slot.sourceMove || 'baseline')}${themes ? ` · ${km41StabilityEscape(themes)}` : ''}</span>`;
}

function km41RepairEvidenceCard() {
  const view = km41Stability$('#learningView');
  const recommendation = km41StabilityRecommendation();
  if (!view || !recommendation) return null;
  let card = km41Stability$('#km41RecommendationEvidence', view);
  if (!card) {
    card = document.createElement('section');
    card.id = 'km41RecommendationEvidence';
    card.className = 'card km41-evidence-card';
    const grid = km41Stability$('.learning-grid', view);
    if (grid) grid.before(card);
    else view.append(card);
  }
  const evidence = recommendation.moveEvidence || [];
  const evidenceMarkup = evidence.length
    ? evidence.slice(0, 4).map(km41StabilityEvidenceRow).join('')
    : '<div class="km41-evidence-row"><div class="km41-evidence-copy"><b>No large move-level signal yet</b><span>Complete a practice so K-Mate can tie each puzzle and lesson directly to your decisions.</span></div></div>';
  const plan = recommendation.puzzlePlan || [];
  card.innerHTML = `
    <div class="km41-evidence-head">
      <div><div class="eyebrow">Why this exact learning set</div><h2>Built from the moves you actually played</h2><p>${km41StabilityEscape(recommendation.relevance?.summary || recommendation.puzzleSetSummary || '')}</p></div>
      <span class="km41-confidence">${km41StabilityEscape(recommendation.relevance?.confidence || 'baseline')} relevance</span>
    </div>
    <div class="km41-evidence-list">${evidenceMarkup}</div>
    ${plan.length ? `<div class="km41-plan-title">Five-puzzle composition</div><div class="km41-plan-chips">${plan.map(km41StabilityPlanChip).join('')}</div>` : ''}`;
  return card;
}

function km41StabilityRow(entry, index) {
  const video = entry.video || {};
  const moves = [...new Set((entry.evidence || []).map((item) => item.moveLabel).filter(Boolean))].slice(0, 3).join(', ');
  return `
    <article class="km41-lesson-row ${index === 0 ? 'primary-match' : ''}">
      <div class="km41-lesson-copy">
        <small>${km41StabilityEscape(entry.label || 'Relevant lesson')} · ${km41StabilityEscape(video.level || 'all levels')}</small>
        <b>${km41StabilityEscape(video.title || 'Chess lesson')}</b>
        <span>${km41StabilityEscape(video.creator || 'Chess educator')}${moves ? ` · tied to ${km41StabilityEscape(moves)}` : ''}</span>
        <span class="km41-lesson-why">${km41StabilityEscape(entry.why || 'This lesson matches the key decisions from the latest practice.')}</span>
      </div>
      <div class="km41-lesson-actions">
        <span class="km41-match-badge">#${index + 1}</span>
        <button class="learning-mini-button primary-lite" type="button" data-km41-watch-video="${km41StabilityEscape(video.id)}">Watch</button>
      </div>
    </article>`;
}

async function km41RepairRankedLessons() {
  const api = window.__KMATE_RELEVANCE__;
  const view = km41Stability$('#learningView');
  const card = km41Stability$('#learningVideoCard');
  km41RepairEvidenceCard();
  if (!api?.rankLessons || !view || view.hidden || !card || km41StabilityBusy) return;
  if (card.classList.contains('km41-ranked-lessons') && card.querySelectorAll('.km41-lesson-row').length >= 3) return;

  km41StabilityBusy = true;
  try {
    const ranked = await api.rankLessons();
    if (!Array.isArray(ranked) || !ranked.length) return;
    card.className = 'km41-ranked-lessons';
    card.innerHTML = ranked.slice(0, 3).map(km41StabilityRow).join('');
    const section = card.closest('.learning-card');
    const heading = section?.querySelector('h2');
    const copy = section?.querySelector(':scope > p');
    if (heading) heading.textContent = 'Lessons ranked from your actual moves';
    if (copy) copy.textContent = 'Review the move-specific reasons first, then choose the lesson that addresses the decision you want to improve.';
    const button = km41Stability$('#learningWatchLesson');
    if (button) {
      button.disabled = false;
      button.textContent = `See ${ranked.length} relevant lessons`;
    }
  } catch (error) {
    console.warn('K-Mate v41 could not restore the ranked lesson list.', error);
  } finally {
    km41StabilityBusy = false;
  }
}

function km41ScheduleRepair(delay = 45) {
  window.clearTimeout(km41StabilityTimer);
  km41StabilityTimer = window.setTimeout(() => {
    void km41RepairRankedLessons();
  }, delay);
}

function km41EntryClick(event) {
  const target = event.target instanceof Element ? event.target.closest('#wizardLearningButton,#learningNavButton,[data-view="learning"]') : null;
  if (!target) return;
  km41ScheduleRepair(0);
  window.setTimeout(() => km41ScheduleRepair(0), 120);
  window.setTimeout(() => km41ScheduleRepair(0), 500);
}

function km41BeginStability(attempt = 0) {
  if (!window.__KMATE_RELEVANCE__ || !km41Stability$('#learningView')) {
    if (attempt < 180) window.setTimeout(() => km41BeginStability(attempt + 1), 100);
    return;
  }
  if (!km41StabilityObserver) {
    km41StabilityObserver = new MutationObserver(() => km41ScheduleRepair());
    km41StabilityObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
    document.addEventListener('click', km41EntryClick, true);
  }
  window.setInterval(() => km41ScheduleRepair(), 1400);
  km41ScheduleRepair(0);
  window.__KMATE_RELEVANCE_STABILITY__ = {
    version: KM41_STABILITY_VERSION,
    repair: km41RepairRankedLessons,
    state: () => ({
      ready: true,
      evidenceCard: Boolean(km41Stability$('#km41RecommendationEvidence')),
      rankedRows: km41Stability$('#learningVideoCard')?.querySelectorAll('.km41-lesson-row').length || 0,
    }),
  };
}

km41BeginStability();
