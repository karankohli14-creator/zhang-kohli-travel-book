# K-Mate v41 learning system

K-Mate v41 turns a completed practice into a transparent, move-specific learning prescription:

1. identify the decisions that produced the largest evaluation swings or strongest coaching diagnoses;
2. preserve the exact move number, played move, engine-preferred move, loss, decision time, principle evidence, and position context;
3. rank several creator-hosted lessons against those move-level signals and explain every match before playback;
4. build five CC0 Lichess puzzle slots tied to the leading decisions from the game;
5. select each puzzle by exact theme intersection, focus, phase, opening context, rating, quality, and prior exposure;
6. offer an exact-position retry when the originating K-Mate practice is still available.

## Relevance model

The current game is the primary source of the prescription. K-Mate scores each reviewed move using centipawn loss, coaching diagnoses, ignored principles, forcing-move mechanics, best-move type, and decision time. Recent-history patterns are used only as a secondary signal and tie-breaker.

A recommendation includes `moveEvidence`, `focusRanking`, `puzzlePlan`, and a human-readable relevance explanation. When at least three meaningful decisions are available, the five-puzzle plan gives two positions to each of the two largest errors and one position to the third. Every puzzle screen names the move it is intended to reinforce.

Imported Chess.com games remain post-game training sources. K-Mate personalizes learning after the player selects a completed-game position and practices it. Automatic whole-game engine mining remains a later backend feature.

## Puzzle experience

The generated `puzzles/` directory comes from the official Lichess puzzle database and retains puzzle IDs and source-game URLs. The source database is released under Creative Commons CC0 1.0. The build applies the opponent's setup move to each source FEN so the stored `practiceFen` is the position in which the learner moves first.

The pack is divided by focus and rating band. For each plan slot, K-Mate prefers puzzles that share the exact motifs attached to the triggering move, then considers rating distance, phase, opening tags, popularity, and no-repeat history.

Puzzle practice uses the same visual language as normal K-Mate play: player bars, board and pieces, legal-move indicators, last-move highlighting, status feedback, and automatic opponent replies. On phones, the board is prioritized, secondary explanation is collapsed, and the entire view stays within the device safe-area insets.

Progress, source-move evidence, relevance scores, and no-repeat history are stored locally under `kmate-learning-v40` for backward compatibility.

## Instructional lessons

`videos-v40.json` remains the curated lesson catalog. K-Mate ranks lessons using the triggering moves' diagnoses, skills, tactical themes, lesson tags, opening context, and player level. The player sees a ranked list with a move-specific explanation before any video opens.

Video files remain hosted by their creators. K-Mate uses YouTube's privacy-enhanced embed URL and links to the corresponding Lichess library page; it does not download, edit, or redistribute the video files. These entries are labeled **External lesson · creator-hosted**, not CC0.
