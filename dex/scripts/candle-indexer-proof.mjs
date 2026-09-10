import { ethers } from 'ethers';

export function candlePayload({chainId,base,quote,timeframe,candles,issuedAt,expiresAt,cursor,finalizedBlock}){
  if(Number(chainId)!==97||!ethers.isAddress(base)||!ethers.isAddress(quote)||base.toLowerCase()===quote.toLowerCase()||typeof timeframe!=='string'||!Array.isArray(candles))throw new Error('Signed candle payload context is invalid.');
  for(const [name,value] of Object.entries({issuedAt,expiresAt,cursor,finalizedBlock}))if(!Number.isInteger(value)||value<0)throw new Error(`Signed candle payload ${name} is invalid.`);
  if(expiresAt<=issuedAt)throw new Error('Signed candle payload expiry is invalid.');
  return{chainId:97,base:base.toLowerCase(),quote:quote.toLowerCase(),timeframe,candles,issuedAt,expiresAt,cursor,finalizedBlock};
}

export const candlePayloadDigest=payload=>ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload)));

export async function signCandlePayload(input,signer){
  const payload=candlePayload(input),digest=candlePayloadDigest(payload),signature=await signer.signMessage(ethers.getBytes(digest)),address=(await signer.getAddress()).toLowerCase();
  return{...payload,proof:{scheme:'EIP-191',signer:address,digest,signature}};
}

export function verifyCandlePayload(response,expectedSigner,now=Math.floor(Date.now()/1000)){
  try{
    if(!ethers.isAddress(expectedSigner)||response?.proof?.scheme!=='EIP-191'||!Number.isInteger(now))return false;
    const payload=candlePayload(response),digest=candlePayloadDigest(payload);
    if(digest.toLowerCase()!==String(response.proof.digest).toLowerCase()||now>payload.expiresAt||now<payload.issuedAt-30)return false;
    return ethers.verifyMessage(ethers.getBytes(digest),response.proof.signature).toLowerCase()===expectedSigner.toLowerCase()&&response.proof.signer.toLowerCase()===expectedSigner.toLowerCase();
  }catch{return false}
}
