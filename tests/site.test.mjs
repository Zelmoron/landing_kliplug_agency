import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, describe, it } from 'node:test';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const LEGAL_PAGES = ['privacy', 'consent', 'offer'];
const OPERATOR = ['Акимов Игорь Дмитриевич', '381297228244', 'support@kliplug.ru'];

const read = (rel) => readFile(path.join(publicDir, rel), 'utf8');
const plain = (html) => html.replace(/&nbsp;/g, ' ');

async function missingRefs(html, baseDir) {
  const refs = new Set();
  for (const m of html.matchAll(/(?:src|data-src|poster|data-poster|data-poster-wide|href)="([^"#:?]+\.[a-z0-9]+)"/gi)) refs.add(m[1]);
  for (const m of html.matchAll(/url\("((?!data:)[^")]+)"\)/g)) refs.add(m[1]);
  const missing = [];
  for (const ref of refs) {
    const file = ref.startsWith('/') ? path.join(publicDir, ref) : path.join(baseDir, ref);
    try {
      await access(file);
    } catch {
      missing.push(ref);
    }
  }
  return { refs, missing };
}

let html;
before(async () => {
  html = await read('index.html');
});

describe('public/index.html', () => {
  it('references only files that exist in public/', async () => {
    const { refs, missing } = await missingRefs(html, publicDir);
    assert.ok(refs.size >= 10, `found only ${refs.size} references`);
    assert.deepEqual(missing, []);
  });

  it('links only to internal pages that exist', async () => {
    const pages = [...new Set([...html.matchAll(/href="\/([a-z-]+)\/"/g)].map((m) => m[1]))];
    assert.deepEqual(pages.sort(), [...LEGAL_PAGES].sort());
    for (const page of pages) await access(path.join(publicDir, page, 'index.html'));
  });

  it('has the head tags the ad landing needs', () => {
    assert.match(html, /<html lang="ru">/);
    assert.match(html, /<meta name="viewport"[^>]+width=device-width/);
    assert.match(html, /<title>[^<]*Видео для карточки товара[^<]*<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{50,}">/);
  });

  it('wires the lead form with two required fields and a honeypot', () => {
    assert.match(html, /<form[^>]+id="lead"[^>]+action="\/api\/lead"[^>]+method="post"/);
    assert.doesNotMatch(html, /name="name"/);
    for (const name of ['contact', 'card']) {
      assert.match(html, new RegExp(`name="${name}"[^>]*required`), name);
      assert.match(html, new RegExp(`id="err-${name}"`), name);
    }
    assert.match(html, /name="website"/);
    assert.match(html, /var LEAD_URL = '\/api\/lead';/);
    assert.match(html, /fetch\(LEAD_URL,/);
  });

  it('asks for a separate, unticked consent to personal data processing', () => {
    const box = html.match(/<input name="consent"[^>]*>/);
    assert.ok(box, 'consent checkbox is missing');
    assert.match(box[0], /type="checkbox"/);
    assert.match(box[0], /required/);
    assert.doesNotMatch(box[0], /checked/);
    assert.match(html, /<label class="check">[\s\S]*?href="\/consent\/"[\s\S]*?<\/label>/);
    assert.doesNotMatch(html.match(/<label class="check">[\s\S]*?<\/label>/)[0], /оферт|политик/i);
    assert.match(html, /consent: true,/);
    assert.match(html, /Нужно согласие на обработку персональных данных/);
  });

  it('shows the success message instead of redirecting to Telegram', () => {
    assert.match(html, /id="lead-done"[^>]*hidden/);
    assert.match(html, /Заявка отправлена\. Напишем вам в&nbsp;течение часа\./);
    assert.doesNotMatch(html, /Откроется Telegram/);
    assert.doesNotMatch(html, /\?text=/);
  });

  it('keeps Telegram only as a direct contact link', () => {
    const tags = [...html.matchAll(/<a [^>]*href="https:\/\/t\.me\/[^"]+"[^>]*>/g)].map((m) => m[0]);
    assert.ok(tags.length >= 2);
    for (const tag of tags) {
      assert.match(tag, /href="https:\/\/t\.me\/kliplug_agency"/, tag);
      assert.match(tag, /data-tg/, tag);
    }
  });

  it('identifies the site owner in the footer', () => {
    const foot = plain(html.match(/<footer class="site-foot"[\s\S]*?<\/footer>/)[0]);
    for (const part of [...OPERATOR, 'Самозанятый']) assert.ok(foot.includes(part), part);
    for (const page of LEGAL_PAGES) assert.match(foot, new RegExp(`href="/${page}/"`), page);
  });

  it('loads Yandex Metrika only after cookie consent', () => {
    assert.equal((html.match(/ym\(\+YM_ID,'init'/g) || []).length, 1);
    const loader = html.match(/function loadMetrika\(\)\{[\s\S]*?\n  \}\n/);
    assert.ok(loader && loader[0].includes("ym(+YM_ID,'init'"), 'init must live inside loadMetrika');
    assert.match(html, /if \(readConsent\(\) === 'accepted'\) loadMetrika\(\);/);
    assert.match(html, /if \(choice === 'accepted'\) loadMetrika\(\);/);
    assert.match(html, /<div class="cookie" id="cookie"[^>]*hidden>/);
    assert.match(html, /data-cookie="accepted"/);
    assert.match(html, /data-cookie="declined"/);
    assert.doesNotMatch(html, /mc\.yandex\.ru\/watch/);
  });

  it('avoids the banned marketing words', () => {
    const text = html.toLowerCase();
    for (const word of ['ии-агент', 'нейросет', 'инноваци', 'уникальн']) {
      assert.equal(text.includes(word), false, word);
    }
  });
});

describe('legal pages', () => {
  for (const page of LEGAL_PAGES) {
    describe(page, () => {
      let doc;
      before(async () => {
        doc = await read(`${page}/index.html`);
      });

      it('is a complete russian page with a title and date', () => {
        assert.match(doc, /<html lang="ru">/);
        assert.match(doc, /<title>[^<]+ \| Kliplug Agency<\/title>/);
        assert.match(doc, /<h1>[^<]+<\/h1>/);
        assert.match(doc, /Редакция от \d+ [а-я]+ \d{4} г\./);
      });

      it('names the operator with INN', () => {
        const text = plain(doc);
        for (const part of OPERATOR) assert.ok(text.includes(part), part);
      });

      it('references only existing assets and legal pages', async () => {
        const { missing } = await missingRefs(doc, path.join(publicDir, page));
        assert.deepEqual(missing, []);
        for (const other of LEGAL_PAGES) assert.match(doc, new RegExp(`href="/${other}/"`), other);
        assert.match(doc, /href="\/"/);
      });
    });
  }

  it('keeps the consent text separate and specific', async () => {
    const text = plain(await read('consent/index.html'));
    for (const part of ['Какие данные', 'Цели', 'Срок действия и отзыв', 'отозвать согласие', 'Я даю согласие на обработку персональных данных']) {
      assert.ok(text.includes(part), part);
    }
  });

  it('describes Metrika, localisation and user rights in the policy', async () => {
    const text = plain(await read('privacy/index.html'));
    for (const part of ['Яндекс Метрика', 'территории Российской Федерации', 'отозвать согласие', 'Роскомнадзоре', '152-ФЗ']) {
      assert.ok(text.includes(part), part);
    }
  });
});
