import type { VaultCandidate } from "./vaultCandidates";

export type VaultActionCandidateDecision =
  | {
      kind: "direct";
      path: string;
      reason: string;
    }
  | {
      kind: "clarify";
      paths: string[];
      reason: string;
    }
  | {
      kind: "none";
      reason: string;
    };

export interface DecideVaultActionCandidateInput {
  candidates: VaultCandidate[];
  llmCandidatePath?: string;
  ambiguityGap?: number;
}

const DEFAULT_AMBIGUITY_GAP = 160;

export function decideVaultActionCandidate(
  input: DecideVaultActionCandidateInput
): VaultActionCandidateDecision {
  const { llmCandidatePath } = input;
  const ambiguityGap = input.ambiguityGap ?? DEFAULT_AMBIGUITY_GAP;
  const candidates = [...input.candidates].sort(
    (left, right) => right.score - left.score || left.path.localeCompare(right.path)
  );

  if (!candidates.length) {
    return {
      kind: "none",
      reason: "No vault candidates matched the request."
    };
  }

  const exactLlmCandidate = llmCandidatePath
    ? candidates.find((candidate) => candidate.path === llmCandidatePath)
    : undefined;

  if (exactLlmCandidate) {
    return {
      kind: "direct",
      path: exactLlmCandidate.path,
      reason: "LLM selected an exact path from the provided vault candidates."
    };
  }

  const rankedCandidates = candidates.filter((candidate) => candidate.score > 0);

  if (!rankedCandidates.length) {
    return {
      kind: "none",
      reason: "No positively scored vault candidates matched the request."
    };
  }

  const [topCandidate, secondCandidate] = rankedCandidates;

  if (!secondCandidate || topCandidate.score - secondCandidate.score >= ambiguityGap) {
    return {
      kind: "direct",
      path: topCandidate.path,
      reason: "Top vault candidate is clearly ahead."
    };
  }

  return {
    kind: "clarify",
    paths: rankedCandidates.slice(0, 3).map((candidate) => candidate.path),
    reason: "Top vault candidates are too close."
  };
}
