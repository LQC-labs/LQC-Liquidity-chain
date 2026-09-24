const ethers = window.ethers;
if (!ethers) throw new Error("ETHERS_UMD_NOT_LOADED");

const EXPECTED_CHAIN_ID=97n;
const EXPECTED_WALLET="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const HELPER="0xC9a880dC29037ac3139CdDA6C42cc5A55A744f35";
const ADAPTER="0xcbCc852873C98CDcEF37F07992BfA05C6Ae07e26";
const FEED_ID="0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f";
const HERMES="https://pyth.dourolabs.app/hermes/v2/updates/price/latest";

let provider,signer,account;
const $=id=>document.getElementById(id);
const setStatus=m=>{$("status").textContent=m;};

async function connect(){
 if(!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요.");
 provider=new ethers.BrowserProvider(window.ethereum);
 await provider.send("eth_requestAccounts",[]);
 signer=await provider.getSigner();
 account=await signer.getAddress();
 const net=await provider.getNetwork();
 if(net.chainId!==EXPECTED_CHAIN_ID) throw new Error("BSC Testnet(chainId 97)로 변경해주세요.");
 if(account.toLowerCase()!==EXPECTED_WALLET.toLowerCase()) throw new Error("Deployer 지갑을 사용해주세요: "+EXPECTED_WALLET);
 $("account").textContent=account;
 $("fetch").disabled=false;
 setStatus("지갑 연결 완료. API Key 입력 후 fresh payload 조회.");
}

async function fetchPayload(){
 const key=$("apiKey").value.trim();
 if(!key) throw new Error("Pyth API Key를 입력해주세요.");
 $("apiKey").value="";
 const url=HERMES+"?ids%5B%5D="+encodeURIComponent(FEED_ID);
 const r=await fetch(url,{headers:{accept:"application/json",authorization:"Bearer "+key},cache:"no-store"});
 if(!r.ok) throw new Error("Hermes HTTP "+r.status);
 const j=await r.json();
 const parsed=j.parsed?.[0]?.price;
 const binary=j.binary?.data;
 if(!parsed||!Array.isArray(binary)||binary.length===0) throw new Error("Hermes payload 형식이 예상과 다릅니다.");
 const updateData=binary.map(x=>"0x"+x.replace(/^0x/,""));
 window.__pythUpdateData=updateData;
 $("price").textContent=parsed.price;
 $("expo").textContent=parsed.expo;
 $("publishTime").textContent=parsed.publish_time;
 $("payloadCount").textContent=String(updateData.length);
 $("update").disabled=false;
 setStatus("fresh signed payload 조회 완료. 아직 온체인 업데이트 전.");
}

async function updatePyth(){
 if(!signer) throw new Error("먼저 지갑 연결");
 const updateData=window.__pythUpdateData;
 if(!Array.isArray(updateData)||updateData.length===0) throw new Error("먼저 fresh payload 조회");
 const helper=new ethers.Contract(HELPER,[
  "function pyth() view returns(address)",
  "function update(bytes[] updateData) payable returns(uint256 feePaid)"
 ],signer);
 const pythAddr=await helper.pyth();
 const pyth=new ethers.Contract(pythAddr,["function getUpdateFee(bytes[] updateData) view returns(uint256)"],provider);
 const fee=await pyth.getUpdateFee(updateData);
 $("fee").textContent=fee.toString();
 setStatus("Pyth update 트랜잭션 서명 대기...");
 const tx=await helper.update(updateData,{value:fee});
 $("tx").textContent=tx.hash;
 await tx.wait();
 setStatus("Pyth Core fresh update 완료. Reference Adapter 확인 중...");
 await verifyReference();
}

async function verifyReference(){
 const adapter=new ethers.Contract(ADAPTER,[
  "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)",
  "function maxAge() view returns(uint32)"
 ],provider);
 const r=await adapter.latestRoundData();
 $("answer").textContent=r[1].toString();
 $("updatedAt").textContent=r[3].toString();
 const latest=await provider.getBlock("latest");
 const age=BigInt(latest.timestamp)-BigInt(r[3]);
 $("age").textContent=age.toString();
 if(age>120n) throw new Error("Reference Adapter price still stale");
 setStatus("Reference Adapter fresh price 확인 성공. Governance 변경은 아직 금지.");
}

window.addEventListener("DOMContentLoaded",()=>{
 $("buildVersion").textContent="8E-v1";
 $("expected").textContent=EXPECTED_WALLET;
 $("helper").textContent=HELPER;
 $("adapter").textContent=ADAPTER;
 $("feed").textContent=FEED_ID;
 $("connect").onclick=()=>connect().catch(e=>setStatus(e.shortMessage||e.message));
 $("fetch").onclick=()=>fetchPayload().catch(e=>setStatus(e.shortMessage||e.message));
 $("update").onclick=()=>updatePyth().catch(e=>setStatus(e.shortMessage||e.message));
});
