import { useState, useEffect, useRef } from "react";
import { getDocuments, uploadDocument } from "../api";

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

export default function DocumentUpload({ projectId, onProcessed }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  const isProcessing = docs.some((d) => d.status === "processing" || d.status === "uploaded");
  const hasProcessed = docs.some((d) => d.status === "processed");

  const load = async () => {
    try {
      const res = await getDocuments(projectId);
      setDocs(res.data);
      if (res.data.some((d: Doc) => d.status === "processing" || d.status === "uploaded")) {
        pollRef.current = window.setTimeout(load, 2500);
      } else if (res.data.some((d: Doc) => d.status === "processed")) {
        onProcessed();
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
    for (const file of Array.from(files)) {
      try {
        await uploadDocument(projectId, file);
      } catch (e) {
        console.error("Upload failed:", e);
      }
    }
    setUploading(false);
    load();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusIcon = (s: string) =>
    ({ uploaded: "⏳", processing: "🔄", processed: "✅", error: "❌" }[s] ?? "📄");

  const statusLabel = (s: string) =>
    ({ uploaded: "Queued", processing: "Analysing…", processed: "Processed", error: "Error" }[s] ?? s);

  const totalSize = docs.reduce((s, d) => s + (d.file_size || 0), 0);
  const processedCount = docs.filter((d) => d.status === "processed").length;

  return (
    <div className="doc-upload">
      {/* Upload zone */}
      <div
        className={`drop-zone ${dragOver ? "drop-zone-active" : ""} ${uploading ? "drop-zone-uploading" : ""}`}
        onClick={() => fileRef.current?.click()}
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
          <><div className="drop-icon">⏳</div><p><strong>Uploading files…</strong></p></>
        ) : (
          <>
            <div className="drop-icon">📂</div>
            <p><strong>Click to upload</strong> or drag & drop</p>
            <p className="drop-hint">
              PDFs, Drawings (DWG), Specifications, Schedules<br />
              Upload multiple files at once — the more you upload, the better the programme
            </p>
          </>
        )}
      </div>

      {/* Stats */}
      {docs.length > 0 && (
        <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "#64748b", padding: "4px 0" }}>
          <span>📄 <strong>{docs.length}</strong> file{docs.length > 1 ? "s" : ""}</span>
          <span>💾 <strong>{formatSize(totalSize)}</strong> total</span>
          {processedCount > 0 && <span style={{ color: "#16a34a" }}>✅ <strong>{processedCount}</strong> analysed</span>}
        </div>
      )}

      {/* AI Status / Generate button */}
      {docs.length > 0 && (
        <div className="generate-btn-wrap">
          {isProcessing ? (
            <>
              <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center" }} disabled>
                <span style={{ display: "inline-block", animation: "spin 0.8s linear infinite", marginRight: 6 }}>⟳</span>
                AI is analysing documents…
              </button>
              <p className="generate-hint">Processing may take a minute for large documents.</p>
            </>
          ) : (
            <>
              {hasProcessed && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "10px 14px", fontSize: 12, color: "#15803d", marginBottom: 8 }}>
                  ✅ <strong>Programme generated</strong> — view the Programme and Summary tabs.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Document list */}
      {docs.length > 0 && (
        <>
          <div className="doc-list-title">Uploaded Documents</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {docs.map((doc) => (
              <div key={doc.id} className={`doc-item doc-${doc.status}`}>
                <span className="doc-status-icon">{statusIcon(doc.status)}</span>
                <div className="doc-info">
                  <div className="doc-name" title={doc.filename}>{doc.filename}</div>
                  <div className="doc-meta">
                    {formatSize(doc.file_size)} · {statusLabel(doc.status)}
                  </div>
                </div>
                {(doc.status === "processing" || doc.status === "uploaded") && (
                  <div className="doc-spinner" />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
