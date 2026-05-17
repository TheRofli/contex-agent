import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const styles = readFileSync(join(process.cwd(), "styles.css"), "utf8");
const sidebarAssets = readFileSync(
  join(process.cwd(), "src", "views", "sidebarAssetResources.ts"),
  "utf8"
);
const fontData = readFileSync(
  join(process.cwd(), "src", "views", "mindoFontData.ts"),
  "utf8"
);
const logoData = readFileSync(
  join(process.cwd(), "src", "views", "mindoLogoData.ts"),
  "utf8"
);
const packageScript = readFileSync(
  join(process.cwd(), "scripts", "package-plugin.mjs"),
  "utf8"
);

assert.ok(fontData.includes("data:font/ttf;base64,"));
assert.ok(logoData.includes("data:image/png;base64"));
assert.ok(logoData.length < 120000);
assert.ok(sidebarAssets.includes("MINDO_FONT_DATA_URL"));
assert.ok(sidebarAssets.includes("MINDO_LOGO_DATA_URL"));
assert.ok(!styles.includes("./assets/fonts/comfortaa/Comfortaa-Regular.ttf"));
assert.ok(!packageScript.includes('"assets/fonts/comfortaa/Comfortaa-Regular.ttf",'));
assert.ok(!packageScript.includes('"assets/fonts/comfortaa/OFL.txt",'));
assert.ok(!packageScript.includes('"assets/fonts/comfortaa/SOURCE.md",'));

console.log("communityInstallAssets tests passed");
