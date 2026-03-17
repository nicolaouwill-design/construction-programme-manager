import { useState, useEffect, useRef } from "react";
import {
  getDocuments, uploadDocument, generateProgramme,
  deleteDocument, cancelDocument, reprocessDocument,
} from "../api";

interface Doc {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  status: string;
  uploaded_at: string;
}

interface Props {
  projectId: number;
  onProcessed: () => void;
}

const STATUS_ORDER = ["uploaded", "processing", "processed", "cancelled", "error"];

function statusBadge(s: string) {
  const map: Record<string, { label: string; cls: string }> = {
    uploaded:   { label: "Queued",      cls: "badge-queued" },
    processing: { label: "Analysing",   cls: "badge-processing" },
    processed:  { label: "Processed",   cls: "badge-processed" },
    cancelled:  { label: "Cancelled",   cls: "badge-cancelled" },
    error:      { label: "Error",       cls: "badge-error" },
  };
  const b = map[s] ?? { label: s, cls: "" };
  return <span className={`doc-badge ${b.cls}`}>{b.label}</span>;
}

function fileIcon(filename: string, fileType: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "📄";
  if (["dwg", "dxf"].includes(ext)) return "📐";
  if (["xlsx", "xls", "csv"].includes(ext)) return "📊";
  if (["docx", "doc"].includes(ext)) return "📝";
  if (["mpp", "xml"].includes(ext)) return "📅";
  if (fileType?.includes("image")) return "🖼";
  return "📁";
}

