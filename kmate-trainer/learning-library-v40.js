const KMATE_LIBRARY_VERSION = '40.1.0';
const KMATE_LIBRARY_BASE = new URL('./', import.meta.url);
const KMATE_LIBRARY_VIDEO_URL = new URL(`./learning/videos-v40.json?v=${KMATE_LIBRARY_VERSION}`, KMATE_LIBRARY_BASE).href;
const KMATE_LIBRARY_PUZZLE_INDEX_URL = new URL(`./learning/puzzles/index.json?v=${KMATE_LIBRARY_VERSION}`, KMATE_LIBRARY_BASE).href;
const KMATE_LIBRARY_PROGRESS_KEY = 'kmate-learning-v40';

const KMATE_LIBRARY_ORDER = [
  'calculation',
  'loosePieces',
  'kingSafety',
  'defense',
  'positionalPlay',
  'pawnPlay',
  'endgames',
  'openings',
];

let kmateLibraryVideosPromise = null;
let kmateLibraryIndexPromise = null;
let kmateLibraryObserver = null;

function kmateLibrary$(selector, root = document) {
  return root.querySelector(selector);
}

function kmateLibrary$$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function kmateLibraryEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function kmateLibraryFetchJson(url, label) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`${label} could not load (${response.status}).`);
  return response.json();
}

function kmateLibraryVideos() {
  if (!kmateLibraryVideosPromise) {
    kmateLibraryVideosPromise = kmateLibraryFetchJson(KMATE_LIBRARY_VIDEO_URL, 'The instructional-video catalog');
  }
  return kmateLibraryVideosPromise;
}

function kmateLibraryPuzzleIndex() {
  if (!kmateLibraryIndexPromise) {
    kmateLibraryIndexPromise = kmateLibraryFetchJson(KMATE_LIBRARY_PUZZLE_INDEX_URL, 'The puzzle library');
  }
  return kmateLibraryIndexPromise;
}

function kmateLibraryTaxonomy() {
  return window.__KMATE_LEARNING_CORE__?.taxonomy || {};
}

function kmateLibraryFocusDefinition(key) {
  return kmateLibraryTaxonomy()[key] || {
    key,
    label: key,
    icon: '♟',
    description: 'Focused chess training.',
  };
}

