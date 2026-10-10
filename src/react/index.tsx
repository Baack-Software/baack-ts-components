// React versions of the canonical content components. Each is a thin wrapper:
// the rendering lives in components/core, shared with the editor.

import { createElement, Fragment, useEffect, useState, type ElementType, type ReactNode } from 'react';
import type {
  Entity,
  BooleanItem,
  DateTimeItem,
  DoubleItem,
  ImageItem,
  LatLongItem,
  LinkItem,
  LongItem,
  MarkdownItem,
  MoneyItem,
  TemplateItem,
  TextItem,
} from '@baack-software/baack-ts-client';
import * as spec from '../core/components.ts';
import type { ContentRef, ContentType } from '../core/components.ts';
import type { VNode } from '../core/vnode.ts';
import { followEntity } from '../core/live.ts';

export type { ContentRef } from '../core/components.ts';

/** DOM attribute names that React spells differently. */
const REACT_NAMES: Record<string, string> = {
  class: 'className',
  itemprop: 'itemProp',
  itemscope: 'itemScope',
  itemtype: 'itemType',
  datetime: 'dateTime',
  srcset: 'srcSet',
  fetchpriority: 'fetchPriority',
  hreflang: 'hrefLang',
};

/** Boolean attributes React wants as `true`. */
const BOOLEAN_PROPS = new Set(['hidden', 'itemScope']);

type AttributeValue = string | number | boolean | undefined;

/**
 * Attributes a page may add to a component's root (or a list's container):
 * accessibility, identity, microdata and `data-*`. They let a page compose
 * the components with UI libraries (a shadcn `BreadcrumbLink asChild`, say)
 * and add schema.org structure, without a component per use. The DOM
 * contract's own attributes cannot be overridden.
 */
export interface PassThroughProps {
  [data: `data-${string}`]: AttributeValue;
  [aria: `aria-${string}`]: AttributeValue;
  id?: string | undefined;
  role?: string | undefined;
  title?: string | undefined;
  lang?: string | undefined;
  dir?: string | undefined;
  tabIndex?: number | undefined;
  itemScope?: boolean | undefined;
  itemType?: string | undefined;
  itemID?: string | undefined;
  itemRef?: string | undefined;
}

/** React prop names that differ from the DOM attribute. */
const DOM_NAMES: Record<string, string> = { tabIndex: 'tabindex', itemScope: 'itemscope', itemType: 'itemtype', itemID: 'itemid', itemRef: 'itemref' };

/** The pass-through props among `props`, keyed by their React names, for React elements and components. */
function reactPassThrough(props: object): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) {
    if (value !== undefined && value !== false && spec.isPassThrough(DOM_NAMES[name] ?? name)) picked[name] = value;
  }
  return picked;
}

/** The pass-through props among `props` as DOM attributes, for the core renderers. */
function attributes(props: object): spec.PassThrough {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(reactPassThrough(props))) {
    result[DOM_NAMES[name] ?? name] = value === true ? '' : String(value);
  }
  return result;
}

/** Renders a core spec with the props, adding the page's pass-through attributes. */
function render<I, P>(component: spec.ComponentSpec<I, P>, props: Content<I> & P, children?: ReactNode): ReactNode {
  return toReact(component.render(props.content, { ...props, attributes: attributes(props) }), undefined, children);
}

/** Converts a core render to React elements. `children` replaces the render's children (for wrappers). */
export function toReact(node: VNode, key?: number, children?: ReactNode): ReactNode {
  if (typeof node === 'string') return node;
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(node.attrs)) {
    if (value === undefined) continue;
    const reactName = REACT_NAMES[name] ?? name;
    props[reactName] = BOOLEAN_PROPS.has(reactName) ? true : value;
  }
  if (node.html !== undefined) {
    // Entity view output for markdown and templates only.
    props['dangerouslySetInnerHTML'] = { __html: node.html };
    return createElement(node.tag, props);
  }
  if (children !== undefined) return createElement(node.tag, props, children);
  return createElement(node.tag, props, ...node.children.map((child, index) => toReact(child, index)));
}

interface Content<T> {
  content: ContentRef<T>;
}

type Props<T, P> = Content<T> & P & PassThroughProps;

export function ContentText(props: Props<TextItem, spec.TextProps>) {
  return render(spec.text, props);
}

export function ContentTextBlock(props: Props<TextItem, spec.TextBlockProps>) {
  return render(spec.textBlock, props);
}

/** For the document head: `<meta name="description">` with its content from a text item. */
export function ContentMeta(props: Props<TextItem, spec.MetaProps>) {
  return render(spec.meta, props);
}

/** Pass the entity view's item: its value is the rendered HTML. */
export function ContentMarkdown(props: Props<MarkdownItem, spec.RenderedProps>) {
  return render(spec.markdown, props);
}

/** Pass the entity view's item: its value is the template output. */
export function ContentTemplate(props: Props<TemplateItem, spec.RenderedProps>) {
  return render(spec.template, props);
}

export function ContentMoney(props: Props<MoneyItem, spec.MoneyProps>) {
  return render(spec.money, props);
}

export function ContentLong(props: Props<LongItem, spec.NumberProps>) {
  return render(spec.long, props);
}

export function ContentDouble(props: Props<DoubleItem, spec.NumberProps>) {
  return render(spec.double, props);
}

