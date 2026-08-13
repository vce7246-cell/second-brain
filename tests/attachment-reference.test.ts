import assert from 'node:assert/strict';
import test from 'node:test';
import { collectAttachments, markdownAttachmentReference } from '../src/client/lib/attachments.js';
import type { TreeNode } from '../src/client/types/index.js';

test('attachment references use image syntax only for image files', () => {
  assert.equal(markdownAttachmentReference('assets/diagram.drawio.svg'), '![](assets/diagram.drawio.svg)');
  assert.equal(markdownAttachmentReference('docs/guide.pdf'), '[guide.pdf](docs/guide.pdf)');
});

test('attachment references protect destinations and labels with Markdown punctuation', () => {
  assert.equal(
    markdownAttachmentReference('assets/design (final).png'),
    '![](<assets/design (final).png>)'
  );
  assert.equal(
    markdownAttachmentReference('docs/guide]draft.pdf'),
    '[guide\\]draft.pdf](docs/guide]draft.pdf)'
  );
});

test('attachment references are portable relative to the current note', () => {
  assert.equal(
    markdownAttachmentReference('assets/photo.png', 'projects/topic.md'),
    '![](../assets/photo.png)'
  );
  assert.equal(
    markdownAttachmentReference('projects/files/guide.pdf', 'projects/topic.md'),
    '[guide.pdf](./files/guide.pdf)'
  );
  assert.equal(
    markdownAttachmentReference('docs/guide.pdf', 'topic.md'),
    '[guide.pdf](./docs/guide.pdf)'
  );
});

test('attachment references encode literal URL delimiters in file names', () => {
  assert.equal(
    markdownAttachmentReference('assets/design#final.png', 'notes/topic.md'),
    '![](../assets/design%23final.png)'
  );
});

test('attachment collection excludes directories and Markdown notes', () => {
  const tree: TreeNode = {
    name: 'vault', path: '', type: 'directory', kind: 'directory', children: [
      { name: 'note.md', path: 'note.md', type: 'file', kind: 'markdown' },
      { name: 'diagram.drawio', path: 'diagram.drawio', type: 'file', kind: 'other' },
      { name: 'photo.png', path: 'assets/photo.png', type: 'file', kind: 'image' },
    ],
  };

  assert.deepEqual(collectAttachments(tree), [
    { name: 'photo.png', path: 'assets/photo.png', kind: 'image' },
    { name: 'diagram.drawio', path: 'diagram.drawio', kind: 'other' },
  ]);
});
