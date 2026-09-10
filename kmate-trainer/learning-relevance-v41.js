const KM41_UI_VERSION = '41.0.0';
const KM41_BASE_URL = new URL('./', import.meta.url);
const KM41_VIDEO_URL = new URL(`./learning/videos-v40.json?v=${KM41_UI_VERSION}`, KM41_BASE_URL).href;
const KM41_PUZZLE_INDEX_URL = new URL(`./learning/puzzles/index.json?v=${KM41_UI_VERSION}`, KM41_BASE_URL).href;
const KM41_PROGRESS_KEY = 'kmate-learning-v40';
const KM41_FILES = 'abcdefgh';
const KM41_PIECES = Object.freeze({
  w: Object.freeze({ k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }),
  b: Object.freeze({ k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }),
});

const KM41_THEME_LABELS = Object.freeze({
  hangingPiece: 'hanging pieces',
  capturingDefender: 'remove the defender',
  trappedPiece: 'trapped pieces',
  fork: 'forks',
  pin: 'pins',
  skewer: 'skewers',
  discoveredAttack: 'discovered attacks',
  deflection: 'deflection',
  intermezzo: 'in-between moves',
  interference: 'interference',
  sacrifice: 'sacrifices',
  doubleCheck: 'double check',
  mate: 'mating attacks',
  mateIn1: 'mate in one',
  mateIn2: 'mate in two',
  mateIn3: 'mate in three',
  backRankMate: 'back-rank mates',
  smotheredMate: 'smothered mates',
  exposedKing: 'exposed kings',
  kingsideAttack: 'kingside attacks',
  defensiveMove: 'defensive resources',
  equality: 'saving equality',
  quietMove: 'quiet best moves',
  advantage: 'positional advantages',
  endgame: 'endgames',
  rookEndgame: 'rook endings',
  pawnEndgame: 'pawn endings',
  queenEndgame: 'queen endings',
  zugzwang: 'zugzwang',
  promotion: 'promotion',
  advancedPawn: 'advanced pawns',
  underPromotion: 'underpromotion',
  middlegame: 'middlegame',
});

let km41VideoPromise = null;
let km41IndexPromise = null;
let km41SyncTimer = null;
let km41Observer = null;
let km41RenderTimer = null;
let km41LastPageKey = '';
let km41RankedLessons = [];
let km41LegacyOpenLearning = null;
const km41ShardCache = new Map();

const km41Puzzle = {
  puzzles: [],
  index: 0,
  game: null,
  selected: null,
  solutionIndex: 0,
  wrongAttempts: 0,
  totalWrong: 0,
  solved: 0,
  skipped: 0,
  recommendation: null,
  hintSquares: [],
  locked: false,
  orientation: 'w',
  startedAt: null,
  returnContext: 'learning',
  source: 'tailored',
};

function km41$(selector, root = document) {
  return root.querySelector(selector);
}

function km41$$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function km41Escape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function km41Normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function km41Tokens(value) {
  return new Set(km41Normalize(value).split(/\s+/).filter((token) => token.length > 2));
}

function km41Hash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function km41ThemeLabel(theme) {
  return KM41_THEME_LABELS[theme] || String(theme || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function km41ReadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KM41_PROGRESS_KEY) || '{}');
    return {
      version: 41,
      seen: Array.isArray(parsed.seen) ? parsed.seen : [],
      puzzles: parsed.puzzles && typeof parsed.puzzles === 'object' ? parsed.puzzles : {},
      videos: parsed.videos && typeof parsed.videos === 'object' ? parsed.videos : {},
      workouts: Array.isArray(parsed.workouts) ? parsed.workouts : [],
    };
  } catch {
    return { version: 41, seen: [], puzzles: {}, videos: {}, workouts: [] };
  }
}

function km41SaveProgress(progress) {
  try {
    progress.version = 41;
    progress.seen = [...new Set(progress.seen || [])].slice(-2200);
    progress.workouts = (progress.workouts || []).slice(-140);
    localStorage.setItem(KM41_PROGRESS_KEY, JSON.stringify(progress));
  } catch {}
}

async function km41FetchJson(url, label) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`${label} could not load (${response.status}).`);
  return response.json();
}

function km41LoadVideos() {
  if (!km41VideoPromise) km41VideoPromise = km41FetchJson(KM41_VIDEO_URL, 'The lesson catalog');
  return km41VideoPromise;
}

function km41LoadIndex() {
  if (!km41IndexPromise) km41IndexPromise = km41FetchJson(KM41_PUZZLE_INDEX_URL, 'The puzzle library');
  return km41IndexPromise;
}

function km41Recommendation() {
  try {
    return window.__KMATE_LEARNING__?.recommendation?.()
      || window.__KMATE_LEARNING_CORE__?.recommend?.()
      || null;
  } catch (error) {
    console.warn('K-Mate v41 could not read the recommendation.', error);
    return null;
  }
}

function km41FormatLoss(loss) {
  const value = Number(loss);
  if (!Number.isFinite(value)) return 'review';
  return `−${(value / 100).toFixed(value >= 100 ? 1 : 2)}`;
}

function km41EvidenceTitle(evidence) {
  if (!evidence) return 'Move-level review';
  const focus = String(evidence.focusLabel || 'learning').toLowerCase();
  return `${focus} from ${evidence.moveLabel || evidence.san || 'this decision'}`;
}

function km41EvidenceExplanation(evidence) {
  if (!evidence) return '';
  const best = evidence.bestSan ? ` The engine preferred ${evidence.bestSan}.` : '';
  const detail = evidence.explanation || evidence.details?.[0] || '';
  return `${detail}${best}`.trim();
}

function km41InstallCss() {
  if (km41$('#km41RelevanceStyles')) return;
  const link = document.createElement('link');
  link.id = 'km41RelevanceStyles';
  link.rel = 'stylesheet';
  link.href = new URL(`./learning-relevance-v41.css?v=${KM41_UI_VERSION}`, KM41_BASE_URL).href;
  document.head.append(link);
}

function km41EvidenceMarkup(recommendation) {
  const evidence = recommendation?.moveEvidence || [];
  if (!evidence.length) {
    return '<div class="km41-evidence-row"><div class="km41-evidence-copy"><b>No large move-level signal yet</b><span>Complete a practice so K-Mate can tie each puzzle and lesson directly to your decisions.</span></div></div>';
  }
  return evidence.slice(0, 4).map((item) => `
    <article class="km41-evidence-row" data-km41-evidence="${km41Escape(item.id)}">
      <div class="km41-move-badge"><b>${km41Escape(item.moveLabel)}</b><span>${km41Escape(km41FormatLoss(item.loss))} · ${km41Escape(item.quality || 'review')}</span></div>
      <div class="km41-evidence-copy"><b>${km41Escape(item.focusLabel)} · ${km41Escape(item.skill || 'decision quality')}</b><span>${km41Escape(km41EvidenceExplanation(item))}</span></div>
      ${item.bestSan ? `<div class="km41-best-move">Best: ${km41Escape(item.bestSan)}</div>` : ''}
    </article>`).join('');
}

