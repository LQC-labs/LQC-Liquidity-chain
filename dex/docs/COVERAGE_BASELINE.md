# LQC DEX Coverage Baseline

Status: **audit-preparation evidence for an unaudited testnet MVP**

Run the dependency-free Router SDK gate with:

```bash
cd dex
npm run coverage:router-sdk
```

The command uses Node's built-in V8 precise coverage, runs the Router SDK and deterministic
execution-proof invariant suites, prints function and executed-range measurements, and fails unless
Router SDK function coverage is 100% and executed-range coverage is at least 90%. The reviewed
baseline is **100% functions (35/35)** and **90.04% executed ranges (217/241)**. The temporary raw
coverage directory is deleted after the run.

Executed-range percentage is a V8-native regression gate. It is not described as branch, statement,
or Solidity coverage. A Solidity-aware instrumented
coverage tool, fork testing, and critical-contract branch coverage target of at least 90% remain
required before an external audit readiness claim.
