// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCLaunchProjectRegistry} from "../launch-creator/LQCLaunchProjectRegistry.sol";
import {LQCFixedPriceSale} from "./LQCFixedPriceSale.sol";

/// @notice Creates one isolated fixed-price sale for each approved project.
contract LQCLaunchSaleFactory {
    LQCLaunchProjectRegistry public immutable projectRegistry;
    mapping(address => bool) public allowedToken;
    mapping(uint256 => bool) public projectDisabled;
    mapping(uint256 => LQCFixedPriceSale) public sales;

    address public bootstrapAdapter;
    address public guardian;
    bool public emergencyPaused;
    uint256 public emergencyEpoch;
    event LaunchEmergencyChanged(bool paused, uint256 indexed epoch);

    error Unauthorized();
    error InvalidProject();
    error InvalidToken();

    event BootstrapAdapterBound(address indexed adapter);
    event TokenPolicy(address indexed token, bool allowed);
    event ProjectDisabled(uint256 indexed projectId);
    event SaleCreated(uint256 indexed projectId, address indexed sale, address indexed applicant, bytes32 termsHash);

    constructor(LQCLaunchProjectRegistry registry) {
        if (address(registry).code.length == 0) revert InvalidProject();
        projectRegistry = registry;
    }

    modifier onlyReviewer() {
        if (msg.sender != projectRegistry.reviewer()) revert Unauthorized();
        _;
    }

    function setGuardian(address next) external onlyReviewer {
        guardian = next;
        ++emergencyEpoch;
    }

    function pauseLaunch() external {
        if (msg.sender != guardian && msg.sender != projectRegistry.reviewer()) revert Unauthorized();
        emergencyPaused = true;
        emit LaunchEmergencyChanged(true, ++emergencyEpoch);
    }

    function recoverLaunch(uint256 expectedEpoch, uint256 deadline) external onlyReviewer {
        if (!emergencyPaused || expectedEpoch != emergencyEpoch || block.timestamp > deadline) revert InvalidProject();
        emergencyPaused = false;
        emit LaunchEmergencyChanged(false, ++emergencyEpoch);
    }

    function bindBootstrapAdapter(address adapter) external onlyReviewer {
        if (bootstrapAdapter != address(0) || adapter.code.length == 0) revert InvalidProject();
        bootstrapAdapter = adapter;
        ++emergencyEpoch;
        emit BootstrapAdapterBound(adapter);
    }

    function setAllowedToken(address token, bool allowed) external onlyReviewer {
        if (allowed && token.code.length == 0) revert InvalidToken();
        allowedToken[token] = allowed;
        ++emergencyEpoch;
        emit TokenPolicy(token, allowed);
    }

    function disableProject(uint256 projectId) external onlyReviewer {
        if (!projectRegistry.isApproved(projectId) || projectDisabled[projectId]) revert InvalidProject();
        projectDisabled[projectId] = true;
        ++emergencyEpoch;
        emit ProjectDisabled(projectId);
    }

    function createSale(uint256 projectId, LQCFixedPriceSale.Terms calldata terms)
        external returns (LQCFixedPriceSale sale)
    {
        return _createSale(projectId, terms, LQCFixedPriceSale.Vesting(0, 0, 0, 0));
    }

    function createSale(uint256 projectId, LQCFixedPriceSale.Terms calldata terms, LQCFixedPriceSale.Vesting calldata schedule)
        external returns (LQCFixedPriceSale sale)
    {
        return _createSale(projectId, terms, schedule);
    }

    function _createSale(uint256 projectId, LQCFixedPriceSale.Terms calldata terms, LQCFixedPriceSale.Vesting memory schedule)
        private returns (LQCFixedPriceSale sale)
    {
        (address applicant,,,, LQCLaunchProjectRegistry.Status status) = projectRegistry.projects(projectId);
        if (emergencyPaused || status != LQCLaunchProjectRegistry.Status.Approved || projectDisabled[projectId] ||
            address(sales[projectId]) != address(0)) revert InvalidProject();
        address operator = projectRegistry.saleOperator(projectId);
        if (msg.sender != (operator == address(0) ? applicant : operator)) revert Unauthorized();
        if (!allowedToken[terms.saleToken] || !allowedToken[terms.paymentToken]) revert InvalidToken();
        sale = new LQCFixedPriceSale(projectRegistry, projectId, applicant, terms, schedule);
        sales[projectId] = sale;
        emit SaleCreated(projectId, address(sale), applicant, sale.termsHash());
    }
}
