const http = require('http');
const https = require('https');

const endpoints = [
  '/mainnet/identities',
  '/mainnet/identities/moonpay',
  '/mainnet/identities/moonpay/icon.png',
  '/mainnet/accounts',
  '/mainnet/accounts/erd1qqqqqqqqqqqqqpgqqq0g2p5a0shf5v8eht5yuhv33udex9v9d8ssj46nps',
  '/mainnet/accounts/erd1qqqqqqqqqqqqqpgqqq0g2p5a0shf5v8eht5yuhv33udex9v9d8ssj46nps/icon.png',
  '/mainnet/tokens',
  '/mainnet/tokens/WEGLD-bd4d79',
  '/mainnet/tokens/WEGLD-bd4d79/icon.png'
];

async function fetchUrl(urlStr) {
  return new Promise((resolve, reject) => {
    const lib = urlStr.startsWith('https') ? https : http;
    const req = lib.get(urlStr, (res) => {
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

function extractSchema(obj) {
  if (obj === null) return 'null';
  if (Array.isArray(obj)) {
    return `Array<${obj.length > 0 ? extractSchema(obj[0]) : 'unknown'}>`;
  }
  if (typeof obj === 'object') {
    const schema = {};
    for (const key in obj) {
      schema[key] = extractSchema(obj[key]);
    }
    return schema;
  }
  return typeof obj;
}

async function main() {
  for (const endpoint of endpoints) {
    console.log(`\nTesting ${endpoint}...`);
    const localUrl = `http://localhost:3000/assets-cdn${endpoint}`;
    const remoteUrl = `https://tools.multiversx.com/assets-cdn${endpoint}`;
    
    try {
      const [localRes, remoteRes] = await Promise.all([
        fetchUrl(localUrl).catch(e => ({ error: e.message })),
        fetchUrl(remoteUrl).catch(e => ({ error: e.message }))
      ]);

      if (localRes.error || remoteRes.error) {
        console.log(`Local Error: ${localRes.error}`);
        console.log(`Remote Error: ${remoteRes.error}`);
        continue;
      }

      console.log(`Status: Local=${localRes.statusCode}, Remote=${remoteRes.statusCode}`);
      console.log(`Content-Type: Local=${localRes.headers['content-type']}, Remote=${remoteRes.headers['content-type']}`);
      
      if (localRes.isJson && remoteRes.isJson) {
        let localData, remoteData;
        try {
            localData = JSON.parse(localRes.data.toString());
        } catch(e) {
            console.log("Failed to parse local data:", localRes.data.toString().slice(0, 100));
        }
        try {
            remoteData = JSON.parse(remoteRes.data.toString());
        } catch(e) {
            console.log("Failed to parse remote data:", remoteRes.data.toString().slice(0, 100));
        }
        
        if (localData && remoteData) {
            const localSchema = extractSchema(localData);
            const remoteSchema = extractSchema(remoteData);
            const schemaMatch = JSON.stringify(localSchema) === JSON.stringify(remoteSchema);
            console.log(`Schema match: ${schemaMatch}`);
            if (!schemaMatch) {
              console.log('Local schema:', JSON.stringify(localSchema, null, 2));
              console.log('Remote schema:', JSON.stringify(remoteSchema, null, 2));
            }
        }
      } else if (!localRes.isJson && !remoteRes.isJson) {
          console.log(`Is Image/Binary. Local size=${localRes.data.length}, Remote size=${remoteRes.data.length}`);
      } else {
          console.log(`Mismatch in response types!`);
      }
    } catch (error) {
      console.error(`Failed to test ${endpoint}:`, error);
    }
  }
}

main();
