const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const helmet = require('helmet');
const cors = require('cors');

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
  writeJson(files.activity, activities.slice(0, 100));
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
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files are allowed.'));
  }
});

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const rateWindow = new Map();
function rateLimit(limit, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const current = rateWindow.get(key) || { count: 0, start: now };
    if (now - current.start > windowMs) { current.count = 0; current.start = now; }
    current.count += 1;
    rateWindow.set(key, current);
    if (current.count > limit) return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    next();
  };
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }
}
function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permissions.' });
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'cloud-video-streaming-api', uptime: process.uptime(), timestamp: new Date().toISOString() }));

app.post('/api/auth/login', rateLimit(10, 60_000), async (req, res) => {
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

app.get('/api/me', authenticate, (req, res) => {
  const user = users.find(u => u.id === req.user.sub);
  if (!user) return res.status(401).json({ error: 'User no longer exists.' });
  res.json({ user: publicUser(user) });
});

app.get('/api/videos', authenticate, (_req, res) => {
  const videos = readJson(files.videos, []).filter(v => v.status === 'ready').map(v => ({
    id: v.id, title: v.title, description: v.description, originalName: v.originalName,
    size: v.size, uploadedBy: v.uploadedBy, createdAt: v.createdAt, views: v.views,
    streamUrl: `/api/videos/${v.id}/stream`
  }));
  res.json({ videos });
});

app.get('/api/videos/:id', authenticate, (req, res) => {
  const video = readJson(files.videos, []).find(v => v.id === req.params.id && v.status === 'ready');
  if (!video) return res.status(404).json({ error: 'Video not found.' });
  res.json({ video: { id: video.id, title: video.title, description: video.description, size: video.size, uploadedBy: video.uploadedBy, createdAt: video.createdAt, views: video.views } });
});

app.post('/api/videos', authenticate, requireRole('admin', 'uploader'), upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A video file is required.' });
  const title = safeText(req.body.title || path.basename(req.file.originalname, path.extname(req.file.originalname)), 100);
  const description = safeText(req.body.description, 500);
  const videos = readJson(files.videos, []);
  const video = {
    id: crypto.randomUUID(), title, description, originalName: safeText(req.file.originalname, 180),
    filename: req.file.filename, mimeType: req.file.mimetype, size: req.file.size,
    uploadedBy: req.user.username, createdAt: new Date().toISOString(), views: 0, status: 'ready'
  };
  videos.unshift(video);
  writeJson(files.videos, videos);
  logActivity(req.user.username, 'Video upload', 'Completed', video.title);
  res.status(201).json({ message: 'Video uploaded successfully.', video: { id: video.id, title: video.title, description: video.description, size: video.size, streamUrl: `/api/videos/${video.id}/stream` } });
});

app.get('/api/videos/:id/stream', authenticate, (req, res) => {
  const videos = readJson(files.videos, []);
  const video = videos.find(v => v.id === req.params.id && v.status === 'ready');
  if (!video) return res.status(404).json({ error: 'Video not found.' });
  const filePath = path.join(UPLOAD_DIR, video.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Video file is missing from storage.' });
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', video.mimeType || 'video/mp4');
  res.setHeader('Cache-Control', 'private, max-age=3600');

  if (!range) {
    res.setHeader('Content-Length', stat.size);
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(filePath).pipe(res);
  }

  const match = /bytes=(\d+)-(\d*)/.exec(range);
  if (!match) return res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : Math.min(start + 1024 * 1024 - 1, stat.size - 1);
  if (start >= stat.size || start > end) return res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
  const safeEnd = Math.min(end, stat.size - 1);
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${safeEnd}/${stat.size}`);
  res.setHeader('Content-Length', safeEnd - start + 1);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
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

app.delete('/api/videos/:id', authenticate, requireRole('admin'), (req, res) => {
  const videos = readJson(files.videos, []);
  const index = videos.findIndex(v => v.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Video not found.' });
  const [video] = videos.splice(index, 1);
  const filePath = path.join(UPLOAD_DIR, video.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  writeJson(files.videos, videos);
  logActivity(req.user.username, 'Video deleted', 'Completed', video.title);
  res.json({ message: 'Video deleted.' });
});

app.get('/api/admin/metrics', authenticate, requireRole('admin'), (_req, res) => {
  const videos = readJson(files.videos, []);
  const activeStreams = readJson(files.activity, []).filter(a => a.action === 'Video stream' && Date.now() - new Date(a.time).getTime() < 15 * 60_000).length;
  res.json({ users: users.length, videos: videos.length, activeStreams, totalViews: videos.reduce((sum, v) => sum + Number(v.views || 0), 0), storageBytes: videos.reduce((sum, v) => sum + Number(v.size || 0), 0), maintenance: readJson(files.settings, { maintenance: false }).maintenance });
});

app.get('/api/admin/users', authenticate, requireRole('admin'), (req, res) => {
  const search = safeText(req.query.search, 50).toLowerCase();
  const result = users.filter(u => !search || u.username.toLowerCase().includes(search)).map(publicUser);
  res.json({ users: result });
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

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h' }));
app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'login.html')));

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Video exceeds the 100 MB limit.' });
  console.error(err);
  res.status(400).json({ error: err.message || 'Request failed.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CloudStream API listening on http://0.0.0.0:${PORT}`);
  console.log(`Frontend served from ${FRONTEND_DIR}`);
});
