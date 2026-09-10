#!/usr/bin/env python3
"""Build a balanced, browser-sized K-Mate puzzle pack from the CC0 Lichess export.

Input is the decompressed CSV stream on stdin. The script keeps a deterministic
quality-ranked candidate pool for each focus/rating bucket, validates selected
puzzles with python-chess, and writes small JSON shards plus an index.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import heapq
import json
import math
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import chess

BANDS = (
    (800, 999, "0800-0999"),
    (1000, 1199, "1000-1199"),
    (1200, 1399, "1200-1399"),
    (1400, 1599, "1400-1599"),
    (1600, 1799, "1600-1799"),
    (1800, 1999, "1800-1999"),
    (2000, 2300, "2000-2300"),
)

FOCUS = {
    "loosePieces": {
        "label": "Loose pieces",
        "themes": {"hangingPiece", "capturingDefender", "trappedPiece"},
        "description": "Spot undefended pieces, overloaded defenders, and tactical targets.",
    },
    "calculation": {
        "label": "Calculation",
        "themes": {
            "fork", "pin", "skewer", "discoveredAttack", "doubleCheck",
            "deflection", "attraction", "intermezzo", "xRayAttack",
            "clearance", "interference", "sacrifice",
        },
        "description": "Scan checks, captures, threats, and concrete tactical sequences.",
    },
    "kingSafety": {
        "label": "King safety",
        "themes": {
            "mate", "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5",
            "backRankMate", "smotheredMate", "anastasiaMate", "arabianMate",
            "bodenMate", "doubleBishopMate", "dovetailMate", "hookMate",
            "attackingF2F7", "exposedKing", "kingsideAttack", "queensideAttack",
        },
        "description": "Recognize mating patterns, exposed kings, and defensive necessities.",
    },
    "defense": {
        "label": "Defense",
        "themes": {"defensiveMove", "equality", "interference", "quietMove"},
        "description": "Find resources that neutralize threats and preserve the position.",
    },
    "endgames": {
        "label": "Endgames",
        "themes": {
            "endgame", "rookEndgame", "pawnEndgame", "queenEndgame",
            "queenRookEndgame", "zugzwang", "promotion", "underPromotion",
        },
        "description": "Train king activity, pawn races, rook technique, and conversion.",
    },
    "pawnPlay": {
        "label": "Pawn play",
        "themes": {"advancedPawn", "promotion", "underPromotion", "pawnEndgame"},
        "description": "Calculate pawn breaks, passed pawns, and structural commitments.",
    },
    "positionalPlay": {
        "label": "Positional play",
        "themes": {"quietMove", "advantage", "equality", "defensiveMove"},
        "description": "Improve pieces, compare plans, and find non-forcing best moves.",
    },
    "openings": {
        "label": "Opening patterns",
        "themes": set(),
        "description": "Reinforce recurring tactical and strategic ideas from named openings.",
    },
}

FOCUS_PRIORITY = (
    "kingSafety", "endgames", "loosePieces", "calculation",
    "defense", "pawnPlay", "positionalPlay", "openings",
)

HEADER = (
    "PuzzleId", "FEN", "Moves", "Rating", "RatingDeviation", "Popularity",
    "NbPlays", "Themes", "GameUrl", "OpeningTags", "DailyDate",
)


@dataclass(order=True)
class Candidate:
    score: float
    puzzle_id: str = field(compare=False)
    row: tuple[str, ...] = field(compare=False)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--per-bucket", type=int, default=215,
                        help="Target puzzles per focus/rating bucket (8×7×215 = 12,040).")
    parser.add_argument("--oversample", type=float, default=1.65)
    parser.add_argument("--min-popularity", type=int, default=80)
    parser.add_argument("--min-plays", type=int, default=100)
    parser.add_argument("--max-rd", type=int, default=100)
    return parser.parse_args()


def band_for(rating: int) -> tuple[int, int, str] | None:
    for low, high, key in BANDS:
        if low <= rating <= high:
            return low, high, key
    return None


def stable_jitter(puzzle_id: str) -> float:
    digest = hashlib.blake2s(puzzle_id.encode("utf-8"), digest_size=4).digest()
    return int.from_bytes(digest, "big") / 2**32


def primary_focus(themes: set[str], opening_tags: str) -> str | None:
    for key in FOCUS_PRIORITY:
        if key == "openings":
            if opening_tags.strip():
                return key
            continue
        if themes.intersection(FOCUS[key]["themes"]):
            if key == "pawnPlay" and "pawnEndgame" in themes:
                continue
            return key
    return None


def candidate_score(popularity: int, plays: int, rd: int, puzzle_id: str) -> float:
    return (
        popularity * 1000
        + min(6000, math.log2(max(2, plays)) * 360)
        + max(0, 110 - rd) * 13
        + stable_jitter(puzzle_id)
    )


def normalize_row(row: list[str]) -> tuple[str, ...] | None:
    if len(row) < 10:
        return None
    if len(row) == 10:
        row.append("")
    if len(row) > 11:
        row = row[:9] + [" ".join(row[9:-1]), row[-1]]
    return tuple(row[:11])


def validate_and_prepare(row: tuple[str, ...], focus: str, band_key: str) -> dict | None:
    values = dict(zip(HEADER, row))
    moves = values["Moves"].split()
    if len(moves) < 2 or len(moves) > 15:
        return None
    try:
        board = chess.Board(values["FEN"])
        opponent_move = chess.Move.from_uci(moves[0])
        if opponent_move not in board.legal_moves:
            return None
        board.push(opponent_move)
        if board.is_game_over(claim_draw=True):
            return None
        replay = board.copy(stack=False)
        for uci in moves[1:]:
            move = chess.Move.from_uci(uci)
            if move not in replay.legal_moves:
                return None
            replay.push(move)
    except Exception:
        return None

    return {
        "id": values["PuzzleId"],
        "practiceFen": board.fen(),
        "solutionUci": moves[1:],
        "opponentMove": moves[0],
        "rating": int(values["Rating"]),
        "ratingDeviation": int(values["RatingDeviation"]),
        "popularity": int(values["Popularity"]),
        "plays": int(values["NbPlays"]),
        "themes": values["Themes"].split(),
        "openingTags": values["OpeningTags"].split(),
        "sourceGame": values["GameUrl"],
        "focus": focus,
        "band": band_key,
    }


def compact_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> int:
    args = parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    pool_size = max(args.per_bucket + 25, int(args.per_bucket * args.oversample))
    heaps: dict[tuple[str, str], list[Candidate]] = {
        (focus, band[2]): [] for focus in FOCUS for band in BANDS
    }

    reader = csv.reader(sys.stdin)
    first = next(reader, None)
    pending = []
    if first and first[0] != "PuzzleId":
        pending.append(first)

    scanned = eligible = 0
    for raw in [*pending, *reader] if pending else reader:
        scanned += 1
        row = normalize_row(raw)
        if not row:
            continue
        try:
            rating = int(row[3])
            rd = int(row[4])
            popularity = int(row[5])
            plays = int(row[6])
        except (TypeError, ValueError):
            continue
        band = band_for(rating)
        if not band or rd > args.max_rd or popularity < args.min_popularity or plays < args.min_plays:
            continue
        themes = set(row[7].split())
        if "veryLong" in themes or "oneMove" in themes:
            continue
        focus = primary_focus(themes, row[9])
        if not focus:
            continue
        eligible += 1
        key = (focus, band[2])
        score = candidate_score(popularity, plays, rd, row[0])
        candidate = Candidate(score=score, puzzle_id=row[0], row=row)
        heap = heaps[key]
        if len(heap) < pool_size:
            heapq.heappush(heap, candidate)
        elif score > heap[0].score:
            heapq.heapreplace(heap, candidate)
        if scanned % 500_000 == 0:
            print(f"scanned={scanned:,} eligible={eligible:,}", file=sys.stderr, flush=True)

    shards = []
    total = 0
    seen_ids: set[str] = set()
    shortages: dict[str, int] = {}
    for focus in FOCUS:
        for low, high, band_key in BANDS:
            candidates = sorted(heaps[(focus, band_key)], reverse=True)
            prepared = []
            for candidate in candidates:
                if candidate.puzzle_id in seen_ids:
                    continue
                item = validate_and_prepare(candidate.row, focus, band_key)
                if not item:
                    continue
                seen_ids.add(candidate.puzzle_id)
                prepared.append(item)
                if len(prepared) >= args.per_bucket:
                    break
            filename = f"{focus}-{band_key}.json"
            compact_json(output / filename, {"version": 40, "focus": focus, "band": band_key, "puzzles": prepared})
            count = len(prepared)
            total += count
            if count < args.per_bucket:
                shortages[f"{focus}:{band_key}"] = args.per_bucket - count
            shards.append({
                "focus": focus,
                "band": band_key,
                "minRating": low,
                "maxRating": high,
                "count": count,
                "file": filename,
            })

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    index = {
        "version": 40,
        "license": "CC0-1.0",
        "source": "https://database.lichess.org/lichess_db_puzzle.csv.zst",
        "generatedAt": generated_at,
        "selection": {
            "rating": [800, 2300],
            "minPopularity": args.min_popularity,
            "minPlays": args.min_plays,
            "maxRatingDeviation": args.max_rd,
            "excludeThemes": ["veryLong", "oneMove"],
            "targetPerBucket": args.per_bucket,
        },
        "total": total,
        "focuses": {
            key: {
                "label": value["label"],
                "description": value["description"],
                "themes": sorted(value["themes"]),
            }
            for key, value in FOCUS.items()
        },
        "bands": [
            {"key": key, "minRating": low, "maxRating": high}
            for low, high, key in BANDS
        ],
        "shards": shards,
        "shortages": shortages,
    }
    compact_json(output / "index.json", index)

    readme = f"""# K-Mate CC0 puzzle pack\n\nGenerated {generated_at} from the official Lichess puzzle database.\n\n- Source: https://database.lichess.org/lichess_db_puzzle.csv.zst\n- License: Creative Commons CC0 1.0\n- Puzzles: {total:,}\n- Selection: ratings 800–2300, popularity ≥ {args.min_popularity}, attempts ≥ {args.min_plays}, rating deviation ≤ {args.max_rd}\n- Transformation: the opponent setup move was applied to the source FEN; `solutionUci` starts with the player's first move.\n\nThe source export is CC0 and permits copying, modification, redistribution, and commercial use. K-Mate retains puzzle IDs and source-game URLs for provenance.\n"""
    (output / "README.md").write_text(readme, encoding="utf-8")
    print(json.dumps({"scanned": scanned, "eligible": eligible, "total": total, "shortages": shortages}, indent=2))
    return 0 if total >= 10_000 else 2


if __name__ == "__main__":
    raise SystemExit(main())
