'use strict';
const assert=require('assert');
const fs=require('fs');

const proof=fs.readFileSync('dex/contracts/router-v2/LQCBestExecutionProof.sol','utf8');
const gateway=fs.readFileSync('dex/contracts/router-v2/LQCProofBoundExecutionGateway.sol','utf8');

assert.match(proof,/request\.chainId\s*!=\s*block\.chainid/);
assert.match(proof,/request\.recipient/);
assert.match(proof,/result\.adapter/);
assert.match(proof,/candidateSetHash\(candidates\)/);
assert.match(proof,/request\.validUntil/);
assert.match(gateway,/mapping\(bytes32\s*=>\s*bool\) public consumedProof/);
assert.match(gateway,/if\(consumedProof\[proofHash\]\)revert ProofAlreadyConsumed/);

// Finding: proof hash binds chain/economics/route, but does not bind verifier/gateway address.
const bestHashBody=proof.slice(proof.indexOf('function bestCandidateProofHash'),proof.indexOf('function computeRouteHash'));
assert.ok(!/address\(this\)/.test(bestHashBody),'unexpected deployment-domain binding already exists');

console.log('Master 3/3 current domain-separation audit: PASS with deployment-domain GAP');
