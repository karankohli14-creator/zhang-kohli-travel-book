# K-Mate v40 learning system

K-Mate v40 turns recent practice into a short learning prescription:

1. identify the strongest signal from the latest practice and the rolling ten-session profile;
2. recommend one creator-hosted lesson from the curated catalog;
3. select five CC0 Lichess puzzles in the same focus and near the player's current training level;
4. offer an exact-position retry when the originating K-Mate practice is still available.

## Recommendation signals

The current browser implementation uses information K-Mate already stores locally: move-quality loss, principle diagnoses, ignored principles, phase, opening, result, and decision time. A signal seen once is shown as **today**, twice as **emerging**, and at least three times as **persistent**. The latest session is weighted more heavily than older sessions.

Imported Chess.com games remain post-game training sources only. K-Mate currently personalizes learning after the player practices a selected completed-game position; automated whole-game engine mining is a later backend feature.

## Puzzle content

The generated `puzzles/` directory is built from the official Lichess puzzle database and retains puzzle IDs and source-game URLs. The source database is released under Creative Commons CC0 1.0. The build applies the opponent's setup move to each source FEN so the stored `practiceFen` is the position in which the learner moves first.

The pack is divided by learning focus and rating band so the browser downloads only the shard needed for the current five-puzzle workout. Progress and no-repeat history are stored locally under `kmate-learning-v40`.

## Video content

`videos-v40.json` is a hand-curated catalog of lessons surfaced through the Lichess video library. Video files remain hosted by their creators. K-Mate uses YouTube's privacy-enhanced embed URL and provides a link to the corresponding Lichess library page; it does not download, edit, or redistribute the video files. These entries are labeled **External lesson · creator-hosted**, not CC0.
