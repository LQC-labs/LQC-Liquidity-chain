(function () {
  "use strict";
  const CHAIN = "0x61", SIGNER = "0x7cf23bb16ed0e1eaf58cd31c9f5a643be438c6ab";
  const REGISTRY = "0x0465c6460deaece522506e09cddc1b62d6d75c84", RISK = "0xe10a1d467a553900cb4d1755e079b35b0cd0c48b";
  const V3_ADAPTER = "0x823025d02c7619967b3e3880e3f6bc324a2c56d4", V3_QUOTER = "0xbc203d7f83677c7ed3f7acec959963e7f4ecc5c2", FLOW_ADAPTER = "0x14db750acf95b469aba3e74032e6db61087ef4cd";
  const TLQC = "0x84a30a66cfcbb15453c83204b7e6ec436a0718fc", WBNB = "0xae13d989dac2f0debff460ac112a837c89baa7cd";
  const V3_ID = "0x52fe36cd57d2173b4f2a956d3118ad26d720aadec7531ff26bca3a2cc0ef68a7", FLOW_ID = "0x7d3375921fc0a5becb9b20cbfdcf03440befc5113d864e8522b8465ca68b8014";
  const AMOUNT = 10n * 10n ** 18n, MAX_DAY = 10000n * 10n ** 18n, KEY = "lqc-router2-best-route-preflight-chain97-v2";
  const $ = id => document.getElementById(id), word = n => BigInt(n).toString(16).padStart(64, "0"), addressWord = a => a.slice(2).toLowerCase().padStart(64, "0");
  const dynamic = data => word(data.length / 2) + data.padEnd(Math.ceil(data.length / 64) * 64, "0");
  const format = value => (Number(value) / 1e18).toFixed(12);
  async function request(method, params = []) { if (!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 여세요."); return window.ethereum.request({ method, params }); }
  async function call(to, data) { return request("eth_call", [{ to, data }, "latest"]); }
  function status(message, type = "info") { $("status").textContent = message; $("status").dataset.type = type; }
  function flowQuoteData(path) { return `0x4e0143cc${addressWord(TLQC)}${addressWord(WBNB)}${word(AMOUNT)}${word(128)}${dynamic(path.slice(2))}`; }
  function v3QuoteData(path) { return `0xcdca1753${word(64)}${word(AMOUNT)}${dynamic(path.slice(2))}`; }

  $("verify").onclick = async () => {
    try {
      if ((await request("eth_chainId")).toLowerCase() !== CHAIN) throw new Error("BSC Testnet(chain 97)이 아닙니다.");
      const account = ((await request("eth_requestAccounts"))[0] || "").toLowerCase();
      if (account !== SIGNER) throw new Error("Signer 1 지갑으로 연결하세요.");
      if (BigInt(await call(REGISTRY, "0xab304695")) !== 2n) throw new Error("Registry 경로 수가 2개가 아닙니다.");
      const ids = [await call(REGISTRY, `0x6d478567${word(0)}`), await call(REGISTRY, `0x6d478567${word(1)}`)].map(x => x.toLowerCase());
      if (ids[0] !== V3_ID || ids[1] !== FLOW_ID) throw new Error("Registry 경로 순서가 검토값과 다릅니다.");
      for (const [id, adapter] of [[V3_ID, V3_ADAPTER], [FLOW_ID, FLOW_ADAPTER]]) {
        const dex = (await call(REGISTRY, `0x10c931a5${id.slice(2)}`)).slice(2).match(/.{64}/g) || [];
        if ((`0x${dex[0].slice(-40)}`).toLowerCase() !== adapter || BigInt(`0x${dex[1]}`) !== 1n || BigInt(await call(adapter, "0x721717c0")) !== 1n) throw new Error("등록된 실행 Adapter 상태가 다릅니다.");
      }
      if (BigInt(await call(RISK, "0x0815fed0")) !== 0n) throw new Error("Router 실행이 일시중지 상태입니다.");
      const usage = (await call(RISK, `0x70c29314${addressWord(TLQC)}`)).slice(2).match(/.{64}/g) || [];
      const today = BigInt(Math.floor(Date.now() / 86400000)), used = BigInt(`0x${usage[0]}`) === today ? BigInt(`0x${usage[1]}`) : 0n;
      if (MAX_DAY - used < AMOUNT) throw new Error("남은 일일 한도가 10 tLQC보다 적습니다.");
      const v3Path = `0x${TLQC.slice(2)}0009c4${WBNB.slice(2)}`;
      const flowPath = `0x${word(32)}${word(2)}${addressWord(TLQC)}${addressWord(WBNB)}`;
      const [v3Raw, flowRaw, block] = await Promise.all([
        call(V3_QUOTER, v3QuoteData(v3Path)),
        call(FLOW_ADAPTER, flowQuoteData(flowPath)),
        request("eth_blockNumber"),
      ]);
      const v3 = BigInt(`0x${v3Raw.slice(2, 66)}`), flow = BigInt(flowRaw);
      if (v3 <= 0n || flow <= 0n || v3 === flow) throw new Error("고유한 양수 최적 후보를 결정하지 못했습니다.");
      const best = flow > v3 ? "LQC_FLOW" : "PANCAKE_V3", output = flow > v3 ? flow : v3, minimum = output * 99n / 100n;
      $("v3").textContent = `${format(v3)} WBNB`; $("flow").textContent = `${format(flow)} WBNB`; $("best").textContent = best;
      $("minimum").textContent = `${format(minimum)} WBNB (99%)`; $("block").textContent = BigInt(block).toString();
      localStorage.setItem(KEY, JSON.stringify({ mode: "OFFCHAIN_PROOF_PREFLIGHT", block, best, v3: v3.toString(), flow: flow.toString(), minimum: minimum.toString(), at: Date.now() }));
      status("사전검증 통과. 공식 V3 Quoter와 LQC Flow의 견적을 비교해 Best Execution Proof 후보를 고정했습니다. 거래는 발생하지 않았습니다.", "ok");
    } catch (error) { status(error.message || String(error), "error"); }
  };
})();
