import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Chess } from 'chess.js';
import { selectPuzzles, createProgram, recordAttempt, advanceCycle, cycleStats } from '../woodpecker-core-v65.mjs';

const directory = new URL('../learning/puzzles/', import.meta.url);
const index = JSON.parse(fs.readFileSync(new URL('index.json', directory)));
const puzzles = index.shards.filter((shard) => ['calculation', 'loosePieces', 'kingSafety', 'defense'].includes(shard.focus))
  .flatMap((shard) => JSON.parse(fs.readFileSync(new URL(shard.file, directory))).puzzles);

test('every series supplies 250 unique, fully legal fixed positions from the CC0 pack', () => {
  for (const seriesId of ['foundation', 'improver', 'advanced']) {
    const set = selectPuzzles(puzzles, seriesId, 250, Chess);
    assert.equal(set.length, 250);
    assert.equal(new Set(set.map((puzzle) => puzzle.id)).size, 250);
    assert.ok(new Set(set.map((puzzle) => puzzle.focus)).size >= 3);
    assert.deepEqual(selectPuzzles(puzzles, seriesId, 25, Chess), set.slice(0, 25));
  }
});

test('cycles repeat the unchanged set and count hints, corrections and skips as unclean', () => {
  const set = selectPuzzles(puzzles, 'improver', 25, Chess);
  const program = createProgram('improver', set);
  const snapshot = JSON.stringify(program.puzzles);
  assert.equal(advanceCycle(program), false);
  assert.equal(recordAttempt(program, { index: 4, puzzleId: set[4].id, solved: true }), false);
  for (let cycle = 1; cycle <= 7; cycle++) {
    for (let index = 0; index < set.length; index++) {
      assert.equal(recordAttempt(program, {
        index, puzzleId: set[index].id, solved: index !== 3, wrong: index === 1 ? 1 : 0,
        hints: index === 2 ? 1 : 0, elapsedMs: 5000,
      }), true);
      assert.equal(recordAttempt(program, { index, puzzleId: set[index].id, solved: true }), false);
    }
    const stats = cycleStats(program.cycles.at(-1));
    assert.equal(stats.clean, 22);
    assert.equal(stats.accuracy, 88);
    assert.equal(stats.hints, 1);
    assert.equal(stats.skipped, 1);
    assert.equal(stats.elapsedMs, 125000);
    assert.equal(stats.medianMs, 5000);
    assert.equal(JSON.stringify(program.puzzles), snapshot);
    assert.equal(advanceCycle(program), cycle < 7);
    if (cycle < 7) assert.equal(program.cycles.at(-1).results.length, 0);
  }
  assert.equal(program.cycles.length, 7);
});
