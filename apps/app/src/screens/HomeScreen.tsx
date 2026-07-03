// "На главную" — landing: greet the designer, start a new project, or jump back into
// a recent one. Projects save automatically as you work (model/projects.ts); the
// profile nudge points first-time users to Настройки.
import { useState, useCallback } from "react";
import { useStore } from "../store";
import { useT } from "../i18n/useT";
import { listProjects, type ProjectMeta } from "../model/projects";
import { profileComplete } from "../model/settings";

import { ProjectCard, RenameModal, DeleteModal } from "../components/ProjectCard";

type SortMode = "date" | "name";

/* ── main screen ────────────────────────────────────────────── */
export function HomeScreen() {
  const t = useT();
  const newProject = useStore((s) => s.newProject);
  const openSettings = useStore((s) => s.openSettings);
  const openProject = useStore((s) => s.openProject);
  const removeProject = useStore((s) => s.removeProject);
  const renameProject = useStore((s) => s.renameProject);
  const settings = useStore((s) => s.settings);
  useStore((s) => s.projectsRev); // re-render when the project list changes

  const [sort, setSort] = useState<SortMode>("date");
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const all = listProjects();

  const sorted = [...all].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt,
  );

  const firstName = settings.name.trim().split(/\s+/)[0];
  const hello = firstName ? t.home.greetingName(firstName) : t.home.greeting;

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
    <section className="screen home home-grid-screen">
      {/* header */}
      <div className="qblock">
        <div className="qnum">Mebelchi</div>
        <h1 className="h1">{hello}</h1>
        <p className="sub">{t.home.sub}</p>
      </div>

      {!profileComplete(settings) && (
        <button className="home-nudge" onClick={openSettings} type="button">
          <span>{t.home.nudge}</span>
          <span className="home-nudge-sub">{t.home.nudgeSub}</span>
        </button>
      )}

      {all.length > 0 ? (
        <>
          {/* filter pills */}
          <div className="hc-filters">
            <button
              className={`hc-filter-pill${sort === "date" ? " on" : ""}`}
              type="button"
              onClick={() => setSort("date")}
            >
              {t.home.recent}
            </button>
            <button
              className={`hc-filter-pill${sort === "name" ? " on" : ""}`}
              type="button"
              onClick={() => setSort("name")}
            >
              A–Z
            </button>
          </div>

          {/* 2-column card grid */}
          <div className="hc-grid">
            {sorted.map((p) => (
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
        </>
      ) : (
        <p className="sub home-empty">{t.home.empty}</p>
      )}

      {/* sticky bottom "New project" CTA */}
      <div className="hc-bottom-cta">
        <button className="hc-new-btn" onClick={newProject} type="button">
          {t.home.newProject}
        </button>
      </div>

      {/* rename modal */}
      {renaming && (
        <RenameModal
          p={renaming}
          t={t}
          onSave={(patch) => handleSaveRename(renaming.id, patch)}
          onCancel={() => setRenaming(null)}
        />
      )}

      {/* delete confirmation */}
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
