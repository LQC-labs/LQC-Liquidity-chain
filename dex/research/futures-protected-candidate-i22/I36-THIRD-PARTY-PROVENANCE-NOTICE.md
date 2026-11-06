# I-36 — Third-Party Compatibility and Source Provenance Notice

Status: PROJECT RESPONSIBLE-PERSON STATEMENT RECORDED (I-41) — NOT AN INDEPENDENT LEGAL CLEARANCE OR UPLOAD APPROVAL

This notice applies only to the three LQC Flow Futures research-package files listed below. It supplements, and does not replace, the package's MIT LICENSE and its license-scope documentation.

| Research package path | Corresponding official repository source | Historical evidence |
| --- | --- | --- |
| `interfaces/IERC20.sol` | `dex/contracts/interfaces/IERC20.sol` | Introduced in commit `39adfcf53812dc394c3bdfb8b37d7330cfa448c1` (2026-09-05 UTC) |
| `src/baseline/interfaces/IAggregatorV3.sol` | `dex/contracts/futures/interfaces/IAggregatorV3.sol` | Introduced in commit `cbec75f6f0ea0cb64058112212915ef4dff233f5` (2026-09-20 UTC; PR #204) |
| `libraries/SafeTransferLib.sol` | `dex/contracts/libraries/SafeTransferLib.sol` | Introduced in commit `39adfcf53812dc394c3bdfb8b37d7330cfa448c1`; expanded in `6400072ef95870843f6aad7b1ba0b4662dc56170` |

## Compatibility and provenance findings

- **IERC20:** A minimal ERC-20-compatible function declaration. Compatibility with standardized function signatures does not itself establish copying of an external implementation.
- **IAggregatorV3:** A minimal Chainlink AggregatorV3-compatible interface exposing `decimals()` and `latestRoundData()`. It is not identical to the full official Chainlink interface inspected during this review.
- **SafeTransferLib:** A transfer/approval utility using low-level ERC-20 calls and custom errors. The inspected implementation differs structurally from Solmate's SafeTransferLib; a shared library name or function purpose alone does not establish derivation or application of Solmate's AGPL license.

All three corresponding official repository files were observed with `SPDX-License-Identifier: MIT` at baseline commit `8db16368b3e09a94bfd500a17e33e3e9ef62ed51`. Their LQC Git history identifies the account `LQC-labs` as the introducing commit author. Neither Git attribution nor an SPDX line independently proves initial authorship, unencumbered ownership, or complete third-party notice compliance.

No direct external-implementation copying was established in the reviewed comparison evidence. The project responsible-person statement recorded below provides an additional first-party account of preparation. The preparation history has not been independently authenticated, and this review is **not** a finding of zero third-party obligations. If contradictory original source, version, creator, or derivative evidence is later substantiated, any applicable attribution and license obligations must be reviewed before publication.

References to ERC-20, Chainlink, OpenZeppelin, Solmate, or Solady are for standards/compatibility/comparison only and do not imply endorsement or affiliation.

## Project responsible-person statement — I-41

Project lead 천호님 directly confirmed the following for this I-41 update:

> IERC20.sol, IAggregatorV3.sol, SafeTransferLib.sol 세 파일은 모두 LQC Futures 개발 과정에서 직접 작성하거나 AI 개발 도구로 생성한 파일이며, 외부 라이브러리의 소스코드를 복사하여 가져온 파일이 아니다.

English rendering: The three files IERC20.sol, IAggregatorV3.sol and SafeTransferLib.sol were directly authored or generated using AI development tools during LQC Futures development; their source code was not copied from external libraries.

Evidence classification: a statement by the project responsible person, accepted and recorded as first-party provenance information. It is not an independently verified legal opinion, a forensic certification of the full preparation history, or proof that AI-generated code cannot implicate third-party rights. No particular AI tool, generation log, or per-file manual-versus-AI allocation was supplied or inferred.

The previously approved MIT policy continues to apply to MMXlabs/LQC LLC self-authored portions. The existing Git history, MIT SPDX observations, comparison findings and evidence links are retained separately; they are not relabelled as independent verification of this statement. Any actual third-party material later identified remains subject to its applicable license and notice requirements. This statement records the new project account and does not itself authorize upload, deployment or operation.

## Evidence links

- LQC ERC-20 and initial SafeTransferLib commit: https://github.com/LQC-labs/LQC-Liquidity-chain/commit/39adfcf53812dc394c3bdfb8b37d7330cfa448c1
- LQC SafeTransferLib extension: https://github.com/LQC-labs/LQC-Liquidity-chain/commit/6400072ef95870843f6aad7b1ba0b4662dc56170
- LQC Oracle interface introduction: https://github.com/LQC-labs/LQC-Liquidity-chain/commit/cbec75f6f0ea0cb64058112212915ef4dff233f5
- Oracle review PR: https://github.com/LQC-labs/LQC-Liquidity-chain/pull/204
- ERC-20 standard: https://eips.ethereum.org/EIPS/eip-20
- Chainlink reference interface: https://github.com/smartcontractkit/chainlink-evm/blob/develop/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol
- Solmate comparison: https://github.com/transmissions11/solmate/blob/main/src/utils/SafeTransferLib.sol

## Release gate

This I-41 update records the responsible-person statement; it does **not** constitute independent legal clearance or final upload approval. I-28, I-37 and I-38 candidates and their existing seals remain preserved. The new isolated I-41 candidate retains the other 106 files byte-for-byte and changes only this notice, keeping 107 files total. The operator must verify the complete path/SHA256 manifest and evidence seals, address the separate remaining release conditions, and seek final upload approval. No GitHub push, PR, Actions, deployment, D05/D06 release, testnet transfer, or operational activation is authorized by this document.
