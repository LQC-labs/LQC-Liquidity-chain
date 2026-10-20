// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {SettlementMath as M} from "../local-vnext/SettlementMath.sol";

/// @dev TEST ONLY. Unrestricted setters/mint are never collateral/oracle qualification.
contract LocalVNextToken {
    uint8 public immutable decimals;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    bool public frozen; bool public taxed;
    address public callback; bytes public callbackData; bool public callbackBlocked;
    constructor(uint8 d){decimals=d;}
    function mint(address a,uint256 n) external {balanceOf[a]+=n;}
    function setFrozen(bool x) external {frozen=x;}
    function setTaxed(bool x) external {taxed=x;}
    function setCallback(address a,bytes calldata data) external {callback=a;callbackData=data;}
    function approve(address a,uint256 n) external returns(bool){allowance[msg.sender][a]=n;return true;}
    function transfer(address a,uint256 n) external returns(bool){_move(msg.sender,a,n);return true;}
    function transferFrom(address a,address b,uint256 n) external returns(bool){allowance[a][msg.sender]-=n;_move(a,b,n);return true;}
    function _move(address a,address b,uint256 n) private {
        require(!frozen,"FROZEN");balanceOf[a]-=n;balanceOf[b]+=taxed?n-1:n;
        if(callback!=address(0)){(bool ok,)=callback.call(callbackData);callbackBlocked=!ok;}
    }
}
contract LocalVNextOracle {
    uint256 public price;uint256 public updatedAt;bool public broken;
    function set(uint256 p,uint256 t) external {price=p;updatedAt=t;}
    function setBroken(bool x) external {broken=x;}
    function getPrice(address) external view returns(uint256,uint256){require(!broken,"ORACLE_UNAVAILABLE");return(price,updatedAt);}
}
contract LocalVNextMathHarness {
    function fundingAllocation(uint256 u,uint256 p,uint256 f) external pure returns(uint256,uint256,uint256){return M.proportionalFunding(u,p,f);}

    // TEST ONLY study storage. No custody, LP shares, user settlement or production activation.
    struct StudyBucket {M.Fraction gain;M.Fraction loss;M.Fraction pnl;M.Fraction funding;uint256 paid;}
    mapping(bytes32=>StudyBucket) private study;
    mapping(bytes32=>bool) public seen;
    mapping(bytes32=>address) public studyOwner;
    mapping(bytes32=>bool) public studyClosed;
    uint256 public bucketCount;
    function legs(uint256 q,uint256 e,uint256 p,int256 f,bool l,uint256 c,uint8 d) external pure returns(M.Fraction memory,M.Fraction memory,M.Fraction memory){return M.experimentalLegs(q,e,p,f,l,c,d);}
    function studyKey(bytes32 position,uint256 entry,uint256 collateral,uint8 dec) public view returns(bytes32){return keccak256(abi.encode(msg.sender,position,entry,collateral,dec));}
    function record(bytes32 position,uint256 q,uint256 e,uint256 p,int256 f,bool l,uint256 c,uint8 d) external returns(bytes32 key){
        require(!studyClosed[keccak256(abi.encode(msg.sender,position))],"STUDY_CLOSED");
        key=studyKey(position,e,c,d);StudyBucket storage b=study[key];
        if(!seen[key]){seen[key]=true;studyOwner[key]=msg.sender;bucketCount++;b.gain=M.Fraction(0,1);b.loss=M.Fraction(0,1);b.pnl=M.Fraction(0,1);b.funding=M.Fraction(0,1);}
        (M.Fraction memory pnl_,M.Fraction memory fund_,M.Fraction memory net)=M.experimentalLegs(q,e,p,f,l,c,d);
        b.pnl=M.addFraction(b.pnl,pnl_);b.funding=M.addFraction(b.funding,fund_);
        if(net.n>=0)b.gain=M.addFraction(b.gain,net);else b.loss=M.addFraction(b.loss,M.fraction(-net.n,net.d));
    }
    function studyBucket(bytes32 key) external view returns(StudyBucket memory){return study[key];}
    function studyAmounts(bytes32 key) public view returns(uint256 gain,uint256 loss,uint256 refundReserve,uint256 spendableLoss){
        StudyBucket storage b=study[key];if(!seen[key])return(0,0,0,0);
        gain=uint256(b.gain.n)/b.gain.d;uint256 n=uint256(b.loss.n);spendableLoss=n/b.loss.d;loss=spendableLoss+(n%b.loss.d==0?0:1);
        // Entire rounding unit stays excluded from LP spendable funds: part LP fraction, part user refund.
        refundReserve=loss-spendableLoss;
    }
    function studyClaim(bytes32 key) external returns(uint256 amount){
        require(studyOwner[key]==msg.sender,"STUDY_OWNER");
        // No token transfer; test repeated entitlement accounting only. Production request path stays blocked.
        (uint256 gain,,,)=studyAmounts(key);amount=gain-study[key].paid;study[key].paid=gain;
    }
    function studyPartialClaim(bytes32 key,uint256 amount) external {
        require(studyOwner[key]==msg.sender,"STUDY_OWNER");(uint256 gain,,,)=studyAmounts(key);
        require(amount<=gain-study[key].paid,"STUDY_ENTITLEMENT");study[key].paid+=amount;
    }
    function finishStudy(bytes32 position) external {studyClosed[keccak256(abi.encode(msg.sender,position))]=true;}
    function aggregateDifferentDenominators() external pure {revert("POLICY_BLOCKED");}
    function claimFraction() external pure {revert("POLICY_BLOCKED");}
    function mulDiv(uint256 x,uint256 y,uint256 d,bool up) external pure returns(uint256){return M.mulDiv(x,y,d,up);}
    function pnl(uint256 n,uint256 a,uint256 b,bool l) external pure returns(int256){return M.pnl27(n,a,b,l);}
    function convert(int256 u,uint256 p,uint8 d) external pure returns(int256,uint256,uint256){return M.tokens(u,p,d);}
    function value(uint256 n,uint256 p,uint8 d) external pure returns(uint256){return M.usd18(n,p,d);}
}
