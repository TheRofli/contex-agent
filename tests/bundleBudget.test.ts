import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const pluginDir = process.cwd();

const bundleBudgets = [
  ["main.js", 1_100_000],
  ["styles.css", 90_000],
  ["src/views/mindoLogoData.ts", 140_000],
  ["src/views/mindoFontData.ts", 360_000],
  ["assets/logo.png", 850_000],
  ["assets/fonts/comfortaa/Comfortaa-Regular.ttf", 260_000]
] as const;

for (const [relativePath, maxBytes] of bundleBudgets) {
  const filePath = join(pluginDir, relativePath);

  assert.equal(
    existsSync(filePath),
    true,
    `${relativePath} must exist for bundle budget checks.`
  );

  const size = statSync(filePath).size;

  assert.equal(
    size <= maxBytes,
    true,
    `${relativePath} is ${size} bytes, exceeding the bundle budget of ${maxBytes} bytes.`
  );
}

console.log("bundleBudget tests passed");
