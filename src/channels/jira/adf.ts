// Minimal builder for Atlassian Document Format. Text always goes in text nodes, never parsed as markup.

export interface AdfNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}
export interface AdfDoc {
  type: "doc";
  version: 1;
  content: AdfNode[];
}

export const adfDoc = (...content: AdfNode[]): AdfDoc => ({
  type: "doc",
  version: 1,
  content,
});
export const text = (value: string, marks?: AdfNode["marks"]): AdfNode => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});
export const strong = (value: string) => text(value, [{ type: "strong" }]);
export const linkText = (value: string, href: string) =>
  text(value, [{ type: "link", attrs: { href } }]);
export const paragraph = (...content: AdfNode[]): AdfNode => ({
  type: "paragraph",
  content,
});
export const heading = (level: number, value: string): AdfNode => ({
  type: "heading",
  attrs: { level },
  content: [text(value)],
});
const list = (type: string, items: AdfNode[][]): AdfNode => ({
  type,
  content: items.map((inline) => ({
    type: "listItem",
    content: [paragraph(...inline)],
  })),
});
export const bulletList = (items: AdfNode[][]) => list("bulletList", items);
export const orderedList = (items: AdfNode[][]) => list("orderedList", items);
export const panel = (panelType: "warning" | "info", ...content: AdfNode[]) =>
  ({ type: "panel", attrs: { panelType }, content }) satisfies AdfNode;
