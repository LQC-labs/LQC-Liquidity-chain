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
  const routerV2Abi = [
    "function swapBestExactInput(address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOutMin,address[] adapters,bytes[] routeData,address recipient,uint256 deadline) returns (address adapter,uint256 amountOut)",
    "function swapSplitExactInput(address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOutMin,address[] adapters,bytes[] routeData,uint16[] allocationBps,address recipient,uint256 deadline) returns (uint256 amountOut)",
    "function swapExactBNBForTokens(address tokenOut,uint256 amountOutMin,address[] adapters,bytes[] routeData,address recipient,uint256 deadline) payable returns (address adapter,uint256 amountOut)",
    "function swapExactTokensForBNB(address tokenIn,uint256 amountIn,uint256 amountOutMin,address[] adapters,bytes[] routeData,address recipient,uint256 deadline) returns (address adapter,uint256 amountOut)"
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
    route: $("routeLabel"), routeDex: $("routeDex"), routeStrategy: $("routeStrategy"),
    routeSavings: $("routeSavings"), routeAlternatives: $("routeAlternatives"),
    routerMode: $("routerMode"), balanceIn: $("balanceIn"), balanceOut: $("balanceOut"),
    tokenInButton: $("tokenInButton"), tokenOutButton: $("tokenOutButton"), flip: $("flipButton"),
    max: $("maxButton"), buyAction: $("buyAction"), sellAction: $("sellAction"), status: $("statusBox"), statusText: $("statusText"),
    dialog: $("tokenDialog"), tokenList: $("tokenList"), slippage: $("slippageInput"),
    contractState: $("contractState")
  };

  let provider, signer, account, router, routerV2, currentQuote, choosingSide = "in", quoteTimer;
  let tokenIn = config.tokens[0];
  let tokenOut = config.tokens[2];
  let tradeMode = "buy";

  const tokensConfigured = config.tokens
    .filter((token) => token.address !== "native")
    .every((token) => ethers.isAddress(token.address));
  const deployedV1 = ethers.isAddress(config.routerAddress) && tokensConfigured;
  const configuredAdapters = (config.adapters || []).filter((adapter) => ethers.isAddress(adapter.address));
  const deployedV2 = ethers.isAddress(config.routerV2Address) && configuredAdapters.length > 0 && tokensConfigured;
  const deployed = deployedV2 || deployedV1;

  if (deployed) {
    ui.contractState.textContent = "연결 준비";
    ui.contractState.className = "";
    setStatus("컨트랙트가 설정되었습니다. 지갑을 연결하세요.");
  }
  ui.routerMode.textContent = deployedV2 ? "ROUTER 2.0" : "AMM V1";

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

  function symbolForAddress(address) {
    return config.tokens.find((token) => tokenAddress(token).toLowerCase() === address.toLowerCase())?.symbol
      || shortAddress(address);
  }

  function renderTokens() {
    for (const [side, token] of [["In", tokenIn], ["Out", tokenOut]]) {
      $(`token${side}Label`).textContent = token.symbol;
      $(`token${side}Icon`).textContent = token.symbol.slice(0, 4);
      $(`token${side}Icon`).classList.toggle("mint", token.symbol === "LQC");
    }
    ui.route.textContent = `${tokenIn.symbol} → ${tokenOut.symbol}`;
    ui.routeDex.textContent = deployedV2 ? "경로 탐색 대기" : "LQC Flow AMM";
    ui.routeStrategy.textContent = deployedV2 ? "자동 선택" : "단일 경로";
    ui.routeSavings.textContent = "—";
    ui.routeAlternatives.textContent = deployedV2 ? "수량을 입력하세요" : "직접 경로";
    currentQuote = null;
    syncModeFromPair();
  }

  function actionLabel() {
    return tradeMode === "sell" ? "SELL LQC" : "BUY LQC";
  }

  function setTradeActionsDisabled(disabled) {
    ui.buyAction.disabled = disabled;
    ui.sellAction.disabled = disabled;
  }

  function syncModeFromPair() {
    if (tokenOut.symbol === "LQC") tradeMode = "buy";
    else if (tokenIn.symbol === "LQC") tradeMode = "sell";
  }

  function setTradeMode(mode) {
    const lqc = config.tokens.find((token) => token.symbol === "LQC");
    const bnb = config.tokens.find((token) => token.symbol === "BNB");
    if (!lqc || !bnb) return;
    tradeMode = mode;
    [tokenIn, tokenOut] = mode === "buy" ? [bnb, lqc] : [lqc, bnb];
    renderTokens();
    updateBalances();
    scheduleQuote();
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
      router = deployedV1 ? new ethers.Contract(config.routerAddress, routerAbi, signer) : null;
      routerV2 = deployedV2 ? new ethers.Contract(config.routerV2Address, routerV2Abi, signer) : null;
      setTradeActionsDisabled(!deployed);
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
    currentQuote = null;
    const raw = ui.amountIn.value.trim();
    if (!raw || Number(raw) <= 0 || (!router && !routerV2)) return;
    const path = [tokenAddress(tokenIn), tokenAddress(tokenOut)];
    if (!path.every(ethers.isAddress)) return;
    try {
      const amount = ethers.parseUnits(raw, tokenIn.decimals);
      const slippageBps = Math.round(Number(ui.slippage.value) * 100);
      let out, minimum;
      if (routerV2) {
        const connectors = config.tokens
          .filter((token) => token.address !== "native" && ethers.isAddress(token.address))
          .map((token) => token.address);
        currentQuote = await window.LQCRouteOptimizer.findOptimalRoute({
          provider,
          tokenIn: path[0],
          tokenOut: path[1],
          amountIn: amount,
          adapters: configuredAdapters,
          connectors,
          slippageBps,
          allowSplit: tokenIn.address !== "native" && tokenOut.address !== "native"
        });
        out = currentQuote.amountOut;
        minimum = currentQuote.amountOutMin;
        if (currentQuote.strategy === "split") {
          ui.route.textContent = currentQuote.routes.map((route) => route.path.map(symbolForAddress).join(" → ")).join(" / ");
          ui.routeDex.textContent = currentQuote.routes.map((route, index) =>
            `${route.adapter.name || route.adapter.id} ${currentQuote.allocationBps[index] / 100}%`
          ).join(" + ");
          ui.routeStrategy.textContent = "2개 DEX 자동 분할";
          ui.routeSavings.textContent = `+${Number(ethers.formatUnits(currentQuote.improvementAmount, tokenOut.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut.symbol} (${(currentQuote.improvementBps / 100).toFixed(2)}%)`;
        } else {
          ui.route.textContent = currentQuote.path.map(symbolForAddress).join(" → ");
          ui.routeDex.textContent = currentQuote.adapter.name || currentQuote.adapter.id;
          ui.routeStrategy.textContent = "단일 최적경로";
          ui.routeSavings.textContent = "분할 이점 없음";
        }
        ui.routeAlternatives.textContent = `${currentQuote.comparedRoutes}개 경로 비교`;
      } else {
        const amounts = await router.getAmountsOut(amount, path);
        out = amounts[amounts.length - 1];
        minimum = out * BigInt(10_000 - slippageBps) / 10_000n;
        currentQuote = { path, amountOut: out, amountOutMin: minimum };
        ui.routeDex.textContent = "LQC Flow AMM";
        ui.routeStrategy.textContent = "단일 경로";
        ui.routeSavings.textContent = "—";
        ui.routeAlternatives.textContent = "직접 경로";
      }
      ui.amountOut.textContent = ethers.formatUnits(out, tokenOut.decimals);
      ui.minimum.textContent = `${Number(ethers.formatUnits(minimum, tokenOut.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut.symbol}`;
      setTradeActionsDisabled(false);
    } catch (error) {
      setTradeActionsDisabled(true);
      ui.routeDex.textContent = "경로 없음";
      ui.routeStrategy.textContent = "견적 실패";
      ui.routeSavings.textContent = "—";
      ui.routeAlternatives.textContent = "유동성 확인 필요";
      setStatus(error.message || "이 거래쌍의 유동성을 확인할 수 없습니다.", "error");
    }
  }

  async function executeSwap() {
    if ((!router && !routerV2) || !account) return connectWallet();
    const raw = ui.amountIn.value.trim();
    if (!raw || Number(raw) <= 0) return setStatus("보낼 수량을 입력하세요.", "error");
    try {
      setTradeActionsDisabled(true);
      await updateQuote();
      if (!currentQuote) throw new Error("실행 가능한 최적경로가 없습니다.");
      const amountIn = ethers.parseUnits(raw, tokenIn.decimals);
      const path = [tokenAddress(tokenIn), tokenAddress(tokenOut)];
      const amountOutMin = currentQuote.amountOutMin;
      const deadline = Math.floor(Date.now() / 1000) + 1_200;
      let tx;
      if (routerV2) {
        const adapters = currentQuote.strategy === "split" ? currentQuote.adapters : [currentQuote.adapter.address];
        const routeData = currentQuote.strategy === "split" ? currentQuote.routeData : [currentQuote.routeData];
        if (tokenIn.address === "native") {
          tx = await routerV2.swapExactBNBForTokens(
            tokenAddress(tokenOut), amountOutMin, adapters, routeData, account, deadline, { value: amountIn }
          );
        } else {
          const token = new ethers.Contract(tokenIn.address, erc20Abi, signer);
          const allowance = await token.allowance(account, config.routerV2Address);
          if (allowance < amountIn) {
            setStatus(`${tokenIn.symbol} 사용 승인을 확인하세요.`);
            await (await token.approve(config.routerV2Address, amountIn)).wait();
          }
          tx = currentQuote.strategy === "split"
            ? await routerV2.swapSplitExactInput(
              tokenAddress(tokenIn), tokenAddress(tokenOut), amountIn, amountOutMin,
              adapters, routeData, currentQuote.allocationBps, account, deadline
            )
            : tokenOut.address === "native"
            ? await routerV2.swapExactTokensForBNB(
              tokenAddress(tokenIn), amountIn, amountOutMin, adapters, routeData, account, deadline
            )
            : await routerV2.swapBestExactInput(
              tokenAddress(tokenIn), tokenAddress(tokenOut), amountIn, amountOutMin,
              adapters, routeData, account, deadline
            );
        }
      } else if (tokenIn.address === "native") {
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
      setStatus(`${actionLabel()} 거래가 완료되었습니다.`, "success");
      ui.amountIn.value = "";
      await updateBalances();
      await updateQuote();
    } catch (error) {
      setStatus(error.shortMessage || "거래가 취소되었거나 실패했습니다.", "error");
    } finally {
      setTradeActionsDisabled(!deployed);
    }
  }

  ui.connect.addEventListener("click", connectWallet);
  ui.buyAction.addEventListener("click", async () => { setTradeMode("buy"); await updateQuote(); await executeSwap(); });
  ui.sellAction.addEventListener("click", async () => { setTradeMode("sell"); await updateQuote(); await executeSwap(); });
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
