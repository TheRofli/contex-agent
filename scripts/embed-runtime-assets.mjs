import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = dirname(dirname(fileURLToPath(import.meta.url)));
const chunkSize = 96;
const maxRuntimeLogoBytes = 140000;

validateRuntimeLogoData();

writeDataUrlModule({
  sourcePath: join(
    pluginDir,
    "assets",
    "fonts",
    "comfortaa",
    "Comfortaa-Regular.ttf"
  ),
  targetPath: join(pluginDir, "src", "views", "mindoFontData.ts"),
  mimeType: "font/ttf",
  exportName: "MINDO_FONT_DATA_URL",
  description:
    "assets/fonts/comfortaa/Comfortaa-Regular.ttf so the Community Plugin install does not need runtime font assets."
});

function validateRuntimeLogoData() {
  const logoDataPath = join(pluginDir, "src", "views", "mindoLogoData.ts");

  if (!existsSync(logoDataPath)) {
    throw new Error(
      "Missing src/views/mindoLogoData.ts. This compact generated runtime asset must be committed; assets/logo.png is the larger design/source asset."
    );
  }

  const logoData = readFileSync(logoDataPath, "utf8");
  const logoDataBytes = statSync(logoDataPath).size;

  if (!logoData.includes("data:image/png;base64")) {
    throw new Error(
      "src/views/mindoLogoData.ts must contain a compact data:image/png;base64 runtime logo."
    );
  }

  if (logoDataBytes > maxRuntimeLogoBytes) {
    throw new Error(
      `src/views/mindoLogoData.ts is ${logoDataBytes} bytes, expected <= ${maxRuntimeLogoBytes}. Preserve the compact runtime logo; assets/logo.png is only the larger design/source asset.`
    );
  }
}

function writeDataUrlModule({ sourcePath, targetPath, mimeType, exportName, description }) {
  const base64 = readFileSync(sourcePath).toString("base64");
  const chunks = base64.match(new RegExp(`.{1,${chunkSize}}`, "g")) ?? [];
  const lines = [
    `// Generated from ${description}`,
    `export const ${exportName} = [`,
    `  "data:${mimeType};base64,",`
  ];

  for (const chunk of chunks) {
    lines.push(`  "${chunk}",`);
  }

  lines.push(`].join("");`);
  writeFileSync(targetPath, `${lines.join("\n")}\n`, "utf8");
}
