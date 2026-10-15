const http = require("http");
const { performance } = require("perf_hooks");

const BASE_URL = process.env.BASE_URL || "http://localhost:3004";

// Helper for making requests
function request(method, path, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const start = performance.now();
    const req = http.request(
      url,
      {
        method,
        headers: {
          Host: "localhost:3004",
          ...headers,
        },
        timeout: 5000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          const duration = performance.now() - start;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
            duration,
            error: null,
          });
        });
      }
    );

    req.on("error", (err) => {
      resolve({
        status: 0,
        headers: {},
        body: "",
        duration: performance.now() - start,
        error: err.message,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        status: 0,
        headers: {},
        body: "",
        duration: performance.now() - start,
        error: "TIMEOUT",
      });
    });

    req.end();
  });
}

// 1. Invalid Input & Fuzzing Matrix
async function runInvalidInputSuite() {
  console.log("=== RUNNING PHASE 5 & 6: INVALID INPUT & FUZZ TEST SUITE ===");

  const testCases = [
    // A. Missing inputs & Root
    { name: "Root endpoint (GET /)", method: "GET", path: "/", expectedStatus: 404 },
    { name: "Empty network (GET /assets-cdn//tokens)", method: "GET", path: "/assets-cdn//tokens", expectedStatus: 404 },
    { name: "Whitespace network", method: "GET", path: "/assets-cdn/%20/tokens", expectedStatus: 400 },
    
    // B. Invalid types / unknown network
    { name: "Invalid network name 'polygon'", method: "GET", path: "/assets-cdn/polygon/tokens", expectedStatus: 400 },
    { name: "Numeric network name '1234'", method: "GET", path: "/assets-cdn/1234/tokens", expectedStatus: 400 },
    
    // C. Malformed token identifiers
    { name: "Overlong token identifier (>100 chars)", method: "GET", path: `/assets-cdn/mainnet/tokens/${"A".repeat(120)}`, expectedStatus: 400 },
    { name: "Special characters in token ID ($%^&*)", method: "GET", path: "/assets-cdn/mainnet/tokens/TOKEN%24%25%5E/icon.png", expectedStatus: 400 },
    { name: "Directory traversal in token ID (../../etc/passwd)", method: "GET", path: "/assets-cdn/mainnet/tokens/..%2F..%2Fetc%2Fpasswd/icon.png", expectedStatus: 400 },
    { name: "Backslash traversal in token ID (..\\..\\win)", method: "GET", path: "/assets-cdn/mainnet/tokens/..%5C..%5Cwin/icon.png", expectedStatus: 400 },
    { name: "Null byte in token identifier (%00)", method: "GET", path: "/assets-cdn/mainnet/tokens/TOKEN%00XYZ/icon.png", expectedStatus: 400 },

    // D. Malformed address parameter
    { name: "Non-bech32 address (erd1invalid)", method: "GET", path: "/assets-cdn/mainnet/accounts/erd1invalid", expectedStatus: 400 },
    { name: "Hex address where bech32 expected (0x1234...)", method: "GET", path: "/assets-cdn/mainnet/accounts/0x1234567890abcdef", expectedStatus: 400 },
    { name: "Overlong address (>100 chars)", method: "GET", path: `/assets-cdn/mainnet/accounts/erd1${"a".repeat(100)}`, expectedStatus: 400 },

    // E. Unsupported icon extensions
    { name: "Unsupported extension .gif", method: "GET", path: "/assets-cdn/mainnet/tokens/WEGLD-bd4d79/icon.gif", expectedStatus: 400 },
    { name: "Unsupported extension .exe", method: "GET", path: "/assets-cdn/mainnet/tokens/WEGLD-bd4d79/icon.exe", expectedStatus: 400 },
    { name: "Unsupported extension .jpg", method: "GET", path: "/assets-cdn/mainnet/tokens/WEGLD-bd4d79/icon.jpg", expectedStatus: 400 },

    // F. Injection vectors
    { name: "SQL injection payload in token identifier (' OR 1=1--)", method: "GET", path: "/assets-cdn/mainnet/tokens/'%20OR%201=1--", expectedStatus: 400 },
    { name: "XSS payload in query param (?default=<script>)", method: "GET", path: "/assets-cdn/mainnet/tokens/WEGLD-bd4d79/icon.png?default=%3Cscript%3Ealert(1)%3C/script%3E", expectedStatus: 200 },
    { name: "Prototype pollution attempt in identifier (__proto__)", method: "GET", path: "/assets-cdn/mainnet/tokens/__proto__", expectedStatus: 400 },
    { name: "Constructor pollution attempt in identifier (constructor)", method: "GET", path: "/assets-cdn/mainnet/tokens/constructor", expectedStatus: 400 },

    // G. Unexpected HTTP methods
    { name: "POST method on read-only endpoint", method: "POST", path: "/assets-cdn/mainnet/tokens", expectedStatus: 404 },
    { name: "DELETE method on asset endpoint", method: "DELETE", path: "/assets-cdn/mainnet/tokens/WEGLD-bd4d79", expectedStatus: 404 },
    { name: "PUT method on asset endpoint", method: "PUT", path: "/assets-cdn/mainnet/tokens/WEGLD-bd4d79", expectedStatus: 404 },
  ];

  const results = [];
  for (const tc of testCases) {
    const res = await request(tc.method, tc.path);
    const pass = res.status === tc.expectedStatus || (tc.expectedStatus === 400 && [400, 404].includes(res.status));
    results.push({
      name: tc.name,
      method: tc.method,
      path: tc.path,
      expected: tc.expectedStatus,
      observed: res.status,
      durationMs: res.duration.toFixed(2),
      pass,
    });
  }

  console.table(results);
  return results;
}

