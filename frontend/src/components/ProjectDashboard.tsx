import { useState, useEffect } from "react";
import type { Project, AuthUser } from "../api";
import { getProjects, createProject, deleteProject } from "../api";

interface Props {
  onOpen: (project: Project) => void;
  user?: AuthUser | null;
  onLogout?: () => void;
}

export default function ProjectDashboard({ onOpen, user, onLogout }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newRevision, setNewRevision] = useState("REV 1");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await getProjects();
      setProjects(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const res = await createProject({ name: newName, address: newAddress, client: newClient, revision: newRevision, working_days: 6 });
    setShowNew(false);
    setNewName(""); setNewAddress(""); setNewClient(""); setNewRevision("REV 1");
    load();
    // Open immediately after creation
    onOpen(res.data as Project);
  };

  const handleDelete = async (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation();
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    await deleteProject(id);
    load();
  };

  return (
    <div className="dashboard">
      {/* Hero */}
      <div className="dashboard-hero">
        <div className="dashboard-hero-inner">
          {user && (
            <div className="dashboard-user-bar">
              <span>{user.email}</span>
              {onLogout && (
                <button className="dashboard-logout" onClick={onLogout}>Sign out</button>
              )}
            </div>
          )}
          <h1>Construction Programme Manager</h1>
          <p>
            Upload your project documents — drawings, specifications, schedules and contracts.
            The AI reads and analyses everything, then generates a detailed construction programme.
          </p>
          <div className="hero-features">
            <span className="hero-feature"><span className="hero-feature-dot" />Upload PDFs, drawings & specs</span>
            <span className="hero-feature"><span className="hero-feature-dot" />AI analyses all documents</span>
            <span className="hero-feature"><span className="hero-feature-dot" />Generates programme by zone & trade</span>
            <span className="hero-feature"><span className="hero-feature-dot" />Export to Excel or MS Project</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="dashboard-body">
        <div className="dashboard-body-inner">
        <div className="dashboard-actions">
          <div className="dashboard-section-title">
            {projects.length > 0 ? `${projects.length} Project${projects.length > 1 ? "s" : ""}` : "Projects"}
          </div>
          <button className="btn btn-primary btn-lg" onClick={() => setShowNew(true)}>
            + New Project
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <h2>No projects yet</h2>
            <p>
              Create your first project, then upload all your project documents.<br />
              The AI will read and analyse everything to generate your programme.
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => setShowNew(true)}>
              Create First Project
            </button>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <div key={p.id} className="project-card" onClick={() => onOpen(p)}>
                <div className="project-card-header">
                  <div className="project-card-badge">{p.revision || "REV 1"}</div>
                  <button
                    className="project-card-delete"
                    onClick={(e) => handleDelete(e, p.id, p.name)}
                  >✕</button>
                </div>
                <h3 className="project-card-name">{p.name}</h3>
                {p.address && <p className="project-card-meta">📍 {p.address}</p>}
                {p.client && <p className="project-card-meta">🏢 {p.client}</p>}
                <div className="project-card-footer">
                  <span className="project-card-count">
                    {p.activity_count ?? 0} activities
                  </span>
                  <span className="project-card-arrow">→</span>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* New Project Modal */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Project</h2>
              <button className="modal-close" onClick={() => setShowNew(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div>
                <label className="field-label">Project Name *</label>
                <input
                  className="field-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Southbank Tower Redevelopment"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  autoFocus
                />
              </div>
              <div>
                <label className="field-label">Address / Location</label>
                <input className="field-input" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="e.g. 1 City Road, Melbourne VIC 3000" />
              </div>
              <div>
                <label className="field-label">Client</label>
                <input className="field-input" value={newClient} onChange={(e) => setNewClient(e.target.value)} placeholder="e.g. ABC Developments" />
              </div>
              <div>
                <label className="field-label">Programme Revision</label>
                <input className="field-input" value={newRevision} onChange={(e) => setNewRevision(e.target.value)} placeholder="REV 1" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim()}>
                Create &amp; Upload Documents →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
