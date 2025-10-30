import {
  BreakStatement,
  ClassDeclaration,
  CollectionStatement,
  ContinueStatement,
  DatabaseStatement,
  ExportDeclaration,
  FieldDefinition,
  FunctionDeclaration,
  IfStatement,
  ImportStatement,
  MethodDefinition,
  Program,
  ReturnStatement,
  Stmt,
  ThrowStatement,
  TryCatchStatement,
  UseCollectionStatement,
  UsingStatement,
  VarDeclaration,
  WhileStatement,
} from "../../frontend/ast.ts";
import Environment from "../environment.ts";
import { evaluate } from "../interpreter.ts";
import {
  ClassField,
  ClassMethod,
  ClassValue,
  FunctionValue,
  MK_CLASS,
  MK_NULL,
  MK_STRING,
  ObjectVal,
  RuntimeVal,
  SchemaConstructorParam,
  StringVal,
} from "../values.ts";
import { isTruthy } from "./expressions.ts";
import {
  BreakSignal,
  ContinueSignal,
  ReturnSignal,
  RuntimeException,
} from "./control.ts";
import {
  cacheModuleResult,
  clearModuleInProgress,
  createModuleEnvironment,
  getModuleProgram,
  getModuleResult,
  markModuleInProgress,
  popModuleContext,
  pushModuleContext,
  removeModuleResult,
  resolveImportPath,
} from "../moduleLoader.ts";
import {
  connectMongo,
  createCollectionFromDatabase,
  disconnectMongo,
  isMongoCollection,
  isMongoDatabase,
  runtimeToPlain,
  setCollectionDefaults,
} from "../mongo.ts";
import {
  captureMongoState,
  clearDatabaseBinding,
  consumeCollectionBindings,
  getDatabaseBinding,
  registerCollectionBinding,
  registerDatabaseBinding,
  restoreMongoState,
} from "../mongoState.ts";

export async function eval_program(
  program: Program,
  env: Environment,
): Promise<RuntimeVal> {
  let lastEvaluated: RuntimeVal = MK_NULL();

  // Evaluate each statement in order, keeping the last result.
  for (const statement of program.body) {
    try {
      lastEvaluated = await evaluate(statement, env);
    } catch (signal) {
      if (signal instanceof ReturnSignal) {
        throw "Return statements are only allowed inside functions.";
      }
      if (signal instanceof BreakSignal) {
        throw "Break statements are only allowed inside loops.";
      }
      if (signal instanceof ContinueSignal) {
        throw "Continue statements are only allowed inside loops.";
      }
      throw signal;
    }
  }

  return lastEvaluated;
}

// Bind a new variable in the current environment.
export async function eval_var_declaration(
  declaration: VarDeclaration,
  env: Environment,
): Promise<RuntimeVal> {
  const value = declaration.value
    ? await evaluate(declaration.value, env)
    : MK_NULL();
  return env.declareVar(declaration.identifier, value, declaration.constant);
}

export async function eval_database_statement(
  statement: DatabaseStatement,
  env: Environment,
): Promise<RuntimeVal> {
  const handle = await evaluate(statement.initializer, env);
  if (!isMongoDatabase(handle)) {
    throw "database expects a Mongo database handle. Use connect(uri, dbName) to obtain one.";
  }

  const previousBinding = getDatabaseBinding();
  if (previousBinding && env.hasBinding(previousBinding)) {
    env.removeVar(previousBinding);
  }

  for (const binding of consumeCollectionBindings()) {
    env.removeVar(binding);
  }

  clearDatabaseBinding();
  if (env.hasBinding(statement.identifier)) {
    env.removeVar(statement.identifier);
  }

  env.declareVar(statement.identifier, handle, true);
  registerDatabaseBinding(statement.identifier);

  return handle;
}

