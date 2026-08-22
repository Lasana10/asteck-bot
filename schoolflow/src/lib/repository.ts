import type { AcademicYearConfig, AssessmentCommand, AttendanceCommand, BootstrapPayload, BootstrapStatus, ClassConfig, CommunitySignal, CredentialIssueResult, EnrollmentPayload, EnrollmentResult, FinanceSummary, LearnerSummary, OperationalSummary, PaymentCommand, PaymentReceipt, SchoolBrand, SchoolSetup, StaffInvitation, SubjectConfig, TeacherSummary, TermConfig } from "../domain/types";
import { demoBrand, demoFinance, demoLearners, demoSetup, demoSignals, demoTeachers } from "../domain/demo";
import { requirePositiveAmount, routeSignal } from "../domain/rules";
import { isDemoMode, isSupabaseConfigured, supabase } from "./supabase";

export interface WorkspaceData {
  brand: SchoolBrand;
  setup: SchoolSetup;
  operations: OperationalSummary;
  learners: LearnerSummary[];
  teachers: TeacherSummary[];
  signals: CommunitySignal[];
  finance: FinanceSummary;
}

function formatInList(ids: string[]) {
  return `(${ids.map((id) => `"${id}"`).join(",")})`;
}

async function deleteRemovedSetupRows(table: "dreem_academic_years" | "dreem_terms" | "dreem_classes" | "dreem_subjects", schoolId: string, keepIds: string[]) {
  if (!supabase) return;
  if (!keepIds.length) {
    const { error } = await supabase.from(table).delete().eq("school_id", schoolId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from(table).delete().eq("school_id", schoolId).not("id", "in", formatInList(keepIds));
  if (error) throw error;
}

async function activeSchool() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const [{ data: membership, error: membershipError }, { data: userData, error: userError }] = await Promise.all([
    supabase.from("dreem_school_memberships").select("school_id").eq("status", "approved").limit(1).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (membershipError) throw membershipError;
  if (userError) throw userError;
  if (!membership || !userData.user) throw new Error("No active school membership was found.");
  return { schoolId:String(membership.school_id), userId:userData.user.id };
}

export async function loadWorkspace(): Promise<WorkspaceData> {
  if (!isSupabaseConfigured || !supabase) {
    if (isDemoMode) return { brand: demoBrand, setup: demoSetup, operations:{invitations:[],recentAttendance:0,recentAssessments:0}, learners: demoLearners, teachers: demoTeachers, signals: demoSignals, finance:demoFinance };
    throw new Error("DREEM is not connected to its Supabase project. Production data is unavailable.");
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dreem_school_memberships")
    .select("school_id")
    .eq("status", "approved")
    .limit(1);
  if (membershipError) throw membershipError;
  const membership = memberships?.[0] as Record<string, unknown> | undefined;
  if (!membership) throw new Error("Your account is not attached to an active school.");
  const schoolId = String(membership.school_id);
  const [schoolResult,brandResult] = await Promise.all([
    supabase.from("schools").select("name,slug").eq("id",schoolId).single(),
    supabase.from("dreem_school_brands").select("*").eq("school_id",schoolId).maybeSingle(),
  ]);
  if(schoolResult.error) throw schoolResult.error;
  const rawSchool=schoolResult.data;
  const rawBrand=brandResult.data;

  const [studentResult, growthResult, interventionResult, credentialResult, teacherResult, signalResult, accountResult, paymentResult, reconciliationResult, academicYearResult, termResult, classResult, subjectResult, invitationResult, attendanceResult, assessmentResult] = await Promise.all([
    supabase.from("students").select("id,matricule,full_name,class_name,attendance_rate,risk_level").eq("school_id",schoolId).is("merged_into_student_id",null).limit(100),
    supabase.from("dreem_growth_snapshots").select("*").eq("school_id",schoolId).order("snapshot_date",{ascending:false}).limit(500),
    supabase.from("dreem_interventions").select("student_id,title,owner_user_id,status,review_on").eq("school_id",schoolId).not("status","in","(closed,cancelled)").order("review_on").limit(200),
    supabase.from("dreem_student_credentials").select("student_id,status,valid_until,issued_at").eq("school_id",schoolId).order("issued_at",{ascending:false}).limit(200),
    supabase.from("dreem_teacher_growth_snapshots").select("*").eq("school_id",schoolId).order("snapshot_date",{ascending:false}).limit(200),
    supabase.from("dreem_community_signals").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(100),
    supabase.from("fee_accounts").select("amount_due").eq("school_id",schoolId),
    supabase.from("dreem_financial_payments").select("amount,received_at").eq("school_id",schoolId),
    supabase.from("dreem_reconciliation_reviews").select("variance,status,submitted_at").eq("school_id",schoolId),
    supabase.from("dreem_academic_years").select("*").eq("school_id",schoolId).order("starts_on",{ascending:false}),
    supabase.from("dreem_terms").select("*").eq("school_id",schoolId).order("order_index"),
    supabase.from("dreem_classes").select("*").eq("school_id",schoolId).order("name"),
    supabase.from("dreem_subjects").select("*").eq("school_id",schoolId).order("name"),
    supabase.from("dreem_staff_invitations").select("id,email,full_name,role,status,accepted_by,created_at,expires_at").eq("school_id",schoolId).order("created_at",{ascending:false}).limit(50),
    supabase.from("dreem_attendance_sessions").select("id").eq("school_id",schoolId).gte("session_date",new Date(Date.now()-7*86400000).toISOString().slice(0,10)),
    supabase.from("dreem_assessments").select("id").eq("school_id",schoolId).gte("assessment_date",new Date(Date.now()-30*86400000).toISOString().slice(0,10)),
  ]);
  if (studentResult.error) throw studentResult.error;
  if (growthResult.error) throw growthResult.error;
  if (interventionResult.error) throw interventionResult.error;
  if (credentialResult.error) throw credentialResult.error;
  if (teacherResult.error) throw teacherResult.error;
  if (signalResult.error) throw signalResult.error;
  if (invitationResult.error) throw invitationResult.error;
  if (attendanceResult.error) throw attendanceResult.error;
  if (assessmentResult.error) throw assessmentResult.error;
  const profileNames=new Map(
    (invitationResult.data??[])
      .filter((row)=>row.accepted_by)
      .map((row)=>[String(row.accepted_by),String(row.full_name)]),
  );
  const latestGrowth=new Map<string,Record<string,unknown>>();
  for(const row of growthResult.data??[]) if(!latestGrowth.has(String(row.student_id))) latestGrowth.set(String(row.student_id),row);
  const latestTeacher=new Map<string,Record<string,unknown>>();
  for(const row of teacherResult.data??[]) if(!latestTeacher.has(String(row.teacher_user_id))) latestTeacher.set(String(row.teacher_user_id),row);
  const interventions=new Map((interventionResult.data??[]).map(row=>[String(row.student_id),row]));
  const credentials=new Map<string,Record<string,unknown>>();
  for(const row of credentialResult.data??[]) if(!credentials.has(String(row.student_id))) credentials.set(String(row.student_id),row);
  const today=new Date().toISOString().slice(0,10);
  const todaysPayments=(paymentResult.data??[]).filter(row=>String(row.received_at).startsWith(today));
  const openExceptions=(reconciliationResult.data??[]).filter(row=>row.status==="pending"&&Number(row.variance)!==0);

  return {
    brand: {
      name:String(rawSchool.name),shortName:String(rawBrand?.short_name??rawSchool.slug?.slice(0,3).toUpperCase()??"DRM"),motto:String(rawBrand?.motto??""),address:String(rawBrand?.address_line??""),city:String(rawBrand?.city??""),
      subsystem:(rawBrand?.subsystem??"bilingual") as SchoolBrand["subsystem"],primaryColor:String(rawBrand?.primary_color??"#123b2c"),accentColor:String(rawBrand?.accent_color??"#c9df83"),
      logoUrl:rawBrand?.logo_url?String(rawBrand.logo_url):undefined,receiptPrefix:String(rawBrand?.receipt_prefix??"DRM"),studentIdPrefix:String(rawBrand?.student_id_prefix??"DRM"),timezone:String(rawBrand?.timezone??"Africa/Douala"),currency:String(rawBrand?.currency??"XAF"),
    },
    setup:{
      academicYears:(academicYearResult.data??[]).map((row):AcademicYearConfig=>({id:String(row.id),name:String(row.name),startsOn:String(row.starts_on),endsOn:String(row.ends_on),status:row.status as AcademicYearConfig["status"]})),
      terms:(termResult.data??[]).map((row):TermConfig=>({id:String(row.id),academicYearId:String(row.academic_year_id),name:String(row.name),startsOn:String(row.starts_on),endsOn:String(row.ends_on),orderIndex:Number(row.order_index)})),
      classes:(classResult.data??[]).map((row):ClassConfig=>({id:String(row.id),academicYearId:row.academic_year_id?String(row.academic_year_id):undefined,name:String(row.name),sectionName:String(row.section_name??""),streamName:String(row.stream_name??""),levelName:String(row.level_name??"")})),
      subjects:(subjectResult.data??[]).map((row):SubjectConfig=>({id:String(row.id),name:String(row.name),code:String(row.code),subsystem:row.subsystem as SubjectConfig["subsystem"],gradingWeight:Number(row.grading_weight)})),
    },
    operations:{
      invitations:(invitationResult.data??[]).map((row):StaffInvitation=>({id:String(row.id),email:String(row.email),fullName:String(row.full_name),role:row.role as StaffInvitation["role"],status:row.status as StaffInvitation["status"],createdAt:String(row.created_at),expiresAt:String(row.expires_at)})),
      recentAttendance:attendanceResult.data?.length??0,
      recentAssessments:assessmentResult.data?.length??0,
    },
    learners:(studentResult.data??[]).map(row=>{const growth=latestGrowth.get(String(row.id));const action=interventions.get(String(row.id));const credential=credentials.get(String(row.id));return {
      id:String(row.id),matricule:String(row.matricule),name:String(row.full_name),className:String(row.class_name??"Unassigned"),mastery:Number(growth?.mastery??0),attendance:Number(growth?.attendance??row.attendance_rate??0),engagement:Number(growth?.engagement??0),wellbeing:Number(growth?.wellbeing??0),trend:0,nextAction:String(action?.title??"Review learner OneFile"),interventionOwner:action?.owner_user_id?profileNames.get(String(action.owner_user_id)):undefined,idStatus:(credential?.status??"expired") as LearnerSummary["idStatus"],
    }}),
    teachers:Array.from(latestTeacher.values()).map(row=>({
      id:String(row.teacher_user_id),name:profileNames.get(String(row.teacher_user_id))??"Teacher",subject:String(row.subject_name),learnerGrowth:Number(row.learner_growth),coverage:Number(row.curriculum_coverage),mastery:Number(row.mastery),workload:row.workload as TeacherSummary["workload"],nextSupport:String(row.next_support),
    })),
    signals: (signalResult.data ?? []).map((row) => ({
      id:String(row.id),sourceRole:row.source_role as CommunitySignal["sourceRole"],sourceName:String(row.source_name),subjectType:row.subject_type as CommunitySignal["subjectType"],subjectName:String(row.subject_name),category:String(row.category),message:String(row.message),severity:row.severity as CommunitySignal["severity"],status:row.status as CommunitySignal["status"],assignedRole:row.assigned_role as CommunitySignal["assignedRole"],createdAt:String(row.created_at),
    })),
    finance:{expectedToday:(accountResult.data??[]).reduce((sum,row)=>sum+Number(row.amount_due),0),collectedToday:todaysPayments.reduce((sum,row)=>sum+Number(row.amount),0),reconciledToday:todaysPayments.reduce((sum,row)=>sum+Number(row.amount),0)-openExceptions.reduce((sum,row)=>sum+Math.abs(Number(row.variance)),0),openExceptions:openExceptions.length,openExceptionValue:openExceptions.reduce((sum,row)=>sum+Math.abs(Number(row.variance)),0),nextDeposit:0},
  };
}

export async function createSignal(input: Omit<CommunitySignal, "id" | "status" | "assignedRole" | "createdAt">): Promise<CommunitySignal> {
  const assignedRole = routeSignal(input.category);
  if (!isSupabaseConfigured || !supabase) {
    return { ...input, id:crypto.randomUUID(), status:"new", assignedRole, createdAt:new Date().toISOString() };
  }
  const { data: memberships, error: membershipError } = await supabase.from("dreem_school_memberships").select("school_id").eq("status", "approved").limit(1);
  if (membershipError || !memberships?.[0]) throw membershipError ?? new Error("No active school membership.");
  const { data, error } = await supabase.from("dreem_community_signals").insert({ ...input, school_id:memberships[0].school_id, assigned_role:assignedRole }).select().single();
  if (error) throw error;
  return { id:String(data.id),sourceRole:data.source_role,sourceName:data.source_name,subjectType:data.subject_type,subjectName:data.subject_name,category:data.category,message:data.message,severity:data.severity,status:data.status,assignedRole:data.assigned_role,createdAt:data.created_at } as CommunitySignal;
}

export async function saveSchoolBrand(brand: SchoolBrand): Promise<SchoolBrand> {
  if (!isSupabaseConfigured || !supabase) return brand;
  const { schoolId } = await activeSchool();
  const { error } = await supabase.from("dreem_school_brands").upsert({
    school_id:schoolId, short_name:brand.shortName, motto:brand.motto, city:brand.city,
    subsystem:brand.subsystem, primary_color:brand.primaryColor, accent_color:brand.accentColor,
    logo_url:brand.logoUrl ?? null, receipt_prefix:brand.receiptPrefix, student_id_prefix:brand.studentIdPrefix,
    address_line:brand.address, timezone:brand.timezone, currency:brand.currency,
    updated_at:new Date().toISOString(),
  }, { onConflict:"school_id" });
  if (error) throw error;
  return brand;
}

export async function inviteStaff(input: { email: string; fullName: string; role: StaffInvitation["role"]; idempotencyKey: string }) {
  if (!input.email.trim()) throw new Error("Staff email is required.");
  if (!input.fullName.trim()) throw new Error("Staff name is required.");
  if (!isSupabaseConfigured || !supabase) return { invitationId: crypto.randomUUID(), status: "pending" };
  const { data, error } = await supabase.rpc("dreem_invite_staff", {
    p_email: input.email.trim(),
    p_full_name: input.fullName.trim(),
    p_role: input.role,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const invitation = Array.isArray(data) ? data[0] : data;
  return { invitationId:String(invitation.invitation_id), status:String(invitation.invitation_status) };
}

export async function enrolLearner(input: EnrollmentPayload): Promise<EnrollmentResult> {
  if (!input.fullName.trim()) throw new Error("Learner name is required.");
  if (!input.className.trim()) throw new Error("Class is required.");
  if (!input.guardianName.trim()) throw new Error("Primary guardian is required.");
  if (input.openingBalance < 0) throw new Error("Opening balance cannot be negative.");
  if (!isSupabaseConfigured || !supabase) return { studentId:crypto.randomUUID(), matricule:`DEMO-${Date.now()}` };
  const { data, error } = await supabase.rpc("dreem_enrol_learner", {
    p_full_name: input.fullName.trim(),
    p_class_name: input.className.trim(),
    p_date_of_birth: input.dateOfBirth || null,
    p_sex: input.sex || null,
    p_guardian_name: input.guardianName.trim(),
    p_guardian_phone: input.guardianPhone.trim(),
    p_guardian_email: input.guardianEmail?.trim() || null,
    p_relationship: input.relationship.trim(),
    p_opening_balance: input.openingBalance,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const learner = Array.isArray(data) ? data[0] : data;
  return { studentId:String(learner.student_id), matricule:String(learner.matricule) };
}

export async function issueStudentCredential(studentId: string, validUntil: string, idempotencyKey: string): Promise<CredentialIssueResult> {
  if (!studentId) throw new Error("Choose a learner before issuing a credential.");
  if (!validUntil) throw new Error("Credential expiry is required.");
  if (!isSupabaseConfigured || !supabase) return { credentialId:crypto.randomUUID(), verificationToken:`demo-${crypto.randomUUID()}` };
  const { data, error } = await supabase.rpc("dreem_issue_student_credential", {
    p_student_id: studentId,
    p_valid_until: validUntil,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  const credential = Array.isArray(data) ? data[0] : data;
  return { credentialId:String(credential.credential_id), verificationToken:String(credential.verification_token) };
}

export async function recordAttendance(command: AttendanceCommand) {
  if (!command.className.trim()) throw new Error("Class is required.");
  if (!command.sessionDate) throw new Error("Attendance date is required.");
  if (!command.marks.length) throw new Error("At least one learner mark is required.");
  if (!isSupabaseConfigured || !supabase) return { sessionId:crypto.randomUUID(), recordedCount:command.marks.length };
  const { data, error } = await supabase.rpc("dreem_record_attendance", {
    p_class_name: command.className.trim(),
    p_session_date: command.sessionDate,
    p_period_label: command.periodLabel || "AM",
    p_marks: command.marks.map((mark) => ({ student_id:mark.studentId, status:mark.status, note:mark.note ?? "" })),
    p_idempotency_key: command.idempotencyKey,
  });
  if (error) throw error;
  const session = Array.isArray(data) ? data[0] : data;
  return { sessionId:String(session.session_id), recordedCount:Number(session.recorded_count) };
}

export async function recordAssessment(command: AssessmentCommand) {
  if (!command.className.trim()) throw new Error("Class is required.");
  if (!command.title.trim()) throw new Error("Assessment title is required.");
  if (command.maxScore <= 0) throw new Error("Maximum score must be positive.");
  if (!command.assessmentDate) throw new Error("Assessment date is required.");
  if (!command.marks.length) throw new Error("At least one mark is required.");
  if (command.marks.some((mark) => mark.score < 0 || mark.score > command.maxScore)) throw new Error("Every score must be between zero and the maximum score.");
  if (!isSupabaseConfigured || !supabase) return { assessmentId:crypto.randomUUID(), marksCount:command.marks.length };
  const { data, error } = await supabase.rpc("dreem_record_assessment", {
    p_subject_id: command.subjectId || null,
    p_class_name: command.className.trim(),
    p_title: command.title.trim(),
    p_max_score: command.maxScore,
    p_assessment_date: command.assessmentDate,
    p_marks: command.marks.map((mark) => ({ student_id:mark.studentId, score:mark.score, comment:mark.comment ?? "" })),
    p_idempotency_key: command.idempotencyKey,
  });
  if (error) throw error;
  const assessment = Array.isArray(data) ? data[0] : data;
  return { assessmentId:String(assessment.assessment_id), marksCount:Number(assessment.marks_count) };
}

export async function loadBootstrapStatus(): Promise<BootstrapStatus> {
  if (!isSupabaseConfigured || !supabase) return { mode: "ready", canBootstrap: true };
  const { data, error } = await supabase.rpc("dreem_bootstrap_status");
  if (error) throw error;
  return {
    mode: (data?.mode ?? "restricted") as BootstrapStatus["mode"],
    canBootstrap: Boolean(data?.canBootstrap),
    schoolId: data?.schoolId ? String(data.schoolId) : undefined,
    role: data?.role ? String(data.role) : undefined,
    status: data?.status ? String(data.status) : undefined,
  };
}

export async function bootstrapSchool(input: BootstrapPayload) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("dreem_bootstrap_school", {
    p_school_name: input.schoolName,
    p_school_slug: input.schoolSlug,
    p_short_name: input.shortName,
    p_motto: input.motto,
    p_city: input.city,
    p_subsystem: input.subsystem,
    p_receipt_prefix: input.receiptPrefix,
    p_student_id_prefix: input.studentIdPrefix,
    p_primary_color: input.primaryColor,
    p_accent_color: input.accentColor,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function saveSchoolSetup(setup: SchoolSetup): Promise<SchoolSetup> {
  if (!isSupabaseConfigured || !supabase) return setup;
  const { schoolId } = await activeSchool();
  const academicYears = setup.academicYears.filter((year) => year.name.trim() && year.startsOn && year.endsOn);
  const academicYearIds = new Set(academicYears.map((year) => year.id));
  const terms = setup.terms.filter((term) => term.name.trim() && term.startsOn && term.endsOn && academicYearIds.has(term.academicYearId));
  const classes = setup.classes.filter((entry) => entry.name.trim());
  const subjects = setup.subjects.filter((subject) => subject.name.trim() && subject.code.trim() && Number.isFinite(subject.gradingWeight) && subject.gradingWeight > 0);
  const sanitized: SchoolSetup = {
    academicYears,
    terms,
    classes,
    subjects,
  };
  const academicYearsPayload = sanitized.academicYears.map((year) => ({
    id: year.id,
    school_id: schoolId,
    name: year.name,
    starts_on: year.startsOn,
    ends_on: year.endsOn,
    status: year.status,
    updated_at: new Date().toISOString(),
  }));
  const termsPayload = sanitized.terms.map((term) => ({
    id: term.id,
    school_id: schoolId,
    academic_year_id: term.academicYearId,
    name: term.name,
    starts_on: term.startsOn,
    ends_on: term.endsOn,
    order_index: term.orderIndex,
    updated_at: new Date().toISOString(),
  }));
  const classesPayload = sanitized.classes.map((entry) => ({
    id: entry.id,
    school_id: schoolId,
    academic_year_id: entry.academicYearId ?? null,
    name: entry.name,
    section_name: entry.sectionName,
    stream_name: entry.streamName,
    level_name: entry.levelName,
    updated_at: new Date().toISOString(),
  }));
  const subjectsPayload = sanitized.subjects.map((subject) => ({
    id: subject.id,
    school_id: schoolId,
    name: subject.name,
    code: subject.code,
    subsystem: subject.subsystem,
    grading_weight: subject.gradingWeight,
    updated_at: new Date().toISOString(),
  }));
  const [yearsResult, termsResult, classesResult, subjectsResult] = await Promise.all([
    academicYearsPayload.length ? supabase.from("dreem_academic_years").upsert(academicYearsPayload) : Promise.resolve({ error: null }),
    termsPayload.length ? supabase.from("dreem_terms").upsert(termsPayload) : Promise.resolve({ error: null }),
    classesPayload.length ? supabase.from("dreem_classes").upsert(classesPayload) : Promise.resolve({ error: null }),
    subjectsPayload.length ? supabase.from("dreem_subjects").upsert(subjectsPayload) : Promise.resolve({ error: null }),
  ]);
  for (const result of [yearsResult, termsResult, classesResult, subjectsResult]) {
    if (result.error) throw result.error;
  }
  await deleteRemovedSetupRows("dreem_subjects", schoolId, sanitized.subjects.map((subject) => subject.id));
  await deleteRemovedSetupRows("dreem_classes", schoolId, sanitized.classes.map((entry) => entry.id));
  await deleteRemovedSetupRows("dreem_terms", schoolId, sanitized.terms.map((term) => term.id));
  await deleteRemovedSetupRows("dreem_academic_years", schoolId, sanitized.academicYears.map((year) => year.id));
  return sanitized;
}

export async function openCashierSession(openingFloat: number) {
  if (!isSupabaseConfigured || !supabase) return { id:crypto.randomUUID(), status:"open" as const };
  const { schoolId, userId } = await activeSchool();
  const { data: existing, error: readError } = await supabase.from("dreem_cashier_sessions")
    .select("id,status").eq("school_id",schoolId).eq("cashier_user_id",userId).eq("status","open").maybeSingle();
  if (readError) throw readError;
  if (existing) return { id:String(existing.id), status:"open" as const };
  const { data, error } = await supabase.from("dreem_cashier_sessions")
    .insert({ school_id:schoolId, cashier_user_id:userId, opening_float:openingFloat }).select("id,status").single();
  if (error) throw error;
  return { id:String(data.id), status:"open" as const };
}

export async function recordPayment(command: PaymentCommand): Promise<PaymentReceipt> {
  const amount = requirePositiveAmount(command.amount);
  if (!command.studentId) throw new Error("Choose a learner before recording payment.");
  if (!command.payerName.trim()) throw new Error("Payer name is required.");
  if (!command.idempotencyKey.trim()) throw new Error("Idempotency key is required.");
  if (!isSupabaseConfigured || !supabase) {
    return { paymentId: crypto.randomUUID(), receiptNumber: `DEMO-${new Date().toISOString().slice(0,10).replaceAll("-","")}` };
  }
  const { data, error } = await supabase.rpc("dreem_record_payment", {
    p_student_id: command.studentId,
    p_fee_account_id: command.feeAccountId ?? null,
    p_cashier_session_id: command.cashierSessionId ?? null,
    p_method: command.method,
    p_amount: amount,
    p_external_reference: command.externalReference ?? null,
    p_idempotency_key: command.idempotencyKey,
    p_payer_name: command.payerName.trim(),
  });
  if (error) throw error;
  const receipt = Array.isArray(data) ? data[0] : data;
  if (!receipt) throw new Error("Payment command did not return a receipt.");
  return { paymentId:String(receipt.payment_id), receiptNumber:String(receipt.receipt_number) };
}

export async function updateSignalStatus(signalId: string, status: CommunitySignal["status"]) {
  if (!isSupabaseConfigured || !supabase) return status;
  const { schoolId, userId } = await activeSchool();
  const { data: signal, error: readError } = await supabase.from("dreem_community_signals")
    .select("status").eq("id",signalId).eq("school_id",schoolId).single();
  if (readError) throw readError;
  const { error } = await supabase.from("dreem_community_signals").update({ status }).eq("id",signalId).eq("school_id",schoolId);
  if (error) throw error;
  const { error:eventError } = await supabase.from("dreem_signal_events").insert({
    school_id:schoolId, signal_id:signalId, event_type:"status_changed", from_status:signal.status,
    to_status:status, actor_user_id:userId,
  });
  if (eventError) throw eventError;
  return status;
}
