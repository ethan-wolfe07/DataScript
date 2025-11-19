import { MongoClient, ObjectId } from "@mongo";
import type { Collection, Database } from "@mongo";
import {
  ArrayVal,
  BooleanVal,
  MK_ARRAY,
  MK_BOOL,
  MK_NATIVE_FN,
  MK_NULL,
  MK_NUMBER,
  MK_STRING,
  NumberVal,
  ObjectVal,
  RuntimeVal,
  StringVal,
} from "./values.ts";

interface DatabaseMeta {
  client: MongoClient;
  database: Database;
  uri: string;
  name: string;
  closed: boolean;
  collections: Map<string, ObjectVal>;
}

interface CollectionMeta {
  collection: Collection<Record<string, unknown>>;
  name: string;
  database: DatabaseMeta;
  defaults?: CollectionDefaults;
}

interface CollectionDefaults {
  projection?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  limit?: number;
  batchSize?: number;
}

interface OperationMeta {
  collection: ObjectVal;
  collectionMeta: CollectionMeta;
  lastResult: RuntimeVal;
}

const databaseMetaStore = new WeakMap<ObjectVal, DatabaseMeta>();
const collectionMetaStore = new WeakMap<ObjectVal, CollectionMeta>();
const operationMetaStore = new WeakMap<ObjectVal, OperationMeta>();

