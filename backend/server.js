const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const helmet = require('helmet');
const cors = require('cors');
const { isS3Enabled, storageStatus, objectKey, uploadFile, headFile, getFile, deleteFile } = require('./storage');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-production';
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
for (const dir of [DATA_DIR, UPLOAD_DIR]) fs.mkdirSync(dir, { recursive: true });

const files = {
  users: path.join(DATA_DIR, 'users.json'),
  videos: path.join(DATA_DIR, 'videos.json'),
  activity: path.join(DATA_DIR, 'activity.json'),
  settings: path.join(DATA_DIR, 'settings.json')
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
function safeText(value, max = 160) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}
function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, status: user.status, createdAt: user.createdAt };
}
function logActivity(username, action, status = 'Success', metadata = '') {
  const activities = readJson(files.activity, []);
  activities.unshift({ id: crypto.randomUUID(), username, action, status, metadata: safeText(metadata, 200), time: new Date().toISOString() });
  writeJson(files.activity, activities.slice(0, 200));
}
function createMediaToken(userId, videoId) {
  return jwt.sign({ sub: userId, videoId, scope: 'stream' }, JWT_SECRET, { expiresIn: '15m' });
}

let users = readJson(files.users, []);
if (!users.length) {
  const now = new Date().toISOString();
  users = [
    { id: crypto.randomUUID(), username: 'admin', passwordHash: bcrypt.hashSync('admin123', 12), role: 'admin', status: 'Active', createdAt: now },
    { id: crypto.randomUUID(), username: 'viewer', passwordHash: bcrypt.hashSync('viewer123', 12), role: 'viewer', status: 'Active', createdAt: now }
  ];
  writeJson(files.users, users);
}
if (!fs.existsSync(files.videos)) writeJson(files.videos, []);
if (!fs.existsSync(files.activity)) writeJson(files.activity, []);
if (!fs.existsSync(files.settings)) writeJson(files.settings, { maintenance: false });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => file.mimetype?.startsWith('video/') ? cb(null, true) : cb(new Error('Only video files are allowed.'))
});

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, hsts: false, contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const rateWindow = new Map();
function rateLimit(limit, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`, now = Date.now();
    const current = rateWindow.get(key) || { count: 0, start: now };
    if (now - current.start > windowMs) { current.count = 0; current.start = now; }
    current.count++;
    rateWindow.set(key, current);
    if (current.count > limit) return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    next();
  };
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expired or invalid.' }); }
}

function authenticateMedia(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Streaming authorization required.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.scope !== 'stream' || decoded.videoId !== req.params.id) throw new Error('Invalid media token');
    req.user = decoded;
    next();
  } catch { res.status(401).json({ error: 'Streaming session expired. Refresh the video and try again.' }); }
}

function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permissions.' });
}

async function streamVideo(video, req, res, mode = 'stream') {
  const useS3 = video.storage === 's3';
  if (!useS3) {
    const filePath = path.join(UPLOAD_DIR, video.filename);
    if (!fs.existsSync(filePath)) throw new Error('Video file is missing from storage.');
    const stat = fs.statSync(filePath);
    return streamLocal(filePath, video.mimeType, stat.size, req, res, mode);
  }

  if (!isS3Enabled()) throw new Error('This video is stored in S3, but S3 storage is not configured.');
  const meta = await headFile(video.filename);
  const total = Number(meta.ContentLength || 0);
  const range = req.headers.range;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', video.mimeType || meta.ContentType || 'video/mp4');
  res.setHeader('Cache-Control', 'private, max-age=900');

  let requestedRange = null;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return res.status(416).set('Content-Range', `bytes */${total}`).end();
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : Math.min(start + 1024 * 1024 - 1, total - 1);
    if (start >= total || start > end) return res.status(416).set('Content-Range', `bytes */${total}`).end();
    requestedRange = [start, Math.min(end, total - 1)];
  } else if (mode === 'thumbnail') {
    requestedRange = [0, Math.min(1024 * 1024 - 1, total - 1)];
  }

  const rangeHeader = requestedRange ? `bytes=${requestedRange[0]}-${requestedRange[1]}` : undefined;
  const result = await getFile(video.filename, rangeHeader);
  if (!result || !result.Body) throw new Error('S3 did not return the video stream.');

  if (requestedRange) {
    const start = requestedRange[0];
    const end = requestedRange[1];
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
  } else {
    res.setHeader('Content-Length', total);
  }
  if (req.method === 'HEAD') return res.end();
  return result.Body.pipe(res);
}

function streamLocal(filePath, mimeType, total, req, res, mode) {
  const range = req.headers.range;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mimeType || 'video/mp4');
  res.setHeader('Cache-Control', 'private, max-age=900');
  if (!range && mode !== 'thumbnail') {
    res.setHeader('Content-Length', total);
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(filePath).pipe(res);
  }
  let start = 0;
  let end = Math.min(1024 * 1024 - 1, total - 1);
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return res.status(416).set('Content-Range', `bytes */${total}`).end();
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : Math.min(start + 1024 * 1024 - 1, total - 1);
  }
  if (start >= total || start > end) return res.status(416).set('Content-Range', `bytes */${total}`).end();
  const safeEnd = Math.min(end, total - 1);
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${safeEnd}/${total}`);
  res.setHeader('Content-Length', safeEnd - start + 1);
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
}

