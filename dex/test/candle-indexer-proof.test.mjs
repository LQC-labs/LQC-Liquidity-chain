import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { signCandlePayload, verifyCandlePayload } from '../scripts/candle-indexer-proof.mjs';

describe('LQC signed candle data integrity',function(){
  const input={chainId:97,base:'0x0000000000000000000000000000000000000001',quote:'0x0000000000000000000000000000000000000002',timeframe:'1m',candles:[{time:100,open:1,high:2,low:1,close:2,volume:3}],issuedAt:1000,expiresAt:1030,cursor:501,finalizedBlock:500};

  it('signs and verifies the complete candle response context',async function(){
    const wallet=ethers.Wallet.createRandom(),response=await signCandlePayload(input,wallet);
    assert.equal(verifyCandlePayload(response,wallet.address,1010),true);assert.equal(response.proof.scheme,'EIP-191');
  });

  it('rejects changed candles, market context, signer, and expiry',async function(){
    const wallet=ethers.Wallet.createRandom(),response=await signCandlePayload(input,wallet);
    assert.equal(verifyCandlePayload({...response,candles:[{...response.candles[0],close:1.5}]},wallet.address,1010),false);
    assert.equal(verifyCandlePayload({...response,timeframe:'5m'},wallet.address,1010),false);
    assert.equal(verifyCandlePayload(response,ethers.Wallet.createRandom().address,1010),false);
    assert.equal(verifyCandlePayload(response,wallet.address,1031),false);
  });
});
