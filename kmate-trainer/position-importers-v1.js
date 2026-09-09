const IMPORTER_VERSION = '36.0.0';
const STYLE_URL = new URL(`./position-importers-v1.css?v=${IMPORTER_VERSION}`, import.meta.url).href;
const CHESS_COM_API = 'https://api.chess.com/pub/player';
const FENSHOT_MODULE_URL = 'https://esm.sh/@scoriiu/fenshot@0.1.4?deps=onnxruntime-web@1.26.0';
const FENSHOT_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@scoriiu/fenshot@0.1.4/model/chess-tiles-v2.onnx';
const ORT_WASM_MJS_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/ort-wasm-simd-threaded.mjs';
const ORT_WASM_BINARY_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/ort-wasm-simd-threaded.wasm';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EMPTY_PLACEMENT = '8/8/8/8/8/8/8/8';
const FILES = 'abcdefgh';
const PIECES = Object.freeze({
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
});
const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

let appToastTimer = null;
let recognizerPromise = null;
let recognizedImageObjectUrl = null;
let chessRequestController = null;

const imageState = {
  board: placementToBoard(EMPTY_PLACEMENT),
  history: [],
  selectedPiece: null,
  orientation: 'w',
  turn: 'w',
  castling: new Set(),
  enPassant: '-',
  confidenceBySquare: null,
  scanResult: null,
  file: null,
  image: null,
  title: '',
};

const chessState = {
  username: '',
  games: [],
  selectedGame: null,
  frames: [],
  index: 0,
  userColor: 'w',
  orientation: 'w',
  decisionIndexes: [],
};

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function loadStyles() {
  if ($('link[data-kmate-position-importers]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_URL;
  link.dataset.kmatePositionImporters = IMPORTER_VERSION;
  document.head.append(link);
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(appToastTimer);
  appToastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function setText(selector, text, root = document) {
  const element = $(selector, root);
  if (element) element.textContent = text;
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@/, '');
}

function isValidChessComUsername(value) {
  return /^[A-Za-z0-9_-]{2,30}$/.test(value);
}

function placementToBoard(placement) {
  const rows = String(placement || EMPTY_PLACEMENT).split('/');
  if (rows.length !== 8) throw new Error('The board placement must contain eight ranks.');
  return rows.map((rank) => {
    const cells = [];
    for (const char of rank) {
      if (/^[1-8]$/.test(char)) cells.push(...Array(Number(char)).fill(null));
      else if (PIECES[char]) cells.push(char);
      else throw new Error(`Unknown FEN piece: ${char}`);
    }
    if (cells.length !== 8) throw new Error('Each FEN rank must contain eight squares.');
    return cells;
  });
}

function boardToPlacement(board) {
  return board.map((row) => {
    let output = '';
    let empty = 0;
    for (const piece of row) {
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) output += String(empty);
      empty = 0;
      output += piece;
    }
    if (empty) output += String(empty);
    return output;
  }).join('/');
}

function squareToIndexes(square) {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return { row: 8 - rank, col: file };
}

function indexesToSquare(row, col) {
  return `${FILES[col]}${8 - row}`;
}

function buildFen({ board = imageState.board, turn = imageState.turn, castling = imageState.castling, enPassant = imageState.enPassant } = {}) {
  const rights = ['K', 'Q', 'k', 'q'].filter((right) => castling?.has?.(right)).join('') || '-';
  const ep = /^[a-h][36]$/.test(String(enPassant || '').trim()) ? String(enPassant).trim() : '-';
  return `${boardToPlacement(board)} ${turn === 'b' ? 'b' : 'w'} ${rights} ${ep} 0 1`;
}

function validateFen(fen, { allowTerminal = false } = {}) {
  const Chess = window.__KM_BOOT__?.Chess;
  if (!Chess) return { ok: false, message: 'The chess rules engine is still loading.' };
  try {
    const game = new Chess(fen);
    if (!allowTerminal && game.isGameOver()) {
      return { ok: false, message: 'That position is already over. Choose an earlier position or edit the board.' };
    }
    return { ok: true, game };
  } catch (error) {
    return { ok: false, message: String(error?.message || 'This is not a legal chess position.') };
  }
}

function submitFenToKmate(fen, title, errorTarget) {
  const validation = validateFen(fen);
  if (!validation.ok) {
    if (errorTarget) errorTarget.textContent = validation.message;
    return false;
  }
  const titleInput = $('#positionImportTitle');
  const textInput = $('#positionImportText');
  const confirm = $('#confirmPositionImport');
  if (!titleInput || !textInput || !confirm) {
    if (errorTarget) errorTarget.textContent = 'The original position importer could not be found.';
    return false;
  }
  titleInput.value = String(title || '').trim();
  textInput.value = fen;
  if (errorTarget) errorTarget.textContent = '';
  confirm.click();
  return true;
}

function orderedSquares(orientation = 'w') {
  const files = orientation === 'b' ? [...FILES].reverse() : [...FILES];
  const ranks = orientation === 'b' ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  return ranks.flatMap((rank) => files.map((file) => `${file}${rank}`));
}

function renderImportBoard(container, fenOrPlacement, options = {}) {
  if (!container) return;
  let placement = String(fenOrPlacement || EMPTY_PLACEMENT).trim().split(/\s+/)[0];
  let board;
  try {
    board = placementToBoard(placement);
  } catch {
    board = placementToBoard(EMPTY_PLACEMENT);
    placement = EMPTY_PLACEMENT;
  }
  const orientation = options.orientation === 'b' ? 'b' : 'w';
  const squares = orderedSquares(orientation);
  container.innerHTML = '';
  container.dataset.orientation = orientation;
  squares.forEach((square, index) => {
    const { row, col } = squareToIndexes(square);
    const piece = board[row][col];
    const button = document.createElement(options.editable ? 'button' : 'div');
    if (options.editable) button.type = 'button';
    button.className = `km-import-square ${((FILES.indexOf(square[0]) + Number(square[1])) % 2) ? 'light' : 'dark'}`;
    button.dataset.square = square;
    const confidence = options.confidenceBySquare?.[square];
    if (Number.isFinite(confidence) && confidence < 0.82) {
      button.classList.add('low-confidence');
      button.title = `${square}: ${Math.round(confidence * 100)}% recognition confidence — verify this square`;
      const warning = document.createElement('span');
      warning.className = 'km-confidence-dot';
      warning.setAttribute('aria-hidden', 'true');
      button.append(warning);
    }
    if (piece) {
      const glyph = document.createElement('span');
      glyph.className = `km-import-piece ${piece === piece.toUpperCase() ? 'white' : 'black'}`;
      glyph.textContent = PIECES[piece];
      glyph.setAttribute('aria-hidden', 'true');
      button.append(glyph);
    }
    if (index % 8 === 0) {
      const rank = document.createElement('span');
      rank.className = 'km-import-coordinate rank';
      rank.textContent = square[1];
      button.append(rank);
    }
    if (index >= 56) {
      const file = document.createElement('span');
      file.className = 'km-import-coordinate file';
      file.textContent = square[0];
      button.append(file);
    }
    if (options.editable) {
      button.setAttribute('aria-label', `${square}${piece ? ` ${piece}` : ' empty'}`);
      button.addEventListener('click', () => options.onSquare?.(square));
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        options.onErase?.(square);
      });
    }
    container.append(button);
  });
}