export async function eval_collection_statement(
  statement: CollectionStatement,
  env: Environment,
): Promise<RuntimeVal> {
  const bindingName = statement.identifier;
  let value: RuntimeVal;

  if (statement.source) {
    const source = await evaluate(statement.source, env);

    if (isMongoCollection(source)) {
      value = source;
    } else if (source.type === "string") {
      const name = (source as StringVal).value;
      const databaseBinding = getDatabaseBinding();
      if (!databaseBinding) {
        throw "collection requires an active database before mapping to a collection name.";
      }

      if (!env.hasBinding(databaseBinding)) {
        throw "The active database binding is no longer available.";
      }

      const dbValue = env.lookupVar(databaseBinding);
      if (!isMongoDatabase(dbValue)) {
        throw "The active database binding is no longer valid.";
      }

      value = createCollectionFromDatabase(dbValue as ObjectVal, name);
    } else if (isMongoDatabase(source)) {
      value = createCollectionFromDatabase(source as ObjectVal, bindingName);
    } else {
      throw "collection initializer must evaluate to a Mongo collection, database, or string.";
    }
  } else {
    const databaseBinding = getDatabaseBinding();
    if (!databaseBinding) {
      throw "collection requires an active database. Use 'database connect(...)' first.";
    }

    if (!env.hasBinding(databaseBinding)) {
      throw "The active database binding is no longer available.";
    }

    const dbValue = env.lookupVar(databaseBinding);
    if (!isMongoDatabase(dbValue)) {
      throw "The active database binding is no longer valid.";
    }

    value = createCollectionFromDatabase(dbValue as ObjectVal, bindingName);
  }

  env.removeVar(bindingName);
  env.declareVar(bindingName, value, true);
  registerCollectionBinding(bindingName);

  return value;
}

export async function eval_use_collection_statement(
  statement: UseCollectionStatement,
  env: Environment,
): Promise<RuntimeVal> {
  const bindingName = statement.identifier;
  let value: RuntimeVal;

  if (env.hasBinding(bindingName)) {
    value = env.lookupVar(bindingName);
    if (!isMongoCollection(value)) {
      throw `Binding '${bindingName}' exists but is not a Mongo collection.`;
    }
  } else {
    const databaseBinding = getDatabaseBinding();
    if (!databaseBinding) {
      throw "use collection requires an active database. Use 'database' or 'using mongo' first.";
    }

    if (!env.hasBinding(databaseBinding)) {
      throw "The active database binding is no longer available.";
    }

    const dbValue = env.lookupVar(databaseBinding);
    if (!isMongoDatabase(dbValue)) {
      throw "The active database binding is not a Mongo database.";
    }

    value = createCollectionFromDatabase(dbValue as ObjectVal, bindingName);
    env.removeVar(bindingName);
    env.declareVar(bindingName, value, true);
    registerCollectionBinding(bindingName);
  }

  if (statement.options) {
    const optionsValue = await evaluate(statement.options, env);
    const optionsPlain = runtimeToPlain(optionsValue);
    if (
      !optionsPlain || typeof optionsPlain !== "object" ||
      Array.isArray(optionsPlain)
    ) {
      throw "use collection options must evaluate to an object.";
    }
    setCollectionDefaults(
      value as ObjectVal,
      optionsPlain as Record<string, unknown>,
    );
  }

  return value;
}

