import fs from 'node:fs';
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const CLI = new URL("../../node_modules/@foundry-rs/anvil/bin.mjs", import.meta.url);
const active = new Set();
let nextPort = 18545;
let requestId = 0;

function provider(options = {}) {
  const port = nextPort++;
  const url = `http://${HOST}:${port}`;
  let processHandle;
  let readyPromise;

  async function rpc(method, params = []) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
    });
    const payload = await response.json();
    if (payload.error) {
      const error = new Error(payload.error.message);
      error.code = payload.error.code;
      error.data = payload.error.data;
      throw error;
    }
    return payload.result;
  }

  async function ensureNode() {
    if (readyPromise) return readyPromise;
    const args = [fileURLToPath(CLI), "--host", HOST, "--port", String(port), "--silent"];
    if (options.stepsTracing === true) args.push("--steps-tracing");
    if (options.chain?.chainId) args.push("--chain-id", String(options.chain.chainId));
    if (options.chain?.hardfork) args.push("--hardfork", String(options.chain.hardfork));
    if (options.chain?.time) args.push("--timestamp", String(Math.floor(new Date(options.chain.time).getTime() / 1000)));
    if (options.wallet?.totalAccounts) args.push("--accounts", String(options.wallet.totalAccounts));
    fs.writeFileSync(new URL('../../../candidate/anvil-launch.json',import.meta.url),JSON.stringify({node:process.execPath,args,loopbackOnly:true,chainIdArgumentSupplied:args.includes('--chain-id'),stateDumpEnabled:false},null,2));
    processHandle = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "inherit"] });
    active.add(api);
    readyPromise = (async () => {
      let lastError;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          await rpc("eth_chainId");
          return;
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      throw new Error(`Anvil node did not become ready: ${lastError?.message || "unknown error"}`);
    })();
    return readyPromise;
  }

  const api = {
    async request({ method, params = [] }) {
      await ensureNode();
      if (method === "evm_setTime" && (typeof params[0] === "string" || params[0] instanceof Date)) {
        params = [Math.floor(new Date(params[0]).getTime() / 1000)];
      }
      return rpc(method, params);
    },
    async disconnect() {
      active.delete(api);
      if (processHandle && !processHandle.killed) {
        processHandle.kill("SIGTERM");
        await new Promise((resolve) => processHandle.once("exit", resolve));
      }
    },
    on() { return this; },
    removeListener() { return this; },
  };
  return api;
}

afterEach(async () => {
  await Promise.all([...active].map((instance) => instance.disconnect()));
});

export default { provider };