function snapshotImageBoard() {
  return {
    board: imageState.board.map((row) => [...row]),
    turn: imageState.turn,
    castling: [...imageState.castling],
    enPassant: imageState.enPassant,
  };
}

function pushImageHistory() {
  imageState.history.push(snapshotImageBoard());
  imageState.history = imageState.history.slice(-40);
}

function restoreImageSnapshot(snapshot) {
  if (!snapshot) return;
  imageState.board = snapshot.board.map((row) => [...row]);
  imageState.turn = snapshot.turn;
  imageState.castling = new Set(snapshot.castling || []);
  imageState.enPassant = snapshot.enPassant || '-';
  imageState.confidenceBySquare = null;
  syncImageControls();
  renderImageEditor();
}

function setImageStatus(message, state = 'idle') {
  const status = $('#kmImageScanStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function setImageBoardFromPlacement(placement, confidenceBySquare = null) {
  pushImageHistory();
  imageState.board = placementToBoard(placement);
  imageState.confidenceBySquare = confidenceBySquare;
  renderImageEditor();
}

function imageConfidenceMap(confidences, rotated = false) {
  if (!Array.isArray(confidences) || confidences.length !== 64) return null;
  const values = rotated ? [...confidences].reverse() : [...confidences];
  const map = {};
  for (let rank = 1; rank <= 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      map[`${FILES[file]}${rank}`] = Number(values[(rank - 1) * 8 + file]);
    }
  }
  return map;
}

function updateImageOverlay(result) {
  const overlay = $('#kmDetectedBoardOverlay');
  const image = imageState.image;
  if (!overlay || !image || !result?.corners || !image.naturalWidth || !image.naturalHeight) {
    if (overlay) overlay.hidden = true;
    return;
  }
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x0 = Math.max(0, Math.min(width, result.corners.x0));
  const y0 = Math.max(0, Math.min(height, result.corners.y0));
  const x1 = Math.max(x0, Math.min(width, result.corners.x1));
  const y1 = Math.max(y0, Math.min(height, result.corners.y1));
  overlay.style.left = `${(x0 / width) * 100}%`;
  overlay.style.top = `${(y0 / height) * 100}%`;
  overlay.style.width = `${((x1 - x0) / width) * 100}%`;
  overlay.style.height = `${((y1 - y0) / height) * 100}%`;
  overlay.hidden = false;
}

async function getImageRecognizer() {
  if (!recognizerPromise) {
    recognizerPromise = import(FENSHOT_MODULE_URL).then((module) => {
      const recognizer = module.createRecognizer({
        modelUrl: FENSHOT_MODEL_URL,
        wasmPaths: { mjs: ORT_WASM_MJS_URL, wasm: ORT_WASM_BINARY_URL },
      });
      return { module, recognizer };
    });
  }
  return recognizerPromise;
}

