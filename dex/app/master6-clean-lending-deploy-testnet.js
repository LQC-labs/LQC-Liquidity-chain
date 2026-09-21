(function(){"use strict";
const CHAIN_HEX="0x61";
const CHAIN_ID=97;
const DEPLOYER="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const PACKET_DIGEST="sha256:dc538396aff204b65e19430033d5d11520c17b10239f49876d1364559fc3d84f";
const SOURCE_COMMIT="0x87745b4bfb3ad49e73c14a8f62282986e72148bc";
const RPCS=["https://bsc-testnet-rpc.publicnode.com","https://data-seed-prebsc-1-s1.bnbchain.org:8545"];
const $=id=>document.getElementById(id);
let packet=null,busy=false,ready=false,nextIndex=-1;

function setStatus(message,type="info"){$("status").textContent=message;$("status").dataset.type=type}
function hex(n){return"0x"+BigInt(n).toString(16)}
function norm(v){return String(v||"").toLowerCase()}
async function wallet(method,params=[]){
  if(!window.ethereum?.request) throw Error("TokenPocket DApp 브라우저에서 이 페이지를 열어주세요.");
  return window.ethereum.request({method,params});
}
async function rpc(url,method,params=[]){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),20000);
  try{
    const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:c.signal,cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer"});
    if(!r.ok)throw Error("RPC HTTP "+r.status);
    const b=await r.json();
    if(b.error)throw Error(b.error.message||"RPC error");
    return b.result;
  }finally{clearTimeout(timer)}
}
async function sha256Hex(hexData){
  const bytes=new Uint8Array((hexData.slice(2).match(/.{1,2}/g)||[]).map(x=>parseInt(x,16)));
  const h=await crypto.subtle.digest("SHA-256",bytes);
  return"sha256:"+[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function loadPacket(){
  const r=await fetch("../deployments/master6-live-execution-packet-bsc-testnet-97.json",{cache:"no-store",credentials:"omit"});
  if(!r.ok)throw Error("6/12 Live Execution Packet을 읽지 못했습니다.");
  const p=await r.json();
  if(p.recordType!=="LQC_MASTER6_LIVE_EXECUTION_PACKET"||p.status!=="APPROVED_FOR_WALLET_CONFIRMATION")throw Error("Live packet 상태가 올바르지 않습니다.");
  if(p.network?.chainId!==CHAIN_ID||norm(p.deployer)!==norm(DEPLOYER)||p.sourceCommit!==SOURCE_COMMIT)throw Error("Live packet network/deployer/source binding 불일치");
  if(p.executionPacketDigest!==PACKET_DIGEST)throw Error("Live packet digest가 승인된 값과 다릅니다.");
  if(p.executionAuthorized!==true||p.activationAuthorized!==false||p.transactionOccurred!==false)throw Error("Live packet authorization boundary 불일치");
  if(p.packet?.startingNonce!=="17"||p.packet?.deployments?.length!==10||p.packet?.market?.enabled!==false)throw Error("Live packet deployment/market boundary 불일치");
  if(p.preflight?.deployments?.length!==10||p.preflight?.deployerNonce!=="17")throw Error("Live preflight binding 불일치");
  for(let i=0;i<10;i++){
    const d=p.packet.deployments[i],g=p.preflight.deployments[i];
    if(Number(d.order)!==i+1||d.deployerNonce!==String(17+i)||norm(d.predictedAddress)!==norm(g.predictedAddress)||d.contract!==g.contract)throw Error("Deployment order/gas binding 불일치 #"+(i+1));
    if(await sha256Hex(d.data)!==d.initCodeDigest)throw Error("Init code digest 불일치 #"+(i+1));
    if(BigInt(g.approvedGasLimit)<=0n)throw Error("Approved gas limit 불일치 #"+(i+1));
  }
  packet=p;
  $("digest").textContent=p.executionPacketDigest;
  $("deployer").textContent=DEPLOYER;
  $("source").textContent=SOURCE_COMMIT;
}
async function verifyWallet(){
  if((await wallet("eth_chainId")).toLowerCase()!==CHAIN_HEX)throw Error("BSC Testnet(chain 97)이 아닙니다.");
  const accounts=await wallet("eth_requestAccounts");
  if(!accounts?.[0]||norm(accounts[0])!==norm(DEPLOYER))throw Error("승인된 Futures/Lending 테스트넷 deployer 지갑으로 연결하세요.");
  $("wallet").textContent=accounts[0];
}
async function dualState(){
  const chainIds=await Promise.all(RPCS.map(u=>rpc(u,"eth_chainId")));
  if(chainIds.some(x=>Number(BigInt(x))!==CHAIN_ID))throw Error("RPC chainId 불일치");
  const pending=await Promise.all(RPCS.map(u=>rpc(u,"eth_getTransactionCount",[DEPLOYER,"pending"])));
  const nonces=pending.map(x=>Number(BigInt(x)));
  if(new Set(nonces).size!==1)throw Error("두 RPC pending nonce가 일치하지 않습니다.");

  const states=[];
  for(const d of packet.packet.deployments){
    const codes=await Promise.all(RPCS.map(u=>rpc(u,"eth_getCode",[d.predictedAddress,"latest"])));
    const occupied=codes.map(c=>!!c&&c!=="0x");
    if(occupied[0]!==occupied[1])throw Error("두 RPC bytecode 상태가 일치하지 않습니다: "+d.label);
    states.push(occupied[0]);
  }
  let completed=0,gap=false,seenEmpty=false;
  for(const occupied of states){
    if(!occupied)seenEmpty=true;
    else if(seenEmpty)gap=true;
    else completed++;
  }
  if(gap)throw Error("배포 주소 상태에 중간 공백이 있습니다. 수동 검토가 필요합니다.");
  if(completed===10){
    if(nonces[0]!==27)throw Error("10개 배포 완료 상태지만 deployer nonce가 27이 아닙니다.");
    return{completed,nonce:nonces[0],next:null,estimate:null};
  }
  const expectedNonce=17+completed;
  if(nonces[0]!==expectedNonce)throw Error("현재 pending nonce "+nonces[0]+"가 예상 nonce "+expectedNonce+"와 다릅니다. 새 Live Packet이 필요합니다.");

  const next=packet.packet.deployments[completed],gasRow=packet.preflight.deployments[completed];
  const estimates=await Promise.all(RPCS.map(u=>rpc(u,"eth_estimateGas",[{from:DEPLOYER,data:next.data,value:"0x0"}])));
  const gas=estimates.map(x=>BigInt(x));
  const maxGas=gas[0]>gas[1]?gas[0]:gas[1];
  if(maxGas>BigInt(gasRow.approvedGasLimit))throw Error("현재 gas estimate가 승인 gas limit를 초과했습니다.");

  const prices=await Promise.all(RPCS.map(u=>rpc(u,"eth_gasPrice")));
  const maxPrice=prices.map(x=>BigInt(x)).reduce((a,b)=>a>b?a:b);
  if(maxPrice>BigInt(packet.preflight.conservativeGasPrice))throw Error("현재 gas price가 승인된 보수적 gas price를 초과했습니다.");

  const balances=await Promise.all(RPCS.map(u=>rpc(u,"eth_getBalance",[DEPLOYER,"latest"])));
  if(balances.map(x=>BigInt(x)).some(b=>b<BigInt(packet.preflight.totalGasBudgetWei)))throw Error("Deployer 잔액이 승인된 전체 가스예산보다 부족합니다.");

  return{completed,nonce:nonces[0],next,gasRow,maxGas,maxPrice};
}
function renderState(s){
  $("progress").textContent=s.completed+"/10";
  if(s.completed===10){
    $("next").textContent="10개 Clean Deployment 완료";
    $("preflight").textContent="pending nonce 27 · 10개 예상주소 runtime code 확인";
    ready=false;nextIndex=-1;render();
    setStatus("10개 Clean Deployment가 모두 확인되었습니다. 재배포하지 마세요.","ok");
    return;
  }
  nextIndex=s.completed;
  $("next").textContent=(s.completed+1)+"/10 "+s.next.label+"\n"+s.next.predictedAddress+"\nnonce "+s.next.deployerNonce;
  $("preflight").textContent="pending nonce "+s.nonce+"\nestimated gas "+s.maxGas+" / limit "+s.gasRow.approvedGasLimit+"\ngas price "+s.maxPrice+" wei";
  ready=true;render();
  setStatus("읽기 전용 재검증 PASS. 다음 1건만 지갑 확인이 활성화되었습니다.","ok");
}
async function preflight(){
  try{
    busy=true;ready=false;render();
    await loadPacket();
    await verifyWallet();
    const s=await dualState();
    renderState(s);
  }catch(e){ready=false;setStatus(e.message||String(e),"error")}
  finally{busy=false;render()}
}
async function deployNext(){
  try{
    busy=true;ready=false;render();
    await loadPacket();
    await verifyWallet();
    const s=await dualState();
    if(!s.next)throw Error("이미 10개 배포가 완료되었습니다.");
    const d=s.next,g=s.gasRow;
    setStatus((s.completed+1)+"/10 "+d.label+" 배포 확인창을 요청합니다. value 0 tBNB.");
    const txHash=await wallet("eth_sendTransaction",[{
      from:DEPLOYER,
      value:"0x0",
      data:d.data,
      gas:hex(g.approvedGasLimit),
      gasPrice:hex(packet.preflight.conservativeGasPrice),
      nonce:hex(d.deployerNonce)
    }]);
    $("tx").textContent=txHash;
    let receipt=null;
    for(let i=0;i<90&&!receipt;i++){
      receipt=await wallet("eth_getTransactionReceipt",[txHash]);
      if(!receipt)await new Promise(r=>setTimeout(r,4000));
    }
    if(!receipt)throw Error("영수증 확인 지연. 같은 nonce로 재배포하지 말고 거래 해시를 보관하세요.");
    if(BigInt(receipt.status)!==1n)throw Error("배포 트랜잭션이 실패했습니다.");
    if(norm(receipt.contractAddress)!==norm(d.predictedAddress))throw Error("배포 주소가 승인된 predicted address와 다릅니다.");
    const codes=await Promise.all(RPCS.map(u=>rpc(u,"eth_getCode",[d.predictedAddress,"latest"])));
    if(codes.some(c=>!c||c==="0x"))throw Error("영수증은 성공했지만 runtime bytecode 확인이 아직 완료되지 않았습니다.");
    setStatus((s.completed+1)+"/10 "+d.label+" 배포 및 runtime code 확인 성공. 다음 배포 전에 다시 읽기 전용 검증을 실행합니다.","ok");
    await preflight();
  }catch(e){setStatus(e.message||String(e),"error")}
  finally{busy=false;render()}
}
function render(){
  $("connect").disabled=busy;
  $("deploy").disabled=busy||!ready;
}
function init(){
  $("digest").textContent=PACKET_DIGEST;
  $("deployer").textContent=DEPLOYER;
  $("source").textContent=SOURCE_COMMIT;
  $("connect").onclick=preflight;
  $("deploy").onclick=deployNext;
  render();
}
init();
})();