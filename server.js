const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');

const POTREE_DIR = path.resolve(process.env.POTREE_DIR || path.join(ROOT, 'vendor', 'potree'));
const POTREE_CONVERTER = path.resolve(
  process.env.POTREE_CONVERTER ||
  path.join(ROOT, 'vendor', 'PotreeConverter', process.platform === 'win32' ? 'PotreeConverter.exe' : 'PotreeConverter')
);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const debugClients = new Set();
const debugHistory = [];
let debugSeq = 0;

function emitDebug(source, message, data = {}) {
  const event = {
    seq: ++debugSeq,
    time: new Date().toISOString(),
    source,
    message,
    ...data
  };

  debugHistory.push(event);
  if (debugHistory.length > 120) debugHistory.shift();

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of debugClients) {
    try { client.write(payload); } catch (_) {}
  }

  return event;
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  res.write('retry: 2000\n\n');
  for (const event of debugHistory.slice(-40)) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  const connected = {
    seq: ++debugSeq,
    time: new Date().toISOString(),
    source: 'server',
    message: 'SSE-канал подключён'
  };
  res.write(`data: ${JSON.stringify(connected)}\n\n`);

  debugClients.add(res);
  const keepAlive = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch (_) {}
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    debugClients.delete(res);
  });
});

function relativeToRoot(p) {
  const rel = path.relative(ROOT, p);
  return rel || path.basename(p);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const stem = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'cloud';
    const token = Math.random().toString(36).slice(2, 8);
    cb(null, `${Date.now()}_${token}_${stem}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.las' || ext === '.laz') return cb(null, true);
    cb(new Error('Поддерживаются только LAS/LAZ.'));
  }
});

app.use(express.static(path.join(ROOT, 'public')));
app.use('/data', express.static(DATA_DIR, { fallthrough: false }));
app.use('/potree', express.static(POTREE_DIR, { fallthrough: false }));

app.get('/demo/eclepens/*', async (req, res) => {
  const relative = req.params[0] || 'metadata.json';
  if (relative.includes('..')) return res.status(400).send('Некорректный путь demo.');

  const target = `https://potree.org/pointclouds/eclepens/${relative}`;
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  try {
    const upstream = await fetch(target, { headers });
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(502).send(`Demo source returned HTTP ${upstream.status}`);
    }

    res.status(upstream.status);
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.send(body);
  } catch (err) {
    console.error('Demo proxy error:', err);
    emitDebug('server', 'Ошибка proxy для демонстрационного облака', { error: err.message });
    res.status(502).send(`Не удалось загрузить демонстрационное облако: ${err.message}`);
  }
});

app.get('/api/health', (req, res) => {
  const payload = {
    ok: true,
    potreeFound: fs.existsSync(path.join(POTREE_DIR, 'build', 'potree', 'potree.js')),
    converterFound: fs.existsSync(POTREE_CONVERTER),
    potreeDir: POTREE_DIR,
    converter: POTREE_CONVERTER,
    platform: `${os.platform()} ${os.arch()}`
  };
  res.json(payload);
});