function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DocumentUpload({ projectId, onProcessed }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  const isProcessing = docs.some((d) => d.status === "processing" || d.status === "uploaded");
  const hasProcessed = docs.some((d) => d.status === "processed");
  const processedCount = docs.filter((d) => d.status === "processed").length;
  const errorCount = docs.filter((d) => d.status === "error").length;
  const cancelledCount = docs.filter((d) => d.status === "cancelled").length;
  const processingCount = docs.filter((d) => d.status === "processing" || d.status === "uploaded").length;

  const load = async () => {
    try {
      const res = await getDocuments(projectId);
      setDocs(res.data);
      if (res.data.some((d: Doc) => d.status === "processing" || d.status === "uploaded")) {
        pollRef.current = window.setTimeout(load, 2500);
      }
    } catch {}
  };

  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [projectId]); // eslint-disable-line

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadErrors([]);
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      try {
        setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));
        await uploadDocument(projectId, file, (pct) => {
          setUploadProgress((prev) => ({ ...prev, [file.name]: pct }));
        });
        setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }));
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || `Failed to upload ${file.name}`;
        errors.push(String(msg));
      }
    }

    setUploading(false);
    setUploadProgress({});
    if (errors.length) setUploadErrors(errors);
    if (pollRef.current) clearTimeout(pollRef.current);
    load();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError("");
    try {
      await generateProgramme(projectId);
      const poll = () => {
        getDocuments(projectId).then((res) => {
          setDocs(res.data);
          if (res.data.some((d: Doc) => d.status === "processing" || d.status === "uploaded")) {
            pollRef.current = window.setTimeout(poll, 2500);
          } else {
            setGenerating(false);
            onProcessed();
          }
        }).catch(() => setGenerating(false));
      };
      pollRef.current = window.setTimeout(poll, 1500);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || "Failed to start generation";
      setGenerateError(String(msg));
      setGenerating(false);
    }
  };

  const handleDelete = async (doc: Doc) => {
    if (!confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return;
    setActionLoading((p) => ({ ...p, [doc.id]: "delete" }));
    try {
      await deleteDocument(projectId, doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {}
    setActionLoading((p) => { const n = { ...p }; delete n[doc.id]; return n; });
  };

  const handleCancel = async (doc: Doc) => {
    setActionLoading((p) => ({ ...p, [doc.id]: "cancel" }));
    try {
      await cancelDocument(projectId, doc.id);
      setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, status: "cancelled" } : d));
    } catch {}
    setActionLoading((p) => { const n = { ...p }; delete n[doc.id]; return n; });
  };

  const handleReprocess = async (doc: Doc) => {
    setActionLoading((p) => ({ ...p, [doc.id]: "reprocess" }));
    try {
      await reprocessDocument(projectId, doc.id);
      setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, status: "uploaded" } : d));
      if (pollRef.current) clearTimeout(pollRef.current);
      load();
    } catch {}
    setActionLoading((p) => { const n = { ...p }; delete n[doc.id]; return n; });
  };

  const handleDeleteAllErrors = async () => {
    const errorDocs = docs.filter((d) => d.status === "error" || d.status === "cancelled");
    if (!errorDocs.length) return;
    if (!confirm(`Delete ${errorDocs.length} failed/cancelled document(s)?`)) return;
    for (const doc of errorDocs) {
      try { await deleteDocument(projectId, doc.id); } catch {}
    }
    setDocs((prev) => prev.filter((d) => d.status !== "error" && d.status !== "cancelled"));
  };

  const filteredDocs = statusFilter === "all"
    ? [...docs].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
    : docs.filter((d) => d.status === statusFilter);

  return (
    <div className="doc-control">
      {/* ── Upload Zone ── */}
      <div
        className={`drop-zone ${dragOver ? "drop-zone-active" : ""} ${uploading ? "drop-zone-uploading" : ""}`}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx,.xls,.mpp,.xml,.dwg,.dxf"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <>
            <div className="drop-icon">⏳</div>
            <p><strong>Uploading…</strong></p>
            {Object.entries(uploadProgress).map(([name, pct]) => (
              <div key={name} className="upload-progress-row">
                <div className="upload-progress-name">{name}</div>
                <div className="upload-progress-bar">
                  <div className="upload-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="upload-progress-pct">{pct}%</div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="drop-icon">📂</div>
            <p><strong>Click to upload</strong> or drag &amp; drop</p>
            <p className="drop-hint">PDFs, Drawings, Specifications, Schedules, Contracts — any size, multiple files</p>
          </>
        )}
      </div>

      {/* Upload errors */}
      {uploadErrors.length > 0 && (
        <div className="alert alert-error">
          <strong>Upload failed:</strong>
          <ul>{uploadErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      {/* ── Stats Bar ── */}
      {docs.length > 0 && (
        <div className="doc-stats-bar">
          <div className="doc-stat">
            <span className="doc-stat-val">{docs.length}</span>
            <span className="doc-stat-label">Total</span>
          </div>
          <div className="doc-stat">
            <span className="doc-stat-val" style={{ color: "#16a34a" }}>{processedCount}</span>
            <span className="doc-stat-label">Processed</span>
          </div>
          {processingCount > 0 && (
            <div className="doc-stat">
              <span className="doc-stat-val" style={{ color: "#2563eb" }}>{processingCount}</span>
              <span className="doc-stat-label">Analysing</span>
            </div>
          )}
          {errorCount > 0 && (
            <div className="doc-stat">
              <span className="doc-stat-val" style={{ color: "#dc2626" }}>{errorCount}</span>
              <span className="doc-stat-label">Failed</span>
            </div>
          )}
          {cancelledCount > 0 && (
            <div className="doc-stat">
              <span className="doc-stat-val" style={{ color: "#9ca3af" }}>{cancelledCount}</span>
              <span className="doc-stat-label">Cancelled</span>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <span className="doc-stat-total-size">{formatSize(docs.reduce((s, d) => s + (d.file_size || 0), 0))}</span>
        </div>
      )}

      {/* ── Generate / Action Bar ── */}
      {docs.length > 0 && (
        <div className="doc-action-bar">
          {(isProcessing || generating) ? (
            <div className="doc-analysing-row">
              <span className="doc-spinner-inline" />
              <span>AI is analysing documents…</span>
              <span className="doc-analysing-hint">Scroll down to cancel individual files</span>
            </div>
          ) : (
            <>
              {generateError && <div className="alert alert-error">{generateError}</div>}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={handleGenerate}
                  disabled={processedCount === 0}
                >
                  Generate Programme
                </button>
                {hasProcessed && (
                  <button className="btn btn-secondary" onClick={onProcessed}>
                    View Programme →
                  </button>
                )}
                {(errorCount > 0 || cancelledCount > 0) && (
                  <button className="btn btn-ghost btn-danger-ghost" onClick={handleDeleteAllErrors}>
                    Delete Failed ({errorCount + cancelledCount})
                  </button>
                )}
                {processedCount === 0 && (
                  <span className="doc-hint-text">Wait for documents to finish processing</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Document Table ── */}
      {docs.length > 0 && (
        <div className="doc-table-wrap">
          <div className="doc-table-header">
            <h3 className="doc-table-title">Document Register</h3>
            <div className="doc-filter-tabs">
              {["all", "processing", "processed", "error", "cancelled"].map((f) => {
                const count = f === "all" ? docs.length
                  : f === "processing" ? processingCount
                  : f === "processed" ? processedCount
                  : f === "error" ? errorCount
                  : cancelledCount;
                if (count === 0 && f !== "all") return null;
                return (
                  <button
                    key={f}
                    className={`doc-filter-tab ${statusFilter === f ? "active" : ""}`}
                    onClick={() => setStatusFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                    <span className="doc-filter-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <table className="doc-table">
            <thead>
              <tr>
                <th className="doc-th">Document</th>
                <th className="doc-th doc-th-size">Size</th>
                <th className="doc-th doc-th-date">Uploaded</th>
                <th className="doc-th doc-th-status">Status</th>
                <th className="doc-th doc-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => {
                const loading = actionLoading[doc.id];
                return (
                  <tr key={doc.id} className={`doc-row doc-row-${doc.status}`}>
                    <td className="doc-td doc-td-name">
                      <span className="doc-file-icon">{fileIcon(doc.filename, doc.file_type)}</span>
                      <span className="doc-filename" title={doc.filename}>{doc.filename}</span>
                    </td>
                    <td className="doc-td doc-td-size">{formatSize(doc.file_size)}</td>
                    <td className="doc-td doc-td-date">{formatDate(doc.uploaded_at)}</td>
                    <td className="doc-td doc-td-status">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {statusBadge(doc.status)}
                        {(doc.status === "processing" || doc.status === "uploaded") && (
                          <span className="doc-row-spinner" />
                        )}
                      </div>
                    </td>
                    <td className="doc-td doc-td-actions">
                      {(doc.status === "processing" || doc.status === "uploaded") && (
                        <button
                          className="doc-action-btn doc-btn-cancel"
                          onClick={() => handleCancel(doc)}
                          disabled={!!loading}
                          title="Cancel analysis"
                        >
                          {loading === "cancel" ? "…" : "Cancel"}
                        </button>
                      )}
                      {(doc.status === "error" || doc.status === "cancelled") && (
                        <>
                          <button
                            className="doc-action-btn doc-btn-retry"
                            onClick={() => handleReprocess(doc)}
                            disabled={!!loading}
                            title="Retry analysis"
                          >
                            {loading === "reprocess" ? "…" : "Retry"}
                          </button>
                          <button
                            className="doc-action-btn doc-btn-delete"
                            onClick={() => handleDelete(doc)}
                            disabled={!!loading}
                            title="Delete document"
                          >
                            {loading === "delete" ? "…" : "Delete"}
                          </button>
                        </>
                      )}
                      {doc.status === "processed" && (
                        <button
                          className="doc-action-btn doc-btn-delete"
                          onClick={() => handleDelete(doc)}
                          disabled={!!loading}
                          title="Remove document"
                        >
                          {loading === "delete" ? "…" : "Remove"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
