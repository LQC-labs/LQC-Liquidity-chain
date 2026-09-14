(function () {
  "use strict";

  const CHAIN_ID = "0x61";
  const SIGNER = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
  const TLQC = "0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc";
  const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
  const POOL = "0x4bfbf746a675153e050f5fbc90eaa18d07014c95";
  const ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
  const QUOTER = "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2";
  const AMOUNT_IN = 1000000000000000000000n;
  const MIN_QUOTE = 980000000000000n;
  const MAX_QUOTE = 1000000000000000n;
  const APPROVE_DATA = "0x095ea7b30000000000000000000000001b81d678ffb9c0263b24a97847620c99d213eb1400000000000000000000000000000000000000000000003635c9adc5dea00000";
  const QUOTE_DATA = "0xc6a5026a00000000000000000000000084a30a66cfcbb15453c83204b7e6ec436a0718fc000000000000000000000000ae13d989dac2f0debff460ac112a837c89baa7cd00000000000000000000000000000000000000000000003635c9adc5dea0000000000000000000000000000000000000000000000000000000000000000009c40000000000000000000000000000000000000000000000000000000000000000";
  const STORAGE_KEY = "lqc-v3-smoke-swap-1000-v1";
  const $ = (id) => document.getElementById(id);
  let account = null;
  let liveQuote = 0n;
  let liveMinimum = 0n;
  let nextAction = null;
  let busy = false;

  function status(message, type = "info") { $("status").textContent = message; $("status").dataset.type = type; }
  async function request(method, params = []) {
    if (!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요.");
    return window.ethereum.request({ method, params });
  }
  function word(value) { return BigInt(value).toString(16).padStart(64, "0"); }
  function addressWord(address) { return address.toLowerCase().slice(2).padStart(64, "0"); }
  function callData(selector, words = []) { return `${selector}${words.join("")}`; }
  function uintResult(data) {
    if (!data || data === "0x") throw new Error("계약 읽기 결과가 비어 있습니다.");
    return BigInt(`0x${data.slice(2, 66)}`);
  }
  function addressResult(data) {
    if (!data || data.length < 66) throw new Error("주소 읽기 결과가 올바르지 않습니다.");
    return `0x${data.slice(-40)}`;
  }
  function formatWbnb(value) {
    const whole = value / 1000000000000000000n;
    const fraction = (value % 1000000000000000000n).toString().padStart(18, "0").replace(/0+$/, "");
    return `${whole}${fraction ? `.${fraction}` : ""} WBNB`;
  }
  async function read(to, data) { return request("eth_call", [{ to, data }, "latest"]); }
  async function balanceOf(token) { return uintResult(await read(token, callData("0x70a08231", [addressWord(account)]))); }
  async function allowance() { return uintResult(await read(TLQC, callData("0xdd62ed3e", [addressWord(account), addressWord(ROUTER)]))); }

  async function assertBase() {
    if ((await request("eth_chainId")).toLowerCase() !== CHAIN_ID) throw new Error("BSC Testnet(chain 97)이 아닙니다. 중단하세요.");
    for (const address of [TLQC, WBNB, POOL, ROUTER, QUOTER]) {
      const code = await request("eth_getCode", [address, "latest"]);
      if (!code || code === "0x") throw new Error(`필수 테스트넷 계약을 확인할 수 없습니다: ${address}`);
    }
    const [token0, token1, fee, liquidity] = await Promise.all([
      read(POOL, "0x0dfe1681"), read(POOL, "0xd21220a7"), read(POOL, "0xddca3f43"), read(POOL, "0x1a686502"),
    ]);
    if (addressResult(token0).toLowerCase() !== TLQC.toLowerCase() || addressResult(token1).toLowerCase() !== WBNB.toLowerCase() || uintResult(fee) !== 2500n) {
      throw new Error("풀의 토큰 또는 수수료가 확정값과 다릅니다.");
    }
    if (uintResult(liquidity) === 0n) throw new Error("풀 유동성이 0입니다. 교환을 중단하세요.");
  }

  async function refresh() {
    nextAction = null;
    $("approve").disabled = true;
    $("swap").disabled = true;
    await assertBase();
    const [tlqcBalance, wbnbBalance, approved, quoteData] = await Promise.all([
      balanceOf(TLQC), balanceOf(WBNB), allowance(), read(QUOTER, QUOTE_DATA),
    ]);
    if (tlqcBalance < AMOUNT_IN) throw new Error("Signer 1의 tLQC가 1,000개보다 적습니다.");
    if (approved > AMOUNT_IN) throw new Error("기존 Router 승인이 1,000개보다 큽니다. 추가 거래를 중단하세요.");
    liveQuote = uintResult(quoteData);
    if (liveQuote < MIN_QUOTE || liveQuote > MAX_QUOTE) throw new Error("공식 Quoter 견적이 검토 범위(0.00098~0.001 WBNB)를 벗어났습니다.");
    liveMinimum = liveQuote * 99n / 100n;
    $("quote").textContent = formatWbnb(liveQuote);
    $("minimum").textContent = formatWbnb(liveMinimum);
    $("approveState").textContent = approved === AMOUNT_IN ? "완료: 정확히 1,000 tLQC 승인" : "대기: 미승인";

    const savedHash = localStorage.getItem(STORAGE_KEY);
    if (savedHash || wbnbBalance >= MIN_QUOTE) {
      $("tx").textContent = savedHash || "지갑에서 기존 교환 결과 확인 필요";
      $("result").textContent = `소액 교환 완료 · 현재 WBNB ${formatWbnb(wbnbBalance)}`;
      status("소액 교환 완료 상태입니다. 중복 교환을 차단했습니다.", "ok");
      return;
    }
    if (busy) return;
    if (approved !== AMOUNT_IN) {
      nextAction = "approve";
      $("approve").disabled = false;
      status("견적 검증 완료. 2번에서 정확히 1,000 tLQC만 승인하세요.", "ok");
    } else {
      nextAction = "swap";
      $("swap").disabled = false;
      status("정확 승인과 최신 견적 확인 완료. 3번 소액 교환 단계입니다.", "ok");
    }
  }

  async function waitForReceipt(hash) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const receipt = await request("eth_getTransactionReceipt", [hash]);
      if (receipt) return receipt;
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    throw new Error("확인이 지연되고 있습니다. 거래 해시를 보관하고 다시 보내지 마세요.");
  }

  function swapData() {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    return callData("0x414bf389", [addressWord(TLQC), addressWord(WBNB), word(2500), addressWord(SIGNER), word(deadline), word(AMOUNT_IN), word(liveMinimum), word(0)]);
  }

  async function sendReviewed(actionId, label, transaction) {
    await refresh();
    if (nextAction !== actionId) throw new Error("현재 상태와 맞지 않는 단계입니다. 활성화된 버튼만 누르세요.");
    const accounts = await request("eth_accounts");
    if (!accounts[0] || accounts[0].toLowerCase() !== SIGNER.toLowerCase() || accounts[0].toLowerCase() !== account.toLowerCase()) throw new Error("연결 지갑이 변경되었습니다.");
    const beforeWbnb = await balanceOf(WBNB);
    busy = true; $("approve").disabled = true; $("swap").disabled = true;
    const reviewedTransaction = typeof transaction === "function" ? transaction() : transaction;
    const tx = { from: account, ...reviewedTransaction };
    const gas = await request("eth_estimateGas", [tx]);
    status(`${label} 거래입니다. TokenPocket에서 주소와 수량을 확인하세요.`);
    const hash = await request("eth_sendTransaction", [{ ...tx, gas }]);
    $("tx").textContent = hash;
    const receipt = await waitForReceipt(hash);
    if (BigInt(receipt.status) !== 1n) throw new Error(`${label} 거래가 실패했습니다.`);
    if (actionId === "swap") {
      const received = (await balanceOf(WBNB)) - beforeWbnb;
      if (received < liveMinimum) throw new Error("성공 영수증은 있으나 실제 WBNB 증가량이 최소수령량보다 적습니다.");
      localStorage.setItem(STORAGE_KEY, hash);
    }
    busy = false;
    await refresh();
  }

  async function run(action) {
    try { await action(); }
    catch (error) {
      busy = false; const message = error.message || String(error);
      try { if (account) await refresh(); } catch (_) { /* preserve the original actionable error */ }
      status(message, "error");
    }
  }

  $("connect").addEventListener("click", () => run(async () => {
    status("네트워크, Signer 1, 풀 유동성과 공식 Quoter를 확인하고 있습니다…");
    await assertBase();
    const accounts = await request("eth_requestAccounts");
    if (!accounts[0] || accounts[0].toLowerCase() !== SIGNER.toLowerCase()) throw new Error("Signer 1 지갑(0x7cf2…C6aB)으로 연결해야 합니다.");
    account = accounts[0]; $("wallet").textContent = account; await refresh();
  }));
  $("approve").addEventListener("click", () => run(() => sendReviewed("approve", "tLQC 1,000개 정확 승인", { to: TLQC, value: "0x0", data: APPROVE_DATA })));
  $("swap").addEventListener("click", () => run(() => sendReviewed("swap", "tLQC→WBNB 소액 교환", () => ({ to: ROUTER, value: "0x0", data: swapData() }))));
  $("pool").textContent = POOL; $("router").textContent = ROUTER; $("quoter").textContent = QUOTER;
})();
