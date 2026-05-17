import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(pluginDir, ".cache", "tests");
const esbuildCli = join(
  pluginDir,
  "node_modules",
  "esbuild-wasm",
  "bin",
  "esbuild"
);

const discoveredTests = discoverTests(join(pluginDir, "tests"))
  .map((path) => relative(pluginDir, path).replaceAll("\\", "/"))
  .sort();
const requestedTests = resolveRequestedTests(
  discoveredTests,
  process.argv.slice(2)
);
const tests = requestedTests.length ? requestedTests : discoveredTests;

if (!tests.length) {
  console.error("No tests found.");
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const test of tests) {
  const outfile = join(outDir, `${basename(test, ".ts")}.mjs`);
  const build = spawnSync(
    process.execPath,
    [
      esbuildCli,
      test,
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node22",
      `--outfile=${outfile}`,
      "--banner:js=import { fileURLToPath as __contexFileURLToPath } from 'node:url'; import { dirname as __contexDirname } from 'node:path'; const __filename = __contexFileURLToPath(import.meta.url); const __dirname = __contexDirname(__filename);",
      "--alias:obsidian=tests/obsidianStub.ts"
    ],
    {
      cwd: pluginDir,
      stdio: "inherit"
    }
  );

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  const run = spawnSync(process.execPath, [outfile], {
    cwd: pluginDir,
    stdio: "inherit"
  });

  if (run.status !== 0) {
    process.exit(run.status ?? 1);
  }
}

function resolveRequestedTests(discoveredTests, requested) {
  if (!requested.length) {
    return [];
  }

  const normalizedRequests = requested.map((entry) =>
    entry.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/^\.\//, "")
  );
  const matchedTests = new Set();
  const missingRequests = [];

  for (const request of normalizedRequests) {
    const matchesForRequest = discoveredTests.filter(
      (test) => test === request || basename(test) === request
    );

    if (!matchesForRequest.length) {
      missingRequests.push(request);
      continue;
    }

    for (const test of matchesForRequest) {
      matchedTests.add(test);
    }
  }

  if (missingRequests.length) {
    console.error(`No matching tests found for: ${missingRequests.join(", ")}`);
    process.exit(1);
  }

  return discoveredTests.filter((test) => matchedTests.has(test));
}

function discoverTests(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...discoverTests(path));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(path);
    }
  }

  return files;
}
