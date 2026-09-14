(function () {
  "use strict";
  const CHAIN_ID="0x61", SIGNER="0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
  const REGISTRY="0x0465c6460deaece522506e09cddc1b62d6d75c84", ADAPTER="0x1bffac4b93f48d5ea03bae36dbaee6bedd0a73d4";
  const DEX_ID="52fe36cd57d2173b4f2a956d3118ad26d720aadec7531ff26bca3a2cc0ef68a7";
  const BUNDLE_URL="../deployments/router2-quote-stack-config-bsc-testnet-97.json", STORAGE_KEY="lqc-router2-quote-router-chain97-v1";
  const $=id=>document.getElementById(id); let account=null, deployData=null;
  function status(message,type="info"){$("status").textContent=message;$("status").dataset.type=type;}
  async function request(method,params=[]){if(!window.ethereum)throw new Error("TokenPocket DApp 브라우저에서 열어주세요.");return window.ethereum.request({method,params});}
  async function call(to,data){return request("eth_call",[{to,data},"latest"]);}
  function addressResult(data){if(!data||data.length<66)throw new Error("주소 읽기 실패");return `0x${data.slice(-40)}`.toLowerCase();}
  async function waitReceipt(hash){for(let i=0;i<90;i+=1){const receipt=await request("eth_getTransactionReceipt",[hash]);if(receipt)return receipt;await new Promise(resolve=>setTimeout(resolve,4000));}throw new Error("확인이 지연됩니다. 다시 배포하지 마세요.");}
  async function verifyPrerequisites(){
    for(const address of [REGISTRY,ADAPTER]){const code=await request("eth_getCode",[address,"latest"]);if(!code||code==="0x")throw new Error("Registry 또는 Adapter 코드가 없습니다.");}
    const dex=await call(REGISTRY,"0x10c931a5"+DEX_ID);const words=dex.slice(2).match(/.{64}/g)||[];
    if(words.length<3||addressResult(`0x${words[0]}`)!==ADAPTER.toLowerCase()||BigInt(`0x${words[1]}`)!==1n||BigInt(`0x${words[2]}`)!==95n)throw new Error("PANCAKE_V3 등록 설정이 확정값과 다릅니다.");
  }
  async function verifyQuoteRouter(address){const code=await request("eth_getCode",[address,"latest"]);if(!code||code==="0x")throw new Error("Quote Router 코드가 없습니다.");const registry=await call(address,"0x7b103999");if(addressResult(registry)!==REGISTRY.toLowerCase())throw new Error("Quote Router의 Registry 연결이 확정값과 다릅니다.");}
  async function existing(){const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");if(!saved)return false;await verifyQuoteRouter(saved.address);$("quoteRouter").textContent=saved.address;$("tx").textContent=saved.hash;status("Quote Router 배포와 Registry 연결 확인 완료. 다시 배포하지 마세요.","ok");return true;}
  async function connect(){try{
    $("deploy").disabled=true;if((await request("eth_chainId")).toLowerCase()!==CHAIN_ID)throw new Error("BSC Testnet(chain 97)이 아닙니다.");
    const accounts=await request("eth_requestAccounts");if(!accounts[0]||accounts[0].toLowerCase()!==SIGNER.toLowerCase())throw new Error("Signer 1 지갑으로 연결하세요.");account=accounts[0];$("wallet").textContent=account;
    await verifyPrerequisites();if(await existing())return;
    const bundle=await(await fetch(BUNDLE_URL,{cache:"no-store"})).json();const action=bundle.orderedActions[5];
    if(bundle.network.chainId!==97||bundle.signer.toLowerCase()!==SIGNER.toLowerCase()||bundle.executions.v3Configuration.status!=="success"||action.action!=="deploy-quote-router"||action.to!==null||action.value!=="0")throw new Error("Quote Router 배포 묶음 검증 실패");
    deployData=action.data;if(!/^0x[0-9a-f]+$/.test(deployData)||deployData.length!==7798||!deployData.endsWith(REGISTRY.toLowerCase().slice(2).padStart(64,"0")))throw new Error("Quote Router 생성자 데이터 검증 실패");
    $("deploy").disabled=false;status("선행 설정 확인 완료. 정확한 Registry를 연결한 Quote Router 하나만 배포합니다.","ok");
  }catch(error){status(error.message||String(error),"error");}}
  async function deploy(){try{
    $("deploy").disabled=true;if(!deployData)throw new Error("먼저 1번 검증을 하세요.");if(await existing())return;const accounts=await request("eth_accounts");if(!accounts[0]||accounts[0].toLowerCase()!==account.toLowerCase())throw new Error("연결 지갑이 변경되었습니다.");
    await verifyPrerequisites();const tx={from:account,value:"0x0",data:deployData};const gas=await request("eth_estimateGas",[tx]);status("Quote Router 단일 배포 거래입니다. TokenPocket에서 0 tBNB와 가스비를 확인하세요.");const hash=await request("eth_sendTransaction",[{...tx,gas}]);$("tx").textContent=hash;const receipt=await waitReceipt(hash);
    if(BigInt(receipt.status)!==1n||!receipt.contractAddress)throw new Error("Quote Router 배포 실패");await verifyQuoteRouter(receipt.contractAddress);localStorage.setItem(STORAGE_KEY,JSON.stringify({address:receipt.contractAddress,hash}));$("quoteRouter").textContent=receipt.contractAddress;status("Quote Router 배포 성공. Registry 연결을 온체인에서 확인했습니다.","ok");
  }catch(error){status(error.message||String(error),"error");}}
  $("owner").textContent=SIGNER;$("registry").textContent=REGISTRY;$("adapter").textContent=ADAPTER;$("connect").addEventListener("click",connect);$("deploy").addEventListener("click",deploy);
})();
