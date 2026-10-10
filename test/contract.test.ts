// The contract the Baack editor relies on, checked for every component:
//
// 1. The DOM contract: `data-<type>-name`, `-sort-order`, and `-urn` for a
//    real item or `data-placeholder` for a placeholder, never both.
// 2. Write-back: the editor re-renders an element from the props it reads
//    back (`propsFrom`) and patches it in place (`patch` with `volatile`),
//    exactly as `renderInto` in baack-ts-editor's `src/core/registry.ts`.
//    The result must equal the component's own render of the new item, so a
//    saved value looks as it will after the next build. This catches a prop
//    that is not written to the element, and an attribute missing from
//    `volatile`.
// 3. Pass-through attributes stay through a write-back, and cannot replace
//    the contract's own attributes.
// 4. The React components render the same markup as the core.
//
// Runs against the build: `npm test` builds first.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Window } from 'happy-dom';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as spec from '../dist/core/components.js';
import { patch, toDom } from '../dist/core/vnode.js';
import * as react from '../dist/react/index.js';
import type { ComponentSpec, ContentRef } from '../dist/core/components.js';

const document = new Window().document as unknown as Document;

/** An element's markup with attributes sorted, so attribute order does not matter. */
function normalize(node: Node): string {
  if (node.nodeType === 3) return (node.textContent ?? '').replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);
  if (node.nodeType !== 1) return '';
  const element = node as Element;
  const attrs = [...element.attributes]
    .map((a) => `${a.name}="${a.value}"`)
    .sort()
    .join(' ');
  const children = [...element.childNodes].map(normalize).join('');
  return `<${element.localName}${attrs ? ` ${attrs}` : ''}>${children}</${element.localName}>`;
}

function parse(markup: string): Element {
  const holder = document.createElement('div');
  holder.innerHTML = markup;
  assert.equal(holder.children.length, 1, `one root element in ${markup}`);
  return holder.firstElementChild!;
}

/** One component: two different items, a set of prop combinations, and its React wrapper. */
interface Case<I, P> {
  name: string;
  spec: ComponentSpec<I, P>;
  react: ComponentType<never>;
  items: [I, I];
  props: P[];
  /** For components that wrap page content (boolean, section). */
  children?: ReactNode;
}

const ts = (urn: string) => ({ urn, owner: { urn: 'o' }, entity: { urn: 'e' }, name: 'n', sortOrder: 0 });
const textA = { ...ts('t1'), value: 'First line\nsecond line' };
const textB = { ...ts('t2'), value: 'Para one\n\nPara two with https://www.baack.co' };
const pass = { attributes: { id: 'x', 'data-track': 'hero', 'aria-label': 'Label', itemscope: '', 'data-text-urn': 'forged', 'data-placeholder': '' } };

