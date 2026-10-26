/* Rebuild the inline stylesheet after editing any of the retained CSS sources.
   Native Node only; runtime still needs no framework or build service. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function flatten(file){return fs.readFileSync(path.join(root,file),'utf8').replace(/@import\s+url\(['"]([^'"]+)['"]\);/g,(_,parent)=>flatten(parent)).replace(/@font-face\s*\{[^}]+\}/g,'');}
const preview=fs.readFileSync(path.join(root,'assets/cover-preview-v19.webp')).toString('base64');
const css=flatten('styles-v18.css')+fs.readFileSync(path.join(root,'styles-v21.css'),'utf8')+fs.readFileSync(path.join(root,'styles-v22.css'),'utf8')+fs.readFileSync(path.join(root,'styles-v26.css'),'utf8')+`\n/* Mobile startup / rendering V19 */
@font-face{font-family:ClassicSong;src:url('assets/fonts/aa-classic-song-ui-v27.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:ClassicSongNames;src:url('assets/fonts/aa-classic-song-names-v27.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap}
.cover-painting{background-image:url('assets/cover-painting-v19.webp'),url('data:image/webp;base64,${preview}')}
.modal-card:before{background-image:url('assets/modal-frame-v22.webp')}
#startup button{color:inherit;background:transparent;text-decoration:underline;padding:4px 8px}
`+fs.readFileSync(path.join(root,'styles-v27.css'),'utf8')+fs.readFileSync(path.join(root,'styles-v29.css'),'utf8')+fs.readFileSync(path.join(root,'styles-v30.css'),'utf8')+fs.readFileSync(path.join(root,'styles-v31.css'),'utf8')+fs.readFileSync(path.join(root,'styles-v32.css'),'utf8')+fs.readFileSync(path.join(root,'styles-v33.css'),'utf8');
const file=path.join(root,'index.html'),html=fs.readFileSync(file,'utf8');
fs.writeFileSync(file,html.replace(/<!-- styles:start -->[\s\S]*?<!-- styles:end -->/,'<!-- styles:start -->\n  <style>'+css+'</style>\n  <!-- styles:end -->'));
console.log('Inline CSS bytes',Buffer.byteLength(css));
