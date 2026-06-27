// "Мои проекты" — saved designs. Tap to open (resumes where you left off); the ✕
// asks once before deleting. "+ Новый" starts a fresh project.
import { useState } from "react";
import { useStore } from "../store";
import { listProjects } from "../model/projects";

export function ProjectsScreen() {
  const openProject = useStore((s) => s.openProject);
  const removeProject = useStore((s) => s.removeProject);
  const newProject = useStore((s) => s.newProject);
  useStore((s) => s.projectsRev); // re-render after save/delete
  const [pending, setPending] = useState<string | null>(null);
  const projects = listProjects();

  return (
    <section className="screen">
      <div className="var-bar">
        <h1 className="h1">Мои проекты</h1>
        <button className="gen-btn" onClick={newProject} type="button">
          + Новый
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="sub" style={{ marginTop: 16 }}>
          Пока нет сохранённых проектов. Создайте новый — он сохранится автоматически.
        </p>
      ) : (
        <div className="proj-list">
          {projects.map((p) => (
            <div className={`proj-card${pending === p.id ? " confirming" : ""}`} key={p.id}>
              <button className="proj-card-main" onClick={() => openProject(p.id)} type="button">
                <span className="proj-card-name">{p.name}</span>
                <span className="proj-card-meta">обновлён {new Date(p.updatedAt).toLocaleDateString("ru-RU")}</span>
              </button>
              {pending === p.id ? (
                <div className="proj-confirm">
                  <button className="proj-confirm-yes" onClick={() => removeProject(p.id)} type="button">
                    Удалить
                  </button>
                  <button className="proj-confirm-no" onClick={() => setPending(null)} type="button">
                    Отмена
                  </button>
                </div>
              ) : (
                <button className="proj-del" onClick={() => setPending(p.id)} type="button" aria-label="Удалить">
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
