# K-Mate browser and content QA

K-Mate's importer, exact-position restart, and adaptive learning systems are covered by deterministic browser journeys plus a live Chess.com contract check.

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

## Adaptive learning journeys

`tests/learning-v40.spec.mjs` seeds a recent Chess.com-derived practice containing a diagnosed loose-piece blunder and verifies that K-Mate:

- classifies the primary learning focus from move loss, principle evidence, and decision time;
- opens the Learn section with a transparent “why this was recommended” explanation;
- selects a matching creator-hosted instructional video;
- loads a five-puzzle CC0 workout near the player's training rating;
- accepts board moves, plays forced opponent replies, offers hints, and completes the line;
- records solved, skipped, and correction data locally;
- finishes the workout with a progress summary.

The smoke workflow also assembles and syntax-checks every split application/UI chunk and validates the video catalog's source labels and privacy-enhanced embed URLs.

## Curated puzzle-pack validation

`scripts/build_kmate_learning_pack.py` streams the official Lichess puzzle export, filters for quality and rating, applies the opponent's setup move, validates every selected continuation with a chess-rules engine, and writes 56 focus/rating shards. CI requires a CC0 index containing at least 10,000 puzzles before the pack can be merged.

## Live Chess.com contract

`tests/chesscom-live-contract.mjs` checks the public archive shape for `Kmate_00`, searches recent archives sequentially, and confirms that a completed standard game contains reconstructable PGN. It never reads active games or uses account credentials.

The live contract is intentionally non-blocking because a temporary Chess.com outage should not prevent unrelated K-Mate changes from merging.
