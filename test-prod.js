const https = require('https');

const endpoints = [
  '/identities',
  '/identities/moonpay',
  '/identities/moonpay/icon.png',
  '/accounts',
  '/accounts/erd1qqqqqqqqqqqqqpgqqq0g2p5a0shf5v8eht5yuhv33udex9v9d8ssj46nps',
  '/accounts/erd1qqqqqqqqqqqqqpgqqq0g2p5a0shf5v8eht5yuhv33udex9v9d8ssj46nps/icon.png',
  '/tokens',
  '/tokens/WEGLD-bd4d79',
  '/tokens/WEGLD-bd4d79/icon.png'
];

async function fetchUrl(urlStr) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: buffer,
          isJson: res.headers['content-type']?.includes('application/json')
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function main() {
  console.log("Testing production API without /mainnet prefix:\n");
  for (const endpoint of endpoints) {
    const remoteUrl = `https://tools.multiversx.com/assets-cdn${endpoint}`;
    
    try {
      const res = await fetchUrl(remoteUrl);
      console.log(`Endpoint: ${endpoint}`);
      console.log(`Status: ${res.statusCode}`);
      console.log(`Content-Type: ${res.headers['content-type']}`);
      
      if (res.isJson && res.statusCode !== 200) {
         console.log(`Response: ${res.data.toString().slice(0, 150)}`);
      } else if (res.statusCode === 200 && !res.isJson) {
         console.log(`Image returned successfully. Size: ${res.data.length}`);
      }
      console.log("------------------------------------------");
    } catch (error) {
      console.error(`Failed to test ${endpoint}:`, error.message);
    }
  }
}

main();
