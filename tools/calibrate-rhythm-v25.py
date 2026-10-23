"""Reproducible offline chart audit; no audio analysis runs on the phone.

Use the immutable V24 score as --baseline. By default only writes review output.
"""
import argparse, json, os, hashlib
from pathlib import Path
root = Path(__file__).resolve().parents[1]
out = root / 'output/audio-analysis/v25'
out.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('MPLCONFIGDIR', str(root / 'output/mpl-cache'))
import numpy as np
import librosa
from scipy import ndimage, signal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ap = argparse.ArgumentParser()
ap.add_argument('--baseline', type=Path, required=True)
ap.add_argument('--write-score', action='store_true')
args = ap.parse_args()
raw = args.baseline.read_text(encoding='utf-8-sig')
score = json.loads(raw.split('const RECORDING_SCORE = ', 1)[1].rsplit(';', 1)[0] if 'const RECORDING_SCORE = ' in raw else raw)
assert score['version'] == 7, 'Use the V24 baseline to avoid cumulative snapping'
(out / 'baseline-v24.json').write_text(json.dumps(score), encoding='utf-8')
source = root / 'assets/audio/ensemble.mp3'
sr, hop = 22050, 64
y, _ = librosa.load(source, sr=sr)
print('Loaded', len(y)/sr, 'seconds', flush=True)
cache = out / 'layers.npz'
if cache.exists():
    data = np.load(cache)
    times, flux = data['times'], data['flux']
else:
    mag = abs(librosa.stft(y, n_fft=1024, hop_length=hop))
    _, perc = librosa.decompose.hpss(mag, margin=(2, 3))
    flux = librosa.onset.onset_strength(S=librosa.amplitude_to_db(perc, ref=np.max), sr=sr, hop_length=hop, n_fft=1024)
    times = librosa.frames_to_time(np.arange(len(flux)), sr=sr, hop_length=hop)
    np.savez_compressed(cache, times=times, flux=flux)

bands = {'drum': (55, 380), 'gong': (700, 5000), 'cymbal': (2500, 10000), 'wood': (400, 4500), 'broad': (180, 10000)}
layers, events = {}, {}
for kind, (lo, hi) in bands.items():
    filtered = signal.sosfiltfilt(signal.butter(3, [lo, hi], fs=sr, btype='bandpass', output='sos'), y)
    # A drum needs a full low-frequency cycle: a 6-ms window mistakes membrane
    # carrier ripples for fresh hits. Metal uses a shorter, 10-ms attack envelope.
    window = 551 if kind=='drum' else 221
    env = np.sqrt(np.maximum(0, ndimage.uniform_filter1d(filtered**2, size=window)))[::hop]
    lag = 4 if kind=='drum' else 3
    rise = ndimage.gaussian_filter1d(np.maximum(0, env - np.r_[env[:lag], env[:-lag]]), 1)
    local = np.maximum(ndimage.median_filter(rise, size=201), np.percentile(rise[rise>0], 55)*.5)
    salience = rise / local
    peaks, props = signal.find_peaks(rise, distance=round(.07*sr/hop), prominence=np.percentile(rise, 65)*.30)
    entries = []
    for p, prom in zip(peaks, props['prominences']):
        if salience[p] < 2.0: continue
        # Threshold relative to this attack, above the preceding local floor.
        a = max(0, p-7)
        floor = float(np.min(rise[a:p+1]))
        threshold = floor + .22*(rise[p]-floor)
        edge = p
        while edge>a and rise[edge-1]>threshold: edge-=1
        t = max(0, float(edge*hop/sr))
        nearby = flux[max(0, int(t*sr/hop)-2):min(len(flux), int((t+.065)*sr/hop)+1)]
        entries.append({'time': round(t, 4), 'peak': round(float(p*hop/sr), 4), 'salience': round(float(salience[p]), 3), 'rise': float(rise[p]), 'prominence': float(prom), 'flux': float(max(nearby))})
    layers[kind] = (env, rise, salience)
    events[kind] = entries

# Two independent measures: an attack with local prominence and HPSS novelty.
# Near-by broad-band attacks corroborate; existing metal-specific roles remain.
def candidate(n):
    if n['kind']=='suona' or n['time']==0: return None
    es = [e for e in events[n['kind']] if abs(e['time']-n['time'])<=.035 and e['salience']>=3 and e['flux']>=1.0]
    if not es: return None
    for e in es:
        e['corroborated'] = any(abs(b['time']-e['time'])<=.018 and b['salience']>=2.4 for b in events['broad'])
    # Never jump to a louder neighboring beat just because its energy is higher.
    return max(es, key=lambda e: (1.2 if e['corroborated'] else 0) + min(2, np.log1p(e['salience'])/2) - abs(e['time']-n['time'])*27)

