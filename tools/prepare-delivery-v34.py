"""Smaller delivery copies, with the original recording timing/art preserved."""
from pathlib import Path
import json
import numpy as np
import soundfile as sf
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / 'assets/audio/ensemble.mp3'
samples, rate = sf.read(source, dtype='float32', always_2d=True)
target = root / 'assets/audio/ensemble-v34.mp3'
sf.write(target, samples, rate, format='MP3', subtype='MPEG_LAYER_III',
         bitrate_mode='VARIABLE', compression_level=.65)
decoded, check_rate = sf.read(target, dtype='float32', always_2d=True)
assert rate == check_rate and samples.shape == decoded.shape
# Test transient alignment at the beginning, middle and end of the recording.
alignments = []
for second in [1, 30, 90, 170]:
    a = samples[second*rate:(second+1)*rate].mean(axis=1)
    b = decoded[second*rate:(second+1)*rate].mean(axis=1)
    correlations = [float(np.dot(a[100:-100], b[100+lag:-100+lag or None])) for lag in range(-80,81)]
    lag = int(np.argmax(correlations))-80
    assert abs(lag) <= 1, (second, lag)
    alignments.append(dict(second=second, lag_samples=lag))
art = root / 'assets/modal-frame-v22.webp'
image = Image.open(art).convert('RGBA')
output = root / 'assets/modal-frame-v34.webp'
image.save(output, 'WEBP', quality=88, method=6, exact=True)
assert np.array_equal(np.asarray(image)[:,:,3], np.asarray(Image.open(output))[:,:,3])
report = dict(audio_before=source.stat().st_size, audio_after=target.stat().st_size,
              duration=len(samples)/rate, alignment=alignments,
              panel_before=art.stat().st_size, panel_after=output.stat().st_size)
out = root / 'output/delivery/v34'
out.mkdir(parents=True, exist_ok=True)
(out/'sizes.json').write_text(json.dumps(report, indent=2), encoding='utf8')
print(json.dumps(report))
