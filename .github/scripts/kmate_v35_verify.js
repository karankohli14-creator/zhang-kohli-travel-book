const { chromium } = require('playwright');
const assert = require('assert');

function speechMock() {
  const voices = [{ name: 'Test', lang: 'en-GB', voiceURI: 'test', localService: true }];
  class U { constructor(text) { this.text = text; this.onstart = null; this.onend = null; this.onerror = null; } }
  const synth = { speaking:false, pending:false, getVoices:()=>voices, addEventListener:()=>{}, resume(){}, cancel(){this.speaking=false;}, speak(u){this.speaking=true;u.onstart?.();setTimeout(()=>{this.speaking=false;u.onend?.();},20);} };
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:U});
}

async function ready(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.stack || e.message)));
  page.on('console', m => { if (m.type()==='error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto('http://127.0.0.1:4173/', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1' && window.__KMATE__?.test);
  return {page, errors};
}

async function openReview(page) {
  await page.evaluate(() => window.__KMATE__.test.startConcreteTacticDemo());
  await page.click('#board .sq[data-square="e2"]');
  await page.click('#board .sq[data-square="f3"]');
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.silentGate);
  await page.evaluate(() => window.__KMATE__.test.forceConcreteBadMoveAnalysis());
  await page.waitForFunction(() => window.__KMATE__.state().liveCoach.open);
  await page.waitForSelector('#liveCoachBoardPanel:not([hidden])');
  await page.waitForTimeout(180);
}

async function inspect(page) {
  return page.evaluate(() => {
    const board = document.querySelector('#board').getBoundingClientRect();
    const panel = document.querySelector('#liveCoachBoardPanel').getBoundingClientRect();
    const pieces = [...document.querySelectorAll('#board .piece.staunton-piece, #board .piece.vector-piece')];
    const visiblePieces = pieces.filter(piece => {
      const r = piece.getBoundingClientRect();
      const cs = getComputedStyle(piece);
      return r.width > 8 && r.height > 8 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5;
    });
    const firstPiece = visiblePieces[0];
    const arrow = document.querySelector('#board .live-coach-board-arrows');
    return {
      board:{top:board.top,bottom:board.bottom,width:board.width,height:board.height},
      panel:{top:panel.top,bottom:panel.bottom,width:panel.width,height:panel.height,scrollHeight:document.querySelector('#liveCoachBoardPanel').scrollHeight,clientHeight:document.querySelector('#liveCoachBoardPanel').clientHeight},
      viewportHeight:window.innerHeight,
      scrollHeight:document.documentElement.scrollHeight,
      scrollY:window.scrollY,
      pieceCount:pieces.length,
      visiblePieceCount:visiblePieces.length,
      pieceZ:firstPiece ? getComputedStyle(firstPiece).zIndex : null,
      arrowZ:arrow ? getComputedStyle(arrow).zIndex : null,
      playedLegend:document.querySelector('#liveCoachPlayedLegend')?.textContent?.replace(/\s+/g,' ').trim(),
      bestLegend:document.querySelector('#liveCoachBestLegend')?.textContent?.replace(/\s+/g,' ').trim(),
      why:document.querySelector('#liveCoachWhy')?.textContent?.trim(),
      best:document.querySelector('#liveCoachBestText')?.textContent?.trim(),
      playedLine:document.querySelector('#liveCoachPlayedLine')?.textContent?.trim(),
      bestLine:document.querySelector('#liveCoachLine')?.textContent?.trim(),
      arrows:document.querySelectorAll('#board .live-coach-board-arrows line').length,
      summaryDisplay:getComputedStyle(document.querySelector('#liveCoachSummary')).display,
      principlesDisplay:getComputedStyle(document.querySelector('#liveCoachPrinciples')).display,
      overflowX:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

function assertReview(s, expectedPieces) {
  assert.ok(s.pieceCount >= expectedPieces, JSON.stringify(s));
  assert.strictEqual(s.visiblePieceCount, s.pieceCount, JSON.stringify(s));
  assert.ok(Number(s.pieceZ) > Number(s.arrowZ), JSON.stringify(s));
  assert.ok(s.arrows >= 2, JSON.stringify(s));
  assert.ok(/Orange dashed/i.test(s.playedLegend) && /Kf3/.test(s.playedLegend), JSON.stringify(s));
  assert.ok(/Green solid/i.test(s.bestLegend) && /Nxf5/.test(s.bestLegend), JSON.stringify(s));
  assert.ok(/Nxd4/.test(s.why) && /D4/.test(s.why), JSON.stringify(s));
  assert.ok(/Nxf5/.test(s.best) && /F5/.test(s.best), JSON.stringify(s));
  assert.ok(/Nxd4/.test(s.playedLine) && /Nxf5/.test(s.bestLine), JSON.stringify(s));
  assert.strictEqual(s.summaryDisplay, 'none', JSON.stringify(s));
  assert.strictEqual(s.principlesDisplay, 'none', JSON.stringify(s));
  assert.ok(s.board.top >= 0 && s.board.bottom <= s.viewportHeight + 1, JSON.stringify(s));
  assert.ok(s.panel.top >= 0 && s.panel.bottom <= s.viewportHeight + 1, JSON.stringify(s));
  assert.ok(s.panel.scrollHeight <= s.panel.clientHeight + 2, JSON.stringify(s));
  assert.ok(s.scrollHeight <= s.viewportHeight + 2, JSON.stringify(s));
  assert.strictEqual(s.scrollY, 0, JSON.stringify(s));
  assert.ok(s.overflowX <= 1, JSON.stringify(s));
}

(async()=>{
  const browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH,args:['--no-sandbox']});
  try {
    const desktop = await browser.newContext({viewport:{width:1440,height:900}});
    await desktop.addInitScript(speechMock);
    const d = await ready(desktop);
    await openReview(d.page);
    const ds = await inspect(d.page);
    assertReview(ds, 3);
    if (d.errors.length) throw new Error(d.errors.join('\n'));
    await desktop.close();

    const mobile = await browser.newContext({viewport:{width:390,height:844}});
    await mobile.addInitScript(speechMock);
    const m = await ready(mobile);
    await openReview(m.page);
    const ms = await inspect(m.page);
    assertReview(ms, 3);
    assert.ok(ms.board.width >= 220, JSON.stringify(ms));
    if (m.errors.length) throw new Error(m.errors.join('\n'));
    await mobile.close();

    console.log(JSON.stringify({ok:true,desktop:ds,mobile:ms},null,2));
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exit(1);});
