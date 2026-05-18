# Mindo First Value Flow Design

Date: 2026-05-18  
Status: Draft for user review  
Direction: Approved verbally as the next product focus after the LLM Council review

## Purpose

Mindo should prove its core promise before growing more advanced features:

> Talk to your Vault. Get sourced answers. Draft safely.

The First Value Flow is the five-minute path that a new or returning user should experience immediately after opening Mindo:

1. Ask a question about the active note or vault.
2. Receive a grounded answer with visible sources.
3. Ask Mindo to create or update Markdown.
4. Review the proposed change before it touches the vault.
5. Apply the change and see a clear receipt with undo where possible.

This is intentionally narrower than voice, Mindo Wiki growth, or broad autonomous agent behavior. Those features can remain, but this flow becomes the product spine they support.

## Success Criteria

- A user can understand what Mindo is for within five minutes of first launch.
- Vault questions prefer vault context over unrelated web search.
- File/name resolution handles fuzzy spoken or typed names without silently opening the wrong file.
- Assistant answers show what Mindo read and where claims came from.
- Note creation or editing is preview-first and never silently mutates the vault.
- The flow is testable through unit tests, integration-style controller tests where available, `npm run verify`, package checks, and a short manual Obsidian smoke script.

## Non-Goals

- Do not redesign the entire sidebar.
- Do not make voice required for the first-run value path.
- Do not require the Rust sidecar for the basic flow.
- Do not turn Mindo into a coding agent.
- Do not add broad autonomous background workflows before trust and source handling are reliable.

## Product Flow

### Empty Or New Chat

The empty Mindo state should continue to feel friendly, but it should also teach the core workflow through compact, practical prompts:

- "What have I already written about this?"
- "Connect this note to related notes."
- "Turn this rough note into a cleaner draft."

These prompts should be phrased in the user's current UI language where the app already has localization support. They should not look like a marketing landing page; they are small action starters inside the working surface.

### Vault Question

When the user asks about the active note or vault, Mindo should:

1. Detect that the request is vault-local unless the user explicitly asks for the web.
2. Gather active-note, selected-text, file-match, and vault-search context.
3. Prefer the best local sources over web results.
4. Answer with compact source references.
5. If the user's file name is ambiguous, ask a short disambiguation question instead of opening a fallback file.

Example:

User: "Open core system strategy."  
Mindo: "I found two close notes: `Proton/Qore Systems Strategy.md` and `Proton/Qore Systems Cases.md`. Which one?"

### Safe Markdown Action

When the user asks to create or edit a note, Mindo should:

1. Produce an action plan in the existing workflow/action system.
2. Show a preview/diff before applying changes.
3. Require explicit apply for mutations unless the current Auto mode already grants this class of action.
4. Report exactly what changed after apply.
5. Offer undo when supported by the existing action executor.

The UI should frame this as a trust feature, not as friction. The product should feel like a careful collaborator.

## Architecture

The design should use existing boundaries instead of adding more logic to the already large sidebar view.

### Existing Anchors

- `src/views/AgentSidebarView.ts` remains the top-level interaction surface.
- `src/views/renderers/*` should own visual changes where possible.
- `src/views/controllers/*` should own sidebar interaction logic where a controller already exists or is easy to add.
- `src/llm/llmClient.ts` and `src/llm/openAiStream.ts` remain the OpenAI-compatible chat and streaming layer.
- `src/search/vaultSearch.ts`, `src/rag/vaultRag.ts`, `src/rag/vectorRag.ts`, and `src/rustCore/*` remain retrieval surfaces.
- `src/workflows/*` is the preferred place for request routing and action planning.
- `src/actions/actionTypes.ts` and `src/actions/actionExecutor.ts` remain the guarded action contract and execution path.

### Proposed Units

#### First Value Prompt Renderer

Responsibility:

- Render compact starter prompts for empty or new chats.
- Keep prompt copy product-focused and localized where existing UI strings already support language selection.
- Dispatch the selected prompt through the same chat submission path as typed text.

Likely location:

- Existing home/empty-state renderer under `src/views/renderers`.

#### Vault Intent Classifier

Responsibility:

- Decide whether a user request should be handled as vault-local, active-note-local, action-oriented, or web-oriented.
- Default ambiguous "describe/open/find this note" requests to vault context, not web.
- Leave explicit web requests available.

Likely location:

- Existing workflow/router layer under `src/workflows` or `src/router`.

#### Fuzzy Vault Resolver

Responsibility:

- Resolve noisy typed or transcribed note names against vault paths.
- Use language-agnostic similarity and aliases generated from the user's actual vault paths, not a hard-coded Russian/English word database.
- Return one of three outcomes: confident match, ambiguous candidates, or no match.
- Never silently fall back to the currently open file when the user asked for a different named file.

