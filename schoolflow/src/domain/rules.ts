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

export function requirePositiveAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number.");
  return Math.round(amount * 100) / 100;
}

export function createIdempotencyKey(scope: string): string {
  return `${scope}:${crypto.randomUUID()}`;
}

export function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function derivePrefix(value: string, fallback: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned.slice(0, 4) || fallback).toUpperCase();
}
