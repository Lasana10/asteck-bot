import type { CommunitySignal, FinanceSummary, LearnerSummary, PulseAction, SchoolBrand, TeacherSummary } from "./types";

export const demoBrand: SchoolBrand = {
  name: "La Boussole Bilingual Academy",
  shortName: "LB",
  motto: "Knowledge · Character · Service",
  address: "Carrefour Bastos, Yaounde",
  city: "Yaoundé",
  subsystem: "bilingual",
  primaryColor: "#123b2c",
  accentColor: "#c9df83",
  receiptPrefix: "LBA",
  studentIdPrefix: "LBA-26",
  timezone: "Africa/Douala",
  currency: "XAF",
};

export const demoLearners: LearnerSummary[] = [
  { id:"1",matricule:"LBA-26-1042",name:"Amara Mbeki",className:"Form 4A",mastery:82,attendance:94,engagement:88,wellbeing:84,trend:7,nextAction:"Pattern reasoning intervention",interventionOwner:"Mme Ngozi",idStatus:"active" },
  { id:"2",matricule:"LBA-26-1061",name:"Jean-Pierre Manga",className:"3ème B",mastery:61,attendance:89,engagement:66,wellbeing:78,trend:-4,nextAction:"Bilingual mathematics support",interventionOwner:"M. Nkom",idStatus:"active" },
  { id:"3",matricule:"LBA-26-1078",name:"Grace Akono",className:"Form 4A",mastery:91,attendance:97,engagement:92,wellbeing:91,trend:3,nextAction:"Advanced problem-solving pathway",idStatus:"active" },
  { id:"4",matricule:"LBA-26-1090",name:"Boris Tabi",className:"Form 3B",mastery:54,attendance:72,engagement:69,wellbeing:71,trend:1,nextAction:"Attendance recovery plan",interventionOwner:"Form teacher",idStatus:"active" },
];

export const demoTeachers: TeacherSummary[] = [
  {id:"t1",name:"Mme Ngozi",subject:"Mathematics",learnerGrowth:14,coverage:72,mastery:69,workload:"balanced",nextSupport:"Publish visual pattern method"},
  {id:"t2",name:"M. Nkom",subject:"Français",learnerGrowth:9,coverage:68,mastery:73,workload:"balanced",nextSupport:"Share reading intervention"},
  {id:"t3",name:"Mr Tabi",subject:"Physics",learnerGrowth:3,coverage:81,mastery:58,workload:"high",nextSupport:"Coaching and load review"},
];

export const demoFinance: FinanceSummary = { expectedToday:1480000,collectedToday:1310000,reconciledToday:1276000,openExceptions:2,openExceptionValue:25000,nextDeposit:875000 };

export const demoSignals: CommunitySignal[] = [
  {id:"s1",sourceRole:"parent",sourceName:"Mme Akono",subjectType:"student",subjectName:"Grace Akono",category:"Recognition",message:"Grace now explains her mathematics work confidently at home. Please continue the visual exercises.",severity:"normal",status:"new",assignedRole:"academic_head",createdAt:new Date().toISOString()},
  {id:"s2",sourceRole:"teacher",sourceName:"Mme Ngozi",subjectType:"student",subjectName:"Jean-Pierre Manga",category:"Learning support",message:"He understands examples orally but struggles when the question is written in English. Bilingual support may unlock progress.",severity:"important",status:"assigned",assignedRole:"academic_head",createdAt:new Date(Date.now()-86400000).toISOString()},
];

export const demoPulse: PulseAction[] = [
  {id:"p1",category:"finance",title:"Cash closure variance · 12,500 FCFA",explanation:"Expected 487,500 · physically counted 475,000 · explanation attached",owner:"Accountant",dueLabel:"Today · 11:00",severity:"warning",evidenceCount:24},
  {id:"p2",category:"learning",title:"Form 3B is outpacing verified mastery",explanation:"81% curriculum coverage versus 58% mastery across three assessments",owner:"Academic Head",dueLabel:"Review today",severity:"critical",evidenceCount:19},
  {id:"p3",category:"feedback",title:"Bilingual support could unlock Jean-Pierre",explanation:"Teacher evidence links the difficulty to English question wording, not mathematics",owner:"Mme Ngozi",dueLabel:"Plan by Friday",severity:"info",evidenceCount:6},
  {id:"p4",category:"learning",title:"Amara's intervention produced +18%",explanation:"Visual pattern method succeeded and can be saved to her OneFile and the teaching playbook",owner:"Class teacher",dueLabel:"Ready to close",severity:"positive",evidenceCount:4},
];

export const demoSetup = {
  academicYears: [{ id: "ay-1", name: "2026 / 2027", startsOn: "2026-09-01", endsOn: "2027-07-31", status: "active" as const }],
  terms: [
    { id: "term-1", academicYearId: "ay-1", name: "Term 1", startsOn: "2026-09-01", endsOn: "2026-12-18", orderIndex: 1 },
    { id: "term-2", academicYearId: "ay-1", name: "Term 2", startsOn: "2027-01-04", endsOn: "2027-03-31", orderIndex: 2 },
    { id: "term-3", academicYearId: "ay-1", name: "Term 3", startsOn: "2027-04-12", endsOn: "2027-07-31", orderIndex: 3 },
  ],
  classes: [
    { id: "class-1", academicYearId: "ay-1", name: "Form 4A", sectionName: "Secondary", streamName: "A", levelName: "Form 4" },
    { id: "class-2", academicYearId: "ay-1", name: "3eme B", sectionName: "Secondaire", streamName: "B", levelName: "3eme" },
  ],
  subjects: [
    { id: "sub-1", name: "Mathematics", code: "MATH", subsystem: "bilingual" as const, gradingWeight: 100 },
    { id: "sub-2", name: "Francais", code: "FR", subsystem: "francophone" as const, gradingWeight: 100 },
    { id: "sub-3", name: "English Language", code: "ENG", subsystem: "anglophone" as const, gradingWeight: 100 },
  ],
};
