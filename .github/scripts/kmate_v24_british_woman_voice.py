from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


part1_path = "kmate-trainer/app-v7-part1.txt"
app = read(part1_path)

app = replace_once(
    app,
    "  coachVoiceURI: 'auto',",
    "  coachVoiceURI: 'british-woman',",
    "default British woman voice profile",
)

app = replace_once(
    app,
    "store.settings = { ...defaultSettings, ...(store.settings || {}) };\n\nlet settings = { ...store.settings };",
    "store.settings = { ...defaultSettings, ...(store.settings || {}) };\n// Move existing automatic users to the new generic British-woman preference.\n// Explicitly selected device voices remain untouched.\nif (!store.settings.coachVoiceURI || store.settings.coachVoiceURI === 'auto') {\n  store.settings.coachVoiceURI = 'british-woman';\n}\n\nlet settings = { ...store.settings };",
    "voice preference migration",
)

voice_block_pattern = re.compile(
    r"function coachVoiceScore\(voice\) \{.*?\n\}\n\nfunction updateCoachAvatarControls\(\)",
    re.S,
)

voice_block = r'''const BRITISH_WOMAN_PROFILE = 'british-woman';
const LIKELY_WOMAN_VOICE_PATTERN = /sonia|libby|maisie|serena|kate|stephanie|martha|hazel|susan|fiona|emma|amy|olivia|ava|aria|jenny|samantha|karen|moira|allison|zira|female|woman/i;
const LIKELY_MAN_VOICE_PATTERN = /daniel|arthur|ryan|oliver|george|aaron|tom|fred|david|mark|male|\bman\b/i;

function voiceSearchText(voice) {
  return `${voice?.name || ''} ${voice?.voiceURI || ''} ${voice?.lang || ''}`;
}

function isBritishEnglishVoice(voice) {
  const language = String(voice?.lang || '').toLowerCase();
  const name = voiceSearchText(voice).toLowerCase();
  return /^en[-_]gb(?:$|[-_])/i.test(language)
    || /united kingdom|british english|uk english|english \(united kingdom\)/i.test(name);
}

function isLikelyWomanVoice(voice) {
  const name = voiceSearchText(voice);
  return LIKELY_WOMAN_VOICE_PATTERN.test(name) && !LIKELY_MAN_VOICE_PATTERN.test(name);
}

function isLikelyManVoice(voice) {
  return LIKELY_MAN_VOICE_PATTERN.test(voiceSearchText(voice));
}

function coachVoiceScore(voice) {
  const name = voiceSearchText(voice).toLowerCase();
  const lang = String(voice?.lang || '').toLowerCase();
  let score = /^en([_-]|$)/.test(lang) ? 100 : -1000;
  if (/premium|enhanced|natural|neural|high quality|hq/.test(name)) score += 220;
  if (/ava|samantha|serena|daniel|karen|moira|aria|jenny|sonia|olivia|aaron|allison|tom|victoria|libby|maisie|kate|stephanie|martha/.test(name)) score += 90;
  if (/en-gb/.test(lang)) score += 42;
  else if (/en-us/.test(lang)) score += 24;
  else if (/en-au|en-ie|en-ca/.test(lang)) score += 18;
  if (voice?.localService) score += 8;
  if (/compact|robot|espeak|fred|zarvox|whisper|bad news|bubbles|cellos/.test(name)) score -= 180;
  return score;
}

function britishWomanVoiceScore(voice) {
  let score = coachVoiceScore(voice);
  const british = isBritishEnglishVoice(voice);
  const woman = isLikelyWomanVoice(voice);
  if (british) score += 430;
  if (woman) score += 360;
  if (british && woman) score += 380;
  if (isLikelyManVoice(voice)) score -= 520;
  return score;
}

function englishCoachVoices() {
  if (!coachVoiceAvailable()) return [];
  const voices = window.speechSynthesis.getVoices?.() || [];
  const seen = new Set();
  return voices.filter((voice) => {
    if (!/^en([_-]|$)/i.test(voice.lang || '')) return false;
    const key = voice.voiceURI || `${voice.name}-${voice.lang}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chooseBritishWomanVoice(voices = englishCoachVoices()) {
  if (!voices.length) return null;
  const sortPreferred = (items) => items.slice().sort((a, b) => britishWomanVoiceScore(b) - britishWomanVoiceScore(a) || a.name.localeCompare(b.name));
  const exact = voices.filter((voice) => isBritishEnglishVoice(voice) && isLikelyWomanVoice(voice));
  if (exact.length) return sortPreferred(exact)[0];
  const women = voices.filter((voice) => isLikelyWomanVoice(voice));
  if (women.length) return sortPreferred(women)[0];
  const britishNeutral = voices.filter((voice) => isBritishEnglishVoice(voice) && !isLikelyManVoice(voice));
  if (britishNeutral.length) return sortPreferred(britishNeutral)[0];
  const british = voices.filter(isBritishEnglishVoice);
  if (british.length) return sortPreferred(british)[0];
  return voices.slice().sort((a, b) => coachVoiceScore(b) - coachVoiceScore(a) || a.name.localeCompare(b.name))[0] || null;
}

function chooseCoachVoice() {
  const voices = englishCoachVoices();
  if (!voices.length) return null;
  const selected = settings.coachVoiceURI || BRITISH_WOMAN_PROFILE;
  if (selected === BRITISH_WOMAN_PROFILE) {
    coachVoiceCache = chooseBritishWomanVoice(voices);
    return coachVoiceCache;
  }
  if (selected !== 'auto') {
    const exact = voices.find((voice) => (voice.voiceURI || `${voice.name}-${voice.lang}`) === selected);
    if (exact) {
      coachVoiceCache = exact;
      return exact;
    }
  }
  coachVoiceCache = voices.slice().sort((a, b) => coachVoiceScore(b) - coachVoiceScore(a) || a.name.localeCompare(b.name))[0] || null;
  return coachVoiceCache;
}

function britishWomanPreferenceLabel(voice) {
  if (!voice) return 'British woman — best available';
  if (isBritishEnglishVoice(voice) && isLikelyWomanVoice(voice)) return `British woman — ${voice.name}`;
  if (isLikelyWomanVoice(voice)) return `Woman — ${voice.name} (British voice unavailable)`;
  if (isBritishEnglishVoice(voice)) return `British English — ${voice.name} (closest available)`;
  return `Closest natural voice — ${voice.name}`;
}

function individualVoiceLabel(voice) {
  if (isBritishEnglishVoice(voice) && isLikelyWomanVoice(voice)) return `British woman — ${voice.name} (${voice.lang})`;
  if (isBritishEnglishVoice(voice)) return `British English — ${voice.name} (${voice.lang})`;
  if (isLikelyWomanVoice(voice)) return `Woman — ${voice.name} (${voice.lang})`;
  const quality = coachVoiceScore(voice) >= 250 ? 'Natural' : 'System';
  return `${quality} — ${voice.name} (${voice.lang})`;
}

function populateCoachVoiceSelect() {
  const select = $('#coachVoiceSelect');
  if (!select) return;
  const voices = englishCoachVoices();
  const britishWoman = chooseBritishWomanVoice(voices);
  const natural = voices.slice().sort((a, b) => coachVoiceScore(b) - coachVoiceScore(a) || a.name.localeCompare(b.name))[0] || null;
  const requested = settings.coachVoiceURI || BRITISH_WOMAN_PROFILE;
  select.innerHTML = '';

  const preferred = document.createElement('option');
  preferred.value = BRITISH_WOMAN_PROFILE;
  preferred.textContent = britishWomanPreferenceLabel(britishWoman);
  select.append(preferred);

  const automatic = document.createElement('option');
  automatic.value = 'auto';
  automatic.textContent = natural ? `Natural — ${natural.name}` : 'Natural — best available';
  select.append(automatic);

  for (const voice of voices.slice().sort((a, b) => britishWomanVoiceScore(b) - britishWomanVoiceScore(a) || a.name.localeCompare(b.name))) {
    const option = document.createElement('option');
    option.value = voice.voiceURI || `${voice.name}-${voice.lang}`;
    option.textContent = individualVoiceLabel(voice);
    select.append(option);
  }

  const availableValues = new Set([...select.options].map((option) => option.value));
  select.value = availableValues.has(requested) ? requested : BRITISH_WOMAN_PROFILE;
  if (select.value !== requested) settings.coachVoiceURI = BRITISH_WOMAN_PROFILE;
  select.title = britishWoman
    ? `Preferred generic British woman voice: ${britishWoman.name}`
    : 'A generic British woman voice was requested; K-Mate will use the closest voice available on this device.';
}

function updateCoachAvatarControls()'''

