const fs = require("fs")
const path = require("path")

describe("Build Artifacts Integrity Tests", () => {
  const distPath = path.join(__dirname, "../../dist")

  it("should have a dist directory", () => {
    expect(fs.existsSync(distPath)).toBe(true)
  })

  it("should contain the main entry point (index.html)", () => {
    const indexPath = path.join(distPath, "index.html")
    expect(fs.existsSync(indexPath)).toBe(true)
    
    const content = fs.readFileSync(indexPath, "utf8")
    expect(content).toContain("<!DOCTYPE html>")
    expect(content).toContain("swagger-ui")
  })

  it("should contain the Swagger UI bundle", () => {
    const bundlePath = path.join(distPath, "swagger-ui-bundle.js")
    expect(fs.existsSync(bundlePath)).toBe(true)
    
    const stats = fs.statSync(bundlePath)
    expect(stats.size).toBeGreaterThan(1000000) // Bundle should be > 1MB
  })

  it("should contain the CSS stylesheet", () => {
    const cssPath = path.join(distPath, "swagger-ui.css")
    expect(fs.existsSync(cssPath)).toBe(true)
    
    const content = fs.readFileSync(cssPath, "utf8")
    expect(content).toContain(".swagger-ui")
  })

  it("should contain the proxy configuration (swagger.json)", () => {
    const jsonPath = path.join(distPath, "swagger.json")
    expect(fs.existsSync(jsonPath)).toBe(true)
    
    const content = JSON.parse(fs.readFileSync(jsonPath, "utf8"))
    expect(content.swagger || content.openapi).toBeDefined()
  })
})
