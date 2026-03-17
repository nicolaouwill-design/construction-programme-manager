import { useState, useEffect } from "react";
import type { Activity } from "../api";

interface ActivityPanelProps {
  activity: Activity | null;
  onUpdate: (id: number, changes: Partial<Activity>) => void;
  onClose: () => void;
  onDelete: (id: number) => void;
}

export default function ActivityPanel({ activity, onUpdate, onClose, onDelete }: ActivityPanelProps) {
  const [form, setForm] = useState<Partial<Activity>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (activity) {
      setForm({ ...activity });
      setDirty(false);
    }
  }, [activity]);

  if (!activity) {
    return (
      <div className="panel-empty">
        <div className="panel-empty-icon">📋</div>
        <p>Select an activity to edit its details</p>
      </div>
    );
  }

  const set = (key: keyof Activity, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const save = () => {
    onUpdate(activity.id, form);
    setDirty(false);
  };

  const barColor = activity.is_summary
    ? "#1F3864"
    : activity.is_critical
    ? "#C00000"
    : activity.is_near_critical
    ? "#E26B0A"
    : activity.is_milestone
    ? "#7030A0"
    : "#2F75B6";

  return (
    <div className="activity-panel">
      <div className="panel-header" style={{ borderLeft: `4px solid ${barColor}` }}>
        <div className="panel-header-title">
          {activity.is_milestone && <span className="badge badge-milestone">Milestone</span>}
          {activity.is_summary && <span className="badge badge-summary">Summary</span>}
          {activity.is_critical && <span className="badge badge-critical">Critical</span>}
          {activity.is_near_critical && <span className="badge badge-near-critical">Near Critical</span>}
        </div>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="panel-body">
        <label className="field-label">Activity Name</label>
        <textarea
          className="field-input field-textarea"
          value={form.name || ""}
          onChange={(e) => set("name", e.target.value)}
          rows={2}
        />

        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Duration (days)</label>
            <input
              type="number"
              className="field-input"
              value={form.duration_days ?? ""}
              onChange={(e) => set("duration_days", parseFloat(e.target.value) || 0)}
              min={0}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Duration (weeks)</label>
            <input
              type="number"
              className="field-input"
              value={form.duration_weeks ?? ""}
              step={0.1}
              onChange={(e) => set("duration_weeks", parseFloat(e.target.value) || 0)}
              min={0}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Start Date</label>
            <input
              type="text"
              className="field-input"
              value={form.start_date || ""}
              placeholder="DD/MM/YY"
              onChange={(e) => set("start_date", e.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Finish Date</label>
            <input
              type="text"
              className="field-input"
              value={form.finish_date || ""}
              placeholder="DD/MM/YY"
              onChange={(e) => set("finish_date", e.target.value)}
            />
          </div>
        </div>

        <label className="field-label">% Complete</label>
        <div className="progress-wrapper">
          <input
            type="range"
            min={0}
            max={100}
            value={form.percent_complete ?? 0}
            onChange={(e) => set("percent_complete", parseInt(e.target.value))}
            className="progress-slider"
          />
          <span className="progress-value">{form.percent_complete ?? 0}%</span>
        </div>
        <div className="progress-bar-outer">
          <div
            className="progress-bar-inner"
            style={{ width: `${form.percent_complete ?? 0}%` }}
          />
        </div>

        <label className="field-label">Resource Names (Subcontractors)</label>
        <input
          type="text"
          className="field-input"
          value={form.resource_names || ""}
          placeholder="e.g. Quadrant, ADJ"
          onChange={(e) => set("resource_names", e.target.value)}
        />

        <div className="field-row checkboxes">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.is_critical || false}
              onChange={(e) => set("is_critical", e.target.checked)}
            />
            Critical
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.is_near_critical || false}
              onChange={(e) => set("is_near_critical", e.target.checked)}
            />
            Near Critical
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.is_milestone || false}
              onChange={(e) => set("is_milestone", e.target.checked)}
            />
            Milestone
          </label>
        </div>

        <label className="field-label">Notes</label>
        <textarea
          className="field-input field-textarea"
          value={form.notes || ""}
          placeholder="Add notes..."
          rows={3}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>

      <div className="panel-footer">
        <button className="btn btn-danger" onClick={() => onDelete(activity.id)}>
          Delete
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className={`btn btn-primary ${dirty ? "btn-dirty" : ""}`}
          onClick={save}
          disabled={!dirty}
        >
          {dirty ? "Save Changes" : "Saved"}
        </button>
      </div>
    </div>
  );
}
