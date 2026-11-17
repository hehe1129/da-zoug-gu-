self.window = self; // The vendor's browser export expects a window global.
importScripts('assets/vendor/jsfeat-0.0.8.js','ar-tracker.js?v=1');

let targets;
self.onmessage = ({data}) => {
  if (data.targets) {
    targets = ArTracker.prepare(data.targets);
    if (targets.some(target => target.points.length < 12)) throw new Error('Incomplete AR features');
    self.postMessage({ready:true});
    return;
  }
  if (targets && data.frame) {
    const hit = ArTracker.match(data.frame,targets);
    self.postMessage({hit});
  }
};
