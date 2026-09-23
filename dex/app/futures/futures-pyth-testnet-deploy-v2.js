const ethers = window.ethers;
if (!ethers) {
  document.addEventListener("DOMContentLoaded",()=>{
    const el=document.getElementById("status");
    if(el) el.textContent="ethers 라이브러리 로딩 실패";
  });
  throw new Error("ETHERS_UMD_NOT_LOADED");
}

const EXPECTED_CHAIN_ID=97n;
const EXPECTED_DEPLOYER="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const PYTH_CORE="0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb";
const PRICE_ID="0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f";
const MAX_AGE=120;
const MAX_CONFIDENCE_BPS=500;

let provider,signer,account,artifacts;

const $=(id)=>document.getElementById(id);
const setStatus=(m)=>{$("status").textContent=m;};
const copy=async(text)=>{
 try{await navigator.clipboard.writeText(text);return true;}catch{}
 const ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.focus();ta.select();
 let ok=false;try{ok=document.execCommand("copy");}catch{}document.body.removeChild(ta);return ok;
};

async function loadArtifacts(){
 const r=await fetch("./futures-production-oracle-mobile-artifacts.json",{cache:"no-store"});
 const base=await r.json();
 const rp=await fetch("./futures-pyth-runtime-artifacts.json",{cache:"no-store"});
 const p=await rp.json();
 artifacts={...base.contracts,...p.contracts};
}

async function connect(){
 if(!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요.");
 provider=new ethers.BrowserProvider(window.ethereum);
 await provider.send("eth_requestAccounts",[]);
 signer=await provider.getSigner();
 account=await signer.getAddress();
 const net=await provider.getNetwork();
 if(net.chainId!==EXPECTED_CHAIN_ID) throw new Error("BSC Testnet(chainId 97)로 변경해주세요.");
 if(account.toLowerCase()!==EXPECTED_DEPLOYER.toLowerCase()) throw new Error("Deployer 지갑으로 연결해주세요: "+EXPECTED_DEPLOYER);
 $("account").textContent=account;
 setStatus("연결 완료 — 배포 가능 상태. Governance 활성화는 아직 금지.");
}

async function deployHelper(){
 if(!signer) throw new Error("먼저 지갑 연결");
 const a=artifacts.PythUpdateHelper;
 const f=new ethers.ContractFactory(a.abi,a.bytecode,signer);
 setStatus("Update Helper 배포 서명 대기...");
 const c=await f.deploy(PYTH_CORE);
 const tx=c.deploymentTransaction();
 $("helperTx").textContent=tx.hash;
 await tx.wait();
 $("helperAddr").textContent=await c.getAddress();
 setStatus("Update Helper 배포 완료. Reference 활성화는 아직 하지 마세요.");
}

async function deployAdapter(){
 if(!signer) throw new Error("먼저 지갑 연결");
 const a=artifacts.PythReference;
 const f=new ethers.ContractFactory(a.abi,a.bytecode,signer);
 setStatus("Pyth Reference Adapter 배포 서명 대기...");
 const c=await f.deploy(PYTH_CORE,PRICE_ID,MAX_AGE,MAX_CONFIDENCE_BPS);
 const tx=c.deploymentTransaction();
 $("adapterTx").textContent=tx.hash;
 await tx.wait();
 $("adapterAddr").textContent=await c.getAddress();
 setStatus("Reference Adapter 배포 완료. Governance referenceFeed 교체는 아직 금지.");
}

window.addEventListener("DOMContentLoaded",async()=>{
 $("buildVersion").textContent="8C-UMD-v2";
 setStatus("JS 로드 성공 — artifact 확인 중...");
 $("connect").onclick=()=>connect().catch(e=>setStatus(e.message));
 $("deployHelper").onclick=()=>deployHelper().catch(e=>setStatus(e.shortMessage||e.message));
 $("deployAdapter").onclick=()=>deployAdapter().catch(e=>setStatus(e.shortMessage||e.message));
 document.querySelectorAll("[data-copy]").forEach(b=>b.onclick=()=>copy($(b.dataset.copy).textContent));
 $("expected").textContent=EXPECTED_DEPLOYER;
 $("pyth").textContent=PYTH_CORE;
 $("priceId").textContent=PRICE_ID;
 try{
   await loadArtifacts();
   setStatus("준비됨 — TokenPocket 연결을 눌러주세요.");
 }catch(e){
   console.error(e);
   setStatus("배포 artifact 로딩 실패: "+(e.message||String(e)));
 }
});
