import {
  ArrayLiteral,
  AssignmentExpr,
  AwaitExpr,
  BinaryExpr,
  BooleanLiteral,
  BreakStatement,
  CallExpr,
  CatchClause,
  ClassDeclaration,
  ClassMember,
  CollectionStatement,
  ContinueStatement,
  DatabaseStatement,
  ExportDeclaration,
  Expr,
  FieldDefinition,
  FunctionDeclaration,
  FunctionParameter,
  Identifier,
  IfStatement,
  ImportStatement,
  MemberExpr,
  MethodDefinition,
  MongoOperationExpr,
  MongoQueryCondition,
  MongoQueryExpr,
  MongoUpdateExpr,
  NullLiteral,
  NumericLiteral,
  ObjectLiteral,
  Program,
  Property,
  ReturnStatement,
  SchemaConstructor,
  SchemaConstructorParameter,
  Stmt,
  StringLiteral,
  ThrowStatement,
  TryCatchStatement,
  TypeAnnotation,
  UnaryExpr,
  UseCollectionStatement,
  UsingStatement,
  VarDeclaration,
  WhileStatement,
} from "./ast.ts";
import { Token, tokenize, TokenType } from "./lexer.ts";

export default class Parser {
  private tokens: Token[] = [];

  // Indicates whether there are still tokens to consume.
  private not_eof(): boolean {
    return this.tokens[0].type != TokenType.EOF;
  }

  // Peek at the current token without removing it.
  private at() {
    return this.tokens[0] as Token;
  }

  // Consume the current token and move forward.
  private eat() {
    const prev = this.tokens.shift() as Token;
    return prev;
  }

  // Assert the next token is of a specific type.
  private expect(type: TokenType, err: string) {
    const prev = this.tokens.shift() as Token;
    if (!prev || prev.type != type) {
      console.error(
        `Parser error: ${err}. Expected token type ${
          TokenType[type]
        } but found ${prev ? TokenType[prev.type] : "EOF"} with value '${
          prev ? prev.value : "none"
        }'.`,
      );
      Deno.exit(1);
    }

    return prev;
  }

  public produceAST(sourceCode: string): Program {
    this.tokens = tokenize(sourceCode);
    const program: Program = {
      kind: "Program",
      body: [],
    };

    // Parse until end of file
    while (this.not_eof()) {
      program.body.push(this.parse_stmt());
    }
    return program;
  }

  private parse_stmt(): Stmt {
    // Skip to parse_expr
    switch (this.at().type) {
      case TokenType.Declare:
        return this.parse_var_declaration();
      case TokenType.Func:
        return this.parse_fn_declaration();
      case TokenType.If:
        return this.parse_if_statement();
      case TokenType.While:
        return this.parse_while_statement();
      case TokenType.Return:
        return this.parse_return_statement();
      case TokenType.Break:
        return this.parse_break_statement();
      case TokenType.Continue:
        return this.parse_continue_statement();
      case TokenType.Try:
        return this.parse_try_statement();
      case TokenType.Throw:
        return this.parse_throw_statement();
      case TokenType.Import:
        return this.parse_import_statement();
      case TokenType.Export:
        return this.parse_export_statement();
      case TokenType.Using:
        return this.parse_using_statement();
      case TokenType.Use:
        return this.parse_use_statement();
      case TokenType.Database:
        return this.parse_database_statement();
      case TokenType.Collection:
        return this.parse_collection_statement();
      case TokenType.Class:
      case TokenType.Schema:
        return this.parse_class_declaration();
      default:
        return this.parse_expr_statement();
    }
  }

  private parse_expr_statement(): Stmt {
    const expr = this.parse_expr();
    if (this.at().type == TokenType.Semicolon) {
      this.eat();
    }
    return expr;
  }

  parse_fn_declaration(): Stmt {
    this.eat(); // eat fn keyword
    const name = this.expect(
      TokenType.Identifier,
      "Expected function name following `func` keyword",
    ).value;
    const params = this.parse_parameter_list();

    this.expect(
      TokenType.OpenBracket,
      "Expected function body following declaration",
    );
    const body: Stmt[] = [];

    while (
      this.at().type !== TokenType.EOF &&
      this.at().type != TokenType.CloseBracket
    ) {
      body.push(this.parse_stmt());
    }

    this.expect(
      TokenType.CloseBracket,
      "Closing brace expected inside function declaration",
    );
    const func = {
      body,
      name,
      parameters: params,
      kind: "FunctionDeclaration",
    } as FunctionDeclaration;

    return func;
  }

