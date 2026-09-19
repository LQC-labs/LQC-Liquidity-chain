// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract IntentE2EToken {
    string public name="Intent E2E Token"; string public symbol="IET"; uint8 public decimals=18;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    function mint(address to,uint256 amount) external {balanceOf[to]+=amount;}
    function approve(address spender,uint256 amount) external returns(bool){allowance[msg.sender][spender]=amount;return true;}
    function transfer(address to,uint256 amount) external returns(bool){_transfer(msg.sender,to,amount);return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){
        uint256 allowed=allowance[from][msg.sender];require(allowed>=amount,"allowance");
        if(allowed!=type(uint256).max)allowance[from][msg.sender]=allowed-amount;
        _transfer(from,to,amount);return true;
    }
    function _transfer(address from,address to,uint256 amount) private {
        require(to!=address(0)&&balanceOf[from]>=amount,"transfer");
        balanceOf[from]-=amount;balanceOf[to]+=amount;
    }
}

contract IntentE2ERegistry {
    struct Dex {address adapter;bool enabled;uint32 priority;}
    mapping(bytes32=>Dex) private dexes;
    function setDex(bytes32 dexId,address adapter,bool enabled) external {dexes[dexId]=Dex(adapter,enabled,1);}
    function getDex(bytes32 dexId) external view returns(address adapter,bool enabled,uint32 priority){
        Dex memory d=dexes[dexId];return(d.adapter,d.enabled,d.priority);
    }
    function dexCount() external pure returns(uint256){return 0;}
    function dexIdAt(uint256) external pure returns(bytes32){revert();}
}

contract IntentE2EAdapter {
    function supportsExecution() external pure returns(bool){return true;}
    function executeExactInput(address tokenIn,address tokenOut,uint256 amountIn,uint256,address recipient,uint256,bytes calldata routeData) external returns(uint256 amountOut){
        amountOut=abi.decode(routeData,(uint256));
        require(IntentE2EToken(tokenIn).transferFrom(msg.sender,address(this),amountIn),"input");
        require(IntentE2EToken(tokenOut).transfer(recipient,amountOut),"output");
    }
}
