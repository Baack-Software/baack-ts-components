// The canonical content components, framework-free. Each renders one item to
// a VElement carrying the DOM contract (`data-<type>-name`, `-sort-order`,
// `-urn` or `data-placeholder`) and schema.org microdata where it applies.
//
// Every rendering choice that a prop controls is also written to the element
// (`data-text-layout`, `data-locale`, ...), so the editor can recover the
// props from the page and re-render an item exactly as the component did.

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

interface CommonProps {
  className?: string | undefined;
  /** schema.org microdata property, e.g. "name" inside a Product. */
  itemProp?: string | undefined;
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
}

/** Inline text: lines joined by `<br>`. */
export const text: ComponentSpec<TextItem, TextProps> = {
  type: 'text',
  volatile: volatileFor('text'),
  ownsChildren: true,
  render(ref, props) {
    const fromItem = ref.item ? textLines(ref.item.value) : [];
    const placeholder = fromItem.length === 0;
    const tag = props.as ?? 'span';
    const content = placeholder ? textLines(props.placeholder) : fromItem;
    return h(
      tag,
      {
        class: props.className,
        itemprop: props.itemProp,
        ...contentAttributes('text', ref, placeholder),
        'data-text-linkify': props.linkify ? '' : undefined,
      },
      ...lines(content, (line) => linked(line, props.linkify === true), tag !== 'title' && tag !== 'option'),
    );
  },
  propsFrom: (element) => ({
    ...common(element),
    placeholder: '',
    as: element.localName,
    linkify: element.hasAttribute('data-text-linkify'),
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
    return h(
      props.as ?? 'div',
      {
        class: props.className,
        itemprop: props.itemProp,
        ...contentAttributes('text', ref, placeholder),
        'data-text-layout': 'paragraphs',
        'data-text-linkify': props.linkify ? '' : undefined,
      },
      ...paragraphs.map((paragraph) =>
        h('p', { class: props.paragraphClassName }, ...lines(paragraph, (line) => linked(line, props.linkify === true), true)),
      ),
    );
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
    if (!item) {
      return h('span', { class: props.className, ...contentAttributes('money', ref, true) }, props.placeholder);
    }
    const amount = moneyAmount(item);
    return h(
      'span',
      {
        class: props.className,
        itemprop: props.offer ? 'price' : props.itemProp,
        content: props.offer ? amount : undefined,
        ...contentAttributes('money', ref, false),
        'data-money-currency': item.currencyCode,
        'data-money-unit-value': String(item.unitValue),
      },
      h(
        'span',
        { itemprop: props.offer ? 'priceCurrency' : undefined, content: props.offer ? item.currencyCode : undefined },
        moneySymbol(item),
      ),
      amount,
    );
  },
  propsFrom: (element) => {
    const offer = element.getAttribute('itemprop') === 'price';
    return { className: element.getAttribute('class') ?? undefined, itemProp: offer ? undefined : element.getAttribute('itemprop') ?? undefined, offer, placeholder: '' };
  },
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
}

/** An `<a>` from a link item: `href`, `rel`, `hreflang` from `lang`, and its text (or the href). */
export const link: ComponentSpec<LinkItem, LinkProps> = {
  type: 'link',
  volatile: volatileFor('link', 'rel', 'hreflang'),
  ownsChildren: true,
  render(ref, props) {
    const item = ref.item;
    return h(
      'a',
      {
        class: props.className,
        itemprop: props.itemProp,
        href: item ? item.href : props.placeholderHref ?? '#',
        rel: item?.rel || undefined,
        hreflang: item?.lang || undefined,
        ...contentAttributes('link', ref, !item),
      },
      item ? item.text || item.href : props.placeholder,
    );
  },
  propsFrom: (element) => ({ ...common(element), placeholder: '' }),
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
    const attrs = { class: props.className, ...contentAttributes('image', ref, !item?.src) };
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
  propsFrom: (element) => {
    const img = element.querySelector('img');
    return {
      className: element.getAttribute('class') ?? undefined,
      priority: img?.getAttribute('loading') === 'eager',
      itemProp: img?.getAttribute('itemprop') ?? undefined,
      imgClassName: img?.getAttribute('class') ?? undefined,
      placeholderAlt: '',
    };
  },
};