function km41PlanMarkup(recommendation) {
  const plan = recommendation?.puzzlePlan || [];
  if (!plan.length) return '';
  return plan.map((slot) => `
    <span class="km41-plan-chip"><b>${slot.slot}. ${km41Escape(slot.focusLabel)}</b><br>${km41Escape(slot.sourceMove || 'baseline')} · ${km41Escape((slot.themes || []).slice(0, 2).map(km41ThemeLabel).join(' / ') || slot.skill || '')}</span>`).join('');
}

function km41EnsureEvidenceCard() {
  const view = km41$('#learningView');
  if (!view) return null;
  let card = km41$('#km41RecommendationEvidence', view);
  if (card) return card;
  card = document.createElement('section');
  card.id = 'km41RecommendationEvidence';
  card.className = 'card km41-evidence-card';
  const grid = km41$('.learning-grid', view);
  if (grid) grid.before(card);
  else view.append(card);
  return card;
}

function km41RenderEvidenceCard(recommendation) {
  const card = km41EnsureEvidenceCard();
  if (!card || !recommendation) return;
  const confidence = recommendation.relevance?.confidence || 'baseline';
  card.innerHTML = `
    <div class="km41-evidence-head">
      <div><div class="eyebrow">Why this exact learning set</div><h2>Built from the moves you actually played</h2><p>${km41Escape(recommendation.relevance?.summary || recommendation.puzzleSetSummary || '')}</p></div>
      <span class="km41-confidence">${km41Escape(confidence)} relevance</span>
    </div>
    <div class="km41-evidence-list">${km41EvidenceMarkup(recommendation)}</div>
    <div class="km41-plan-title">Five-puzzle composition</div>
    <div class="km41-plan-chips">${km41PlanMarkup(recommendation)}</div>`;
}

function km41VideoWords(video) {
  return km41Tokens([
    video.title,
    video.creator,
    ...(video.tags || []),
    ...(video.focus || []),
    ...(video.openingKeys || []),
  ].join(' '));
}

function km41EvidenceWords(evidence) {
  return km41Tokens([
    evidence.focusLabel,
    evidence.skill,
    ...(evidence.lessonTags || []),
    ...(evidence.themes || []).map(km41ThemeLabel),
    ...(evidence.diagnoses || []).flatMap((item) => [item.title, item.evidence]),
    ...(evidence.details || []),
  ].join(' '));
}

function km41OpeningMatch(video, opening) {
  const normalized = km41Normalize(opening);
  if (!normalized) return false;
  return (video.openingKeys || []).some((key) => {
    const candidate = km41Normalize(key);
    return candidate && (normalized.includes(candidate) || candidate.includes(normalized));
  });
}

