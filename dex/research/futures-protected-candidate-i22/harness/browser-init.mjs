import {makeHarness} from "./fake-ethereum.mjs";
const truth=await(await fetch("/ENGINE-POLICY-TRUTH.json")).json();
const h=makeHarness({kind:window.__I20_KIND,mode:window.__I20_MODE,truth,doc:document});
window.ethereum=h.ethereum;window.ethers=h.ethers;window.__fixture=h;
const module=await import("/dex/app/futures/mobile-testnet-"+(window.__I20_KIND==="open"?"open":"close")+"-position.js");
window.__i20Page=module.page;window.__I20_READY=true;

