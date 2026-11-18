self.window = self; // The vendor's browser export expects a window global.
importScripts('assets/vendor/jsfeat-0.0.8.js','ar-tracker.js?v=3','ar-flow.js?v=3');

let session;
self.onmessage = ({data}) => {
  if (data.targets) {
    const targets = ArTracker.prepare(data.targets);
    if (targets.some(target => target.points.length < 12)) throw new Error('Incomplete AR features');
    session=ArFlow.create(targets);
    self.postMessage({ready:true});
    return;
  }
  if (session && data.frame) {
    const hit = session.update(data.frame);
    if(hit){
      const {id,kind,h,source}=hit;
      self.postMessage({hit:{id,kind,h,source}});
    } else self.postMessage({hit:null});
  }
};
