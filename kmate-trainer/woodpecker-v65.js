import { SERIES, CYCLE_DAYS, selectPuzzles, createProgram, advanceCycle, recordAttempt, cycleStats } from './woodpecker-core-v65.mjs?v=65.0.0';

const KEY = 'kmate-woodpecker-v65';
const $ = (selector, root = document) => root.querySelector(selector);
const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const duration = (ms) => {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};
let store;
let run = null;
let tickAt = null;
let building = false;
let error = '';

function readStore() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { version: 1, activeId: null, programs: [] };
  const value = JSON.parse(raw);
  if (value.version !== 1 || !Array.isArray(value.programs)) throw new Error('The saved Woodpecker data cannot be read. Export your browser data before resetting it.');
  return value;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); }
  catch { error = 'Progress could not be saved. Browser storage may be full or unavailable. Keep this page open and free some space before continuing.'; render(); return false; }
  return true;
}

function activeProgram() { return store?.programs.find((program) => program.id === store.activeId); }
function runningProgram() { return store?.programs.find((program) => program.id === run?.programId); }

function ensureView() {
  let view = $('#woodpeckerView');
  if (view) return view;
  view = document.createElement('section');
  view.id = 'woodpeckerView';
  view.className = 'view wp-view';
  view.hidden = true;
  view.innerHTML = `
    <section class="wp-hero">
      <div class="wp-heading"><span class="wp-kicker">Repetition with a purpose</span><button class="btn" id="wpHome" type="button">Home</button></div>
      <h1 tabindex="-1">See the pattern.<br>Find it faster.</h1>
      <p>The Woodpecker method repeats the same complete puzzle set over several cycles. Calculate carefully on your first pass, then build recognition without sacrificing accuracy.</p>
      <ol class="wp-steps"><li>1. Choose a fixed set</li><li>2. Repeat it for 7 cycles</li><li>3. Compare accuracy and time</li></ol>
    </section>
    <p class="wp-error" id="wpError" role="status" aria-live="polite"></p>
    <div id="wpProgram"></div>
    <section class="wp-card">
      <h2>Build your repetition set</h2>
      <p>Start with 25 positions to try the routine, or choose a larger set you can finish over four weeks. Each saved set keeps exactly the same positions and order across every cycle.</p>
      <form class="wp-form" id="wpBuildForm">
        <label>Series<select id="wpSeries">${Object.entries(SERIES).map(([id, series]) => `<option value="${id}" ${id === 'improver' ? 'selected' : ''}>${series.title} · ${series.min}–${series.max}</option>`).join('')}</select></label>
        <label>Set size<select id="wpSize"><option value="25">25 · try the method</option><option value="100" selected>100 · regular practice</option><option value="250">250 · extended set</option></select></label>
        <button class="btn primary" id="wpBuild" type="submit">Create fixed set</button>
        <small>These are Lichess puzzle ratings, which differ from playing ratings. Choose positions you can understand before trying to solve them quickly. Previous sets stay saved.</small>
      </form>
      <div class="wp-program-list" id="wpSavedSets" aria-label="Saved repetition sets"></div>
    </section>
    <section class="wp-card"><details><summary>How to train and what the numbers mean</summary>
      <p>Complete every position, including ones you already solved correctly. Work in sessions of up to 10 puzzles and resume whenever you like. After a full cycle, take a rest day if useful, then repeat the same set.</p>
      <p>Our flexible targets are 28 → 14 → 7 → 4 → 2 → 1 → 1 days. They are goals, not deadlines. You can start the next cycle when ready. Accuracy comes before speed.</p>
      <p><b>Clean accuracy</b> counts only puzzles solved without a wrong move or a hint. Skips count as unclean attempts. Resetting a board does not erase corrections. Solve time counts active time with the puzzle visible; it pauses when you leave or hide the tab. Reloading resumes the current puzzle from its starting position, preserving time and corrections.</p>
      <p>Progress is saved in this browser. A faster repeated set shows recognition of those positions; it does not by itself measure improvement in new positions or games.</p>
    </details><details><summary>Puzzle source and method</summary>
      <p>Positions come from the <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noopener noreferrer">Lichess open puzzle database</a> (CC0 1.0), filtered and grouped by K-Mate. The method is associated with Axel Smith and Hans Tikkanen. These are K-Mate repetition series, not the exercises from their published book.</p>
    </details></section>`;
  $('main.shell').append(view);
  $('#wpBuildForm').addEventListener('submit', (event) => { event.preventDefault(); void build(); });
  $('#wpHome').addEventListener('click', () => $('#brandButton')?.click());
  $('#wpSavedSets').addEventListener('click', (event) => {
    const button = event.target.closest('[data-wp-set]');
    if (!button) return;
    store.activeId = button.dataset.wpSet;
    save(); render();
  });
  $('#wpProgram').addEventListener('click', (event) => {
    if (event.target.closest('#wpContinue')) void start();
  });
  return view;
}

