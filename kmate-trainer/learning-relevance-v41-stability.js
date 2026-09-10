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

function km41ScheduleRepair() {
  window.clearTimeout(km41StabilityTimer);
  km41StabilityTimer = window.setTimeout(() => {
    void km41RepairRankedLessons();
  }, 45);
}

function km41BeginStability(attempt = 0) {
  if (!window.__KMATE_RELEVANCE__ || !km41Stability$('#learningView')) {
    if (attempt < 180) window.setTimeout(() => km41BeginStability(attempt + 1), 100);
    return;
  }
  if (!km41StabilityObserver) {
    km41StabilityObserver = new MutationObserver(km41ScheduleRepair);
    km41StabilityObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
  }
  window.setInterval(km41ScheduleRepair, 1400);
  km41ScheduleRepair();
  window.__KMATE_RELEVANCE_STABILITY__ = {
    version: KM41_STABILITY_VERSION,
    repair: km41RepairRankedLessons,
    state: () => ({
      ready: true,
      rankedRows: km41Stability$('#learningVideoCard')?.querySelectorAll('.km41-lesson-row').length || 0,
    }),
  };
}

km41BeginStability();
