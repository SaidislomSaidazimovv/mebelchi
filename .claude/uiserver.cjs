const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/buzruk/Documents/Mebelchi/UI Exploration';
const TYPES = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/v5-live.html';
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'});
    res.end(data);
  });
}).listen(8807, () => console.log('ui server on 8807'));