export function ContentDate(props: Props<DateTimeItem, spec.DateProps>) {
  return render(spec.dateTime, props);
}

/** Shows `children` when the flag is on (or off, with `invert`). Hidden content stays in the page. */
export function ContentBoolean(props: Props<BooleanItem, spec.BooleanProps> & { children?: ReactNode }) {
  return render(spec.boolean, props, props.children);
}

export function ContentLatLong(props: Props<LatLongItem, spec.LatLongProps>) {
  return render(spec.latLong, props);
}

export function ContentLink(props: Props<LinkItem, spec.LinkProps>) {
  return render(spec.link, props);
}

export function ContentImage(props: Props<ImageItem, spec.ImageProps>) {
  return render(spec.image, props);
}

// ---------------------------------------------------------------------------
// Lists, rows and sections
// ---------------------------------------------------------------------------

export interface ContentListProps<T extends { name: string; sortOrder: number }> {
  /** The item name the list shows. */
  name: string;
  /** The entity view's items of this type, for example `view.raw.texts`. */
  items: readonly T[] | undefined;
  /** Renders one entry. Put the item's component inside; anything around it moves with it when reordered. */
  children: (content: ContentRef<T>, index: number) => ReactNode;
  /** Empty slots to show while the list has no items, so their placeholders appear. Default 0. */
  fallback?: number;
  /**
   * Container: an element name (default `ul`) or a component that passes its
   * props on to its element, such as a shadcn `BreadcrumbList`.
   */
  as?: ElementType;
  className?: string;
}

/**
 * Every item of a name, in sort order, each rendered by `children`. The
 * container is marked so the editor can reorder, add and remove entries.
 * Each direct child of the container is one entry and moves as a whole, so
 * keep anything that belongs to an entry (a separator, say) inside it.
 */
export function ContentList<T extends { name: string; sortOrder: number }>(props: ContentListProps<T> & PassThroughProps & { type: ContentType }) {
  const refs = spec.listRefs(props.items ?? [], props.name, props.fallback);
  return createElement(
    props.as ?? 'ul',
    { ...reactPassThrough(props), className: props.className, ...spec.listAttributes(props.type, props.name) },
    ...refs.map((ref, index) => createElement(Fragment, { key: `${ref.sortOrder}-${index}` }, props.children(ref, index))),
  );
}

function listOf<T extends { name: string; sortOrder: number }>(type: ContentType) {
  return (props: ContentListProps<T> & PassThroughProps) => ContentList<T>({ ...props, type });
}

export const ContentTextList = listOf<TextItem>('text');
export const ContentMarkdownList = listOf<MarkdownItem>('markdown');
export const ContentMoneyList = listOf<MoneyItem>('money');
export const ContentLongList = listOf<LongItem>('long');
export const ContentDoubleList = listOf<DoubleItem>('double');
export const ContentDateList = listOf<DateTimeItem>('datetime');
export const ContentLinkList = listOf<LinkItem>('link');
export const ContentImageList = listOf<ImageItem>('image');

export interface ContentRowsProps {
  /** The sort orders of the rows, for example from `rowSortOrders(items, columns)`. */
  rows: readonly number[];
  /** Renders one row's cells. The row element is provided. */
  children: (sortOrder: number, index: number) => ReactNode;
  /** Row element or component (such as a shadcn `TableRow`); default `tr`. */
  rowAs?: ElementType;
  /** Container element or component (such as a shadcn `TableBody`); default `tbody`. */
  as?: ElementType;
  className?: string;
}

/** Table rows: each row is the column items that share one sort order, and moves as one. */
export function ContentRows(props: ContentRowsProps & PassThroughProps) {
  return createElement(
    props.as ?? 'tbody',
    { ...reactPassThrough(props), className: props.className, [spec.ROWS_ATTRIBUTE]: '' },
    ...props.rows.map((sortOrder, index) =>
      createElement(props.rowAs ?? 'tr', { key: sortOrder, ...spec.rowAttributes(sortOrder) }, props.children(sortOrder, index)),
    ),
  );
}

/** A page section ordered by a text item naming it; render inside a `ContentTextList` of the section items. */
export function ContentSection(props: Props<TextItem, spec.SectionProps> & { children?: ReactNode }) {
  return render(spec.section, props, props.children);
}

export { listRefs, rowSortOrders } from '../core/components.ts';

// ---------------------------------------------------------------------------
// Content rendered in the browser
// ---------------------------------------------------------------------------

/**
 * The entity as the Baack editor shows it, for content rendered in the
 * browser: drafts, saved values and previews while editing, then the
 * entity as given again. Render from the result, and mark an element around
 * this content with `data-content-live` (`LIVE_ATTRIBUTE`) so the editor
 * sends its changes here instead of changing the DOM React owns. Before
 * hydration, and without the editor, it returns `entity` unchanged.
 */
export function useLiveEntity<E extends Entity>(entity: E): E {
  const [state, setState] = useState({ source: entity, live: entity });
  useEffect(() => followEntity(entity, (live) => setState({ source: entity, live })), [entity]);
  // A new entity from the page replaces anything shown for the old one.
  return state.source === entity ? state.live : entity;
}

export { LIVE_ATTRIBUTE } from '../core/live.ts';
