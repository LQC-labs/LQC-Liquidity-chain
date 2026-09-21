(()=>{"use strict";
const CHAIN_HEX="0x61";
const CHAIN_ID=97;
const DEPLOYER="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const PACKET_URL="../deployments/master6-live-execution-packet-bsc-testnet-97.json";
const PACKET_DIGEST="sha256:dc538396aff204b65e19430033d5d11520c17b10239f49876d1364559fc3d84f";
const RPCS=["https://bsc-testnet-rpc.publicnode.com","https://data-seed-prebsc-1-s1.bnbchain.org:8545"];
const STORAGE_KEY="lqc-master6-clean-deployment-evidence-v1";
const $=id=>document.getElementById(id);
let packet=null,wallet=null,busy=false,currentIndex=0;

function setStatus(message,type="info"){const el=$("status");el.textContent=message;el.dataset.type=type}
function hex(n){return"0x"+BigInt(n).toString(16)}
function addrEq(a,b){return String(a||"").toLowerCase()===String(b||"").toLowerCase()}
function evidence(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch{return[]}}
function saveEvidence(rows){localStorage.setItem(STORAGE_KEY,JSON.stringify(rows))}
async function rpc(url,method,params=[]){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),20000);
  try{
    const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:c.signal,cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer"});
    if(!r.ok)throw Error("RPC HTTP "+r.status);
    const b=await r.json();if(b.error)throw Error(b.error.message||"RPC error");return b.result
  }finally{clearTimeout(timer)}
}
async function walletRpc(method,params=[]){
  if(!window.ethereum)throw Error("TokenPocket DApp 브라우저에서 열어주세요.");
  return window.ethereum.request({method,params})
}
async function sha256HexData(data){
  const raw=String(data||"");if(!/^0x[0-9a-fA-F]*$/.test(raw)||raw.length%2!==0)throw Error("Invalid init code");
  const bytes=new Uint8Array((raw.length-2)/2);
  for(let i=2,j=0;i<raw.length;i+=2,j++)bytes[j]=parseInt(raw.slice(i,i+2),16);
  const d=await crypto.subtle.digest("SHA-256",bytes);
  return"sha256:"+[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")
}
function validatePacket(p){
  if(p?.recordType!=="LQC_MASTER6_LIVE_EXECUTION_PACKET"||p?.status!=="APPROVED_FOR_WALLET_CONFIRMATION")throw Error("실행 패킷 상태가 올바르지 않습니다.");
  if(p?.network?.chainId!==CHAIN_ID||!addrEq(p.deployer,DEPLOYER))throw Error("체인 또는 deployer가 승인값과 다릅니다.");
  if(p.executionPacketDigest!==PACKET_DIGEST)throw Error("실행 패킷 digest가 변경됐습니다.");
  if(p.executionAuthorized!==true||p.activationAuthorized!==false||p.transactionOccurred!==false)throw Error("실행/활성화 경계가 변경됐습니다.");
  if(p.packet?.startingNonce!=="17"||p.packet?.market?.enabled!==false)throw Error("nonce 또는 market 상태가 승인값과 다릅니다.");
  if(!Array.isArray(p.packet?.deployments)||p.packet.deployments.length!==10)throw Error("10개 배포 순서가 아닙니다.");
  const expected=Array.from({length:10},(_,i)=>String(17+i));
  if(JSON.stringify(p.packet.deployments.map(x=>x.deployerNonce))!==JSON.stringify(expected))throw Error("배포 nonce 순서가 변경됐습니다.");
  if(!Array.isArray(p.preflight?.deployments)||p.preflight.deployments.length!==10||p.preflight.status!=="PREFLIGHT_VERIFIED_FOR_REVIEW")throw Error("preflight 기록이 유효하지 않습니다.");
}
async function loadPacket(){
  const r=await fetch(PACKET_URL,{cache:"no-store",credentials:"omit"});if(!r.ok)throw Error("6/12 실행 패킷을 읽지 못했습니다.");
  const p=await r.json();validatePacket(p);
  for(const d of p.packet.deployments){
    if(await sha256HexData(d.data)!==d.initCodeDigest)throw Error(d.label+" init code digest 불일치");
  }
  packet=p;
  $("digest").textContent=p.executionPacketDigest;
  $("deployer").textContent=p.deployer;
  $("source").textContent=p.sourceCommit;
}
async function verifyWallet(){
  const chain=(await walletRpc("eth_chainId")).toLowerCase();if(chain!==CHAIN_HEX)throw Error("BSC Testnet(chain 97)이 아닙니다.");
  const accounts=await walletRpc("eth_requestAccounts");if(!accounts?.[0]||!addrEq(accounts[0],DEPLOYER))throw Error("승인된 Futures/Testnet deployer 지갑으로 연결하세요.");
  wallet=accounts[0];$("wallet").textContent=wallet;
}
async function providerSnapshot(url,d){
  const [chain,nonce,code,balance,gas,gasPrice]=await Promise.all([
    rpc(url,"eth_chainId"),
    rpc(url,"eth_getTransactionCount",[DEPLOYER,"pending"]),
    rpc(url,"eth_getCode",[d.predictedAddress,"latest"]),
    rpc(url,"eth_getBalance",[DEPLOYER,"latest"]),
    rpc(url,"eth_estimateGas",[{from:DEPLOYER,data:d.data,value:"0x0"}]),
    rpc(url,"eth_gasPrice")
  ]);
  return{chain:Number(BigInt(chain)),nonce:Number(BigInt(nonce)),code,balance:BigInt(balance),gas:BigInt(gas),gasPrice:BigInt(gasPrice)}
}
async function verifyRecordedReceipt(row,d){
  const receipt=await walletRpc("eth_getTransactionReceipt",[row.txHash]);
  if(!receipt||BigInt(receipt.status)!==1n||!addrEq(receipt.contractAddress,d.predictedAddress))throw Error(d.label+" 저장 영수증 검증 실패");
  const codes=await Promise.all(RPCS.map(u=>rpc(u,"eth_getCode",[d.predictedAddress,"latest"])));
  if(codes.some(c=>!c||c==="0x"))throw Error(d.label+" runtime code 검증 실패");
}
async function recoverProgress(){
  const rows=evidence();let idx=0;
  for(;idx<packet.packet.deployments.length;idx++){
    const d=packet.packet.deployments[idx],row=rows.find(x=>x.order===d.order);
    const codes=await Promise.all(RPCS.map(u=>rpc(u,"eth_getCode",[d.predictedAddress,"latest"])));
    const occupied=codes.some(c=>c&&c!=="0x");
    if(!occupied)break;
    if(!row||!row.txHash)throw Error(d.label+" 예상 주소에 code가 있지만 이 기기의 검증된 영수증 기록이 없습니다. 자동 진행을 중단합니다.");
    await verifyRecordedReceipt(row,d);
  }
  currentIndex=idx;render();
}
async function preflightNext(){
  if(currentIndex>=10)return null;
  const d=packet.packet.deployments[currentIndex],pf=packet.preflight.deployments[currentIndex];
  if(d.order!==pf.order||!addrEq(d.predictedAddress,pf.predictedAddress)||d.initCodeDigest!==pf.initCodeDigest)throw Error("packet/preflight binding 불일치");
  const s=await Promise.all(RPCS.map(u=>providerSnapshot(u,d)));
  if(s.some(x=>x.chain!==CHAIN_ID))throw Error("RPC chainId 불일치");
  const expectedNonce=Number(d.deployerNonce);
  if(s.some(x=>x.nonce!==expectedNonce))throw Error("pending nonce가 승인값 "+expectedNonce+"와 다릅니다. 새 패킷이 필요합니다.");
  if(s.some(x=>x.code&&x.code!=="0x"))throw Error("예상 배포 주소가 이미 사용 중입니다.");
  const maxGas=s.reduce((m,x)=>x.gas>m?x.gas:m,0n),limit=BigInt(pf.approvedGasLimit);
  if(maxGas>limit)throw Error("현재 gas estimate가 승인 gas limit를 초과합니다.");
  const approvedGasPrice=BigInt(packet.preflight.conservativeGasPrice);
  if(s.some(x=>x.gasPrice>approvedGasPrice))throw Error("현재 gas price가 승인 상한을 초과합니다.");
  const remaining=packet.preflight.deployments.slice(currentIndex).reduce((a,x)=>a+BigInt(x.approvedGasLimit)*approvedGasPrice,0n);
  if(s.some(x=>x.balance<remaining))throw Error("남은 배포 가스 예산보다 tBNB 잔액이 부족합니다.");
  return{d,pf,maxGas,approvedGasPrice,remaining}
}
async function connectAndCheck(){
  try{
    busy=true;render();await loadPacket();await verifyWallet();await recoverProgress();
    if(currentIndex>=10){setStatus("10개 Clean Deployment가 이 기기의 영수증 기록과 온체인 code로 검증되었습니다. Governance 설정은 별도 단계입니다.","ok");return}
    const x=await preflightNext();
    $("preflight").textContent="next nonce "+x.d.deployerNonce+"\nestimated gas "+x.maxGas+" / limit "+x.pf.approvedGasLimit+"\ngas price ceiling "+x.approvedGasPrice+" wei\nremaining max gas budget "+x.remaining+" wei";
    setStatus("읽기 전용 재검증 PASS. 다음 1건만 지갑 확인이 활성화됩니다.","ok")
  }catch(e){setStatus(e.message||String(e),"error")}finally{busy=false;render()}
}
async function waitReceipt(hash){
  for(let i=0;i<90;i++){
    const r=await walletRpc("eth_getTransactionReceipt",[hash]);if(r)return r;
    await new Promise(res=>setTimeout(res,4000));
  }
  throw Error("영수증 확인이 지연됩니다. 재배포하지 말고 거래 해시를 보관하세요.")
}
async function deployNext(){
  try{
    busy=true;render();await verifyWallet();
    const x=await preflightNext(),d=x.d,pf=x.pf;
    setStatus(d.order+"/10 "+d.label+" 지갑 확인창을 확인하세요. value 0 tBNB.");
    const hash=await walletRpc("eth_sendTransaction",[{from:DEPLOYER,to:null,value:"0x0",data:d.data,gas:hex(pf.approvedGasLimit),gasPrice:hex(x.approvedGasPrice),nonce:hex(d.deployerNonce)}]);
    $("tx").textContent=hash;
    const receipt=await waitReceipt(hash);
    if(BigInt(receipt.status)!==1n||!addrEq(receipt.contractAddress,d.predictedAddress))throw Error("배포 영수증 또는 contractAddress가 승인값과 다릅니다.");
    const codes=await Promise.all(RPCS.map(u=>rpc(u,"eth_getCode",[d.predictedAddress,"latest"])));
    if(codes.some(c=>!c||c==="0x"))throw Error("배포 후 runtime code를 두 RPC 모두에서 확인하지 못했습니다.");
    const rows=evidence().filter(r=>r.order!==d.order);
    rows.push({order:d.order,label:d.label,nonce:d.deployerNonce,predictedAddress:d.predictedAddress,txHash:hash,blockNumber:receipt.blockNumber,status:"VERIFIED"});
    rows.sort((a,b)=>a.order-b.order);saveEvidence(rows);
    currentIndex++;
    setStatus(d.label+" 배포 및 영수증/runtime code 검증 성공. 다음 계약으로 진행할 수 있습니다.","ok");
    if(currentIndex<10){const n=await preflightNext();$("preflight").textContent="next nonce "+n.d.deployerNonce+"\nestimated gas "+n.maxGas+" / limit "+n.pf.approvedGasLimit+"\ngas price ceiling "+n.approvedGasPrice+" wei\nremaining max gas budget "+n.remaining+" wei"}
    else $("preflight").textContent="10/10 deployment verified. Market remains disabled.";
  }catch(e){setStatus(e.message||String(e),"error")}finally{busy=false;render()}
}
function render(){
  $("connect").disabled=busy;
  const ready=packet&&wallet&&currentIndex<10&&!busy;
  $("deploy").disabled=!ready;
  if(packet){
    const d=packet.packet.deployments[Math.min(currentIndex,9)];
    $("progress").textContent=currentIndex>=10?"10 / 10 완료":currentIndex+" / 10 완료 · 다음: "+d.label+" · nonce "+d.deployerNonce+" · "+d.predictedAddress;
  }
}
function init(){
  $("connect").onclick=connectAndCheck;$("deploy").onclick=deployNext;
  $("digest").textContent=PACKET_DIGEST;$("deployer").textContent=DEPLOYER;render()
}
init();
})();