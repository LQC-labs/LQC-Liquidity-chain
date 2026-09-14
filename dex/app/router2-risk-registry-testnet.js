(function () {
  "use strict";
  const CHAIN_ID = "0x61";
  const SIGNER = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
  const RISK_SAFE = "0x155a0c883eac0a408717222d1e271cb073e55e0b";
  const BUNDLE_URL = "../deployments/router2-execution-stack-stage1-bsc-testnet-97.json";
  const STORAGE_KEY = "lqc-router2-risk-registry-chain97-v1";
  const $ = id => document.getElementById(id);
  let account = null; let deployData = null;
  function status(message, type = "info") { $("status").textContent = message; $("status").dataset.type = type; }
  async function request(method, params = []) { if (!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요."); return window.ethereum.request({ method, params }); }
  function decodeAddress(data) { if (!data || data.length < 66) throw new Error("주소 읽기 실패"); return `0x${data.slice(-40)}`; }
  async function verifyRiskSafe() { const code = await request("eth_getCode", [RISK_SAFE, "latest"]); if (!code || code === "0x") throw new Error("등록된 Risk Safe 코드가 없습니다."); }
  async function verifyRiskRegistry(address) {
    const code = await request("eth_getCode", [address, "latest"]); if (!code || code === "0x") throw new Error("Risk Registry 코드가 없습니다.");
    const owner = decodeAddress(await request("eth_call", [{ to: address, data: "0x8da5cb5b" }, "latest"]));
    const riskAdmin = decodeAddress(await request("eth_call", [{ to: address, data: "0x83444e5f" }, "latest"]));
    if (owner.toLowerCase() !== SIGNER.toLowerCase()) throw new Error("Risk Registry 소유자가 Signer 1과 다릅니다.");
    if (riskAdmin.toLowerCase() !== RISK_SAFE.toLowerCase()) throw new Error("Risk Registry 관리자가 확정된 Risk Safe와 다릅니다.");
  }
  async function existing() {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); if (!saved) return false;
    await verifyRiskRegistry(saved.address); $("riskRegistry").textContent = saved.address; $("tx").textContent = saved.hash;
    status("Risk Registry 배포와 관리자 연결 확인 완료. 다시 배포하지 마세요.", "ok"); return true;
  }
  async function connect() {
    try {
      $("deploy").disabled = true; if ((await request("eth_chainId")).toLowerCase() !== CHAIN_ID) throw new Error("BSC Testnet(chain 97)이 아닙니다.");
      const accounts = await request("eth_requestAccounts"); if (!accounts[0] || accounts[0].toLowerCase() !== SIGNER.toLowerCase()) throw new Error("Signer 1 지갑으로 연결하세요.");
      account = accounts[0]; $("wallet").textContent = account; await verifyRiskSafe(); if (await existing()) return;
      const bundle = await (await fetch(BUNDLE_URL, { cache: "no-store" })).json(); const action = bundle.orderedActions[0];
      if (bundle.network.chainId !== 97 || bundle.signer.toLowerCase() !== SIGNER.toLowerCase() || bundle.dependencies.riskSafe.toLowerCase() !== RISK_SAFE.toLowerCase() || bundle.orderedActions.length !== 1 || action.action !== "deploy-risk-registry" || action.to !== null || action.value !== "0") throw new Error("Risk Registry 배포 묶음 검증 실패");
      deployData = action.data;
      const suffix = SIGNER.toLowerCase().slice(2).padStart(64, "0") + RISK_SAFE.toLowerCase().slice(2).padStart(64, "0");
      if (!/^0x[0-9a-f]+$/.test(deployData) || deployData.length !== 7656 || !deployData.endsWith(suffix)) throw new Error("Risk Registry 생성자 데이터 검증 실패");
      $("deploy").disabled = false; status("검증 완료. Signer 1 소유자와 Risk Safe 관리자의 Risk Registry 하나만 배포합니다.", "ok");
    } catch (error) { status(error.message || String(error), "error"); }
  }
  async function waitReceipt(hash) { for (let i = 0; i < 90; i += 1) { const receipt = await request("eth_getTransactionReceipt", [hash]); if (receipt) return receipt; await new Promise(resolve => setTimeout(resolve, 4000)); } throw new Error("확인이 지연됩니다. 다시 배포하지 마세요."); }
  async function deploy() {
    try {
      $("deploy").disabled = true; if (!deployData) throw new Error("먼저 1번 검증을 하세요."); if (await existing()) return;
      const accounts = await request("eth_accounts"); if (!accounts[0] || accounts[0].toLowerCase() !== account.toLowerCase()) throw new Error("연결 지갑이 변경되었습니다.");
      await verifyRiskSafe(); const tx = { from: account, value: "0x0", data: deployData }; const gas = await request("eth_estimateGas", [tx]);
      status("Risk Registry 단일 배포 거래입니다. TokenPocket에서 0 tBNB와 가스비를 확인하세요.");
      const hash = await request("eth_sendTransaction", [{ ...tx, gas }]); $("tx").textContent = hash; const receipt = await waitReceipt(hash);
      if (BigInt(receipt.status) !== 1n || !receipt.contractAddress) throw new Error("Risk Registry 배포 실패"); await verifyRiskRegistry(receipt.contractAddress);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ address: receipt.contractAddress, hash })); $("riskRegistry").textContent = receipt.contractAddress;
      status("Risk Registry 배포 성공. Signer 1 소유자와 Risk Safe 관리자를 온체인에서 확인했습니다.", "ok");
    } catch (error) { status(error.message || String(error), "error"); }
  }
  $("owner").textContent = SIGNER; $("riskSafe").textContent = RISK_SAFE; $("connect").addEventListener("click", connect); $("deploy").addEventListener("click", deploy);
})();
