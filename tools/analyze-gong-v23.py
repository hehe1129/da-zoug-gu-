import os
os.environ.setdefault('MPLCONFIGDIR',str(__import__('pathlib').Path(__file__).resolve().parents[1]/'output/mpl-cache'))
import librosa,numpy as np,json
from scipy import ndimage,signal
from sklearn.cluster import MiniBatchKMeans
from pathlib import Path
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
import argparse
ap=argparse.ArgumentParser(description='Offline gong-evidence analysis and optional chart refinement')
ap.add_argument('--baseline',type=Path,required=True,help='V22 score.js or baseline-v22.json')
ap.add_argument('--write-score',action='store_true')
args=ap.parse_args()
root=Path(__file__).resolve().parents[1]
raw=args.baseline.read_text(encoding='utf-8-sig');baseline=json.loads(raw.split('const RECORDING_SCORE = ',1)[1].rsplit(';',1)[0] if 'const RECORDING_SCORE = ' in raw else raw)
assert baseline['version']==5,'Supply the V22 baseline, not an already refined chart'
out=root/'output/audio-analysis/v23';out.mkdir(parents=True,exist_ok=True)
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
g=ndimage.gaussian_filter1d(acts['gong'],1);rise=np.maximum(0,g-np.r_[g[:4],g[:-4]])
flux=librosa.onset.onset_strength(S=librosa.amplitude_to_db(perc,ref=np.max),sr=sr,hop_length=hop);flux/=max(np.percentile(flux[flux>0],85),1e-6)
strength=rise/max(np.percentile(rise[rise>0],90),1e-6)
peaks,_=signal.find_peaks(strength,distance=int(.24*sr/hop),prominence=.3)
score=json.loads(json.dumps(baseline));old=[n['time'] for n in score['notes'] if n['kind']=='gong'];events=[]
for p in peaks:
 lo=max(0,p-4);hi=min(len(g),p+7);tail=np.mean(g[hi:min(len(g),p+34)]);attack=float(np.max(g[lo:hi]));competition=np.mean(acts['cymbal'][lo:hi]);ratio=attack/max(attack+competition,1e-6)
 events.append({'time':round(float(p*hop/sr-.012),4),'strength':round(float(strength[p]),3),'metalShare':round(float(ratio),3),'tailRatio':round(float(tail/max(attack,1e-6)),3),'flux':round(float(max(flux[lo:hi])),3),'nearestOldGong':round(float(min(abs(p*hop/sr-t) for t in old)),3)})
(out/'gong-candidates.json').write_text(json.dumps(events,indent=2));np.savez_compressed(out/'gong-layers.npz',gong=g,strength=strength,flux=flux,sr=sr,hop=hop)
print('candidates',len(events));print(json.dumps(sorted(events,key=lambda e:e['strength'],reverse=True)[:45],indent=2),flush=True)
fig,axs=plt.subplots(6,1,figsize=(16,14));times=np.arange(len(g))*hop/sr
for ax,(a,b) in zip(axs,[(0,22),(22,36),(36,66),(66,96),(96,135),(135,184)]):
 m=(times>=a)&(times<=b);ax.plot(times[m],strength[m],label='gong-template activation rise',color='#215bbe');ax.plot(times[m],flux[m]*.4,label='percussive flux x .4',alpha=.3)
 for e in events:
  if a<=e['time']<b and e['strength']>.7 and e['metalShare']>.45:ax.axvline(e['time'],color='#d54f91',alpha=.6,lw=.8)
 for t in old:
  if a<=t<b:ax.plot(t,.1,'v',color='#ae8b29',ms=4)
 ax.set_xlim(a,b);ax.set_ylim(0,6);ax.legend(loc='upper right')
fig.tight_layout();fig.savefig(out/'gong-analysis.png',dpi=110)

