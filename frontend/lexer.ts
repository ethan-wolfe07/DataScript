// delcare x = 47;
// Declare Identifier Equal Number Semicolon

// Enumerates every token the lexer can emit.
export enum TokenType {
  // Literal Types
  Number,
  Identifier,
  String,

  // Keywords
  Let,
  Const,
  Declare,
  Func,
  Class,
  Create,
  Required,
  Optional,
  Schema,
  Extends,
  If,
  Else,
  While,
  True,
  False,
  Null,
  Return,
  Break,
  Continue,
  Try,
  Catch,
  Throw,
  Import,
  Exposing,
  Default,
  Export,
  As,
  Update,
  Use,
  Using,
  From,
  With,
  Where,
  Set,
  Mongo,
  Many,
  Query,
  Database,
  Collection,
  Await,

  // Grouping * Operators
  Equals,
  Semicolon,
  Comma,
  Colon,
  Dot,
  OpenParen,
  CloseParen,
  OpenBracket, // {
  CloseBracket, // }
  OpenBrace, // [
  CloseBrace, // ]
  BinaryOperator,
  EOF, // Signifies End of File
}

const KEYWORDS: Record<string, TokenType> = {
  let: TokenType.Let,
  const: TokenType.Const,
  declare: TokenType.Declare,
  func: TokenType.Func,
  class: TokenType.Class,
  create: TokenType.Create,
  required: TokenType.Required,
  optional: TokenType.Optional,
  schema: TokenType.Schema,
  extends: TokenType.Extends,
  if: TokenType.If,
  else: TokenType.Else,
  while: TokenType.While,
  true: TokenType.True,
  false: TokenType.False,
  null: TokenType.Null,
  return: TokenType.Return,
  break: TokenType.Break,
  continue: TokenType.Continue,
  try: TokenType.Try,
  catch: TokenType.Catch,
  throw: TokenType.Throw,
  import: TokenType.Import,
  exposing: TokenType.Exposing,
  default: TokenType.Default,
  export: TokenType.Export,
  as: TokenType.As,
  update: TokenType.Update,
  use: TokenType.Use,
  using: TokenType.Using,
  from: TokenType.From,
  with: TokenType.With,
  where: TokenType.Where,
  set: TokenType.Set,
  mongo: TokenType.Mongo,
  many: TokenType.Many,
  query: TokenType.Query,
  database: TokenType.Database,
  collection: TokenType.Collection,
  await: TokenType.Await,
};

export interface Token {
  value: string;
  type: TokenType;
}

// Helper for consistently constructing tokens.
function token(value = "", type: TokenType): Token {
  return { value, type };
}

function isalpha(src: string) {
  return src.toUpperCase() != src.toLowerCase();
}

function isIdentifierStart(ch: string): boolean {
  return isalpha(ch) || ch === "_";
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || isInt(ch);
}

function isInt(str: string) {
  const c = str.charCodeAt(0);
  const bounds = ["0".charCodeAt(0), "9".charCodeAt(0)];
  return (c >= bounds[0] && c <= bounds[1]);
}

function isSkippable(str: string) {
  return /^\s$/.test(str);
}

