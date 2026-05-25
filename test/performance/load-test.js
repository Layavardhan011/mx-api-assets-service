import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://localhost:3201";
const isRateLimited = __ENV.DISABLE_RATE_LIMIT !== "true";

const errorRate = new Rate("errors");
const tokenTrend = new Trend("token_assets_duration");
const identityTrend = new Trend("identity_assets_duration");
const accountTrend = new Trend("account_assets_duration");
const iconTrend = new Trend("icon_duration");
const healthTrend = new Trend("health_duration");

export const options = {
  stages: [
    { duration: "10s", target: 10 },
    { duration: "20s", target: 50 },
    { duration: "10s", target: 100 },
    { duration: "30s", target: 100 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    errors: isRateLimited ? ["rate<0.95"] : ["rate<0.05"],
    http_req_duration: ["p(95)<5000"],
    token_assets_duration: ["p(95)<5000"],
    identity_assets_duration: ["p(95)<5000"],
    icon_duration: ["p(95)<3000"],
  },
};

const allowedStatuses = isRateLimited
  ? [200, 429]
  : [200];
const successMsg = isRateLimited
  ? "status is 200 or 429"
  : "status is 200";

function isValidResponse(res) {
  if (res.status === 429) {
    return true;
  }
  if (res.status !== 200) {
    return false;
  }
  return true;
}

export default function () {
  group("health", function () {
    const res = http.get(`${baseUrl}/health`);
    const ok = check(res, {
      [successMsg]: (r) => allowedStatuses.includes(r.status),
    });
    errorRate.add(!ok);
    healthTrend.add(res.timings.duration);
  });

  group("tokens", function () {
    const res = http.get(`${baseUrl}/assets-cdn/mainnet/tokens`, {
      headers: { "Accept": "application/json" },
    });
    if (res.status === 429) {
      errorRate.add(false);
      tokenTrend.add(res.timings.duration);
      return;
    }
    let isArray = false;
    try {
      isArray = Array.isArray(res.json());
    } catch {
      isArray = false;
    }
    const ok = check(res, {
      [successMsg]: (r) => allowedStatuses.includes(r.status),
      "tokens response is array when 200": (r) => r.status !== 200 || isArray,
    });
    errorRate.add(!ok);
    tokenTrend.add(res.timings.duration);
  });

  group("identities", function () {
    const res = http.get(`${baseUrl}/assets-cdn/mainnet/identities`, {
      headers: { "Accept": "application/json" },
    });
    if (res.status === 429) {
      errorRate.add(false);
      identityTrend.add(res.timings.duration);
      return;
    }
    let isArray = false;
    try {
      isArray = Array.isArray(res.json());
    } catch {
      isArray = false;
    }
    const ok = check(res, {
      [successMsg]: (r) => allowedStatuses.includes(r.status),
      "identities response is array when 200": (r) => r.status !== 200 || isArray,
    });
    errorRate.add(!ok);
    identityTrend.add(res.timings.duration);
  });

  group("icons", function () {
    const res = http.get(`${baseUrl}/assets-cdn/mainnet/tokens/WEGLD-bd4d79/icon.png`, {
      responseType: "binary",
    });
    if (res.status === 429) {
      errorRate.add(false);
      iconTrend.add(res.timings.duration);
      return;
    }
    const ok = check(res, {
      [successMsg]: (r) => allowedStatuses.includes(r.status),
    });
    errorRate.add(!ok);
    iconTrend.add(res.timings.duration);
  });

  sleep(1);
}
