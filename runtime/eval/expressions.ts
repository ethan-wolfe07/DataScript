// deno-lint-ignore-file no-explicit-any
import {
  ArrayLiteral,
  AssignmentExpr,
  AwaitExpr,
  BinaryExpr,
  CallExpr,
  Identifier,
  MemberExpr,
  MongoOperationExpr,
  MongoQueryCondition,
  MongoQueryExpr,
  MongoUpdateExpr,
  ObjectLiteral,
  TypeAnnotation,
  UnaryExpr,
} from "../../frontend/ast.ts";
import Environment from "../environment.ts";
import { evaluate } from "../interpreter.ts";
import {
  ArrayVal,
  BooleanVal,
  ClassField,
  ClassMethod,
  ClassValue,
  FunctionValue,
  MK_ARRAY,
  MK_BOOL,
  MK_NATIVE_FN,
  MK_NULL,
  MK_NUMBER,
  MK_STRING,
  NativeFnValue,
  NumberVal,
  ObjectVal,
  PromiseVal,
  RuntimeVal,
  runtimeValToJSON,
  StringVal,
} from "../values.ts";
import {
  createCollectionFromDatabase,
  executeMongoOperation,
  executeMongoUpdate,
  isMongoDatabase,
  plainToRuntime,
  runtimeToPlain,
} from "../mongo.ts";
import { BreakSignal, ContinueSignal, ReturnSignal } from "./control.ts";

function divideWithThrow(numerator: number, denominator: number): number {
  if (denominator === 0) {
    throw new Error(
      `Cannot divide ${numerator} by zero. Provide a non-zero denominator.`,
    );
  }
  return numerator / denominator;
}

// Evaluate a numeric left/right pair using the provided operator.
function eval_numeric_binary_expr(
  lhs: NumberVal,
  rhs: NumberVal,
  operator: string,
): NumberVal {
  let result: number;
  try {
    if (operator == "+") result = lhs.value + rhs.value;
    else if (operator == "-") result = lhs.value - rhs.value;
    else if (operator == "*") result = lhs.value * rhs.value;
    else if (operator == "/") result = divideWithThrow(lhs.value, rhs.value);
    else if (operator == "%") result = lhs.value % rhs.value;
    else {throw new Error(
        `Unsupported operator '${operator}'. Allowed operators are +, -, *, /, and %.`,
      );}
  } catch (error: any) {
    console.error(
      `Runtime error while evaluating '${operator}' expression: ${error.message}`,
    );
    Deno.exit(1);
  }
  return { value: result, type: "number" };
}

// Handle arithmetic expressions like 1 + 2.
export async function eval_binary_expression(
  binop: BinaryExpr,
  env: Environment,
): Promise<RuntimeVal> {
  const operator = binop.operator;

  if (operator == "&&") {
    const left = await evaluate(binop.left, env);
    if (!isTruthy(left)) {
      return MK_BOOL(false);
    }
    const right = await evaluate(binop.right, env);
    return MK_BOOL(isTruthy(right));
  }

  if (operator == "||") {
    const left = await evaluate(binop.left, env);
    if (isTruthy(left)) {
      return MK_BOOL(true);
    }
    const right = await evaluate(binop.right, env);
    return MK_BOOL(isTruthy(right));
  }

  const lhs = await evaluate(binop.left, env);
  const rhs = await evaluate(binop.right, env);

  if (operator == "+") {
    if (lhs.type == "string" || rhs.type == "string") {
      const left = lhs.type == "string"
        ? (lhs as StringVal).value
        : stringify(lhs);
      const right = rhs.type == "string"
        ? (rhs as StringVal).value
        : stringify(rhs);
      return MK_STRING(left + right);
    }

    if (lhs.type == "number" && rhs.type == "number") {
      return eval_numeric_binary_expr(
        lhs as NumberVal,
        rhs as NumberVal,
        operator,
      );
    }

    throw `Operator '+' expects number or string operands but received '${lhs.type}' and '${rhs.type}'.`;
  }

  if (
    operator == "-" || operator == "*" || operator == "/" || operator == "%"
  ) {
    if (lhs.type != "number" || rhs.type != "number") {
      throw `Operator '${operator}' expects numeric operands but received '${lhs.type}' and '${rhs.type}'.`;
    }
    return eval_numeric_binary_expr(
      lhs as NumberVal,
      rhs as NumberVal,
      operator,
    );
  }

  if (operator == "==") {
    return MK_BOOL(runtimeValEquals(lhs, rhs));
  }

  if (operator == "!=") {
    return MK_BOOL(!runtimeValEquals(lhs, rhs));
  }

  if (
    operator == "<" || operator == "<=" || operator == ">" || operator == ">="
  ) {
    return MK_BOOL(compareRuntimeValues(lhs, rhs, operator));
  }

  throw `Unsupported binary operator '${operator}'.`;
}

