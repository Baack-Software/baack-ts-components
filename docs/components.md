# Content components

The components render Baack items on a page so the Baack editor can find,
edit and reorder them in place. This document covers how to use them and
the contract the editor relies on: the markup each component writes, and
why every rendering prop is written to the element.

## Layout

| Path | What it is |
| --- | --- |
| `src/core/vnode.ts` | A neutral element tree (`VElement`), a DOM builder, and `patch`, which updates an existing element in place. |
| `src/core/format.ts` | Pure formatting: text lines and paragraphs, links, money in integer minor units, UTC timestamps, dates, numbers. |
| `src/core/components.ts` | One renderer per component. Each turns a `ContentRef` and props into a `VElement`, and can read its props back from a rendered element. |
| `src/core/live.ts` | The store shared by the editor and content rendered in the browser. |
| `src/react/index.tsx` | Thin React wrappers: `toReact(spec.render(...))`. |

The editor imports only the core subpaths (`/components`, `/format`,
`/vnode`, `/live`), never `/react`. After a save it re-renders an element
with the same renderer the page used, so the page looks as it will after
the next build.

## Principles

The components bridge a site's markup and Baack content, for site
developers and for agents converting a page to content.

- **Scoped to the API's concepts.** One component per item type, plus lists,
  rows and sections over the `name : sortOrder` matrix. A new component needs
  a new API concept.
- **No domain components.** Breadcrumbs, price phases, FAQs, cards and grids
  are compositions built in the site, with the site's own UI library for
  markup and styling (shadcn/ui on www.baack.co).
- **Composed through pass-through attributes**, not new props per use (see
  below). Containers take a component as `as`, so a UI library's list or
  table body can be the container.
- **Sites use the library, not copies.** Site styling is applied through the
  attributes the components write (`data-text-layout`, `data-text-linkify`,
  `data-markdown-name`, ...). A gap is fixed in the library, generically.

## Rendering from an entity

A page reads its entity with `baack-ts-client` and wraps it in an
`EntityView`, which finds an item by name and sort order. Every component
takes a `content` ref, `{ name, sortOrder, item }`, where `item` is absent
until the item exists. A small helper keeps the call sites short:

```tsx
import { EntityView, type Entity } from '@baack-software/baack-ts-client';
import { ContentText, type ContentRef } from '@baack-software/baack-ts-components/react';

/** A content ref for a cell, whether or not the item exists. */
function ref<T>(item: T | undefined, name: string, sortOrder = 0): ContentRef<T> {
  return { name, sortOrder, item };
}

export function Page({ entity }: { entity: Entity }) {
  const view = EntityView.from(entity);
  return (
    <main data-entity-urn={view.urn}>
      <ContentText as="h1" content={ref(view.text('hero_title'), 'hero_title')} placeholder="Content that works everywhere" />
    </main>
  );
}
```

The view has an accessor per type (`text`, `markdown`, `template`, `money`,
`long`, `double`, `date`, `boolean`, `latLong`, `link`, `image`), each taking
a name and an optional sort order, and `raw` for the entity's item arrays
(`view.raw.texts`), which the list helpers take.

**The placeholder is the copy the page shows until the item exists.** When a
page is converted to content, the placeholder is the page's current copy, so
the site renders exactly as before and the editor can create every item from
its placeholder in one go.

### Scopes

`data-entity-urn` on an element marks the entity its items belong to. Put
the page's entity on the page's root, and give content from another entity
(a menu, a footer, an FAQ shown on several pages) its own scope:

```tsx
<html lang="en" data-entity-urn={page.urn}>
  <nav data-entity-urn={menu.urn}>…</nav>
  <section data-entity-urn={faq?.urn ?? ''}>…</section>
</html>
```

An **empty** `data-entity-urn` marks content from an entity that does not
exist yet. The editor binds nothing inside it and never takes it for the
page's own items.

## Naming content

- **Names are snake_case** and say what the content is in its section:
  `pricing_intro`, `hero_title`, `plan_name`.
- **Repeated content is one name** with sort orders 0, 1, 2: three features
  are `feature:0`, `feature:1`, `feature:2`, rendered by a list.
- **A value used in an attribute is its own item**: the page title, a meta
  description, an `aria-label` (`name_title`, `name_content`).
- **Items stand alone.** A paragraph, a heading, a list entry, a table cell.
  Not single words, and not a block with styled phrases inside: that is a
  markdown item, or several items side by side.
