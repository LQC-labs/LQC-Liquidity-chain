# Local signed Pyth fixtures (do not commit)

This directory is required by the Stage AZ one-shot capture program.
The file `latest_verified_stage_az.json` must be obtained freshly and locally
from the official Pyth Pro API, then verified with the official BSC97 contract
through read-only `eth_call`. It is excluded by the local `.gitignore`.

Never commit API tokens, bearer headers, wallet credentials, or the generated
signed fixture. Missing or invalid data makes the authenticated Foundry test
fail; no fake fixture is supplied.
