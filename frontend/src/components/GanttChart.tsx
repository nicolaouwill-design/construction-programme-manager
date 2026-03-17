import { useEffect, useRef, useCallback } from "react";
import { gantt } from "dhtmlx-gantt";
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
import type { Activity } from "../api";

type ZoomLevel = "day" | "week" | "month" | "quarter";

interface GanttChartProps {
  activities: Activity[];
  zoom?: ZoomLevel;
  onActivityUpdate: (id: number, changes: Partial<Activity>) => void;
  onActivityAdd: (after: number) => void;
  onActivityDelete: (id: number) => void;
  onActivitySelect: (activity: Activity | null) => void;
}

export default function GanttChart({
  activities,
  zoom = "month",
  onActivityUpdate,
  onActivityDelete,
  onActivitySelect,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialised = useRef(false);
  const onActivityUpdateRef = useRef(onActivityUpdate);
  const onActivitySelectRef = useRef(onActivitySelect);
  const onActivityDeleteRef = useRef(onActivityDelete);
  useEffect(() => { onActivityUpdateRef.current = onActivityUpdate; }, [onActivityUpdate]);
  useEffect(() => { onActivitySelectRef.current = onActivitySelect; }, [onActivitySelect]);
  useEffect(() => { onActivityDeleteRef.current = onActivityDelete; }, [onActivityDelete]);

  const parseDate = (dateStr: string | undefined): string => {
    if (!dateStr) return "";
    // Handle "Fri 22/08/25" or "22/08/25" or "22/08/2025"
    let clean = dateStr.trim();
    if (clean.length > 3 && clean[3] === " " && isNaN(Number(clean[0]))) {
      clean = clean.slice(4);
    }
    // Parse DD/MM/YY or DD/MM/YYYY
    const parts = clean.split("/");
    if (parts.length === 3) {
      const [d, m, y] = parts;
      const year = y.length === 2 ? `20${y}` : y;
      return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return dateStr;
  };

  const activitiesToGantt = useCallback((acts: Activity[]) => {
    return acts.map((a) => ({
      id: a.id,
      text: a.name,
      start_date: parseDate(a.start_date) || "2025-01-01",
      duration: a.duration_days || 0,
      progress: (a.percent_complete || 0) / 100,
      parent: a.parent_id || 0,
      open: a.is_summary,
      is_summary: a.is_summary,
      is_milestone: a.is_milestone,
      is_critical: a.is_critical,
      is_near_critical: a.is_near_critical,
      resource_names: a.resource_names || "",
      indent_level: a.indent_level || 0,
      task_id: a.task_id,
      duration_weeks: a.duration_weeks,
      finish_date: a.finish_date,
      type: a.is_milestone
        ? "milestone"
        : a.is_summary
        ? "project"
        : "task",
    }));
  }, []);

  useEffect(() => {
    if (!containerRef.current || initialised.current) return;
    initialised.current = true;

    // ── Configuration ─────────────────────────────────────────────
    gantt.config.date_format = "%Y-%m-%d";
    gantt.config.xml_date = "%Y-%m-%d";
    gantt.config.work_time = true;
    gantt.config.duration_unit = "day";
    gantt.config.duration_step = 1;
    gantt.config.scale_unit = "month";
    gantt.config.date_scale = "%F %Y";
    gantt.config.subscales = [{ unit: "week", step: 1, date: "%d %M" }];
    gantt.config.scale_height = 54;
    gantt.config.row_height = 28;
    gantt.config.bar_height = 18;
    gantt.config.show_progress = true;
    gantt.config.drag_progress = true;
    gantt.config.drag_resize = true;
    gantt.config.drag_move = true;
    gantt.config.drag_links = false;
    gantt.config.multiselect = false;
    gantt.config.open_tree_initially = false;

    // Left columns
    gantt.config.columns = [
      {
        name: "task_id",
        label: "ID",
        width: 45,
        align: "center",
        template: (task: any) => task.task_id || "",
      },
      {
        name: "text",
        label: "Task Name",
        tree: true,
        width: 320,
        template: (task: any) => {
          const name = task.text || "";
          if (task.is_milestone) return `◆ ${name}`;
          return name;
        },
      },
      {
        name: "duration",
        label: "Dur (d)",
        width: 60,
        align: "center",
        template: (task: any) =>
          task.is_milestone ? "—" : `${task.duration}d`,
      },
      {
        name: "duration_weeks",
        label: "Dur (w)",
        width: 60,
        align: "center",
        template: (task: any) =>
          task.is_milestone ? "—" : `${task.duration_weeks}w`,
      },
      {
        name: "start_date",
        label: "Start",
        width: 90,
        align: "center",
        template: (task: any) => {
          if (!task.start_date) return "";
          const d = gantt.date.date_to_str("%d/%m/%y")(task.start_date);
          return d;
        },
      },
      {
        name: "finish_date_col",
        label: "Finish",
        width: 90,
        align: "center",
        template: (task: any) => {
          const fin =
            task.finish_date ||
            (task.end_date
              ? gantt.date.date_to_str("%d/%m/%y")(task.end_date)
              : "");
          return fin;
        },
      },
      {
        name: "progress_col",
        label: "% Comp",
        width: 65,
        align: "center",
        template: (task: any) =>
          task.is_summary ? "" : `${Math.round((task.progress || 0) * 100)}%`,
      },
      {
        name: "resource_names",
        label: "Resources",
        width: 140,
        template: (task: any) => task.resource_names || "",
      },
    ];

    // ── Bar styling ───────────────────────────────────────────────
    gantt.templates.task_class = (_start: Date, _end: Date, task: any) => {
      if (task.is_summary) return "gantt-summary";
      if (task.is_milestone) return "gantt-milestone-bar";
      if (task.is_critical) return "gantt-critical";
      if (task.is_near_critical) return "gantt-near-critical";
      return "gantt-normal";
    };

    gantt.templates.grid_row_class = (_start: Date, _end: Date, task: any) => {
      if (task.is_summary) return "grid-summary";
      if (task.is_milestone) return "grid-milestone";
      return "";
    };

    gantt.templates.task_text = (_start: Date, _end: Date, task: any) => {
      if (task.is_milestone) return "";
      return task.text || "";
    };

    // ── Tooltip ───────────────────────────────────────────────────
    gantt.templates.tooltip_text = (_start: Date, _end: Date, task: any) => {
      return `<b>${task.text}</b><br/>
        Duration: ${task.is_milestone ? "Milestone" : `${task.duration}d / ${task.duration_weeks}w`}<br/>
        Progress: ${Math.round((task.progress || 0) * 100)}%<br/>
        ${task.resource_names ? `Resources: ${task.resource_names}` : ""}`;
    };

    // ── Events ────────────────────────────────────────────────────
    gantt.attachEvent("onAfterTaskUpdate", (id: number, task: any) => {
      const dur = task.duration || 0;
      const weeks = Math.round((dur / 6) * 10) / 10;
      const finStr = task.end_date ? gantt.date.date_to_str("%d/%m/%y")(task.end_date) : "";
      const startStr = task.start_date ? gantt.date.date_to_str("%d/%m/%y")(task.start_date) : "";
      onActivityUpdateRef.current(id, {
        name: task.text,
        duration_days: dur,
        duration_weeks: weeks,
        start_date: startStr,
        finish_date: finStr,
        percent_complete: Math.round((task.progress || 0) * 100),
      });
    });

    gantt.attachEvent("onTaskSelected", (id: number) => {
      const task = gantt.getTask(id);
      // Build activity object directly from gantt task data (avoids stale closure)
      const act: Activity = {
        id: Number(id),
        task_id: task.task_id || Number(id),
        name: task.text || "",
        duration_days: task.duration || 0,
        duration_weeks: task.duration_weeks || 0,
        start_date: task.start_date ? gantt.date.date_to_str("%d/%m/%y")(task.start_date) : "",
        finish_date: task.end_date ? gantt.date.date_to_str("%d/%m/%y")(task.end_date) : (task.finish_date || ""),
        percent_complete: Math.round((task.progress || 0) * 100),
        resource_names: task.resource_names || "",
        parent_id: task.parent || undefined,
        indent_level: task.indent_level || 0,
        is_summary: !!task.is_summary,
        is_milestone: !!task.is_milestone,
        is_critical: !!task.is_critical,
        is_near_critical: !!task.is_near_critical,
        sort_order: 0,
        notes: task.notes || "",
      };
      onActivitySelectRef.current(act);
    });

    gantt.attachEvent("onEmptyClick", () => {
      onActivitySelectRef.current(null);
    });

    gantt.attachEvent("onAfterTaskDelete", (id: number) => {
      onActivityDeleteRef.current(id);
    });

    gantt.init(containerRef.current);

    // Load data
    const tasks = activitiesToGantt(activities);
    gantt.parse({ data: tasks, links: [] });

    return () => {
      // Cleanup
    };
  }, []); // eslint-disable-line

  // Update gantt when activities change
  useEffect(() => {
    if (!initialised.current) return;
    try {
      const tasks = activitiesToGantt(activities);
      gantt.clearAll();
      gantt.parse({ data: tasks, links: [] });
    } catch {}
  }, [activities, activitiesToGantt]);

  // Update zoom level
  useEffect(() => {
    if (!initialised.current) return;
    try {
      if (zoom === "day") {
        gantt.config.scale_unit = "day";
        gantt.config.date_scale = "%d %M";
        gantt.config.subscales = [{ unit: "week", step: 1, date: "Wk %W" }];
        gantt.config.scale_height = 54;
      } else if (zoom === "week") {
        gantt.config.scale_unit = "week";
        gantt.config.date_scale = "Wk %W %Y";
        gantt.config.subscales = [{ unit: "day", step: 1, date: "%d" }];
        gantt.config.scale_height = 54;
      } else if (zoom === "month") {
        gantt.config.scale_unit = "month";
        gantt.config.date_scale = "%F %Y";
        gantt.config.subscales = [{ unit: "week", step: 1, date: "%d %M" }];
        gantt.config.scale_height = 54;
      } else if (zoom === "quarter") {
        gantt.config.scale_unit = "quarter";
        gantt.config.date_scale = "Q%q %Y";
        gantt.config.subscales = [{ unit: "month", step: 1, date: "%M" }];
        gantt.config.scale_height = 54;
      }
      gantt.render();
    } catch {}
  }, [zoom]);

  return (
    <>
      <style>{`
        /* ── Gantt global overrides ────────────────────────────── */
        .gantt_container { font-family: 'Calibri', sans-serif !important; font-size: 12px; border: none; }
        .gantt_grid_head_cell { background: #1F3864; color: #fff; font-weight: 600; font-size: 11px; border-color: #334; }
        .gantt_scale_cell { background: #1F3864; color: #fff; border-color: #334; font-size: 11px; }
        .gantt_second_scale .gantt_scale_cell { background: #2c4b82; font-size: 10px; }
        .gantt_row:hover .gantt_cell { background: #dbeafe !important; }

        /* Summary rows */
        .grid-summary .gantt_cell { background: #1F3864 !important; color: #fff !important; font-weight: 700 !important; }
        .gantt-summary { background: #1F3864 !important; border-radius: 0 !important; height: 14px !important; }
        .gantt-summary .gantt_task_progress { background: rgba(255,255,255,0.3) !important; }
        .gantt-summary .gantt_task_content { color: #fff !important; font-weight: 700 !important; font-size: 10px !important; }

        /* Milestone rows */
        .grid-milestone .gantt_cell { background: #f0e6fa !important; font-weight: 600 !important; }

        /* Activity bar colours */
        .gantt-normal .gantt_task_progress_drag,
        .gantt-normal { background: #2F75B6 !important; border-color: #1a5a9a !important; border-radius: 3px !important; }
        .gantt-normal .gantt_task_progress { background: #70AD47 !important; }
        .gantt-normal .gantt_task_content { color: #fff !important; font-size: 10px !important; }

        .gantt-critical { background: #C00000 !important; border-color: #900000 !important; border-radius: 3px !important; }
        .gantt-critical .gantt_task_progress { background: #ff6666 !important; }
        .gantt-critical .gantt_task_content { color: #fff !important; font-size: 10px !important; }

        .gantt-near-critical { background: #E26B0A !important; border-color: #b35500 !important; border-radius: 3px !important; }
        .gantt-near-critical .gantt_task_progress { background: #ffaa55 !important; }
        .gantt-near-critical .gantt_task_content { color: #fff !important; font-size: 10px !important; }

        /* Milestone diamond */
        .gantt-milestone-bar { background: transparent !important; border: none !important; }
        .gantt_milestone { background: #7030A0 !important; border-color: #5a2080 !important; }

        /* Today line */
        .gantt_marker.today { background: rgba(255,50,50,0.8); width: 2px; }
        .gantt_marker_content { background: #C00000; color: #fff; font-size: 10px; padding: 2px 4px; border-radius: 2px; }

        /* Row alternating */
        .gantt_row.odd { background: #f0f7ff; }
        .gantt_task_row.odd { background: #f0f7ff; }

        /* Tree arrows */
        .gantt_tree_icon.gantt_open { background-color: transparent; }
        .gantt_tree_icon.gantt_close { background-color: transparent; }
        .gantt_grid_head_tree { background: #1F3864 !important; }
      `}</style>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </>
  );
}
