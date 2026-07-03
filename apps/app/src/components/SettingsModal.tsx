// Настройки as a POPUP overlay (not a screen): it renders over whatever journey step
// is active, so the designer can change their profile / currency / language without
// leaving — and losing — the work in progress. Opened from the menu (store.openSettings),
// dismissed by the ✕ or a backdrop tap.
import { useStore } from "../store";
import { useT } from "../i18n/useT";
import { SettingsScreen } from "../screens/SettingsScreen";

export function SettingsModal() {
  const t = useT();
  const open = useStore((s) => s.settingsOpen);
  const close = useStore((s) => s.closeSettings);
  if (!open) return null;
  return (
    <div className="settings-modal-backdrop" onClick={close}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-x settings-modal-x" onClick={close} type="button" aria-label={t.settings.close}>
          ✕
        </button>
        <SettingsScreen />
      </div>
    </div>
  );
}
