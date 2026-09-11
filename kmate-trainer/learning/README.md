# K-Mate v42 custom training system

K-Mate v42 treats the player's setup choices and actual decisions as one continuous training plan:

1. build a pregame principle set from the selected goal, phase, opening, clock, side, position level, opponent strength, and board characteristics;
2. record the exact moves that produce the largest evaluation swings or strongest coaching diagnoses;
3. explain which moves and which setup options shaped the post-game prescription;
4. rank several creator-hosted lessons against separate mistakes and the chosen session goal;
5. build five CC0 Lichess puzzle slots from move evidence while reserving part of the set for the player's explicit training intent;
6. offer an exact-position retry when the originating K-Mate practice is still available.

## Pregame principles

The old selector gave fixed baseline weight to the same generic principles, so the list could remain nearly unchanged. V42 scores all principles using:

- training goal;
- phase and opening family;
- time control and side;
- position level and opponent gap;
- position tags and material state;
- whether the position begins in check;
- principles already shown in recent sessions.

Every selected principle contains a session-specific action prompt and a plain-language explanation of why it was chosen. The setup wizard previews the principle set before play, and changing a major option recalculates the blueprint.

## Gameplay and setup weighting

Reviewed move evidence remains the strongest post-game signal. When meaningful move analysis exists, the recommendation is approximately 78% gameplay evidence and 22% setup intent. The fifth puzzle slot is normally reserved for the goal and position type the player intentionally selected. With fewer analyzed mistakes, additional slots preserve that selected intent. When no move evidence exists, the setup drives the initial recommendation.

A recommendation includes `moveEvidence`, `optionEvidence`, `trainingIntent`, `pregamePrinciples`, `puzzlePlan`, `customizationFingerprint`, and a human-readable explanation. The fingerprint distinguishes sessions played with different goals, clocks, openings, sides, and challenge levels.

Imported Chess.com games remain post-game training sources. K-Mate personalizes after the player selects a completed-game position and practices it. Automatic whole-game engine mining remains a later backend feature.

## Puzzle experience

The generated `puzzles/` directory comes from the official Lichess puzzle database and retains puzzle IDs and source-game URLs. The source database is released under Creative Commons CC0 1.0. The build applies the opponent's setup move to each source FEN so the stored `practiceFen` is the position in which the learner moves first.

For each plan slot, K-Mate ranks positions using exact motif overlap, focus, rating distance, phase, opening tags, popularity, prior exposure, the triggering move, and the selected session goal.

V42 puzzle practice uses the same Staunton piece renderer, player bars, board squares, legal-move indicators, last-move highlighting, and status treatment as normal K-Mate play. Pieces can be moved by tap–tap or by pointer drag with a mouse, finger, or stylus. On phones, the board receives priority, secondary explanation is collapsed, and the full interface stays inside the device safe-area insets.

Progress, source-move evidence, setup source, relevance scores, and no-repeat history are stored locally under `kmate-learning-v40` for backward compatibility.

## Instructional lessons

`videos-v40.json` remains the curated lesson catalog. V42 attempts to assign different lessons to different high-impact moves, adds a lesson tied to the selected goal or opening, promotes creator diversity, and heavily penalizes videos shown in recent sessions. The player sees five ranked choices with a move- or setup-specific explanation before any video opens.

Video files remain hosted by their creators. K-Mate uses YouTube's privacy-enhanced embed URL and links to the corresponding Lichess library page; it does not download, edit, or redistribute the video files. These entries are labeled **External lesson · creator-hosted**, not CC0.
