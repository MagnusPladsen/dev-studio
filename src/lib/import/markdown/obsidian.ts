/** Matches `![[picture.png]]`-style embeds of files that aren't notes. */
const FILE_EMBED = /!\[\[([^\]|#]+\.(?!md\b)[a-z0-9]+)(?:\|[^\]]*)?\]\]\n?/gi;
/** `[[Title#Heading]]` and `[[Title#Heading|alias]]`: the tools link whole entries. */
const HEADING_LINK = /\[\[([^\]|#]+)#[^\]|]*(\|[^\]]*)?\]\]/g;

/** Obsidian Markdown for the tools: links to headings point at the note, file embeds go (they'd show as broken links). */
export function fromObsidian(body: string): { body: string; droppedEmbeds: number } {
  let droppedEmbeds = 0;
  const withoutEmbeds = body.replace(FILE_EMBED, () => {
    droppedEmbeds++;
    return "";
  });
  const linked = withoutEmbeds.replace(HEADING_LINK, (_match, target: string, alias = "") => `[[${target.trim()}${alias}]]`);
  return { body: droppedEmbeds ? linked.replace(/\s+$/, "") : linked, droppedEmbeds };
}

export function embedsWarning(count: number): string[] {
  return count ? [`Left out ${count} embedded ${count === 1 ? "picture or file" : "pictures or files"} (![[…]]); only Markdown text is imported`] : [];
}
