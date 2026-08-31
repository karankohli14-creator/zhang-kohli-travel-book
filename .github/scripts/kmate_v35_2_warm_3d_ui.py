from __future__ import annotations

from pathlib import Path

ROOT = Path("kmate-trainer")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# App-flow JavaScript: simplify the welcome screen, make bottom actions explicit,
# and add a subtle original wooden UI tap that is unlocked by the same gesture.
# ---------------------------------------------------------------------------
flow_path = ROOT / "appflow-v35.js"
flow = flow_path.read_text()
flow = replace_once(flow, "const FLOW_VERSION = '35.1-app-flow';", "const FLOW_VERSION = '35.2-warm-3d';", "flow version")

flow = replace_once(
    flow,
    '''        <footer class="wizard-footer">
          <button class="wizard-button wizard-back" type="button" data-wizard-back>← Back</button>
          ${name === 'coaching'
            ? '<div class="wizard-start-slot" data-wizard-slot="start"></div>'
            : `<button class="wizard-button wizard-next" type="button" data-wizard-next="${PAGE_ORDER[step + 1]}">Continue →</button>`}
        </footer>''',
    '''        <footer class="wizard-footer wizard-bottom-dock">
          <button class="wizard-button wizard-back" type="button" data-wizard-back><span aria-hidden="true">←</span><b>Back</b></button>
          ${name === 'coaching'
            ? '<div class="wizard-start-slot" data-wizard-slot="start"></div>'
            : `<button class="wizard-button wizard-next" type="button" data-wizard-next="${PAGE_ORDER[step + 1]}"><b>Continue</b><span aria-hidden="true">→</span></button>`}
        </footer>''',
    "bottom dock markup",
)

old_welcome = '''      <section class="wizard-page wizard-welcome" data-wizard-page="welcome" aria-hidden="false">
        <div class="wizard-welcome-main">
          <div class="wizard-welcome-brand"><span>♞</span><b>K-Mate</b></div>
          <div class="wizard-kicker">Timed position play</div>
          <h1>Train the positions that decide games.</h1>
          <p>Skip the routine opening moves. Start in a practical middlegame, late middlegame, or endgame, choose the opponent and clock, and receive coaching when it matters.</p>
          <div class="wizard-benefits"><span>Real positions</span><span>Rating control</span><span>Live coaching</span><span>Progress tracking</span></div>
          <div class="wizard-welcome-stats" data-wizard-slot="welcome-stats"></div>
        </div>
        <footer class="wizard-footer wizard-welcome-footer">
          <button class="wizard-button wizard-secondary" id="wizardInsightsButton" type="button">View insights</button>
          <button class="wizard-button wizard-next wizard-primary" type="button" data-wizard-next="position">Let’s get into it →</button>
        </footer>
      </section>'''
new_welcome = '''      <section class="wizard-page wizard-welcome" data-wizard-page="welcome" aria-hidden="false">
        <div class="wizard-welcome-main">
          <div class="wizard-welcome-brand"><span>♞</span><b>K-Mate</b></div>
          <div class="wizard-kicker">Practice the part that decides the game</div>
          <h1>Play better positions.<br>Make better decisions.</h1>
          <p>Choose a middlegame or endgame, set the strength and clock, then learn from the decisions that actually change the position.</p>
          <div class="wizard-path" aria-label="How K-Mate works">
            <div><i>1</i><b>Choose</b><span>a real position</span></div>
            <div><i>2</i><b>Play</b><span>under pressure</span></div>
            <div><i>3</i><b>Improve</b><span>with clear coaching</span></div>
          </div>
        </div>
        <footer class="wizard-footer wizard-welcome-footer wizard-bottom-dock">
          <button class="wizard-button wizard-secondary" id="wizardInsightsButton" type="button"><span aria-hidden="true">◎</span><b>My insights</b></button>
          <button class="wizard-button wizard-next wizard-primary" type="button" data-wizard-next="position"><b>Start training</b><span aria-hidden="true">→</span></button>
        </footer>
      </section>'''
flow = replace_once(flow, old_welcome, new_welcome, "simplified welcome")

flow = replace_once(
    flow,
    "    const summaryGrid = intro.querySelector('.summary-grid');",
    "    const summaryGrid = intro.querySelector('.summary-grid');",
    "summary lookup marker",
)
flow = replace_once(
    flow,
    '''      soundField, loadError, startButton, summaryGrid,
    };''',
    '''      soundField, loadError, startButton, summaryGrid,
    };''',
    "required controls marker",
)
flow = replace_once(
    flow,
    "    const statsSlot = $('[data-wizard-slot=\"welcome-stats\"]', wizard);",
    "    const statsSlot = null;",
    "remove welcome stats slot",
)
flow = replace_once(
    flow,
    "    statsSlot.append(summaryGrid);",
    "    summaryGrid.hidden = true;",
    "hide welcome stats",
)

