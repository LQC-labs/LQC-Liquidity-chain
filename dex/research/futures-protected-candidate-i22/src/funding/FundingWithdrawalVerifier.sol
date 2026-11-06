// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IWEngine {
 function registry()external view returns(address);function vault()external view returns(address);function fundingLedger()external view returns(address);function ledgerFactory()external view returns(address);function withdrawalVerifier()external view returns(address);
 function withdrawalProtectionEnabled()external view returns(bool);function fundingInventoryInitialized()external view returns(bool);
 function fundingMarketLength(address,address)external view returns(uint256);function fundingMarketAt(address,address,uint256)external view returns(uint256);function fundingMarketIndex(address,uint256)external view returns(uint256);
 function fundingActiveCount(address,address)external view returns(uint256);function fundingActiveSize(address,address)external view returns(uint256);function fundingMarketCommitment(address,address)external view returns(bytes32);function negativeRemainderHolds(address,address)external view returns(uint256);
 function fundingRemainderRay(address,uint256,address)external view returns(int256);function previewFundingDomain(address,uint256,address)external view returns(int256,int256);
 function positions(address,uint256)external view returns(uint256,uint256,uint256,bool,bool);
}
interface IWVault {function engine()external view returns(address);function owner()external view returns(address);function fundingWithdrawalProtection()external view returns(bool);function protectionEngineHash()external view returns(bytes32);function protectionLedger()external view returns(address);function protectionLedgerHash()external view returns(bytes32);}
interface IWRegistry {function owner()external view returns(address);function riskEngine()external view returns(address);function riskVault()external view returns(address);function marketCount()external view returns(uint256);function marketCollateral(uint256)external view returns(address);function markets(uint256)external view returns(bytes32,address,address,address,uint32,uint32,bool);}
interface IWLedger {function engine()external view returns(address);function adapter()external view returns(address);function vault()external view returns(address);function engineHash()external view returns(bytes32);function vaultHash()external view returns(bytes32);function adapterHash()external view returns(bytes32);function accountPayable(address,address)external view returns(uint256);}
interface IWFactory {function deployedLedger()external view returns(address);function deployedWithdrawalVerifier()external view returns(address);}
contract FundingWithdrawalVerifier {
 uint256 public constant MAX_MARKETS=16;
 address public immutable engine;address public immutable vault;address public immutable registry;address public immutable ledger;address public immutable factory;
 bytes32 public immutable engineHash;bytes32 public immutable vaultHash;bytes32 public immutable registryHash;bytes32 public immutable ledgerHash;bytes32 public immutable factoryHash;
 error InvalidBinding();error IncompleteInventory();
 constructor(address e){engine=e;IWEngine x=IWEngine(e);vault=x.vault();registry=x.registry();ledger=x.fundingLedger();factory=x.ledgerFactory();engineHash=e.codehash;vaultHash=vault.codehash;registryHash=registry.codehash;ledgerHash=ledger.codehash;factoryHash=factory.codehash;}
 function bindingsValid() external view returns(bool){return _bindingsValid();}
 function _bindingsValid() private view returns(bool){
  if(engine.codehash!=engineHash||vault.codehash!=vaultHash||registry.codehash!=registryHash||ledger.codehash!=ledgerHash||factory.codehash!=factoryHash)return false;
  IWEngine e=IWEngine(engine);IWLedger l=IWLedger(ledger);IWVault v=IWVault(vault);
  return e.withdrawalProtectionEnabled()&&e.fundingInventoryInitialized()&&e.withdrawalVerifier()==address(this)&&e.fundingLedger()==ledger&&e.ledgerFactory()==factory&&IWFactory(factory).deployedWithdrawalVerifier()==address(this)&&IWFactory(factory).deployedLedger()==ledger&&v.engine()==engine&&v.owner()==IWRegistry(registry).owner()&&v.fundingWithdrawalProtection()&&v.protectionEngineHash()==engineHash&&v.protectionLedger()==ledger&&v.protectionLedgerHash()==ledgerHash&&l.engine()==engine&&l.adapter()==engine&&l.vault()==vault&&l.engineHash()==engineHash&&l.vaultHash()==vaultHash&&l.adapterHash()==engineHash;
 }
 function required(address account,address token) external view returns(uint256){
  IWEngine e=IWEngine(engine);IWLedger l=IWLedger(ledger);IWRegistry reg=IWRegistry(registry);
  if(!_bindingsValid()||reg.riskEngine()!=engine||reg.riskVault()!=vault)revert InvalidBinding();
  uint256 count=e.fundingMarketLength(account,token);if(count>MAX_MARKETS||count!=e.fundingActiveCount(account,token))revert IncompleteInventory();
  uint256 fractional=e.negativeRemainderHolds(account,token);uint256 pending;uint256 sizes;bytes32 commitment;
  for(uint256 k;k<count;k++){
   uint256 id=e.fundingMarketAt(account,token,k);(,uint256 size,,,bool open)=e.positions(account,id);address collateral=reg.marketCollateral(id);
   if(id==0||id>reg.marketCount()||collateral!=token||!open||size==0||e.fundingMarketIndex(account,id)!=k+1)revert IncompleteInventory();
   sizes+=size;commitment^=keccak256(abi.encode(account,token,id));if(e.fundingRemainderRay(account,id,token)<0)fractional-=1;
   (int256 q,int256 r)=e.previewFundingDomain(account,id,token);if(q<0)pending+=uint256(-q);if(r<0)fractional+=1;
  }
  if(sizes!=e.fundingActiveSize(account,token)||commitment!=e.fundingMarketCommitment(account,token))revert IncompleteInventory();
  return l.accountPayable(account,token)+pending+fractional;
 }
}
