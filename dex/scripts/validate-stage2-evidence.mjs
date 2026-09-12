import fs from "node:fs";

export function validateStage2Evidence(record) {
  if (!record || typeof record !== "object") throw new Error("Evidence must be an object.");
  if (Number(record.chainId) !== 97) throw new Error("Evidence must target BSC testnet chain 97.");
  if (record.preflight && record.preflight.transactionSubmitted !== false) {
    throw new Error("Preflight evidence must prove that no transaction was submitted.");
  }
  if (record.quote) {
    const amountOut = BigInt(record.quote.amountOutRaw);
    const minimumOut = BigInt(record.quote.minimumOutputRaw);
    if (amountOut <= 0n || minimumOut <= 0n || minimumOut > amountOut) {
      throw new Error("Quote minimum output is invalid.");
    }
  }
  if (record.smokeTrade) {
    if (record.smokeTrade.minimumOutputSatisfied !== true) {
      throw new Error("Smoke trade did not satisfy minimum output.");
    }
    const { transactionHash, blockHash, blockNumber, recipient } = record.smokeTrade;
    const hash = value => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
    if (!hash(transactionHash) || !hash(blockHash)) {
      throw new Error("Smoke trade hashes must be 32-byte hex values.");
    }
    if (!Number.isSafeInteger(Number(blockNumber)) || Number(blockNumber) < 0) {
      throw new Error("Smoke trade block number is invalid.");
    }
    if (typeof recipient !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
      throw new Error("Smoke trade recipient must be an address.");
    }
  }
  return { valid: true, chainId: 97 };
}

export function validateStage2EvidenceFile(filePath) {
  const record = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return validateStage2Evidence(record);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try {
    console.log(JSON.stringify(validateStage2EvidenceFile(process.argv[2]), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
