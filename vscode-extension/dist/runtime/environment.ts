import { MK_BOOL, MK_NATIVE_FN, MK_NULL, RuntimeVal } from "./values.ts";
import {
  nativeAbs,
  nativeAddFieldsStage,
  nativeAnd,
  nativeAssert,
  nativeCeil,
  nativeClamp,
  nativeClone,
  nativeConnect,
  nativeContains,
  nativeCountStage,
  nativeDebug,
  nativeDeepClone,
  nativeDisconnect,
  nativeEntries,
  nativeEnv,
  nativeEq,
  nativeErrorLog,
  nativeFloor,
  nativeGroupStage,
  nativeGt,
  nativeGte,
  nativeInfo,
  nativeInspect,
  nativeKeys,
  nativeLen,
  nativeLimitStage,
  nativeLookupStage,
  nativeLowerCase,
  nativeLt,
  nativeLte,
  nativeMatchStage,
  nativeMax,
  nativeMin,
  nativeNe,
  nativeOr,
  nativePow,
  nativePrint,
  nativeProjectStage,
  nativeRound,
  nativeSchedule,
  nativeSchemaInfo,
  nativeSkipStage,
  nativeSleep,
  nativeSortStage,
  nativeSplit,
  nativeSqrt,
  nativeStrLen,
  nativeToNumber,
  nativeToString,
  nativeTrim,
  nativeTypeOf,
  nativeUnwindStage,
  nativeUpperCase,
  nativeUuid,
  nativeValues,
  nativeWarn,
  showASTNodeNative,
  timeFunction,
} from "./functions.ts";

export function createGlobalENV() {
  const env = new Environment();
  env.declareVar("true", MK_BOOL(true), true);
  env.declareVar("false", MK_BOOL(false), true);
  env.declareVar("null", MK_NULL(), true);

  // Define native builtin methods
  env.declareVar("print", MK_NATIVE_FN(nativePrint), true);
  env.declareVar("time", MK_NATIVE_FN(timeFunction), true);
  env.declareVar("sleep", MK_NATIVE_FN(nativeSleep), true);
  env.declareVar("showASTNode", MK_NATIVE_FN(showASTNodeNative), true);
  env.declareVar("typeOf", MK_NATIVE_FN(nativeTypeOf), true);
  env.declareVar("inspect", MK_NATIVE_FN(nativeInspect), true);
  env.declareVar("assert", MK_NATIVE_FN(nativeAssert), true);
  env.declareVar("abs", MK_NATIVE_FN(nativeAbs), true);
  env.declareVar("sqrt", MK_NATIVE_FN(nativeSqrt), true);
  env.declareVar("pow", MK_NATIVE_FN(nativePow), true);
  env.declareVar("max", MK_NATIVE_FN(nativeMax), true);
  env.declareVar("min", MK_NATIVE_FN(nativeMin), true);
  env.declareVar("clamp", MK_NATIVE_FN(nativeClamp), true);
  env.declareVar("round", MK_NATIVE_FN(nativeRound), true);
  env.declareVar("floor", MK_NATIVE_FN(nativeFloor), true);
  env.declareVar("ceil", MK_NATIVE_FN(nativeCeil), true);
  env.declareVar("strlen", MK_NATIVE_FN(nativeStrLen), true);
  env.declareVar("uppercase", MK_NATIVE_FN(nativeUpperCase), true);
  env.declareVar("lowercase", MK_NATIVE_FN(nativeLowerCase), true);
  env.declareVar("contains", MK_NATIVE_FN(nativeContains), true);
  env.declareVar("split", MK_NATIVE_FN(nativeSplit), true);
  env.declareVar("trim", MK_NATIVE_FN(nativeTrim), true);
  env.declareVar("toNumber", MK_NATIVE_FN(nativeToNumber), true);
  env.declareVar("toString", MK_NATIVE_FN(nativeToString), true);
  env.declareVar("keys", MK_NATIVE_FN(nativeKeys), true);
  env.declareVar("values", MK_NATIVE_FN(nativeValues), true);
  env.declareVar("eq", MK_NATIVE_FN(nativeEq), true);
  env.declareVar("ne", MK_NATIVE_FN(nativeNe), true);
  env.declareVar("gt", MK_NATIVE_FN(nativeGt), true);
  env.declareVar("gte", MK_NATIVE_FN(nativeGte), true);
  env.declareVar("lt", MK_NATIVE_FN(nativeLt), true);
  env.declareVar("lte", MK_NATIVE_FN(nativeLte), true);
  env.declareVar("and", MK_NATIVE_FN(nativeAnd), true);
  env.declareVar("or", MK_NATIVE_FN(nativeOr), true);
  env.declareVar("entries", MK_NATIVE_FN(nativeEntries), true);
  env.declareVar("len", MK_NATIVE_FN(nativeLen), true);
  env.declareVar("clone", MK_NATIVE_FN(nativeClone), true);
  env.declareVar("deepClone", MK_NATIVE_FN(nativeDeepClone), true);
  env.declareVar("debug", MK_NATIVE_FN(nativeDebug), true);
  env.declareVar("info", MK_NATIVE_FN(nativeInfo), true);
  env.declareVar("warn", MK_NATIVE_FN(nativeWarn), true);
  env.declareVar("error", MK_NATIVE_FN(nativeErrorLog), true);
  env.declareVar("schemaInfo", MK_NATIVE_FN(nativeSchemaInfo), true);
  env.declareVar("env", MK_NATIVE_FN(nativeEnv), true);
  env.declareVar("uuid", MK_NATIVE_FN(nativeUuid), true);
  env.declareVar("schedule", MK_NATIVE_FN(nativeSchedule), true);
  env.declareVar("connect", MK_NATIVE_FN(nativeConnect), true);
  env.declareVar("disconnect", MK_NATIVE_FN(nativeDisconnect), true);
  env.declareVar("match", MK_NATIVE_FN(nativeMatchStage), true);
  env.declareVar("project", MK_NATIVE_FN(nativeProjectStage), true);
  env.declareVar("sort", MK_NATIVE_FN(nativeSortStage), true);
  env.declareVar("limit", MK_NATIVE_FN(nativeLimitStage), true);
  env.declareVar("skip", MK_NATIVE_FN(nativeSkipStage), true);
  env.declareVar("group", MK_NATIVE_FN(nativeGroupStage), true);
  env.declareVar("lookup", MK_NATIVE_FN(nativeLookupStage), true);
  env.declareVar("unwind", MK_NATIVE_FN(nativeUnwindStage), true);
  env.declareVar("addFields", MK_NATIVE_FN(nativeAddFieldsStage), true);
  env.declareVar("count", MK_NATIVE_FN(nativeCountStage), true);

  return env;
}

