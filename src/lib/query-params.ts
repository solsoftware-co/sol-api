// Shared parsing for optional boolean / list query params on /v1 routes.
// Each throws a typed error the route turns into a 422.

export class InvalidBooleanParamError extends Error {
  constructor(public readonly param: string) {
    super(`${param} must be "true" or "false"`);
    this.name = "InvalidBooleanParamError";
  }
}

export function parseBooleanParam(value: string | undefined, param: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InvalidBooleanParamError(param);
}
