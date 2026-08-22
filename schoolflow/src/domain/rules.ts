import type { CommunitySignal, FinanceSummary, LearnerSummary, PulseAction, Role } from "./types";

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

export function buildOperationalPulse(
  learners: LearnerSummary[],
  finance: FinanceSummary,
  signals: CommunitySignal[],
): PulseAction[] {
  const actions: PulseAction[] = [];
  if (finance.openExceptions > 0) actions.push({
    id:"finance-exceptions", category:"finance",
    title:`${finance.openExceptions} reconciliation exception${finance.openExceptions === 1 ? "" : "s"}`,
    explanation:`${finance.openExceptionValue.toLocaleString("fr-FR")} FCFA requires independent review.`,
    owner:"Accountant", dueLabel:"Review required", severity:"critical", evidenceCount:finance.openExceptions,
  });
  const atRisk = learners.filter((learner)=>learner.mastery < 60 || learner.attendance < 80);
  if (atRisk.length > 0) actions.push({
    id:"learner-risk", category:"learning",
    title:`${atRisk.length} learner${atRisk.length === 1 ? "" : "s"} need support review`,
    explanation:"Live mastery or attendance evidence is below the configured operating threshold.",
    owner:"Academic Head", dueLabel:"Assign intervention", severity:"warning", evidenceCount:atRisk.length,
  });
  const openSignals = signals.filter((signal)=>!['resolved','closed'].includes(signal.status));
  if (openSignals.length > 0) actions.push({
    id:"community-signals", category:"feedback",
    title:`${openSignals.length} community signal${openSignals.length === 1 ? "" : "s"} awaiting action`,
    explanation:"Parent, learner and staff feedback still needs ownership or follow-up.",
    owner:"Administrator", dueLabel:"Triage queue", severity:"info", evidenceCount:openSignals.length,
  });
  if (actions.length === 0) actions.push({
    id:"operating-clear", category:"operations", title:"No urgent exception detected",
    explanation:"DREEM has no unresolved finance, learner-risk or community-signal exception in the current data.",
    owner:"Leadership", dueLabel:"Continue monitoring", severity:"positive", evidenceCount:learners.length + signals.length,
  });
  return actions;
}
