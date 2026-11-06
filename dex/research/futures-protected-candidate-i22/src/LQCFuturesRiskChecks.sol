// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FuturesMathModule} from "./modules/FuturesMathModule.sol";
import {LiquidationCalculator} from "./modules/LiquidationCalculator.sol";
import {AdlCalculator} from "./modules/AdlCalculator.sol";
interface IRiskEngine {function mathModule()external view returns(address);function liquidationModule()external view returns(address);function adlModule()external view returns(address);function registry() external view returns(address);function vault() external view returns(address);function ledgerFactory() external view returns(address);function fundingProtectionReady() external view returns(bool);function fundingLedger() external view returns(address);function withdrawalVerifier() external view returns(address);}
interface IRiskVault {function engine() external view returns(address);function owner() external view returns(address);function residualBadDebt(address) external view returns(uint256);}
interface IRiskLedger {function epochBlocks()external view returns(uint256);}
library LQCFuturesRiskChecks {
 bytes32 internal constant ENGINE_HASH=0xe747a6e164cdc6d9956c52e8f378d9f7e29f43ef3f2b1830b4cf72438acedd81;bytes32 internal constant VAULT_HASH=0xb97549273502e5b25841122fd8eb8967d2381ce1ed0706cc7a6a1c0195755d5b;bytes32 internal constant FACTORY_HASH=0xdb9073cf006a668fa0d5d9305363a6296c0beb562ca886c76154078604825931;
 function _exec(bytes memory code) private pure returns(bytes memory){if(code.length<3)return new bytes(0);uint256 m=(uint256(uint8(code[code.length-2]))<<8)|uint256(uint8(code[code.length-1]));if(m+2>=code.length)return new bytes(0);uint256 n=code.length-m-2;assembly ("memory-safe"){mstore(code,n)}return code;}
 function verifiedDebt(address registry,address governance,address engine,address vault,address token) internal view returns(bool,uint256){
  bytes memory ec=_exec(engine.code);bytes memory vc=_exec(vault.code);if(ec.length!=19791||vc.length!=9791)return(false,0);
  // This preliminary view only locates a candidate immutable. No authentication succeeds until ALL hashes/words match.
  address factory;try IRiskEngine(engine).ledgerFactory{gas:10000}() returns(address a){factory=a;}catch{return(false,0);}
  address calcMath;address calcLiq;address calcAdl;try IRiskEngine(engine).mathModule{gas:10000}()returns(address a){calcMath=a;}catch{return(false,0);}try IRiskEngine(engine).liquidationModule{gas:10000}()returns(address a){calcLiq=a;}catch{return(false,0);}try IRiskEngine(engine).adlModule{gas:10000}()returns(address a){calcAdl=a;}catch{return(false,0);}
  bytes memory slots=hex"03a00204ab0104f003095c000cf40012d304180c021bff001e2000207a0121020526390427070427a00229d6042dd8052ee30032c901341e0135060035e70037670339e6013ad9003b2d04404300436403446b01448f04489e0149f0004b6601";
  for(uint256 i;i<slots.length;i+=3){uint256 o=(uint256(uint8(slots[i]))<<8)|uint256(uint8(slots[i+1]));uint256 word;assembly ("memory-safe"){word:=mload(add(add(ec,32),o))}uint8 kind=uint8(slots[i+2]);address expected=kind==0?registry:kind==1?vault:kind==2?factory:kind==3?calcMath:kind==4?calcLiq:calcAdl;if(word!=uint256(uint160(expected)))return(false,0);assembly ("memory-safe"){mstore(add(add(ec,32),o),0)}}
  if(calcMath.codehash!=0x1ed38a3fe459fc1b4762e9d7fa67ddaca30faa5ca4d6ec49b7ed6a621f481778||calcLiq.codehash!=0xf1e7005bcda72005d018fb716865ef7a86bd6afaa10818771c21df43b63ed6bf||calcAdl.codehash!=0xeac40a276fc371c1844c37e5fae6bbdc6926dfadbace92c143813b33ee98718c)return(false,0);
  if(keccak256(ec)!=ENGINE_HASH||keccak256(vc)!=VAULT_HASH)return(false,0);
  bytes memory fc=_exec(factory.code);if(fc.length!=17975)return(false,0);bytes memory offsets=hex"006800ad01a1";
  for(uint256 i;i<offsets.length;i+=2){uint256 o=(uint256(uint8(offsets[i]))<<8)|uint256(uint8(offsets[i+1]));uint256 word;assembly ("memory-safe"){word:=mload(add(add(fc,32),o))}if(word!=uint256(uint160(engine)))return(false,0);assembly ("memory-safe"){mstore(add(add(fc,32),o),0)}}
  if(keccak256(fc)!=FACTORY_HASH)return(false,0);
  try IRiskEngine(engine).registry() returns(address r){if(r!=registry)return(false,0);}catch{return(false,0);}
  try IRiskEngine(engine).vault() returns(address v){if(v!=vault)return(false,0);}catch{return(false,0);}
  try IRiskVault(vault).engine() returns(address e){if(e!=engine)return(false,0);}catch{return(false,0);}
  try IRiskVault(vault).owner() returns(address o){if(o!=governance)return(false,0);}catch{return(false,0);}
  if(!_fundingComponents(registry,engine,vault,factory))return(false,0);
  try IRiskEngine(engine).fundingProtectionReady() returns(bool ready){if(!ready)return(false,0);}catch{return(false,0);}
  try IRiskVault(vault).residualBadDebt(token) returns(uint256 d){return(true,d);}catch{return(false,0);}
 }

 function _component(address target,bytes32 expectedHash,uint256 size,bytes memory offsets,bytes32[] memory expected)private view returns(bool){bytes memory code=_exec(target.code);if(code.length!=size)return false;for(uint256 i;i<offsets.length;i+=3){uint256 o=(uint256(uint8(offsets[i]))<<8)|uint256(uint8(offsets[i+1]));uint256 kind=uint8(offsets[i+2]);bytes32 word;assembly ("memory-safe"){word:=mload(add(add(code,32),o))}if(word!=expected[kind])return false;assembly ("memory-safe"){mstore(add(add(code,32),o),0)}}return keccak256(code)==expectedHash;}
function _fundingComponents(address registry,address engine,address vault,address factory)private view returns(bool){address ledger;address verifier;uint256 blocks_;try IRiskEngine(engine).fundingLedger()returns(address a){ledger=a;}catch{return false;}try IRiskEngine(engine).withdrawalVerifier()returns(address a){verifier=a;}catch{return false;}if(ledger.code.length==0||verifier.code.length==0)return false;if(_exec(ledger.code).length!=9747)return false;try IRiskLedger(ledger).epochBlocks{gas:10000}()returns(uint256 n){blocks_=n;}catch{return false;}if(blocks_==0)return false;bytes32[] memory le=new bytes32[](7);le[0]=bytes32(uint256(uint160(engine)));le[1]=bytes32(uint256(uint160(vault)));le[2]=le[0];le[3]=engine.codehash;le[4]=vault.codehash;le[5]=le[3];le[6]=bytes32(blocks_);if(!_component(ledger,0x1eea75a91c1e35f6fb89d387be754c79fc95ee322b47f7f8854be9d2cda38c67,9747,hex"019301030306041d0304f500063a020929040c2c000d1706125306128900136a0215770615b105194f021ba2001bc5031c81011d12021d94021dcf011e3a021ec6021ee8051f11011f33041fcf01232701",le))return false;bytes32[] memory ve=new bytes32[](10);ve[0]=le[0];ve[1]=le[1];ve[2]=bytes32(uint256(uint160(registry)));ve[3]=bytes32(uint256(uint160(ledger)));ve[4]=bytes32(uint256(uint160(factory)));ve[5]=engine.codehash;ve[6]=vault.codehash;ve[7]=registry.codehash;ve[8]=ledger.codehash;ve[9]=factory.codehash;return _component(verifier,0xe37bb8387400b9cbe5d98012dffbe9b140fabae56af7275ec7ae5aea0ffe10a8,5984,hex"00c001012e0501660001aa0401f006022a0902620202d50202f900042e030a92010b4f030bb0070be8080cf7050d18000d75030d99010ece0610be0812780213730413f40414870416360416580916810316a30816cc0216ee07171701173906",ve);}
}