sound_helpers = r'''
  let uiAudioContext = null;
  let lastUiSoundAt = 0;

  function uiSoundsAllowed() {
    const toggle = document.querySelector('#soundToggle');
    return !toggle || !toggle.classList.contains('muted');
  }

  function playUiWoodTap(strength = 1) {
    if (!uiSoundsAllowed()) return;
    const nowMs = performance.now();
    if (nowMs - lastUiSoundAt < 35) return;
    lastUiSoundAt = nowMs;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      uiAudioContext ||= new AudioContextClass();
      const context = uiAudioContext;
      context.resume?.();
      const now = context.currentTime;
      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.055 * Math.max(0.65, Math.min(1.15, strength)), now + 0.004);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
      master.connect(context.destination);

      const body = context.createOscillator();
      const bodyGain = context.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(185, now);
      body.frequency.exponentialRampToValueAtTime(112, now + 0.065);
      bodyGain.gain.setValueAtTime(0.9, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.072);
      body.connect(bodyGain).connect(master);
      body.start(now);
      body.stop(now + 0.08);

      const click = context.createOscillator();
      const clickGain = context.createGain();
      click.type = 'square';
      click.frequency.setValueAtTime(1180, now);
      click.frequency.exponentialRampToValueAtTime(520, now + 0.018);
      clickGain.gain.setValueAtTime(0.16, now);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
      click.connect(clickGain).connect(master);
      click.start(now);
      click.stop(now + 0.026);
    } catch (error) {
      console.debug('K-Mate UI sound unavailable.', error);
    }
  }

  function bindUiSounds(root) {
    root.addEventListener('pointerdown', (event) => {
      const control = event.target.closest('button, select, input[type="checkbox"], input[type="range"]');
      if (!control || control.disabled) return;
      const prominent = Boolean(control.closest('.wizard-bottom-dock') || control.matches('.phase-seg button'));
      playUiWoodTap(prominent ? 1.08 : 0.82);
    }, { passive: true });
  }

'''
flow = replace_once(flow, "  function setViewportHeight() {", sound_helpers + "  function setViewportHeight() {", "UI sound helpers")
flow = replace_once(flow, "      bindWizard(wizard);", "      bindWizard(wizard);\n      bindUiSounds(wizard);", "bind UI sounds")

flow_path.write_text(flow)


# ---------------------------------------------------------------------------
# HTML cache versions.
# ---------------------------------------------------------------------------
index_path = ROOT / "index.html"
index = index_path.read_text()
index = replace_once(index, "styles-v7.css?v=35.1.0", "styles-v7.css?v=35.2.0", "stylesheet cache")
index = replace_once(index, "appflow-v35.js?v=35.1.0", "appflow-v35.js?v=35.2.0", "flow cache")
index = replace_once(index, "app-v7.js?v=35.1.0", "app-v7.js?v=35.2.0", "app cache")
index_path.write_text(index)


