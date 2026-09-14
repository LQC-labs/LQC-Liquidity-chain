(function () {
  "use strict";

  const CHAIN_ID = "0x61";
  const SIGNER = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
  const TLQC = "0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc";
  const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
  const POOL = "0x4bfbf746a675153e050f5fbc90eaa18d07014c95";
  const MANAGER = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
  const FEE = 2500n;
  const TLQC_AMOUNT = 500000000000000000000000n;
  const WBNB_AMOUNT = 500000000000000000n;
  const TLQC_MIN = 495000000000000000000000n;
  const WBNB_MIN = 495000000000000000n;
  const SQRT_PRICE_X96 = 79228162514264337593543950n;
  const TICK_LOWER = -887250n;
  const TICK_UPPER = 887250n;
  const FINAL_MINT_TX = "0x85de5d094f5713eeddefc67a67cf4986899f607495a63229ec41c2083b72b985";
  const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const APPROVE_TLQC_DATA = "0x095ea7b3000000000000000000000000427bf5b37357632377ecbec9de3626c71a5396c10000000000000000000000000000000000000000000069e10de76676d0800000";
  const APPROVE_WBNB_DATA = "0x095ea7b3000000000000000000000000427bf5b37357632377ecbec9de3626c71a5396c100000000000000000000000000000000000000000000000006f05b59d3b20000";
  const INITIALIZE_DATA = "0xf637731d0000000000000000000000000000000000000000004189374bc6a7ef9db22d0e";
  const ZERO = "0x0000000000000000000000000000000000000000";
  const buttons = ["wrap", "approveTlqc", "approveWbnb", "initialize", "mint"];
  const $ = (id) => document.getElementById(id);
  let account = null;
  let busy = false;
  let nextAction = null;

  function status(message, type = "info") {
    $("status").textContent = message;
    $("status").dataset.type = type;
  }

  async function request(method, params = []) {
    if (!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요.");
    return window.ethereum.request({ method, params });
  }

  function word(value) {
    return BigInt.asUintN(256, BigInt(value)).toString(16).padStart(64, "0");
  }

  function addressWord(address) {
    return address.toLowerCase().slice(2).padStart(64, "0");
  }

  function uintResult(data) {
    if (!data || data === "0x") throw new Error("계약 읽기 결과가 비어 있습니다.");
    return BigInt(data);
  }

  function addressResult(data) {
    if (!data || data.length < 66) throw new Error("주소 읽기 결과가 올바르지 않습니다.");
    return `0x${data.slice(-40)}`;
  }

  function callData(selector, words = []) {
    return `${selector}${words.join("")}`;
  }

  async function read(to, data) {
    return request("eth_call", [{ to, data }, "latest"]);
  }

  async function assertBase() {
    if ((await request("eth_chainId")).toLowerCase() !== CHAIN_ID) throw new Error("BSC Testnet(chain 97)이 아닙니다. 중단하세요.");
    for (const address of [TLQC, WBNB, POOL, MANAGER]) {
      const code = await request("eth_getCode", [address, "latest"]);
      if (!code || code === "0x") throw new Error(`필수 테스트넷 계약을 확인할 수 없습니다: ${address}`);
    }
    const [token0, token1, fee] = await Promise.all([
      read(POOL, "0x0dfe1681"), read(POOL, "0xd21220a7"), read(POOL, "0xddca3f43"),
    ]);
    if (addressResult(token0).toLowerCase() !== TLQC.toLowerCase() || addressResult(token1).toLowerCase() !== WBNB.toLowerCase() || uintResult(fee) !== FEE) {
      throw new Error("풀의 토큰 또는 수수료 구성이 확정값과 다릅니다. 중단하세요.");
    }
  }

  async function balanceOf(token) {
    return uintResult(await read(token, callData("0x70a08231", [addressWord(account)])));
  }

  async function allowance(token) {
    return uintResult(await read(token, callData("0xdd62ed3e", [addressWord(account), addressWord(MANAGER)])));
  }

  async function verifyFinalMint() {
    const [transaction, receipt] = await Promise.all([
      request("eth_getTransactionByHash", [FINAL_MINT_TX]),
      request("eth_getTransactionReceipt", [FINAL_MINT_TX]),
    ]);
    if (!transaction || !receipt || BigInt(receipt.status) !== 1n) throw new Error("최종 유동성 거래의 성공 영수증을 확인할 수 없습니다.");
    if (transaction.from.toLowerCase() !== SIGNER.toLowerCase() || transaction.to.toLowerCase() !== MANAGER.toLowerCase() || BigInt(transaction.value) !== 0n || !transaction.input.toLowerCase().startsWith("0x88316456")) {
      throw new Error("최종 유동성 거래 내용이 확정된 Signer·Position Manager·mint 호출과 다릅니다.");
    }
    const signerTopic = `0x${"0".repeat(24)}${SIGNER.toLowerCase().slice(2)}`;
    const transfer = receipt.logs.find((log) => log.address.toLowerCase() === MANAGER.toLowerCase()
      && log.topics?.length === 4 && log.topics[0].toLowerCase() === TRANSFER_TOPIC
      && BigInt(log.topics[1]) === 0n && log.topics[2].toLowerCase() === signerTopic);
    if (!transfer) throw new Error("Signer 1이 받은 LP 포지션 NFT 발행 기록을 찾지 못했습니다.");
    return BigInt(transfer.topics[3]).toString();
  }

  async function refresh() {
    nextAction = null;
    buttons.forEach((id) => { $(id).disabled = true; });
    await assertBase();
    const [native, tlqcBalance, wbnbBalance, tlqcAllowance, wbnbAllowance, slot0, liquidity] = await Promise.all([
      request("eth_getBalance", [account, "latest"]), balanceOf(TLQC), balanceOf(WBNB), allowance(TLQC), allowance(WBNB),
      read(POOL, "0x3850c7bd"), read(POOL, "0x1a686502"),
    ]);
    const sqrtPrice = uintResult(`0x${slot0.slice(2, 66)}`);
    const poolLiquidity = uintResult(liquidity);
    if (sqrtPrice !== 0n && sqrtPrice !== SQRT_PRICE_X96) throw new Error("풀이 다른 초기 가격으로 설정되어 있습니다. 모든 거래를 중단하세요.");
    if (tlqcAllowance > TLQC_AMOUNT || wbnbAllowance > WBNB_AMOUNT) throw new Error("기존 승인이 확정 수량보다 큽니다. 추가 거래를 중단하고 승인 상태를 점검하세요.");

    $("wrapState").textContent = wbnbBalance >= WBNB_AMOUNT ? "완료: WBNB 0.5개 이상 확인" : `대기: 현재 WBNB ${Number(wbnbBalance) / 1e18}개`;
    $("tlqcState").textContent = tlqcAllowance === TLQC_AMOUNT ? "완료: 정확히 500,000개 승인" : "대기: 미승인";
    $("wbnbState").textContent = wbnbAllowance === WBNB_AMOUNT ? "완료: 정확히 0.5개 승인" : "대기: 미승인";
    $("priceState").textContent = sqrtPrice === SQRT_PRICE_X96 ? "완료: 확정 초기 가격" : "대기: 가격 미설정";
    $("mintState").textContent = poolLiquidity > 0n ? `완료: 풀 유동성 ${poolLiquidity}` : "대기: 유동성 0";
    ["wrapState", "tlqcState", "wbnbState", "priceState", "mintState"].forEach((id) => {
      $(id).classList.toggle("done", $(id).textContent.startsWith("완료"));
    });

    if (poolLiquidity > 0n) {
      const tokenId = await verifyFinalMint();
      $("tx").textContent = FINAL_MINT_TX;
      $("result").textContent = `초기 유동성 공급 완료 · LP NFT Token ID ${tokenId}`;
      status("최종 검증 완료: 성공 거래, 풀 유동성, Signer 1의 LP 포지션 NFT를 모두 확인했습니다.", "ok");
      return;
    }
    if (busy) return;
    if (wbnbBalance < WBNB_AMOUNT) {
      if (BigInt(native) < WBNB_AMOUNT + 10000000000000000n) throw new Error("0.5 tBNB와 가스 예비분 0.01 tBNB가 필요합니다.");
      $("wrap").disabled = false;
      nextAction = "wrap";
      status("검증 완료. 2번에서 정확히 0.5 tBNB를 WBNB로 변환하세요.", "ok");
    } else if (tlqcBalance < TLQC_AMOUNT) {
      throw new Error("Signer 1의 tLQC가 500,000개보다 적습니다.");
    } else if (tlqcAllowance !== TLQC_AMOUNT) {
      $("approveTlqc").disabled = false;
      nextAction = "approveTlqc";
      status("WBNB 준비 완료. 3번 tLQC 정확 승인 단계입니다.", "ok");
    } else if (wbnbAllowance !== WBNB_AMOUNT) {
      $("approveWbnb").disabled = false;
      nextAction = "approveWbnb";
      status("tLQC 승인 완료. 4번 WBNB 정확 승인 단계입니다.", "ok");
    } else if (sqrtPrice === 0n) {
      $("initialize").disabled = false;
      nextAction = "initialize";
      status("두 토큰 승인 완료. 5번 초기 가격 설정 단계입니다. 이 가격은 변경하기 어렵습니다.", "ok");
    } else {
      $("mint").disabled = false;
      nextAction = "mint";
      status("초기 가격 확인 완료. 6번 전체 범위 유동성 공급 단계입니다.", "ok");
    }
  }

  async function waitForReceipt(hash) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const receipt = await request("eth_getTransactionReceipt", [hash]);
      if (receipt) return receipt;
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    throw new Error("확인이 지연되고 있습니다. 거래 해시를 보관하고 새 거래를 보내지 마세요.");
  }

  async function sendReviewed(actionId, label, transaction) {
    await refresh();
    if (nextAction !== actionId) throw new Error("현재 완료 상태와 맞지 않는 단계입니다. 활성화된 버튼만 누르세요.");
    await assertBase();
    const accounts = await request("eth_accounts");
    if (!accounts[0] || accounts[0].toLowerCase() !== SIGNER.toLowerCase() || accounts[0].toLowerCase() !== account.toLowerCase()) {
      throw new Error("연결 지갑이 변경되었습니다. Signer 1로 다시 연결하세요.");
    }
    busy = true;
    buttons.forEach((id) => { $(id).disabled = true; });
    const requestTx = { from: account, ...transaction };
    const gas = await request("eth_estimateGas", [requestTx]);
    status(`${label} 거래입니다. TokenPocket에서 받는 주소와 금액을 확인하세요.`);
    const hash = await request("eth_sendTransaction", [{ ...requestTx, gas }]);
    $("tx").textContent = hash;
    const receipt = await waitForReceipt(hash);
    if (BigInt(receipt.status) !== 1n) throw new Error(`${label} 거래가 실패했습니다.`);
    busy = false;
    await refresh();
  }

  function mintData() {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
    return callData("0x88316456", [
      addressWord(TLQC), addressWord(WBNB), word(FEE), word(TICK_LOWER), word(TICK_UPPER),
      word(TLQC_AMOUNT), word(WBNB_AMOUNT), word(TLQC_MIN), word(WBNB_MIN), addressWord(SIGNER), word(deadline),
    ]);
  }

  async function run(action) {
    try {
      await action();
    } catch (error) {
      busy = false;
      const message = error.message || String(error);
      try { if (account) await refresh(); } catch (_) { /* retain the actionable original error */ }
      status(message, "error");
    }
  }

  $("connect").addEventListener("click", () => run(async () => {
    status("네트워크, 지갑, 풀, 잔액과 승인 상태를 확인하고 있습니다…");
    await assertBase();
    const accounts = await request("eth_requestAccounts");
    if (!accounts[0] || accounts[0].toLowerCase() !== SIGNER.toLowerCase()) throw new Error("Signer 1 지갑(0x7cf2…C6aB)으로 연결해야 합니다.");
    account = accounts[0];
    $("wallet").textContent = account;
    await refresh();
  }));
  $("wrap").addEventListener("click", () => run(() => sendReviewed("wrap", "0.5 tBNB 래핑", { to: WBNB, value: `0x${WBNB_AMOUNT.toString(16)}`, data: "0xd0e30db0" })));
  $("approveTlqc").addEventListener("click", () => run(() => sendReviewed("approveTlqc", "tLQC 500,000개 정확 승인", { to: TLQC, value: "0x0", data: APPROVE_TLQC_DATA })));
  $("approveWbnb").addEventListener("click", () => run(() => sendReviewed("approveWbnb", "WBNB 0.5개 정확 승인", { to: WBNB, value: "0x0", data: APPROVE_WBNB_DATA })));
  $("initialize").addEventListener("click", () => run(() => sendReviewed("initialize", "초기 가격 설정", { to: POOL, value: "0x0", data: INITIALIZE_DATA })));
  $("mint").addEventListener("click", () => run(() => sendReviewed("mint", "전체 범위 유동성 공급", { to: MANAGER, value: "0x0", data: mintData() })));
  $("pool").textContent = POOL;
  $("manager").textContent = MANAGER;
})();