notes = score['notes']
groups = {}
for n in notes: groups.setdefault(n['time'], []).append(n)
changes, unchanged = [], []
for original, group in groups.items():
    cs = [candidate(n) for n in group]
    if not all(cs): continue
    if len(group)>1 and max(c['time'] for c in cs)-min(c['time'] for c in cs)>.025: continue
    # Keep one shared attack for intentional chords. Never create accidental flams.
    t = round(float(np.median([c['time'] for c in cs])), 4)
    if abs(t-original)<.006: continue
    if not all(c['corroborated'] or abs(c['time']-original)<.028 for c in cs): continue
    other = [q for q in notes if q not in group]
    if any(0<abs(q['time']-t)<.205 for q in other): continue
    if any(h['kind']=='suona' and h['time']-.60<t<h['time']+h['duration']+.59 for h in other): continue
    for n, c in zip(group, cs):
        changes.append({'kind': n['kind'], 'from': original, 'time': t, 'deltaMs': round((t-original)*1000, 2), 'groupSize': len(group), 'evidence': c})
        n['time'] = t
        n['alignedV25'] = True

notes.sort(key=lambda n:n['time'])
# Stable source identities are independent of the randomly selected runtime lane.
for i, n in enumerate(notes):
    n['eventId'] = f'dzg-rec-v25-{i:04d}'
    n['stage'] = min(5, sum(n['time']>=s for s in score['sections'][1:]))
free = [-2.]*4
for n in notes:
    pool = [i for i in range(4) if free[i]<=n['time']]
    assert pool, ('Reference-lane clearance', n)
    n['lane'] = min(pool, key=lambda i:free[i])
    free[n['lane']] = n['time']+n['duration']+(.65 if n.get('added') else .86)
score['version'] = 8
score['chartId'] = 'dazougu-original-recording'
score['revision'] = 'v25-attack-calibration-1'
score['recordingSha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
score['method'] = 'V25: local band attack rising edges (2.9 ms analysis grid), independent HPSS novelty and broadband corroboration; preserve expressive timing, 27 chords, suona holds and density guards. Instrument roles in mixed audio remain inferred.'
text = json.dumps({k:v for k,v in score.items() if k!='notes'}, ensure_ascii=False, indent=2)[:-2]+',\n  "notes": [\n'+',\n'.join('    '+json.dumps(n,ensure_ascii=False,separators=(',',':')) for n in notes)+'\n  ]\n}'
(root/'score.js' if args.write_score else out/'score-preview.js').write_text("/* V25 attack calibration. See RHYTHM-V25.md. */\n'use strict';\nconst RECORDING_SCORE = "+text+';\n', encoding='utf-8')
report = {'sourceSha256': score['recordingSha256'], 'librosa': librosa.__version__, 'sampleRate':sr, 'hop':hop, 'resolutionMs':hop/sr*1000, 'total':len(notes), 'changes':changes, 'perKind':{k:sum(c['kind']==k for c in changes) for k in bands if k!='broad'}, 'maxShiftMs':max(abs(c['deltaMs']) for c in changes), 'medianShiftMs':float(np.median([c['deltaMs'] for c in changes])), 'unchangedHolds':[{'time':n['time'],'duration':n['duration']} for n in notes if n['kind']=='suona']}
(out/'alignment-evidence.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
(out/'attack-candidates.json').write_text(json.dumps(events,indent=2),encoding='utf-8')
fig, axs = plt.subplots(6,1,figsize=(16,16))
for ax, (a,b) in zip(axs, [(0,8),(21,29),(38,46),(69,77),(104,112),(150,158)]):
    ts = np.arange(len(layers['broad'][1]))*hop/sr
    m = (ts>=a)&(ts<=b)
    for k, color in [('drum','#215bbe'),('gong','#cc589b'),('cymbal','#bc8b25')]:
        ax.plot(ts[m], np.minimum(layers[k][2][m],15), color=color, lw=.65, alpha=.5, label=k+' attack salience')
    for c in changes:
        if a<c['time']<b:
            ax.axvline(c['from'], color='#b2b2b2', alpha=.7, lw=1)
            ax.axvline(c['time'], color='#103772', alpha=.8, lw=1)
    ax.set_xlim(a,b); ax.set_ylim(0,16);ax.set_title(f'{a}-{b}s: gray old, navy calibrated; independent attack envelopes');ax.legend(loc='upper right')
fig.tight_layout();fig.savefig(out/'alignment.png', dpi=130)
large = sorted(changes, key=lambda c:abs(c['deltaMs']), reverse=True)[:12]
fig, axs = plt.subplots(6,2,figsize=(15,16))
for ax, c in zip(axs.flat, large):
    a,b = c['from']-.13,c['from']+.13
    ts=np.arange(len(layers[c['kind']][0]))*hop/sr
    m=(ts>=a)&(ts<=b)
    env,rise,_=layers[c['kind']]
    ax.plot(ts[m],env[m]/max(env[m].max(),1e-9),label='band RMS')
    ax.plot(ts[m],rise[m]/max(rise[m].max(),1e-9),label='attack rise',alpha=.65)
    ax.axvline(c['from'],color='gray',label='old');ax.axvline(c['time'],color='#d04090',label='candidate')
    ax.set_title(f"{c['kind']} {c['from']} s, shift {c['deltaMs']} ms");ax.legend()
fig.tight_layout();fig.savefig(out/'large-shifts.png',dpi=100)
print(json.dumps({k:v for k,v in report.items() if k not in ['changes','unchangedHolds']}),flush=True)
