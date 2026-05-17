import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const comfortaaPath = join(
  process.cwd(),
  "assets",
  "fonts",
  "comfortaa",
  "Comfortaa-Regular.ttf"
);
const stylesPath = join(process.cwd(), "styles.css");
const sidebarViewPath = join(process.cwd(), "src", "views", "AgentSidebarView.ts");
const sidebarAssetsPath = join(process.cwd(), "src", "views", "sidebarAssetResources.ts");
const logoDataPath = join(process.cwd(), "src", "views", "mindoLogoData.ts");
const fontDataPath = join(process.cwd(), "src", "views", "mindoFontData.ts");
const packageScriptPath = join(process.cwd(), "scripts", "package-plugin.mjs");
const removedFontDirs = [["sour", "gummy"].join("-"), ["neu", "cha"].join("")];
const removedFontLabels = [["Sour", "Gummy"].join(" "), ["Neu", "cha"].join("")];

assert.equal(existsSync(comfortaaPath), true);
for (const dirName of removedFontDirs) {
  assert.equal(existsSync(join(process.cwd(), "assets", "fonts", dirName)), false);
}

const styles = readFileSync(stylesPath, "utf8");
assert.ok(styles.includes('"Mindo Comfortaa"'));
assert.ok(styles.includes('"Mindo Runtime Comfortaa"'));
assert.ok(!styles.includes("./assets/fonts/comfortaa/Comfortaa-Regular.ttf"));
assert.ok(/\.contex-agent\s*\{[^}]*font-family:\s*var\(--mindo-font-family\);/s.test(styles));
assert.ok(
  styles.includes(
    '.workspace-leaf-content[data-type="mindo-view"] .contex-agent.contex-agent--font-comfortaa'
  )
);
assert.ok(
  /\.contex-agent\.contex-agent--font-comfortaa \.contex-agent__chat-menu-button[\s\S]*font-family:\s*var\(--mindo-font-family\);/s.test(
    styles
  )
);
assert.ok(
  /\.contex-agent\.contex-agent--font-comfortaa \.contex-agent__input::placeholder[\s\S]*font-family:\s*var\(--mindo-font-family\);/s.test(
    styles
  )
);
assert.ok(
  /\.contex-agent__home-hero\s*\{[^}]*gap:\s*clamp\(8px, 1\.4vh, 14px\);/s.test(
    styles
  )
);
assert.ok(/\.contex-agent__home-greeting\s*\{[^}]*margin-top:\s*0;/s.test(styles));
assert.ok(/\.contex-agent__home-greeting\s*\{[^}]*font-size:\s*18px;/s.test(styles));
assert.ok(styles.includes(".contex-agent.contex-agent--font-obsidian"));
for (const label of removedFontLabels) {
  assert.ok(!styles.includes(label));
}

const sidebarView = readFileSync(sidebarViewPath, "utf8");
const sidebarAssets = readFileSync(sidebarAssetsPath, "utf8");
const logoData = readFileSync(logoDataPath, "utf8");
const fontData = readFileSync(fontDataPath, "utf8");
assert.ok(sidebarView.includes("installRuntimeComfortaaFont(root);"));
assert.ok(sidebarAssets.includes('"Mindo Runtime Comfortaa"'));
assert.ok(sidebarAssets.includes("MINDO_LOGO_DATA_URL"));
assert.ok(!sidebarView.includes("MINDO_LOGO_SVG"));
assert.ok(logoData.includes("data:image/png;base64"));
assert.ok(logoData.length < 120000);
assert.ok(fontData.includes("data:font/ttf;base64,"));
assert.ok(sidebarAssets.includes('fileName === "assets/logo.png"'));
assert.ok(
  !/this\.getPluginAssetResourcePath\(\s*"assets\/fonts\/comfortaa\/Comfortaa-Regular\.ttf"\s*\)/s.test(
    sidebarView
  )
);
assert.ok(/root\.style\.setProperty\(\s*"--mindo-font-family"/s.test(sidebarAssets));
assert.ok(sidebarAssets.includes("JSON.stringify(MINDO_FONT_DATA_URL)"));

const packageScript = readFileSync(packageScriptPath, "utf8");
assert.ok(!packageScript.includes("assets/logo.png"));
assert.ok(packageScript.includes('"assets/fonts/comfortaa"'));
assert.ok(!packageScript.includes('"assets/fonts/comfortaa/Comfortaa-Regular.ttf",'));
assert.ok(!packageScript.includes('"assets/fonts/comfortaa/OFL.txt",'));
assert.ok(!packageScript.includes('"assets/fonts/comfortaa/SOURCE.md",'));
assert.ok(!packageScript.includes('"logo.png"'));
assert.ok(!packageScript.includes("contex_black.png"));
assert.ok(!packageScript.includes("contex_white.png"));
for (const dirName of removedFontDirs) {
  assert.ok(!packageScript.includes(dirName));
}

const font = readFileSync(comfortaaPath);
for (const codePoint of [
  "A",
  "a",
  "M",
  "П",
  "р",
  "ё",
  "я",
  "ї",
  "є"
].map((value) => value.codePointAt(0)!)) {
  assert.equal(hasGlyph(font, codePoint), true, `Missing U+${codePoint.toString(16)}`);
}

console.log("fontAssets tests passed");

function hasGlyph(font: Buffer, codePoint: number): boolean {
  const cmapOffset = findTable(font, "cmap");
  const subtableOffsets = getCmapSubtableOffsets(font, cmapOffset);

  return subtableOffsets.some((offset) => hasGlyphInCmapSubtable(font, offset, codePoint));
}

function findTable(font: Buffer, tag: string): number {
  const tableCount = font.readUInt16BE(4);

  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = 12 + index * 16;
    if (font.toString("ascii", recordOffset, recordOffset + 4) === tag) {
      return font.readUInt32BE(recordOffset + 8);
    }
  }

  throw new Error(`Missing ${tag} table`);
}

