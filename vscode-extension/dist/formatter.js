"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFormatter = registerFormatter;
const vscode = __importStar(require("vscode"));
function computeIndentUnit(options) {
    if (!options.insertSpaces) {
        return "\t";
    }
    const configured = vscode.workspace
        .getConfiguration("datascript")
        .get("format.indentSize", options.tabSize ?? 2);
    const size = Math.max(1, configured || 2);
    return " ".repeat(size);
}
function formatText(document, options) {
    const indentUnit = computeIndentUnit(options);
    const lineCount = document.lineCount;
    const formatted = [];
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
function registerFormatter(context) {
    const selector = { language: "datascript", scheme: "file" };
    const provider = {
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
//# sourceMappingURL=formatter.js.map