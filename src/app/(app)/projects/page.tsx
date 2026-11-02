"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FolderOpen, Download, Upload, Loader2 } from "lucide-react";
import { storage } from "@/lib/storage";
import type { Project } from "@/types";
import { v4 as uuid } from "uuid";
import { addExamples } from "@/lib/examples";
import { useStorageVersion } from "@/hooks/useStorage";

export default function ProjectsPage() {
  const router = useRouter();
  const version = useStorageVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const projects = useMemo<Project[]>(() => storage.getAll("projects"), [version]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [withExamples, setWithExamples] = useState(true);
  const [withTutorials, setWithTutorials] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function createProject() {
    if (!name.trim() || creating) return;
    const project: Project = {
      id: uuid(),
      name: name.trim(),
      description: description.trim(),
      showTutorials: withTutorials,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.save("projects", project);
    if (withExamples) {
      setCreating(true);
      try {
        await addExamples(project.id);
      } catch (err) {
        console.error("Could not add example assets", err);
      } finally {
        setCreating(false);
      }
    }
    setName("");
    setDescription("");
    setShowNew(false);
    router.push(`/project/${project.id}/assets`);
  }

  function deleteProject(id: string) {
    if (!confirm("Delete this project and everything in it? This cannot be undone.")) return;
    storage.delete("projects", id);
  }

  function exportProject(id: string) {
    const json = storage.exportProject(id);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const project = projects.find((p) => p.id === id);
    a.download = `${project?.name || "project"}.gamedev.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importProject() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = storage.importProject(reader.result as string);
        if (result) {
          setImportError(null);
        } else {
          setImportError(`"${file.name}" isn't a GameDev Studio project file. Use a .gamedev.json file made with Export.`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  return (
    <div className="p-6 max-md:p-4 md:p-10 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-8 max-md:flex-col max-md:items-stretch max-md:mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Projects
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Each project keeps its assets separate. Create one per game.
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--yellow)" }}>
            GameDev Studio is in beta. Export your projects now and then as a backup.
          </p>
        </div>
        <div className="flex items-center gap-2 max-md:[&>button]:flex-1 max-md:[&>button]:justify-center">
          <button
            onClick={importProject}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-hover)" }}
            title="Open a project file you exported earlier (.gamedev.json)"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "var(--accent)", color: "white" }}
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </div>

      {importError && (
        <p className="mb-4 text-sm px-3 py-2 rounded-lg" role="alert" style={{ color: "var(--red)", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)" }}>
          {importError}
        </p>
      )}

      {showNew && (
        <div
          className="mb-6 p-5 rounded-xl border"
          style={{ background: "var(--bg-card)", borderColor: "var(--accent)" }}
        >
          <h3 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            New Project
          </h3>
          <input
            type="text"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm mb-2 outline-none"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && createProject()}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm mb-3 outline-none"
            style={{
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            onKeyDown={(e) => e.key === "Enter" && createProject()}
          />
          <label className="flex items-start gap-2.5 mb-4 text-sm cursor-pointer select-none" style={{ color: "var(--text-primary)" }}>
            <input
              type="checkbox"
              checked={withExamples}
              onChange={(e) => setWithExamples(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[var(--accent)]"
            />
            <span>
              Start with example assets
              <span className="block text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                A small sample game (Pip&apos;s Quest) across every tool. Remove it any time.
              </span>
            </span>
          </label>
          <TutorialChoice isOn={withTutorials} onChange={setWithTutorials} />
          <div className="flex gap-2">
            <button
              onClick={createProject}
              disabled={creating || !name.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="px-4 py-1.5 rounded-lg text-sm"
              style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 && !showNew ? (
        <div
          className="text-center py-20 rounded-xl border border-dashed"
          style={{ borderColor: "var(--border)" }}
        >
          <FolderOpen className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
          <p className="text-lg font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            No projects yet
          </p>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Create a project to start building your game assets
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--accent)", color: "white" }}
          >
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group flex items-center justify-between p-4 rounded-xl border transition-colors cursor-pointer"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              onClick={() => router.push(`/project/${project.id}/assets`)}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = "var(--border-hover)";
                e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "var(--bg-card)";
              }}
            >
              <div className="min-w-0">
                <h3 className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {project.name}
                </h3>
                {project.description && (
                  <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {project.description}
                  </p>
                )}
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    exportProject(project.id);
                  }}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                  title="Export project"
                  aria-label={`Export ${project.name}`}
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteProject(project.id);
                  }}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: "var(--red)" }}
                  title="Delete project"
                  aria-label={`Delete ${project.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Yes/No choice for the short first-visit tutorial on each tool. */
function TutorialChoice({ isOn, onChange }: { isOn: boolean; onChange(isOn: boolean): void }) {
  const option = (value: boolean, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={isOn === value}
      onClick={() => onChange(value)}
      className="px-3 py-1 rounded-md text-xs font-medium"
      style={isOn === value ? { background: "var(--accent)", color: "white" } : { color: "var(--text-primary)" }}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-start justify-between gap-3 mb-4 text-sm max-md:flex-col" style={{ color: "var(--text-primary)" }}>
      <span id="tutorial-choice-label">
        Show a short tutorial on each tool
        <span className="block text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          The first time you open a tool, see what it&apos;s for and its main features.
        </span>
      </span>
      <div role="radiogroup" aria-labelledby="tutorial-choice-label" className="flex shrink-0 p-0.5 rounded-lg" style={{ border: "1px solid var(--border)" }}>
        {option(true, "Yes")}
        {option(false, "No")}
      </div>
    </div>
  );
}
