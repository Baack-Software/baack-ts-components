// The canonical content components, framework-free. Each renders one item to
// a VElement carrying the DOM contract (`data-<type>-name`, `-sort-order`,
// `-urn` or `data-placeholder`) and schema.org microdata where it applies.
//
// Every rendering choice that a prop controls is also written to the element
// (`data-text-layout`, `data-locale`, ...), so the editor can recover the
// props from the page and re-render an item exactly as the component did.
//
// The components are a closed set scoped to the API's concepts: one per item
// type, plus lists, rows and sections over the `name : sortOrder` matrix.
// Domain meaning (breadcrumbs, prices, FAQs) is composed by the page from
// these, with pass-through attributes for accessibility and microdata.

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
import {
  formatDate,
  formatNumber,
  linkSegments,
  moneyAmount,
  moneySymbol,
  parseTimestamp,
  textLines,
  textParagraphs,
  type DateFormat,
} from './format.ts';
import { h, type VElement, type VNode } from './vnode.ts';

/** One cell of an entity's `name : sortOrder` matrix. `item` is absent until the item exists. */
export interface ContentRef<T> {
  name: string;
  sortOrder: number;
  item?: T | undefined;
}

/** The `<type>` in `data-<type>-name`. */
export type ContentType =
  | 'text'
  | 'markdown'
  | 'template'
  | 'money'
  | 'long'
  | 'double'
  | 'datetime'
  | 'boolean'
  | 'latlong'
  | 'link'
  | 'image';

export interface ComponentSpec<I, P> {
  readonly type: ContentType;
  /** Attributes a render may add or remove depending on the value. */
  readonly volatile: readonly string[];
  /** False when the children belong to the page (a boolean wraps page content). */
  readonly ownsChildren: boolean;
  render(ref: ContentRef<I>, props: P): VElement;
  /** The props an element was rendered with, read back from its attributes. */
  propsFrom(element: Element): P;
}

/**
 * Attributes the page adds to a component's root element, by DOM name:
 * `data-*`, `aria-*`, `id`, `role`, `title`, `lang`, `dir`, `tabindex` and
 * microdata (`itemscope`, `itemtype`, `itemid`, `itemref`). They do not
 * change how the value renders, so the editor never reads them back: its
 * write-back patches only the attributes a component manages and leaves
 * these in place. Anything else, and the DOM contract's own attributes, is
 * dropped.
 */
export type PassThrough = Readonly<Record<string, string | undefined>>;

const PASS_THROUGH_NAMES = new Set(['id', 'role', 'title', 'lang', 'dir', 'tabindex', 'itemscope', 'itemtype', 'itemid', 'itemref']);
const CONTRACT_ATTRIBUTE = /^data-(placeholder|section|content-rows?|[a-z]+-(name|sort-order|urn|list))$/;

/** True for an attribute a page may pass through to a component's root. */
export function isPassThrough(name: string): boolean {
  if (CONTRACT_ATTRIBUTE.test(name)) return false;
  return PASS_THROUGH_NAMES.has(name) || /^(data|aria)-[a-z0-9-]+$/.test(name);
}

/** The allowed subset of `attributes`, ready to spread first into a root's attributes. */
export function passThrough(attributes: PassThrough | undefined): Record<string, string | undefined> {
  const allowed: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(attributes ?? {})) {
    if (isPassThrough(name)) allowed[name] = value;
  }
  return allowed;
}

interface CommonProps {
  className?: string | undefined;
  /** schema.org microdata property, e.g. "name" inside a Product. */
  itemProp?: string | undefined;
  /** Accessibility, microdata and data attributes for the root element; see `PassThrough`. */
  attributes?: PassThrough | undefined;
}

/**
 * The DOM contract for an item. `-urn` names the version shown and is present
 * only for a real item; `data-placeholder` marks a rendered placeholder.
 */
export function contentAttributes(type: ContentType, ref: ContentRef<{ urn?: string }>, placeholder: boolean) {
  return {
    [`data-${type}-name`]: ref.name,
    [`data-${type}-sort-order`]: String(ref.sortOrder),
    [`data-${type}-urn`]: !placeholder ? ref.item?.urn : undefined,
    'data-placeholder': placeholder ? '' : undefined,
  };
}

