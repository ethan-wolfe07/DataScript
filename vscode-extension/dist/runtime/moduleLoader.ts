import Parser from "../frontend/parser.ts";
import { Program } from "../frontend/ast.ts";
import { RuntimeVal } from "./values.ts";
import Environment from "./environment.ts";
import { dirname, extname, isAbsolute, normalize, resolve } from "@std/path";

const programCache = new Map<string, Program>();
const resultCache = new Map<string, RuntimeVal>();
const inProgress = new Set<string>();
const moduleStack: string[] = [];

export function resetModuleLoader(): void {
  programCache.clear();
  resultCache.clear();
  inProgress.clear();
  moduleStack.length = 0;
}

export function currentModulePath(): string | undefined {
  return moduleStack[moduleStack.length - 1];
}

export function pushModuleContext(path: string): void {
  moduleStack.push(path);
}

export function popModuleContext(): void {
  moduleStack.pop();
}

export function markModuleInProgress(path: string): void {
  if (inProgress.has(path)) {
    throw `Circular module import detected while loading '${path}'.`;
  }
  inProgress.add(path);
}

export function clearModuleInProgress(path: string): void {
  inProgress.delete(path);
}

export function resolveImportPath(specifier: string): string {
  const importer = currentModulePath();
  const baseDir = importer ? dirname(importer) : Deno.cwd();

  let candidate = specifier;
  if (!isAbsolute(candidate)) {
    candidate = resolve(baseDir, candidate);
  }

  if (!extname(candidate)) {
    candidate = `${candidate}.ds`;
  }

  return normalize(candidate);
}

export function getModuleProgram(path: string): Program {
  const normalized = normalize(path);
  const cached = programCache.get(normalized);
  if (cached) {
    return cached;
  }

  const source = Deno.readTextFileSync(normalized);
  const parser = new Parser();
  const program = parser.produceAST(source);
  programCache.set(normalized, program);
  return program;
}

export function hasModuleResult(path: string): boolean {
  return resultCache.has(normalize(path));
}

export function getModuleResult(path: string): RuntimeVal | undefined {
  return resultCache.get(normalize(path));
}

export function cacheModuleResult(path: string, value: RuntimeVal): void {
  resultCache.set(normalize(path), value);
}

export function removeModuleResult(path: string): void {
  resultCache.delete(normalize(path));
}

export function createModuleEnvironment(
  parent: Environment,
): { env: Environment; exports: Map<string, RuntimeVal> } {
  const exports = new Map<string, RuntimeVal>();
  const env = new Environment(parent, { moduleExports: exports });
  return { env, exports };
}
