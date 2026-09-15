(function () {
  "use strict";
  const CHAIN = "0x61", SIGNER = "0x7cf23bb16ed0e1eaf58cd31c9f5a643be438c6ab";
  const ROUTER = "0x2e0a7f59ca65ed36977add5e71b8b64ba38d939f", TLQC = "0x84a30a66cfcbb15453c83204b7e6ec436a0718fc", WBNB = "0xae13d989dac2f0debff460ac112a837c89baa7cd";
  const DEX = "0x7d3375921fc0a5becb9b20cbfdcf03440befc5113d864e8522b8465ca68b8014", EVENT = "0x31b4ffc49a7e6b6eee740b5cce3e8cc9408b7db6fc93c4dfef9604bdfcb85caa";
  const KEY = "lqc-router2-lqc-flow-execution-smoke-chain97-v1", AMOUNT = 10n * 10n ** 18n;
  const $ = id => document.getElementById(id), addr = value => value.toLowerCase().slice(2).padStart(64, "0"); let hash = "";
  function status(message, type = "info") { $("status").textContent = message; $("status").dataset.type = type; }
  async function request(method, params = []) { if (!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요."); return window.ethereum.request({ method, params }); }
  async function verify() {
    try {
      if ((await request("eth_chainId")).toLowerCase() !== CHAIN) throw new Error("BSC Testnet(chain 97)이 아닙니다.");
      hash = localStorage.getItem(KEY) || ""; if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("이 휴대폰에 저장된 LQC Flow 실행 해시가 없습니다.");
      const [tx, receipt] = await Promise.all([request("eth_getTransactionByHash", [hash]), request("eth_getTransactionReceipt", [hash])]);
      if (!tx || !receipt) throw new Error("거래 영수증이 아직 확인되지 않습니다.");
      if (BigInt(receipt.status) !== 1n || tx.from.toLowerCase() !== SIGNER || tx.to.toLowerCase() !== ROUTER || !tx.input.toLowerCase().startsWith("0x5d4d7658")) throw new Error("성공 거래의 발신자·대상·메서드가 검토값과 다릅니다.");
      const log = receipt.logs.find(item => item.address.toLowerCase() === ROUTER && item.topics[0]?.toLowerCase() === EVENT && item.topics[1]?.toLowerCase() === `0x${addr(SIGNER)}` && item.topics[2]?.toLowerCase() === DEX);
      if (!log) throw new Error("검토된 LQC Flow SwapExecuted 이벤트가 없습니다.");
      const data = log.data.slice(2).match(/.{64}/g) || [];
      if ((`0x${data[0].slice(-40)}`).toLowerCase() !== TLQC || (`0x${data[1].slice(-40)}`).toLowerCase() !== WBNB || BigInt(`0x${data[2]}`) !== AMOUNT || BigInt(`0x${data[3]}`) <= 0n) throw new Error("실행 이벤트의 토큰·입력·출력이 검토값과 다릅니다.");
      const allowance = await request("eth_call", [{ to: TLQC, data: `0xdd62ed3e${addr(SIGNER)}${addr(ROUTER)}` }, "latest"]); if (BigInt(allowance) !== 0n) throw new Error("실행 후 사용자 승인 잔액이 0이 아닙니다.");
      $("hash").textContent = hash; $("block").textContent = BigInt(receipt.blockNumber).toString(); $("output").textContent = `${(Number(BigInt(`0x${data[3]}`)) / 1e18).toFixed(12)} WBNB`; $("copy").disabled = false;
      status("최종 검증 통과. 성공 영수증·LQC Flow 이벤트·10 tLQC 입력·WBNB 출력·승인 잔액 0이 모두 일치합니다. 다시 실행하지 마세요.", "ok");
    } catch (error) { status(error.message || String(error), "error"); }
  }
  $("verify").onclick = verify; $("copy").onclick = async () => { try { await navigator.clipboard.writeText(hash); status("전체 거래 해시를 복사했습니다.", "ok"); } catch { status("거래 해시를 길게 눌러 복사하세요.", "error"); } };
})();
