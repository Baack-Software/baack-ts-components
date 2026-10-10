// Following the editor for content rendered in the browser: the store
// (`followEntity`, `applyShown`) and the React hook (`useLiveEntity`).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Entity, TextItem } from '@baack-software/baack-ts-client';
import { applyShown, followEntity, ITEM_SHOWN_EVENT, LIVE_REQUEST_EVENT, type ItemShownDetail } from '../dist/core/live.js';
import { ContentText, ContentTextList, useLiveEntity } from '../dist/react/index.js';

const window = new Window();
const document = window.document as unknown as Document;
Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });

const text = (urn: string, name: string, sortOrder: number, value: string) => ({ urn, name, sortOrder, value }) as TextItem;
const entity: Entity = {
  urn: 'e1',
  name: '/',
  language: 'en-GB',
  status: 'PUBLISHED',
  texts: [text('t1', 'title', 0, 'Live title'), text('t2', 'feature', 0, 'One')],
};

function show(detail: ItemShownDetail) {
  document.dispatchEvent(new window.CustomEvent(ITEM_SHOWN_EVENT, { detail }) as unknown as Event);
}

test('applyShown replaces an item at its slot, or adds one', () => {
  const shown = applyShown(entity, [
    { type: 'text', name: 'title', sortOrder: 0, item: text('t3', 'title', 0, 'Draft title') },
    { type: 'text', name: 'feature', sortOrder: 1, item: text('t4', 'feature', 1, 'Two') },
  ]);
  assert.deepEqual(
    shown.texts!.map((t) => [t.name, t.sortOrder, t.value]),
    [
      ['feature', 0, 'One'],
      ['title', 0, 'Draft title'],
      ['feature', 1, 'Two'],
    ],
  );
  assert.equal(entity.texts!.length, 2, 'the entity given is not changed');
  assert.equal(applyShown(entity, []), entity);
});

test('followEntity follows its entity only, asks for what is shown, and restores', () => {
  const requests: string[] = [];
  document.addEventListener(LIVE_REQUEST_EVENT, (e) => requests.push((e as CustomEvent).detail.entityUrn));
  const seen: Entity[] = [];
  const stop = followEntity(entity, (e) => seen.push(e), document);
  assert.deepEqual(requests, ['e1']);

  show({ entityUrn: 'other', type: 'text', name: 'title', sortOrder: 0, item: text('x', 'title', 0, 'Other') });
  assert.equal(seen.length, 0);
  show({ entityUrn: 'e1', type: 'text', name: 'title', sortOrder: 0, item: text('t3', 'title', 0, 'Draft title') });
  assert.equal(seen.at(-1)!.texts!.find((t) => t.name === 'title')!.value, 'Draft title');
  show({ entityUrn: 'e1', type: 'text', name: 'title', sortOrder: 0, restore: true });
  assert.equal(seen.at(-1), entity);

  stop();
  show({ entityUrn: 'e1', type: 'text', name: 'title', sortOrder: 0, item: text('t5', 'title', 0, 'After') });
  assert.equal(seen.length, 2);
});

test('useLiveEntity re-renders the island from the editor, lists included', async () => {
  function Island({ source }: { source: Entity }) {
    const live = useLiveEntity(source);
    return createElement(
      'div',
      { 'data-content-live': '' },
      createElement(ContentText, { content: { name: 'title', sortOrder: 0, item: live.texts!.find((t) => t.name === 'title') }, placeholder: 'Title' }),
      createElement(ContentTextList, {
        name: 'feature',
        items: live.texts,
        children: (content: never) => createElement('li', null, createElement(ContentText, { content, placeholder: 'Feature' } as never)),
      } as never),
    );
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(Island, { source: entity })));
  const title = () => container.querySelector('[data-text-name="title"]')!;
  assert.equal(title().textContent, 'Live title');

  await act(async () => show({ entityUrn: 'e1', type: 'text', name: 'title', sortOrder: 0, item: text('t3', 'title', 0, 'Draft title') }));
  assert.equal(title().textContent, 'Draft title');
  assert.equal(title().getAttribute('data-text-urn'), 't3');

  await act(async () => show({ entityUrn: 'e1', type: 'text', name: 'feature', sortOrder: 1, item: text('t4', 'feature', 1, 'Two') }));
  assert.deepEqual(
    [...container.querySelectorAll('li')].map((li) => li.textContent),
    ['One', 'Two'],
  );

  await act(async () => {
    show({ entityUrn: 'e1', type: 'text', name: 'title', sortOrder: 0, restore: true });
    show({ entityUrn: 'e1', type: 'text', name: 'feature', sortOrder: 1, restore: true });
  });
  assert.equal(title().textContent, 'Live title');
  assert.equal(title().getAttribute('data-text-urn'), 't1');
  assert.equal(container.querySelectorAll('li').length, 1);
  await act(async () => root.unmount());
});
