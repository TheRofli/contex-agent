import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pluginDir = process.cwd();
const manifestPath = join(pluginDir, "manifest.json");
const mainPath = join(pluginDir, "main.js");
const stylesPath = join(pluginDir, "styles.css");

for (const filePath of [manifestPath, mainPath, stylesPath]) {
  assert.equal(existsSync(filePath), true, `${filePath} must exist for community install`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

assert.equal(manifest.id, "mindo");
assert.equal(manifest.name, "Mindo");

const packageCheck = spawnSync(
  process.execPath,
  ["scripts/package-plugin.mjs", "--check"],
  {
    cwd: pluginDir,
    encoding: "utf8"
  }
);

assert.equal(
  packageCheck.status,
  0,
  `package check must pass.\nstdout:\n${packageCheck.stdout}\nstderr:\n${packageCheck.stderr}`
);

console.log("communityReleaseSmoke tests passed");