export function tokenize(sourceCode: string): Token[] {
  const tokens = new Array<Token>();
  const src = sourceCode.split("");

  // Build each token until end of file
  while (src.length > 0) {
    if (src.length > 1 && src[0] == "/" && src[1] == "/") {
      src.shift(); // consume first '/'
      src.shift(); // consume second '/'
      while (src.length > 0) {
        const ch = src.shift() as string;
        if (ch == "\n" || ch == "\r") {
          break;
        }
      }
    } else if (src[0] == "(") {
      tokens.push(token(src.shift(), TokenType.OpenParen));
    } else if (src[0] == ")") {
      tokens.push(token(src.shift(), TokenType.CloseParen));
    } else if (src[0] == "{") {
      tokens.push(token(src.shift(), TokenType.OpenBracket));
    } else if (src[0] == "}") {
      tokens.push(token(src.shift(), TokenType.CloseBracket));
    } else if (src[0] == "[") {
      tokens.push(token(src.shift(), TokenType.OpenBrace));
    } else if (src[0] == "]") {
      tokens.push(token(src.shift(), TokenType.CloseBrace));
    } else if (src.length > 1 && src[0] == "=" && src[1] == "=") {
      src.shift(); // consume first '='
      src.shift(); // consume second '='
      tokens.push(token("==", TokenType.BinaryOperator));
    } else if (src.length > 1 && src[0] == "!" && src[1] == "=") {
      src.shift();
      src.shift();
      tokens.push(token("!=", TokenType.BinaryOperator));
    } else if (src.length > 1 && src[0] == "!" && src[1] == "!") {
      src.shift();
      src.shift();
      tokens.push(token("!!", TokenType.BinaryOperator));
    } else if (src.length > 1 && src[0] == "<" && src[1] == "=") {
      src.shift();
      src.shift();
      tokens.push(token("<=", TokenType.BinaryOperator));
    } else if (src.length > 1 && src[0] == ">" && src[1] == "=") {
      src.shift();
      src.shift();
      tokens.push(token(">=", TokenType.BinaryOperator));
    } else if (src.length > 1 && src[0] == "<" && src[1] == "-") {
      src.shift();
      src.shift();
      tokens.push(token("<-", TokenType.BinaryOperator));
    } else if (src.length > 1 && src[0] == "&" && src[1] == "&") {
      src.shift();
      src.shift();
      tokens.push(token("&&", TokenType.BinaryOperator));
    } else if (src.length > 1 && src[0] == "|" && src[1] == "|") {
      src.shift();
      src.shift();
      tokens.push(token("||", TokenType.BinaryOperator));
    } else if (src.length > 1 && src[0] == "|" && src[1] == ">") {
      src.shift();
      src.shift();
      tokens.push(token("|>", TokenType.BinaryOperator));
    } else if (src.length > 1 && src[0] == "?" && src[1] == "?") {
      src.shift();
      src.shift();
      tokens.push(token("??", TokenType.BinaryOperator));
    } else if (
      src[0] == "+" || src[0] == "-" || src[0] == "*" || src[0] == "/" ||
      src[0] == "%" || src[0] == "<" || src[0] == ">" || src[0] == "!" ||
      src[0] == "?"
    ) {
      tokens.push(token(src.shift(), TokenType.BinaryOperator));
    } else if (src[0] == "=") {
      tokens.push(token(src.shift(), TokenType.Equals));
    } else if (src[0] == ";") {
      tokens.push(token(src.shift(), TokenType.Semicolon));
    } else if (src[0] == ",") {
      tokens.push(token(src.shift(), TokenType.Comma));
    } else if (src[0] == ".") {
      tokens.push(token(src.shift(), TokenType.Dot));
    } else if (src[0] == ":") {
      tokens.push(token(src.shift(), TokenType.Colon));
    } else if (src[0] == '"') {
      src.shift(); // consume opening quote
      let value = "";
      while (src.length > 0 && src[0] != '"') {
        const ch = src.shift();
        if (ch == "\\" && src.length > 0) {
          const next = src.shift();
          switch (next) {
            case '"':
              value += '"';
              break;
            case "\\":
              value += "\\";
              break;
            case "n":
              value += "\n";
              break;
            case "t":
              value += "\t";
              break;
            default:
              value += next;
          }
        } else {
          value += ch;
        }
      }

      if (src[0] != '"') {
        console.error("Unterminated string literal. Add a closing quote.");
        Deno.exit(1);
      }

      src.shift(); // consume closing quote
      tokens.push(token(value, TokenType.String));
    } else {
      // Handle multicharacter tokens
      if (isInt(src[0]) || (src[0] == "." && src.length > 1 && isInt(src[1]))) {
        let num = "";
        let hasDecimalPoint = false;

        while (src.length > 0) {
          const ch = src[0];

          if (isInt(ch)) {
            num += src.shift();
            continue;
          }

          if (ch == "." && !hasDecimalPoint) {
            if (src.length > 1 && isInt(src[1])) {
              hasDecimalPoint = true;
              num += src.shift();
              continue;
            }

            break; // treat stray dot as member access
          }

          break;
        }

        if (num.startsWith(".")) {
          num = "0" + num;
        }

        if (num.endsWith(".")) {
          console.error(
            "Invalid numeric literal: missing digits after decimal point.",
          );
          Deno.exit(1);
        }

        tokens.push(token(num, TokenType.Number));
      } else if (isIdentifierStart(src[0])) {
        let ident = "";
        while (src.length > 0 && isIdentifierPart(src[0])) {
          ident += src.shift();
        }
        // Check for reserved keywords
        const reserved = KEYWORDS[ident];
        if (typeof reserved == "number") {
          tokens.push(token(ident, reserved));
        } else {
          tokens.push(token(ident, TokenType.Identifier));
        }
      } else if (isSkippable(src[0])) {
        src.shift();
      } else {
        console.error(
          `Unrecognized character '${src[0]}' (code ${
            src[0].charCodeAt(0)
          }) encountered by lexer. Add support for this character or remove it from the source.`,
        );
        Deno.exit(1);
      }
    }
  }

  // Append a final token to mark the logical end of input.
  tokens.push({ value: "EndOfFile", type: TokenType.EOF });
  return tokens;
}
