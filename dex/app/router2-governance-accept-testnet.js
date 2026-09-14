(function () {
  "use strict";
  const CHAIN_ID = "0x61";
  const RISK = "0xe10a1d467a553900cb4d1755e079b35b0cd0c48b";
  const GOVERNANCE = "0x5235e26EE4D511aE8ba1FB1cff2619Fc1D90C02A";
  const ACCEPT_OWNERSHIP = "0x79ba5097";
  const SAFE_URL = `https://app.safe.global/home?safe=bnbt:${GOVERNANCE}`;
  const $ = (id) => document.getElementById(id);

  function status(message, type = "info") { $("status").textContent = message; $("status").dataset.type = type; }
  async function request(method, params = []) {
    if (!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요.");
    return window.ethereum.request({ method, params });
  }
  function addressWord(data) { return `0x${data.slice(-40)}`.toLowerCase(); }

  async function verify() {
    try {
      $("openSafe").classList.add("disabled");
      status("BSC Testnet과 두 계약의 온체인 상태를 확인하고 있습니다…");
      if ((await request("eth_chainId")).toLowerCase() !== CHAIN_ID) throw new Error("BSC Testnet(chain 97)이 아닙니다.");
      await request("eth_requestAccounts");
      for (const address of [RISK, GOVERNANCE]) {
        const code = await request("eth_getCode", [address, "latest"]);
        if (!code || code === "0x") throw new Error("필수 계약 코드를 확인할 수 없습니다.");
      }
      const owner = addressWord(await request("eth_call", [{ to: RISK, data: "0x8da5cb5b" }, "latest"]));
      const pending = addressWord(await request("eth_call", [{ to: RISK, data: "0xe30c3978" }, "latest"]));
      if (owner === GOVERNANCE.toLowerCase() && pending === "0x0000000000000000000000000000000000000000") {
        status("최종 완료: Governance Safe가 이미 Risk Registry 소유자입니다. 새 거래를 만들지 마세요.", "ok");
        return;
      }
      if (pending !== GOVERNANCE.toLowerCase()) throw new Error("Risk Registry의 대기 소유자가 확정된 Governance Safe와 다릅니다. 중단하세요.");
      $("openSafe").classList.remove("disabled");
      status("검증 완료. 공식 Safe에서 acceptOwnership() 단일 거래를 제안하고 4/7 승인을 받으세요.", "ok");
    } catch (error) {
      status(error.message || String(error), "error");
    }
  }

  $("safe").textContent = GOVERNANCE;
  $("target").textContent = RISK;
  $("data").textContent = ACCEPT_OWNERSHIP;
  $("openSafe").href = SAFE_URL;
  $("verify").addEventListener("click", verify);
})();