import os,json,numpy as np,librosa
from pathlib import Path
from scipy import signal,ndimage
out=root/'output/audio-analysis/v23'
score=json.loads(json.dumps(baseline));(out/'baseline-v22.json').write_text(json.dumps(score),encoding='utf-8');notes=score['notes'];holds=[n for n in notes if n['kind']=='suona']
events=json.loads((out/'gong-candidates.json').read_text());y,sr=librosa.load(root/'assets/audio/ensemble.mp3',sr=22050);hop=64;filtered=signal.sosfiltfilt(signal.butter(3,[850,10000],fs=sr,btype='band',output='sos'),y);env=np.sqrt(np.maximum(0,ndimage.uniform_filter1d(filtered**2,size=221)))[::hop];rise=np.maximum(0,env-np.r_[env[:3],env[:-3]])
selected=[]
for e in sorted(events,key=lambda e:e['strength']*e['metalShare']*min(e['tailRatio'],.35),reverse=True):
 if e['strength']<1.3 or e['metalShare']<.65 or e['tailRatio']<.12 or e['flux']<.7:continue
 raw=e['time'];a=max(0,int((raw-.065)*sr/hop));b=min(len(rise),int((raw+.035)*sr/hop));t=round(max(0,float((a+np.argmax(rise[a:b]))*hop/sr-.005)),4)
 if t<3 or t>score['duration']-.6:continue
 if any(abs(v['time']-t)<.50 for v in selected):continue
 if any(h['time']-.65<t<h['time']+h['duration']+.6 for h in holds):continue
 selected.append({**e,'rawTime':raw,'time':t})
selected.sort(key=lambda e:e['time']);print('qualified',len(selected));print([(e['time'],e['strength'],round(min(abs(e['time']-n['time']) for n in notes),3),min(notes,key=lambda n:abs(e['time']-n['time']))['kind']) for e in selected],flush=True)
(out/'gong-qualified.json').write_text(json.dumps(selected,indent=2))

import json,numpy as np
from pathlib import Path
out=root/'output/audio-analysis/v23';score=json.loads((out/'baseline-v22.json').read_text());notes=score['notes'];events=json.loads((out/'gong-qualified.json').read_text());changes=[]
for e in events:
 if e['strength']<1.6:continue
 t=e['time'];near=min(notes,key=lambda n:abs(n['time']-t));delta=abs(near['time']-t);other=[n for n in notes if n is not near]
 if near['kind']=='gong' and delta<=.11:
  if any(.0001<abs(n['time']-t)<.205 for n in other):continue
  changes.append({'action':'retime','from':near['time'],'time':t,'evidence':e});near['time']=t;near['gongAlignedV23']=True;continue
 if near['kind']=='wood' and delta<=.05:
  changes.append({'action':'revoice','from':near['kind'],'time':near['time'],'evidence':e});near['kind']='gong';near['gongAlignedV23']=True;continue
 if delta<=.045 and near['kind'] in ['drum','cymbal']:
  # Two audible layers share one playable beat. Preserve the measured anchor;
  # never create a fussy 20-ms flam or more than two simultaneous inputs.
  if sum(abs(n['time']-near['time'])<.0001 for n in notes)>1:continue
  t=near['time'];action='chord'
 elif delta>=.23:action='add'
 else:continue
 if sum(abs(n['time']-t)<.5 for n in notes)>=4:continue
 n={'time':t,'kind':'gong','duration':0,'stage':min(5,sum(t>=s for s in score['sections'][1:])),'strength':e['strength'],'accent':.98,'band':'metal-template','added':True,'addedV23':True,'heightRatio':.82,'lane':0}
 notes.append(n);changes.append({'action':action,'time':t,'evidence':e})
notes.sort(key=lambda n:n['time']);free=[-2.]*4
for n in notes:
 n['stage']=min(5,sum(n['time']>=s for s in score['sections'][1:]));pool=[i for i in range(4) if free[i]<=n['time']];assert pool,n
 n['lane']=min(pool,key=lambda i:free[i]);free[n['lane']]=n['time']+n['duration']+(.65 if n.get('added') else .86)
score['version']=6;score['method']='V23: V22 onset chart plus reference-gong spectral activation, independent metallic attack refinement and decay evidence. At most two simultaneous inputs on distinct random lanes. Mixed-audio instrument identity remains inferred.'
header=json.dumps({k:v for k,v in score.items() if k!='notes'},ensure_ascii=False,indent=2)[:-2];source=header+',\n  "notes": [\n'+',\n'.join('    '+json.dumps(n,ensure_ascii=False,separators=(',',':')) for n in notes)+'\n  ]\n}'
(root/'score.js' if args.write_score else out/'score-preview.js').write_text("/* V23 gong accents and two-note chords. See RHYTHM-V23.md. */\n'use strict';\nconst RECORDING_SCORE = "+source+';\n',encoding='utf-8')
report={'total':len(notes),'gongCount':sum(n['kind']=='gong' for n in notes),'actions':{k:sum(c['action']==k for c in changes) for k in ['retime','revoice','chord','add']},'changes':changes,'chordTimes':[n['time'] for i,n in enumerate(notes) if i and n['time']==notes[i-1]['time']]}
(out/'gong-score-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
