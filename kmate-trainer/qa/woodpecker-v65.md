# Woodpecker repetition mode

K-Mate's original implementation of fixed-set repetition. No third-party trainer code or book exercise collection is copied.

## Source and series

- Puzzle source: https://database.lichess.org/#puzzles
- Data license: CC0 1.0. Lichess explicitly permits copying, modification, redistribution and commercial use.
- Uses K-Mate's existing 11,902-position pack, generated 2026-09-10; see `learning/puzzles/README.md` for quality filters and the applied setup-move transformation.
- Foundation: 800–1299; Improver: 1300–1699; Advanced: 1700–2100 (Lichess **puzzle** ratings).
- Set sizes: 25, 100 or 250. Round-robin calculation, loose-piece, king-safety and defense buckets. Short lines of up to seven plies; validate every solution move with chess.js and deduplicate IDs and positions. Preserve the exact chosen positions and order in each program's snapshot.
- The Woodpecker method is associated with Axel Smith and Hans Tikkanen. These series are not their published book's exercise collection.
- Reusable open-source trainer examples researched: https://github.com/lawang24/lichess-woodpecker (MIT) and https://github.com/gilbertbrandow/woodpecker (MIT). K-Mate reuses the CC0 puzzle data directly, with no code copied from either project.

## Training behavior

Seven complete passes through a fixed set. K-Mate's flexible target schedule is 28, 14, 7, 4, 2, 1, 1 days. Rest between cycles is suggested rather than enforced. Targets never block the next cycle. A session contains at most ten consecutive positions; ending a session does not start a new cycle.

`kmate-woodpecker-v65` stores programs, immutable puzzle snapshots, cycles, attempt results and the current partial attempt in localStorage. Previous programs remain selectable. Save each attempt and checkpoint elapsed time every five seconds and when leaving/closing/hiding. Reload resumes the current puzzle from its original position while preserving corrections, hints and accumulated time. Another tab changing the store pauses an active Woodpecker session.

Clean accuracy = solved without any hint or wrong move / all attempted positions. Skips remain unclean. Correcting a move, resetting or restarting cannot turn a tainted attempt into a clean one. Time counts only active, visible puzzle time. Finished attempts and end-of-session screens do not accumulate solve time. Speed comparisons are shown only for complete cycles.

## Integration and verification

The existing prepared-workout board emits generic lifecycle events (`kmate:puzzle-load`, `kmate:puzzle-attempt`, `kmate:puzzle-result`, `kmate:puzzle-close`, `kmate:puzzle-workout-complete`). Ordinary learning and training-plan events remain intact. Delayed forced replies are ignored if the puzzle/game has changed or closed.

Run:

```
node --test kmate-trainer/tests/woodpecker-core-v65.test.mjs
npx playwright test kmate-trainer/tests/woodpecker-v65.spec.mjs --workers=1
```

Browser tests cover fixed-set creation, wrong moves and hints through reset/reload, resume position, cycle repetition, seven-cycle completion, mobile wood-frame containment, home navigation and failed-download recovery. Node tests validate all three full 250-position series and accounting invariants.
