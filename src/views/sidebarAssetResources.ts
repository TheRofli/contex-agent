import { normalizePath, type App, type PluginManifest } from "obsidian";
import { MINDO_FONT_DATA_URL } from "./mindoFontData";
import { MINDO_LOGO_DATA_URL } from "./mindoLogoData";

export function getPluginAssetResourcePath(
  app: App,
  manifest: PluginManifest,
  fileName: string
): string {
  if (fileName === "assets/logo.png") {
    return MINDO_LOGO_DATA_URL;
  }

  if (fileName === "assets/fonts/comfortaa/Comfortaa-Regular.ttf") {
    return MINDO_FONT_DATA_URL;
  }

  const pluginDir = manifest.dir ?? ".obsidian/plugins/mindo";
  const vaultPath = normalizePath(`${pluginDir}/${fileName}`);
  return app.vault.adapter.getResourcePath(vaultPath);
}

export function installRuntimeComfortaaFont(root: HTMLElement): void {
  root.style.setProperty(
    "--mindo-font-family",
    '"Mindo Runtime Comfortaa", "Mindo Comfortaa", var(--font-interface)'
  );

  const styleEl = root.createEl("style", {
    attr: {
      type: "text/css"
    }
  });
  styleEl.setText(
    [
      "@font-face {",
      '  font-family: "Mindo Runtime Comfortaa";',
      `  src: url(${JSON.stringify(MINDO_FONT_DATA_URL)}) format("truetype");`,
      "  font-style: normal;",
      "  font-weight: 400 700;",
      "  font-display: swap;",
      "}"
    ].join("\n")
  );
}