  private parse_if_statement(): Stmt {
    this.expect(TokenType.If, "Expected 'if' keyword.");
    this.expect(TokenType.OpenParen, "Expected '(' after 'if'.");
    const test = this.parse_expr();
    this.expect(TokenType.CloseParen, "Expected ')' after if condition.");
    const consequent = this.parse_block();

    let alternate: Stmt[] | IfStatement | undefined = undefined;
    if (this.at().type == TokenType.Else) {
      this.eat();
      if (this.at().type == TokenType.If) {
        alternate = this.parse_if_statement() as IfStatement;
      } else if (this.at().type == TokenType.OpenBracket) {
        alternate = this.parse_block();
      } else {
        alternate = [this.parse_stmt()];
      }
    }

    return {
      kind: "IfStatement",
      test,
      consequent,
      alternate,
    } as IfStatement;
  }

  private parse_while_statement(): Stmt {
    this.expect(TokenType.While, "Expected 'while' keyword.");
    this.expect(TokenType.OpenParen, "Expected '(' after 'while'.");
    const test = this.parse_expr();
    this.expect(TokenType.CloseParen, "Expected ')' after while condition.");
    const body = this.parse_block();
    return {
      kind: "WhileStatement",
      test,
      body,
    } as WhileStatement;
  }

  private parse_return_statement(): Stmt {
    this.expect(TokenType.Return, "Expected 'return' keyword.");

    let argument: Expr | undefined = undefined;
    if (this.at().type != TokenType.Semicolon) {
      argument = this.parse_expr();
    }

    this.expect(
      TokenType.Semicolon,
      "Return statements must end with a semicolon.",
    );
    return {
      kind: "ReturnStatement",
      argument,
    } as ReturnStatement;
  }

  private parse_break_statement(): Stmt {
    this.expect(TokenType.Break, "Expected 'break' keyword.");
    this.expect(
      TokenType.Semicolon,
      "Break statements must end with a semicolon.",
    );
    return { kind: "BreakStatement" } as BreakStatement;
  }

  private parse_continue_statement(): Stmt {
    this.expect(TokenType.Continue, "Expected 'continue' keyword.");
    this.expect(
      TokenType.Semicolon,
      "Continue statements must end with a semicolon.",
    );
    return { kind: "ContinueStatement" } as ContinueStatement;
  }

  private parse_try_statement(): Stmt {
    this.expect(TokenType.Try, "Expected 'try' keyword.");
    const tryBlock = this.parse_block();

    if (this.at().type != TokenType.Catch) {
      throw "Try statement must be followed by a catch block.";
    }

    this.eat(); // consume 'catch'
    let param: string | undefined = undefined;

    if (this.at().type == TokenType.OpenParen) {
      this.eat();
      if (this.at().type != TokenType.CloseParen) {
        param = this.expect(
          TokenType.Identifier,
          "Expected identifier in catch parameter",
        ).value;
      }
      this.expect(TokenType.CloseParen, "Expected ')' after catch parameter");
    }

    const catchBody = this.parse_block();
    const catchClause: CatchClause = { param, body: catchBody };

    return {
      kind: "TryCatchStatement",
      tryBlock: tryBlock,
      catchClause,
    } as TryCatchStatement;
  }

  private parse_throw_statement(): Stmt {
    this.expect(TokenType.Throw, "Expected 'throw' keyword.");
    const argument = this.parse_expr();
    this.expect(
      TokenType.Semicolon,
      "Throw statements must end with a semicolon.",
    );
    return {
      kind: "ThrowStatement",
      argument,
    } as ThrowStatement;
  }

  private parse_database_statement(): Stmt {
    this.expect(TokenType.Database, "Expected 'database' keyword.");
    const identifier =
      this.expect(TokenType.Identifier, "Expected database binding name.")
        .value;
    this.expect(TokenType.Equals, "Expected '=' after database binding name.");
    const initializer = this.parse_expr();
    this.expect(
      TokenType.Semicolon,
      "Database statement must end with a semicolon.",
    );
    return {
      kind: "DatabaseStatement",
      identifier,
      initializer,
    } as DatabaseStatement;
  }

