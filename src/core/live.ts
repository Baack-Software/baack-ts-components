// Content rendered in the browser (a hydrated island, a client-rendered app)
// belongs to its framework, so the Baack editor does not change its DOM.
// Inside an element marked `data-content-live`, the editor instead announces
// what each item should show (`baack:item-shown`), and the page re-renders
// from its entity with those items applied. `followEntity` does that for one
// entity; the framework hooks (`useLiveEntity` in /react) are thin wrappers.
//
// Shared by the editor and the page, so both sides agree on the event.

import type { Entity } from '@baack-software/baack-ts-client';

/** Marks an element whose content re-renders itself from the editor's events; the editor leaves its DOM alone. */
export const LIVE_ATTRIBUTE = 'data-content-live';

/** Dispatched on `document` by the editor: show `item` in this slot, or the page's own value again. */
export const ITEM_SHOWN_EVENT = 'baack:item-shown';

/** Dispatched on `document` by a page that starts following an entity, so the editor sends what it shows now. */
export const LIVE_REQUEST_EVENT = 'baack:live-request';

/** The editor's item types, as in `baack:item-updated`. */
export type LiveItemType =
  | 'text'
  | 'markdown'
  | 'template'
  | 'json'
  | 'boolean'
  | 'long'
  | 'double'
  | 'dateTime'
  | 'latLong'
  | 'money'
  | 'image'
  | 'link'
  | 'reference';

export interface ItemShownDetail {
  entityUrn: string;
  type: LiveItemType;
  name: string;
  sortOrder: number;
  /**
   * The item to show, as the component would be given it (for markdown and
   * templates, the rendering). Absent when `restore` is set.
   */
  item?: { name: string; sortOrder: number; urn?: string | undefined } & object;
  /** Show the page's own value again (edit mode ended). */
  restore?: boolean;
}

export interface LiveRequestDetail {
  entityUrn: string;
}

/** The entity array each item type lives in. */
export const ENTITY_ARRAYS: Record<LiveItemType, keyof Entity> = {
  text: 'texts',
  markdown: 'markdowns',
  template: 'templates',
  json: 'jsons',
  boolean: 'booleans',
  long: 'longs',
  double: 'doubles',
  dateTime: 'dateTimes',
  latLong: 'latLongs',
  money: 'money',
  image: 'images',
  link: 'links',
  reference: 'references',
};

declare global {
  interface DocumentEventMap {
    'baack:item-shown': CustomEvent<ItemShownDetail>;
    'baack:live-request': CustomEvent<LiveRequestDetail>;
  }
}

type Shown = Required<Pick<ItemShownDetail, 'type' | 'name' | 'sortOrder' | 'item'>>;

function slotKey(detail: { type: string; name: string; sortOrder: number }): string {
  return `${detail.type}\u0000${detail.name}\u0000${detail.sortOrder}`;
}

/**
 * The entity with the editor's items in place of its own: an item replaces
 * the one at its name and sort order, or is added there (a new item, so lists
 * show it). Returns the same object when nothing is shown.
 */
export function applyShown<E extends Entity>(entity: E, shown: Iterable<Shown>): E {
  let result: E | undefined;
  for (const { type, name, sortOrder, item } of shown) {
    result ??= { ...entity };
    const key = ENTITY_ARRAYS[type];
    const items = ((result[key] as { name: string; sortOrder: number }[] | undefined) ?? []).filter(
      (existing) => existing.name !== name || existing.sortOrder !== sortOrder,
    );
    (result as Record<string, unknown>)[key] = [...items, item];
  }
  return result ?? entity;
}

/**
 * Follows the editor for one entity. `onChange` is called with the entity as
 * the editor shows it, and with the entity as given once edit mode ends.
 * Asks the editor for what it shows already, for content that renders after
 * edit mode started. Returns a function that stops following.
 */
export function followEntity<E extends Entity>(entity: E, onChange: (entity: E) => void, target: Document = document): () => void {
  const shown = new Map<string, Shown>();
  const listener = (event: CustomEvent<ItemShownDetail>) => {
    const detail = event.detail;
    if (detail.entityUrn !== entity.urn) return;
    const key = slotKey(detail);
    if (detail.restore || !detail.item) {
      if (!shown.delete(key)) return;
    } else {
      shown.set(key, { type: detail.type, name: detail.name, sortOrder: detail.sortOrder, item: detail.item });
    }
    onChange(applyShown(entity, shown.values()));
  };
  target.addEventListener(ITEM_SHOWN_EVENT, listener);
  // The document's own CustomEvent: an event from another realm (an iframe) is refused.
  const Event = (target.defaultView?.CustomEvent ?? CustomEvent) as typeof CustomEvent;
  target.dispatchEvent(new Event<LiveRequestDetail>(LIVE_REQUEST_EVENT, { detail: { entityUrn: entity.urn } }));
  return () => target.removeEventListener(ITEM_SHOWN_EVENT, listener);
}