function render() {
  if (!$('#woodpeckerView')) return;
  $('#wpError').textContent = error;
  const program = activeProgram();
  $('#woodpeckerView').classList.toggle('wp-has-program', Boolean(program));
  $('#woodpeckerView h1').innerHTML = program ? 'Woodpecker training' : 'See the pattern.<br>Find it faster.';
  const target = $('#wpProgram');
  if (!program) target.innerHTML = '';
  else {
    const cycle = program.cycles.at(-1);
    const stats = cycleStats(cycle);
    const complete = Boolean(cycle.completedAt);
    const finished = complete && cycle.number === CYCLE_DAYS.length;
    const due = new Date(Date.parse(cycle.startedAt) + cycle.targetDays * 86400000);
    const date = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const first = program.cycles[0];
    const baseline = cycleStats(first);
    const delta = baseline.medianMs > 0 ? Math.round((1 - stats.medianMs / baseline.medianMs) * 100) : 0;
    const comparison = complete && cycle.number > 1 && baseline.medianMs > 0
      ? `Median solve time is ${Math.abs(delta)}% ${delta >= 0 ? 'faster' : 'slower'} than cycle 1. Compare accuracy alongside speed.` : '';
    const label = finished ? 'Seven cycles complete' : complete ? `Start cycle ${cycle.number + 1}` : stats.attempted ? 'Resume cycle' : `Start cycle ${cycle.number}`;
    target.innerHTML = `<section class="wp-card" aria-label="Current repetition set">
      <div class="wp-kicker">Your fixed set · cycle ${cycle.number} of 7</div>
      <h2 style="margin-top:10px">${escape(program.title)}</h2>
      <p>${finished ? 'You completed all seven passes. Keep practicing new positions to check how the patterns transfer.' : complete ? 'Cycle complete. Repeat all the same positions when you are ready; a rest day between cycles can help.' : `Position ${stats.attempted + 1} of ${program.puzzles.length} is next. Aim to finish this pass by ${date}; continue at your own pace.`}</p>
      <div class="wp-progress" role="progressbar" aria-label="Cycle completion" aria-valuemin="0" aria-valuemax="${program.puzzles.length}" aria-valuenow="${stats.attempted}"><span style="width:${stats.attempted / program.puzzles.length * 100}%"></span></div>
      <div class="wp-stats"><article><b>${stats.attempted}/${program.puzzles.length}</b><span>Positions attempted</span></article><article><b>${stats.accuracy === null ? '—' : `${stats.accuracy}%`}</b><span>Clean accuracy</span></article><article><b>${duration(stats.elapsedMs)}</b><span>Active solve time</span></article><article><b>${stats.medianMs === null ? '—' : duration(stats.medianMs)}</b><span>Median per position</span></article></div>
      <div class="wp-actions">${finished ? '' : `<button class="btn primary" type="button" id="wpContinue">${label}</button>`}<span class="wp-note">${complete ? `${stats.hints} hints · ${stats.skipped} skipped` : `Up to ${Math.min(10, program.puzzles.length - stats.attempted)} puzzles this session · saved after each puzzle`}</span></div>
      ${comparison ? `<p class="wp-note">${escape(comparison)}</p>` : ''}
      <div class="wp-table-scroll"><table class="wp-table"><caption class="wp-note">Cycle history · the same ${program.puzzles.length} positions every time</caption><thead><tr><th>Cycle</th><th>Target</th><th>Progress</th><th>Clean accuracy</th><th>Time</th><th>Hints / skips</th></tr></thead><tbody>${program.cycles.map((item) => {
        const result = cycleStats(item);
        return `<tr aria-current="${item === cycle}"><th scope="row">${item.number}${item.completedAt ? ' · complete' : ' · in progress'}</th><td>${item.targetDays} days</td><td>${result.attempted}/${program.puzzles.length}</td><td>${result.accuracy === null ? '—' : `${result.accuracy}%`}</td><td>${duration(result.elapsedMs)}</td><td>${result.hints} / ${result.skipped}</td></tr>`;
      }).join('')}</tbody></table></div>
    </section>`;
  }
  $('#wpSavedSets').innerHTML = (store?.programs || []).map((item) => `<button type="button" data-wp-set="${escape(item.id)}" aria-pressed="${item.id === store.activeId}">${escape(item.title)}</button>`).join('');
}

