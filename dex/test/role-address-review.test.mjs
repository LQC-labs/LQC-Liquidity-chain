import assert from 'node:assert/strict';
import {prepareRoleAddressReview} from '../scripts/prepare-role-address-review.mjs';

const address=byte=>`0x${byte.repeat(40)}`;
const input={schemaVersion:1,network:'bsc-testnet',chainId:97,deployerAddress:address('1'),roles:{governance:{address:address('2'),threshold:4,signerCount:7},risk:{address:address('3'),threshold:3,signerCount:5},guardian:{address:address('4'),threshold:3,signerCount:5},treasury:{address:address('5'),threshold:3,signerCount:5}}};

describe('LQC predeployment public role address review',function(){
  it('normalizes five separated public addresses and creates a deterministic fingerprint',function(){const first=prepareRoleAddressReview(input),second=prepareRoleAddressReview(structuredClone(input));assert.equal(first.status,'READY_FOR_ONCHAIN_SAFE_VERIFICATION');assert.equal(first.reviewFingerprint,second.reviewFingerprint);assert.match(first.reviewFingerprint,/^0x[0-9a-f]{64}$/)});
  it('requires the reviewed governance and operational Safe thresholds',function(){assert.throws(()=>prepareRoleAddressReview({...input,roles:{...input.roles,governance:{...input.roles.governance,threshold:3}}}),/4-of-7/);assert.throws(()=>prepareRoleAddressReview({...input,roles:{...input.roles,risk:{...input.roles.risk,signerCount:4}}}),/3-of-5/)});
  it('rejects every shared deployer or operational role address',function(){assert.throws(()=>prepareRoleAddressReview({...input,roles:{...input.roles,guardian:{...input.roles.guardian,address:input.roles.risk.address}}}),/all be distinct/);assert.throws(()=>prepareRoleAddressReview({...input,deployerAddress:input.roles.treasury.address}),/all be distinct/)});
  it('rejects the wrong network, malformed addresses, and extra roles',function(){assert.throws(()=>prepareRoleAddressReview({...input,chainId:56}),/chain 97/);assert.throws(()=>prepareRoleAddressReview({...input,deployerAddress:'0x1234'}),/valid public deployer/);assert.throws(()=>prepareRoleAddressReview({...input,roles:{...input.roles,operator:input.roles.risk}}),/Exactly four/)});
  it('refuses secret-bearing input fields',function(){assert.throws(()=>prepareRoleAddressReview({...input,privateKey:'0xdead'}),/secret-bearing/);assert.throws(()=>prepareRoleAddressReview({...input,roles:{...input.roles,risk:{...input.roles.risk,seedPhrase:'never'}}}),/Exactly four/)});
});
