// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Liquidity Chain Token
/// @notice Fixed-supply ERC-20 for the approved 1 billion LQC token design.
/// @dev The full supply is created once at deployment. There is no owner, mint,
///      pause, blacklist, upgrade, fee, or balance-recovery authority.
contract LQCToken {
    string public constant name = "Liquidity Chain";
    string public constant symbol = "LQC";
    uint8 public constant decimals = 18;
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    uint256 public immutable totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(address allocationController) {
        if (allocationController == address(0)) revert ZeroAddress();
        totalSupply = MAX_SUPPLY;
        balanceOf[allocationController] = MAX_SUPPLY;
        emit Transfer(address(0), allocationController, MAX_SUPPLY);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();
        if (allowed != type(uint256).max) {
            unchecked { allowance[from][msg.sender] = allowed - amount; }
            emit Approval(from, msg.sender, allowed - amount);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = balance - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
