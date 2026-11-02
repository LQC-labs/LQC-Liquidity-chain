import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import vm from "node:vm";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-8E Pyth fresh update mobile",()=>{
 const h=fs.readFileSync(path.join(root,"app","futures-pyth-fresh-update.html"),"utf8");
 const j=fs.readFileSync(path.join(root,"app","futures","futures-pyth-fresh-update.js"),"utf8");
 it("pins deployed helper/adapter and BNB feed",()=>{assert.match(j,/C9a880dC29037ac3139CdDA6C42cc5A55A744f35/i);assert.match(j,/cbCc852873C98CDcEF37F07992BfA05C6Ae07e26/i);assert.match(j,/2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f/i);});
 it("never persists the API key",()=>{assert.match(h,/type="password"/);assert.doesNotMatch(j,/localStorage|sessionStorage|indexedDB/);assert.match(j,/\$\("apiKey"\)\.value=""/);});
 it("uses authenticated Hermes and permissionless helper update",()=>{assert.match(j,/authorization:"Bearer "/);assert.match(j,/getUpdateFee/);assert.match(j,/helper\.update/);});
 it("verifies fresh reference and keeps governance absent",()=>{assert.match(j,/latestRoundData/);assert.match(j,/age>120n/);assert.doesNotMatch(j,/setCircuitBreaker|setFeed|referenceFeed/);});
 it("uses non-module UMD loader",()=>{assert.match(h,/ethers\.umd\.min\.js/);assert.doesNotMatch(h,/type="module"/);});
});

