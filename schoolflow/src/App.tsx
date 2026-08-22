import { useEffect, useState } from "react";
import AuthGate from "./components/AuthGate";
import BootstrapView from "./components/BootstrapView";
import FeedbackDialog from "./components/FeedbackDialog";
import OperationalWorkflowsView from "./components/OperationalWorkflows";
import Shell, { type ViewKey } from "./components/Shell";
import { CommandView, FinanceView, LearnersView, SchoolStudioView, SignalsView, TeachersView } from "./components/Views";
import type { BootstrapStatus, CommunitySignal, Role } from "./domain/types";
import { buildOperationalPulse } from "./domain/rules";
import { bootstrapSchool, enrolLearner, inviteStaff, issueStudentCredential, loadBootstrapStatus, loadWorkspace, recordAssessment, recordAttendance, saveSchoolBrand, saveSchoolSetup, updateAccessStatus, updateSignalStatus, type WorkspaceData } from "./lib/repository";

const defaultViewByRole: Record<Role, ViewKey> = {
  platform_founder:"command",school_owner:"command",principal:"command",administrator:"command",academic_head:"command",
  bursar:"finance",accountant:"finance",teacher:"operations",tutor:"learners",parent:"learners",student:"learners",auditor:"command",
};

function WorkspaceApp() {
  const [view, setView] = useState<ViewKey>("command");
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      try{
        const data = await loadWorkspace();
        if (active) { setWorkspace(data); setView(defaultViewByRole[data.viewer.role]); setBootstrap(null); setError(""); }
      }catch(reason){
        const message = reason instanceof Error ? reason.message : "The school workspace could not be loaded.";
        if (/active school membership|attached to an active school/i.test(message)) {
          try{
            const bootstrapState = await loadBootstrapStatus();
            if (active) { setBootstrap(bootstrapState); setError(""); }
            return;
          }catch(innerReason){
            if (active) setError(innerReason instanceof Error ? innerReason.message : message);
            return;
          }
        }
        if (active) setError(message);
      }
    }
    hydrate();
    return () => { active = false; };
  }, []);

  if (error) return <div className="auth-screen"><div className="auth-card"><strong>DREEM</strong><h1>Workspace unavailable</h1><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></div></div>;
  if (bootstrap) return <BootstrapView status={bootstrap} onBootstrap={async(payload)=>{await bootstrapSchool(payload);const data=await loadWorkspace();setWorkspace(data);setBootstrap(null);}} />;
  if (!workspace) return <div className="auth-screen"><div className="auth-card"><strong>DREEM</strong><p>Preparing the school operating picture…</p></div></div>;

  const addSignal = (signal: CommunitySignal) => setWorkspace((current) => current ? { ...current, signals: [signal, ...current.signals] } : current);
  const saveBrand = async (brand: WorkspaceData["brand"]) => {
    const saved = await saveSchoolBrand(brand);
    setWorkspace((current) => current ? { ...current, brand:saved } : current);
  };
  const saveSetup = async (setup: WorkspaceData["setup"]) => {
    const saved = await saveSchoolSetup(setup);
    setWorkspace((current) => current ? { ...current, setup:saved } : current);
  };
  const refreshWorkspace = async () => setWorkspace(await loadWorkspace());
  const moveSignal = async (signalId: string, status: CommunitySignal["status"]) => {
    await updateSignalStatus(signalId,status);
    setWorkspace((current) => current ? { ...current, signals:current.signals.map(item=>item.id===signalId?{...item,status}:item) } : current);
  };
  const openFeedback = () => setFeedbackOpen(true);

  return <>
    <Shell brand={workspace.brand} viewer={workspace.viewer} view={view} onView={setView} signalCount={workspace.signals.filter((item) => item.status === "new").length} onFeedback={openFeedback}>
      {view === "command" && <CommandView learners={workspace.learners} finance={workspace.finance} pulse={buildOperationalPulse(workspace.learners,workspace.finance,workspace.signals)} signals={workspace.signals} />}
      {view === "operations" && <OperationalWorkflowsView workspace={workspace} onInviteStaff={inviteStaff} onUpdateAccess={updateAccessStatus} onEnrolLearner={enrolLearner} onIssueCredential={issueStudentCredential} onRecordAttendance={recordAttendance} onRecordAssessment={recordAssessment} onRefresh={refreshWorkspace} />}
      {view === "learners" && <LearnersView learners={workspace.learners} brand={workspace.brand} />}
      {view === "teachers" && <TeachersView teachers={workspace.teachers} />}
      {view === "finance" && <FinanceView finance={workspace.finance} />}
      {view === "signals" && <SignalsView signals={workspace.signals} onFeedback={openFeedback} onStatus={moveSignal} />}
      {view === "studio" && <SchoolStudioView brand={workspace.brand} setup={workspace.setup} onSave={saveBrand} onSaveSetup={saveSetup} />}
    </Shell>
    <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} onCreated={addSignal} />
  </>;
}

export default function App() { return <AuthGate><WorkspaceApp /></AuthGate>; }
