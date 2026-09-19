# LQC Futures BSC Testnet Test Tokens — 2026-09-20

> TEST ONLY. These MockERC20 contracts are not production assets and must never be used for production collateral or index assets.

Network: BSC Testnet (chainId 97)

Deployer: `0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB`

## Mock USDT (mUSDT)

- Contract: `0x7ab1b97d194730e9456c12af7905450a4f8a0c46`
- Deployment transaction: `0x1bc9e4a1d12700fabdc19eec3de30718ce5e14669d514e049f786e5b7a03963a`
- Decimals: 18
- Mobile post-deployment verification: runtime code present; name/symbol/decimals matched.

## Mock BTC (mBTC)

- Contract: `0x4a90ddd4297ca68935af68a8fd91e01206168075`
- Deployment transaction: `0x1e9df15e3ece49f754f49527960c6f8dccb550b33c05c4c65e9d646af4d4ac9f`
- Decimals: 18
- Mobile post-deployment verification: runtime code present; name/symbol/decimals matched.

## Safety boundary

Both contracts use the repository's unrestricted `MockERC20` test implementation. The Futures production safety gate rejects `MockERC20` / `contracts/mocks/MockERC20.sol`; these addresses are therefore BSC Testnet test fixtures only.

No mint, Vault collateral enablement, market registration, Oracle price update, approval, deposit, or position transaction is recorded by this file.
