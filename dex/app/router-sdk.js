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
  function walletSessionState(accounts,remembered,chainId,expectedChainId){
    if(!remembered||!Array.isArray(accounts)||accounts.length===0)return'disconnected';
    if(String(chainId).toLowerCase()!==String(expectedChainId).toLowerCase())return'wrong_network';
    return'connected';
  }
  function hasSufficientInputBalance(balance,amountIn){
    if(typeof balance!=='bigint'||balance<0n||typeof amountIn!=='bigint'||amountIn<=0n)throw new Error('Invalid balance state');
    return balance>=amountIn;
  }
  function hasSufficientNativeBalance(balance,nativeValue,estimatedGas){
    if(typeof balance!=='bigint'||balance<0n||typeof nativeValue!=='bigint'||nativeValue<0n||typeof estimatedGas!=='bigint'||estimatedGas<0n)throw new Error('Invalid native balance state');
    return balance>=nativeValue+estimatedGas;
  }
  function requiresTokenApproval(allowance,amountIn){
    if(typeof allowance!=='bigint'||allowance<0n||typeof amountIn!=='bigint'||amountIn<=0n)throw new Error('Invalid approval state');
    return allowance<amountIn;
  }
  function tokenApprovalSequence(allowance,amountIn){
    if(!requiresTokenApproval(allowance,amountIn))return[];
    return allowance===0n?[amountIn]:[0n,amountIn];
  }
  function isRefreshedOutputAcceptable(originalAmountOut,refreshedAmountOut,slippagePercent){
    if(typeof originalAmountOut!=='bigint'||originalAmountOut<=0n||typeof refreshedAmountOut!=='bigint'||refreshedAmountOut<=0n)throw new Error('Invalid quote output');
    return refreshedAmountOut>=minimumAmountOut(originalAmountOut,slippagePercent);
  }
  function executionContextMatches(expectedAccount,currentAccounts,expectedChainId,currentChainId){
    if(typeof expectedAccount!=='string'||!expectedAccount)return false;
    if(!Array.isArray(currentAccounts)||currentAccounts.length===0)return false;
    return expectedAccount.toLowerCase()===String(currentAccounts[0]).toLowerCase()&&String(expectedChainId).toLowerCase()===String(currentChainId).toLowerCase();
  }
  function executionPlanFingerprint(plan){
    if(!plan||!['single','split'].includes(plan.kind))throw new Error('Invalid execution plan');
    if(plan.kind==='single'){
      const dexId=String(plan.single?.best?.dexId||'').toLowerCase(),routeData=String(plan.single?.routeData||'').toLowerCase();
      if(!dexId||!routeData)return'';
      return`single:${dexId}:${routeData}`;
    }
    const dexIds=Array.from(plan.split?.dexIds||[]),amounts=Array.from(plan.split?.amountsIn||[]),routes=Array.from(plan.routes||[]);
    if(dexIds.length===0||dexIds.length!==amounts.length||dexIds.length!==routes.length)return'';
    const legs=[];
    for(let i=0;i<dexIds.length;i++){
      if(typeof amounts[i]!=='bigint'||amounts[i]<0n)return'';
      if(amounts[i]===0n)continue;
      legs.push(`${String(dexIds[i]).toLowerCase()}:${amounts[i]}:${String(routes[i]).toLowerCase()}`);
    }
    return legs.length?`split:${legs.join('|')}`:'';
  }
  function rankRouteQuotes(candidates){
    if(!Array.isArray(candidates))throw new Error('Invalid route quotes');
    return candidates.filter(item=>item&&typeof item.amountOut==='bigint'&&item.amountOut>0n).map(item=>{
      const cost=typeof item.cost==='bigint'&&item.cost>0n?item.cost:0n;
      return{...item,netAmountOut:item.amountOut>cost?item.amountOut-cost:0n};
    }).filter(item=>item.netAmountOut>0n).sort((a,b)=>a.netAmountOut===b.netAmountOut?Number(b.priority||0)-Number(a.priority||0):(a.netAmountOut>b.netAmountOut?-1:1));
  }
  function explainSwapError(error){
    const code=String(error?.code||error?.info?.error?.code||'').toUpperCase();
    const message=String(error?.shortMessage||error?.reason||error?.message||'').toLowerCase();
    if(code==='ACTION_REJECTED'||message.includes('user rejected')||message.includes('user denied'))return{code:'USER_REJECTED',message:'지갑에서 거래가 취소되었습니다.',action:'원하시면 견적을 다시 확인한 뒤 재시도하세요.',retryable:true};
    if(code==='INSUFFICIENT_FUNDS'||message.includes('insufficient funds'))return{code:'INSUFFICIENT_GAS',message:'거래를 실행할 BNB 가스비가 부족합니다.',action:'소량의 tBNB를 준비한 뒤 다시 시도하세요.',retryable:true};
    if(message.includes('insufficientinputbalance'))return{code:'INSUFFICIENT_BALANCE',message:'입력한 거래 수량이 지갑 잔액보다 많습니다.',action:'수량을 줄이거나 토큰 잔액을 확인하세요.',retryable:true};
    if(message.includes('insufficientgasreserve'))return{code:'INSUFFICIENT_GAS_RESERVE',message:'거래와 승인에 필요한 BNB 가스비 여유분이 부족합니다.',action:'tBNB를 추가하거나 거래 수량을 줄여주세요.',retryable:true};
    if(message.includes('insufficientoutput')||message.includes('too little received')||message.includes('slippage'))return{code:'PRICE_MOVED',message:'가격이 변해 최소 수령 조건을 충족하지 못했습니다.',action:'새 견적을 받은 뒤 슬리피지를 확인하고 재시도하세요.',retryable:true};
    if(message.includes('novalidquote')||message.includes('noexecutableroute')||message.includes('no approved')||message.includes('liquidity'))return{code:'NO_ROUTE',message:'현재 실행 가능한 유동성 경로가 없습니다.',action:'수량을 줄이거나 다른 거래쌍을 선택하세요.',retryable:true};
    if(message.includes('paused')||message.includes('limit')||message.includes('cap')||message.includes('unsupportedtoken'))return{code:'RISK_BLOCKED',message:'LQC 위험관리 정책이 이 거래를 차단했습니다.',action:'거래 한도와 토큰·DEX 활성 상태를 확인하세요.',retryable:false};
    if(message.includes('allowance')||message.includes('approve'))return{code:'APPROVAL_REQUIRED',message:'토큰 사용 승인이 완료되지 않았습니다.',action:'승인 거래를 완료한 뒤 Swap을 다시 실행하세요.',retryable:true};
    if(message.includes('routechangedduringapproval'))return{code:'ROUTE_CHANGED',message:'승인 중 최적 거래 경로가 다시 변경되었습니다.',action:'최신 견적을 확인한 뒤 Swap을 다시 실행하세요.',retryable:true};
    if(message.includes('quoteworsenedduringapproval'))return{code:'QUOTE_WORSENED',message:'승인 중 예상 수령액이 허용 범위보다 낮아졌습니다.',action:'새 견적과 가격영향을 확인한 뒤 Swap을 다시 실행하세요.',retryable:true};
    if(message.includes('walletcontextchanged'))return{code:'WALLET_CHANGED',message:'거래 확인 중 지갑 계정 또는 네트워크가 변경되었습니다.',action:'현재 계정과 BSC 테스트넷을 확인한 뒤 새 견적을 받아주세요.',retryable:true};
    if(code==='NETWORK_ERROR'||message.includes('network')||message.includes('chain'))return{code:'NETWORK_ERROR',message:'BSC 테스트넷 연결을 확인할 수 없습니다.',action:'지갑 네트워크를 BSC Testnet으로 전환하세요.',retryable:true};
    return{code:'UNKNOWN',message:'거래를 실행하지 못했습니다.',action:'최신 견적과 지갑 상태를 확인한 뒤 다시 시도하세요.',retryable:true};
  }
  global.LQCRouterSDK=Object.freeze({encodeRoute,encodeRoutes,minimumAmountOut,priceImpactBps,priceImpactFromExpected,estimatedGasWei,routeFeeBps,summarizeSplit,isSplitNetBetter,walletSessionState,hasSufficientInputBalance,hasSufficientNativeBalance,requiresTokenApproval,tokenApprovalSequence,isRefreshedOutputAcceptable,executionContextMatches,executionPlanFingerprint,rankRouteQuotes,explainSwapError,SUPPORTED_V3_FEES:[...SUPPORTED_V3_FEES]});
})(typeof window==='undefined'?globalThis:window);
