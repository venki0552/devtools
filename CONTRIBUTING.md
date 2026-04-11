# Contributing to DevTools

First off, thank you for considering contributing to DevTools! Every contribution helps make this tool suite better for developers everywhere.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Branch Rules](#branch-rules)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Adding a New Tool](#adding-a-new-tool)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code. Please report unacceptable behavior by opening an issue.

---

## Branch Rules

We enforce strict branch protection on `master` to maintain code quality:

| Rule                        | Policy                                                   |
| --------------------------- | -------------------------------------------------------- |
| Direct push to `master`     | **Blocked** — no one can push directly, including admins |
| Merging to `master`         | **Only via Pull Request**                                |
| PR approval required        | At least **1 approving review**                          |
| Status checks               | CI (build + tests) must pass before merge                |
| Branch up to date           | PR branch must be up to date with `master` before merge  |
| Force push to `master`      | **Blocked**                                              |
| Branch deletion of `master` | **Blocked**                                              |

### Branch Naming Convention

Use descriptive branch names with a prefix:

```
feat/tool-name-feature    — new features
fix/tool-name-bug-desc    — bug fixes
docs/what-changed         — documentation only
refactor/what-changed     — code refactoring
test/what-changed         — adding or fixing tests
chore/what-changed        — build, CI, dependencies
```

Examples:

```
feat/json-parser-tree-view
fix/base64-file-mode-crash
docs/update-readme
refactor/shared-copy-button
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Git**

### Setup

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/devtools.git
cd devtools

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Verify Your Setup

```bash
# Run all unit/component tests
npm test

# Run the build
npm run build

# Run type checking
npm run typecheck

# Run linting
npm run lint

# Run E2E tests (requires Playwright browsers installed)
npx playwright install
npm run test:e2e
```

---

## Development Workflow

1. **Create a branch** from `master`:

   ```bash
   git checkout master
   git pull origin master
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** — see [Coding Standards](#coding-standards) below.

3. **Write/update tests** — every feature or fix should include tests.

4. **Run checks locally** before pushing:

   ```bash
   npm test          # unit/component tests
   npm run build     # production build
   npm run typecheck # TypeScript checks
   npm run lint      # linting
   ```

5. **Commit** with clear messages:

   ```
   feat(json): add tree view with collapsible nodes
   fix(base64): handle MIME line wrapping correctly
   docs: update README with new tool list
   test(url): add tests for URL builder mode
   ```

6. **Push** and open a Pull Request against `master`.

---

## Pull Request Process

1. **Fill out the PR template** — describe what changed and why.
2. **Link related issues** — use "Closes #123" or "Fixes #456" in the description.
3. **Ensure CI passes** — build, tests, and type checks must all be green.
4. **Request a review** — at least one maintainer must approve.
5. **Keep the PR focused** — one feature or fix per PR. Large changes should be split.
6. **Respond to feedback** — address review comments promptly.

### PR Checklist

- [ ] Code follows the project's [coding standards](#coding-standards)
- [ ] Tests added/updated for the change
- [ ] All tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] TypeScript compiles without errors (`npm run typecheck`)
- [ ] No console.log or debugger statements left in code
- [ ] Self-reviewed the diff before requesting review

---

## Coding Standards

### General

- **TypeScript** for all source code — no `any` types unless absolutely necessary
- **Tailwind CSS** for all styling — no separate CSS files
- **Functional components** with hooks — no class components
- **Named exports** preferred over default exports

### File Structure

Each tool follows this structure:

```
src/components/{tool-name}/
  index.tsx       — main component with all logic
  index.test.tsx  — tests (vitest + @testing-library/react)
```

### Component Patterns

- Use `useLocalStorage` hook from `src/lib/use-local-storage.ts` for persistence
- Use `CopyButton` from `src/components/shared/CopyButton.tsx` for copy actions
- Use `MonacoWrapper` from `src/components/shared/MonacoWrapper.tsx` for code editors
- Use `ErrorBox` from `src/components/shared/ErrorBox.tsx` for error display
- Wrap parse/convert operations in try/catch — show errors inline, never use `alert()`
- Debounce live processing by 300ms

### Testing

- Use **Vitest** + **@testing-library/react** for unit/component tests
- Use **Playwright** for E2E tests
- Mock Monaco Editor via `src/test/mock-monaco.tsx`
- Test user-visible behavior, not implementation details
- Aim for meaningful coverage — don't test trivial getters/setters

### Accessibility

- All interactive elements need `aria-label` attributes
- Use `role="alert"` for error messages
- Ensure logical tab order
- Use visible focus rings (`ring-2 ring-orange-400`)

---

## Adding a New Tool

1. **Create the component**: `src/components/{tool-name}/index.tsx`
2. **Create tests**: `src/components/{tool-name}/index.test.tsx`
3. **Add the route**: `src/routes/{tool-name}.tsx`
4. **Register in sidebar**: Add to `TOOLS` array in `src/lib/constants.ts`
5. **Follow the shared patterns**: Same layout, action bar, Monaco editors, error handling
6. **Add E2E test**: `e2e/{tool-name}.spec.ts`
7. **Update the README**: Add to the tool list

### Tool Conventions

- Store last input in `devtools-{tool-name}-input`
- Store preferences in `devtools-{tool-name}-prefs`
- Restore last input on mount
- Show character/byte counts for input and output
- Show processing time in the output area
- Include Copy and Clear buttons in the action bar

---

## Reporting Bugs

Open an issue with:

1. **Clear title** describing the bug
2. **Steps to reproduce** — numbered steps to trigger the bug
3. **Expected behavior** — what should happen
4. **Actual behavior** — what actually happens
5. **Browser and OS** — e.g., Chrome 120 on Windows 11
6. **Screenshots** if applicable

---

## Suggesting Features

Open an issue with the "feature request" label:

1. **Problem statement** — what problem does this solve?
2. **Proposed solution** — how should it work?
3. **Alternatives considered** — other approaches you thought of
4. **Mockup/example** — if applicable

---

## Questions?

Open a Discussion on GitHub or comment on a related issue. We're happy to help!

---

Thank you for contributing! 🛠️
