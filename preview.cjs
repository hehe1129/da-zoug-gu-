const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.json':'application/json; charset=utf-8'};
http.createServer((req,res)=>{
  let relative;
  try { relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  const target = path.resolve(root, '.' + (relative.endsWith('/') ? relative + 'index.html' : relative));
  if (!target.startsWith(root + path.sep) || relative.includes('/.git')) { res.writeHead(403).end(); return; }
  fs.readFile(target,(error,data)=>{
    if(error){res.writeHead(404).end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  });
}).listen(4173,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:4173'));
