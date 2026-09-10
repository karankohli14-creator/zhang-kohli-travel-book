# K-Mate browser and content QA

K-Mate's importer, exact-position restart, move-relevant learning, and mobile-safe puzzle experience are covered by deterministic browser journeys plus live deployment and Chess.com contract checks.

## Importer journeys

`tests/importers.spec.mjs` runs in Chromium and verifies:

- the importer is visible from the active setup wizard;
- FEN/PGN, Picture, and Chess.com tabs are keyboard accessible;
- the picture editor creates complete, validated FEN state;
- a recognized screenshot can start a playable K-Mate session;
- only completed standard Chess.com games are offered;
- a selected Chess.com decision can start a playable session;
- the importer remains inside a phone-sized viewport;
- the real Fenshot/ONNX model recognizes the maintained Chess.com fixture.

`tests/chess-position-visibility.spec.mjs` reproduces the narrow in-app-browser layout and verifies that:

- the selected Chess.com board appears before the scrollable game list;
- the loaded position contains all 64 squares and is immediately visible;
- the “Selected position ready” notice updates when another game is chosen;
- automatic scrolling keeps the chosen position in the importer viewport;
- the selected position remains ready to start as a K-Mate session.

## Exact-position restart

`tests/restart-practice.spec.mjs` verifies that an in-progress or completed practice can be retried from the exact original FEN while preserving the player's color, opponent strength, time control, and coaching settings. It also verifies that unfinished retries do not pollute Insights.

## Move-relevance learning journeys

`tests/learning-relevance-v41.spec.mjs` seeds a Chess.com-derived practice containing three distinct decisions and verifies that K-Mate:

- creates move-level evidence with move numbers, played moves, best moves, evaluation loss, time, coaching diagnoses, skills, and motifs;
- explains the exact decisions that produced the five-puzzle prescription;
- represents the leading decisions rather than relying on only a generic theme;
- ranks multiple instructional lessons against the move evidence;
- shows the ranked lesson list and a move-specific explanation before video playback;
- places the same evidence on the post-game result card;
- launches a full-screen puzzle view using the normal K-Mate player bars, board, pieces, move indicators, and status treatment;
- selects puzzle positions using focus, exact motif overlap, rating, phase, opening context, and no-repeat history;
- stores the triggering source move and relevance metadata with puzzle progress.

The phone-sized journey sets explicit top and bottom safe-area insets and verifies that the full puzzle view stays inside them, the board is square and receives priority space, secondary text is compact, and the old split puzzle dialog does not appear.

The smoke workflow assembles and syntax-checks every split application chunk, validates all v41 module wiring, and checks the catalog sources and privacy-enhanced embed URLs.

## Curated puzzle-pack validation

`scripts/build_kmate_learning_pack.py` streams the official Lichess puzzle export, filters for quality and rating, applies the opponent's setup move, validates every selected continuation with a chess-rules engine, and writes 56 focus/rating shards. CI requires a CC0 index containing at least 10,000 puzzles before the pack can be merged.

## Live production validation

`.github/workflows/kmate-live-learning-check.yml` waits for GitHub Pages to expose the v41 loader, verifies the public relevance assets, seeds a real move-level practice in Chromium, and confirms:

- the exact move appears in the relevance explanation;
- the open library still contains all eight categories;
- at least three ranked lessons appear before playback;
- a five-slot prescription is available;
- the phone puzzle screen contains all 64 squares and two game-style player bars;
- the board and controls remain inside simulated iPhone status-bar and home-indicator insets.

## Live Chess.com contract

`tests/chesscom-live-contract.mjs` checks the public archive shape for `Kmate_00`, searches recent archives sequentially, and confirms that a completed standard game contains reconstructable PGN. It never reads active games or uses account credentials.

The live contract is intentionally non-blocking because a temporary Chess.com outage should not prevent unrelated K-Mate changes from merging.
