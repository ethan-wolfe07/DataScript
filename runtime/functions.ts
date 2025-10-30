import Environment from "./environment.ts";
import { invokeCallable } from "./eval/expressions.ts";
import { connectMongo, disconnectMongo, isMongoDatabase } from "./mongo.ts";
import {
  clearDatabaseBinding,
  consumeCollectionBindings,
  getDatabaseBinding,
} from "./mongoState.ts";
import {
  ArrayVal,
  BooleanVal,
  ClassField,
  ClassMethod,
  ClassValue,
  FunctionValue,
  MK_ARRAY,
  MK_BOOL,
  MK_NULL,
  MK_NUMBER,
  MK_PROMISE,
  MK_STRING,
  NumberVal,
  ObjectVal,
  RuntimeVal,
  runtimeValToJSON,
  SchemaConstructorParam,
  StringVal,
} from "./values.ts";

function stringifyRuntimeVal(value: RuntimeVal): string {
  switch (value.type) {
    case "null":
      return "null";
    case "number":
      return (value as NumberVal).value.toString();
    case "boolean":
      return (value as BooleanVal).value ? "true" : "false";
    case "string":
      return (value as StringVal).value;
    case "object": {
      const entries = Array.from((value as ObjectVal).properties.entries())
        .map(([key, val]) => `${key}: ${stringifyRuntimeVal(val)}`);
      return `{ ${entries.join(", ")} }`;
    }
    case "array": {
      const array = (value as ArrayVal).elements.map(stringifyRuntimeVal);
      return `[${array.join(", ")}]`;
    }
    case "function": {
      const fn = value as FunctionValue;
      const name = fn.name || "anonymous";
      const params = fn.parameters.map((param) => param.name).join(", ");
      return `<function ${name}(${params})>`;
    }
    case "native-fn": {
      return "<native fn>";
    }
    case "class": {
      return `<class ${(value as ClassValue).name}>`;
    }
    case "promise": {
      return "<promise>";
    }
    default:
      return "<unknown>";
  }
}
function makeObject(
  entries: Record<string, RuntimeVal | undefined>,
): ObjectVal {
  const result: ObjectVal = {
    type: "object",
    properties: new Map(),
    schemaName: undefined,
  };
  for (const [key, maybeValue] of Object.entries(entries)) {
    if (typeof maybeValue === "undefined") {
      continue;
    }
    result.properties.set(key, maybeValue);
  }
  return result;
}

function formatAnnotation(
  annotation?: { base: string; arrayDepth: number },
): RuntimeVal {
  if (!annotation) {
    return MK_NULL();
  }

  const suffix = annotation.arrayDepth > 0
    ? "[]".repeat(annotation.arrayDepth)
    : "";
  return MK_STRING(`${annotation.base}${suffix}`);
}

function cloneRuntime(
  value: RuntimeVal,
  deep: boolean,
  visited: Map<RuntimeVal, RuntimeVal>,
): RuntimeVal {
  if (visited.has(value)) {
    return visited.get(value) as RuntimeVal;
  }

  switch (value.type) {
    case "object": {
      const original = value as ObjectVal;
      const copy: ObjectVal = {
        type: "object",
        properties: new Map(),
        schemaName: original.schemaName,
      };
      visited.set(value, copy);

      for (const [key, child] of original.properties.entries()) {
        const clonedChild = deep ? cloneRuntime(child, true, visited) : child;
        copy.properties.set(key, clonedChild);
      }

      return copy;
    }
    case "array": {
      const original = value as ArrayVal;
      const clonedElements = deep
        ? original.elements.map((child) => cloneRuntime(child, true, visited))
        : original.elements.slice();
      const arrayCopy = MK_ARRAY(clonedElements);
      visited.set(value, arrayCopy);
      return arrayCopy;
    }
    default:
      return value;
  }
}

