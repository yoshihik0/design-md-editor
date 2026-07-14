#!/usr/bin/env node
/**
 * D.md (DESIGN.md Editor) — ローカルサーバ
 *
 * 静的配信（npx serve 相当）に加えて、.md ファイルの PUT 保存を受け付ける。
 * これによりブラウザ内の編集を、ダイアログなしでプロジェクトフォルダに直接
 * 書き戻せる（?md= URL読み込みモードでの「上書き保存」）。
 *
 * 使い方:  node server.mjs [port]     （デフォルト 3000）
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 3000;
const MAX_BODY = 5 * 1024 * 1024; // 5MB

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function resolveSafe(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const rel = clean.replace(/^\/+/, '') || 'index.html';
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) return null; // path traversal guard
  return abs;
}

// GET /__list?dir=design — 作業フォルダ内のDESIGN.md一覧を返す。
async function listMarkdownFiles(dir) {
  if (dir !== 'design') return null;
  const files = [];
  const subDir = path.join(ROOT, dir);
  async function walk(current, relative) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (relative === '' && entry.name === 'templates') continue;
      if (entry.isDirectory()) {
        await walk(path.join(current, entry.name), path.join(relative, entry.name));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') &&
        !(relative !== '' && entry.name.toLowerCase() !== 'design.md')) {
        files.push(`${dir}/${path.join(relative, entry.name).split(path.sep).join('/')}`);
      }
    }
  }
  try {
    await walk(subDir, '');
    files.sort();
  } catch {
    // フォルダが無ければ空配列のまま
  }
  return files;
}

async function listTemplates() {
  const root = path.join(ROOT, 'design', 'templates');
  const templates = [];
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const designPath = path.join(root, entry.name, 'DESIGN.md');
    const previewPath = path.join(root, entry.name, 'PREVIEW.md');
    const source = await fs.readFile(designPath, 'utf8').catch(() => null);
    if (!source) continue;
    const field = (name) => {
      const match = source.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
      return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
    };
    templates.push({
      id: entry.name,
      name: field('title') || entry.name,
      description: field('description'),
      design: `design/templates/${entry.name}/DESIGN.md`,
      preview: `design/templates/${entry.name}/PREVIEW.md`,
      hasPreview: !!(await fs.stat(previewPath).catch(() => null))
    });
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

async function instantiateTemplate(templateId, designContent, previewContent) {
  if (!/^[A-Za-z0-9_-]+$/.test(templateId || '')) throw new Error('Invalid template id');
  const designRoot = path.join(ROOT, 'design');
  let number = 1;
  let folderName;
  let targetDir;
  while (true) {
    folderName = `${templateId}-${String(number).padStart(3, '0')}`;
    targetDir = path.join(designRoot, folderName);
    try {
      await fs.mkdir(targetDir);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      number++;
    }
  }
  await fs.writeFile(path.join(targetDir, 'DESIGN.md'), designContent, 'utf8');
  await fs.writeFile(path.join(targetDir, 'PREVIEW.md'), previewContent, 'utf8');
  return {
    folder: `design/${folderName}`,
    design: `design/${folderName}/DESIGN.md`,
    preview: `design/${folderName}/PREVIEW.md`
  };
}

async function writeCurrentWorkspace(info) {
  const design = String(info.design || '');
  const preview = String(info.preview || '');
  if (!/^design\/[A-Za-z0-9_./-]+\.md$/i.test(design) || !/^design\/[A-Za-z0-9_./-]+\.md$/i.test(preview)) {
    throw new Error('Invalid workspace paths');
  }
  const dir = path.join(ROOT, '.dmd');
  await fs.mkdir(dir, { recursive: true });
  const payload = {
    folder: String(info.folder || path.posix.dirname(design)),
    design,
    preview,
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(dir, 'current.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

async function saveWorkspaceAs(folderName, designContent, previewContent) {
  const name = String(folderName || '').trim();
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('Invalid folder name');
  const targetDir = path.join(ROOT, 'design', name);
  try {
    await fs.mkdir(targetDir);
  } catch (err) {
    if (err.code === 'EEXIST') throw new Error('同名の作業フォルダが既にあります');
    throw err;
  }
  await fs.writeFile(path.join(targetDir, 'DESIGN.md'), designContent, 'utf8');
  await fs.writeFile(path.join(targetDir, 'PREVIEW.md'), previewContent, 'utf8');
  return { folder: `design/${name}`, design: `design/${name}/DESIGN.md`, preview: `design/${name}/PREVIEW.md` };
}

const server = http.createServer(async (req, res) => {
  const urlNoQuery = (req.url || '/').split('?')[0];

  if (req.method === 'GET' && urlNoQuery === '/__list') {
    const parsedUrl = new URL(req.url, `http://localhost`);
    const dir = parsedUrl.searchParams.get('dir');
    const files = await listMarkdownFiles(dir);
    if (files === null) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'dir must be "design"' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ files }));
    return;
  }

  if (req.method === 'GET' && urlNoQuery === '/__templates') {
    const templates = await listTemplates();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ templates }));
    return;
  }

  if (req.method === 'GET' && urlNoQuery === '/__workspace') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ name: path.basename(ROOT), mode: 'local-server' }));
    return;
  }

  if (req.method === 'POST' && urlNoQuery === '/__instantiate-template') {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(chunk);
    });
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const result = await instantiateTemplate(body.template, String(body.design || ''), String(body.preview || ''));
        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: String(err.message || err) }));
      }
    });
    return;
  }

  if (req.method === 'POST' && urlNoQuery === '/__current') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const result = await writeCurrentWorkspace(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: String(err.message || err) }));
      }
    });
    return;
  }

  if (req.method === 'POST' && urlNoQuery === '/__save-as-workspace') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const result = await saveWorkspaceAs(body.folderName, String(body.design || ''), String(body.preview || ''));
        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: String(err.message || err) }));
      }
    });
    return;
  }

  const abs = resolveSafe(req.url || '/');
  if (!abs) { res.writeHead(400); res.end('Bad path'); return; }

  if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      let target = abs;
      const st = await fs.stat(target).catch(() => null);
      if (st && st.isDirectory()) target = path.join(target, 'index.html');
      const data = await fs.readFile(target);
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        // .md はポーリング対象なのでキャッシュ禁止
        'Cache-Control': ext === '.md' ? 'no-store' : 'no-cache'
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }

  if (req.method === 'PUT') {
    if (!abs.toLowerCase().endsWith('.md')) {
      res.writeHead(403); res.end('PUT is allowed for .md files only');
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', async () => {
      const tmpPath = `${abs}.${process.pid}.${Date.now()}.tmp`;
      try {
        // アトミック書き込み: 一時ファイルに書いてから rename する。
        // 書き込み途中の内容をポーリング中のクライアントが読んでしまう
        // （中途半端な内容でGETされる）事故を防ぐ。
        await fs.writeFile(tmpPath, Buffer.concat(chunks));
        await fs.rename(tmpPath, abs);
        res.writeHead(204); res.end();
        console.log(`[saved] ${path.relative(ROOT, abs)} (${size} bytes)`);
      } catch (err) {
        await fs.unlink(tmpPath).catch(() => {});
        res.writeHead(500); res.end(String(err));
      }
    });
    return;
  }

  res.writeHead(405, { Allow: 'GET, HEAD, PUT' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`D.md: http://localhost:${PORT}/`);
  console.log(`（.md の保存を受け付けます。終了は Ctrl+C）`);
});