- **Name entries by key, not position,** when entries are added over time or
  other pages pick them by id: `faq_<id>_question`, ordered by a list of keys
  (see [Content the site knows by key](#content-the-site-knows-by-key)),
  rather than `faq_question:n`, whose sort orders shift when an entry is
  inserted.
- **Shared content has its own entity**, rendered in its own scope.

## Components

| React | Item | Element | Notes |
| --- | --- | --- | --- |
| `ContentText` | text | `span` (or `as`) | Lines joined by `<br>`. `linkify` turns URLs and emails into links. Escaped: markup in a value shows as typed. `unsafeLiteral` (discouraged) inserts the value as HTML. |
| `ContentTextBlock` | text | `div` of `p` | Blank lines separate paragraphs. Escaped, with `unsafeLiteral` as for `ContentText`. |
| `ContentMeta` | text | `meta` | The value goes in `content`. For the head. |
| `ContentMarkdown` | markdown | `div` | Inserts the entity view's rendered HTML. Pass the view's item, never the source. |
| `ContentTemplate` | template | `div` | As markdown, for template output. |
| `ContentMoney` | money | `span` | Symbol in a nested `span`, then the amount. `offer` adds schema.org `price` and `priceCurrency`. |
| `ContentLong`, `ContentDouble` | long, double | `data` | Raw value in `value`, formatted text inside. |
| `ContentDate` | dateTime | `time` | UTC instant in `datetime`; `dateStyle`, `timeStyle`, `timeZone` (default UTC) and `locale` format the text. |
| `ContentBoolean` | boolean | `div` (or `as`) | Wraps page content and sets `hidden` when off (`invert` flips it). The content is the page's. |
| `ContentLatLong` | latLong | `span` | schema.org `GeoCoordinates` with `latitude` and `longitude` microdata. |
| `ContentLink` | link | `a` | `href`, `rel`, `hreflang` from `lang`; the text, or the href. `textItemProp` wraps the text in a `span` with that microdata property (`name` on a ListItem). |
| `ContentImage` | image | `picture` | `src`, then `mediumSrc` from 768px and `largeSrc` from 1024px. Empty but still tagged when there is no file. |
| `Content<Type>List` | any | container (`ul`, or a component) | Every item of a name in sort order, each rendered by a child template given the ref and its index; `fallback` placeholder entries while empty. Writes `data-<type>-list`. |
| `ContentRows` | (several) | `tbody` of `tr` (or components) | A table row per sort order across its column names; writes `data-content-rows` and `data-content-row`. |
| `ContentSection` | text | `section` (or `as`) | A page section, or a card, ordered by a text item naming its key; the value goes in `data-section` and the content is the page's. |
| `ContentSelect` | text (three names) | `label` holding a `span` and a `select` | The select's label, and its options' labels and values paired by sort order. Each `option` is a row (`ContentOption`): the label as its text, the value bound to `value`. |

JSON and reference items have no component: they drive logic, not display.

## Using each item type

### Text

`ContentText` is for inline text and single-line elements: give the
element as `as`. `title` and `option` get one line; elsewhere, line breaks
in the value become `<br>`.

```tsx
<head>
  <ContentText as="title" content={ref(view.text('page_title'), 'page_title')} placeholder="Pricing | Baack" />
  <ContentMeta name="description" content={ref(view.text('meta_description'), 'meta_description')} placeholder="Plans for every team." />
  <ContentMeta property="og:title" content={ref(view.text('og_title'), 'og_title')} placeholder="Baack pricing" />
</head>

<ContentText as="h1" content={ref(view.text('hero_title'), 'hero_title')} placeholder="Simple pricing" />
<p>
  Hello, <ContentText content={ref(view.text('greeting'), 'greeting')} placeholder="there" />!
</p>
```

`ContentTextBlock` is for prose: each blank-line-separated block of the
value becomes a `<p>`, styled with `paragraphClassName`.

```tsx
<ContentTextBlock
  content={ref(view.text('about_body'), 'about_body')}
  placeholder={'We build content tools.\n\nOur team works from London.'}
  className="prose"
  paragraphClassName="mb-4"
/>
```

Text is always shown as typed (see [Text is escaped](#text-is-escaped)). A
styled phrase inside a sentence is a separate item with its own element,
not markup in the value:

```tsx
<p>
  <ContentText content={ref(view.text('cta_lead'), 'cta_lead')} placeholder="Start today: " />
  <strong>
    <ContentText content={ref(view.text('cta_emphasis'), 'cta_emphasis')} placeholder="the first month is free" />
  </strong>
</p>
```

### Links, and email addresses in copy

`ContentLink` renders an `<a>` from a link item's `href`, `text`, `rel` and
`lang`. Turn an email address or URL in copy into a link item rather than
relying on `linkify`. "Email sales@baack.co" becomes either one link, when
the whole phrase is the action:

```tsx
<ContentLink content={ref(view.link('contact_link'), 'contact_link')} placeholder="Email sales" placeholderHref="mailto:sales@baack.co" />
```

or text followed by a link, when only the address is:

```tsx
<p>
  <ContentText content={ref(view.text('contact_lead'), 'contact_lead')} placeholder="Email " />
  <ContentLink content={ref(view.link('contact_email'), 'contact_email')} placeholder="sales@baack.co" placeholderHref="mailto:sales@baack.co" />
</p>
```

Use `linkify` only where a separate link item does not fit.

### Markdown and templates

`ContentMarkdown` and `ContentTemplate` insert the HTML the entity view has
already rendered. Pass the view's item; never pass an item's source or any
other string you built. Use markdown for rich copy with headings, lists and
inline styling.

```tsx
<ContentMarkdown content={ref(view.markdown('privacy_body'), 'privacy_body')} placeholder="Our privacy policy." className="prose" />
```

### Money

Money is integer minor units, formatted from the API's `formattedValue` and
`currencySymbol`. Inside a schema.org `Offer`, set `offer` so the amount and
currency become its `price` and `priceCurrency`. The placeholder is never
used as a price, so "Contact us" is safe:

```tsx
<div itemProp="offers" itemScope itemType="https://schema.org/Offer">
  <ContentMoney content={ref(view.money('pro_price'), 'pro_price')} placeholder="Contact us" offer />
  <span>/month</span>
</div>
```

### Numbers and dates

```tsx
<dl>
  <dt>Customers</dt>
  <dd><ContentLong content={ref(view.long('customers'), 'customers')} placeholder="Hundreds" /></dd>
  <dt>Rating</dt>
  <dd><ContentDouble content={ref(view.double('rating'), 'rating')} placeholder="Unrated" locale="en-US" /></dd>
  <dt>Launch</dt>
  <dd><ContentDate content={ref(view.date('launch_date'), 'launch_date')} placeholder="Soon" dateStyle="long" timeZone="Europe/London" /></dd>
</dl>
```

Numbers and dates format in `en-GB` unless `locale` is given, and dates in
UTC unless `timeZone` is, so a build server and a browser render the same
text.

### Flags

`ContentBoolean` shows or hides the page's own content. Hidden content stays
in the page, with `hidden` set.
`fallback` is the value until the item exists; `invert` shows the content
when the flag is off.

```tsx
<ContentBoolean content={ref(view.boolean('show_banner'), 'show_banner')} fallback>
  <aside className="banner">
    <ContentText content={ref(view.text('banner_text'), 'banner_text')} placeholder="New: scheduled publishing" />
  </aside>
</ContentBoolean>
```

### Images and places

```tsx
<ContentImage content={ref(view.image('hero_image'), 'hero_image')} placeholderAlt="" priority imgClassName="rounded-lg" />
<ContentLatLong content={ref(view.latLong('office'), 'office')} placeholder="London" itemProp="geo" />
```

`priority` is for an image above the fold: it loads eagerly with a high
fetch priority. `placeholderAlt=""` marks a decorative image.

## Lists, rows and sections

Every item has a name and a sort order, so a name with sort orders 0, 1, 2
is a list. The editor can reorder a list's entries and add entries between
them.

### Lists

`Content<Type>List` renders every item of a name in sort order, with the
site's template for each entry. There is one per type: `ContentTextList`,
`ContentMarkdownList`, `ContentMoneyList`, `ContentLongList`,
`ContentDoubleList`, `ContentDateList`, `ContentLinkList` and
`ContentImageList`.

```tsx
<ContentTextList name="feature" items={view.raw.texts} as="ul" fallback={3}>
  {(content) => (
    <li>
      <ContentText content={content} placeholder="A feature" />
    </li>
  )}
</ContentTextList>
```

- `fallback` shows that many placeholder entries while the list is empty.
- Each direct child of the container is one entry and moves as a whole:
  keep everything that belongs to an entry, such as a separator, inside it.
- `children` gets the entry's index too, for example for a schema.org
  `position` (index + 1).

The README has a worked example: breadcrumbs from link items with shadcn/ui.

### Tables

`ContentRows` renders one row per sort order used by any of its columns, so
a row with an empty cell still appears, and the editor moves a row's cells
together.

```tsx
<table>
  <ContentRows rows={rowSortOrders(view.raw.texts ?? [], ['plan_name', 'plan_users'], 2)}>
    {(sortOrder) => (
      <>
        <td><ContentText content={ref(view.text('plan_name', sortOrder), 'plan_name', sortOrder)} placeholder="Plan" /></td>
        <td><ContentText content={ref(view.text('plan_users', sortOrder), 'plan_users', sortOrder)} placeholder="Ask us" /></td>
      </>
    )}
  </ContentRows>
</table>
```

### Sections the content orders

A text list can order the sections of a page: each item's value names a
section, and `ContentSection` wraps it. Editors then reorder whole sections
from the editor, even though two sections are rarely on screen together.

```tsx
<ContentTextList name="sections" items={view.raw.texts} as="div" fallback={1}>
  {(content) => (
    <ContentSection content={content} placeholder="about">
      {renderSection(view, content.item?.value ?? 'about')}
    </ContentSection>
  )}
</ContentTextList>
```

Here the content decides which sections exist, so `renderSection` must
handle a name it does not know.

### Selects

A `<select>` is three names: its label, and two names whose items pair up
by sort order, the options' labels and their values. Both are content, so
a reorder, an insert or a removal moves a label and its value together,
and they cannot drift apart as a fixed list of values in code would.

```tsx
<ContentSelect
  content={ref(view.text('locale_label'), 'locale_label')} placeholder="Language"
  labels={{ name: 'locale_option', items: view.texts('locale_option') }}
  values={{ name: 'locale_option_value', items: view.texts('locale_option_value') }}
  placeholderOptions={[{ label: 'English', value: 'en-GB' }, { label: 'Français', value: 'fr-FR' }]}
  select={{ name: 'locale', defaultValue: 'en-GB', onChange }}
  className="grid gap-1" labelClassName="text-sm" selectClassName="rounded border"
/>
```

```html
<label class="grid gap-1">
  <span data-text-name="locale_label" data-text-sort-order="0" data-placeholder="">Language</span>
  <select name="locale" data-content-rows="">
    <option data-content-row="0" value="fr-FR"
            data-text-name="locale_option" data-text-sort-order="0" data-text-urn="…"
            data-attr-value-name="locale_option_value" data-attr-value-sort-order="0" data-attr-value-urn="…">Français</option>
  </select>
</label>
```

The options are every sort order either name uses; while neither has
items, `placeholderOptions` show at sort orders 0 to n - 1. Pass-through
attributes go to the `<select>`, the site's own select attributes
(`name`, `value`, `onChange`, `disabled`) in `select`. `labelClassName="sr-only"`
hides the label but keeps it for screen readers. A value an editor changes
is a value the page's code receives: editors are trusted to know that.

The editor does not read bound attributes yet: it edits the labels in
place, and the values only once it lists bound attributes (planned with
its edit control for content that is not visible).

### Content the site knows by key

Most often the site's code knows its groups: service cards, plans, FAQ
questions, each with items named after its key (`service_design_title`,
`service_design_body`). `orderedRefs(items, name, keys)` puts those groups
in the order a text list gives, and returns **every key the site knows**:
those in the list by sort order, then those not listed yet as placeholders
at free sort orders after them. So a group the content has never mentioned
still renders, and the editor creates its order item on the first move. A
listed key the site does not know is skipped, and a key listed twice is
placed by its lowest sort order.

The container carries `listAttributes`, and each group is a
`ContentSection` rendered as whatever element the site's card is:

```tsx
const SERVICES = [
  { key: 'design', title: 'Solution design', body: 'We help you design your solution.' },
  { key: 'onboarding', title: 'Onboarding support', body: 'Expert support from our team.' },
  { key: 'training', title: 'Customer workshops', body: 'Align your content with your goals.' },
];

<div {...listAttributes('text', 'services')} className="grid">
  {orderedRefs(view.raw.texts ?? [], 'services', SERVICES.map((service) => service.key)).map(({ key, content }) => {
    const service = SERVICES.find((s) => s.key === key)!;
    return (
      <ContentSection key={key} content={content} placeholder={key} as="article" className="card">
        <h3>
          <ContentText content={ref(view.text(`service_${key}_title`), `service_${key}_title`)} placeholder={service.title} />
        </h3>
        <ContentText as="p" content={ref(view.text(`service_${key}_body`), `service_${key}_body`)} placeholder={service.body} />
      </ContentSection>
    );
  })}
</div>
```

The order item's value is the key, written to `data-section`, so a group
whose order item does not exist yet still says which group it is.

### Example: an FAQ with collapsed answers, from a shared entity

An FAQ shows the same structure at two levels, and most of it is out of
sight: answers sit in closed `<details>`, and the questions are spread over
groups. Keying by id keeps it orderable and stable:

- `groups` is a text list of group keys; `group_<group>_title` is each
  group's heading.
- `group_<group>_faqs` is a text list of question ids in that group;
  `faq_<id>_question` and `faq_<id>_answer` are each question's items.

The FAQ is shared by several pages, so it is its own entity in its own
scope, empty until the entity exists. The placeholders are the site's
current copy.

```tsx
const FAQ_GROUPS = [
  {
    key: 'billing',
    title: 'Billing',
    questions: [
      { id: 'refunds', question: 'Can I get a refund?', answer: 'Yes, within 30 days.' },
      { id: 'invoices', question: 'Do you send invoices?', answer: 'Every month, by email.' },
    ],
  },
  {
    key: 'security',
    title: 'Security',
    questions: [{ id: 'sso', question: 'Do you support single sign-on?', answer: 'Yes, with SAML and OIDC.' }],
  },
];

/** `faq` is undefined until the FAQ entity exists: the placeholders show, in an empty scope. */
export function Faq({ faq }: { faq: EntityView | undefined }) {
  const texts = faq?.raw.texts ?? [];
  return (
    <section data-entity-urn={faq?.urn ?? ''}>
      <div {...listAttributes('text', 'groups')}>
        {orderedRefs(texts, 'groups', FAQ_GROUPS.map((g) => g.key)).map(({ key: groupKey, content: groupRef }) => {
          const group = FAQ_GROUPS.find((g) => g.key === groupKey)!;
          const list = `group_${groupKey}_faqs`;
          return (
            <ContentSection key={groupKey} content={groupRef} placeholder={groupKey} as="div">
              <ContentText as="h2" content={ref(faq?.text(`group_${groupKey}_title`), `group_${groupKey}_title`)} placeholder={group.title} />
              <div {...listAttributes('text', list)}>
                {orderedRefs(texts, list, group.questions.map((q) => q.id)).map(({ key: id, content }) => {
                  const question = group.questions.find((q) => q.id === id)!;
                  return (
                    <ContentSection key={id} content={content} placeholder={id} as="details">
                      <summary>
                        <ContentText content={ref(faq?.text(`faq_${id}_question`), `faq_${id}_question`)} placeholder={question.question} />
                      </summary>
                      <ContentTextBlock content={ref(faq?.text(`faq_${id}_answer`), `faq_${id}_answer`)} placeholder={question.answer} />
                    </ContentSection>
                  );
                })}
              </div>
            </ContentSection>
          );
        })}
      </div>
    </section>
  );
}
```

- Editors move a question within its group, and a group within the FAQ,
  from each one's own menu in the editor. A move to another group is not
  supported: a keyed group moves within one list.
- A new question is added in the site's code (its key and placeholder copy)
  and appears after the listed ones until an editor moves it.
- A page that shows a few questions elsewhere (five on a pricing page, say)
  picks them by id in code and renders them without the `listAttributes`
  container, so they show no ordering there. Their content is the same
  items, edited in either place.

## Content rendered in the browser

A hydrated island or a client-rendered app owns its DOM, so the editor does
not change it. Mark the content with `data-content-live` (`LIVE_ATTRIBUTE`)
and render from `useLiveEntity`, which returns the entity as the editor
shows it while editing (drafts, saved values, previews and new list
entries), and the entity as given otherwise:

```tsx
import { ContentText, LIVE_ATTRIBUTE, useLiveEntity } from '@baack-software/baack-ts-components/react';

function Hero({ entity }: { entity: Entity }) {
  const live = EntityView.from(useLiveEntity(entity));
  return (
    <div {...{ [LIVE_ATTRIBUTE]: '' }}>
      <ContentText as="h1" content={ref(live.text('hero_title'), 'hero_title')} placeholder="Title" />
    </div>
  );
}
```

Before hydration, and without the editor, the hook returns the entity
unchanged, so server and client render the same. `/live` holds the
framework-free store for other frameworks: the `baack:item-shown` and
`baack:live-request` events, `applyShown` and `followEntity`.

## Attributes the components write

The DOM contract (`data-<type>-name`, `-sort-order`, `-urn`) plus:

| Attribute | Meaning |
| --- | --- |
| `data-placeholder` | The element shows its placeholder; there is no item, so no `-urn`. |
| `data-text-layout="paragraphs"` | Rendered by `ContentTextBlock`. |
| `data-text-linkify` | Links were made from URLs and emails. |
| `data-text-unsafe-literal` | The page inserts this text value as HTML (`unsafeLiteral`). |
| `data-locale` | Locale used for numbers and dates. |
| `data-date-style`, `data-time-style`, `data-time-zone` | Date formatting options. |
| `data-money-currency`, `data-money-unit-value` | ISO code and integer minor units. |
| `data-money-offer`, `data-money-item-prop` | Money microdata props, kept on a placeholder too, so the first amount saved gets them. |
| `data-boolean-value`, `data-boolean-invert` | The flag, and whether the content shows when it is off. |
| `data-image-priority`, `data-image-alt`, `data-image-item-prop`, `data-image-img-class` | Image props, kept on the `<picture>`: an empty one has no `<img>` to read them from, and the fallback alt is otherwise lost. |
| `data-<type>-list` | A list container: every item of that name, in sort order. |
| `data-section` | A section's key, the value of its order item. |
| `data-content-rows`, `data-content-row` | A table body (or a `select`) and each row's sort order. |
| `data-attr-<attribute>-name`, `-sort-order`, `-urn`, `-placeholder` | A text item shown in that attribute of the element (an option's `value`); `-placeholder` while it does not exist. An element can carry its own item and bound attributes together. |

**Rule:** any prop that changes how a value renders must be written to the
element, so the editor can read it back with `propsFrom` and re-render
exactly. A new prop without an attribute breaks the editor's write-back.
This holds for a placeholder too: the first save into an empty slot reads
the props from the placeholder's element.

**Contract check** (`test/contract.test.ts`, run by `npm test`): for every
component and a range of props, it checks the DOM contract attributes, then
follows the editor's write-back (`propsFrom`, then `patch` with `volatile`)
from a placeholder and from another item, and requires the result to equal
the component's own render. It also checks that pass-through attributes
survive a write-back and cannot forge contract attributes, and that the
React components render the same markup as the core.

## Pass-through attributes

Every component, list container and rows container accepts, on its root:
`data-*`, `aria-*`, `id`, `role`, `title`, `lang`, `dir`, `tabIndex`, and
microdata (`itemScope`, `itemType`, `itemID`, `itemRef`). They let a page add
accessibility and schema.org structure, and compose with a UI library's
`asChild` slot (a shadcn `BreadcrumbLink asChild` around a `ContentLink`).

They do not change how the value renders, so `propsFrom` does not read them:
`patch` only touches the attributes a render produces and its `volatile`
list, so they stay on the element through a write-back. Anything outside the
list (event handlers, `style`, `href`) and the contract's own attributes
(`data-<type>-name`, `-sort-order`, `-urn`, `-list`, `data-placeholder`,
`data-section`, `data-content-row(s)`, `data-attr-*-name`, `-sort-order`,
`-urn`, `-placeholder`) are dropped.

## Text is escaped

Text components show a value exactly as typed: `<b>` appears as `<b>`. The
`unsafeLiteral` prop inserts the value as HTML instead. It is discouraged:
text items are also read by apps on other platforms that will not render
HTML, and markup in a value is a script injection route. Prefer separate text
items styled by their components, or a markdown item.

The editor never inserts a text value as HTML, even for an `unsafeLiteral`
element: in edit mode it shows other people's unsent drafts, so a stored
script would run in a colleague's session. Such an element shows its text
escaped while editing, and gets the page's own rendering back when edit
mode ends.

## Values

- **Money** is always integer minor units (`unitValue`). The API's
  `formattedValue` is the amount with `.` and no symbol, without decimals for
  currencies such as JPY; `currencySymbol` comes separately. The component
  uses both, falling back to `Intl` only when they are missing. Nothing uses
  floating point for money.
- **Dates** are UTC timestamps with milliseconds and no zone suffix. The
  component parses them as UTC and formats them; the browser locale is not
  used unless the page passes `locale`.
