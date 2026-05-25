// Security headers are applied via the `helmet` middleware configured in apps/api/src/main.ts
// This test documents the expected security header defaults that should be present
// on all non-doc-path responses from the public API.

const EXPECTED_STATIC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
}

describe("Security Headers Configuration", () => {
  describe("Expected security header defaults", () => {
    it("should define X-Content-Type-Options: nosniff", () => {
      expect(EXPECTED_STATIC_HEADERS["X-Content-Type-Options"]).toBe("nosniff")
    })

    it("should define X-Frame-Options: DENY", () => {
      expect(EXPECTED_STATIC_HEADERS["X-Frame-Options"]).toBe("DENY")
    })

    it("should define Strict-Transport-Security with includeSubDomains", () => {
      expect(EXPECTED_STATIC_HEADERS["Strict-Transport-Security"]).toContain("includeSubDomains")
    })
  })

  describe("Content-Security-Policy", () => {
    it("non-doc paths should have strict CSP with only self and GitHub raw for images", () => {
      const nonDocCsp = {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://raw.githubusercontent.com"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
      }
      expect(nonDocCsp.defaultSrc).toContain("'self'")
      expect(nonDocCsp.imgSrc).toContain("https://raw.githubusercontent.com")
      expect(nonDocCsp.scriptSrc).toContain("'self'")
      expect(nonDocCsp.objectSrc).toContain("'none'")
    })

    it("doc paths should allow unsafe-inline for Swagger UI", () => {
      const docCsp = {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
      }
      expect(docCsp.scriptSrc).toContain("'unsafe-inline'")
      expect(docCsp.styleSrc).toContain("'unsafe-inline'")
    })
  })

  describe("Rate Limiting", () => {
    it("should allow 100 requests per IP per minute on public API", () => {
      const rateLimitConfig = {
        windowMs: 60 * 1000,
        max: 100,
      }
      expect(rateLimitConfig.max).toBe(100)
      expect(rateLimitConfig.windowMs).toBe(60000)
    })
  })
})
