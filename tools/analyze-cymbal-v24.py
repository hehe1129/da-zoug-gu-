import os
os.environ.setdefault('MPLCONFIGDIR',str(__import__('pathlib').Path(__file__).resolve().parents[1]/'output/mpl-cache'))
import librosa,numpy as np,json
from scipy import ndimage,signal
from sklearn.cluster import MiniBatchKMeans
from pathlib import Path
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
import argparse
ap=argparse.ArgumentParser(description='Offline cymbal-evidence analysis and optional chart refinement')
ap.add_argument('--baseline',type=Path,required=True,help='V23 score.js or baseline-v23.json')
ap.add_argument('--write-score',action='store_true')
args=ap.parse_args()
root=Path(__file__).resolve().parents[1]
raw=args.baseline.read_text(encoding='utf-8-sig');baseline=json.loads(raw.split('const RECORDING_SCORE = ',1)[1].rsplit(';',1)[0] if 'const RECORDING_SCORE = ' in raw else raw)
assert baseline['version']==6,'Supply the V23 baseline, not an already refined chart'
out=root/'output/audio-analysis/v24';out.mkdir(parents=True,exist_ok=True)
(out/'baseline-v23.json').write_text(json.dumps(baseline),encoding='utf-8')
y,sr=librosa.load(root/'assets/audio/ensemble.mp3',sr=22050);hop=128;fft=2048
M=abs(librosa.stft(y,n_fft=fft,hop_length=hop));H,P=librosa.decompose.hpss(M);mel=librosa.filters.mel(sr=sr,n_fft=fft,n_mels=96,fmin=180,fmax=10000);X=mel@M;harm=mel@H;perc=mel@P
whiten=1/np.maximum(np.mean(X,axis=1),.005)**.65;templates=[];labels=[]
for kind,offset in [('gong',.085),('cymbal',.541),('wood',0),('drum',.294)]:
 s,_=librosa.load(root/'assets/audio'/f'{kind}.mp3',sr=sr);T=mel@abs(librosa.stft(s,n_fft=fft,hop_length=hop))
 for a,b in [(offset+.015,offset+.1),(offset+.1,offset+.23),(offset+.23,offset+.45)]:
  block=T[:,int(a*sr/hop):min(T.shape[1],int(b*sr/hop))]
  if block.size:templates.append(block.mean(axis=1));labels.append(kind)
# Model common sustained melody spectra as nuisance atoms instead of labelling
# the entire suona melody as ringing metal. No claim of true stem separation.
idx=np.arange(0,harm.shape[1],10);data=(harm[:,idx]*whiten[:,None]).T;data/=np.maximum(np.linalg.norm(data,axis=1,keepdims=True),1e-6)
centers=MiniBatchKMeans(8,random_state=12,n_init=3).fit(data).cluster_centers_
for row in centers:templates.append(row/whiten);labels.append('harmonic')
templates.append(np.ones(96));labels.append('noise')
W=np.array(templates).T*whiten[:,None];W/=np.maximum(np.linalg.norm(W,axis=0),1e-7)
V=X*whiten[:,None];WtV=W.T@V;WtW=W.T@W;A=np.maximum(WtV,1e-5)
for _ in range(65):A*=WtV/np.maximum(WtW@A,1e-8)
acts={k:np.sum(A[np.array(labels)==k],axis=0) for k in set(labels)}
# Metal attack score: positive activation change and independent percussive flux.
g=ndimage.gaussian_filter1d(acts['cymbal'],1);rise=np.maximum(0,g-np.r_[g[:4],g[:-4]])
flux=librosa.onset.onset_strength(S=librosa.amplitude_to_db(perc,ref=np.max),sr=sr,hop_length=hop);flux/=max(np.percentile(flux[flux>0],85),1e-6)
strength=rise/max(np.percentile(rise[rise>0],90),1e-6)
peaks,_=signal.find_peaks(strength,distance=int(.24*sr/hop),prominence=.3)
score=json.loads(json.dumps(baseline));old=[n['time'] for n in score['notes'] if n['kind']=='cymbal'];events=[]
for p in peaks:
 lo=max(0,p-4);hi=min(len(g),p+7);tail=np.mean(g[hi:min(len(g),p+34)]);attack=float(np.max(g[lo:hi]));competition=np.mean(acts['gong'][lo:hi]);ratio=attack/max(attack+competition,1e-6)
 events.append({'time':round(float(p*hop/sr-.012),4),'strength':round(float(strength[p]),3),'metalShare':round(float(ratio),3),'tailRatio':round(float(tail/max(attack,1e-6)),3),'flux':round(float(max(flux[lo:hi])),3),'nearestOldCymbal':round(float(min(abs(p*hop/sr-t) for t in old)),3)})
