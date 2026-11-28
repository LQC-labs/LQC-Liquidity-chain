import {open, readFile, rename} from "node:fs/promises";
import {dirname} from "node:path";
import {createHash, randomUUID} from "node:crypto";
import {getCreateAddress, keccak256} from "ethers";

const digest = x => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const lower = x => x?.toLowerCase();
const number = x => BigInt(x);
const tag = x => "0x" + x.toString(16);
const requireMatch = (condition, message) => { if (!condition) throw Error(message); };

async function save(path, journal, beforeRename) {
    const tmp = path + "." + randomUUID();
    const handle = await open(tmp, "wx", 0o600);
    try {
        await handle.writeFile(JSON.stringify({journal, digest: digest(journal)}) + "\n");
        await handle.sync();
    } finally {
        await handle.close();
    }
    await beforeRename?.(journal);
    await rename(tmp, path);
    const dir = await open(dirname(path), "r");
    try { await dir.sync(); } finally { await dir.close(); }
}

export async function runStep({path, plan, rpc, afterSend = () => {}, beforeRename, confirmations = 1n}) {
    // Caller holds an OS-backed exclusive lock for the journal path.
    {
        const block = (n, full = false) => rpc("eth_getBlockByNumber", [n, full]);
        const nonce = (from, at = "pending") => rpc("eth_getTransactionCount", [from, at]);
        const safeNonce = async (safe, at) => number(await rpc("eth_call", [{to: safe, data: "0xaffed0e0"}, at]));
        requireMatch(number(await rpc("eth_chainId", [])) === number(plan.chainId) &&
            (await block("0x0"))?.hash === plan.genesis &&
            (await block(plan.anchor.number))?.hash === plan.anchor.hash, "chain or anchor mismatch");
        let journal;
        try {
            const saved = JSON.parse(await readFile(path, "utf8"));
            journal = saved.journal;
            requireMatch(saved.digest === digest(journal) && Number.isSafeInteger(journal.planLength) &&
                journal.steps.length <= journal.planLength && journal.planLength <= plan.steps.length &&
                journal.planHash === digest({...plan, steps:plan.steps.slice(0,journal.planLength)}), "journal integrity or plan mismatch");
        } catch (e) {
            if (e.code !== "ENOENT") throw e;
            journal = {planHash: digest(plan), planLength:plan.steps.length, chainId: plan.chainId, genesis: plan.genesis,
                anchor: plan.anchor, steps: []};
        }
        const head = await block("latest");
        const tip = number(head.number);
        const finalized = await block("finalized");
        const matches = (tx, step) => tx && lower(tx.from) === lower(step.from) &&
            number(tx.nonce) === number(step.nonce) && lower(tx.to) === lower(step.to) &&
            lower(tx.input) === lower(step.data) && number(tx.value) === 0n;
        async function receiptFor(hash, step) {
            const tx = await rpc("eth_getTransactionByHash", [hash]);
            requireMatch(matches(tx, step), "transaction input mismatch");
            const receipt = await rpc("eth_getTransactionReceipt", [hash]);
            if (!receipt) return null;
            requireMatch(receipt.transactionHash === hash && receipt.status === "0x1" &&
                (await block(receipt.blockNumber))?.hash === receipt.blockHash, "receipt or block mismatch");
            if (!finalized || number(receipt.blockNumber) > number(finalized.number) ||
                tip < number(receipt.blockNumber) || tip - number(receipt.blockNumber) + 1n < confirmations) return null;
            let runtimeHash = null;
            if (step.expectedAddress) {
                requireMatch(lower(receipt.contractAddress) === lower(step.expectedAddress), "CREATE address mismatch");
                const code = await rpc("eth_getCode", [step.expectedAddress, receipt.blockNumber]);
                requireMatch(code !== "0x", "runtime absent");
                runtimeHash = keccak256(code);
                requireMatch(runtimeHash === step.runtimeHash &&
                    keccak256(await rpc("eth_getCode", [step.expectedAddress, "latest"])) === runtimeHash, "runtime mismatch");
            }
            if (step.safe) {
                requireMatch(await safeNonce(step.safe, receipt.blockNumber) === number(step.safeNonce) + 1n &&
                    (plan.safeSuccessTopic && receipt.logs.some(log => lower(log.address) === lower(step.safe) &&
                        log.topics[0] === plan.safeSuccessTopic && log.topics[1] === step.safeTxHash)),
                    "Safe execution not proven");
            }
            return {hash, receipt, actualAddress: receipt.contractAddress, runtimeHash};
        }
        for (const [i, entry] of journal.steps.entries()) {
            const step = plan.steps[i];
            requireMatch(digest(entry.step) === digest(step), "recorded step mismatch");
            if (entry.state === "complete") {
                const verified = await receiptFor(entry.hash, step);
                requireMatch(verified && digest(verified) === digest(entry.evidence), "completed evidence mismatch");
                continue;
            }
            requireMatch(i === journal.steps.length - 1 && entry.state === "prepared", "invalid journal sequence");
            const start = number(entry.anchor.number);
            requireMatch((await block(entry.anchor.number))?.hash === entry.anchor.hash, "prepared anchor mismatch");
            requireMatch(start >= number(plan.anchor.number) && start <= tip && tip - start < 256n,
                "recovery search exceeds 256 blocks");
            for (let height = start; height <= tip; ++height) {
                const b = await block(tag(height), true);
                requireMatch(b && Array.isArray(b.transactions), "history unavailable");
                const tx = b.transactions.find(x => lower(x.from) === lower(step.from) && number(x.nonce) === number(step.nonce));
                if (!tx) continue;
                requireMatch(matches(tx, step), "nonce occupied by another transaction");
                const evidence = await receiptFor(tx.hash, step);
                if (!evidence) return "BLOCKED_UNFINALIZED";
                Object.assign(entry, {state:"complete", hash:tx.hash, evidence});
                await save(path, journal, beforeRename);
                return "RECOVERED";
            }
            return "BLOCKED_UNKNOWN_SUBMISSION";
        }
        const step = plan.steps[journal.steps.length];
        if (!step) return "COMPLETE";
        requireMatch(number(await nonce(step.from)) === number(step.nonce), "pending nonce mismatch");
        if (step.safe) requireMatch(await safeNonce(step.safe, "latest") === number(step.safeNonce), "Safe nonce mismatch");
        if (step.expectedAddress) {
            requireMatch(lower(getCreateAddress({from:step.from,nonce:number(step.nonce)})) === lower(step.expectedAddress) &&
                await rpc("eth_getCode", [step.expectedAddress, "latest"]) === "0x", "address already used or does not match");
        }
        const entry = {state:"prepared", anchor:{number:tag(tip),hash:head.hash}, step};
        journal.planHash = digest(plan);
        journal.planLength = plan.steps.length;
        journal.steps.push(entry);
        await save(path, journal, beforeRename);
        const hash = await rpc("eth_sendTransaction", [{from:step.from, ...(step.to ? {to:step.to} : {}),
            nonce:tag(number(step.nonce)), data:step.data, value:"0x0", gas:step.gas}]);
        await afterSend(hash);
        const evidence = await receiptFor(hash, step);
        if (!evidence) return "BLOCKED_UNFINALIZED";
        Object.assign(entry,{state:"complete",hash,evidence});
        await save(path,journal);
        return "SUBMITTED";
    }
}
