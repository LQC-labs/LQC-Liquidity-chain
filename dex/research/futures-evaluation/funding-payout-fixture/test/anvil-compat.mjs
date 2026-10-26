import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const HOST = "127.0.0.1";
const STARTUP_BUDGET_MS = 15000;
const CLI = new URL("../node_modules/@foundry-rs/anvil/bin.mjs", import.meta.url);
let nextPort = 18545;
let requestId = 0;

function createProvider(options, deps) {
  const port = nextPort++;
  const url = `http://${HOST}:${port}`;
  const args = [fileURLToPath(CLI), "--host", HOST, "--port", String(port), "--silent"];
  if (options.stepsTracing === true) args.push("--steps-tracing");
  if (options.chain?.chainId) args.push("--chain-id", String(options.chain.chainId));
  if (options.chain?.hardfork) args.push("--hardfork", String(options.chain.hardfork));
  if (options.chain?.time) args.push("--timestamp", String(Math.floor(new Date(options.chain.time).getTime() / 1000)));
  if (options.wallet?.totalAccounts) args.push("--accounts", String(options.wallet.totalAccounts));
  let child, readyPromise, disconnectPromise, ready = false, disconnecting = false;
  let terminated = false, spawnFailed = false, processError, startupFailure = null, cleanupFailure = null;
  let startupTimer, startupStartedAt = null, startupDeadline = null;
  let startupStage = null, startupAttempt = 0, readinessController;
  const events = [];
  let resolveStopped, resolveTermination;
  // Resolve with errors as values: an idle provider never creates an unhandled rejection.
  const stopped = new Promise(resolve => { resolveStopped = resolve; });
  const termination = new Promise(resolve => { resolveTermination = resolve; });
  const summary = error => ({ code: error.code, message: error.message, phase: error.phase });
  const diagnostics = () => structuredClone({ events, startupFailure, cleanupFailure, ready, terminated, spawnFailed,
    startupTiming: { budgetMs: STARTUP_BUDGET_MS, startedAt: startupStartedAt, deadline: startupDeadline, stage: startupStage, attempt: startupAttempt } });
  function failure(code, phase, message, cause) {
    const error = new Error(message);
    error.code = code; error.phase = phase;
    if (cause?.code !== undefined) error.originalCode = cause.code;
    return error;
  }
  function stop(error) {
    if (!processError) {
      processError = error; clearStartupTimer(); resolveStopped(error);
      readinessController?.abort();
    }
    return processError;
  }
  function clearStartupTimer() {
    if (startupTimer !== undefined) { deps.clearTimeout(startupTimer); startupTimer = undefined; }
  }
  function expireStartup() {
    checkExitState();
    if (ready || disconnecting || processError) return processError;
    const elapsedMs = deps.now() - startupStartedAt;
    const error = failure("ANVIL_STARTUP_TIMEOUT", "startup", `Anvil startup exceeded ${STARTUP_BUDGET_MS}ms during ${startupStage} (attempt ${startupAttempt}, elapsed ${elapsedMs}ms)`);
    error.timeoutMs = STARTUP_BUDGET_MS; error.elapsedMs = elapsedMs;
    error.attempt = startupAttempt; error.stage = startupStage;
    startupFailure = summary(error);
    events.push({ event: "startup-timeout", ...startupFailure, timeoutMs: STARTUP_BUDGET_MS, elapsedMs, attempt: startupAttempt, stage: startupStage });
    return stop(error);
  }
  function startupCheckpoint() {
    checkExitState();
    if (processError) throw processError;
    if (startupDeadline !== null && deps.now() >= startupDeadline) throw expireStartup();
  }
  function processFailure(message, cause) {
    const error = failure(ready ? "ANVIL_PROCESS_FAILURE" : "ANVIL_STARTUP_FAILURE", ready ? "process" : "startup", message, cause);
    if (!ready && !disconnecting && !startupFailure) startupFailure = summary(error);
    return stop(error);
  }
  function ended(event, code, signal) {
    events.push({ event, code: code ?? null, signal: signal ?? null });
    terminated = true; resolveTermination();
    if (!disconnecting) processFailure(`Anvil child ${event}: code=${code ?? "null"}, signal=${signal ?? "null"}`);
  }
  function checkExitState() {
    if (!terminated && child && (child.exitCode != null || child.signalCode != null)) ended("already-exited", child.exitCode, child.signalCode);
  }
  const guard = operation => Promise.race([operation, stopped.then(error => { throw error; })]);
  async function rpc(method, params, starting = false) {
    if (starting) startupCheckpoint();
    const controller = new AbortController();
    if (starting) { readinessController = controller; startupStage = "fetch"; }
    try {
      const response = await guard(deps.fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }), signal: controller.signal,
      }));
      if (starting) { startupCheckpoint(); startupStage = "json-body"; }
      const payload = await guard(response.json());
      if (starting) startupCheckpoint();
      if (payload.error) { const error = new Error(payload.error.message); error.code = payload.error.code; error.data = payload.error.data; throw error; }
      return payload.result;
    } finally {
      if (readinessController === controller) readinessController = undefined;
      controller.abort();
    }
  }
  async function retryDelay() {
    startupCheckpoint(); startupStage = "retry-delay";
    let timer;
    try {
      await guard(new Promise(resolve => { timer = deps.setTimeout(resolve, 100); }));
      startupCheckpoint();
    }
    finally { deps.clearTimeout(timer); }
  }
  function ensureNode() {
    if (disconnecting) return Promise.reject(failure("ANVIL_DISCONNECTED", "process", "Anvil provider is disconnected"));
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      try {
        events.push({ event: "spawn-request", executable: process.execPath, args: [...args], cwd: process.cwd() });
        // One monotonic budget, created immediately before spawn; never reset per probe.
        startupStartedAt = deps.now(); startupDeadline = startupStartedAt + STARTUP_BUDGET_MS;
        startupStage = "spawn";
        startupTimer = deps.setTimeout(expireStartup, STARTUP_BUDGET_MS);
        try { child = deps.spawn(process.execPath, args, { stdio: ["ignore", "ignore", "inherit"] }); }
        catch (cause) {
          spawnFailed = true; terminated = true; resolveTermination();
          events.push({ event: "spawn-throw", code: cause.code ?? null, message: cause.message });
          throw processFailure(`Anvil spawn failed: ${cause.message}`, cause);
        }
        // Install before any RPC or termination request; retain the completion promise.
        child.on("error", cause => {
          events.push({ event: "error", code: cause.code ?? null, message: cause.message });
          if (child.pid == null) { spawnFailed = true; terminated = true; resolveTermination(); }
          processFailure(`Anvil child error: ${cause.message}`, cause);
        });
        child.on("exit", (code, signal) => ended("exit", code, signal));
        child.on("close", (code, signal) => ended("close", code, signal));
        checkExitState();
        startupCheckpoint();
        let lastError;
        for (let attempt = 0; attempt < 100; attempt++) {
          startupCheckpoint(); startupAttempt = attempt + 1;
          try {
            await rpc("eth_chainId", [], true);
            startupCheckpoint(); clearStartupTimer(); startupStage = "ready";
            ready = true; events.push({ event: "ready", attempts: attempt + 1 }); return;
          } catch (error) { if (processError) throw processError; lastError = error; }
          if (attempt < 99) await retryDelay();
        }
        throw processFailure(`Anvil node did not become ready after 100 attempts: ${lastError?.message || "unknown error"}`);
      } catch (error) { error.anvilLifecycle = diagnostics(); throw error; }
      finally { clearStartupTimer(); }
    })();
    return readyPromise;
  }
  function disconnect() {
    if (disconnectPromise) return disconnectPromise;
    disconnecting = true;
    stop(failure("ANVIL_DISCONNECTED", "process", "Anvil provider disconnected"));
    disconnectPromise = (async () => {
      events.push({ event: "disconnect-request" });
      checkExitState();
      if (!child || terminated || spawnFailed) return;
      let timer;
      try {
        // Completion listeners are already installed. kill(false) may race with natural exit.
        const accepted = child.kill("SIGTERM");
        events.push({ event: "kill-request", signal: "SIGTERM", accepted });
        checkExitState();
        if (terminated) return;
        await Promise.race([termination, new Promise((_, reject) => {
          timer = deps.setTimeout(() => reject(new Error("Anvil child termination was not confirmed within 1000ms")), 1000);
        })]);
      } catch (cause) {
        const error = failure("ANVIL_CLEANUP_FAILURE", "cleanup", cause.message, cause);
        cleanupFailure = summary(error); events.push({ event: "cleanup-failure", ...cleanupFailure });
        error.anvilLifecycle = diagnostics(); throw error;
      } finally { deps.clearTimeout(timer); }
    })();
    return disconnectPromise;
  }
  return {
    async request({ method, params = [] }) {
      await ensureNode();
      if (processError) { processError.anvilLifecycle = diagnostics(); throw processError; }
      if (method === "evm_setTime" && (typeof params[0] === "string" || params[0] instanceof Date)) params = [Math.floor(new Date(params[0]).getTime() / 1000)];
      return rpc(method, params);
    },
    disconnect, diagnostics,
    on() { return this; }, removeListener() { return this; },
  };
}

// Test seam only: no defaults that could accidentally launch a real process or network request.
export function createProviderForTests(options, deps) {
  for (const key of ["spawn", "fetch", "setTimeout", "clearTimeout", "now"]) if (typeof deps?.[key] !== "function") throw new TypeError(`Mock dependency required: ${key}`);
  return createProvider(options, deps);
}
export default { provider: (options = {}) => createProvider(options, { spawn, fetch: globalThis.fetch, setTimeout, clearTimeout, now: () => performance.now() }) };