function createQueryEquality(field: string, value: RuntimeVal): ObjectVal {
  const wrapper = makeObject({});
  wrapper.properties.set(field, cloneRuntime(value, true, new Map()));
  return wrapper;
}

function createQueryComparison(
  field: string,
  operator: string,
  value: RuntimeVal,
): ObjectVal {
  const comparison = makeObject({});
  comparison.properties.set(
    operator,
    cloneRuntime(value, true, new Map()),
  );
  const wrapper = makeObject({});
  wrapper.properties.set(field, comparison);
  return wrapper;
}

function makeStageObject(stage: string, payload: RuntimeVal): ObjectVal {
  const stageObject = makeObject({});
  stageObject.properties.set(stage, cloneRuntime(payload, true, new Map()));
  return stageObject;
}

function expectArgCount(
  fnName: string,
  args: RuntimeVal[],
  expected: number,
): void {
  if (args.length !== expected) {
    throw `${fnName} expects ${expected} argument${
      expected === 1 ? "" : "s"
    } but received ${args.length}.`;
  }
}

function expectAtLeastArgs(
  fnName: string,
  args: RuntimeVal[],
  minimum: number,
): void {
  if (args.length < minimum) {
    throw `${fnName} expects at least ${minimum} argument${
      minimum === 1 ? "" : "s"
    } but received ${args.length}.`;
  }
}

function requireArray(
  fnName: string,
  value: RuntimeVal,
  position: number,
): ArrayVal {
  if (value.type !== "array") {
    throw `${fnName} argument ${position} must be an array, received '${value.type}'.`;
  }
  return value as ArrayVal;
}

function requireNumber(
  fnName: string,
  value: RuntimeVal,
  position: number,
): number {
  if (value.type !== "number") {
    throw `${fnName} argument ${position} must be a number, received '${value.type}'.`;
  }
  return (value as NumberVal).value;
}

function requireString(
  fnName: string,
  value: RuntimeVal,
  position: number,
): string {
  if (value.type !== "string") {
    throw `${fnName} argument ${position} must be a string, received '${value.type}'.`;
  }
  return (value as StringVal).value;
}

function requireObject(
  fnName: string,
  value: RuntimeVal,
  position: number,
): ObjectVal {
  if (value.type !== "object") {
    throw `${fnName} argument ${position} must be an object, received '${value.type}'.`;
  }
  return value as ObjectVal;
}

export function nativePrint(args: RuntimeVal[], _env: Environment): RuntimeVal {
  if (args.length === 0) {
    console.log();
    return MK_NULL();
  }

  const formatted = args.map(stringifyRuntimeVal).join(" ");
  console.log(formatted);
  return MK_NULL();
}

export function timeFunction(_args: RuntimeVal[], _env: Environment) {
  return MK_NUMBER(Date.now());
}

export function showASTNodeNative(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  if (args.length !== 1) {
    throw `showASTNode expects exactly 1 argument but received ${args.length}.`;
  }

  const structure = runtimeValToJSON(args[0]);
  const json = JSON.stringify(structure, null, 2) ?? "undefined";
  return MK_STRING(json);
}

export function nativeTypeOf(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("typeOf", args, 1);
  const target = args[0];

  if (target.type === "object") {
    const object = target as ObjectVal;
    if (object.schemaName) {
      return MK_STRING(object.schemaName);
    }
  }

  if (target.type === "class") {
    const schema = target as ClassValue;
    return MK_STRING(schema.name);
  }

  return MK_STRING(target.type);
}

export function nativeInspect(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("inspect", args, 1);
  const value = args[0];
  const structure = runtimeValToJSON(value);
  const serialized = typeof structure === "string"
    ? structure
    : JSON.stringify(structure, null, 2) ?? "undefined";

  console.log(serialized);
  return value;
}

