import Parser from "./frontend/parser.ts";
import { createGlobalENV } from "./runtime/environment.ts";
import { evaluate } from "./runtime/interpreter.ts";
import {
  cacheModuleResult,
  clearModuleInProgress,
  markModuleInProgress,
  popModuleContext,
  pushModuleContext,
  resetModuleLoader,
  resolveImportPath,
} from "./runtime/moduleLoader.ts";

// Boot the interpreter in interactive mode.

const [requestedScript] = Deno.args;
const defaultScript = "./scripts/all.ds";
const scriptToRun = resolveTarget(requestedScript ?? defaultScript);

await run(scriptToRun);

function resolveTarget(target: string): string {
  if (!target) {
    return defaultScript;
  }

  try {
    return resolveImportPath(target);
  } catch (_error) {
    console.error(
      `Unable to resolve target '${target}'. Provide a relative or absolute path to a .ds file.`,
    );
    Deno.exit(1);
  }
}

async function run(filename: string) {
  resetModuleLoader();
  const parser = new Parser();
  const env = createGlobalENV();
  const entryPath = resolveImportPath(filename);

  try {
    const input = await Deno.readTextFile(entryPath);
    const program = parser.produceAST(input);
    markModuleInProgress(entryPath);
    pushModuleContext(entryPath);
    const result = await evaluate(program, env);
    cacheModuleResult(entryPath, result);
  } catch (error) {
    console.error(`Failed to execute '${entryPath}':`, error);
    Deno.exit(1);
  } finally {
    clearModuleInProgress(entryPath);
    popModuleContext();
  }
}