async function scanLoadedImage() {
  const image = imageState.image;
  if (!image) return;
  const scanButton = $('#kmImageRescan');
  if (scanButton) scanButton.disabled = true;
  setImageStatus('Loading the on-device board recognizer…', 'loading');
  try {
    const { module, recognizer } = await getImageRecognizer();
    setImageStatus('Reading the board on this device…', 'loading');
    const result = await recognizer.recognize(image);
    imageState.scanResult = result;
    if (!result) {
      updateImageOverlay(null);
      setImageStatus('No complete 2D chessboard was detected. Use a tighter screenshot or build the position with the editor.', 'warning');
      return;
    }
    updateImageOverlay(result);
    const resolved = module.resolveOrientation(result.placement);
    const rotated = resolved.orientation === 'black';
    imageState.orientation = rotated ? 'b' : 'w';
    imageState.turn = 'w';
    imageState.castling = new Set();
    imageState.enPassant = '-';
    imageState.confidenceBySquare = imageConfidenceMap(result.confidences, rotated);
    imageState.board = placementToBoard(resolved.placement);
    imageState.history = [];
    syncImageControls();
    renderImageEditor();
    const mean = Math.round(result.meanConfidence * 100);
    const minimum = Math.round(result.minConfidence * 100);
    const lowCount = Object.values(imageState.confidenceBySquare || {}).filter((value) => value < 0.82).length;
    if (!result.plausible) {
      setImageStatus(`A board-like grid was found, but the read is not a plausible chess position (${mean}% average confidence). Correct it in the editor.`, 'warning');
    } else if (!result.reliable || lowCount) {
      setImageStatus(`Board detected · ${mean}% average confidence · ${minimum}% weakest square. Verify the ${lowCount || 'highlighted'} uncertain square${lowCount === 1 ? '' : 's'} and choose whose turn it is.`, 'warning');
    } else {
      setImageStatus(`Board detected · ${mean}% confidence. Confirm whose turn it is and any castling rights before practicing.`, 'success');
    }
  } catch (error) {
    console.warn('K-Mate image recognition failed.', error);
    updateImageOverlay(null);
    setImageStatus('Automatic recognition could not load. The image stays on your device and the manual board editor still works.', 'error');
  } finally {
    if (scanButton) scanButton.disabled = false;
  }
}

async function loadImageFile(file) {
  if (!(file instanceof Blob) || !String(file.type || '').startsWith('image/')) {
    setImageStatus('Choose a PNG, JPEG, WebP, or another image file.', 'error');
    return;
  }
  imageState.file = file;
  imageState.title = `Scanned position · ${file.name || 'image'}`;
  if (recognizedImageObjectUrl) URL.revokeObjectURL(recognizedImageObjectUrl);
  recognizedImageObjectUrl = URL.createObjectURL(file);
  const image = $('#kmImagePreview');
  const empty = $('#kmImageEmpty');
  if (!image) return;
  imageState.image = image;
  image.hidden = false;
  if (empty) empty.hidden = true;
  $('#kmImageWorkspace')?.removeAttribute('hidden');
  const title = $('#kmImageTitle');
  if (title && !title.value.trim()) title.value = imageState.title;
  image.src = recognizedImageObjectUrl;
  try {
    if (typeof image.decode === 'function') await image.decode();
    else await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
  } catch {
    setImageStatus('The image could not be decoded.', 'error');
    return;
  }
  await scanLoadedImage();
}

function renderImagePalette() {
  const palette = $('#kmPiecePalette');
  if (!palette) return;
  const groups = [
    { label: 'White', values: ['K', 'Q', 'R', 'B', 'N', 'P'] },
    { label: 'Black', values: ['k', 'q', 'r', 'b', 'n', 'p'] },
  ];
  palette.innerHTML = `
    <button type="button" class="km-palette-piece erase${imageState.selectedPiece == null ? ' active' : ''}" data-piece="" aria-label="Erase square"><span>×</span><small>Erase</small></button>
    ${groups.map((group) => group.values.map((piece) => `
      <button type="button" class="km-palette-piece${imageState.selectedPiece === piece ? ' active' : ''}" data-piece="${piece}" aria-label="Place ${group.label.toLowerCase()} ${piece}">
        <span class="${piece === piece.toUpperCase() ? 'white' : 'black'}">${PIECES[piece]}</span>
      </button>`).join('')).join('')}`;
  $$('[data-piece]', palette).forEach((button) => button.addEventListener('click', () => {
    imageState.selectedPiece = button.dataset.piece || null;
    renderImagePalette();
  }));
}

function syncImageControls() {
  const turn = $('#kmImageTurn');
  if (turn) turn.value = imageState.turn;
  for (const right of ['K', 'Q', 'k', 'q']) {
    const checkbox = $(`#kmCastle${right === 'K' ? 'WK' : right === 'Q' ? 'WQ' : right === 'k' ? 'BK' : 'BQ'}`);
    if (checkbox) checkbox.checked = imageState.castling.has(right);
  }
  const ep = $('#kmImageEnPassant');
  if (ep) ep.value = imageState.enPassant === '-' ? '' : imageState.enPassant;
}

function renderImageEditor() {
  const board = $('#kmImageBoard');
  renderImportBoard(board, boardToPlacement(imageState.board), {
    orientation: imageState.orientation,
    editable: true,
    confidenceBySquare: imageState.confidenceBySquare,
    onSquare(square) {
      pushImageHistory();
      const { row, col } = squareToIndexes(square);
      imageState.board[row][col] = imageState.selectedPiece;
      imageState.confidenceBySquare = null;
      renderImageEditor();
    },
    onErase(square) {
      pushImageHistory();
      const { row, col } = squareToIndexes(square);
      imageState.board[row][col] = null;
      imageState.confidenceBySquare = null;
      renderImageEditor();
    },
  });
  renderImagePalette();
  const fen = buildFen();
  setText('#kmImageFen', fen);
  const validation = validateFen(fen);
  const error = $('#kmImageError');
  const start = $('#kmStartImagePosition');
  const undo = $('#kmImageUndo');
  if (error) {
    error.textContent = validation.ok ? '' : validation.message;
    error.dataset.state = validation.ok ? 'ok' : 'error';
  }
  if (start) start.disabled = !validation.ok;
  if (undo) undo.disabled = !imageState.history.length;
}

