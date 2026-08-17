"use client"
import React, { startTransition, useDeferredValue, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Cpu,
  FileStack,
  Globe,
  LayoutDashboard,
  Menu,
  Milestone,
  ShieldCheck,
  Target,
  User,
  UserPlus,
  Users2,
  WalletCards,
  X,
} from "lucide-react";

type TabId =
  | "cooperation"
  | "lex"
  | "outcome"
  | "intake"
  | "public"
  | "bible"
  | "pipeline"
  | "ledger"
  | "billing"
  | "alerts"
  | "empowerment"
  | "vault"
  | "timer";

type MenuItem = {
  id: TabId;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
};

type TabComponent = React.ComponentType<Record<string, never>>;

const TabLoadingState = () => (
  <section className="min-h-screen bg-paper-white px-6 py-8 md:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="glass rounded-[2rem] p-8">
        <div className="h-5 w-40 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-4 h-14 max-w-2xl animate-pulse rounded-[1.5rem] bg-slate-200" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-[1.5rem] bg-slate-100" />
          ))}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((item) => (
          <div key={item} className="h-80 animate-pulse rounded-[2rem] bg-white shadow-sm" />
        ))}
      </div>
    </div>
  </section>
);

const dynamicTab = (loader: () => Promise<{ default: TabComponent }>) =>
  dynamic(loader, {
    loading: () => <TabLoadingState />,
  });

const tabComponents: Record<TabId, TabComponent> = {
  cooperation: dynamicTab(() => import("@/components/CooperationHub")),
  lex: dynamicTab(() => import("@/components/LexCore")),
  outcome: dynamicTab(() => import("@/components/LitigationOutcome")),
  intake: dynamicTab(() => import("@/components/ClientIntake")),
  public: dynamicTab(() => import("@/components/LegalFirstAid")),
  bible: dynamicTab(() => import("@/components/PanAfricanLaw")),
  pipeline: dynamicTab(() => import("@/components/MatterPipeline")),
  ledger: dynamicTab(() => import("@/components/CaseLedger")),
  billing: dynamicTab(() => import("@/components/BillingPayments")),
  alerts: dynamicTab(() => import("@/components/NotificationCenter")),
  empowerment: dynamicTab(() => import("@/components/InternEmpowerment")),
  vault: dynamicTab(() => import("@/components/FileVault")),
  timer: dynamicTab(() => import("@/components/BillableTimer")),
};

const menuGroups: { title: string; items: MenuItem[] }[] = [
  {
    title: "Operate",
    items: [
      { id: "cooperation", label: "Cooperation Engine", short: "Coop", icon: Users2 },
      { id: "lex", label: "TSIDEK Command", short: "Core", icon: Cpu },
      { id: "outcome", label: "Litigation Strategy", short: "Case", icon: Target },
      { id: "pipeline", label: "Matter Pipeline", short: "Flow", icon: Milestone },
    ],
  },
  {
    title: "Grow",
    items: [
      { id: "intake", label: "Client Intake", short: "Intake", icon: UserPlus },
      { id: "public", label: "Justice Guide", short: "Guide", icon: Globe },
      { id: "ledger", label: "Case Ledger", short: "Ledger", icon: LayoutDashboard },
      { id: "billing", label: "Billing & Payments", short: "Funds", icon: WalletCards },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { id: "bible", label: "Pan-African Bible", short: "Bible", icon: BookOpen },
      { id: "alerts", label: "Sentinel Alerts", short: "Alerts", icon: Bell },
      { id: "empowerment", label: "Intern Mastery", short: "Team", icon: Award },
      { id: "vault", label: "Sovereign Vault", short: "Vault", icon: FileStack },
      { id: "timer", label: "Billable Pulse", short: "Time", icon: BriefcaseBusiness },
    ],
  },
];

