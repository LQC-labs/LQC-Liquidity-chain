// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Audit-only ERC-20 that can attempt a gateway callback or mint residual dust.
contract MockProofGatewayAttackToken {
    string public constant name="Attack Token"; string public constant symbol="ATK"; uint8 public constant decimals=18;
    uint256 public totalSupply; mapping(address=>uint256) public balanceOf; mapping(address=>mapping(address=>uint256)) public allowance;
    address public callbackCaller; address public callbackTarget; bytes public callbackData; bool public callbackAttempted; bool public callbackSucceeded; bytes4 public callbackRevertSelector;
    address public dustTarget; bool public dustOnZeroApproval;
    event Transfer(address indexed from,address indexed to,uint256 value); event Approval(address indexed owner,address indexed spender,uint256 value);
    function mint(address to,uint256 amount) external{totalSupply+=amount;balanceOf[to]+=amount;emit Transfer(address(0),to,amount);}
    function configureCallback(address caller,address target,bytes calldata data) external{callbackCaller=caller;callbackTarget=target;callbackData=data;}
    function configureResidualDust(address target,bool enabled) external{dustTarget=target;dustOnZeroApproval=enabled;}
    function approve(address spender,uint256 amount) external returns(bool){allowance[msg.sender][spender]=amount;emit Approval(msg.sender,spender,amount);if(amount==0&&dustOnZeroApproval&&msg.sender==dustTarget){totalSupply+=1;balanceOf[msg.sender]+=1;emit Transfer(address(0),msg.sender,1);}return true;}
    function transfer(address to,uint256 amount) external returns(bool){_transfer(msg.sender,to,amount);return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){uint256 allowed=allowance[from][msg.sender];if(allowed!=type(uint256).max)allowance[from][msg.sender]=allowed-amount;_transfer(from,to,amount);if(msg.sender==callbackCaller&&callbackTarget!=address(0)&&!callbackAttempted){callbackAttempted=true;bytes memory reason;(callbackSucceeded,reason)=callbackTarget.call(callbackData);if(!callbackSucceeded&&reason.length>=4)callbackRevertSelector=bytes4(reason);}return true;}
    function _transfer(address from,address to,uint256 amount) private{balanceOf[from]-=amount;balanceOf[to]+=amount;emit Transfer(from,to,amount);}
}