app.get('/api/health', (_req, res) => res.json({
  status: 'ok', service: 'cloud-video-streaming-api', uptime: process.uptime(),
  timestamp: new Date().toISOString(), storage: storageStatus()
}));

app.post('/api/auth/login', rateLimit(10, 60000), async (req, res) => {
  const username = safeText(req.body.username, 50).toLowerCase();
  const password = String(req.body.password || '');
  const user = users.find(u => u.username.toLowerCase() === username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    logActivity(username || 'unknown', 'Login attempt', 'Failed');
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  if (user.status !== 'Active') return res.status(403).json({ error: 'User account is inactive.' });
  const token = jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  logActivity(user.username, 'Login', 'Success');
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', authenticate, (req, res) => {
  logActivity(req.user.username, 'Logout', 'Success');
  res.json({ message: 'Logged out successfully.' });
});

app.get('/api/me', authenticate, (req, res) => {
  const user = users.find(u => u.id === req.user.sub);
  if (!user) return res.status(401).json({ error: 'User no longer exists.' });
  res.json({ user: publicUser(user) });
});

app.get('/api/videos', authenticate, (req, res) => {
  const search = safeText(req.query.search, 50).toLowerCase();
  const videos = readJson(files.videos, [])
    .filter(v => v.status === 'ready')
    .filter(v => !search || v.title.toLowerCase().includes(search) || (v.description || '').toLowerCase().includes(search))
    .map(v => ({
      id: v.id, title: v.title, description: v.description, originalName: v.originalName,
      size: v.size, uploadedBy: v.uploadedBy, createdAt: v.createdAt, views: v.views,
      storage: v.storage || 'local',
      streamUrl: `/api/videos/${v.id}/stream?token=${encodeURIComponent(createMediaToken(req.user.sub, v.id))}`,
      thumbnailUrl: `/api/videos/${v.id}/thumbnail?token=${encodeURIComponent(createMediaToken(req.user.sub, v.id))}`
    }));
  res.json({ videos });
});

app.get('/api/videos/:id', authenticate, (req, res) => {
  const v = readJson(files.videos, []).find(x => x.id === req.params.id && x.status === 'ready');
  if (!v) return res.status(404).json({ error: 'Video not found.' });
  res.json({ video: { id: v.id, title: v.title, description: v.description, size: v.size, uploadedBy: v.uploadedBy, createdAt: v.createdAt, views: v.views, storage: v.storage || 'local' } });
});

app.post('/api/videos', authenticate, requireRole('admin', 'uploader'), upload.single('video'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'A video file is required.' });
  const title = safeText(req.body.title || path.basename(req.file.originalname, path.extname(req.file.originalname)), 100);
  const description = safeText(req.body.description, 500);
  const videos = readJson(files.videos, []);
  const id = crypto.randomUUID();
  const storage = isS3Enabled() ? 's3' : 'local';
  const filename = storage === 's3' ? objectKey(req.file.filename) : req.file.filename;
  const video = {
    id, title, description, originalName: safeText(req.file.originalname, 180),
    filename, mimeType: req.file.mimetype, size: req.file.size,
    uploadedBy: req.user.username, createdAt: new Date().toISOString(), views: 0, status: 'ready', storage
  };

  try {
    if (storage === 's3') {
      await uploadFile(req.file.path, filename, req.file.mimetype);
      fs.unlinkSync(req.file.path);
    }
    videos.unshift(video);
    writeJson(files.videos, videos);
    logActivity(req.user.username, 'Video upload', 'Completed', `${video.title} [${storage}]`);
    res.status(201).json({
      message: `Video uploaded successfully to ${storage === 's3' ? 'Amazon S3' : 'local Docker storage'}.`,
      video: { id: video.id, title: video.title, description: video.description, size: video.size, storage, streamUrl: `/api/videos/${video.id}/stream?token=${encodeURIComponent(createMediaToken(req.user.sub, video.id))}` }
    });
  } catch (error) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(error);
  }
});