function setImagePositionPreset(fen) {
  const placement = String(fen).split(/\s+/)[0];
  pushImageHistory();
  imageState.board = placementToBoard(placement);
  imageState.confidenceBySquare = null;
  renderImageEditor();
}

function bindImageImporter(panel) {
  const fileInput = $('#kmImageFile', panel);
  const choose = $('#kmChooseImage', panel);
  const dropzone = $('#kmImageDropzone', panel);
  choose?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) loadImageFile(file);
  });
  dropzone?.addEventListener('click', (event) => {
    if (!event.target.closest('button')) fileInput?.click();
  });
  dropzone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click();
    }
  });
  for (const type of ['dragenter', 'dragover']) {
    dropzone?.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add('dragging');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    dropzone?.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove('dragging');
    });
  }
  dropzone?.addEventListener('drop', (event) => {
    const file = [...(event.dataTransfer?.files || [])].find((candidate) => candidate.type.startsWith('image/'));
    if (file) loadImageFile(file);
  });
  $('#kmImageRescan', panel)?.addEventListener('click', scanLoadedImage);
  $('#kmImageFlip', panel)?.addEventListener('click', () => {
    imageState.orientation = imageState.orientation === 'w' ? 'b' : 'w';
    renderImageEditor();
  });
  $('#kmImageClear', panel)?.addEventListener('click', () => setImagePositionPreset(`${EMPTY_PLACEMENT} w - - 0 1`));
  $('#kmImageStartPreset', panel)?.addEventListener('click', () => setImagePositionPreset(START_FEN));
  $('#kmImageUndo', panel)?.addEventListener('click', () => restoreImageSnapshot(imageState.history.pop()));
  $('#kmImageTurn', panel)?.addEventListener('change', (event) => {
    imageState.turn = event.target.value === 'b' ? 'b' : 'w';
    renderImageEditor();
  });
  const castleMap = { kmCastleWK: 'K', kmCastleWQ: 'Q', kmCastleBK: 'k', kmCastleBQ: 'q' };
  for (const [id, right] of Object.entries(castleMap)) {
    $(`#${id}`, panel)?.addEventListener('change', (event) => {
      if (event.target.checked) imageState.castling.add(right);
      else imageState.castling.delete(right);
      renderImageEditor();
    });
  }
  $('#kmImageEnPassant', panel)?.addEventListener('input', (event) => {
    imageState.enPassant = event.target.value.trim().toLowerCase() || '-';
    renderImageEditor();
  });
  $('#kmCancelImageImport', panel)?.addEventListener('click', () => $('#positionImportDialog')?.close?.());
  $('#kmStartImagePosition', panel)?.addEventListener('click', () => {
    const error = $('#kmImageError', panel);
    const title = $('#kmImageTitle', panel)?.value?.trim() || imageState.title || 'Position from image';
    submitFenToKmate(buildFen(), title, error);
  });
  renderImageEditor();
}

function parsePgnHeader(pgn, name) {
  const pattern = new RegExp(`^\\[${name}\\s+"([^"]*)"\\]`, 'mi');
  return String(pgn || '').match(pattern)?.[1] || '';
}

function moveNumberLabel(frame) {
  if (!frame?.move) return 'Starting position';
  const number = Math.ceil(frame.ply / 2);
  return `${number}${frame.move.color === 'w' ? '.' : '…'} ${frame.move.san}`;
}

function parseChessComGame(game, username) {
  const Chess = window.__KM_BOOT__?.Chess;
  if (!Chess) throw new Error('The chess engine is not ready.');
  const parser = new Chess();
  parser.loadPgn(game.pgn, { strict: false });
  const moves = parser.history({ verbose: true });
  const headerFen = parsePgnHeader(game.pgn, 'FEN');
  const replay = new Chess(headerFen || START_FEN);
  const frames = [{
    index: 0,
    ply: 0,
    fen: replay.fen(),
    move: null,
    label: 'Starting position',
  }];
  moves.forEach((move, index) => {
    const applied = replay.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    if (!applied) throw new Error(`Could not reconstruct move ${index + 1}.`);
    frames.push({
      index: index + 1,
      ply: index + 1,
      fen: replay.fen(),
      move: {
        san: applied.san,
        from: applied.from,
        to: applied.to,
        color: applied.color,
        captured: applied.captured || null,
      },
      label: `${Math.ceil((index + 1) / 2)}${applied.color === 'w' ? '.' : '…'} ${applied.san}`,
    });
  });
  const normalized = username.toLowerCase();
  const whiteName = String(game.white?.username || parsePgnHeader(game.pgn, 'White')).toLowerCase();
  const blackName = String(game.black?.username || parsePgnHeader(game.pgn, 'Black')).toLowerCase();
  const userColor = blackName === normalized && whiteName !== normalized ? 'b' : 'w';
  const decisionIndexes = [];
  for (let moveIndex = 0; moveIndex < moves.length; moveIndex += 1) {
    if (moves[moveIndex].color === userColor) decisionIndexes.push(moveIndex);
  }
  return { frames, userColor, decisionIndexes };
}

