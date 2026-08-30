from pathlib import Path
import re

ROOT = Path('kmate-trainer')

# Cache/version bumps.
index_path = ROOT / 'index.html'
index = index_path.read_text()
index = re.sub(r'styles-v7\.css\?v=\d+\.\d+\.\d+', 'styles-v7.css?v=38.0.0', index)
index = re.sub(r'app-v7\.js\?v=\d+\.\d+\.\d+', 'app-v7.js?v=38.0.0', index)
index_path.write_text(index)

loader_path = ROOT / 'app-v7.js'
loader = loader_path.read_text()
loader = re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=38.0.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=38.0.0', loader)
loader_path.write_text(loader)

part6_path = ROOT / 'app-v7-part6.txt'
part6 = part6_path.read_text().replace("version: '37.0-commercial-beta'", "version: '38.0-commercial-beta'")
part6_path.write_text(part6)

styles_path = ROOT / 'styles-v7.css'
styles = styles_path.read_text()
styles += r'''

/* K-Mate v38 — spacious, high-clarity setup screens */
body.paged-app:not(.game-mode){--setup-card-bg:linear-gradient(150deg,#17241b 0%,#101912 68%,#0c140e 100%)}
body.paged-app:not(.game-mode) .setup-flow-page{padding:clamp(14px,2.2vh,22px) clamp(18px,3vw,38px)}
body.paged-app:not(.game-mode) .setup-screen-header{min-height:82px;gap:22px;padding:0 2px 13px}
body.paged-app:not(.game-mode) .setup-screen-brand{min-width:155px;gap:11px}
body.paged-app:not(.game-mode) .setup-screen-brand .brandmark{width:44px;height:44px;border-radius:14px;font-size:27px}
body.paged-app:not(.game-mode) .setup-screen-brand b{font-size:19px;line-height:1.05}
body.paged-app:not(.game-mode) .setup-screen-brand small{margin-top:3px;font-size:10px}
body.paged-app:not(.game-mode) .setup-screen-copy h1{font-size:clamp(28px,3vw,40px);line-height:1.02;letter-spacing:-.035em}
body.paged-app:not(.game-mode) .setup-screen-copy p{margin-top:7px;font-size:13px;line-height:1.35}
body.paged-app:not(.game-mode) .setup-progress{gap:7px}
body.paged-app:not(.game-mode) .setup-progress i{width:30px;height:7px}
body.paged-app:not(.game-mode) .setup-progress i.active{width:45px}
body.paged-app:not(.game-mode) .setup-screen-footer{min-height:68px;padding-top:11px}
body.paged-app:not(.game-mode) .setup-screen-footer .btn{display:flex;align-items:center;justify-content:center;min-height:50px;min-width:170px;padding:0 22px;font-size:14px;line-height:1;text-align:center}
body.paged-app:not(.game-mode) .setup-screen-footer #startButton{min-width:240px;font-size:15px}
body.paged-app:not(.game-mode) .setup-step-card{padding:13px;border-radius:23px;background:var(--setup-card-bg);box-shadow:0 24px 70px #0005}

/* Challenge screen: exactly four roomy rows. The phase selector owns the full first row. */
body.paged-app:not(.game-mode) .challenge-fields-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:repeat(4,minmax(0,1fr));gap:11px}
body.paged-app:not(.game-mode) .challenge-fields-grid .field{display:flex;min-width:0;min-height:0;flex-direction:column;justify-content:center;margin:0;padding:12px 14px;border:1px solid #ffffff12;border-radius:15px;background:linear-gradient(145deg,#ffffff06,#ffffff025);overflow:hidden}
body.paged-app:not(.game-mode) .challenge-fields-grid .field:first-child{grid-column:1/-1;min-height:88px;padding:11px 14px}
body.paged-app:not(.game-mode) .challenge-fields-grid .fieldhead{min-height:23px;margin:0 0 7px}
body.paged-app:not(.game-mode) .challenge-fields-grid label{font-size:14px;line-height:1.1;font-weight:900;letter-spacing:-.01em}
body.paged-app:not(.game-mode) .challenge-fields-grid .value{font-size:13px;line-height:1;font-weight:950}
body.paged-app:not(.game-mode) .challenge-fields-grid .sub{display:block;margin-top:6px;font-size:10.5px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.paged-app:not(.game-mode) .challenge-fields-grid .select{min-height:46px;padding:0 13px;border-radius:12px;font-size:14px;font-weight:750}

body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg{grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;height:58px}
body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg button{display:flex!important;align-items:center!important;justify-content:center!important;width:100%;height:58px;min-height:58px;padding:0 10px!important;border-radius:13px;text-align:center!important;line-height:1!important}
body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg button b{display:block;width:100%;margin:0;font-size:16px;line-height:1.05;font-weight:950;text-align:center;white-space:normal}
body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg button small{display:none!important}
body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg button[data-phase="endgame"]{visibility:visible!important;opacity:1!important}

body.paged-app:not(.game-mode) .challenge-fields-grid .rangeRow{grid-template-columns:40px minmax(0,1fr) 40px;gap:9px}
body.paged-app:not(.game-mode) .challenge-fields-grid .step{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:11px;font-size:25px;line-height:1}
body.paged-app:not(.game-mode) .challenge-fields-grid .range{height:30px}
body.paged-app:not(.game-mode) .challenge-fields-grid .time-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
body.paged-app:not(.game-mode) .challenge-fields-grid .time-grid button{display:flex;align-items:center;justify-content:center;min-height:38px;padding:3px 5px;border-radius:10px;text-align:center;line-height:1}
body.paged-app:not(.game-mode) .challenge-fields-grid .time-grid b{font-size:14px;line-height:1;font-weight:950}
body.paged-app:not(.game-mode) .challenge-fields-grid .time-grid small{display:none!important}
body.paged-app:not(.game-mode) .challenge-fields-grid .side-seg{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
body.paged-app:not(.game-mode) .challenge-fields-grid .side-seg button{display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 8px;border-radius:12px;font-size:14px;line-height:1;font-weight:900;text-align:center}

/* Coaching setup: larger cards, checkboxes, and labels. */
body.paged-app:not(.game-mode) .coaching-fields-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:repeat(4,minmax(0,1fr));gap:10px}
body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle{display:grid;grid-template-columns:26px minmax(0,1fr);align-items:center;gap:11px;min-height:0;margin:0;padding:12px 13px;border:1px solid #ffffff12;border-radius:15px;background:linear-gradient(145deg,#ffffff06,#ffffff025)}
body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle input{width:20px;height:20px;margin:0;accent-color:var(--accent)}
body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle b{font-size:14px;line-height:1.15;font-weight:900}
body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle small{display:block;margin-top:4px;font-size:10.5px;line-height:1.25;-webkit-line-clamp:2}
body.paged-app:not(.game-mode) .coaching-fields-grid .coach-audio-check,
body.paged-app:not(.game-mode) .coaching-fields-grid .sound-style-field,
body.paged-app:not(.game-mode) .coaching-fields-grid .compact-beta-tools{padding:11px 12px;border-radius:15px}
body.paged-app:not(.game-mode) .coaching-fields-grid .coach-audio-test{min-height:43px;padding:0 13px;font-size:12px;font-weight:900}
body.paged-app:not(.game-mode) .coaching-fields-grid .coach-audio-check span{font-size:10px;line-height:1.25}
body.paged-app:not(.game-mode) .coaching-fields-grid .sound-style-head label{font-size:13px;font-weight:900}
body.paged-app:not(.game-mode) .coaching-fields-grid .sound-preview-actions .sound-preview{display:flex;align-items:center;justify-content:center;min-width:68px;height:32px;padding:0 9px;font-size:10px;line-height:1;text-align:center}
body.paged-app:not(.game-mode) .coaching-fields-grid .select{min-height:40px;padding:0 11px;font-size:12px;font-weight:750}
body.paged-app:not(.game-mode) .coaching-fields-grid .compact-beta-tools button{display:flex;align-items:center;justify-content:center;min-height:42px;padding:5px 8px;text-align:center}
body.paged-app:not(.game-mode) .coaching-fields-grid .compact-beta-tools button b{font-size:11px;line-height:1.1}

/* Welcome: cleaner hierarchy and a large obvious primary action. */
body.paged-app:not(.game-mode) .welcome-card{width:min(1050px,96%);padding:clamp(25px,4vw,52px);border-radius:28px;background:radial-gradient(circle at 92% 8%,#b9f47425,transparent 25rem),var(--setup-card-bg)}
body.paged-app:not(.game-mode) .welcome-card h1{margin:12px 0 17px;font-size:clamp(38px,5.5vw,68px);line-height:.98}
body.paged-app:not(.game-mode) .welcome-card>p{font-size:clamp(14px,1.35vw,18px);line-height:1.45}
body.paged-app:not(.game-mode) .welcome-card .chip{font-size:11px;padding:6px 9px}
body.paged-app:not(.game-mode) .welcome-card .summary-grid strong{font-size:27px}
body.paged-app:not(.game-mode) .welcome-card .summary-grid span{font-size:9px}

@media(max-width:760px){
  body.paged-app:not(.game-mode) .setup-flow-page{padding:8px 9px 6px}
  body.paged-app:not(.game-mode) .setup-screen-header{grid-template-columns:auto 1fr;grid-template-areas:'brand progress' 'copy copy';min-height:89px;gap:5px 9px;padding-bottom:7px}
  body.paged-app:not(.game-mode) .setup-screen-brand{min-width:0}
  body.paged-app:not(.game-mode) .setup-screen-brand .brandmark{width:35px;height:35px;font-size:22px}
  body.paged-app:not(.game-mode) .setup-screen-brand b{font-size:15px}
  body.paged-app:not(.game-mode) .setup-screen-brand small{font-size:8px}
  body.paged-app:not(.game-mode) .setup-screen-copy h1{font-size:23px;line-height:1.02}
  body.paged-app:not(.game-mode) .setup-screen-copy p{display:block;margin-top:3px;font-size:10px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  body.paged-app:not(.game-mode) .setup-progress i{width:20px;height:5px}
  body.paged-app:not(.game-mode) .setup-progress i.active{width:31px}
  body.paged-app:not(.game-mode) .setup-screen-footer{min-height:55px;padding-top:6px}
  body.paged-app:not(.game-mode) .setup-screen-footer .btn{min-height:43px;min-width:0;padding:0 14px;font-size:12px}
  body.paged-app:not(.game-mode) .setup-screen-footer #startButton{min-width:0;font-size:13px}
  body.paged-app:not(.game-mode) .setup-step-card{padding:7px;border-radius:16px}

  body.paged-app:not(.game-mode) .challenge-fields-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:repeat(4,minmax(0,1fr));gap:6px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .field{padding:7px 8px;border-radius:11px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .field:first-child{min-height:76px;padding:7px 8px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .fieldhead{min-height:17px;margin-bottom:4px}
  body.paged-app:not(.game-mode) .challenge-fields-grid label{font-size:11px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .value{font-size:10px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .sub{display:none}
  body.paged-app:not(.game-mode) .challenge-fields-grid .select{min-height:37px;padding:0 8px;font-size:11px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg{height:48px;gap:5px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg button{height:48px;min-height:48px;padding:0 4px!important;border-radius:10px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg button b{font-size:13px;line-height:1.05}
  body.paged-app:not(.game-mode) .challenge-fields-grid .rangeRow{grid-template-columns:31px minmax(0,1fr) 31px;gap:5px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .step{width:31px;height:31px;font-size:20px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .range{height:23px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .time-grid{gap:3px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .time-grid button{min-height:31px;padding:2px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .time-grid b{font-size:10px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .side-seg{gap:4px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .side-seg button{min-height:37px;padding:0 4px;font-size:11px}

  body.paged-app:not(.game-mode) .coaching-fields-grid{gap:6px}
  body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle{grid-template-columns:20px minmax(0,1fr);gap:7px;padding:7px 8px;border-radius:11px}
  body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle input{width:17px;height:17px}
  body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle b{font-size:11px;line-height:1.08}
  body.paged-app:not(.game-mode) .coaching-fields-grid .calibration-toggle small{margin-top:2px;font-size:8px;line-height:1.15;-webkit-line-clamp:2}
  body.paged-app:not(.game-mode) .coaching-fields-grid .coach-audio-check,
  body.paged-app:not(.game-mode) .coaching-fields-grid .sound-style-field,
  body.paged-app:not(.game-mode) .coaching-fields-grid .compact-beta-tools{padding:7px 8px;border-radius:11px}
  body.paged-app:not(.game-mode) .coaching-fields-grid .coach-audio-test{min-height:34px;font-size:9px}
  body.paged-app:not(.game-mode) .coaching-fields-grid .sound-style-head label{font-size:10px}
  body.paged-app:not(.game-mode) .coaching-fields-grid .sound-preview-actions .sound-preview{min-width:54px;height:28px;font-size:8px}
  body.paged-app:not(.game-mode) .coaching-fields-grid .select{min-height:34px;font-size:9px}
  body.paged-app:not(.game-mode) .coaching-fields-grid .compact-beta-tools button{min-height:33px}
  body.paged-app:not(.game-mode) .coaching-fields-grid .compact-beta-tools button b{font-size:8.5px}

  body.paged-app:not(.game-mode) .welcome-card{width:100%;padding:20px 16px;border-radius:19px}
  body.paged-app:not(.game-mode) .welcome-card h1{font-size:clamp(31px,10vw,45px)}
  body.paged-app:not(.game-mode) .welcome-card>p{font-size:12px}
  body.paged-app:not(.game-mode) .welcome-card .chip{font-size:8.5px;padding:5px 7px}
  body.paged-app:not(.game-mode) .welcome-card .summary-grid{gap:5px}
  body.paged-app:not(.game-mode) .welcome-card .summary-grid div{padding:8px 5px}
  body.paged-app:not(.game-mode) .welcome-card .summary-grid strong{font-size:19px}
}

@media(max-height:700px){
  body.paged-app:not(.game-mode) .setup-screen-header{min-height:68px}
  body.paged-app:not(.game-mode) .setup-screen-copy p{display:none}
  body.paged-app:not(.game-mode) .setup-screen-footer{min-height:48px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg,
  body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg button{height:44px;min-height:44px}
  body.paged-app:not(.game-mode) .challenge-fields-grid .phase-seg button b{font-size:12px}
}
/* End K-Mate v38 */
'''
styles_path.write_text(styles)
