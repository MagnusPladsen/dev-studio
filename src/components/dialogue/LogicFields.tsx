"use client";

import type { DialogueCheck, DialogueNode, DialogueSet, DialogueVariable } from "@/types";
import { COMPARE_OPS, coerceValue, defaultValueFor, describeCheck, describeSet } from "@/lib/dialogue/logic";
import { FIELD_CLASS, FIELD_STYLE, ValueInput } from "./ValueInput";

const CUSTOM = "";
const LABEL_CLASS = "block text-xs mb-1";
const LABEL_STYLE = { color: "var(--text-secondary)" };
const HINT_STYLE = { color: "var(--text-secondary)" };

const compareOpsFor = (type: DialogueVariable["type"]) => (type === "number" ? COMPARE_OPS : COMPARE_OPS.filter((op) => op === "==" || op === "!="));

/** A check also writes its text into `condition`, so search and older copies of the app still read it. */
function withCheck(check: DialogueCheck): Partial<DialogueNode> {
  return { check, condition: describeCheck(check), text: describeCheck(check) };
}

function firstCheck(variable: DialogueVariable): DialogueCheck {
  return { variable: variable.name, op: "==", value: variable.type === "bool" ? true : variable.defaultValue };
}

/** A condition's test: a variable compared with a value, or free text for the game's own code. */
export function ConditionFields({ node, variables, onUpdate }: { node: DialogueNode; variables: DialogueVariable[]; onUpdate(patch: Partial<DialogueNode>): void }) {
  const check = node.check;
  const variable = variables.find((entry) => entry.name === check?.variable);
  const type = variable?.type ?? "bool";
  return (
    <>
      <label className={LABEL_CLASS} style={LABEL_STYLE} htmlFor="condition-variable">
        Check
      </label>
      <select
        id="condition-variable"
        className={`${FIELD_CLASS} w-full mb-2`}
        style={FIELD_STYLE}
        value={check?.variable ?? CUSTOM}
        onChange={(e) => {
          const picked = variables.find((entry) => entry.name === e.target.value);
          if (picked) onUpdate(withCheck(picked.type === variable?.type && check ? { ...check, variable: picked.name } : firstCheck(picked)));
          else onUpdate({ check: undefined });
        }}
      >
        {variables.map((entry) => (
          <option key={entry.name} value={entry.name}>
            {entry.name}
          </option>
        ))}
        <option value={CUSTOM}>Written condition (for your game&apos;s code)</option>
      </select>
      {check ? (
        <div className="flex gap-1 mb-2">
          <select
            className={FIELD_CLASS}
            style={FIELD_STYLE}
            value={check.op}
            onChange={(e) => onUpdate(withCheck({ ...check, op: e.target.value as DialogueCheck["op"] }))}
            aria-label="Comparison"
          >
            {compareOpsFor(type).map((op) => (
              <option key={op} value={op}>
                {op === "==" ? "is" : op === "!=" ? "is not" : op}
              </option>
            ))}
          </select>
          <ValueInput type={type} value={check.value} onChange={(value) => onUpdate(withCheck({ ...check, value }))} label="Compared with" className="flex-1" />
        </div>
      ) : (
        <input
          className={`${FIELD_CLASS} w-full mb-2 text-sm`}
          style={FIELD_STYLE}
          value={node.condition || node.text || ""}
          onChange={(e) => onUpdate({ condition: e.target.value, text: e.target.value })}
          aria-label="Condition"
        />
      )}
      <p className="text-xs" style={HINT_STYLE}>
        {check
          ? "True follows the top exit, otherwise the else exit."
          : variables.length
            ? "Preview asks which way to go. Pick a variable to have it decide."
            : "Preview asks which way to go. Add a variable (Variables button) to have it decide."}
      </p>
    </>
  );
}

function firstSet(variable: DialogueVariable): DialogueSet {
  return variable.type === "bool" ? { variable: variable.name, op: "set", value: true } : { variable: variable.name, op: "set", value: variable.defaultValue };
}

function withSet(set: DialogueSet): Partial<DialogueNode> {
  return { set, text: describeSet(set) };
}

const setOpsFor = (type: DialogueVariable["type"]): DialogueSet["op"][] => (type === "bool" ? ["set", "toggle"] : ["set", "add"]);
const SET_OP_LABELS: Record<DialogueSet["op"], string> = { set: "set to", add: "add", toggle: "flip true/false" };

/** An action either changes a variable or names a command for the game's own code. */
export function ActionFields({ node, variables, onUpdate }: { node: DialogueNode; variables: DialogueVariable[]; onUpdate(patch: Partial<DialogueNode>): void }) {
  const set = node.set;
  const variable = variables.find((entry) => entry.name === set?.variable);
  const type = variable?.type ?? "bool";
  return (
    <>
      <label className={LABEL_CLASS} style={LABEL_STYLE} htmlFor="action-variable">
        Does
      </label>
      <select
        id="action-variable"
        className={`${FIELD_CLASS} w-full mb-2`}
        style={FIELD_STYLE}
        value={set?.variable ?? CUSTOM}
        onChange={(e) => {
          const picked = variables.find((entry) => entry.name === e.target.value);
          if (picked) onUpdate(withSet(firstSet(picked)));
          else onUpdate({ set: undefined, text: node.text || "do_action" });
        }}
      >
        {variables.map((entry) => (
          <option key={entry.name} value={entry.name}>
            Change {entry.name}
          </option>
        ))}
        <option value={CUSTOM}>Run a game command</option>
      </select>
      {set ? (
        <div className="flex gap-1 mb-2">
          <select
            className={FIELD_CLASS}
            style={FIELD_STYLE}
            value={set.op}
            onChange={(e) => {
              const op = e.target.value as DialogueSet["op"];
              onUpdate(withSet(op === "toggle" ? { variable: set.variable, op } : { ...set, op, value: op === "add" && type === "number" ? 1 : coerceValue(set.value ?? defaultValueFor(type), type) }));
            }}
            aria-label="Change"
          >
            {setOpsFor(type).map((op) => (
              <option key={op} value={op}>
                {SET_OP_LABELS[op]}
              </option>
            ))}
          </select>
          {set.op !== "toggle" && <ValueInput type={type} value={set.value} onChange={(value) => onUpdate(withSet({ ...set, value }))} label="Value" className="flex-1" />}
        </div>
      ) : (
        <input
          className={`${FIELD_CLASS} w-full mb-2 text-sm`}
          style={FIELD_STYLE}
          value={node.text || ""}
          onChange={(e) => onUpdate({ text: e.target.value })}
          aria-label="Action"
        />
      )}
      {!set && (
        <p className="text-xs" style={HINT_STYLE}>
          {variables.length ? "Your game runs this command. Pick a variable to change it in Preview too." : "Your game runs this command. Add a variable (Variables button) to change it here."}
        </p>
      )}
    </>
  );
}