describe("7/7-8E API key request lifecycle", () => {
 const source = fs.readFileSync(path.join(root, "app", "futures", "futures-pyth-fresh-update.js"), "utf8");
 const response = () => ({
  ok: true,
  json: async () => ({
   parsed: [{price: {price: "123", expo: -8, publish_time: 123456}}],
   binary: {data: ["abcd"]}
  })
 });
 function harness() {
  const elements = new Map();
  const element = id => {
   if (!elements.has(id)) elements.set(id, {value: "", textContent: "", disabled: false});
   return elements.get(id);
  };
  const requests = [];
  const context = vm.createContext({
   window: {ethers: {}, addEventListener() {}},
   document: {getElementById: element},
   fetch(url, options) {
    let resolve, reject;
    const pending = new Promise((yes, no) => {resolve = yes; reject = no;});
    requests.push({url, options, resolve, reject, inputAtFetch: element("apiKey").value});
    return pending;
   }
  });
  vm.runInContext(source, context);
  return {element, requests, window: context.window, run: () => vm.runInContext("fetchPayload()", context)};
 }
 it("clears the input before a pending authenticated request", async () => {
  const h = harness();
  h.element("apiKey").value = "  fake-key-one  ";
  const pending = h.run();
  assert.equal(h.requests[0].options.headers.authorization, "Bearer fake-key-one");
  assert.equal(h.requests[0].options.cache, "no-store");
  assert.equal(h.requests[0].inputAtFetch, "");
  assert.equal(h.element("apiKey").value, "");
  h.requests[0].resolve(response());
  await pending;
  assert.equal(h.element("apiKey").value, "");
 });
 it("keeps the input cleared when fetch rejects", async () => {
  const h = harness();
  h.element("apiKey").value = "fake-key-one";
  const pending = h.run();
  const rejected = assert.rejects(pending, /network failure/);
  h.requests[0].reject(new Error("network failure"));
  await rejected;
  assert.equal(h.element("apiKey").value, "");
 });
 it("keeps the input cleared after an HTTP error", async () => {
  const h = harness();
  h.element("apiKey").value = "fake-key-one";
  const pending = h.run();
  const rejected = assert.rejects(pending, /Hermes HTTP 401/);
  h.requests[0].resolve({ok: false, status: 401});
  await rejected;
  assert.equal(h.element("apiKey").value, "");
 });
 it("keeps the input cleared after malformed JSON", async () => {
  const h = harness();
  h.element("apiKey").value = "fake-key-one";
  const pending = h.run();
  const rejected = assert.rejects(pending, /invalid JSON/);
  h.requests[0].resolve({ok: true, json: async () => {throw new Error("invalid JSON");}});
  await rejected;
  assert.equal(h.element("apiKey").value, "");
 });
 for (const outcome of ["success", "failure"]) {
  it(`does not erase a newly entered key after an earlier request's ${outcome}`, async () => {
   const h = harness();
   h.element("apiKey").value = "fake-key-one";
   const pending = h.run();
   h.element("apiKey").value = "fake-key-two";
   if (outcome === "failure") {
    const rejected = assert.rejects(pending, /network failure/);
    h.requests[0].reject(new Error("network failure"));
    await rejected;
   } else {
    h.requests[0].resolve(response());
    await pending;
   }
   assert.equal(h.element("apiKey").value, "fake-key-two");
  });
 }
 it("does not reuse the consumed key for a second request", async () => {
  const h = harness();
  h.element("apiKey").value = "fake-key-one";
  const pending = h.run();
  await assert.rejects(h.run(), /Pyth API Key/);
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(response());
  await pending;
 });
 it("keeps keys separate when requests complete out of order", async () => {
  const h = harness();
  h.element("apiKey").value = "fake-key-one";
  const first = h.run();
  h.element("apiKey").value = "fake-key-two";
  const second = h.run();
  assert.equal(h.requests[0].options.headers.authorization, "Bearer fake-key-one");
  assert.equal(h.requests[1].options.headers.authorization, "Bearer fake-key-two");
  assert.equal(h.element("apiKey").value, "");
  h.element("apiKey").value = "fake-key-three";
  h.requests[1].resolve(response());
  await second;
  h.requests[0].resolve(response());
  await first;
  assert.equal(h.element("apiKey").value, "fake-key-three");
 });
 function pricedResponse(price, data) {
  return {ok: true, json: async () => ({
   parsed: [{price: {price, expo: -8, publish_time: Number(price)}}],
   binary: {data: [data]}
  })};
 }
 it("does not replace newer price and payload with an older response", async () => {
  const h = harness();
  h.element("apiKey").value = "fake-one";
  const first = h.run();
  h.element("apiKey").value = "fake-two";
  const second = h.run();
  h.requests[1].resolve(pricedResponse("200", "bbbb"));
  await second;
  const status = h.element("status").textContent;
  h.requests[0].resolve(pricedResponse("100", "aaaa"));
  await first;
  assert.equal(h.element("price").textContent, "200");
  assert.equal(h.element("publishTime").textContent, 200);
  assert.deepEqual(Array.from(h.window.__pythUpdateData), ["0xbbbb"]);
  assert.equal(h.element("status").textContent, status);
  assert.equal(h.element("update").disabled, false);
 });
 it("ignores an older JSON result when a new request starts during parsing", async () => {
  const h = harness();
  let finishJson;
  let jsonStarted;
  const parsing = new Promise(resolve => {jsonStarted = resolve;});
  h.element("apiKey").value = "fake-one";
  const first = h.run();
  h.requests[0].resolve({ok: true, json: () => new Promise(resolve => {finishJson = resolve; jsonStarted();})});
  await parsing;
  h.element("apiKey").value = "fake-two";
  const second = h.run();
  h.requests[1].resolve(pricedResponse("200", "bbbb"));
  await second;
  finishJson(await pricedResponse("100", "aaaa").json());
  await first;
  assert.equal(h.element("price").textContent, "200");
  assert.deepEqual(Array.from(h.window.__pythUpdateData), ["0xbbbb"]);
 });
 it("invalidates the previous payload while a replacement request is pending", async () => {
  const h = harness();
  h.element("apiKey").value = "fake-one";
  const first = h.run();
  h.requests[0].resolve(pricedResponse("100", "aaaa"));
  await first;
  h.element("apiKey").value = "fake-two";
  const second = h.run();
  assert.equal(h.window.__pythUpdateData, undefined);
  assert.equal(h.element("update").disabled, true);
  const rejected = assert.rejects(second, /Hermes HTTP 401/);
  h.requests[1].resolve({ok: false, status: 401});
  await rejected;
  assert.equal(h.window.__pythUpdateData, undefined);
  assert.equal(h.element("update").disabled, true);
 });
 it("does not revive an older payload after the newest request fails", async () => {
  const h = harness();
  h.element("apiKey").value = "fake-one";
  const first = h.run();
  h.element("apiKey").value = "fake-two";
  const second = h.run();
  const rejected = assert.rejects(second, /network failure/);
  h.requests[1].reject(new Error("network failure"));
  await rejected;
  h.requests[0].resolve(pricedResponse("100", "aaaa"));
  await first;
  assert.equal(h.window.__pythUpdateData, undefined);
  assert.equal(h.element("update").disabled, true);
 });
 it("ignores an older request failure after the newest request succeeds", async () => {
  const h = harness();
  h.element("apiKey").value = "fake-one";
  const first = h.run();
  h.element("apiKey").value = "fake-two";
  const second = h.run();
  h.requests[1].resolve(pricedResponse("200", "bbbb"));
  await second;
  h.requests[0].reject(new Error("outdated network failure"));
  await first;
  assert.equal(h.element("price").textContent, "200");
  assert.deepEqual(Array.from(h.window.__pythUpdateData), ["0xbbbb"]);
 });
});