(out/'cymbal-candidates.json').write_text(json.dumps(events,indent=2));np.savez_compressed(out/'cymbal-layers.npz',cymbal=g,strength=strength,flux=flux,sr=sr,hop=hop)
print('candidates',len(events));print(json.dumps(sorted(events,key=lambda e:e['strength'],reverse=True)[:45],indent=2),flush=True)
fig,axs=plt.subplots(6,1,figsize=(16,14));times=np.arange(len(g))*hop/sr
for ax,(a,b) in zip(axs,[(0,22),(22,36),(36,66),(66,96),(96,135),(135,184)]):
 m=(times>=a)&(times<=b);ax.plot(times[m],strength[m],label='cymbal-template activation rise',color='#215bbe');ax.plot(times[m],flux[m]*.4,label='percussive flux x .4',alpha=.3)
 for e in events:
  if a<=e['time']<b and e['strength']>.7 and e['metalShare']>.45:ax.axvline(e['time'],color='#d54f91',alpha=.6,lw=.8)
 for t in old:
  if a<=t<b:ax.plot(t,.1,'v',color='#ae8b29',ms=4)
 ax.set_xlim(a,b);ax.set_ylim(0,6);ax.legend(loc='upper right')
fig.tight_layout();fig.savefig(out/'cymbal-analysis.png',dpi=110)

from pathlib import Path
import librosa,numpy as np,json
from scipy import signal,ndimage
out=root/'output/audio-analysis/v24';score=json.loads((out/'baseline-v23.json').read_text());events=json.loads((out/'cymbal-candidates.json').read_text());y,sr=librosa.load(root/'assets/audio/ensemble.mp3',sr=22050);hop=64
filtered=signal.sosfiltfilt(signal.butter(3,[2500,10000],fs=sr,btype='band',output='sos'),y);env=np.sqrt(np.maximum(0,ndimage.uniform_filter1d(filtered**2,size=177)))[::hop];attack=np.maximum(0,env-np.r_[env[:2],env[:-2]])
notes=score['notes'];holds=[n for n in notes if n['kind']=='suona'];selected=[]
for e in sorted(events,key=lambda e:e['strength']*e['metalShare'],reverse=True):
 if e['strength']<1.4 or e['metalShare']<.65 or e['flux']<1.1:continue
 a=max(0,int((e['time']-.06)*sr/hop));b=min(len(attack),int((e['time']+.03)*sr/hop));t=round(max(0,float((a+np.argmax(attack[a:b]))*hop/sr-.004)),4)
 if t<2.9 or t>score['duration']-.5:continue
 if any(abs(t-q['time'])<.23 for q in selected):continue
 if any(h['time']-.65<t<h['time']+h['duration']+.6 for h in holds):continue
 selected.append({**e,'rawTime':e['time'],'time':t})