function open() {
  const state = window.__KMATE__?.state?.();
  if ($('#gameView') && !$('#gameView').hidden && state?.current && !state.finalized) {
    window.alert('Finish or leave the current position before starting Woodpecker training.'); return false;
  }
  const view = ensureView();
  for (const selector of ['#setupView', '#gameView', '#insightsView', '#learningView', '#trainingPlanView']) {
    const element = $(selector); if (element) element.hidden = true;
  }
  document.documentElement.classList.remove('game-mode', 'learning-page-open', 'training-plans-open', 'setup-wizard-root');
  document.body.classList.remove('game-mode', 'board-focus', 'game-panel-open', 'setup-wizard-mode');
  document.querySelectorAll('.navbutton').forEach((button) => button.classList.remove('active'));
  view.hidden = false; render();
  window.scrollTo({ top: 0, behavior: 'auto' });
  $('h1', view)?.focus({ preventScroll: true });
  return true;
}

async function build() {
  if (building || !store) return;
  building = true; error = '';
  const button = $('#wpBuild'); button.disabled = true; button.textContent = 'Building your fixed set…';
  try {
    const seriesId = $('#wpSeries').value;
    const count = Number($('#wpSize').value);
    const series = SERIES[seriesId];
    const response = await fetch('./learning/puzzles/index.json');
    if (!response.ok) throw new Error('The puzzle catalog could not load. Try again.');
    const index = await response.json();
    const focuses = ['calculation', 'loosePieces', 'kingSafety', 'defense'];
    const shards = index.shards.filter((shard) => focuses.includes(shard.focus) && shard.maxRating >= series.min && shard.minRating <= series.max);
    const groups = await Promise.all(shards.map(async (shard) => {
      const result = await fetch(`./learning/puzzles/${shard.file}`);
      if (!result.ok) throw new Error('A puzzle set could not load. Your saved sets are safe; try again.');
      return (await result.json()).puzzles || [];
    }));
    const puzzles = selectPuzzles(groups.flat(), seriesId, count, window.__KM_BOOT__.Chess);
    const program = createProgram(seriesId, puzzles);
    store.programs.push(program); store.activeId = program.id;
    if (!save()) return;
    render(); $('#wpContinue')?.focus();
  } catch (cause) { error = cause.message || 'The fixed set could not be created.'; render(); }
  finally { building = false; button.disabled = false; button.textContent = 'Create fixed set'; }
}

function flushTime() {
  const program = runningProgram();
  if (!program?.draft || tickAt === null) return;
  const now = performance.now();
  if (!document.hidden && !$('#km42PuzzleMode')?.hidden) program.draft.elapsedMs += Math.max(0, now - tickAt);
  tickAt = now;
}

function pause() {
  flushTime(); tickAt = null;
  if (run) save();
}

