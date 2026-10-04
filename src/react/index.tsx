// React versions of the canonical content components. Each is a thin wrapper:
// the rendering lives in components/core, shared with the editor.

import { createElement, Fragment, type ReactNode } from 'react';
import type {
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

export function ContentText(props: Content<TextItem> & spec.TextProps) {
  return toReact(spec.text.render(props.content, props));
}

export function ContentTextBlock(props: Content<TextItem> & spec.TextBlockProps) {
  return toReact(spec.textBlock.render(props.content, props));
}

/** For the document head: `<meta name="description">` with its content from a text item. */
export function ContentMeta(props: Content<TextItem> & spec.MetaProps) {
  return toReact(spec.meta.render(props.content, props));
}

/** Pass the entity view's item: its value is the rendered HTML. */
export function ContentMarkdown(props: Content<MarkdownItem> & spec.RenderedProps) {
  return toReact(spec.markdown.render(props.content, props));
}

/** Pass the entity view's item: its value is the template output. */
export function ContentTemplate(props: Content<TemplateItem> & spec.RenderedProps) {
  return toReact(spec.template.render(props.content, props));
}

export function ContentMoney(props: Content<MoneyItem> & spec.MoneyProps) {
  return toReact(spec.money.render(props.content, props));
}

export function ContentLong(props: Content<LongItem> & spec.NumberProps) {
  return toReact(spec.long.render(props.content, props));
}

export function ContentDouble(props: Content<DoubleItem> & spec.NumberProps) {
  return toReact(spec.double.render(props.content, props));
}

export function ContentDate(props: Content<DateTimeItem> & spec.DateProps) {
  return toReact(spec.dateTime.render(props.content, props));
}

/** Shows `children` when the flag is on (or off, with `invert`). Hidden content stays in the page. */
export function ContentBoolean(props: Content<BooleanItem> & spec.BooleanProps & { children?: ReactNode }) {
  return toReact(spec.boolean.render(props.content, props), undefined, props.children);
}

export function ContentLatLong(props: Content<LatLongItem> & spec.LatLongProps) {
  return toReact(spec.latLong.render(props.content, props));
}

export function ContentLink(props: Content<LinkItem> & spec.LinkProps) {
  return toReact(spec.link.render(props.content, props));
}

export function ContentImage(props: Content<ImageItem> & spec.ImageProps) {
  return toReact(spec.image.render(props.content, props));
}

/**
 * One phase of a price in a schema.org Offer (an introductory offer, then a
 * standard price). Put the phase's `ContentMoney offer` and its note inside.
 */
export function ContentPriceSpecification(props: spec.PriceSpecificationProps & { children?: ReactNode }) {
  const node = spec.priceSpecification(props);
  const terms = node.children.map((child, index) => toReact(child, index));
  return toReact(node, undefined, [...terms, createElement(Fragment, { key: 'phase' }, props.children)]);
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
  /** Container element; default `ul`. */
  as?: string;
  className?: string;
}

/**
 * Every item of a name, in sort order, each rendered by `children`. The
 * container is marked so the editor can reorder, add and remove entries.
 */
export function ContentList<T extends { name: string; sortOrder: number }>(props: ContentListProps<T> & { type: ContentType }) {
  const refs = spec.listRefs(props.items ?? [], props.name, props.fallback);
  return createElement(
    props.as ?? 'ul',
    { className: props.className, ...spec.listAttributes(props.type, props.name) },
    ...refs.map((ref, index) => createElement(Fragment, { key: `${ref.sortOrder}-${index}` }, props.children(ref, index))),
  );
}

function listOf<T extends { name: string; sortOrder: number }>(type: ContentType) {
  return (props: ContentListProps<T>) => ContentList<T>({ ...props, type });
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
  /** Row element; default `tr`. */
  rowAs?: string;
  /** Container element; default `tbody`. */
  as?: string;
  className?: string;
}

/** Table rows: each row is the column items that share one sort order, and moves as one. */
export function ContentRows(props: ContentRowsProps) {
  return createElement(
    props.as ?? 'tbody',
    { className: props.className, [spec.ROWS_ATTRIBUTE]: '' },
    ...props.rows.map((sortOrder, index) =>
      createElement(props.rowAs ?? 'tr', { key: sortOrder, ...spec.rowAttributes(sortOrder) }, props.children(sortOrder, index)),
    ),
  );
}

/** A page section ordered by a text item naming it; render inside a `ContentTextList` of the section items. */
export function ContentSection(props: Content<TextItem> & spec.SectionProps & { children?: ReactNode }) {
  return toReact(spec.section.render(props.content, props), undefined, props.children);
}

export { listRefs, rowSortOrders } from '../core/components.ts';
