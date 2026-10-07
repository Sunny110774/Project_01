"use client";

import {
  Activity,
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Filter,
  Inbox,
  LifeBuoy,
  Mail,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { AlertItem, demoAlerts, Priority, prioritySlaMinutes } from "@/lib/demo-alerts";
import { getEasternBusinessDay, getEasternDateKey } from "@/lib/business-day";

type View = "Overview" | "Alerts" | "Backlog" | "Knowledge";
type ChatMessage = { role: "user" | "assistant"; content: string };
type KnowledgeResult = { source: string; title: string; url?: string; excerpt: string };
type OperationLog = { action: string; actor: string | null; createdAt: string; details: unknown; alert: { reference: string; subject: string } };

const priorityFilters: Array<"All" | Priority> = ["All", "P1", "P2", "P3", "P4"];
const shortName = (name: string) => name === "Unassigned" ? "Unassigned" : name.split(" ").map((part) => part[0]).join("");
const easternDateKey = (date: Date) => getEasternDateKey(date);

function alertCreatedAt(alert: AlertItem, now: Date) {
  return alert.createdAt ? new Date(alert.createdAt) : new Date(now.getTime() - alert.ageMinutes * 60_000);
}

function timeRemaining(alert: AlertItem) {
  if (alert.status === "Resolved") return "Closed";
  const remaining = alert.slaMinutes - alert.ageMinutes;
  if (remaining <= 0) return `${Math.abs(remaining)}m overdue`;
  if (remaining < 60) return `${remaining}m left`;
  return `${Math.floor(remaining / 60)}h ${remaining % 60}m left`;
}

export default function Home() {
  const [alerts, setAlerts] = useState<AlertItem[]>(demoAlerts);
  const [databaseConnected, setDatabaseConnected] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [activeView, setActiveView] = useState<View>("Overview");
  const [priorityFilter, setPriorityFilter] = useState<"All" | Priority>("All");
  const [search, setSearch] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [showIntake, setShowIntake] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("P3");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [assistantProvider, setAssistantProvider] = useState("openai");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [currentUser, setCurrentUser] = useState<{ displayName: string; email: string | null; phoneNumber: string | null } | null>(null);
  const [loginIdentifier, setLoginIdentifier] = useState("naveen.nkn1001@gmail.com");
  const [loginCode, setLoginCode] = useState("");
  const [authMode, setAuthMode] = useState<"email" | "mobile">("email");
  const [authMessage, setAuthMessage] = useState("Use your registered email or mobile number to receive the MFA code.");
  const [authStep, setAuthStep] = useState<"request" | "verify">("request");
  const [devBypassBusy, setDevBypassBusy] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [departmentRecipients, setDepartmentRecipients] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [showKnowledgeSearch, setShowKnowledgeSearch] = useState(false);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [logsError, setLogsError] = useState("");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeResults, setKnowledgeResults] = useState<KnowledgeResult[]>([]);
  const [knowledgeWarnings, setKnowledgeWarnings] = useState<string[]>([]);
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [showRawEmail, setShowRawEmail] = useState(false);

  function selectAuthMode(mode: "email" | "mobile") {
    setAuthMode(mode);
    setLoginIdentifier(mode === "email" ? "naveen.nkn1001@gmail.com" : "+91-9860742404");
    setAuthStep("request");
    setLoginCode("");
  }

  async function handleLoginRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identifier = loginIdentifier.trim();
    if (!identifier) {
      setAuthMessage("Please enter a valid email or mobile number.");
      return;
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, mode: authMode }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to send MFA code.");
      }
      setAuthMessage(result.message);
      setAuthStep("verify");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Unable to send MFA code.");
    }
  }

  async function handleVerifyRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loginCode.trim()) {
      setAuthMessage("Please enter the MFA code before continuing.");
      return;
    }

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: loginIdentifier.trim(), code: loginCode.trim(), mode: authMode }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to verify MFA code.");
      }
      setCurrentUser({
        displayName: result.user.displayName,
        email: result.user.email,
        phoneNumber: result.user.phoneNumber,
      });
      setAuthMessage("Logged in successfully.");
      setLoginCode("");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Unable to verify MFA code.");
    }
  }

  async function handleDevBypass() {
    setDevBypassBusy(true);
    try {
      const response = await fetch("/api/auth/dev-bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: loginIdentifier.trim(), mode: authMode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Development bypass failed.");
      setCurrentUser({
        displayName: result.user.displayName,
        email: result.user.email,
        phoneNumber: result.user.phoneNumber,
      });
      setLoginCode("");
      setAuthMessage("Development login successful.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Development bypass failed.");
    } finally {
      setDevBypassBusy(false);
    }
  }

  async function handleGenerateAlert() {
    try {
      const response = await fetch("/api/alerts/generate", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to generate demo alerts.");
      setActionLog((current) => [`Generated ${result.generated} dummy alerts`, ...current].slice(0, 5));
      if (Array.isArray(result.alerts)) {
        const createdAlerts = result.alerts.map((alert: { id: string; subject: string; priority: Priority; status: string }) => ({
          id: alert.id,
          priority: alert.priority,
          subject: alert.subject,
          location: "Auto-generated",
          source: "Generated",
          status: alert.status === "RESOLVED" ? "Resolved" : alert.status === "IN_PROGRESS" ? "In progress" : "New",
          assignee: "Unassigned",
          created: "Just now",
          ageMinutes: 8,
          slaMinutes: alert.priority === "P1" ? 30 : alert.priority === "P2" ? 60 : alert.priority === "P3" ? 240 : 480,
          body: "Automatically generated dummy alert for monitoring and training.",
          ticket: alert.id,
        }));
        setAlerts((current) => [...createdAlerts, ...current]);
      }
    } catch (error) {
      setActionLog((current) => [`Demo alert generation failed: ${error instanceof Error ? error.message : "unknown error"}`, ...current].slice(0, 5));
    }
  }

  useEffect(() => {
    let active = true;
    async function refreshAlerts() {
      try {
        const [dashboardResponse, backlogResponse] = await Promise.all([
          fetch("/api/alerts?scope=dashboard", { cache: "no-store" }),
          fetch("/api/alerts?scope=backlog", { cache: "no-store" }),
        ]);
        if (!dashboardResponse.ok || !backlogResponse.ok) return;
        const [dashboardResult, backlogResult] = await Promise.all([dashboardResponse.json(), backlogResponse.json()]);
        if (active && Array.isArray(dashboardResult.alerts) && Array.isArray(backlogResult.alerts)) {
          setAlerts([...dashboardResult.alerts, ...backlogResult.alerts] as AlertItem[]);
          setDatabaseConnected(true);
        }
      } catch {
        if (active) setDatabaseConnected(false);
      }
    }
    void refreshAlerts();
    const interval = window.setInterval(() => {
      setClock(new Date());
      void refreshAlerts();
    }, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function openOriginalEmail(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest(".email-block .detail-block-heading button")) {
        setShowRawEmail(true);
      }
    }
    document.addEventListener("click", openOriginalEmail);
    return () => document.removeEventListener("click", openOriginalEmail);
  }, []);

  const isBeforeCutoff = getEasternBusinessDay(clock).isBeforeCutoff;
  const todayAlerts = alerts.filter((alert) => easternDateKey(alertCreatedAt(alert, clock)) === easternDateKey(clock));
  const dashboardAlerts = isBeforeCutoff ? todayAlerts : [];
  const backlogAlerts = alerts.filter((alert) => alert.status !== "Resolved" && (easternDateKey(alertCreatedAt(alert, clock)) < easternDateKey(clock) || !isBeforeCutoff));
  const queueAlerts = activeView === "Backlog" ? backlogAlerts : dashboardAlerts;
  const openAlerts = queueAlerts.filter((alert) => alert.status !== "Resolved");
  const overdueAlerts = openAlerts.filter((alert) => alert.ageMinutes > alert.slaMinutes);
  const filteredAlerts = queueAlerts.filter((alert) => {
    const matchesPriority = priorityFilter === "All" || alert.priority === priorityFilter;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [alert.id, alert.subject, alert.location, alert.source, alert.assignee].some((field) => field.toLowerCase().includes(term));
    return matchesPriority && matchesSearch;
  });

  function updateAlert(id: string, update: Partial<AlertItem>) {
    const existingAlert = alerts.find((alert) => alert.id === id);
    let effectiveUpdate = update;
    if (update.status === "Open" && existingAlert?.assignee === "Unassigned") {
      effectiveUpdate = { ...update, assignee: currentUser?.displayName || "Maya Chen" };
    } else if (update.assignee && update.assignee !== "Unassigned" && existingAlert?.status === "New") {
      effectiveUpdate = { ...update, status: "Open" };
    } else if (update.assignee === "Unassigned" && existingAlert?.status === "Open") {
      effectiveUpdate = { ...update, status: "New" };
    }
    setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, ...effectiveUpdate } : alert));
    setSelectedAlert((current) => current?.id === id ? { ...current, ...effectiveUpdate } : current);
    if (databaseConnected) {
      void fetch(`/api/alerts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(effectiveUpdate.status ? { status: effectiveUpdate.status } : {}),
          ...(effectiveUpdate.assignee !== undefined ? { assignee: effectiveUpdate.assignee === "Unassigned" ? null : effectiveUpdate.assignee } : {}),
        }),
      }).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Alert update was not saved.");
        if (result.serviceNow?.status === "created" || result.serviceNow?.status === "synced") {
          setActionLog((current) => [`ServiceNow ${result.serviceNow.status}: ${result.serviceNow.number || id}`, ...current].slice(0, 10));
          if (result.serviceNow.number) {
            const ticketUpdate = { ticket: result.serviceNow.number };
            setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, ...ticketUpdate } : alert));
            setSelectedAlert((current) => current?.id === id ? { ...current, ...ticketUpdate } : current);
          }
        } else if (result.serviceNow?.message) {
          setActionLog((current) => [`ServiceNow ${result.serviceNow.status}: ${result.serviceNow.message}`, ...current].slice(0, 10));
        }
      }).catch((error: unknown) => {
        setActionLog((current) => [`Alert update failed: ${error instanceof Error ? error.message : "unknown error"}`, ...current].slice(0, 10));
      });
    }
  }

  async function loadOperationLogs() {
    setLogsError("");
    try {
      const response = await fetch("/api/operations/logs", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load logs.");
      setOperationLogs(result.events as OperationLog[]);
    } catch (error) {
      setLogsError(error instanceof Error ? error.message : "Unable to load logs.");
    }
  }

  async function searchKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = knowledgeQuery.trim();
    if (!query || knowledgeBusy) return;
    setKnowledgeBusy(true);
    setKnowledgeError("");
    try {
      const response = await fetch(`/api/knowledge/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Knowledge search failed.");
      setKnowledgeResults(result.hits as KnowledgeResult[]);
      setKnowledgeWarnings(result.warnings as string[]);
    } catch (error) {
      setKnowledgeError(error instanceof Error ? error.message : "Knowledge search failed.");
    } finally {
      setKnowledgeBusy(false);
    }
  }

  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newSubject.trim() || !newBody.trim() || !newLocation.trim()) return;
    const recipients = [...new Set(departmentRecipients.split(/[;,\s]+/).map((email) => email.trim()).filter(Boolean))];
    const draft: AlertItem = {
      id: `AL-${4822 + alerts.length - demoAlerts.length}`,
      priority: newPriority,
      subject: newSubject.trim(),
      location: newLocation.trim(),
      source: "manual intake",
      status: "New",
      assignee: "Unassigned",
      created: "Just now",
      ageMinutes: 0,
      slaMinutes: prioritySlaMinutes[newPriority],
      body: newBody.trim(),
      ticket: "Pending",
    };
    let savedAlert = draft;
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: draft.subject, location: draft.location, body: draft.body, priority: draft.priority, recipients }),
      });
      if (response.ok) {
        const result = await response.json();
        savedAlert = result.alert as AlertItem;
        setDatabaseConnected(true);
        if (result.delivery?.status === "sent") setActionLog((current) => [`Alert email sent to ${recipients.join(", ")}`, ...current].slice(0, 10));
        if (result.delivery?.status === "failed") setActionLog((current) => [`Alert saved; email delivery failed: ${result.delivery.message}`, ...current].slice(0, 10));
      } else {
        setDatabaseConnected(false);
      }
    } catch {
      setDatabaseConnected(false);
    }
    setAlerts((current) => [savedAlert, ...current]);
    setShowIntake(false);
    setNewSubject("");
    setNewBody("");
    setNewLocation("");
    setDepartmentRecipients("");
    setPriorityFilter("All");
    if (!isBeforeCutoff) setActiveView("Backlog");
  }

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || assistantBusy) return;
    setMessages((current) => [...current, { role: "user", content: prompt }]);
    setQuestion("");
    setAssistantBusy(true);
    setAssistantError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt, provider: assistantProvider }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Assistant request failed.");
      setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "Assistant is unavailable.");
    } finally {
      setAssistantBusy(false);
    }
  }

  const navItems: Array<{ label: View; icon: typeof Activity }> = [
    { label: "Overview", icon: Activity },
    { label: "Alerts", icon: Inbox },
    { label: "Backlog", icon: Archive },
    { label: "Knowledge", icon: BookOpen },
  ];
  const currentUserName = currentUser?.displayName || "User";
  const currentUserInitials = currentUserName.split(" ").map((part) => part[0]).slice(0, 2).join("") || "U";
  const utcClock = clock.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false });

  if (!currentUser) {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-card">
          <div className="auth-header">
            <div className="brand-mark"><span /></div>
            <div>
              <div className="eyebrow">AUTHENTICATION</div>
              <h1>Synopse access</h1>
            </div>
          </div>

          <div className="auth-tabs">
            <button type="button" className={authMode === "email" ? "selected" : ""} onClick={() => selectAuthMode("email")}>Email</button>
            <button type="button" className={authMode === "mobile" ? "selected" : ""} onClick={() => selectAuthMode("mobile")}>Mobile</button>
          </div>

          <form onSubmit={authStep === "request" ? handleLoginRequest : handleVerifyRequest} className="auth-form">
            <label>
              {authMode === "email" ? "Email address" : "Mobile number"}
              <input
                type={authMode === "email" ? "email" : "tel"}
                required
                value={loginIdentifier}
                onChange={(event) => setLoginIdentifier(event.target.value)}
                placeholder={authMode === "email" ? "name@example.com" : "+91-9860742404"}
                autoComplete={authMode === "email" ? "email" : "tel"}
              />
            </label>

            {authStep === "verify" && (
              <label>
                MFA code
                <input
                  value={loginCode}
                  onChange={(event) => setLoginCode(event.target.value)}
                  placeholder="Enter 6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </label>
            )}

            <button type="submit" className="button button-primary">
              {authStep === "request" ? "Send code" : "Verify code"}
            </button>
            {process.env.NODE_ENV === "development" && (
              <button type="button" className="button button-quiet" onClick={handleDevBypass} disabled={devBypassBusy}>
                {devBypassBusy ? "Signing in..." : "Skip MFA (development)"}
              </button>
            )}
          </form>

          <p className="auth-message">{authMessage}</p>
          <div className="auth-seed">
            <strong>Demo account</strong>
            <span>naveen.nkn1001@gmail.com</span>
            <span>+91-9860742404</span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={() => setActiveView("Overview")} aria-label="Synopse home">
          <span className="brand-mark"><span /></span>
          <span className="brand-name">synopse<span>.</span></span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-avatar">N</span>
          <span className="workspace-copy"><strong>Northstar Group</strong><small>Operations workspace</small></span>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button className={`nav-item ${activeView === label ? "is-active" : ""}`} key={label} onClick={() => setActiveView(label)}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {label === "Alerts" && <span className="nav-count">{dashboardAlerts.length}</span>}
              {label === "Backlog" && <span className="nav-count">{backlogAlerts.length}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label sources-label">CONNECTED SOURCES</div>
        <div className="source-nav"><span className="source-dot mail-dot"><Mail size={13} /></span><span>Email intake</span><span className="source-state">Live</span></div>
        <div className="source-nav"><span className="source-dot docs-dot"><BookOpen size={13} /></span><span>Knowledge base</span><span className="source-state pending">Setup</span></div>
        <div className="sidebar-bottom">
          <div className="sla-card">
            <div className="sla-card-top"><span className="sla-icon"><ShieldCheck size={15} /></span><span>Service health</span><span className="health-dot" /></div>
            <strong>All systems operational</strong>
            <div className="sla-meter"><span /></div>
            <small>Response SLA attainment <b>96.8%</b></small>
          </div>
          <button className="side-foot-link" onClick={() => setShowAssistant(true)}><CircleHelp size={16} /> Help &amp; assistant</button>
          <button className="profile-row"><span className="profile-avatar">MC</span><span className="profile-copy"><strong>Maya Chen</strong><small>Incident manager</small></span><MoreHorizontal size={18} /></button>
        </div>
      </aside>

      <section className="main-area" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>Northstar Group</span><span className="crumb-slash">/</span><strong>{activeView}</strong></div>
          <div className="top-actions">
            <span className="top-date">Current UTC: {utcClock} </span>
            <button className="icon-button notification-button" title="Notifications" aria-label="Notifications"><Bell size={17} /><i /></button>
            <button className="avatar-small" title={currentUserName}>{currentUserInitials}</button>
          </div>
        </header>

        {activeView === "Knowledge" ? (
          <div className="content-wrap knowledge-view">
            <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />CONNECTED KNOWLEDGE</div><h1>Knowledge sources</h1><p>Bring your operational runbooks and incident history into one searchable place.</p></div><button className="button button-primary" onClick={() => setShowAssistant(true)}><Sparkles size={16} /> Ask Synopse</button></div>
            <div className="knowledge-grid">
              <article className="knowledge-card"><div className="knowledge-icon sharepoint-icon">S</div><div className="knowledge-main"><div className="knowledge-title"><h2>SharePoint</h2><span className="setup-pill">Needs setup</span></div><p>Search pages and documents across your Microsoft 365 sites.</p><small>Microsoft Graph - OAuth 2.0</small></div><button className="icon-button" aria-label="SharePoint settings" title="SharePoint settings" onClick={() => setShowAssistant(true)}><Settings2 size={17} /></button></article>
              <article className="knowledge-card"><div className="knowledge-icon jira-icon">J</div><div className="knowledge-main"><div className="knowledge-title"><h2>Jira</h2><span className="setup-pill">Needs setup</span></div><p>Search issues, incident retrospectives, and operational projects.</p><small>Jira Cloud REST API</small></div><button className="icon-button" aria-label="Jira settings" title="Jira settings" onClick={() => setShowAssistant(true)}><Settings2 size={17} /></button></article>
              <article className="knowledge-card"><div className="knowledge-icon confluence-icon">C</div><div className="knowledge-main"><div className="knowledge-title"><h2>Confluence</h2><span className="setup-pill">Needs setup</span></div><p>Retrieve runbooks, postmortems, and service documentation.</p><small>Confluence Cloud REST API</small></div><button className="icon-button" aria-label="Confluence settings" title="Confluence settings" onClick={() => setShowAssistant(true)}><Settings2 size={17} /></button></article>
            </div>
            <div className="knowledge-note"><ShieldCheck size={18} /><div><strong>Credentials stay in your environment</strong><p>Connection URLs and tokens are configured on the server. Synopse never sends provider secrets to the browser.</p></div></div>
          </div>
        ) : (
          <div className="content-wrap">
            <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />OPERATIONS CENTER <span className="eyebrow-separator">/</span> DAILY QUEUE - 5 PM ET CUTOFF</div><h1>{activeView === "Alerts" ? "Alert queue" : activeView === "Backlog" ? "Alert backlog" : `Good morning, ${currentUserName}`}<span className="heading-period">.</span></h1><p>{activeView === "Alerts" ? "All alerts received today, regardless of status." : activeView === "Backlog" ? "Unresolved alerts carried over from earlier days." : "Here is the operational picture across your locations."}</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => setShowAssistant(true)}><Sparkles size={16} /> Ask Synopse</button><button className="button button-primary" onClick={handleGenerateAlert}><Plus size={17} /> Generate dummy alert</button><button className="button button-primary" onClick={() => setShowIntake(true)}><Plus size={17} /> New alert</button></div></div>

            <section className="metric-grid" aria-label="Alert summary">
              <article className="metric-card"><div className="metric-heading"><span>Active alerts</span><span className="metric-icon mint"><Inbox size={16} /></span></div><div className="metric-value-row"><strong>{openAlerts.length.toString().padStart(2, "0")}</strong><span className="metric-change positive"><ArrowDownRight size={14} /> 12% <span>vs yesterday</span></span></div><div className="metric-foot"><span className="tiny-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></span><span>Across 8 locations</span></div></article>
              <article className="metric-card"><div className="metric-heading"><span>Critical / P1</span><span className="metric-icon coral"><Zap size={16} /></span></div><div className="metric-value-row"><strong>{openAlerts.filter((alert) => alert.priority === "P1").length.toString().padStart(2, "0")}</strong><span className="metric-change negative"><ArrowUpRight size={14} /> 2 <span>need attention</span></span></div><div className="metric-foot"><span className="priority-track"><i /><i /><i /><i /></span><span>30 min response target</span></div></article>
              <article className="metric-card"><div className="metric-heading"><span>Outside SLA</span><span className="metric-icon amber"><Clock3 size={16} /></span></div><div className="metric-value-row"><strong>{overdueAlerts.length.toString().padStart(2, "0")}</strong><span className="metric-change neutral"><span>Across P1-P4</span></span></div><div className="metric-foot"><span className="sla-mini"><span style={{ width: "72%" }} /></span><span>96.8% within SLA this week</span></div></article>
              <article className="metric-card metric-ai"><div className="ai-orbit"><Sparkles size={19} /></div><div className="ai-copy"><span>Synopse intelligence</span><strong>Ask across your alerts<br />and knowledge base.</strong><button onClick={() => setShowAssistant(true)}>Open assistant <ArrowUpRight size={14} /></button></div></article>
            </section>

            <section className="queue-section" id="alerts">
              <div className="queue-heading"><div><div className="section-title-row"><h2>{activeView === "Backlog" ? "Open backlog" : activeView === "Alerts" ? "Today's alerts" : "Live alert queue"}</h2>{activeView !== "Backlog" && <span className="live-pill"><span /> DAILY</span>}</div><p>{activeView === "Backlog" ? "Open alerts from before today's 5 PM ET cutoff" : isBeforeCutoff ? "Visible through 5:00 PM Eastern, regardless of status" : "Daily dashboard cutoff has passed"}</p></div><button className="text-button" onClick={() => setActiveView(activeView === "Backlog" ? "Alerts" : "Backlog")}>{activeView === "Backlog" ? "Today's alerts" : "View backlog"} <ArrowUpRight size={15} /></button></div>
              <div className="table-toolbar"><div className="filter-tabs" aria-label="Filter by priority">{priorityFilters.map((priority) => <button key={priority} onClick={() => setPriorityFilter(priority)} className={`filter-tab ${priorityFilter === priority ? "selected" : ""} ${priority !== "All" ? `filter-${priority.toLowerCase()}` : ""}`}>{priority === "All" ? "All alerts" : priority}<span>{priority === "All" ? alerts.length : alerts.filter((alert) => alert.priority === priority).length}</span></button>)}</div><div className="table-actions"><label className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search alerts" aria-label="Search alerts" /><kbd>/</kbd></label><button className="toolbar-button" title="Filter options"><Filter size={15} /><span>Filter</span></button><button className="toolbar-icon" title="More queue options" aria-label="More queue options"><Settings2 size={16} /></button></div></div>
              <div className="table-wrap">
                <table className="alerts-table">
                  <thead><tr><th><input type="checkbox" aria-label="Select all alerts" /></th><th>PRIORITY</th><th>ALERT</th><th>LOCATION</th><th>STATUS</th><th>ASSIGNED TO</th><th>SLA</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{filteredAlerts.map((alert) => {
                    const rowClass = alert.status === "Resolved" ? `row-resolved priority-tint-${alert.priority.toLowerCase()}` : "";
                    return <tr key={alert.id} onClick={() => setSelectedAlert(alert)} className={rowClass}>
                      <td onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${alert.id}`} /></td>
                      <td><span className={`priority-badge ${alert.priority.toLowerCase()}`}><i />{alert.priority}</span></td>
                      <td><div className="alert-subject">{alert.subject}</div><div className="alert-meta"><span>{alert.id}</span><i />{alert.source}<i />{alert.created}</div></td>
                      <td><span className="location-cell"><MapPin size={13} />{alert.location}</span></td>
                      <td><span className={`status-badge status-${alert.status.toLowerCase().replace(" ", "-")}`}><i />{alert.status}</span></td>
                      <td><button className={`assignee-cell ${alert.assignee === "Unassigned" ? "unassigned" : ""}`} onClick={(event) => { event.stopPropagation(); updateAlert(alert.id, { assignee: alert.assignee === "Unassigned" ? (currentUser?.displayName || "Maya Chen") : "Unassigned" }); }} title="Assign to current user or unassign"><span className="assignee-avatar">{alert.assignee === "Unassigned" ? <UserRound size={13} /> : shortName(alert.assignee)}</span>{alert.assignee}</button></td>
                      <td><span className={`sla-cell ${alert.status !== "Resolved" && alert.ageMinutes >= alert.slaMinutes ? "overdue" : alert.ageMinutes / alert.slaMinutes > 0.7 ? "due-soon" : ""}`}><Clock3 size={13} />{timeRemaining(alert)}</span></td>
                      <td><button className="row-more" title="Open alert details" aria-label={`Open ${alert.id}`} onClick={(event) => { event.stopPropagation(); setSelectedAlert(alert); }}><MoreHorizontal size={17} /></button></td>
                    </tr>;
                  })}</tbody>
                </table>
                {filteredAlerts.length === 0 && <div className="empty-state"><Search size={20} /><strong>No alerts match this view</strong><span>Try another priority or search term.</span></div>}
              </div>
              <div className="table-footer"><span>Showing <strong>{filteredAlerts.length}</strong> of <strong>{queueAlerts.length}</strong> alerts</span><div className="table-pagination"><button disabled aria-label="Previous page"><ChevronLeft size={14} /></button><span>1</span><button disabled aria-label="Next page"><ChevronRight size={14} /></button></div></div>
            </section>
            <footer className="page-footer"><span><span className="footer-status-dot" />{databaseConnected ? "PostgreSQL connected" : "Sample data"}</span><span>{databaseConnected ? "Queue syncs every 30 seconds" : "Connect PostgreSQL for live alerts"} <span className="footer-divider">/</span> <button onClick={() => setShowAssistant(true)}>System status <ArrowUpRight size={12} /></button></span></footer>
          </div>
        )}
      </section>

      {selectedAlert && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedAlert(null); }}><aside className="detail-drawer" aria-label={`Alert ${selectedAlert.id} details`}><div className="drawer-top"><span className="drawer-label">ALERT DETAILS</span><button className="icon-button" onClick={() => setSelectedAlert(null)} title="Close details" aria-label="Close details"><X size={18} /></button></div><div className="drawer-id-row"><span className={`priority-badge ${selectedAlert.priority.toLowerCase()}`}><i />{selectedAlert.priority}</span><span className="drawer-ticket">{selectedAlert.ticket}</span></div><h2>{selectedAlert.subject}</h2><div className="drawer-location"><MapPin size={14} />{selectedAlert.location}<span>/</span>{selectedAlert.created} today</div><div className="drawer-actions"><button className="button button-primary" onClick={() => updateAlert(selectedAlert.id, { status: selectedAlert.status === "Resolved" ? "Open" : "Resolved" })}>{selectedAlert.status === "Resolved" ? <Activity size={15} /> : <Check size={15} />}{selectedAlert.status === "Resolved" ? "Reopen alert" : "Resolve alert"}</button><button className="button button-quiet" onClick={() => setShowAssistant(true)}><Sparkles size={15} /> Ask AI</button></div><div className="detail-block"><div className="detail-block-heading">RESPONSE TRACKING</div><div className="detail-info-row"><span>Status</span><button className="detail-value status-value" onClick={() => updateAlert(selectedAlert.id, { status: selectedAlert.status === "Open" ? "In progress" : "Open" })}><i className={`status-dot status-${selectedAlert.status.toLowerCase().replace(" ", "-")}`} />{selectedAlert.status}<ChevronDown size={14} /></button></div><div className="detail-info-row"><span>Response SLA</span><strong className={`detail-value ${selectedAlert.ageMinutes >= selectedAlert.slaMinutes ? "text-danger" : ""}`}>{selectedAlert.slaMinutes} minutes <span>/ {timeRemaining(selectedAlert)}</span></strong></div><div className="detail-info-row"><span>Assigned to</span><button className="detail-value" onClick={() => updateAlert(selectedAlert.id, { assignee: selectedAlert.assignee === "Unassigned" ? "Maya Chen" : "Unassigned" })}><span className="assignee-avatar">{shortName(selectedAlert.assignee)}</span>{selectedAlert.assignee}<ChevronDown size={14} /></button></div><div className="detail-info-row"><span>Created</span><strong className="detail-value">Today, {selectedAlert.created}</strong></div></div><div className="detail-block email-block"><div className="detail-block-heading">ORIGINAL EMAIL <button title="Copy raw email" aria-label="Copy raw email"><MoreHorizontal size={16} /></button></div><div className="email-from"><span className="email-avatar">{selectedAlert.source[0].toUpperCase()}</span><span><strong>{selectedAlert.source}</strong><small>To: alerts@synopse.io</small></span></div><p className="email-body">{selectedAlert.body}</p><div className="email-attachment"><Mail size={14} /> Original message <span>EML</span></div></div><div className="detail-block timeline-block"><div className="detail-block-heading">ACTIVITY</div><div className="timeline-item"><span className="timeline-icon"><Mail size={13} /></span><span><strong>Alert received</strong><small>{selectedAlert.created} / Email intake</small></span></div><div className="timeline-item"><span className="timeline-icon"><Zap size={13} /></span><span><strong>Classified as {selectedAlert.priority}</strong><small>Priority rules / SLA {selectedAlert.slaMinutes}m</small></span></div></div></aside></div>}

      {showIntake && (
        <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowIntake(false); }}>
          <section className="intake-modal" aria-labelledby="intake-title">
            <div className="modal-heading"><div><span className="drawer-label">MANUAL INTAKE</span><h2 id="intake-title">Create an alert</h2></div><button className="icon-button" onClick={() => setShowIntake(false)} title="Close" aria-label="Close"><X size={18} /></button></div>
            <form onSubmit={createAlert}>
              <label>Alert summary<input autoFocus value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="What needs attention?" required /></label>
              <div className="form-row"><label>Location<input value={newLocation} onChange={(event) => setNewLocation(event.target.value)} placeholder="City - Country" required /></label><label>Priority<select value={newPriority} onChange={(event) => setNewPriority(event.target.value as Priority)}><option>P1</option><option>P2</option><option>P3</option><option>P4</option></select></label></div>
              <label>Details<textarea value={newBody} onChange={(event) => setNewBody(event.target.value)} placeholder="Describe the issue and impact" rows={4} required /></label>
              <label>Notify departments<input type="text" value={departmentRecipients} onChange={(event) => setDepartmentRecipients(event.target.value)} placeholder="ops@example.com, support@example.com" /><span className="form-hint">Separate department email addresses with commas or semicolons.</span></label>
              <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setShowIntake(false)}>Cancel</button><button type="submit" className="button button-primary"><Plus size={16} /> Create alert</button></div>
            </form>
          </section>
        </div>
      )}

      {showAssistant && <div className="overlay assistant-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAssistant(false); }}><aside className="assistant-drawer"><div className="assistant-header"><div className="assistant-title-icon"><Sparkles size={17} /></div><div><strong>Synopse assistant</strong><small>Alerts + connected knowledge</small></div><button className="icon-button" onClick={() => setShowAssistant(false)} title="Close assistant" aria-label="Close assistant"><X size={18} /></button></div><div className="assistant-provider"><span>Answer with</span><div className="provider-toggle"><button className={assistantProvider === "openai" ? "chosen" : ""} onClick={() => setAssistantProvider("openai")}>ChatGPT</button><button className={assistantProvider === "anthropic" ? "chosen" : ""} onClick={() => setAssistantProvider("anthropic")}>Claude</button></div></div><div className="chat-messages">{messages.length === 0 ? <div className="assistant-empty"><span className="assistant-spark"><Sparkles size={21} /></span><h3>What can I help you resolve?</h3><p>Ask about active incidents, response history, or your operational runbooks.</p><button onClick={() => setQuestion("Which alerts are currently outside their SLA?")}>Which alerts are outside SLA? <ArrowUpRight size={13} /></button><button onClick={() => setQuestion("Find the runbook for the payment gateway incident")}>Find the payment gateway runbook <ArrowUpRight size={13} /></button></div> : messages.map((message, index) => <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}><span className="chat-avatar">{message.role === "assistant" ? <Sparkles size={13} /> : "MC"}</span><p>{message.content}</p></div>)}{assistantBusy && <div className="chat-message assistant"><span className="chat-avatar"><Sparkles size={13} /></span><p className="thinking-dots">Searching sources and preparing an answer<span>.</span><span>.</span><span>.</span></p></div>}{assistantError && <div className="assistant-error"><LifeBuoy size={15} />{assistantError}</div>}</div><form className="chat-composer" onSubmit={sendQuestion}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask about alerts or runbooks..." rows={2} /><div className="composer-bottom"><span><ShieldCheck size={13} /> Private to your workspace</span><button type="submit" disabled={!question.trim() || assistantBusy} title="Send question" aria-label="Send question"><Send size={15} /></button></div></form></aside></div>}
      <button className="logs-trigger" onClick={() => { setShowLogs(true); void loadOperationLogs(); }}><Activity size={14} /> Logs</button>
      {activeView === "Knowledge" && <button className="knowledge-trigger" onClick={() => setShowKnowledgeSearch(true)}><BookOpen size={14} /> Search sources</button>}

      {showRawEmail && selectedAlert && (
        <div className="overlay logs-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRawEmail(false); }}>
          <section className="logs-dialog email-viewer" aria-label="Original email">
            <div className="logs-heading"><div><span className="drawer-label">ORIGINAL EMAIL</span><h2>{selectedAlert.subject}</h2></div><button className="icon-button" onClick={() => setShowRawEmail(false)} aria-label="Close original email"><X size={18} /></button></div>
            <div className="original-email-meta">
              <div><span>From</span><strong>{selectedAlert.sender || selectedAlert.source}</strong></div>
              <div><span>To</span><strong>{selectedAlert.recipient || "Not provided"}</strong></div>
              <div><span>Subject</span><strong>{selectedAlert.subject}</strong></div>
              <div><span>Received</span><strong>{selectedAlert.createdAt ? new Date(selectedAlert.createdAt).toLocaleString() : selectedAlert.created}</strong></div>
            </div>
            <pre className="email-full-body">{selectedAlert.body}</pre>
            <div className="modal-actions"><button className="button button-quiet" onClick={() => { void navigator.clipboard.writeText(selectedAlert.rawEmail || selectedAlert.body); setActionLog((current) => [`Copied original email ${selectedAlert.id}`, ...current].slice(0, 10)); }}>Copy message</button><button className="button button-quiet" onClick={() => setShowRawEmail(false)}>Close</button></div>
            {selectedAlert.rawEmail && <details className="raw-email-details"><summary>View original MIME message</summary><pre className="raw-email-pre">{selectedAlert.rawEmail}</pre></details>}
          </section>
        </div>
      )}

      {showKnowledgeSearch && (
        <div className="overlay logs-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowKnowledgeSearch(false); }}>
          <section className="logs-dialog knowledge-search-dialog" aria-label="Read-only knowledge search">
            <div className="logs-heading"><div><span className="drawer-label">READ-ONLY CONNECTED SOURCES</span><h2>Search Jira and Confluence</h2></div><button className="icon-button" onClick={() => setShowKnowledgeSearch(false)} aria-label="Close knowledge search"><X size={18} /></button></div>
            <form className="knowledge-search" onSubmit={searchKnowledge}><input value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder="Search runbooks, incidents, or projects" aria-label="Search connected knowledge" required /><button className="button button-primary" type="submit" disabled={knowledgeBusy}>{knowledgeBusy ? "Searching..." : "Search"}</button></form>
            {knowledgeError && <p className="knowledge-feedback error">{knowledgeError}</p>}
            {knowledgeWarnings.length > 0 && <p className="knowledge-feedback">Unavailable sources: {knowledgeWarnings.join(", ")}</p>}
            <div className="knowledge-results">{knowledgeResults.map((result, index) => <article className="knowledge-result" key={`${result.source}-${result.title}-${index}`}><div className="knowledge-result-head"><span>{result.source}</span><strong>{result.title}</strong></div>{result.url && <a href={result.url} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={12} /></a>}<p>{result.excerpt || "No excerpt available."}</p></article>)}</div>
            {knowledgeQuery && !knowledgeBusy && !knowledgeError && knowledgeResults.length === 0 && <p className="knowledge-feedback">No matching documents found in connected sources.</p>}
          </section>
        </div>
      )}

      {showLogs && (
        <div className="overlay logs-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLogs(false); }}>
          <section className="logs-dialog" aria-label="System logs">
            <div className="logs-heading"><div><span className="drawer-label">OPERATIONS</span><h2>Recent activity</h2></div><div><button className="button button-quiet" onClick={() => void loadOperationLogs()}>Refresh</button><button className="icon-button" onClick={() => setShowLogs(false)} aria-label="Close system logs"><X size={18} /></button></div></div>
            {logsError && <p className="knowledge-feedback error">{logsError}</p>}
            <div className="logs-list">
              {operationLogs.map((entry, index) => <article className="log-entry" key={`${entry.action}-${entry.createdAt}-${index}`}><time>{new Date(entry.createdAt).toLocaleString()}</time><div><strong>{entry.action}</strong><p>{entry.alert.reference} · {entry.alert.subject}{entry.actor ? ` · ${entry.actor}` : ""}</p>{entry.details !== null && entry.details !== undefined ? <p>{JSON.stringify(entry.details)}</p> : null}</div></article>)}
              {operationLogs.length === 0 && actionLog.map((entry, index) => <article className="log-entry" key={`${entry}-${index}`}><time>Current session</time><div><strong>Dashboard action</strong><p>{entry}</p></div></article>)}
              {operationLogs.length === 0 && actionLog.length === 0 && !logsError && <p className="knowledge-feedback">No activity recorded yet.</p>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