  private parse_use_statement(): Stmt {
    this.expect(TokenType.Use, "Expected 'use' keyword.");
    if (this.at().type === TokenType.Collection) {
      return this.parse_use_collection_statement();
    }

    throw "Unsupported use statement. Use 'use collection <name>' optionally followed by 'with <expression>'.";
  }

  private parse_use_collection_statement(): Stmt {
    this.expect(
      TokenType.Collection,
      "Expected 'collection' keyword after 'use'.",
    );
    const identifier = this.expect(
      TokenType.Identifier,
      "Expected collection name after 'use collection'.",
    ).value;

    let options: Expr | undefined = undefined;
    if (this.at().type === TokenType.With) {
      this.eat();
      options = this.parse_expr();
    }

    this.expect(
      TokenType.Semicolon,
      "use collection statement must end with a semicolon.",
    );

    return {
      kind: "UseCollectionStatement",
      identifier,
      options,
    } as UseCollectionStatement;
  }

  private parse_collection_statement(): Stmt {
    this.expect(TokenType.Collection, "Expected 'collection' keyword.");
    const identifier =
      this.expect(TokenType.Identifier, "Expected collection identifier.")
        .value;

    let source: Expr | undefined = undefined;
    if (this.at().type == TokenType.Equals) {
      this.eat();
      source = this.parse_expr();
    }

    this.expect(
      TokenType.Semicolon,
      "Collection statement must end with a semicolon.",
    );

    return {
      kind: "CollectionStatement",
      identifier,
      source,
    } as CollectionStatement;
  }

  private parse_using_statement(): Stmt {
    this.expect(TokenType.Using, "Expected 'using' keyword.");
    const resourceToken = this.expect(
      TokenType.Mongo,
      "Expected 'mongo' after 'using'.",
    );
    const resource = resourceToken.value as "mongo";

    this.expect(TokenType.From, "Expected 'from' in using statement.");
    const uri = this.parse_expr();

    let database: Expr | undefined = undefined;
    let alias: string | undefined = undefined;
    let options: Expr | undefined = undefined;

    let parsing = true;
    while (parsing) {
      switch (this.at().type) {
        case TokenType.Database:
          this.eat();
          database = this.parse_expr();
          break;
        case TokenType.As:
          this.eat();
          alias = this.expect(
            TokenType.Identifier,
            "Expected identifier after 'as' in using statement.",
          ).value;
          break;
        case TokenType.With:
          this.eat();
          options = this.parse_expr();
          break;
        default:
          parsing = false;
          break;
      }
    }

    const body = this.parse_block();

    return {
      kind: "UsingStatement",
      resource,
      uri,
      database,
      alias,
      options,
      body,
    } as UsingStatement;
  }

  private parse_import_statement(): Stmt {
    this.expect(TokenType.Import, "Expected 'import' keyword.");
    const source =
      this.expect(TokenType.String, "Import source must be a string literal.")
        .value;

    let namespace: string | undefined = undefined;
    if (this.at().type == TokenType.As) {
      this.eat();
      namespace = this.expect(
        TokenType.Identifier,
        "Expected identifier after 'as' in import statement",
      ).value;
    }

    let namedImports: string[] | undefined = undefined;
    if (this.at().type == TokenType.Exposing) {
      this.eat();
      this.expect(TokenType.OpenBracket, "Expected '{' after 'exposing'.");
      namedImports = [];

      while (this.at().type != TokenType.CloseBracket) {
        const name = this.expect(
          TokenType.Identifier,
          "Expected identifier in import list",
        ).value;
        namedImports.push(name);

        if (this.at().type == TokenType.Comma) {
          this.eat();
        } else {
          break;
        }
      }

      this.expect(TokenType.CloseBracket, "Expected '}' to close import list.");
    }

    let defaultBinding: string | undefined = undefined;
    if (this.at().type == TokenType.Default) {
      this.eat();
      defaultBinding = this.expect(
        TokenType.Identifier,
        "Expected identifier after 'default' in import statement",
      ).value;
    }

    this.expect(
      TokenType.Semicolon,
      "Import statements must end with a semicolon.",
    );
    return {
      kind: "ImportStatement",
      source,
      namespace,
      namedImports,
      defaultBinding,
    } as ImportStatement;
  }

