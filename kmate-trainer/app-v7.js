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

try {
  // v46 uses the original K-Mate grid for immediate, flicker-free rendering
  // while preserving the exact Staunton piece artwork. The retired SVG board
  // remains available only through ?legacySvg=1 for regression testing.
  await import('./classic-board-v46.js?v=46.0.0');
} catch (error) {
  console.warn('Optional v46 stable classic board could not load.', error);
}

try {
  // v48 installs the board-first mobile layout, concise Live Coach narration,
  // one soft interface tap, 50%-quieter piece feedback, and optional haptics.
  // It runs before v45 so the retired louder wood player remains disabled while
  // v45 continues suppressing the core move/capture/check samples.
  await import('./mobile-game-ux-v48.js?v=48.0.0');
} catch (error) {
  console.warn('Optional v48 mobile game and coaching layer could not load.', error);
}

try {
  // This compatibility bootstrap suppresses the core sound library. v48 owns
  // the single quieter wooden movement sample used by the production board.
  await import('./move-sound-v45.js?v=45.2.0');
} catch (error) {
  console.warn('Optional v45 move-sound compatibility layer could not load.', error);
}

const partUrls = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((number) => `./app-v7-part${number}.txt?v=42.0.0`);
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

  if (window.__KMATE_CLASSIC_BOARD_V46__?.state?.().active !== false) {
    try {
      // v47 replaces only the piece artwork on the stable production board.
      // It keeps the white/green board and all input, chess, puzzle, clock,
      // and audio behavior. The retired ?legacySvg=1 renderer retains its
      // original v44 pieces so its fallback contract stays deterministic.
      await import('./sculpted-pieces-v47.js?v=47.0.0');
    } catch (error) {
      console.warn('Optional v47 sculpted chess-piece artwork could not load.', error);
    }
  }

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
    await import('./learning-v40.js?v=40.1.1');
    try {
      await import('./learning-library-v40.js?v=40.1.1');
    } catch (error) {
      // The open library augments the personalized recommendation system.
      // Tailored post-game learning remains available if this layer fails.
      console.warn('Optional open puzzle and video library could not load.', error);
    }
    try {
      await import('./learning-relevance-v41.js?v=41.0.0');
      try {
        await import('./learning-relevance-v41-stability.js?v=41.0.0');
      } catch (error) {
        // This small layer restores ranked lessons if an older view refreshes
        // its card after v41 has rendered. Core relevance remains available.
        console.warn('Optional v41 learning-view stability layer could not load.', error);
      }
    } catch (error) {
      // v41 adds move-level explanations and remains the fallback layer.
      console.warn('Optional move-relevance learning layer could not load.', error);
    }
    try {
      await import('./personalization-v42.js?v=43.0.0');
      try {
        await import('./training-plans-v43.js?v=43.0.0');
      } catch (error) {
        // Training Plans are an optional structured curriculum layer. Core
        // personalized learning and puzzle practice remain available.
        console.warn('Optional v43 Training Plan system could not load.', error);
      }
    } catch (error) {
      // v42 makes the selected setup part of every principle, puzzle, and
      // lesson recommendation and adds reliable tap/drag puzzle controls.
      console.warn('Optional v42 personalization and puzzle controls could not load.', error);
    }
  } catch (error) {
    // Learning content is optional; core play remains usable if a catalog or
    // interface module cannot load.
    console.warn('Optional adaptive learning system could not load.', error);
  }

  if (window.__KMATE_CLASSIC_BOARD_V46__?.state?.().active === false) {
    try {
      await import('./svg-board-v44.js?v=44.0.0');
      try {
        await import('./svg-board-v44-input.js?v=44.0.4');
      } catch (error) {
        console.warn('Optional v44 SVG board input compatibility layer could not load.', error);
      }
      try {
        await import('./svg-board-v44-contrast.js?v=44.0.1');
      } catch (error) {
        console.warn('Optional v44 SVG piece contrast layer could not load.', error);
      }
      try {
        await import('./svg-board-v45-performance.js?v=45.1.0');
      } catch (error) {
        console.warn('Optional v45 low-latency SVG layer could not load.', error);
      }
    } catch (error) {
      // Keep the retired renderer available for controlled regression checks
      // without loading its observers or full-board redraw path for users.
      console.warn('Optional legacy SVG board interface could not load.', error);
    }
  }
} finally {
  URL.revokeObjectURL(moduleUrl);
}
