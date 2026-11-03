"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FolderOpen, Download, Upload, Loader2, ExternalLink } from "lucide-react";
import { storage } from "@/lib/storage";
import type { Project } from "@/types";
import { v4 as uuid } from "uuid";
import { addExamples } from "@/lib/examples";
import { useStorageVersion } from "@/hooks/useStorage";
import { APP, OTHER_APP, belongsToApp } from "@/lib/app-config";
import { COPY } from "@/copy";

export default function ProjectsPage() {
  const router = useRouter();
  const version = useStorageVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allProjects = useMemo<Project[]>(() => storage.getAll("projects"), [version]);
  const projects = allProjects.filter((p) => belongsToApp(p));
  const otherAppProjects = allProjects.filter((p) => !belongsToApp(p));
  const [showOtherApp, setShowOtherApp] = useState(false);
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
      app: APP.id,
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
    a.download = `${project?.name || "project"}${COPY.projects.exportExtension}`;
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
          setImportError(COPY.projects.importError(file.name));
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
            {COPY.projects.intro}
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--yellow)" }}>
            {APP.name} is in beta. Export your projects now and then as a backup.
          </p>
        </div>
        <div className="flex items-center gap-2 max-md:[&>button]:flex-1 max-md:[&>button]:justify-center">
          <button
            onClick={importProject}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border-hover)" }}
            title={COPY.projects.importTitle}
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
                {COPY.projects.examplesHint}
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
            {COPY.projects.emptyHint}
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
            <ProjectRow
              key={project.id}
              project={project}
              onOpen={() => router.push(`/project/${project.id}/assets`)}
              onExport={() => exportProject(project.id)}
              onDelete={() => deleteProject(project.id)}
            />
          ))}
        </div>
      )}

      {otherAppProjects.length > 0 && (
        <OtherAppProjects projects={otherAppProjects} isShown={showOtherApp} onToggle={() => setShowOtherApp(!showOtherApp)} />
      )}
    </div>
  );
}

function ProjectRow({ project, badge, onOpen, onExport, onDelete }: {
  project: Project;
  badge?: React.ReactNode;
  onOpen(): void;
  onExport?(): void;
  onDelete?(): void;
}) {
  return (
    <div
      className="group flex items-center justify-between gap-3 min-w-0 p-4 rounded-xl border transition-colors cursor-pointer"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      onClick={onOpen}
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
          <p className="text-sm mt-0.5 break-words" style={{ color: "var(--text-secondary)" }}>
            {project.description}
          </p>
        )}
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Created {new Date(project.createdAt).toLocaleDateString()}
        </p>
      </div>
      {badge}
      {(onExport || onDelete) && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100 transition-opacity shrink-0">
          {onExport && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExport();
              }}
              className="p-2 rounded-lg transition-colors"
              style={{ color: "var(--text-secondary)" }}
              title="Export project"
              aria-label={`Export ${project.name}`}
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-2 rounded-lg transition-colors"
              style={{ color: "var(--red)" }}
              title="Delete project"
              aria-label={`Delete ${project.name}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Projects your account has in the other app. They open on that app's site. */
function OtherAppProjects({ projects, isShown, onToggle }: { projects: Project[]; isShown: boolean; onToggle(): void }) {
  return (
    <section className="mt-10">
      <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none" style={{ color: "var(--text-primary)" }}>
        <input type="checkbox" checked={isShown} onChange={onToggle} className="w-4 h-4 accent-[var(--accent)]" />
        Show projects from {OTHER_APP.name} ({projects.length})
      </label>
      {isShown && (
        <div className="grid gap-3 mt-4">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onOpen={() => window.open(`${OTHER_APP.url}/project/${project.id}/assets`, "_blank", "noopener")}
              badge={
                <span className="inline-flex items-center gap-1 text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
                  Opens in {OTHER_APP.name}
                  <ExternalLink className="w-3.5 h-3.5" />
                </span>
              }
            />
          ))}
        </div>
      )}
    </section>
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