function kmateLibraryInstallStyles() {
  if (kmateLibrary$('#kmateLearningLibraryStyles')) return;
  const style = document.createElement('style');
  style.id = 'kmateLearningLibraryStyles';
  style.textContent = `
    .learning-open-library{padding:clamp(18px,3vw,28px);background:radial-gradient(circle at 96% 0,#f4cc7018,transparent 24rem),linear-gradient(145deg,#17231a,#101812)}
    .learning-library-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px}
    .learning-library-head h2{margin:5px 0 7px;font-size:clamp(25px,3.5vw,36px);letter-spacing:-.035em}
    .learning-library-head p{max-width:760px;margin:0;color:var(--muted)}
    .learning-library-head-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
    .learning-library-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}
    .learning-library-category{display:flex;min-width:0;min-height:210px;flex-direction:column;padding:15px;border:1px solid #ffffff12;border-radius:17px;background:#ffffff05}
    .learning-library-category.recommended{border-color:#80d8a459;background:linear-gradient(145deg,#80d8a40e,#ffffff04)}
    .learning-library-category-icon{display:grid;place-items:center;width:42px;height:42px;border:1px solid #80d8a43c;border-radius:13px;background:#80d8a40c;color:#c9f7dc;font-size:21px}
    .learning-library-category h3{margin:11px 0 5px;font-size:17px;line-height:1.15}
    .learning-library-category p{margin:0;color:var(--muted);font-size:10px;line-height:1.45}
    .learning-library-counts{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}
    .learning-library-counts span{padding:4px 7px;border:1px solid #ffffff12;border-radius:99px;background:#ffffff06;color:#cbd8cf;font-size:8px;font-weight:850}
    .learning-library-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:auto;padding-top:13px}
    .learning-library-action{min-height:38px;padding:0 8px;border:1px solid var(--line);border-radius:10px;background:#202d23;color:var(--text);font-size:9px;font-weight:900;cursor:pointer}
    .learning-library-action.puzzles{border-color:#b9f47455;background:#b9f47412;color:var(--accent)}
    .learning-library-action:disabled{opacity:.45;cursor:not-allowed}
    .learning-library-dialog{width:min(1080px,calc(100% - 18px));max-width:none;max-height:94dvh;padding:0;overflow:hidden}
    .learning-library-dialog-shell{max-height:94dvh;overflow:auto;padding:20px;background:radial-gradient(circle at 0 0,#80d8a414,transparent 28rem),#0b120d}
    .learning-library-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
    .learning-library-dialog-head h2{margin:4px 0 5px;font-size:clamp(24px,3vw,34px)}
    .learning-library-dialog-head p{margin:0;color:var(--muted)}
    .learning-library-close{width:40px;height:40px;border:1px solid var(--line);border-radius:12px;background:#ffffff08;color:var(--text);font-size:18px;cursor:pointer}
    .learning-library-filterbar{display:flex;gap:6px;overflow:auto;margin:15px 0;padding-bottom:3px;scrollbar-width:thin}
    .learning-library-filter{flex:0 0 auto;min-height:36px;padding:0 10px;border:1px solid var(--line);border-radius:99px;background:#ffffff05;color:var(--muted);font-size:9px;font-weight:900;cursor:pointer}
    .learning-library-filter.active{border-color:#80d8a45b;background:#80d8a413;color:#c8f7da}
    .learning-library-video-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .learning-library-video{display:flex;min-width:0;flex-direction:column;padding:14px;border:1px solid #ffffff12;border-radius:16px;background:#ffffff05}
    .learning-library-video small{color:var(--accent);font-size:8px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    .learning-library-video h3{margin:7px 0 5px;font-size:16px;line-height:1.25}
    .learning-library-video p{margin:0;color:var(--muted);font-size:10px;line-height:1.4}
    .learning-library-video-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}
    .learning-library-video-tags span{padding:3px 6px;border-radius:99px;background:#ffffff08;color:#bfcac2;font-size:8px}
    .learning-library-video-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:13px}
    .learning-library-video-actions button,.learning-library-video-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 10px;border:1px solid var(--line);border-radius:10px;background:#202d23;color:var(--text);font-size:9px;font-weight:900;text-decoration:none;cursor:pointer}
    .learning-library-video-actions button{border-color:#b9f47455;background:#b9f47412;color:var(--accent)}
    .learning-library-player{width:min(980px,calc(100% - 18px));max-width:none}
    .learning-library-player-frame{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border:1px solid var(--line);border-radius:17px;background:#050805}
    .learning-library-player-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
    .learning-library-player-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:11px}
    .learning-library-player-footer p{margin:0;color:var(--muted);font-size:10px}
    .learning-library-player-footer a{color:var(--accent);font-weight:850}
    .learning-library-empty{padding:18px;border:1px dashed #ffffff22;border-radius:14px;color:var(--muted);text-align:center}
    #learningBrowseLibrary{border-color:#f4cc7055;background:#f4cc7010;color:#ffe29a}
    #learningResultLibrary{border-color:#f4cc7045;background:#f4cc700b;color:#ffe29a}
    @media(max-width:980px){.learning-library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.learning-library-video-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:620px){
      .learning-library-head{align-items:flex-start;flex-direction:column}
      .learning-library-head-actions{width:100%}.learning-library-head-actions .btn{flex:1}
      .learning-library-grid,.learning-library-video-grid{grid-template-columns:1fr}
      .learning-library-category{min-height:0}
      .learning-library-dialog,.learning-library-player{inset:0;width:100vw;height:100dvh;max-height:100dvh;margin:0;border-radius:0}
      .learning-library-dialog-shell{height:100dvh;max-height:100dvh;padding:11px}
      .learning-library-dialog-head{position:sticky;top:-11px;z-index:5;padding:10px 0;background:#0b120dea;backdrop-filter:blur(14px)}
      .learning-library-player-footer{align-items:flex-start;flex-direction:column}
    }
  `;
  document.head.append(style);
}

