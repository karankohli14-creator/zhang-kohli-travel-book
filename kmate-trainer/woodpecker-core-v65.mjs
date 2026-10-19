export const CYCLE_DAYS = Object.freeze([28, 14, 7, 4, 2, 1, 1]);
export const SERIES = Object.freeze({
  foundation: { title: 'Foundation', min: 800, max: 1299, description: 'Build familiar tactical patterns.' },
  improver: { title: 'Improver', min: 1300, max: 1699, description: 'Connect tactics through short calculations.' },
  advanced: { title: 'Advanced', min: 1700, max: 2100, description: 'Recognize deeper forcing sequences.' },
});

// Round-robin the thematic buckets; freeze the resulting order for every cycle.
export function selectPuzzles(puzzles, seriesId, count, Chess) {
  const series = SERIES[seriesId];
  if (!series || ![25, 100, 250].includes(count)) throw new Error('Choose a series and set size.');
  const seenIds = new Set();
  const seenPositions = new Set();
  const buckets = new Map();
  const ordered = [...puzzles].sort((a, b) => Number(b.popularity) - Number(a.popularity)
    || Number(b.plays) - Number(a.plays) || String(a.id).localeCompare(String(b.id)));
  for (const puzzle of ordered) {
    const positionKey = String(puzzle.practiceFen || '').trim().split(/\s+/).slice(0, 4).join(' ');
    if (puzzle.rating < series.min || puzzle.rating > series.max || seenIds.has(puzzle.id)
      || seenPositions.has(positionKey) || !Array.isArray(puzzle.solutionUci)
      || puzzle.solutionUci.length < 1 || puzzle.solutionUci.length > 7) continue;
    try {
      const game = new Chess(puzzle.practiceFen);
      for (const uci of puzzle.solutionUci) {
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error('Invalid solution');
        game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      }
    } catch { continue; }
    seenIds.add(puzzle.id);
    seenPositions.add(positionKey);
    const key = puzzle.focus || 'calculation';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(puzzle);
  }
  const result = [];
  while (result.length < count) {
    let added = false;
    for (const bucket of buckets.values()) {
      if (bucket.length && result.length < count) { result.push(bucket.shift()); added = true; }
    }
    if (!added) break;
  }
  if (result.length < count) throw new Error(`Only ${result.length} suitable positions loaded. Try a smaller set.`);
  return result.map((puzzle, index) => ({
    id: puzzle.id, practiceFen: puzzle.practiceFen, solutionUci: [...puzzle.solutionUci],
    rating: puzzle.rating, themes: [...(puzzle.themes || [])], focus: puzzle.focus,
    sourceGame: puzzle.sourceGame, km43CurriculumIndex: index,
  }));
}

export function newCycle(number, now = new Date().toISOString()) {
  return { number, targetDays: CYCLE_DAYS[number - 1], startedAt: now, completedAt: null, results: [] };
}

export function createProgram(seriesId, puzzles, now = new Date().toISOString()) {
  if (!SERIES[seriesId] || !puzzles.length) throw new Error('A fixed puzzle set is required.');
  return {
    id: `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    seriesId, title: `${SERIES[seriesId].title} · ${puzzles.length} positions`,
    createdAt: now, license: 'CC0-1.0', source: 'https://database.lichess.org/#puzzles',
    puzzles: structuredClone(puzzles), cycles: [newCycle(1, now)], draft: null,
  };
}

export function recordAttempt(program, attempt, now = new Date().toISOString()) {
  const cycle = program.cycles.at(-1);
  const index = cycle.results.length;
  if (cycle.completedAt || attempt.index !== index || program.puzzles[index]?.id !== attempt.puzzleId) return false;
  const wrong = Math.max(0, Math.floor(Number(attempt.wrong) || 0));
  const hints = Math.max(0, Math.floor(Number(attempt.hints) || 0));
  cycle.results.push({
    puzzleId: attempt.puzzleId, solved: Boolean(attempt.solved), wrong, hints,
    clean: Boolean(attempt.solved) && wrong === 0 && hints === 0,
    elapsedMs: Math.max(0, Math.round(Number(attempt.elapsedMs) || 0)), at: now,
  });
  program.draft = null;
  if (cycle.results.length === program.puzzles.length) cycle.completedAt = now;
  return true;
}

export function advanceCycle(program, now = new Date().toISOString()) {
  const cycle = program.cycles.at(-1);
  if (!cycle.completedAt || cycle.number >= CYCLE_DAYS.length) return false;
  program.cycles.push(newCycle(cycle.number + 1, now));
  program.draft = null;
  return true;
}

export function cycleStats(cycle) {
  const results = cycle.results || [];
  const clean = results.filter((result) => result.clean).length;
  const times = results.map((result) => result.elapsedMs).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  return {
    attempted: results.length, clean,
    accuracy: results.length ? Math.round(clean / results.length * 100) : null,
    solved: results.filter((result) => result.solved).length,
    skipped: results.filter((result) => !result.solved).length,
    hints: results.reduce((sum, result) => sum + result.hints, 0),
    corrections: results.reduce((sum, result) => sum + result.wrong, 0),
    elapsedMs: results.reduce((sum, result) => sum + result.elapsedMs, 0),
    medianMs: times.length ? (times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2) : null,
  };
}
