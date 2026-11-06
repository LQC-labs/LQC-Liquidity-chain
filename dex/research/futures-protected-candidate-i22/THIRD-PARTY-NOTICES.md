# Third-party provenance and notices

LICENSE and LICENSE-SCOPE.json apply the approved MIT policy to MMXlabs/LQC LLC self-authored candidate material. They do not override actual third-party terms. No blanket external-origin clearance is asserted.

## Known distribution boundary

ethers6.13.5 official license is MIT, Copyright (c)2016-2023 Richard Moore: https://github.com/ethers-io/ethers.js/blob/v6.13.5/LICENSE.md . No ethers implementation is bundled and no CDN script is loaded. Wrapper/API references do not alone establish implementation redistribution. If real upstream copies/substantial portions are introduced, retain applicable copyright and permission text and verify the exact artifact.

Node builtin APIs and existing Foundry1.9.0, Solidity0.8.30 and Chrome executables are tooling, not copied package implementations. No executable, npm install or dependency distribution is included.

## Unresolved origin checks

interfaces/IERC20.sol, src/baseline/interfaces/IAggregatorV3.sol and libraries/SafeTransferLib.sol remain targeted provenance/notice review items. Compatible APIs or the same library name are not copying findings. The I26 Chainlink interface reference declared MIT; the independently different Solmate reference declared AGPL-3.0-only. Neither was imported or bundled. This does not prove independent authorship or automatically impose Solmate terms on the project helper. If reuse is established, assess actual source/version/license/notices before release rather than guessing a grant.

Pyth Pro/Lazer SDK is excluded. Earlier Apache-root versus Solidity UNLICENSED observations remain unresolved; no SDK, guessed verifier or provider address is included or installed. Original Pyth Core code outside this candidate is preserved.

This NOTICE records known boundaries and unresolved checks; it is not full upstream license certification. Separate legal/provenance judgment may be needed for actual copying/derivation.