  private parse_export_statement(): Stmt {
    this.expect(TokenType.Export, "Expected 'export' keyword.");

    if (this.at().type == TokenType.Default) {
      this.eat();

      if (this.at().type == TokenType.Func) {
        const declaration = this.parse_fn_declaration();
        return {
          kind: "ExportDeclaration",
          defaultDeclaration: declaration,
        } as ExportDeclaration;
      }

      if (
        this.at().type == TokenType.Class || this.at().type == TokenType.Schema
      ) {
        const declaration = this.parse_class_declaration();
        return {
          kind: "ExportDeclaration",
          defaultDeclaration: declaration,
        } as ExportDeclaration;
      }

      const expr = this.parse_expr();
      this.expect(
        TokenType.Semicolon,
        "Export default expression must end with a semicolon.",
      );
      return {
        kind: "ExportDeclaration",
        defaultExpr: expr,
      } as ExportDeclaration;
    }

    if (this.at().type == TokenType.OpenBracket) {
      this.eat();
      const specifiers: string[] = [];

      while (this.at().type != TokenType.CloseBracket) {
        const name = this.expect(
          TokenType.Identifier,
          "Expected identifier in export list",
        ).value;
        specifiers.push(name);

        if (this.at().type == TokenType.Comma) {
          this.eat();
        } else {
          break;
        }
      }

      this.expect(TokenType.CloseBracket, "Expected '}' to close export list.");
      this.expect(
        TokenType.Semicolon,
        "Export list must end with a semicolon.",
      );

      return {
        kind: "ExportDeclaration",
        specifiers,
      } as ExportDeclaration;
    }

    let declaration: Stmt;
    switch (this.at().type) {
      case TokenType.Declare:
        declaration = this.parse_var_declaration();
        break;
      case TokenType.Func:
        declaration = this.parse_fn_declaration();
        break;
      case TokenType.Class:
      case TokenType.Schema:
        declaration = this.parse_class_declaration();
        break;
      default:
        throw "Unsupported export target. Use 'export declare', 'export func', 'export schema', or 'export { name }'.";
    }

    return {
      kind: "ExportDeclaration",
      declaration,
    } as ExportDeclaration;
  }

  private parse_class_declaration(): Stmt {
    this.eat(); // consume 'class' or 'schema'
    const name = this.expect(
      TokenType.Identifier,
      "Expected schema name following declaration keyword",
    ).value;

    let base: string | undefined = undefined;
    if (this.at().type == TokenType.Extends) {
      this.eat();
      base = this.expect(
        TokenType.Identifier,
        "Expected base schema name after 'extends'.",
      ).value;
    }

    let constructor: SchemaConstructor | undefined = undefined;
    if (this.at().type == TokenType.Create) {
      constructor = this.parse_schema_constructor();
    }

    this.expect(TokenType.OpenBracket, "Expected '{' to start schema body");
    const members: ClassMember[] = [];

    while (this.at().type !== TokenType.CloseBracket && this.not_eof()) {
      members.push(this.parse_class_member());
    }

    this.expect(TokenType.CloseBracket, "Expected '}' to close schema body");

    return {
      kind: "ClassDeclaration",
      name,
      base,
      constructor,
      members,
    } as ClassDeclaration;
  }

  private parse_schema_constructor(): SchemaConstructor {
    this.eat(); // consume 'create'
    this.expect(
      TokenType.OpenParen,
      "Expected '(' after 'create' keyword in schema constructor signature",
    );

    const parameters: SchemaConstructorParameter[] = [];
    if (this.at().type != TokenType.CloseParen) {
      do {
        const name = this.expect(
          TokenType.Identifier,
          "Expected parameter name in schema constructor",
        ).value;
        let typeAnnotation = undefined;
        if (this.at().type == TokenType.Colon) {
          this.eat();
          typeAnnotation = this.parse_type_annotation();
        }
        parameters.push({ name, typeAnnotation });
      } while (this.at().type == TokenType.Comma && this.eat());
    }

    this.expect(
      TokenType.CloseParen,
      "Expected ')' to close schema constructor parameters",
    );
    return { parameters };
  }

