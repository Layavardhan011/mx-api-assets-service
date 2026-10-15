# MultiversX Assets CDN - Production Deployment & Edge Caching Guide

This guide documents the **2 mandatory infrastructure requirements** that must be executed at the time of deployment to achieve full production readiness, matching the official `tools.multiversx.com/assets-cdn` architecture.

---

## 🚨 Mandatory Deployment-Time Requirements

```mermaid
flowchart TD
    subgraph "External Internet"
        User[Public Users / Wallets / dApps]
    end

    subgraph "Edge CDN Layer (Requirement 1)"
        Cloudflare["Cloudflare / Edge CDN
        - Proxies Public Domain
        - Caches 3 MB JSON Collections
        - Caches PNG / SVG Icons
        - Absorbs 99% of Traffic"]
    end

    subgraph "Ingress & VPC Boundary (Requirement 2)"
        Ingress["Kubernetes Ingress / Docker Gateway"]
    end

    subgraph "Internal Cluster VPC"
        Prometheus["Internal Prometheus Scraper"]
    end

    subgraph "Application Pod (mx-api-assets-service)"
        Port3004["Public Port 3004: PublicAppModule
        - /assets-cdn/*
        - /health & /ready"]
        
        Port4004["Private Port 4004: PrivateAppModule
        - /metrics (Prometheus stats)
        - /hello"]
    end

    User -->|1. Public Requests| Cloudflare
    Cloudflare -->|2. Cache Miss Only| Ingress
    Ingress -->|3. Routes ONLY to Port 3004| Port3004
    
    Prometheus -->|Internal ClusterIP Only| Port4004
    User -.->|BLOCKED (Ingress has no route)| Port4004
```

---

### Requirement 1: The Multi-Megabyte Bandwidth Risk (Edge CDN Required)

- **The Issue:** `GET /assets-cdn/mainnet/tokens` returns a **~3 MB JSON payload** containing all ecosystem token metadata.
- **Why It Matters:** Under load tests, serving just 179 requests/second consumed **84.6 MB/s (~680 Mbps)** of raw network bandwidth and heavy V8 JSON serialization CPU on a single Node.js worker.
- **Production Requirement:** Official MultiversX (`tools.multiversx.com`) never serves these high-volume requests directly from Node.js; it sits behind **Cloudflare Edge Cache** (`server: cloudflare`, `cf-cache-status: HIT`), which absorbs 99%+ of all asset traffic.
- **Action Needed at Deployment:** Place an edge CDN (Cloudflare, CloudFront, or Fastly) in front of the service so that requests for collections and images are served directly from global edge caches, shielding the origin server.

---

### Requirement 2: Dual-Port Ingress Isolation (Port 4004 vs. Port 3004)

- **The Issue:** The application starts two separate HTTP listeners by design:
  - **Port 3004:** Public API Gateway (`/assets-cdn/*`, `/health`, `/ready`).
  - **Port 4004:** Private Operations Gateway (`/metrics` for Prometheus, `/hello`).
- **Why It Matters:** If your Kubernetes Ingress or Docker port mapping exposes port `4004` to the public internet, anonymous attackers can scrape internal Prometheus metrics, Node.js memory allocations, and event-loop statistics.
- **Production Requirement:** Port `4004` must remain strictly private within the internal cluster VPC for internal Prometheus scrapers.
- **Action Needed at Deployment:** Your Kubernetes Ingress rule must strictly bind public traffic **only to port 3004**, keeping port `4004` isolated.

#### Example Kubernetes Ingress Configuration:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mx-assets-cdn-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
  - host: assets.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: mx-api-assets-service
            port:
              number: 3004    # <--- EXPOSE ONLY PORT 3004 TO PUBLIC TRAFFIC
```

#### Example Docker Port Binding:
```yaml
ports:
  - "3004:3004"               # <--- Public traffic allowed
  - "127.0.0.1:4004:4004"     # <--- Private metrics bound ONLY to localhost
```

---

## 🛠 Cloudflare Edge Cache Configuration Steps

### 1. Cloudflare Cache Rules (Recommended)

Navigate to **Caching > Cache Rules** in the Cloudflare Dashboard and create the following rule:

#### Rule: Edge Cache MultiversX Assets CDN
- **Rule Name:** `Cache MultiversX Assets CDN`
- **When incoming requests match:**
  - Field: `URI Path`
  - Operator: `starts_with`
  - Value: `/assets-cdn`
- **Then:**
  - **Eligible for cache:** `Eligible`
  - **Edge TTL:** `Respect origin` *(Origin sends `Cache-Control: public, max-age=300` / `max-age=3600`)*
  - **Browser TTL:** `Respect origin`
  - **Serve stale content while revalidating:** `Enabled`
  - **Origin Error Pass-through:** `Enabled`

---

### 2. Cloudflare Page Rules (Alternative / Legacy)

If using Cloudflare Page Rules instead of Cache Rules:
- **URL Pattern:** `*yourdomain.com/assets-cdn/*`
- **Settings:**
  - **Cache Level:** `Cache Everything`
  - **Edge Cache TTL:** `4 hours` (or `Respect Existing Headers`)
  - **Browser Cache TTL:** `5 minutes`
  - **Origin Cache Control:** `On`

---

### 3. Rate Limiting Rule (WAF Protection)

Navigate to **Security > WAF > Rate limiting rules**:
- **Rule Name:** `Assets CDN Rate Limit`
- **When incoming requests match:** `(http.request.uri.path starts_with "/assets-cdn")`
- **Requests:** `1,000 requests per 10 seconds` per IP
- **Action:** `Managed Challenge` or `Block` (Period: 10 minutes)

---

### 4. Verification

After configuring Cloudflare, verify with curl:
```bash
curl -I https://yourdomain.com/assets-cdn/mainnet/tokens
```

Expected response headers indicating edge caching is active:
```http
cf-cache-status: HIT
cache-control: public, max-age=300
strict-transport-security: max-age=31536000; includeSubDomains
server: cloudflare
```
*(Notice `cf-cache-status: HIT` confirming Cloudflare served the 3 MB payload directly from edge memory).*