export async function eval_using_statement(
  statement: UsingStatement,
  env: Environment,
): Promise<RuntimeVal> {
  if (statement.resource !== "mongo") {
    throw "using currently supports only the 'mongo' resource.";
  }

  const uriValue = await evaluate(statement.uri, env);
  if (uriValue.type !== "string") {
    throw "using mongo expects the URI expression to evaluate to a string.";
  }
  const uri = (uriValue as StringVal).value.trim();
  if (uri.length === 0) {
    throw "Mongo connection URI cannot be empty.";
  }

  let dbName: string | undefined = undefined;
  if (statement.database) {
    const dbValue = await evaluate(statement.database, env);
    if (dbValue.type !== "string") {
      throw "using mongo database expression must evaluate to a string.";
    }
    dbName = (dbValue as StringVal).value.trim();
  }

  let collectionDefaultsConfig: Record<string, unknown> | undefined = undefined;
  if (statement.options) {
    const optionsValue = await evaluate(statement.options, env);
    const optionsPlain = runtimeToPlain(optionsValue);
    if (
      optionsPlain && typeof optionsPlain === "object" &&
      !Array.isArray(optionsPlain)
    ) {
      const collections = (optionsPlain as Record<string, unknown>)
        .collections;
      if (
        collections && typeof collections === "object" &&
        !Array.isArray(collections)
      ) {
        collectionDefaultsConfig = collections as Record<string, unknown>;
      }
    } else if (optionsPlain !== null && optionsPlain !== undefined) {
      throw "using mongo options must be an object.";
    }
  }

  const snapshot = captureMongoState();
  clearDatabaseBinding();
  consumeCollectionBindings();

  const alias = statement.alias ?? "db";
  const scopedEnv = new Environment(env);
  const databaseValue = await connectMongo(uri, dbName);

  if (scopedEnv.hasBinding(alias)) {
    scopedEnv.removeVar(alias);
  }

  scopedEnv.declareVar(alias, databaseValue, true);
  registerDatabaseBinding(alias);

  if (collectionDefaultsConfig) {
    for (const [name, defaults] of Object.entries(collectionDefaultsConfig)) {
      if (
        typeof defaults !== "object" || defaults === null ||
        Array.isArray(defaults)
      ) {
        continue;
      }
      const collectionValue = createCollectionFromDatabase(
        databaseValue,
        name,
      );
      if (scopedEnv.hasBinding(name)) {
        scopedEnv.removeVar(name);
      }
      scopedEnv.declareVar(name, collectionValue, true);
      registerCollectionBinding(name);
      setCollectionDefaults(
        collectionValue,
        defaults as Record<string, unknown>,
      );
    }
  }

  let lastValue: RuntimeVal = MK_NULL();
  try {
    for (const stmt of statement.body) {
      lastValue = await evaluate(stmt, scopedEnv);
    }
    return lastValue;
  } finally {
    try {
      await disconnectMongo(databaseValue);
    } catch (_error) {
      // Ignore disconnect failures during cleanup.
    }
    clearDatabaseBinding();
    consumeCollectionBindings();
    restoreMongoState(snapshot);
  }
}

export function eval_function_declaration(
  declaration: FunctionDeclaration,
  env: Environment,
): RuntimeVal {
  const fn = {
    type: "function",
    name: declaration.name,
    parameters: declaration.parameters,
    declarationEnv: env,
    body: declaration.body,
  } as FunctionValue;

  return env.declareVar(declaration.name, fn, true);
}

export function eval_class_declaration(
  declaration: ClassDeclaration,
  env: Environment,
): RuntimeVal {
  const fields: ClassField[] = [];
  const methods: ClassMethod[] = [];
  let constructorParams: SchemaConstructorParam[] = [];
  let baseClassName: string | undefined = undefined;

  if (declaration.base) {
    const baseValue = env.lookupVar(declaration.base);
    if (baseValue.type !== "class") {
      throw `Schema '${declaration.name}' extends '${declaration.base}', but '${declaration.base}' is not a schema.`;
    }

    const baseClass = baseValue as ClassValue;
    baseClassName = baseClass.name;

    for (const field of baseClass.fields) {
      fields.push({
        name: field.name,
        initializer: field.initializer,
        typeAnnotation: field.typeAnnotation,
        required: field.required,
      });
    }

    for (const method of baseClass.methods) {
      methods.push({
        name: method.name,
        parameters: method.parameters,
        body: method.body,
      });
    }

    if (baseClass.constructorParams) {
      constructorParams = baseClass.constructorParams.map((param) => ({
        name: param.name,
        typeAnnotation: param.typeAnnotation,
      }));
    }
  }

  for (const member of declaration.members) {
    if (member.kind == "FieldDefinition") {
      const field = member as FieldDefinition;
      const replacement = {
        name: field.name,
        initializer: field.value,
        typeAnnotation: field.typeAnnotation,
        required: field.required,
      };

      const existingIndex = fields.findIndex((candidate) =>
        candidate.name === field.name
      );
      if (existingIndex >= 0) {
        fields[existingIndex] = replacement;
      } else {
        fields.push(replacement);
      }
    } else if (member.kind == "MethodDefinition") {
      const method = member as MethodDefinition;
      const replacement = {
        name: method.name,
        parameters: method.parameters,
        body: method.body,
      };
      const existingIndex = methods.findIndex((candidate) =>
        candidate.name === method.name
      );
      if (existingIndex >= 0) {
        methods[existingIndex] = replacement;
      } else {
        methods.push(replacement);
      }
    }
  }

  if (declaration.constructor) {
    for (const param of declaration.constructor.parameters) {
      const replacement = {
        name: param.name,
        typeAnnotation: param.typeAnnotation,
      } as SchemaConstructorParam;

      const existingIndex = constructorParams.findIndex((candidate) =>
        candidate.name === param.name
      );
      if (existingIndex >= 0) {
        constructorParams[existingIndex] = replacement;
      } else {
        constructorParams.push(replacement);
      }
    }
  }

  const constructorConfig = constructorParams.length > 0
    ? constructorParams
    : undefined;
  const classVal = MK_CLASS(
    declaration.name,
    fields,
    methods,
    env,
    constructorConfig,
    baseClassName,
  );
  return env.declareVar(declaration.name, classVal, true);
}

