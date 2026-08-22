import { describe, expect, it } from "vitest";
import { buildOperationalPulse, canApproveClosure, cashVariance, derivePrefix, normalizeSlug, requirePositiveAmount, routeSignal } from "./rules";

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
  it("normalizes school slugs consistently", () => {
    expect(normalizeSlug(" La Boussole Bilingual Academy ")).toBe("la-boussole-bilingual-academy");
  });
  it("derives compact prefixes for receipts and student ids", () => {
    expect(derivePrefix("La Boussole", "DRM")).toBe("LABO");
    expect(derivePrefix(" ", "DRM")).toBe("DRM");
  });
});

describe("operational pulse", () => {
  it("derives leadership actions from live evidence", () => {
    const pulse = buildOperationalPulse(
      [{ id:"learner-1",matricule:"DRM-001",name:"Test Learner",className:"Form 1",mastery:55,attendance:70,engagement:60,wellbeing:80,trend:0,nextAction:"Review",idStatus:"active" }],
      { expectedToday:1000,collectedToday:900,reconciledToday:800,openExceptions:1,openExceptionValue:100,nextDeposit:0 },
      [],
    );
    expect(pulse.map((item)=>item.category)).toEqual(["finance","learning"]);
  });

  it("reports a clear operating state when there are no exceptions", () => {
    const pulse = buildOperationalPulse([], { expectedToday:0,collectedToday:0,reconciledToday:0,openExceptions:0,openExceptionValue:0,nextDeposit:0 }, []);
    expect(pulse).toHaveLength(1);
    expect(pulse[0].severity).toBe("positive");
  });
});
