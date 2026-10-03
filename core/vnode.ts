// A neutral element tree. Each component renders to this once; React and the
// editor's DOM writer both convert the same tree, so a page built by the
// components and a value written back by the editor cannot differ.

export interface VElement {
  tag: string;
  /** DOM attribute names (`class`, `itemprop`, `datetime`). `''` is a boolean attribute; undefined is omitted. */
  attrs: Record<string, string | undefined>;
  children: VNode[];
  /**
   * Server-rendered HTML from the entity view (markdown and template output),
   * inserted as-is. The only route for HTML; text is always a string child.
   */
  html?: string;
}

export type VNode = string | VElement;

export function h(tag: string, attrs: Record<string, string | undefined> = {}, ...children: VNode[]): VElement {
  return { tag, attrs, children };
}

/** Builds real DOM nodes. Strings become text nodes, never markup. */
export function toDom(node: VNode, doc: Document = document): Node {
  if (typeof node === 'string') return doc.createTextNode(node);
  const element = doc.createElement(node.tag);
  for (const [name, value] of Object.entries(node.attrs)) {
    if (value !== undefined) element.setAttribute(name, value);
  }
  if (node.html !== undefined) {
    element.innerHTML = node.html;
  } else {
    element.append(...node.children.map((child) => toDom(child, doc)));
  }
  return element;
}

/**
 * Updates an existing element to match a rendered root: sets every attribute
 * the render produced, removes the `volatile` ones it did not, and replaces
 * the children when the component owns them. Attributes the component does
 * not manage (host classes, editor markers) are left alone.
 */
export function patch(element: Element, node: VElement, volatile: readonly string[], ownsChildren: boolean): void {
  for (const name of volatile) {
    if (node.attrs[name] === undefined) element.removeAttribute(name);
  }
  for (const [name, value] of Object.entries(node.attrs)) {
    if (value === undefined) {
      element.removeAttribute(name);
    } else if (element.getAttribute(name) !== value) {
      element.setAttribute(name, value);
    }
  }
  if (!ownsChildren) return;
  if (node.html !== undefined) {
    element.innerHTML = node.html;
  } else {
    element.replaceChildren(...node.children.map((child) => toDom(child, element.ownerDocument)));
  }
}