app.post('/api/convert', upload.single('cloud'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен.' });

  emitDebug('server', `Файл получен: ${req.file.originalname}`, {
    size: req.file.size,
    tempFile: relativeToRoot(req.file.path)
  });
  emitDebug('server', `Временный файл сохранён: ${relativeToRoot(req.file.path)}`);

  if (!fs.existsSync(POTREE_CONVERTER)) {
    fs.unlink(req.file.path, () => {});
    emitDebug('server', 'PotreeConverter не найден', { converter: POTREE_CONVERTER });
    return res.status(500).json({
      error: 'PotreeConverter не найден. Проверьте POTREE_CONVERTER или папку vendor/PotreeConverter.'
    });
  }

  const safeBase = path.basename(req.file.originalname, path.extname(req.file.originalname))
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 60) || 'cloud';
  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBase}`;
  const outDir = path.join(DATA_DIR, jobId);
  fs.mkdirSync(outDir, { recursive: true });

  const args = [req.file.path, '-o', outDir];
  console.log('PotreeConverter:', POTREE_CONVERTER, args.join(' '));
  emitDebug('server', 'Запускаю PotreeConverter', {
    executable: POTREE_CONVERTER,
    input: relativeToRoot(req.file.path),
    output: relativeToRoot(outDir),
    jobId
  });

  const child = spawn(POTREE_CONVERTER, args, {
    windowsHide: true,
    cwd: path.dirname(POTREE_CONVERTER)
  });

  let stdout = '';
  let stderr = '';
  let lineBuffer = '';
  const seenStages = new Set();

  function inspectConverterLine(line) {
    const clean = line.trim();
    if (!clean) return;

    const stages = [
      ['COUNTING', 'Этап PotreeConverter: COUNTING'],
      ['CREATING CHUNKS', 'Этап PotreeConverter: CREATING CHUNKS'],
      ['INDEXING', 'Этап PotreeConverter: INDEXING'],
      ['STATS', 'PotreeConverter: итоговая статистика']
    ];

    for (const [needle, label] of stages) {
      if (clean.includes(needle) && !seenStages.has(needle)) {
        seenStages.add(needle);
        emitDebug('converter', label, { jobId });
      }
    }

    if (/^#points:/i.test(clean)) {
      emitDebug('converter', clean, { jobId });
    } else if (/^duration:/i.test(clean) || /^throughput/i.test(clean)) {
      emitDebug('converter', clean, { jobId });
    } else if (/ERROR/i.test(clean)) {
      emitDebug('converter', clean, { jobId, level: 'error' });
    }
  }

  child.stdout.on('data', d => {
    const text = d.toString();
    if (stdout.length < 200000) stdout += text;
    lineBuffer += text;
    const lines = lineBuffer.split(/\r?\n/);
    lineBuffer = lines.pop() || '';
    for (const line of lines) inspectConverterLine(line);
  });

  child.stderr.on('data', d => {
    const text = d.toString();
    if (stderr.length < 200000) stderr += text;
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) emitDebug('converter', line.trim(), { jobId, level: 'error' });
    }
  });

  child.on('error', err => {
    fs.unlink(req.file.path, () => {});
    console.error('PotreeConverter spawn error:', err);
    emitDebug('server', 'Не удалось запустить PotreeConverter', { jobId, error: err.message, level: 'error' });
    if (!res.headersSent) {
      res.status(500).json({ error: `Не удалось запустить PotreeConverter: ${err.message}`, details: err.stack || '' });
    }
  });

  child.on('close', code => {
    if (lineBuffer.trim()) inspectConverterLine(lineBuffer);

    fs.unlink(req.file.path, () => {
      emitDebug('server', `Временный файл удалён: ${relativeToRoot(req.file.path)}`, { jobId });
    });

    const metadata = path.join(outDir, 'metadata.json');
    emitDebug('server', `PotreeConverter завершён: exit code ${code}`, { jobId, exitCode: code });

    if (code !== 0 || !fs.existsSync(metadata)) {
      console.error('PotreeConverter failed', { code, stdout, stderr });
      emitDebug('server', 'Конвертация завершилась с ошибкой', { jobId, exitCode: code, level: 'error' });
      if (!res.headersSent) {
        return res.status(500).json({
          error: 'Конвертация завершилась с ошибкой.',
          exitCode: code,
          details: (stderr || stdout || 'PotreeConverter не создал metadata.json.').slice(-4000)
        });
      }
      return;
    }

    emitDebug('server', `Создан metadata.json`, {
      jobId,
      metadata: relativeToRoot(metadata)
    });

    const metadataUrl = `/data/${encodeURIComponent(jobId)}/metadata.json`;
    emitDebug('server', `Возвращаю браузеру metadataUrl`, { jobId, metadataUrl });

    if (!res.headersSent) {
      res.json({
        ok: true,
        name: req.file.originalname,
        metadataUrl,
        logTail: stdout.slice(-1500)
      });
    }
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  emitDebug('server', `Ошибка запроса: ${err.message || 'неизвестная ошибка'}`, { level: 'error' });
  res.status(400).json({ error: err.message || 'Ошибка запроса.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mini Potree Lab: http://localhost:${PORT}`);
  console.log(`Potree: ${POTREE_DIR}`);
  console.log(`Converter: ${POTREE_CONVERTER}`);
  emitDebug('server', `Mini Potree Lab запущен на порту ${PORT}`);
});
