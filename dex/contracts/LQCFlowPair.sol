// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {Math} from "./libraries/Math.sol";
import {SafeTransferLib} from "./libraries/SafeTransferLib.sol";

/// @notice Constant-product pool used by LQC Flow DEX. The 0.30% swap fee remains in the pool for LPs.
contract LQCFlowPair {
    using SafeTransferLib for address;

    string public constant name = "LQC Flow LP";
    string public constant symbol = "LQCF-LP";
    uint8 public constant decimals = 18;
    uint256 public constant MINIMUM_LIQUIDITY = 1_000;
    uint256 public constant FEE_DENOMINATOR = 10_000;
    uint256 public constant SWAP_FEE_BPS = 30;

    address public immutable factory;
    address public immutable token0;
    address public immutable token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;
    uint256 private unlocked = 1;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Mint(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to);
    event Sync(uint112 reserve0, uint112 reserve1);

    error Forbidden();
    error Locked();
    error ExpiredAllowance();
    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error InsufficientOutput();
    error InsufficientLiquidity();
    error InvalidRecipient();
    error InsufficientInput();
    error InvariantViolation();
    error ReserveOverflow();

    modifier lock() {
        if (unlocked != 1) revert Locked();
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address token0_, address token1_) {
        if (msg.sender == address(0)) revert Forbidden();
        factory = msg.sender;
        token0 = token0_;
        token1 = token1_;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
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
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert ExpiredAllowance();
            unchecked { allowance[from][msg.sender] = allowed - amount; }
        }
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 r0, uint112 r1,) = this.getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - r0;
        uint256 amount1 = balance1 - r1;

        if (totalSupply == 0) {
            uint256 rootK = Math.sqrt(amount0 * amount1);
            if (rootK <= MINIMUM_LIQUIDITY) revert InsufficientLiquidityMinted();
            liquidity = rootK - MINIMUM_LIQUIDITY;
            _mint(address(1), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min(amount0 * totalSupply / r0, amount1 * totalSupply / r1);
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();
        _mint(to, liquidity);
        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1, to);
    }

    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        (uint112 r0, uint112 r1,) = this.getReserves();
        address t0 = token0;
        address t1 = token1;
        uint256 balance0 = IERC20(t0).balanceOf(address(this));
        uint256 balance1 = IERC20(t1).balanceOf(address(this));
        uint256 liquidity = balanceOf[address(this)];
        uint256 supply = totalSupply;
        amount0 = liquidity * balance0 / supply;
        amount1 = liquidity * balance1 / supply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();
        _burn(address(this), liquidity);
        t0.safeTransfer(to, amount0);
        t1.safeTransfer(to, amount1);
        balance0 = IERC20(t0).balanceOf(address(this));
        balance1 = IERC20(t1).balanceOf(address(this));
        _update(balance0, balance1);
        emit Burn(msg.sender, amount0, amount1, to);
        r0; r1;
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external lock {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutput();
        (uint112 r0, uint112 r1,) = this.getReserves();
        if (amount0Out >= r0 || amount1Out >= r1) revert InsufficientLiquidity();
        if (to == token0 || to == token1 || to == address(0)) revert InvalidRecipient();

        if (amount0Out != 0) token0.safeTransfer(to, amount0Out);
        if (amount1Out != 0) token1.safeTransfer(to, amount1Out);
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0In = balance0 > r0 - amount0Out ? balance0 - (r0 - amount0Out) : 0;
        uint256 amount1In = balance1 > r1 - amount1Out ? balance1 - (r1 - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientInput();

        uint256 balance0Adjusted = balance0 * FEE_DENOMINATOR - amount0In * SWAP_FEE_BPS;
        uint256 balance1Adjusted = balance1 * FEE_DENOMINATOR - amount1In * SWAP_FEE_BPS;
        if (balance0Adjusted * balance1Adjusted < uint256(r0) * uint256(r1) * FEE_DENOMINATOR ** 2) {
            revert InvariantViolation();
        }
        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function skim(address to) external lock {
        token0.safeTransfer(to, IERC20(token0).balanceOf(address(this)) - reserve0);
        token1.safeTransfer(to, IERC20(token1).balanceOf(address(this)) - reserve1);
    }

    function sync() external lock {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)));
    }

    function _update(uint256 balance0, uint256 balance1) private {
        if (balance0 > type(uint112).max || balance1 > type(uint112).max) revert ReserveOverflow();
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp);
        emit Sync(reserve0, reserve1);
    }

    function _mint(address to, uint256 amount) private {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) private {
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) private {
        if (to == address(0)) revert InvalidRecipient();
        balanceOf[from] -= amount;
        unchecked { balanceOf[to] += amount; }
        emit Transfer(from, to, amount);
    }
}
