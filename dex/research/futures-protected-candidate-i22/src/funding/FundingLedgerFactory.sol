// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FundingLedger} from './FundingLedger.sol';
import {FundingWithdrawalVerifier} from './FundingWithdrawalVerifier.sol';
interface IFundingEngineVault {function vault() external view returns(address);}
contract FundingLedgerFactory {
    address public immutable engine;
    address public deployedLedger;
    address public deployedWithdrawalVerifier;
    constructor(address e){engine=e;}
    function create(uint256 epochBlocks) external returns(address){
        require(msg.sender==engine&&deployedLedger==address(0),'factory forbidden');
        address v=IFundingEngineVault(engine).vault();
        deployedLedger=address(new FundingLedger(engine,v,engine,engine.codehash,v.codehash,engine.codehash,epochBlocks));return deployedLedger;
    }
    function createWithdrawalVerifier() external returns(address){require(msg.sender==engine&&deployedLedger!=address(0)&&deployedWithdrawalVerifier==address(0),'factory forbidden');deployedWithdrawalVerifier=address(new FundingWithdrawalVerifier(engine));return deployedWithdrawalVerifier;}
}
