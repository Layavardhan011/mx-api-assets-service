const { sanitize, getGithubPath, resolveParams } = require("../../../libs/common/src/assets-cdn/utils/path-resolver.utils")

describe("Security Sanitization Tests", () => {
  describe("sanitize()", () => {
    it("should reject path traversal characters (../) by returning empty string", () => {
      expect(sanitize("../../../etc/passwd")).toBe("")
    })

    it("should strip slashes from input", () => {
      expect(sanitize("/tokens/")).toBe("tokens")
    })

    it("should remove special characters that could interfere with URLs", () => {
      expect(sanitize("token@123!#$%")).toBe("token123")
    })

    it("should allow alphanumeric characters, hyphens, and underscores", () => {
      expect(sanitize("my-token_123")).toBe("my-token_123")
    })

    it("should handle empty or null input gracefully", () => {
      expect(sanitize("")).toBe("")
      expect(sanitize(null)).toBe("")
    })
  })

  describe("Path Traversal Protection", () => {
    it("should ensure resolved parameters are sanitized", () => {
      const unsafeParams = { 
        p1: "devnet", 
        p2: "../../tokens", 
        p3: "ABC/../../evil" 
      }
      
      const network = sanitize(unsafeParams.p1)
      const type = sanitize(unsafeParams.p2)
      const id = sanitize(unsafeParams.p3)
      
      const path = getGithubPath(network, type, id)
      
      expect(path).not.toContain("..")
      expect(path).not.toContain("tokens")
      expect(path).not.toContain("evil")
    })
  })
})