function playerResultLabel(game, username) {
  const normalized = username.toLowerCase();
  const player = String(game.white?.username || '').toLowerCase() === normalized ? game.white : game.black;
  const result = String(player?.result || '').toLowerCase();
  if (result === 'win') return { label: 'Win', key: 'win' };
  if (DRAW_RESULTS.has(result)) return { label: 'Draw', key: 'draw' };
  return { label: 'Loss', key: 'loss' };
}

function chessGameMeta(game, username) {
  const normalized = username.toLowerCase();
  const asWhite = String(game.white?.username || '').toLowerCase() === normalized;
  const player = asWhite ? game.white : game.black;
  const opponent = asWhite ? game.black : game.white;
  const result = playerResultLabel(game, username);
  const date = Number(game.end_time)
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(game.end_time * 1000))
    : 'Completed game';
  return {
    asWhite,
    player,
    opponent,
    result,
    date,
    time: String(game.time_class || game.time_control || 'game').replace(/^./, (char) => char.toUpperCase()),
  };
}

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) throw new Error('Chess.com could not find that public username.');
  if (response.status === 429) throw new Error('Chess.com is rate-limiting requests. Wait a moment and try again.');
  if (!response.ok) throw new Error(`Chess.com returned ${response.status}.`);
  return response.json();
}