function km41RankLessons(catalog, recommendation) {
  const progress = km41ReadProgress();
  const evidence = recommendation?.moveEvidence || [];
  const target = Number(recommendation?.puzzleRating || 1400);
  const opening = recommendation?.opening || '';

  return (catalog?.videos || []).map((video) => {
    let score = 0;
    const matches = [];
    const videoWords = km41VideoWords(video);

    evidence.slice(0, 6).forEach((item, index) => {
      const weight = Math.max(0.45, 1 - index * 0.12);
      let moveScore = 0;
      const matchedTags = [];
      if ((video.focus || []).includes(item.focus)) moveScore += 95;
      const itemWords = km41EvidenceWords(item);
      for (const word of itemWords) {
        if (videoWords.has(word)) matchedTags.push(word);
      }
      moveScore += Math.min(60, [...new Set(matchedTags)].length * 12);
      for (const tag of item.lessonTags || []) {
        const normalizedTag = km41Normalize(tag);
        if (normalizedTag && km41Normalize([video.title, ...(video.tags || [])].join(' ')).includes(normalizedTag)) {
          moveScore += 24;
          matchedTags.push(tag);
        }
      }
      if (moveScore > 0) {
        score += moveScore * weight;
        matches.push({
          evidence: item,
          score: moveScore * weight,
          tags: [...new Set(matchedTags)].slice(0, 4),
        });
      }
    });

    if (!evidence.length && (video.focus || []).includes(recommendation?.focus?.key)) score += 80;
    if (km41OpeningMatch(video, opening)) score += 72;
    if (target < 1300 && ['beginner', 'improver'].includes(video.level)) score += 16;
    if (target >= 1300 && ['intermediate', 'improver'].includes(video.level)) score += 14;
    const watched = progress.videos?.[video.id];
    if (!watched) score += 12;
    else score -= Math.min(15, Number(watched.opens || 1) * 3);
    score += (km41Hash(`${recommendation?.sourceSessionId}:${video.id}`) % 100) / 1000;

    matches.sort((a, b) => b.score - a.score);
    const best = matches[0]?.evidence || evidence[0] || null;
    const matchedSkill = matches[0]?.tags?.[0] || best?.skill || recommendation?.focus?.label?.toLowerCase() || 'chess improvement';
    const why = best
      ? `${best.moveLabel} is the main reason: ${best.explanation || `the move showed a ${matchedSkill} gap`}. This lesson directly covers ${matchedSkill}.`
      : `This lesson matches the current ${recommendation?.focus?.label?.toLowerCase() || 'calculation'} focus near the selected level.`;
    const label = score >= 190 ? 'Very strong match' : score >= 125 ? 'Strong match' : score >= 75 ? 'Useful match' : 'Related lesson';

    return { video, score, label, why, evidence: matches.slice(0, 3).map((match) => match.evidence) };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
}

function km41LessonRowMarkup(entry, index, compact = false) {
  const video = entry.video;
  const moveLinks = [...new Set((entry.evidence || []).map((item) => item.moveLabel).filter(Boolean))].slice(0, 3).join(', ');
  return `
    <article class="km41-lesson-row ${index === 0 ? 'primary-match' : ''}">
      <div class="km41-lesson-copy">
        <small>${km41Escape(entry.label)} · ${km41Escape(video.level || 'all levels')}</small>
        <b>${km41Escape(video.title)}</b>
        <span>${km41Escape(video.creator || 'Chess educator')}${moveLinks ? ` · tied to ${km41Escape(moveLinks)}` : ''}</span>
        <span class="km41-lesson-why">${km41Escape(entry.why)}</span>
      </div>
      <div class="km41-lesson-actions">
        <span class="km41-match-badge">#${index + 1}</span>
        <button class="learning-mini-button primary-lite" type="button" data-km41-watch-video="${km41Escape(video.id)}">Watch</button>
        ${compact ? '' : `<a class="learning-mini-button" href="${km41Escape(video.sourceUrl)}" target="_blank" rel="noopener noreferrer">Lichess</a>`}
      </div>
    </article>`;
}

async function km41RenderRankedLessons(recommendation) {
  const card = km41$('#learningVideoCard');
  if (!card || !recommendation) return;
  const section = card.closest('.learning-card');
  if (section) {
    const heading = section.querySelector('h2');
    const copy = section.querySelector(':scope > p');
    if (heading) heading.textContent = 'Lessons ranked from your actual moves';
    if (copy) copy.textContent = 'Review the reasons first, then choose the lesson that best addresses the decisions from your latest practice.';
  }
  try {
    const catalog = await km41LoadVideos();
    const ranked = km41RankLessons(catalog, recommendation);
    km41RankedLessons = ranked;
    card.className = 'km41-ranked-lessons';
    card.innerHTML = ranked.slice(0, 3).map((entry, index) => km41LessonRowMarkup(entry, index, true)).join('')
      || '<div class="learning-library-empty">No move-matched lesson is available yet.</div>';
    const button = km41$('#learningWatchLesson');
    if (button) {
      button.disabled = !ranked.length;
      button.textContent = ranked.length ? `See ${ranked.length} relevant lessons` : 'No matched lessons';
    }
  } catch (error) {
    console.warn('K-Mate v41 lesson ranking failed.', error);
    card.className = 'km41-ranked-lessons';
    card.innerHTML = `<div class="learning-library-empty">${km41Escape(error?.message || 'The lesson catalog could not load.')}</div>`;
  }
}

function km41RenderLearningPage(recommendation) {
  if (!recommendation || !km41$('#learningView')) return;
  km41RenderEvidenceCard(recommendation);
  const reason = km41$('#learningReason');
  if (reason) reason.textContent = recommendation.puzzleSetSummary || recommendation.relevance?.summary || '';
  const start = km41$('#learningStartPuzzles');
  if (start) start.textContent = 'Start 5 move-matched puzzles';
  void km41RenderRankedLessons(recommendation);
}

function km41EnsureResultEvidence(card) {
  let details = km41$('#km41ResultEvidence', card);
  if (details) return details;
  details = document.createElement('div');
  details.id = 'km41ResultEvidence';
  details.className = 'km41-result-evidence';
  const actions = card.querySelector('.learning-result-actions');
  if (actions) actions.before(details);
  else card.append(details);
  return details;
}

function km41RenderResultCard(recommendation) {
  const card = km41$('#learningResultCard');
  if (!card || !recommendation) return;
  card.hidden = false;
  const kicker = card.querySelector('.learning-result-head small');
  const title = km41$('#learningResultTitle', card);
  const reason = km41$('#learningResultReason', card);
  if (kicker) kicker.textContent = 'Move-matched to this game · Your next 12 minutes';
  if (title) title.textContent = `${recommendation.focus?.label || 'Targeted review'} from ${recommendation.moveEvidence?.[0]?.moveLabel || 'your latest play'}`;
  if (reason) reason.textContent = recommendation.puzzleSetSummary || recommendation.relevance?.summary || '';
  const details = km41EnsureResultEvidence(card);
  const moves = (recommendation.moveEvidence || []).slice(0, 3);
  details.innerHTML = `
    <strong>Why K-Mate chose this set</strong>
    <div class="km41-result-moves">${moves.map((item) => `<span class="km41-result-move"><b>${km41Escape(item.moveLabel)}</b> · ${km41Escape(item.focusLabel)} ${km41Escape(km41FormatLoss(item.loss))}</span>`).join('')}</div>
    <div class="km41-result-summary">${km41Escape(recommendation.relevance?.summary || '')}</div>`;
  const puzzleButton = km41$('#learningResultPuzzles', card);
  const lessonButton = km41$('#learningResultVideo', card);
  if (puzzleButton) puzzleButton.textContent = 'Start 5 move-matched puzzles';
  if (lessonButton) lessonButton.textContent = `See ${Math.max(1, km41RankedLessons.length || 5)} relevant lessons`;
}

function km41EnsureLessonChoices() {
  let dialog = km41$('#km41LessonChoices');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'km41LessonChoices';
  dialog.className = 'modal';
  dialog.innerHTML = `
    <div class="km41-lesson-dialog-shell">
      <header class="km41-lesson-dialog-head">
        <div><div class="eyebrow">Lessons selected from your moves</div><h2 id="km41LessonChoicesTitle">Relevant instructional videos</h2><p id="km41LessonChoicesSummary"></p></div>
        <button class="roundbtn" id="km41LessonChoicesClose" type="button" aria-label="Close lesson recommendations">×</button>
      </header>
      <div class="km41-lesson-dialog-list" id="km41LessonChoicesList"></div>
    </div>`;
  document.body.append(dialog);
  const close = () => {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };
  km41$('#km41LessonChoicesClose', dialog)?.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  return dialog;
}

function km41EnsureLessonPlayer() {
  let dialog = km41$('#km41LessonPlayer');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'km41LessonPlayer';
  dialog.className = 'modal';
  dialog.innerHTML = `
    <div class="km41-lesson-dialog-shell">
      <header class="km41-lesson-dialog-head">
        <div><div class="eyebrow">Move-matched lesson</div><h2 id="km41LessonPlayerTitle">Chess lesson</h2><p id="km41LessonPlayerWhy"></p></div>
        <div class="km41-lesson-actions"><button class="btn" id="km41LessonPlayerBack" type="button">Back to list</button><button class="roundbtn" id="km41LessonPlayerClose" type="button" aria-label="Close lesson">×</button></div>
      </header>
      <div class="km41-player-frame"><iframe id="km41LessonPlayerFrame" title="K-Mate move-matched chess lesson" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      <div class="km41-player-footer"><p id="km41LessonPlayerCreator">Creator-hosted external lesson.</p><a id="km41LessonPlayerSource" target="_blank" rel="noopener noreferrer">Open the Lichess library page</a></div>
    </div>`;
  document.body.append(dialog);
  const close = () => {
    km41$('#km41LessonPlayerFrame', dialog)?.removeAttribute('src');
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };
  km41$('#km41LessonPlayerClose', dialog)?.addEventListener('click', close);
  km41$('#km41LessonPlayerBack', dialog)?.addEventListener('click', () => {
    close();
    km41ShowDialog(km41EnsureLessonChoices());
  });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => km41$('#km41LessonPlayerFrame', dialog)?.removeAttribute('src'));
  return dialog;
}

function km41ShowDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else dialog.setAttribute('open', '');
}

async function km41OpenLessonChoices() {
  const recommendation = km41Recommendation();
  if (!recommendation) return false;
  const dialog = km41EnsureLessonChoices();
  km41$('#km41LessonChoicesTitle', dialog).textContent = `Lessons for ${recommendation.focus?.label?.toLowerCase() || 'your latest game'}`;
  km41$('#km41LessonChoicesSummary', dialog).textContent = recommendation.relevance?.summary || recommendation.puzzleSetSummary || '';
  const list = km41$('#km41LessonChoicesList', dialog);
  list.innerHTML = '<div class="learning-library-empty">Ranking lessons against your move-level evidence…</div>';
  km41ShowDialog(dialog);
  try {
    const catalog = await km41LoadVideos();
    const ranked = km41RankLessons(catalog, recommendation);
    km41RankedLessons = ranked;
    list.innerHTML = ranked.map((entry, index) => km41LessonRowMarkup(entry, index, false)).join('')
      || '<div class="learning-library-empty">No relevant lesson was found.</div>';
    km41RenderResultCard(recommendation);
  } catch (error) {
    list.innerHTML = `<div class="learning-library-empty">${km41Escape(error?.message || 'The lesson catalog could not load.')}</div>`;
  }
  return true;
}

function km41RecordVideo(entry) {
  const video = entry?.video;
  if (!video) return;
  const progress = km41ReadProgress();
  const prior = progress.videos[video.id] || { opens: 0 };
  progress.videos[video.id] = {
    ...prior,
    opens: Number(prior.opens || 0) + 1,
    title: video.title,
    relevanceScore: Math.round(entry.score || 0),
    matchedMoves: (entry.evidence || []).map((item) => item.moveLabel).filter(Boolean),
    lastAt: new Date().toISOString(),
  };
  km41SaveProgress(progress);
}