export async function connectMongo(
  uri: string,
  dbName?: string,
): Promise<ObjectVal> {
  if (!uri || typeof uri !== "string") {
    throw "connect expects the first argument to be a MongoDB connection string.";
  }

  const trimmed = uri.trim();
  if (
    !(trimmed.startsWith("mongodb://") || trimmed.startsWith("mongodb+srv://"))
  ) {
    throw "Mongo connection strings must start with 'mongodb://' or 'mongodb+srv://'";
  }

  const normalized = ensureScramSha1AuthMechanism(trimmed);

  const resolvedDbName = resolveDatabaseName(normalized, dbName);

  const candidateUris: string[] = [normalized];
  const sanitized = sanitizeMongoCredentials(normalized);
  if (sanitized !== normalized) {
    candidateUris.push(sanitized);
  }

  const debugEnabled = mongoDebugEnabled();
  let lastError: unknown = undefined;

  for (let index = 0; index < candidateUris.length; index++) {
    const candidate = candidateUris[index];

    if (debugEnabled) {
      console.info(
        `[mongo] attempt ${
          index + 1
        }/${candidateUris.length} connecting with URI:`,
        redactMongoPassword(candidate),
      );
    }

    const client = new MongoClient();
    try {
      await client.connect(candidate);
      const database = client.database(resolvedDbName);
      return createDatabaseValue(candidate, resolvedDbName, client, database);
    } catch (error) {
      lastError = error;
      try {
        await client.close();
      } catch (_closeError) {
        // ignore failures when closing an unsuccessful client
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw "Failed to connect to MongoDB.";
}

function ensureScramSha1AuthMechanism(connectionString: string): string {
  const marker = "mongodb.net/";
  const lower = connectionString.toLowerCase();
  const markerIndex = lower.indexOf(marker);
  if (markerIndex === -1) {
    return connectionString;
  }

  const pathStart = markerIndex + marker.length;
  const queryIndex = connectionString.indexOf("?", pathStart);
  if (queryIndex === -1) {
    return `${connectionString}?authMechanism=SCRAM-SHA-1`;
  }

  const beforeQuery = connectionString.slice(0, queryIndex + 1);
  let queryAndFragment = connectionString.slice(queryIndex + 1);
  let fragment = "";

  const fragmentIndex = queryAndFragment.indexOf("#");
  if (fragmentIndex !== -1) {
    fragment = queryAndFragment.slice(fragmentIndex);
    queryAndFragment = queryAndFragment.slice(0, fragmentIndex);
  }

  const segments = queryAndFragment
    .split("&")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (
    segments.some((segment) =>
      segment.toLowerCase().startsWith("authmechanism=")
    )
  ) {
    return connectionString;
  }

  const authSegment = "authMechanism=SCRAM-SHA-1";
  const nonAppSegments: string[] = [];
  const appSegments: string[] = [];

  for (const segment of segments) {
    if (segment.toLowerCase().startsWith("appname=")) {
      appSegments.push(segment);
    } else {
      nonAppSegments.push(segment);
    }
  }

  const rebuiltQuery = [authSegment, ...nonAppSegments, ...appSegments].join(
    "&",
  );
  return `${beforeQuery}${rebuiltQuery}${fragment}`;
}

function sanitizeMongoCredentials(connectionString: string): string {
  const schemeSeparator = connectionString.indexOf("://");
  if (schemeSeparator === -1) {
    return connectionString;
  }

  const authority = connectionString.slice(schemeSeparator + 3);
  const atIndex = authority.lastIndexOf("@");
  if (atIndex === -1) {
    return connectionString;
  }

  const credentials = authority.slice(0, atIndex);
  const rest = authority.slice(atIndex + 1);
  const colonIndex = credentials.indexOf(":");
  if (colonIndex === -1) {
    return connectionString;
  }

  const rawUser = credentials.slice(0, colonIndex);
  const rawPassword = credentials.slice(colonIndex + 1);

  if (!rawPassword) {
    return connectionString;
  }

  const encodedUser = encodeMongoCredential(rawUser);
  const encodedPassword = encodeMongoCredential(rawPassword);

  if (encodedUser === rawUser && encodedPassword === rawPassword) {
    return connectionString;
  }

  const prefix = connectionString.slice(0, schemeSeparator + 3);
  return `${prefix}${encodedUser}:${encodedPassword}@${rest}`;
}

function encodeMongoCredential(value: string): string {
  if (!value) {
    return value;
  }

  try {
    const decoded = decodeURIComponent(value);
    return encodeURIComponent(decoded);
  } catch {
    return encodeURIComponent(value);
  }
}

function redactMongoPassword(connectionString: string): string {
  const schemeSeparator = connectionString.indexOf("://");
  if (schemeSeparator === -1) {
    return connectionString;
  }

  const prefix = connectionString.slice(0, schemeSeparator + 3);
  const authorityAndRest = connectionString.slice(schemeSeparator + 3);
  const atIndex = authorityAndRest.lastIndexOf("@");
  if (atIndex === -1) {
    return connectionString;
  }

  const credentials = authorityAndRest.slice(0, atIndex);
  const rest = authorityAndRest.slice(atIndex + 1);
  const colonIndex = credentials.indexOf(":");
  if (colonIndex === -1) {
    return connectionString;
  }

  const user = credentials.slice(0, colonIndex);
  return `${prefix}${user}:***@${rest}`;
}

function mongoDebugEnabled(): boolean {
  try {
    const value = Deno.env.get("DATASCRIPT_DEBUG_MONGO");
    return typeof value === "string" && value.length > 0 && value !== "0" &&
      value.toLowerCase() !== "false";
  } catch (_permissionError) {
    return false;
  }
}

export function isMongoDatabase(value: RuntimeVal): value is ObjectVal {
  return value.type === "object" && databaseMetaStore.has(value as ObjectVal);
}

export function isMongoCollection(value: RuntimeVal): value is ObjectVal {
  return value.type === "object" && collectionMetaStore.has(value as ObjectVal);
}

export async function disconnectMongo(databaseValue: ObjectVal): Promise<void> {
  const meta = databaseMetaStore.get(databaseValue);
  if (!meta) {
    throw "disconnect expects a Mongo database handle.";
  }

  if (!meta.closed) {
    await meta.client.close();
    meta.closed = true;
    meta.collections.clear();
  }
}

export function createCollectionFromDatabase(
  databaseValue: ObjectVal,
  name: string,
): ObjectVal {
  const meta = databaseMetaStore.get(databaseValue);
  if (!meta) {
    throw `Collection '${name}' requested from a value that is not a Mongo database.`;
  }

  const cached = meta.collections.get(name);
  if (cached) {
    return cached;
  }

  ensureDatabaseOpen(meta);
  const collection = meta.database.collection<Record<string, unknown>>(name);
  const value = createCollectionValue(collection, meta, name);
  meta.collections.set(name, value);

  if (!databaseValue.properties.has(name)) {
    databaseValue.properties.set(name, value);
  }

  return value;
}

function ensureDatabaseOpen(meta: DatabaseMeta): void {
  if (meta.closed) {
    throw "The Mongo database connection has been closed. Reconnect before performing operations.";
  }
}

function createDatabaseValue(
  uri: string,
  dbName: string,
  client: MongoClient,
  database: Database,
): ObjectVal {
  const object: ObjectVal = {
    type: "object",
    properties: new Map(),
    schemaName: "MongoDatabase",
  };
  const meta: DatabaseMeta = {
    client,
    database,
    uri,
    name: dbName,
    closed: false,
    collections: new Map(),
  };
  databaseMetaStore.set(object, meta);

  object.properties.set("uri", MK_STRING(redactMongoPassword(uri)));
  object.properties.set("name", MK_STRING(dbName));
  object.properties.set(
    "collection",
    MK_NATIVE_FN(async (args) => {
      if (args.length === 0) {
        throw "collection expects at least 1 argument.";
      }
      const target = args[0];
      if (target.type !== "string") {
        throw "collection expects the collection name as a string.";
      }

      return await createCollectionFromDatabase(
        object,
        (target as StringVal).value,
      );
    }),
  );
  object.properties.set(
    "disconnect",
    MK_NATIVE_FN(async () => {
      await disconnectMongo(object);
      return MK_NULL();
    }),
  );

  return object;
}

function resolveDatabaseName(uri: string, explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) {
    return trimmed;
  }

  const extracted = extractDatabaseNameFromUri(uri);
  if (extracted) {
    return extracted;
  }

  console.warn(
    "[mongo] No database name supplied; defaulting to 'test'. Provide a database name in the URI or as the second connect argument to silence this warning.",
  );
  return "test";
}

function extractDatabaseNameFromUri(uri: string): string | null {
  const schemeSeparator = uri.indexOf("://");
  if (schemeSeparator === -1) {
    return null;
  }

  const pathStart = uri.indexOf("/", schemeSeparator + 3);
  if (pathStart === -1) {
    return null;
  }

  const pathAndQuery = uri.slice(pathStart + 1);
  if (!pathAndQuery) {
    return null;
  }

  const queryIndex = pathAndQuery.indexOf("?");
  const path = queryIndex === -1
    ? pathAndQuery
    : pathAndQuery.slice(0, queryIndex);
  if (!path) {
    return null;
  }

  const slashIndex = path.indexOf("/");
  const rawName = slashIndex === -1 ? path : path.slice(0, slashIndex);
  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function createCollectionValue(
  collection: Collection<Record<string, unknown>>,
  databaseMeta: DatabaseMeta,
  name: string,
): ObjectVal {
  const object: ObjectVal = {
    type: "object",
    properties: new Map(),
    schemaName: "MongoCollection",
  };
  const meta: CollectionMeta = { collection, database: databaseMeta, name };
  collectionMetaStore.set(object, meta);

  object.properties.set("name", MK_STRING(name));
  object.properties.set(
    "findOne",
    MK_NATIVE_FN(async (args) => {
      const filter = args[0] ? runtimeToPlain(args[0]) : {};
      ensureDatabaseOpen(databaseMeta);
      const doc = await meta.collection.findOne(
        filter as Record<string, unknown>,
      );
      if (!doc) {
        return MK_NULL();
      }
      return plainToRuntime(doc);
    }),
  );

  object.properties.set(
    "findMany",
    MK_NATIVE_FN(async (args) => {
      const filter = args[0] ? runtimeToPlain(args[0]) : {};
      ensureDatabaseOpen(databaseMeta);
      const cursor = meta.collection.find(filter as Record<string, unknown>);
      const results = await cursor.toArray();
      return MK_ARRAY(results.map((entry: unknown) => plainToRuntime(entry)));
    }),
  );

  object.properties.set(
    "insertOne",
    MK_NATIVE_FN(async (args) => {
      if (args.length === 0) {
        throw "insertOne expects a document to insert.";
      }
      const document = runtimeToPlain(args[0]);
      ensureDatabaseOpen(databaseMeta);
      const result = await meta.collection.insertOne(
        document as Record<string, unknown>,
      );
      return MK_STRING(String(result));
    }),
  );

  object.properties.set(
    "updateOne",
    MK_NATIVE_FN(async (args) => {
      if (args.length < 2) {
        throw "updateOne expects a filter and an update document.";
      }
      const filter = runtimeToPlain(args[0]);
      const update = runtimeToPlain(args[1]);
      ensureDatabaseOpen(databaseMeta);
      const result = await meta.collection.updateOne(
        filter as Record<string, unknown>,
        update as Record<string, unknown>,
      );
      return makeResultObject({
        matchedCount: MK_NUMBER(
          typeof result.matchedCount === "number" ? result.matchedCount : 0,
        ),
        modifiedCount: MK_NUMBER(
          typeof result.modifiedCount === "number" ? result.modifiedCount : 0,
        ),
        upsertedId: result.upsertedId
          ? MK_STRING(String(result.upsertedId))
          : MK_NULL(),
      });
    }),
  );

  object.properties.set(
    "deleteOne",
    MK_NATIVE_FN(async (args) => {
      if (args.length === 0) {
        throw "deleteOne expects a filter document.";
      }
      const filter = runtimeToPlain(args[0]);
      ensureDatabaseOpen(databaseMeta);
      const result = await meta.collection.deleteOne(
        filter as Record<string, unknown>,
      );
      return MK_NUMBER(result);
    }),
  );

  object.properties.set(
    "countDocuments",
    MK_NATIVE_FN(async (args) => {
      const filter = args[0] ? runtimeToPlain(args[0]) : {};
      ensureDatabaseOpen(databaseMeta);
      const count = await meta.collection.countDocuments(
        filter as Record<string, unknown>,
      );
      return MK_NUMBER(count);
    }),
  );

  object.properties.set(
    "aggregate",
    MK_NATIVE_FN(async (args) => {
      if (args.length === 0) {
        throw "aggregate expects a pipeline array.";
      }
      const pipelineValue = args[0];
      if (pipelineValue.type !== "array") {
        throw "aggregate expects an array of pipeline stages.";
      }
      const pipeline = (pipelineValue as ArrayVal).elements.map((stage) =>
        runtimeToPlain(stage)
      );
      ensureDatabaseOpen(databaseMeta);
      const cursor = meta.collection.aggregate(
        pipeline as Record<string, unknown>[],
      );
      const results = await cursor.toArray();
      return MK_ARRAY(results.map((entry: unknown) => plainToRuntime(entry)));
    }),
  );

  return object;
}

function makeResultObject(entries: Record<string, RuntimeVal>): ObjectVal {
  const obj: ObjectVal = {
    type: "object",
    properties: new Map(),
    schemaName: undefined,
  };
  for (const [key, value] of Object.entries(entries)) {
    obj.properties.set(key, value);
  }
  return obj;
}

export function setCollectionDefaults(
  collectionValue: ObjectVal,
  defaults?: Record<string, unknown>,
): void {
  const meta = collectionMetaStore.get(collectionValue);
  if (!meta) {
    throw "setCollectionDefaults expects a Mongo collection handle.";
  }

  if (!defaults || Object.keys(defaults).length === 0) {
    meta.defaults = undefined;
    return;
  }

  meta.defaults = normalizeCollectionDefaults(defaults);
}

function normalizeCollectionDefaults(
  input: Record<string, unknown>,
): CollectionDefaults {
  const defaults: CollectionDefaults = {};

  if (
    input.projection && typeof input.projection === "object" &&
    !Array.isArray(input.projection)
  ) {
    defaults.projection = input.projection as Record<string, unknown>;
  }

  if (
    input.sort && typeof input.sort === "object" &&
    !Array.isArray(input.sort)
  ) {
    defaults.sort = input.sort as Record<string, unknown>;
  }

  if (typeof input.limit === "number" && Number.isFinite(input.limit)) {
    defaults.limit = input.limit;
  }

  if (
    typeof input.batchSize === "number" && Number.isFinite(input.batchSize)
  ) {
    defaults.batchSize = input.batchSize;
  }

  return defaults;
}

function isOperationResult(value: RuntimeVal): value is ObjectVal {
  return value.type === "object" && operationMetaStore.has(value as ObjectVal);
}

function resolveCollectionTarget(value: RuntimeVal): {
  collection: ObjectVal;
  meta: CollectionMeta;
} {
  if (isMongoCollection(value)) {
    const collectionValue = value as ObjectVal;
    const meta = collectionMetaStore.get(collectionValue);
    if (!meta) {
      throw "Unable to resolve Mongo collection metadata.";
    }
    return { collection: collectionValue, meta };
  }

  if (isOperationResult(value)) {
    const operationValue = value as ObjectVal;
    const meta = operationMetaStore.get(operationValue);
    if (!meta) {
      throw "Mongo operation chain is missing metadata.";
    }
    return { collection: meta.collection, meta: meta.collectionMeta };
  }

  throw "Mongo operations expect a collection handle or operation chain.";
}

function unwrapOperationValue(value: RuntimeVal): RuntimeVal {
  if (isOperationResult(value)) {
    const meta = operationMetaStore.get(value as ObjectVal);
    if (meta) {
      return meta.lastResult;
    }
  }
  return value;
}

export async function executeMongoOperation(
  target: RuntimeVal,
  operator: string,
  argument: RuntimeVal,
): Promise<RuntimeVal> {
  const { collection, meta } = resolveCollectionTarget(target);
  ensureDatabaseOpen(meta.database);

  switch (operator) {
    case "<-":
      return createOperationResult(
        collection,
        meta,
        await performInsert(meta, argument),
      );
    case "!":
      return createOperationResult(
        collection,
        meta,
        await performDelete(meta, argument, false),
      );
    case "!!":
      return createOperationResult(
        collection,
        meta,
        await performDelete(meta, argument, true),
      );
    case "?":
      return createOperationResult(
        collection,
        meta,
        await performFindOne(meta, argument),
      );
    case "??":
      return createOperationResult(
        collection,
        meta,
        await performFindMany(meta, argument),
      );
    case "|>":
      return createOperationResult(
        collection,
        meta,
        await performAggregate(meta, argument),
      );
    default:
      throw `Unsupported Mongo operator '${operator}'.`;
  }
}

export async function executeMongoUpdate(
  target: RuntimeVal,
  filterVal: RuntimeVal,
  updateVal: RuntimeVal,
  optionsVal: RuntimeVal | undefined,
  many: boolean,
): Promise<RuntimeVal> {
  const { collection, meta } = resolveCollectionTarget(target);
  ensureDatabaseOpen(meta.database);

  const filterPlain = ensureRecord(
    runtimeToPlain(unwrapOperationValue(filterVal)),
    "update filter",
  );
  const updatePlain = ensureRecord(
    runtimeToPlain(unwrapOperationValue(updateVal)),
    "update document",
  );
  const optionsPlain = optionsVal
    ? ensureRecord(
      runtimeToPlain(unwrapOperationValue(optionsVal)),
      "update options",
    )
    : undefined;

  const result = many
    ? await meta.collection.updateMany(filterPlain, updatePlain, optionsPlain)
    : await meta.collection.updateOne(filterPlain, updatePlain, optionsPlain);

  return createOperationResult(
    collection,
    meta,
    makeUpdateResult(result),
  );
}

async function performInsert(
  meta: CollectionMeta,
  argument: RuntimeVal,
): Promise<RuntimeVal> {
  const value = runtimeToPlain(unwrapOperationValue(argument));

  if (Array.isArray(value)) {
    const documents = value.map((entry, index) =>
      ensureRecord(entry, `insertMany document at index ${index}`)
    );
    const result = await meta.collection.insertMany(documents);
    const ids = Array.isArray(result)
      ? result.map((entry) => MK_STRING(String(entry)))
      : Object.values(result as Record<string, unknown>).map((entry) =>
        MK_STRING(String(entry))
      );
    return MK_ARRAY(ids);
  }

  const document = ensureRecord(value, "insert document");
  const insertedId = await meta.collection.insertOne(document);
  return MK_STRING(String(insertedId));
}

async function performDelete(
  meta: CollectionMeta,
  argument: RuntimeVal,
  many: boolean,
): Promise<RuntimeVal> {
  const rawFilter = unwrapOperationValue(argument);
  const filter = rawFilter.type === "null"
    ? {}
    : ensureRecord(runtimeToPlain(rawFilter), "delete filter");

  const result = many
    ? await meta.collection.deleteMany(filter)
    : await meta.collection.deleteOne(filter);

  const count = typeof result === "number"
    ? result
    : (result as { deletedCount?: number }).deletedCount ?? 0;
  return MK_NUMBER(count);
}

async function performFindOne(
  meta: CollectionMeta,
  argument: RuntimeVal,
): Promise<RuntimeVal> {
  const { filter, options } = buildFindOneParams(meta, argument);
  const doc = await meta.collection.findOne(filter, options);
  if (!doc) {
    return MK_NULL();
  }
  return plainToRuntime(doc);
}

async function performFindMany(
  meta: CollectionMeta,
  argument: RuntimeVal,
): Promise<RuntimeVal> {
  const { filter, options, limit } = buildFindManyParams(meta, argument);
  const cursor = meta.collection.find(filter, options);
  if (typeof limit === "number") {
    const limiter = (cursor as { limit?: (value: number) => unknown }).limit;
    if (typeof limiter === "function") {
      limiter.call(cursor, limit);
    }
  }
  const results = await cursor.toArray();
  return MK_ARRAY(results.map((entry) => plainToRuntime(entry)));
}

async function performAggregate(
  meta: CollectionMeta,
  argument: RuntimeVal,
): Promise<RuntimeVal> {
  const pipelineValue = unwrapOperationValue(argument);
  const pipelinePlain = runtimeToPlain(pipelineValue);
  if (!Array.isArray(pipelinePlain)) {
    throw "Aggregate operator '|>' expects an array of pipeline stages.";
  }

  const cursor = meta.collection.aggregate(
    pipelinePlain as Record<string, unknown>[],
  );
  const results = await cursor.toArray();
  return MK_ARRAY(results.map((entry) => plainToRuntime(entry)));
}

function buildFindOneParams(
  meta: CollectionMeta,
  argument: RuntimeVal,
): {
  filter: Record<string, unknown>;
  options: Record<string, unknown>;
} {
  const raw = unwrapOperationValue(argument);
  const filter = raw.type === "null"
    ? {}
    : ensureRecord(runtimeToPlain(raw), "findOne filter");
  const options: Record<string, unknown> = {};

  if (meta.defaults?.projection) {
    options.projection = meta.defaults.projection;
  }

  if (meta.defaults?.sort) {
    options.sort = meta.defaults.sort;
  }

  return { filter, options };
}

function buildFindManyParams(
  meta: CollectionMeta,
  argument: RuntimeVal,
): {
  filter: Record<string, unknown>;
  options: Record<string, unknown>;
  limit?: number;
} {
  const raw = unwrapOperationValue(argument);
  const filter = raw.type === "null"
    ? {}
    : ensureRecord(runtimeToPlain(raw), "find filter");
  const options: Record<string, unknown> = {};

  if (meta.defaults?.projection) {
    options.projection = meta.defaults.projection;
  }

  if (meta.defaults?.sort) {
    options.sort = meta.defaults.sort;
  }

  return {
    filter,
    options,
    limit: meta.defaults?.limit,
  };
}

function ensureRecord(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw `${context} must be an object.`;
}

function makeUpdateResult(result: unknown): ObjectVal {
  const matched = extractNumeric(result, "matchedCount");
  const modified = extractNumeric(result, "modifiedCount");
  const upsertedCount = extractNumeric(result, "upsertedCount");
  const upsertedId = extractValue(result, "upsertedId");
  const upsertedIds = extractValue(result, "upsertedIds");

  const entries: Record<string, RuntimeVal> = {
    matchedCount: MK_NUMBER(matched),
    modifiedCount: MK_NUMBER(modified),
    upsertedCount: MK_NUMBER(upsertedCount),
    upsertedId: upsertedId ? plainToRuntime(upsertedId) : MK_NULL(),
  };

  if (upsertedIds && typeof upsertedIds === "object") {
    entries.upsertedIds = plainToRuntime(upsertedIds);
  }

  return makeResultObject(entries);
}

function extractNumeric(source: unknown, key: string): number {
  if (typeof source === "object" && source !== null) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === "number") {
      return value;
    }
  }

  return 0;
}

function extractValue(source: unknown, key: string): unknown {
  if (typeof source === "object" && source !== null) {
    return (source as Record<string, unknown>)[key];
  }
  return undefined;
}

function createOperationResult(
  collectionValue: ObjectVal,
  meta: CollectionMeta,
  result: RuntimeVal,
): ObjectVal {
  const chain: ObjectVal = {
    type: "object",
    properties: new Map(),
    schemaName: "MongoOperation",
  };

  operationMetaStore.set(chain, {
    collection: collectionValue,
    collectionMeta: meta,
    lastResult: result,
  });

  chain.properties.set("value", result);
  chain.properties.set("collection", collectionValue);
  chain.properties.set(
    "unwrap",
    MK_NATIVE_FN(() => result),
  );
  chain.properties.set(
    "valueOf",
    MK_NATIVE_FN(() => result),
  );
  chain.properties.set(
    "toJSON",
    MK_NATIVE_FN(() => result),
  );

  chain.properties.set(
    "thenInsert",
    createChainOperation(collectionValue, "<-"),
  );
  chain.properties.set(
    "thenInsertMany",
    createChainOperation(collectionValue, "<-"),
  );
  chain.properties.set(
    "thenDelete",
    createChainOperation(collectionValue, "!"),
  );
  chain.properties.set(
    "thenDeleteMany",
    createChainOperation(collectionValue, "!!"),
  );
  chain.properties.set(
    "thenFind",
    createChainOperation(collectionValue, "?"),
  );
  chain.properties.set(
    "thenFindMany",
    createChainOperation(collectionValue, "??"),
  );
  chain.properties.set(
    "thenAggregate",
    createChainOperation(collectionValue, "|>"),
  );
  chain.properties.set(
    "thenUpdate",
    createChainUpdate(collectionValue, false),
  );
  chain.properties.set(
    "thenUpdateMany",
    createChainUpdate(collectionValue, true),
  );

  return chain;
}

function createChainOperation(
  defaultCollection: ObjectVal,
  operator: string,
): RuntimeVal {
  return MK_NATIVE_FN(async (args) => {
    const { target, argument } = parseChainTargetArgs(defaultCollection, args);
    return await executeMongoOperation(target, operator, argument);
  });
}

function createChainUpdate(
  defaultCollection: ObjectVal,
  many: boolean,
): RuntimeVal {
  return MK_NATIVE_FN(async (args) => {
    if (args.length === 0) {
      throw "thenUpdate expects at least a filter and update document.";
    }

    let offset = 0;
    let target: RuntimeVal = defaultCollection;

    if (isMongoCollection(args[0]) || isOperationResult(args[0])) {
      target = args[0];
      offset = 1;
    }

    if (args.length - offset < 2) {
      throw "thenUpdate expects a filter and update document.";
    }

    const filter = args[offset];
    const update = args[offset + 1];
    const options = args.length - offset > 2 ? args[offset + 2] : undefined;

    return await executeMongoUpdate(target, filter, update, options, many);
  });
}

function parseChainTargetArgs(
  defaultCollection: ObjectVal,
  args: RuntimeVal[],
): { target: RuntimeVal; argument: RuntimeVal } {
  if (args.length === 0) {
    return { target: defaultCollection, argument: MK_NULL() };
  }

  const [first, ...rest] = args;
  if (isMongoCollection(first) || isOperationResult(first)) {
    const argument = rest.length > 0 ? rest[0] : MK_NULL();
    return { target: first, argument };
  }

  return { target: defaultCollection, argument: first };
}

export function runtimeToPlain(value: RuntimeVal): unknown {
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
        runtimeToPlain(element)
      );
    case "object": {
      const result: Record<string, unknown> = {};
      const objectValue = value as ObjectVal;
      for (const [key, entry] of objectValue.properties.entries()) {
        result[key] = runtimeToPlain(entry);
      }
      return result;
    }
    default:
      throw `Mongo helpers do not support runtime values of type '${value.type}'.`;
  }
}

export function plainToRuntime(input: unknown): RuntimeVal {
  if (input === null || typeof input === "undefined") {
    return MK_NULL();
  }

  if (input instanceof Date) {
    return MK_STRING(input.toISOString());
  }

  if (
    input instanceof ObjectId ||
    (typeof input === "object" && input !== null &&
      (input as { _bsontype?: string })._bsontype === "ObjectId")
  ) {
    const value = input as ObjectId;
    return MK_STRING(value.toString());
  }

  if (typeof input === "number") {
    return MK_NUMBER(input);
  }

  if (typeof input === "string") {
    return MK_STRING(input);
  }

  if (typeof input === "boolean") {
    return MK_BOOL(input);
  }

  if (Array.isArray(input)) {
    return MK_ARRAY((input as unknown[]).map((value) => plainToRuntime(value)));
  }

  if (typeof input === "object") {
    const obj: ObjectVal = {
      type: "object",
      properties: new Map(),
      schemaName: undefined,
    };
    for (
      const [key, value] of Object.entries(input as Record<string, unknown>)
    ) {
      obj.properties.set(key, plainToRuntime(value));
    }
    return obj;
  }

  return MK_STRING(String(input));
}
