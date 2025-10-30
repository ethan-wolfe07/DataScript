// Enumerates every node the parser can emit.
export type NodeType =
  // STATEMENTS
  | "Program"
  | "VarDeclaration"
  | "SchemaDeclaration"
  | "FunctionDeclaration"
  | "ClassDeclaration"
  | "MethodDefinition"
  | "FieldDefinition"
  | "IfStatement"
  | "WhileStatement"
  | "ReturnStatement"
  | "BreakStatement"
  | "ContinueStatement"
  | "TryCatchStatement"
  | "ThrowStatement"
  | "ExportDeclaration"
  | "ImportStatement"
  | "ArrayLiteral"
  | "StringLiteral"
  | "BooleanLiteral"
  | "NullLiteral"
  | "UnaryExpr"
  | "DatabaseStatement"
  | "CollectionStatement"
  | "UseCollectionStatement"
  | "UsingStatement"
  // LITERALS
  | "NumericLiteral"
  | "Identifier"
  | "Property"
  | "ObjectLiteral"
  // EXPRESSIONS
  | "AssignmentExpr"
  | "BinaryExpr"
  | "MemberExpr"
  | "CallExpr"
  | "AwaitExpr"
  | "MongoOperationExpr"
  | "MongoQueryExpr"
  | "MongoUpdateExpr";

export interface Stmt {
  kind: NodeType;
}

// Top-level wrapper for a list of statements.
export interface Program extends Stmt {
  kind: "Program";
  body: Stmt[];
}

// Describes variable declarations introduced with `declare`.
export interface VarDeclaration extends Stmt {
  kind: "VarDeclaration";
  constant: boolean;
  identifier: string;
  value?: Expr;
}

export interface DatabaseStatement extends Stmt {
  kind: "DatabaseStatement";
  identifier: string;
  initializer: Expr;
}

export interface CollectionStatement extends Stmt {
  kind: "CollectionStatement";
  identifier: string;
  source?: Expr;
}

export interface UseCollectionStatement extends Stmt {
  kind: "UseCollectionStatement";
  identifier: string;
  options?: Expr;
}

export interface UsingStatement extends Stmt {
  kind: "UsingStatement";
  resource: "mongo";
  uri: Expr;
  database?: Expr;
  alias?: string;
  options?: Expr;
  body: Stmt[];
}

// Represents schema definitions with optional inheritance support.
export interface SchemaDeclaration extends Stmt {
  kind: "SchemaDeclaration";
  name: string;
  base?: string;
  fields: string[];
}

export interface FunctionDeclaration extends Stmt {
  kind: "FunctionDeclaration";
  parameters: FunctionParameter[];
  name: string;
  body: Stmt[];
}

export interface IfStatement extends Stmt {
  kind: "IfStatement";
  test: Expr;
  consequent: Stmt[];
  alternate?: Stmt[] | IfStatement;
}

export interface WhileStatement extends Stmt {
  kind: "WhileStatement";
  test: Expr;
  body: Stmt[];
}

export interface ReturnStatement extends Stmt {
  kind: "ReturnStatement";
  argument?: Expr;
}

export interface BreakStatement extends Stmt {
  kind: "BreakStatement";
}

export interface ContinueStatement extends Stmt {
  kind: "ContinueStatement";
}

export interface TryCatchStatement extends Stmt {
  kind: "TryCatchStatement";
  tryBlock: Stmt[];
  catchClause?: CatchClause;
}

export interface CatchClause {
  param?: string;
  body: Stmt[];
}

export interface ThrowStatement extends Stmt {
  kind: "ThrowStatement";
  argument: Expr;
}

export interface ImportStatement extends Stmt {
  kind: "ImportStatement";
  source: string;
  namespace?: string;
  namedImports?: string[];
  defaultBinding?: string;
}

export interface ExportDeclaration extends Stmt {
  kind: "ExportDeclaration";
  declaration?: Stmt;
  specifiers?: string[];
  defaultDeclaration?: Stmt;
  defaultExpr?: Expr;
}

export interface ClassDeclaration extends Stmt {
  kind: "ClassDeclaration";
  name: string;
  base?: string;
  constructor?: SchemaConstructor;
  members: ClassMember[];
}

export type ClassMember = FieldDefinition | MethodDefinition;

export interface FieldDefinition extends Stmt {
  kind: "FieldDefinition";
  name: string;
  typeAnnotation?: TypeAnnotation;
  required: boolean;
  value?: Expr;
}

export interface MethodDefinition extends Stmt {
  kind: "MethodDefinition";
  name: string;
  parameters: FunctionParameter[];
  body: Stmt[];
}

export interface SchemaConstructor {
  parameters: SchemaConstructorParameter[];
}

export interface SchemaConstructorParameter {
  name: string;
  typeAnnotation?: TypeAnnotation;
}

export interface TypeAnnotation {
  base: string;
  arrayDepth: number;
}

export interface FunctionParameter {
  name: string;
  typeAnnotation?: TypeAnnotation;
  defaultValue?: Expr;
}

export interface Expr extends Stmt {}

export interface UnaryExpr extends Expr {
  kind: "UnaryExpr";
  operator: string;
  operand: Expr;
}

export interface AwaitExpr extends Expr {
  kind: "AwaitExpr";
  argument: Expr;
}

export interface MongoOperationExpr extends Expr {
  kind: "MongoOperationExpr";
  target: Expr;
  operator: string;
  argument: Expr;
}

export interface MongoQueryCondition {
  field: string;
  operator: string;
  value: Expr;
}

export interface MongoQueryExpr extends Expr {
  kind: "MongoQueryExpr";
  conditions: MongoQueryCondition[];
}

export interface MongoUpdateExpr extends Expr {
  kind: "MongoUpdateExpr";
  target: Expr;
  filter: MongoQueryExpr | Expr;
  update: Expr;
  options?: Expr;
  many: boolean;
}

// Generic binary operation such as 1 + 2.
export interface BinaryExpr extends Expr {
  kind: "BinaryExpr";
  left: Expr;
  right: Expr;
  operator: string;
}

export interface CallExpr extends Expr {
  kind: "CallExpr";
  args: Expr[];
  caller: Expr;
}

export interface MemberExpr extends Expr {
  kind: "MemberExpr";
  object: Expr;
  property: Expr;
  computed: boolean;
}

// Represents x = value assignments.
export interface AssignmentExpr extends Expr {
  kind: "AssignmentExpr";
  assigne: Expr;
  value: Expr;
}

// Simple variable lookup by name.
export interface Identifier extends Expr {
  kind: "Identifier";
  symbol: string;
}

// Holds number literals like 42.
export interface NumericLiteral extends Expr {
  kind: "NumericLiteral";
  value: number;
}

export interface StringLiteral extends Expr {
  kind: "StringLiteral";
  value: string;
}

export interface BooleanLiteral extends Expr {
  kind: "BooleanLiteral";
  value: boolean;
}

export interface NullLiteral extends Expr {
  kind: "NullLiteral";
}

export interface Property extends Expr {
  kind: "Property";
  key: string;
  value?: Expr;
}

export interface ObjectLiteral extends Expr {
  kind: "ObjectLiteral";
  properties: Property[];
}

export interface ArrayLiteral extends Expr {
  kind: "ArrayLiteral";
  elements: Expr[];
}