function km41PlayLesson(videoId) {
  const entry = km41RankedLessons.find((item) => item.video.id === videoId);
  if (!entry) return false;
  const video = entry.video;
  const choices = km41$('#km41LessonChoices');
  if (choices?.open && typeof choices.close === 'function') choices.close();
  const dialog = km41EnsureLessonPlayer();
  km41$('#km41LessonPlayerTitle', dialog).textContent = video.title;
  km41$('#km41LessonPlayerWhy', dialog).textContent = entry.why;
  km41$('#km41LessonPlayerCreator', dialog).textContent = `${video.creator || 'Chess educator'} · ${video.level || 'all levels'} · creator-hosted external lesson`;
  km41$('#km41LessonPlayerSource', dialog).href = video.sourceUrl || `https://lichess.org/video/${video.id}`;
  const base = video.embedUrl || `https://www.youtube-nocookie.com/embed/${video.id}`;
  km41$('#km41LessonPlayerFrame', dialog).src = `${base}${base.includes('?') ? '&' : '?'}rel=0&modestbranding=1`;
  km41RecordVideo(entry);
  km41ShowDialog(dialog);
  km41ScheduleRender();
  return true;
}

function km41BandSequence(index, bandKey) {
  const bands = index?.bands || [];
  const position = Math.max(0, bands.findIndex((band) => band.key === bandKey));
  return [bands[position], bands[position - 1], bands[position + 1], bands[position - 2], bands[position + 2]].filter(Boolean);
}

async function km41LoadShard(file) {
  if (!file) return [];
  if (!km41ShardCache.has(file)) {
    const url = new URL(`./learning/puzzles/${file}?v=${KM41_UI_VERSION}`, KM41_BASE_URL).href;
    km41ShardCache.set(file, km41FetchJson(url, 'A puzzle category').then((payload) => payload.puzzles || []));
  }
  return km41ShardCache.get(file);
}

function km41ManualPlan(recommendation, focusKey) {
  const taxonomy = window.__KMATE_LEARNING_CORE__?.taxonomy?.[focusKey] || recommendation.focus;
  const themes = taxonomy?.puzzleThemes || [];
  return Array.from({ length: 5 }, (_, index) => ({
    slot: index + 1,
    focus: focusKey,
    focusLabel: taxonomy?.label || focusKey,
    themes,
    lessonTags: [],
    sourceMove: null,
    bestSan: null,
    loss: null,
    skill: taxonomy?.short || taxonomy?.description || focusKey,
    reason: `You selected ${String(taxonomy?.label || focusKey).toLowerCase()} from the open learning library.`,
  }));
}

function km41WorkoutRecommendation(base, focusOverride = null) {
  if (!base) return null;
  const chosenFocus = focusOverride || (base.focus?.pattern === 'chosen' ? base.focus.key : null);
  if (!chosenFocus) return base;
  const taxonomy = window.__KMATE_LEARNING_CORE__?.taxonomy?.[chosenFocus] || base.focus;
  const plan = km41ManualPlan(base, chosenFocus);
  return {
    ...base,
    focus: { ...taxonomy, pattern: 'chosen' },
    puzzlePlan: plan,
    puzzleSetSummary: `Five ${String(taxonomy?.label || chosenFocus).toLowerCase()} puzzles selected directly from the open library near rating ${base.puzzleRating || 1400}.`,
    relevance: {
      ...(base.relevance || {}),
      mode: 'chosen',
      confidence: 'chosen',
      summary: `This workout follows your manual ${String(taxonomy?.label || chosenFocus).toLowerCase()} selection rather than the latest-game prescription.`,
    },
  };
}

function km41OpeningScore(puzzle, recommendation) {
  const opening = km41Normalize(recommendation?.opening);
  if (!opening) return 0;
  const tags = km41Normalize((puzzle.openingTags || []).join(' '));
  if (!tags) return 0;
  const first = opening.split(' ')[0];
  return tags.includes(opening) ? 120 : first && tags.includes(first) ? 55 : 0;
}

function km41PuzzleScore(puzzle, slot, recommendation, seen, used) {
  if (!puzzle?.id || used.has(puzzle.id)) return -Infinity;
  const puzzleThemes = new Set(puzzle.themes || []);
  const matches = (slot.themes || []).filter((theme) => puzzleThemes.has(theme));
  let score = puzzle.focus === slot.focus ? 110 : 0;
  score += matches.length * 135;
  if ((slot.themes || []).length && !matches.length) score -= 35;
  if (seen.has(puzzle.id)) score -= 60;
  else score += 32;
  score += Math.max(0, 55 - Math.abs(Number(puzzle.rating || 1400) - Number(recommendation.puzzleRating || 1400)) * 0.18);
  score += Math.min(24, Number(puzzle.popularity || 0) / 5);
  score += Math.min(12, Math.log10(Math.max(1, Number(puzzle.plays || 1))) * 3);
  if (slot.focus === 'openings') score += km41OpeningScore(puzzle, recommendation);
  if (recommendation.phase === 'endgame' && puzzleThemes.has('endgame')) score += 40;
  if (recommendation.phase !== 'endgame' && puzzleThemes.has('middlegame')) score += 18;
  score += (km41Hash(`${recommendation.sourceSessionId}:${slot.slot}:${puzzle.id}`) % 1000) / 10000;
  return score;
}

async function km41CandidatesForFocus(index, focus, bandKey) {
  const shards = [];
  for (const band of km41BandSequence(index, bandKey)) {
    const shard = (index.shards || []).find((item) => item.focus === focus && item.band === band.key && Number(item.count) > 0);
    if (shard) shards.push(shard);
    if (shards.length >= 3) break;
  }
  const payloads = await Promise.all(shards.map((shard) => km41LoadShard(shard.file)));
  return payloads.flat();
}

