(function () {
  "use strict";
  const CHAIN_ID="0x61", SIGNER="0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
  const QUOTER="0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2", ROUTER="0x1b81D678ffb9C0263b24A97847620C99d213eB14";
  const BUNDLE_URL="../deployments/router2-quote-stack-stage1-bsc-testnet-97.json", STORAGE_KEY="lqc-router2-v3-adapter-chain97-v1";
  const $=id=>document.getElementById(id); let account=null, deployData=null;
  function status(message,type="info"){$("status").textContent=message;$("status").dataset.type=type;}
  async function request(method,params=[]){if(!window.ethereum)throw new Error("TokenPocket DApp 브라우저에서 열어주세요.");return window.ethereum.request({method,params});}
  function addressResult(data){if(!data||data.length<66)throw new Error("주소 읽기 실패");return `0x${data.slice(-40)}`;}
  function uintResult(data){if(!data||data==="0x")throw new Error("숫자 읽기 실패");return BigInt(data);}
  async function call(to,data){return request("eth_call",[{to,data},"latest"]);}
  async function verifyAdapter(address){
    const code=await request("eth_getCode",[address,"latest"]);if(!code||code==="0x")throw new Error("Adapter 코드가 없습니다.");
    const [q,r,o,h]=await Promise.all([call(address,"0xe20dccb2"),call(address,"0xc31c9c07"),call(address,"0x8da5cb5b"),call(address,"0x3f888cbb")]);
    if(addressResult(q).toLowerCase()!==QUOTER.toLowerCase()||addressResult(r).toLowerCase()!==ROUTER.toLowerCase()||addressResult(o).toLowerCase()!==SIGNER.toLowerCase()||uintResult(h)!==1n)throw new Error("배포된 Adapter 설정이 확정값과 다릅니다.");
  }
  async function existing(){const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");if(!saved)return false;await verifyAdapter(saved.address);$("adapter").textContent=saved.address;$("tx").textContent=saved.hash;status("V3 Adapter 배포 및 4개 생성자 설정 확인 완료. 다시 배포하지 마세요.","ok");return true;}
  async function connect(){try{
    $("deploy").disabled=true;if((await request("eth_chainId")).toLowerCase()!==CHAIN_ID)throw new Error("BSC Testnet(chain 97)이 아닙니다.");
    for(const address of [QUOTER,ROUTER]){const code=await request("eth_getCode",[address,"latest"]);if(!code||code==="0x")throw new Error("공식 PancakeSwap 계약을 확인할 수 없습니다.");}
    const accounts=await request("eth_requestAccounts");if(!accounts[0]||accounts[0].toLowerCase()!==SIGNER.toLowerCase())throw new Error("Signer 1 지갑으로 연결하세요.");account=accounts[0];$("wallet").textContent=account;if(await existing())return;
    const bundle=await(await fetch(BUNDLE_URL,{cache:"no-store"})).json();if(bundle.network.chainId!==97||bundle.signer.toLowerCase()!==SIGNER.toLowerCase()||bundle.orderedActions.length!==2||bundle.orderedActions[1].action!=="deploy-v3-adapter")throw new Error("배포 묶음 검증 실패");
    deployData=bundle.orderedActions[1].data;if(!/^0x[0-9a-f]+$/.test(deployData)||deployData.length!==10008)throw new Error("Adapter 배포 데이터 검증 실패");
    $("deploy").disabled=false;status("검증 완료. 공식 엔드포인트·Signer 1·최대 1홉의 V3 Adapter 하나만 배포합니다.","ok");
  }catch(error){status(error.message||String(error),"error");}}
  async function waitReceipt(hash){for(let i=0;i<90;i+=1){const r=await request("eth_getTransactionReceipt",[hash]);if(r)return r;await new Promise(x=>setTimeout(x,4000));}throw new Error("확인 지연. 다시 배포하지 마세요.");}
  async function deploy(){try{
    $("deploy").disabled=true;if(!deployData)throw new Error("먼저 1번 검증을 하세요.");if(await existing())return;const accounts=await request("eth_accounts");if(!accounts[0]||accounts[0].toLowerCase()!==account.toLowerCase())throw new Error("지갑이 변경되었습니다.");
    const tx={from:account,value:"0x0",data:deployData};const gas=await request("eth_estimateGas",[tx]);status("V3 Adapter 단일 배포 거래입니다. 가스비를 확인하세요.");const hash=await request("eth_sendTransaction",[{...tx,gas}]);$("tx").textContent=hash;const receipt=await waitReceipt(hash);
    if(BigInt(receipt.status)!==1n||!receipt.contractAddress)throw new Error("V3 Adapter 배포 실패");await verifyAdapter(receipt.contractAddress);localStorage.setItem(STORAGE_KEY,JSON.stringify({address:receipt.contractAddress,hash}));$("adapter").textContent=receipt.contractAddress;status("V3 Adapter 배포 성공. 공식 엔드포인트·Signer 1·최대 1홉 확인 완료.","ok");
  }catch(error){status(error.message||String(error),"error");}}
  $("quoter").textContent=QUOTER;$("router").textContent=ROUTER;$("owner").textContent=SIGNER;$("connect").addEventListener("click",connect);$("deploy").addEventListener("click",deploy);
})();
