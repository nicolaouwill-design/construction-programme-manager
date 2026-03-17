import type { Activity } from "../api";

interface Props {
  activities: Activity[];
  projectName: string;
}

interface SummaryItem {
  text: string;
  date?: string;
  tag?: string;
  tagClass?: string;
  color?: string;
}

export default function SummaryPanel({ activities }: Props) {
  if (activities.length === 0) {
    return (
      <div className="summary-view" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div className="summary-empty" style={{ maxWidth: 380 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <p style={{ fontSize: 14, color: "#334155", fontWeight: 600, marginBottom: 8 }}>No programme generated yet</p>
          <p>Upload your project documents in the Documents tab, then click <strong>Generate Programme</strong> to create a full detailed programme.</p>
        </div>
      </div>
    );
  }

  // ── Derive summary data from activities ───────────────────────
  const milestones = activities.filter((a) => a.is_milestone).sort((a, b) => {
    const da = parseDate(a.finish_date); const db = parseDate(b.finish_date);
    return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
  });

  const critical = activities.filter((a) => a.is_critical && !a.is_summary && !a.is_milestone);
  const summaries = activities.filter((a) => a.is_summary && a.indent_level <= 2);
  const inProgress = activities.filter((a) => !a.is_summary && !a.is_milestone && (a.percent_complete ?? 0) > 0 && (a.percent_complete ?? 0) < 100);
  const notStarted = activities.filter((a) => !a.is_summary && !a.is_milestone && (a.percent_complete ?? 0) === 0);
  const complete = activities.filter((a) => !a.is_summary && !a.is_milestone && (a.percent_complete ?? 0) === 100);
  const tasks = activities.filter((a) => !a.is_summary && !a.is_milestone);
  const avgComplete = tasks.length > 0
    ? Math.round(tasks.reduce((s, a) => s + (a.percent_complete ?? 0), 0) / tasks.length)
    : 0;

  // Long lead items — heuristic: activities with long duration (>30d) not yet started
  const longLead: SummaryItem[] = notStarted
    .filter((a) => (a.duration_days ?? 0) >= 20)
    .sort((a, b) => (b.duration_days ?? 0) - (a.duration_days ?? 0))
    .slice(0, 8)
    .map((a) => ({
      text: a.name,
      date: a.start_date ? `Due to start: ${a.start_date}` : undefined,
      tag: `${a.duration_days}d`,
      tagClass: (a.duration_days ?? 0) >= 40 ? "tag-critical" : "tag-warning",
      color: (a.duration_days ?? 0) >= 40 ? "#dc2626" : "#ea580c",
    }));

  // Focus areas — critical items not started or in progress
  const focusAreas: SummaryItem[] = critical
    .filter((a) => (a.percent_complete ?? 0) < 100)
    .slice(0, 8)
    .map((a) => ({
      text: a.name,
      date: a.start_date ? `Start: ${a.start_date} → ${a.finish_date}` : undefined,
      tag: `${a.percent_complete ?? 0}%`,
      tagClass: (a.percent_complete ?? 0) === 0 ? "tag-critical" : "tag-warning",
      color: "#dc2626",
    }));

  // Key milestones
  const keyMilestones: SummaryItem[] = milestones.slice(0, 10).map((a) => ({
    text: a.name,
    date: a.finish_date,
    tag: a.is_critical ? "Critical" : "Milestone",
    tagClass: a.is_critical ? "tag-critical" : "tag-info",
    color: a.is_critical ? "#dc2626" : "#7c3aed",
  }));

  // Main work packages
  const workPackages: SummaryItem[] = summaries.slice(0, 10).map((a) => ({
    text: a.name,
    date: a.start_date && a.finish_date ? `${a.start_date} → ${a.finish_date}` : undefined,
    tag: a.percent_complete != null && !a.is_summary ? `${a.percent_complete}%` : undefined,
    tagClass: "tag-info",
    color: "#1d4ed8",
  }));


  return (
    <div className="summary-view">
      {/* Stats row */}
      <div className="summary-stats">
        <div className="summary-stat">
          <div className="summary-stat-val">{activities.length}</div>
          <div className="summary-stat-label">Total Activities</div>
        </div>
        <div className="summary-stat">
          <div className={`summary-stat-val ${critical.length > 0 ? "danger" : "success"}`}>{critical.length}</div>
          <div className="summary-stat-label">Critical Activities</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-val" style={{ color: "#7c3aed" }}>{milestones.length}</div>
          <div className="summary-stat-label">Milestones</div>
        </div>
        <div className="summary-stat">
          <div className={`summary-stat-val ${avgComplete >= 75 ? "success" : avgComplete >= 40 ? "warning" : "danger"}`}>{avgComplete}%</div>
          <div className="summary-stat-label">Avg Complete</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-val success">{complete.length}</div>
          <div className="summary-stat-label">Complete</div>
        </div>
        <div className="summary-stat">
          <div className="summary-stat-val warning">{inProgress.length}</div>
          <div className="summary-stat-label">In Progress</div>
        </div>
      </div>

      {/* Grid sections */}
      <div className="summary-grid">

        {/* Key Milestones */}
        <SummarySection
          icon="◆"
          title="Key Milestones"
          subtitle={`${milestones.length} milestones in programme`}
          items={keyMilestones}
          empty="No milestones found. Upload programme documents to generate."
        />

        {/* Items to Focus On */}
        <SummarySection
          icon="⚠"
          title="Items to Focus On"
          subtitle="Critical activities not yet complete"
          items={focusAreas}
          empty="No critical items outstanding."
        />

        {/* Long Lead Items */}
        <SummarySection
          icon="⏱"
          title="Long Lead Items to Watch"
          subtitle="Activities with longest durations not yet started"
          items={longLead}
          empty="No long lead items identified."
        />

        {/* Main Work Packages */}
        <SummarySection
          icon="🏗"
          title="Main Work Packages"
          subtitle="Top-level programme sections"
          items={workPackages}
          empty="No work packages found."
        />

      </div>
    </div>
  );
}

function SummarySection({
  icon, title, subtitle, items, empty,
}: {
  icon: string; title: string; subtitle: string;
  items: SummaryItem[]; empty: string;
}) {
  return (
    <div className="summary-section">
      <div className="summary-header">
        <span className="summary-icon">{icon}</span>
        <div>
          <div className="summary-title">{title}</div>
          <div className="summary-subtitle">{subtitle}</div>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="summary-empty">{empty}</div>
      ) : (
        items.map((item, i) => (
          <div key={i} className="summary-item">
            <div className="summary-item-dot" style={{ background: item.color || "#1d4ed8" }} />
            <div className="summary-item-text">
              {item.text}
              {item.date && <div className="summary-item-date">{item.date}</div>}
            </div>
            {item.tag && (
              <span className={`summary-item-tag ${item.tagClass || "tag-info"}`}>{item.tag}</span>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function parseDate(str?: string): Date | null {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return new Date(`20${y.length === 2 ? y : y.slice(2)}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }
  return null;
}
