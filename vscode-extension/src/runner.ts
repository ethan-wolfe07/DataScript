import * as vscode from "vscode";
import * as path from "path";

const outputChannel = vscode.window.createOutputChannel("Datascript");

type EntryPointSource = "configured" | "auto";

type EntryPointCandidate = {
  path: string;
  source: EntryPointSource;
};

function normalize(p: string): string {
  return path.normalize(p);
}

function addCandidate(
  seen: Set<string>,
  list: EntryPointCandidate[],
  candidate: EntryPointCandidate,
) {
  const normalized = normalize(candidate.path);
  if (!seen.has(normalized)) {
    seen.add(normalized);
    list.push(candidate);
  }
}

async function resolveEntryPoint(
  document: vscode.TextDocument,
  workspaceFolder: vscode.WorkspaceFolder | undefined,
  config: vscode.WorkspaceConfiguration,
): Promise<EntryPointCandidate | undefined> {
  outputChannel.appendLine("[resolveEntryPoint] starting lookup");

  const explicitRoots = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
  const workspaceRoot = workspaceFolder?.uri.fsPath ?? explicitRoots[0];
  const configured = (config.get<string>("runtime.entryPoint") ?? "").trim();
  const candidates: EntryPointCandidate[] = [];
  const seen = new Set<string>();

  if (configured.length > 0) {
    const absoluteCandidate = path.isAbsolute(configured)
      ? configured
      : workspaceRoot
      ? path.join(workspaceRoot, configured)
      : path.resolve(path.dirname(document.uri.fsPath), configured);
    addCandidate(seen, candidates, { path: absoluteCandidate, source: "configured" });
  }

  if (workspaceRoot) {
    addCandidate(seen, candidates, {
      path: path.join(workspaceRoot, "main.ts"),
      source: "auto",
    });
  }

  for (const root of explicitRoots) {
    addCandidate(seen, candidates, {
      path: path.join(root, "main.ts"),
      source: "auto",
    });
  }

  let currentDir = path.dirname(document.uri.fsPath);
  while (true) {
    addCandidate(seen, candidates, {
      path: path.join(currentDir, "main.ts"),
      source: "auto",
    });
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

  for (const candidate of candidates) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(candidate.path));
      outputChannel.appendLine(
        `[resolveEntryPoint] using candidate ${candidate.path} (source=${candidate.source})`,
      );
      return candidate;
    } catch (_error) {
      // continue to next candidate
    }
  }

  outputChannel.appendLine(
    `[resolveEntryPoint] failed. configured='${configured}', workspaceRoot='${workspaceRoot ?? "<none>"}' candidates=${candidates
      .map((c) => c.path)
      .join("; ")}`,
  );
  return undefined;
}

async function persistEntryPoint(
  config: vscode.WorkspaceConfiguration,
  workspaceFolder: vscode.WorkspaceFolder | undefined,
  entryPoint: string,
  alreadyConfigured: boolean,
) {
  if (alreadyConfigured) {
    return;
  }

  const target = workspaceFolder
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : vscode.ConfigurationTarget.Workspace;
  const root = workspaceFolder?.uri.fsPath;
  const valueToStore = root ? path.relative(root, entryPoint) : entryPoint;

  await config.update("runtime.entryPoint", valueToStore, target);
}

function buildCommand(
  document: vscode.TextDocument,
  config: vscode.WorkspaceConfiguration,
  entryPoint: string,
) {
  const denoPath = (config.get<string>("runtime.denoPath") ?? "deno").trim() || "deno";
  const args = ["run", "-A", entryPoint, document.uri.fsPath];
  return { command: denoPath, args };
}

async function promptForEntryPoint(
  workspaceFolder: vscode.WorkspaceFolder | undefined,
  config: vscode.WorkspaceConfiguration,
): Promise<string | undefined> {
  const selection = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Select Datascript entry point",
    defaultUri: workspaceFolder?.uri,
    filters: { TypeScript: ["ts"] },
  });

  if (!selection || selection.length === 0) {
    return undefined;
  }

  const chosen = selection[0].fsPath;
  const root = workspaceFolder?.uri.fsPath;

  const target = workspaceFolder
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : vscode.ConfigurationTarget.Workspace;

  const valueToStore = root ? path.relative(root, chosen) : chosen;
  await config.update("runtime.entryPoint", valueToStore, target);

  return chosen;
}

function quote(arg: string): string {
  if (!/\s/.test(arg) && !arg.includes("\"")) {
    return arg;
  }

  return `"${arg.replace(/(["\\])/g, "\\$1")}"`;
}

export function registerRunner(context: vscode.ExtensionContext) {
  const runCommand = vscode.commands.registerCommand("datascript.runFile", async () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor || editor.document.languageId !== "datascript") {
      vscode.window.showInformationMessage("Open a Datascript (.ds) file to run it.");
      return;
    }

    const document = editor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const config = vscode.workspace.getConfiguration("datascript", document.uri);
    const resolved = await resolveEntryPoint(document, workspaceFolder, config);

    let entryPoint = resolved?.path;

    if (!entryPoint) {
      entryPoint = await promptForEntryPoint(workspaceFolder, config);
    }

    if (!entryPoint) {
      vscode.window.showWarningMessage(
        "Datascript entry point is not configured. Run command cancelled.",
      );
      outputChannel.show(true);
      return;
    }

    await persistEntryPoint(config, workspaceFolder, entryPoint, resolved?.source === "configured");

    const { command, args } = buildCommand(document, config, entryPoint);

    const terminalName = "Datascript";
    const existing = vscode.window.terminals.find((term) => term.name === terminalName);
    const terminal = existing ?? vscode.window.createTerminal(terminalName);
    terminal.show(true);

    const workspaceRoot = workspaceFolder?.uri.fsPath;
    const cwd = workspaceRoot ?? path.dirname(document.uri.fsPath);
    const cdCommand = `cd ${quote(cwd)}`;
    terminal.sendText(cdCommand, true);

    const runCommandText = `${quote(command)} ${args.map(quote).join(" ")}`;
    terminal.sendText(runCommandText, true);
  });

  context.subscriptions.push(runCommand);
}
