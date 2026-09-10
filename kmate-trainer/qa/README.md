# K-Mate importer QA

K-Mate's position-import pipeline is covered by two automated checks.

## Browser journeys

`tests/importers.spec.mjs` runs in Chromium and verifies:

- the importer is visible from the active setup wizard;
- FEN/PGN, Picture, and Chess.com tabs are keyboard accessible;
- the picture editor creates complete, validated FEN state;
- a recognized screenshot can start a playable K-Mate session;
- only completed standard Chess.com games are offered;
- a selected Chess.com decision can start a playable session;
- the importer remains inside a phone-sized viewport;
- the real Fenshot/ONNX model recognizes the maintained Chess.com fixture.

## Live Chess.com contract

`tests/chesscom-live-contract.mjs` checks the public archive shape for `Kmate_00`, searches recent archives sequentially, and confirms that a completed standard game contains reconstructable PGN. It never reads active games or uses account credentials.

The live contract is intentionally non-blocking because a temporary Chess.com outage should not prevent unrelated K-Mate changes from merging.
