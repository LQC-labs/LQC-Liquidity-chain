const {ethers}=window;
const OWNER="0x89d992f696B40ABbDB6610144faeF336911D8175";
const PRIMARY="0x2582c3156e42df6115c020fb8006b3949c93c1a9";
const INDEX="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const FEED="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
const TWAP="0x5AE96E36356AC18728804577E926B4b362017c0d";
const HEARTBEAT=3600;
const DEVIATION=500;
const abi=[
 "function owner() view returns(address)",
 "function setFeed(address indexToken,address feed,uint32 heartbeat)",
 "function setCircuitBreaker(address indexToken,address referenceFeed,uint16 maxDeviationBps)",
 "function getPrice(address indexToken) view returns(uint256,uint256)",
 "function feeds(address indexToken) view returns(address)",
 "function feedConfigs(address indexToken) view returns(address feed,uint32 heartbeat,address referenceFeed,uint16 maxDeviationBps)"
];
const aggAbi=["function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"];
let provider,signer,contract,account,feedDone=false,cbDone=false;
for(const [id,val] of [["owner",OWNER],["primary",PRIMARY],["index",INDEX],["feed",FEED],["twap",TWAP]])document.getElementById(id).textContent=val;
const status=(m,t="")=>{const e=document.getElementById("status");e.textContent=m;e.dataset.type=t};
async function copy(v,b){let ok=false;try{await navigator.clipboard.writeText(v);ok=true}catch{}if(!ok){const ta=document.createElement("textarea");ta.value=v;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{ok=document.execCommand("copy")}catch{}ta.remove()}const old=b.textContent;b.textContent=ok?"복사됨":"길게 눌러 복사";setTimeout(()=>b.textContent=old,1200)}
document.addEventListener("click",e=>{const b=e.target.closest("[data-copy]");if(b)copy(document.getElementById(b.dataset.copy).textContent,b)});
async function ensureChainOwner(){
 if(!window.ethereum)throw new Error("TokenPocket DApp 브라우저에서 여세요.");
 provider=new ethers.BrowserProvider(window.ethereum);
 const net=await provider.getNetwork();if(net.chainId!==97n)throw new Error("BSC Testnet(chainId 97)로 변경하세요.");
 signer=await provider.getSigner();account=await signer.getAddress();
 document.getElementById("wallet").textContent=account;
 if(ethers.getAddress(account)!==ethers.getAddress(OWNER))throw new Error("Governance Owner 지갑이 아닙니다.");
 contract=new ethers.Contract(PRIMARY,abi,signer);
 const onchainOwner=await contract.owner();
 if(ethers.getAddress(onchainOwner)!==ethers.getAddress(OWNER))throw new Error("Primary Adapter owner 불일치.");
}
document.getElementById("connect").onclick=async()=>{
 try{
  status("읽기 검증 중...");
  await ensureChainOwner();
  const primaryFeed=new ethers.Contract(FEED,aggAbi,provider);
  const twap=new ethers.Contract(TWAP,aggAbi,provider);
  const [p,t,current]=await Promise.all([primaryFeed.latestRoundData(),twap.latestRoundData(),contract.feedConfigs(INDEX)]);
  if(BigInt(p[1])<=0n||BigInt(t[1])<=0n)throw new Error("Oracle price가 0 이하입니다.");
  const currentFeed=ethers.getAddress(current[0]);
  const currentHeartbeat=Number(current[1]);
  const currentReference=ethers.getAddress(current[2]);
  const currentDeviation=Number(current[3]);
  feedDone=currentFeed===ethers.getAddress(FEED)&&currentHeartbeat===HEARTBEAT;
  cbDone=feedDone&&currentReference===ethers.getAddress(TWAP)&&currentDeviation===DEVIATION;
  document.getElementById("preflight").textContent=JSON.stringify({chainId:97,owner:account,primaryAnswer:p[1].toString(),twapAnswer:t[1].toString(),twapUpdatedAt:t[3].toString(),currentFeed,currentHeartbeat,currentReference,currentDeviation,feedDone,cbDone},null,2);
  if(feedDone){
    document.getElementById("setFeed").textContent="2. setFeed 완료";
    document.getElementById("setFeed").disabled=true;
    document.getElementById("setCb").disabled=cbDone;
    if(cbDone) document.getElementById("setCb").textContent="3. setCircuitBreaker 완료";
    status(cbDone?"Governance Oracle 설정이 이미 완료되어 있습니다.":"setFeed 온체인 완료 확인. 이제 setCircuitBreaker만 실행하세요.","ok");
  }else{
    document.getElementById("setFeed").disabled=false;
    document.getElementById("setCb").disabled=true;
    status("Preflight PASS. setFeed만 먼저 실행하세요.","ok");
  }
 }catch(e){status(e.shortMessage||e.message||String(e),"error")}
};
document.getElementById("setFeed").onclick=async()=>{
 try{
  if(feedDone)return;
  await ensureChainOwner();
  const b=document.getElementById("setFeed");b.disabled=true;status("setFeed 승인 대기...");
  const tx=await contract.setFeed(INDEX,FEED,HEARTBEAT);
  status("setFeed 채굴 대기...\n"+tx.hash);
  const r=await tx.wait();if(r.status!==1)throw new Error("setFeed 실패");
  const f=await contract.feedConfigs(INDEX);
  if(ethers.getAddress(f[0])!==ethers.getAddress(FEED)||Number(f[1])!==HEARTBEAT)throw new Error("setFeed post-state 불일치");
  feedDone=true;b.textContent="2. setFeed 완료";document.getElementById("setCb").disabled=false;
  document.getElementById("txs").textContent="setFeed: "+tx.hash;
  status("setFeed 완료. 이제 setCircuitBreaker를 실행할 수 있습니다.","ok");
 }catch(e){document.getElementById("setFeed").disabled=false;status(e.shortMessage||e.message||String(e),"error")}
};
document.getElementById("setCb").onclick=async()=>{
 try{
  if(cbDone||!feedDone)return;
  await ensureChainOwner();
  const b=document.getElementById("setCb");b.disabled=true;status("setCircuitBreaker 승인 대기...");
  const tx=await contract.setCircuitBreaker(INDEX,TWAP,DEVIATION);
  status("setCircuitBreaker 채굴 대기...\n"+tx.hash);
  const r=await tx.wait();if(r.status!==1)throw new Error("setCircuitBreaker 실패");
  const cfg=await contract.feedConfigs(INDEX);
  if(ethers.getAddress(cfg[2])!==ethers.getAddress(TWAP)||Number(cfg[3])!==DEVIATION)throw new Error("setCircuitBreaker post-state 불일치");
  cbDone=true;b.textContent="3. setCircuitBreaker 완료";
  document.getElementById("txs").textContent+="\nsetCircuitBreaker: "+tx.hash;
  status("Governance Oracle 설정 완료. 다음은 독립 read-only 검증 단계입니다.","ok");
 }catch(e){document.getElementById("setCb").disabled=false;status(e.shortMessage||e.message||String(e),"error")}
};