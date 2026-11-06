"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { DialogueTree, DialogueVariable } from "@/types";
import { cleanVariableName, coerceValue, defaultValueFor, removeVariable, renameVariable, variableUses } from "@/lib/dialogue/logic";
import { isUsableLanguage, removeLanguage, translatedCount } from "@/lib/dialogue/localisation";
import { FIELD_CLASS, FIELD_STYLE, ValueInput } from "./ValueInput";

const TYPE_LABELS: Record<DialogueVariable["type"], string> = { bool: "true/false", number: "number", string: "text" };

function unusedName(tree: DialogueTree): string {
  const names = new Set((tree.variables ?? []).map((variable) => variable.name));
  for (let index = 1; ; index++) if (!names.has(`variable_${index}`)) return `variable_${index}`;
}

/** A name field that renames on Enter or leaving it, and only to a usable name nothing else has. */
function NameInput({ tree, name, onChange }: { tree: DialogueTree; name: string; onChange(tree: DialogueTree): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const cleaned = cleanVariableName(draft ?? name);
    setDraft(null);
    if (!cleaned || cleaned === name || tree.variables?.some((variable) => variable.name === cleaned)) return;
    onChange(renameVariable(tree, name, cleaned));
  };
  return (
    <input
      className={`${FIELD_CLASS} flex-1 font-mono`}
      style={FIELD_STYLE}
      value={draft ?? name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      aria-label="Variable name"
    />
  );
}

function VariableRow({ tree, variable, onChange }: { tree: DialogueTree; variable: DialogueVariable; onChange(tree: DialogueTree): void }) {
  const update = (patch: Partial<DialogueVariable>) =>
    onChange({ ...tree, variables: tree.variables?.map((entry) => (entry.name === variable.name ? { ...entry, ...patch } : entry)) });
  const uses = variableUses(tree, variable.name);
  return (
    <li className="flex flex-col gap-1 py-2 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="flex gap-1 items-center">
        <NameInput tree={tree} name={variable.name} onChange={onChange} />
        <button
          onClick={() => (!uses || confirm(`${variable.name} is used by ${uses} ${uses === 1 ? "node" : "nodes"}. They keep their text for your game's code. Delete it?`)) && onChange(removeVariable(tree, variable.name))}
          className="p-1 rounded"
          style={{ color: "var(--red)" }}
          title="Delete variable"
          aria-label={`Delete ${variable.name}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex gap-1 items-center">
        <select
          className={FIELD_CLASS}
          style={FIELD_STYLE}
          value={variable.type}
          onChange={(e) => {
            const type = e.target.value as DialogueVariable["type"];
            update({ type, defaultValue: type === "bool" ? defaultValueFor(type) : coerceValue(variable.defaultValue, type) });
          }}
          aria-label={`Type of ${variable.name}`}
        >
          {Object.entries(TYPE_LABELS).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
        <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
          starts as
        </span>
        <ValueInput type={variable.type} value={variable.defaultValue} onChange={(defaultValue) => update({ defaultValue })} label={`Starting value of ${variable.name}`} className="flex-1" />
      </div>
    </li>
  );
}

function LanguagesSection({ tree, onChange }: { tree: DialogueTree; onChange(tree: DialogueTree): void }) {
  const [draft, setDraft] = useState("");
  const languages = tree.languages ?? [];
  const code = draft.trim();
  const canAdd = isUsableLanguage(code) && !languages.includes(code);
  const add = () => {
    if (!canAdd) return;
    onChange({ ...tree, languages: [...languages, code] });
    setDraft("");
  };
  return (
    <>
      <h3 className="text-xs font-bold uppercase mt-4 mb-1" style={{ color: "var(--text-secondary)" }}>
        Languages
      </h3>
      <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
        Each gets a column in Export → Localisation CSV. Import the filled-in sheet to read the translations back.
      </p>
      <ul className="flex flex-wrap gap-1 mb-2">
        {languages.map((language) => (
          <li key={language} className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-xs" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>
            {language}
            <span style={{ color: "var(--text-secondary)" }}>({translatedCount(tree, language)})</span>
            <button
              onClick={() => {
                const count = translatedCount(tree, language);
                if (!count || confirm(`Remove ${language} and its ${count} ${count === 1 ? "translation" : "translations"}?`)) onChange(removeLanguage(tree, language));
              }}
              title={`Remove ${language}`}
              aria-label={`Remove ${language}`}
            >
              <X className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <input
          className={`${FIELD_CLASS} flex-1`}
          style={FIELD_STYLE}
          value={draft}
          placeholder="Code, e.g. nb or de"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          aria-label="New language"
        />
        <button onClick={add} disabled={!canAdd} className="px-2 py-1 rounded text-xs disabled:opacity-50" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>
          Add
        </button>
      </div>
    </>
  );
}

/** The dialogue's variables (name, type, starting value) and the languages it is translated into. */
export function VariablesPanel({ tree, onChange, onClose }: { tree: DialogueTree; onChange(tree: DialogueTree): void; onClose(): void }) {
  const variables = tree.variables ?? [];
  return (
    <div
      className="absolute top-2 left-2 w-80 rounded-xl border p-4 overflow-y-auto max-h-[80vh] max-md:right-2 max-md:w-auto max-md:max-h-[60vh] z-10"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
      aria-label="Variables and languages"
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-bold uppercase" style={{ color: "var(--text-secondary)" }}>
          Variables
        </h2>
        <button onClick={onClose} style={{ color: "var(--text-secondary)" }} title="Close" aria-label="Close variables">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
        What the conversation remembers. Conditions check them, actions change them, and Preview plays them.
      </p>
      {variables.length === 0 ? (
        <p className="text-xs italic py-2" style={{ color: "var(--text-secondary)" }}>
          No variables yet.
        </p>
      ) : (
        <ul>
          {variables.map((variable) => (
            <VariableRow key={variable.name} tree={tree} variable={variable} onChange={onChange} />
          ))}
        </ul>
      )}
      <button
        onClick={() => onChange({ ...tree, variables: [...variables, { name: unusedName(tree), type: "bool", defaultValue: false }] })}
        className="flex items-center gap-1 text-xs mt-2"
        style={{ color: "var(--accent)" }}
      >
        <Plus className="w-3 h-3" />
        Add variable
      </button>
      <LanguagesSection tree={tree} onChange={onChange} />
    </div>
  );
}