app, count = voice_block_pattern.subn(lambda _match: voice_block, app, count=1)
if count != 1:
    raise SystemExit("Voice selection block was not replaced")

old_utterance = """  const utterance = new SpeechSynthesisUtterance(speechFriendlyText(segment.text));
  utterance.lang = 'en-US';
  utterance.rate = Math.max(0.82, Math.min(1.06, Number(settings.coachVoiceRate) || 0.92));
  utterance.pitch = 1.0;
  utterance.volume = 1;
  const voice = chooseCoachVoice();
  if (voice) utterance.voice = voice;"""
new_utterance = """  const utterance = new SpeechSynthesisUtterance(speechFriendlyText(segment.text));
  const voice = chooseCoachVoice();
  utterance.lang = voice?.lang || 'en-GB';
  utterance.rate = Math.max(0.82, Math.min(1.06, Number(settings.coachVoiceRate) || 0.92));
  utterance.pitch = 1.0;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;"""
app = replace_once(app, old_utterance, new_utterance, "utterance language")
app = app.replace("url.search = '?v=20260828-23';", "url.search = '?v=20260828-24';", 1)
write(part1_path, app)


index_path = "kmate-trainer/index.html"
index = read(index_path)
index = index.replace('./styles-v7.css?v=23.0.0', './styles-v7.css?v=24.0.0')
index = index.replace('./app-v7.js?v=23.0.0', './app-v7.js?v=24.0.0')
index = replace_once(
    index,
    '<select id="coachVoiceSelect" class="coach-voice-select"><option value="auto">Natural — best available</option></select>',
    '<select id="coachVoiceSelect" class="coach-voice-select"><option value="british-woman">British woman — best available</option></select>',
    "voice selector placeholder",
)
index = replace_once(
    index,
    '<p>K-Mate can now choose the most natural voice exposed by your phone or computer, and you can select any available English voice. That remains device-generated speech.</p>',
    '<p>For now, K-Mate defaults to a generic British woman’s voice when your phone or computer provides one. You can still select any available English voice. This remains device-generated speech and does not imitate a public figure.</p>',
    "voice explanation",
)
write(index_path, index)


loader_path = "kmate-trainer/app-v7.js"
loader = read(loader_path)
loader = loader.replace("positions-v7.js?v=23.0.0", "positions-v7.js?v=24.0.0")
loader = loader.replace("app-v7-part${number}.txt?v=23.0.0", "app-v7-part${number}.txt?v=24.0.0")
write(loader_path, loader)


part6_path = "kmate-trainer/app-v7-part6.txt"
part6 = read(part6_path)
part6 = part6.replace("version: '23.0-commercial-beta'", "version: '24.0-commercial-beta'", 1)
part6 = replace_once(
    part6,
    "resolvedVoice: chooseCoachVoice()?.name || null, voiceURI: settings.coachVoiceURI || 'auto', rate: Number(settings.coachVoiceRate) || 0.92",
    "resolvedVoice: chooseCoachVoice()?.name || null, voiceURI: settings.coachVoiceURI || 'british-woman', voiceProfile: settings.coachVoiceURI === 'british-woman' ? 'generic British woman' : 'device voice', rate: Number(settings.coachVoiceRate) || 0.92",
    "voice state metadata",
)
write(part6_path, part6)
