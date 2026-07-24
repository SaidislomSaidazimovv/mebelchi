import { useStore } from "./store";
import { MenuButton } from "./components/MenuButton";
import { Footer } from "./components/Footer";
import { Toast } from "./components/Toast";
import { Menu } from "./components/Menu";
import { QuizScreen } from "./screens/QuizScreen";
import { SpaceScreen } from "./screens/SpaceScreen";
import { RoomScene } from "./screens/RoomScene";
import { VariantsScreen } from "./screens/VariantsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ConfigScreen } from "./screens/ConfigScreen";
import { PreviewScreen } from "./screens/PreviewScreen";
import { EngineeringScreen } from "./screens/EngineeringScreen";
import { CostScreen } from "./screens/CostScreen";
import { HandoffScreen } from "./screens/HandoffScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { SetPasswordScreen } from "./screens/SetPasswordScreen";
import { SyncIndicator } from "./components/SyncIndicator";
import { LoginNudge } from "./components/LoginNudge";
import { SettingsModal } from "./components/SettingsModal";
import { KarkasOverlay } from "./three/KarkasEditor";
import { isSupabaseConfigured } from "./lib/supabase";

export default function App() {
  return (
    <>
      <AppScreens />
      {/* The karkas editor is a FULL-SCREEN overlay, so it belongs outside the screen switch. Mounted
          inside the details/configure/preview branch it silently unmounted the moment the app changed
          screen — while its own `open` flag stayed true — so an edit in progress vanished and then
          reappeared unbidden on the way back. Its own `open` is now the single thing that decides
          whether it is on screen. */}
      <KarkasOverlay />
    </>
  );
}

function AppScreens() {
  const screen = useStore((s) => s.screen);
  const authReady = useStore((s) => s.authReady);
  const recovery = useStore((s) => s.recovery);

  // GUEST-FIRST: no login wall. While Supabase checks for an existing session, show a brief
  // splash; a password-recovery link still forces the "set a new password" screen. Otherwise
  // the app runs for guests (localStorage) — sign in from the menu / the nudge to sync.
  if (isSupabaseConfigured) {
    if (!authReady) {
      return (
        <div className="app">
          <main className="body">
            <div className="auth-splash">Загрузка…</div>
          </main>
        </div>
      );
    }
    if (recovery) {
      return (
        <div className="app">
          <main className="body">
            <SetPasswordScreen />
          </main>
        </div>
      );
    }
  }

  // login / registration — reachable from the menu (or the soft nudge), not forced
  if (screen === "auth") {
    return (
      <div className="app">
        <main className="body">
          <AuthScreen />
        </main>
        <Toast />
      </div>
    );
  }

  // the room scene + constructor carry their own chrome (step/price bar + toolbar),
  // no standard footer
  if (screen === "details" || screen === "configure" || screen === "preview") {
    return (
      <div className="app">
        <MenuButton />
        {screen === "details" ? <RoomScene /> : screen === "configure" ? <ConfigScreen /> : <PreviewScreen />}
        <SyncIndicator />
        <Toast />
        <Menu />
        <SettingsModal />
        <LoginNudge />
      </div>
    );
  }

  // home / projects / settings sit outside the journey — no step footer
  if (screen === "home" || screen === "projects" || screen === "settings") {
    return (
      <div className="app">
        <MenuButton />
        <main className="body">
          {screen === "home" ? <HomeScreen /> : screen === "projects" ? <ProjectsScreen /> : <SettingsScreen />}
        </main>
        <SyncIndicator />
        <Toast />
        <Menu />
        <SettingsModal />
        <LoginNudge />
      </div>
    );
  }

  return (
    <div className="app">
      <MenuButton />
      <main className="body">
        {screen === "quiz" ? (
          <QuizScreen />
        ) : screen === "space" ? (
          <SpaceScreen />
        ) : screen === "variants" ? (
          <VariantsScreen />
        ) : screen === "engineering" ? (
          <EngineeringScreen />
        ) : screen === "cost" ? (
          <CostScreen />
        ) : screen === "handoff" ? (
          <HandoffScreen />
        ) : null}
      </main>
      <Footer />
      <Toast />
      <Menu />
      <SettingsModal />
    </div>
  );
}
