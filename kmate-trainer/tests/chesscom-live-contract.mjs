const username = String(process.env.KMATE_CHESSCOM_USER || 'Kmate_00').trim();
const API_ROOT = 'https://api.chess.com/pub/player';
const MAX_ARCHIVES = 6;
const RETRIES = 3;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url, attempt = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'K-Mate-Importer-QA/37.0 (public Chess.com archive compatibility check)',
      },
    });
    if ((response.status === 429 || response.status >= 500) && attempt < RETRIES) {
      const delay = 1_000 * attempt;
      console.warn(`Chess.com returned ${response.status}; retrying in ${delay} ms.`);
      await sleep(delay);
      return fetchJson(url, attempt + 1);
    }
    if (!response.ok) throw new Error(`Chess.com returned HTTP ${response.status} for ${url}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function completedStandardGames(games) {
  return (Array.isArray(games) ? games : []).filter((game) => (
    typeof game?.pgn === 'string'
    && game.pgn.length > 30
    && Number.isFinite(Number(game?.end_time))
    && (!game.rules || game.rules === 'chess')
  ));
}

if (!/^[A-Za-z0-9_-]{2,30}$/.test(username)) {
  throw new Error(`Invalid Chess.com username supplied to QA: ${username}`);
}

const archiveIndexUrl = `${API_ROOT}/${encodeURIComponent(username.toLowerCase())}/games/archives`;
const archiveIndex = await fetchJson(archiveIndexUrl);
const archives = Array.isArray(archiveIndex?.archives) ? [...archiveIndex.archives].reverse() : [];
if (!archives.length) throw new Error(`No public Chess.com archives were returned for ${username}.`);

let selectedGame = null;
let selectedArchive = null;
let examinedGames = 0;
for (const archiveUrl of archives.slice(0, MAX_ARCHIVES)) {
  const archive = await fetchJson(archiveUrl);
  examinedGames += Array.isArray(archive?.games) ? archive.games.length : 0;
  const candidates = completedStandardGames(archive?.games)
    .sort((first, second) => Number(second.end_time || 0) - Number(first.end_time || 0));
  if (candidates.length) {
    selectedGame = candidates[0];
    selectedArchive = archiveUrl;
    break;
  }
}

if (!selectedGame) {
  throw new Error(`No completed standard-chess PGN was found for ${username} in the ${Math.min(MAX_ARCHIVES, archives.length)} most recent archives.`);
}

const white = String(selectedGame.white?.username || '');
const black = String(selectedGame.black?.username || '');
const normalized = username.toLowerCase();
if (white.toLowerCase() !== normalized && black.toLowerCase() !== normalized) {
  throw new Error(`The selected archive game does not contain ${username} as either player.`);
}
if (!/^\s*\[Event\s+"/m.test(selectedGame.pgn) || !/\n\s*\d+\.(?:\.\.)?\s+/m.test(selectedGame.pgn)) {
  throw new Error('The selected Chess.com record does not contain a reconstructable PGN header and move text.');
}

console.log(JSON.stringify({
  status: 'pass',
  username,
  archivesAvailable: archives.length,
  archivesExamined: Math.min(MAX_ARCHIVES, archives.length),
  gamesExamined: examinedGames,
  selectedArchive,
  selectedGame: {
    endTime: selectedGame.end_time,
    timeClass: selectedGame.time_class || null,
    rules: selectedGame.rules || 'chess',
    userColor: white.toLowerCase() === normalized ? 'white' : 'black',
    opponent: white.toLowerCase() === normalized ? black : white,
    pgnLength: selectedGame.pgn.length,
  },
}, null, 2));
