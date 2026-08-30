from pathlib import Path
import re

ROOT = Path('kmate-trainer')

# CSS: make onboarding/setup a literal fixed viewport instead of a document whose
# height is calculated beneath the old site header. This cannot document-scroll.
styles_path = ROOT / 'styles-v7.css'
styles = styles_path.read_text()
styles += r'''

/* K-Mate v37 — true native-style fixed screens, zero document scroll */
html.kmate-fixed-app,html.kmate-fixed-app body{width:100%;height:100%;min-height:0!important;overflow:hidden!important;overscroll-behavior:none;touch-action:manipulation}
html.kmate-fixed-app body.paged-app:not(.game-mode) .appbar{display:none!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .shell{position:fixed!important;inset:0!important;width:100%!important;height:100dvh!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) #setupView.paged-setup{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow{position:absolute;inset:0;width:100%;height:100%;min-height:0;overflow:hidden!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page{position:absolute;inset:0;width:100%;height:100%;min-height:0;max-height:100%;overflow:hidden!important;overscroll-behavior:none}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-screen-content{min-height:0;max-height:100%;overflow:hidden!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-step-card{min-height:0;max-height:100%;overflow:hidden!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-fields-grid{min-height:0;max-height:100%;overflow:hidden!important}

/* Welcome page: one intentional screen, no website header above it. */
html.kmate-fixed-app .setup-flow-page[data-setup-page="intro"]{grid-template-rows:auto minmax(0,1fr) auto;background:radial-gradient(circle at 78% 18%,#b9f4741b,transparent 30rem),var(--bg)}
html.kmate-fixed-app .setup-flow-page[data-setup-page="intro"] .setup-screen-header{padding-top:max(5px,env(safe-area-inset-top))}
html.kmate-fixed-app .welcome-card{width:min(1040px,100%);height:min(590px,100%);max-height:100%;align-self:center;justify-self:center;display:flex;flex-direction:column;justify-content:center}

/* Challenge: use the available screen like a settings page, not a long form. */
html.kmate-fixed-app .challenge-step-card,html.kmate-fixed-app .coaching-step-card{height:100%;max-height:100%}
html.kmate-fixed-app .challenge-fields-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr))}
html.kmate-fixed-app .coaching-fields-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr))}

/* Prevent wheel/touch movement from shifting the document even by one pixel. */
html.kmate-fixed-app body.paged-app:not(.game-mode){position:fixed!important;inset:0!important;width:100%!important;height:100dvh!important}

@media(max-width:760px){
  html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page{padding:max(5px,env(safe-area-inset-top)) 6px max(4px,env(safe-area-inset-bottom))}
  html.kmate-fixed-app .setup-screen-header{min-height:67px!important;max-height:67px;padding-bottom:3px!important}
  html.kmate-fixed-app .setup-screen-footer{min-height:44px!important;max-height:44px;padding-top:4px!important}
  html.kmate-fixed-app .setup-step-card{padding:4px!important}
  html.kmate-fixed-app .challenge-fields-grid,.coaching-fields-grid{gap:3px!important}
  html.kmate-fixed-app .challenge-fields-grid .field{padding:4px 5px!important}
  html.kmate-fixed-app .challenge-fields-grid .phase-seg button{min-height:27px!important}
  html.kmate-fixed-app .challenge-fields-grid .select{min-height:27px!important}
  html.kmate-fixed-app .challenge-fields-grid .time-grid button{min-height:24px!important}
  html.kmate-fixed-app .challenge-fields-grid .side-seg button{min-height:26px!important}
  html.kmate-fixed-app .coaching-fields-grid .calibration-toggle{padding:4px 5px!important}
  html.kmate-fixed-app .coaching-fields-grid .coach-audio-check,html.kmate-fixed-app .coaching-fields-grid .sound-style-field,html.kmate-fixed-app .coaching-fields-grid .compact-beta-tools{padding:4px 5px!important}
  html.kmate-fixed-app .welcome-card{height:auto;max-height:100%;padding:14px 12px!important}
  html.kmate-fixed-app .welcome-card h1{font-size:clamp(24px,8.2vw,38px)!important;margin:10px 0!important}
  html.kmate-fixed-app .welcome-card>p{font-size:10px!important;line-height:1.32!important}
}

@media(max-height:650px){
  html.kmate-fixed-app .setup-screen-header{min-height:50px!important;max-height:50px!important}
  html.kmate-fixed-app .setup-screen-copy p{display:none!important}
  html.kmate-fixed-app .setup-screen-footer{min-height:38px!important;max-height:38px!important}
  html.kmate-fixed-app .setup-screen-footer .btn{min-height:33px!important}
  html.kmate-fixed-app .welcome-card .summary-grid{display:none!important}
}
/* End K-Mate v37 */
'''
styles_path.write_text(styles)

