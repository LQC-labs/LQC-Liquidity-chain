(function () {
  "use strict";

  const CHAIN_ID = "0x61";
  const SIGNER_1 = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
  const FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
  const TLQC = "0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc";
  const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
  const FEE = 2500;
  const CREATE_DATA = "0xa167129500000000000000000000000084a30a66cfcbb15453c83204b7e6ec436a0718fc000000000000000000000000ae13d989dac2f0debff460ac112a837c89baa7cd00000000000000000000000000000000000000000000000000000000000009c4";
  const GET_POOL_DATA = "0x1698ee8200000000000000000000000084a30a66cfcbb15453c83204b7e6ec436a0718fc000000000000000000000000ae13d989dac2f0debff460ac112a837c89baa7cd00000000000000000000000000000000000000000000000000000000000009c4";
  const FEE_SPACING_DATA = "0x22afcccb00000000000000000000000000000000000000000000000000000000000009c4";
  const ZERO = "0x0000000000000000000000000000000000000000";
  const $ = (id) => document.getElementById(id);
  let account = null;

  function status(message, type = "info") {
    $("status").textContent = message;
    $("status").dataset.type = type;
  }

  async function request(method, params = []) {
    if (!window.ethereum) throw new Error("TokenPocket DApp 브라우저에서 열어주세요.");
    return window.ethereum.request({ method, params });
  }

  function decodeAddress(data) {
    if (!data || data === "0x" || data.length < 66) return ZERO;
    return `0x${data.slice(-40)}`;
  }

  async function assertChainAndContracts() {
    const chainId = await request("eth_chainId");
    if (chainId.toLowerCase() !== CHAIN_ID) throw new Error("BSC Testnet(chain 97)이 아닙니다. 중단하세요.");
    for (const address of [FACTORY, TLQC, WBNB]) {
      const code = await request("eth_getCode", [address, "latest"]);
      if (!code || code === "0x") throw new Error(`필수 테스트넷 계약을 확인할 수 없습니다: ${address}`);
    }
    const spacing = await request("eth_call", [{ to: FACTORY, data: FEE_SPACING_DATA }, "latest"]);
    if (!spacing || BigInt(spacing) === 0n) throw new Error("PancakeSwap V3 수수료 2500이 활성화되어 있지 않습니다.");
  }

  async function currentPool() {
    return decodeAddress(await request("eth_call", [{ to: FACTORY, data: GET_POOL_DATA }, "latest"]));
  }

  async function connect() {
    try {
      status("네트워크와 공식 PancakeSwap V3 계약을 확인하고 있습니다…");
      await assertChainAndContracts();
      const accounts = await request("eth_requestAccounts");
      account = accounts[0];
      if (!account || account.toLowerCase() !== SIGNER_1.toLowerCase()) throw new Error("Signer 1 지갑(0x7cf2…C6aB)으로 연결해야 합니다.");
      $("wallet").textContent = account;
      const pool = await currentPool();
      if (pool !== ZERO) {
        $("pool").textContent = pool;
        $("create").disabled = true;
        status("이 풀은 이미 생성되어 있습니다. 생성 버튼을 다시 누르지 마세요.", "ok");
        return;
      }
      $("create").disabled = false;
      status("검증 완료. tLQC/WBNB, 수수료 2500 빈 풀만 생성합니다.", "ok");
    } catch (error) {
      account = null;
      $("create").disabled = true;
      status(error.message, "error");
    }
  }

  async function waitForReceipt(hash) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const receipt = await request("eth_getTransactionReceipt", [hash]);
      if (receipt) return receipt;
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    throw new Error("확인이 지연되고 있습니다. 거래 해시를 보관하고 BscScan에서 확인하세요.");
  }

  async function createPool() {
    try {
      $("create").disabled = true;
      await assertChainAndContracts();
      const accounts = await request("eth_accounts");
      if (!accounts[0] || accounts[0].toLowerCase() !== account?.toLowerCase() || account.toLowerCase() !== SIGNER_1.toLowerCase()) {
        throw new Error("연결 지갑이 변경됐습니다. Signer 1로 다시 연결하세요.");
      }
      if (await currentPool() !== ZERO) throw new Error("풀이 이미 생성되어 있습니다. 다시 생성하지 마세요.");
      const transaction = { from: account, to: FACTORY, value: "0x0", data: CREATE_DATA };
      const gas = await request("eth_estimateGas", [transaction]);
      status("TokenPocket에서 BSC 테스트넷과 가스비를 확인한 뒤 승인하세요. 초기 가격과 유동성은 아직 설정하지 않습니다.");
      const hash = await request("eth_sendTransaction", [{ ...transaction, gas }]);
      $("tx").textContent = hash;
      const receipt = await waitForReceipt(hash);
      if (receipt.status !== "0x1") throw new Error("풀 생성 거래가 실패했습니다.");
      const pool = await currentPool();
      if (pool === ZERO) throw new Error("거래는 성공했지만 Factory에서 풀 주소를 확인하지 못했습니다.");
      $("pool").textContent = pool;
      status("빈 PancakeSwap V3 풀이 생성되었습니다. 주소와 거래 해시를 보관하세요.", "ok");
    } catch (error) {
      status(error.message, "error");
      $("create").disabled = false;
    }
  }

  $("factory").textContent = FACTORY;
  $("tlqc").textContent = TLQC;
  $("wbnb").textContent = WBNB;
  $("fee").textContent = `${FEE} (0.25%)`;
  $("connect").addEventListener("click", connect);
  $("create").addEventListener("click", createPool);
})();