const cases: Case<any, any>[] = [
  {
    name: 'text',
    spec: spec.text,
    react: react.ContentText,
    items: [textA, textB],
    props: [
      { placeholder: 'Placeholder' },
      { placeholder: 'P', as: 'h1', className: 'title', itemProp: 'name', linkify: true },
      { placeholder: 'P', as: 'title' },
      { placeholder: 'P', unsafeLiteral: true },
      { placeholder: 'P', ...pass },
    ],
  },
  {
    name: 'textBlock',
    spec: spec.textBlock,
    react: react.ContentTextBlock,
    items: [textA, textB],
    props: [
      { placeholder: 'Placeholder' },
      { placeholder: 'P', as: 'article', className: 'prose', paragraphClassName: 'lead', linkify: true },
      { placeholder: 'P', ...pass },
    ],
  },
  {
    name: 'meta',
    spec: spec.meta,
    react: react.ContentMeta,
    items: [textA, textB],
    props: [{ name: 'description', placeholder: 'P' }, { property: 'og:title', placeholder: 'P', ...pass }],
  },
  {
    name: 'markdown',
    spec: spec.markdown,
    react: react.ContentMarkdown,
    items: [
      { ...ts('m1'), value: '<p>One</p>' },
      { ...ts('m2'), value: '<h2>Two</h2><p>three</p>' },
    ],
    props: [{ placeholder: 'P' }, { placeholder: 'P', as: 'section', className: 'prose', itemProp: 'text', ...pass }],
  },
  {
    name: 'template',
    spec: spec.template,
    react: react.ContentTemplate,
    items: [
      { ...ts('tp1'), value: '<p>Hello</p>' },
      { ...ts('tp2'), value: '<p>World</p>' },
    ],
    props: [{ placeholder: 'P' }],
  },
  {
    name: 'money',
    spec: spec.money,
    react: react.ContentMoney,
    items: [
      { ...ts('mo1'), currencyCode: 'GBP', unitValue: 1999, formattedValue: '19.99', currencySymbol: '£' },
      { ...ts('mo2'), currencyCode: 'JPY', unitValue: 500, formattedValue: '500', currencySymbol: '¥' },
    ],
    props: [
      { placeholder: 'Contact us' },
      { placeholder: 'P', className: 'price', itemProp: 'value' },
      { placeholder: 'P', offer: true, ...pass },
    ],
  },
  {
    name: 'long',
    spec: spec.long,
    react: react.ContentLong,
    items: [
      { ...ts('l1'), value: 1234567 },
      { ...ts('l2'), value: 42 },
    ],
    props: [{ placeholder: 'P' }, { placeholder: 'P', locale: 'de-DE', className: 'n', itemProp: 'size', ...pass }],
  },
  {
    name: 'double',
    spec: spec.double,
    react: react.ContentDouble,
    items: [
      { ...ts('d1'), value: 3.25 },
      { ...ts('d2'), value: 1000.5 },
    ],
    props: [{ placeholder: 'P', locale: 'fr-FR' }],
  },
  {
    name: 'dateTime',
    spec: spec.dateTime,
    react: react.ContentDate,
    items: [
      { ...ts('dt1'), value: '2026-10-10T09:30:00.000' },
      { ...ts('dt2'), value: '2025-01-02T23:15:00.000' },
    ],
    props: [
      { placeholder: 'P' },
      { placeholder: 'P', dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/London', locale: 'en-GB', itemProp: 'startDate', ...pass },
    ],
  },
  {
    name: 'boolean',
    spec: spec.boolean,
    react: react.ContentBoolean,
    items: [
      { ...ts('b1'), value: true },
      { ...ts('b2'), value: false },
    ],
    props: [{}, { invert: true, as: 'aside', className: 'banner', ...pass }],
    children: 'Page content',
  },
  {
    name: 'latLong',
    spec: spec.latLong,
    react: react.ContentLatLong,
    items: [
      { ...ts('ll1'), latitude: 51.5, longitude: -0.12 },
      { ...ts('ll2'), latitude: 40.7, longitude: -74 },
    ],
    props: [{ placeholder: 'P' }, { placeholder: 'P', itemProp: 'geo', className: 'geo', ...pass }],
  },
  {
    name: 'link',
    spec: spec.link,
    react: react.ContentLink,
    items: [
      { ...ts('k1'), href: '/pricing', text: 'Pricing', rel: 'nofollow', lang: 'en' },
      { ...ts('k2'), href: 'https://www.baack.co/docs', text: '' },
    ],
    props: [{ placeholder: 'P' }, { placeholder: 'P', placeholderHref: '/', itemProp: 'item', textItemProp: 'name', className: 'nav', ...pass }],
  },
  {
    name: 'image',
    spec: spec.image,
    react: react.ContentImage,
    items: [
      { ...ts('i1'), src: 'https://cdn/a.png', mediumSrc: 'https://cdn/a-m.png', largeSrc: 'https://cdn/a-l.png', altText: 'A team photo' },
      { ...ts('i2'), src: 'https://cdn/b.png' },
    ],
    props: [{}, { className: 'hero', imgClassName: 'cover', priority: true, itemProp: 'image', placeholderAlt: 'Decorative', ...pass }],
  },
  {
    name: 'section',
    spec: spec.section,
    react: react.ContentSection,
    items: [
      { ...ts('s1'), value: 'pricing' },
      { ...ts('s2'), value: 'faq' },
    ],
    props: [{ placeholder: 'intro' }, { placeholder: 'intro', as: 'div', className: 'band', ...pass }],
    children: 'Page content',
  },
];

const ref = <I>(item?: I): ContentRef<I> => ({ name: 'hero', sortOrder: 2, item });

for (const c of cases) {
  describe(c.name, () => {
    const type = c.spec.type;

    test('carries the DOM contract: -urn for an item, data-placeholder without one', () => {
      for (const props of c.props) {
        const real = c.spec.render(ref(c.items[0]), props).attrs;
        assert.equal(real[`data-${type}-name`], 'hero');
        assert.equal(real[`data-${type}-sort-order`], '2');
        if (real['data-placeholder'] === undefined) {
          assert.equal(real[`data-${type}-urn`], c.items[0].urn);
        } else {
          assert.equal(real[`data-${type}-urn`], undefined, 'a placeholder has no -urn');
        }
        const empty = c.spec.render(ref(), props).attrs;
        assert.equal(empty['data-placeholder'], '');
        assert.equal(empty[`data-${type}-urn`], undefined);
      }
    });

    // From each starting state (placeholder, or another item) to each item, for every prop combination.
    for (const [p, props] of c.props.entries()) {
      for (const [from, start] of [undefined, ...c.items].entries()) {
        for (const [to, next] of c.items.entries()) {
          if (start === next) continue;
          test(`write-back, props #${p}: ${from === 0 ? 'placeholder' : `item ${from - 1}`} to item ${to}`, () => {
            const element = toDom(c.spec.render(ref(start), props), document) as Element;
            patch(element, c.spec.render(ref(next), c.spec.propsFrom(element)), c.spec.volatile, c.spec.ownsChildren);
            const expected = toDom(c.spec.render(ref(next), props), document) as Element;
            assert.equal(normalize(element), normalize(expected));
          });
        }
      }
    }

    test('pass-through attributes are kept; contract attributes cannot be forged', () => {
      const props = c.props.find((candidate) => candidate.attributes);
      if (!props) return;
      const attrs = c.spec.render(ref(c.items[0]), props).attrs;
      assert.equal(attrs['id'], 'x');
      assert.equal(attrs['data-track'], 'hero');
      assert.equal(attrs['aria-label'], 'Label');
      assert.equal(attrs[`data-${type}-urn`], c.items[0].urn);
      assert.equal(attrs['data-placeholder'], undefined);
      // A write-back leaves them on the element.
      const element = toDom(c.spec.render(ref(c.items[0]), props), document) as Element;
      patch(element, c.spec.render(ref(c.items[1]), c.spec.propsFrom(element)), c.spec.volatile, c.spec.ownsChildren);
      assert.equal(element.getAttribute('data-track'), 'hero');
    });

    test('React renders the same markup as the core', () => {
      for (const props of c.props) {
        for (const item of [undefined, ...c.items]) {
          const { attributes, ...rest } = props as { attributes?: Record<string, string> };
          // React takes pass-through attributes as props, spelled the React way.
          const reactAttributes = Object.fromEntries(Object.entries(attributes ?? {}).map(([k, v]) => [k === 'itemscope' ? 'itemScope' : k, k === 'itemscope' ? true : v]));
          const markup = renderToStaticMarkup(createElement(c.react, { content: ref(item), ...rest, ...reactAttributes } as never, c.children));
          const core = toDom(c.spec.render(ref(item), props), document) as Element;
          if (c.children !== undefined) core.append(String(c.children));
          assert.equal(normalize(parse(markup)), normalize(core));
        }
      }
    });
  });
}

describe('lists and rows', () => {
  const items = [
    { ...textA, name: 'feature', sortOrder: 5 },
    { ...textB, name: 'feature', sortOrder: 1 },
    { ...textA, urn: 'other', name: 'other', sortOrder: 0 },
  ];

  test('a list renders every item of its name in sort order, marked for the editor', () => {
    const markup = renderToStaticMarkup(
      createElement(react.ContentTextList, {
        name: 'feature',
        items,
        id: 'features',
        children: (content: ContentRef<typeof textA>) => createElement('li', null, createElement(react.ContentText, { content, placeholder: "P" } as never)),
      } as never),
    );
    const list = parse(markup);
    assert.equal(list.getAttribute('data-text-list'), 'feature');
    assert.equal(list.id, 'features');
    assert.deepEqual(
      [...list.querySelectorAll('[data-text-name]')].map((e) => e.getAttribute('data-text-sort-order')),
      ['1', '5'],
    );
  });

  test('an empty list shows `fallback` placeholders at sort orders 0 to n - 1', () => {
    assert.deepEqual(
      spec.listRefs([], 'feature', 3).map((r) => [r.sortOrder, r.item]),
      [
        [0, undefined],
        [1, undefined],
        [2, undefined],
      ],
    );
  });

  test('rows are every sort order used by a column, each marked', () => {
    const cells = [
      { name: 'plan', sortOrder: 0 },
      { name: 'users', sortOrder: 3 },
      { name: 'other', sortOrder: 9 },
    ];
    assert.deepEqual(spec.rowSortOrders(cells, ['plan', 'users']), [0, 3]);
    const markup = renderToStaticMarkup(
      createElement(react.ContentRows, { rows: [0, 3], children: (sortOrder: number) => createElement('td', null, String(sortOrder)) } as never),
    );
    const body = parse(`<table>${markup}</table>`).querySelector('tbody')!;
    assert.equal(body.getAttribute(spec.ROWS_ATTRIBUTE), '');
    assert.deepEqual(
      [...body.querySelectorAll(`[${spec.ROW_ATTRIBUTE}]`)].map((row) => row.getAttribute(spec.ROW_ATTRIBUTE)),
      ['0', '3'],
    );
  });
});
