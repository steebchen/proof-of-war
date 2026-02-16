const http = require('http');

const KATANA_PORT = 5051;
const PROXY_PORT = 5050;

const proxy = http.createServer((req, res) => {
  // Add CORS and Private Network Access headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Proxy to Katana
  const options = {
    hostname: 'localhost',
    port: KATANA_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Copy headers and add CORS
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    res.writeHead(proxyRes.statusCode);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error('Proxy error:', e);
    res.writeHead(502);
    res.end('Proxy error');
  });

  req.pipe(proxyReq);
});

proxy.listen(PROXY_PORT, () => {
  console.log(`Proxy running on port ${PROXY_PORT} -> Katana on ${KATANA_PORT}`);
});
