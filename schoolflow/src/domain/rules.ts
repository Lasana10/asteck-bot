import type { Role } from "./types";

export function routeSignal(category: string): Role {
  if (category === "Finance") return "accountant";
  if (category === "Safeguarding") return "principal";
  if (category === "Teaching" || category === "Learning support") return "academic_head";
  return "administrator";
}

export function cashVariance(collected: number, reconciled: number): number {
  if (!Number.isFinite(collected) || !Number.isFinite(reconciled)) throw new Error("Amounts must be finite numbers.");
  return Math.round((collected - reconciled) * 100) / 100;
}

export function canApproveClosure(submittedBy: string, reviewedBy: string, roles: Role[]): boolean {
  return submittedBy !== reviewedBy && roles.some((role) => role === "accountant" || role === "principal" || role === "school_owner");
}