const menuItems = menuGroups.flatMap((group) => group.items);
const menuById = Object.fromEntries(menuItems.map((item) => [item.id, item])) as Record<TabId, MenuItem>;

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("cooperation");
  const [mobileOpen, setMobileOpen] = useState(false);
  const deferredTab = useDeferredValue(activeTab);
  const activeItem = menuById[activeTab];
  const ActiveTabComponent = tabComponents[deferredTab];

  const onSelectTab = (tab: TabId) => {
    startTransition(() => {
      setActiveTab(tab);
      setMobileOpen(false);
    });
  };

  return (
    <div className="min-h-screen bg-paper-white text-slate-700">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[290px] border-r border-white/70 bg-[#f8f7f3]/95 px-6 py-6 backdrop-blur xl:flex xl:flex-col">
        <BrandBlock activeLabel={activeItem.label} />
        <div className="mt-8 flex-1 space-y-8 overflow-y-auto pr-1">
          {menuGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-3 px-3 text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">{group.title}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = item.id === activeTab;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectTab(item.id)}
                      className={`relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                        active
                          ? "bg-white text-heritage-green shadow-[0_12px_34px_rgba(0,54,41,0.08)]"
                          : "text-slate-500 hover:bg-white/80 hover:text-heritage-green"
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-2xl border border-heritage-green/10"
                        />
                      )}
                      <div className={`rounded-xl p-2 ${active ? "bg-heritage-green text-white" : "bg-white text-slate-400"}`}>
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div className="relative z-10">
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{item.short}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[1.75rem] bg-[#082b22] p-5 text-white shadow-[0_20px_40px_rgba(0,54,41,0.18)]">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-3">
              <ShieldCheck className="h-5 w-5 text-gold-accent" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/50">Sovereign node</p>
              <p className="mt-1 text-sm font-semibold">Firm-owned execution layer is active.</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="xl:pl-[290px]">
        <header className="sticky top-0 z-40 border-b border-white/60 bg-[#f7f6f2]/80 px-4 py-4 backdrop-blur md:px-6 xl:px-8">
          <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen((open) => !open)}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 xl:hidden"
                aria-label="Toggle navigation"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Pan-African legal operations</p>
                <h1 className="mt-1 text-lg font-semibold text-heritage-green">{activeItem.label}</h1>
              </div>
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <HeaderPill icon={Users2} label="27 practitioners" />
              <HeaderPill icon={ShieldCheck} label="93% human approval" />
              <HeaderPill icon={User} label="Role-aware routing" />
            </div>
          </div>
        </header>

        {mobileOpen && (
          <div className="border-b border-slate-200 bg-[#f7f6f2] px-4 py-4 xl:hidden">
            <div className="space-y-5">
              {menuGroups.map((group) => (
                <div key={group.title}>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">{group.title}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => onSelectTab(item.id)}
                        className={`rounded-2xl px-4 py-3 text-left ${
                          item.id === activeTab
                            ? "bg-heritage-green text-white"
                            : "bg-white text-slate-600"
                        }`}
                      >
                        <item.icon className="mb-2 h-4 w-4" />
                        <p className="text-sm font-semibold">{item.label}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <main className="mx-auto max-w-[1700px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={deferredTab}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <ActiveTabComponent />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function BrandBlock({ activeLabel }: { activeLabel: string }) {
  return (
    <div className="rounded-[2rem] border border-white/70 bg-[linear-gradient(160deg,_#083126_0%,_#0f4938_58%,_#c5a059_170%)] p-5 text-white shadow-[0_20px_44px_rgba(0,54,41,0.18)]">
      <div className="flex items-center justify-between">
        <div className="rounded-2xl bg-white/10 p-3">
          <ShieldCheck className="h-6 w-6 text-gold-accent" />
        </div>
        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em]">
          TSIDEK OS
        </span>
      </div>
      <h1 className="mt-5 text-2xl heading-serif text-white">Legal cooperation, not legal chaos.</h1>
      <p className="mt-3 text-sm leading-6 text-white/72">
        A matter room that links people, documents, deadlines, and approvals without surrendering the firm&apos;s autonomy.
      </p>
      <div className="mt-5 rounded-[1.35rem] bg-white/8 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">Focused module</p>
        <p className="mt-2 text-sm font-semibold">{activeLabel}</p>
      </div>
    </div>
  );
}

function HeaderPill({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 shadow-sm">
      <Icon className="h-3.5 w-3.5 text-heritage-green" />
      <span>{label}</span>
    </div>
  );
}
