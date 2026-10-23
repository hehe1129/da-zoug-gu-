import os,json,numpy as np,librosa
from scipy import signal,ndimage
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import argparse
ap=argparse.ArgumentParser(description='Offline recording-onset analysis; leaves runtime dependencies unchanged.')
ap.add_argument('--baseline',type=Path,required=True,help='V21 score.js or original-score.json')
ap.add_argument('--write-score',action='store_true',help='Replace score.js with the reviewed candidate')
args=ap.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'output/audio-analysis/v22';out.mkdir(parents=True,exist_ok=True)
baseline=args.baseline.read_text(encoding='utf-8-sig');old=json.loads(baseline.split('const RECORDING_SCORE = ',1)[1].rsplit(';',1)[0] if 'const RECORDING_SCORE = ' in baseline else baseline);assert old['version']==4,'Supply the V21 baseline (score version 4), not an already refined chart';(out/'original-score.json').write_text(json.dumps(old),encoding='utf-8')
y,sr=librosa.load(root/'assets/audio/ensemble.mp3',sr=22050,mono=True);hop=128
print('Loaded recording',len(y)/sr,flush=True)
S=librosa.stft(y,n_fft=2048,hop_length=hop);H,P=librosa.decompose.hpss(S);freq=librosa.fft_frequencies(sr=sr,n_fft=2048);times=librosa.frames_to_time(np.arange(S.shape[1]),sr=sr,hop_length=hop)
curves=[]; candidates=[]
for band,(lo,hi) in enumerate([(55,320),(320,1800),(1800,9000)]):
 rows=(freq>=lo)&(freq<hi)
 db=librosa.amplitude_to_db(abs(P[rows]),ref=np.max)
 novelty=librosa.onset.onset_strength(S=db,sr=sr,hop_length=hop,lag=1,max_size=3,center=True)
 novelty=novelty/max(np.percentile(novelty[novelty>0],85),1e-6);curves.append(novelty)
 frames=librosa.onset.onset_detect(onset_envelope=novelty,sr=sr,hop_length=hop,backtrack=False,pre_max=4,post_max=4,pre_avg=14,post_avg=14,delta=.18,wait=14)
 # Refine spectral novelty peaks against a short-time band attack envelope.
 filtered=signal.sosfiltfilt(signal.butter(3,[lo,hi],fs=sr,btype='band',output='sos'),y)
 envelope=np.sqrt(np.maximum(0,ndimage.uniform_filter1d(filtered**2,size=221)))[::hop]
 attack=np.maximum(0,envelope-np.r_[envelope[:2],envelope[:-2]])
 for f in frames:
  left=max(0,f-9);right=min(len(attack),f+3);peak=left+np.argmax(attack[left:right]);time=max(0,float(peak*hop/sr-.005))
  candidates.append({'time':round(time,4),'band':['low','mid','high'][band],'strength':round(float(novelty[f]),4),'frame':int(f)})
print('Detected layer candidates',len(candidates),flush=True)
# Local beats are diagnostic only: never replace expressive timing by one global BPM.
sections=[]
for a,b in zip(old['sections'],old['sections'][1:]):
 excerpt=y[int(a*sr):int(b*sr)];bpm,beats=librosa.beat.beat_track(y=excerpt,sr=sr,hop_length=hop)
 sections.append({'from':a,'to':b,'bpmCandidate':round(float(np.asarray(bpm).item()),2),'beats':[round(float(t+a),4) for t in librosa.frames_to_time(beats,sr=sr,hop_length=hop)]})
notes=[dict(n) for n in old['notes']];holds=[n for n in notes if n['kind']=='suona'];moved=[]
for n in notes:
 if n['kind']=='suona' or n['time']==0:continue
 band=n.get('band','low' if n['kind']=='drum' else 'high' if n['kind']=='cymbal' else 'mid')
 nearby=[c for c in candidates if c['band']==band and abs(c['time']-n['time'])<=.055 and c['strength']>=.38]
 if not nearby:continue
 c=min(nearby,key=lambda c:abs(c['time']-n['time']))
 if abs(c['time']-n['time'])<.007:continue
 if any(q is not n and abs(q['time']-c['time'])<.205 for q in notes):continue
 if any(h['time']-.6<c['time']<h['time']+h['duration']+.59 for h in holds):continue
 moved.append({'old':n['time'],'new':c['time'],'kind':n['kind'],'band':band});n['time']=c['time'];n['alignedV22']=True
