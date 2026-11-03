export type ClipboardPayload = { kind: "text"; text: string } | { kind: "png"; dataUrl: string };

/** Puts text or a PNG on the system clipboard; false when the browser refuses. Browser only. */
export async function copyToSystemClipboard(payload: ClipboardPayload): Promise<boolean> {
  try {
    if (payload.kind === "text") {
      await navigator.clipboard.writeText(payload.text);
      return true;
    }
    const blob = fetch(payload.dataUrl).then((response) => response.blob());
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