export async function eval_unary_expression(
  expr: UnaryExpr,
  env: Environment,
): Promise<RuntimeVal> {
  const operand = await evaluate(expr.operand, env);

  switch (expr.operator) {
    case "!":
      return MK_BOOL(!isTruthy(operand));
    case "-":
      if (operand.type != "number") {
        throw `Unary '-' expects a numeric operand but received '${operand.type}'.`;
      }
      return MK_NUMBER(-(operand as NumberVal).value);
    default:
      throw `Unsupported unary operator '${expr.operator}'.`;
  }
}

export async function eval_await_expression(
  expr: AwaitExpr,
  env: Environment,
): Promise<RuntimeVal> {
  const value = await evaluate(expr.argument, env);

  if (value.type === "promise") {
    const resolved = await (value as PromiseVal).promise;
    return resolved;
  }

  return value;
}

export async function eval_mongo_operation_expr(
  expr: MongoOperationExpr,
  env: Environment,
): Promise<RuntimeVal> {
  const target = await evaluate(expr.target, env);
  const argument = await evaluate(expr.argument, env);
  return await executeMongoOperation(target, expr.operator, argument);
}

export async function eval_mongo_update_expr(
  expr: MongoUpdateExpr,
  env: Environment,
): Promise<RuntimeVal> {
  const target = await evaluate(expr.target, env);

  const filterVal = expr.filter.kind === "MongoQueryExpr"
    ? await eval_mongo_query_expr(expr.filter as MongoQueryExpr, env)
    : await evaluate(expr.filter, env);

  const updateVal = await evaluate(expr.update, env);
  const optionsVal = expr.options
    ? await evaluate(expr.options, env)
    : undefined;

  return await executeMongoUpdate(
    target,
    filterVal,
    updateVal,
    optionsVal,
    expr.many,
  );
}

export async function eval_mongo_query_expr(
  expr: MongoQueryExpr,
  env: Environment,
): Promise<RuntimeVal> {
  const query: Record<string, unknown> = {};

  for (const condition of expr.conditions) {
    const valueRuntime = await evaluate(condition.value, env);
    const valuePlain = runtimeToPlain(valueRuntime);
    applyQueryCondition(query, condition, valuePlain);
  }

  return plainToRuntime(query);
}

function applyQueryCondition(
  query: Record<string, unknown>,
  condition: MongoQueryCondition,
  value: unknown,
): void {
  const key = condition.field;
  const operator = condition.operator;

  if (operator === "==") {
    setEqualityCondition(query, key, value);
    return;
  }

  const mongoOperator = mapComparisonOperator(operator);
  const existing = query[key];

  if (
    !existing || typeof existing !== "object" || existing === null ||
    Array.isArray(existing)
  ) {
    query[key] = { [mongoOperator]: value };
    return;
  }

  (existing as Record<string, unknown>)[mongoOperator] = value;
}

function setEqualityCondition(
  query: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const existing = query[key];

  if (!existing) {
    query[key] = value;
    return;
  }

  if (
    typeof existing !== "object" || existing === null || Array.isArray(existing)
  ) {
    query[key] = value;
    return;
  }

  (existing as Record<string, unknown>).$eq = value;
}

function mapComparisonOperator(operator: string): string {
  switch (operator) {
    case "!=":
      return "$ne";
    case "<":
      return "$lt";
    case "<=":
      return "$lte";
    case ">":
      return "$gt";
    case ">=":
      return "$gte";
    default:
      throw `Unsupported query operator '${operator}'.`;
  }
}

