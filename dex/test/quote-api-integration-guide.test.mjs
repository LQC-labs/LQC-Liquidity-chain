import assert from "node:assert/strict";
import fs from "node:fs";

const guide = fs.readFileSync(new URL("../docs/QUOTE_API_INTEGRATION_KO.md", import.meta.url), "utf8");

describe("LQC quote API partner integration guide", function () {
  it("links every implementation artifact and fixes the safe integration order", function () {
    for (const file of ["quote-api-openapi.json", "quote-api-gateway.mjs", "quote-api-http.mjs", "quote-api-client.mjs"])
      assert.match(guide, new RegExp(file.replaceAll(".", "\\.")));
    const ordered = guide.slice(guide.indexOf("## 필수 연동 순서"), guide.indexOf("## 안전한 클라이언트 예시"));
    const steps = ["GET /v1/capabilities", "GET /v1/health", "POST /v1/quote", "requestHash", "Best Execution Proof", "지갑 서명"];
    for (let index = 1; index < steps.length; index++) assert.ok(ordered.indexOf(steps[index - 1]) < ordered.indexOf(steps[index]));
  });

  it("documents bounded retries, transport limits, and non-custodial separation", function () {
    for (const requirement of ["최대 2회", "32KB", "256KB", "Content-Length", "no-store", "nosniff",
      "개인키 보관", "거래 제출", "자산 수탁", "체인 `97`"]) assert.ok(guide.includes(requirement), requirement);
  });

  it("contains placeholders only and no credential-shaped example", function () {
    assert.ok(guide.includes("process.env.LQC_QUOTE_API_KEY"));
    assert.equal(/Bearer\s+[A-Za-z0-9_-]{16,}/.test(guide), false);
    assert.equal(/0x[0-9a-fA-F]{64}/.test(guide), false);
  });
});
