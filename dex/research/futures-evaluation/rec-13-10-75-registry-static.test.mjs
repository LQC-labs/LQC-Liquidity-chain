import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// REC-13.10.75: structural evidence only. This does not execute EVM bytecode,
// reproduce StageOneBlocked, or authorize settlement or deployment.
const base = dirname(fileURLToPath(import.meta.url));
const contract = 'fixtures/local/contracts/futures/local-vnext/LocalFuturesReleaseVerifier.sol';
const sources = ['stored-exit-history', 'collection-consumption-fixture', 'funding-payout-fixture']
  .map((folder) => readFileSync(join(base, folder, contract)));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const source of sources.slice(1)) {
  assert.equal(sha256(source), sha256(sources[0]), 'ReleaseVerifier fixture divergence');
}

const text = sources[0].toString('utf8');
const artifact = JSON.parse(readFileSync(join(base, 'fixtures/artifact-records/LocalFuturesModularTradingDomainRegistry.json')));
assert.equal(artifact.contractName, 'LocalFuturesModularTradingDomainRegistry');
assert.equal(artifact.sourceName, 'contracts/futures/local-vnext/LocalFuturesModularTradingDomainRegistry.sol');
assert.match(artifact.deployedBytecode, /^0x[0-9a-fA-F]+$/);

const functions = new Map(artifact.abi.filter((x) => x.type === 'function').map((x) => [x.name, x]));
const requireFunction = (name, inputs, mutability) => {
  const fn = functions.get(name);
  assert.ok(fn, `Registry ABI missing ${name}`);
  assert.deepEqual(fn.inputs.map((input) => input.type), inputs, `${name} input mismatch`);
  assert.equal(fn.stateMutability, mutability, `${name} mutability mismatch`);
};
requireFunction('assertGeneralRelease', ['uint256', 'bytes4', 'bytes32'], 'view');
requireFunction('bindGeneralSettlementVerifier', ['address', 'bytes32'], 'nonpayable');
assert.ok(artifact.abi.some((item) => item.type === 'error' && item.name === 'StageOneBlocked'));

for (const selector of ['context', 'configureGeneralRelease', 'validateRelease']) {
  assert.ok(text.includes(`this.${selector}.selector`), `ReleaseVerifier missing ${selector} selector`);
}
assert.match(text, /IGeneralReleaseRegistry\(address\(core\.domainRegistry\(\)\)\)\.assertGeneralRelease/);
assert.match(text, /function productionEnabled\(\) external pure returns\(bool\)\{return false;\}/);
assert.match(text, /block\.chainid!=31337/);

console.log(JSON.stringify({
  work: 'REC-13.10.75',
  classification: 'STATIC_ABI_AND_SOURCE_ONLY',
  outcome: 'PASS',
  releaseVerifierSourceSha256: sha256(sources[0]),
  identicalFixtureCopies: sources.length,
  registryRuntimeBytes: (artifact.deployedBytecode.length - 2) / 2,
  stageOneBlockedReproduced: false,
  integrationTestExecuted: false,
}, null, 2));

// Optional recovered REC-13 workspace. This is a source-policy regression,
// not an EVM execution test. Keep both barriers until a separate, reviewed
// settlement specification and contract-level regression suite exists.
if (process.argv[2]) {
  const recovered = process.argv[2];
  const stage = join(recovered, 'stage28/policy');
  const registrySource = readFileSync(join(stage, 'LocalFuturesModularTradingDomainRegistry.sol'));
  const operationSource = readFileSync(join(stage, 'LocalFuturesTradingOperationPolicy.sol'), 'utf8');
  const registryArtifact = JSON.parse(readFileSync(join(recovered, 'stage29/artifacts/LocalFuturesModularTradingDomainRegistry.json')));
  assert.equal(sha256(registrySource), registryArtifact.sourceSha256, 'stage29 artifact source pin mismatch');
  const source = registrySource.toString('utf8');
  assert.match(source, /if\(e\.status!=Status\.Prepared\|\|core\.domain\(id\)\.state!=Core\.State\.Normal\)revert StageOneBlocked\(\)/);
  assert.match(source, /operation==bytes4\(keccak256\("validateRelease\(uint256,address\)"\)\)/);
  assert.match(operationSource, /e\.status==R\.Status\.TradingActive&&e\.profile==R\.Profile\.GeneralSettlement\)allowed=_generalResearchOperation/);
  const start = operationSource.indexOf('function _generalResearchOperation');
  const end = operationSource.indexOf('function _positiveObservation', start);
  assert.ok(start !== -1 && end > start, 'general operation gate missing');
  const generalGate = operationSource.slice(start, end);
  assert.ok(!generalGate.includes('releaseExitHeld('), 'general trading unexpectedly permits held release');
  assert.ok(!generalGate.includes('withdrawReleasedReturn('), 'general trading unexpectedly permits return withdrawal');
  console.log(JSON.stringify({
    work: 'REC-13.10.75',
    classification: 'RECOVERED_SOURCE_TWO_GATE_REGRESSION',
    checksPassed: 6,
    outcome: 'PASS',
    normalSettlementEnabled: false,
    evmTestExecuted: false,
  }, null, 2));
}
