(function () {
  "use strict";

  const config = window.LQC_FLOW_CONFIG;
  const { ethers } = window;
  const routerAbi = [
    "function getAmountsOut(uint256 amountIn,address[] path) view returns (uint256[] amounts)",
    "function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[] amounts)",
    "function swapExactBNBForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable returns (uint256[] amounts)",
    "function swapExactTokensForBNB(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[] amounts)"
  ];
  const erc20Abi = [
    "function balanceOf(address account) view returns (uint256)",
    "function allowance(address owner,address spender) view returns (uint256)",
    "function approve(address spender,uint256 amount) returns (bool)"
  ];

  const $ = (id) => document.getElementById(id);
  const ui = {
    connect: $("connectButton"), settings: $("settingsButton"), settingsPanel: $("settingsPanel"),
    amountIn: $("amountIn"), amountOut: $("amountOut"), minimum: $("minimumReceived"),
    route: $("routeLabel"), balanceIn: $("balanceIn"), balanceOut: $("balanceOut"),
    tokenInButton: $("tokenInButton"), tokenOutButton: $("tokenOutButton"), flip: $("flipButton"),
    max: $("maxButton"), swap: $("swapButton"), status: $("statusBox"), statusText: $("statusText"),
    dialog: $("tokenDialog"), tokenList: $("tokenList"), slippage: $("slippageInput"),
    contractState: $("contractState")
  };

  let provider, signer, account, router, choosingSide = "in", quoteTimer;
  let tokenIn = config.tokens[0];
  let tokenOut = config.tokens[2];

  const deployed = ethers.isAddress(config.routerAddress) && config.tokens
    .filter((token) => token.address !== "native")
    .every((token) => ethers.isAddress(token.address));

  if (deployed) {
    ui.contractState.textContent = "연결 준비";
    ui.contractState.className = "";
    setStatus("컨트랙트가 설정되었습니다. 지갑을 연결하세요.");
  }

  function setStatus(message, type = "") {
    ui.status.className = `status ${type}`.trim();
    ui.statusText.textContent = message;
  }

  function shortAddress(address) {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }

  function tokenAddress(token) {
    if (token.address === "native") {
      const wrapped = config.tokens.find((item) => item.symbol === "WBNB");
      return wrapped?.address || "";
    }
    return token.address;
  }

  function renderTokens() {
    for (const [side, token] of [["In", tokenIn], ["Out", tokenOut]]) {
      $(`token${side}Label`).textContent = token.symbol;
      $(`token${side}Icon`).textContent = token.symbol.slice(0, 4);
      $(`token${side}Icon`).classList.toggle("mint", token.symbol === "LQC");
    }
    ui.route.textContent = `${tokenIn.symbol} → ${tokenOut.symbol}`;
  }

  function renderTokenList() {
    ui.tokenList.replaceChildren(...config.tokens.map((token) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "token-option";
      button.innerHTML = `<span class="token-symbol ${token.symbol === "LQC" ? "mint" : ""}">${token.symbol.slice(0, 4)}</span><b>${token.symbol}</b><span>${token.name}</span>`;
      button.addEventListener("click", () => selectToken(token));
      return button;
    }));
  }

  function selectToken(token) {
    const other = choosingSide === "in" ? tokenOut : tokenIn;
    const selectedAddress = tokenAddress(token);
    const otherAddress = tokenAddress(other);
    if (selectedAddress && selectedAddress === otherAddress) {
      setStatus("BNB와 WBNB는 같은 풀 자산으로 동시에 선택할 수 없습니다.", "error");
      return;
    }
    if (choosingSide === "in") {
      if (token.symbol === tokenOut.symbol) tokenOut = tokenIn;
      tokenIn = token;
    } else {
      if (token.symbol === tokenIn.symbol) tokenIn = tokenOut;
      tokenOut = token;
    }
    ui.dialog.close();
    renderTokens();
    updateBalances();
    scheduleQuote();
  }

  async function connectWallet() {
    if (!window.ethereum) return setStatus("MetaMask 또는 호환 지갑이 필요합니다.", "error");
    try {
      provider = new ethers.BrowserProvider(window.ethereum);
      await ensureNetwork();
      signer = await provider.getSigner();
      account = await signer.getAddress();
      ui.connect.textContent = shortAddress(account);
      router = deployed ? new ethers.Contract(config.routerAddress, routerAbi, signer) : null;
      ui.swap.disabled = !deployed;
      ui.swap.textContent = deployed ? "Swap" : "테스트넷 배포 대기";
      setStatus(deployed ? "지갑이 연결되었습니다." : "지갑 연결 완료 · 테스트넷 배포 주소가 아직 없습니다.", deployed ? "success" : "");
      await updateBalances();
      scheduleQuote();
    } catch (error) {
      setStatus(error.shortMessage || error.message || "지갑 연결에 실패했습니다.", "error");
    }
  }

  async function ensureNetwork() {
    const current = await window.ethereum.request({ method: "eth_chainId" });
    if (current === config.chainIdHex) return;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: config.chainIdHex }] });
    } catch (error) {
      if (error.code !== 4902) throw error;
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
        chainId: config.chainIdHex, chainName: config.chainName, rpcUrls: config.rpcUrls,
        nativeCurrency: config.nativeCurrency, blockExplorerUrls: config.blockExplorerUrls
      }] });
    }
  }

  async function balanceOf(token) {
    if (!provider || !account) return null;
    if (token.address === "native") return provider.getBalance(account);
    if (!ethers.isAddress(token.address)) return null;
    return new ethers.Contract(token.address, erc20Abi, provider).balanceOf(account);
  }

  async function updateBalances() {
    const [inBalance, outBalance] = await Promise.all([balanceOf(tokenIn), balanceOf(tokenOut)]);
    ui.balanceIn.textContent = inBalance === null ? "—" : Number(ethers.formatUnits(inBalance, tokenIn.decimals)).toLocaleString(undefined, { maximumFractionDigits: 5 });
    ui.balanceOut.textContent = outBalance === null ? "—" : Number(ethers.formatUnits(outBalance, tokenOut.decimals)).toLocaleString(undefined, { maximumFractionDigits: 5 });
  }

  function scheduleQuote() {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(updateQuote, 300);
  }

  async function updateQuote() {
    ui.amountOut.textContent = "0.0";
    ui.minimum.textContent = "—";
    const raw = ui.amountIn.value.trim();
    if (!raw || Number(raw) <= 0 || !router) return;
    const path = [tokenAddress(tokenIn), tokenAddress(tokenOut)];
    if (!path.every(ethers.isAddress)) return;
    try {
      const amount = ethers.parseUnits(raw, tokenIn.decimals);
      const amounts = await router.getAmountsOut(amount, path);
      const out = amounts[amounts.length - 1];
      const slippageBps = Math.round(Number(ui.slippage.value) * 100);
      const minimum = out * BigInt(10_000 - slippageBps) / 10_000n;
      ui.amountOut.textContent = ethers.formatUnits(out, tokenOut.decimals);
      ui.minimum.textContent = `${Number(ethers.formatUnits(minimum, tokenOut.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut.symbol}`;
      ui.swap.disabled = false;
      ui.swap.textContent = "Swap";
    } catch {
      ui.swap.disabled = true;
      ui.swap.textContent = "유동성이 부족합니다";
      setStatus("이 거래쌍의 유동성을 확인할 수 없습니다.", "error");
    }
  }

  async function executeSwap() {
    if (!router || !account) return connectWallet();
    const raw = ui.amountIn.value.trim();
    if (!raw || Number(raw) <= 0) return setStatus("보낼 수량을 입력하세요.", "error");
    try {
      ui.swap.disabled = true;
      ui.swap.textContent = "거래 준비 중…";
      const amountIn = ethers.parseUnits(raw, tokenIn.decimals);
      const path = [tokenAddress(tokenIn), tokenAddress(tokenOut)];
      const amounts = await router.getAmountsOut(amountIn, path);
      const slippageBps = Math.round(Number(ui.slippage.value) * 100);
      const amountOutMin = amounts.at(-1) * BigInt(10_000 - slippageBps) / 10_000n;
      const deadline = Math.floor(Date.now() / 1000) + 1_200;
      let tx;
      if (tokenIn.address === "native") {
        tx = await router.swapExactBNBForTokens(amountOutMin, path, account, deadline, { value: amountIn });
      } else {
        const token = new ethers.Contract(tokenIn.address, erc20Abi, signer);
        const allowance = await token.allowance(account, config.routerAddress);
        if (allowance < amountIn) {
          setStatus(`${tokenIn.symbol} 사용 승인을 확인하세요.`);
          const approval = await token.approve(config.routerAddress, amountIn);
          await approval.wait();
        }
        tx = tokenOut.address === "native"
          ? await router.swapExactTokensForBNB(amountIn, amountOutMin, path, account, deadline)
          : await router.swapExactTokensForTokens(amountIn, amountOutMin, path, account, deadline);
      }
      setStatus("거래가 제출되었습니다. 블록 확인을 기다리는 중입니다.");
      await tx.wait();
      setStatus("Swap이 완료되었습니다.", "success");
      ui.amountIn.value = "";
      await updateBalances();
      await updateQuote();
    } catch (error) {
      setStatus(error.shortMessage || "거래가 취소되었거나 실패했습니다.", "error");
    } finally {
      ui.swap.disabled = !deployed;
      ui.swap.textContent = deployed ? "Swap" : "테스트넷 배포 대기";
    }
  }

  ui.connect.addEventListener("click", connectWallet);
  ui.settings.addEventListener("click", () => {
    ui.settingsPanel.hidden = !ui.settingsPanel.hidden;
    ui.settings.setAttribute("aria-expanded", String(!ui.settingsPanel.hidden));
  });
  ui.tokenInButton.addEventListener("click", () => { choosingSide = "in"; ui.dialog.showModal(); });
  ui.tokenOutButton.addEventListener("click", () => { choosingSide = "out"; ui.dialog.showModal(); });
  ui.flip.addEventListener("click", () => { [tokenIn, tokenOut] = [tokenOut, tokenIn]; renderTokens(); updateBalances(); scheduleQuote(); });
  ui.amountIn.addEventListener("input", scheduleQuote);
  ui.slippage.addEventListener("input", scheduleQuote);
  ui.max.addEventListener("click", async () => {
    const balance = await balanceOf(tokenIn);
    if (balance !== null) {
      const reserve = tokenIn.address === "native" ? ethers.parseEther("0.01") : 0n;
      ui.amountIn.value = ethers.formatUnits(balance > reserve ? balance - reserve : 0n, tokenIn.decimals);
      scheduleQuote();
    }
  });
  ui.swap.addEventListener("click", executeSwap);
  document.querySelectorAll(".slippage-option").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".slippage-option").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    ui.slippage.value = button.dataset.value;
    scheduleQuote();
  }));
  window.ethereum?.on?.("accountsChanged", () => connectWallet());
  window.ethereum?.on?.("chainChanged", () => window.location.reload());

  renderTokens();
  renderTokenList();
})();
