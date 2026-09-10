const BLOCK_HASH=/^0x[0-9a-f]{64}$/i;

export function validateAnchors(anchors,cursor=Number.MAX_SAFE_INTEGER){
  if(!Array.isArray(anchors))throw new Error('Indexer checkpoint anchors are invalid.');
  let previous=-1;
  return anchors.map(anchor=>{
    const number=Number(anchor?.number),hash=String(anchor?.hash||'').toLowerCase();
    if(!Number.isInteger(number)||number<0||number<=previous||number>=cursor||!BLOCK_HASH.test(hash))throw new Error('Indexer checkpoint contains a malformed block anchor.');
    previous=number;return{number,hash};
  });
}

export function appendFinalizedAnchor(anchors,block,maxAnchors=64){
  if(!Number.isInteger(maxAnchors)||maxAnchors<1)throw new Error('Block anchor limit is invalid.');
  const current=validateAnchors(anchors),number=Number(block?.number),hash=String(block?.hash||'').toLowerCase();
  if(!Number.isInteger(number)||number<0||!BLOCK_HASH.test(hash))throw new Error('Finalized block anchor is invalid.');
  return[...current.filter(anchor=>anchor.number<number),{number,hash}].slice(-maxAnchors);
}

export async function detectReorg(anchors,getBlock,floorBlock=0){
  if(!Number.isInteger(floorBlock)||floorBlock<0)throw new Error('Indexer floor block is invalid.');
  const current=validateAnchors(anchors);
  if(!current.length)return{reorg:false,rewindBlock:null,anchors:current};
  for(let index=current.length-1;index>=0;index--){
    const anchor=current[index],block=await getBlock(anchor.number);
    if(String(block?.hash||'').toLowerCase()===anchor.hash){
      if(index===current.length-1)return{reorg:false,rewindBlock:null,anchors:current};
      return{reorg:true,rewindBlock:anchor.number+1,anchors:current.slice(0,index+1)};
    }
  }
  return{reorg:true,rewindBlock:floorBlock,anchors:[]};
}

export function rollbackTrades(trades,rewindBlock){
  if(!Number.isInteger(rewindBlock)||rewindBlock<0)throw new Error('Reorg rewind block is invalid.');
  return trades.filter(trade=>Number.isInteger(trade?.blockNumber)&&trade.blockNumber<rewindBlock);
}
