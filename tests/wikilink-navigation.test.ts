import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWikilinkTarget } from '../src/client/lib/wikilink.js';

const titles = {
  'projects/plan.md': '产品规划',
  'notes/meeting.md': '周会',
  'archive/meeting.md': '历史周会',
};

test('wikilinks resolve exact frontmatter titles and paths', () => {
  assert.deepEqual(resolveWikilinkTarget('产品规划', titles), {
    status: 'found', path: 'projects/plan.md',
  });
  assert.deepEqual(resolveWikilinkTarget('projects/plan', titles), {
    status: 'found', path: 'projects/plan.md',
  });
  assert.deepEqual(resolveWikilinkTarget('notes\\meeting.md', titles), {
    status: 'found', path: 'notes/meeting.md',
  });
});

test('wikilinks resolve a unique filename but never use partial matching', () => {
  assert.deepEqual(resolveWikilinkTarget('plan', titles), {
    status: 'found', path: 'projects/plan.md',
  });
  assert.deepEqual(resolveWikilinkTarget('产品', titles), { status: 'missing' });
});

test('wikilinks report ambiguous titles instead of opening the wrong note', () => {
  const duplicateTitles = {
    ...titles,
    'other/plan.md': '产品规划',
  };
  assert.deepEqual(resolveWikilinkTarget('产品规划', duplicateTitles), { status: 'ambiguous' });
  assert.deepEqual(resolveWikilinkTarget('meeting', titles), { status: 'ambiguous' });
  assert.deepEqual(resolveWikilinkTarget('other/plan', duplicateTitles), {
    status: 'found', path: 'other/plan.md',
  });
});