added=[]
# Candidate ranking is by measured onset strength; cap short-window density for touch play.
for c in sorted(candidates,key=lambda c:c['strength'],reverse=True):
 t=c['time'];stage=min(5,sum(t>=v for v in old['sections'][1:]));gap=[.29,.27,.25,.24,.23,.23][stage]
 if t<.15 or t>old['duration']-.55 or c['strength']<[.8,.78,.75,.72,.70,.68][stage]:continue
 if any(abs(n['time']-t)<gap for n in notes):continue
 if any(h['time']-.65<t<h['time']+h['duration']+.6 for h in holds):continue
 if sum(abs(n['time']-t)<.5 for n in notes)>=3:continue
 # Earliest passage remains drum-led. Mid-band attacks cannot reliably identify gong vs wood.
 kind='drum' if c['band']=='low' or t<3 else 'cymbal' if c['band']=='high' else 'wood'
 n={'time':t,'kind':kind,'duration':0,'stage':stage,'strength':c['strength'],'accent':round(float(np.clip(.94+c['strength']*.025,.94,1.06)),3),'band':c['band'],'added':True,'addedV22':True,'heightRatio':.82,'lane':0}
 notes.append(n);added.append(n)
notes.sort(key=lambda n:n['time'])
for n in notes:n['stage']=min(5,sum(n['time']>=v for v in old['sections'][1:]))
# Reference lanes only; actual runtime safely randomizes each run.
free=[-2.]*4
for n in notes:
 pool=[i for i in range(4) if free[i]<=n['time']];assert pool,('reference lane density',n)
 lane=min(pool,key=lambda i:free[i]);n['lane']=lane;free[lane]=n['time']+n['duration']+(.65 if n.get('added') else .86)
old['notes']=notes;old['version']=5;old['method']='V22 librosa 0.11 HPSS + three-band spectral onsets; measured local attack refinement; restrained additions with hold/density guards. Section beat estimates are diagnostic, not fixed tempo quantization. Instrument roles inferred from mixed audio.'
source=json.dumps({k:v for k,v in old.items() if k!='notes'},ensure_ascii=False,indent=2)[:-2]+',\n  "notes": [\n'+',\n'.join('    '+json.dumps(n,ensure_ascii=False,separators=(',',':')) for n in notes)+'\n  ]\n}'
(root/'score.js' if args.write_score else out/'score-preview.js').write_text("/* V22 measured onset refinement. See RHYTHM-V22.md. */\n'use strict';\nconst RECORDING_SCORE = "+source+';\n',encoding='utf-8')
report={'librosa':librosa.__version__,'sampleRate':sr,'hop':hop,'resolutionMs':hop/sr*1000,'original':387,'total':len(notes),'moved':moved,'added':added,'sections':sections,'candidates':candidates,'perStage':[sum(n['stage']==i for n in notes) for i in range(6)],'holds':len(holds),'minGap':min(b['time']-a['time'] for a,b in zip(notes,notes[1:]))}
(out/'analysis.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
fig,axs=plt.subplots(5,1,figsize=(15,12));
for ax,(a,b) in zip(axs,[(0,12),(35,42),(65,72),(95,102),(133,142)]):
 mask=(times>=a)&(times<=b)
 for curve,label,col in zip(curves,['low','mid','high'],['#185ac6','#cf6092','#b49230']):ax.plot(times[mask],curve[mask],label=label,color=col,alpha=.6,lw=.8)
 for n in notes:
  if a<=n['time']<=b:ax.axvline(n['time'],color='#ef4d91' if n.get('addedV22') else '#153e83',lw=1,alpha=.7)
 ax.set_xlim(a,b);ax.set_ylim(0,4);ax.set_title(f'{a}-{b}s: blue existing/refined notes, pink additions');ax.legend(loc='upper right');ax.set_xlabel('Recording time (seconds)')
fig.tight_layout();fig.savefig(out/'alignment.png',dpi=140)
print(json.dumps({k:v for k,v in report.items() if k not in ['candidates','moved','added','sections']}),flush=True);print('Moved',len(moved),'added',len(added),'local BPM candidates',[s['bpmCandidate'] for s in sections],flush=True)
