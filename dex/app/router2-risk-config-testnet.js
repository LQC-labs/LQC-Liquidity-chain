(function () {
  "use strict";
  const CHAIN_ID="0x61", SIGNER="0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
  const RISK="0xe10a1d467a553900cb4d1755e079b35b0cd0c48b", ROUTER="0x2e0a7f59ca65ed36977add5e71b8b64ba38d939f";
  const GOVERNANCE="0x5235e26EE4D511aE8ba1FB1cff2619Fc1D90C02A", TLQC="0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc", WBNB="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
  const DEX_ID="52fe36cd57d2173b4f2a956d3118ad26d720aadec7531ff26bca3a2cc0ef68a7", BUNDLE_URL="../deployments/router2-execution-stack-stage3-bsc-testnet-97.json", STORAGE_KEY="lqc-router2-risk-config-chain97-v1";
  const $=id=>document.getElementById(id), buttons=()=>[...document.querySelectorAll("button[data-step]")]; let account=null, actions=[];
  function status(message,type="info"){$("status").textContent=message;$('status').dataset.type=type;}
  async function request(method,params=[]){if(!window.ethereum)throw new Error("TokenPocket DApp 브라우저에서 열어주세요.");return window.ethereum.request({method,params});}
  async function call(data){return request("eth_call",[{to:RISK,data},"latest"]);}
  function word(data,index=0){return BigInt(`0x${data.slice(2+index*64,66+index*64)}`);}
  function addressWord(data){return `0x${data.slice(-40)}`.toLowerCase();}
  function addressArg(address){return address.toLowerCase().slice(2).padStart(64,"0");}
  async function completed(){
    const executor=addressWord(await call("0xc34c08e5")); if(executor!==ROUTER.toLowerCase())return 0;
    let data=await call("0x417a0698"+addressArg(TLQC)); if(word(data)!==1n||word(data,1)!==1000n*10n**18n||word(data,2)!==10000n*10n**18n)return 1;
    data=await call("0xd6a067ee"+DEX_ID+addressArg(TLQC)); if(word(data)!==1000n*10n**18n)return 2;
    data=await call("0x417a0698"+addressArg(WBNB)); if(word(data)!==1n||word(data,1)!==10n**16n||word(data,2)!==10n**17n)return 3;
    data=await call("0xd6a067ee"+DEX_ID+addressArg(WBNB)); if(word(data)!==10n**16n)return 4;
    const pending=addressWord(await call("0xe30c3978")); return pending===GOVERNANCE.toLowerCase()?6:5;
  }
  async function refresh(){buttons().forEach(b=>b.disabled=true);const next=await completed();if(next<6)buttons()[next].disabled=false;else status("6개 설정이 모두 온체인에서 확인됐습니다. 다시 실행하지 마세요.","ok");return next;}
  async function connect(){try{
    if((await request("eth_chainId")).toLowerCase()!==CHAIN_ID)throw new Error("BSC Testnet(chain 97)이 아닙니다.");const accounts=await request("eth_requestAccounts");if(!accounts[0]||accounts[0].toLowerCase()!==SIGNER.toLowerCase())throw new Error("Signer 1 지갑으로 연결하세요.");account=accounts[0];$("wallet").textContent=account;
    for(const address of [RISK,ROUTER,GOVERNANCE]){const code=await request("eth_getCode",[address,"latest"]);if(!code||code==="0x")throw new Error("필수 계약 코드가 없습니다.");}
    const bundle=await(await fetch(BUNDLE_URL,{cache:"no-store"})).json();if(bundle.network.chainId!==97||bundle.executions.executionRouter.address.toLowerCase()!==ROUTER.toLowerCase()||bundle.executions.riskRegistry.address.toLowerCase()!==RISK.toLowerCase())throw new Error("설정 묶음 검증 실패");actions=bundle.orderedActions.slice(2);if(actions.length!==6||actions.some((a,i)=>a.id!==i+3||a.to.toLowerCase()!==RISK.toLowerCase()||a.value!=="0"))throw new Error("순차 설정 데이터 검증 실패");const next=await refresh();status(next===6?"모든 설정 완료. 다시 실행하지 마세요.":`${next+2}번 단계 실행 준비 완료. 한 건만 실행하세요.`,"ok");
  }catch(error){status(error.message||String(error),"error");}}
  async function waitReceipt(hash){for(let i=0;i<90;i+=1){const receipt=await request("eth_getTransactionReceipt",[hash]);if(receipt)return receipt;await new Promise(r=>setTimeout(r,4000));}throw new Error("확인이 지연됩니다. 같은 거래를 다시 보내지 마세요.");}
  async function execute(index){try{
    buttons().forEach(b=>b.disabled=true);if(!account||!actions[index])throw new Error("먼저 1번 검증을 하세요.");const before=await completed();if(before!==index)throw new Error(before>index?"이 단계는 이미 완료됐습니다.":"앞 단계를 먼저 완료하세요.");const accounts=await request("eth_accounts");if(!accounts[0]||accounts[0].toLowerCase()!==account.toLowerCase())throw new Error("연결 지갑이 변경되었습니다.");const action=actions[index],tx={from:account,to:RISK,value:"0x0",data:action.data};const gas=await request("eth_estimateGas",[tx]);status(`${index+2}번 단일 설정 거래입니다. 0 tBNB와 가스비만 확인하세요.`);const hash=await request("eth_sendTransaction",[{...tx,gas}]);const receipt=await waitReceipt(hash);if(BigInt(receipt.status)!==1n)throw new Error("설정 거래 실패");const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");saved[index]=hash;localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));$("txs").textContent=saved.filter(Boolean).join("\n");const next=await refresh();status(next===6?"전체 설정 성공. Governance Safe의 소유권 수락 단계만 남았습니다.":`${index+2}번 성공. 다음 한 단계가 활성화됐습니다.`,"ok");
  }catch(error){status(error.message||String(error),"error");await refresh().catch(()=>{});}}
  $("riskRegistry").textContent=RISK;$("executionRouter").textContent=ROUTER;$("connect").addEventListener("click",connect);buttons().forEach((b,i)=>b.addEventListener("click",()=>execute(i)));
})();