export function nativeAssert(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectAtLeastArgs("assert", args, 1);
  const condition = args[0];

  if (condition.type !== "boolean") {
    throw "assert expects a boolean as its first argument.";
  }

  if (!(condition as BooleanVal).value) {
    const message = args[1]
      ? requireString("assert", args[1], 2)
      : "Assertion failed.";
    throw message;
  }

  return MK_NULL();
}

export function nativeAbs(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("abs", args, 1);
  return MK_NUMBER(Math.abs(requireNumber("abs", args[0], 1)));
}

export function nativeSqrt(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("sqrt", args, 1);
  const value = requireNumber("sqrt", args[0], 1);
  if (value < 0) {
    throw "sqrt expects a non-negative number.";
  }
  return MK_NUMBER(Math.sqrt(value));
}

export function nativePow(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("pow", args, 2);
  const base = requireNumber("pow", args[0], 1);
  const exponent = requireNumber("pow", args[1], 2);
  return MK_NUMBER(Math.pow(base, exponent));
}

export function nativeMax(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectAtLeastArgs("max", args, 1);
  const values = args.map((arg, index) => requireNumber("max", arg, index + 1));
  return MK_NUMBER(Math.max(...values));
}

export function nativeMin(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectAtLeastArgs("min", args, 1);
  const values = args.map((arg, index) => requireNumber("min", arg, index + 1));
  return MK_NUMBER(Math.min(...values));
}

export function nativeClamp(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("clamp", args, 3);
  const value = requireNumber("clamp", args[0], 1);
  const min = requireNumber("clamp", args[1], 2);
  const max = requireNumber("clamp", args[2], 3);

  if (min > max) {
    throw "clamp expects the second argument to be less than or equal to the third argument.";
  }

  return MK_NUMBER(Math.min(Math.max(value, min), max));
}

export function nativeRound(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("round", args, 1);
  return MK_NUMBER(Math.round(requireNumber("round", args[0], 1)));
}

export function nativeFloor(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("floor", args, 1);
  return MK_NUMBER(Math.floor(requireNumber("floor", args[0], 1)));
}

export function nativeCeil(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("ceil", args, 1);
  return MK_NUMBER(Math.ceil(requireNumber("ceil", args[0], 1)));
}

export function nativeStrLen(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("strlen", args, 1);
  return MK_NUMBER(requireString("strlen", args[0], 1).length);
}

export function nativeUpperCase(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("uppercase", args, 1);
  return MK_STRING(requireString("uppercase", args[0], 1).toUpperCase());
}

export function nativeLowerCase(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("lowercase", args, 1);
  return MK_STRING(requireString("lowercase", args[0], 1).toLowerCase());
}

export function nativeContains(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("contains", args, 2);
  const haystack = requireString("contains", args[0], 1);
  const needle = requireString("contains", args[1], 2);
  return MK_BOOL(haystack.includes(needle));
}

export function nativeTrim(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("trim", args, 1);
  return MK_STRING(requireString("trim", args[0], 1).trim());
}

export function nativeSplit(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("split", args, 2);
  const source = requireString("split", args[0], 1);
  const delimiter = requireString("split", args[1], 2);
  const parts = source.split(delimiter).map((part) => MK_STRING(part));
  return MK_ARRAY(parts);
}

export function nativeToNumber(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("toNumber", args, 1);
  const value = args[0];

  if (value.type === "number") {
    return value;
  }

  if (value.type === "boolean") {
    return MK_NUMBER((value as BooleanVal).value ? 1 : 0);
  }

  if (value.type === "null") {
    return MK_NUMBER(0);
  }

  if (value.type === "string") {
    const text = (value as StringVal).value.trim();
    const parsed = Number(text);
    if (Number.isNaN(parsed)) {
      throw `toNumber could not convert '${text}' to a number.`;
    }
    return MK_NUMBER(parsed);
  }

  throw `toNumber does not support values of type '${value.type}'.`;
}

export function nativeToString(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("toString", args, 1);
  return MK_STRING(stringifyRuntimeVal(args[0]));
}

