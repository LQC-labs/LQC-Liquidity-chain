(function () {
  "use strict";
  const CHAIN_ID = "0x61";
  const SIGNER = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
  const DEX_REGISTRY = "0x0465c6460deaece522506e09cddc1b62d6d75c84";
  const RISK_REGISTRY = "0xe10a1d467a553900cb4d1755e079b35b0cd0c48b";
  const RISK_SAFE = "0x155a0c883eac0a408717222d1e271cb073e55e0b";
  const BUNDLE_URL = "../deployments/router2-execution-stack-stage2-bsc-testnet-97.json";
  const STORAGE_KEY = "lqc-router2-execution-router-chain97-v1";
  const $ = id => document.getElementById(id); let account = null; let deployData = null;
  function status(message, type = "info") { $("status").textContent = message; $("status").dataset.type = type; }
  async function request(method, params = []) { if (!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요."); return window.ethereum.request({ method, params }); }
  function decodeAddress(data) { if (!data || data.length < 66) throw new Error("주소 읽기 실패"); return `0x${data.slice(-40)}`; }
  async function call(to, data) { return request("eth_call", [{ to, data }, "latest"]); }
  async function verifyPrerequisites() {
    for (const address of [DEX_REGISTRY, RISK_REGISTRY, RISK_SAFE]) { const code = await request("eth_getCode", [address, "latest"]); if (!code || code === "0x") throw new Error("선행 Registry 또는 Risk Safe 코드가 없습니다."); }
    const owner = decodeAddress(await call(RISK_REGISTRY, "0x8da5cb5b")); const riskAdmin = decodeAddress(await call(RISK_REGISTRY, "0x83444e5f"));
    if (owner.toLowerCase() !== SIGNER.toLowerCase() || riskAdmin.toLowerCase() !== RISK_SAFE.toLowerCase()) throw new Error("Risk Registry 역할 연결이 확정값과 다릅니다.");
  }
  async function verifyExecutionRouter(address) {
    const code = await request("eth_getCode", [address, "latest"]); if (!code || code === "0x") throw new Error("Execution Router 코드가 없습니다.");
    const dex = decodeAddress(await call(address, "0x7b103999")); const risk = decodeAddress(await call(address, "0x1c3f5b9e"));
    if (dex.toLowerCase() !== DEX_REGISTRY.toLowerCase() || risk.toLowerCase() !== RISK_REGISTRY.toLowerCase()) throw new Error("Execution Router의 Registry 연결이 확정값과 다릅니다.");
  }
  async function existing() { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); if (!saved) return false; await verifyExecutionRouter(saved.address); $("executionRouter").textContent = saved.address; $("tx").textContent = saved.hash; status("Execution Router 배포와 두 Registry 연결 확인 완료. 다시 배포하지 마세요.", "ok"); return true; }
  async function connect() {
    try {
      $("deploy").disabled = true; if ((await request("eth_chainId")).toLowerCase() !== CHAIN_ID) throw new Error("BSC Testnet(chain 97)이 아닙니다.");
      const accounts = await request("eth_requestAccounts"); if (!accounts[0] || accounts[0].toLowerCase() !== SIGNER.toLowerCase()) throw new Error("Signer 1 지갑으로 연결하세요."); account = accounts[0]; $("wallet").textContent = account;
      await verifyPrerequisites(); if (await existing()) return; const bundle = await (await fetch(BUNDLE_URL, { cache: "no-store" })).json(); const action = bundle.orderedActions[1];
      if (bundle.network.chainId !== 97 || bundle.signer.toLowerCase() !== SIGNER.toLowerCase() || bundle.executions.riskRegistry.status !== "success" || bundle.executions.riskRegistry.address.toLowerCase() !== RISK_REGISTRY.toLowerCase() || action.action !== "deploy-execution-router" || action.to !== null || action.value !== "0") throw new Error("Execution Router 배포 묶음 검증 실패");
      deployData = action.data; const suffix = DEX_REGISTRY.slice(2).padStart(64, "0") + RISK_REGISTRY.slice(2).padStart(64, "0");
      if (!/^0x[0-9a-f]+$/.test(deployData) || deployData.length !== 10518 || !deployData.endsWith(suffix)) throw new Error("Execution Router 생성자 데이터 검증 실패");
      $("deploy").disabled = false; status("검증 완료. 확정된 DEX Registry와 Risk Registry를 연결한 Execution Router 하나만 배포합니다.", "ok");
    } catch (error) { status(error.message || String(error), "error"); }
  }
  async function waitReceipt(hash) { for (let i = 0; i < 90; i += 1) { const receipt = await request("eth_getTransactionReceipt", [hash]); if (receipt) return receipt; await new Promise(resolve => setTimeout(resolve, 4000)); } throw new Error("확인이 지연됩니다. 다시 배포하지 마세요."); }
  async function deploy() {
    try {
      $("deploy").disabled = true; if (!deployData) throw new Error("먼저 1번 검증을 하세요."); if (await existing()) return; const accounts = await request("eth_accounts"); if (!accounts[0] || accounts[0].toLowerCase() !== account.toLowerCase()) throw new Error("연결 지갑이 변경되었습니다.");
      await verifyPrerequisites(); const tx = { from: account, value: "0x0", data: deployData }; const gas = await request("eth_estimateGas", [tx]); status("Execution Router 단일 배포 거래입니다. TokenPocket에서 0 tBNB와 가스비를 확인하세요.");
      const hash = await request("eth_sendTransaction", [{ ...tx, gas }]); $("tx").textContent = hash; const receipt = await waitReceipt(hash); if (BigInt(receipt.status) !== 1n || !receipt.contractAddress) throw new Error("Execution Router 배포 실패");
      await verifyExecutionRouter(receipt.contractAddress); localStorage.setItem(STORAGE_KEY, JSON.stringify({ address: receipt.contractAddress, hash })); $("executionRouter").textContent = receipt.contractAddress; status("Execution Router 배포 성공. 두 Registry 연결을 온체인에서 확인했습니다.", "ok");
    } catch (error) { status(error.message || String(error), "error"); }
  }
  $("dexRegistry").textContent = DEX_REGISTRY; $("riskRegistry").textContent = RISK_REGISTRY; $("connect").addEventListener("click", connect); $("deploy").addEventListener("click", deploy);
})();
