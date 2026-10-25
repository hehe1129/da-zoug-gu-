"""Prepare the supplied rain recordings; no synthesized replacement audio."""
from pathlib import Path
import json
import numpy as np
import soundfile as sf

root = Path(__file__).resolve().parents[1]
source = Path(r"C:/Users/20620/Documents/xwechat_files/wxid_ch00jlnwwf5d22_3a03/temp/RWTemp/2026-10/5c0e67939f8dbb1476ac8218691dc6d5")
report = {}
for kind, name, start, end, target in [
    ("light", "pure-rain-sound(1).mp3", 1.75, 8.25, .12),
    ("heavy", "heavy-rain-sound(1).mp3", 12, 36, .16),
]:
    samples, rate = sf.read(source / name, dtype="float32", always_2d=True)
    clip = samples[round(start * rate):round(end * rate)].copy()
    clip -= np.mean(clip, axis=0)
    clip *= min(target / np.sqrt(np.mean(clip ** 2)), .86 / np.max(np.abs(clip)))
    assert np.max(np.abs(clip)) < .95
    path = root / "assets/audio" / f"rain-{kind}-v32.mp3"
    sf.write(path, clip, rate, format="MP3", subtype="MPEG_LAYER_III", bitrate_mode="CONSTANT", compression_level=.5)
    decoded, _ = sf.read(path, dtype="float32", always_2d=True)
    rms = [float(np.sqrt(np.mean(decoded[i:i+rate//2] ** 2))) for i in range(rate//4, len(decoded)-rate//2, rate//2)]
    report[kind] = dict(source=name, start=start, end=end, bytes=path.stat().st_size, duration=len(decoded)/rate,
                        rms_min=min(rms), rms_max=max(rms), peak=float(np.max(np.abs(decoded))))
out = root / "output/audio/v32"
out.mkdir(parents=True, exist_ok=True)
(out / "rain-preparation.json").write_text(json.dumps(report, indent=2), encoding="utf8")
print(json.dumps(report))