# ---------------------------------------------------------------------------
# CSS: warm visual language, larger typography, dimensional controls, and a
# true bottom action dock on every setup screen.
# ---------------------------------------------------------------------------
styles_path = ROOT / "styles-v7.css"
styles = styles_path.read_text()
styles += r'''

/* K-Mate v35.2 — warm, dimensional, bottom-action interface */
.setup-wizard{
  background:
    radial-gradient(circle at 14% -8%,#5e4a2e38,transparent 30rem),
    radial-gradient(circle at 92% 5%,#d7a94b25,transparent 28rem),
    radial-gradient(circle at 70% 100%,#84b95f18,transparent 32rem),
    linear-gradient(150deg,#17130f 0%,#101812 54%,#07100b 100%);
}
.wizard-page{grid-template-rows:58px auto minmax(0,1fr) 78px;gap:12px}
.wizard-header{border-bottom-color:#e9bd6740}
.wizard-title{font-size:clamp(34px,4.5vw,52px);color:#fff6e4;text-shadow:0 4px 22px #0008}
.wizard-content{align-content:center}
.wizard-page .field{
  border-color:#e8bd672c;
  background:linear-gradient(155deg,#2a2118dd,#151c16e8 62%,#0d150f);
  box-shadow:inset 0 1px 0 #fff1,0 14px 30px #0003;
}
.wizard-page .fieldhead label{font-size:16px;color:#fff4df}
.wizard-page .value{font-size:15px;color:#d7ff84}
.wizard-page .select{
  min-height:52px;padding:0 15px;border-color:#e8bd6734;border-radius:14px;
  background:linear-gradient(180deg,#283126,#1b251d);font-size:16px;font-weight:750;
  box-shadow:inset 0 1px 0 #fff2,inset 0 -3px 0 #0004,0 7px 14px #0003;
}
.wizard-page .step,
.wizard-page .seg button,
.wizard-page .time-grid button{
  position:relative;border-color:#d9ad5c47;
  background:linear-gradient(180deg,#354131 0%,#253225 55%,#192219 100%);
  box-shadow:inset 0 2px 0 #ffffff18,inset 0 -4px 0 #0b100c,0 8px 14px #0004;
  transform:translateY(0);transition:transform .1s ease,box-shadow .1s ease,filter .1s ease;
}
.wizard-page .seg button:hover,.wizard-page .time-grid button:hover,.wizard-page .step:hover{filter:brightness(1.08);transform:translateY(-1px)}
.wizard-page .seg button:active,.wizard-page .time-grid button:active,.wizard-page .step:active{
  transform:translateY(3px);box-shadow:inset 0 1px 0 #ffffff12,inset 0 -1px 0 #0b100c,0 3px 6px #0004;
}
.wizard-page .seg button.active,.wizard-page .time-grid button.active{
  border-color:#d9ee7a88;background:linear-gradient(180deg,#526b3a,#354b2c 56%,#273620);
  color:#eaffae;box-shadow:inset 0 2px 0 #ffffff22,inset 0 -4px 0 #172014,0 9px 20px #91c35b24;
}
.wizard-page .phase-seg button{min-height:72px;border-radius:17px}
.wizard-page .phase-seg button b{font-size:20px;line-height:1.05}
.wizard-page .phase-seg button small{margin-top:6px;font-size:11px;color:#d2d9cf}
.wizard-page .time-grid button{min-height:58px;border-radius:14px}
.wizard-page .time-grid b{font-size:17px}
.wizard-page .side-seg button{min-height:52px;font-size:17px}
.wizard-page .step{font-size:26px;color:#eaffae}
.wizard-toggle{
  min-height:72px!important;border-color:#e8bd6726!important;border-radius:18px!important;
  background:linear-gradient(155deg,#2a2118cf,#151d16e8)!important;
  box-shadow:inset 0 1px 0 #fff1,0 10px 24px #0003;
}
.wizard-toggle b{font-size:15px;color:#fff4df}
.wizard-toggle small{font-size:11px!important;color:#bfc9bf!important}
.wizard-toggle input{accent-color:#b9f474}
.wizard-audio-check,.wizard-sound-field{border-color:#e8bd6728!important;background:linear-gradient(155deg,#251f18,#131b15)!important}

.wizard-bottom-dock{
  position:relative;z-index:8;align-self:end;min-height:72px;padding:10px 0 0;
  border-top:1px solid #e8bd6738;
  background:linear-gradient(180deg,transparent,#0b110ddd 36%,#09100bec);
}
.wizard-button,.wizard-start-slot #startButton{
  position:relative;display:flex;align-items:center;justify-content:center;gap:10px;
  min-height:58px;padding:0 24px;border:1px solid #d2a75b60;border-radius:17px;
  background:linear-gradient(180deg,#3b352a 0%,#292920 58%,#1a2019 100%);
  color:#fff5df;font-size:17px;font-weight:950;letter-spacing:-.01em;
  box-shadow:inset 0 2px 0 #ffffff20,inset 0 -5px 0 #0b100c,0 12px 22px #0006;
  transform:translateY(0);transition:transform .1s ease,box-shadow .1s ease,filter .1s ease;
}
.wizard-button b{font-size:inherit}
.wizard-button span{font-size:1.12em}
.wizard-button:hover,.wizard-start-slot #startButton:hover{filter:brightness(1.08);transform:translateY(-1px)}
.wizard-button:active,.wizard-start-slot #startButton:active{
  transform:translateY(4px);box-shadow:inset 0 1px 0 #ffffff16,inset 0 -1px 0 #0b100c,0 4px 8px #0005;
}
.wizard-next,.wizard-primary,.wizard-start-slot #startButton{
  border-color:#d8ef7caa;background:linear-gradient(180deg,#dffc8e 0%,#bde96d 52%,#91c34f 100%);
  color:#17210f;text-shadow:0 1px #ffffff70;
  box-shadow:inset 0 2px 0 #ffffff80,inset 0 -5px 0 #5d8733,0 14px 26px #91c35b34;
}
.wizard-back{color:#f5e6ca}
.wizard-start-slot{height:100%}
.wizard-start-slot #startButton{height:58px;margin:0!important}
.wizard-start-slot #startButton:disabled{transform:none;box-shadow:inset 0 2px 0 #ffffff30,inset 0 -4px 0 #4a573c;filter:saturate(.5);opacity:.68}

.wizard-welcome{grid-template-rows:minmax(0,1fr) 78px}
.wizard-welcome-main{max-width:930px}
.wizard-welcome-brand span{width:64px;height:64px;border-radius:21px;background:linear-gradient(145deg,#d8ef7c30,#e6b95b1d);font-size:44px}
.wizard-welcome-brand b{font-size:31px;color:#fff5df}
.wizard-kicker{margin-top:18px;color:#e7bb68;font-size:12px}
.wizard-welcome h1{margin:15px auto 14px;font-size:clamp(50px,7.6vw,84px);line-height:.93;color:#fff6e4;text-shadow:0 5px 28px #0009}
.wizard-welcome p{max-width:700px;font-size:clamp(17px,2vw,21px);line-height:1.42;color:#d7ddd5}
.wizard-path{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:min(720px,100%);margin:24px auto 0}
.wizard-path div{display:grid;grid-template-columns:42px 1fr;grid-template-rows:auto auto;align-items:center;text-align:left;padding:12px 14px;border:1px solid #e8bd6726;border-radius:17px;background:linear-gradient(155deg,#2a2118bb,#111a13);box-shadow:inset 0 1px #fff1,0 10px 24px #0003}
.wizard-path i{grid-row:1/3;display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:linear-gradient(145deg,#e7c06b,#b9f474);color:#18200f;font-style:normal;font-weight:950}
.wizard-path b{font-size:15px;color:#fff3dd}
.wizard-path span{font-size:11px;color:#aeb9af}
.wizard-welcome-footer{grid-template-columns:1fr 1.45fr}

@media(max-width:760px){
  .wizard-page{grid-template-rows:48px auto minmax(0,1fr) 64px;gap:7px}
  .wizard-title{font-size:30px}
  .wizard-page .fieldhead label{font-size:13px}
  .wizard-page .value{font-size:12px}
  .wizard-page .phase-seg button{min-height:54px;border-radius:12px}
  .wizard-page .phase-seg button b{font-size:15px}
  .wizard-page .phase-seg button small{display:none}
  .wizard-page .select{min-height:42px;font-size:13px}
  .wizard-page .time-grid button{min-height:39px}
  .wizard-page .time-grid b{font-size:13px}
  .wizard-page .side-seg button{min-height:40px;font-size:13px}
  .wizard-toggle{min-height:50px!important}
  .wizard-toggle b{font-size:12px}
  .wizard-toggle small{font-size:9px!important}
  .wizard-bottom-dock{min-height:60px;padding-top:7px}
  .wizard-button,.wizard-start-slot #startButton{min-height:48px;height:48px;padding:0 12px;border-radius:13px;font-size:14px;box-shadow:inset 0 2px 0 #ffffff20,inset 0 -4px 0 #0b100c,0 8px 14px #0005}
  .wizard-next,.wizard-primary,.wizard-start-slot #startButton{box-shadow:inset 0 2px 0 #ffffff80,inset 0 -4px 0 #5d8733,0 9px 18px #91c35b2c}
  .wizard-welcome{grid-template-rows:minmax(0,1fr) 64px}
  .wizard-welcome-brand span{width:51px;height:51px;border-radius:16px;font-size:35px}
  .wizard-welcome-brand b{font-size:25px}
  .wizard-kicker{margin-top:11px;font-size:9px}
  .wizard-welcome h1{margin:10px auto;font-size:clamp(42px,11.5vw,58px);line-height:.95}
  .wizard-welcome p{max-width:350px;font-size:14px;line-height:1.36}
  .wizard-path{gap:5px;margin-top:14px}
  .wizard-path div{grid-template-columns:30px 1fr;padding:8px 7px;border-radius:11px}
  .wizard-path i{width:25px;height:25px;border-radius:8px;font-size:11px}
  .wizard-path b{font-size:11px}
  .wizard-path span{font-size:8px}
}

@media(max-height:700px){
  .wizard-page{grid-template-rows:42px auto minmax(0,1fr) 55px}
  .wizard-title{font-size:26px}
  .wizard-bottom-dock{min-height:51px;padding-top:5px}
  .wizard-button,.wizard-start-slot #startButton{min-height:43px;height:43px;font-size:13px}
  .wizard-welcome{grid-template-rows:minmax(0,1fr) 55px}
  .wizard-welcome h1{font-size:42px}
  .wizard-welcome p{font-size:13px}
  .wizard-path{margin-top:9px}
}
/* End K-Mate v35.2 */
'''
styles_path.write_text(styles)
