<div align="center">

# DevTools

**A comprehensive suite of 21 developer utilities — entirely client-side, no backend, no tracking.**

[![CI](https://github.com/venki0552/devtools/actions/workflows/ci.yml/badge.svg)](https://github.com/venki0552/devtools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Tests](https://img.shields.io/badge/Tests-752%20passing-green.svg)](#testing)

[Live Demo](https://devtls.vercel.app/) · [Report Bug](https://github.com/venki0552/devtools/issues/new?template=bug_report.md) · [Request Feature](https://github.com/venki0552/devtools/issues/new?template=feature_request.md)

</div>

---

## Why DevTools?

Every developer constantly reaches for small utilities — formatting JSON, decoding JWTs, comparing diffs, generating UUIDs. Most online tools are ad-ridden, send your data to a server, or require sign-ups.

**DevTools is different:**

- **100% client-side** — your data never leaves your browser
- **No ads, no tracking, no accounts** — just tools
- **21 tools** in one place with a consistent, keyboard-friendly interface
- **Dark mode first** — easy on the eyes during late-night debugging
- **Open source** — MIT licensed, free forever

---

## Tools

### Parsers & Formatters

| Tool                        | Route            | Description                                                                                                                                                                             |
| --------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JSON Parser & Formatter** | `/json`          | Smart parsing that handles single quotes, trailing commas, comments, base64-encoded JSON, and more. Tree view with search, collapsible nodes, and type badges.                          |
| **XML Formatter**           | `/xml`           | Format, minify, and validate XML. Smart parsing for HTML fragments and malformed XML. Structure panel with element tree and namespace inspector. XML→JSON conversion.                   |
| **SQL Formatter**           | `/sql-formatter` | Format SQL with configurable dialect (PostgreSQL, MySQL, SQLite, SQL Server, BigQuery), keyword case, indentation, and clause spacing. Powered by sql-formatter.                        |
| **GraphQL Formatter**       | `/graphql`       | Three modes: Query Formatter (format + minify), Schema Explorer (browse SDL types, fields, reverse references), and Variables Inspector (validate query variables against definitions). |

### Converters

| Tool                     | Route        | Description                                                                                                                                                                                       |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSV ↔ JSON**           | `/csv-json`  | Bidirectional conversion with auto-delimiter detection, type parsing (numbers, booleans, nulls), multiple output formats, nested object flattening, and file drag-and-drop.                       |
| **YAML ↔ JSON**          | `/yaml-json` | Convert between YAML and JSON with strict/permissive modes, multi-document support, anchor resolution, round-trip checking, and duplicate key warnings.                                           |
| **Base64 Encode/Decode** | `/base64`    | Four modes: Text→Base64, Base64→Text, File→Base64, Base64→File. Supports Standard, URL-safe, and MIME variants with configurable line wrapping and text encodings.                                |
| **URL Encode/Decode**    | `/url`       | Four modes: Encode, Decode, Query String Parser (editable table), and URL Builder. Auto-detects input type, handles IDN hostnames and IPv6.                                                       |
| **Color Converter**      | `/color`     | Accepts any color format (HEX, RGB, HSL, HSV, CMYK, Lab, LCH, Oklch, named CSS colors). Shows all formats simultaneously, WCAG contrast checker, color harmonies, palette generator, and history. |

### Analyzers & Viewers

| Tool                  | Route             | Description                                                                                                                                                                                          |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQL Visualizer**    | `/sql-visualizer` | Client-side SQL analysis (node-sql-parser). Generates plain-English summary, JOIN graph SVG, Venn diagrams, data flow stepper, output shape prediction, and performance warnings.                    |
| **JSON Diff Viewer**  | `/json-diff`      | Deep JSON diffing with tree and flat views, show/hide unchanged nodes, match percentage, copy as RFC 6902 JSON Patch, and array identity key matching.                                               |
| **Text Diff Viewer**  | `/diff`           | Unified and side-by-side diff modes with synchronized scroll, context line control, character-level inner diffs, similarity percentage, and .patch file download.                                    |
| **Regex Tester**      | `/regex`          | Live match highlighting, capture group extraction, replace mode with backreferences, optional AI pattern explanation (BYO API key), catastrophic backtracking detection, and common pattern library. |
| **HTTP Status Codes** | `/http-status`    | Complete reference for all HTTP status codes including unofficial (nginx, Cloudflare). Card and table views, search, favorites, associated headers, and code examples.                               |

### Generators & Decoders

| Tool                   | Route       | Description                                                                                                                                                                                                           |
| ---------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JWT Decoder**        | `/jwt`      | Live decode with color-coded token parts, standard claim labels with expiry countdown, algorithm security badges, raw/decoded toggle, and nested JWT detection.                                                       |
| **Hash Generator**     | `/hash`     | MD5, SHA-1, SHA-256, SHA-384, SHA-512 computed simultaneously. Text and file modes with chunked hashing for large files, encoding options, and hash comparison mode.                                                  |
| **UUID Generator**     | `/uuid`     | Generate v4, v7, and ULID identifiers. Bulk generation up to 1,000 with multiple output formats (JSON, SQL VALUES, etc.). UUID decoder with v1 timestamp extraction.                                                  |
| **CRON Builder**       | `/cron`     | Visual grid builders for each cron field, Standard/Quartz/AWS formats, timezone-aware next-run previews, run frequency statistics, and date-specific warnings.                                                        |
| **Epoch Converter**    | `/epoch`    | Live clock, bidirectional epoch↔datetime conversion with flexible parsing (ISO, US, European, relative), timezone comparator for up to 5 timezones with DST detection.                                                |
| **Mock API Generator** | `/mock-api` | Client-side mock data generation (Faker) from JSON Schema, example JSON, or plain English descriptions. Multiple output formats, locale support, and copy as fetch mock or MSW handler.                               |
| **Env Var Manager**    | `/env`      | Multi-project environment variable management with masked values, import (.env, JSON, YAML, shell exports), 7 export formats (including Docker, K8s Secret, GitHub Actions), group filtering, and project comparison. |

---

## Tech Stack

| Layer           | Technology                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Framework**   | [React 19](https://react.dev/) + [TypeScript 6](https://www.typescriptlang.org/)                                        |
| **Build**       | [Vite 8](https://vite.dev/)                                                                                             |
| **Routing**     | [TanStack Router](https://tanstack.com/router)                                                                          |
| **Styling**     | [Tailwind CSS v4](https://tailwindcss.com/)                                                                             |
| **Code Editor** | [Monaco Editor](https://microsoft.github.io/monaco-editor/)                                                             |
| **Icons**       | [Lucide React](https://lucide.dev/)                                                                                     |
| **Testing**     | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) + [Playwright](https://playwright.dev/) |

### Key Libraries

| Package                     | Used By              |
| --------------------------- | -------------------- |
| `sql-formatter`             | SQL Formatter        |
| `js-yaml`                   | YAML ↔ JSON          |
| `jsondiffpatch`             | JSON Diff            |
| `diff`                      | Text Diff            |
| `graphql` + `prettier`      | GraphQL Formatter    |
| `cronstrue` + `cron-parser` | CRON Builder         |
| `spark-md5`                 | Hash Generator (MD5) |
| `ulidx` + `uuid`            | UUID Generator       |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x

### Installation

```bash
git clone https://github.com/venki0552/devtools.git
cd devtools
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
npm run preview    # preview the production build locally
```

---

## Scripts

| Command                 | Description                       |
| ----------------------- | --------------------------------- |
| `npm run dev`           | Start development server with HMR |
| `npm run build`         | Production build                  |
| `npm run preview`       | Preview production build locally  |
| `npm test`              | Run all unit and component tests  |
| `npm run test:watch`    | Run tests in watch mode           |
| `npm run test:coverage` | Run tests with coverage report    |
| `npm run test:e2e`      | Run Playwright E2E tests          |
| `npm run test:e2e:ui`   | Run E2E tests with Playwright UI  |
| `npm run typecheck`     | TypeScript type checking          |
| `npm run lint`          | ESLint                            |

---

## Testing

The project has comprehensive test coverage:

- **752 unit/component tests** across 35 test files (Vitest + Testing Library)
- **36 E2E tests** (Playwright)
- Every tool has its own test file at `src/components/{tool}/index.test.tsx`

```bash
# Run all tests
npm test

# Run tests for a specific tool
npx vitest run src/components/json/index.test.tsx

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

---

## Project Structure

```
devtools/
├── .github/
│   ├── workflows/ci.yml          # CI pipeline (build, test, E2E)
│   ├── ISSUE_TEMPLATE/           # Bug report & feature request templates
│   └── PULL_REQUEST_TEMPLATE.md  # PR template
├── docs/                         # Additional documentation
├── e2e/                          # Playwright E2E tests
├── public/                       # Static assets
├── src/
│   ├── assets/                   # Images, SVGs
│   ├── components/
│   │   ├── layout/               # Sidebar, TopBar, ThemeProvider
│   │   ├── shared/               # CopyButton, ErrorBox, EmptyState, MonacoWrapper, StatsBar
│   │   ├── json/                 # JSON Parser & Formatter
│   │   ├── xml/                  # XML Formatter
│   │   ├── sql-formatter/        # SQL Formatter
│   │   ├── sql-visualizer/       # SQL Visualizer
│   │   ├── csv-json/             # CSV ↔ JSON
│   │   ├── yaml-json/            # YAML ↔ JSON
│   │   ├── json-diff/            # JSON Diff Viewer
│   │   ├── base64/               # Base64 Encode/Decode
│   │   ├── jwt/                  # JWT Decoder
│   │   ├── url/                  # URL Encode/Decode
│   │   ├── hash/                 # Hash Generator
│   │   ├── regex/                # Regex Tester
│   │   ├── cron/                 # CRON Builder
│   │   ├── http-status/          # HTTP Status Codes
│   │   ├── mock-api/             # Mock API Generator
│   │   ├── epoch/                # Epoch Converter
│   │   ├── uuid/                 # UUID Generator
│   │   ├── color/                # Color Converter
│   │   ├── diff/                 # Text Diff Viewer
│   │   ├── graphql/              # GraphQL Formatter
│   │   └── env/                  # Env Var Manager
│   ├── lib/                      # Shared utilities (hooks, clipboard, constants)
│   ├── routes/                   # TanStack Router route definitions
│   ├── test/                     # Test setup and mocks
│   ├── index.css                 # Global styles (Tailwind)
│   ├── main.tsx                  # App entry point
│   └── routeTree.gen.ts          # Generated route tree
├── CONTRIBUTING.md               # Contribution guidelines
├── LICENSE                       # MIT License
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

---

## Privacy & Security

- **All processing happens in your browser** — nothing is sent to any server
- **No analytics, no cookies, no tracking**
- Data is stored in `localStorage` only — clearing your browser data removes everything
- The only external API call is the optional Regex Tester "Explain" tab, which goes directly to Anthropic when you explicitly provide your own API key
- API keys are stored in your browser's `localStorage` and never logged or transmitted elsewhere

---

## AI Features

One tool has an optional AI feature powered by the Anthropic API (Claude):

| Tool             | Feature                           | Required?                 |
| ---------------- | --------------------------------- | ------------------------- |
| **Regex Tester** | Pattern explanation (Explain tab) | No — optional enhancement |

Everything else — including the SQL Visualizer and Mock API Generator — runs 100% client-side with no API calls. To use the Explain tab, you need an [Anthropic API key](https://console.anthropic.com/). The key is stored locally in your browser and calls go directly from your browser to the Anthropic API.

---

## Design System

| Token      | Value                      |
| ---------- | -------------------------- |
| Background | `zinc-950`                 |
| Panels     | `zinc-800`                 |
| Borders    | `zinc-700`                 |
| Accent     | `orange-400`               |
| Success    | `green-400`                |
| Error      | `red-400`                  |
| Code font  | JetBrains Mono             |
| UI font    | Inter                      |
| Dark mode  | Default (toggle available) |

---

## Contributing

We welcome contributions! Please read our [Contributing Guide](./CONTRIBUTING.md) for details on:

- Branch naming and protection rules
- Development workflow
- Pull request process
- Coding standards
- Adding new tools

**Important:** The `master` branch is protected. All changes must go through Pull Requests with CI passing and at least one approval. See [Branch Protection Setup](./docs/BRANCH_PROTECTION_SETUP.md) for details.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

You are free to use, modify, and distribute this software for any purpose, commercial or personal.

---

## Acknowledgments

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) for the code editing experience
- [Tailwind CSS](https://tailwindcss.com/) for the styling system
- [Lucide](https://lucide.dev/) for the icon set
- [Anthropic](https://anthropic.com/) for the optional AI regex explanation feature
- All the open source packages that make this project possible

---

<div align="center">

**Built with TypeScript, React, and a lot of developer frustration with existing tools.**

[Report Bug](https://github.com/venki0552/devtools/issues/new?template=bug_report.md) · [Request Feature](https://github.com/venki0552/devtools/issues/new?template=feature_request.md) · [Contribute](./CONTRIBUTING.md)

</div>
