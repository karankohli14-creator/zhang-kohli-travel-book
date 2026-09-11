# K-Mate browser and content QA

K-Mate's importer, exact-position restart, setup-specific principles, move-relevant learning, and touch-safe puzzle experience are covered by deterministic browser journeys plus live deployment and Chess.com contract checks.

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

`tests/chess-position-visibility.spec.mjs` reproduces the narrow in-app-browser layout and verifies that the selected Chess.com board appears before the scrollable list, remains immediately visible, and can start a K-Mate session.

## Exact-position restart

`tests/restart-practice.spec.mjs` verifies that an in-progress or completed practice can be retried from the exact original FEN while preserving the player's color, opponent strength, time control, and coaching settings. It also verifies that unfinished retries do not pollute Insights.

## V42 setup personalization

`tests/personalization-v42.spec.mjs` changes the setup between attacking middlegame, technical endgame conversion, and fast tactical practice. It verifies that:

- the principle keys actually change rather than repeating one generic list;
- the selected goal, phase, clock, side, position level, and opponent level appear in the customization fingerprint;
- attacking play includes king-safety and pawn-break guidance;
- conversion/endgame play includes conversion and king-activity guidance;
- tactical play includes a forcing scan and loose-piece check;
- every principle has a session action and an explanation of why it was selected;
- the changing principle blueprint is visible in the setup wizard before play.

## Custom post-game learning

The same browser journey seeds three separately diagnosed decisions and verifies that K-Mate:

- preserves exact move evidence with move number, played move, best move, loss, timing, and coaching diagnosis;
- uses gameplay as the primary signal while reserving part of the plan for the chosen training goal;
- displays the moves and setup options that shaped the recommendation;
- creates five puzzle slots containing both move-evidence and session-intent sources;
- produces five unique lesson choices spanning separate mistakes and the selected goal;
- explains each lesson before opening the creator-hosted player;
- records lesson exposure so recently shown videos receive a substantial future penalty.

`tests/learning-library-v40.spec.mjs` remains in the suite to ensure the open eight-category puzzle and video library still works independently of personalized recommendations.

## Movable puzzle board

The v42 phone journey verifies that:

- the full-screen board uses the normal K-Mate player bars and Staunton piece renderer;
- tapping a piece selects it and highlights legal destinations;
- tap–tap completes the first move of a solution;
- a real pointer drag completes the next move of the solution;
- forced opponent replies play automatically;
- source-move and customization metadata are stored with puzzle progress;
- the older v40 and v41 puzzle interfaces do not appear;
- the board remains square and inside simulated status-bar, notch, and home-indicator safe areas.

## Curated puzzle-pack validation

`scripts/build_kmate_learning_pack.py` streams the official Lichess puzzle export, filters for quality and rating, applies the opponent's setup move, validates every selected continuation with a chess-rules engine, and writes 56 focus/rating shards. CI requires a CC0 index containing at least 10,000 puzzles before the pack can be merged.

## Live production validation

`.github/workflows/kmate-live-learning-check.yml` waits for GitHub Pages to expose the v42 loader, verifies all public personalization assets, and then exercises the production app in Chromium. It confirms that:

- the setup principle list changes when goal, phase, clock, and side change;
- the completed-session recommendation contains move evidence and an explicit setup-intent slot;
- five distinct lesson options are presented before playback;
- the custom puzzle screen contains all 64 squares and the normal piece renderer;
- a real puzzle piece can be selected and moved by pointer drag;
- the phone board and controls remain inside simulated iPhone safe areas.

## Live Chess.com contract

`tests/chesscom-live-contract.mjs` checks the public archive shape for `Kmate_00`, searches recent archives sequentially, and confirms that a completed standard game contains reconstructable PGN. It never reads active games or uses account credentials.

The live contract is intentionally non-blocking because a temporary Chess.com outage should not prevent unrelated K-Mate changes from merging.