selected.sort(key=lambda e:e['time']);changes=[];used=set()
for e in selected:
 t=e['time'];cym=[n for n in notes if n['kind']=='cymbal' and abs(n['time']-t)<=.1 and id(n) not in used]
 if cym:
  n=min(cym,key=lambda n:abs(n['time']-t));group=[q for q in notes if q['time']==n['time']];other=[q for q in notes if q not in group]
  if len(group)>1 and abs(t-n['time'])>.03:continue
  if any(abs(q['time']-t)<.205 for q in other):continue
  if abs(t-n['time'])<.006:continue
  changes.append({'action':'retime','from':n['time'],'time':t,'groupSize':len(group),'evidence':e})
  for q in group:q['time']=t;q['cymbalAlignedV24']=True
  used.add(id(n));continue
 near=min(notes,key=lambda n:abs(n['time']-t));delta=abs(near['time']-t)
 if e['strength']<2.0:continue
 if delta<=.04 and near['kind']!='suona':
  group=[q for q in notes if q['time']==near['time']]
  if len(group)>1 or any(q['kind']=='cymbal' for q in group):continue
  t=near['time'];action='chord'
 elif delta>=.25:action='add'
 else:continue
 if sum(abs(n['time']-t)<.5 for n in notes)>=4:continue
 n={'time':t,'kind':'cymbal','duration':0,'stage':min(5,sum(t>=v for v in score['sections'][1:])),'strength':e['strength'],'accent':.98,'band':'cymbal-template','added':True,'addedV24':True,'heightRatio':.82,'lane':0}
 notes.append(n);changes.append({'action':action,'time':t,'evidence':e})
notes.sort(key=lambda n:n['time'])
# Respect the existing conservative reference-lane clearance as well as the
# runtime geometry planner. Drop the weakest added cue in a crowded window.
while True:
 free=[-2.]*4;crowded=None
 for n in notes:
  pool=[i for i in range(4) if free[i]<=n['time']]
  if not pool:crowded=n;break
  lane=min(pool,key=lambda i:free[i]);free[lane]=n['time']+n['duration']+(.65 if n.get('added') else .86)
 if crowded is None:break
 removable=[n for n in notes if n.get('addedV24') and crowded['time']-.86<=n['time']<=crowded['time']]
 assert removable,('Cannot fit existing notes',crowded)
 remove=min(removable,key=lambda n:n['strength']);notes.remove(remove)
 changes=[c for c in changes if not(c['action'] in ['chord','add'] and c['time']==remove['time'])]
free=[-2.]*4
for n in notes:
 n['stage']=min(5,sum(n['time']>=v for v in score['sections'][1:]));pool=[i for i in range(4) if free[i]<=n['time']];assert pool,n
 n['lane']=min(pool,key=lambda i:free[i]);free[n['lane']]=n['time']+n['duration']+(.65 if n.get('added') else .86)
score['version']=7;score['method']='V24 cymbal-specific template activation versus gong and melody, independent 2.5-10 kHz attack refinement; preserve gong accents and at most two simultaneous inputs. Mixed-recording instrument roles remain inferred.'
header=json.dumps({k:v for k,v in score.items() if k!='notes'},ensure_ascii=False,indent=2)[:-2];source=header+',\n  "notes": [\n'+',\n'.join('    '+json.dumps(n,ensure_ascii=False,separators=(',',':')) for n in notes)+'\n  ]\n}'
(root/'score.js' if args.write_score else out/'score-preview.js').write_text("/* V24 cymbal attack refinement. See RHYTHM-V24.md. */\n'use strict';\nconst RECORDING_SCORE = "+source+';\n',encoding='utf-8')
report={'total':len(notes),'cymbalCount':sum(n['kind']=='cymbal' for n in notes),'gongCount':sum(n['kind']=='gong' for n in notes),'chords':sum(i>0 and n['time']==notes[i-1]['time'] for i,n in enumerate(notes)),'actions':{k:sum(c['action']==k for c in changes) for k in ['retime','chord','add']},'changes':changes}
(out/'cymbal-score-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');(out/'cymbal-qualified.json').write_text(json.dumps(selected,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k!='changes'}));print([(c['action'],c.get('from'),c['time']) for c in changes],flush=True)
