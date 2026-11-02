"use client";

import { GraduationCap } from "lucide-react";
import { useStorageVersion } from "@/hooks/useStorage";
import { storage } from "@/lib/storage";
import { areTutorialsOn, clearSeenTutorials, setProjectTutorials } from "@/lib/tutorials";

/** Turns a project's first-visit tool tours on or off; turning them on shows every tour again. */
export function TutorialsToggle({ projectId }: { projectId: string }): React.JSX.Element {
  useStorageVersion();
  const isOn = areTutorialsOn(storage.getById("projects", projectId));
  const title = isOn
    ? "Tutorials are on: each tool shows a quick tour the first time you open it. Click to turn them off."
    : "Tutorials are off. Click to turn them on and see each tool's quick tour again.";

  function toggle() {
    if (!isOn) clearSeenTutorials(projectId);
    setProjectTutorials(projectId, !isOn);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={title}
      aria-label={title}
      aria-pressed={isOn}
      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm shrink-0 max-md:flex-1"
      style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-hover)" }}
    >
      <GraduationCap className="w-4 h-4" style={{ color: isOn ? "var(--accent)" : "var(--text-muted)" }} />
      Tutorials {isOn ? "on" : "off"}
    </button>
  );
}
