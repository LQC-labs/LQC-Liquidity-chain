import { MODES, modeNumber, requireEntry, partialAmount, requireFresh, sameAddress, exitNotice } from "./mobile-testnet-position-policy.js";
const EA=[
 "function registry() view returns(address)","function vault() view returns(address)",
 "function fundingProtectionReady() view returns(bool)",
 "function positions(address,uint256) view returns(uint256 margin,uint256 sizeUsd,uint256 entryPrice,bool isLong,bool open)",
 "function getPositionPnl(address,uint256) view returns(int256 pnl,uint256 markPrice)",
 "function openPosition(uint256,uint256,uint256,bool)","function reducePosition(uint256,uint256)","function closePosition(uint256)"
],RA=[
 "function markets(uint256) view returns(bytes32 symbol,address indexToken,address collateralToken,address oracle,uint32 maxLeverageBps,uint32 maintenanceMarginBps,bool active)",
 "function marketMode(uint256) view returns(uint8)","function riskEngine() view returns(address)","function riskVault() view returns(address)",
 "function verifiedResidualDebt(uint256) view returns(bool verified,uint256 debt)",
 "function liquidationReady(uint256) view returns(bool)",
 "event MarketModeChanged(uint256 indexed marketId,uint8 previousMode,uint8 newMode)"
],VA=[
 "function engine() view returns(address)","function fundingWithdrawalProtection() view returns(bool)",
 "function availableBalance(address,address) view returns(uint256)","function lockedBalance(address,address) view returns(uint256)",
 "function withdrawableBalance(address,address) view returns(uint256)"
],OA=["function getPrice(address) view returns(uint256 price,uint256 updatedAt)"];
export function createMobilePositionPage({kind,profile,env=globalThis}) {
 const $=id=>env.document.getElementById(id),eth=()=>env.ethereum;
 let busy=false,revision=0,lastSnapshot=null,lastMode=null,pending=null,watching=false,timer=null;
 const actions=kind==="open"?["open"]:["close","reduce"];
 function disable(){for(const a of actions)if($(a))$(a).disabled=true;}
 function status(message,ok=false){$("s").className=ok?"ok":"err";$("s").textContent=message;}
 function stale(){if($("balances")&&lastSnapshot)$("balances").dataset.stale="true";}
 function invalidate(message){revision++;disable();stale();if(message)status(message);}
 async function q(method,params=[]){if(method==="eth_sendTransaction"&&profile.reviewOnly!==false)throw Error("REVIEW_ONLY: sending blocked");if(!eth())throw Error("TokenPocket DApp 브라우저에서 열어주세요.");return eth().request({method,params});}
 async function wallet(prompt=false) {
  if(BigInt(await q("eth_chainId"))!==BigInt(profile.chainId))throw Error("BSC Testnet(chain 97)이 아닙니다.");
  const a=(await q(prompt?"eth_requestAccounts":"eth_accounts"))[0]||"";
  sameAddress(a,profile.trader,"허용 Trader 지갑");
 }
 function showMode(n){lastMode=modeNumber(n);if($("mode"))$("mode").textContent=MODES[lastMode]+" · "+exitNotice(lastMode);}
 async function context(prompt=false) {
  if(profile.reviewOnly!==false)throw Error("REVIEW_ONLY: no approved deployment; all wallet actions blocked");
  await wallet(prompt);
  for(const a of [profile.engine,profile.registry,profile.vault,profile.oracle,profile.indexToken,profile.collateral])if(await q("eth_getCode",[a,"latest"])==="0x")throw Error("필수 컨트랙트 runtime code가 없습니다.");
  const p=new env.ethers.BrowserProvider(eth()),e=new env.ethers.Contract(profile.engine,EA,p),r=new env.ethers.Contract(profile.registry,RA,p),v=new env.ethers.Contract(profile.vault,VA,p),o=new env.ethers.Contract(profile.oracle,OA,p);
  const [er,ev,ve,re,rv,protected_,vaultProtected]=await Promise.all([e.registry(),e.vault(),v.engine(),r.riskEngine(),r.riskVault(),e.fundingProtectionReady(),v.fundingWithdrawalProtection()]);
  sameAddress(er,profile.registry,"Engine.registry");sameAddress(ev,profile.vault,"Engine.vault");sameAddress(ve,profile.engine,"Vault.engine");sameAddress(re,profile.engine,"Registry.riskEngine");sameAddress(rv,profile.vault,"Registry.riskVault");
  // Exit does not require liquidationReady or zero residual debt: those are admission conditions.
  if(protected_!==true||vaultProtected!==true)throw Error("현재 계약 연결·Funding 보호를 검증할 수 없습니다.");
  if(kind==="open"&&(await r.verifiedResidualDebt(profile.market))[0]!==true)throw Error("신규 진입 코드 지문·위험 연결을 검증할 수 없습니다.");
  return {p,e,r,v,o};
 }
 async function inspect({prompt=false,positionRequired=kind!=="open",prices=true}={}) {
  const c=await context(prompt),m=await c.r.markets(profile.market),mode=modeNumber(await c.r.marketMode(profile.market));
  sameAddress(m.indexToken,profile.indexToken,"시장 indexToken");sameAddress(m.collateralToken,profile.collateral,"시장 collateral");sameAddress(m.oracle,profile.oracle,"시장 Oracle");
  const pos=await c.e.positions(profile.trader,profile.market);
  if(positionRequired&&!pos.open)throw Error("현재 시장에 열린 포지션이 없습니다.");
  const [avail,locked,withdrawable]=await Promise.all([c.v.availableBalance(profile.trader,profile.collateral),c.v.lockedBalance(profile.trader,profile.collateral),c.v.withdrawableBalance(profile.trader,profile.collateral)]);
  let price=0n,age=0n,pnl=0n,mark=0n;
  if(prices){const [quoted,updatedAt]=await c.o.getPrice(profile.indexToken),block=await c.p.getBlock("latest");price=quoted;requireFresh(price,updatedAt,BigInt(block.timestamp));age=BigInt(block.timestamp)-updatedAt;if(pos.open)[pnl,mark]=await c.e.getPositionPnl(profile.trader,profile.market);}
  if(modeNumber(await c.r.marketMode(profile.market))!==mode)throw Error("조회 중 시장 모드가 변경됐습니다. 다시 확인하세요.");
  return {...c,m,mode,pos,avail,locked,withdrawable,price,age,pnl,mark,pricesVerified:prices};
 }
 function publish(x) {
  lastSnapshot=x;showMode(x.mode);
  if($("balances")){$("balances").textContent="마지막 확인값\nposition.open: "+x.pos.open+"\n방향: "+(x.pos.isLong?"LONG":"SHORT")+"\nsize: "+env.ethers.formatUnits(x.pos.sizeUsd,18)+" USD\nmargin: "+env.ethers.formatUnits(x.pos.margin,18)+" mUSDT\nentryPrice: "+env.ethers.formatUnits(x.pos.entryPrice,18)+"\nVault available: "+env.ethers.formatUnits(x.avail,18)+" mUSDT\nVault locked: "+env.ethers.formatUnits(x.locked,18)+" mUSDT\n출금 가능액: "+env.ethers.formatUnits(x.withdrawable,18)+" mUSDT"+(x.pricesVerified?"\nmarkPrice: "+env.ethers.formatUnits(x.mark||x.price,18)+"\nPnL: "+env.ethers.formatUnits(x.pnl,18)+" mUSDT\nOracle age: "+x.age+"초 (<=300초)":"\n사후 포지션·잔액 확인값 (가격은 다시 확인하세요.)");$("balances").dataset.stale="false";}
 }
 function command(action,x) {
  if(action==="open"){requireEntry(x.mode,x.m.active,x.ready);if(x.pos.open)throw Error("현재 시장에 기존 포지션이 있습니다.");if(x.withdrawable<profile.margin)throw Error("예약·Funding 채무를 제외한 사용 가능 담보가 부족합니다.");if(profile.size*10000n>profile.margin*BigInt(x.m.maxLeverageBps))throw Error("시장 레버리지 제한을 초과합니다.");if(profile.expectedOpenPrice!==undefined&&x.price!==profile.expectedOpenPrice)throw Error("기존 테스트 프로필의 50,000 USDT 가격 조건을 충족하지 않습니다.");return {method:"openPosition",args:[profile.market,profile.margin,profile.size,true],remaining:profile.size};}
  modeNumber(x.mode); // Do not use markets().active as a voluntary-exit permission.
  if(!x.pos.open)throw Error("열린 포지션이 없습니다.");
  if(action==="close")return {method:"closePosition",args:[profile.market],remaining:0n};
  const amount=partialAmount($("reduceSize").value,x.pos.sizeUsd,env.ethers.parseUnits);
  return {method:"reducePosition",args:[profile.market,amount],remaining:x.pos.sizeUsd-amount};
 }
 async function simulate(action,x) {
  if(action==="open")x.ready=await x.r.liquidationReady(profile.market);
  const cmd=command(action,x),data=x.e.interface.encodeFunctionData(cmd.method,cmd.args),tx={chainId:profile.chainId,from:profile.trader,to:profile.engine,data,value:"0x0"},gas=BigInt(await q("eth_estimateGas",[tx]));
  if(gas<=0n)throw Error("Engine gas 시뮬레이션 결과가 유효하지 않습니다.");
  return {...cmd,tx:{...tx,gas:"0x"+gas.toString(16)},gas};
 }
 async function refreshMode() {
  if(!watching)return;
  try{const c=await context(false),n=modeNumber(await c.r.marketMode(profile.market));if(n!==lastMode){showMode(n);invalidate("시장 모드가 변경됐습니다. 거래 전 다시 사전검증하세요.");}}
  catch(error){invalidate("현재 상태 갱신 실패: "+(error.message||String(error)));}
 }
 function watch(c) {
  if(watching)return;watching=true;
  const changed=()=>refreshMode();
  if(c.p.on)Promise.resolve(c.p.on("block",changed)).catch(()=>invalidate("블록 구독 실패: 상태를 다시 확인하세요."));
  if(c.r.on)Promise.resolve(c.r.on("MarketModeChanged",(id)=>{if(BigInt(id)===profile.market){invalidate("시장 모드 변경을 감지했습니다. 다시 검증하세요.");void refreshMode();}})).catch(()=>invalidate("시장 이벤트 구독 실패: 상태를 다시 확인하세요."));
  if(env.setInterval)timer=env.setInterval(changed,profile.pollDelay);
 }
 async function reconcile() {
  const rc=await q("eth_getTransactionReceipt",[pending.hash]);if(!rc)throw Error("영수증 확인 중입니다. 재전송하지 마세요. Tx: "+pending.hash);
  const hash=pending.hash;if(BigInt(rc.status)!==1n){pending=null;throw Error("거래가 revert됐습니다. 이전 확인 잔액을 보존합니다. Tx: "+hash);}
  const x=await inspect({positionRequired:false,prices:false});
  if(x.pos.sizeUsd!==pending.remaining||x.pos.open!==(pending.remaining!==0n))throw Error("영수증 성공 후 포지션 사후검증 불일치. 재전송하지 마세요. Tx: "+hash);
  pending=null;publish(x);status("거래 영수증 및 계약 상태 확인 완료\nTx: "+hash,true);return true;
 }
 async function check() {
  if(busy)return false;
  busy=true;disable();const ticket=++revision;
  try {
   if(pending)return await reconcile();
   const x=await inspect({prompt:true});watch(x);showMode(x.mode);const permits=[],denied=[],gasDetails=[],labels={open:"신규 진입",close:"전체 종료",reduce:"부분 축소"};
   for(const action of actions){try{const plan=await simulate(action,x);permits.push(action);gasDetails.push(labels[action]+" estimated gas: "+plan.gas);}catch(error){denied.push(labels[action]+": "+(error.message||String(error)));}}
   if(ticket!==revision)throw Error("상태가 변경됐습니다. 다시 검증하세요.");
   publish(x);
   for(const action of permits)$(action).disabled=false;
   status((permits.length?"Engine 시뮬레이션 허용: "+permits.map(a=>labels[a]).join(", "):"거래 허용 없음")+"\nChain ID: 97 · value: 0 tBNB\n"+exitNotice(x.mode)+(kind==="open"?"\nLONG 주문: margin "+env.ethers.formatUnits(profile.margin,18)+" mUSDT / size "+env.ethers.formatUnits(profile.size,18)+" USD":"")+(gasDetails.length?"\n"+gasDetails.join("\n"):"")+(denied.length?"\n거부: "+denied.join("\n"):""),permits.length>0);
   return permits.length>0;
  } catch(error){disable();stale();status(error.message||String(error));return false;}
  finally{busy=false;}
 }
 async function perform(action) {
  if(!actions.includes(action)){status("지원하지 않는 거래입니다.");return false;}
  if(busy||pending)return false;
  busy=true;disable();const ticket=++revision;
  try {
   const x=await inspect({prompt:true}),plan=await simulate(action,x);
   await wallet(false);if(ticket!==revision)throw Error("거래 전 상태가 변경됐습니다. 다시 검증하세요.");
   status("지갑 확인창에서 Engine 주소·chain97·value0을 확인하세요. 계약이 최종 허용 여부를 판정합니다.",true);
   const hash=await q("eth_sendTransaction",[plan.tx]);pending={hash,remaining:plan.remaining};stale();
   let receipt=null;for(let i=0;i<profile.receiptAttempts&&!receipt;i++){receipt=await q("eth_getTransactionReceipt",[hash]);if(!receipt&&i+1<profile.receiptAttempts)await new Promise(resolve=>env.setTimeout(resolve,profile.receiptDelay));}
   if(!receipt)throw Error("영수증 지연: 재전송하지 마세요. Tx: "+hash);
   return await reconcile();
  }catch(error){stale();status((error.message||String(error))+(lastSnapshot?"\n잔액은 마지막 확인값이며 새 성공 잔액으로 갱신하지 않았습니다.":""));return false;}
  finally{busy=false;}
 }
 function mount() {
  $("check").onclick=check;
  for(const action of actions)$(action).onclick=()=>perform(action);
  disable();
  if($("reduceSize"))$("reduceSize").addEventListener("input",()=>invalidate("축소 수량이 변경됐습니다. 다시 사전검증하세요."));
  if(eth()?.on){eth().on("chainChanged",()=>invalidate("네트워크가 변경됐습니다."));eth().on("accountsChanged",()=>invalidate("지갑 계정이 변경됐습니다."));}
  env.document.addEventListener?.("visibilitychange",()=>{if(!env.document.hidden)void refreshMode();});
 }
 function dispose(){if(timer!==null&&env.clearInterval)env.clearInterval(timer);watching=false;disable();}
 return {mount,check,perform,refreshMode,dispose,get state(){return {busy,pendingHash:pending?.hash??null,lastMode,lastSnapshot};}};
}

