"use client";

import { useState } from "react";
import { RotateCcw, X } from "lucide-react";
import type { DialogueTree } from "@/types";
import { playFrom, startingValues, type DialogueValues, type PlayStop } from "@/lib/dialogue/logic";
import { translated } from "@/lib/dialogue/localisation";
import { FIELD_CLASS, FIELD_STYLE, ValueInput } from "./ValueInput";

const PRIMARY_BUTTON = "px-3 py-1.5 rounded-lg text-xs font-medium";
const PRIMARY_STYLE = { background: "var(--accent)", color: "var(--on-accent, white)" };

function startOf(tree: DialogueTree): PlayStop {
  const start = tree.nodes.find((node) => node.type === "start");
  return playFrom(tree, start?.id, startingValues(tree));
}

/** The values strip: every variable, editable mid-conversation to try another branch. */
function VariableValues({ tree, values, onChange }: { tree: DialogueTree; values: DialogueValues; onChange(values: DialogueValues): void }) {
  const variables = tree.variables ?? [];
  if (!variables.length) return null;
  return (
    <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
      <div className="text-[10px] font-semibold uppercase mb-1.5" style={{ color: "var(--text-secondary)" }}>
        Variables
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {variables.map((variable) => (
          <li key={variable.name} className="flex items-center gap-1 text-xs font-mono" style={{ color: "var(--text-primary)" }}>
            {variable.name}
            <ValueInput
              type={variable.type}
              value={values[variable.name]}
              onChange={(value) => onChange({ ...values, [variable.name]: value })}
              label={`Current value of ${variable.name}`}
              className="w-20"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Plays the conversation: sets and conditions on variables run by themselves, the rest waits for the player. */
export function DialoguePreview({ tree, onClose }: { tree: DialogueTree; onClose(): void }) {
  const [stop, setStop] = useState<PlayStop>(() => startOf(tree));
  const [language, setLanguage] = useState<string | null>(null);
  const node = stop.nodeId ? tree.nodes.find((entry) => entry.id === stop.nodeId) : undefined;
  const advance = (nextId?: string) => setStop(playFrom(tree, nextId, stop.values));
  const languages = tree.languages ?? [];

  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 w-96 max-w-[90vw] rounded-xl border p-5 z-20"
      style={{ background: "var(--bg-card)", borderColor: "var(--accent)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
      aria-label="Dialogue preview"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-semibold uppercase" style={{ color: "var(--accent)" }}>
          Preview
        </span>
        <div className="flex items-center gap-1">
          {languages.length > 0 && (
            <select className={FIELD_CLASS} style={FIELD_STYLE} value={language ?? ""} onChange={(e) => setLanguage(e.target.value || null)} aria-label="Preview language">
              <option value="">Source text</option>
              {languages.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => setStop(startOf(tree))} className="p-1" style={{ color: "var(--text-secondary)" }} title="Restart" aria-label="Restart preview">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1" style={{ color: "var(--text-secondary)" }} title="Close preview" aria-label="Close preview">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!node || node.type === "end" ? (
        <div>
          <p className="text-sm italic" style={{ color: "var(--text-secondary)" }}>
            {stop.isLooping ? "— The conversation goes round in a loop with nothing to show —" : "— End of dialogue —"}
          </p>
          <button onClick={onClose} className={`mt-3 ${PRIMARY_BUTTON}`} style={PRIMARY_STYLE}>
            Close
          </button>
        </div>
      ) : node.type === "dialogue" ? (
        <div>
          <div className="text-xs font-bold mb-1" style={{ color: "var(--green)" }}>
            {node.speaker}
          </div>
          <p className="text-sm mb-3 whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
            {translated(node.text, node.translations, language)}
          </p>
          <button onClick={() => advance(node.nextId)} className={PRIMARY_BUTTON} style={PRIMARY_STYLE}>
            Continue →
          </button>
        </div>
      ) : node.type === "choice" ? (
        <div>
          <p className="text-sm mb-3 whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
            {translated(node.text, node.translations, language)}
          </p>
          <div className="space-y-1.5">
            {node.choices?.map((choice, index) => (
              <button
                key={choice.id ?? index}
                onClick={() => advance(choice.targetId)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              >
                {translated(choice.text, choice.translations, language)}
              </button>
            ))}
          </div>
        </div>
      ) : node.type === "condition" ? (
        <div>
          <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
            Your game decides: <span className="font-mono">{node.condition || node.text || "if…"}</span>
          </p>
          <div className="flex gap-2">
            <button onClick={() => advance(node.nextId)} className={PRIMARY_BUTTON} style={PRIMARY_STYLE}>
              It&apos;s true →
            </button>
            <button onClick={() => advance(node.elseId)} className={PRIMARY_BUTTON} style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>
              Else →
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Your game runs: <span className="font-mono">{node.text || "action"}</span>
          </p>
          <button onClick={() => advance(node.nextId)} className={`mt-2 ${PRIMARY_BUTTON}`} style={PRIMARY_STYLE}>
            Continue →
          </button>
        </div>
      )}

      <VariableValues tree={tree} values={stop.values} onChange={(values) => setStop({ ...stop, values })} />
    </div>
  );
}