function stringify(value: RuntimeVal): string {
  switch (value.type) {
    case "number":
      return (value as NumberVal).value.toString();
    case "boolean":
      return (value as BooleanVal).value ? "true" : "false";
    case "null":
      return "null";
    case "string":
      return (value as StringVal).value;
    default:
      return JSON.stringify(value);
  }
}

export function isTruthy(value: RuntimeVal): boolean {
  switch (value.type) {
    case "boolean":
      return (value as BooleanVal).value;
    case "null":
      return false;
    case "number":
      return (value as NumberVal).value !== 0;
    case "string":
      return (value as StringVal).value.length > 0;
    case "array":
      return (value as ArrayVal).elements.length > 0;
    case "object":
      return (value as ObjectVal).properties.size > 0;
    default:
      return true;
  }
}

function runtimeValEquals(lhs: RuntimeVal, rhs: RuntimeVal): boolean {
  if (lhs.type === "null" && rhs.type === "null") {
    return true;
  }

  if (lhs.type !== rhs.type) {
    return false;
  }

  switch (lhs.type) {
    case "null":
      return true;
    case "number":
      return (lhs as NumberVal).value === (rhs as NumberVal).value;
    case "boolean":
      return (lhs as BooleanVal).value === (rhs as BooleanVal).value;
    case "string":
      return (lhs as StringVal).value === (rhs as StringVal).value;
    case "array":
    case "object":
    case "native-fn":
    case "function":
    case "class":
      return lhs === rhs;
    default:
      return false;
  }
}

function compareRuntimeValues(
  lhs: RuntimeVal,
  rhs: RuntimeVal,
  operator: string,
): boolean {
  if (lhs.type == "number" && rhs.type == "number") {
    const left = (lhs as NumberVal).value;
    const right = (rhs as NumberVal).value;
    switch (operator) {
      case "<":
        return left < right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case ">=":
        return left >= right;
      default:
        throw `Unsupported relational operator '${operator}'.`;
    }
  }

  if (lhs.type == "string" && rhs.type == "string") {
    const left = (lhs as StringVal).value;
    const right = (rhs as StringVal).value;
    switch (operator) {
      case "<":
        return left < right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case ">=":
        return left >= right;
      default:
        throw `Unsupported relational operator '${operator}'.`;
    }
  }

  throw `Operator '${operator}' expects comparable operands (number or string) but received '${lhs.type}' and '${rhs.type}'.`;
}

// Look up the current value of a variable.
export function eval_identifier(
  ident: Identifier,
  env: Environment,
): RuntimeVal {
  const val = env.lookupVar(ident.symbol);
  return val;
}

// Evaluate the right-hand side and store it back on the left variable.
export async function eval_assignment(
  node: AssignmentExpr,
  env: Environment,
): Promise<RuntimeVal> {
  if (node.assigne.kind != "Identifier") {
    throw `Invalid assignment target: expected an identifier on the left-hand side but received '${node.assigne.kind}'.`;
  }

  const varname = (node.assigne as Identifier).symbol;
  return env.assignVar(varname, await evaluate(node.value, env));
}

export async function eval_object_expr(
  obj: ObjectLiteral,
  env: Environment,
): Promise<RuntimeVal> {
  const object = {
    type: "object",
    properties: new Map(),
    schemaName: undefined,
  } as ObjectVal;

  for (const { key, value } of obj.properties) {
    // Handles valid key: pair
    const runtimeVal = (value == undefined)
      ? env.lookupVar(key)
      : await evaluate(value, env);
    object.properties.set(key, runtimeVal);
  }

  return object;
}

