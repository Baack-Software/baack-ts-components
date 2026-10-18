# Baack content components

Components that render [Baack](https://www.baack.co) content items on a page,
in a way the Baack editor can edit in place. Built on
[`@baack-software/baack-ts-client`](https://www.npmjs.com/package/@baack-software/baack-ts-client);
the editor (`baack-ts-editor`) depends on this package. React today; the
rendering lives in a framework-free core, so other frameworks can follow.

## Getting started

```sh
npm install @baack-software/baack-ts-components @baack-software/baack-ts-client
```

The client reads an entity and gives the `EntityView` the components render
from; React (18 or later) is needed only for `/react`.

To work on the components:

```sh
npm install
npm test      # build, then the contract check (test/contract.test.ts)
```

The contract check renders every component as the editor's write-back
does (read the props back from the element, re-render, patch in place) and
requires the result to equal the component's own render, so a prop that is
not written to the element fails it. It also compares the React output with
the core.

| Import | What it is |
| --- | --- |
| `@baack-software/baack-ts-components/react` | React components |
| `@baack-software/baack-ts-components/components` | Framework-free renderers (the editor's write-back) |
| `@baack-software/baack-ts-components/format` | Formatting: text, links, money, dates, numbers |
| `@baack-software/baack-ts-components/vnode` | The neutral element tree, a DOM builder and `patch` |
| `@baack-software/baack-ts-components/live` | Following the editor for content rendered in the browser |

[`docs/components.md`](docs/components.md) covers each item type's usage,
naming, lists and keyed groups (with an FAQ example), and the contract the
editor relies on.

## Principles: bridging components, scoped to the API

These components are the bridge between a site's markup and Baack content,
for site developers and for agents (the onboarding skill) converting a page.
They stay small and generic so they fit any site:

- **One component per API concept.** One per item type, plus `Content<Type>List`,
  `ContentRows` and `ContentSection` for the `name : sortOrder` matrix. Nothing
  else belongs here.
- **No domain components.** Breadcrumbs, price phases, FAQs, feature grids and
  cards are compositions: build them in the site from these components, with
  the site's own UI library (shadcn/ui on www.baack.co) for the markup and
  styling. A new component here needs a new API concept, not a new page.
- **Compose with pass-through attributes.** Every component, list and row
  container accepts `data-*`, `aria-*`, `id`, `role`, `title`, `lang`, `dir`,
  `tabIndex` and microdata (`itemScope`, `itemType`, `itemID`, `itemRef`) on its
  root, and containers accept a component as `as`. That is enough for
  accessibility, schema.org structure and UI libraries' `asChild` slots.
- **What changes the rendered value is a prop, written to the element.** Only
  those props are read back by the editor; pass-through attributes are left in
  place by its write-back.
- **Fix gaps here, generically.** If a site needs something a component cannot
  express, add a generic prop or attribute rather than a copy in the site.

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
- Each direct child of the container is one entry and moves as a whole when
  reordered: keep everything that belongs to an entry, such as a separator,
  inside it.
- `children` gets the entry's index too, for example for a schema.org
  `position` (index + 1).

### Example: breadcrumbs from link items, with shadcn/ui

Breadcrumbs are a list of links: `link` items named `breadcrumb` at sort
orders 0, 1, 2. The site's UI library supplies the markup; pass-through
attributes add the `BreadcrumbList` microdata. No breadcrumbs component is
needed:

```tsx
<Breadcrumb>
  <ContentLinkList name="breadcrumb" items={view.raw.links} as={BreadcrumbList}
      itemScope itemType="https://schema.org/BreadcrumbList">
    {(content, index) => (
      <BreadcrumbItem className="group" itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
        <ChevronRight aria-hidden="true" className="size-3.5 group-first:hidden" />
        <BreadcrumbLink asChild>
          <ContentLink content={content} placeholder="Home" itemProp="item" textItemProp="name"
              aria-current={content.item?.href === path ? 'page' : undefined} />
        </BreadcrumbLink>
        <meta itemProp="position" content={String(index + 1)} />
      </BreadcrumbItem>
    )}
  </ContentLinkList>
</Breadcrumb>
```

The separator sits inside each entry and is hidden on the first by CSS, and
the current page is found by its href, so both stay right after a reorder.

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

### Cards and other groups the site knows by key

When the site's code knows its groups (cards whose items are named
`service_<key>_title`, `_body`, and so on), `orderedRefs` puts them in the
order the content gives. It returns every key the site knows: those in the
order list by sort order, then those not listed yet, as placeholders the
editor creates on the first move. A section can be any element, so a card
is a section rendered as the site's card.

```tsx
<div {...listAttributes('text', 'services')} className="grid">
  {orderedRefs(view.raw.texts ?? [], 'services', ['design', 'onboarding', 'training']).map(({ key, content }) => (
    <ContentSection key={key} content={content} placeholder={key} as="article" className="card">
      {renderCard(key)}
    </ContentSection>
  ))}
</div>
```

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

## Content rendered in the browser: `useLiveEntity`

A hydrated island or a client-rendered app owns its DOM, so the editor does
not change it. Mark the content with `data-content-live` and render from
`useLiveEntity`, which returns the entity as the editor shows it while
editing, and the entity as given otherwise:

```tsx
const live = useLiveEntity(entity);
<div data-content-live>
  <ContentText content={{ name: 'hero_title', sortOrder: 0, item: live.texts?.find((t) => t.name === 'hero_title') }} placeholder="Title" />
</div>
```

`@baack-software/baack-ts-components/live` has the framework-free store
(`followEntity`) for other frameworks.

## Single items

`ContentText`, `ContentTextBlock`, `ContentMeta`, `ContentMarkdown`,
`ContentTemplate`, `ContentMoney`, `ContentLong`, `ContentDouble`,
`ContentDate`, `ContentBoolean`, `ContentLatLong`, `ContentLink` and
`ContentImage`. Each takes a `content` ref (`{name, sortOrder, item}`), a
`placeholder` shown until the item exists, and the pass-through attributes.
[`docs/components.md`](docs/components.md) has examples for each, the
markup and attributes it writes, and how text, money and dates are handled.

## License

Apache-2.0; see `LICENSE`.
