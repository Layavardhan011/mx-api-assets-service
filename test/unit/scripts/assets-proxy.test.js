const { getGithubPath, getRawUrl, resolveParams, networkMap } = require("../../../libs/common/src/assets-cdn/utils/path-resolver.utils")

describe("assets-proxy dev-helper", () => {
  describe("resolveParams", () => {
    it("should resolve explicit network (devnet)", () => {
      const result = resolveParams({ p1: "devnet", p2: "tokens", p3: "ABC" })
      expect(result).toEqual({ network: "devnet", type: "tokens", id: "ABC" })
    })

    it("should resolve explicit network (testnet)", () => {
      const result = resolveParams({ p1: "testnet", p2: "accounts", p3: "0x123" })
      expect(result).toEqual({ network: "testnet", type: "accounts", id: "0x123" })
    })

    it("should default to mainnet if p1 is not a network", () => {
      const result = resolveParams({ p1: "tokens", p2: "ABC" })
      expect(result).toEqual({ network: "mainnet", type: "tokens", id: "ABC" })
    })
  })

  describe("getGithubPath", () => {
    it("should return correct path for devnet tokens", () => {
      expect(getGithubPath("devnet", "tokens", "ABC")).toBe("devnet/tokens/ABC/info.json")
    })

    it("should return correct path for testnet accounts", () => {
      expect(getGithubPath("testnet", "accounts", "0x123")).toBe("testnet/accounts/0x123.json")
    })

    it("should return correct path for mainnet identities", () => {
      expect(getGithubPath("mainnet", "identities", "ID1")).toBe("identities/ID1/info.json")
    })
  })

  describe("getRawUrl", () => {
    it("should return raw URL for token icons", () => {
      const url = getRawUrl("devnet", "tokens", "ABC", "logo.png", "https://raw.githubusercontent.com/owner/repo/branch")
      expect(url).toContain("/devnet/tokens/ABC/logo.png")
    })

    it("should handle special case for account icons", () => {
      const url = getRawUrl("testnet", "accounts", "0x123", "icons/myicon.png", "https://raw.githubusercontent.com/owner/repo/branch")
      expect(url).toContain("/testnet/accounts/icons/myicon.png")
    })
  })

  describe("networkMap", () => {
    it("should have correct mapping for mainnet", () => {
      expect(networkMap.mainnet).toBe("")
    })
    it("should have correct mapping for devnet", () => {
      expect(networkMap.devnet).toBe("devnet")
    })
  })
})