export async function invokeCallable(
  target: RuntimeVal,
  args: RuntimeVal[],
  env: Environment,
): Promise<RuntimeVal> {
  if (target.type == "native-fn") {
    const result = await (target as NativeFnValue).call(args, env);
    return result;
  }

  if (target.type == "function") {
    const func = target as FunctionValue;
    const scope = new Environment(func.declarationEnv);
    if (args.length > func.parameters.length) {
      const functionName = func.name || "anonymous";
      throw `Function '${functionName}' received ${args.length} argument${
        args.length === 1 ? "" : "s"
      } but only ${func.parameters.length} parameter${
        func.parameters.length === 1 ? "" : "s"
      } are defined.`;
    }

    const functionName = func.name || "anonymous";

    for (let i = 0; i < func.parameters.length; i++) {
      const param = func.parameters[i];
      let argument: RuntimeVal;

      if (i < args.length) {
        argument = args[i];
      } else if (param.defaultValue) {
        argument = await evaluate(param.defaultValue, scope);
      } else {
        throw `Function '${functionName}' missing required argument '${param.name}'.`;
      }

      if (
        param.typeAnnotation &&
        !matchesTypeAnnotation(param.typeAnnotation, argument)
      ) {
        const expected = formatTypeAnnotation(param.typeAnnotation);
        const actual = describeRuntimeType(argument);
        throw `Function '${functionName}' expects parameter '${param.name}' to be '${expected}' but received '${actual}'.`;
      }

      scope.declareVar(param.name, argument, false);
    }

    try {
      for (const stmt of func.body) {
        await evaluate(stmt, scope);
      }
    } catch (signal) {
      if (signal instanceof ReturnSignal) {
        return signal.value;
      }
      if (signal instanceof BreakSignal) {
        throw `Break statements are only allowed inside loops.`;
      }
      if (signal instanceof ContinueSignal) {
        throw `Continue statements are only allowed inside loops.`;
      }
      throw signal;
    }

    return MK_NULL();
  }

  throw `Attempted to call a value of type '${target.type}'. Only functions or native functions are callable.`;
}

export async function eval_call_expr(
  expr: CallExpr,
  env: Environment,
): Promise<RuntimeVal> {
  const args: RuntimeVal[] = [];
  for (const arg of expr.args) {
    args.push(await evaluate(arg, env));
  }

  const fn = await evaluate(expr.caller, env);

  if (fn.type == "class") {
    return await instantiateSchema(fn as ClassValue, args, env);
  }

  return await invokeCallable(fn, args, env);
}

export async function eval_array_literal(
  array: ArrayLiteral,
  env: Environment,
): Promise<RuntimeVal> {
  const elements: RuntimeVal[] = [];
  for (const element of array.elements) {
    elements.push(await evaluate(element, env));
  }
  return MK_ARRAY(elements);
}

export async function eval_member_expr(
  expr: MemberExpr,
  env: Environment,
): Promise<RuntimeVal> {
  const target = await evaluate(expr.object, env);
  const { key, index } = await resolvePropertyKey(expr, env);

  if (target.type == "object") {
    const obj = target as ObjectVal;
    if (obj.properties.has(key)) {
      return obj.properties.get(key) as RuntimeVal;
    }

    if (isMongoDatabase(target)) {
      const collection = createCollectionFromDatabase(target as ObjectVal, key);
      return collection;
    }
    return MK_NULL();
  }

  if (target.type == "array") {
    const arr = target as ArrayVal;
    if (index !== null) {
      if (index < 0 || index >= arr.elements.length) {
        throw `Array index ${index} is out of bounds (length: ${arr.elements.length}).`;
      }
      return arr.elements[index];
    }

    if (key == "length") {
      return MK_NUMBER(arr.elements.length);
    }

    throw `Property '${key}' is not defined on arrays.`;
  }

  if (target.type == "class") {
    const classVal = target as ClassValue;
    throw `Member access on class '${classVal.name}' is not implemented yet. Instantiate the class or provide static helpers to use '${key}'.`;
  }

  throw `Cannot access property '${key}' on value of type '${target.type}'.`;
}

async function resolvePropertyKey(
  expr: MemberExpr,
  env: Environment,
): Promise<{ key: string; index: number | null }> {
  if (expr.computed) {
    const evaluated = await evaluate(expr.property, env);
    if (evaluated.type == "number") {
      const index = Math.trunc((evaluated as NumberVal).value);
      return { key: index.toString(), index };
    }
    if (evaluated.type == "string") {
      return { key: (evaluated as StringVal).value, index: null };
    }
    throw `Computed property access requires a string or number key, received '${evaluated.type}'.`;
  }

  if (expr.property.kind != "Identifier") {
    throw `Expected identifier after '.' but received '${expr.property.kind}'.`;
  }

  return { key: (expr.property as Identifier).symbol, index: null };
}