  private parse_class_member(): ClassMember {
    let explicitRequired: boolean | undefined = undefined;

    if (this.at().type == TokenType.Required) {
      this.eat();
      explicitRequired = true;
    } else if (this.at().type == TokenType.Optional) {
      this.eat();
      explicitRequired = false;
    }

    const nameToken = this.expect(
      TokenType.Identifier,
      "Expected identifier for schema member",
    );

    if (this.at().type == TokenType.OpenParen) {
      // Method definition
      const parameters = this.parse_parameter_list();
      const body = this.parse_block();
      return {
        kind: "MethodDefinition",
        name: nameToken.value,
        parameters,
        body,
      } as MethodDefinition;
    }

    return this.parse_field_definition(nameToken.value, explicitRequired);
  }

  private parse_field_definition(
    name: string,
    explicitRequired: boolean | undefined,
  ): FieldDefinition {
    let typeAnnotation = undefined;
    if (this.at().type == TokenType.Colon) {
      this.eat();
      typeAnnotation = this.parse_type_annotation();
    }

    let value: Expr | undefined;
    if (this.at().type == TokenType.Equals) {
      this.eat();
      value = this.parse_assignment_expr();
    }

    this.expect(
      TokenType.Semicolon,
      "Schema field declarations must end with a semicolon",
    );

    const required = explicitRequired !== undefined
      ? explicitRequired
      : value === undefined;

    return {
      kind: "FieldDefinition",
      name,
      typeAnnotation,
      required,
      value,
    } as FieldDefinition;
  }

  private parse_type_annotation(): TypeAnnotation {
    const base =
      this.expect(TokenType.Identifier, "Expected type name in annotation")
        .value;
    let arrayDepth = 0;
    while (this.at().type == TokenType.OpenBrace) {
      this.eat();
      this.expect(
        TokenType.CloseBrace,
        "Expected ']' in array type annotation",
      );
      arrayDepth++;
    }

    return { base, arrayDepth };
  }

  private parse_parameter_list(): FunctionParameter[] {
    this.expect(TokenType.OpenParen, "Expected '(' before parameter list");
    const params: FunctionParameter[] = [];

    if (this.at().type != TokenType.CloseParen) {
      while (true) {
        const name = this.expect(
          TokenType.Identifier,
          "Expected identifier in parameter list",
        ).value;
        let typeAnnotation: TypeAnnotation | undefined = undefined;
        let defaultValue: Expr | undefined = undefined;

        if (this.at().type == TokenType.Colon) {
          this.eat();
          typeAnnotation = this.parse_type_annotation();
        }

        if (this.at().type == TokenType.Equals) {
          this.eat();
          defaultValue = this.parse_assignment_expr();
        }

        params.push({ name, typeAnnotation, defaultValue });

        if (this.at().type != TokenType.Comma) {
          break;
        }

        this.eat();
      }
    }

    this.expect(TokenType.CloseParen, "Expected ')' after parameter list");
    return params;
  }

  private parse_block(): Stmt[] {
    this.expect(TokenType.OpenBracket, "Expected '{' to start block");
    const body: Stmt[] = [];
    while (this.at().type !== TokenType.CloseBracket && this.not_eof()) {
      body.push(this.parse_stmt());
    }
    this.expect(TokenType.CloseBracket, "Expected '}' to close block");
    return body;
  }

  private parse_var_declaration(): Stmt {
    this.expect(
      TokenType.Declare,
      "Variable declarations must begin with 'declare'.",
    );

    let isConstant = false;
    if (this.at().type == TokenType.Const) {
      this.eat();
      isConstant = true;
    }

    const identifier = this.expect(
      TokenType.Identifier,
      "Expected identifier following variable declaration",
    ).value;

    if (this.at().type == TokenType.Semicolon) {
      this.eat();
      if (isConstant) {
        throw "Constant declarations require an initializer.";
      }

      return {
        kind: "VarDeclaration",
        constant: false,
        identifier,
      } as VarDeclaration;
    }

    this.expect(
      TokenType.Equals,
      "Expected '=' following identifier in variable declaration.",
    );
    const declaration = {
      kind: "VarDeclaration",
      value: this.parse_expr(),
      constant: isConstant,
      identifier,
    } as VarDeclaration;

    this.expect(
      TokenType.Semicolon,
      "Variable declaration statement must end with a semicolon",
    );
    return declaration;
  }

