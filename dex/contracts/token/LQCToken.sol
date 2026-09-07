// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LQC Token
/// @notice Fixed-supply, burnable BEP-20/ERC-20 token. The complete supply is
/// minted once at deployment; no owner, administrator, tax, blacklist, pause,
/// proxy, or post-deployment mint function exists.
contract LQCToken {
    string public constant name = "Liquidity Chain";
    string public constant symbol = "LQC";
    uint8 public constant decimals = 18;
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(address initialHolder) {
        if (initialHolder == address(0)) revert ZeroAddress();
        totalSupply = MAX_SUPPLY;
        balanceOf[initialHolder] = MAX_SUPPLY;
        emit Transfer(address(0), initialHolder, MAX_SUPPLY);
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
        uint256 approved = allowance[from][msg.sender];
        if (approved < amount && approved != type(uint256).max) revert InsufficientAllowance();
        if (approved != type(uint256).max) {
            allowance[from][msg.sender] = approved - amount;
            emit Approval(from, msg.sender, approved - amount);
        }
        _transfer(from, to, amount);
        return true;
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function burnFrom(address account, uint256 amount) external {
        uint256 approved = allowance[account][msg.sender];
        if (approved < amount && approved != type(uint256).max) revert InsufficientAllowance();
        if (approved != type(uint256).max) {
            allowance[account][msg.sender] = approved - amount;
            emit Approval(account, msg.sender, approved - amount);
        }
        _burn(account, amount);
    }

    function _transfer(address from, address to, uint256 amount) private {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _burn(address account, uint256 amount) private {
        if (balanceOf[account] < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[account] -= amount;
            totalSupply -= amount;
        }
        emit Transfer(account, address(0), amount);
    }
}