async function instantiateSchema(
  classVal: ClassValue,
  args: RuntimeVal[],
  _callerEnv: Environment,
): Promise<RuntimeVal> {
  const fieldMap = new Map<string, ClassField>();
  for (const field of classVal.fields) {
    fieldMap.set(field.name, field);
  }

  const provided = new Map<string, RuntimeVal>();

  if (args.length === 1 && args[0].type == "object") {
    const namedArgs = args[0] as ObjectVal;
    for (const [key, value] of namedArgs.properties.entries()) {
      if (!fieldMap.has(key)) {
        throw `Schema '${classVal.name}' does not define a field named '${key}'.`;
      }
      provided.set(key, value);
    }
  } else {
    const order = classVal.constructorParams?.map((param) => param.name) ??
      classVal.fields.map((field) => field.name);
    if (args.length > order.length) {
      throw `Schema '${classVal.name}' received ${args.length} constructor arguments but only ${order.length} parameter${
        order.length === 1 ? "" : "s"
      } are defined.`;
    }

    for (let i = 0; i < args.length; i++) {
      const fieldName = order[i];
      const targetField = fieldMap.get(fieldName);
      if (!targetField) {
        throw `Constructor parameter '${fieldName}' does not match any field on schema '${classVal.name}'.`;
      }
      provided.set(fieldName, args[i]);
    }
  }

  const instance = {
    type: "object",
    properties: new Map<string, RuntimeVal>(),
    schemaName: classVal.name,
  } as ObjectVal;
  const instanceEnv = new Environment(classVal.declarationEnv);
  instanceEnv.declareVar("this", instance, false);

  for (const field of classVal.fields) {
    instanceEnv.declareVar(field.name, MK_NULL(), false);
  }

  for (const field of classVal.fields) {
    let value: RuntimeVal;

    if (provided.has(field.name)) {
      value = provided.get(field.name) as RuntimeVal;
    } else if (field.initializer) {
      value = await evaluate(field.initializer, instanceEnv);
    } else {
      if (field.required) {
        throw `Schema '${classVal.name}' requires field '${field.name}' but no value was provided.`;
      }
      value = MK_NULL();
    }

    validateSchemaFieldType(classVal.name, field, value);
    instance.properties.set(field.name, value);
    instanceEnv.assignVar(field.name, value);
  }

  for (const method of classVal.methods) {
    instance.properties.set(
      method.name,
      bindMethod(classVal, method, instance),
    );
  }

  if (!classVal.methods.some((method) => method.name === "save")) {
    instance.properties.set("save", createSaveMethod(classVal, instance));
  }

  return instance;
}

function bindMethod(
  classVal: ClassValue,
  method: ClassMethod,
  instance: ObjectVal,
) {
  return MK_NATIVE_FN(async (methodArgs: RuntimeVal[], _env: Environment) => {
    if (methodArgs.length > method.parameters.length) {
      throw `Method '${classVal.name}.${method.name}' received ${methodArgs.length} argument${
        methodArgs.length === 1 ? "" : "s"
      } but only ${method.parameters.length} parameter${
        method.parameters.length === 1 ? "" : "s"
      } are defined.`;
    }

    const methodEnv = new Environment(classVal.declarationEnv);
    methodEnv.declareVar("this", instance, false);

    // Expose fields as local variables for convenience.
    for (const field of classVal.fields) {
      const current = instance.properties.get(field.name) ?? MK_NULL();
      methodEnv.declareVar(field.name, current, false);
    }

    for (let i = 0; i < method.parameters.length; i++) {
      const param = method.parameters[i];
      let argument: RuntimeVal;

      if (i < methodArgs.length) {
        argument = methodArgs[i];
      } else if (param.defaultValue) {
        argument = await evaluate(param.defaultValue, methodEnv);
      } else {
        throw `Method '${classVal.name}.${method.name}' missing required argument '${param.name}'.`;
      }

      if (
        param.typeAnnotation &&
        !matchesTypeAnnotation(param.typeAnnotation, argument)
      ) {
        const expected = formatTypeAnnotation(param.typeAnnotation);
        const actual = describeRuntimeType(argument);
        throw `Method '${classVal.name}.${method.name}' expects parameter '${param.name}' to be '${expected}' but received '${actual}'.`;
      }

      if (classVal.fields.some((field) => field.name === param.name)) {
        methodEnv.assignVar(param.name, argument);
      } else {
        methodEnv.declareVar(param.name, argument, false);
      }
    }

    try {
      for (const stmt of method.body) {
        await evaluate(stmt, methodEnv);
      }
    } catch (signal) {
      if (signal instanceof ReturnSignal) {
        const returnValue = signal.value;
        for (const field of classVal.fields) {
          const updated = methodEnv.lookupVar(field.name);
          validateSchemaFieldType(classVal.name, field, updated);
          instance.properties.set(field.name, updated);
        }
        return returnValue;
      } else if (signal instanceof BreakSignal) {
        throw `Break statements are only allowed inside loops.`;
      } else if (signal instanceof ContinueSignal) {
        throw `Continue statements are only allowed inside loops.`;
      } else {
        throw signal;
      }
    }

    for (const field of classVal.fields) {
      const updated = methodEnv.lookupVar(field.name);
      validateSchemaFieldType(classVal.name, field, updated);
      instance.properties.set(field.name, updated);
    }

    return MK_NULL();
  });
}

