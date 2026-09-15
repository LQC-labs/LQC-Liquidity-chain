(function(global){
  'use strict';
  const SUPPORTED_V3_FEES=new Set([100,500,2500,10000]);
  function encodeRoute(dex,path,ethers){
    if(!dex||!Array.isArray(path)||path.length<2||path.length>4)throw new Error('Invalid route');
    if(dex.kind==='v3'){
      const types=[] , values=[];
      path.forEach((token,index)=>{types.push('address');values.push(token);if(index<path.length-1){const next=path[index+1],pool=(dex.pools||[]).find(p=>[p.tokenA.toLowerCase(),p.tokenB.toLowerCase()].includes(token.toLowerCase())&&[p.tokenA.toLowerCase(),p.tokenB.toLowerCase()].includes(next.toLowerCase())),fee=Number(pool?.fee);if(!SUPPORTED_V3_FEES.has(fee))throw new Error('No approved V3 pool');types.push('uint24');values.push(fee)}});
      return ethers.solidityPacked(types,values);
    }
    return ethers.AbiCoder.defaultAbiCoder().encode(['address[]'],[path]);
  }
  function encodeRoutes(dexes,path,ethers){return dexes.map(dex=>encodeRoute(dex,path,ethers))}
  function minimumAmountOut(amountOut,slippagePercent){
    const bps=Math.round(Number(slippagePercent)*100);
    if(!Number.isInteger(bps)||bps<0||bps>2000)throw new Error('Invalid slippage');
    return amountOut*BigInt(10000-bps)/10000n;
  }
  function priceImpactBps(amountIn,amountOut,probeIn,probeOut){
    for(const value of [amountIn,amountOut,probeIn,probeOut])if(typeof value!=='bigint'||value<=0n)throw new Error('Invalid quote');
    const expectedOut=amountIn*probeOut/probeIn;
    return priceImpactFromExpected(amountOut,expectedOut);
  }
  function priceImpactFromExpected(amountOut,expectedOut){
    for(const value of [amountOut,expectedOut])if(typeof value!=='bigint'||value<=0n)throw new Error('Invalid quote');
    if(expectedOut===0n||amountOut>=expectedOut)return 0;
    return Number((expectedOut-amountOut)*10000n/expectedOut);
  }
  function constantProductHopEvidence(amountIn,reserveIn,reserveOut,feeBps=30){
    for(const value of[amountIn,reserveIn,reserveOut])if(typeof value!=='bigint'||value<=0n)throw new Error('Invalid V2 reserve state');
    feeBps=Number(feeBps);if(!Number.isInteger(feeBps)||feeBps<0||feeBps>=10000)throw new Error('Invalid V2 fee');
    const feeMultiplier=BigInt(10000-feeBps),amountInWithFee=amountIn*feeMultiplier,denominator=reserveIn*10000n+amountInWithFee,amountOut=amountInWithFee*reserveOut/denominator,spotAmountOutAfterFee=amountInWithFee*reserveOut/(reserveIn*10000n);
    if(amountOut<=0n||amountOut>=reserveOut||spotAmountOutAfterFee<=0n)throw new Error('Insufficient V2 liquidity');
    return Object.freeze({amountIn:amountIn.toString(),amountOut:amountOut.toString(),spotAmountOutAfterFee:spotAmountOutAfterFee.toString(),feeBps,priceImpactBps:priceImpactFromExpected(amountOut,spotAmountOutAfterFee),reserveInBefore:reserveIn.toString(),reserveOutBefore:reserveOut.toString(),reserveInAfter:(reserveIn+amountIn).toString(),reserveOutAfter:(reserveOut-amountOut).toString()});
  }
  function v2RoutePriceImpactEvidence(input){
    const{amountIn,hops=[],quotedAmountOut,blockNumber}=input||{};
    if(typeof amountIn!=='bigint'||amountIn<=0n||!Array.isArray(hops)||hops.length<1||hops.length>3||!Number.isSafeInteger(Number(blockNumber))||Number(blockNumber)<0)throw new Error('Invalid V2 route evidence');
    let running=amountIn,spot=amountIn;const legs=hops.map((hop,index)=>{
      const evidence=constantProductHopEvidence(running,BigInt(hop.reserveIn),BigInt(hop.reserveOut),hop.feeBps);const spotEvidence=constantProductHopEvidence(spot,BigInt(hop.reserveIn),BigInt(hop.reserveOut),hop.feeBps);running=BigInt(evidence.amountOut);spot=BigInt(spotEvidence.spotAmountOutAfterFee);
      return Object.freeze({index,pair:String(hop.pair||'').toLowerCase(),tokenIn:String(hop.tokenIn||'').toLowerCase(),tokenOut:String(hop.tokenOut||'').toLowerCase(),...evidence});
    });
    const quoted=quotedAmountOut===undefined?running:BigInt(quotedAmountOut);if(quoted!==running)throw new Error('V2 quote and reserve state mismatch');
    return Object.freeze({method:'v2-reserve-constant-product',blockNumber:Number(blockNumber),amountIn:amountIn.toString(),amountOut:running.toString(),spotAmountOutAfterFee:spot.toString(),priceImpactBps:priceImpactFromExpected(running,spot),legs:Object.freeze(legs)});
  }
  async function readV2RouteReserves(input){
    const{provider,routerAddress,path,feeBps=30,ethers}=input||{};
    if(!provider||!ethers||!ethers.isAddress(routerAddress)||!Array.isArray(path)||path.length<2||path.length>4||path.some(token=>!ethers.isAddress(token)))throw new Error('Invalid V2 reserve request');
    const router=new ethers.Contract(routerAddress,['function factory() view returns(address)'],provider),factoryAddress=await router.factory();if(!ethers.isAddress(factoryAddress)||factoryAddress===ethers.ZeroAddress)throw new Error('Invalid V2 factory');
    const factory=new ethers.Contract(factoryAddress,['function getPair(address,address) view returns(address)'],provider),blockNumber=await provider.getBlockNumber(),hops=[];
    for(let i=0;i<path.length-1;i++){
      const tokenIn=path[i],tokenOut=path[i+1],pairAddress=await factory.getPair(tokenIn,tokenOut);if(!ethers.isAddress(pairAddress)||pairAddress===ethers.ZeroAddress)throw new Error('V2 pair unavailable');
      const pair=new ethers.Contract(pairAddress,['function token0() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)'],provider),[token0,reserves]=await Promise.all([pair.token0(),pair.getReserves()]),forward=token0.toLowerCase()===tokenIn.toLowerCase(),reserveIn=BigInt(forward?reserves[0]:reserves[1]),reserveOut=BigInt(forward?reserves[1]:reserves[0]);
      hops.push(Object.freeze({pair:pairAddress,tokenIn,tokenOut,reserveIn,reserveOut,feeBps}));
    }
    return Object.freeze({blockNumber:Number(blockNumber),factory:factoryAddress,hops:Object.freeze(hops)});
  }
  async function readV2AdapterRouteReserves(input){
    const{provider,adapterAddress,path,feeBps=30,ethers}=input||{};if(!ethers||!ethers.isAddress(adapterAddress))throw new Error('Invalid V2 adapter');
    const adapter=new ethers.Contract(adapterAddress,['function flowRouter() view returns(address)','function pancakeRouter() view returns(address)'],provider);let routerAddress;
    for(const getter of['flowRouter','pancakeRouter']){try{const candidate=await adapter[getter]();if(ethers.isAddress(candidate)&&candidate!==ethers.ZeroAddress){routerAddress=candidate;break}}catch{}}
    if(!routerAddress)throw new Error('V2 adapter router unavailable');
    return readV2RouteReserves({provider,routerAddress,path,feeBps,ethers});
  }
  const Q96=1n<<96n,Q192=Q96*Q96,FEE_PIPS=1000000n;
  function ceilDiv(value,denominator){return(value+denominator-1n)/denominator}
  function v3ConcentratedLiquidityHopEvidence(input){
    const{amountIn,sqrtPriceX96,liquidity,zeroForOne,feePips,ticks=[]}=input||{};
    if(typeof amountIn!=='bigint'||amountIn<=0n||typeof sqrtPriceX96!=='bigint'||sqrtPriceX96<=0n||typeof liquidity!=='bigint'||liquidity<=0n||typeof zeroForOne!=='boolean'||!Number.isInteger(feePips)||feePips<0||feePips>=1000000||!Array.isArray(ticks))throw new Error('Invalid V3 pool state');
    const ordered=ticks.map(tick=>({sqrtPriceX96:BigInt(tick.sqrtPriceX96),liquidityNet:BigInt(tick.liquidityNet)})).filter(tick=>zeroForOne?tick.sqrtPriceX96<sqrtPriceX96:tick.sqrtPriceX96>sqrtPriceX96).sort((a,b)=>a.sqrtPriceX96===b.sqrtPriceX96?0:(zeroForOne?(a.sqrtPriceX96>b.sqrtPriceX96?-1:1):(a.sqrtPriceX96<b.sqrtPriceX96?-1:1)));
    const multiplier=FEE_PIPS-BigInt(feePips),netTotal=amountIn*multiplier/FEE_PIPS;
    let grossRemaining=amountIn,current=sqrtPriceX96,currentLiquidity=liquidity,amountOut=0n,crossedTicks=0;
    for(const boundary of[...ordered,{sqrtPriceX96:null,liquidityNet:0n}]){
      if(grossRemaining===0n)break;
      let netRequired=null;
      if(boundary.sqrtPriceX96!==null){const target=boundary.sqrtPriceX96;if(target<=0n)throw new Error('Invalid V3 tick state');netRequired=zeroForOne?ceilDiv(currentLiquidity*(current-target)*Q96,current*target):ceilDiv(currentLiquidity*(target-current),Q96)}
      const grossRequired=netRequired===null?null:ceilDiv(netRequired*FEE_PIPS,multiplier);
      if(grossRequired!==null&&grossRemaining>=grossRequired){
        const target=boundary.sqrtPriceX96;amountOut+=zeroForOne?currentLiquidity*(current-target)/Q96:currentLiquidity*(target-current)*Q96/(target*current);grossRemaining-=grossRequired;current=target;currentLiquidity=zeroForOne?currentLiquidity-boundary.liquidityNet:currentLiquidity+boundary.liquidityNet;if(currentLiquidity<=0n)throw new Error('Insufficient V3 liquidity');crossedTicks++;
      }else{
        const netIn=grossRemaining*multiplier/FEE_PIPS;if(netIn<=0n)throw new Error('V3 input consumed by fee');const next=zeroForOne?ceilDiv(currentLiquidity*current*Q96,currentLiquidity*Q96+netIn*current):current+netIn*Q96/currentLiquidity;if(next<=0n||next===current)throw new Error('Insufficient V3 liquidity');amountOut+=zeroForOne?currentLiquidity*(current-next)/Q96:currentLiquidity*(next-current)*Q96/(next*current);current=next;grossRemaining=0n;
      }
    }
    if(grossRemaining>0n||amountOut<=0n)throw new Error('Insufficient V3 liquidity');
    const spotAmountOutAfterFee=zeroForOne?netTotal*sqrtPriceX96*sqrtPriceX96/Q192:netTotal*Q192/(sqrtPriceX96*sqrtPriceX96);if(spotAmountOutAfterFee<=0n)throw new Error('Insufficient V3 liquidity');
    return Object.freeze({amountIn:amountIn.toString(),amountOut:amountOut.toString(),spotAmountOutAfterFee:spotAmountOutAfterFee.toString(),feePips,zeroForOne,priceImpactBps:priceImpactFromExpected(amountOut,spotAmountOutAfterFee),sqrtPriceX96Before:sqrtPriceX96.toString(),sqrtPriceX96After:current.toString(),liquidityBefore:liquidity.toString(),liquidityAfter:currentLiquidity.toString(),crossedTicks});
  }
  function v3RoutePriceImpactEvidence(input){
    const{amountIn,hops=[],quotedAmountOut,blockNumber}=input||{};if(typeof amountIn!=='bigint'||amountIn<=0n||!Array.isArray(hops)||hops.length<1||hops.length>3||!Number.isSafeInteger(Number(blockNumber))||Number(blockNumber)<0)throw new Error('Invalid V3 route evidence');
    let running=amountIn,spot=amountIn;const legs=hops.map((hop,index)=>{const evidence=v3ConcentratedLiquidityHopEvidence({...hop,amountIn:running});const spotEvidence=v3ConcentratedLiquidityHopEvidence({...hop,amountIn:spot,ticks:[]});running=BigInt(evidence.amountOut);spot=BigInt(spotEvidence.spotAmountOutAfterFee);return Object.freeze({index,pool:String(hop.pool||'').toLowerCase(),tokenIn:String(hop.tokenIn||'').toLowerCase(),tokenOut:String(hop.tokenOut||'').toLowerCase(),...evidence})});
    const quoted=quotedAmountOut===undefined?running:BigInt(quotedAmountOut);if(quoted!==running)throw new Error('V3 quote and pool state mismatch');return Object.freeze({method:'v3-tick-concentrated-liquidity',blockNumber:Number(blockNumber),amountIn:amountIn.toString(),amountOut:running.toString(),spotAmountOutAfterFee:spot.toString(),priceImpactBps:priceImpactFromExpected(running,spot),legs:Object.freeze(legs)});
  }
  function oracleMarketDeviationEvidence(input){
    const{actualAmountOut,oracleExpectedOut,oracleId,blockNumber}=input||{};if(typeof actualAmountOut!=='bigint'||actualAmountOut<=0n||typeof oracleExpectedOut!=='bigint'||oracleExpectedOut<=0n||typeof oracleId!=='string'||!oracleId.trim()||!Number.isSafeInteger(Number(blockNumber))||Number(blockNumber)<0)throw new Error('Invalid oracle market reference');
    const difference=actualAmountOut-oracleExpectedOut,direction=difference===0n?'at-market':difference>0n?'better-than-market':'worse-than-market',deviationBps=Number((difference<0n?-difference:difference)*10000n/oracleExpectedOut);return Object.freeze({method:'oracle-market-deviation',oracleId,blockNumber:Number(blockNumber),actualAmountOut:actualAmountOut.toString(),oracleExpectedOut:oracleExpectedOut.toString(),deviationBps,direction});
  }
  function tickToSqrtPriceX96(tick){
    if(!Number.isInteger(tick)||tick<-887272||tick>887272)throw new Error('Invalid V3 tick');
    let absTick=BigInt(tick<0?-tick:tick),ratio=(absTick&1n)!==0n?0xfffcb933bd6fad37aa2d162d1a594001n:0x100000000000000000000000000000000n;
    const factors=[0xfff97272373d413259a46990580e213an,0xfff2e50f5f656932ef12357cf3c7fdccn,0xffe5caca7e10e4e61c3624eaa0941cd0n,0xffcb9843d60f6159c9db58835c926644n,0xff973b41fa98c081472e6896dfb254c0n,0xff2ea16466c96a3843ec78b326b52861n,0xfe5dee046a99a2a811c461f1969c3053n,0xfcbe86c7900a88aedcffc83b479aa3a4n,0xf987a7253ac413176f2b074cf7815e54n,0xf3392b0822b70005940c7a398e4b70f3n,0xe7159475a2c29b7443b29c7fa6e889d9n,0xd097f3bdfd2022b8845ad8f792aa5825n,0xa9f746462d870fdf8a65dc1f90e061e5n,0x70d869a156d2a1b890bb3df62baf32f7n,0x31be135f97d08fd981231505542fcfa6n,0x9aa508b5b7a84e1c677de54f3e99bc9n,0x5d6af8dedb81196699c329225ee604n,0x2216e584f5fa1ea926041bedfe98n,0x48a170391f7dc42444e8fa2n];
    for(let i=0;i<factors.length;i++)if((absTick&(1n<<BigInt(i+1)))!==0n)ratio=ratio*factors[i]>>128n;
    if(tick>0)ratio=((1n<<256n)-1n)/ratio;
    return(ratio>>32n)+((ratio&((1n<<32n)-1n))===0n?0n:1n);
  }
  function initializedTicksFromBitmapWords(input){
    const{words=[],tickSpacing,currentTick,zeroForOne,maxInitializedTicks=128}=input||{};
    if(!Array.isArray(words)||!Number.isInteger(tickSpacing)||tickSpacing<=0||!Number.isInteger(currentTick)||typeof zeroForOne!=='boolean'||!Number.isInteger(maxInitializedTicks)||maxInitializedTicks<1||maxInitializedTicks>512)throw new Error('Invalid V3 bitmap state');
    const ticks=[];for(const word of words){if(!Number.isInteger(word.wordPosition)||word.wordPosition<-32768||word.wordPosition>32767)throw new Error('Invalid V3 bitmap word');const bitmap=BigInt(word.bitmap);if(bitmap<0n||bitmap>=(1n<<256n))throw new Error('Invalid V3 bitmap word');for(let bit=0;bit<256;bit++)if((bitmap&(1n<<BigInt(bit)))!==0n){const tick=(word.wordPosition*256+bit)*tickSpacing;if((zeroForOne&&tick<currentTick)||(!zeroForOne&&tick>currentTick))ticks.push(tick)}}
    ticks.sort((a,b)=>zeroForOne?b-a:a-b);if(ticks.length>maxInitializedTicks)throw new Error('V3 initialized tick limit exceeded');return Object.freeze(ticks);
  }
  async function readV3PoolState(input){
    const{provider,poolAddress,tokenIn,tokenOut,ethers,maxTickWords=8,maxInitializedTicks=128}=input||{};
    if(!provider||typeof provider.getBlockNumber!=='function'||!ethers||!ethers.isAddress(poolAddress)||!ethers.isAddress(tokenIn)||!ethers.isAddress(tokenOut)||tokenIn.toLowerCase()===tokenOut.toLowerCase()||!Number.isInteger(maxTickWords)||maxTickWords<1||maxTickWords>16)throw new Error('Invalid V3 pool request');
    const abi=['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function tickSpacing() view returns(int24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)','function tickBitmap(int16) view returns(uint256)','function ticks(int24) view returns(uint128 liquidityGross,int128 liquidityNet,uint256 feeGrowthOutside0X128,uint256 feeGrowthOutside1X128,int56 tickCumulativeOutside,uint160 secondsPerLiquidityOutsideX128,uint32 secondsOutside,bool initialized)'];
    const pool=new ethers.Contract(poolAddress,abi,provider),blockNumber=await provider.getBlockNumber(),at={blockTag:blockNumber};
    const[token0,token1,fee,tickSpacingRaw,activeLiquidity,slot0]=await Promise.all([pool.token0(at),pool.token1(at),pool.fee(at),pool.tickSpacing(at),pool.liquidity(at),pool.slot0(at)]);
    const forward=token0.toLowerCase()===tokenIn.toLowerCase()&&token1.toLowerCase()===tokenOut.toLowerCase(),reverse=token1.toLowerCase()===tokenIn.toLowerCase()&&token0.toLowerCase()===tokenOut.toLowerCase();if(!forward&&!reverse)throw new Error('V3 pool token mismatch');
    const tickSpacing=Number(tickSpacingRaw),currentTick=Number(slot0.tick??slot0[1]),sqrtPriceX96=BigInt(slot0.sqrtPriceX96??slot0[0]);if(!Number.isInteger(tickSpacing)||tickSpacing<=0||!Number.isInteger(currentTick)||sqrtPriceX96<=0n||BigInt(activeLiquidity)<=0n)throw new Error('Invalid V3 live state');
    const compressed=Math.floor(currentTick/tickSpacing),currentWord=Math.floor(compressed/256),zeroForOne=forward,positions=Array.from({length:maxTickWords},(_,index)=>currentWord+(zeroForOne?-index:index));if(positions.some(position=>position<-32768||position>32767))throw new Error('V3 bitmap scan out of range');
    const bitmaps=await Promise.all(positions.map(async wordPosition=>({wordPosition,bitmap:await pool.tickBitmap(wordPosition,at)}))),tickIndexes=initializedTicksFromBitmapWords({words:bitmaps,tickSpacing,currentTick,zeroForOne,maxInitializedTicks});
    const tickStates=await Promise.all(tickIndexes.map(async tick=>{const state=await pool.ticks(tick,at);if(!(state.initialized??state[7]))throw new Error('V3 bitmap tick not initialized');return Object.freeze({tick,sqrtPriceX96:tickToSqrtPriceX96(tick),liquidityNet:BigInt(state.liquidityNet??state[1])})}));
    return Object.freeze({method:'v3-slot0-tick-bitmap',pool:poolAddress.toLowerCase(),blockNumber:Number(blockNumber),token0:token0.toLowerCase(),token1:token1.toLowerCase(),feePips:Number(fee),tickSpacing,currentTick,sqrtPriceX96,liquidity:BigInt(activeLiquidity),zeroForOne,ticks:Object.freeze(tickStates)});
  }
  function estimatedGasWei(dex,gasPriceWei,nativeSwap=false){
    const gasUnits=BigInt(dex?.gasUnits||(nativeSwap?260000:220000));
    if(typeof gasPriceWei!=='bigint'||gasPriceWei<0n)throw new Error('Invalid gas price');
    return gasUnits*gasPriceWei;
  }
  function gasEstimateEvidence(input){
    const{estimates=[],fallbackGasUnits,gasPriceWei,blockNumber,target,sender,calldataHash,value=0n}=input||{};
    if(typeof gasPriceWei!=='bigint'||gasPriceWei<0n||!Number.isSafeInteger(Number(blockNumber))||Number(blockNumber)<0)throw new Error('Invalid gas estimate context');
    if(typeof target!=='string'||typeof sender!=='string'||typeof calldataHash!=='string'||typeof value!=='bigint'||value<0n)throw new Error('Invalid gas estimate transaction');
    const valid=estimates.map((entry,index)=>({source:String(entry?.source||`rpc-${index+1}`),gasUnits:typeof entry?.gasUnits==='bigint'?entry.gasUnits:BigInt(entry?.gasUnits||0)})).filter(entry=>entry.gasUnits>0n);
    let gasUnits,method,confidence,spreadBps=0;
    if(valid.length){
      valid.sort((a,b)=>a.gasUnits<b.gasUnits?-1:a.gasUnits>b.gasUnits?1:0);gasUnits=valid.at(-1).gasUnits;method='eth_estimateGas';
      spreadBps=Number((gasUnits-valid[0].gasUnits)*10000n/gasUnits);confidence=valid.length>=2&&spreadBps<=1000?'high':valid.length>=2&&spreadBps<=2500?'medium':valid.length===1?'medium':'low';
    }else{
      gasUnits=typeof fallbackGasUnits==='bigint'?fallbackGasUnits:BigInt(fallbackGasUnits||0);if(gasUnits<=0n)throw new Error('Gas estimate unavailable');method='configured-fallback';confidence='low';
    }
    return Object.freeze({method,confidence,gasUnits:gasUnits.toString(),gasPriceWei:gasPriceWei.toString(),networkFeeWei:(gasUnits*gasPriceWei).toString(),blockNumber:Number(blockNumber),target:target.toLowerCase(),sender:sender.toLowerCase(),calldataHash:calldataHash.toLowerCase(),value:value.toString(),spreadBps,sources:Object.freeze(valid.map(entry=>Object.freeze({source:entry.source,gasUnits:entry.gasUnits.toString()})))});
  }
  async function estimateExecutionGas(input){
    const{providers=[],transaction,sender,fallbackGasUnits,gasPriceWei,blockNumber,calldataHash}=input||{};
    if(!transaction||typeof transaction.to!=='string'||typeof transaction.data!=='string'||typeof sender!=='string'||!Array.isArray(providers))throw new Error('Invalid execution gas request');
    const tx={...transaction,from:sender},settled=await Promise.all(providers.map(async(entry,index)=>{try{const provider=entry?.provider||entry;if(!provider||typeof provider.estimateGas!=='function')throw new Error('estimateGas unavailable');return{source:String(entry?.source||`rpc-${index+1}`),gasUnits:await provider.estimateGas(tx)}}catch{return null}}));
    return gasEstimateEvidence({estimates:settled.filter(Boolean),fallbackGasUnits,gasPriceWei,blockNumber,target:transaction.to,sender,calldataHash,value:BigInt(transaction.value||0)});
  }
  function routeFeeBps(dex,path){
    if(dex?.kind!=='v3')return Number(dex?.feeBps||0);
    let hundredthsOfBps=0;
    for(let i=0;i<path.length-1;i++){const a=path[i].toLowerCase(),b=path[i+1].toLowerCase(),pool=(dex.pools||[]).find(p=>[p.tokenA.toLowerCase(),p.tokenB.toLowerCase()].includes(a)&&[p.tokenA.toLowerCase(),p.tokenB.toLowerCase()].includes(b));if(!pool)throw new Error('No approved V3 pool');hundredthsOfBps+=Number(pool.fee)}
    return hundredthsOfBps/100;
  }
  function summarizeSplit(dexes,amountsIn,totalAmountIn){
    if(!Array.isArray(dexes)||!Array.isArray(amountsIn)||dexes.length!==amountsIn.length||typeof totalAmountIn!=='bigint'||totalAmountIn<=0n)throw new Error('Invalid split');
    return amountsIn.map((amount,index)=>({dex:dexes[index],amountIn:amount,percent:Number(amount*10000n/totalAmountIn)/100})).filter(item=>item.amountIn>0n);
  }
  function isSplitNetBetter(singleAmountOut,singleCost,splitNetAmountOut){
    for(const value of [singleAmountOut,singleCost,splitNetAmountOut])if(typeof value!=='bigint'||value<0n)throw new Error('Invalid net quote');
    const singleNet=singleAmountOut>singleCost?singleAmountOut-singleCost:0n;
    return splitNetAmountOut>singleNet;
  }
  function walletSessionState(accounts,remembered,chainId,expectedChainId){
    if(!remembered||!Array.isArray(accounts)||accounts.length===0)return'disconnected';
    if(String(chainId).toLowerCase()!==String(expectedChainId).toLowerCase())return'wrong_network';
    return'connected';
  }
  function validateExecutionSession(expectedAccount,accounts,chainId,expectedChainId,ethers){
    if(!ethers||!ethers.isAddress(expectedAccount)||!Array.isArray(accounts)||accounts.length===0||!ethers.isAddress(accounts[0]))throw new Error('Wallet execution account unavailable');
    if(accounts[0].toLowerCase()!==expectedAccount.toLowerCase())throw new Error('Wallet execution account changed');
    try{if(BigInt(chainId)!==BigInt(expectedChainId))throw new Error('Wallet execution chain changed')}catch(error){if(error.message==='Wallet execution chain changed')throw error;throw new Error('Wallet execution chain unavailable')}
    return{valid:true,account:expectedAccount.toLowerCase(),chainId:Number(BigInt(chainId))};
  }
  function validatePendingNonce(expectedNonce,currentNonce){
    if(!Number.isSafeInteger(expectedNonce)||expectedNonce<0||!Number.isSafeInteger(currentNonce)||currentNonce<0)throw new Error('Invalid pending nonce');
    if(currentNonce!==expectedNonce)throw new Error('Pending nonce changed');
    return{valid:true,nonce:expectedNonce};
  }
  function requiresTokenApproval(allowance,amountIn){
    if(typeof allowance!=='bigint'||allowance<0n||typeof amountIn!=='bigint'||amountIn<=0n)throw new Error('Invalid approval state');
    return allowance<amountIn;
  }
  function exactApprovalAmounts(allowance,amountIn){
    if(typeof allowance!=='bigint'||allowance<0n||typeof amountIn!=='bigint'||amountIn<=0n)throw new Error('Invalid approval state');
    if(allowance>=amountIn)return[];
    return allowance===0n?[amountIn]:[0n,amountIn];
  }
  function isLatestQuote(requestId,currentId){
    if(!Number.isSafeInteger(requestId)||!Number.isSafeInteger(currentId)||requestId<0||currentId<0)throw new Error('Invalid quote version');
    return requestId===currentId;
  }
  function validateExecutionQuote(snapshot,current,policy={}){
    const maxAgeMs=policy.maxAgeMs??30000,maxBlockDrift=policy.maxBlockDrift??5;
    if(!snapshot||!current||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1000||!Number.isSafeInteger(maxBlockDrift)||maxBlockDrift<0)throw new Error('Invalid quote validation');
    for(const value of [snapshot.amountIn,snapshot.amountOut,snapshot.minimumOut,current.amountIn,current.amountOut])if(typeof value!=='bigint'||value<=0n)throw new Error('Invalid quote amounts');
    for(const value of [snapshot.chainId,snapshot.blockNumber,snapshot.quotedAt,current.chainId,current.blockNumber,current.now])if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid quote context');
    const sameTrade=snapshot.chainId===current.chainId&&snapshot.tokenIn===current.tokenIn&&snapshot.tokenOut===current.tokenOut&&snapshot.amountIn===current.amountIn;
    if(!sameTrade)throw new Error('QuoteTradeChanged');
    if(current.now<snapshot.quotedAt||current.now-snapshot.quotedAt>maxAgeMs||current.blockNumber<snapshot.blockNumber||current.blockNumber-snapshot.blockNumber>maxBlockDrift)throw new Error('StaleQuote');
    if(current.amountOut<snapshot.minimumOut)throw new Error('QuotePriceMoved');
    return{valid:true,ageMs:current.now-snapshot.quotedAt,blockDrift:current.blockNumber-snapshot.blockNumber,minimumOut:snapshot.minimumOut};
  }
  function rankRouteQuotes(candidates){
    if(!Array.isArray(candidates))throw new Error('Invalid route quotes');
    return candidates.filter(item=>item&&typeof item.amountOut==='bigint'&&item.amountOut>0n).map(item=>{
      const cost=typeof item.cost==='bigint'&&item.cost>0n?item.cost:0n;
      return{...item,netAmountOut:item.amountOut>cost?item.amountOut-cost:0n};
    }).filter(item=>item.netAmountOut>0n).sort((a,b)=>a.netAmountOut===b.netAmountOut?Number(b.priority||0)-Number(a.priority||0):(a.netAmountOut>b.netAmountOut?-1:1));
  }
  function buildBestExecutionProof(input,ethers){
    if(!ethers||typeof ethers.keccak256!=='function'||Number(input?.chainId)!==97||!Number.isInteger(input?.quoteBlock)||input.quoteBlock<=0||!Number.isInteger(input?.expiresAt)||input.expiresAt<=0)throw new Error('Invalid proof context');
    if(!ethers.isAddress(input.tokenIn)||!ethers.isAddress(input.tokenOut)||input.tokenIn.toLowerCase()===input.tokenOut.toLowerCase()||typeof input.amountIn!=='bigint'||input.amountIn<=0n)throw new Error('Invalid proof trade');
    if(!Array.isArray(input.candidates)||input.candidates.length===0||!input.plan||!Array.isArray(input.plan.legs)||input.plan.legs.length<1||input.plan.legs.length>4)throw new Error('Invalid proof routes');
    const seen=new Set();
    const candidates=input.candidates.map(candidate=>{
      if(!ethers.isHexString(candidate.dexId,32)||seen.has(candidate.dexId.toLowerCase())||typeof candidate.amountOut!=='bigint'||candidate.amountOut<=0n||typeof candidate.cost!=='bigint'||candidate.cost<0n||!ethers.isHexString(candidate.routeDataHash,32))throw new Error('Invalid proof candidate');
      seen.add(candidate.dexId.toLowerCase());
      return{dexId:candidate.dexId.toLowerCase(),name:String(candidate.name||''),amountOut:candidate.amountOut,cost:candidate.cost,netAmountOut:candidate.amountOut>candidate.cost?candidate.amountOut-candidate.cost:0n,priceImpactBps:Number(candidate.priceImpactBps||0),routeDataHash:candidate.routeDataHash.toLowerCase()};
    });
    const ranked=rankRouteQuotes(candidates);
    if(ranked.length===0)throw new Error('No executable proof candidate');
    let allocated=0n,expected=0n,minimum=0n;
    const legs=input.plan.legs.map(leg=>{
      if(!seen.has(String(leg.dexId).toLowerCase())||typeof leg.amountIn!=='bigint'||leg.amountIn<=0n||typeof leg.expectedOut!=='bigint'||leg.expectedOut<=0n||typeof leg.minimumOut!=='bigint'||leg.minimumOut<=0n||leg.minimumOut>leg.expectedOut)throw new Error('Invalid proof leg');
      allocated+=leg.amountIn;expected+=leg.expectedOut;minimum+=leg.minimumOut;
      return{dexId:leg.dexId.toLowerCase(),amountIn:leg.amountIn.toString(),expectedOut:leg.expectedOut.toString(),minimumOut:leg.minimumOut.toString()};
    });
    if(allocated!==input.amountIn||typeof input.plan.cost!=='bigint'||input.plan.cost<0n)throw new Error('Invalid proof allocation');
    const planNet=expected>input.plan.cost?expected-input.plan.cost:0n,bestSingle=ranked[0];
    if(input.plan.kind==='single'&&(legs.length!==1||legs[0].dexId!==bestSingle.dexId||legs[0].expectedOut!==bestSingle.amountOut.toString()||input.plan.cost!==bestSingle.cost))throw new Error('Single route is not best execution');
    if(input.plan.kind==='split'&&(legs.length<2||planNet<=bestSingle.netAmountOut))throw new Error('Split route does not improve best execution');
    if(!['single','split'].includes(input.plan.kind)||!Number.isInteger(input.slippageBps)||input.slippageBps<0||input.slippageBps>2000)throw new Error('Invalid proof policy');
    const improvementBps=planNet>bestSingle.netAmountOut?Number((planNet-bestSingle.netAmountOut)*10000n/bestSingle.netAmountOut):0;
    const payload={version:1,type:'LQC_PROOF_OF_BEST_EXECUTION',chainId:97,quoteBlock:input.quoteBlock,expiresAt:input.expiresAt,tokenIn:input.tokenIn.toLowerCase(),tokenOut:input.tokenOut.toLowerCase(),amountIn:input.amountIn.toString(),slippageBps:input.slippageBps,plan:{kind:input.plan.kind,legs,expectedOut:expected.toString(),minimumOut:minimum.toString(),cost:input.plan.cost.toString(),netAmountOut:planNet.toString()},bestSingle:{dexId:bestSingle.dexId,netAmountOut:bestSingle.netAmountOut.toString()},improvementBps,candidates:candidates.map(candidate=>({dexId:candidate.dexId,name:candidate.name,amountOut:candidate.amountOut.toString(),cost:candidate.cost.toString(),netAmountOut:candidate.netAmountOut.toString(),priceImpactBps:candidate.priceImpactBps,routeDataHash:candidate.routeDataHash}))};
    return{...payload,proofHash:ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload)))};
  }
  function verifyBestExecutionProof(proof,ethers){
    if(!proof||!ethers||!ethers.isHexString(proof.proofHash,32))return false;
    const{proofHash,...payload}=proof;
    return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload))).toLowerCase()===proofHash.toLowerCase();
  }
  function validateExecutionPlanProof(proof,current,ethers,now=Math.floor(Date.now()/1000)){
    if(!verifyBestExecutionProof(proof,ethers)||!current||!Number.isSafeInteger(now)||now<0)throw new Error('InvalidBestExecutionProof');
    if(now>proof.expiresAt)throw new Error('StaleProof');
    if(current.chainId!==proof.chainId||String(current.tokenIn).toLowerCase()!==proof.tokenIn||String(current.tokenOut).toLowerCase()!==proof.tokenOut||typeof current.amountIn!=='bigint'||current.amountIn.toString()!==proof.amountIn)throw new Error('ProofTradeChanged');
    if(current.kind!==proof.plan.kind||!Array.isArray(current.legs)||current.legs.length!==proof.plan.legs.length)throw new Error('ProofRouteChanged');
    let totalInput=0n,totalMinimum=0n;
    for(let i=0;i<current.legs.length;i++){
      const live=current.legs[i],committed=proof.plan.legs[i];
      if(String(live.dexId).toLowerCase()!==committed.dexId||typeof live.amountIn!=='bigint'||live.amountIn.toString()!==committed.amountIn||typeof live.expectedOut!=='bigint'||live.expectedOut<BigInt(committed.minimumOut))throw new Error('ProofRouteChanged');
      totalInput+=live.amountIn;totalMinimum+=BigInt(committed.minimumOut);
    }
    if(totalInput!==current.amountIn)throw new Error('ProofRouteChanged');
    return{valid:true,proofHash:proof.proofHash.toLowerCase(),kind:current.kind,legs:current.legs.length,totalMinimumOut:totalMinimum};
  }
  function buildExecutionIntent(proof,input,ethers){
    if(!verifyBestExecutionProof(proof,ethers)||!input||!ethers.isAddress(input.sender)||!ethers.isAddress(input.target)||
      !ethers.isHexString(input.calldataHash,32)||typeof input.value!=='bigint'||input.value<0n||
      !Number.isSafeInteger(input.nonce)||input.nonce<0||!Number.isSafeInteger(input.deadline)||input.deadline<=0||input.deadline>proof.expiresAt)throw new Error('Invalid execution intent');
    const payload={version:1,type:'LQC_EXECUTION_INTENT',chainId:proof.chainId,proofHash:proof.proofHash.toLowerCase(),
      sender:input.sender.toLowerCase(),target:input.target.toLowerCase(),calldataHash:input.calldataHash.toLowerCase(),
      value:input.value.toString(),nonce:input.nonce,deadline:input.deadline};
    return{...payload,intentHash:ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload)))};
  }
  function verifyExecutionIntent(intent,proof,ethers){
    if(!intent||!verifyBestExecutionProof(proof,ethers)||!ethers.isHexString(intent.intentHash,32)||intent.proofHash!==proof.proofHash.toLowerCase())return false;
    const{intentHash,...payload}=intent;
    if(payload.version!==1||payload.type!=='LQC_EXECUTION_INTENT'||payload.chainId!==proof.chainId||!ethers.isAddress(payload.sender)||!ethers.isAddress(payload.target)||!ethers.isHexString(payload.calldataHash,32)||!Number.isSafeInteger(payload.nonce)||payload.nonce<0||!Number.isSafeInteger(payload.deadline)||payload.deadline<=0||payload.deadline>proof.expiresAt)return false;
    try{if(BigInt(payload.value)<0n)return false;}catch{return false;}
    return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload))).toLowerCase()===intentHash.toLowerCase();
  }
  function buildIntentBoundSettlementReceipt(proof,intent,execution,ethers){
    if(!verifyExecutionIntent(intent,proof,ethers)||!execution||String(execution.sender||'').toLowerCase()!==intent.sender||String(execution.target||'').toLowerCase()!==intent.target||String(execution.calldataHash||'').toLowerCase()!==intent.calldataHash||String(execution.value)!==intent.value||execution.nonce!==intent.nonce)throw new Error('Execution does not match intent');
    const settlement=buildSettlementReceipt(proof,execution,ethers),payload={version:1,type:'LQC_INTENT_BOUND_SETTLEMENT',proofHash:proof.proofHash.toLowerCase(),intentHash:intent.intentHash.toLowerCase(),settlement};
    return{...payload,evidenceHash:ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload)))};
  }
  function verifyIntentBoundSettlementReceipt(evidence,proof,intent,ethers){
    if(!evidence||!verifyExecutionIntent(intent,proof,ethers)||evidence.proofHash!==proof.proofHash.toLowerCase()||evidence.intentHash!==intent.intentHash.toLowerCase()||!verifySettlementReceipt(evidence.settlement,proof,ethers)||!ethers.isHexString(evidence.evidenceHash,32))return false;
    const{evidenceHash,...payload}=evidence;
    return payload.version===1&&payload.type==='LQC_INTENT_BOUND_SETTLEMENT'&&ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload))).toLowerCase()===evidenceHash.toLowerCase();
  }
  function buildQuoteApiRequest(input,ethers){
    if(!ethers||Number(input?.chainId)!==97||!ethers.isAddress(input.tokenIn)||!ethers.isAddress(input.tokenOut)||input.tokenIn.toLowerCase()===input.tokenOut.toLowerCase()||typeof input.amountIn!=='bigint'||input.amountIn<=0n||input.amountIn>ethers.MaxUint256||!Number.isSafeInteger(input.requestedAt)||!Number.isSafeInteger(input.expiresAt)||input.expiresAt<=input.requestedAt||input.expiresAt-input.requestedAt>60000)throw new Error('Invalid quote API request');
    const payload={version:1,type:'LQC_MULTI_DEX_QUOTE_REQUEST',chainId:97,tokenIn:input.tokenIn.toLowerCase(),tokenOut:input.tokenOut.toLowerCase(),amountIn:input.amountIn.toString(),requestedAt:input.requestedAt,expiresAt:input.expiresAt,clientRequestId:String(input.clientRequestId||'')};
    if(!/^[A-Za-z0-9._:-]{1,128}$/.test(payload.clientRequestId))throw new Error('Invalid quote API request id');
    return{...payload,requestHash:ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload)))};
  }
  function validateQuoteApiResponse(request,response,ethers,now){
    if(!request||!response||!ethers.isHexString(request.requestHash,32)||response.requestHash!==request.requestHash.toLowerCase()||!Number.isSafeInteger(now)||now<request.requestedAt||now>request.expiresAt)throw new Error('Invalid quote API response context');
    const rebuilt=buildQuoteApiRequest({...request,amountIn:BigInt(request.amountIn)},ethers);
    if(rebuilt.requestHash.toLowerCase()!==request.requestHash.toLowerCase()||!Number.isSafeInteger(response.proof?.expiresAt)||response.proof.expiresAt<now||response.proof.expiresAt>request.expiresAt||!verifyBestExecutionProof(response.proof,ethers)||response.proof.chainId!==request.chainId||response.proof.tokenIn!==request.tokenIn||response.proof.tokenOut!==request.tokenOut||response.proof.amountIn!==request.amountIn)throw new Error('Quote API proof mismatch');
    return{valid:true,requestHash:request.requestHash.toLowerCase(),proofHash:response.proof.proofHash.toLowerCase(),candidateCount:response.proof.candidates.length,expiresAt:response.proof.expiresAt};
  }
  function recoveryActionForError(error){
    const code=explainSwapError(error).code;
    if(['STALE_QUOTE','PRICE_MOVED','NO_ROUTE','ROUTE_CHANGED'].includes(code))return'REFRESH_QUOTE';
    if(code==='NETWORK_ERROR')return'SWITCH_NETWORK';
    if(['APPROVAL_REQUIRED','USER_REJECTED'].includes(code))return'RETRY';
    if(code==='INSUFFICIENT_GAS')return'ADD_TEST_GAS';
    return'REVIEW';
  }
  function buildSettlementReceipt(proof,execution,ethers){
    if(!verifyBestExecutionProof(proof,ethers))throw new Error('Invalid best execution proof');
    if(!execution||Number(execution.chainId)!==proof.chainId||!ethers.isHexString(execution.transactionHash,32)||!ethers.isHexString(execution.blockHash,32)||!Number.isInteger(execution.blockNumber)||execution.blockNumber<proof.quoteBlock)throw new Error('Invalid settlement context');
    if(!ethers.isAddress(execution.recipient)||typeof execution.actualAmountOut!=='bigint'||execution.actualAmountOut<=0n||execution.status!==1)throw new Error('Invalid settlement result');
    if(!Number.isInteger(execution.settledAt)||execution.settledAt<=0||execution.settledAt>proof.expiresAt)throw new Error('Settlement outside proof validity');
    const expected=BigInt(proof.plan.expectedOut),minimum=BigInt(proof.plan.minimumOut),actual=execution.actualAmountOut;
    const executionDeltaBps=actual===expected?0:Number((actual-expected)*10000n/expected);
    const payload={version:1,type:'LQC_PROOF_TO_SETTLEMENT',chainId:proof.chainId,proofHash:proof.proofHash.toLowerCase(),transactionHash:execution.transactionHash.toLowerCase(),blockHash:execution.blockHash.toLowerCase(),blockNumber:execution.blockNumber,settledAt:execution.settledAt,recipient:execution.recipient.toLowerCase(),tokenOut:proof.tokenOut,expectedAmountOut:expected.toString(),minimumAmountOut:minimum.toString(),actualAmountOut:actual.toString(),minimumSatisfied:actual>=minimum,executionDeltaBps};
    if(!payload.minimumSatisfied)throw new Error('Settlement violates minimum output');
    return{...payload,settlementHash:ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload)))};
  }
  function verifySettlementReceipt(receipt,proof,ethers){
    if(!receipt||!verifyBestExecutionProof(proof,ethers)||!ethers.isHexString(receipt.settlementHash,32)||receipt.proofHash!==proof.proofHash.toLowerCase())return false;
    const{settlementHash,...payload}=receipt;
    if(payload.type!=='LQC_PROOF_TO_SETTLEMENT'||payload.version!==1||payload.chainId!==proof.chainId||payload.tokenOut!==proof.tokenOut||payload.expectedAmountOut!==proof.plan.expectedOut||payload.minimumAmountOut!==proof.plan.minimumOut||payload.minimumSatisfied!==true)return false;
    if(!ethers.isHexString(payload.transactionHash,32)||!ethers.isHexString(payload.blockHash,32)||!ethers.isAddress(payload.recipient)||!Number.isInteger(payload.blockNumber)||payload.blockNumber<proof.quoteBlock||!Number.isInteger(payload.settledAt)||payload.settledAt<=0||payload.settledAt>proof.expiresAt)return false;
    try{const actual=BigInt(payload.actualAmountOut),minimum=BigInt(payload.minimumAmountOut),expected=BigInt(payload.expectedAmountOut);if(actual<minimum||expected<=0n||payload.executionDeltaBps!==Number((actual-expected)*10000n/expected))return false;}catch{return false;}
    return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload))).toLowerCase()===settlementHash.toLowerCase();
  }
  async function verifyCanonicalSettlement(receipt,proof,provider,ethers,requiredConfirmations=3){
    if(!verifySettlementReceipt(receipt,proof,ethers))throw new Error('Invalid settlement receipt');
    if(!provider||typeof provider.getTransactionReceipt!=='function'||typeof provider.getBlock!=='function'||typeof provider.getBlockNumber!=='function'||!Number.isInteger(requiredConfirmations)||requiredConfirmations<1||requiredConfirmations>100)throw new Error('Invalid canonical verifier');
    const chainReceipt=await provider.getTransactionReceipt(receipt.transactionHash);
    if(!chainReceipt||Number(chainReceipt.status)!==1)throw new Error('Settlement transaction not successful');
    const chainTxHash=String(chainReceipt.hash||chainReceipt.transactionHash||'').toLowerCase();
    if(chainTxHash!==receipt.transactionHash||Number(chainReceipt.blockNumber)!==receipt.blockNumber||String(chainReceipt.blockHash||'').toLowerCase()!==receipt.blockHash)throw new Error('Settlement receipt mismatch');
    const canonicalBlock=await provider.getBlock(receipt.blockNumber);
    if(!canonicalBlock||String(canonicalBlock.hash||'').toLowerCase()!==receipt.blockHash)throw new Error('Settlement block is not canonical');
    const latestBlock=Number(await provider.getBlockNumber()),confirmations=latestBlock-receipt.blockNumber+1;
    if(!Number.isSafeInteger(latestBlock)||confirmations<requiredConfirmations)throw new Error('Settlement lacks confirmations');
    const transferTopic=ethers.id('Transfer(address,address,uint256)').toLowerCase(),recipientTopic=ethers.zeroPadValue(receipt.recipient,32).toLowerCase();
    let decodedAmountOut=0n,matchedTransfers=0;
    for(const log of chainReceipt.logs||[]){
      if(String(log.address||'').toLowerCase()!==receipt.tokenOut||String(log.topics?.[0]||'').toLowerCase()!==transferTopic||String(log.topics?.[2]||'').toLowerCase()!==recipientTopic||!ethers.isHexString(log.data,32))continue;
      decodedAmountOut+=BigInt(log.data);matchedTransfers++;
    }
    if(matchedTransfers===0||decodedAmountOut!==BigInt(receipt.actualAmountOut))throw new Error('Settlement output log mismatch');
    return{valid:true,chainId:receipt.chainId,proofHash:receipt.proofHash,settlementHash:receipt.settlementHash,transactionHash:receipt.transactionHash,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber,confirmations,requiredConfirmations,matchedTransfers,decodedAmountOut:decodedAmountOut.toString()};
  }
  async function verifyCanonicalNativeSettlement(receipt,proof,provider,nativeRouter,ethers,requiredConfirmations=3){
    if(!verifySettlementReceipt(receipt,proof,ethers))throw new Error('Invalid settlement receipt');
    if(!provider||typeof provider.getTransactionReceipt!=='function'||typeof provider.getBlock!=='function'||typeof provider.getBlockNumber!=='function'||!ethers.isAddress(nativeRouter)||!Number.isInteger(requiredConfirmations)||requiredConfirmations<1||requiredConfirmations>100)throw new Error('Invalid native verifier');
    const chainReceipt=await provider.getTransactionReceipt(receipt.transactionHash);
    if(!chainReceipt||Number(chainReceipt.status)!==1)throw new Error('Settlement transaction not successful');
    const chainTxHash=String(chainReceipt.hash||chainReceipt.transactionHash||'').toLowerCase();
    if(chainTxHash!==receipt.transactionHash||Number(chainReceipt.blockNumber)!==receipt.blockNumber||String(chainReceipt.blockHash||'').toLowerCase()!==receipt.blockHash)throw new Error('Settlement receipt mismatch');
    const canonicalBlock=await provider.getBlock(receipt.blockNumber);
    if(!canonicalBlock||String(canonicalBlock.hash||'').toLowerCase()!==receipt.blockHash)throw new Error('Settlement block is not canonical');
    const latestBlock=Number(await provider.getBlockNumber()),confirmations=latestBlock-receipt.blockNumber+1;
    if(!Number.isSafeInteger(latestBlock)||confirmations<requiredConfirmations)throw new Error('Settlement lacks confirmations');
    const eventTopic=ethers.id('NativeSwapExecuted(address,address,address,bool,uint256,uint256)').toLowerCase(),recipientTopic=ethers.zeroPadValue(receipt.recipient,32).toLowerCase(),tokenTopic=ethers.zeroPadValue(proof.tokenIn,32).toLowerCase();
    const matches=(chainReceipt.logs||[]).filter(log=>String(log.address||'').toLowerCase()===nativeRouter.toLowerCase()&&String(log.topics?.[0]||'').toLowerCase()===eventTopic&&String(log.topics?.[2]||'').toLowerCase()===recipientTopic&&String(log.topics?.[3]||'').toLowerCase()===tokenTopic&&ethers.isHexString(log.data,96));
    if(matches.length!==1)throw new Error('Native settlement event mismatch');
    const[nativeIn,amountIn,amountOut]=ethers.AbiCoder.defaultAbiCoder().decode(['bool','uint256','uint256'],matches[0].data);
    if(nativeIn!==false||amountIn!==BigInt(proof.amountIn)||amountOut!==BigInt(receipt.actualAmountOut))throw new Error('Native settlement amount mismatch');
    return{valid:true,kind:'native-bnb',chainId:receipt.chainId,proofHash:receipt.proofHash,settlementHash:receipt.settlementHash,transactionHash:receipt.transactionHash,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber,confirmations,requiredConfirmations,nativeRouter:nativeRouter.toLowerCase(),decodedAmountOut:amountOut.toString()};
  }
  function explainSwapError(error){
    const code=String(error?.code||error?.info?.error?.code||'').toUpperCase();
    const message=String(error?.shortMessage||error?.reason||error?.message||'').toLowerCase();
    if(code==='ACTION_REJECTED'||message.includes('user rejected')||message.includes('user denied'))return{code:'USER_REJECTED',message:'지갑에서 거래가 취소되었습니다.',action:'원하시면 견적을 다시 확인한 뒤 재시도하세요.',retryable:true};
    if(code==='INSUFFICIENT_FUNDS'||message.includes('insufficient funds'))return{code:'INSUFFICIENT_GAS',message:'거래를 실행할 BNB 가스비가 부족합니다.',action:'소량의 tBNB를 준비한 뒤 다시 시도하세요.',retryable:true};
    if(message.includes('stalequote')||message.includes('staleproof')||message.includes('quotetradechanged'))return{code:'STALE_QUOTE',message:'표시된 견적이 만료되었거나 거래 조건이 변경되었습니다.',action:'최신 견적을 확인한 뒤 다시 실행하세요.',retryable:true};
    if(message.includes('quotepricemoved')||message.includes('insufficientoutput')||message.includes('too little received')||message.includes('slippage'))return{code:'PRICE_MOVED',message:'가격이 변해 최소 수령 조건을 충족하지 못했습니다.',action:'새 견적을 받은 뒤 슬리피지를 확인하고 재시도하세요.',retryable:true};
    if(message.includes('novalidquote')||message.includes('noexecutableroute')||message.includes('no approved')||message.includes('liquidity'))return{code:'NO_ROUTE',message:'현재 실행 가능한 유동성 경로가 없습니다.',action:'수량을 줄이거나 다른 거래쌍을 선택하세요.',retryable:true};
    if(message.includes('paused')||message.includes('limit')||message.includes('cap')||message.includes('unsupportedtoken'))return{code:'RISK_BLOCKED',message:'LQC 위험관리 정책이 이 거래를 차단했습니다.',action:'거래 한도와 토큰·DEX 활성 상태를 확인하세요.',retryable:false};
    if(message.includes('allowance')||message.includes('approve'))return{code:'APPROVAL_REQUIRED',message:'토큰 사용 승인이 완료되지 않았습니다.',action:'승인 거래를 완료한 뒤 Swap을 다시 실행하세요.',retryable:true};
    if(message.includes('routechangedduringapproval')||message.includes('proofroutechanged')||message.includes('prooftradechanged'))return{code:'ROUTE_CHANGED',message:'승인 중 최적 거래 경로가 다시 변경되었습니다.',action:'최신 견적을 확인한 뒤 Swap을 다시 실행하세요.',retryable:true};
    if(code==='CALL_EXCEPTION'||message.includes('execution reverted')||message.includes('missing revert data'))return{code:'SIMULATION_FAILED',message:'사전 시뮬레이션에서 거래 실패가 예상되어 제출을 중단했습니다.',action:'최신 견적과 잔액·승인 상태를 확인하세요.',retryable:true};
    if(code==='NETWORK_ERROR'||message.includes('network')||message.includes('chain'))return{code:'NETWORK_ERROR',message:'BSC 테스트넷 연결을 확인할 수 없습니다.',action:'지갑 네트워크를 BSC Testnet으로 전환하세요.',retryable:true};
    return{code:'UNKNOWN',message:'거래를 실행하지 못했습니다.',action:'최신 견적과 지갑 상태를 확인한 뒤 다시 시도하세요.',retryable:true};
  }
  async function verifyUiDeployment(provider,config,ethers){
    if(!provider||typeof provider.getNetwork!=='function'||typeof provider.getCode!=='function'||!config||!ethers)throw new Error('Invalid deployment verifier');
    const network=await provider.getNetwork();
    if(BigInt(network.chainId)!==BigInt(config.chainId))throw new Error('Deployment chain mismatch');
    const named={routerAddress:config.routerAddress,quoteRouterAddress:config.quoteRouterAddress,executionRouterAddress:config.executionRouterAddress,nativeRouterAddress:config.nativeRouterAddress,splitOptimizerAddress:config.splitOptimizerAddress,autoRouterAddress:config.autoRouterAddress,gasCostOracleAddress:config.gasCostOracleAddress};
    for(const token of config.tokens||[])if(token.address!=='native')named[`token:${token.symbol}`]=token.address;
    for(const dex of config.dexes||[])named[`adapter:${dex.id}`]=dex.adapter;
    const entries=Object.entries(named);
    if(entries.length<10)throw new Error('Deployment configuration incomplete');
    const normalized=entries.map(([name,address])=>{if(!ethers.isAddress(address)||address===ethers.ZeroAddress)throw new Error(`Invalid deployment address ${name}`);return[name,address.toLowerCase()]});
    if(new Set(normalized.map(([,address])=>address)).size!==normalized.length)throw new Error('Duplicate deployment address');
    const codes=await Promise.all(normalized.map(([,address])=>provider.getCode(address)));
    const missing=normalized.filter((_,index)=>!codes[index]||codes[index]==='0x').map(([name])=>name);
    if(missing.length)throw new Error(`Deployment bytecode missing: ${missing.join(',')}`);
    return{ready:true,chainId:Number(network.chainId),checked:normalized.length};
  }
  async function verifyMinimalUiDeployment(provider,config,ethers){
    if(!provider||typeof provider.getNetwork!=='function'||typeof provider.getCode!=='function'||typeof provider.call!=='function'||!config||!ethers)throw new Error('Invalid minimal deployment verifier');
    const network=await provider.getNetwork();
    if(BigInt(network.chainId)!==BigInt(config.chainId))throw new Error('Deployment chain mismatch');
    const wbnb=config.tokens?.find(token=>token.symbol==='WBNB')?.address,lqc=config.tokens?.find(token=>token.symbol==='LQC')?.address;
    const named={routerAddress:config.routerAddress,'token:WBNB':wbnb,'token:LQC':lqc};
    const normalized=Object.entries(named).map(([name,address])=>{if(!ethers.isAddress(address)||address===ethers.ZeroAddress)throw new Error(`Invalid deployment address ${name}`);return[name,ethers.getAddress(address)]});
    if(new Set(normalized.map(([,address])=>address.toLowerCase())).size!==normalized.length)throw new Error('Duplicate deployment address');
    const codes=await Promise.all(normalized.map(([,address])=>provider.getCode(address)));
    const missing=normalized.filter((_,index)=>!codes[index]||codes[index]==='0x').map(([name])=>name);
    if(missing.length)throw new Error(`Deployment bytecode missing: ${missing.join(',')}`);
    const routerInterface=new ethers.Interface(['function factory() view returns(address)','function WBNB() view returns(address)']);
    const readAddress=async name=>{
      const data=routerInterface.encodeFunctionData(name),result=await provider.call({to:config.routerAddress,data});
      try{return ethers.getAddress(routerInterface.decodeFunctionResult(name,result)[0]);}catch{throw new Error(`Minimal router ${name} read failed`)}
    };
    const[factory,routerWbnb]=await Promise.all([readAddress('factory'),readAddress('WBNB')]);
    if(routerWbnb.toLowerCase()!==ethers.getAddress(wbnb).toLowerCase())throw new Error('Minimal router WBNB mismatch');
    if(factory===ethers.ZeroAddress||normalized.some(([,address])=>address.toLowerCase()===factory.toLowerCase()))throw new Error('Invalid minimal router factory');
    const factoryCode=await provider.getCode(factory);
    if(!factoryCode||factoryCode==='0x')throw new Error('Deployment bytecode missing: factory');
    return{ready:true,chainId:Number(network.chainId),checked:4,factory};
  }
  function validateSwapReceipt(receipt,submittedHash,ethers){
    if(!receipt||!ethers||!ethers.isHexString(submittedHash,32))throw new Error('Invalid submitted transaction');
    if(Number(receipt.status)!==1)throw new Error('Swap transaction failed');
    const receiptHash=String(receipt.hash||receipt.transactionHash||'');
    if(!ethers.isHexString(receiptHash,32)||receiptHash.toLowerCase()!==submittedHash.toLowerCase())throw new Error('Swap transaction hash mismatch');
    if(!Number.isSafeInteger(Number(receipt.blockNumber))||Number(receipt.blockNumber)<=0||!ethers.isHexString(receipt.blockHash,32))throw new Error('Invalid swap confirmation');
    return{confirmed:true,transactionHash:receiptHash.toLowerCase(),blockHash:receipt.blockHash.toLowerCase(),blockNumber:Number(receipt.blockNumber)};
  }
  function validateTransactionFunds(input){
    const{nativeBalance,tokenBalance,amountIn,estimatedGas,feePerGas,nativeInput}=input||{};
    for(const value of[nativeBalance,amountIn,estimatedGas,feePerGas])if(typeof value!=='bigint'||value<0n)throw new Error('Invalid transaction funds');
    if(amountIn===0n||typeof nativeInput!=='boolean'||(!nativeInput&&(typeof tokenBalance!=='bigint'||tokenBalance<0n)))throw new Error('Invalid transaction funds');
    if(!nativeInput&&tokenBalance<amountIn)throw new Error('insufficient funds: token balance');
    const gasCost=estimatedGas*feePerGas,requiredNative=gasCost+(nativeInput?amountIn:0n);
    if(nativeBalance<requiredNative)throw new Error('insufficient funds: native balance and gas');
    return{sufficient:true,gasCost,requiredNative};
  }
  global.LQCRouterSDK=Object.freeze({encodeRoute,encodeRoutes,minimumAmountOut,priceImpactBps,priceImpactFromExpected,constantProductHopEvidence,v2RoutePriceImpactEvidence,readV2RouteReserves,readV2AdapterRouteReserves,v3ConcentratedLiquidityHopEvidence,v3RoutePriceImpactEvidence,oracleMarketDeviationEvidence,tickToSqrtPriceX96,initializedTicksFromBitmapWords,readV3PoolState,estimatedGasWei,gasEstimateEvidence,estimateExecutionGas,routeFeeBps,summarizeSplit,isSplitNetBetter,walletSessionState,validateExecutionSession,validatePendingNonce,requiresTokenApproval,exactApprovalAmounts,isLatestQuote,validateExecutionQuote,rankRouteQuotes,buildBestExecutionProof,verifyBestExecutionProof,validateExecutionPlanProof,buildExecutionIntent,verifyExecutionIntent,buildIntentBoundSettlementReceipt,verifyIntentBoundSettlementReceipt,buildQuoteApiRequest,validateQuoteApiResponse,recoveryActionForError,buildSettlementReceipt,verifySettlementReceipt,verifyCanonicalSettlement,verifyCanonicalNativeSettlement,explainSwapError,verifyUiDeployment,verifyMinimalUiDeployment,validateSwapReceipt,validateTransactionFunds,SUPPORTED_V3_FEES:[...SUPPORTED_V3_FEES]});
})(typeof window==='undefined'?globalThis:window);
