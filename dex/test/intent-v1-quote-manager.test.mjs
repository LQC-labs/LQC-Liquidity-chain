import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source=`intent-v1/${name}`)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC Intent v1 Solver quote competition",function(){
  this.timeout(30000);
  const mnemonic="test test test test test test test test test test test junk",types={SolverQuote:[
    {name:"intentHash",type:"bytes32"},{name:"solver",type:"address"},{name:"dexId",type:"bytes32"},{name:"amountOut",type:"uint256"},{name:"solverFeeOut",type:"uint256"},{name:"gasCostOut",type:"uint256"},{name:"routeHash",type:"bytes32"},{name:"issuedAt",type:"uint256"},{name:"deadline",type:"uint256"},{name:"nonce",type:"uint256"}
  ]};
  let provider,owner,guardian,outsider,solverA,solverB,walletA,walletB,manager,registry,bond,chainId,now,intentHash;

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({wallet:{mnemonic},chain:{chainId:31337},logging:{quiet:true}}));owner=await provider.getSigner(0);guardian=await provider.getSigner(1);outsider=await provider.getSigner(2);solverA=await provider.getSigner(3);solverB=await provider.getSigner(4);walletA=ethers.HDNodeWallet.fromPhrase(mnemonic,undefined,"m/44'/60'/0'/0/3");walletB=ethers.HDNodeWallet.fromPhrase(mnemonic,undefined,"m/44'/60'/0'/0/4");chainId=(await provider.getNetwork()).chainId;now=(await provider.getBlock("latest")).timestamp;intentHash=ethers.id("intent-quote-competition");const deploy=async(name,source,args=[])=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,owner).deploy(...args);await c.waitForDeployment();return c};bond=await deploy("MockERC20","mocks/MockERC20",["Bond","BOND"]);registry=await deploy("LQCSolverRegistry",undefined,[await bond.getAddress(),await owner.getAddress(),await guardian.getAddress(),100n]);manager=await deploy("LQCQuoteManager",undefined,[await owner.getAddress(),await guardian.getAddress()]);await(await manager.setSolverRegistry(await registry.getAddress())).wait();for(const solver of[solverA,solverB]){await(await bond.mint(await solver.getAddress(),100n)).wait();await(await bond.connect(solver).approve(await registry.getAddress(),100n)).wait();await(await registry.connect(solver).depositBond(100n)).wait();await(await registry.configureSolver(await solver.getAddress(),true,2000n)).wait()}
  });

  const domain=async()=>({name:"LQC Solver Quote Manager",version:"1",chainId,verifyingContract:await manager.getAddress()});
  async function quote(solver,index,overrides={}){return{intentHash,solver:await solver.getAddress(),dexId:ethers.id(`DEX_${index}`),amountOut:1000n,solverFeeOut:10n,gasCostOut:10n,routeHash:ethers.id(`route-${index}`),issuedAt:BigInt(now),deadline:BigInt(now+60),nonce:BigInt(index),...overrides}}
  const sign=async(q,wallet)=>wallet.signTypedData(await domain(),types,q);

  it("selects the highest verified net output instead of the highest gross quote",async function(){
    const a=await quote(solverA,1,{amountOut:1050n,solverFeeOut:50n,gasCostOut:30n}),b=await quote(solverB,2,{amountOut:1020n,solverFeeOut:10n,gasCostOut:10n}),selected=await manager.selectBestQuote(intentHash,900n,[a,b],[await sign(a,walletA),await sign(b,walletB)]);assert.equal(selected.index,1n);assert.equal(selected.solver,await solverB.getAddress());assert.equal(selected.amountOut,1020n);assert.equal(selected.netAmountOut,1000n);
  });

  it("uses quote hash as an order-independent deterministic tie breaker",async function(){
    const a=await quote(solverA,1),b=await quote(solverB,2),sigA=await sign(a,walletA),sigB=await sign(b,walletB),forward=await manager.selectBestQuote(intentHash,900n,[a,b],[sigA,sigB]),reverse=await manager.selectBestQuote(intentHash,900n,[b,a],[sigB,sigA]);assert.equal(forward.solver,reverse.solver);assert.equal(forward.quoteHash,reverse.quoteHash);assert.equal(forward.netAmountOut,980n);
  });

  it("isolates forged, unauthorized and overlong candidates while rejecting duplicates and no-valid sets",async function(){
    const a=await quote(solverA,1),b=await quote(solverB,2),sigA=await sign(a,walletA),sigB=await sign(b,walletB);assert.equal((await manager.selectBestQuote(intentHash,900n,[a,b],[await sign(a,walletB),sigB])).solver,await solverB.getAddress());await assert.rejects(manager.selectBestQuote(intentHash,900n,[a,{...b,solver:a.solver}],[sigA,sigB]));await(await registry.configureSolver(await solverB.getAddress(),false,2000n)).wait();assert.equal((await manager.selectBestQuote(intentHash,900n,[a,b],[sigA,sigB])).solver,await solverA.getAddress());await(await registry.configureSolver(await solverB.getAddress(),true,2000n)).wait();const overlong={...b,deadline:BigInt(now+121)};assert.equal((await manager.selectBestQuote(intentHash,900n,[a,overlong],[sigA,await sign(overlong,walletB)])).solver,await solverA.getAddress());await provider.send("evm_increaseTime",[61]);await provider.send("evm_mine",[]);await assert.rejects(manager.selectBestQuote(intentHash,900n,[a,b],[sigA,sigB]));
  });

  it("pauses immediately through guardian but resumes only through owner",async function(){
    const a=await quote(solverA,1),b=await quote(solverB,2),signatures=[await sign(a,walletA),await sign(b,walletB)];await(await manager.connect(guardian).setPaused(true)).wait();await assert.rejects(manager.selectBestQuote(intentHash,900n,[a,b],signatures));await assert.rejects(manager.connect(guardian).setPaused(false));await(await manager.setPaused(false)).wait();assert.equal((await manager.selectBestQuote(intentHash,900n,[a,b],signatures)).netAmountOut,980n);await assert.rejects(manager.connect(outsider).setSolverRegistry(await registry.getAddress()));
  });
});
