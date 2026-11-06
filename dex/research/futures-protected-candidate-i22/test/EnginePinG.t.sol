// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {FinanceFixture} from './FinanceFixture.sol';
interface VmPin {function etch(address,bytes calldata) external;}
contract EnginePinGTest is FinanceFixture {
    function testGAllCurrentImmutableOccurrencesAndBindingsAuthenticated() public {
        VmPin v=VmPin(address(uint160(uint256(keccak256('hevm cheat code')))));
        (bool good,)=reg.verifiedResidualDebt(1);require(good);
        bytes memory original=address(engine).code;
        uint256[32] memory offsets=[uint256(928),1195,1264,2396,3316,4819,6156,7167,7712,8314,8450,9785,9991,10144,10710,11736,12003,13001,13342,13574,13799,14183,14822,15065,15149,16451,17252,17515,17551,18590,18928,19302];
        for(uint256 i;i<offsets.length;i++){
            bytes memory bad=abi.encodePacked(original);bad[offsets[i]+31]=bytes1(uint8(bad[offsets[i]+31])^1);v.etch(address(engine),bad);
            (bool accepted,)=reg.verifiedResidualDebt(1);require(!accepted);
        }
        v.etch(address(engine),original);(good,)=reg.verifiedResidualDebt(1);require(good);
    }
}