export function nativeEq(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("eq", args, 2);
  const field = requireString("eq", args[0], 1);
  return createQueryEquality(field, args[1]);
}

export function nativeNe(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("ne", args, 2);
  const field = requireString("ne", args[0], 1);
  return createQueryComparison(field, "$ne", args[1]);
}

export function nativeGt(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("gt", args, 2);
  const field = requireString("gt", args[0], 1);
  return createQueryComparison(field, "$gt", args[1]);
}

export function nativeGte(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("gte", args, 2);
  const field = requireString("gte", args[0], 1);
  return createQueryComparison(field, "$gte", args[1]);
}

export function nativeLt(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("lt", args, 2);
  const field = requireString("lt", args[0], 1);
  return createQueryComparison(field, "$lt", args[1]);
}

export function nativeLte(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("lte", args, 2);
  const field = requireString("lte", args[0], 1);
  return createQueryComparison(field, "$lte", args[1]);
}

export function nativeAnd(args: RuntimeVal[], _env: Environment): RuntimeVal {
  if (args.length === 0) {
    throw "and expects at least one condition.";
  }

  const elements: RuntimeVal[] = args.length === 1 && args[0].type === "array"
    ? requireArray("and", args[0], 1).elements.map((element) =>
      cloneRuntime(element, true, new Map())
    )
    : args.map((arg) => cloneRuntime(arg, true, new Map()));

  const wrapper = makeObject({});
  wrapper.properties.set("$and", MK_ARRAY(elements));
  return wrapper;
}

export function nativeOr(args: RuntimeVal[], _env: Environment): RuntimeVal {
  if (args.length === 0) {
    throw "or expects at least one condition.";
  }

  const elements: RuntimeVal[] = args.length === 1 && args[0].type === "array"
    ? requireArray("or", args[0], 1).elements.map((element) =>
      cloneRuntime(element, true, new Map())
    )
    : args.map((arg) => cloneRuntime(arg, true, new Map()));

  const wrapper = makeObject({});
  wrapper.properties.set("$or", MK_ARRAY(elements));
  return wrapper;
}

export function nativeMatchStage(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("match", args, 1);
  const filter = requireObject("match", args[0], 1);
  return makeStageObject("$match", filter);
}

export function nativeProjectStage(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("project", args, 1);
  const projection = requireObject("project", args[0], 1);
  return makeStageObject("$project", projection);
}

export function nativeSortStage(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("sort", args, 1);
  const sortSpec = requireObject("sort", args[0], 1);
  return makeStageObject("$sort", sortSpec);
}

export function nativeLimitStage(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("limit", args, 1);
  const value = requireNumber("limit", args[0], 1);
  return makeStageObject("$limit", MK_NUMBER(value));
}

export function nativeSkipStage(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("skip", args, 1);
  const value = requireNumber("skip", args[0], 1);
  return makeStageObject("$skip", MK_NUMBER(value));
}

export function nativeGroupStage(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("group", args, 1);
  const spec = requireObject("group", args[0], 1);
  return makeStageObject("$group", spec);
}

export function nativeLookupStage(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  if (args.length === 1) {
    const payload = requireObject("lookup", args[0], 1);
    return makeStageObject("$lookup", payload);
  }

  if (args.length === 4) {
    const from = requireString("lookup", args[0], 1);
    const localField = requireString("lookup", args[1], 2);
    const foreignField = requireString("lookup", args[2], 3);
    const alias = requireString("lookup", args[3], 4);

    const payload = makeObject({
      from: MK_STRING(from),
      localField: MK_STRING(localField),
      foreignField: MK_STRING(foreignField),
      as: MK_STRING(alias),
    });
    return makeStageObject("$lookup", payload);
  }

  throw "lookup expects either a single configuration object or four string arguments (from, localField, foreignField, as).";
}

