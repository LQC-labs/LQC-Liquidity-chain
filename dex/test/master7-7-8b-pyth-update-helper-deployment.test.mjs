import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");

describe("7/7-8B Pyth update helper deployment packet",()=>{
  it("pins chain 97 and Pyth Core",()=>{
    const s=fs.readFileSync(path.join(root,"scripts","preflight-master7-7-8b-pyth-update-helper-deployment.mjs"),"utf8");
    assert.match(s,/chainId!==97n/);
    assert.match(s,/0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb/i);
  });
  it("builds current helper artifact with no governance authority",()=>{
    const b=fs.readFileSync(path.join(root,"scripts","build-master7-7-8b-pyth-update-helper-deployment-packet.mjs"),"utf8");
    assert.match(b,/LQCPythUpdateHelper/);
    assert.match(b,/governanceAuthority:false/);
    assert.match(b,/priceSettingAuthority:false/);
    assert.match(b,/withdrawalAuthority:false/);
  });
  it("keeps deployment and activation unauthorized",()=>{
    const s=fs.readFileSync(path.join(root,"scripts","preflight-master7-7-8b-pyth-update-helper-deployment.mjs"),"utf8");
    assert.match(s,/deploymentAuthorized:false/);
    assert.match(s,/activationAuthorized:false/);
    assert.match(s,/transactionOccurred:false/);
  });
});