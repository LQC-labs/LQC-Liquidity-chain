import assert from "node:assert/strict";
import { buildReproducibilitySeal, verifyReproducibilitySeal } from "../scripts/build-reproducibility-seal.mjs";

const sha = character => `sha256:${character.repeat(64)}`;
const input = () => ({ sourceRevision: "a".repeat(40), nodeVersion: "v22.18.0", packageLockDigest: sha("b"),
  compiler: { version: "0.8.30+commit.73712a01.Emscripten.clang", optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "shanghai" },
  sourceFiles: [{ path: "contracts/Z.sol", digest: sha("c") }, { path: "app/router-sdk.js", digest: sha("d") }] });

describe("LQC reproducibility seal", function () {
  it("produces one deterministic seal independent of source input order", function () {
    const first = buildReproducibilitySeal(input());
    const reversed = input(); reversed.sourceFiles.reverse();
    assert.deepEqual(buildReproducibilitySeal(reversed), first);
    assert.match(first.sourceTreeDigest, /^sha256:[0-9a-f]{64}$/);
    assert.match(first.sealDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(verifyReproducibilitySeal(first), true);
  });

  it("detects changes to source, compiler, runtime, revision, and schemas", function () {
    const mutations = [
      seal => { seal.sourceFiles[0].digest = sha("e"); },
      seal => { seal.compiler.optimizer.runs = 201; },
      seal => { seal.runtime.packageLockDigest = sha("f"); },
      seal => { seal.sourceRevision = "1".repeat(40); },
      seal => { seal.schemas.executionIntent.requiredFields.pop(); }
    ];
    for (const mutate of mutations) {
      const seal = structuredClone(buildReproducibilitySeal(input())); mutate(seal);
      assert.equal(verifyReproducibilitySeal(seal), false);
    }
  });

  it("rejects malformed or ambiguous build inputs", function () {
    const duplicate = input(); duplicate.sourceFiles.push({ ...duplicate.sourceFiles[0] });
    assert.throws(() => buildReproducibilitySeal(duplicate), /Duplicate/);
    const unsafe = input(); unsafe.sourceFiles[0].path = "../secret";
    assert.throws(() => buildReproducibilitySeal(unsafe), /safe relative path/);
    const wrongCompiler = input(); wrongCompiler.compiler.viaIR = false;
    assert.throws(() => buildReproducibilitySeal(wrongCompiler), /Compiler/);
  });
});
