import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown as md } from '../src/legacy/markdown.js';

test('markdown: paragraphs, bold, italic, code, line breaks', () => {
  assert.equal(md('Hello **Aman** and *Boro*.\nUse `20×20 cm`.'), '<p>Hello <strong>Aman</strong> and <em>Boro</em>.<br>Use <code>20×20 cm</code>.</p>');
  assert.equal(md('One.\n\nTwo.'), '<p>One.</p><p>Two.</p>');
});
test('markdown: bullet and numbered lists, headings, quotes', () => {
  assert.equal(md('Tips:\n- Mustard\n- **Potato**\n1. Sow\n2. Water'), '<p>Tips:</p><ul><li>Mustard</li><li><strong>Potato</strong></li></ul><ol><li>Sow</li><li>Water</li></ol>');
  assert.equal(md('## Next steps\n> Advisory only'), '<h4>Next steps</h4><blockquote>Advisory only</blockquote>');
  assert.equal(md('• dot bullet'), '<ul><li>dot bullet</li></ul>');
});
test('markdown: escapes HTML and only links http(s)', () => {
  assert.equal(md('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(md('[BRRI](https://brri.gov.bd)'), '<p><a href="https://brri.gov.bd" target="_blank" rel="noopener noreferrer">BRRI</a></p>');
  assert.equal(md('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>');
  assert.equal(md('snake_case_word and 2*3*4'), '<p>snake_case_word and 2*3*4</p>');
});
