// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// M20 research-only 6-decimal collateral. No real USDT/USDC or on-chain deployment.
contract M20MockCollateral6 {
    string public constant name = "M20 Synthetic Six Decimal";
    string public constant symbol = "mUSD6";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from,address indexed to,uint256 amount);
    event Approval(address indexed owner,address indexed spender,uint256 amount);

    function mint(address account,uint256 amount) external {
        totalSupply += amount;
        balanceOf[account] += amount;
        emit Transfer(address(0),account,amount);
    }
    function approve(address spender,uint256 amount) external returns(bool) {
        allowance[msg.sender][spender]=amount;
        emit Approval(msg.sender,spender,amount);
        return true;
    }
    function transfer(address recipient,uint256 amount) external returns(bool) {
        _transfer(msg.sender,recipient,amount);
        return true;
    }
    function transferFrom(address sender,address recipient,uint256 amount) external returns(bool) {
        uint256 allowed=allowance[sender][msg.sender];
        if(allowed!=type(uint256).max)allowance[sender][msg.sender]=allowed-amount;
        _transfer(sender,recipient,amount);
        return true;
    }
    function _transfer(address sender,address recipient,uint256 amount) internal {
        balanceOf[sender]-=amount;
        balanceOf[recipient]+=amount;
        emit Transfer(sender,recipient,amount);
    }
}