async function km41LoadRelevantPuzzles(recommendation) {
  const index = await km41LoadIndex();
  const progress = km41ReadProgress();
  const seen = new Set(progress.seen || []);
  const used = new Set();
  const chosen = [];
  const plan = (recommendation.puzzlePlan || []).slice(0, 5);
  const focusCache = new Map();

  for (const slot of plan) {
    if (!focusCache.has(slot.focus)) {
      focusCache.set(slot.focus, await km41CandidatesForFocus(index, slot.focus, recommendation.puzzleBand));
    }
    let candidates = focusCache.get(slot.focus) || [];
    if (!candidates.length && slot.focus !== 'calculation') {
      if (!focusCache.has('calculation')) {
        focusCache.set('calculation', await km41CandidatesForFocus(index, 'calculation', recommendation.puzzleBand));
      }
      candidates = focusCache.get('calculation') || [];
    }
    const ranked = candidates
      .map((puzzle) => ({ puzzle, score: km41PuzzleScore(puzzle, slot, recommendation, seen, used) }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score);
    const selected = ranked[0]?.puzzle;
    if (!selected) continue;
    used.add(selected.id);
    const matchedThemes = (slot.themes || []).filter((theme) => (selected.themes || []).includes(theme));
    chosen.push({
      ...selected,
      km41Slot: slot,
      km41MatchedThemes: matchedThemes,
      km41RelevanceScore: Math.round(ranked[0].score),
    });
  }

  if (chosen.length < 5) {
    const fallback = await km41CandidatesForFocus(index, recommendation.focus?.key || 'calculation', recommendation.puzzleBand);
    const fallbackSlot = plan[0] || km41ManualPlan(recommendation, recommendation.focus?.key || 'calculation')[0];
    for (const puzzle of fallback.sort((a, b) => km41PuzzleScore(b, fallbackSlot, recommendation, seen, used) - km41PuzzleScore(a, fallbackSlot, recommendation, seen, used))) {
      if (used.has(puzzle.id)) continue;
      used.add(puzzle.id);
      chosen.push({ ...puzzle, km41Slot: fallbackSlot, km41MatchedThemes: [], km41RelevanceScore: 0 });
      if (chosen.length >= 5) break;
    }
  }

  if (chosen.length < 5) throw new Error('K-Mate could not assemble five relevant puzzles from the current category shards.');
  return chosen.slice(0, 5);
}

function km41OrderedSquares(orientation) {
  const files = orientation === 'b' ? [...KM41_FILES].reverse() : [...KM41_FILES];
  const ranks = orientation === 'b' ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}`));
}

function km41EnsurePuzzleMode() {
  let mode = km41$('#km41PuzzleMode');
  if (mode) return mode;
  mode = document.createElement('section');
  mode.id = 'km41PuzzleMode';
  mode.hidden = true;
  mode.setAttribute('role', 'dialog');
  mode.setAttribute('aria-modal', 'true');
  mode.setAttribute('aria-label', 'K-Mate puzzle practice');
  mode.innerHTML = `
    <div class="km41-puzzle-shell">
      <header class="km41-puzzle-topbar">
        <div class="km41-puzzle-title"><button class="roundbtn" id="km41PuzzleClose" type="button" aria-label="Close puzzle practice">←</button><div class="km41-puzzle-title-copy"><small id="km41PuzzleKicker">Move-matched reinforcement</small><b id="km41PuzzleTitle">Relevant puzzle set</b></div></div>
        <div class="km41-puzzle-top-actions"><button class="roundbtn" id="km41PuzzleFlip" type="button" aria-label="Flip puzzle board" title="Flip board">⇅</button></div>
      </header>
      <main class="km41-puzzle-main" id="km41PuzzleMain"></main>
    </div>`;
  document.body.append(mode);
  km41$('#km41PuzzleClose', mode)?.addEventListener('click', km41ClosePuzzleMode);
  km41$('#km41PuzzleFlip', mode)?.addEventListener('click', () => {
    km41Puzzle.orientation = km41Puzzle.orientation === 'w' ? 'b' : 'w';
    km41RenderPuzzleBoard();
  });
  return mode;
}

function km41RenderPuzzleShell() {
  const main = km41$('#km41PuzzleMain');
  if (!main) return;
  main.innerHTML = `
    <section class="boardcol km41-board-column">
      <div class="playerbar top km41-playerbar" id="km41PuzzleOpponentBar">
        <div class="identity"><span class="avatar black-avatar">♟</span><span><b>Puzzle reply</b><small>K-Mate plays the forced continuation</small></span></div>
        <div class="clock-wrap"><span class="turnpill" id="km41PuzzleOpponentTurn">Waiting</span><span class="clock">∞</span></div>
      </div>
      <div class="boardwrap km41-boardwrap"><div class="board km41-puzzle-board" id="km41PuzzleBoard" aria-label="Puzzle chessboard"></div></div>
      <div class="playerbar bottom active km41-playerbar" id="km41PuzzlePlayerBar">
        <div class="identity"><span class="avatar white-avatar" id="km41PuzzlePlayerAvatar">♙</span><span><b>You</b><small id="km41PuzzlePlayerSkill">Move-matched practice</small></span></div>
        <div class="clock-wrap"><span class="turnpill live" id="km41PuzzlePlayerTurn">Your move</span><span class="clock active" id="km41PuzzleCounterClock">1/5</span></div>
      </div>
      <div class="status km41-puzzle-status" id="km41PuzzleStatus"><span class="statusdot"></span><span id="km41PuzzleStatusText">Loading relevant puzzle…</span></div>
    </section>
    <aside class="km41-puzzle-side">
      <div class="km41-puzzle-progress"><b id="km41PuzzleCounter">1 / 5</b><span id="km41PuzzleFocus">Calculation</span></div>
      <div class="km41-progress-track"><span id="km41PuzzleProgressBar" style="width:0%"></span></div>
      <div class="eyebrow">Best continuation</div>
      <h2 class="km41-puzzle-instruction" id="km41PuzzleInstruction">Find the best move</h2>
      <p class="km41-puzzle-subtext">Play the complete line. The opponent’s forced replies appear automatically.</p>
      <div class="km41-puzzle-why"><small>Why this puzzle is in your set</small><b id="km41PuzzleWhyTitle">Move-level match</b><span id="km41PuzzleWhyText">K-Mate is matching this position to your latest decisions.</span></div>
      <div class="km41-puzzle-meta" id="km41PuzzleMeta"></div>
      <div class="km41-puzzle-actions">
        <button class="btn" id="km41PuzzleHint" type="button">Hint</button>
        <button class="btn" id="km41PuzzleSkip" type="button">Skip</button>
        <button class="btn primary wide" id="km41PuzzleNext" type="button" hidden>Next</button>
      </div>
      <a class="km41-puzzle-source" id="km41PuzzleSource" target="_blank" rel="noopener noreferrer">Source game on Lichess</a>
      <details class="km41-mobile-details"><summary>Why this puzzle?</summary><div id="km41PuzzleMobileWhy"></div></details>
    </aside>`;
  km41$('#km41PuzzleHint')?.addEventListener('click', km41RevealPuzzleMove);
  km41$('#km41PuzzleSkip')?.addEventListener('click', km41SkipPuzzle);
  km41$('#km41PuzzleNext')?.addEventListener('click', km41NextPuzzle);
}

function km41SetPuzzleStatus(text, state = '') {
  const status = km41$('#km41PuzzleStatus');
  const label = km41$('#km41PuzzleStatusText');
  if (label) label.textContent = text;
  if (status) status.className = `status km41-puzzle-status ${state}`.trim();
}

function km41CurrentPuzzle() {
  return km41Puzzle.puzzles[km41Puzzle.index] || null;
}

function km41LegalMoves(square) {
  try {
    return km41Puzzle.game?.moves({ square, verbose: true }) || [];
  } catch {
    return [];
  }
}

function km41RenderPuzzleBoard() {
  const board = km41$('#km41PuzzleBoard');
  if (!board || !km41Puzzle.game) return;
  const orientation = km41Puzzle.orientation || km41Puzzle.game.turn();
  const last = km41Puzzle.game.history({ verbose: true }).at(-1) || null;
  const legal = km41Puzzle.selected ? km41LegalMoves(km41Puzzle.selected) : [];
  const legalTargets = new Map(legal.map((move) => [move.to, move]));
  board.innerHTML = '';

  for (const [index, square] of km41OrderedSquares(orientation).entries()) {
    const piece = km41Puzzle.game.get(square);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.square = square;
    button.className = `sq ${((KM41_FILES.indexOf(square[0]) + Number(square[1])) % 2) ? 'light' : 'dark'}`;
    if (square === km41Puzzle.selected) button.classList.add('selected');
    if (last && (last.from === square || last.to === square)) button.classList.add('last');
    const legalMove = legalTargets.get(square);
    if (legalMove) button.classList.add(legalMove.captured ? 'capture' : 'legal');
    if (km41Puzzle.hintSquares[0] === square) button.classList.add('selected');
    if (km41Puzzle.hintSquares[1] === square) button.classList.add(piece ? 'capture' : 'legal');
    if (piece) {
      const glyph = document.createElement('span');
      glyph.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
      glyph.textContent = KM41_PIECES[piece.color][piece.type];
      button.append(glyph);
    }
    if (index % 8 === 0) {
      const rank = document.createElement('span');
      rank.className = 'coord rank';
      rank.textContent = square[1];
      button.append(rank);
    }
    if (index >= 56) {
      const file = document.createElement('span');
      file.className = 'coord file';
      file.textContent = square[0];
      button.append(file);
    }
    button.setAttribute('aria-label', `${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ' empty'}`);
    button.addEventListener('click', () => km41HandlePuzzleSquare(square));
    board.append(button);
  }
}

function km41UpdateTurnBars() {
  const playerBar = km41$('#km41PuzzlePlayerBar');
  const opponentBar = km41$('#km41PuzzleOpponentBar');
  const playerTurn = km41$('#km41PuzzlePlayerTurn');
  const opponentTurn = km41$('#km41PuzzleOpponentTurn');
  const thinking = km41Puzzle.locked;
  playerBar?.classList.toggle('active', !thinking);
  opponentBar?.classList.toggle('active', thinking);
  if (playerTurn) {
    playerTurn.textContent = thinking ? 'Waiting' : 'Your move';
    playerTurn.classList.toggle('live', !thinking);
  }
  if (opponentTurn) {
    opponentTurn.textContent = thinking ? 'Replying' : 'Waiting';
    opponentTurn.classList.toggle('live', thinking);
  }
}

function km41LoadPuzzleAtIndex() {
  const puzzle = km41CurrentPuzzle();
  const Chess = window.__KM_BOOT__?.Chess;
  if (!puzzle || !Chess) return;
  try {
    km41Puzzle.game = new Chess(puzzle.practiceFen);
  } catch (error) {
    console.warn('K-Mate v41 skipped an invalid puzzle.', puzzle.id, error);
    km41Puzzle.index += 1;
    if (km41Puzzle.index >= km41Puzzle.puzzles.length) km41FinishWorkout();
    else km41LoadPuzzleAtIndex();
    return;
  }

  km41Puzzle.selected = null;
  km41Puzzle.solutionIndex = 0;
  km41Puzzle.wrongAttempts = 0;
  km41Puzzle.hintSquares = [];
  km41Puzzle.locked = false;
  km41Puzzle.orientation = km41Puzzle.game.turn();
  const total = km41Puzzle.puzzles.length;
  const slot = puzzle.km41Slot || {};
  const side = km41Puzzle.game.turn() === 'w' ? 'White' : 'Black';
  const counter = `${km41Puzzle.index + 1} / ${total}`;
  const matchedThemes = puzzle.km41MatchedThemes?.length
    ? puzzle.km41MatchedThemes
    : (puzzle.themes || []).slice(0, 2);

  km41$('#km41PuzzleCounter').textContent = counter;
  km41$('#km41PuzzleCounterClock').textContent = `${km41Puzzle.index + 1}/${total}`;
  km41$('#km41PuzzleFocus').textContent = slot.focusLabel || km41Puzzle.recommendation?.focus?.label || 'Calculation';
  km41$('#km41PuzzlePlayerSkill').textContent = slot.skill || 'Move-matched practice';
  km41$('#km41PuzzlePlayerAvatar').textContent = km41Puzzle.game.turn() === 'w' ? '♙' : '♟';
  km41$('#km41PuzzleInstruction').textContent = `${side} to move · find the best continuation`;
  km41$('#km41PuzzleWhyTitle').textContent = slot.sourceMove ? `Because of ${slot.sourceMove}` : `${slot.focusLabel || 'Selected'} practice`;
  const why = slot.sourceMove
    ? `${slot.reason || ''}${matchedThemes.length ? ` This position reinforces ${matchedThemes.map(km41ThemeLabel).join(' and ')}.` : ''}`
    : slot.reason || km41Puzzle.recommendation?.relevance?.summary || '';
  km41$('#km41PuzzleWhyText').textContent = why;
  km41$('#km41PuzzleMobileWhy').textContent = why;
  km41$('#km41PuzzleMeta').innerHTML = [
    `Rating ${puzzle.rating}`,
    ...matchedThemes.map(km41ThemeLabel),
  ].map((item) => `<span>${km41Escape(item)}</span>`).join('');
  km41$('#km41PuzzleSource').href = puzzle.sourceGame || 'https://lichess.org/training';
  km41$('#km41PuzzleProgressBar').style.width = `${(km41Puzzle.index / total) * 100}%`;
  km41$('#km41PuzzleNext').hidden = true;
  km41$('#km41PuzzleHint').disabled = false;
  km41$('#km41PuzzleSkip').disabled = false;
  km41SetPuzzleStatus('Your move. Solve the complete line.', '');
  km41UpdateTurnBars();
  km41RenderPuzzleBoard();
}

function km41ExpectedMove() {
  return km41CurrentPuzzle()?.solutionUci?.[km41Puzzle.solutionIndex] || '';
}

function km41UciAttempt(from, to, expected) {
  const promotion = expected?.startsWith(`${from}${to}`) && expected.length === 5 ? expected[4] : '';
  return `${from}${to}${promotion}`;
}

function km41HandlePuzzleSquare(square) {
  const expected = km41ExpectedMove();
  if (km41Puzzle.locked || !km41Puzzle.game || !expected) return;
  const piece = km41Puzzle.game.get(square);
  if (!km41Puzzle.selected) {
    if (piece?.color !== km41Puzzle.game.turn()) return;
    km41Puzzle.selected = square;
    km41Puzzle.hintSquares = [];
    km41RenderPuzzleBoard();
    return;
  }
  if (piece?.color === km41Puzzle.game.turn()) {
    km41Puzzle.selected = square;
    km41RenderPuzzleBoard();
    return;
  }
  const from = km41Puzzle.selected;
  km41Puzzle.selected = null;
  const attempted = km41UciAttempt(from, square, expected);
  if (attempted !== expected) {
    km41Puzzle.wrongAttempts += 1;
    km41Puzzle.totalWrong += 1;
    km41Puzzle.hintSquares = km41Puzzle.wrongAttempts >= 2 ? [expected.slice(0, 2)] : [];
    km41SetPuzzleStatus(
      km41Puzzle.wrongAttempts >= 2
        ? 'Not this move. The correct piece is highlighted—scan its forcing moves.'
        : 'Not quite. Re-check checks, captures, threats, and the opponent’s reply.',
      'bad',
    );
    km41RenderPuzzleBoard();
    return;
  }
  km41ApplySolutionMove(expected, true);
}

function km41ApplySolutionMove(uci, playerMove) {
  if (!km41Puzzle.game) return false;
  try {
    const move = km41Puzzle.game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    if (!move) return false;
  } catch {
    km41SetPuzzleStatus('This stored line could not be replayed. Skip to the next puzzle.', 'bad');
    return false;
  }
  km41Puzzle.solutionIndex += 1;
  km41Puzzle.selected = null;
  km41Puzzle.hintSquares = [];
  km41RenderPuzzleBoard();
  const puzzle = km41CurrentPuzzle();
  if (km41Puzzle.solutionIndex >= puzzle.solutionUci.length) {
    km41FinishPuzzle(true);
    return true;
  }
  if (playerMove) {
    km41Puzzle.locked = true;
    km41UpdateTurnBars();
    km41SetPuzzleStatus('Correct. K-Mate is playing the forced reply…', 'thinking');
    window.setTimeout(() => {
      const reply = puzzle.solutionUci[km41Puzzle.solutionIndex];
      km41ApplySolutionMove(reply, false);
      if (km41Puzzle.solutionIndex < puzzle.solutionUci.length) {
        km41Puzzle.locked = false;
        km41UpdateTurnBars();
        km41SetPuzzleStatus('Your move. Continue the best line.', '');
      }
    }, 360);
  }
  return true;
}

function km41RecordPuzzle(puzzle, solved) {
  const progress = km41ReadProgress();
  const prior = progress.puzzles[puzzle.id] || { attempts: 0, solves: 0, wrong: 0 };
  progress.puzzles[puzzle.id] = {
    ...prior,
    attempts: Number(prior.attempts || 0) + 1,
    solves: Number(prior.solves || 0) + (solved ? 1 : 0),
    wrong: Number(prior.wrong || 0) + km41Puzzle.wrongAttempts,
    solved: Boolean(prior.solved || solved),
    focus: puzzle.km41Slot?.focus || puzzle.focus,
    rating: puzzle.rating,
    sourceMove: puzzle.km41Slot?.sourceMove || null,
    matchedThemes: puzzle.km41MatchedThemes || [],
    relevanceScore: puzzle.km41RelevanceScore || null,
    lastAt: new Date().toISOString(),
  };
  progress.seen.push(puzzle.id);
  km41SaveProgress(progress);
}

function km41FinishPuzzle(solved) {
  const puzzle = km41CurrentPuzzle();
  if (!puzzle) return;
  km41Puzzle.locked = true;
  if (solved) km41Puzzle.solved += 1;
  else km41Puzzle.skipped += 1;
  km41RecordPuzzle(puzzle, solved);
  km41SetPuzzleStatus(
    solved
      ? `Solved${km41Puzzle.wrongAttempts ? ` after ${km41Puzzle.wrongAttempts} correction${km41Puzzle.wrongAttempts === 1 ? '' : 's'}` : ' cleanly'}.`
      : 'Puzzle skipped. It will remain eligible for later review.',
    solved ? 'good' : 'bad',
  );
  km41$('#km41PuzzleNext').hidden = false;
  km41$('#km41PuzzleHint').disabled = true;
  km41$('#km41PuzzleSkip').disabled = true;
  km41$('#km41PuzzleProgressBar').style.width = `${((km41Puzzle.index + 1) / km41Puzzle.puzzles.length) * 100}%`;
  km41UpdateTurnBars();
}

function km41RevealPuzzleMove() {
  const expected = km41ExpectedMove();
  if (!expected || km41Puzzle.locked) return;
  km41Puzzle.hintSquares = [expected.slice(0, 2), expected.slice(2, 4)];
  km41Puzzle.wrongAttempts += 1;
  km41Puzzle.totalWrong += 1;
  km41SetPuzzleStatus(`Hint: ${expected.slice(0, 2)} → ${expected.slice(2, 4)}${expected[4] ? `, promote to ${expected[4].toUpperCase()}` : ''}.`, 'bad');
  km41RenderPuzzleBoard();
}

function km41SkipPuzzle() {
  if (km41Puzzle.locked) return;
  km41FinishPuzzle(false);
}

function km41NextPuzzle() {
  km41Puzzle.index += 1;
  if (km41Puzzle.index >= km41Puzzle.puzzles.length) km41FinishWorkout();
  else km41LoadPuzzleAtIndex();
}

function km41FinishWorkout() {
  const main = km41$('#km41PuzzleMain');
  if (!main) return;
  const total = km41Puzzle.puzzles.length || 5;
  const accuracy = Math.round((km41Puzzle.solved / total) * 100);
  const progress = km41ReadProgress();
  progress.workouts.push({
    at: new Date().toISOString(),
    version: 41,
    sourceSessionId: km41Puzzle.recommendation?.sourceSessionId || null,
    focus: km41Puzzle.recommendation?.focus?.key || null,
    rating: km41Puzzle.recommendation?.puzzleRating || null,
    solved: km41Puzzle.solved,
    total,
    wrong: km41Puzzle.totalWrong,
    relevanceMode: km41Puzzle.recommendation?.relevance?.mode || km41Puzzle.source,
    sourceMoves: [...new Set(km41Puzzle.puzzles.map((puzzle) => puzzle.km41Slot?.sourceMove).filter(Boolean))],
  });
  km41SaveProgress(progress);
  km41$('#km41PuzzleFlip').hidden = true;
  main.innerHTML = `
    <section class="km41-summary">
      <div><div class="eyebrow">Move-matched workout complete</div><h2>${km41Escape(km41Puzzle.recommendation?.focus?.label || 'Learning')} reinforced</h2><p>${km41Escape(km41Puzzle.recommendation?.puzzleSetSummary || 'The five positions were selected from your move-level evidence.')}</p>
      <div class="km41-summary-score"><div><b>${km41Puzzle.solved}</b><span>Solved</span></div><div><b>${accuracy}%</b><span>Completion</span></div><div><b>${km41Puzzle.totalWrong}</b><span>Corrections</span></div></div>
      <div class="learning-hero-actions" style="justify-content:center"><button class="btn primary" id="km41WorkoutAgain" type="button">Another relevant set</button><button class="btn" id="km41WorkoutLessons" type="button">See matched lessons</button><button class="btn" id="km41WorkoutDone" type="button">Done</button></div></div>
    </section>`;
  km41$('#km41WorkoutAgain')?.addEventListener('click', () => km41StartWorkout({ source: km41Puzzle.source }));
  km41$('#km41WorkoutLessons')?.addEventListener('click', () => {
    km41ClosePuzzleMode({ restore: false });
    void km41OpenLessonChoices();
  });
  km41$('#km41WorkoutDone')?.addEventListener('click', () => km41ClosePuzzleMode());
  km41ScheduleRender();
}

function km41RestoreContext() {
  if (km41Puzzle.returnContext !== 'result') return;
  const dialog = km41$('#resultDialog');
  if (!dialog) return;
  try {
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', '');
  } catch {}
}

function km41ClosePuzzleMode({ restore = true } = {}) {
  const mode = km41$('#km41PuzzleMode');
  if (mode) mode.hidden = true;
  document.body.classList.remove('km41-puzzle-open');
  km41$('#km41PuzzleFlip')?.removeAttribute('hidden');
  if (restore) km41RestoreContext();
  km41ScheduleRender();
}

async function km41StartWorkout({ focusOverride = null, source = 'tailored' } = {}) {
  const base = km41Recommendation();
  const recommendation = km41WorkoutRecommendation(base, focusOverride);
  if (!recommendation) return false;
  const resultDialog = km41$('#resultDialog');
  km41Puzzle.returnContext = resultDialog?.open ? 'result' : 'learning';
  if (resultDialog?.open && typeof resultDialog.close === 'function') resultDialog.close();
  const oldDialog = km41$('#learningPuzzleDialog');
  if (oldDialog?.open && typeof oldDialog.close === 'function') oldDialog.close();

  const mode = km41EnsurePuzzleMode();
  km41RenderPuzzleShell();
  mode.hidden = false;
  document.body.classList.add('km41-puzzle-open');
  km41$('#km41PuzzleFlip').hidden = false;
  km41$('#km41PuzzleKicker').textContent = recommendation.relevance?.mode === 'chosen' ? 'Open library practice' : 'Move-matched reinforcement';
  km41$('#km41PuzzleTitle').textContent = recommendation.puzzleSetSummary || `${recommendation.focus?.label || 'Relevant'} puzzle set`;
  km41SetPuzzleStatus('Selecting positions that match the exact moves and themes from your game…', 'thinking');

  try {
    const puzzles = await km41LoadRelevantPuzzles(recommendation);
    Object.assign(km41Puzzle, {
      puzzles,
      index: 0,
      game: null,
      selected: null,
      solutionIndex: 0,
      wrongAttempts: 0,
      totalWrong: 0,
      solved: 0,
      skipped: 0,
      recommendation,
      hintSquares: [],
      locked: false,
      orientation: 'w',
      startedAt: new Date().toISOString(),
      source,
    });
    km41LoadPuzzleAtIndex();
  } catch (error) {
    console.error('K-Mate v41 relevant puzzle set failed to load.', error);
    const main = km41$('#km41PuzzleMain');
    main.innerHTML = `<section class="km41-summary"><div><div class="eyebrow">Puzzle set unavailable</div><h2>Relevant positions could not load</h2><p>${km41Escape(error?.message || 'Reload K-Mate and try again.')}</p><div class="learning-hero-actions" style="justify-content:center"><button class="btn" id="km41WorkoutDone" type="button">Go back</button></div></div></section>`;
    km41$('#km41WorkoutDone')?.addEventListener('click', () => km41ClosePuzzleMode());
  }
  return true;
}

function km41RenderKey(recommendation) {
  const evidence = (recommendation?.moveEvidence || []).slice(0, 5).map((item) => `${item.id}:${item.loss}:${item.focus}`).join('|');
  const progress = km41ReadProgress();
  return `${recommendation?.sourceSessionId || 'none'}:${recommendation?.focus?.key || 'none'}:${evidence}:${Object.keys(progress.videos || {}).length}:${progress.workouts.length}`;
}

async function km41RenderAll({ force = false } = {}) {
  const recommendation = km41Recommendation();
  if (!recommendation) return;
  const key = km41RenderKey(recommendation);
  if (!force && key === km41LastPageKey) {
    km41RenderResultCard(recommendation);
    return;
  }
  km41LastPageKey = key;
  km41RenderLearningPage(recommendation);
  try {
    const catalog = await km41LoadVideos();
    km41RankedLessons = km41RankLessons(catalog, recommendation);
  } catch {}
  km41RenderResultCard(recommendation);
}

function km41ScheduleRender(force = false) {
  window.clearTimeout(km41RenderTimer);
  km41RenderTimer = window.setTimeout(() => {
    void km41RenderAll({ force });
  }, 40);
}

function km41InterceptClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const watch = target.closest('[data-km41-watch-video]');
  if (watch) {
    event.preventDefault();
    event.stopImmediatePropagation();
    km41PlayLesson(watch.dataset.km41WatchVideo);
    return;
  }

  const puzzleButton = target.closest('#learningStartPuzzles,#learningResultPuzzles,[data-library-puzzles]');
  if (puzzleButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const focusOverride = puzzleButton.dataset.libraryPuzzles || null;
    void km41StartWorkout({ focusOverride, source: focusOverride ? 'library' : 'tailored' });
    return;
  }

  const lessonButton = target.closest('#learningWatchLesson,#learningResultVideo');
  if (lessonButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void km41OpenLessonChoices();
  }
}

function km41WrapLearningApi() {
  const api = window.__KMATE_LEARNING__;
  if (!api || api.relevanceVersion === KM41_UI_VERSION) return;
  km41LegacyOpenLearning = api.open;
  api.open = (...args) => {
    const result = typeof km41LegacyOpenLearning === 'function' ? km41LegacyOpenLearning(...args) : true;
    km41ScheduleRender(true);
    return result;
  };
  api.startWorkout = (options = {}) => km41StartWorkout(options || {});
  api.openVideo = () => km41OpenLessonChoices();
  api.relevanceVersion = KM41_UI_VERSION;
  const legacyState = api.state;
  api.state = () => ({
    ...(typeof legacyState === 'function' ? legacyState() : {}),
    relevanceVersion: KM41_UI_VERSION,
    moveEvidence: km41Recommendation()?.moveEvidence?.length || 0,
    rankedLessons: km41RankedLessons.length,
    gameStylePuzzleOpen: !km41$('#km41PuzzleMode')?.hidden,
  });
}

function km41BeginSync() {
  if (!km41Observer) {
    km41Observer = new MutationObserver(() => km41ScheduleRender());
    km41Observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'open'],
    });
  }
  if (!km41SyncTimer) {
    const tick = () => {
      km41WrapLearningApi();
      km41ScheduleRender();
      km41SyncTimer = window.setTimeout(tick, 900);
    };
    tick();
  }
}

function km41Initialize(attempt = 0) {
  if (!window.__KMATE_LEARNING__ || !window.__KMATE_LEARNING_CORE__ || !km41$('#learningView')) {
    if (attempt < 180) window.setTimeout(() => km41Initialize(attempt + 1), 100);
    else console.warn('K-Mate v41 relevance layer could not initialize.');
    return;
  }
  km41InstallCss();
  km41EnsurePuzzleMode();
  km41EnsureLessonChoices();
  km41EnsureLessonPlayer();
  km41WrapLearningApi();
  document.addEventListener('click', km41InterceptClick, true);
  km41BeginSync();
  km41ScheduleRender(true);
  void Promise.allSettled([km41LoadVideos(), km41LoadIndex()]);

  window.__KMATE_RELEVANCE__ = {
    version: KM41_UI_VERSION,
    recommendation: km41Recommendation,
    rankLessons: async () => km41RankLessons(await km41LoadVideos(), km41Recommendation()),
    openLessons: km41OpenLessonChoices,
    startWorkout: km41StartWorkout,
    state: () => ({
      ready: true,
      version: KM41_UI_VERSION,
      evidenceCount: km41Recommendation()?.moveEvidence?.length || 0,
      puzzlePlan: km41Recommendation()?.puzzlePlan || [],
      rankedLessons: km41RankedLessons.map((entry) => ({ id: entry.video.id, title: entry.video.title, score: Math.round(entry.score), why: entry.why })),
      puzzleOpen: !km41$('#km41PuzzleMode')?.hidden,
      safeTop: getComputedStyle(document.documentElement).getPropertyValue('--kmate-safe-top').trim(),
    }),
  };
}

km41Initialize();
