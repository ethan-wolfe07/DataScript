import {
  Expr,
  FunctionParameter,
  Stmt,
  TypeAnnotation,
} from "../frontend/ast.ts";
import Environment from "./environment.ts";

// Enumerates the primitive value kinds supported by the interpreter.
export type ValueType =
  | "null"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "string"
  | "native-fn"
  | "function"
  | "class"
  | "promise";

export interface RuntimeVal {
  type: ValueType;
}

export interface NullVal extends RuntimeVal {
  type: "null";
  value: null;
}

// Convenience constructor for null values.
export function MK_NULL() {
  return { type: "null", value: null } as NullVal;
}

export interface NumberVal extends RuntimeVal {
  type: "number";
  value: number;
}

// Wrap a JavaScript number in a runtime box.
export function MK_NUMBER(n: number = 0) {
  return { type: "number", value: n } as NumberVal;
}

export interface BooleanVal extends RuntimeVal {
  type: "boolean";
  value: boolean;
}

// Produce a runtime boolean object.
export function MK_BOOL(b = true) {
  return { type: "boolean", value: b } as BooleanVal;
}

export interface StringVal extends RuntimeVal {
  type: "string";
  value: string;
}

export function MK_STRING(value = "") {
  return { type: "string", value } as StringVal;
}

export interface ObjectVal extends RuntimeVal {
  type: "object";
  properties: Map<string, RuntimeVal>;
  schemaName?: string;
}

export interface ArrayVal extends RuntimeVal {
  type: "array";
  elements: RuntimeVal[];
}

export function MK_ARRAY(elements: RuntimeVal[] = []) {
  return { type: "array", elements } as ArrayVal;
}

export interface PromiseVal extends RuntimeVal {
  type: "promise";
  promise: Promise<RuntimeVal>;
}

export function MK_PROMISE(promise: Promise<RuntimeVal>): PromiseVal {
  return { type: "promise", promise };
}

export type FunctionCall = (
  args: RuntimeVal[],
  env: Environment,
) => RuntimeVal | Promise<RuntimeVal>;

export interface NativeFnValue extends RuntimeVal {
  type: "native-fn";
  call: FunctionCall;
}

export function MK_NATIVE_FN(call: FunctionCall) {
  return { type: "native-fn", call } as NativeFnValue;
}

export interface FunctionValue extends RuntimeVal {
  type: "function";
  name: string;
  parameters: FunctionParameter[];
  declarationEnv: Environment;
  body: Stmt[];
}

export interface ClassValue extends RuntimeVal {
  type: "class";
  name: string;
  fields: ClassField[];
  methods: ClassMethod[];
  declarationEnv: Environment;
  constructorParams?: SchemaConstructorParam[];
  baseName?: string;
}

export interface ClassField {
  name: string;
  typeAnnotation?: TypeAnnotation;
  required: boolean;
  initializer?: Expr;
}

export interface ClassMethod {
  name: string;
  parameters: FunctionParameter[];
  body: Stmt[];
}

export interface SchemaConstructorParam {
  name: string;
  typeAnnotation?: TypeAnnotation;
}

export function MK_CLASS(
  name: string,
  fields: ClassField[],
  methods: ClassMethod[],
  declarationEnv: Environment,
  constructorParams?: SchemaConstructorParam[],
  baseName?: string,
) {
  return {
    type: "class",
    name,
    fields,
    methods,
    declarationEnv,
    constructorParams,
    baseName,
  } as ClassValue;
}

export function runtimeValToJSON(value: RuntimeVal): unknown {
  switch (value.type) {
    case "null":
      return null;
    case "number":
      return (value as NumberVal).value;
    case "boolean":
      return (value as BooleanVal).value;
    case "string":
      return (value as StringVal).value;
    case "array":
      return (value as ArrayVal).elements.map((element) =>
        runtimeValToJSON(element)
      );
    case "object":
      return runtimeObjectToJSON(value as ObjectVal);
    case "native-fn":
      return "[native]";
    case "function": {
      const fn = value as FunctionValue;
      return {
        type: "function",
        name: fn.name || "anonymous",
        parameters: fn.parameters.map((param) => ({
          name: param.name,
          type: param.typeAnnotation
            ? formatTypeAnnotation(param.typeAnnotation)
            : undefined,
          hasDefault: param.defaultValue !== undefined,
        })),
      };
    }
    case "class": {
      const cls = value as ClassValue;
      return {
        type: "schema",
        name: cls.name,
        extends: cls.baseName,
        fields: cls.fields.map((field) => ({
          name: field.name,
          required: field.required,
          type: field.typeAnnotation
            ? formatTypeAnnotation(field.typeAnnotation)
            : undefined,
        })),
      };
    }
    case "promise":
      return "[promise]";
    default:
      return undefined;
  }
}

function runtimeObjectToJSON(obj: ObjectVal): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (obj.schemaName) {
    result.__schema = obj.schemaName;
  }

  for (const [key, val] of obj.properties.entries()) {
    result[key] = runtimeValToJSON(val);
  }

  return result;
}

function formatTypeAnnotation(annotation: TypeAnnotation): string {
  const suffix = annotation.arrayDepth > 0
    ? "[]".repeat(annotation.arrayDepth)
    : "";
  return `${annotation.base}${suffix}`;
}
