import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Pyth deploy page initialization recovery",()=>{
  const s=fs.readFileSync(path.join(root,"app","futures","futures-pyth-testnet-deploy.js"),"utf8");
  it("binds TokenPocket controls before loading runtime artifacts",()=>{
    assert.ok(s.indexOf('$("connect").onclick') < s.indexOf("await loadArtifacts()"));
  });
  it("surfaces artifact loading failures instead of leaving a dead button",()=>{
    assert.match(s,/배포 artifact 로딩 실패/);
  });
});