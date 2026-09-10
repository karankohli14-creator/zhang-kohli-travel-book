import { Chess } from 'chess.js';

const username = String(process.env.KMATE_CHESSCOM_USER || 'Kmate_00').trim();
const API_ROOT = 'https://api.chess.com/pub/player';
const MAX_ARCHIVES = 8;
const MAX_GAMES = 60;
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'K-Mate-ChessCom-Parser-Diagnostic/38.0',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

function pgnHeader(pgn, name) {
  const pattern = new RegExp(`^\\[${name}\\s+"([^"]*)"\\]`, 'mi');
  return String(pgn || '').match(pattern)?.[1] || '';
}

function gameSummary(game) {
  return {
    url: game.url || null,
    endTime: game.end_time || null,
    timeClass: game.time_class || null,
    rules: game.rules || 'chess',
    white: game.white?.username || pgnHeader(game.pgn, 'White') || null,
    black: game.black?.username || pgnHeader(game.pgn, 'Black') || null,
    result: pgnHeader(game.pgn, 'Result') || null,
    termination: pgnHeader(game.pgn, 'Termination') || null,
    pgnLength: String(game.pgn || '').length,
  };
}

const archiveIndex = await fetchJson(`${API_ROOT}/${encodeURIComponent(username.toLowerCase())}/games/archives`);
const archives = Array.isArray(archiveIndex.archives) ? [...archiveIndex.archives].reverse() : [];
const games = [];
for (const archiveUrl of archives.slice(0, MAX_ARCHIVES)) {
  const month = await fetchJson(archiveUrl);
  games.push(...(Array.isArray(month.games) ? month.games : []).filter((game) => (
    typeof game?.pgn === 'string'
    && Number.isFinite(Number(game?.end_time))
    && (!game.rules || game.rules === 'chess')
  )));
  if (games.length >= MAX_GAMES) break;
}

games.sort((a, b) => Number(b.end_time || 0) - Number(a.end_time || 0));
const selected = games.slice(0, MAX_GAMES);
const failures = [];
const successes = [];

for (const game of selected) {
  const summary = gameSummary(game);
  try {
    const parser = new Chess();
    parser.loadPgn(game.pgn, { strict: false });
    const moves = parser.history({ verbose: true });
    if (!moves.length && /\n\s*1\./m.test(game.pgn)) {
      throw new Error('PGN contains move text but chess.js returned zero moves.');
    }

    const initialFen = pgnHeader(game.pgn, 'FEN') || START_FEN;
    const replay = new Chess(initialFen);
    for (let index = 0; index < moves.length; index += 1) {
      const move = moves[index];
      const applied = replay.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || 'q',
      });
      if (!applied) throw new Error(`Replay rejected ply ${index + 1}: ${move.from}${move.to}`);
    }

    successes.push({ ...summary, plies: moves.length, finalFen: replay.fen() });
  } catch (error) {
    failures.push({
      ...summary,
      error: String(error?.stack || error?.message || error),
      pgnStart: String(game.pgn || '').slice(0, 900),
      pgnEnd: String(game.pgn || '').slice(-900),
    });
  }
}

console.log(JSON.stringify({
  username,
  archivesAvailable: archives.length,
  archivesExamined: Math.min(MAX_ARCHIVES, archives.length),
  gamesExamined: selected.length,
  successes: successes.length,
  failures: failures.length,
  newestSuccesses: successes.slice(0, 5),
  parseFailures: failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
