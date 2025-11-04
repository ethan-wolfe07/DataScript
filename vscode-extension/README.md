# Datascript Language Support for VS Code

A Visual Studio Code extension that brings syntax highlighting, basic formatting, and editor-friendly defaults to the Datascript DSL.

## Features

- TextMate grammar for Datascript keywords, Mongo DSL operators, comments, strings, numbers, and built-ins.
- Document formatter that normalizes indentation and block structure (`Ctrl+Alt+F` or `Datascript: Format Document`).
- Inline configuration setting (`datascript.format.indentSize`) to align formatter indentation with project style.

More language services (diagnostics, hover docs, completions) are planned.

## Development

```powershell
npm install
npm run watch
```

In another terminal launch VS Code in extension development mode, pointing to the extension folder:

```powershell
code --extensionDevelopmentPath "path\to\datascript\vscode-extension"
```

Open a `.ds` file, trigger the formatter, and live edits will rebuild thanks to the watch task.

## Building & Packaging

- `npm run build` – compile TypeScript into `dist/`.
- `npm run package` – create a `.vsix` distributable using `@vscode/vsce`.

To publish, ensure you have a Personal Access Token (`VSCE_PAT`) for the Marketplace, then run:

```powershell
npx @vscode/vsce publish
```

## Testing

Formal integration tests are not wired yet. Future work will reuse `@vscode/test-electron` to spin up a headless VS Code and validate formatting + grammar expectations.

## Repository Integration

This folder lives inside the main Datascript repo. Remember to regenerate the docs (`docs/`) or runtime pieces in tandem when language changes affect syntax highlighting/formatting.