function kmateLibraryUpdateProgress(video) {
  try {
    const progress = JSON.parse(localStorage.getItem(KMATE_LIBRARY_PROGRESS_KEY) || '{}');
    progress.version = 40;
    progress.seen = Array.isArray(progress.seen) ? progress.seen : [];
    progress.puzzles = progress.puzzles && typeof progress.puzzles === 'object' ? progress.puzzles : {};
    progress.videos = progress.videos && typeof progress.videos === 'object' ? progress.videos : {};
    progress.workouts = Array.isArray(progress.workouts) ? progress.workouts : [];
    const prior = progress.videos[video.id] || { opens: 0 };
    progress.videos[video.id] = {
      ...prior,
      opens: Number(prior.opens || 0) + 1,
      title: video.title,
      lastAt: new Date().toISOString(),
    };
    localStorage.setItem(KMATE_LIBRARY_PROGRESS_KEY, JSON.stringify(progress));
  } catch {}
}

function kmateLibraryEnsurePlayer() {
  let dialog = kmateLibrary$('#learningLibraryPlayer');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'learningLibraryPlayer';
  dialog.className = 'modal learning-library-player';
  dialog.innerHTML = `
    <div class="learning-modal-shell">
      <header class="learning-library-dialog-head">
        <div><div class="eyebrow">Instructional video</div><h2 id="learningLibraryPlayerTitle">Chess lesson</h2><p id="learningLibraryPlayerCreator">Creator-hosted external lesson</p></div>
        <button class="learning-library-close" id="learningLibraryPlayerClose" type="button" aria-label="Close video">×</button>
      </header>
      <div class="learning-library-player-frame"><iframe id="learningLibraryPlayerFrame" title="K-Mate instructional chess video" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      <div class="learning-library-player-footer"><p>The creator retains the video rights. K-Mate does not download or rehost it.</p><a id="learningLibraryPlayerSource" target="_blank" rel="noopener noreferrer">Open the Lichess library page</a></div>
    </div>`;
  document.body.append(dialog);
  const close = () => {
    kmateLibrary$('#learningLibraryPlayerFrame', dialog)?.removeAttribute('src');
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };
  kmateLibrary$('#learningLibraryPlayerClose', dialog)?.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => kmateLibrary$('#learningLibraryPlayerFrame', dialog)?.removeAttribute('src'));
  return dialog;
}

function kmateLibraryPlayVideo(video) {
  if (!video) return;
  const dialog = kmateLibraryEnsurePlayer();
  kmateLibrary$('#learningLibraryPlayerTitle', dialog).textContent = video.title || 'Chess lesson';
  kmateLibrary$('#learningLibraryPlayerCreator', dialog).textContent = `${video.creator || 'Chess educator'} · ${video.level || 'all levels'}`;
  kmateLibrary$('#learningLibraryPlayerSource', dialog).href = video.sourceUrl || `https://lichess.org/video/${video.id}`;
  kmateLibrary$('#learningLibraryPlayerFrame', dialog).src = `${video.embedUrl || `https://www.youtube-nocookie.com/embed/${video.id}`}?rel=0&modestbranding=1`;
  kmateLibraryUpdateProgress(video);
  if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
  else dialog.setAttribute('open', '');
}

