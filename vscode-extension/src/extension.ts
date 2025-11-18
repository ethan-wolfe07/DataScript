import type { ExtensionContext } from "vscode";
import { registerFormatter } from "./formatter";
import { registerRunner } from "./runner";

export function activate(context: ExtensionContext) {
  registerFormatter(context);
  registerRunner(context);
}

export function deactivate() {
  // Nothing to clean up currently.
}
