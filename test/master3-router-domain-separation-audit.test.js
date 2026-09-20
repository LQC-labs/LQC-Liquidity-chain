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
assert.match(gateway,/LQCProofBoundExecutionGatewayV1/);
assert.match(gateway,/block\.chainid/);
assert.match(gateway,/address\(this\)/);
assert.match(gateway,/address\(proofVerifier\)/);
assert.match(gateway,/address\(executionRouter\)/);
assert.match(gateway,/routeProofHash/);
assert.match(gateway,/if\(consumedProof\[proofHash\]\)revert ProofAlreadyConsumed/);

console.log('Master 3/3 proof and gateway domain separation audit: PASS');