Likely location:

- `src/search` or workflow-adjacent resolver module.

#### Source-First Answer Composer

Responsibility:

- Ensure vault answers include source references when local sources were used.
- Keep web search out of vault-local answers unless requested or needed after local failure.
- Make "what Mindo read" visible enough for trust without bloating the chat.

Likely location:

- Existing LLM context composition and source rendering paths.

#### Safe Action Preview Surface

Responsibility:

- Present create/update actions as preview-first.
- Show proposed target note, change summary, and diff where available.
- Apply through the existing guarded action executor.
- Show a receipt after apply.

Likely location:

- Existing workflow/action receipt UI and action executor integration.

## Data Flow

1. User submits text from starter prompt, input box, or live dialogue transcript.
2. Request enters the existing chat/workflow path.
3. Vault Intent Classifier labels the request:
   - active-note question,
   - vault search/question,
   - file open/resolve,
   - safe note action,
   - explicit web/research,
   - ordinary chat.
4. If a file name or note target is present, Fuzzy Vault Resolver runs against vault paths.
5. If resolver is confident, the matched file becomes explicit context or action target.
6. If resolver is ambiguous, Mindo asks a short clarification and does not execute the action.
7. LLM context composition receives active note, matched files, vault snippets, and source metadata.
8. Assistant response streams as Markdown with source references.
9. If an action is planned, Safe Action Preview Surface displays the preview.
10. User applies or cancels.
11. Action executor performs the guarded mutation and returns a receipt.

## Error Handling

- Ambiguous file target: ask a short clarification with 2-5 candidates.
- No file target found: explain that no close note was found and offer to search more broadly or create a note.
- Web fallback needed: say local vault context was insufficient before using web search.
- Action preview generation fails: keep the chat answer, show a non-destructive error, and do not apply.
- Apply fails: show the target path, attempted action, and failure message.
- Optional runtime missing: do not block core flow; keep voice/sidecar diagnostics separate from text-first value.

## Testing Strategy

### Unit Tests

- Vault intent classification:
  - active note questions stay local.
  - explicit web questions route to web.
  - note open/find requests route to resolver.
  - safe edit/create requests route to action planning.
- Fuzzy resolver:
  - confident fuzzy names match expected vault paths.
  - ambiguous names return candidates.
  - no match returns no-match without current-file fallback.
- Source-first behavior:
  - vault-local answers retain source metadata.
  - web sources are not injected into local-only answers.
- Safe action preview:
  - create/update actions produce preview objects before apply.
  - apply path uses guarded executor.

### Integration Or Controller Tests

- Chat submission from starter prompt follows the normal send path.
- Ambiguous resolver result renders a clarification message rather than executing.
- Action preview can be accepted or cancelled.

### Verification Commands

- `npm run test`
- `npm run core:test`
- `npm run build`
- `npm run verify`
- `node scripts/package-plugin.mjs --check`

### Manual Smoke Script

Use a small test vault with at least:

- `Proton/Qore Systems Cases.md`
- `Proton/Qore Systems Strategy.md`
- one active draft note

Smoke flow:

1. Open Mindo in Obsidian.
2. Ask: "What is this note about?"
3. Confirm answer cites the active note.
4. Ask: "Open core system strategy."
5. Confirm Mindo opens the strategy note or asks to choose between close candidates.
6. Ask: "Make this draft clearer."
7. Confirm a preview/diff appears before any edit.
8. Apply the change.
9. Confirm a receipt appears and the note changed as previewed.

## Release And Review Notes

- The Community Plugin install should still work with only `manifest.json`, `main.js`, and `styles.css`.
- The flow must not depend on bundled voice servers or `contex-core`.
- Generated assets and release files should stay out of source-focused review summaries unless they are intentionally regenerated.
- Final implementation should end with `npm run verify` and package check, because those are the repo's release gates.

## Open Product Questions

These should be answered during implementation planning, not by expanding the scope:

- Which first audience should the first-run prompts speak to first: writers, researchers, students, indie makers, or general Obsidian power users?
- Should Auto mode apply safe Markdown changes immediately, or should first-run always force preview until the user trusts Mindo?
- How much source detail should be visible by default versus hidden behind an expandable "sources" surface?

## Self-Review

- Placeholder scan: no TBD/TODO placeholders remain.
- Scope check: this spec covers one product slice, not the entire Mindo roadmap.
- Architecture check: new behavior is routed through workflow/search/rendering boundaries instead of growing `AgentSidebarView.ts`.
- Ambiguity check: the resolver is explicitly forbidden from opening the current file as a fallback when the user asked for a named file.
