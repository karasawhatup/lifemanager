declare module "node:test" {
  function test(name: string, fn: () => void | Promise<void>): void;
  export default test;
}

declare module "node:assert/strict" {
  function equal(actual: unknown, expected: unknown, message?: string): void;
  function ok(value: unknown, message?: string): void;
  function match(value: string, regexp: RegExp, message?: string): void;
  function doesNotMatch(value: string, regexp: RegExp, message?: string): void;
  export default { equal, ok, match, doesNotMatch };
}

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function existsSync(path: string): boolean;
}
