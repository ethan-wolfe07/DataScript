# Datascript

Datascript is an experimental, strongly typed scripting language tailored for data-heavy workflows. The project includes a hand-rolled lexer, parser, and interpreter written in TypeScript (running on Deno), a growing standard library, and a Mongo-focused DSL for ergonomic data access. A polished documentation site in `docs/` showcases the language syntax, runtime helpers, and design system.

## Features

- Full frontend toolchain with AST definitions, lexer, and recursive descent parser
- Bytecode-free interpreter with modular environments and import caching
- Rich standard library showcased through executable samples in `scripts/`
- Built-in Mongo DSL helpers (`using mongo`, pipeline operators, schema integration)
- Dark/light themed documentation site with scroll-spy navigation and copy-ready snippets

## Repository Layout

| Path | Description |
| --- | --- |
| `frontend/` | Lexer, AST node definitions, and parser responsible for producing the program tree. |
| `runtime/` | Interpreter implementation, environment and value models, evaluation helpers, and module loader. |
| `scripts/` | Demonstration Datascript programs that exercise language features; `all.ds` runs the full showcase. |
| `docs/` | Static documentation site (open `docs/index.html`) describing syntax, semantics, and Mongo DSL. |
| `modules/`, `samples/` | Additional experiments and reference material used during language exploration. |
| `main.ts` | CLI entry point that parses and executes `.ds` files via the runtime. |

## Prerequisites

- [Deno](https://deno.land/) 1.45 or newer (the project targets the `deno task` workflow and uses `deno.json` imports).

## Quick Start

1. Install Deno and confirm it is available:
   ```powershell
   deno --version
   ```
2. Install dependencies (the first run will auto-cache remote imports).
3. Execute the showcase bundle (defaults to `scripts/all.ds`):
   ```powershell
   deno task run
   ```
4. Execute a specific Datascript file by passing a path:
   ```powershell
   deno run -A main.ts scripts/basics.ds
   ```

The interpreter requires read access to load `.ds` modules; the provided task grants the necessary permissions (`-A`).

## Documentation

Open `docs/index.html` in a browser to explore the Datascript handbook. The site includes:

- Language essentials, typing rules, and control flow constructs
- Module system and async/await guidance
- Mongo DSL reference with scoped connections, operators, and aggregation helpers
- Theme toggle (persistent via `localStorage`) and scroll-spy enhanced navigation

## Sample Programs

The `scripts/` directory contains modular demonstrations you can mix and match. After experiments, return to the aggregate runner:

```powershell
deno run -A main.ts scripts/all.ds
```

Feel free to duplicate these scripts as templates for your own experiments.

## Contributing

Issues and pull requests are welcome. If you add new runtime features or syntax, update both the interpreter and the documentation to keep the handbook in sync. Run the showcase scripts to verify regressions before submitting changes.