export async function eval_if_statement(
  statement: IfStatement,
  env: Environment,
): Promise<RuntimeVal> {
  const test = await evaluate(statement.test, env);
  if (isTruthy(test)) {
    return await evaluateBlock(statement.consequent, env);
  }

  if (!statement.alternate) {
    return MK_NULL();
  }

  if (Array.isArray(statement.alternate)) {
    return await evaluateBlock(statement.alternate, env);
  }

  return await eval_if_statement(statement.alternate, env);
}

export async function eval_while_statement(
  statement: WhileStatement,
  env: Environment,
): Promise<RuntimeVal> {
  let result: RuntimeVal = MK_NULL();

  while (isTruthy(await evaluate(statement.test, env))) {
    try {
      result = await evaluateBlock(statement.body, env);
    } catch (signal) {
      if (signal instanceof BreakSignal) {
        break;
      }
      if (signal instanceof ContinueSignal) {
        result = MK_NULL();
        continue;
      }
      if (signal instanceof ReturnSignal) {
        throw signal;
      }
      throw signal;
    }
  }

  return result;
}

export async function eval_return_statement(
  statement: ReturnStatement,
  env: Environment,
): Promise<RuntimeVal> {
  const value = statement.argument
    ? await evaluate(statement.argument, env)
    : MK_NULL();
  throw new ReturnSignal(value);
}

export function eval_break_statement(
  _statement: BreakStatement,
  _env: Environment,
): RuntimeVal {
  throw new BreakSignal();
}

export function eval_continue_statement(
  _statement: ContinueStatement,
  _env: Environment,
): RuntimeVal {
  throw new ContinueSignal();
}

export async function eval_import_statement(
  statement: ImportStatement,
  env: Environment,
): Promise<RuntimeVal> {
  const resolvedPath = resolveImportPath(statement.source);

  const cached = getModuleResult(resolvedPath);
  if (typeof cached !== "undefined") {
    applyImportBindings(cached, statement, env);
    return cached;
  }

  const program = getModuleProgram(resolvedPath);
  const { env: moduleEnv, exports: exportTable } = createModuleEnvironment(env);

  markModuleInProgress(resolvedPath);
  pushModuleContext(resolvedPath);
  try {
    await evaluate(program, moduleEnv);
    const namespace = buildNamespaceValue(exportTable);
    cacheModuleResult(resolvedPath, namespace);
    applyImportBindings(namespace, statement, env);
    return namespace;
  } catch (error) {
    removeModuleResult(resolvedPath);
    throw error;
  } finally {
    popModuleContext();
    clearModuleInProgress(resolvedPath);
  }
}

export async function eval_try_catch_statement(
  statement: TryCatchStatement,
  env: Environment,
): Promise<RuntimeVal> {
  try {
    return await evaluateBlock(statement.tryBlock, env);
  } catch (error) {
    if (
      error instanceof ReturnSignal || error instanceof BreakSignal ||
      error instanceof ContinueSignal
    ) {
      throw error;
    }

    if (!statement.catchClause) {
      throw error;
    }

    const catchEnv = new Environment(env);
    const value = convertErrorToRuntimeVal(error);

    if (statement.catchClause.param) {
      catchEnv.declareVar(statement.catchClause.param, value, false);
    }

    return await evaluateBlock(statement.catchClause.body, catchEnv);
  }
}