async function start() {
  const button = $('#wpContinue'); if (button) button.disabled = true;
  try {
    const program = activeProgram(); if (!program) return;
    let cycle = program.cycles.at(-1);
    if (cycle.completedAt) {
      if (!advanceCycle(program)) return;
      cycle = program.cycles.at(-1);
    }
    const cursor = cycle.results.length;
    const batch = program.puzzles.slice(cursor, cursor + 10);
    if (!batch.length) return;
    if (!save()) return;
    run = { programId: program.id, cycle: cycle.number, source: `woodpecker:${program.id}:${cycle.number}:${Date.now()}`, recorded: new Set() };
    const recommendation = {
      focus: { key: 'calculation', label: 'Woodpecker repetition' }, puzzleRating: batch[0].rating,
      puzzleSetSummary: 'Repeat the complete fixed set. Aim for accurate recognition before speed.',
      customization: { summary: `${program.title} · Cycle ${cycle.number} of 7. The same positions, every pass.` },
    };
    const started = await window.__KMATE_V42__.startPreparedWorkout({
      puzzles: batch.map((puzzle) => ({ ...puzzle, km42Slot: {
        focus: puzzle.focus, focusLabel: 'Pattern recognition', skill: `Cycle ${cycle.number} of 7`,
        reason: 'Repeat this fixed position each cycle. Compare the complete line before moving.',
      } })),
      recommendation, source: run.source, returnContext: 'woodpecker',
      kicker: `Woodpecker · cycle ${cycle.number}/7 · ${cursor + 1}–${cursor + batch.length} of ${program.puzzles.length}`,
    });
    if (!started) throw new Error('The puzzle board could not start. Please try again.');
  } catch (cause) { error = cause.message; run = null; render(); }
  finally { if (button) button.disabled = false; }
}

function accepts(detail) { return Boolean(run && detail?.source === run.source); }

function onLoad(event) {
  const detail = event.detail;
  if (!accepts(detail)) return;
  flushTime();
  const program = runningProgram();
  const cycle = program.cycles.at(-1);
  const index = cycle.results.length;
  if (program.puzzles[index]?.id !== detail.puzzleId || run.recorded.has(detail.index)) return;
  if (program.draft?.index !== index || program.draft.puzzleId !== detail.puzzleId) {
    program.draft = { index, puzzleId: detail.puzzleId, elapsedMs: 0, wrong: 0, hints: 0 };
  }
  tickAt = document.hidden ? null : performance.now();
  $('#km42PuzzleTitle').textContent = `Position ${index + 1} of ${program.puzzles.length} · cycle ${cycle.number}`;
  save();
}

function onAttempt(event) {
  if (!accepts(event.detail)) return;
  const program = runningProgram();
  if (!program?.draft || run.recorded.has(event.detail.index)) return;
  flushTime();
  if (event.detail.kind === 'hint') program.draft.hints += 1;
  else program.draft.wrong += 1;
  save();
}

function onResult(event) {
  const detail = event.detail;
  if (!accepts(detail) || run.recorded.has(detail.index)) return;
  flushTime(); tickAt = null;
  const program = runningProgram();
  const draft = program?.draft;
  if (!draft) return;
  if (recordAttempt(program, { ...draft, solved: detail.solved })) {
    run.recorded.add(detail.index); save(); render();
  }
}

function onComplete(event) {
  if (!accepts(event.detail)) return;
  pause();
  const program = runningProgram();
  const cycle = program.cycles.at(-1);
  const stats = cycleStats(cycle);
  const main = $('#km42PuzzleMode .km42-puzzle-main');
  if (!main) return;
  main.innerHTML = `<section class="km42-workout-summary"><div>
    <div class="eyebrow">Woodpecker · ${cycle.completedAt ? 'cycle complete' : 'session saved'}</div>
    <h2>${cycle.completedAt ? `Cycle ${cycle.number} complete` : 'Patterns, one pass at a time'}</h2>
    <p>${stats.attempted}/${program.puzzles.length} positions attempted · ${stats.accuracy}% clean accuracy · ${duration(stats.elapsedMs)} active time.</p>
    <p>${cycle.completedAt ? 'Compare your cycle history before the next pass. Keep accuracy ahead of speed.' : 'Your place is saved. Continue this fixed set whenever you are ready.'}</p>
    <div class="km42-summary-actions"><button class="btn primary" id="wpSessionContinue" type="button">${cycle.completedAt ? 'View cycle results' : 'Continue cycle'}</button><button class="btn" id="wpSessionDone" type="button">Save and leave</button></div>
  </div></section>`;
  $('#wpSessionContinue').addEventListener('click', () => {
    const complete = Boolean(cycle.completedAt);
    window.__KMATE_V42__.closePuzzle();
    if (!complete) void start();
  });
  $('#wpSessionDone').addEventListener('click', () => window.__KMATE_V42__.closePuzzle());
}