function setChessStatus(message, state = 'idle') {
  const status = $('#kmChessStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function renderChessGameList() {
  const list = $('#kmChessGameList');
  if (!list) return;
  if (!chessState.games.length) {
    list.innerHTML = '<div class="km-empty-state">No completed standard games were found in the recent archives.</div>';
    return;
  }
  list.innerHTML = chessState.games.map((game, index) => {
    const meta = chessGameMeta(game, chessState.username);
    return `
      <button type="button" class="km-chess-game${chessState.selectedGame === game ? ' active' : ''}" data-game-index="${index}">
        <span class="km-game-result ${meta.result.key}">${meta.result.label}</span>
        <span class="km-game-players"><b>${escapeHtml(meta.asWhite ? 'White' : 'Black')} vs ${escapeHtml(meta.opponent?.username || 'Opponent')}</b><small>${escapeHtml(meta.date)} · ${escapeHtml(meta.time)} · ${escapeHtml(game.time_control || '')}</small></span>
        <span class="km-game-rating"><b>${escapeHtml(meta.player?.rating || '—')}</b><small>your rating</small></span>
      </button>`;
  }).join('');
  $$('[data-game-index]', list).forEach((button) => button.addEventListener('click', () => {
    selectChessGame(Number(button.dataset.gameIndex));
  }));
}

function selectedChessFrame() {
  return chessState.frames[chessState.index] || null;
}

function renderChessPreview() {
  const preview = $('#kmChessPreview');
  const board = $('#kmChessBoard');
  const slider = $('#kmChessMoveSlider');
  const label = $('#kmChessMoveLabel');
  const counter = $('#kmChessMoveCounter');
  const start = $('#kmStartChessPosition');
  const original = $('#kmChessOriginal');
  if (!preview || !chessState.selectedGame || !chessState.frames.length) {
    preview?.setAttribute('hidden', '');
    return;
  }
  preview.removeAttribute('hidden');
  const frame = selectedChessFrame();
  renderImportBoard(board, frame?.fen, { orientation: chessState.orientation });
  if (slider) {
    slider.max = String(Math.max(0, chessState.frames.length - 1));
    slider.value = String(chessState.index);
  }
  if (label) label.textContent = moveNumberLabel(frame);
  if (counter) counter.textContent = `${chessState.index} / ${Math.max(0, chessState.frames.length - 1)} plies`;
  const validation = frame ? validateFen(frame.fen) : { ok: false, message: 'No position selected.' };
  if (start) {
    start.disabled = !validation.ok;
    start.title = validation.ok ? 'Practice from the selected position' : validation.message;
  }
  const previous = $('#kmChessPrevious');
  const next = $('#kmChessNext');
  if (previous) previous.disabled = chessState.index <= 0;
  if (next) next.disabled = chessState.index >= chessState.frames.length - 1;
  const game = chessState.selectedGame;
  const meta = chessGameMeta(game, chessState.username);
  setText('#kmChessSelectedTitle', `${chessState.username} vs ${meta.opponent?.username || 'Opponent'}`);
  setText('#kmChessSelectedMeta', `${meta.date} · ${meta.result.label} · ${meta.time} · ${chessState.userColor === 'w' ? 'You played White' : 'You played Black'}`);
  if (original) {
    original.href = game.url || '#';
    original.hidden = !game.url;
  }
  const error = $('#kmChessError');
  if (error) error.textContent = validation.ok ? '' : validation.message;
}

function setChessFrameIndex(index) {
  chessState.index = Math.max(0, Math.min(chessState.frames.length - 1, Number(index) || 0));
  renderChessPreview();
}

function jumpToNextUserDecision() {
  if (!chessState.decisionIndexes.length) return;
  const next = chessState.decisionIndexes.find((index) => index > chessState.index);
  setChessFrameIndex(next ?? chessState.decisionIndexes[0]);
}

function selectChessGame(index) {
  const game = chessState.games[index];
  if (!game) return;
  try {
    const parsed = parseChessComGame(game, chessState.username);
    chessState.selectedGame = game;
    chessState.frames = parsed.frames;
    chessState.userColor = parsed.userColor;
    chessState.orientation = parsed.userColor;
    chessState.decisionIndexes = parsed.decisionIndexes;
    chessState.index = parsed.decisionIndexes.at(-1) ?? Math.max(0, parsed.frames.length - 2);
    renderChessGameList();
    renderChessPreview();
  } catch (error) {
    console.warn('Could not parse Chess.com PGN.', error);
    setChessStatus('This game’s PGN could not be reconstructed. Choose another game or paste the PGN manually.', 'error');
  }
}

async function loadChessComGames() {
  const input = $('#kmChessUsername');
  const button = $('#kmLoadChessGames');
  const username = normalizeUsername(input?.value);
  if (!isValidChessComUsername(username)) {
    setChessStatus('Enter a valid Chess.com username using letters, numbers, underscores, or hyphens.', 'error');
    return;
  }
  chessRequestController?.abort();
  chessRequestController = new AbortController();
  const { signal } = chessRequestController;
  if (button) button.disabled = true;
  chessState.username = username;
  chessState.games = [];
  chessState.selectedGame = null;
  chessState.frames = [];
  renderChessGameList();
  renderChessPreview();
  try {
    localStorage.setItem('kmate-chesscom-username', username);
    setChessStatus(`Finding ${username}’s completed-game archives…`, 'loading');
    const archiveData = await fetchJson(`${CHESS_COM_API}/${encodeURIComponent(username.toLowerCase())}/games/archives`, signal);
    const archives = Array.isArray(archiveData.archives) ? [...archiveData.archives].reverse() : [];
    if (!archives.length) throw new Error('No public completed-game archives were found for that username.');
    const games = [];
    let monthsRead = 0;
    for (const archiveUrl of archives) {
      if (signal.aborted) return;
      if (monthsRead >= 8 || games.length >= 60) break;
      monthsRead += 1;
      setChessStatus(`Loading recent completed games · month ${monthsRead}…`, 'loading');
      const month = await fetchJson(archiveUrl, signal);
      const monthGames = Array.isArray(month.games) ? month.games : [];
      games.push(...monthGames.filter((game) => game?.pgn && game?.end_time && (!game.rules || game.rules === 'chess')));
    }
    chessState.games = games
      .sort((first, second) => Number(second.end_time || 0) - Number(first.end_time || 0))
      .slice(0, 50);
    renderChessGameList();
    if (!chessState.games.length) {
      setChessStatus('No completed standard-chess games were found in the recent archives.', 'warning');
      return;
    }
    setChessStatus(`${chessState.games.length} recent completed games loaded. Choose one, then select any position in it.`, 'success');
    selectChessGame(0);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.warn('Chess.com import failed.', error);
    setChessStatus(`${String(error?.message || 'Chess.com import failed')} You can still paste a downloaded PGN in the FEN / PGN tab.`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function bindChessImporter(panel) {
  const username = $('#kmChessUsername', panel);
  try {
    username.value = localStorage.getItem('kmate-chesscom-username') || '';
  } catch {}
  $('#kmLoadChessGames', panel)?.addEventListener('click', loadChessComGames);
  username?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadChessComGames();
    }
  });
  $('#kmChessMoveSlider', panel)?.addEventListener('input', (event) => setChessFrameIndex(event.target.value));
  $('#kmChessPrevious', panel)?.addEventListener('click', () => setChessFrameIndex(chessState.index - 1));
  $('#kmChessNext', panel)?.addEventListener('click', () => setChessFrameIndex(chessState.index + 1));
  $('#kmChessDecision', panel)?.addEventListener('click', jumpToNextUserDecision);
  $('#kmChessFlip', panel)?.addEventListener('click', () => {
    chessState.orientation = chessState.orientation === 'w' ? 'b' : 'w';
    renderChessPreview();
  });
  $('#kmCancelChessImport', panel)?.addEventListener('click', () => $('#positionImportDialog')?.close?.());
  $('#kmStartChessPosition', panel)?.addEventListener('click', () => {
    const frame = selectedChessFrame();
    const error = $('#kmChessError', panel);
    if (!frame || !chessState.selectedGame) {
      if (error) error.textContent = 'Choose a completed game and position first.';
      return;
    }
    const meta = chessGameMeta(chessState.selectedGame, chessState.username);
    const title = `Chess.com · ${chessState.username} vs ${meta.opponent?.username || 'Opponent'} · ${moveNumberLabel(frame)}`;
    submitFenToKmate(frame.fen, title, error);
  });
}

function importerMarkup() {
  return {
    image: `
      <section class="km-import-panel" id="kmImportImagePanel" data-panel="image" hidden>
        <div class="km-import-panel-intro">
          <div><h3>Scan a board from a picture</h3><p>Best for Chess.com or Lichess screenshots, book diagrams, and straight-on 2D boards. Recognition runs locally in your browser.</p></div>
          <span class="km-local-badge">On-device beta</span>
        </div>
        <div class="km-image-dropzone" id="kmImageDropzone" tabindex="0" role="button" aria-label="Upload, paste, or drop a chessboard image">
          <input id="kmImageFile" type="file" accept="image/*" hidden>
          <div class="km-drop-icon">▧</div>
          <div><b>Upload, paste, or drop a picture</b><small>PNG, JPEG, WebP, screenshot, or photo of a book diagram</small></div>
          <button type="button" class="btn" id="kmChooseImage">Choose image</button>
        </div>
        <div class="km-image-workspace" id="kmImageWorkspace">
          <article class="km-source-card">
            <div class="km-source-head"><div><small>Source picture</small><b>Detected board area</b></div><button type="button" class="km-mini-button" id="kmImageRescan">Rescan</button></div>
            <div class="km-image-preview-wrap">
              <div class="km-image-empty" id="kmImageEmpty"><span>Paste or choose a board image to begin.</span></div>
              <img id="kmImagePreview" alt="Uploaded chessboard source" hidden>
              <div class="km-detected-board-overlay" id="kmDetectedBoardOverlay" hidden><span>BOARD</span></div>
            </div>
            <p class="km-import-status" id="kmImageScanStatus" data-state="idle">The editor remains available even when automatic recognition cannot read a picture.</p>
          </article>
          <article class="km-editor-card">
            <div class="km-editor-head">
              <div><small>Verify and correct</small><b>Editable position</b></div>
              <div class="km-inline-actions">
                <button type="button" class="km-mini-button" id="kmImageUndo">Undo</button>
                <button type="button" class="km-mini-button" id="kmImageFlip">Flip view</button>
                <button type="button" class="km-mini-button" id="kmImageClear">Clear</button>
                <button type="button" class="km-mini-button" id="kmImageStartPreset">Starting board</button>
              </div>
            </div>
            <div class="km-import-board editor" id="kmImageBoard" aria-label="Editable recognized chess position"></div>
            <div class="km-piece-palette" id="kmPiecePalette" aria-label="Piece palette"></div>
            <div class="km-position-options">
              <label><span>Side to move</span><select id="kmImageTurn" class="select"><option value="w">White</option><option value="b">Black</option></select></label>
              <fieldset><legend>Castling rights</legend><label><input id="kmCastleWK" type="checkbox"> White O-O</label><label><input id="kmCastleWQ" type="checkbox"> White O-O-O</label><label><input id="kmCastleBK" type="checkbox"> Black O-O</label><label><input id="kmCastleBQ" type="checkbox"> Black O-O-O</label></fieldset>
              <label class="km-en-passant"><span>En passant <small>optional</small></span><input id="kmImageEnPassant" class="select" inputmode="text" maxlength="2" placeholder="e.g. e3"></label>
            </div>
            <label class="km-title-field"><span>Training title</span><input class="select" id="kmImageTitle" placeholder="Position from image"></label>
            <div class="km-fen-readout"><span>Generated FEN</span><code id="kmImageFen"></code></div>
            <div class="km-import-error" id="kmImageError"></div>
            <div class="dialogactions km-import-actions">
              <button class="btn" type="button" id="kmCancelImageImport">Cancel</button>
              <button class="btn primary" type="button" id="kmStartImagePosition">Practice this position</button>
            </div>
          </article>
        </div>
      </section>`,
    chess: `
      <section class="km-import-panel" id="kmImportChessPanel" data-panel="chess" hidden>
        <div class="km-import-panel-intro">
          <div><h3>Import a completed Chess.com game</h3><p>Enter any public username, choose a finished standard game, and practice from any position in its PGN.</p></div>
          <span class="km-local-badge">Post-game only</span>
        </div>
        <div class="km-chess-connect">
          <label for="kmChessUsername"><span>Chess.com username</span><input id="kmChessUsername" class="select" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="e.g. Kmate_00"></label>
          <button type="button" class="btn primary" id="kmLoadChessGames">Load recent games</button>
        </div>
        <p class="km-import-status" id="kmChessStatus" data-state="idle">K-Mate reads completed games from Chess.com’s public, read-only archive. It never accesses live games or account credentials.</p>
        <div class="km-chess-workspace">
          <div class="km-chess-game-list" id="kmChessGameList"><div class="km-empty-state">Enter a username to load recent completed games.</div></div>
          <article class="km-chess-preview" id="kmChessPreview" hidden>
            <div class="km-selected-game-head">
              <div><b id="kmChessSelectedTitle">Selected game</b><small id="kmChessSelectedMeta"></small></div>
              <div class="km-inline-actions"><a class="km-mini-button" id="kmChessOriginal" target="_blank" rel="noopener" hidden>Original</a><button type="button" class="km-mini-button" id="kmChessFlip">Flip view</button></div>
            </div>
            <div class="km-import-board" id="kmChessBoard" aria-label="Selected Chess.com game position"></div>
            <div class="km-move-readout"><b id="kmChessMoveLabel">Starting position</b><span id="kmChessMoveCounter">0 / 0 plies</span></div>
            <input class="km-move-slider" id="kmChessMoveSlider" type="range" min="0" max="0" step="1" value="0" aria-label="Choose a position from the game">
            <div class="km-chess-nav">
              <button type="button" id="kmChessPrevious" aria-label="Previous move">◀</button>
              <button type="button" class="km-decision-button" id="kmChessDecision">My next decision</button>
              <button type="button" id="kmChessNext" aria-label="Next move">▶</button>
            </div>
            <div class="km-import-error" id="kmChessError"></div>
            <div class="dialogactions km-import-actions">
              <button class="btn" type="button" id="kmCancelChessImport">Cancel</button>
              <button class="btn primary" type="button" id="kmStartChessPosition">Practice from here</button>
            </div>
          </article>
        </div>
      </section>`,
  };
}

function activateTab(name) {
  const dialog = $('#positionImportDialog');
  if (!dialog) return;
  $$('[data-import-tab]', dialog).forEach((button) => {
    const active = button.dataset.importTab === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('[data-panel]', dialog).forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
  try { localStorage.setItem('kmate-import-source', name); } catch {}
  if (name === 'image') renderImageEditor();
}

function handleClipboardImage(event) {
  const dialog = $('#positionImportDialog');
  const imagePanel = $('#kmImportImagePanel');
  if (!dialog?.open || imagePanel?.hidden) return;
  const file = [...(event.clipboardData?.items || [])]
    .find((item) => item.type.startsWith('image/'))
    ?.getAsFile?.();
  if (!file) return;
  event.preventDefault();
  loadImageFile(file);
}

function enhanceAboutDialog() {
  const card = $('#aboutBetaDialog .modal-card');
  const close = $('#aboutBetaDialog [data-close="aboutBetaDialog"]');
  if (!card || $('#kmImportLicenseNote', card)) return;
  const note = document.createElement('p');
  note.id = 'kmImportLicenseNote';
  note.innerHTML = '<b>Position import:</b> completed-game data comes from the public read-only Chess.com PubAPI. On-device screenshot recognition uses the MIT-licensed fenshot model with ONNX Runtime Web; images are not uploaded by K-Mate.';
  close?.insertAdjacentElement('beforebegin', note);
  const working = $('.beta-status-grid div:first-child span', card);
  if (working && !working.textContent.includes('Chess.com')) {
    working.textContent = `${working.textContent.replace(/\.$/, '')}, completed Chess.com-game import, and on-device screenshot-to-position import.`;
  }
}

function upgradeImportDialog() {
  const dialog = $('#positionImportDialog');
  const card = dialog?.querySelector('.modal-card');
  if (!dialog || !card || card.dataset.positionImportersUpgraded) return false;
  card.dataset.positionImportersUpgraded = IMPORTER_VERSION;
  dialog.classList.add('position-importer-modal-v1');
  card.classList.add('position-importer-shell');

  const eyebrow = card.querySelector('.eyebrow');
  const heading = card.querySelector('h2');
  const intro = card.querySelector(':scope > p');
  const title = $('#positionImportTitle', card);
  const textarea = $('#positionImportText', card);
  const error = $('#positionImportError', card);
  const actions = card.querySelector('.dialogactions');
  if (!title || !textarea || !error || !actions) return false;

  if (eyebrow) eyebrow.textContent = 'Practice from any position';
  if (heading) heading.textContent = 'Import a position';
  if (intro) intro.textContent = 'Choose a FEN or PGN, scan a board picture, or browse a completed Chess.com game.';

  const tabs = document.createElement('div');
  tabs.className = 'km-import-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.innerHTML = `
    <button type="button" role="tab" class="active" data-import-tab="manual" aria-selected="true"><span>⌨</span><b>FEN / PGN</b><small>Paste notation</small></button>
    <button type="button" role="tab" data-import-tab="image" aria-selected="false"><span>▧</span><b>Picture</b><small>Scan and correct</small></button>
    <button type="button" role="tab" data-import-tab="chess" aria-selected="false"><span>♟</span><b>Chess.com</b><small>Completed games</small></button>`;

  const panelHost = document.createElement('div');
  panelHost.className = 'km-import-panel-host';
  const manualPanel = document.createElement('section');
  manualPanel.id = 'kmImportManualPanel';
  manualPanel.className = 'km-import-panel km-manual-panel';
  manualPanel.dataset.panel = 'manual';
  const manualIntro = document.createElement('div');
  manualIntro.className = 'km-import-panel-intro compact';
  manualIntro.innerHTML = '<div><h3>Paste a FEN or PGN</h3><p>A FEN starts from that exact board. A PGN starts from its final non-terminal position.</p></div>';
  manualPanel.append(manualIntro, title, textarea, error, actions);
  const markup = importerMarkup();
  panelHost.append(manualPanel);
  panelHost.insertAdjacentHTML('beforeend', markup.image);
  panelHost.insertAdjacentHTML('beforeend', markup.chess);
  intro?.insertAdjacentElement('afterend', tabs);
  tabs.insertAdjacentElement('afterend', panelHost);

  $$('[data-import-tab]', tabs).forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.importTab)));
  bindImageImporter($('#kmImportImagePanel'));
  bindChessImporter($('#kmImportChessPanel'));
  document.addEventListener('paste', handleClipboardImage);

  let initial = 'manual';
  try {
    const stored = localStorage.getItem('kmate-import-source');
    if (['manual', 'image', 'chess'].includes(stored)) initial = stored;
  } catch {}
  activateTab(initial);

  const openButton = $('#openPositionImport');
  if (openButton) {
    const label = openButton.querySelector('b');
    const sub = openButton.querySelector('small');
    if (label) label.textContent = 'Import a position';
    if (sub) sub.textContent = 'FEN, PGN, picture, or Chess.com';
  }
  enhanceAboutDialog();
  window.__KMATE_POSITION_IMPORTERS__ = {
    version: IMPORTER_VERSION,
    open: (source = 'manual') => {
      activateTab(['manual', 'image', 'chess'].includes(source) ? source : 'manual');
      if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
      else dialog.setAttribute('open', '');
    },
    state: () => ({
      imageReady: Boolean(imageState.image),
      imageFen: buildFen(),
      chessUsername: chessState.username,
      chessGames: chessState.games.length,
      chessPosition: selectedChessFrame()?.fen || null,
    }),
  };
  return true;
}

function initializePositionImporters(attempt = 0) {
  loadStyles();
  if (upgradeImportDialog()) return;
  if (attempt < 40) window.setTimeout(() => initializePositionImporters(attempt + 1), 100);
  else console.warn('K-Mate position importers could not find the original import dialog.');
}

initializePositionImporters();
