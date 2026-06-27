import { useStore, type Screen } from "./store";
import { MenuButton } from "./components/MenuButton";
import { Footer } from "./components/Footer";
import { Toast } from "./components/Toast";
import { Menu } from "./components/Menu";
import { QuizScreen } from "./screens/QuizScreen";
import { SummaryScreen } from "./screens/SummaryScreen";
import { SpaceScreen } from "./screens/SpaceScreen";
import { RoomScene } from "./screens/RoomScene";
import { VariantsScreen } from "./screens/VariantsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { ConfigScreen } from "./screens/ConfigScreen";
import { Placeholder } from "./screens/Placeholder";

// Screens not yet built render as placeholders (one phase at a time).
const PLACEHOLDERS: Record<
  Exclude<Screen, "home" | "projects" | "quiz" | "summary" | "space" | "details" | "variants" | "configure">,
  { phase: string; title: string }
> = {
  engineering: { phase: "Фаза Г · Инженерия", title: "Узлы и усиления" },
  cost: { phase: "Фаза Д · Смета", title: "Смета и оптимизация" },
  handoff: { phase: "Фаза Е · Передача", title: "Готово к станку" },
};

export default function App() {
  const screen = useStore((s) => s.screen);

  // the room scene + constructor carry their own chrome (step/price bar + toolbar),
  // no standard footer
  if (screen === "details" || screen === "configure") {
    return (
      <div className="app">
        <MenuButton />
        {screen === "details" ? <RoomScene /> : <ConfigScreen />}
        <Toast />
        <Menu />
      </div>
    );
  }

  // home / projects sit outside the journey — no step footer
  if (screen === "home" || screen === "projects") {
    return (
      <div className="app">
        <MenuButton />
        <main className="body">{screen === "home" ? <HomeScreen /> : <ProjectsScreen />}</main>
        <Toast />
        <Menu />
      </div>
    );
  }

  return (
    <div className="app">
      <MenuButton />
      <main className="body">
        {screen === "quiz" ? (
          <QuizScreen />
        ) : screen === "summary" ? (
          <SummaryScreen />
        ) : screen === "space" ? (
          <SpaceScreen />
        ) : screen === "variants" ? (
          <VariantsScreen />
        ) : (
          <Placeholder {...PLACEHOLDERS[screen]} />
        )}
      </main>
      <Footer />
      <Toast />
      <Menu />
    </div>
  );
}
