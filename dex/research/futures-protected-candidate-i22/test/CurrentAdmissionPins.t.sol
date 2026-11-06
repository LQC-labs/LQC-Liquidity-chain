// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtectedFixture} from './ProtectedFixture.sol';
interface VmI10Pins {function etch(address,bytes calldata) external;}
contract CurrentAdmissionPinsTest is ProtectedFixture {
 function testI13EveryEngineAndFactoryImmutableWordAuthenticated() public {
  VmI10Pins v=VmI10Pins(address(uint160(uint256(keccak256('hevm cheat code')))));bytes memory original=address(engine).code;uint256[32] memory offsets=[uint256(928),1195,1264,2396,3316,4819,6156,7167,7712,8314,8450,9785,9991,10144,10710,11736,12003,13001,13342,13574,13799,14183,14822,15065,15149,16451,17252,17515,17551,18590,18928,19302];
  for(uint256 k;k<offsets.length;k++){bytes memory bad=abi.encodePacked(original);bad[offsets[k]+31]=bytes1(uint8(bad[offsets[k]+31])^1);v.etch(address(engine),bad);(bool verified,)=reg.verifiedResidualDebt(1);require(!verified);}v.etch(address(engine),original);
  address factory=address(engine.ledgerFactory());bytes memory fc=factory.code;uint256[3] memory fo=[uint256(104),173,417];
  for(uint256 k;k<fo.length;k++){bytes memory bad=abi.encodePacked(fc);bad[fo[k]+31]=bytes1(uint8(bad[fo[k]+31])^1);v.etch(factory,bad);(bool verified,)=reg.verifiedResidualDebt(1);require(!verified);}v.etch(factory,fc);(bool good,)=reg.verifiedResidualDebt(1);require(good);
 }

 function testI13EveryFundingLedgerImmutableAuthenticated() public {VmI10Pins v=VmI10Pins(address(uint160(uint256(keccak256("hevm cheat code")))));address target=address(engine.fundingLedger());bytes memory original=target.code;uint256[27] memory offsets=[uint256(403),771,1053,1269,1594,2345,3116,3351,4691,4745,4970,5495,5553,6479,7074,7109,7297,7442,7572,7631,7738,7878,7912,7953,7987,8143,8999];for(uint256 k;k<offsets.length;k++){bytes memory bad=abi.encodePacked(original);bad[offsets[k]+31]=bytes1(uint8(bad[offsets[k]+31])^1);v.etch(target,bad);(bool ok,)=reg.verifiedResidualDebt(1);require(!ok);}v.etch(target,original);(bool good,)=reg.verifiedResidualDebt(1);require(good);}

 function testI13EveryFundingWithdrawalVerifierImmutableAuthenticated() public {VmI10Pins v=VmI10Pins(address(uint160(uint256(keccak256("hevm cheat code")))));address target=address(engine.withdrawalVerifier());bytes memory original=target.code;uint256[32] memory offsets=[uint256(192),302,358,426,496,554,610,725,761,1070,2706,2895,2992,3048,3319,3352,3445,3481,3790,4286,4728,4979,5108,5255,5686,5720,5761,5795,5836,5870,5911,5945];for(uint256 k;k<offsets.length;k++){bytes memory bad=abi.encodePacked(original);bad[offsets[k]+31]=bytes1(uint8(bad[offsets[k]+31])^1);v.etch(target,bad);(bool ok,)=reg.verifiedResidualDebt(1);require(!ok);}v.etch(target,original);(bool good,)=reg.verifiedResidualDebt(1);require(good);}
}
