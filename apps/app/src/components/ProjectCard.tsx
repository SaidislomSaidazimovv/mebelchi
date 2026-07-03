import { useState, useRef, useEffect } from "react";
import { type ProjectMeta } from "../model/projects";
import { useT } from "../i18n/useT";

/* ── 3-dot dropdown menu ────────────────────────────────────── */
function CardMenu({
  onRename,
  onDelete,
  t,
}: {
  onRename: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useT>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="hc-menu-wrap" ref={ref}>
      <button
        className="hc-dots"
        type="button"
        aria-label="Menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="4" r="1.6" fill="currentColor" />
          <circle cx="10" cy="10" r="1.6" fill="currentColor" />
          <circle cx="10" cy="16" r="1.6" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="hc-dropdown">
          <button
            className="hc-drop-item"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onRename();
            }}
          >
            {t.projects.edit}
          </button>
          <button
            className="hc-drop-item hc-drop-danger"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
          >
            {t.projects.del}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── project card ───────────────────────────────────────────── */
export function ProjectCard({
  p,
  t,
  onOpen,
  onRename,
  onDelete,
}: {
  p: ProjectMeta;
  t: ReturnType<typeof useT>;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="hc-card" onClick={onOpen}>
      {/* thumbnail – 3D screenshot or fallback icon */}
      <div className="hc-thumb">
        {p.thumbnail ? (
          <img className="hc-thumb-img" src={p.thumbnail} alt={p.name} />
        ) : (
          <svg className="hc-thumb-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="16" width="40" height="24" rx="2" />
            <path d="M8 16V12a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v4" />
            <line x1="16" y1="16" x2="16" y2="40" />
            <line x1="32" y1="16" x2="32" y2="40" />
            <circle cx="24" cy="28" r="3" />
          </svg>
        )}
      </div>

      <div className="hc-card-body">
        <div className="hc-card-info">
          <span className="hc-card-name">{p.name}</span>
          <span className="hc-card-date">
            {new Date(p.updatedAt).toLocaleDateString("ru-RU")}
          </span>
        </div>
        <CardMenu onRename={onRename} onDelete={onDelete} t={t} />
      </div>
    </div>
  );
}

/* ── inline rename modal ────────────────────────────────────── */
export function RenameModal({
  p,
  t,
  onSave,
  onCancel,
}: {
  p: ProjectMeta;
  t: ReturnType<typeof useT>;
  onSave: (patch: { name: string; client: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(p.name);
  const [client, setClient] = useState(p.client ?? "");

  return (
    <div className="hc-rename-backdrop" onClick={onCancel}>
      <div className="hc-rename-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="hc-rename-title">{t.projects.edit}</h3>
        <input
          className="set-input hc-rename-input"
          value={name}
          placeholder={t.projects.name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <input
          className="set-input hc-rename-input"
          value={client}
          placeholder={t.projects.client}
          onChange={(e) => setClient(e.target.value)}
        />
        <div className="hc-rename-actions">
          <button className="hc-rename-cancel" type="button" onClick={onCancel}>
            {t.projects.cancel}
          </button>
          <button
            className="hc-rename-save"
            type="button"
            onClick={() => onSave({ name, client })}
          >
            {t.projects.save}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── delete confirmation modal ──────────────────────────────── */
export function DeleteModal({
  t,
  onConfirm,
  onCancel,
}: {
  t: ReturnType<typeof useT>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="hc-rename-backdrop" onClick={onCancel}>
      <div className="hc-rename-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="hc-rename-title">{t.projects.del}?</h3>
        <div className="hc-rename-actions">
          <button className="hc-rename-cancel" type="button" onClick={onCancel}>
            {t.projects.cancel}
          </button>
          <button className="hc-rename-save hc-rename-danger" type="button" onClick={onConfirm}>
            {t.projects.del}
          </button>
        </div>
      </div>
    </div>
  );
}
