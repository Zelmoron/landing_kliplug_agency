import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, describe, it } from 'node:test';

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const LEGAL_PAGES = ['privacy', 'consent', 'offer'];
const OPERATOR = ['Акимов Игорь Дмитриевич', '381297228244', 'support@kliplug.ru'];

const read = (rel) => readFile(path.join(distDir, rel), 'utf8');
const plain = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/&nbsp;|\u00a0/g, ' ');

async function missingRefs(html, baseDir) {
  const refs = new Set();
  for (const m of html.matchAll(/(?:src|data-src|poster|data-poster|data-poster-wide|href)="([^"#:?]+\.[a-z0-9]+)"/gi)) refs.add(m[1]);
  for (const m of html.matchAll(/url\("((?!data:)[^")]+)"\)/g)) refs.add(m[1]);
  const missing = [];
  for (const ref of refs) {
    const file = ref.startsWith('/') ? path.join(distDir, ref) : path.join(baseDir, ref);
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

describe('dist/index.html', () => {
  it('references only files that exist in dist/', async () => {
    const { refs, missing } = await missingRefs(html, distDir);
    assert.ok(refs.size >= 10, `found only ${refs.size} references`);
    assert.deepEqual(missing, []);
  });

  it('links only to internal pages that exist', async () => {
    const pages = [...new Set([...html.matchAll(/href="\/([a-z-]+)\/"/g)].map((m) => m[1]))];
    assert.deepEqual(pages.sort(), [...LEGAL_PAGES].sort());
    for (const page of pages) await access(path.join(distDir, page, 'index.html'));
  });

  it('has the head tags the ad landing needs', () => {
    assert.match(html, /<html lang="ru">/);
    assert.match(html, /<meta name="viewport"[^>]+width=device-width/);
    assert.match(html, /<title>[^<]*Видео для карточки товара[^<]*<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{50,}">/);
    assert.match(html, /<meta name="yandex-verification" content="dd0a02c47e8ffda9">/);
  });

  it('wires the lead form with two required fields and a honeypot', () => {
    assert.match(html, /<form[^>]+id="lead"[^>]+action="https:\/\/n8n\.ixore\.ru\/webhook\/kliplug-lead"[^>]+method="post"/);
    assert.doesNotMatch(html, /name="name"/);
    for (const name of ['contact', 'card']) {
      assert.match(html, new RegExp(`name="${name}"[^>]*required`), name);
      assert.match(html, new RegExp(`id="err-${name}"`), name);
    }
    assert.match(html, /name="website"/);
    assert.match(html, /var LEAD_URL = 'https:\/\/n8n\.ixore\.ru\/webhook\/kliplug-lead';/);
    assert.match(html, /r\.status >= 200 && r\.status < 300/);
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
    assert.match(html, /var YM_ID = '\d+';/);
    assert.doesNotMatch(html, /\[ID_МЕТРИКИ\]/);
    assert.match(html, /metrika\/tag\.js\?id=' \+ YM_ID/);
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
        const { missing } = await missingRefs(doc, path.join(distDir, page));
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

describe('robots.txt, sitemap.xml and canonical links', () => {
  const SITE = 'https://kliplug.ru';

  it('points robots.txt to the sitemap and cleans ad parameters', async () => {
    const robots = await read('robots.txt');
    assert.match(robots, /^User-agent: \*$/m);
    assert.match(robots, new RegExp(`^Sitemap: ${SITE}/sitemap\\.xml$`, 'm'));
    assert.match(robots, /^Clean-param: [^\n]*utm_source[^\n]*yclid/m);
    assert.doesNotMatch(robots, /^Disallow: \/$/m);
  });

  it('lists every page in the sitemap and each of them exists', async () => {
    const sitemap = await read('sitemap.xml');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(locs.sort(), [`${SITE}/`, ...LEGAL_PAGES.map((p) => `${SITE}/${p}/`)].sort());
    for (const loc of locs) {
      const rel = loc.slice(SITE.length);
      await access(path.join(distDir, rel === '/' ? 'index.html' : `${rel}index.html`));
    }
  });

  it('gives every page a canonical link to its own address', async () => {
    assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}/">`));
    for (const page of LEGAL_PAGES) {
      const doc = await read(`${page}/index.html`);
      assert.match(doc, new RegExp(`<link rel="canonical" href="${SITE}/${page}/">`), page);
    }
  });

  it('uses an existing image for link previews', async () => {
    const m = html.match(/<meta property="og:image" content="https:\/\/kliplug\.ru\/([^"]+)">/);
    assert.ok(m, 'og:image is missing');
    await access(path.join(distDir, m[1]));
  });
});

describe('prices', () => {
  it('shows exactly the four approved price rows', () => {
    const block = plain(html.match(/<div class="plist"[^>]*>[\s\S]*?<\/section>/)[0]);
    const rows = [...block.matchAll(/<h3>([^<]+)[\s\S]*?<div class="cost">([^<]+)<\/div>/g)].map((m) => `${m[1]} = ${m[2]}`);
    assert.deepEqual(rows, [
      'Ролик до 10 секунд = 2 990 ₽',
      'Ролик 10–15 секунд = 3 900 ₽',
      '3 ролика по 10 секунд = 7 900 ₽',
      '10 роликов по 10 секунд = 24 000 ₽',
    ]);
  });

  it('starts the hero price and descriptions from the lowest price', () => {
    const text = plain(html);
    assert.match(text, /<div class="facts"><span>От <b>2 990 ₽<\/b><\/span>/);
    assert.match(text, /<meta name="description" content="[^"]*от 2 990 ₽/);
    assert.doesNotMatch(text, /5 000|12 000|35 000|4–30/);
  });

  it('matches video durations in the offer', async () => {
    const offer = plain(await read('offer/index.html'));
    assert.match(offer, /до 10 секунд или от 10 до 15 секунд/);
    assert.doesNotMatch(offer, /30 секунд/);
  });
});

describe('metrika goals', () => {
  it('sends form_submit only from the successful webhook response branch', () => {
    assert.equal((html.match(/goal\('form_submit'\)/g) || []).length, 1);
    const success = html.match(/if \(r\.status >= 200 && r\.status < 300\) \{([\s\S]*?)\n        \}/);
    assert.ok(success, 'success branch is missing');
    assert.match(success[1], /goal\('form_submit'\);/);
    const catchBlock = html.match(/\}\)\.catch\(function\(\)\{([\s\S]*?)\}\);/);
    assert.ok(catchBlock && !catchBlock[1].includes('form_submit'));
  });

  it('routes goals to counter 112868048', () => {
    assert.match(html, /window\.ym\(\+YM_ID,'reachGoal',name\)/);
    assert.match(html, /var YM_ID = '112868048';/);
    for (const name of ['tg_click', 'cta_click']) assert.match(html, new RegExp(`goal\\('${name}'\\)`), name);
  });

  it('runs the counter only on the production host', () => {
    const idOk = html.match(/var idOk = (.+);/);
    assert.ok(idOk, 'idOk is missing');
    const check = new Function('YM_ID', 'location', `return ${idOk[1]};`);
    for (const host of ['kliplug.ru', 'www.kliplug.ru']) assert.equal(check('112868048', { hostname: host }), true, host);
    for (const host of ['localhost', '127.0.0.1', 'kliplug.ru.evil.com', 'preview.kliplug.ru']) assert.equal(check('112868048', { hostname: host }), false, host);
  });
});

describe('anchors for Yandex Direct quick links', () => {
  it('has an id on every section a quick link points to', () => {
    for (const id of ['raboty', 'kak-rabotaem', 'ceny', 'voprosy', 'zayavka']) {
      assert.match(html, new RegExp(`<section class="[^"]*" id="${id}">`), id);
    }
  });
});

describe('ad tracking hooks', () => {
  it('marks every call-to-action button and keeps the dock watch targets', () => {
    const ctas = [...html.matchAll(/<a [^>]*href="#zayavka"[^>]*>/g)].map((m) => m[0]);
    assert.ok(ctas.length >= 3, `found only ${ctas.length} CTA links`);
    for (const tag of ctas) assert.match(tag, /data-cta/, tag);
    assert.match(html, /<a class="btn" id="cta-hero" data-cta href="#zayavka">/);
    for (const id of ['cta-hero', 'zayavka', 'site-foot', 'dock', 'cookie', 'hero-video']) {
      assert.match(html, new RegExp(`id="${id}"`), id);
    }
  });

  it('keeps every element the lead script reads', () => {
    for (const id of ['lead', 'lead-status', 'lead-done', 'err-contact', 'err-card', 'err-consent']) {
      assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
    }
    const form = html.match(/<form[^>]+id="lead"[\s\S]*?<\/form>/)[0];
    for (const name of ['contact', 'card', 'website', 'consent']) assert.match(form, new RegExp(`name="${name}"`), name);
    assert.equal((form.match(/<button[^>]*type="submit"/g) || []).length, 1);
    assert.match(html, /contact: form\.elements\.contact\.value,\n\s+card: form\.elements\.card\.value,\n\s+consent: true,\n\s+website: form\.elements\.website\.value/);
  });

  it('does not ship the design preview stub instead of the real submit', () => {
    assert.doesNotMatch(html, /Это превью сайта/);
    assert.equal((html.match(/addEventListener\('submit'/g) || []).length, 1);
  });
});

describe('works tabs and FAQ', () => {
  it('renders accessible tabs with exactly one active panel', () => {
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
    assert.equal(tabs.length, 3);
    assert.equal(tabs.filter((t) => /aria-selected="true"/.test(t)).length, 1);
    for (const tab of tabs) {
      const panel = tab.match(/aria-controls="([^"]+)"/)[1];
      assert.match(html, new RegExp(`role="tabpanel" id="${panel}"`), panel);
    }
    const panels = [...html.matchAll(/<div role="tabpanel"[^>]*>/g)].map((m) => m[0]);
    assert.equal(panels.length, 3);
    assert.equal(panels.filter((p) => !/\shidden/.test(p)).length, 1);
    const text = plain(html);
    for (const label of ['Техника', 'Продукты', 'Автотовары']) assert.match(text, new RegExp(`role="tab"[^>]*>${label} `), label);
  });

  it('keeps every FAQ answer in native details elements', () => {
    assert.equal((html.match(/<details class="qa-item">/g) || []).length, 4);
    const text = plain(html);
    for (const answer of ['Достаточно фотографий', 'согласуем референс', 'Две правки входят', 'скажем честно']) {
      assert.ok(text.includes(answer), answer);
    }
  });

  it('ships no framework runtime', async () => {
    assert.doesNotMatch(html, /<astro-island/);
    const files = await readdir(path.join(distDir, '_astro'));
    assert.deepEqual(files.filter((f) => f.endsWith('.js')), []);
  });
});
