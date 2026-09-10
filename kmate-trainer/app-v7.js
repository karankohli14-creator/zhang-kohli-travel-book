import { POSITIONS } from './positions-v7.js?v=35.4.0';

const sources = [
  'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm',
  'https://esm.sh/chess.js@1.4.0',
];

let Chess;
let CHESS_URL = '';
for (const url of sources) {
  try {
    ({ Chess } = await import(url));
    CHESS_URL = url;
    break;
  } catch (error) {
    console.warn('Chess rules source failed:', url, error);
  }
}

if (!Chess) {
  const error = document.querySelector('#loadError');
  const badge = document.querySelector('#topBadge');
  if (error) {
    error.textContent = 'The chess rules engine could not load. Check the connection and reload this page.';
    error.classList.add('show');
  }
  if (badge) badge.textContent = 'Engine unavailable';
  throw new Error('Unable to load chess.js');
}

window.__KM_BOOT__ = { POSITIONS, Chess, CHESS_URL };

const narrowLayoutFix = document.createElement('style');
narrowLayoutFix.textContent = `.card,.table-card,.recent-card,.tables-grid,.table-scroll,.recent-row>span{min-width:0}.table-scroll{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}@media(max-width:700px){.table-card{overflow:hidden}.recent-row{max-width:100%;overflow:hidden}.recent-row>span:nth-child(2){overflow-wrap:anywhere}}`;
document.head.append(narrowLayoutFix);

const partUrls = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => `./app-v7-part${number}.txt?v=40.0.0`);
const responses = await Promise.all(partUrls.map(async (url) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`);
  return response.text();
}));
// GitHub stores the first transport chunk with a harmless boundary marker; normalize it before joining.
if (responses[0].endsWith('\n  }') && responses[1].startsWith(' }\n')) {
  responses[0] = responses[0].slice(0, -2);
}
const moduleUrl = URL.createObjectURL(new Blob([responses.join('')], { type: 'text/javascript' }));
try {
  await import(moduleUrl);
  try {
    await import('./position-importers-v1.js?v=36.0.0');
    try {
      await import('./position-importers-hardening-v37.js?v=37.0.0');
    } catch (error) {
      // The v37 layer improves presets, accessibility, preload behavior, and
      // diagnostics. The core importer remains usable when this layer fails.
      console.warn('Optional position-importer hardening could not load.', error);
    }
    try {
      await import('./position-importers-chess-v38.js?v=38.0.0');
    } catch (error) {
      // The v38 layer keeps selected Chess.com positions visible in narrow
      // app panes and adds an explicit jump to the loaded board.
      console.warn('Optional Chess.com position visibility fix could not load.', error);
    }
  } catch (error) {
    // Position imports are an optional enhancement. A network or module error
    // must never prevent the core K-Mate trainer from loading.
    console.warn('Optional picture and Chess.com position importers could not load.', error);
  }

  try {
    await import('./practice-restart-v39.js?v=39.0.0');
  } catch (error) {
    // Restart is an enhancement; a UI-module failure must not prevent play.
    console.warn('Optional practice restart controls could not load.', error);
  }

  try {
    await import('./learning-v40.js?v=40.0.0');
  } catch (error) {
    // Learning content is optional; core play remains usable if a catalog or
    // interface module cannot load.
    console.warn('Optional adaptive learning system could not load.', error);
  }
} finally {
  URL.revokeObjectURL(moduleUrl);
}
