from pathlib import Path
import math
import struct
import subprocess
import wave

root = Path('kmate-trainer')
parts = [(root / f'app-v7-part{number}.txt').read_text() for number in range(1, 7)]
if parts[0].endswith('\n  }') and parts[1].startswith(' }\n'):
    parts[0] = parts[0][:-2]
combined = Path('/tmp/kmate-v28-combined.js')
combined.write_text(''.join(parts))
subprocess.run(['node', '--check', str(root / 'app-v7.js')], check=True)
subprocess.run(['node', '--check', str(combined)], check=True)

part1 = (root / 'app-v7-part1.txt').read_text()
part6 = (root / 'app-v7-part6.txt').read_text()
index = (root / 'index.html').read_text()
assert "version: '28.0-commercial-beta'" in part6
assert 'function handleLiveCoachAnalysis' in part1
assert 'function relevantPrinciplesForPosition' in part1
assert 'function ensureDecodedWoodBuffers' in part1
assert 'id="principlesDialog"' in index
assert 'id="liveCoachDialog"' in index

# Capture deliberately starts with a lighter pickup knock before the stronger
# landing at ~60 ms, so its first 28 ms has a lower minimum than a normal move.
expected = {
    'kmate-reference-move-v28.wav': ((0.22, 0.24), 4.5, 18_000),
    'kmate-reference-capture-v28.wav': ((0.32, 0.34), 2.0, 10_000),
    'kmate-reference-check-v28.wav': ((0.40, 0.42), 2.0, 18_000),
}
audio_root = root / 'sounds' / 'live-v28'
for filename, (bounds, minimum_ratio, minimum_attack) in expected.items():
    path = audio_root / filename
    assert path.exists(), path
    assert path.stat().st_size > 40_000, (path, path.stat().st_size)
    with wave.open(str(path), 'rb') as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (2, 2, 48_000)
        duration = wav.getnframes() / wav.getframerate()
        assert bounds[0] <= duration <= bounds[1], (path, duration)
        samples = struct.unpack('<' + 'h' * wav.getnframes() * 2, wav.readframes(wav.getnframes()))
    mono = [(samples[index] + samples[index + 1]) / 2 for index in range(0, len(samples), 2)]
    absolute = [abs(value) for value in mono]
    attack_peak = max(absolute[:int(0.028 * 48_000)] or [0])
    overall_peak = max(absolute)
    overall_peak_index = absolute.index(overall_peak) / 48_000
    tail = absolute[int(0.150 * 48_000):]
    tail_rms = math.sqrt(sum(value * value for value in tail) / max(1, len(tail)))
    ratio = attack_peak / max(1, tail_rms)
    assert attack_peak > minimum_attack, (path, attack_peak)
    assert overall_peak > 18_000, (path, overall_peak)
    assert overall_peak_index < 0.075, (path, overall_peak_index)
    assert ratio > minimum_ratio, (path, ratio, attack_peak, tail_rms)
    print(filename, {
        'duration': duration,
        'pickup_peak': attack_peak,
        'overall_peak': overall_peak,
        'peak_time': overall_peak_index,
        'attack_tail_ratio': ratio,
    })
