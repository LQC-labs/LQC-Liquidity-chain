import assert from "node:assert/strict";
import { STAGE2_PREDEPLOY_CHECKS, runStage2PredeployGate } from "../scripts/run-stage2-predeploy-gate.mjs";

describe("LQC Stage 2 predeployment gate", function () {
  it("runs the repository gate, dependency audit, and live preflight in order", function () {
    const calls = [];
    const status = runStage2PredeployGate({
      env: { TEST_MARKER: "reviewed" },
      spawn(command, args, options) {
        calls.push({ command, args, marker: options.env.TEST_MARKER, stdio: options.stdio });
        return { status: 0 };
      },
    });
    assert.equal(status, 0);
    assert.deepEqual(calls.map(call => call.args), STAGE2_PREDEPLOY_CHECKS.map(check => [...check.args]));
    assert.deepEqual(calls.map(call => call.marker), ["reviewed", "reviewed", "reviewed"]);
    assert.deepEqual(calls.map(call => call.stdio), ["inherit", "inherit", "inherit"]);
  });

  it("fails closed and never runs later checks after a failure", function () {
    const calls = [];
    const status = runStage2PredeployGate({
      spawn(command, args) {
        calls.push({ command, args });
        return { status: calls.length === 2 ? 7 : 0 };
      },
    });
    assert.equal(status, 7);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].args, ["audit", "--omit=dev", "--audit-level=high"]);
  });

  it("propagates process-launch errors instead of treating them as a pass", function () {
    const failure = new Error("spawn unavailable");
    assert.throws(() => runStage2PredeployGate({ spawn: () => ({ error: failure }) }), failure);
  });
});
