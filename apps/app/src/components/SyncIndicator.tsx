// Subtle cloud-sync status, so the designer knows their work is saved. Only visible when
// signed in: shows "Синхронизация…" while writes are in flight, "Офлайн" if the last write
// failed, and a brief "Сохранено" flash after a successful save. Idle → hidden.

import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n/useT";

export function SyncIndicator() {
  const t = useT();
  const authUser = useStore((s) => s.authUser);
  const busy = useStore((s) => s.syncBusy);
  const error = useStore((s) => s.syncError);
  const [saved, setSaved] = useState(false);
  const [offlineFlash, setOfflineFlash] = useState(false);
  const prevBusy = useRef(busy);

  useEffect(() => {
    // busy just fell to zero with no error → flash "saved" for 2s
    if (prevBusy.current > 0 && busy === 0 && !error) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2000);
      prevBusy.current = busy;
      return () => clearTimeout(t);
    }
    prevBusy.current = busy;
  }, [busy, error]);

  // Offline is a PERSISTENT state, but a pinned badge sits on top of the hamburger. So
  // instead of showing it continuously, flash it for 2s every 30s while still offline
  // (same brief, non-blocking feel as the "saved" flash).
  useEffect(() => {
    if (!error) {
      setOfflineFlash(false);
      return;
    }
    let hideT: ReturnType<typeof setTimeout>;
    const flash = () => {
      setOfflineFlash(true);
      hideT = setTimeout(() => setOfflineFlash(false), 2000);
    };
    flash(); // show immediately when we go offline…
    const cycle = setInterval(flash, 30000); // …then a 2s blip every 30s
    return () => {
      clearTimeout(hideT);
      clearInterval(cycle);
    };
  }, [error]);

  if (!authUser) return null;

  let kind: "syncing" | "offline" | "saved" | null = null;
  if (busy > 0) kind = "syncing";
  else if (error && offlineFlash) kind = "offline";
  else if (saved) kind = "saved";
  if (!kind) return null;

  const label = kind === "syncing" ? t.sync.syncing : kind === "offline" ? t.sync.offline : t.sync.saved;
  const icon = kind === "syncing" ? "↻" : kind === "offline" ? "⚠" : "✓";

  return (
    <div className={`sync-ind sync-${kind}`} role="status" aria-live="polite">
      <span className="sync-ind-icon">{icon}</span>
      {label}
    </div>
  );
}
