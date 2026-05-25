const { getGithubPath, resolveParams, networkMap } = require("../../../libs/common/src/assets-cdn/utils/path-resolver.utils")

describe("Core Functionality Tests", () => {
  describe("Network Mapping Logic", () => {
    it("should correctly map all known networks", () => {
      expect(networkMap.mainnet).toBe("")
      expect(networkMap.devnet).toBe("devnet")
      expect(networkMap.testnet).toBe("testnet")
    })

    it("should handle unknown networks as undefined in networkMap", () => {
      expect(networkMap["invalid-network"]).toBeUndefined()
    })
  })

  describe("Asset Type Formatting", () => {
    it("should use .json extension for accounts directly", () => {
      const path = getGithubPath("mainnet", "accounts", "erd1abc")
      expect(path).toBe("accounts/erd1abc.json")
    })

    it("should use info.json subfolder for tokens", () => {
      const path = getGithubPath("mainnet", "tokens", "TOKEN-123")
      expect(path).toBe("tokens/TOKEN-123/info.json")
    })

    it("should use info.json subfolder for identities", () => {
      const path = getGithubPath("mainnet", "identities", "my-id")
      expect(path).toBe("identities/my-id/info.json")
    })
  })

  describe("Resolution Edge Cases", () => {
    it("should handle missing optional parameters in resolveParams", () => {
      const result = resolveParams({ p1: "tokens", p2: "EGLD-123" })
      expect(result).toEqual({
        network: "mainnet",
        type: "tokens",
        id: "EGLD-123"
      })
    })

    it("should prioritize explicit network if provided in p1", () => {
      const result = resolveParams({ p1: "testnet", p2: "tokens", p3: "TEST-1" })
      expect(result).toEqual({
        network: "testnet",
        type: "tokens",
        id: "TEST-1"
      })
    })
  })
})
