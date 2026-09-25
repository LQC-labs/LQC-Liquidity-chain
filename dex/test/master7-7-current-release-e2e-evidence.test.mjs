import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

describe("Master 7/7 chain-97 read-only evidence", () => {
  const wiring = fs.readFileSync(path.join(root, "scripts", "verify-futures-bsc-testnet.js"), "utf8");
  const readiness = fs.readFileSync(path.join(root, "scripts", "verify-master7-7-current-release-readiness.mjs"), "utf8");

  it("keeps chain-97 verification read-only", () => {
    assert.doesNotMatch(wiring, /getSigner\(|sendTransaction\(|wallet\.|new ethers\.Wallet|\.connect\(signer/i);
    assert.match(wiring, /transactionOccurred:\s*false/);
    assert.match(wiring, /deploymentAuthorized:\s*false/);
    assert.match(wiring, /activationAuthorized:\s*false/);
  });

  it("pins recorded Futures wiring addresses", () => {
    assert.match(wiring, /0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0/i);
    assert.match(wiring, /0xb532c65294a7b35ca510a7df025e934fa17c8d7e/i);
    assert.match(wiring, /0xe4f1320c8709631776c7e39e0916584935882525/i);
    assert.match(wiring, /0x89d992f696B40ABbDB6610144faeF336911D8175/i);
  });

  it("persists reproducible evidence with runtime code hashes", () => {
    assert.match(wiring, /futures-chain97-wiring-report\.json/);
    assert.match(wiring, /codeHash:\s*ethers\.keccak256\(code\)/);
    assert.match(wiring, /observedBlockNumber/);
    assert.match(wiring, /observedBlockTimestamp/);
  });

  it("pins exact commit and compiled artifact hashes", () => {
    assert.match(readiness, /testedCommitSha/);
    assert.match(readiness, /artifactFileSha256/);
    assert.match(readiness, /creationBytecodeSha256/);
    assert.match(readiness, /runtimeBytecodeSha256/);
    assert.match(readiness, /exactCommitPinned:\s*true/);
    assert.match(readiness, /compiledArtifactHashesPinned:\s*true/);
  });
});
