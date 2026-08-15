export type Role =
  | "platform_founder"
  | "school_owner"
  | "principal"
  | "administrator"
  | "academic_head"
  | "bursar"
  | "accountant"
  | "teacher"
  | "tutor"
  | "parent"
  | "student"
  | "auditor";

export type SignalSeverity = "normal" | "important" | "urgent" | "safeguarding";
export type SignalStatus = "new" | "triaged" | "assigned" | "in_progress" | "resolved" | "closed";

export interface SchoolBrand {
  name: string;
  shortName: string;
  motto: string;
  city: string;
  subsystem: "anglophone" | "francophone" | "bilingual";
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
  receiptPrefix: string;
  studentIdPrefix: string;
}

export interface LearnerSummary {
  id: string;
  matricule: string;
  name: string;
  className: string;
  photoUrl?: string;
  mastery: number;
  attendance: number;
  engagement: number;
  wellbeing: number;
  trend: number;
  nextAction: string;
  interventionOwner?: string;
  idStatus: "active" | "expired" | "revoked";
}

export interface TeacherSummary {
  id: string;
  name: string;
  subject: string;
  learnerGrowth: number;
  coverage: number;
  mastery: number;
  workload: "balanced" | "high" | "critical";
  nextSupport: string;
}

export interface FinanceSummary {
  expectedToday: number;
  collectedToday: number;
  reconciledToday: number;
  openExceptions: number;
  openExceptionValue: number;
  nextDeposit: number;
}

export type PaymentMethod = "cash" | "momo" | "bank_transfer" | "card" | "cheque";

export interface PaymentCommand {
  studentId: string;
  feeAccountId?: string;
  cashierSessionId?: string;
  method: PaymentMethod;
  amount: number;
  externalReference?: string;
  idempotencyKey: string;
  payerName: string;
}

export interface PaymentReceipt {
  paymentId: string;
  receiptNumber: string;
}

export interface CommunitySignal {
  id: string;
  sourceRole: "parent" | "student" | "teacher" | "staff";
  sourceName: string;
  subjectType: "student" | "teacher" | "school" | "service";
  subjectName: string;
  category: string;
  message: string;
  severity: SignalSeverity;
  status: SignalStatus;
  assignedRole: Role;
  createdAt: string;
}

export interface PulseAction {
  id: string;
  category: "finance" | "learning" | "attendance" | "feedback" | "operations";
  title: string;
  explanation: string;
  owner: string;
  dueLabel: string;
  severity: "positive" | "info" | "warning" | "critical";
  evidenceCount: number;
}
