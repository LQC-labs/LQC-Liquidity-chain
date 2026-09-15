import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = path.resolve(import.meta.dirname, "..");
const contractsDir = path.join(root, "contracts");
const artifactsDir = path.join(root, "artifacts");
const intentPrefix = "contracts/intent/";

function collectSources(directory, prefix = "contracts") {
  const sources = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const sourceName = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(sources, collectSources(absolute, sourceName));
    else if (entry.name.endsWith(".sol")) sources[sourceName] = { content: fs.readFileSync(absolute, "utf8") };
  }
  return sources;
}

function compile(sources, outputSelection) {
  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "shanghai",
      outputSelection
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
  for (const entry of output.errors ?? []) console.error(entry.formattedMessage.trim());
  if (errors.length) process.exit(1);
  return output;
}

function writeArtifacts(output) {
  for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
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

const allSources = collectSources(contractsDir);
const coreSources = Object.fromEntries(
  Object.entries(allSources).filter(([sourceName]) => !sourceName.startsWith(intentPrefix))
);
const artifactFields = ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"];

// Preserve the exact Router 2.0 compilation unit and deployed-bytecode evidence.
const coreOutput = compile(coreSources, { "*": { "*": artifactFields } });

// Compile separately deployed Intent modules without changing core Router artifacts.
const intentSelection = {};
for (const sourceName of Object.keys(allSources)) {
  if (sourceName.startsWith(intentPrefix)) intentSelection[sourceName] = { "*": artifactFields };
}
const intentOutput = Object.keys(intentSelection).length
  ? compile(allSources, intentSelection)
  : { contracts: {} };

fs.rmSync(artifactsDir, { recursive: true, force: true });
writeArtifacts(coreOutput);
writeArtifacts(intentOutput);

console.log(
  `Compiled ${Object.keys(coreOutput.contracts ?? {}).length} core and ${Object.keys(intentOutput.contracts ?? {}).length} intent source files.`
);
