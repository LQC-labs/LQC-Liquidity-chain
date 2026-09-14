(function () {
  "use strict";
  const CHAIN_ID = "0x61";
  const SIGNER = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
  const ADAPTER = "0x1bffac4b93f48d5ea03bae36dbaee6bedd0a73d4";
  const REGISTRY = "0x0465c6460deaece522506e09cddc1b62d6d75c84";
  const VERIFIED_POOL = "0x4bfbf746a675153e050f5fbc90eaa18d07014c95";
  const DEX_ID = "52fe36cd57d2173b4f2a956d3118ad26d720aadec7531ff26bca3a2cc0ef68a7";
  const BUNDLE_URL = "../deployments/router2-quote-stack-config-bsc-testnet-97.json";
  const selectors = { owner: "0x8da5cb5b", fee: "0x8f5ded0d", poolKey: "0xa55c0e33", pools: "0x03a349d0", dex: "0x10c931a5" };
  const $ = id => document.getElementById(id);
  let account = null;
  let actions = null;

  function status(message, type = "info") { $("status").textContent = message; $("status").dataset.type = type; }
  async function request(method, params = []) { if (!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요."); return window.ethereum.request({ method, params }); }
  async function call(to, data) { return request("eth_call", [{ to, data }, "latest"]); }
  function pad(value) { return value.replace(/^0x/, "").padStart(64, "0"); }
  function boolResult(data) { return Boolean(data && data !== "0x" && BigInt(data)); }
  function addressWord(word) { return `0x${word.slice(-40)}`.toLowerCase(); }
  async function hasCode(address) { const code = await request("eth_getCode", [address, "latest"]); return Boolean(code && code !== "0x"); }
  async function waitReceipt(hash) { for (let i = 0; i < 90; i += 1) { const receipt = await request("eth_getTransactionReceipt", [hash]); if (receipt) return receipt; await new Promise(resolve => setTimeout(resolve, 4000)); } throw new Error("확인이 지연됩니다. 같은 버튼을 다시 누르지 마세요."); }

  async function verifyFixedContracts() {
    if (!await hasCode(ADAPTER) || !await hasCode(REGISTRY) || !await hasCode(VERIFIED_POOL)) throw new Error("배포 계약 또는 검증 풀이 BSC Testnet에서 확인되지 않습니다.");
    const [adapterOwner, registryOwner] = await Promise.all([call(ADAPTER, selectors.owner), call(REGISTRY, selectors.owner)]);
    if (addressWord(adapterOwner).toLowerCase() !== SIGNER.toLowerCase() || addressWord(registryOwner).toLowerCase() !== SIGNER.toLowerCase()) throw new Error("계약 관리자가 Signer 1과 다릅니다.");
  }

  async function readState() {
    const feeData = selectors.fee + pad("0x9c4");
    const poolKeyData = selectors.poolKey + pad("0x84a30a66cfcbb15453c83204b7e6ec436a0718fc") + pad("0xae13d989dac2f0debff460ac112a837c89baa7cd") + pad("0x9c4");
    const [feeRaw, poolKey] = await Promise.all([call(ADAPTER, feeData), call(ADAPTER, poolKeyData)]);
    const poolRaw = await call(ADAPTER, selectors.pools + pad(poolKey));
    let dexRaw = "0x";
    try { dexRaw = await call(REGISTRY, selectors.dex + DEX_ID); } catch (_) { /* DexNotFound means registration is still pending. */ }
    const words = (dexRaw || "0x").slice(2).match(/.{64}/g) || [];
    const registered = words.length >= 3 && addressWord(words[0]) === ADAPTER.toLowerCase() && BigInt(`0x${words[1]}`) === 1n && BigInt(`0x${words[2]}`) === 95n;
    return { fee: boolResult(feeRaw), pool: boolResult(poolRaw), registered };
  }

  function render(state) {
    $("feeState").textContent = state.fee ? "완료: 수수료 2500 허용 확인" : "대기: 수수료 2500 미허용";
    $("poolState").textContent = state.pool ? "완료: 검증 풀 허용 확인" : "대기: 검증 풀 미허용";
    $("registryState").textContent = state.registered ? "완료: PANCAKE_V3 등록 확인" : "대기: Registry 미등록";
    for (const id of ["feeState", "poolState", "registryState"]) $(id).classList.toggle("ok", $(id).textContent.startsWith("완료"));
    $("fee").disabled = state.fee;
    $("poolAllow").disabled = !state.fee || state.pool;
    $("register").disabled = !state.fee || !state.pool || state.registered;
    if (state.registered) status("세 설정이 모두 온체인에서 확인되었습니다. 버튼을 다시 누르지 마세요.", "ok");
    else if (state.pool) status("1·2단계 확인 완료. Registry 등록만 진행할 수 있습니다.", "ok");
    else if (state.fee) status("수수료 2500 확인 완료. 검증 풀 허용만 진행할 수 있습니다.", "ok");
    else status("검증 완료. 먼저 수수료 등급 2500 허용을 진행하세요.", "ok");
  }

  async function refresh() { const state = await readState(); render(state); return state; }
  async function connect() { try {
    for (const id of ["fee", "poolAllow", "register"]) $(id).disabled = true;
    if ((await request("eth_chainId")).toLowerCase() !== CHAIN_ID) throw new Error("BSC Testnet(chain 97)이 아닙니다.");
    const accounts = await request("eth_requestAccounts");
    if (!accounts[0] || accounts[0].toLowerCase() !== SIGNER.toLowerCase()) throw new Error("Signer 1 지갑으로 연결하세요.");
    account = accounts[0]; $("wallet").textContent = account;
    await verifyFixedContracts();
    const bundle = await (await fetch(BUNDLE_URL, { cache: "no-store" })).json();
    if (bundle.network.chainId !== 97 || bundle.signer.toLowerCase() !== SIGNER.toLowerCase() || bundle.executions.registry.address.toLowerCase() !== REGISTRY.toLowerCase() || bundle.executions.pancakeV3Adapter.address.toLowerCase() !== ADAPTER.toLowerCase()) throw new Error("설정 묶음의 배포 주소가 확정 기록과 다릅니다.");
    actions = bundle.orderedActions.slice(2, 5);
    if (actions.map(x => x.action).join(",") !== "allow-fee-2500,allow-verified-pool,register-v3-adapter" || actions.some(x => x.value !== "0")) throw new Error("설정 거래 순서 또는 전송 금액 검증 실패");
    if (actions[0].to.toLowerCase() !== ADAPTER.toLowerCase() || actions[1].to.toLowerCase() !== ADAPTER.toLowerCase() || actions[2].to.toLowerCase() !== REGISTRY.toLowerCase()) throw new Error("설정 거래 대상 주소 검증 실패");
    await refresh();
  } catch (error) { status(error.message || String(error), "error"); }
  }

  async function sendStep(index) { try {
    if (!actions || !account) throw new Error("먼저 1번 연결 및 검증을 하세요.");
    const accounts = await request("eth_accounts");
    if (!accounts[0] || accounts[0].toLowerCase() !== account.toLowerCase()) throw new Error("연결 지갑이 변경되었습니다.");
    const before = await refresh();
    const guards = [!before.fee, before.fee && !before.pool, before.fee && before.pool && !before.registered];
    if (!guards[index]) throw new Error("이 단계는 이미 완료됐거나 앞 단계가 완료되지 않았습니다.");
    for (const id of ["fee", "poolAllow", "register"]) $(id).disabled = true;
    const action = actions[index]; const tx = { from: account, to: action.to, value: "0x0", data: action.data };
    const gas = await request("eth_estimateGas", [tx]);
    status(`${index + 1}단계 설정 거래입니다. TokenPocket에서 받는 주소와 0 tBNB를 확인하세요.`);
    const hash = await request("eth_sendTransaction", [{ ...tx, gas }]); $("tx").textContent = hash;
    const receipt = await waitReceipt(hash); if (BigInt(receipt.status) !== 1n) throw new Error("설정 거래가 실패했습니다.");
    const after = await refresh(); const verified = [after.fee, after.pool, after.registered][index];
    if (!verified) throw new Error("거래는 확인됐지만 온체인 설정값 검증에 실패했습니다.");
  } catch (error) { status(error.message || String(error), "error"); try { if (account && actions) await refresh(); } catch (_) {} }
  }

  $("owner").textContent = SIGNER; $("adapter").textContent = ADAPTER; $("registry").textContent = REGISTRY; $("pool").textContent = VERIFIED_POOL;
  $("connect").addEventListener("click", connect); $("fee").addEventListener("click", () => sendStep(0)); $("poolAllow").addEventListener("click", () => sendStep(1)); $("register").addEventListener("click", () => sendStep(2));
})();
