# Testing Mindo

## Fast Focused Test

Run one or more focused tests while developing:

```bash
node scripts/run-tests.mjs tests/openFileResolver.test.ts
```

## Full TypeScript Test Suite

```bash
npm run test
```

## Full Release Check

```bash
npm run release:check
```

This runs the production build, TypeScript tests, Rust tests, bundle budgets, and release package policy checks.

## Community Install Smoke

Community Plugin installs must work with only:

- `manifest.json`
- `main.js`
- `styles.css`

The smoke tests must verify that logo and font assets are embedded into `main.js` and that `styles.css` does not depend on external `assets/*` paths.

## Sidebar Visual Contract

```bash
node scripts/run-tests.mjs tests/sidebarVisualContract.test.ts
```

This focused contract protects the Mindo sidebar visual language: the purple accent token, home hero classes, readable dark Markdown text inside light chat/live-dialogue bubbles, assistant/live transcript bubble styling, and review-safe CSS without `!important`, `text-decoration`, or `./assets` style dependencies. It also parses `src/views/**/*.ts` to catch new native title tooltips from `setAttribute("title", ...)` and `attr: { title: ... }` without flagging normal business fields named `title`.

## Bundle Budgets

```bash
npm run build
node scripts/run-tests.mjs tests/bundleBudget.test.ts
```

These focused budgets inspect the current built artifacts and embedded assets, so run `npm run build` first when using the focused command. `npm run verify` and `npm run release:check` enforce the same budget after the production build as part of the release gate.
