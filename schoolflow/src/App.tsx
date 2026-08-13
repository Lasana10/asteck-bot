import { useEffect, useState } from "react";
import AuthGate from "./components/AuthGate";
import FeedbackDialog from "./components/FeedbackDialog";
import Shell, { type ViewKey } from "./components/Shell";
import { CommandView, FinanceView, LearnersView, SchoolStudioView, SignalsView, TeachersView } from "./components/Views";
import { demoPulse } from "./domain/demo";
import type { CommunitySignal } from "./domain/types";
import { loadWorkspace, saveSchoolBrand, updateSignalStatus, type WorkspaceData } from "./lib/repository";

function WorkspaceApp() {
  const [view, setView] = useState<ViewKey>("command");
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    let active = true;
    loadWorkspace().then((data) => active && setWorkspace(data)).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "The school workspace could not be loaded.");
    });
    return () => { active = false; };
  }, []);

  if (error) return <div className="auth-screen"><div className="auth-card"><strong>DREEM</strong><h1>Workspace unavailable</h1><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></div></div>;
  if (!workspace) return <div className="auth-screen"><div className="auth-card"><strong>DREEM</strong><p>Preparing the school operating picture…</p></div></div>;

  const addSignal = (signal: CommunitySignal) => setWorkspace((current) => current ? { ...current, signals: [signal, ...current.signals] } : current);
  const saveBrand = async (brand: WorkspaceData["brand"]) => {
    const saved = await saveSchoolBrand(brand);
    setWorkspace((current) => current ? { ...current, brand:saved } : current);
  };
  const moveSignal = async (signalId: string, status: CommunitySignal["status"]) => {
    await updateSignalStatus(signalId,status);
    setWorkspace((current) => current ? { ...current, signals:current.signals.map(item=>item.id===signalId?{...item,status}:item) } : current);
  };
  const openFeedback = () => setFeedbackOpen(true);

  return <>
    <Shell brand={workspace.brand} view={view} onView={setView} signalCount={workspace.signals.filter((item) => item.status === "new").length} onFeedback={openFeedback}>
      {view === "command" && <CommandView learners={workspace.learners} finance={workspace.finance} pulse={demoPulse} signals={workspace.signals} />}
      {view === "learners" && <LearnersView learners={workspace.learners} brand={workspace.brand} />}
      {view === "teachers" && <TeachersView teachers={workspace.teachers} />}
      {view === "finance" && <FinanceView finance={workspace.finance} />}
      {view === "signals" && <SignalsView signals={workspace.signals} onFeedback={openFeedback} onStatus={moveSignal} />}
      {view === "studio" && <SchoolStudioView brand={workspace.brand} onSave={saveBrand} />}
    </Shell>
    <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} onCreated={addSignal} />
  </>;
}

export default function App() { return <AuthGate><WorkspaceApp /></AuthGate>; }
