(function () {
  "use strict";
  const CHAIN_ID = "0x61";
  const SIGNER = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
  const TLQC = "0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc";
  const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
  const POOL = "0x4bfbf746a675153e050f5fbc90eaa18d07014c95";
  const ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
  const POSITION_MANAGER = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
  const LP_TOKEN_ID = 37418n;
  const FORWARD_TX = "0xcdc26400dd1df9abc773ada2f5bd597009fffe209e933128f9f0906350ef3727";
  const REVERSE_TX = "0x09af1ce5db45ff9750f91b763d1229bf15f0c12d54d5886412a98df670f4772e";
  const $ = (id) => document.getElementById(id);

  function status(message, type = "info") { $("status").textContent = message; $("status").dataset.type = type; }
  async function request(method, params = []) {
    if (!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요.");
    return window.ethereum.request({ method, params });
  }
  function word(value) { return BigInt(value).toString(16).padStart(64, "0"); }
  function addressWord(address) { return address.toLowerCase().slice(2).padStart(64, "0"); }
  function uintResult(data) { if (!data || data === "0x") throw new Error("계약 읽기 결과가 비어 있습니다."); return BigInt(`0x${data.slice(2, 66)}`); }
  function addressResult(data) { if (!data || data.length < 66) throw new Error("주소 읽기 결과가 올바르지 않습니다."); return `0x${data.slice(-40)}`; }
  function format18(value, symbol) {
    const whole = value / 1000000000000000000n;
    const fraction = (value % 1000000000000000000n).toString().padStart(18, "0").replace(/0+$/, "");
    return `${whole}${fraction ? `.${fraction}` : ""} ${symbol}`;
  }
  async function read(to, data) { return request("eth_call", [{ to, data }, "latest"]); }
  async function balanceOf(token, owner) { return uintResult(await read(token, `0x70a08231${addressWord(owner)}`)); }
  async function allowance(token) { return uintResult(await read(token, `0xdd62ed3e${addressWord(SIGNER)}${addressWord(ROUTER)}`)); }
  async function receipt(hash, latestBlock) {
    const value = await request("eth_getTransactionReceipt", [hash]);
    if (!value || BigInt(value.status) !== 1n) throw new Error(`성공 영수증을 확인할 수 없습니다: ${hash}`);
    if (!value.to || value.to.toLowerCase() !== ROUTER.toLowerCase()) throw new Error(`교환 대상 Router가 다릅니다: ${hash}`);
    return { hash, confirmations: latestBlock - BigInt(value.blockNumber) + 1n };
  }

  async function verify() {
    $("verify").disabled = true;
    status("공개 블록체인 상태를 읽고 있습니다…");
    if ((await request("eth_chainId")).toLowerCase() !== CHAIN_ID) throw new Error("BSC Testnet(chain 97)이 아닙니다.");
    for (const address of [TLQC, WBNB, POOL, ROUTER, POSITION_MANAGER]) {
      const code = await request("eth_getCode", [address, "latest"]);
      if (!code || code === "0x") throw new Error(`계약 바이트코드가 없습니다: ${address}`);
    }
    const latestBlock = BigInt(await request("eth_blockNumber"));
    const [token0, token1, fee, liquidity, poolTlqc, poolWbnb, owner, tlqcAllowance, wbnbAllowance, forward, reverse] = await Promise.all([
      read(POOL, "0x0dfe1681"), read(POOL, "0xd21220a7"), read(POOL, "0xddca3f43"), read(POOL, "0x1a686502"),
      balanceOf(TLQC, POOL), balanceOf(WBNB, POOL), read(POSITION_MANAGER, `0x6352211e${word(LP_TOKEN_ID)}`),
      allowance(TLQC), allowance(WBNB), receipt(FORWARD_TX, latestBlock), receipt(REVERSE_TX, latestBlock),
    ]);
    if (addressResult(token0).toLowerCase() !== TLQC.toLowerCase() || addressResult(token1).toLowerCase() !== WBNB.toLowerCase() || uintResult(fee) !== 2500n) throw new Error("풀 토큰 또는 0.25% 수수료 설정이 다릅니다.");
    if (uintResult(liquidity) === 0n) throw new Error("풀 유동성이 0입니다.");
    if (addressResult(owner).toLowerCase() !== SIGNER.toLowerCase()) throw new Error("LP NFT 소유자가 Signer 1이 아닙니다.");
    if (tlqcAllowance !== 0n || wbnbAllowance !== 0n) throw new Error("Router에 사용 후 잔여 승인이 남아 있습니다.");
    $("nft").textContent = `Signer 1 소유 확인 (${SIGNER})`;
    $("liquidity").textContent = uintResult(liquidity).toString();
    $("poolTlqc").textContent = format18(poolTlqc, "tLQC");
    $("poolWbnb").textContent = format18(poolWbnb, "WBNB");
    $("allowances").textContent = "tLQC 0 · WBNB 0 (정상)";
    $("forward").textContent = `성공 · ${forward.confirmations} 확인 · ${forward.hash}`;
    $("reverse").textContent = `성공 · ${reverse.confirmations} 확인 · ${reverse.hash}`;
    status("최종 검증 완료: 풀, LP NFT, 두 교환 영수증과 잔여 승인이 모두 정상입니다.", "ok");
  }
  $("verify").addEventListener("click", async () => {
    try { await verify(); } catch (error) { status(error.message || String(error), "error"); $("verify").disabled = false; }
  });
  $("pool").textContent = POOL;
})();
