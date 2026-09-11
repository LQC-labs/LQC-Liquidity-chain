(function(){
  'use strict';
  const cfg=window.LQC_FLOW_CONFIG,{ethers,LQCRouterSDK:sdk,LQCI18N:i18n}=window,$=id=>document.getElementById(id),t=key=>i18n.t(key);
  const routerAbi=['function getAmountsOut(uint256,address[]) view returns (uint256[])','function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])','function swapExactBNBForTokens(uint256,address[],address,uint256) payable returns (uint256[])','function swapExactTokensForBNB(uint256,uint256,address[],address,uint256) returns (uint256[])'];
  const quoteRouterAbi=['function quoteBest(address,address,uint256,bytes[]) view returns ((bytes32 dexId,address adapter,uint256 amountOut,uint32 priority))'];
  const executionRouterAbi=['function swapExactInput(bytes32,address,address,uint256,uint256,address,uint256,bytes) returns (uint256)'];
  const nativeRouterAbi=['function swapExactNativeForToken(bytes32,address,uint256,address,uint256,bytes) payable returns (uint256)','function swapExactTokenForNative(bytes32,address,uint256,uint256,address,uint256,bytes) returns (uint256)'];
  const splitOptimizerAbi=['function quoteOptimalSplitCapped(address,address,uint256,bytes[],uint256[],uint256,uint256) view returns ((bytes32[] dexIds,address[] adapters,uint256[] amountsIn,uint256[] amountsOut,uint256 totalAmountOut,uint256 totalNetAmountOut))'];
  const autoRouterAbi=['function swapOptimizedExactInput(address,address,uint256,address,uint256,bytes[],uint256[],uint256,uint256) returns (uint256)'];
  const gasCostOracleAbi=['function quoteRouteCosts(address,uint256[],uint256) view returns (uint256[])'];
  const tokenAbi=['function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)'];
  const adapterAbi=['function quoteExactInput(address,address,uint256,bytes) view returns (uint256)'];
  const ui={connect:$('connectButton'),language:$('languageSelect'),settings:$('settingsButton'),settingsPanel:$('settingsPanel'),amountIn:$('amountIn'),amountOut:$('amountOut'),minimum:$('minimumReceived'),gas:$('estimatedGas'),impact:$('priceImpact'),split:$('splitRatio'),route:$('routeLabel'),selectedDex:$('selectedDex'),selectedPath:$('selectedPath'),routeStrategy:$('routeStrategy'),alternativeRoute:$('alternativeRoute'),preflightState:$('preflightState'),balanceIn:$('balanceIn'),balanceOut:$('balanceOut'),walletDialog:$('walletDialog'),walletList:$('walletList'),positionBalance:$('positionBalance'),portfolioValue:$('portfolioValue'),tokenInButton:$('tokenInButton'),tokenOutButton:$('tokenOutButton'),flip:$('flipButton'),max:$('maxButton'),buy:$('buyAction'),sell:$('sellAction'),quick:$('quickTrade'),order:$('orderPanel'),close:$('closeOrder'),title:$('orderTitle'),execute:$('executeButton'),status:$('statusBox'),statusText:$('statusText'),dialog:$('tokenDialog'),tokenList:$('tokenList'),slippage:$('slippageInput')};
  const walletMemoryKey='lqc-flow-wallet-connected';
  let walletProvider,provider,signer,account,router,quoteRouter,executionRouter,nativeRouter,splitOptimizer,autoRouter,gasCostOracle,wallets=[],boundWallets=new WeakSet(),side='in',timer,quoteVersion=0,mode='buy',tokenIn=cfg.tokens[0],tokenOut=cfg.tokens[2],deploymentReady=false;
  const configured=ethers.isAddress(cfg.routerAddress)&&ethers.isAddress(cfg.quoteRouterAddress)&&ethers.isAddress(cfg.executionRouterAddress)&&ethers.isAddress(cfg.nativeRouterAddress)&&ethers.isAddress(cfg.splitOptimizerAddress)&&ethers.isAddress(cfg.autoRouterAddress)&&ethers.isAddress(cfg.gasCostOracleAddress)&&cfg.tokens.filter(t=>t.address!=='native').every(t=>ethers.isAddress(t.address))&&cfg.dexes.length>0&&cfg.dexes.every(d=>ethers.isAddress(d.adapter));
  const address=t=>t.address==='native'?(cfg.tokens.find(x=>x.symbol==='WBNB')?.address||''):t.address;
  const status=(m,type='')=>{ui.status.className=`status ${type}`.trim();ui.statusText.textContent=m};
  const localizedError=e=>{const guidance=sdk.explainSwapError(e);return t(`error_${guidance.code}`)};
  const disabled=v=>ui.execute.disabled=v;
  function render(){for(const [s,t] of [['In',tokenIn],['Out',tokenOut]]){$(`token${s}Label`).textContent=t.symbol;$(`token${s}Icon`).textContent=t.symbol.slice(0,4);$(`token${s}Icon`).classList.toggle('mint',t.symbol==='LQC')}const path=`${tokenIn.symbol} → ${tokenOut.symbol}`;ui.route.textContent=path;ui.selectedPath.textContent=path}
  function setMode(next,open=true){const lqc=cfg.tokens.find(t=>t.symbol==='LQC'),bnb=cfg.tokens.find(t=>t.symbol==='BNB');mode=next;[tokenIn,tokenOut]=next==='buy'?[bnb,lqc]:[lqc,bnb];ui.title.textContent=t(next==='buy'?'buyLqc':'sellLqc');ui.execute.textContent=ui.title.textContent;ui.execute.className=`execute-button ${next}`;ui.buy.classList.toggle('active',next==='buy');ui.sell.classList.toggle('active',next==='sell');if(open)ui.order.classList.add('open');render();balances();quoteSoon()}
  async function ensureNetwork(target,interactive=true){const chain=await target.request({method:'eth_chainId'});if(chain.toLowerCase()===cfg.chainIdHex.toLowerCase())return true;if(!interactive)return false;try{await target.request({method:'wallet_switchEthereumChain',params:[{chainId:cfg.chainIdHex}]})}catch(e){if(e.code!==4902)throw e;await target.request({method:'wallet_addEthereumChain',params:[{chainId:cfg.chainIdHex,chainName:cfg.chainName,rpcUrls:cfg.rpcUrls,nativeCurrency:cfg.nativeCurrency,blockExplorerUrls:cfg.blockExplorerUrls}]})}return true}
  async function connect(target=walletProvider||wallets[0]?.provider||window.ethereum,interactive=true){
    if(!target)return status(t('walletNotFound'),'error');
    walletProvider=target;
    try{
      const accounts=await target.request({method:interactive?'eth_requestAccounts':'eth_accounts'}),chain=await target.request({method:'eth_chainId'}),remembered=localStorage.getItem(walletMemoryKey)==='1',session=sdk.walletSessionState(accounts,interactive||remembered,chain,cfg.chainIdHex);
      if(session==='disconnected'){if(interactive)status(t('approveConnection'));return}
      if(session==='wrong_network'&&!interactive){ui.connect.textContent=t('switchNetwork');status(t('walletDetected'));return}
      await ensureNetwork(target,interactive);provider=new ethers.BrowserProvider(target);signer=await provider.getSigner();account=await signer.getAddress();localStorage.setItem(walletMemoryKey,'1');bindWalletEvents(target);ui.connect.textContent=`${account.slice(0,6)}…${account.slice(-4)}`;deploymentReady=false;disabled(true);if(configured){await sdk.verifyUiDeployment(provider,cfg,ethers);deploymentReady=true}router=deploymentReady?new ethers.Contract(cfg.routerAddress,routerAbi,signer):null;quoteRouter=deploymentReady?new ethers.Contract(cfg.quoteRouterAddress,quoteRouterAbi,provider):null;executionRouter=deploymentReady?new ethers.Contract(cfg.executionRouterAddress,executionRouterAbi,signer):null;nativeRouter=deploymentReady?new ethers.Contract(cfg.nativeRouterAddress,nativeRouterAbi,signer):null;splitOptimizer=deploymentReady?new ethers.Contract(cfg.splitOptimizerAddress,splitOptimizerAbi,provider):null;autoRouter=deploymentReady?new ethers.Contract(cfg.autoRouterAddress,autoRouterAbi,signer):null;gasCostOracle=deploymentReady?new ethers.Contract(cfg.gasCostOracleAddress,gasCostOracleAbi,provider):null;disabled(!deploymentReady);status(t(deploymentReady?'routerReady':'contractsPending'),deploymentReady?'success':'');await balances();quoteSoon()
    }catch(e){status(localizedError(e),'error')}
  }
  async function balance(t){if(!provider||!account)return null;if(t.address==='native')return provider.getBalance(account);if(!ethers.isAddress(t.address))return null;return new ethers.Contract(t.address,tokenAbi,provider).balanceOf(account)}
  const format=(v,t)=>v===null?'—':Number(ethers.formatUnits(v,t.decimals)).toLocaleString(undefined,{maximumFractionDigits:5});
  async function balances(){const lqc=cfg.tokens.find(t=>t.symbol==='LQC'),[a,b,l]=await Promise.all([balance(tokenIn),balance(tokenOut),balance(lqc)]);ui.balanceIn.textContent=format(a,tokenIn);ui.balanceOut.textContent=format(b,tokenOut);ui.positionBalance.textContent=l===null?'—':`${format(l,lqc)} LQC`;if(l!==null)ui.portfolioValue.textContent=`$${(Number(ethers.formatUnits(l,lqc.decimals))*.091348).toLocaleString(undefined,{maximumFractionDigits:2})}`}
  function quoteSoon(){clearTimeout(timer);const requestVersion=++quoteVersion;timer=setTimeout(()=>quote(requestVersion),300)}
  async function bestQuote(value,path){const routes=sdk.encodeRoutes(cfg.dexes,path,ethers),best=await quoteRouter.quoteBest(path[0],path.at(-1),value,routes),index=cfg.dexes.findIndex(d=>d.id.toLowerCase()===best.dexId.toLowerCase());if(index<0)throw new Error('Unknown DEX');return{best,routeData:routes[index],dex:cfg.dexes[index]}}
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
    const grossSingle=await bestQuote(value,path),routes=sdk.encodeRoutes(cfg.dexes,path,ethers);
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
  async function quote(requestVersion=++quoteVersion){
    ui.amountOut.textContent='0.0';ui.minimum.textContent='—';ui.gas.textContent='—';ui.impact.textContent='—';ui.split.textContent=t('singleRoute');ui.selectedDex.textContent=t('quoteChecking');ui.alternativeRoute.textContent=t('routeChecking');ui.alternativeRoute.classList.remove('alternative-ready');ui.preflightState.textContent=t('executionChecking');ui.preflightState.className='';
    const raw=ui.amountIn.value.trim();if(!raw||Number(raw)<=0||!deploymentReady){ui.selectedDex.textContent=t('comparePending');ui.alternativeRoute.textContent=t('showAfterQuote');ui.preflightState.textContent=t('checkPending');return}
    try{
      const path=[address(tokenIn),address(tokenOut)],value=ethers.parseUnits(raw,tokenIn.decimals),probe=value>1000n?value/1000n:1n,plan=await executionPlan(value,path),out=plan.kind==='split'?plan.split.totalAmountOut:plan.single.best.amountOut,[impact,feeData]=await Promise.all([planPriceImpact(value,out,probe,path,plan),provider.getFeeData()]),ranked=plan.ranked||await rankedRoutes(value,path,plan.routes,plan.costs),min=sdk.minimumAmountOut(out,ui.slippage.value),gasDex=plan.kind==='split'?{gasUnits:plan.summary.reduce((total,item)=>total+Number(item.dex.gasUnits||220000),0)}:plan.single.dex,gasWei=sdk.estimatedGasWei(gasDex,feeData.gasPrice||0n,tokenIn.address==='native'||tokenOut.address==='native');if(!sdk.isLatestQuote(requestVersion,quoteVersion))return;
      ui.amountOut.textContent=ethers.formatUnits(out,tokenOut.decimals);ui.minimum.textContent=`${Number(ethers.formatUnits(min,tokenOut.decimals)).toLocaleString(undefined,{maximumFractionDigits:6})} ${tokenOut.symbol}`;ui.gas.textContent=`≈ ${Number(ethers.formatEther(gasWei)).toFixed(6)} BNB`;ui.impact.textContent=`≈ ${(impact/100).toFixed(2)}%`;ui.impact.classList.toggle('warning',impact>=300);ui.selectedDex.textContent=plan.kind==='split'?plan.summary.map(item=>item.dex.name).join(' + '):plan.single.dex.name;ui.split.textContent=plan.kind==='split'?plan.summary.map(item=>`${item.dex.name} ${item.percent.toFixed(1)}%`).join(' · '):t('singleRoute100');ui.routeStrategy.textContent=t(plan.kind==='split'?'splitStrategy':plan.oracleReady?'bestSingleStrategy':'oraclePendingStrategy');const fallback=ranked.find(item=>item.name!==ranked[0]?.name);ui.alternativeRoute.textContent=fallback?t('fallbackAvailable',{name:fallback.name}):t('noExtraRoute');ui.alternativeRoute.classList.toggle('alternative-ready',Boolean(fallback));ui.preflightState.textContent=t(impact>=300?'highImpact':plan.oracleReady?'readyGasVerified':'limitedOraclePending');ui.preflightState.className=impact>=300||!plan.oracleReady?'preflight-warning':'preflight-safe';status(t(impact>=300?'highImpactHelp':'preflightPassed'),impact>=300?'':'success');disabled(false);
    }catch{if(!sdk.isLatestQuote(requestVersion,quoteVersion))return;ui.selectedDex.textContent=t('noValidRoute');ui.alternativeRoute.textContent=t('noFallbackRoute');ui.preflightState.textContent=t('unavailable');ui.preflightState.className='preflight-warning';disabled(true);status(t('liquidityUnavailable'),'error')}
  }
  async function swap(){
    if(!executionRouter||!account)return connect();const raw=ui.amountIn.value.trim();if(!raw||Number(raw)<=0)return status(t('enterAmount'),'error');
    try{
      disabled(true);const value=ethers.parseUnits(raw,tokenIn.decimals),path=[address(tokenIn),address(tokenOut)];let plan=await executionPlan(value,path),deadline=Math.floor(Date.now()/1000)+1200,bps=Math.round(Number(ui.slippage.value)*100),tx;
      if(tokenIn.address==='native'){const min=sdk.minimumAmountOut(plan.single.best.amountOut,ui.slippage.value);tx=await nativeRouter.swapExactNativeForToken(plan.single.best.dexId,path[1],min,account,deadline,plan.single.routeData,{value})}
      else{let spender=tokenOut.address==='native'?cfg.nativeRouterAddress:plan.kind==='split'?cfg.autoRouterAddress:cfg.executionRouterAddress,token=new ethers.Contract(tokenIn.address,tokenAbi,signer),allowance=await token.allowance(account,spender);if(sdk.requiresTokenApproval(allowance,value)){status(t('approveToken',{token:tokenIn.symbol}));await(await token.approve(spender,value)).wait();status(t('approvalComplete'));plan=await executionPlan(value,path);const refreshedSpender=tokenOut.address==='native'?cfg.nativeRouterAddress:plan.kind==='split'?cfg.autoRouterAddress:cfg.executionRouterAddress;if(refreshedSpender.toLowerCase()!==spender.toLowerCase()){spender=refreshedSpender;allowance=await token.allowance(account,spender);if(sdk.requiresTokenApproval(allowance,value)){status(t('newApprovalRequired'));await(await token.approve(spender,value)).wait();plan=await executionPlan(value,path);const finalSpender=tokenOut.address==='native'?cfg.nativeRouterAddress:plan.kind==='split'?cfg.autoRouterAddress:cfg.executionRouterAddress;if(finalSpender.toLowerCase()!==spender.toLowerCase())throw new Error('RouteChangedDuringApproval')}}}deadline=Math.floor(Date.now()/1000)+1200;if(tokenOut.address==='native'){const min=sdk.minimumAmountOut(plan.single.best.amountOut,ui.slippage.value);tx=await nativeRouter.swapExactTokenForNative(plan.single.best.dexId,path[0],value,min,account,deadline,plan.single.routeData)}else if(plan.kind==='split')tx=await autoRouter.swapOptimizedExactInput(path[0],path[1],value,account,deadline,plan.routes,plan.costs,10,bps);else{const min=sdk.minimumAmountOut(plan.single.best.amountOut,ui.slippage.value);tx=await executionRouter.swapExactInput(plan.single.best.dexId,path[0],path[1],value,min,account,deadline,plan.single.routeData)}}
      status(t(plan.kind==='split'?'splitSubmitted':'tradeSubmitted'));await tx.wait();status(t('tradeComplete',{side:t(mode)}),'success');ui.amountIn.value='';await balances();await quote();
    }catch(e){status(localizedError(e),'error')}finally{disabled(!deploymentReady)}
  }
  function tokenList(){ui.tokenList.replaceChildren(...cfg.tokens.map(token=>{const b=document.createElement('button');b.type='button';b.className='token-option';b.innerHTML=`<span class="token-symbol ${token.symbol==='LQC'?'mint':''}">${token.symbol.slice(0,4)}</span><b>${token.symbol}</b><span>${token.name}</span>`;b.onclick=()=>{const other=side==='in'?tokenOut:tokenIn;if(address(token)&&address(token)===address(other))return status(t('incompatibleNativeTokens'),'error');if(side==='in')tokenIn=token;else tokenOut=token;ui.dialog.close();mode=tokenIn.symbol==='LQC'?'sell':'buy';ui.title.textContent=t(mode==='buy'?'buyLqc':'sellLqc');ui.execute.textContent=ui.title.textContent;ui.execute.className=`execute-button ${mode}`;render();balances();quoteSoon()};return b}))}
  function chart(){const closes=[92,110,98,128,175,218,270,260,225,178,164,151,168,176,169,181,158,145,132,278,301,270,226,206,182,169,188,204,238,312,286,254,226,194,160,137,124,196,251,226,210,231,218,197,176,151,139],g=$('candles'),bars=$('volumeBars'),ns='http://www.w3.org/2000/svg';closes.forEach((close,i)=>{const open=i?closes[i-1]+((i%5)-2)*3:108,x=i*16+3,up=close<open,high=Math.max(50,Math.min(open,close)-5-(i%4)*3),low=Math.min(340,Math.max(open,close)+7+(i%3)*4),wick=document.createElementNS(ns,'line'),body=document.createElementNS(ns,'rect');wick.setAttribute('x1',x+5.5);wick.setAttribute('x2',x+5.5);wick.setAttribute('y1',high);wick.setAttribute('y2',low);wick.setAttribute('class',`wick ${up?'up':'down'}`);body.setAttribute('x',x);body.setAttribute('y',Math.min(open,close));body.setAttribute('width',11);body.setAttribute('height',Math.max(5,Math.abs(open-close)));body.setAttribute('rx','.5');body.setAttribute('class',`candle ${up?'up':'down'}`);g.append(wick,body);const bar=document.createElement('i');bar.style.height=`${Math.min(66,9+Math.abs(open-close)*.8+(i%5)*2)}px`;if(!up)bar.className='hot';bars.append(bar)})}
  function bindWalletEvents(target){
    if(boundWallets.has(target)||typeof target.on!=='function')return;boundWallets.add(target);
    target.on('accountsChanged',accounts=>{if(target!==walletProvider)return;if(accounts.length===0){localStorage.removeItem(walletMemoryKey);account=null;ui.connect.textContent=t('connectWallet');disabled(true);status(t('walletDisconnected'))}else connect(target,false)});
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
      const button=document.createElement('button'),label=document.createElement('span'),name=document.createElement('b'),kind=document.createElement('small'),safeName=String(wallet.info.name||t('nonCustodialWallet'));
      button.type='button';button.className='wallet-option';name.textContent=safeName;kind.textContent=t('nonCustodialWallet');label.append(name,kind);
      if(typeof wallet.info.icon==='string'&&wallet.info.icon.startsWith('data:image/')){const image=document.createElement('img');image.src=wallet.info.icon;image.alt='';button.append(image)}
      else{const fallback=document.createElement('span');fallback.className='wallet-fallback';fallback.textContent=safeName.slice(0,1);button.append(fallback)}
      button.append(label);button.onclick=()=>{ui.walletDialog.close();connect(wallet.provider,true)};return button;
    }));
  }
  function chooseWallet(){
    if(wallets.length===0&&window.ethereum)addWallet({info:{uuid:'legacy-injected',name:t('browserWallet'),rdns:'legacy.injected'},provider:window.ethereum});
    if(wallets.length===1)return connect(wallets[0].provider,true);
    if(wallets.length>1)return ui.walletDialog.showModal();
    status(t('walletNotFound'),'error');
  }
  window.addEventListener('eip6963:announceProvider',event=>addWallet(event.detail));
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  if(window.ethereum)setTimeout(()=>{if(wallets.length===0)addWallet({info:{uuid:'legacy-injected',name:t('browserWallet'),rdns:'legacy.injected'},provider:window.ethereum})},0);
  ui.connect.onclick=chooseWallet;ui.language.value=i18n.getLocale();ui.language.onchange=()=>i18n.setLocale(ui.language.value);window.addEventListener('lqc:localechange',()=>{ui.language.value=i18n.getLocale();setMode(mode,false);tokenList();renderWallets()});ui.buy.onclick=()=>setMode('buy');ui.sell.onclick=()=>setMode('sell');ui.quick.onclick=()=>setMode('buy');ui.close.onclick=()=>ui.order.classList.remove('open');ui.execute.onclick=swap;ui.tokenInButton.onclick=()=>{side='in';ui.dialog.showModal()};ui.tokenOutButton.onclick=()=>{side='out';ui.dialog.showModal()};ui.flip.onclick=()=>{[tokenIn,tokenOut]=[tokenOut,tokenIn];render();balances();quoteSoon()};ui.amountIn.oninput=quoteSoon;ui.slippage.oninput=quoteSoon;ui.settings.onclick=()=>{ui.settingsPanel.hidden=!ui.settingsPanel.hidden;ui.order.classList.add('open')};ui.max.onclick=async()=>{const b=await balance(tokenIn);if(b!==null){const reserve=tokenIn.address==='native'?ethers.parseEther('.01'):0n;ui.amountIn.value=ethers.formatUnits(b>reserve?b-reserve:0n,tokenIn.decimals);quoteSoon()}};
  document.querySelectorAll('.slippage-option').forEach(b=>b.onclick=()=>{document.querySelectorAll('.slippage-option').forEach(x=>x.classList.remove('active'));b.classList.add('active');ui.slippage.value=b.dataset.value;quoteSoon()});document.querySelectorAll('.timeframes button:not(.chart-tool),.indicators button,.section-tabs button,.position-tabs button').forEach(b=>b.onclick=()=>{b.parentElement.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
  i18n.apply();if(configured)status(t('contractsReady'));render();tokenList();chart();setMode('buy',false);if(localStorage.getItem(walletMemoryKey)==='1')setTimeout(()=>{const remembered=wallets[0]?.provider||window.ethereum;if(remembered)connect(remembered,false)},100);
})();
