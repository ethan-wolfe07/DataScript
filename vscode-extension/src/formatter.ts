import * as vscode from "vscode";

function computeIndentUnit(options: vscode.FormattingOptions): string {
  if (!options.insertSpaces) {
    return "\t";
  }

  const configured = vscode.workspace
    .getConfiguration("datascript")
    .get<number>("format.indentSize", options.tabSize ?? 2);

  const size = Math.max(1, configured || 2);
  return " ".repeat(size);
}

function formatText(document: vscode.TextDocument, options: vscode.FormattingOptions): string {
  const indentUnit = computeIndentUnit(options);
  const lineCount = document.lineCount;
  const formatted: string[] = [];

  let indentLevel = 0;

  for (let i = 0; i < lineCount; i += 1) {
    const line = document.lineAt(i);
    const text = line.text;
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      formatted.push("");
      continue;
    }

    const shouldDedent = /^(\}|\]|\)|catch\b|else\b)/.test(trimmed);
    if (shouldDedent) {
      indentLevel = Math.max(indentLevel - 1, 0);
    }

    const indent = indentUnit.repeat(indentLevel);
    formatted.push(indent + trimmed);

    const openings = (trimmed.match(/[\[{(]/g) ?? []).length;
    const closings = (trimmed.match(/[\]})]/g) ?? []).length;
    indentLevel = Math.max(0, indentLevel + openings - closings);
  }

  return formatted.join("\n");
}

export function registerFormatter(context: vscode.ExtensionContext) {
  const selector: vscode.DocumentSelector = { language: "datascript", scheme: "file" };

  const provider: vscode.DocumentFormattingEditProvider = {
    provideDocumentFormattingEdits(document, options) {
      const formatted = formatText(document, options);
      const lastLine = document.lineAt(document.lineCount - 1);
      const fullRange = new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length);
      return [vscode.TextEdit.replace(fullRange, formatted)];
    },
  };

  context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(selector, provider));

  const command = vscode.commands.registerCommand("datascript.formatDocument", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "datascript") {
      vscode.window.showInformationMessage("Open a Datascript (.ds) file to format.");
      return;
    }

    await vscode.commands.executeCommand("editor.action.formatDocument");
  });

  context.subscriptions.push(command);
}