function getCmapSubtableOffsets(font: Buffer, cmapOffset: number): number[] {
  const encodingCount = font.readUInt16BE(cmapOffset + 2);
  const offsets: number[] = [];

  for (let index = 0; index < encodingCount; index += 1) {
    const recordOffset = cmapOffset + 4 + index * 8;
    offsets.push(cmapOffset + font.readUInt32BE(recordOffset + 4));
  }

  return offsets;
}

function hasGlyphInCmapSubtable(
  font: Buffer,
  offset: number,
  codePoint: number
): boolean {
  const format = font.readUInt16BE(offset);

  if (format === 4 && codePoint <= 0xffff) {
    return hasGlyphInFormat4(font, offset, codePoint);
  }

  if (format === 12) {
    return hasGlyphInFormat12(font, offset, codePoint);
  }

  return false;
}

function hasGlyphInFormat4(font: Buffer, offset: number, codePoint: number): boolean {
  const segmentCount = font.readUInt16BE(offset + 6) / 2;
  const endCodesOffset = offset + 14;
  const startCodesOffset = endCodesOffset + segmentCount * 2 + 2;
  const idDeltasOffset = startCodesOffset + segmentCount * 2;
  const idRangeOffsetsOffset = idDeltasOffset + segmentCount * 2;

  for (let index = 0; index < segmentCount; index += 1) {
    const endCode = font.readUInt16BE(endCodesOffset + index * 2);
    const startCode = font.readUInt16BE(startCodesOffset + index * 2);

    if (codePoint < startCode || codePoint > endCode) {
      continue;
    }

    const idDelta = font.readInt16BE(idDeltasOffset + index * 2);
    const idRangeOffsetLocation = idRangeOffsetsOffset + index * 2;
    const idRangeOffset = font.readUInt16BE(idRangeOffsetLocation);

    if (idRangeOffset === 0) {
      return ((codePoint + idDelta) & 0xffff) !== 0;
    }

    const glyphOffset =
      idRangeOffsetLocation + idRangeOffset + (codePoint - startCode) * 2;

    if (glyphOffset + 2 > font.length) {
      return false;
    }

    const glyphId = font.readUInt16BE(glyphOffset);
    return glyphId !== 0;
  }

  return false;
}

function hasGlyphInFormat12(font: Buffer, offset: number, codePoint: number): boolean {
  const groupCount = font.readUInt32BE(offset + 12);
  const groupsOffset = offset + 16;

  for (let index = 0; index < groupCount; index += 1) {
    const groupOffset = groupsOffset + index * 12;
    const start = font.readUInt32BE(groupOffset);
    const end = font.readUInt32BE(groupOffset + 4);
    const startGlyphId = font.readUInt32BE(groupOffset + 8);

    if (codePoint >= start && codePoint <= end) {
      return startGlyphId + (codePoint - start) !== 0;
    }
  }

  return false;
}
