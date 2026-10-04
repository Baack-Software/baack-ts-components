# Baack content components

Components that render [Baack](https://www.baack.co) content items on a page,
in a way the Baack editor can edit in place. Depends on `baack-ts-client`;
the editor (`baack-ts-editor`) depends on this package. React today; the
rendering lives in a framework-free core, so other frameworks can follow.

## Getting started

```sh
(cd ../baack-ts-client && npm install && npm run build)   # linked with file: for now
npm install
npm run build
```

| Import | What it is |
| --- | --- |
| `@baack-software/baack-ts-components/react` | React components |
| `@baack-software/baack-ts-components/components` | Framework-free renderers (the editor's write-back) |
| `@baack-software/baack-ts-components/format` | Formatting: text, links, money, dates, numbers |
| `@baack-software/baack-ts-components/vnode` | The neutral element tree, a DOM builder and `patch` |

The contract the editor relies on is documented in `baack-ts-editor`
(`docs/components.md`).

## Lists from the content matrix: `Content<Type>List`

Every Baack item has a name and a sort order, so a name with sort orders 0,
1, 2 is a list. The list components render every item of a name in order,
with your own template for each entry:

```tsx
import { ContentTextList, ContentText } from '@baack-software/baack-ts-components/react';

<ContentTextList name="feature" items={view.raw.texts} as="ul" fallback={3}>
  {(content) => (
    <li>
      <ContentText content={content} placeholder="A feature" />
    </li>
  )}
</ContentTextList>
```

- Entries come out in sort order, however sparse the values are.
- `fallback` shows that many placeholder entries while the list is empty, so
  the page looks right before any content exists, and editors can create
  the items from the editor's outline.
- In the editor, a list can be **reordered** (a dialog that previews the new
  order on the page), and entries can be **added** between others.
- There is one per type: `ContentTextList`, `ContentMarkdownList`,
  `ContentMoneyList`, `ContentLongList`, `ContentDoubleList`,
  `ContentDateList`, `ContentLinkList`, `ContentImageList`.

### Page sections that editors can reorder

A list of text items can order the sections of a page: each item's value
names a section, and `ContentSection` wraps that section's content.

```tsx
<ContentTextList name="sections" items={view.raw.texts} as="div">
  {(content) => (
    <ContentSection content={content} placeholder="pricing">
      {renderSection(content.item?.value)}
    </ContentSection>
  )}
</ContentTextList>
```

Editors can then reorder whole sections from the editor and see the page
change as they do.

### Tables: `ContentRows`

A table row is the column items that share one sort order. `ContentRows`
renders one row per sort order used by any column, so a row with an empty
cell still appears, and the editor moves a row's cells together.

```tsx
<ContentRows rows={rowSortOrders(view.raw.texts ?? [], ['plan_name', 'plan_users'])}>
  {(sortOrder) => (
    <>
      <td><ContentText content={{ name: 'plan_name', sortOrder, item: view.text('plan_name', sortOrder) }} placeholder="Plan" /></td>
      <td><ContentText content={{ name: 'plan_users', sortOrder, item: view.text('plan_users', sortOrder) }} placeholder="-" /></td>
    </>
  )}
</ContentRows>
```

## Single items

`ContentText`, `ContentTextBlock`, `ContentMeta`, `ContentMarkdown`,
`ContentTemplate`, `ContentMoney`, `ContentLong`, `ContentDouble`,
`ContentDate`, `ContentBoolean`, `ContentLatLong`, `ContentLink` and
`ContentImage`. Each takes a `content` ref (`{name, sortOrder, item}`) and a
`placeholder` shown until the item exists. See `docs/components.md` for each
component's markup, the attributes they write, and how text, money and dates
are handled.