export function nativeUnwindStage(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("unwind", args, 1);
  const target = args[0];

  if (target.type === "string") {
    const path = requireString("unwind", target, 1);
    const normalized = path.startsWith("$") ? path : `$${path}`;
    return makeStageObject("$unwind", MK_STRING(normalized));
  }

  const config = requireObject("unwind", target, 1);
  return makeStageObject("$unwind", config);
}

export function nativeAddFieldsStage(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("addFields", args, 1);
  const spec = requireObject("addFields", args[0], 1);
  return makeStageObject("$addFields", spec);
}

export function nativeCountStage(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("count", args, 1);
  const field = requireString("count", args[0], 1);
  return makeStageObject("$count", MK_STRING(field));
}

export function nativeKeys(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("keys", args, 1);
  const target = args[0];

  if (target.type == "object") {
    const object = target as ObjectVal;
    const entries = Array.from(object.properties.keys()).map((key) =>
      MK_STRING(key)
    );
    return MK_ARRAY(entries);
  }

  if (target.type == "array") {
    const array = target as ArrayVal;
    const indexes = array.elements.map((_, index) => MK_NUMBER(index));
    return MK_ARRAY(indexes);
  }

  if (target.type == "string") {
    const str = target as StringVal;
    const indexes = Array.from(
      { length: str.value.length },
      (_, index) => MK_NUMBER(index),
    );
    return MK_ARRAY(indexes);
  }

  throw "keys expects an object, array, or string.";
}

export function nativeValues(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("values", args, 1);
  const target = args[0];

  if (target.type == "object") {
    const object = target as ObjectVal;
    const values = Array.from(object.properties.values()).map((value) =>
      cloneRuntime(value, false, new Map())
    );
    return MK_ARRAY(values);
  }

  if (target.type == "array") {
    const array = target as ArrayVal;
    return MK_ARRAY(array.elements.slice());
  }

  if (target.type == "string") {
    const str = target as StringVal;
    const chars = Array.from(str.value).map((ch) => MK_STRING(ch));
    return MK_ARRAY(chars);
  }

  throw "values expects an object, array, or string.";
}

export function nativeEntries(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("entries", args, 1);
  const target = args[0];

  if (target.type == "object") {
    const object = target as ObjectVal;
    const entries = Array.from(object.properties.entries()).map((
      [key, value],
    ) => MK_ARRAY([MK_STRING(key), cloneRuntime(value, false, new Map())]));
    return MK_ARRAY(entries);
  }

  if (target.type == "array") {
    const array = target as ArrayVal;
    const entries = array.elements.map((value, index) =>
      MK_ARRAY([MK_NUMBER(index), value])
    );
    return MK_ARRAY(entries);
  }

  if (target.type == "string") {
    const str = target as StringVal;
    const entries = Array.from(str.value).map((ch, index) =>
      MK_ARRAY([MK_NUMBER(index), MK_STRING(ch)])
    );
    return MK_ARRAY(entries);
  }

  throw "entries expects an object, array, or string.";
}

export function nativeLen(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("len", args, 1);
  const target = args[0];

  if (target.type == "array") {
    return MK_NUMBER((target as ArrayVal).elements.length);
  }

  if (target.type == "string") {
    return MK_NUMBER((target as StringVal).value.length);
  }

  if (target.type == "object") {
    return MK_NUMBER((target as ObjectVal).properties.size);
  }

  throw "len expects an array, string, or object.";
}

export function nativeClone(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("clone", args, 1);
  return cloneRuntime(args[0], false, new Map());
}

export function nativeDeepClone(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  expectArgCount("deepClone", args, 1);
  return cloneRuntime(args[0], true, new Map());
}

function logWithLevel(
  level: "DEBUG" | "INFO" | "WARN" | "ERROR",
  method: "debug" | "log" | "warn" | "error",
  args: RuntimeVal[],
): RuntimeVal {
  const formatted = args.map(stringifyRuntimeVal);
  (console as unknown as Record<string, (...input: unknown[]) => void>)[method](
    `[${level}]`,
    ...formatted,
  );
  return MK_NULL();
}

