(function(){
  'use strict';
  const cfg=window.LQC_FLOW_CONFIG,{ethers,LQCRouterSDK:sdk}=window,$=id=>document.getElementById(id);
  const routerAbi=['function getAmountsOut(uint256,address[]) view returns (uint256[])','function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])','function swapExactBNBForTokens(uint256,address[],address,uint256) payable returns (uint256[])','function swapExactTokensForBNB(uint256,uint256,address[],address,uint256) returns (uint256[])'];
  const quoteRouterAbi=['function quoteBest(address,address,uint256,bytes[]) view returns ((bytes32 dexId,address adapter,uint256 amountOut,uint32 priority))'];
  const executionRouterAbi=['function swapExactInput(bytes32,address,address,uint256,uint256,address,uint256,bytes) returns (uint256)'];
  const nativeRouterAbi=['function swapExactNativeForToken(bytes32,address,uint256,address,uint256,bytes) payable returns (uint256)','function swapExactTokenForNative(bytes32,address,uint256,uint256,address,uint256,bytes) returns (uint256)'];
  const splitOptimizerAbi=['function quoteOptimalSplitCapped(address,address,uint256,bytes[],uint256[],uint256,uint256) view returns ((bytes32[] dexIds,address[] adapters,uint256[] amountsIn,uint256[] amountsOut,uint256 totalAmountOut,uint256 totalNetAmountOut))'];
  const autoRouterAbi=['function swapOptimizedExactInput(address,address,uint256,address,uint256,bytes[],uint256[],uint256,uint256) returns (uint256)'];
  const gasCostOracleAbi=['function quoteRouteCosts(address,uint256[],uint256) view returns (uint256[])'];
  const tokenAbi=['function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)'];
  const adapterAbi=['function quoteExactInput(address,address,uint256,bytes) view returns (uint256)'];
  const ui={connect:$('connectButton'),settings:$('settingsButton'),settingsPanel:$('settingsPanel'),amountIn:$('amountIn'),amountOut:$('amountOut'),minimum:$('minimumReceived'),gas:$('estimatedGas'),impact:$('priceImpact'),split:$('splitRatio'),route:$('routeLabel'),selectedDex:$('selectedDex'),selectedPath:$('selectedPath'),routeStrategy:$('routeStrategy'),alternativeRoute:$('alternativeRoute'),preflightState:$('preflightState'),balanceIn:$('balanceIn'),balanceOut:$('balanceOut'),walletDialog:$('walletDialog'),walletList:$('walletList'),positionBalance:$('positionBalance'),portfolioValue:$('portfolioValue'),tokenInButton:$('tokenInButton'),tokenOutButton:$('tokenOutButton'),flip:$('flipButton'),max:$('maxButton'),buy:$('buyAction'),sell:$('sellAction'),quick:$('quickTrade'),order:$('orderPanel'),close:$('closeOrder'),title:$('orderTitle'),execute:$('executeButton'),status:$('statusBox'),statusText:$('statusText'),dialog:$('tokenDialog'),tokenList:$('tokenList'),slippage:$('slippageInput')};
  const walletMemoryKey='lqc-flow-wallet-connected';
  let walletProvider,provider,signer,account,router,quoteRouter,executionRouter,nativeRouter,splitOptimizer,autoRouter,gasCostOracle,wallets=[],boundWallets=new WeakSet(),side='in',timer,mode='buy',tokenIn=cfg.tokens[0],tokenOut=cfg.tokens[2];
  const deployed=ethers.isAddress(cfg.quoteRouterAddress)&&ethers.isAddress(cfg.executionRouterAddress)&&ethers.isAddress(cfg.nativeRouterAddress)&&ethers.isAddress(cfg.splitOptimizerAddress)&&ethers.isAddress(cfg.autoRouterAddress)&&ethers.isAddress(cfg.gasCostOracleAddress)&&cfg.tokens.filter(t=>t.address!=='native').every(t=>ethers.isAddress(t.address));
  const address=t=>t.address==='native'?(cfg.tokens.find(x=>x.symbol==='WBNB')?.address||''):t.address;
  const status=(m,type='')=>{ui.status.className=`status ${type}`.trim();ui.statusText.textContent=m};
  const disabled=v=>ui.execute.disabled=v;
  function render(){for(const [s,t] of [['In',tokenIn],['Out',tokenOut]]){$(`token${s}Label`).textContent=t.symbol;$(`token${s}Icon`).textContent=t.symbol.slice(0,4);$(`token${s}Icon`).classList.toggle('mint',t.symbol==='LQC')}const path=`${tokenIn.symbol} → ${tokenOut.symbol}`;ui.route.textContent=path;ui.selectedPath.textContent=path}
  function setMode(next,open=true){const lqc=cfg.tokens.find(t=>t.symbol==='LQC'),bnb=cfg.tokens.find(t=>t.symbol==='BNB');mode=next;[tokenIn,tokenOut]=next==='buy'?[bnb,lqc]:[lqc,bnb];ui.title.textContent=next==='buy'?'LQC 매수':'LQC 매도';ui.execute.textContent=ui.title.textContent;ui.execute.className=`execute-button ${next}`;ui.buy.classList.toggle('active',next==='buy');ui.sell.classList.toggle('active',next==='sell');if(open)ui.order.classList.add('open');render();balances();quoteSoon()}
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
  async function balances(){const lqc=cfg.tokens.find(t=>t.symbol==='LQC'),[a,b,l]=await Promise.all([balance(tokenIn),balance(tokenOut),balance(lqc)]);ui.balanceIn.textContent=format(a,tokenIn);ui.balanceOut.textContent=format(b,tokenOut);ui.positionBalance.textContent=l===null?'—':`${format(l,lqc)} LQC`;if(l!==null)ui.portfolioValue.textContent=`${(Number(ethers.formatUnits(l,lqc.decimals))*.091348).toLocaleString(undefined,{maximumFractionDigits:2})}`}
  async function assertExecutionContext(expectedAccount){const [accounts,chainId]=await Promise.all([walletProvider.request({method:'eth_accounts'}),walletProvider.request({method:'eth_chainId'})]);if(!sdk.executionContextMatches(expectedAccount,accounts,cfg.chainIdHex,chainId))throw new Error('WalletContextChanged')}
  function quoteSoon(){clearTimeout(timer);timer=setTimeout(quote,300)}
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
  async function quote(){
    ui.amountOut.textContent='0.0';ui.minimum.textContent='—';ui.gas.textContent='—';ui.impact.textContent='—';ui.split.textContent='단일 경로';ui.selectedDex.textContent='견적 확인 중';ui.alternativeRoute.textContent='경로 확인 중';ui.alternativeRoute.classList.remove('alternative-ready');ui.preflightState.textContent='실행 조건 확인 중';ui.preflightState.className='';
    const raw=ui.amountIn.value.trim();if(!raw||Number(raw)<=0||!deployed){ui.selectedDex.textContent='LQC Flow · PancakeSwap 비교 대기';ui.alternativeRoute.textContent='견적 후 표시';ui.preflightState.textContent='확인 대기';return}
    try{
      const path=[address(tokenIn),address(tokenOut)],value=ethers.parseUnits(raw,tokenIn.decimals),probe=value>1000n?value/1000n:1n,plan=await executionPlan(value,path),out=plan.kind==='split'?plan.split.totalAmountOut:plan.single.best.amountOut,[impact,feeData]=await Promise.all([planPriceImpact(value,out,probe,path,plan),provider.getFeeData()]),ranked=plan.ranked||await rankedRoutes(value,path,plan.routes,plan.costs),min=sdk.minimumAmountOut(out,ui.slippage.value),gasDex=plan.kind==='split'?{gasUnits:plan.summary.reduce((total,item)=>total+Number(item.dex.gasUnits||220000),0)}:plan.single.dex,gasWei=sdk.estimatedGasWei(gasDex,feeData.gasPrice||0n,tokenIn.address==='native'||tokenOut.address==='native');
      ui.amountOut.textContent=ethers.formatUnits(out,tokenOut.decimals);ui.minimum.textContent=`${Number(ethers.formatUnits(min,tokenOut.decimals)).toLocaleString(undefined,{maximumFractionDigits:6})} ${tokenOut.symbol}`;ui.gas.textContent=`≈ ${Number(ethers.formatEther(gasWei)).toFixed(6)} BNB`;ui.impact.textContent=`≈ ${(impact/100).toFixed(2)}%`;ui.impact.classList.toggle('warning',impact>=300);ui.selectedDex.textContent=plan.kind==='split'?plan.summary.map(item=>item.dex.name).join(' + '):plan.single.dex.name;ui.split.textContent=plan.kind==='split'?plan.summary.map(item=>`${item.dex.name} ${item.percent.toFixed(1)}%`).join(' · '):'단일 경로 100%';ui.routeStrategy.textContent=plan.kind==='split'?'Router 2.0 · 가스 차감 후 원자적 분할':plan.oracleReady?'Router 2.0 · 가스 차감 후 단일 최적':'가스 오라클 대기 · 안전 단일 경로';const fallback=ranked.find(item=>item.name!==ranked[0]?.name);ui.alternativeRoute.textContent=fallback?`${fallback.name} · 자동 재견적 가능`:'사용 가능한 추가 경로 없음';ui.alternativeRoute.classList.toggle('alternative-ready',Boolean(fallback));ui.preflightState.textContent=impact>=300?'주의 · 가격영향 3% 이상':plan.oracleReady?'준비 완료 · 가스 검증됨':'제한적 준비 · 가스 오라클 대기';ui.preflightState.className=impact>=300||!plan.oracleReady?'preflight-warning':'preflight-safe';status(impact>=300?'가격영향이 높습니다. 수량을 줄이거나 대체 경로를 확인하세요.':'거래 실행 전 점검을 통과했습니다.',impact>=300?'':'success');disabled(false);
    }catch{ui.selectedDex.textContent='유효한 경로 없음';ui.alternativeRoute.textContent='대체 경로도 없음';ui.preflightState.textContent='실행 불가';ui.preflightState.className='preflight-warning';disabled(true);status('이 거래쌍의 유동성을 확인할 수 없습니다. 수량을 줄이거나 다른 토큰을 선택하세요.','error')}
  }
  async function swap(){
    if(!executionRouter||!account)return connect();const executionAccount=account,raw=ui.amountIn.value.trim();if(!raw||Number(raw)<=0)return status('보낼 수량을 입력하세요.','error');
    try{
      disabled(true);const value=ethers.parseUnits(raw,tokenIn.decimals),path=[address(tokenIn),address(tokenOut)];let plan=await executionPlan(value,path),deadline=Math.floor(Date.now()/1000)+1200,bps=Math.round(Number(ui.slippage.value)*100),tx;
      if(tokenIn.address==='native'){await assertExecutionContext(executionAccount);const min=sdk.minimumAmountOut(plan.single.best.amountOut,ui.slippage.value);tx=await nativeRouter.swapExactNativeForToken(plan.single.best.dexId,path[1],min,executionAccount,deadline,plan.single.routeData,{value})}
      else{const planFingerprint=sdk.executionPlanFingerprint(plan),approvedAmountOut=plan.kind==='split'?plan.split.totalAmountOut:plan.single.best.amountOut;let spender=tokenOut.address==='native'?cfg.nativeRouterAddress:plan.kind==='split'?cfg.autoRouterAddress:cfg.executionRouterAddress,token=new ethers.Contract(tokenIn.address,tokenAbi,signer),allowance=await token.allowance(account,spender);if(sdk.requiresTokenApproval(allowance,value)){const approvals=sdk.tokenApprovalSequence(allowance,value);for(const approvalAmount of approvals){status(approvalAmount===0n?`${tokenIn.symbol} 기존 승인을 안전하게 초기화하세요.`:`${tokenIn.symbol} 사용 승인을 확인하세요.`);await(await token.approve(spender,approvalAmount)).wait()}status('승인 완료 · 최신 가격과 경로를 다시 확인합니다.');plan=await executionPlan(value,path);const refreshedSpender=tokenOut.address==='native'?cfg.nativeRouterAddress:plan.kind==='split'?cfg.autoRouterAddress:cfg.executionRouterAddress,refreshedFingerprint=sdk.executionPlanFingerprint(plan),refreshedAmountOut=plan.kind==='split'?plan.split.totalAmountOut:plan.single.best.amountOut;if(refreshedSpender.toLowerCase()!==spender.toLowerCase()||!planFingerprint||refreshedFingerprint!==planFingerprint)throw new Error('RouteChangedDuringApproval');if(!sdk.isRefreshedOutputAcceptable(approvedAmountOut,refreshedAmountOut,ui.slippage.value))throw new Error('QuoteWorsenedDuringApproval')}await assertExecutionContext(executionAccount);deadline=Math.floor(Date.now()/1000)+1200;if(tokenOut.address==='native'){const min=sdk.minimumAmountOut(plan.single.best.amountOut,ui.slippage.value);tx=await nativeRouter.swapExactTokenForNative(plan.single.best.dexId,path[0],value,min,executionAccount,deadline,plan.single.routeData)}else if(plan.kind==='split')tx=await autoRouter.swapOptimizedExactInput(path[0],path[1],value,executionAccount,deadline,plan.routes,plan.costs,10,bps);else{const min=sdk.minimumAmountOut(plan.single.best.amountOut,ui.slippage.value);tx=await executionRouter.swapExactInput(plan.single.best.dexId,path[0],path[1],value,min,executionAccount,deadline,plan.single.routeData)}}
      status(plan.kind==='split'?'Router 2.0 분할 거래가 제출되었습니다.':'Router 2.0 거래가 제출되었습니다.');await tx.wait();status(`${mode==='buy'?'매수':'매도'} 거래가 완료되었습니다.`,'success');ui.amountIn.value='';await balances();await quote();
    }catch(e){const guidance=sdk.explainSwapError(e);status(`${guidance.message} ${guidance.action}`,'error')}finally{disabled(!deployed)}
  }
  function tokenList(){ui.tokenList.replaceChildren(...cfg.tokens.map(t=>{const b=document.createElement('button');b.type='button';b.className='token-option';b.innerHTML=`<span class="token-symbol ${t.symbol==='LQC'?'mint':''}">${t.symbol.slice(0,4)}</span><b>${t.symbol}</b><span>${t.name}</span>`;b.onclick=()=>{const other=side==='in'?tokenOut:tokenIn;if(address(t)&&address(t)===address(other))return status('BNB와 WBNB는 동시에 선택할 수 없습니다.','error');if(side==='in')tokenIn=t;else tokenOut=t;ui.dialog.close();mode=tokenIn.symbol==='LQC'?'sell':'buy';ui.title.textContent=mode==='buy'?'LQC 매수':'LQC 매도';ui.execute.textContent=ui.title.textContent;ui.execute.className=`execute-button ${mode}`;render();balances();quoteSoon()};return b}))}
  function chart(){const closes=[92,110,98,128,175,218,270,260,225,178,164,151,168,176,169,181,158,145,132,278,301,270,226,206,182,169,188,204,238,312,286,254,226,194,160,137,124,196,251,226,210,231,218,197,176,151,139],g=$('candles'),bars=$('volumeBars'),ns='http://www.w3.org/2000/svg';closes.forEach((close,i)=>{const open=i?closes[i-1]+((i%5)-2)*3:108,x=i*16+3,up=close<open,high=Math.max(50,Math.min(open,close)-5-(i%4)*3),low=Math.min(340,Math.max(open,close)+7+(i%3)*4),wick=document.createElementNS(ns,'line'),body=document.createElementNS(ns,'rect');wick.setAttribute('x1',x+5.5);wick.setAttribute('x2',x+5.5);wick.setAttribute('y1',high);wick.setAttribute('y2',low);wick.setAttribute('class',`wick ${up?'up':'down'}`);body.setAttribute('x',x);body.setAttribute('y',Math.min(open,close));body.setAttribute('width',11);body.setAttribute('height',Math.max(5,Math.abs(open-close)));body.setAttribute('rx','.5');body.setAttribute('class',`candle ${up?'up':'down'}`);g.append(wick,body);const bar=document.createElement('i');bar.style.height=`${Math.min(66,9+Math.abs(open-close)*.8+(i%5)*2)}px`;if(!up)bar.className='hot';bars.append(bar)})}
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
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  if(window.ethereum)setTimeout(()=>{if(wallets.length===0)addWallet({info:{uuid:'legacy-injected',name:'브라우저 지갑',rdns:'legacy.injected'},provider:window.ethereum})},0);
  ui.connect.onclick=chooseWallet;ui.buy.onclick=()=>setMode('buy');ui.sell.onclick=()=>setMode('sell');ui.quick.onclick=()=>setMode('buy');ui.close.onclick=()=>ui.order.classList.remove('open');ui.execute.onclick=swap;ui.tokenInButton.onclick=()=>{side='in';ui.dialog.showModal()};ui.tokenOutButton.onclick=()=>{side='out';ui.dialog.showModal()};ui.flip.onclick=()=>{[tokenIn,tokenOut]=[tokenOut,tokenIn];render();balances();quoteSoon()};ui.amountIn.oninput=quoteSoon;ui.slippage.oninput=quoteSoon;ui.settings.onclick=()=>{ui.settingsPanel.hidden=!ui.settingsPanel.hidden;ui.order.classList.add('open')};ui.max.onclick=async()=>{const b=await balance(tokenIn);if(b!==null){const reserve=tokenIn.address==='native'?ethers.parseEther('.01'):0n;ui.amountIn.value=ethers.formatUnits(b>reserve?b-reserve:0n,tokenIn.decimals);quoteSoon()}};
  document.querySelectorAll('.slippage-option').forEach(b=>b.onclick=()=>{document.querySelectorAll('.slippage-option').forEach(x=>x.classList.remove('active'));b.classList.add('active');ui.slippage.value=b.dataset.value;quoteSoon()});document.querySelectorAll('.timeframes button:not(.chart-tool),.indicators button,.section-tabs button,.position-tabs button').forEach(b=>b.onclick=()=>{b.parentElement.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
  if(deployed)status('컨트랙트가 설정되었습니다. 지갑을 연결하세요.');render();tokenList();chart();setMode('buy',false);if(localStorage.getItem(walletMemoryKey)==='1')setTimeout(()=>{const remembered=wallets[0]?.provider||window.ethereum;if(remembered)connect(remembered,false)},100);
})();
