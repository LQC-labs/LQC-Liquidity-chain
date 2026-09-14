(function () {
  "use strict";

  const IS_RISK = window.location.pathname.endsWith("/risk-safe-testnet.html");
  const CHAIN_ID = "0x61";
  const FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
  const SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
  const FALLBACK = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";
  const PROXY_CREATION_TOPIC = "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235";
  const ALL_OWNERS = [
    "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB",
    "0xFBF84C81cfF0b400D33Ac2C3c095DC22E4A91B6c",
    "0x6CEd713de5342b8A9A2869BB132b3f251907970A",
    "0x1bC23531Eea799B1b7A0a7cbd7E7fC24baCb29FB",
    "0xE498CAcDa9cE819307AB1292389F270A46471B25",
    "0x30107526b867Ab345FBd23239157d9Ed225f9Dc0",
    "0x4A20a68834917d901d7C86bAB06061f3f182d7bC",
  ];
  const OWNERS = IS_RISK ? ALL_OWNERS.slice(0, 5) : ALL_OWNERS;
  const GOVERNANCE_DATA = "0x1688f0b900000000000000000000000029fcb43b46531bca003ddc8fcb67ffe91900c7620000000000000000000000000000000000000000000000000000000000000060efb91ba7326ae35f53dbc4379659b6498b7015e561b621af69c9cd0b529243e30000000000000000000000000000000000000000000000000000000000000224b63e800d0000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000fd0732dc9e303f09fcef3a7388ad10a83459ec9900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000070000000000000000000000007cf23bb16ed0e1eaf58cd31c9f5a643be438c6ab000000000000000000000000fbf84c81cff0b400d33ac2c3c095dc22e4a91b6c0000000000000000000000006ced713de5342b8a9a2869bb132b3f251907970a0000000000000000000000001bc23531eea799b1b7a0a7cbd7e7fc24bacb29fb000000000000000000000000e498cacda9ce819307ab1292389f270a46471b2500000000000000000000000030107526b867ab345fbd23239157d9ed225f9dc00000000000000000000000004a20a68834917d901d7c86bab06061f3f182d7bc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
  const RISK_DATA = "0x1688f0b900000000000000000000000029fcb43b46531bca003ddc8fcb67ffe91900c7620000000000000000000000000000000000000000000000000000000000000060f8229cafa2dc45345f22996df84b93edc11313e0df748318130896e446f4c31600000000000000000000000000000000000000000000000000000000000001e4b63e800d00000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000fd0732dc9e303f09fcef3a7388ad10a83459ec9900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000050000000000000000000000007cf23bb16ed0e1eaf58cd31c9f5a643be438c6ab000000000000000000000000fbf84c81cff0b400d33ac2c3c095dc22e4a91b6c0000000000000000000000006ced713de5342b8a9a2869bb132b3f251907970a0000000000000000000000001bc23531eea799b1b7a0a7cbd7e7fc24bacb29fb000000000000000000000000e498cacda9ce819307ab1292389f270a46471b25000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
  const DATA = IS_RISK ? RISK_DATA : GOVERNANCE_DATA;
  const ROLE_LABEL = IS_RISK ? "Risk Safe" : "Governance Safe";

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

  async function assertChainAndContracts() {
    const chainId = await request("eth_chainId");
    if (chainId.toLowerCase() !== CHAIN_ID) throw new Error("BSC Testnet(chain 97)이 아닙니다. 네트워크를 바꾸지 말고 중단하세요.");
    for (const address of [FACTORY, SINGLETON, FALLBACK]) {
      const code = await request("eth_getCode", [address, "latest"]);
      if (!code || code === "0x") throw new Error(`공식 Safe 계약을 확인할 수 없습니다: ${address}`);
    }
  }

  async function connect() {
    try {
      status("네트워크와 공식 Safe 계약을 확인하고 있습니다…");
      await assertChainAndContracts();
      const accounts = await request("eth_requestAccounts");
      account = accounts[0];
      if (!account || account.toLowerCase() !== OWNERS[0].toLowerCase()) {
        throw new Error("Signer 1 지갑(0x7cf2…C6aB)으로 연결해야 합니다.");
      }
      $("wallet").textContent = account;
      $("deploy").disabled = false;
      status("검증 완료. 아래 7개 주소와 4/7 기준을 확인한 뒤 생성하세요.", "ok");
    } catch (error) {
      account = null;
      $("deploy").disabled = true;
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

  async function deploy() {
    try {
      $("deploy").disabled = true;
      await assertChainAndContracts();
      const gas = await request("eth_estimateGas", [{ from: account, to: FACTORY, value: "0x0", data: DATA }]);
      status("TokenPocket 승인창에서 네트워크와 가스비를 확인하세요. 개인키 입력은 요구하지 않습니다.");
      const hash = await request("eth_sendTransaction", [{ from: account, to: FACTORY, value: "0x0", data: DATA, gas }]);
      $("tx").textContent = hash;
      const receipt = await waitForReceipt(hash);
      if (receipt.status !== "0x1") throw new Error("Safe 생성 거래가 실패했습니다.");
      const log = receipt.logs.find((item) => item.address.toLowerCase() === FACTORY.toLowerCase() && item.topics[0]?.toLowerCase() === PROXY_CREATION_TOPIC);
      if (!log?.topics[1]) throw new Error("거래는 성공했지만 생성된 Safe 주소를 로그에서 찾지 못했습니다.");
      const safeAddress = `0x${log.topics[1].slice(-40)}`;
      $("safe").textContent = safeAddress;
      status(`${ROLE_LABEL} 생성 성공. 주소와 거래 해시를 캡처해 보관하세요.`, "ok");
    } catch (error) {
      status(error.message, "error");
      $("deploy").disabled = false;
    }
  }

  $("owners").innerHTML = OWNERS.map((address, index) => `<li><b>Signer ${index + 1}</b><code>${address}</code></li>`).join("");
  $("factory").textContent = FACTORY;
  $("connect").addEventListener("click", connect);
  $("deploy").addEventListener("click", deploy);
})();
