(function () {
  "use strict";
  const CHAIN_ID = "0x61";
  const SIGNER = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
  const BUNDLE_URL = "../deployments/router2-quote-stack-stage1-bsc-testnet-97.json";
  const STORAGE_KEY = "lqc-router2-registry-chain97-v1";
  const $ = id => document.getElementById(id); let account = null; let deployData = null;
  function status(message, type = "info") { $("status").textContent = message; $("status").dataset.type = type; }
  async function request(method, params = []) { if (!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요."); return window.ethereum.request({ method, params }); }
  function decodeAddress(data) { if (!data || data.length < 66) throw new Error("owner 읽기 실패"); return `0x${data.slice(-40)}`; }
  async function verifyRegistry(address) {
    const code = await request("eth_getCode", [address, "latest"]); if (!code || code === "0x") throw new Error("Registry 코드가 없습니다.");
    const owner = decodeAddress(await request("eth_call", [{ to: address, data: "0x8da5cb5b" }, "latest"]));
    if (owner.toLowerCase() !== SIGNER.toLowerCase()) throw new Error("Registry 관리자가 Signer 1과 다릅니다.");
  }
  async function existing() {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); if (!saved) return false;
    await verifyRegistry(saved.address); $("registry").textContent = saved.address; $("tx").textContent = saved.hash;
    status("Registry 배포와 Signer 1 관리자 확인 완료. 다시 배포하지 마세요.", "ok"); return true;
  }
  async function connect() {
    try {
      $("deploy").disabled = true; if ((await request("eth_chainId")).toLowerCase() !== CHAIN_ID) throw new Error("BSC Testnet(chain 97)이 아닙니다.");
      const accounts = await request("eth_requestAccounts"); if (!accounts[0] || accounts[0].toLowerCase() !== SIGNER.toLowerCase()) throw new Error("Signer 1 지갑으로 연결하세요.");
      account = accounts[0]; $("wallet").textContent = account; if (await existing()) return;
      const bundle = await (await fetch(BUNDLE_URL, { cache: "no-store" })).json();
      if (bundle.network.chainId !== 97 || bundle.signer.toLowerCase() !== SIGNER.toLowerCase() || bundle.orderedActions.length !== 2 || bundle.orderedActions[0].action !== "deploy-registry") throw new Error("배포 묶음 검증 실패");
      deployData = bundle.orderedActions[0].data;
      if (!/^0x[0-9a-f]+$/.test(deployData) || deployData.length !== 7644 || !deployData.endsWith(SIGNER.toLowerCase().slice(2))) throw new Error("Registry 생성자 데이터 검증 실패");
      $("deploy").disabled = false; status("검증 완료. Signer 1 관리자의 Registry 하나만 배포합니다.", "ok");
    } catch (error) { status(error.message || String(error), "error"); }
  }
  async function waitReceipt(hash) { for (let i=0;i<90;i+=1) { const r=await request("eth_getTransactionReceipt",[hash]); if(r)return r; await new Promise(x=>setTimeout(x,4000)); } throw new Error("확인 지연. 다시 배포하지 마세요."); }
  async function deploy() {
    try {
      $("deploy").disabled=true; if (!deployData) throw new Error("먼저 1번 검증을 하세요."); if (await existing()) return;
      const accounts=await request("eth_accounts"); if(!accounts[0]||accounts[0].toLowerCase()!==account.toLowerCase()) throw new Error("지갑이 변경되었습니다.");
      const tx={from:account,value:"0x0",data:deployData}; const gas=await request("eth_estimateGas",[tx]); status("Registry 단일 배포 거래입니다. 가스비를 확인하세요.");
      const hash=await request("eth_sendTransaction",[{...tx,gas}]); $("tx").textContent=hash; const receipt=await waitReceipt(hash);
      if(BigInt(receipt.status)!==1n||!receipt.contractAddress) throw new Error("Registry 배포 실패"); await verifyRegistry(receipt.contractAddress);
      localStorage.setItem(STORAGE_KEY,JSON.stringify({address:receipt.contractAddress,hash})); $("registry").textContent=receipt.contractAddress; status("Registry 배포 성공. Signer 1 관리자 확인 완료.","ok");
    } catch(error){status(error.message||String(error),"error");}
  }
  $("owner").textContent=SIGNER; $("connect").addEventListener("click",connect); $("deploy").addEventListener("click",deploy);
})();
