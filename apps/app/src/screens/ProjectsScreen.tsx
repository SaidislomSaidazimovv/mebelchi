import { useState, useCallback } from "react";
import { useStore } from "../store";
import { useT } from "../i18n/useT";
import { listProjects, type ProjectMeta } from "../model/projects";
import { ProjectCard, RenameModal, DeleteModal } from "../components/ProjectCard";

export function ProjectsScreen() {
  const t = useT();
  const openProject = useStore((s) => s.openProject);
  const removeProject = useStore((s) => s.removeProject);
  const renameProject = useStore((s) => s.renameProject);
  const newProject = useStore((s) => s.newProject);
  const authUser = useStore((s) => s.authUser);
  const syncBusy = useStore((s) => s.syncBusy);
  const syncError = useStore((s) => s.syncError);
  useStore((s) => s.projectsRev); // re-render after save/delete/rename
  
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const projects = listProjects();

  const handleSaveRename = useCallback(
    (id: string, patch: { name: string; client: string }) => {
      renameProject(id, patch);
      setRenaming(null);
    },
    [renameProject],
  );

  const handleDelete = useCallback(
    (id: string) => {
      removeProject(id);
      setDeleting(null);
    },
    [removeProject],
  );

  return (
    <section className="screen home-grid-screen">
      <div className="var-bar">
        <h1 className="h1">{t.projects.title}</h1>
        <button className="gen-btn" onClick={newProject} type="button">
          {t.projects.new}
        </button>
      </div>

      {authUser && (
        <div className={`proj-cloud ${syncBusy > 0 ? "busy" : syncError ? "err" : "ok"}`}>
          <span className="proj-cloud-dot" />
          {syncBusy > 0 ? t.projects.cloudSyncing : syncError ? t.projects.cloudOffline : t.projects.cloudSaved}
        </div>
      )}

      {projects.length === 0 ? (
        <p className="sub" style={{ marginTop: 16 }}>
          {t.projects.empty}
        </p>
      ) : (
        <div className="hc-grid">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              p={p}
              t={t}
              onOpen={() => openProject(p.id)}
              onRename={() => setRenaming(p)}
              onDelete={() => setDeleting(p.id)}
            />
          ))}
        </div>
      )}

      {/* sticky create new project button container at the bottom */}
      <div className="hc-bottom">
        <button className="hc-new-btn" type="button" onClick={newProject}>
          {t.projects.new}
        </button>
      </div>

      {renaming && (
        <RenameModal
          p={renaming}
          t={t}
          onSave={(patch) => handleSaveRename(renaming.id, patch)}
          onCancel={() => setRenaming(null)}
        />
      )}

      {deleting && (
        <DeleteModal
          t={t}
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}
