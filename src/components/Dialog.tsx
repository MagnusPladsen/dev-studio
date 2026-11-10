"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, SyntheticEvent } from "react";
import { createPortal } from "react-dom";

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Shows the confirm button in red, for deletes and other changes that lose work. */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  confirmLabel?: string;
  placeholder?: string;
}

export interface AlertOptions {
  message: string;
  title?: string;
}

/** In-app replacements for `window.confirm`, `window.prompt` and `window.alert`, styled like the rest of the studio. */
export interface DialogApi {
  confirm(options: ConfirmOptions): Promise<boolean>;
  /** Resolves to the trimmed text, or null when cancelled or left empty. */
  prompt(options: PromptOptions): Promise<string | null>;
  alert(options: AlertOptions): Promise<void>;
}

type DialogRequest = { id: number } & (
  | { kind: "confirm"; options: ConfirmOptions; resolve(value: boolean): void }
  | { kind: "prompt"; options: PromptOptions; resolve(value: string | null): void }
  | { kind: "alert"; options: AlertOptions; resolve(): void }
);

type NewDialogRequest = DialogRequest extends infer Request ? (Request extends DialogRequest ? Omit<Request, "id"> : never) : never;

let mountedDialogs: DialogApi | null = null;

function requireDialogs(): DialogApi {
  if (!mountedDialogs) throw new Error("dialog used outside <DialogProvider>");
  return mountedDialogs;
}

/** Callable from any handler inside the studio, like the browser's own `confirm()` / `prompt()` / `alert()`. */
export const dialog: DialogApi = {
  confirm: (options) => requireDialogs().confirm(options),
  prompt: (options) => requireDialogs().prompt(options),
  alert: (options) => requireDialogs().alert(options),
};

function settle(request: DialogRequest, isConfirmed: boolean, text: string): void {
  if (request.kind === "confirm") return request.resolve(isConfirmed);
  if (request.kind === "alert") return request.resolve();
  const trimmed = text.trim();
  request.resolve(isConfirmed && trimmed ? trimmed : null);
}

function dialogTitle(request: DialogRequest): string {
  if (request.options.title) return request.options.title;
  return request.kind === "alert" ? "Heads up" : "Are you sure?";
}

function confirmLabel(request: DialogRequest): string {
  if (request.kind === "alert") return "OK";
  return request.options.confirmLabel ?? (request.kind === "prompt" ? "Save" : "OK");
}

function DialogBox({ request, onDone }: { request: DialogRequest; onDone(isConfirmed: boolean, text: string): void }): React.JSX.Element {
  const [text, setText] = useState(request.kind === "prompt" ? (request.options.defaultValue ?? "") : "");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const isDanger = request.kind === "confirm" && request.options.danger;
  const title = dialogTitle(request);

  useEffect(() => {
    if (request.kind === "prompt") inputRef.current?.select();
    else confirmRef.current?.focus();
  }, [request.kind]);

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    onDone(true, text);
  };

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => event.target === event.currentTarget && onDone(false, text)}
    >
      <form
        role={request.kind === "prompt" ? "dialog" : "alertdialog"}
        aria-modal="true"
        aria-label={title}
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onDone(false, text);
        }}
        className="w-96 max-w-full rounded-lg p-4 shadow-xl"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        {request.options.message && (
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {request.options.message}
          </p>
        )}
        {request.kind === "prompt" && (
          <input
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={request.options.placeholder}
            aria-label={title}
            className="mt-3 w-full rounded-md px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] max-md:py-2.5"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          {request.kind !== "alert" && (
            <button
              type="button"
              onClick={() => onDone(false, text)}
              className="rounded-md px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)] max-md:py-2.5"
              style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              {request.kind === "confirm" ? (request.options.cancelLabel ?? "Cancel") : "Cancel"}
            </button>
          )}
          <button
            ref={confirmRef}
            type="submit"
            disabled={request.kind === "prompt" && !text.trim()}
            className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 max-md:py-2.5"
            style={{
              background: isDanger ? "var(--red)" : "var(--accent)",
              color: isDanger ? "var(--bg-primary)" : "var(--on-accent, var(--text-primary))",
            }}
          >
            {confirmLabel(request)}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Shows one dialog at a time; a second request waits until the first is answered. */
export function DialogProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const opener = useRef<Element | null>(null);
  const nextId = useRef(0);

  const enqueue = useCallback((request: NewDialogRequest): void => {
    if (!opener.current) opener.current = document.activeElement;
    nextId.current += 1;
    const id = nextId.current;
    setQueue((previous) => [...previous, { ...request, id } as DialogRequest]);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) => new Promise((resolve) => enqueue({ kind: "confirm", options, resolve })),
      prompt: (options) => new Promise((resolve) => enqueue({ kind: "prompt", options, resolve })),
      alert: (options) => new Promise((resolve) => enqueue({ kind: "alert", options, resolve })),
    }),
    [enqueue],
  );

  useEffect(() => {
    mountedDialogs = api;
    return () => {
      if (mountedDialogs === api) mountedDialogs = null;
    };
  }, [api]);

  const current = queue[0];
  const handleDone = (isConfirmed: boolean, text: string): void => {
    if (!current) return;
    settle(current, isConfirmed, text);
    setQueue((previous) => previous.slice(1));
    if (queue.length > 1) return;
    const from = opener.current;
    opener.current = null;
    if (from instanceof HTMLElement && from.isConnected) from.focus({ preventScroll: true });
  };

  return (
    <>
      {children}
      {current && createPortal(<DialogBox key={current.id} request={current} onDone={handleDone} />, document.body)}
    </>
  );
}