export function nativeDebug(args: RuntimeVal[], _env: Environment): RuntimeVal {
  return logWithLevel("DEBUG", "debug", args);
}

export function nativeInfo(args: RuntimeVal[], _env: Environment): RuntimeVal {
  return logWithLevel("INFO", "log", args);
}

export function nativeWarn(args: RuntimeVal[], _env: Environment): RuntimeVal {
  return logWithLevel("WARN", "warn", args);
}

export function nativeErrorLog(
  args: RuntimeVal[],
  _env: Environment,
): RuntimeVal {
  return logWithLevel("ERROR", "error", args);
}

function buildFieldMetadata(fields: ClassField[]): ArrayVal {
  const fieldValues = fields.map((field) =>
    makeObject({
      name: MK_STRING(field.name),
      required: MK_BOOL(field.required),
      type: formatAnnotation(field.typeAnnotation),
      hasDefault: MK_BOOL(!!field.initializer),
    })
  );
  return MK_ARRAY(fieldValues);
}

function buildConstructorMetadata(params?: SchemaConstructorParam[]): ArrayVal {
  if (!params || params.length === 0) {
    return MK_ARRAY([]);
  }

  const paramValues = params.map((param) =>
    makeObject({
      name: MK_STRING(param.name),
      type: formatAnnotation(param.typeAnnotation),
    })
  );

  return MK_ARRAY(paramValues);
}

function buildMethodMetadata(methods: ClassMethod[]): ArrayVal {
  const methodValues = methods.map((method) => MK_STRING(method.name));
  return MK_ARRAY(methodValues);
}

function buildInstanceValues(object: ObjectVal, deep: boolean): ObjectVal {
  const result: ObjectVal = {
    type: "object",
    properties: new Map(),
    schemaName: undefined,
  };
  for (const [key, value] of object.properties.entries()) {
    result.properties.set(key, cloneRuntime(value, deep, new Map()));
  }
  return result;
}

export function nativeSchemaInfo(
  args: RuntimeVal[],
  env: Environment,
): RuntimeVal {
  expectArgCount("schemaInfo", args, 1);
  const target = args[0];

  if (target.type == "class") {
    const cls = target as ClassValue;
    return makeObject({
      kind: MK_STRING("schema"),
      name: MK_STRING(cls.name),
      extends: cls.baseName ? MK_STRING(cls.baseName) : MK_NULL(),
      fields: buildFieldMetadata(cls.fields),
      methods: buildMethodMetadata(cls.methods),
      constructor: buildConstructorMetadata(cls.constructorParams),
    });
  }

  if (target.type == "object") {
    const object = target as ObjectVal;
    let classValue: ClassValue | undefined = undefined;

    if (object.schemaName) {
      try {
        const binding = env.lookupVar(object.schemaName);
        if (binding.type == "class") {
          classValue = binding as ClassValue;
        }
      } catch (_error) {
        // Ignore lookup failures and fall back to instance-only information.
      }
    }

    return makeObject({
      kind: MK_STRING("instance"),
      name: object.schemaName
        ? MK_STRING(object.schemaName)
        : MK_STRING("object"),
      extends: classValue && classValue.baseName
        ? MK_STRING(classValue.baseName)
        : MK_NULL(),
      fields: classValue ? buildFieldMetadata(classValue.fields) : MK_ARRAY([]),
      methods: classValue
        ? buildMethodMetadata(classValue.methods)
        : MK_ARRAY([]),
      constructor: classValue
        ? buildConstructorMetadata(classValue.constructorParams)
        : MK_ARRAY([]),
      values: buildInstanceValues(object, false),
    });
  }

  throw "schemaInfo expects a schema declaration or schema instance.";
}