  private parse_expr(): Expr {
    return this.parse_assignment_expr();
  }

  // Support chained assignments like a = b = 1.
  private parse_assignment_expr(): Expr {
    const left = this.parse_mongo_expr();

    if (this.at().type == TokenType.Equals) {
      this.eat(); // advance past equal token
      const value = this.parse_assignment_expr();
      return { value, assigne: left, kind: "AssignmentExpr" } as AssignmentExpr;
    }

    return left;
  }

  private parse_mongo_expr(): Expr {
    let expr = this.parse_logical_or_expr();

    while (true) {
      if (
        this.at().type == TokenType.BinaryOperator &&
        this.isMongoOperator(this.at().value)
      ) {
        const operator = this.eat().value;
        const argument = this.parse_logical_or_expr();
        expr = {
          kind: "MongoOperationExpr",
          target: expr,
          operator,
          argument,
        } as MongoOperationExpr;
        continue;
      }

      if (this.at().type == TokenType.Update) {
        expr = this.parse_mongo_update_expr(expr);
        continue;
      }

      break;
    }

    return expr;
  }

  private isMongoOperator(value: string): boolean {
    switch (value) {
      case "<-":
      case "!":
      case "!!":
      case "?":
      case "??":
      case "|>":
        return true;
      default:
        return false;
    }
  }

  private parse_mongo_update_expr(target: Expr): Expr {
    this.expect(
      TokenType.Update,
      "Expected 'update' keyword in Mongo update expression.",
    );

    let many = false;
    if (this.at().type == TokenType.Many) {
      this.eat();
      many = true;
    }

    this.expect(
      TokenType.Where,
      "Expected 'where' clause in Mongo update expression.",
    );
    const filter = this.parse_mongo_query_clause();

    this.expect(
      TokenType.Set,
      "Expected 'set' clause in Mongo update expression.",
    );
    const update = this.parse_logical_or_expr();

    let options: Expr | undefined = undefined;
    if (this.at().type == TokenType.With) {
      this.eat();
      options = this.parse_logical_or_expr();
    }

    return {
      kind: "MongoUpdateExpr",
      target,
      filter,
      update,
      options,
      many,
    } as MongoUpdateExpr;
  }

  private parse_mongo_query_clause(): Expr {
    if (this.at().type == TokenType.Query) {
      return this.parse_query_expr();
    }

    return this.parse_logical_or_expr();
  }

  private parse_query_expr(): MongoQueryExpr {
    this.expect(TokenType.Query, "Expected 'query' keyword.");
    this.expect(TokenType.OpenBracket, "Expected '{' to start query pattern.");

    const conditions: MongoQueryCondition[] = [];

    while (this.not_eof() && this.at().type != TokenType.CloseBracket) {
      const field = this.expect(
        TokenType.Identifier,
        "Expected field name inside query pattern.",
      ).value;

      const operatorToken = this.expect(
        TokenType.BinaryOperator,
        "Expected comparison operator inside query pattern.",
      ).value;

      if (!this.isSupportedQueryOperator(operatorToken)) {
        throw `Unsupported query operator '${operatorToken}'. Use ==, !=, <, <=, >, or >= inside query patterns.`;
      }

      const value = this.parse_assignment_expr();

      conditions.push({ field, operator: operatorToken, value });

      if (this.at().type == TokenType.Comma) {
        this.eat();
        continue;
      }

      break;
    }

    this.expect(TokenType.CloseBracket, "Expected '}' to close query pattern.");

    return {
      kind: "MongoQueryExpr",
      conditions,
    } as MongoQueryExpr;
  }

  private isSupportedQueryOperator(op: string): boolean {
    switch (op) {
      case "==":
      case "!=":
      case "<":
      case "<=":
      case ">":
      case ">=":
        return true;
      default:
        return false;
    }
  }

  private parse_logical_or_expr(): Expr {
    let left = this.parse_logical_and_expr();

    while (
      this.at().type == TokenType.BinaryOperator && this.at().value == "||"
    ) {
      const operator = this.eat().value;
      const right = this.parse_logical_and_expr();
      left = { kind: "BinaryExpr", left, right, operator } as BinaryExpr;
    }

    return left;
  }