function kmateLibraryEnsureVideoDialog() {
  let dialog = kmateLibrary$('#learningLibraryDialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'learningLibraryDialog';
  dialog.className = 'modal learning-library-dialog';
  dialog.innerHTML = `
    <div class="learning-library-dialog-shell">
      <header class="learning-library-dialog-head">
        <div><div class="eyebrow">Open learning library</div><h2>Instructional videos by category</h2><p>Browse the full curated lesson catalog at any time; no completed game is required.</p></div>
        <button class="learning-library-close" id="learningLibraryClose" type="button" aria-label="Close instructional video library">×</button>
      </header>
      <div class="learning-library-filterbar" id="learningLibraryFilters"></div>
      <div class="learning-library-video-grid" id="learningLibraryVideos"></div>
    </div>`;
  document.body.append(dialog);
  const close = () => {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };
  kmateLibrary$('#learningLibraryClose', dialog)?.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  return dialog;
}

function kmateLibraryVideoMarkup(video) {
  return `
    <article class="learning-library-video">
      <small>${kmateLibraryEscape(video.level || 'all levels')} · creator-hosted</small>
      <h3>${kmateLibraryEscape(video.title)}</h3>
      <p>${kmateLibraryEscape(video.creator || 'Chess educator')}</p>
      <div class="learning-library-video-tags">${(video.tags || []).slice(0, 4).map((tag) => `<span>${kmateLibraryEscape(tag)}</span>`).join('')}</div>
      <div class="learning-library-video-actions">
        <button type="button" data-library-play-video="${kmateLibraryEscape(video.id)}">Watch</button>
        <a href="${kmateLibraryEscape(video.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open on Lichess</a>
      </div>
    </article>`;
}

async function kmateLibraryOpenVideos(focusKey = 'all') {
  const dialog = kmateLibraryEnsureVideoDialog();
  const taxonomy = kmateLibraryTaxonomy();
  const filters = kmateLibrary$('#learningLibraryFilters', dialog);
  const grid = kmateLibrary$('#learningLibraryVideos', dialog);
  filters.innerHTML = [
    `<button class="learning-library-filter ${focusKey === 'all' ? 'active' : ''}" type="button" data-library-video-focus="all">All lessons</button>`,
    ...KMATE_LIBRARY_ORDER.filter((key) => taxonomy[key]).map((key) => `<button class="learning-library-filter ${focusKey === key ? 'active' : ''}" type="button" data-library-video-focus="${kmateLibraryEscape(key)}">${kmateLibraryEscape(taxonomy[key].label)}</button>`),
  ].join('');
  grid.innerHTML = '<div class="learning-library-empty">Loading instructional videos…</div>';
  if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
  else dialog.setAttribute('open', '');

  for (const button of kmateLibrary$$('[data-library-video-focus]', filters)) {
    button.addEventListener('click', () => kmateLibraryOpenVideos(button.dataset.libraryVideoFocus));
  }

  try {
    const catalog = await kmateLibraryVideos();
    const videos = (catalog.videos || []).filter((video) => focusKey === 'all' || (video.focus || []).includes(focusKey));
    grid.innerHTML = videos.length
      ? videos.map(kmateLibraryVideoMarkup).join('')
      : '<div class="learning-library-empty">No lesson has been assigned to this category yet. The matching puzzle library is still available.</div>';
    for (const button of kmateLibrary$$('[data-library-play-video]', grid)) {
      button.addEventListener('click', () => {
        const video = videos.find((item) => item.id === button.dataset.libraryPlayVideo);
        if (video) kmateLibraryPlayVideo(video);
      });
    }
  } catch (error) {
    console.warn('K-Mate instructional-video library could not load.', error);
    grid.innerHTML = `<div class="learning-library-empty">${kmateLibraryEscape(error?.message || 'The instructional-video catalog could not load.')}</div>`;
  }
}

function kmateLibrarySelectFocus(focusKey) {
  const existing = document.querySelector(`[data-learning-focus="${CSS.escape(focusKey)}"]`);
  if (existing) {
    existing.click();
    return true;
  }
  return false;
}

async function kmateLibraryStartPuzzles(focusKey) {
  window.__KMATE_LEARNING__?.open?.();
  kmateLibrarySelectFocus(focusKey);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (typeof window.__KMATE_LEARNING__?.startWorkout === 'function') {
    await window.__KMATE_LEARNING__.startWorkout();
    return true;
  }
  return false;
}

async function kmateLibraryCounts() {
  const [catalog, index] = await Promise.allSettled([kmateLibraryVideos(), kmateLibraryPuzzleIndex()]);
  const videos = catalog.status === 'fulfilled' ? catalog.value.videos || [] : [];
  const shards = index.status === 'fulfilled' ? index.value.shards || [] : [];
  return { videos, shards, total: index.status === 'fulfilled' ? Number(index.value.total || 0) : 0 };
}

async function kmateLibraryRenderCategories() {
  const grid = kmateLibrary$('#learningLibraryCategoryGrid');
  if (!grid) return;
  const taxonomy = kmateLibraryTaxonomy();
  const recommendation = window.__KMATE_LEARNING__?.recommendation?.();
  const recommendedKey = recommendation?.focus?.key || null;
  const { videos, shards } = await kmateLibraryCounts();
  grid.innerHTML = KMATE_LIBRARY_ORDER.filter((key) => taxonomy[key]).map((key) => {
    const focus = taxonomy[key];
    const puzzleCount = shards.filter((shard) => shard.focus === key).reduce((sum, shard) => sum + Number(shard.count || 0), 0);
    const videoCount = videos.filter((video) => (video.focus || []).includes(key)).length;
    return `
      <article class="learning-library-category ${key === recommendedKey ? 'recommended' : ''}" data-library-focus-card="${kmateLibraryEscape(key)}">
        <span class="learning-library-category-icon">${kmateLibraryEscape(focus.icon)}</span>
        <h3>${kmateLibraryEscape(focus.label)}</h3>
        <p>${kmateLibraryEscape(focus.description)}</p>
        <div class="learning-library-counts"><span>${puzzleCount.toLocaleString()} puzzles</span><span>${videoCount} video${videoCount === 1 ? '' : 's'}</span>${key === recommendedKey ? '<span>Recommended now</span>' : ''}</div>
        <div class="learning-library-actions">
          <button class="learning-library-action puzzles" type="button" data-library-puzzles="${kmateLibraryEscape(key)}" ${puzzleCount ? '' : 'disabled'}>Practice puzzles</button>
          <button class="learning-library-action" type="button" data-library-videos="${kmateLibraryEscape(key)}" ${videoCount ? '' : 'disabled'}>Browse videos</button>
        </div>
      </article>`;
  }).join('');

  for (const button of kmateLibrary$$('[data-library-puzzles]', grid)) {
    button.addEventListener('click', () => kmateLibraryStartPuzzles(button.dataset.libraryPuzzles));
  }
  for (const button of kmateLibrary$$('[data-library-videos]', grid)) {
    button.addEventListener('click', () => kmateLibraryOpenVideos(button.dataset.libraryVideos));
  }
}

function kmateLibraryEnsureSection() {
  const view = kmateLibrary$('#learningView');
  if (!view) return null;
  let section = kmateLibrary$('#learningOpenLibrary', view);
  if (section) return section;
  section = document.createElement('section');
  section.id = 'learningOpenLibrary';
  section.className = 'card learning-open-library';
  section.innerHTML = `
    <div class="learning-library-head">
      <div><div class="eyebrow">Open learning library</div><h2>Puzzles and videos by category</h2><p>Practice any topic whenever you choose, independently of the tailor-made recommendation from your latest game.</p></div>
      <div class="learning-library-head-actions"><button class="btn" id="learningBrowseAllVideos" type="button">Browse all videos</button></div>
    </div>
    <div class="learning-library-grid" id="learningLibraryCategoryGrid"><div class="learning-library-empty">Loading learning categories…</div></div>`;
  const license = kmateLibrary$('.learning-license', view);
  if (license) license.before(section);
  else view.append(section);
  kmateLibrary$('#learningBrowseAllVideos', section)?.addEventListener('click', () => kmateLibraryOpenVideos('all'));
  void kmateLibraryRenderCategories();
  return section;
}

function kmateLibraryEnhancePrimaryActions() {
  const heroActions = kmateLibrary$('.learning-hero-actions');
  if (heroActions && !kmateLibrary$('#learningBrowseLibrary', heroActions)) {
    const button = document.createElement('button');
    button.id = 'learningBrowseLibrary';
    button.className = 'btn';
    button.type = 'button';
    button.textContent = 'Browse puzzles & videos';
    button.addEventListener('click', () => {
      kmateLibraryEnsureSection()?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    heroActions.append(button);
  }

  const wizardButton = kmateLibrary$('#wizardLearningButton');
  if (wizardButton) {
    const label = wizardButton.querySelector('b');
    if (label) label.textContent = 'Puzzles & videos';
    wizardButton.setAttribute('aria-label', 'Open puzzles and instructional videos');
    wizardButton.title = 'Open puzzles and instructional videos';
  }

  const navButton = kmateLibrary$('#learningNavButton');
  if (navButton) {
    navButton.textContent = 'Learn';
    navButton.title = 'Puzzles, videos, and tailor-made training';
  }
}

function kmateLibraryEnhanceResultCard() {
  const card = kmateLibrary$('#learningResultCard');
  if (!card) return;
  card.setAttribute('aria-live', 'polite');
  const kicker = card.querySelector('.learning-result-head small');
  if (kicker) kicker.textContent = 'Tailored to this game · Your next 12 minutes';
  const actions = card.querySelector('.learning-result-actions');
  if (actions && !kmateLibrary$('#learningResultLibrary', actions)) {
    const button = document.createElement('button');
    button.id = 'learningResultLibrary';
    button.className = 'learning-mini-button';
    button.type = 'button';
    button.textContent = 'Browse full library';
    button.addEventListener('click', () => {
      kmateLibrary$('#resultDialog')?.close?.();
      window.__KMATE_LEARNING__?.open?.();
      requestAnimationFrame(() => kmateLibraryEnsureSection()?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
    actions.append(button);
  }
}

function kmateLibraryObserve() {
  if (kmateLibraryObserver) return;
  kmateLibraryObserver = new MutationObserver(() => {
    kmateLibraryEnsureSection();
    kmateLibraryEnhancePrimaryActions();
    kmateLibraryEnhanceResultCard();
  });
  kmateLibraryObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'hidden'] });
}

function kmateLibraryInitialize(attempt = 0) {
  if (!window.__KMATE_LEARNING__ || !window.__KMATE_LEARNING_CORE__ || !kmateLibrary$('#learningView')) {
    if (attempt < 160) window.setTimeout(() => kmateLibraryInitialize(attempt + 1), 100);
    else console.warn('K-Mate open learning library could not initialize.');
    return;
  }
  kmateLibraryInstallStyles();
  kmateLibraryEnsureSection();
  kmateLibraryEnhancePrimaryActions();
  kmateLibraryEnhanceResultCard();
  kmateLibraryEnsureVideoDialog();
  kmateLibraryEnsurePlayer();
  kmateLibraryObserve();
  void kmateLibraryRenderCategories();

  window.__KMATE_LEARNING_LIBRARY__ = {
    version: KMATE_LIBRARY_VERSION,
    open: () => {
      window.__KMATE_LEARNING__?.open?.();
      const section = kmateLibraryEnsureSection();
      requestAnimationFrame(() => section?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    },
    openVideos: kmateLibraryOpenVideos,
    startPuzzles: kmateLibraryStartPuzzles,
    state: () => ({
      ready: true,
      categories: kmateLibrary$$('[data-library-focus-card]').length,
      section: Boolean(kmateLibrary$('#learningOpenLibrary')),
      resultTailoring: Boolean(kmateLibrary$('#learningResultCard')),
      videosOpen: Boolean(kmateLibrary$('#learningLibraryDialog')?.open),
      playerOpen: Boolean(kmateLibrary$('#learningLibraryPlayer')?.open),
    }),
  };
}

kmateLibraryInitialize();