# JS: put the root class on <html>, hard-reset scroll on every setup page change,
# and block wheel/touch scroll only while the paged setup shell is active.
part6_path = ROOT / 'app-v7-part6.txt'
part6 = part6_path.read_text()
part6 = part6.replace("version: '36.0-commercial-beta'", "version: '37.0-commercial-beta'")

old_init = """  setup.dataset.pagedReady = '1';
  setup.classList.add('paged-setup');
  document.body.classList.add('paged-app');
"""
new_init = """  setup.dataset.pagedReady = '1';
  setup.classList.add('paged-setup');
  document.documentElement.classList.add('kmate-fixed-app');
  document.body.classList.add('paged-app');
"""
if old_init not in part6:
    raise SystemExit('initializePagedSetup marker missing')
part6 = part6.replace(old_init, new_init, 1)

old_show = """  document.body.dataset.setupPage = setupFlowPage;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if (focus) setupFlowPageElement(setupFlowPage)?.querySelector('button, select, input')?.focus?.({ preventScroll: true });
}"""
new_show = """  document.body.dataset.setupPage = setupFlowPage;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if (focus) setupFlowPageElement(setupFlowPage)?.querySelector('button, select, input')?.focus?.({ preventScroll: true });
}"""
if old_show not in part6:
    raise SystemExit('showSetupFlowPage marker missing')
part6 = part6.replace(old_show, new_show, 1)

# Install guards after initializePagedSetup definition. They intentionally do
# not affect dialogs or the game; setup itself has no scrollable document.
guard_marker = """function resetSetupFlowForNavigation(page = 'intro') {
  if ($('#setupView')?.dataset.pagedReady === '1') showSetupFlowPage(page, { focus: false });
}

populateOpenings();"""
guard_replacement = """function resetSetupFlowForNavigation(page = 'intro') {
  if ($('#setupView')?.dataset.pagedReady === '1') showSetupFlowPage(page, { focus: false });
}

function pagedSetupIsActive() {
  return document.body.classList.contains('paged-app') && !document.body.classList.contains('game-mode') && !$('#setupView')?.hidden;
}

function pinPagedSetupViewport() {
  if (!pagedSetupIsActive()) return;
  if (window.scrollX || window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  }
}

window.addEventListener('scroll', pinPagedSetupViewport, { passive: true });
window.visualViewport?.addEventListener?.('resize', pinPagedSetupViewport, { passive: true });

populateOpenings();"""
if guard_marker not in part6:
    raise SystemExit('setup flow navigation marker missing')
part6 = part6.replace(guard_marker, guard_replacement, 1)
part6_path.write_text(part6)

# Cache bust versions.
index_path = ROOT / 'index.html'
index = index_path.read_text()
index = re.sub(r'styles-v7\.css\?v=\d+\.\d+\.\d+', 'styles-v7.css?v=37.0.0', index)
index = re.sub(r'app-v7\.js\?v=\d+\.\d+\.\d+', 'app-v7.js?v=37.0.0', index)
index_path.write_text(index)

loader_path = ROOT / 'app-v7.js'
loader = loader_path.read_text()
loader = re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=37.0.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=37.0.0', loader)
loader_path.write_text(loader)