  private parse_logical_and_expr(): Expr {
    let left = this.parse_equality_expr();

    while (
      this.at().type == TokenType.BinaryOperator && this.at().value == "&&"
    ) {
      const operator = this.eat().value;
      const right = this.parse_equality_expr();
      left = { kind: "BinaryExpr", left, right, operator } as BinaryExpr;
    }

    return left;
  }

  private parse_equality_expr(): Expr {
    let left = this.parse_relational_expr();

    while (
      this.at().type == TokenType.BinaryOperator &&
      (this.at().value == "==" || this.at().value == "!=")
    ) {
      const operator = this.eat().value;
      const right = this.parse_relational_expr();
      left = { kind: "BinaryExpr", left, right, operator } as BinaryExpr;
    }

    return left;
  }

  private parse_relational_expr(): Expr {
    let left = this.parse_additive_expr();

    while (
      this.at().type == TokenType.BinaryOperator &&
      (this.at().value == "<" || this.at().value == "<=" ||
        this.at().value == ">" || this.at().value == ">=")
    ) {
      const operator = this.eat().value;
      const right = this.parse_additive_expr();
      left = { kind: "BinaryExpr", left, right, operator } as BinaryExpr;
    }

    return left;
  }

  // Combine addition and subtraction operations.
  private parse_additive_expr(): Expr {
    let left = this.parse_multiplicative_expr();

    while (
      this.at().type == TokenType.BinaryOperator &&
      (this.at().value == "+" || this.at().value == "-")
    ) {
      const operator = this.eat().value;
      const right = this.parse_multiplicative_expr();
      left = {
        kind: "BinaryExpr",
        left,
        right,
        operator,
      } as BinaryExpr;
    }

    return left;
  }

  // Combine multiplication, division, and modulo operations.
  private parse_multiplicative_expr(): Expr {
    let left = this.parse_unary_expr();

    while (
      this.at().type == TokenType.BinaryOperator &&
      (this.at().value == "*" || this.at().value == "/" ||
        this.at().value == "%")
    ) {
      const operator = this.eat().value;
      const right = this.parse_unary_expr();
      left = {
        kind: "BinaryExpr",
        left,
        right,
        operator,
      } as BinaryExpr;
    }

    return left;
  }

  private parse_unary_expr(): Expr {
    if (this.at().type == TokenType.Await) {
      this.eat();
      const argument = this.parse_unary_expr();
      return { kind: "AwaitExpr", argument } as AwaitExpr;
    }

    if (
      this.at().type == TokenType.BinaryOperator &&
      (this.at().value == "!" || this.at().value == "-")
    ) {
      const operator = this.eat().value;
      const operand = this.parse_unary_expr();
      return { kind: "UnaryExpr", operator, operand } as UnaryExpr;
    }

    return this.parse_call_member_expr();
  }

  private parse_call_member_expr(): Expr {
    const member = this.parse_member_expr();

    if (this.at().type == TokenType.OpenParen) {
      return this.parse_call_expr(member);
    }

    return member;
  }

  private parse_call_expr(caller: Expr): Expr {
    let call_expr: Expr = {
      kind: "CallExpr",
      caller,
      args: this.parse_args(),
    } as CallExpr;

    if (this.at().type == TokenType.OpenParen) {
      call_expr = this.parse_call_expr(call_expr);
    }

    return call_expr;
  }

  private parse_args(): Expr[] {
    this.expect(TokenType.OpenParen, "Expected open parentheses.");
    const args = this.at().type == TokenType.CloseParen
      ? []
      : this.parse_arguements_list();

    this.expect(
      TokenType.CloseParen,
      "Missing closing parentheses inside arguments list",
    );
    return args;
  }

  private parse_arguements_list(): Expr[] {
    const args = [this.parse_assignment_expr()];

    while (this.at().type == TokenType.Comma && this.eat()) {
      args.push(this.parse_assignment_expr());
    }

    return args;
  }