// 2. Load and Performance Benchmarks
async function runLoadStage(connections, durationSeconds, targetPath) {
  const { promisify } = require("util");
  const exec = promisify(require("child_process").exec);

  const url = `${BASE_URL}${targetPath}`;
  const cmd = `npx autocannon -c ${connections} -d ${durationSeconds} --json "${url}"`;

  try {
    const { stdout } = await exec(cmd);
    const data = JSON.parse(stdout);
    return {
      concurrency: connections,
      rps: data.requests.average,
      totalRequests: data.requests.total,
      throughputMb: (data.throughput.total / (1024 * 1024)).toFixed(2),
      p50: data.latency.p50,
      p90: data.latency.p90,
      p95: data.latency.p97_5 || data.latency.p99,
      p99: data.latency.p99,
      status2xx: data["2xx"] || 0,
      status4xx: data["4xx"] || 0,
      status5xx: data["5xx"] || 0,
      timeouts: data.timeouts || 0,
      non2xx: data.non2xx || 0,
    };
  } catch (err) {
    return {
      concurrency: connections,
      error: err.message,
    };
  }
}

async function main() {
  const invalidResults = await runInvalidInputSuite();

  console.log("\n=== RUNNING PHASE 7: LOAD & PERFORMANCE BENCHMARK MATRIX ===");
  console.log("Testing cached asset icon endpoint: /assets-cdn/mainnet/tokens/WEGLD-bd4d79/icon.png");

  const concurrencyLevels = [1, 5, 10, 25, 50, 100];
  const loadResults = [];

  for (const c of concurrencyLevels) {
    console.log(`Executing stage: Concurrency = ${c} (duration: 5s)...`);
    const stageRes = await runLoadStage(c, 5, "/assets-cdn/mainnet/tokens/WEGLD-bd4d79/icon.png");
    loadResults.push(stageRes);
  }

  console.log("\n--- CACHE HIT LOAD TEST RESULTS (ASSET ICON) ---");
  console.table(loadResults);

  console.log("\nTesting large collection JSON endpoint: /assets-cdn/mainnet/tokens (Concurrency 10)...");
  const collectionLoad = await runLoadStage(10, 5, "/assets-cdn/mainnet/tokens");
  console.table([collectionLoad]);

  // Output JSON for the report
  const output = {
    invalidInputResults: invalidResults,
    loadResults,
    collectionLoad,
  };

  require("fs").writeFileSync(
    "/home/laya/Mx-Devnet/Micro-services/mx-api-assets-service/test/performance/load-results.json",
    JSON.stringify(output, null, 2)
  );
  console.log("\nResults written to test/performance/load-results.json");
}

main().catch(console.error);
