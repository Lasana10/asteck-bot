import { describe, expect, it } from "vitest";
import { canApproveClosure, cashVariance, requirePositiveAmount, routeSignal } from "./rules";

describe("operational controls", () => {
  it("routes safeguarding directly to the principal", () => expect(routeSignal("Safeguarding")).toBe("principal"));
  it("routes finance to the accountant", () => expect(routeSignal("Finance")).toBe("accountant"));
  it("calculates the unreconciled amount", () => expect(cashVariance(1_310_000, 1_276_000)).toBe(34_000));
  it("prevents a cashier from approving their own closure", () => expect(canApproveClosure("user-a", "user-a", ["accountant"])).toBe(false));
  it("requires an independent authorized reviewer", () => {
    expect(canApproveClosure("user-a", "user-b", ["teacher"])).toBe(false);
    expect(canApproveClosure("user-a", "user-b", ["accountant"])).toBe(true);
  });
  it("rejects invalid payment amounts before reaching the backend", () => {
    expect(() => requirePositiveAmount(0)).toThrow("positive");
    expect(() => requirePositiveAmount(Number.NaN)).toThrow("positive");
    expect(requirePositiveAmount(25_000.555)).toBe(25_000.56);
  });
});
