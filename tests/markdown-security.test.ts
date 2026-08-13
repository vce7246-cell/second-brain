import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from '../src/client/components/MarkdownPreview.js';

test('Markdown preview escapes raw HTML', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n<img src=x onerror=alert(2)>');
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<img src=x'), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/);
});

test('Markdown preview blocks dangerous link and image protocols', () => {
  const html = renderMarkdown([
    '[bad](javascript:alert(1))',
    '[encoded](java&#x73;cript:alert(2))',
    '![bad image](data:text/html;base64,PHNjcmlwdD4=)',
  ].join('\n'));

  assert.equal(/href=["']javascript:/i.test(html), false);
  assert.equal(/src=["']data:text\/html/i.test(html), false);
  assert.match(html, /bad/);
  assert.match(html, /encoded/);
});

test('Markdown preview keeps safe Markdown and escapes wikilink fields', () => {
  const html = renderMarkdown([
    '[website](https://example.com)',
    '![local](images/photo.png)',
    '[[Note\" data-evil=\"yes|<b>Alias</b>]]',
  ].join('\n'));

  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /src="\/api\/files\/preview\?filePath=images%2Fphoto\.png(?:&amp;|&)v=0"/);
  assert.equal(html.includes('data-evil="yes"'), false);
  assert.match(html, /data-target="Note&amp;quot; data-evil=&amp;quot;yes"|data-target="Note&quot; data-evil=&quot;yes"/);
  assert.match(html, /&lt;b&gt;Alias&lt;\/b&gt;/);
});

test('Markdown preview routes local images through the protected file endpoint', () => {
  const html = renderMarkdown([
    '![local](<assets/design (final).png>)',
    '![remote](https://example.com/image.png)',
  ].join('\n'));

  assert.match(html, /filePath=assets%2Fdesign\+%28final%29\.png/);
  assert.match(html, /src="https:\/\/example\.com\/image\.png"/);
});

test('Markdown preview marks only local non-Markdown file links as attachments', () => {
  const html = renderMarkdown([
    '[PDF](docs/guide.pdf)',
    '[Draw.io](diagrams/system.drawio)',
    '[note](notes/topic.md)',
    '[website](https://example.com/file.pdf)',
  ].join('\n'));

  assert.match(html, /data-attachment-path="docs\/guide\.pdf"/);
  assert.match(html, /data-attachment-path="diagrams\/system\.drawio"/);
  assert.equal(html.includes('data-attachment-path="notes/topic.md"'), false);
  assert.equal(html.includes('data-attachment-path="https://example.com/file.pdf"'), false);
});

test('Markdown preview resolves explicit relative attachments and preserves legacy vault paths', () => {
  const html = renderMarkdown([
    '![portable](../assets/photo.png)',
    '[portable PDF](./files/guide.pdf)',
    '[legacy PDF](docs/legacy.pdf)',
  ].join('\n'), 'projects/topic.md');

  assert.match(html, /filePath=assets%2Fphoto\.png/);
  assert.match(html, /data-attachment-path="projects\/files\/guide\.pdf"/);
  assert.match(html, /data-attachment-path="docs\/legacy\.pdf"/);
});
