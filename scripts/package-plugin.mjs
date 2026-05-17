import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(pluginDir, "dist");
const distDir = join(distRoot, "mindo");
const checkOnly = process.argv.includes("--check");

const requiredFiles = [
  "manifest.json",
  "main.js",
  "styles.css"
];
const optionalFiles = [
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "versions.json",
  "docs/RELEASE.md"
];
const optionalDirectories = [
  "assets/fonts/comfortaa",
  "bin",
  "tools/stt_server",
  "tools/tts_server"
];
const ignoredDirectoryNames = new Set([
  "node_modules",
  "target",
  "__pycache__",
  ".pytest_cache",
  ".cache",
  ".mindo-docker",
  ".mindo-piper",
  ".mindo-stt",
  ".mindo-stt-runtime",
  ".mindo-kokoro-js",
  ".mindo-silero",
  ".contex-docker",
  ".contex-piper",
  ".contex-stt",
  ".contex-stt-runtime",
  ".contex-kokoro-js",
  ".contex-silero",
  ".huggingface",
  "pip-cache"
]);
const ignoredFileNames = new Set([
  "data.json",
  ".env",
  ".env.local",
  ".DS_Store",
  "Thumbs.db"
]);
const ignoredExtensions = new Set([".pyc"]);

const missing = requiredFiles.filter((file) => !existsSync(join(pluginDir, file)));

if (missing.length) {
  console.error(`Missing release files: ${missing.join(", ")}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(join(pluginDir, "package.json"), "utf8"));
const versions = existsSync(join(pluginDir, "versions.json"))
  ? JSON.parse(readFileSync(join(pluginDir, "versions.json"), "utf8"))
  : {};

if (manifest.version !== packageJson.version) {
  console.error(
    `Version mismatch: manifest.json=${manifest.version} package.json=${packageJson.version}`
  );
  process.exit(1);
}

if (manifest.description !== packageJson.description) {
  console.error(
    `Description mismatch: manifest.json="${manifest.description}" package.json="${packageJson.description}"`
  );
  process.exit(1);
}

if (/\bobsidian\b/i.test(manifest.description)) {
  console.error(
    "manifest.json description must not include the word Obsidian for community plugin submission."
  );
  process.exit(1);
}

if (manifest.isDesktopOnly !== true) {
  console.error(
    "manifest.json must set isDesktopOnly=true because Mindo bundles desktop runtimes and Node process APIs."
  );
  process.exit(1);
}

if (versions[manifest.version] !== manifest.minAppVersion) {
  console.error(
    `versions.json must map ${manifest.version} to ${manifest.minAppVersion}`
  );
  process.exit(1);
}

assertCommunityReleaseAssets();

if (checkOnly) {
  console.log("Release package check passed.");
  process.exit(0);
}

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const file of [...requiredFiles, ...optionalFiles]) {
  copyIfExists(file);
}

for (const dir of optionalDirectories) {
  copyDirectoryIfExists(dir);
}

const packageManifest = buildPackageManifest();
writeFileSync(
  join(distRoot, "mindo-release.json"),
  JSON.stringify(
    {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      files: packageManifest
    },
    null,
    2
  ) + "\n"
);

console.log(`Release package created: ${relative(pluginDir, distDir)}`);
console.log(`Files: ${packageManifest.length}`);

function assertCommunityReleaseAssets() {
  const mainJs = readFileSync(join(pluginDir, "main.js"), "utf8");
  const stylesCss = readFileSync(join(pluginDir, "styles.css"), "utf8");
  const unsafeCssUrls = extractCssUrlValues(stylesCss).filter(
    (value) => !isSafeCommunityCssUrl(value)
  );

  if (!mainJs.includes("data:image/png;base64")) {
    console.error("main.js must embed the Mindo logo data URL.");
    process.exit(1);
  }

  if (!mainJs.includes("data:font/ttf;base64")) {
    console.error("main.js must embed the Mindo font data URL.");
    process.exit(1);
  }

  if (unsafeCssUrls.length) {
    console.error(
      `styles.css must not depend on non-data url(...) assets: ${unsafeCssUrls
        .map((value) => JSON.stringify(value || "<empty>"))
        .join(", ")}`
    );
    process.exit(1);
  }
}

function extractCssUrlValues(css) {
  const withoutComments = stripCssComments(css);
  const urls = [];
  const lowerCss = withoutComments.toLowerCase();
  let index = 0;

  while (index < withoutComments.length) {
    const start = lowerCss.indexOf("url(", index);

    if (start === -1) {
      break;
    }

    if (start > 0 && /[a-z0-9_-]/i.test(withoutComments[start - 1])) {
      index = start + "url(".length;
      continue;
    }

    let cursor = start + "url(".length;
    while (cursor < withoutComments.length && /\s/.test(withoutComments[cursor])) {
      cursor += 1;
    }

    const quote = withoutComments[cursor];

    if (quote === '"' || quote === "'") {
      const valueStart = cursor + 1;
      cursor = valueStart;

      while (cursor < withoutComments.length) {
        if (withoutComments[cursor] === "\\") {
          cursor += 2;
          continue;
        }

        if (withoutComments[cursor] === quote) {
          break;
        }

        cursor += 1;
      }

      urls.push(withoutComments.slice(valueStart, cursor).trim());
      const closingParen = withoutComments.indexOf(")", cursor + 1);
      index = closingParen === -1 ? withoutComments.length : closingParen + 1;
      continue;
    }

    const valueStart = cursor;

    while (cursor < withoutComments.length) {
      if (withoutComments[cursor] === "\\") {
        cursor += 2;
        continue;
      }

      if (withoutComments[cursor] === ")") {
        break;
      }

      cursor += 1;
    }

    urls.push(withoutComments.slice(valueStart, cursor).trim());
    index = cursor < withoutComments.length ? cursor + 1 : withoutComments.length;
  }

  return urls;
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function isSafeCommunityCssUrl(value) {
  return /^data:/i.test(value.trim());
}

function copyIfExists(path) {
  const source = join(pluginDir, path);

  if (!existsSync(source)) {
    return;
  }

  const target = join(distDir, path);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function copyDirectoryIfExists(path) {
  const source = join(pluginDir, path);

  if (!existsSync(source)) {
    return;
  }

  copyDirectory(source, join(distDir, path));
}

function copyDirectory(source, target) {
  const entries = readdirSync(source, { withFileTypes: true });
  mkdirSync(target, { recursive: true });

  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);

    if (shouldIgnore(entry.name, sourcePath, entry.isDirectory())) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
}

function shouldIgnore(name, path, isDirectory) {
  if (ignoredFileNames.has(name)) {
    return true;
  }

  if (isDirectory && ignoredDirectoryNames.has(name)) {
    return true;
  }

  return Array.from(ignoredExtensions).some((extension) =>
    path.toLowerCase().endsWith(extension)
  );
}

function buildPackageManifest() {
  const files = [];
  collectFiles(distDir, files);

  return files
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => ({
      path: file.path,
      bytes: file.bytes,
      sha256: file.sha256
    }));
}

function collectFiles(dir, files) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      collectFiles(path, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const buffer = readFileSync(path);

    files.push({
      path: relative(distDir, path).replaceAll("\\", "/"),
      bytes: statSync(path).size,
      sha256: createHash("sha256").update(buffer).digest("hex")
    });
  }
}