function onClose(event) {
  if (!accepts(event.detail)) return;
  pause(); run = null; open();
}

function installEntries() {
  const footer = $('#setupWizard .wizard-welcome-footer');
  if (footer && !$('#wizardWoodpeckerButton')) {
    const button = document.createElement('button');
    button.id = 'wizardWoodpeckerButton'; button.type = 'button'; button.className = 'wizard-button wizard-secondary';
    button.innerHTML = '<b>Woodpecker</b>'; button.addEventListener('click', open); footer.append(button);
  }
  for (const selector of ['#trainingPlanListView .tp-hero', '#learningView .learning-hero-actions']) {
    const anchor = $(selector);
    if (!anchor || anchor.querySelector('[data-wp-entry]')) continue;
    const entry = document.createElement('div'); entry.className = 'wp-entry'; entry.dataset.wpEntry = 'true';
    entry.innerHTML = '<div><b>Woodpecker repetition</b><p>One fixed set. Seven cycles. Track accuracy and time.</p></div><button class="btn" type="button">Open Woodpecker</button>';
    $('button', entry).addEventListener('click', open); anchor.append(entry);
  }
}

function initialize(attempt = 0) {
  if (!window.__KMATE_V42__?.startPreparedWorkout || !$('#setupWizard')) {
    if (attempt < 240) setTimeout(() => initialize(attempt + 1), 100);
    return;
  }
  try { store = readStore(); } catch (cause) { error = cause.message; }
  ensureView(); installEntries(); render();
  new MutationObserver(installEntries).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.topnav .navbutton,#brandButton,#km55HomeButton,.km55-dialog-home,#wizardInsightsButton,#wizardTrainingPlanButton')) return;
    if (run) { pause(); run = null; window.__KMATE_V42__.closePuzzle({ restore: false }); }
    $('#woodpeckerView').hidden = true;
  }, true);
  window.addEventListener('kmate:puzzle-load', onLoad);
  window.addEventListener('kmate:puzzle-attempt', onAttempt);
  window.addEventListener('kmate:puzzle-result', onResult);
  window.addEventListener('kmate:puzzle-workout-complete', onComplete);
  window.addEventListener('kmate:puzzle-close', onClose);
  document.addEventListener('visibilitychange', () => {
    // The interval flushes continuously; the final visible segment belongs to
    // the attempt even though document.hidden has already changed here.
    if (run && document.hidden && tickAt !== null) {
      const program = runningProgram();
      if (program?.draft) program.draft.elapsedMs += Math.max(0, performance.now() - tickAt);
      tickAt = null; save();
    } else if (run && !document.hidden && !$('#km42PuzzleMode')?.hidden && runningProgram()?.draft) tickAt = performance.now();
  });
  window.addEventListener('pagehide', pause);
  setInterval(() => { if (run && tickAt !== null) { flushTime(); save(); } }, 5000);
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    const wasRunning = Boolean(run);
    tickAt = null; run = null;
    if (wasRunning) window.__KMATE_V42__.closePuzzle({ restore: false });
    try { store = readStore(); error = 'Progress changed in another tab. Resume here when ready.'; } catch (cause) { error = cause.message; }
    render();
  });
  window.__KMATE_WOODPECKER__ = { open, state: () => structuredClone({ ready: true, store, running: run ? { programId: run.programId, cycle: run.cycle } : null }) };
}

initialize();