app.get('/api/videos/:id/stream', authenticateMedia, async (req, res, next) => {
  try {
    const video = readJson(files.videos, []).find(v => v.id === req.params.id && v.status === 'ready');
    if (!video) return res.status(404).json({ error: 'Video not found.' });
    await streamVideo(video, req, res, 'stream');
  } catch (error) { next(error); }
});

app.get('/api/videos/:id/thumbnail', authenticateMedia, async (req, res, next) => {
  try {
    const video = readJson(files.videos, []).find(v => v.id === req.params.id && v.status === 'ready');
    if (!video) return res.status(404).json({ error: 'Video not found.' });
    await streamVideo(video, req, res, 'thumbnail');
  } catch (error) { next(error); }
});

app.post('/api/videos/:id/view', authenticate, (req, res) => {
  const videos = readJson(files.videos, []);
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: 'Video not found.' });
  video.views = Number(video.views || 0) + 1;
  writeJson(files.videos, videos);
  logActivity(req.user.username, 'Video stream', 'Active', video.title);
  res.json({ views: video.views });
});

app.delete('/api/videos/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  const videos = readJson(files.videos, []);
  const index = videos.findIndex(v => v.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Video not found.' });
  const [video] = videos.splice(index, 1);
  try {
    if (video.storage === 's3') await deleteFile(video.filename);
    else {
      const filePath = path.join(UPLOAD_DIR, video.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    writeJson(files.videos, videos);
    logActivity(req.user.username, 'Video deleted', 'Completed', video.title);
    res.json({ message: 'Video deleted.' });
  } catch (error) { next(error); }
});

app.get('/api/admin/metrics', authenticate, requireRole('admin'), (_req, res) => {
  const videos = readJson(files.videos, []);
  const activity = readJson(files.activity, []);
  const activeStreams = activity.filter(a => a.action === 'Video stream' && Date.now() - new Date(a.time).getTime() < 15 * 60_000).length;
  res.json({
    users: users.length, videos: videos.length, activeStreams,
    totalViews: videos.reduce((s, v) => s + Number(v.views || 0), 0),
    storageBytes: videos.reduce((s, v) => s + Number(v.size || 0), 0),
    s3Videos: videos.filter(v => v.storage === 's3').length,
    maintenance: readJson(files.settings, { maintenance: false }).maintenance,
    storage: storageStatus()
  });
});

app.get('/api/admin/cloud', authenticate, requireRole('admin'), (_req, res) => {
  const videos = readJson(files.videos, []);
  res.json({
    storage: storageStatus(),
    cloudVideos: videos.filter(v => v.storage === 's3').length,
    localVideos: videos.filter(v => (v.storage || 'local') === 'local').length
  });
});

app.get('/api/admin/users', authenticate, requireRole('admin'), (req, res) => {
  const search = safeText(req.query.search, 50).toLowerCase();
  res.json({ users: users.filter(u => !search || u.username.toLowerCase().includes(search)).map(publicUser) });
});

app.get('/api/admin/activity', authenticate, requireRole('admin'), (_req, res) => {
  res.json({ activity: readJson(files.activity, []).slice(0, 30) });
});

app.post('/api/admin/maintenance', authenticate, requireRole('admin'), (req, res) => {
  const settings = readJson(files.settings, { maintenance: false });
  settings.maintenance = Boolean(req.body.enabled);
  writeJson(files.settings, settings);
  logActivity(req.user.username, settings.maintenance ? 'Maintenance enabled' : 'Maintenance disabled', 'Completed');
  res.json({ maintenance: settings.maintenance });
});

app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'login.html')));

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: 'Video exceeds the 100 MB limit.' });
  console.error(err);
  res.status(400).json({ error: err.message || 'Request failed.' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`CloudStream running on http://0.0.0.0:${PORT} | storage=${storageStatus().provider}`));
