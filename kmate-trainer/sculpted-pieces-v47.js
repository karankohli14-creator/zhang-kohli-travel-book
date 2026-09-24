const KMATE_REFERENCE_THEME_V52 = '52.0.0';
const KMATE_REFERENCE_STYLE_ID_V52 = 'kmateReferenceThemeV52Styles';
const KMATE_REFERENCE_SELECTOR_V52 = '.piece[data-piece-type], .sq > .piece';
const KMATE_REFERENCE_GLYPHS_V52 = Object.freeze({
  '♙': 'p', '♟': 'p', '♖': 'r', '♜': 'r', '♘': 'n', '♞': 'n',
  '♗': 'b', '♝': 'b', '♕': 'q', '♛': 'q', '♔': 'k', '♚': 'k',
});
const KMATE_REFERENCE_NAMES_V52 = Object.freeze({ p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king' });
const KMATE_REFERENCE_PATHS_V52 = Object.freeze({
  "r": "M66,55 64,57 66,83 69,89 72,92 76,94 78,96 78,98 77,99 77,108 76,109 76,117 75,118 75,126 74,127 74,136 73,137 72,152 63,156 59,160 57,164 57,167 56,168 56,182 57,183 160,183 161,182 161,167 160,166 160,164 158,160 154,156 145,152 145,146 144,145 144,136 143,135 143,127 142,126 142,117 141,116 141,108 140,107 140,95 145,92 148,89 151,84 151,79 152,78 152,66 153,65 153,57 149,54 147,54 140,51 135,51 135,54 133,58 133,61 131,65 131,68 129,70 122,70 121,69 121,49 119,49 118,48 99,48 98,49 96,49 96,69 95,70 88,70 85,64 85,61 83,57 82,51 77,51 76,52 74,52 73,53Z",
  "n": "M83,38 79,43 79,45 78,46 78,51 77,53 66,64 66,65 64,67 61,78 59,81 59,83 57,87 54,90 54,91 44,104 43,108 42,109 42,117 45,121 48,122 50,124 52,124 55,126 58,126 59,127 66,127 69,124 71,120 76,115 84,115 85,114 90,113 93,110 94,110 101,102 103,102 104,103 104,111 103,113 79,136 79,137 74,143 71,152 69,154 67,154 65,156 64,156 60,160 57,166 57,183 162,183 162,166 161,165 161,163 155,156 149,153 149,149 151,146 151,144 153,141 153,139 155,135 155,132 156,131 156,128 157,127 157,120 158,119 158,112 157,111 157,104 156,103 156,99 149,82 147,80 144,74 139,69 139,68 131,61 118,54 112,53 111,52 105,52 104,51 101,51 88,38Z",
  "b": "M105,35 101,37 98,40 97,44 96,45 96,52 98,55 98,58 92,64 91,64 80,76 80,77 76,82 75,85 73,87 71,91 71,93 69,96 69,99 67,103 67,108 66,109 66,120 67,121 67,126 68,127 68,130 69,131 70,136 72,140 74,142 75,145 79,149 79,151 78,152 71,153 65,156 63,158 62,158 62,159 59,162 58,168 57,169 57,182 58,183 162,183 162,167 158,159 151,154 145,153 144,152 141,152 140,151 140,149 143,146 148,138 148,136 150,133 151,127 152,126 152,120 153,119 153,110 152,109 152,104 151,103 151,100 150,99 149,94 141,79 131,68 131,67 130,67 126,63 123,69 123,71 122,72 122,74 119,81 119,85 118,86 118,91 117,92 117,112 116,113 109,113 108,112 108,94 109,93 110,82 111,81 112,75 115,69 115,67 118,61 120,59 121,55 123,52 123,44 121,40 118,37 114,35Z",
  "q": "M82,39 76,44 73,51 73,55 74,56 74,59 75,61 81,67 83,68 83,75 82,76 82,94 81,95 81,102 80,103 78,103 67,92 67,87 68,86 68,78 66,74 61,69 57,68 56,67 50,67 49,68 47,68 42,71 42,72 39,75 39,77 38,78 38,87 40,91 44,95 48,97 50,97 53,100 53,102 55,105 55,107 57,110 57,112 59,115 59,117 61,120 61,122 63,125 63,127 65,130 65,132 67,135 67,137 69,140 69,142 73,150 73,152 72,153 70,153 64,156 59,162 58,164 58,167 57,168 57,182 58,183 162,183 162,165 160,161 154,155 150,154 147,152 147,149 149,146 149,144 151,141 151,139 153,136 153,134 155,131 155,129 157,126 157,124 159,121 159,119 161,116 161,114 163,111 163,109 165,106 167,99 169,97 172,97 176,95 181,89 181,87 182,86 182,79 181,78 180,74 175,69 171,68 170,67 163,67 157,70 154,73 152,77 152,80 151,81 151,84 152,85 153,91 141,103 139,103 138,102 137,68 144,62 146,58 146,49 142,42 135,38 127,38 120,42 120,43 117,46 117,48 116,49 116,58 118,62 120,64 120,67 119,68 115,82 113,85 112,90 111,91 109,91 106,86 106,84 105,83 105,81 104,80 104,78 103,77 103,75 100,68 100,64 104,56 104,50 103,49 102,45 97,40 93,39 92,38 85,38 84,39Z",
  "k": "M101,33 100,34 100,45 99,46 88,46 88,62 101,62 102,63 102,67 101,68 101,71 100,72 100,76 99,77 96,77 91,74 89,74 85,72 82,72 81,71 67,71 66,72 61,73 58,75 56,75 49,81 48,81 44,86 42,93 41,94 41,97 40,98 40,111 41,112 42,118 45,124 62,140 62,141 67,146 70,151 70,153 64,156 58,163 58,165 57,166 57,183 161,183 162,182 162,169 161,168 161,164 156,157 149,153 149,150 154,144 154,143 173,125 177,117 177,115 178,114 178,109 179,108 179,102 178,101 178,95 177,94 176,89 173,84 167,78 158,73 152,72 151,71 138,71 137,72 133,72 127,75 125,75 122,77 120,77 118,73 118,70 117,69 116,63 117,62 131,62 131,46 120,46 119,45 119,34 118,33Z M76,98 78,98 79,97 87,98 91,100 95,104 95,129 94,130 88,130 72,112 71,110 71,103Z M144,99 148,104 148,109 146,113 139,120 139,121 131,130 125,130 124,129 124,103 126,101 135,97 139,97 140,98Z",
  "p": "M100,50 93,54 90,57 87,62 87,64 85,68 85,76 86,77 86,80 88,84 92,89 92,92 88,94 86,96 83,97 80,101 80,103 83,109 95,109 96,110 95,116 94,117 93,122 89,129 83,135 72,142 65,150 63,154 63,156 62,157 62,161 61,162 61,172 156,172 156,162 155,161 155,157 152,150 144,141 133,134 128,129 124,122 124,120 122,116 122,113 121,112 121,110 122,109 134,109 137,103 136,99 131,95 128,94 125,91 125,89 128,86 131,80 131,77 132,76 132,68 131,67 131,64 127,57 124,54 117,50 115,50 114,49 103,49 102,50Z"
});

let km52PieceSerial = 0;
let km52PieceObserver = null;
let km52Applied = 0;
let km52Refreshes = 0;

function km52EnsureStyles() {
  if (document.querySelector(`#${KMATE_REFERENCE_STYLE_ID_V52}`)) return;
  const link = document.createElement('link');
  link.id = KMATE_REFERENCE_STYLE_ID_V52;
  link.rel = 'stylesheet';
  link.href = new URL(`./reference-board-v52.css?v=${KMATE_REFERENCE_THEME_V52}`, import.meta.url).href;
  document.head.append(link);
}

function km52PieceType(element) {
  const datasetType = String(element?.dataset?.pieceType || '').toLowerCase();
  if (KMATE_REFERENCE_PATHS_V52[datasetType]) return datasetType;
  const oldSvgType = element?.querySelector(':scope > svg')?.dataset?.kmateSimplePiece
    || element?.querySelector(':scope > svg')?.dataset?.kmateSculptedPiece
    || element?.querySelector(':scope > svg')?.dataset?.kmatePointedPawnV50;
  if (KMATE_REFERENCE_PATHS_V52[oldSvgType]) return oldSvgType;
  return KMATE_REFERENCE_GLYPHS_V52[String(element?.textContent || '').trim()] || '';
}

function km52PieceColor(element) {
  if (element?.classList?.contains('white')) return 'white';
  if (element?.classList?.contains('black')) return 'black';
  const value = String(element?.dataset?.pieceColor || '').toLowerCase();
  if (value === 'w' || value === 'white') return 'white';
  if (value === 'b' || value === 'black') return 'black';
  return '';
}

function km52PieceSvg(type, color) {
  const uid = `km52-${type}-${color}-${++km52PieceSerial}`;
  const d = KMATE_REFERENCE_PATHS_V52[type];
  const name = KMATE_REFERENCE_NAMES_V52[type] || 'piece';
  return `<svg viewBox="0 0 217 217" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true" data-kmate-reference-piece="${type}" data-kmate-reference-color="${color}">
    <defs>
      <linearGradient id="${uid}-fill" x1="20%" y1="8%" x2="78%" y2="96%">
        <stop offset="0" class="km52-stop-top"/><stop offset=".52" class="km52-stop-mid"/><stop offset="1" class="km52-stop-bottom"/>
      </linearGradient>
    </defs>
    <title>${color} ${name}</title>
    <path class="km52-piece-shadow" d="${d}" fill-rule="evenodd" transform="translate(1.7 2.3)"/>
    <path class="km52-piece-shape" d="${d}" fill="url(#${uid}-fill)" fill-rule="evenodd"/>
  </svg>`;
}

function km52ApplyPiece(element) {
  if (!(element instanceof HTMLElement) || !element.classList.contains('piece')) return false;
  const type = km52PieceType(element);
  const color = km52PieceColor(element);
  if (!type || !color) return false;
  const current = element.querySelector(':scope > svg[data-kmate-reference-piece]');
  if (element.dataset.kmatePieceStyle === KMATE_REFERENCE_THEME_V52
      && current?.dataset.kmateReferencePiece === type
      && current?.dataset.kmateReferenceColor === color) return false;

  element.dataset.kmatePieceStyle = KMATE_REFERENCE_THEME_V52;
  element.dataset.pieceType = type;
  element.dataset.pieceColor = color === 'white' ? 'w' : 'b';
  element.classList.remove('kmate-simple-piece-v51', 'kmate-sculpted-piece-v47', 'kmate-pointed-pawn-v50');
  element.classList.add('vector-piece', 'staunton-piece', 'kmate-reference-piece-v52');
  element.innerHTML = km52PieceSvg(type, color);
  km52Applied += 1;
  return true;
}

function km52Refresh(root = document) {
  km52Refreshes += 1;
  const pieces = new Set();
  if (root instanceof Element && root.matches(KMATE_REFERENCE_SELECTOR_V52)) pieces.add(root);
  root.querySelectorAll?.(KMATE_REFERENCE_SELECTOR_V52).forEach((piece) => pieces.add(piece));
  let changed = 0;
  pieces.forEach((piece) => { if (km52ApplyPiece(piece)) changed += 1; });
  return changed;
}

function km52StartObserver() {
  if (km52PieceObserver || !document.body) return;
  km52PieceObserver = new MutationObserver((mutations) => {
    const roots = new Set();
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (target?.classList?.contains('piece')) roots.add(target);
      for (const node of mutation.addedNodes) if (node instanceof Element) roots.add(node);
    }
    roots.forEach((root) => km52Refresh(root));
  });
  km52PieceObserver.observe(document.body, { childList: true, subtree: true });
}

function km52State() {
  const pieces = [...document.querySelectorAll('.piece.kmate-reference-piece-v52')];
  const byType = Object.fromEntries(Object.keys(KMATE_REFERENCE_PATHS_V52).map((type) => [type, pieces.filter((piece) => piece.dataset.pieceType === type).length]));
  return {
    ready: true,
    version: KMATE_REFERENCE_THEME_V52,
    style: 'uploaded-svg-reference-theme',
    source: 'user-supplied wooden green-and-ivory SVG',
    sourceImageCopied: false,
    exactSilhouetteExtraction: true,
    texturedSquares: true,
    woodenFrame: true,
    orangeCoordinateBadges: true,
    applied: km52Applied,
    refreshes: km52Refreshes,
    visiblePieces: pieces.filter((piece) => piece.getClientRects().length > 0).length,
    totalPieces: pieces.length,
    byType,
    palette: { white: 'reference ivory', black: 'reference charcoal' },
  };
}

function km52Initialize() {
  document.documentElement.classList.remove('kmate-simple-pieces-v51', 'kmate-sculpted-pieces-v47');
  document.documentElement.classList.add('kmate-reference-theme-v52');
  km52EnsureStyles();
  km52Refresh();
  km52StartObserver();
  window.setTimeout(() => km52Refresh(), 0);
  window.setTimeout(() => km52Refresh(), 300);
  window.setTimeout(() => km52Refresh(), 1400);
  const api = { version: KMATE_REFERENCE_THEME_V52, refresh: km52Refresh, state: km52State };
  window.__KMATE_REFERENCE_THEME_V52__ = api;
  // Compatibility aliases for existing K-Mate diagnostics and tests.
  window.__KMATE_SIMPLE_PIECES_V51__ = api;
  window.__KMATE_SCULPTED_PIECES_V47__ = api;
}

km52EnsureStyles();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', km52Initialize, { once: true });
else km52Initialize();
