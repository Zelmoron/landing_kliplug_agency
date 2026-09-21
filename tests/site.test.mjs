import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, describe, it } from 'node:test';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
let html;

before(async () => {
  html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
});

describe('public/index.html', () => {
  it('references only files that exist in public/', async () => {
    const refs = new Set();
    for (const m of html.matchAll(/(?:src|data-src|poster|data-poster|data-poster-wide|href)="([^"#:?]+\.[a-z0-9]+)"/gi)) refs.add(m[1]);
    for (const m of html.matchAll(/url\("((?!data:)[^")]+)"\)/g)) refs.add(m[1]);
    assert.ok(refs.size >= 10, `found only ${refs.size} references`);
    const missing = [];
    for (const ref of refs) {
      try {
        await access(path.join(publicDir, ref));
      } catch {
        missing.push(ref);
      }
    }
    assert.deepEqual(missing, []);
  });

  it('has the head tags the ad landing needs', () => {
    assert.match(html, /<html lang="ru">/);
    assert.match(html, /<meta name="viewport"[^>]+width=device-width/);
    assert.match(html, /<title>[^<]*Видео для карточки товара[^<]*<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{50,}">/);
  });

  it('wires the lead form with three required fields and a honeypot', () => {
    assert.match(html, /<form[^>]+id="lead"[^>]+action="\/api\/lead"[^>]+method="post"/);
    for (const name of ['name', 'contact', 'card']) {
      assert.match(html, new RegExp(`name="${name}"[^>]*required`), name);
      assert.match(html, new RegExp(`id="err-${name}"`), name);
    }
    assert.match(html, /name="website"/);
    assert.match(html, /var LEAD_URL = '\/api\/lead';/);
    assert.match(html, /fetch\(LEAD_URL,/);
  });

  it('shows the success message instead of redirecting to Telegram', () => {
    assert.match(html, /id="lead-done"[^>]*hidden/);
    assert.match(html, /Заявка отправлена\. Напишем вам в&nbsp;течение часа\./);
    assert.doesNotMatch(html, /Откроется Telegram/);
    assert.doesNotMatch(html, /\?text=/);
  });

  it('keeps Telegram only as a direct contact link', () => {
    const links = [...html.matchAll(/href="(https:\/\/t\.me\/[^"]+)"/g)];
    assert.ok(links.length >= 1);
    for (const m of html.matchAll(/<a [^>]*href="https:\/\/t\.me\/[^"]+"[^>]*>/g)) {
      assert.match(m[0], /data-tg/, m[0]);
    }
  });

  it('avoids the banned marketing words', () => {
    const text = html.toLowerCase();
    for (const word of ['ии-агент', 'нейросет', 'инноваци', 'уникальн']) {
      assert.equal(text.includes(word), false, word);
    }
  });
});