function volatileFor(type: ContentType, ...more: string[]): string[] {
  return [`data-${type}-urn`, 'data-placeholder', ...more];
}

function common(element: Element): CommonProps {
  return { className: element.getAttribute('class') ?? undefined, itemProp: element.getAttribute('itemprop') ?? undefined };
}

function lines(texts: string[], render: (line: string) => VNode[], joinWithBreaks: boolean): VNode[] {
  if (!joinWithBreaks) return [texts.join(' ')];
  return texts.flatMap((line, index) => (index > 0 ? [h('br'), ...render(line)] : render(line)));
}

function linked(text: string, linkify: boolean): VNode[] {
  if (!linkify) return [text];
  return linkSegments(text).map((segment) => ('href' in segment ? h('a', { href: segment.href }, segment.text) : segment.text));
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export interface TextProps extends CommonProps {
  /** Shown while the item does not exist. */
  placeholder: string;
  /** Element to render; defaults to `span`. `title` and `option` get a single line. */
  as?: string | undefined;
  /** Render URLs and email addresses as links. */
  linkify?: boolean | undefined;
  /**
   * Discouraged. Insert the value as HTML instead of showing it as text.
   * Text items are read by other platforms (Android, iOS) that will not
   * render HTML, and markup in a value is a script injection route. Prefer
   * separate items styled by their components, or a markdown item.
   */
  unsafeLiteral?: boolean | undefined;
}

/** Inline text: lines joined by `<br>`. Escaped by default: markup in a value shows as typed. */
export const text: ComponentSpec<TextItem, TextProps> = {
  type: 'text',
  volatile: volatileFor('text'),
  ownsChildren: true,
  render(ref, props) {
    const fromItem = ref.item ? textLines(ref.item.value) : [];
    const placeholder = fromItem.length === 0;
    const tag = props.as ?? 'span';
    const content = placeholder ? textLines(props.placeholder) : fromItem;
    const element = h(
      tag,
      {
        ...passThrough(props.attributes),
        class: props.className,
        itemprop: props.itemProp,
        ...contentAttributes('text', ref, placeholder),
        'data-text-linkify': props.linkify ? '' : undefined,
        'data-text-unsafe-literal': props.unsafeLiteral ? '' : undefined,
      },
      ...lines(content, (line) => linked(line, props.linkify === true), tag !== 'title' && tag !== 'option'),
    );
    if (props.unsafeLiteral && !placeholder) element.html = ref.item!.value;
    return element;
  },
  propsFrom: (element) => ({
    ...common(element),
    placeholder: '',
    as: element.localName,
    linkify: element.hasAttribute('data-text-linkify'),
    unsafeLiteral: element.hasAttribute('data-text-unsafe-literal'),
  }),
};

export interface TextBlockProps extends TextProps {
  /** Classes for each paragraph. */
  paragraphClassName?: string | undefined;
}

/** Block text: a paragraph per blank-line-separated block, lines joined by `<br>`. */
export const textBlock: ComponentSpec<TextItem, TextBlockProps> = {
  type: 'text',
  volatile: volatileFor('text'),
  ownsChildren: true,
  render(ref, props) {
    const fromItem = ref.item ? textParagraphs(ref.item.value) : [];
    const placeholder = fromItem.length === 0;
    const paragraphs = placeholder ? textParagraphs(props.placeholder) : fromItem;
    const element = h(
      props.as ?? 'div',
      {
        ...passThrough(props.attributes),
        class: props.className,
        itemprop: props.itemProp,
        ...contentAttributes('text', ref, placeholder),
        'data-text-layout': 'paragraphs',
        'data-text-linkify': props.linkify ? '' : undefined,
        'data-text-unsafe-literal': props.unsafeLiteral ? '' : undefined,
      },
      ...paragraphs.map((paragraph) =>
        h('p', { class: props.paragraphClassName }, ...lines(paragraph, (line) => linked(line, props.linkify === true), true)),
      ),
    );
    if (props.unsafeLiteral && !placeholder) element.html = ref.item!.value;
    return element;
  },
  propsFrom: (element) => ({
    ...text.propsFrom(element),
    paragraphClassName: element.querySelector(':scope > p')?.getAttribute('class') ?? undefined,
  }),
};

export interface MetaProps {
  /** `name` attribute, e.g. "description". */
  name?: string | undefined;
  /** `property` attribute, e.g. "og:title". */
  property?: string | undefined;
  placeholder: string;
  attributes?: PassThrough | undefined;
}

/** A head `<meta>` whose `content` is a text item. */
export const meta: ComponentSpec<TextItem, MetaProps> = {
  type: 'text',
  volatile: volatileFor('text', 'content'),
  ownsChildren: false,
  render(ref, props) {
    const fromItem = ref.item ? textLines(ref.item.value).join(' ') : '';
    const placeholder = fromItem === '';
    return h('meta', {
      ...passThrough(props.attributes),
      name: props.name,
      property: props.property,
      content: placeholder ? props.placeholder : fromItem,
      ...contentAttributes('text', ref, placeholder),
    });
  },
  propsFrom: (element) => ({
    name: element.getAttribute('name') ?? undefined,
    property: element.getAttribute('property') ?? undefined,
    placeholder: '',
  }),
};

// ---------------------------------------------------------------------------
// Markdown and templates: HTML rendered by the entity view
// ---------------------------------------------------------------------------

export interface RenderedProps extends CommonProps {
  /** Plain text shown while the item does not exist. */
  placeholder: string;
  as?: string | undefined;
}

function rendered<I extends MarkdownItem | TemplateItem>(type: 'markdown' | 'template'): ComponentSpec<I, RenderedProps> {
  return {
    type,
    volatile: volatileFor(type),
    ownsChildren: true,
    render(ref, props) {
      // The value is the entity view's rendering. Never pass an item's source here.
      const html = ref.item?.value;
      const placeholder = !html?.trim();
      const element = h(props.as ?? 'div', {
        ...passThrough(props.attributes),
        class: props.className,
        itemprop: props.itemProp,
        ...contentAttributes(type, ref, placeholder),
      });
      if (placeholder) {
        element.children = [h('p', {}, props.placeholder)];
      } else {
        element.html = html;
      }
      return element;
    },
    propsFrom: (element) => ({ ...common(element), placeholder: '', as: element.localName }),
  };
}

export const markdown = rendered<MarkdownItem>('markdown');
export const template = rendered<TemplateItem>('template');

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export interface MoneyProps extends CommonProps {
  /** Text shown while there is no amount, e.g. "Contact us". Never used as a price. */
  placeholder: string;
  /** Emit schema.org Offer `price` and `priceCurrency`; set inside an Offer. */
  offer?: boolean | undefined;
}

/** The symbol nested in the amount, with the decimal amount and ISO code as microdata. */
export const money: ComponentSpec<MoneyItem, MoneyProps> = {
  type: 'money',
  volatile: volatileFor('money', 'itemprop', 'content', 'data-money-currency', 'data-money-unit-value'),
  ownsChildren: true,
  render(ref, props) {
    const item = ref.item;
    // Kept on the element in both states, so a placeholder re-renders with its microdata once it has an amount.
    const recorded = { 'data-money-offer': props.offer ? '' : undefined, 'data-money-item-prop': props.offer ? undefined : props.itemProp };
    if (!item) {
      return h('span', { ...passThrough(props.attributes), class: props.className, ...contentAttributes('money', ref, true), ...recorded }, props.placeholder);
    }
    const amount = moneyAmount(item);
    return h(
      'span',
      {
        ...passThrough(props.attributes),
        class: props.className,
        itemprop: props.offer ? 'price' : props.itemProp,
        content: props.offer ? amount : undefined,
        ...contentAttributes('money', ref, false),
        'data-money-currency': item.currencyCode,
        'data-money-unit-value': String(item.unitValue),
        ...recorded,
      },
      h(
        'span',
        { itemprop: props.offer ? 'priceCurrency' : undefined, content: props.offer ? item.currencyCode : undefined },
        moneySymbol(item),
      ),
      amount,
    );
  },
  propsFrom: (element) => ({
    className: element.getAttribute('class') ?? undefined,
    itemProp: element.getAttribute('data-money-item-prop') ?? undefined,
    offer: element.hasAttribute('data-money-offer'),
    placeholder: '',
  }),
};

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export interface NumberProps extends CommonProps {
  placeholder: string;
  /** Locale for formatting; written to `data-locale`. Defaults to en-GB. */
  locale?: string | undefined;
}

function numeric<I extends LongItem | DoubleItem>(type: 'long' | 'double'): ComponentSpec<I, NumberProps> {
  return {
    type,
    volatile: volatileFor(type, 'value'),
    ownsChildren: true,
    render(ref, props) {
      const item = ref.item;
      return h(
        'data',
        {
          ...passThrough(props.attributes),
          class: props.className,
          itemprop: props.itemProp,
          value: item ? String(item.value) : undefined,
          ...contentAttributes(type, ref, !item),
          'data-locale': props.locale,
        },
        item ? formatNumber(item.value, props.locale) : props.placeholder,
      );
    },
    propsFrom: (element) => ({ ...common(element), placeholder: '', locale: element.getAttribute('data-locale') ?? undefined }),
  };
}

export const long = numeric<LongItem>('long');
export const double = numeric<DoubleItem>('double');

// ---------------------------------------------------------------------------
// Date and time
// ---------------------------------------------------------------------------

export interface DateProps extends CommonProps, DateFormat {
  placeholder: string;
}

/** A `<time>` with the UTC instant in `datetime` and the formatted text inside. */
export const dateTime: ComponentSpec<DateTimeItem, DateProps> = {
  type: 'datetime',
  volatile: volatileFor('datetime', 'datetime'),
  ownsChildren: true,
  render(ref, props) {
    const item = ref.item;
    const instant = item ? parseTimestamp(item.value) : NaN;
    return h(
      'time',
      {
        ...passThrough(props.attributes),
        class: props.className,
        itemprop: props.itemProp,
        datetime: Number.isNaN(instant) ? undefined : new Date(instant).toISOString(),
        ...contentAttributes('datetime', ref, !item),
        'data-locale': props.locale,
        'data-date-style': props.dateStyle,
        'data-time-style': props.timeStyle,
        'data-time-zone': props.timeZone,
      },
      item ? formatDate(item.value, props) : props.placeholder,
    );
  },
  propsFrom: (element) => ({
    ...common(element),
    placeholder: '',
    locale: element.getAttribute('data-locale') ?? undefined,
    dateStyle: (element.getAttribute('data-date-style') as DateFormat['dateStyle']) ?? undefined,
    timeStyle: (element.getAttribute('data-time-style') as DateFormat['timeStyle']) ?? undefined,
    timeZone: element.getAttribute('data-time-zone') ?? undefined,
  }),
};

// ---------------------------------------------------------------------------
// Boolean: shows or hides page content
// ---------------------------------------------------------------------------

export interface BooleanProps extends CommonProps {
  /** Show the content when the item is false instead of true. */
  invert?: boolean | undefined;
  /** Value used while the item does not exist. Defaults to false. */
  fallback?: boolean | undefined;
  as?: string | undefined;
}

/** Wraps page content and hides it (`hidden`) when the flag is off. The content is the page's, not the item's. */
export const boolean: ComponentSpec<BooleanItem, BooleanProps> = {
  type: 'boolean',
  volatile: volatileFor('boolean', 'hidden'),
  ownsChildren: false,
  render(ref, props) {
    const value = ref.item ? ref.item.value : props.fallback === true;
    const shown = props.invert ? !value : value;
    return h(props.as ?? 'div', {
      ...passThrough(props.attributes),
      class: props.className,
      hidden: shown ? undefined : '',
      ...contentAttributes('boolean', ref, !ref.item),
      'data-boolean-value': String(value),
      'data-boolean-invert': props.invert ? '' : undefined,
    });
  },
  propsFrom: (element) => ({
    className: element.getAttribute('class') ?? undefined,
    invert: element.hasAttribute('data-boolean-invert'),
    as: element.localName,
  }),
};

// ---------------------------------------------------------------------------
// Latitude and longitude
// ---------------------------------------------------------------------------

export interface LatLongProps extends CommonProps {
  placeholder: string;
}

/** schema.org GeoCoordinates with the coordinates as microdata and as text. */
export const latLong: ComponentSpec<LatLongItem, LatLongProps> = {
  type: 'latlong',
  volatile: volatileFor('latlong'),
  ownsChildren: true,
  render(ref, props) {
    const item = ref.item;
    const attrs = {
      ...passThrough(props.attributes),
      class: props.className,
      itemprop: props.itemProp,
      itemscope: '',
      itemtype: 'https://schema.org/GeoCoordinates',
      ...contentAttributes('latlong', ref, !item),
    };
    if (!item) return h('span', attrs, props.placeholder);
    return h(
      'span',
      attrs,
      h('meta', { itemprop: 'latitude', content: String(item.latitude) }),
      h('meta', { itemprop: 'longitude', content: String(item.longitude) }),
      `${item.latitude}, ${item.longitude}`,
    );
  },
  propsFrom: (element) => ({ ...common(element), placeholder: '' }),
};

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export interface LinkProps extends CommonProps {
  /** Link text while the item does not exist. */
  placeholder: string;
  /** Target while the item does not exist. Defaults to "#". */
  placeholderHref?: string | undefined;
  /**
   * Microdata property for the link's text, which is then wrapped in a
   * `<span itemprop>`; for example `name` on a ListItem whose `item` is the
   * link itself (`itemProp="item"`).
   */
  textItemProp?: string | undefined;
}

/** An `<a>` from a link item: `href`, `rel`, `hreflang` from `lang`, and its text (or the href). */
export const link: ComponentSpec<LinkItem, LinkProps> = {
  type: 'link',
  volatile: volatileFor('link', 'rel', 'hreflang'),
  ownsChildren: true,
  render(ref, props) {
    const item = ref.item;
    const label = item ? item.text || item.href : props.placeholder;
    return h(
      'a',
      {
        ...passThrough(props.attributes),
        class: props.className,
        itemprop: props.itemProp,
        href: item ? item.href : props.placeholderHref ?? '#',
        rel: item?.rel || undefined,
        hreflang: item?.lang || undefined,
        ...contentAttributes('link', ref, !item),
      },
      props.textItemProp ? h('span', { itemprop: props.textItemProp }, label) : label,
    );
  },
  propsFrom: (element) => ({
    ...common(element),
    placeholder: '',
    textItemProp: element.querySelector(':scope > span[itemprop]')?.getAttribute('itemprop') ?? undefined,
  }),
};

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** Screen widths at which the larger files take over. */
export const MEDIUM_MIN_WIDTH = '768px';
export const LARGE_MIN_WIDTH = '1024px';

export interface ImageProps {
  className?: string | undefined;
  /** Alt text used when the item has none; "" for a decorative image. */
  placeholderAlt?: string | undefined;
  /** Above-the-fold images load eagerly with high fetch priority. */
  priority?: boolean | undefined;
  itemProp?: string | undefined;
  imgClassName?: string | undefined;
  /** Pass-through attributes for the `<picture>`; see `PassThrough`. */
  attributes?: PassThrough | undefined;
}

/**
 * A `<picture>` with `src` as the default and `mediumSrc` / `largeSrc` by
 * screen width. Without a file the picture is empty but keeps its contract
 * attributes, so the slot can still be found.
 */
export const image: ComponentSpec<ImageItem, ImageProps> = {
  type: 'image',
  volatile: volatileFor('image'),
  ownsChildren: true,
  render(ref, props) {
    const item = ref.item;
    const attrs = {
      ...passThrough(props.attributes),
      class: props.className,
      ...contentAttributes('image', ref, !item?.src),
      // The image's props, kept on the picture: an empty picture has no img to read them from.
      'data-image-priority': props.priority ? '' : undefined,
      'data-image-alt': props.placeholderAlt,
      'data-image-item-prop': props.itemProp,
      'data-image-img-class': props.imgClassName,
    };
    if (!item?.src) return h('picture', attrs);
    return h(
      'picture',
      attrs,
      ...(item.largeSrc ? [h('source', { media: `(min-width: ${LARGE_MIN_WIDTH})`, srcset: item.largeSrc })] : []),
      ...(item.mediumSrc ? [h('source', { media: `(min-width: ${MEDIUM_MIN_WIDTH})`, srcset: item.mediumSrc })] : []),
      h('img', {
        src: item.src,
        alt: item.altText ?? props.placeholderAlt ?? '',
        loading: props.priority ? 'eager' : 'lazy',
        decoding: 'async',
        fetchpriority: props.priority ? 'high' : undefined,
        itemprop: props.itemProp,
        class: props.imgClassName,
      }),
    );
  },
  propsFrom: (element) => ({
    className: element.getAttribute('class') ?? undefined,
    priority: element.hasAttribute('data-image-priority'),
    itemProp: element.getAttribute('data-image-item-prop') ?? undefined,
    imgClassName: element.getAttribute('data-image-img-class') ?? undefined,
    placeholderAlt: element.getAttribute('data-image-alt') ?? undefined,
  }),
};

// ---------------------------------------------------------------------------
// Groups: lists, table rows, and sections
// ---------------------------------------------------------------------------

/** Attributes for a container that renders every item of a name in sort order. */
export function listAttributes(type: ContentType, name: string): Record<string, string> {
  return { [`data-${type}-list`]: name };
}

/**
 * The refs a list renders: every item of a name in sort order, or, while
 * there are none, `fallback` empty slots (sort orders 0 to n - 1) so their
 * placeholders show and the editor can create them.
 */
export function listRefs<T extends { name: string; sortOrder: number }>(items: readonly T[], name: string, fallback = 0): ContentRef<T>[] {
  const found = items.filter((item) => item.name === name).sort((a, b) => a.sortOrder - b.sortOrder);
  if (found.length > 0) return found.map((item) => ({ name, sortOrder: item.sortOrder, item }));
  return Array.from({ length: fallback }, (_, sortOrder) => ({ name, sortOrder }));
}

/**
 * The sort orders of a table's rows: every sort order used by any of its
 * column names, so a row with an empty cell still appears.
 */
export function rowSortOrders(items: readonly { name: string; sortOrder: number }[], columns: readonly string[], fallback = 0): number[] {
  const orders = new Set(items.filter((item) => columns.includes(item.name)).map((item) => item.sortOrder));
  if (orders.size === 0) return Array.from({ length: fallback }, (_, index) => index);
  return [...orders].sort((a, b) => a - b);
}

/** Attributes for a table row: the column items that share one sort order. */
export function rowAttributes(sortOrder: number): Record<string, string> {
  return { 'data-content-row': String(sortOrder) };
}

export const ROWS_ATTRIBUTE = 'data-content-rows';
export const ROW_ATTRIBUTE = 'data-content-row';

export interface SectionProps {
  className?: string | undefined;
  /** The section name used while the item does not exist. */
  placeholder: string;
  as?: string | undefined;
  attributes?: PassThrough | undefined;
}

/**
 * A page section ordered by a text item whose value names the section. The
 * value goes in `data-section`; the section's content is the page's own and
 * is never touched, like a boolean's.
 */
export const section: ComponentSpec<TextItem, SectionProps> = {
  type: 'text',
  volatile: volatileFor('text', 'data-section'),
  ownsChildren: false,
  render(ref, props) {
    const value = ref.item?.value.trim();
    return h(props.as ?? 'section', {
      ...passThrough(props.attributes),
      class: props.className,
      ...contentAttributes('text', ref, !value),
      'data-section': value || props.placeholder,
    });
  },
  propsFrom: (element) => ({
    className: element.getAttribute('class') ?? undefined,
    placeholder: element.getAttribute('data-section') ?? '',
    as: element.localName,
  }),
};
