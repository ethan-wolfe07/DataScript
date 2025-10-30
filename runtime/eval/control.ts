import { RuntimeVal } from "../values.ts";

export class ReturnSignal {
  constructor(public readonly value: RuntimeVal) {}
}

export class BreakSignal {}

export class ContinueSignal {}

export class RuntimeException extends Error {
  constructor(public readonly value: RuntimeVal) {
    super("Runtime exception");
  }
}