export function nativeEnv(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectAtLeastArgs("env", args, 1);
  const key = requireString("env", args[0], 1);
  const value = Deno.env.get(key);

  if (typeof value === "string") {
    return MK_STRING(value);
  }

  if (args.length >= 2) {
    return args[1];
  }

  return MK_NULL();
}

export function nativeUuid(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("uuid", args, 0);
  if (typeof crypto.randomUUID === "function") {
    return MK_STRING(crypto.randomUUID());
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return MK_STRING(hex);
}

export function nativeSchedule(
  args: RuntimeVal[],
  env: Environment,
): RuntimeVal {
  if (args.length < 2 || args.length > 3) {
    throw `schedule expects 2 or 3 arguments but received ${args.length}.`;
  }

  const delay = requireNumber("schedule", args[0], 1);
  if (delay < 0) {
    throw "schedule expects the delay to be zero or greater.";
  }

  const callable = args[1];
  if (callable.type !== "function" && callable.type !== "native-fn") {
    throw "schedule expects a function or native function as its second argument.";
  }

  let callArgs: RuntimeVal[] = [];
  if (args.length === 3) {
    const list = requireArray("schedule", args[2], 3);
    callArgs = list.elements.map((element) =>
      cloneRuntime(element, true, new Map())
    );
  }

  const timerId = setTimeout(() => {
    const clonedArgs = callArgs.map((element) =>
      cloneRuntime(element, true, new Map())
    );
    invokeCallable(callable, clonedArgs, env).catch((error) => {
      console.error("[schedule] callback error:", error);
    });
  }, delay);

  return MK_NUMBER(timerId);
}

export function nativeSleep(args: RuntimeVal[], _env: Environment): RuntimeVal {
  expectArgCount("sleep", args, 1);
  const delay = requireNumber("sleep", args[0], 1);
  if (delay < 0) {
    throw "sleep expects the delay to be zero or greater.";
  }

  return MK_PROMISE(
    new Promise((resolve) => {
      setTimeout(() => {
        resolve(MK_NULL());
      }, delay);
    }),
  );
}

export async function nativeConnect(
  args: RuntimeVal[],
  _env: Environment,
): Promise<RuntimeVal> {
  if (args.length === 0 || args.length > 2) {
    throw "connect expects a connection string and an optional database name.";
  }

  const uri = requireString("connect", args[0], 1);
  const databaseName = args.length === 2
    ? requireString("connect", args[1], 2)
    : undefined;

  const database = await connectMongo(uri, databaseName);
  return database;
}

export function nativeDisconnect(
  args: RuntimeVal[],
  env: Environment,
): RuntimeVal {
  if (args.length > 1) {
    throw "disconnect expects at most one argument.";
  }

  let databaseValue: RuntimeVal | undefined;
  let bindingToClear: string | null = null;

  if (args.length === 0) {
    bindingToClear = getDatabaseBinding();
    if (!bindingToClear) {
      throw "disconnect requires a database handle or an active database established via the database keyword.";
    }
    if (!env.hasBinding(bindingToClear)) {
      throw "The active database binding is no longer available.";
    }
    databaseValue = env.lookupVar(bindingToClear);
  } else {
    databaseValue = args[0];
    const activeBinding = getDatabaseBinding();
    if (activeBinding && env.hasBinding(activeBinding)) {
      const activeValue = env.lookupVar(activeBinding);
      if (activeValue === databaseValue) {
        bindingToClear = activeBinding;
      }
    }
  }

  if (!databaseValue || !isMongoDatabase(databaseValue)) {
    throw "disconnect expects a Mongo database handle produced by connect.";
  }

  const result = disconnectMongo(databaseValue);
  return MK_PROMISE(result.then(() => {
    if (bindingToClear) {
      env.removeVar(bindingToClear);
      clearDatabaseBinding();
      for (const name of consumeCollectionBindings()) {
        env.removeVar(name);
      }
    }
    return MK_NULL();
  }));
}