function validateSchemaFieldType(
  schemaName: string,
  field: ClassField,
  value: RuntimeVal,
) {
  const annotation = field.typeAnnotation;
  if (!annotation) {
    return;
  }

  if (annotation.base.toLowerCase() === "any" && annotation.arrayDepth === 0) {
    return;
  }

  if (!field.required && value.type === "null") {
    return;
  }

  if (matchesTypeAnnotation(annotation, value)) {
    return;
  }

  const expected = formatTypeAnnotation(annotation);
  const actual = describeRuntimeType(value);
  throw `Field '${schemaName}.${field.name}' expects type '${expected}' but received '${actual}'.`;
}

function matchesTypeAnnotation(
  annotation: TypeAnnotation,
  value: RuntimeVal,
): boolean {
  if (annotation.arrayDepth > 0) {
    if (value.type !== "array") {
      return false;
    }

    const elementAnnotation: TypeAnnotation = {
      base: annotation.base,
      arrayDepth: annotation.arrayDepth - 1,
    };

    const arrayVal = value as ArrayVal;
    for (const element of arrayVal.elements) {
      if (!matchesTypeAnnotation(elementAnnotation, element)) {
        return false;
      }
    }
    return true;
  }

  const expected = annotation.base.toLowerCase();

  switch (expected) {
    case "any":
      return true;
    case "string":
    case "number":
    case "boolean":
    case "null":
      return value.type === expected;
    case "array":
      return value.type === "array";
    case "object":
      return value.type === "object";
    default: {
      if (value.type !== "object") {
        return false;
      }
      const instance = value as ObjectVal;
      return (instance.schemaName ?? "").toLowerCase() === expected;
    }
  }
}

function formatTypeAnnotation(annotation: TypeAnnotation): string {
  const suffix = annotation.arrayDepth > 0
    ? "[]".repeat(annotation.arrayDepth)
    : "";
  return `${annotation.base}${suffix}`;
}

function describeRuntimeType(value: RuntimeVal): string {
  if (value.type === "object") {
    const instance = value as ObjectVal;
    return instance.schemaName ?? "object";
  }

  return value.type;
}

function createSaveMethod(
  classVal: ClassValue,
  instance: ObjectVal,
): NativeFnValue {
  return MK_NATIVE_FN((_args, _env) => {
    const payload = buildSchemaPayload(classVal, instance);
    console.log(`[schema.save] ${classVal.name}`, payload);
    return instance;
  });
}

function buildSchemaPayload(
  classVal: ClassValue,
  instance: ObjectVal,
): Record<string, unknown> {
  const result: Record<string, unknown> = { __schema: classVal.name };

  for (const field of classVal.fields) {
    const value = instance.properties.get(field.name) ?? MK_NULL();
    result[field.name] = runtimeValToJSON(value);
  }

  return result;
}
