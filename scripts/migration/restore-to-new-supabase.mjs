/**
 * Restaura snapshot de migração para um projeto Supabase corporativo.
 *
 * Uso:
 *   node --env-file=.env.equipilates scripts/migration/restore-to-new-supabase.mjs
 *
 * Requer no .env.equipilates:
 *   PUBLIC_SUPABASE_URL=
 *   SUPABASE_SERVICE_ROLE_KEY=
 *   OLD_SUPABASE_HOST=hijmbsxcvcugnmkvldgl.supabase.co   (opcional, para REPLACE nas URLs)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../..');
const snapshotDir = path.join(projectRoot, 'backups/migration-snapshot-2026-07-13');

const url = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const oldHost = process.env.OLD_SUPABASE_HOST || 'hijmbsxcvcugnmkvldgl.supabase.co';

if (!url || !serviceKey) {
  console.error('Defina PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);
const newHost = new URL(url).host;

async function loadJson(name) {
  return fs.readJson(path.join(snapshotDir, 'database', `${name}.json`));
}

function rewriteUrl(u) {
  if (!u || typeof u !== 'string') return u;
  return u.replaceAll(oldHost, newHost);
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets || []).some((b) => b.name === 'product-images');
  if (!exists) {
    const { error } = await supabase.storage.createBucket('product-images', {
      public: true,
      fileSizeLimit: '50MB'
    });
    if (error) throw error;
    console.log('✓ bucket product-images criado');
  } else {
    console.log('✓ bucket product-images já existe');
  }
}

async function uploadImages() {
  const root = path.join(snapshotDir, 'storage/product-images');
  const files = [];
  async function walk(dir, prefix = '') {
    for (const entry of await fs.readdir(dir)) {
      const full = path.join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      const stat = await fs.stat(full);
      if (stat.isDirectory()) await walk(full, rel);
      else files.push({ full, rel });
    }
  }
  await walk(root);
  let ok = 0;
  for (const f of files) {
    const buf = await fs.readFile(f.full);
    const { error } = await supabase.storage
      .from('product-images')
      .upload(f.rel, buf, { upsert: true, contentType: guessType(f.rel) });
    if (error) console.error('upload fail', f.rel, error.message);
    else {
      ok++;
      console.log('upload', f.rel);
    }
  }
  console.log(`✓ uploads: ${ok}/${files.length}`);
}

function guessType(name) {
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

async function upsertTable(table, rows, { rewriteUrls = false } = {}) {
  if (!rows.length) {
    console.log(`- ${table}: vazio`);
    return;
  }
  const payload = rewriteUrls
    ? rows.map((r) => ({ ...r, url: rewriteUrl(r.url) }))
    : rows;
  const { error } = await supabase.from(table).upsert(payload);
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`✓ ${table}: ${payload.length}`);
}

async function main() {
  console.log('Restaurando para', url);
  console.log('Host rewrite:', oldHost, '->', newHost);

  await ensureBucket();
  await uploadImages();

  const categories = await loadJson('categories');
  const products = await loadJson('products');
  const productImages = await loadJson('product_images');
  const siteSettings = await loadJson('site_settings');

  await upsertTable('categories', categories);
  await upsertTable('products', products);
  await upsertTable('product_images', productImages, { rewriteUrls: true });
  await upsertTable('site_settings', siteSettings);

  console.log('\nConcluído. Rode o SQL scripts/migration/001_schema.sql ANTES se as tabelas ainda não existirem.');
  console.log('Crie também o usuário admin em Authentication > Users.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
