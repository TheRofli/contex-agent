import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/run-tests.mjs", "utf8");

assert.ok(source.includes("process.argv.slice(2)"));
assert.ok(source.includes("resolveRequestedTests"));
assert.ok(source.includes("No matching tests found"));
assert.ok(source.includes("replace(/\\/+/g, \"/\")"));
assert.ok(source.includes("missingRequests"));
assert.ok(source.includes("basename(test) === request"));
assert.ok(source.includes("requestedTests.length ? requestedTests : discoveredTests"));

console.log("testRunnerScriptPolicy tests passed");
