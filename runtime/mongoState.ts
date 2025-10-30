const collectionBindings = new Set<string>();
let databaseBinding: string | null = null;

export interface MongoStateSnapshot {
  database: string | null;
  collections: string[];
}

export function hasActiveDatabaseBinding(): boolean {
  return databaseBinding !== null;
}

export function registerDatabaseBinding(name: string): void {
  databaseBinding = name;
}

export function getDatabaseBinding(): string | null {
  return databaseBinding;
}

export function clearDatabaseBinding(): void {
  databaseBinding = null;
}

export function registerCollectionBinding(name: string): void {
  collectionBindings.add(name);
}

export function consumeCollectionBindings(): string[] {
  const names = Array.from(collectionBindings);
  collectionBindings.clear();
  return names;
}

export function captureMongoState(): MongoStateSnapshot {
  return {
    database: databaseBinding,
    collections: Array.from(collectionBindings),
  };
}

export function restoreMongoState(snapshot: MongoStateSnapshot): void {
  databaseBinding = snapshot.database;
  collectionBindings.clear();
  for (const name of snapshot.collections) {
    collectionBindings.add(name);
  }
}