  private parse_member_expr(): Expr {
    let object = this.parse_primary_expr();

    while (
      this.at().type == TokenType.Dot || this.at().type == TokenType.OpenBrace
    ) {
      const operator = this.eat();
      let property: Expr;
      let computed: boolean;

      // non-computed values aka dot.expr
      if (operator.type == TokenType.Dot) {
        computed = false;
        property = this.parse_primary_expr(); // gets identifier

        if (property.kind != "Identifier") {
          throw `Invalid member access: expected identifier after '.' but found '${property.kind}'.`;
        }
      } else {
        // This allows obj[computedValue]
        computed = true;
        property = this.parse_expr();
        this.expect(
          TokenType.CloseBrace,
          "Missing closing brace in computed value",
        );
      }

      object = { kind: "MemberExpr", object, property, computed } as MemberExpr;
    }

    return object;
  }

  // Orders of Precedence
  //Assignment
  // Object
  // AdditiveExpr
  // MuliplicativeExpr
  // Call
  // Member
  // PrimaryExpr < -- Highest Order of Precedence

  // Parse identifiers, numbers, and parenthesized expressions.
  private parse_primary_expr(): Expr {
    const tk = this.at().type;

    switch (tk) {
      case TokenType.Identifier:
        return { kind: "Identifier", symbol: this.eat().value } as Identifier;
      case TokenType.Number:
        return {
          kind: "NumericLiteral",
          value: parseFloat(this.eat().value),
        } as NumericLiteral;
      case TokenType.String:
        return {
          kind: "StringLiteral",
          value: this.eat().value,
        } as StringLiteral;
      case TokenType.True:
        this.eat();
        return { kind: "BooleanLiteral", value: true } as BooleanLiteral;
      case TokenType.False:
        this.eat();
        return { kind: "BooleanLiteral", value: false } as BooleanLiteral;
      case TokenType.Null:
        this.eat();
        return { kind: "NullLiteral" } as NullLiteral;
      case TokenType.Query:
        return this.parse_query_expr();
      case TokenType.OpenBracket: {
        this.eat();
        const properties: Property[] = [];

        while (this.not_eof() && this.at().type != TokenType.CloseBracket) {
          const keyToken = this.at();
          if (
            keyToken.type !== TokenType.Identifier &&
            keyToken.type !== TokenType.String
          ) {
            throw "Object literal keys must be identifiers or string literals.";
          }

          this.eat();
          const key = keyToken.value;

          if (keyToken.type === TokenType.Identifier) {
            if (this.at().type == TokenType.Comma) {
              this.eat();
              properties.push(
                { key, kind: "Property", value: undefined } as Property,
              );
              continue;
            }

            if (this.at().type == TokenType.CloseBracket) {
              properties.push({ key, kind: "Property" } as Property);
              continue;
            }
          }

          this.expect(
            TokenType.Colon,
            "Missing ':' after key in object literal",
          );
          const value = this.parse_expr();
          properties.push({ key, value, kind: "Property" } as Property);

          if (this.at().type != TokenType.CloseBracket) {
            this.expect(
              TokenType.Comma,
              "Expected comma or closing brace following property",
            );
          }
        }

        this.expect(
          TokenType.CloseBracket,
          "Object literal missing closing brace.",
        );
        return { kind: "ObjectLiteral", properties } as ObjectLiteral;
      }
      case TokenType.OpenBrace: {
        this.eat();
        const elements: Expr[] = [];
        if (this.at().type != TokenType.CloseBrace) {
          elements.push(this.parse_assignment_expr());
          while (this.at().type == TokenType.Comma) {
            this.eat();
            if (this.at().type == TokenType.CloseBrace) {
              break;
            }
            elements.push(this.parse_assignment_expr());
          }
        }
        this.expect(
          TokenType.CloseBrace,
          "Missing closing ']' in array literal",
        );
        return {
          kind: "ArrayLiteral",
          elements,
        } as ArrayLiteral;
      }
      case TokenType.OpenParen: {
        this.eat(); // Eat the opening paren
        const value = this.parse_expr();
        this.expect(
          TokenType.CloseParen,
          "Unexpected token found inside parenthesized expression: Expected closing parentheses.",
        ); // Closing paren
        return value;
      }
      default: {
        const current = this.at();
        console.error(
          `Unexpected token '${current.value}' (${
            TokenType[current.type]
          }) found during parsing. Verify the surrounding syntax.`,
        );
        Deno.exit(1);
      }
    }
  }
}
