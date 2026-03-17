import { useState, useCallback, useEffect } from "react";
import GanttChart from "./components/GanttChart";
import ActivityPanel from "./components/ActivityPanel";
import ProjectDashboard from "./components/ProjectDashboard";
import DocumentUpload from "./components/DocumentUpload";
import SummaryPanel from "./components/SummaryPanel";
import LoginPage from "./components/LoginPage";
import type { Activity, Project, AuthUser } from "./api";
import {
  getActivities, createActivity, updateActivity, deleteActivity,
  exportExcel, exportMSProject, getMe,
} from "./api";
import "./App.css";

type View = "dashboard" | "programme";
type MainTab = "gantt" | "summary" | "documents";
type ZoomLevel = "day" | "week" | "month" | "quarter";

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("documents");
  const [filter, setFilter] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [zoom, setZoom] = useState<ZoomLevel>("month");

  // Check existing session on mount
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      getMe().then((res) => setAuthUser(res.data)).catch(() => {
        localStorage.removeItem("auth_token");
      }).finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  const handleLogin = (user: AuthUser) => {
    setAuthUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setAuthUser(null);
    setView("dashboard");
    setCurrentProject(null);
    setActivities([]);
    setSelectedActivity(null);
  };

  const loadActivities = useCallback(async (projectId: number) => {
    setLoading(true);
    try {
      const res = await getActivities(projectId);
      setActivities(res.data);
    } catch {}
    setLoading(false);
  }, []);

  const openProject = (project: Project) => {
    setCurrentProject(project);
    setView("programme");
    setMainTab("documents");
    loadActivities(project.id);
  };

  const handleActivityUpdate = async (id: number, changes: Partial<Activity>) => {
    if (!currentProject) return;
    try {
      await updateActivity(currentProject.id, id, changes);
      setActivities((prev) => prev.map((a) => a.id === id ? { ...a, ...changes } : a));
      if (selectedActivity?.id === id) {
        setSelectedActivity((prev) => prev ? { ...prev, ...changes } : null);
      }
    } catch (e) { console.error(e); }
  };

  const handleActivityAdd = async () => {
    if (!currentProject) return;
    const newAct = await createActivity(currentProject.id, {
      name: "New Activity",
      duration_days: 5,
      duration_weeks: 0.8,
      percent_complete: 0,
      indent_level: 0,
      is_summary: false,
      is_milestone: false,
      is_critical: false,
    });
    setActivities((prev) => [...prev, newAct.data]);
    setSelectedActivity(newAct.data);
    setMainTab("gantt");
  };

  const handleActivityDelete = async (id: number) => {
    if (!currentProject) return;
    if (!confirm("Delete this activity?")) return;
    await deleteActivity(currentProject.id, id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
    if (selectedActivity?.id === id) setSelectedActivity(null);
  };

  const handleAddMilestone = async () => {
    if (!currentProject) return;
    const m = await createActivity(currentProject.id, {
      name: "New Milestone",
      duration_days: 0,
      duration_weeks: 0,
      percent_complete: 0,
      indent_level: 1,
      is_summary: false,
      is_milestone: true,
      is_critical: false,
    });
    setActivities((prev) => [...prev, m.data]);
    setSelectedActivity(m.data);
    setMainTab("gantt");
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = async () => {
    if (!currentProject) return;
    setExportMenu(false);
    const res = await exportExcel(currentProject.id);
    downloadBlob(res.data, `${currentProject.name} - ${currentProject.revision}.xlsx`);
  };

  const handleExportMSProject = async () => {
    if (!currentProject) return;
    setExportMenu(false);
    const res = await exportMSProject(currentProject.id);
    downloadBlob(res.data, `${currentProject.name} - ${currentProject.revision}.xml`);
  };

  const handlePrint = () => {
    window.print();
  };

  // Collect unique trades/resources for filter dropdown
  const allTrades = Array.from(
    new Set(
      activities
        .flatMap((a) => (a.resource_names || "").split(",").map((r) => r.trim()))
        .filter(Boolean)
    )
  ).sort();

  const filteredActivities = activities.filter((a) => {
    const matchText = !filter ||
      a.name.toLowerCase().includes(filter.toLowerCase()) ||
      (a.resource_names || "").toLowerCase().includes(filter.toLowerCase());
    const matchTrade = !tradeFilter ||
      (a.resource_names || "").toLowerCase().includes(tradeFilter.toLowerCase());
    return matchText && matchTrade;
  });

  const criticalCount = activities.filter((a) => a.is_critical && !a.is_summary).length;
  const milestoneCount = activities.filter((a) => a.is_milestone).length;
  const taskCount = activities.filter((a) => !a.is_summary && !a.is_milestone).length;
  const avgComplete = taskCount > 0
    ? Math.round(activities.filter((a) => !a.is_summary && !a.is_milestone).reduce((s, a) => s + (a.percent_complete || 0), 0) / taskCount)
    : 0;

  if (!authChecked) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!authUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (view === "dashboard") {
    return (
      <div className="app">
        <ProjectDashboard onOpen={openProject} user={authUser} onLogout={handleLogout} />
      </div>
    );
  }

  return (
    <div className="app programme-view">
      {/* ── Top Nav ────────────────────────────────────────────── */}
      <nav className="topnav">
        <button className="nav-back" onClick={() => { setView("dashboard"); setCurrentProject(null); setActivities([]); setSelectedActivity(null); }}>
          ← Projects
        </button>

        <div className="nav-project">
          <span className="nav-project-name">{currentProject?.name}</span>
          {currentProject?.revision && <span className="nav-project-rev">{currentProject.revision}</span>}
        </div>

        {activities.length > 0 && (
          <div className="nav-stats">
            <div className="stat"><span className="stat-val">{activities.length}</span><span className="stat-label">Activities</span></div>
            <div className="stat"><span className="stat-val critical-text">{criticalCount}</span><span className="stat-label">Critical</span></div>
            <div className="stat"><span className="stat-val milestone-text">{milestoneCount}</span><span className="stat-label">Milestones</span></div>
            <div className="stat"><span className="stat-val">{avgComplete}%</span><span className="stat-label">Complete</span></div>
          </div>
        )}

        <div className="nav-actions">
          {mainTab === "gantt" && (
            <>
              <button className="btn btn-sm btn-secondary" onClick={handleActivityAdd}>+ Activity</button>
              <button className="btn btn-sm btn-secondary" onClick={handleAddMilestone}>◆ Milestone</button>
            </>
          )}
          <div className="export-wrapper">
            <button className="btn btn-sm btn-primary" onClick={() => setExportMenu((v) => !v)}>
              Export ▾
            </button>
            {exportMenu && (
              <div className="export-menu" onMouseLeave={() => setExportMenu(false)}>
                <button className="export-item" onClick={handleExportExcel}>
                  <span>📊</span> Export to Excel (.xlsx)
                </button>
                <button className="export-item" onClick={handleExportMSProject}>
                  <span>📅</span> Export to MS Project (.xml)
                </button>
                <div className="export-divider" />
                <button className="export-item" onClick={handlePrint}>
                  <span>🖨</span> Print A3 Landscape
                </button>
              </div>
            )}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={handleLogout}>Sign out</button>
        </div>
      </nav>

      {/* ── Main Tabs ───────────────────────────────────────────── */}
      <div className="main-tabs">
        <button className={`main-tab ${mainTab === "documents" ? "active" : ""}`} onClick={() => setMainTab("documents")}>
          Documents
        </button>
        <button className={`main-tab ${mainTab === "gantt" ? "active" : ""}`} onClick={() => setMainTab("gantt")}>
          Programme {activities.length > 0 && <span style={{ fontSize: 11, fontWeight: 500, color: mainTab === "gantt" ? "#2563eb" : "#9ca3af", marginLeft: 4 }}>({activities.length})</span>}
        </button>
        <button className={`main-tab ${mainTab === "summary" ? "active" : ""}`} onClick={() => setMainTab("summary")}>
          Summary
        </button>
      </div>

      {/* ── Toolbar (only for gantt tab) ────────────────────────── */}
      {mainTab === "gantt" && (
        <div className="toolbar">
          <div className="toolbar-left">
            <input
              className="toolbar-search"
              type="text"
              placeholder="Search activities..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && <button className="toolbar-clear" onClick={() => setFilter("")}>✕</button>}
            {allTrades.length > 0 && (
              <select
                className="toolbar-trade-filter"
                value={tradeFilter}
                onChange={(e) => setTradeFilter(e.target.value)}
              >
                <option value="">All trades</option>
                {allTrades.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            {tradeFilter && (
              <button className="toolbar-clear" onClick={() => setTradeFilter("")}>✕</button>
            )}
          </div>
          <div className="toolbar-center">
            <div className="legend">
              <span className="legend-item"><span className="legend-dot" style={{ background: "#2F75B6" }} />Normal</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "#C00000" }} />Critical</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "#E26B0A" }} />Near Critical</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "#7030A0" }} />Milestone</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "#1F3864" }} />Summary</span>
            </div>
          </div>
          <div className="toolbar-right">
            <div className="zoom-controls">
              {(["day", "week", "month", "quarter"] as ZoomLevel[]).map((z) => (
                <button
                  key={z}
                  className={`zoom-btn ${zoom === z ? "active" : ""}`}
                  onClick={() => setZoom(z)}
                >
                  {z.charAt(0).toUpperCase() + z.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Content Area ────────────────────────────────────────── */}
      {mainTab === "documents" && (
        <div className="documents-full">
          {currentProject && (
            <DocumentUpload
              projectId={currentProject.id}
              onProcessed={() => {
                loadActivities(currentProject.id);
                setMainTab("gantt");
              }}
            />
          )}
        </div>
      )}

      {mainTab === "summary" && (
        <div className="summary-full">
          <SummaryPanel
            activities={activities}
            projectName={currentProject?.name || ""}
          />
        </div>
      )}

      {mainTab === "gantt" && (
        <div className="gantt-layout">
          <div className="gantt-wrapper">
            {loading ? (
              <div className="gantt-loading">
                <div className="spinner" />
                <p>Loading programme...</p>
              </div>
            ) : activities.length === 0 ? (
              <div className="gantt-empty">
                <div className="empty-icon">📋</div>
                <h3>No programme generated yet</h3>
                <p>Upload your project documents in the Documents tab to auto-generate a detailed programme.</p>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setMainTab("documents")}>
                  Go to Documents
                </button>
              </div>
            ) : (
              <GanttChart
                activities={filteredActivities}
                zoom={zoom}
                onActivityUpdate={handleActivityUpdate}
                onActivityAdd={handleActivityAdd}
                onActivityDelete={handleActivityDelete}
                onActivitySelect={setSelectedActivity}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="sidebar">
            <div className="sidebar-header">
              {selectedActivity ? (
                <span className="sidebar-title">Activity Properties</span>
              ) : (
                <span className="sidebar-title">Select an activity</span>
              )}
            </div>
            <ActivityPanel
              activity={selectedActivity}
              onUpdate={handleActivityUpdate}
              onClose={() => setSelectedActivity(null)}
              onDelete={handleActivityDelete}
            />
          </div>
        </div>
      )}
    </div>
  );
}
