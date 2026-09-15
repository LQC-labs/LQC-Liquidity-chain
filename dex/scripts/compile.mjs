import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = path.resolve(import.meta.dirname, "..");
const contractsDir = path.join(root, "contracts");
const artifactsDir = path.join(root, "artifacts");

function collectSources(directory, prefix = "contracts", shouldInclude = () => true) {
  const sources = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const sourceName = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(sources, collectSources(absolute, sourceName, shouldInclude));
    else if (entry.name.endsWith(".sol") && shouldInclude(sourceName)) {
      sources[sourceName] = { content: fs.readFileSync(absolute, "utf8") };
    }
  }
  return sources;
}

function compile(sources) {
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "shanghai",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  })));
  const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
  for (const entry of output.errors ?? []) console.error(entry.formattedMessage.trim());
  if (errors.length) process.exit(1);
  return output;
}

// Keep the reviewed Router 2.0 compilation unit byte-for-byte stable. Solidity metadata commits
// to every source in one compiler input, so adding Intent v1 to that input would invalidate the
// already published Proof Gateway artifact hashes even though its source is unchanged.
const legacySources = collectSources(contractsDir, "contracts", (name) => !name.startsWith("contracts/intent-v1/"));
const intentSources = collectSources(contractsDir, "contracts", (name) =>
  name.startsWith("contracts/intent-v1/") || name === "contracts/libraries/SafeTransferLib.sol"
);
const outputs = [compile(legacySources), compile(intentSources)];

fs.rmSync(artifactsDir, { recursive: true, force: true });
for (const output of outputs) {
  for (const [sourceName, contracts] of Object.entries(output.contracts)) {
    for (const [contractName, artifact] of Object.entries(contracts)) {
      const outputPath = path.join(artifactsDir, sourceName, `${contractName}.json`);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify({
        contractName,
        sourceName,
        abi: artifact.abi,
        bytecode: `0x${artifact.evm.bytecode.object}`,
        deployedBytecode: `0x${artifact.evm.deployedBytecode.object}`
      }, null, 2));
    }
  }
}

console.log(`Compiled ${new Set(outputs.flatMap((output) => Object.keys(output.contracts))).size} Solidity source files.`);
