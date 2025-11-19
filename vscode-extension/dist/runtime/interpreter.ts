import {
  MK_BOOL,
  MK_NULL,
  MK_STRING,
  NumberVal,
  RuntimeVal,
} from "./values.ts";
import {
  ArrayLiteral,
  AssignmentExpr,
  AwaitExpr,
  BinaryExpr,
  BooleanLiteral,
  BreakStatement,
  CallExpr,
  ClassDeclaration,
  CollectionStatement,
  ContinueStatement,
  DatabaseStatement,
  ExportDeclaration,
  FunctionDeclaration,
  Identifier,
  IfStatement,
  ImportStatement,
  MemberExpr,
  MongoOperationExpr,
  MongoQueryExpr,
  MongoUpdateExpr,
  NumericLiteral,
  ObjectLiteral,
  Program,
  ReturnStatement,
  Stmt,
  StringLiteral,
  UseCollectionStatement,
  UsingStatement,
  ThrowStatement,
  TryCatchStatement,
  UnaryExpr,
  VarDeclaration,
  WhileStatement,
} from "../frontend/ast.ts";
import Environment from "./environment.ts";
import {
  eval_array_literal,
  eval_assignment,
  eval_await_expression,
  eval_binary_expression,
  eval_call_expr,
  eval_identifier,
  eval_mongo_operation_expr,
  eval_mongo_query_expr,
  eval_mongo_update_expr,
  eval_member_expr,
  eval_object_expr,
  eval_unary_expression,
} from "./eval/expressions.ts";
import {
  eval_break_statement,
  eval_class_declaration,
  eval_collection_statement,
  eval_continue_statement,
  eval_database_statement,
  eval_export_declaration,
  eval_function_declaration,
  eval_if_statement,
  eval_import_statement,
  eval_use_collection_statement,
  eval_using_statement,
  eval_program,
  eval_return_statement,
  eval_throw_statement,
  eval_try_catch_statement,
  eval_var_declaration,
  eval_while_statement,
} from "./eval/statements.ts";

export async function evaluate(
  astNode: Stmt,
  env: Environment,
): Promise<RuntimeVal> {
  // Dispatch to the correct handler based on the node type.
  switch (astNode.kind) {
    case "NumericLiteral":
      return {
        value: (astNode as NumericLiteral).value,
        type: "number",
      } as NumberVal;
    case "BooleanLiteral":
      return MK_BOOL((astNode as BooleanLiteral).value);
    case "Identifier":
      return eval_identifier(astNode as Identifier, env);
    case "StringLiteral":
      return MK_STRING((astNode as StringLiteral).value);
    case "NullLiteral":
      return MK_NULL();
    case "ObjectLiteral":
      return await eval_object_expr(astNode as ObjectLiteral, env);
    case "ArrayLiteral":
      return await eval_array_literal(astNode as ArrayLiteral, env);
    case "CallExpr":
      return await eval_call_expr(astNode as CallExpr, env);
    case "MemberExpr":
      return await eval_member_expr(astNode as MemberExpr, env);
    case "AssignmentExpr":
      return await eval_assignment(astNode as AssignmentExpr, env);
    case "BinaryExpr":
      return await eval_binary_expression(astNode as BinaryExpr, env);
    case "UnaryExpr":
      return await eval_unary_expression(astNode as UnaryExpr, env);
    case "AwaitExpr":
      return await eval_await_expression(astNode as AwaitExpr, env);
    case "MongoOperationExpr":
      return await eval_mongo_operation_expr(
        astNode as MongoOperationExpr,
        env,
      );
    case "MongoQueryExpr":
      return await eval_mongo_query_expr(astNode as MongoQueryExpr, env);
    case "MongoUpdateExpr":
      return await eval_mongo_update_expr(astNode as MongoUpdateExpr, env);
    case "Program":
      return await eval_program(astNode as Program, env);
    case "VarDeclaration":
      return await eval_var_declaration(astNode as VarDeclaration, env);
    case "DatabaseStatement":
      return await eval_database_statement(astNode as DatabaseStatement, env);
    case "CollectionStatement":
      return await eval_collection_statement(
        astNode as CollectionStatement,
        env,
      );
    case "UseCollectionStatement":
      return await eval_use_collection_statement(
        astNode as UseCollectionStatement,
        env,
      );
    case "FunctionDeclaration":
      return await eval_function_declaration(
        astNode as FunctionDeclaration,
        env,
      );
    case "ClassDeclaration":
      return await eval_class_declaration(astNode as ClassDeclaration, env);
    case "IfStatement":
      return await eval_if_statement(astNode as IfStatement, env);
    case "WhileStatement":
      return await eval_while_statement(astNode as WhileStatement, env);
    case "ReturnStatement":
      return await eval_return_statement(astNode as ReturnStatement, env);
    case "BreakStatement":
      return await eval_break_statement(astNode as BreakStatement, env);
    case "ContinueStatement":
      return await eval_continue_statement(astNode as ContinueStatement, env);
    case "TryCatchStatement":
      return await eval_try_catch_statement(astNode as TryCatchStatement, env);
    case "ThrowStatement":
      return await eval_throw_statement(astNode as ThrowStatement, env);
    case "ExportDeclaration":
      return await eval_export_declaration(astNode as ExportDeclaration, env);
    case "ImportStatement":
      return await eval_import_statement(astNode as ImportStatement, env);
    case "UsingStatement":
      return await eval_using_statement(astNode as UsingStatement, env);
    default:
      console.error(
        `Interpreter does not handle AST node kind '${astNode.kind}'. Implement an evaluator for this node type.`,
        astNode,
      );
      Deno.exit(1);
  }
}
