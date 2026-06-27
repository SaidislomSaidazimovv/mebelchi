// "На главную" — landing screen: start a new project or jump back into a recent
// one. Projects are saved automatically as you work (model/projects.ts).
import { useStore } from "../store";
import { listProjects } from "../model/projects";

export function HomeScreen() {
  const newProject = useStore((s) => s.newProject);
  const goTo = useStore((s) => s.goTo);
  const openProject = useStore((s) => s.openProject);
  useStore((s) => s.projectsRev); // re-render when the project list changes
  const recent = listProjects().slice(0, 3);

  return (
    <section className="screen home">
      <div className="qblock">
        <div className="qnum">Mebelchi</div>
        <h1 className="h1">Спроектируйте кухню</h1>
        <p className="sub">Опишите комнату — получите готовые раскладки с ценой и 3D.</p>
      </div>

      <button className="gen-btn-lg" onClick={newProject} type="button">
        + Новый проект
      </button>

      {recent.length > 0 && (
        <div className="home-recent">
          <div className="menu-sec-title">Недавние</div>
          {recent.map((p) => (
            <button key={p.id} className="proj-row" onClick={() => openProject(p.id)} type="button">
              <span className="proj-row-name">{p.name}</span>
              <span className="proj-row-date">{new Date(p.updatedAt).toLocaleDateString("ru-RU")}</span>
            </button>
          ))}
          <button className="link-btn" onClick={() => goTo("projects")} type="button">
            Все проекты →
          </button>
        </div>
      )}
    </section>
  );
}
