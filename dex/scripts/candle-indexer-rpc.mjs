const hash=value=>String(value||'').toLowerCase();

export async function selectCanonicalProvider(providers,confirmations){
  if(!Array.isArray(providers)||!providers.length)throw new Error('At least one RPC provider is required.');
  if(!Number.isInteger(confirmations)||confirmations<2)throw new Error('RPC finality setting is invalid.');
  const probed=(await Promise.allSettled(providers.map(async(provider,index)=>{
    const [network,head]=await Promise.all([provider.getNetwork(),provider.getBlockNumber()]);
    if(BigInt(network.chainId)!==97n||!Number.isInteger(head)||head<confirmations)throw new Error('RPC source returned an invalid BSC testnet head.');
    return{provider,index,head};
  }))).filter(result=>result.status==='fulfilled').map(result=>result.value);
  const quorum=providers.length===1?1:Math.floor(providers.length/2)+1;
  if(probed.length<quorum)throw new Error(`Independent RPC quorum unavailable (${probed.length}/${quorum}).`);
  const finalizedBlock=Math.min(...probed.map(item=>item.head))-confirmations;
  const anchored=(await Promise.allSettled(probed.map(async item=>{const block=await item.provider.getBlock(finalizedBlock);if(!/^0x[0-9a-f]{64}$/i.test(String(block?.hash||'')))throw new Error('RPC source returned an invalid finalized block.');return{...item,blockHash:hash(block.hash)}}))).filter(result=>result.status==='fulfilled').map(result=>result.value);
  const groups=new Map();for(const item of anchored){const group=groups.get(item.blockHash)||[];group.push(item);groups.set(item.blockHash,group)}
  const canonical=[...groups.values()].sort((a,b)=>b.length-a.length)[0]||[];
  if(canonical.length<quorum)throw new Error('Independent RPC sources disagree on the finalized block hash.');
  canonical.sort((a,b)=>a.index-b.index);
  return{provider:canonical[0].provider,head:finalizedBlock+confirmations,finalizedBlock,blockHash:canonical[0].blockHash,healthySources:anchored.length,configuredSources:providers.length,independentVerified:providers.length>1};
}