export default class Environment {
  private parent?: Environment;
  private variables: Map<string, RuntimeVal>;
  private constants: Set<string>;
  private moduleExports?: Map<string, RuntimeVal>;

  constructor(
    parentENV?: Environment,
    options: { moduleExports?: Map<string, RuntimeVal> } = {},
  ) {
    this.parent = parentENV;
    this.variables = new Map();
    this.constants = new Set();
    this.moduleExports = options.moduleExports;
  }

  // Define a new variable in the current scope.
  public declareVar(
    varName: string,
    value: RuntimeVal,
    constant: boolean,
  ): RuntimeVal {
    if (this.variables.has(varName)) {
      throw `Variable '${varName}' is already declared in this scope. Rename it or assign to the existing binding instead.`;
    }

    this.variables.set(varName, value);

    if (constant) {
      this.constants.add(varName);
    }

    return value;
  }

  // Update an existing variable, searching parent scopes if needed.
  public assignVar(varName: string, value: RuntimeVal): RuntimeVal {
    const env = this.resolve(varName);

    // Canot assign to a constant
    if (env.constants.has(varName)) {
      throw `Attempted to reassign constant '${varName}'. Use 'declare' without 'const' if the binding should remain mutable.`;
    }

    env.variables.set(varName, value);
    return value;
  }

  // Read a variable's value, respecting lexical scope.
  public lookupVar(varName: string): RuntimeVal {
    const env = this.resolve(varName);
    return env.variables.get(varName) as RuntimeVal;
  }

  // Walk up the scope chain until the variable is found.
  public resolve(varName: string): Environment {
    if (this.variables.has(varName)) return this;
    if (this.parent == undefined) {
      throw `Unable to resolve '${varName}'. Check for typos or ensure it is declared before use.`;
    }

    return this.parent.resolve(varName);
  }

  public hasOwnBinding(varName: string): boolean {
    return this.variables.has(varName);
  }

  public hasBinding(varName: string): boolean {
    if (this.variables.has(varName)) {
      return true;
    }

    if (this.parent) {
      return this.parent.hasBinding(varName);
    }

    return false;
  }

  public removeVar(varName: string): void {
    if (this.variables.delete(varName)) {
      this.constants.delete(varName);
      return;
    }

    if (this.parent) {
      this.parent.removeVar(varName);
    }
  }

  public setModuleExport(varName: string, value: RuntimeVal): void {
    if (this.moduleExports) {
      this.moduleExports.set(varName, value);
      return;
    }

    if (this.parent) {
      this.parent.setModuleExport(varName, value);
      return;
    }

    throw `Cannot export '${varName}' from this scope. Ensure exports happen within a module.`;
  }

  public getModuleExports(): Map<string, RuntimeVal> | undefined {
    if (this.moduleExports) {
      return this.moduleExports;
    }

    if (this.parent) {
      return this.parent.getModuleExports();
    }

    return undefined;
  }
}
