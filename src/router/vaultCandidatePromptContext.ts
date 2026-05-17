import {
  normalizeOpenFileValue,
  parseOpenFileQueryParts,
  scoreOpenFilePathCandidate,
  scoreVaultFolderCandidate
} from "../resolver/openFileResolver";
import type { VaultCandidate } from "./vaultCandidates";

export interface VaultCandidatePromptContext {
  text: string;
  selectableFileCandidates: VaultCandidate[];
}

export function buildVaultCandidatePromptContextFromPaths(
  markdownPaths: string[],
  commandText: string,
  effectiveCommandText?: string,
  relatedPaths: string[] = []
): string {
  return buildVaultCandidatePromptContextDataFromPaths(
    markdownPaths,
    commandText,
    effectiveCommandText,
    relatedPaths
  ).text;
}

export function buildVaultCandidatePromptContextDataFromPaths(
  markdownPaths: string[],
  commandText: string,
  effectiveCommandText?: string,
  relatedPaths: string[] = []
): VaultCandidatePromptContext {
  const queryCandidates = getVaultCandidateQueries(
    commandText,
    effectiveCommandText
  );
  const fileCandidates = markdownPaths
    .map((path) => ({
      path,
      basename: getBasename(path),
      folder: getFolderPath(path),
      score: Math.max(
        ...queryCandidates.map((query) => {
          const parts = parseOpenFileQueryParts(query);
          return scoreOpenFilePathCandidate(
            path,
            parts.fileQuery,
            parts.folderQuery
          );
        }),
        0
      )
    }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.path.localeCompare(right.path)
    )
    .slice(0, 16);
  const scoredFilePaths = new Set(fileCandidates.map((candidate) => candidate.path));
  const relatedFolders = new Set(
    relatedPaths
      .map(getFolderPath)
      .filter(Boolean)
  );
  const contextNearFiles = relatedFolders.size
    ? markdownPaths
        .filter(
          (path) =>
            !scoredFilePaths.has(path) && relatedFolders.has(getFolderPath(path))
        )
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 24)
        .map((path) => ({
          path,
          basename: getBasename(path),
          folder: getFolderPath(path),
          score: 0
        }))
    : [];
  const folders = Array.from(
    new Set(markdownPaths.map(getFolderPath).filter(Boolean))
  );
  const scoredFolderCandidates = folders
    .map((folder) => ({
      folder,
      score: Math.max(
        ...queryCandidates.map((query) =>
          scoreVaultFolderCandidate(folder, normalizeOpenFileValue(query))
        ),
        0
      )
    }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.folder.localeCompare(right.folder)
    )
    .slice(0, 12);
  const folderCandidates = scoredFolderCandidates.length
    ? scoredFolderCandidates
    : folders
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 20)
        .map((folder) => ({
          folder,
          score: 0
        }));

  const text = [
    "Vault candidates from the user's real Obsidian vault:",
    "If an action needs a file or folder, prefer one of these exact paths/names instead of inventing a path.",
    "",
    "Folder candidates:",
    folderCandidates.length
      ? folderCandidates
          .map(
            (candidate, index) =>
              `${index + 1}. ${candidate.folder} (score ${candidate.score})`
          )
          .join("\n")
      : "(none)",
    "",
    "File candidates:",
    fileCandidates.length
      ? fileCandidates
          .map(
            (candidate, index) =>
              `${index + 1}. ${candidate.path} (title: ${candidate.basename}, folder: ${candidate.folder || "/"}, score ${candidate.score})`
          )
          .join("\n")
      : "(none)",
    "",
    "Context-near file candidates:",
    contextNearFiles.length
      ? contextNearFiles
          .map(
            (candidate, index) =>
              `${index + 1}. ${candidate.path} (title: ${candidate.basename}, folder: ${candidate.folder || "/"})`
          )
          .join("\n")
      : "(none)"
  ].join("\n");

  return {
    text,
    selectableFileCandidates: [
      ...fileCandidates,
      ...contextNearFiles
    ]
  };
}

function getVaultCandidateQueries(
  commandText: string,
  effectiveCommandText?: string
): string[] {
  return Array.from(
    new Set(
      [effectiveCommandText, commandText]
        .flatMap((query) => {
          const value = query?.trim() ?? "";

          if (!value) {
            return [];
          }

          const parts = parseOpenFileQueryParts(value);
          return [
            value,
            parts.fileQuery,
            parts.folderQuery ?? ""
          ];
        })
        .map((query) => query.trim())
        .filter((query) => query.length >= 2)
    )
  );
}

function getBasename(path: string): string {
  const fileName = path.split("/").pop() ?? path;
  return fileName.replace(/\.md$/i, "");
}

function getFolderPath(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash <= 0 ? "" : path.slice(0, lastSlash);
}
