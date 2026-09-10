(function(){
  'use strict';
  const cfg=window.LQC_FLOW_CONFIG,{ethers,LQCRouterSDK:sdk,LQCCandleData:candleData,LQCChartIndicators:indicatorMath}=window,$=id=>document.getElementById(id);
  const routerAbi=['function getAmountsOut(uint256,address[]) view returns (uint256[])','function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])','function swapExactBNBForTokens(uint256,address[],address,uint256) payable returns (uint256[])','function swapExactTokensForBNB(uint256,uint256,address[],address,uint256) returns (uint256[])'];
  const quoteRouterAbi=['function quoteBest(address,address,uint256,bytes[]) view returns ((bytes32 dexId,address adapter,uint256 amountOut,uint32 priority))'];
  const executionRouterAbi=['function swapExactInput(bytes32,address,address,uint256,uint256,address,uint256,bytes) returns (uint256)'];
  const nativeRouterAbi=['function swapExactNativeForToken(bytes32,address,uint256,address,uint256,bytes) payable returns (uint256)','function swapExactTokenForNative(bytes32,address,uint256,uint256,address,uint256,bytes) returns (uint256)'];
  const splitOptimizerAbi=['function quoteOptimalSplitCapped(address,address,uint256,bytes[],uint256[],uint256,uint256) view returns ((bytes32[] dexIds,address[] adapters,uint256[] amountsIn,uint256[] amountsOut,uint256 totalAmountOut,uint256 totalNetAmountOut))'];
  const autoRouterAbi=['function swapOptimizedExactInput(address,address,uint256,address,uint256,bytes[],uint256[],uint256,uint256) returns (uint256)'];
  const gasCostOracleAbi=['function quoteRouteCosts(address,uint256[],uint256) view returns (uint256[])'];
  const tokenAbi=['function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)'];
  const adapterAbi=['function quoteExactInput(address,address,uint256,bytes) view returns (uint256)'];
  const ui={connect:$('connectButton'),settings:$('settingsButton'),settingsPanel:$('settingsPanel'),amountIn:$('amountIn'),amountOut:$('amountOut'),minimum:$('minimumReceived'),gas:$('estimatedGas'),impact:$('priceImpact'),split:$('splitRatio'),route:$('routeLabel'),selectedDex:$('selectedDex'),selectedPath:$('selectedPath'),routeStrategy:$('routeStrategy'),alternativeRoute:$('alternativeRoute'),preflightState:$('preflightState'),balanceIn:$('balanceIn'),balanceOut:$('balanceOut'),walletDialog:$('walletDialog'),walletList:$('walletList'),positionBalance:$('positionBalance'),portfolioValue:$('portfolioValue'),tokenInButton:$('tokenInButton'),tokenOutButton:$('tokenOutButton'),flip:$('flipButton'),max:$('maxButton'),buy:$('buyAction'),sell:$('sellAction'),buyTab:$('buyTab'),sellTab:$('sellTab'),quick:$('quickTrade'),marketNav:$('marketNav'),tradeNav:$('tradeNav'),walletNav:$('walletNav'),order:$('orderPanel'),close:$('closeOrder'),title:$('orderTitle'),execute:$('executeButton'),status:$('statusBox'),statusText:$('statusText'),dialog:$('tokenDialog'),tokenList:$('tokenList'),tokenSearch:$('tokenSearch'),tokenCount:$('tokenCount'),tokenEmpty:$('tokenEmpty'),marketSelector:$('marketSelector'),marketPair:$('marketPair'),marketDialog:$('marketDialog'),marketList:$('marketList'),marketSearch:$('marketSearch'),marketCount:$('marketCount'),marketEmpty:$('marketEmpty'),tickerPrice:$('tickerPrice'),tickerChange:$('tickerChange'),priceSourceLabel:$('priceSourceLabel'),quoteAssetStat:$('quoteAssetStat'),priceStatusStat:$('priceStatusStat'),high24h:$('high24hStat'),low24h:$('low24hStat'),volume24h:$('volume24hStat'),slippage:$('slippageInput')};
  const walletMemoryKey='lqc-flow-wallet-connected';
  const chartMemoryKey='lqc-flow-chart-preferences',supportedTimeframes=['1m','3m','5m','15m','1h','4h','1D','1W','1M'],supportedIndicators=['volume','ma','ema','boll','sar','macd','kdj'],lowerIndicators=['volume','macd','kdj'];
  function storedChartPreferences(){try{const value=JSON.parse(localStorage.getItem(chartMemoryKey)||'null');if(!value||!supportedTimeframes.includes(value.timeframe)||!Array.isArray(value.indicators))return null;const indicators=[...new Set(value.indicators.filter(name=>supportedIndicators.includes(name)))],lower=indicators.find(name=>lowerIndicators.includes(name));return{timeframe:value.timeframe,indicators:indicators.filter(name=>!lowerIndicators.includes(name)||name===lower)}}catch{return null}}
  const initialChartPreferences=storedChartPreferences();
  let walletProvider,provider,signer,account,router,quoteRouter,executionRouter,nativeRouter,splitOptimizer,autoRouter,gasCostOracle,wallets=[],boundWallets=new WeakSet(),side='in',timer,chartRefreshTimer,marketPriceRequest=0,chartRequest=0,selectedTimeframe=initialChartPreferences?.timeframe||'1m',mode='buy',selectedAsset=cfg.tokens.find(t=>t.symbol==='LQC')||cfg.tokens[0],quoteToken=cfg.tokens.find(t=>t.symbol==='USDT')||cfg.tokens.find(t=>t.symbol==='BNB')||cfg.tokens[0],tokenIn=quoteToken,tokenOut=selectedAsset;
  const deployed=ethers.isAddress(cfg.quoteRouterAddress)&&ethers.isAddress(cfg.executionRouterAddress)&&ethers.isAddress(cfg.nativeRouterAddress)&&ethers.isAddress(cfg.splitOptimizerAddress)&&ethers.isAddress(cfg.autoRouterAddress)&&ethers.isAddress(cfg.gasCostOracleAddress)&&cfg.tokens.filter(t=>t.address!=='native').every(t=>ethers.isAddress(t.address));
  const readProvider=deployed?new ethers.JsonRpcProvider(cfg.rpcUrls[0],cfg.chainId,{staticNetwork:true}):null,marketQuoteRouter=deployed?new ethers.Contract(cfg.quoteRouterAddress,quoteRouterAbi,readProvider):null;
  const address=t=>t.address==='native'?(cfg.tokens.find(x=>x.symbol==='WBNB')?.address||''):t.address;
  const status=(m,type='')=>{ui.status.className=`status ${type}`.trim();ui.statusText.textContent=m};
  const disabled=v=>ui.execute.disabled=v;
  function render(){for(const [s,t] of [['In',tokenIn],['Out',tokenOut]]){$(`token${s}Label`).textContent=t.symbol;$(`token${s}Icon`).textContent=t.symbol.slice(0,4);$(`token${s}Icon`).classList.toggle('mint',t.symbol==='LQC')}const path=`${tokenIn.symbol} → ${tokenOut.symbol}`;ui.route.textContent=path;ui.selectedPath.textContent=path;ui.marketPair.textContent=`${selectedAsset.symbol} / ${quoteToken.symbol}`}
  function setMode(next,open=true){mode=next;[tokenIn,tokenOut]=next==='buy'?[quoteToken,selectedAsset]:[selectedAsset,quoteToken];const label=`${selectedAsset.symbol} ${next==='buy'?'매수':'매도'}`;ui.title.textContent=label;ui.execute.textContent=label;ui.execute.className=`execute-button ${next}`;for(const button of [ui.buy,ui.buyTab])button.classList.toggle('active',next==='buy');for(const button of [ui.sell,ui.sellTab])button.classList.toggle('active',next==='sell');if(open)ui.order.classList.add('open');render();balances();refreshMarketPrice();quoteSoon()}
  function pairApproved(a,b){
    const endpoints=[address(a).toLowerCase(),address(b).toLowerCase()].sort();
    if(endpoints[0]===endpoints[1])return false;
    if(!a.reviewed&&!b.reviewed)return true;
    return (cfg.reviewedPairs||[]).some(pair=>[pair.tokenA.toLowerCase(),pair.tokenB.toLowerCase()].sort().every((value,index)=>value===endpoints[index]));
  }
  function preferredQuote(asset){return ['USDT','BNB','LQC','WBNB'].map(symbol=>cfg.tokens.find(token=>token.symbol===symbol)).find(token=>token&&pairApproved(asset,token))}
  function marketList(query=''){
    const needle=query.trim().toLowerCase(),tokens=cfg.tokens.filter(token=>preferredQuote(token)&&(!needle||[token.symbol,token.name,token.address].some(value=>String(value).toLowerCase().includes(needle))));
    ui.marketCount.textContent=`${tokens.length}개 거래 가능`;ui.marketEmpty.hidden=tokens.length>0;
    ui.marketList.replaceChildren(...tokens.map((token,index)=>{const button=document.createElement('button'),rank=document.createElement('span'),identity=document.createElement('span'),icon=document.createElement('i'),names=document.createElement('span'),symbol=document.createElement('b'),name=document.createElement('small'),price=document.createElement('span'),state=document.createElement('span');button.type='button';button.className='market-row';button.setAttribute('role','option');rank.textContent=String(index+1);icon.textContent=token.symbol.slice(0,2);symbol.textContent=token.symbol;name.textContent=token.name;names.append(symbol,name);identity.append(icon,names);price.textContent='—';state.textContent=token.address==='native'?'네이티브':'검토됨';button.append(rank,identity,price,state);button.onclick=()=>selectMarket(token);return button}))
  }
  function selectMarket(token){const fallback=preferredQuote(token);if(!fallback)return status('이 토큰에 승인된 기준 마켓이 없습니다.','error');selectedAsset=token;quoteToken=fallback;ui.marketDialog.close();setMode(mode,false);loadChartHistory();window.scrollTo({top:0,behavior:'smooth'})}
  function openMarkets(){ui.order.classList.remove('open');ui.marketSearch.value='';marketList();ui.marketDialog.showModal();setTimeout(()=>ui.marketSearch.focus(),0)}
  async function ensureNetwork(target,interactive=true){const chain=await target.request({method:'eth_chainId'});if(chain.toLowerCase()===cfg.chainIdHex.toLowerCase())return true;if(!interactive)return false;try{await target.request({method:'wallet_switchEthereumChain',params:[{chainId:cfg.chainIdHex}]})}catch(e){if(e.code!==4902)throw e;await target.request({method:'wallet_addEthereumChain',params:[{chainId:cfg.chainIdHex,chainName:cfg.chainName,rpcUrls:cfg.rpcUrls,nativeCurrency:cfg.nativeCurrency,blockExplorerUrls:cfg.blockExplorerUrls}]})}return true}
  async function connect(target=walletProvider||wallets[0]?.provider||window.ethereum,interactive=true){
    if(!target)return status('설치된 비수탁형 지갑을 찾지 못했습니다. 지갑 앱 또는 브라우저 확장 프로그램을 확인하세요.','error');
    walletProvider=target;
    try{
      const accounts=await target.request({method:interactive?'eth_requestAccounts':'eth_accounts'}),chain=await target.request({method:'eth_chainId'}),remembered=localStorage.getItem(walletMemoryKey)==='1',session=sdk.walletSessionState(accounts,interactive||remembered,chain,cfg.chainIdHex);
      if(session==='disconnected'){if(interactive)status('지갑에서 연결을 승인해 주세요.');return}
      if(session==='wrong_network'&&!interactive){ui.connect.textContent='네트워크 전환';status('지갑이 감지되었습니다. BSC 테스트넷으로 전환하면 바로 연결됩니다.');return}
      await ensureNetwork(target,interactive);provider=new ethers.BrowserProvider(target);signer=await provider.getSigner();account=await signer.getAddress();localStorage.setItem(walletMemoryKey,'1');bindWalletEvents(target);ui.connect.textContent=`${account.slice(0,6)}…${account.slice(-4)}`;router=ethers.isAddress(cfg.routerAddress)?new ethers.Contract(cfg.routerAddress,routerAbi,signer):null;quoteRouter=deployed?new ethers.Contract(cfg.quoteRouterAddress,quoteRouterAbi,provider):null;executionRouter=deployed?new ethers.Contract(cfg.executionRouterAddress,executionRouterAbi,signer):null;nativeRouter=deployed?new ethers.Contract(cfg.nativeRouterAddress,nativeRouterAbi,signer):null;splitOptimizer=deployed?new ethers.Contract(cfg.splitOptimizerAddress,splitOptimizerAbi,provider):null;autoRouter=deployed?new ethers.Contract(cfg.autoRouterAddress,autoRouterAbi,signer):null;gasCostOracle=deployed?new ethers.Contract(cfg.gasCostOracleAddress,gasCostOracleAbi,provider):null;disabled(!deployed);status(deployed?'지갑 자동 연결 완료 · Router 2.0 준비됨':'지갑 연결 완료 · 테스트넷 컨트랙트 배포 대기 중',deployed?'success':'');await balances();quoteSoon()
    }catch(e){const guidance=sdk.explainSwapError(e);status(`${guidance.message} ${guidance.action}`,'error')}
  }
  async function balance(t){if(!provider||!account)return null;if(t.address==='native')return provider.getBalance(account);if(!ethers.isAddress(t.address))return null;return new ethers.Contract(t.address,tokenAbi,provider).balanceOf(account)}
  const format=(v,t)=>v===null?'—':Number(ethers.formatUnits(v,t.decimals)).toLocaleString(undefined,{maximumFractionDigits:5});
  async function balances(){const lqc=cfg.tokens.find(t=>t.symbol==='LQC'),[a,b,l]=await Promise.all([balance(tokenIn),balance(tokenOut),balance(lqc)]);ui.balanceIn.textContent=format(a,tokenIn);ui.balanceOut.textContent=format(b,tokenOut);ui.positionBalance.textContent=l===null?'—':`${format(l,lqc)} LQC`;if(l!==null)ui.portfolioValue.textContent=`$${(Number(ethers.formatUnits(l,lqc.decimals))*.091348).toLocaleString(undefined,{maximumFractionDigits:2})}`}
  async function applyBalancePercent(percent){const current=await balance(tokenIn);if(current===null)return status('먼저 지갑을 연결하세요.','error');const reserve=tokenIn.address==='native'?ethers.parseEther('.01'):0n,available=current>reserve?current-reserve:0n,value=available*BigInt(percent)/100n;ui.amountIn.value=ethers.formatUnits(value,tokenIn.decimals);quoteSoon()}
  function quoteSoon(){clearTimeout(timer);timer=setTimeout(quote,300)}
  function approvedRoutesFor(inputToken,outputToken,path){
    const restricted=[inputToken,outputToken].filter(token=>token.reviewed);
    let allowed=cfg.dexes;
    if(restricted.length){
      const endpoints=[path[0].toLowerCase(),path.at(-1).toLowerCase()].sort(),pair=(cfg.reviewedPairs||[]).find(item=>
        [item.tokenA.toLowerCase(),item.tokenB.toLowerCase()].sort().every((value,index)=>value===endpoints[index]));
      if(!pair)throw new Error('No approved token pair');
      const pairDexIds=new Set(pair.dexIds.map(value=>value.toLowerCase()));
      allowed=cfg.dexes.filter(dex=>pairDexIds.has(dex.id.toLowerCase())&&restricted.every(token=>(token.routeDexIds||[]).includes(dex.id.toLowerCase())));
    }
    if(allowed.length===0)throw new Error('No mutually approved DEX route');
    const allowedIds=new Set(allowed.map(dex=>dex.id.toLowerCase())),encoded=sdk.encodeRoutes(cfg.dexes,path,ethers);
    return encoded.map((route,index)=>allowedIds.has(cfg.dexes[index].id.toLowerCase())?route:'0x');
  }
  function approvedRoutes(path){return approvedRoutesFor(tokenIn,tokenOut,path)}
  async function bestQuote(value,path,routes=approvedRoutes(path)){const source=quoteRouter||marketQuoteRouter;if(!source)throw new Error('Quote Router unavailable');const best=await source.quoteBest(path[0],path.at(-1),value,routes),index=cfg.dexes.findIndex(d=>d.id.toLowerCase()===best.dexId.toLowerCase());if(index<0||routes[index]==='0x')throw new Error('Unknown or unapproved DEX');return{best,routeData:routes[index],dex:cfg.dexes[index]}}
  async function refreshMarketPrice(){const request=++marketPriceRequest,asset=selectedAsset,quoteAsset=quoteToken;ui.tickerPrice.textContent='—';ui.quoteAssetStat.textContent=quoteAsset.symbol;ui.priceStatusStat.textContent=deployed?'견적 확인 중':'배포 대기';ui.priceSourceLabel.textContent='Router spot price';if(!marketQuoteRouter)return;try{const path=[address(asset),address(quoteAsset)],routes=approvedRoutesFor(asset,quoteAsset,path),unit=ethers.parseUnits('1',asset.decimals),best=await marketQuoteRouter.quoteBest(path[0],path[1],unit,routes),index=cfg.dexes.findIndex(d=>d.id.toLowerCase()===best.dexId.toLowerCase());if(request!==marketPriceRequest)return;if(index<0||routes[index]==='0x'||best.amountOut<=0n)throw new Error('No approved market quote');const value=Number(ethers.formatUnits(best.amountOut,quoteAsset.decimals));ui.tickerPrice.textContent=`${value.toLocaleString(undefined,{maximumSignificantDigits:8})} ${quoteAsset.symbol}`;ui.priceSourceLabel.textContent=`${cfg.dexes[index].name} · 1 ${asset.symbol}`;ui.priceStatusStat.textContent='실시간 견적'}catch{if(request===marketPriceRequest)ui.priceStatusStat.textContent='유동성 없음'}}
  async function rankedRoutes(value,path,routes,costs){
    const candidates=await Promise.all(cfg.dexes.map(async(dex,index)=>{
      if(!ethers.isAddress(dex.adapter))return null;
      try{
        const amountOut=await new ethers.Contract(dex.adapter,adapterAbi,provider).quoteExactInput(path[0],path.at(-1),value,routes[index]);
        return{name:dex.name,dex,index,routeData:routes[index],amountOut,cost:costs?.[index]||0n,priority:Number(dex.priority||0)};
      }catch{return null}
    }));
    return sdk.rankRouteQuotes(candidates);
  }
  async function executionPlan(value,path){
    const routes=approvedRoutes(path),grossSingle=await bestQuote(value,path,routes);
    if(tokenIn.address==='native'||tokenOut.address==='native')return{kind:'single',single:grossSingle,routes,costs:cfg.dexes.map(()=>0n),oracleReady:false};
    let costs;try{const feeData=await provider.getFeeData(),gasUnits=cfg.dexes.map(dex=>BigInt(dex.gasUnits||220000));costs=await gasCostOracle.quoteRouteCosts(path.at(-1),gasUnits,feeData.gasPrice||0n)}catch{return{kind:'single',single:grossSingle,routes,costs:cfg.dexes.map(()=>0n),oracleReady:false}}
    const ranked=await rankedRoutes(value,path,routes,costs),netBest=ranked[0];
    if(!netBest)throw new Error('No executable route after gas');
    const single={best:{dexId:netBest.dex.id,adapter:netBest.dex.adapter,amountOut:netBest.amountOut,priority:netBest.priority},routeData:netBest.routeData,dex:netBest.dex};
    const split=await splitOptimizer.quoteOptimalSplitCapped(path[0],path.at(-1),value,routes,costs,10,4);
    if(!sdk.isSplitNetBetter(single.best.amountOut,netBest.cost,split.totalNetAmountOut))return{kind:'single',single,routes,costs,ranked,oracleReady:true};
    return{kind:'split',single,split,routes,costs,ranked,oracleReady:true,summary:sdk.summarizeSplit(cfg.dexes,split.amountsIn,value)};
  }
  async function planPriceImpact(value,out,probe,path,plan){
    if(plan.kind==='single'){
      const probeOut=await new ethers.Contract(plan.single.dex.adapter,adapterAbi,provider).quoteExactInput(path[0],path.at(-1),probe,plan.single.routeData);
      return sdk.priceImpactBps(value,out,probe,probeOut);
    }
    const expectedParts=await Promise.all(plan.summary.map(async item=>{
      const index=cfg.dexes.indexOf(item.dex),probeOut=await new ethers.Contract(item.dex.adapter,adapterAbi,provider).quoteExactInput(path[0],path.at(-1),probe,plan.routes[index]);
      return item.amountIn*probeOut/probe;
    }));
    return sdk.priceImpactFromExpected(out,expectedParts.reduce((total,part)=>total+part,0n));
  }
  async function quote(){
    ui.amountOut.textContent='0.0';ui.minimum.textContent='—';ui.gas.textContent='—';ui.impact.textContent='—';ui.split.textContent='단일 경로';ui.selectedDex.textContent='견적 확인 중';ui.alternativeRoute.textContent='경로 확인 중';ui.alternativeRoute.classList.remove('alternative-ready');ui.preflightState.textContent='실행 조건 확인 중';ui.preflightState.className='';
    const raw=ui.amountIn.value.trim();if(!raw||Number(raw)<=0||!deployed){ui.selectedDex.textContent='LQC Flow · PancakeSwap 비교 대기';ui.alternativeRoute.textContent='견적 후 표시';ui.preflightState.textContent='확인 대기';return}
    try{
      const path=[address(tokenIn),address(tokenOut)],value=ethers.parseUnits(raw,tokenIn.decimals),probe=value>1000n?value/1000n:1n,plan=await executionPlan(value,path),out=plan.kind==='split'?plan.split.totalAmountOut:plan.single.best.amountOut,[impact,feeData]=await Promise.all([planPriceImpact(value,out,probe,path,plan),provider.getFeeData()]),ranked=plan.ranked||await rankedRoutes(value,path,plan.routes,plan.costs),min=sdk.minimumAmountOut(out,ui.slippage.value),gasDex=plan.kind==='split'?{gasUnits:plan.summary.reduce((total,item)=>total+Number(item.dex.gasUnits||220000),0)}:plan.single.dex,gasWei=sdk.estimatedGasWei(gasDex,feeData.gasPrice||0n,tokenIn.address==='native'||tokenOut.address==='native');
      ui.amountOut.textContent=ethers.formatUnits(out,tokenOut.decimals);ui.minimum.textContent=`${Number(ethers.formatUnits(min,tokenOut.decimals)).toLocaleString(undefined,{maximumFractionDigits:6})} ${tokenOut.symbol}`;ui.gas.textContent=`≈ ${Number(ethers.formatEther(gasWei)).toFixed(6)} BNB`;ui.impact.textContent=`≈ ${(impact/100).toFixed(2)}%`;ui.impact.classList.toggle('warning',impact>=300);ui.selectedDex.textContent=plan.kind==='split'?plan.summary.map(item=>item.dex.name).join(' + '):plan.single.dex.name;ui.split.textContent=plan.kind==='split'?plan.summary.map(item=>`${item.dex.name} ${item.percent.toFixed(1)}%`).join(' · '):'단일 경로 100%';ui.routeStrategy.textContent=plan.kind==='split'?'Router 2.0 · 가스 차감 후 원자적 분할':plan.oracleReady?'Router 2.0 · 가스 차감 후 단일 최적':'가스 오라클 대기 · 안전 단일 경로';const fallback=ranked.find(item=>item.name!==ranked[0]?.name);ui.alternativeRoute.textContent=fallback?`${fallback.name} · 자동 재견적 가능`:'사용 가능한 추가 경로 없음';ui.alternativeRoute.classList.toggle('alternative-ready',Boolean(fallback));ui.preflightState.textContent=impact>=300?'주의 · 가격영향 3% 이상':plan.oracleReady?'준비 완료 · 가스 검증됨':'제한적 준비 · 가스 오라클 대기';ui.preflightState.className=impact>=300||!plan.oracleReady?'preflight-warning':'preflight-safe';status(impact>=300?'가격영향이 높습니다. 수량을 줄이거나 대체 경로를 확인하세요.':'거래 실행 전 점검을 통과했습니다.',impact>=300?'':'success');disabled(false);
    }catch{ui.selectedDex.textContent='유효한 경로 없음';ui.alternativeRoute.textContent='대체 경로도 없음';ui.preflightState.textContent='실행 불가';ui.preflightState.className='preflight-warning';disabled(true);status('이 거래쌍의 유동성을 확인할 수 없습니다. 수량을 줄이거나 다른 토큰을 선택하세요.','error')}
  }
  async function swap(){
    if(!executionRouter||!account)return connect();const raw=ui.amountIn.value.trim();if(!raw||Number(raw)<=0)return status('보낼 수량을 입력하세요.','error');
    try{
      disabled(true);const value=ethers.parseUnits(raw,tokenIn.decimals),path=[address(tokenIn),address(tokenOut)];let plan=await executionPlan(value,path),deadline=Math.floor(Date.now()/1000)+1200,bps=Math.round(Number(ui.slippage.value)*100),tx;
      if(tokenIn.address==='native'){const min=sdk.minimumAmountOut(plan.single.best.amountOut,ui.slippage.value);tx=await nativeRouter.swapExactNativeForToken(plan.single.best.dexId,path[1],min,account,deadline,plan.single.routeData,{value})}
      else{let spender=tokenOut.address==='native'?cfg.nativeRouterAddress:plan.kind==='split'?cfg.autoRouterAddress:cfg.executionRouterAddress,token=new ethers.Contract(tokenIn.address,tokenAbi,signer),allowance=await token.allowance(account,spender);if(sdk.requiresTokenApproval(allowance,value)){status(`${tokenIn.symbol} 사용 승인을 확인하세요.`);await(await token.approve(spender,value)).wait();status('승인 완료 · 최신 가격과 경로를 다시 확인합니다.');plan=await executionPlan(value,path);const refreshedSpender=tokenOut.address==='native'?cfg.nativeRouterAddress:plan.kind==='split'?cfg.autoRouterAddress:cfg.executionRouterAddress;if(refreshedSpender.toLowerCase()!==spender.toLowerCase()){spender=refreshedSpender;allowance=await token.allowance(account,spender);if(sdk.requiresTokenApproval(allowance,value)){status('최적 경로 변경으로 새 실행 컨트랙트 승인이 필요합니다.');await(await token.approve(spender,value)).wait();plan=await executionPlan(value,path);const finalSpender=tokenOut.address==='native'?cfg.nativeRouterAddress:plan.kind==='split'?cfg.autoRouterAddress:cfg.executionRouterAddress;if(finalSpender.toLowerCase()!==spender.toLowerCase())throw new Error('RouteChangedDuringApproval')}}}deadline=Math.floor(Date.now()/1000)+1200;if(tokenOut.address==='native'){const min=sdk.minimumAmountOut(plan.single.best.amountOut,ui.slippage.value);tx=await nativeRouter.swapExactTokenForNative(plan.single.best.dexId,path[0],value,min,account,deadline,plan.single.routeData)}else if(plan.kind==='split')tx=await autoRouter.swapOptimizedExactInput(path[0],path[1],value,account,deadline,plan.routes,plan.costs,10,bps);else{const min=sdk.minimumAmountOut(plan.single.best.amountOut,ui.slippage.value);tx=await executionRouter.swapExactInput(plan.single.best.dexId,path[0],path[1],value,min,account,deadline,plan.single.routeData)}}
      status(plan.kind==='split'?'Router 2.0 분할 거래가 제출되었습니다.':'Router 2.0 거래가 제출되었습니다.');await tx.wait();status(`${mode==='buy'?'매수':'매도'} 거래가 완료되었습니다.`,'success');ui.amountIn.value='';await balances();await quote();
    }catch(e){const guidance=sdk.explainSwapError(e);status(`${guidance.message} ${guidance.action}`,'error')}finally{disabled(!deployed)}
  }
  function tokenList(query=''){
    const other=side==='in'?tokenOut:tokenIn,term=query.trim().toLowerCase(),tokens=cfg.tokens.filter(t=>pairApproved(t,other)&&
      [t.symbol,t.name,t.address].some(value=>String(value||'').toLowerCase().includes(term)));
    ui.tokenCount.textContent=`${tokens.length}개 거래 가능`;ui.tokenEmpty.hidden=tokens.length!==0;
    ui.tokenList.replaceChildren(...tokens.map(t=>{const b=document.createElement('button'),icon=document.createElement('span'),symbol=document.createElement('b'),meta=document.createElement('span');b.type='button';b.className='token-option';b.setAttribute('role','option');icon.className=`token-symbol ${t.symbol==='LQC'?'mint':''}`.trim();icon.textContent=t.symbol.slice(0,4);symbol.textContent=t.symbol;meta.textContent=t.address==='native'?`${t.name} · 네이티브`:`${t.name} · 검증됨`;b.append(icon,symbol,meta);b.onclick=()=>{if(side==='in')tokenIn=t;else tokenOut=t;mode=tokenIn.symbol==='LQC'?'sell':'buy';selectedAsset=mode==='buy'?tokenOut:tokenIn;quoteToken=mode==='buy'?tokenIn:tokenOut;ui.dialog.close();const label=`${selectedAsset.symbol} ${mode==='buy'?'매수':'매도'}`;ui.title.textContent=label;ui.execute.textContent=label;ui.execute.className=`execute-button ${mode}`;render();balances();refreshMarketPrice();loadChartHistory();quoteSoon()};return b}));
  }
  function openTokenDialog(nextSide){side=nextSide;ui.tokenSearch.value='';tokenList();ui.dialog.showModal();setTimeout(()=>ui.tokenSearch.focus(),0)}
  const baseChartSeries=[92,110,98,128,175,218,270,260,225,178,164,151,168,176,169,181,158,145,132,278,301,270,226,206,182,169,188,204,238,312,286,254,226,194,160,137,124,196,251,226,210,231,218,197,176,151,139];
  const chartSeries=Object.fromEntries(['1m','3m','5m','15m','1h','4h','1D','1W','1M'].map((timeframe,offset)=>[timeframe,baseChartSeries.map((value,index)=>Math.max(54,Math.min(330,value+Math.round(Math.sin((index+offset*3)/4)*offset*3))) )]));
  function chart(closes=chartSeries['1m'],timeframe='1m',source='example'){const g=$('candles'),bars=$('volumeBars'),ns='http://www.w3.org/2000/svg';g.replaceChildren();bars.replaceChildren();clearLiveChartLabels();$('chartDataBadge').textContent=source==='live'?`${timeframe} 검증된 마켓 히스토리`:`${timeframe} 예시 차트 · 실시간 히스토리 연동 전`;closes.forEach((close,i)=>{const open=i?closes[i-1]+((i%5)-2)*3:108,x=i*16+3,up=close<open,high=Math.max(50,Math.min(open,close)-5-(i%4)*3),low=Math.min(340,Math.max(open,close)+7+(i%3)*4),wick=document.createElementNS(ns,'line'),body=document.createElementNS(ns,'rect');wick.setAttribute('x1',x+5.5);wick.setAttribute('x2',x+5.5);wick.setAttribute('y1',high);wick.setAttribute('y2',low);wick.setAttribute('class',`wick ${up?'up':'down'}`);body.setAttribute('x',x);body.setAttribute('y',Math.min(open,close));body.setAttribute('width',11);body.setAttribute('height',Math.max(5,Math.abs(open-close)));body.setAttribute('rx','.5');body.setAttribute('class',`candle ${up?'up':'down'}`);g.append(wick,body);const bar=document.createElement('i');bar.style.height=`${Math.min(66,9+Math.abs(open-close)*.8+(i%5)*2)}px`;if(!up)bar.className='hot';bars.append(bar)})}
  function chartLive(candles,timeframe){
    const recent=candles.slice(-47),bands=bollingerBands(recent),sar=parabolicSar(recent),values=[...recent.flatMap(item=>[item.high,item.low]),...bands.flatMap(item=>[item.upper,item.lower]),...sar.map(item=>item.value)],min=Math.min(...values),max=Math.max(...values),range=max-min||1,maxVolume=Math.max(...recent.map(item=>item.volume),1),g=$('candles'),bars=$('volumeBars'),ns='http://www.w3.org/2000/svg',step=680/recent.length,width=Math.max(3,Math.min(11,step*.68)),y=value=>330-(value-min)/range*270;
    const refreshedAt=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    g.replaceChildren();bars.replaceChildren();$('chartDataBadge').textContent=`${timeframe} 실시간 · ${refreshedAt}`;
    recent.forEach((item,index)=>{const x=index*step+3,open=y(item.open),close=y(item.close),high=y(item.high),low=y(item.low),up=item.close>=item.open,wick=document.createElementNS(ns,'line'),body=document.createElementNS(ns,'rect'),bar=document.createElement('i');wick.setAttribute('x1',x+width/2);wick.setAttribute('x2',x+width/2);wick.setAttribute('y1',high);wick.setAttribute('y2',low);wick.setAttribute('class',`wick ${up?'up':'down'}`);body.setAttribute('x',x);body.setAttribute('y',Math.min(open,close));body.setAttribute('width',width);body.setAttribute('height',Math.max(2,Math.abs(open-close)));body.setAttribute('rx','.5');body.setAttribute('class',`candle ${up?'up':'down'}`);g.append(wick,body);bar.style.height=`${Math.max(3,item.volume/maxVolume*66)}px`;if(!up)bar.className='hot';bars.append(bar)});
    renderSar(sar,y,step,ns);renderMacd(recent);renderKdj(recent);renderLiveChartLabels(recent,min,max,y,timeframe);
  }
  function chartPrice(value){return Number(value).toLocaleString(undefined,{maximumSignificantDigits:7})}
  function movingAverage(items,period){if(items.length<period)return null;return items.slice(-period).reduce((sum,item)=>sum+item.close,0)/period}
  function clearLiveChartLabels(){
    [5,10,20].forEach(period=>{$(`ma${period}Legend`).textContent=`MA${period}: —`;$(`ma${period}Line`).setAttribute('d','')});[9,21].forEach(period=>{$(`ema${period}Legend`).textContent=`EMA${period}: —`;$(`ema${period}Line`).setAttribute('d','')});for(const band of ['Upper','Middle','Lower']){$(`boll${band}Legend`).textContent=`${band==='Upper'?'BOLL U':band[0]}: —`;$(`boll${band}Line`).setAttribute('d','')}$('sarLegend').textContent='SAR: —';$('sarPoints').replaceChildren();$('macdLabel').textContent='MACD (12, 26, 9): —';$('macdBars').replaceChildren();$('kdjLabel').textContent='KDJ (9, 3, 3): —';for(const key of ['K','D','J'])$(`kdj${key}Line`).setAttribute('d','');$('priceArea').setAttribute('d','');$('priceAxis').querySelectorAll('text').forEach(node=>node.textContent='—');$('timeAxis').querySelectorAll('span').forEach(node=>node.textContent='—');$('currentPriceLine').style.visibility='hidden';$('currentPriceLabel').textContent='—';$('chartVolumeLabel').textContent='VOL: —';
  }
  function chartPath(candles,y,step,period=1){
    const points=[];for(let index=period-1;index<candles.length;index++){const window=candles.slice(index-period+1,index+1),value=window.reduce((sum,item)=>sum+item.close,0)/period;points.push(`${points.length?'L':'M'}${(index*step+step/2).toFixed(2)} ${y(value).toFixed(2)}`)}return points.join(' ')
  }
  function exponentialMovingAverage(items,period){
    return indicatorMath.exponentialMovingAverage(items,period)
  }
  function emaPath(candles,y,step,period){return exponentialMovingAverage(candles,period).map((item,index)=>`${index?'L':'M'}${(item.index*step+step/2).toFixed(2)} ${y(item.value).toFixed(2)}`).join(' ')}
  function bollingerBands(items,period=20,deviations=2){
    return indicatorMath.bollingerBands(items,period,deviations)
  }
  function bollingerPath(bands,key,y,step){return bands.map((item,index)=>`${index?'L':'M'}${(item.index*step+step/2).toFixed(2)} ${y(item[key]).toFixed(2)}`).join(' ')}
  function parabolicSar(items,step=.02,maximum=.2){
    return indicatorMath.parabolicSar(items,step,maximum)
  }
  function renderSar(points,y,step,ns){const group=$('sarPoints');group.replaceChildren(...points.map(point=>{const node=document.createElementNS(ns,'circle');node.setAttribute('cx',point.index*step+step/2);node.setAttribute('cy',y(point.value));node.setAttribute('r','2.2');node.setAttribute('class',`sar-point ${point.rising?'rising':'falling'}`);return node}));const latest=points.at(-1);$('sarLegend').textContent=latest?`SAR: ${chartPrice(latest.value)} · ${latest.rising?'상승':'하락'}`:'SAR: —'}
  function emaSequence(values,period){return indicatorMath.emaSequence(values,period)}
  function macdSeries(items,fastPeriod=12,slowPeriod=26,signalPeriod=9){return indicatorMath.macdSeries(items,fastPeriod,slowPeriod,signalPeriod)}
  function renderMacd(candles){const series=macdSeries(candles),latest=series.at(-1),max=Math.max(...series.map(item=>Math.abs(item.histogram)),1e-12),bars=$('macdBars');bars.replaceChildren(...series.map(item=>{const slot=document.createElement('i'),bar=document.createElement('b');bar.className=item.histogram>=0?'positive':'negative';bar.style.height=`${Math.max(1,Math.abs(item.histogram)/max*32)}px`;slot.append(bar);return slot}));$('macdLabel').textContent=latest?`MACD (12, 26, 9) · DIF ${chartPrice(latest.dif)} · DEA ${chartPrice(latest.dea)} · MACD ${chartPrice(latest.histogram)}`:'MACD (12, 26, 9): —'}
  function kdjSeries(items,period=9){return indicatorMath.kdjSeries(items,period)}
  function kdjPath(series,key){const step=series.length>1?680/(series.length-1):0,y=value=>68-(Math.max(-20,Math.min(120,value))+20)/140*60;return series.map((item,index)=>`${index?'L':'M'}${(index*step).toFixed(2)} ${y(item[key]).toFixed(2)}`).join(' ')}
  function renderKdj(candles){const series=kdjSeries(candles),latest=series.at(-1);for(const key of ['K','D','J'])$(`kdj${key}Line`).setAttribute('d',kdjPath(series,key.toLowerCase()));$('kdjLabel').textContent=latest?`KDJ (9, 3, 3) · K ${latest.k.toFixed(2)} · D ${latest.d.toFixed(2)} · J ${latest.j.toFixed(2)}`:'KDJ (9, 3, 3): —'}
  function renderLiveChartLabels(candles,min,max,y,timeframe){
    const last=candles.at(-1),axis=$('priceAxis').querySelectorAll('text'),line=$('currentPriceLine'),label=$('currentPriceLabel'),timeLabels=$('timeAxis').querySelectorAll('span');
    line.style.visibility='visible';axis.forEach((node,index)=>node.textContent=chartPrice(max-(max-min)*(index/(axis.length-1))));
    const currentY=Math.max(16,Math.min(366,y(last.close)));line.setAttribute('y1',currentY);line.setAttribute('y2',currentY);label.setAttribute('y',Math.max(14,currentY-6));label.textContent=chartPrice(last.close);
    [5,10,20].forEach(period=>{const value=movingAverage(candles,period),node=$(`ma${period}Legend`);node.textContent=`MA${period}: ${value===null?'—':chartPrice(value)}`});
    const step=680/candles.length;$('priceArea').setAttribute('d',`${chartPath(candles,y,step)} L${(candles.length*step).toFixed(2)} 330 L0 330 Z`);[5,10,20].forEach(period=>$(`ma${period}Line`).setAttribute('d',chartPath(candles,y,step,period)));
    [9,21].forEach(period=>{const series=exponentialMovingAverage(candles,period),value=series.at(-1)?.value;$(`ema${period}Legend`).textContent=`EMA${period}: ${value===undefined?'—':chartPrice(value)}`;$(`ema${period}Line`).setAttribute('d',emaPath(candles,y,step,period))});
    const bands=bollingerBands(candles),latestBand=bands.at(-1);for(const [name,key,label] of [['Upper','upper','BOLL U'],['Middle','middle','M'],['Lower','lower','L']]){$(`boll${name}Legend`).textContent=`${label}: ${latestBand?chartPrice(latestBand[key]):'—'}`;$(`boll${name}Line`).setAttribute('d',bollingerPath(bands,key,y,step))}
    $('chartVolumeLabel').textContent=`VOL (${selectedAsset.symbol}): ${chartPrice(candles.reduce((sum,item)=>sum+item.volume,0))}`;
    const indexes=[0,Math.floor((candles.length-1)/3),Math.floor((candles.length-1)*2/3),candles.length-1],options=['1D','1W','1M'].includes(timeframe)?{month:'2-digit',day:'2-digit'}:{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'};
    timeLabels.forEach((node,index)=>node.textContent=new Date(candles[indexes[index]].time*1000).toLocaleString('ko-KR',options));
  }
  function clearMarketStats(){ui.tickerChange.textContent='24h —';ui.tickerChange.classList.remove('negative');ui.high24h.textContent='—';ui.low24h.textContent='—';ui.volume24h.textContent='—'}
  function renderMarketStats(candles,asset,quote){
    const last=candles.at(-1),cutoff=last.time-86400,window24h=candles.filter(item=>item.time>=cutoff);
    if(candles[0].time>cutoff||window24h.length<2)return clearMarketStats();
    const first=window24h[0],change=(last.close-first.open)/first.open*100,format=value=>Number(value).toLocaleString(undefined,{maximumSignificantDigits:8});
    ui.tickerChange.textContent=`${change>=0?'+':''}${change.toFixed(2)}%`;ui.tickerChange.classList.toggle('negative',change<0);
    ui.high24h.textContent=`${format(Math.max(...window24h.map(item=>item.high)))} ${quote.symbol}`;
    ui.low24h.textContent=`${format(Math.min(...window24h.map(item=>item.low)))} ${quote.symbol}`;
    ui.volume24h.textContent=`${format(window24h.reduce((sum,item)=>sum+item.volume,0))} ${asset.symbol}`;
  }
  function scheduleChartRefresh(){
    clearTimeout(chartRefreshTimer);
    if(!cfg.candleDataUrl||document.hidden)return;
    const delay=['1D','1W','1M'].includes(selectedTimeframe)?60000:15000;
    chartRefreshTimer=setTimeout(()=>{loadChartHistory();refreshMarketPrice()},delay);
  }
  async function loadChartHistory(){
    const request=++chartRequest,asset=selectedAsset,quote=quoteToken,timeframe=selectedTimeframe;
    clearMarketStats();if(!cfg.candleDataUrl||!candleData)return chart(chartSeries[timeframe],timeframe);
    $('chartDataBadge').textContent=`${timeframe} 히스토리 불러오는 중`;
    try{
      const params={chainId:cfg.chainId,base:address(asset),quote:address(quote)},proof={expectedSigner:cfg.candleSignerAddress,ethersLib:ethers},[candles,stats]=await Promise.all([candleData.load(cfg.candleDataUrl,{...params,timeframe,limit:120},proof),candleData.load(cfg.candleDataUrl,{...params,timeframe:'1h',limit:26},proof)]);
      if(request!==chartRequest||asset!==selectedAsset||quote!==quoteToken||timeframe!==selectedTimeframe)return;
      chartLive(candles,timeframe);
      renderMarketStats(stats,asset,quote);
    }catch{if(request===chartRequest)chart(chartSeries[timeframe],timeframe)}
    finally{if(request===chartRequest)scheduleChartRefresh()}
  }
  function saveChartPreferences(){try{localStorage.setItem(chartMemoryKey,JSON.stringify({timeframe:selectedTimeframe,indicators:[...document.querySelectorAll('.indicators [data-indicator][aria-pressed="true"]')].map(button=>button.dataset.indicator)}))}catch{}
  }
  function setIndicatorVisibility(name,visible){const button=document.querySelector(`.indicators [data-indicator="${name}"]`);if(button){button.setAttribute('aria-pressed',String(visible));button.classList.toggle('active',visible)}if(name==='volume')$('volumeIndicator').classList.toggle('indicator-hidden',!visible);else if(name==='ma'){document.querySelector('.ma-legend').classList.toggle('indicator-hidden',!visible);[5,10,20].forEach(period=>$(`ma${period}Line`).classList.toggle('indicator-hidden',!visible))}else if(name==='ema'){document.querySelector('.ema-legend').classList.toggle('indicator-hidden',!visible);[9,21].forEach(period=>$(`ema${period}Line`).classList.toggle('indicator-hidden',!visible))}else if(name==='boll'){document.querySelector('.boll-legend').classList.toggle('indicator-hidden',!visible);for(const band of ['Upper','Middle','Lower'])$(`boll${band}Line`).classList.toggle('indicator-hidden',!visible)}else if(name==='sar'){$('sarLegend').classList.toggle('indicator-hidden',!visible);$('sarPoints').classList.toggle('indicator-hidden',!visible)}else if(name==='macd')$('macdIndicator').classList.toggle('indicator-hidden',!visible);else if(name==='kdj')$('kdjIndicator').classList.toggle('indicator-hidden',!visible)}
  function restoreChartPreferences(){const active=new Set(initialChartPreferences?.indicators||['volume','ma']);document.querySelectorAll('.timeframes [data-timeframe]').forEach(button=>button.classList.toggle('active',button.dataset.timeframe===selectedTimeframe));supportedIndicators.forEach(name=>setIndicatorVisibility(name,active.has(name)))}
  function selectTimeframe(timeframe){if(!chartSeries[timeframe])return;selectedTimeframe=timeframe;document.querySelectorAll('.timeframes [data-timeframe]').forEach(button=>button.classList.toggle('active',button.dataset.timeframe===timeframe));saveChartPreferences();loadChartHistory()}
  function toggleIndicator(button){
    const name=button.dataset.indicator,visible=button.getAttribute('aria-pressed')!=='true';if(visible&&lowerIndicators.includes(name))lowerIndicators.filter(other=>other!==name).forEach(other=>setIndicatorVisibility(other,false));setIndicatorVisibility(name,visible);saveChartPreferences();
  }
  function bindWalletEvents(target){
    if(boundWallets.has(target)||typeof target.on!=='function')return;boundWallets.add(target);
    target.on('accountsChanged',accounts=>{if(target!==walletProvider)return;if(accounts.length===0){localStorage.removeItem(walletMemoryKey);account=null;ui.connect.textContent='지갑 연결';disabled(true);status('지갑 연결이 해제되었습니다.')}else connect(target,false)});
    target.on('chainChanged',()=>{if(target===walletProvider)connect(target,false)});
  }
  function addWallet(detail){
    if(!detail?.provider||!detail?.info)return;
    const key=detail.info.uuid||detail.info.rdns||detail.info.name;
    if(wallets.some(wallet=>(wallet.info.uuid||wallet.info.rdns||wallet.info.name)===key))return;
    wallets.push(detail);renderWallets();
  }
  function renderWallets(){
    ui.walletList.replaceChildren(...wallets.map(wallet=>{
      const button=document.createElement('button'),label=document.createElement('span'),name=document.createElement('b'),kind=document.createElement('small'),safeName=String(wallet.info.name||'비수탁형 지갑');
      button.type='button';button.className='wallet-option';name.textContent=safeName;kind.textContent='비수탁형 지갑';label.append(name,kind);
      if(typeof wallet.info.icon==='string'&&wallet.info.icon.startsWith('data:image/')){const image=document.createElement('img');image.src=wallet.info.icon;image.alt='';button.append(image)}
      else{const fallback=document.createElement('span');fallback.className='wallet-fallback';fallback.textContent=safeName.slice(0,1);button.append(fallback)}
      button.append(label);button.onclick=()=>{ui.walletDialog.close();connect(wallet.provider,true)};return button;
    }));
  }
  function chooseWallet(){
    if(wallets.length===0&&window.ethereum)addWallet({info:{uuid:'legacy-injected',name:'브라우저 지갑',rdns:'legacy.injected'},provider:window.ethereum});
    if(wallets.length===1)return connect(wallets[0].provider,true);
    if(wallets.length>1)return ui.walletDialog.showModal();
    status('설치된 비수탁형 지갑을 찾지 못했습니다.','error');
  }
  window.addEventListener('eip6963:announceProvider',event=>addWallet(event.detail));
  document.addEventListener('visibilitychange',()=>{clearTimeout(chartRefreshTimer);if(!document.hidden){loadChartHistory();refreshMarketPrice()}});
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  if(window.ethereum)setTimeout(()=>{if(wallets.length===0)addWallet({info:{uuid:'legacy-injected',name:'브라우저 지갑',rdns:'legacy.injected'},provider:window.ethereum})},0);
  ui.connect.onclick=chooseWallet;ui.buy.onclick=ui.buyTab.onclick=()=>setMode('buy');ui.sell.onclick=ui.sellTab.onclick=()=>setMode('sell');ui.quick.onclick=ui.tradeNav.onclick=()=>setMode(mode);ui.walletNav.onclick=chooseWallet;ui.marketNav.onclick=ui.marketSelector.onclick=openMarkets;ui.marketSearch.oninput=()=>marketList(ui.marketSearch.value);ui.close.onclick=()=>ui.order.classList.remove('open');ui.execute.onclick=swap;ui.tokenInButton.onclick=()=>openTokenDialog('in');ui.tokenOutButton.onclick=()=>openTokenDialog('out');ui.tokenSearch.oninput=()=>tokenList(ui.tokenSearch.value);ui.flip.onclick=()=>{[tokenIn,tokenOut]=[tokenOut,tokenIn];selectedAsset=mode==='buy'?tokenOut:tokenIn;quoteToken=mode==='buy'?tokenIn:tokenOut;render();balances();refreshMarketPrice();loadChartHistory();quoteSoon()};ui.amountIn.oninput=quoteSoon;ui.slippage.oninput=quoteSoon;ui.settings.onclick=()=>{ui.settingsPanel.hidden=!ui.settingsPanel.hidden;ui.order.classList.add('open')};ui.max.onclick=()=>applyBalancePercent(100);
  document.querySelectorAll('.amount-presets button').forEach(button=>button.onclick=()=>applyBalancePercent(button.dataset.percent));
  document.querySelectorAll('.slippage-option').forEach(b=>b.onclick=()=>{document.querySelectorAll('.slippage-option').forEach(x=>x.classList.remove('active'));b.classList.add('active');ui.slippage.value=b.dataset.value;quoteSoon()});document.querySelectorAll('.timeframes [data-timeframe]').forEach(b=>b.onclick=()=>selectTimeframe(b.dataset.timeframe));document.querySelectorAll('.indicators [data-indicator]').forEach(b=>b.onclick=()=>toggleIndicator(b));document.querySelectorAll('.section-tabs button,.position-tabs button').forEach(b=>b.onclick=()=>{b.parentElement.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
  if(deployed)status('컨트랙트가 설정되었습니다. 지갑을 연결하세요.');restoreChartPreferences();render();tokenList();marketList();loadChartHistory();setMode('buy',false);if(localStorage.getItem(walletMemoryKey)==='1')setTimeout(()=>{const remembered=wallets[0]?.provider||window.ethereum;if(remembered)connect(remembered,false)},100);
})();