export async function eval_throw_statement(
  statement: ThrowStatement,
  env: Environment,
): Promise<RuntimeVal> {
  const value = await evaluate(statement.argument, env);
  throw new RuntimeException(value);
}

export async function eval_export_declaration(
  statement: ExportDeclaration,
  env: Environment,
): Promise<RuntimeVal> {
  if (statement.defaultDeclaration) {
    const result = await evaluate(statement.defaultDeclaration, env);
    const names = collectExportedNames(statement.defaultDeclaration);
    if (names.length !== 1) {
      throw "Default export must have exactly one declaration name.";
    }
    env.setModuleExport("default", result);
    return result;
  }

  if (statement.defaultExpr) {
    const value = await evaluate(statement.defaultExpr, env);
    env.setModuleExport("default", value);
    return value;
  }

  if (statement.declaration) {
    const result = await evaluate(statement.declaration, env);
    for (const name of collectExportedNames(statement.declaration)) {
      const value = env.lookupVar(name);
      env.setModuleExport(name, value);
    }
    return result;
  }

  if (statement.specifiers) {
    for (const name of statement.specifiers) {
      const value = env.lookupVar(name);
      env.setModuleExport(name, value);
    }
  }

  return MK_NULL();
}

async function evaluateBlock(
  statements: Stmt[],
  env: Environment,
): Promise<RuntimeVal> {
  let result: RuntimeVal = MK_NULL();
  for (const stmt of statements) {
    result = await evaluate(stmt, env);
  }
  return result;
}

function convertErrorToRuntimeVal(error: unknown): RuntimeVal {
  if (error instanceof RuntimeException) {
    return error.value;
  }

  if (typeof error === "string") {
    return MK_STRING(error);
  }

  if (error instanceof Error) {
    return MK_STRING(error.message);
  }

  return MK_STRING(String(error));
}

function applyImportBindings(
  namespace: RuntimeVal,
  statement: ImportStatement,
  env: Environment,
): void {
  if (statement.namespace) {
    bindImportBinding(statement.namespace, namespace, env);
  }

  if (statement.namedImports) {
    for (const name of statement.namedImports) {
      const value = getNamespaceExport(namespace, name);
      bindImportBinding(name, value, env);
    }
  }

  if (statement.defaultBinding) {
    const value = getNamespaceExport(namespace, "default");
    bindImportBinding(statement.defaultBinding, value, env);
  }
}

function bindImportBinding(
  name: string,
  value: RuntimeVal,
  env: Environment,
): void {
  if (env.hasOwnBinding(name)) {
    throw `Cannot import binding '${name}' because it already exists in this scope.`;
  }

  env.declareVar(name, value, true);
}

function buildNamespaceValue(exports: Map<string, RuntimeVal>): RuntimeVal {
  const properties = new Map<string, RuntimeVal>();
  for (const [key, value] of exports.entries()) {
    properties.set(key, value);
  }

  return { type: "object", properties } as ObjectVal;
}

function getNamespaceExport(namespace: RuntimeVal, name: string): RuntimeVal {
  if (namespace.type !== "object") {
    throw "Import target did not evaluate to a module namespace object.";
  }

  const object = namespace as ObjectVal;
  if (!object.properties.has(name)) {
    throw `Module does not export '${name}'.`;
  }

  return object.properties.get(name) as RuntimeVal;
}

function collectExportedNames(declaration: Stmt): string[] {
  switch (declaration.kind) {
    case "VarDeclaration":
      return [(declaration as VarDeclaration).identifier];
    case "FunctionDeclaration":
      return [(declaration as FunctionDeclaration).name];
    case "ClassDeclaration":
      return [(declaration as ClassDeclaration).name];
    default:
      throw `Cannot export declarations of type '${declaration.kind}'.`;
  }
}
