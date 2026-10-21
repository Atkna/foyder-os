const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = require('../package.json');
const listed = pkg.build.files;
const included = file => listed.some(entry => entry === file || (entry.endsWith('/**') && file.startsWith(entry.slice(0, -2))));

test('paketleme listesindeki her dosya mevcut', () => {
  for (const entry of listed) {
    const target = path.join(root, entry.replace(/\/\*\*$/, ''));
    assert.ok(fs.existsSync(target), `eksik dosya: ${entry}`);
  }
});

test('çalışma anında kullanılan dosyaların hepsi paketleme listesinde', () => {
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const used = new Set([pkg.main]);
  for (const [, file] of main.matchAll(/require\('\.\/([^']+)'\)/g)) if (file !== 'package.json') used.add(file.endsWith('.js') ? file : `${file}.js`);
  for (const [, args] of main.matchAll(/path\.join\(__dirname,\s*([^)]+)\)/g)) used.add(args.split(',').map(part => part.trim().replace(/^'|'$/g, '')).join('/'));
  for (const [, file] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) used.add(file);
  for (const file of used) {
    assert.ok(fs.existsSync(path.join(root, file)), `bulunamadı: ${file}`);
    assert.ok(included(file), `paketleme listesinde yok: ${file}`);
  }
  assert.ok(used.has('sample-transcript.txt') && used.has('preload.js') && used.has('store.js') && used.has('task-engine.js'));
});
