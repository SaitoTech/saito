#!/usr/bin/env node
/* Local preview only. Production uses Saito's real GameTemplate and transport. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../../..');
const web = path.resolve(__dirname, '../web');
function bundle() {
  const modules = new Map();
  function add(file) {
    file = path.resolve(file);
    const id = path.relative(root, file).replaceAll('\\', '/');
    if (modules.has(id)) return id;
    let source = fs.readFileSync(file, 'utf8');
    modules.set(id, '');
    source = source.replace(/require\(['"]([^'"]+)['"]\)/g, (_, req) => {
      let dep = path.resolve(path.dirname(file), req);
      if (!path.extname(dep) || !fs.existsSync(dep)) dep += '.js';
      if (dep.endsWith('/lib/templates/gametemplate.js')) return 'window.SXPreview.GameTemplate';
      if (dep.endsWith('/lib/saito/ui/saito-overlay/saito-overlay.js')) return 'window.SXPreview.Overlay';
      return `require(${JSON.stringify(add(dep))})`;
    });
    modules.set(id, source);
    return id;
  }
  const entry = add(path.resolve(__dirname, '../settlersx.js'));
  const grid = add(path.join(root, 'lib/saito/ui/game-hexgrid/game-hexgrid.js'));
  return `(function(){const modules={${[...modules].map(([id,src]) => `${JSON.stringify(id)}:function(module,exports,require){\n${src}\n}`).join(',\n')}};const cache={};function require(id){if(!cache[id]){cache[id]={exports:{}};modules[id](cache[id],cache[id].exports,require);}return cache[id].exports;}window.SettlersX=require(${JSON.stringify(entry)});window.GameHexGrid=require(${JSON.stringify(grid)});})();`;
}
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.txt':'text/plain'};
const server = http.createServer((req,res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.writeHead(302,{Location:'/settlersx/preview.html'});res.end();return; }
    if (pathname === '/settlersx/preview-engine.js') {res.setHeader('Content-Type','text/javascript');res.end(bundle());return;}
    const file = path.resolve(web, '.' + pathname.replace(/^\/settlersx/, ''));
    if (!file.startsWith(web + path.sep)) {res.writeHead(403);res.end();return;}
    res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    res.end(fs.readFileSync(file));
  } catch (error) {res.writeHead(error.code === 'ENOENT' ? 404 : 500);res.end(error.message);}
});
const port = Number(process.env.PORT || 4174);
server.listen(port,'127.0.0.1',()=>console.log(`SettlersX preview: http://127.0.0.1:${port}/settlersx/preview.html`));
