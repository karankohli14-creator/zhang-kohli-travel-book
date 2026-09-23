const CLASSIC_BOARD_VERSION = '46.0.0';
const CLASSIC_BOARD_STYLE_ID = 'classicBoardV46Styles';
const SVG_BOARD_STORE_KEY = 'kmate-svg-board-v44';
const CLASSIC_BOARD_SELECTORS = ['#board', '#km42PuzzleBoard', '.replay-board'];
const classicBoardQuery = new URLSearchParams(window.location.search);
function classicBoardStoredSvgWasEnabled() {
  try { return JSON.parse(localStorage.getItem(SVG_BOARD_STORE_KEY) || 'null')?.enabled === true; }
  catch { return false; }
}
const classicBoardForceNative = classicBoardQuery.get('nativeBoard') === '1';
const classicBoardLegacyRequested = !classicBoardForceNative && (
  classicBoardQuery.get('legacySvg') === '1'
  || ['127.0.0.1', 'localhost'].includes(window.location.hostname)
  || (classicBoardQuery.has('deploy') && classicBoardStoredSvgWasEnabled())
);

let classicBoardObserver = null;
let classicBoardCleanupScheduled = false;
let classicBoardRetiredOverlays = 0;
let classicBoardRestoredSquares = 0;

function classicBoardEnsureStyles() {
  if (document.querySelector(`#${CLASSIC_BOARD_STYLE_ID}`)) return;
  const link = document.createElement('link');
  link.id = CLASSIC_BOARD_STYLE_ID;
  link.rel = 'stylesheet';
  link.href = `./classic-board-v46.css?v=${CLASSIC_BOARD_VERSION}`;
  document.head.append(link);
}

function classicBoardDisableStoredSvgPreference() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SVG_BOARD_STORE_KEY) || 'null');
    const next = parsed && typeof parsed === 'object' ? { ...parsed } : {};
    next.enabled = false;
    next.retiredByClassicBoard = CLASSIC_BOARD_VERSION;
    localStorage.setItem(SVG_BOARD_STORE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('K-Mate could not save the stable-board preference.', error);
  }
}

function classicBoardRestoreBoard(board) {
  if (!(board instanceof Element)) return false;

  board.classList.remove('svg44-enabled', 'svg45-optimistic');
  board.classList.add('kmate-classic-board-v46');
  delete board.dataset.svg44Theme;

  for (const overlay of [...board.children].filter((child) => child.classList?.contains('svg44-overlay'))) {
    overlay.remove();
    classicBoardRetiredOverlays += 1;
  }

  for (const square of [...board.children].filter((child) => child.classList?.contains('sq'))) {
    if (square.hasAttribute('aria-hidden') || square.getAttribute('tabindex') === '-1') {
      classicBoardRestoredSquares += 1;
    }
    square.removeAttribute('aria-hidden');
    square.removeAttribute('tabindex');
  }
  return true;
}

function classicBoardRemoveLegacyControls() {
  document.querySelector('#svgBoardStyleButton')?.remove();
  document.querySelector('#svg44PuzzleStyleButton')?.remove();
  document.querySelector('#svgBoardDialog')?.remove();
  document.querySelector('#svgBoardV44Styles')?.remove();
  document.querySelector('#svgBoardV44InteractionStyles')?.remove();
  document.querySelector('#svgBoardV45PerformanceStyles')?.remove();
}

function classicBoardCleanup(root = document) {
  classicBoardRemoveLegacyControls();
  const boards = new Set();
  for (const selector of CLASSIC_BOARD_SELECTORS) {
    if (root instanceof Element && root.matches(selector)) boards.add(root);
    root.querySelectorAll?.(selector).forEach((board) => boards.add(board));
  }
  boards.forEach(classicBoardRestoreBoard);
  return boards.size;
}

function classicBoardScheduleCleanup() {
  if (classicBoardCleanupScheduled) return;
  classicBoardCleanupScheduled = true;
  window.requestAnimationFrame(() => {
    classicBoardCleanupScheduled = false;
    classicBoardCleanup();
  });
}

function classicBoardStartObserver() {
  if (classicBoardObserver || !document.body) return;
  classicBoardObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (target?.closest?.('#board,#km42PuzzleBoard,.replay-board')) return true;
      return [...mutation.addedNodes].some((node) => (
        node instanceof Element
        && (node.matches?.('#board,#km42PuzzleBoard,.replay-board,.svg44-overlay,#svgBoardDialog')
          || node.querySelector?.('#board,#km42PuzzleBoard,.replay-board,.svg44-overlay,#svgBoardDialog'))
      ));
    });
    if (relevant) classicBoardScheduleCleanup();
  });
  classicBoardObserver.observe(document.body, { childList: true, subtree: true });
}

function classicBoardState() {
  return {
    ready: true,
    active: !classicBoardLegacyRequested,
    version: CLASSIC_BOARD_VERSION,
    renderer: classicBoardLegacyRequested ? 'legacy-svg-opt-in' : 'native-staunton-grid',
    palette: { light: '#eeeed2', dark: '#769656' },
    retiredOverlays: classicBoardRetiredOverlays,
    restoredSquares: classicBoardRestoredSquares,
    boards: CLASSIC_BOARD_SELECTORS
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter((board, index, list) => list.indexOf(board) === index)
      .map((board) => ({
        id: board.id || '',
        classic: board.classList.contains('kmate-classic-board-v46'),
        squares: [...board.children].filter((child) => child.classList?.contains('sq')).length,
        overlay: Boolean([...board.children].find((child) => child.classList?.contains('svg44-overlay'))),
      })),
  };
}

function classicBoardInitialize() {
  window.__KMATE_CLASSIC_BOARD_V46__ = {
    version: CLASSIC_BOARD_VERSION,
    cleanup: classicBoardCleanup,
    state: classicBoardState,
  };

  if (classicBoardLegacyRequested) return;

  document.documentElement.classList.add('kmate-classic-board-v46');
  classicBoardEnsureStyles();
  classicBoardDisableStoredSvgPreference();
  try { window.__KMATE_SVG_BOARD__?.setEnabled?.(false); } catch {}
  classicBoardCleanup();
  classicBoardStartObserver();

  // Catch late-created puzzle and replay boards without leaving a one-frame
  // SVG overlay visible during module startup.
  window.setTimeout(classicBoardCleanup, 0);
  window.setTimeout(classicBoardCleanup, 250);
  window.setTimeout(classicBoardCleanup, 1200);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', classicBoardInitialize, { once: true });
} else {
  classicBoardInitialize();
}
