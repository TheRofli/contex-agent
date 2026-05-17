import assert from "node:assert/strict";
import { decideVaultActionCandidate } from "../src/router/vaultActionDecision";

const candidates = [
  { path: "Projects/Mindo.md", basename: "Mindo", folder: "Projects", score: 920 },
  { path: "Projects/Milanote.md", basename: "Milanote", folder: "Projects", score: 710 },
  { path: "Archive/Mindo old.md", basename: "Mindo old", folder: "Archive", score: 480 }
];

{
  assert.deepEqual(decideVaultActionCandidate({ candidates }), {
    kind: "direct",
    path: "Projects/Mindo.md",
    reason: "Top vault candidate is clearly ahead."
  });
}

{
  assert.deepEqual(decideVaultActionCandidate({
    candidates: [
      { ...candidates[2], score: 830 },
      { ...candidates[1], score: 850 },
      { ...candidates[0], score: 920 }
    ]
  }), {
    kind: "clarify",
    paths: [
      "Projects/Mindo.md",
      "Projects/Milanote.md",
      "Archive/Mindo old.md"
    ],
    reason: "Top vault candidates are too close."
  });
}

{
  assert.deepEqual(decideVaultActionCandidate({
    candidates,
    llmCandidatePath: "Projects/Milanote.md"
  }), {
    kind: "direct",
    path: "Projects/Milanote.md",
    reason: "LLM selected an exact path from the provided vault candidates."
  });
}

{
  assert.deepEqual(decideVaultActionCandidate({ candidates: [] }), {
    kind: "none",
    reason: "No vault candidates matched the request."
  });
}

{
  assert.deepEqual(decideVaultActionCandidate({
    candidates: [
      {
        path: "Context/Near.md",
        basename: "Near",
        folder: "Context",
        score: 0
      }
    ],
    llmCandidatePath: "missing note"
  }), {
    kind: "none",
    reason: "No positively scored vault candidates matched the request."
  });
}

{
  assert.deepEqual(decideVaultActionCandidate({
    candidates: [
      {
        path: "Context/Near.md",
        basename: "Near",
        folder: "Context",
        score: 0
      }
    ],
    llmCandidatePath: "Context/Near.md"
  }), {
    kind: "direct",
    path: "Context/Near.md",
    reason: "LLM selected an exact path from the provided vault candidates."
  });
}

console.log("vaultActionDecision tests passed");
