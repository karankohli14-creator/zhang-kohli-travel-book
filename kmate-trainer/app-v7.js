import { POSITIONS } from './positions-v7.js?v=11.0.0';

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

const partUrls = [1, 2, 3, 4, 5, 6].map((number) => `./app-v7-part${number}.txt?v=11.0.0`);
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
} finally {
  URL.revokeObjectURL(moduleUrl);
}
