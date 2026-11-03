import type { BoardTool } from "./ToolPicker";

interface BoardHintsProps {
  isEmpty: boolean;
  tool: BoardTool;
  hasSelection: boolean;
  isConnecting: boolean;
  zoom: number;
}

const HINT_STYLE: React.CSSProperties = { background: "var(--bg-card)", color: "var(--accent)", border: "1px solid var(--accent)" };

/** Overlays on the board: the empty-board help, the active tool's hint and the zoom level. */
export function BoardHints({ isEmpty, tool, hasSelection, isConnecting, zoom }: BoardHintsProps) {
  return (
    <>
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
          <p className="text-sm text-center max-w-sm" style={{ color: "var(--text-secondary)" }}>
            Empty board. Use <b style={{ color: "var(--text-primary)" }}>Add</b> for notes, to-dos, images, links, asset cards
            or shapes, sketch with the pen, or paste and drop pictures and links straight onto the board. Double-click a card to edit it.
          </p>
        </div>
      )}

      {(tool === "draw" || (tool === "area" && !hasSelection)) && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-xs text-center pointer-events-none max-md:w-[90%]"
          style={HINT_STYLE}
        >
          {tool === "draw" ? "Draw: drag to sketch" : "Box select: drag around cards, tap cards to add or remove"} · Esc to stop
        </div>
      )}
      {tool === "connect" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-xs text-center max-md:w-[90%]" style={HINT_STYLE}>
          {isConnecting ? "Now click the second card" : "Connect: click the first card, then the second"} · Esc to cancel
        </div>
      )}

      <div
        className="absolute right-3 bottom-3 px-2 py-1 rounded text-[11px] font-mono pointer-events-none max-md:hidden"
        style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}
      >
        {Math.round(zoom * 100)}%
      </div>
    </>
  );
}
