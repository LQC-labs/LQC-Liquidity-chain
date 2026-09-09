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
    if(expectedOut===0n||amountOut>=expectedOut)return 0;
    return Number((expectedOut-amountOut)*10000n/expectedOut);
  }
  function estimatedGasWei(dex,gasPriceWei,nativeSwap=false){
    const gasUnits=BigInt(dex?.gasUnits||(nativeSwap?260000:220000));
    if(typeof gasPriceWei!=='bigint'||gasPriceWei<0n)throw new Error('Invalid gas price');
    return gasUnits*gasPriceWei;
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
  function netQuoteSummary(selectedAmountOut,selectedCost,baselineAmountOut,baselineCost){
    for(const value of [selectedAmountOut,selectedCost,baselineAmountOut,baselineCost])if(typeof value!=='bigint'||value<0n)throw new Error('Invalid net quote');
    const net=value=>value[0]>value[1]?value[0]-value[1]:0n;
    const netAmountOut=net([selectedAmountOut,selectedCost]),baselineNetAmountOut=net([baselineAmountOut,baselineCost]);
    return{netAmountOut,baselineNetAmountOut,savings:netAmountOut>baselineNetAmountOut?netAmountOut-baselineNetAmountOut:0n};
  }
  function tradeReadiness({connected,deployed,hasRoute,amountIn,balanceIn,priceImpactBps:impact,quoteAgeMs=0}){
    const blockers=[],warnings=[];
    if(!deployed)blockers.push('TESTNET_CONTRACTS_UNAVAILABLE');
    if(!connected)blockers.push('WALLET_NOT_CONNECTED');
    if(!hasRoute)blockers.push('NO_VALID_ROUTE');
    if(typeof amountIn!=='bigint'||amountIn<=0n)blockers.push('INVALID_AMOUNT');
    if(typeof balanceIn==='bigint'&&typeof amountIn==='bigint'&&amountIn>balanceIn)blockers.push('INSUFFICIENT_BALANCE');
    if(!Number.isInteger(impact)||impact<0)blockers.push('INVALID_PRICE_IMPACT');
    else if(impact>=500)blockers.push('PRICE_IMPACT_TOO_HIGH');
    else if(impact>=300)warnings.push('HIGH_PRICE_IMPACT');
    if(!Number.isFinite(quoteAgeMs)||quoteAgeMs<0||quoteAgeMs>30000)blockers.push('STALE_QUOTE');
    else if(quoteAgeMs>15000)warnings.push('QUOTE_AGING');
    return{ready:blockers.length===0,blockers,warnings};
  }
  function gaslessEligibility(policy,tokenSymbol,amountIn,estimatedGas){
    if(!policy?.enabled)return{eligible:false,reason:'GASLESS_DISABLED'};
    if(typeof policy.paymasterAddress!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(policy.paymasterAddress)||!policy.bundlerUrl)return{eligible:false,reason:'PAYMASTER_UNAVAILABLE'};
    if(!Array.isArray(policy.sponsoredSymbols)||!policy.sponsoredSymbols.includes(tokenSymbol))return{eligible:false,reason:'TOKEN_NOT_SPONSORED'};
    if(typeof amountIn!=='bigint'||amountIn<=0n||typeof estimatedGas!=='bigint'||estimatedGas<0n)return{eligible:false,reason:'INVALID_GASLESS_QUOTE'};
    let maxInput,maxGas;try{maxInput=BigInt(policy.maxInputRaw);maxGas=BigInt(policy.maxSponsoredGasWei)}catch{return{eligible:false,reason:'INVALID_GASLESS_POLICY'}}
    if(maxInput<=0n||maxGas<=0n)return{eligible:false,reason:'INVALID_GASLESS_POLICY'};
    if(amountIn>maxInput)return{eligible:false,reason:'SPONSOR_INPUT_LIMIT'};
    if(estimatedGas>maxGas)return{eligible:false,reason:'SPONSOR_GAS_LIMIT'};
    return{eligible:true,reason:'SPONSORED'};
  }
  global.LQCRouterSDK=Object.freeze({encodeRoute,encodeRoutes,minimumAmountOut,priceImpactBps,estimatedGasWei,routeFeeBps,summarizeSplit,isSplitNetBetter,netQuoteSummary,tradeReadiness,gaslessEligibility,SUPPORTED_V3_FEES:[...SUPPORTED_V3_FEES]});
})(typeof window==='undefined'?globalThis:window);
