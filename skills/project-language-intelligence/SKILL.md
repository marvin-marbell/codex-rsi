---
name: project-language-intelligence
description: Use actual LSP and structural AST tooling for each new coding project and affected language before editing.
---

# Project language intelligence

For each new project and affected language, inspect its real manifests, representative files and working directory. Determine language-server root markers and a supported AST parser. A language-server binary on `PATH` or a passing syntax command alone is not proof that Codex can navigate symbols. Do not assume Codex provides an LSP client; check which project/editor integrations are actually available.

1. In the project root and nested package roots if needed, check the available language-server integration. If one exists, configure missing servers with a project-local or user-local package manager, not an unrelated repository dependency edit. Prefer existing project versions and configuration. Use a supported AST parser or structural search tool (`ast-grep`, language AST APIs or framework compiler). Keep machine-specific paths in user-local configuration, not portable skill files.
2. With a working LSP client, exercise actual `symbols` and `definition` or `references` on a known source symbol, plus `diagnostics` on representative files. Before changing an exported symbol, query its references; use rename/code actions when available rather than cross-file text substitution. If unavailable or timed out, inspect the cause and record the capability limit, then use the best available source/AST checks without claiming LSP coverage.
3. Run a positive structural AST query on a known construct in each affected language; distinguish unsupported parser from nonmatching pattern. Use AST for scoped relationship discovery and codemods; text search is a complement, not a substitute for available symbol intelligence. For Vue single-file components, use `@vue/compiler-sfc` for script/template AST if the structural tool lacks a Vue parser.
4. Exercise the changed consumer path and relevant diagnostics after edits. Record server/parser versions, root, probe symbols and unsupported capabilities. On the next project, rediscover language and root markers rather than copying machine-specific settings.
