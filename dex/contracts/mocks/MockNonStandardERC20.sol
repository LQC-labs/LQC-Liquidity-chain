// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Audit-only ERC-20 that emits selectable return-data shapes.
contract MockNonStandardERC20 {
    uint8 public returnMode;
    bool public requireZeroFirst;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function setBehavior(uint8 mode, bool zeroFirst) external {
        returnMode = mode;
        requireZeroFirst = zeroFirst;
    }

    function approve(address spender, uint256 amount) external {
        if (requireZeroFirst && allowance[msg.sender][spender] != 0 && amount != 0) {
            assembly { mstore(0, 0) return(0, 32) }
        }
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        uint8 mode = returnMode;
        assembly {
            switch mode
            case 1 { mstore(0, 0) return(0, 32) }
            case 2 { return(0, 0) }
            case 3 { mstore8(0, 1) return(0, 1) }
            case 4 { mstore(0, 1) mstore(32, 1) return(0, 64) }
            default { mstore(0, 1) return(0, 32) }
        }
    }

    function transfer(address to, uint256 amount) external {
        _transfer(msg.sender, to, amount);
        uint8 mode = returnMode;
        assembly {
            switch mode
            case 1 { mstore(0, 0) return(0, 32) }
            case 2 { return(0, 0) }
            case 3 { mstore8(0, 1) return(0, 1) }
            case 4 { mstore(0, 1) mstore(32, 1) return(0, 64) }
            default { mstore(0, 1) return(0, 32) }
        }
    }

    function transferFrom(address from, address to, uint256 amount) external {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        uint8 mode = returnMode;
        assembly {
            switch mode
            case 1 { mstore(0, 0) return(0, 32) }
            case 2 { return(0, 0) }
            case 3 { mstore8(0, 1) return(0, 1) }
            case 4 { mstore(0, 1) mstore(32, 1) return(0, 64) }
            default { mstore(0, 1) return(0, 32) }
        }
    }

    function _transfer(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

}
