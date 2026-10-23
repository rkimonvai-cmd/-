// ACS TONMOY STUDIO — Node.js / Express starter
// Configure ADMIN_USERNAME, ADMIN_PASSWORD and SESSION_SECRET in your hosting environment.
// Do not put Gmail passwords, OAuth secrets, or other credentials in source code.
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const DB_PATH = path.join(__dirname, 'studio-data.json');
const CHAT_PATH = path.join(__dirname, 'chat-data.json');
const ROTATION_MS = 10 * 60 * 1000;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error('Missing ADMIN_USERNAME, ADMIN_PASSWORD, or SESSION_SECRET environment variable.');
  process.exit(1);
}

app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(session({
  name: 'acs.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 2 * 60 * 60 * 1000 }
}));
app.use(express.static(__dirname, { index: 'index.html' }));

function randomPassword() { return crypto.randomBytes(5).toString('base64url'); }
function readDB() {
  try { const d = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); return Array.isArray(d.videos) ? d : { videos: [] }; }
  catch { return { videos: [] }; }
}
function writeDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), { mode: 0o600 }); }
function readChatDB() {
  try { const d = JSON.parse(fs.readFileSync(CHAT_PATH, 'utf8')); return Array.isArray(d.messages) ? d : { messages: [] }; }
  catch { return { messages: [] }; }
}
function writeChatDB(db) { fs.writeFileSync(CHAT_PATH, JSON.stringify(db, null, 2), { mode: 0o600 }); }
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function adminOnly(req, res, next) {
  if (!req.session || req.session.admin !== true) return res.status(401).json({ error: 'Admin login required.' });
  next();
}
function normalizeVideoUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) throw new Error('Video URL is required.');

  let u;
  try { u = new URL(url); }
  catch { throw new Error('Invalid video URL.'); }

  const host = u.hostname.replace(/^www\./, '').toLowerCase();

  if (['drive.google.com', 'docs.google.com'].includes(host)) {
    const m = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
      u.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/) ||
      u.pathname.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    const id = m ? m[1] : u.searchParams.get('id');
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error('Could not read the file ID from this Drive link.');
    }
    return `https://drive.google.com/file/d/${id}/preview`;
  }

  if (host === 'youtu.be') {
    const id = u.pathname.replace('/', '').split('/')[0];
    if (!id) throw new Error('Could not read the YouTube video ID.');
    return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  }

  if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    const id = u.searchParams.get('v') ||
      (u.pathname.startsWith('/shorts/') ? u.pathname.replace('/shorts/', '') : '') ||
      (u.pathname.startsWith('/embed/') ? u.pathname.replace('/embed/', '') : '');
    if (!id) throw new Error('Could not read the YouTube video ID.');
    return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  }

  if (host === 'files.catbox.moe' || host === 'catbox.moe' || host.endsWith('.catbox.moe')) {
    return u.toString();
  }

  const pathname = u.pathname.toLowerCase();
  const search = u.search.toLowerCase();
  if (/\.(mp4|webm|ogg|m4v|mov|m3u8)(\?|$)/i.test(pathname) || /\.(mp4|webm|ogg|m4v|mov|m3u8)(\?|$)/i.test(search)) {
    return u.toString();
  }

  throw new Error('Unsupported video link. Use Google Drive, YouTube, Catbox, or a direct MP4/WEBM/MOV file URL.');
}

function publicVideo(v) {
  const { id, title, description, views } = v;
  return { id, title, description, views: views || 0 };
}
function rotatePasswords() {
  const db = readDB(); let changed = false; const now = Date.now();
  for (const v of db.videos) {
    if (v.rotate && now >= (v.nextRotation || 0)) {
      v.password = randomPassword(); v.nextRotation = now + ROTATION_MS; changed = true;
    }
  }
  if (changed) writeDB(db);
}
setInterval(rotatePasswords, 5000).unref();

app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/api/videos', (req, res) => {
  rotatePasswords();
  res.json(readDB().videos.map(publicVideo));
});
app.get('/api/admin/me', adminOnly, (req, res) => res.json({ ok: true }));
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!safeEqual(username || '', ADMIN_USERNAME) || !safeEqual(password || '', ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not create session.' });
    req.session.admin = true;
    res.json({ ok: true });
  });
});
app.post('/api/admin/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/admin/videos', adminOnly, (req, res) => {
  rotatePasswords();
  const db = readDB();
  res.json(db.videos.map(v => ({ ...v, nextRotation: v.nextRotation || 0 })));
});
app.post('/api/admin/videos', adminOnly, (req, res) => {
  try {
    const { title, driveUrl, description = '', password = '', rotate = true } = req.body || {};
    if (!String(title || '').trim()) return res.status(400).json({ error: 'Video title is required.' });
    const embedUrl = normalizeVideoUrl(String(driveUrl || ''));
    const now = Date.now();
    const v = {
      id: crypto.randomUUID(), title: String(title).trim().slice(0, 120),
      description: String(description).slice(0, 500), driveUrl: String(driveUrl),
      embedUrl, password: String(password || '').trim() || randomPassword(),
      rotate: Boolean(rotate), nextRotation: now + ROTATION_MS, views: 0, createdAt: now
    };
    const db = readDB(); db.videos.unshift(v); writeDB(db);
    res.status(201).json({ ok: true, id: v.id, password: v.password });
  } catch (e) { res.status(400).json({ error: e.message || 'Could not publish video.' }); }
});
app.post('/api/admin/videos/:id/password', adminOnly, (req, res) => {
  const db = readDB(); const v = db.videos.find(x => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'Video not found.' });
  v.password = String((req.body || {}).password || '').trim() || randomPassword();
  v.nextRotation = Date.now() + ROTATION_MS; writeDB(db);
  res.json({ ok: true, password: v.password });
});
app.post('/api/admin/videos/:id/rotate', adminOnly, (req, res) => {
  const db = readDB(); const v = db.videos.find(x => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'Video not found.' });
  v.rotate = Boolean((req.body || {}).rotate); v.nextRotation = Date.now() + ROTATION_MS; writeDB(db);
  res.json({ ok: true, rotate: v.rotate });
});
app.delete('/api/admin/videos/:id', adminOnly, (req, res) => {
  const db = readDB(); const old = db.videos.length; db.videos = db.videos.filter(v => v.id !== req.params.id);
  if (db.videos.length === old) return res.status(404).json({ error: 'Video not found.' });
  writeDB(db); res.json({ ok: true });
});
app.post('/api/watch/:id', (req, res) => {
  rotatePasswords();
  const db = readDB(); const v = db.videos.find(x => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'Video not found.' });
  if (!safeEqual((req.body || {}).password || '', v.password)) return res.status(403).json({ error: 'Incorrect or expired password.' });
  v.views = (v.views || 0) + 1; writeDB(db);
  res.json({ ok: true, title: v.title, description: v.description, embedUrl: v.embedUrl });
});

app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};
  const senderName = String(name || 'Guest').trim().slice(0, 80) || 'Guest';
  const senderEmail = String(email || '').trim().toLowerCase().slice(0, 160);
  const text = String(message || '').trim();

  if (!text) return res.status(400).json({ error: 'Message is required.' });
  if (!senderEmail) return res.status(400).json({ error: 'Email is required so admin can reply.' });

  const db = readChatDB();
  const entry = {
    id: crypto.randomUUID(),
    name: senderName,
    email: senderEmail,
    message: text.slice(0, 2000),
    createdAt: Date.now(),
    status: 'unread',
    replies: []
  };
  db.messages.unshift(entry);
  writeChatDB(db);
  res.status(201).json({ ok: true, message: 'Message sent to admin.' });
});

app.get('/api/chat/public', (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.json({ messages: [] });

  const db = readChatDB();
  const messages = db.messages.filter(item => String(item.email || '').toLowerCase() === email);
  res.json({ messages: messages.sort((a, b) => Number(b.createdAt) - Number(a.createdAt)) });
});

app.get('/api/admin/chat', adminOnly, (req, res) => {
  const db = readChatDB();
  const messages = db.messages.slice().sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  res.json({ messages });
});

app.post('/api/admin/chat/:id/reply', adminOnly, (req, res) => {
  const db = readChatDB();
  const thread = db.messages.find(item => item.id === req.params.id);
  if (!thread) return res.status(404).json({ error: 'Message not found.' });

  const reply = String((req.body || {}).reply || '').trim();
  if (!reply) return res.status(400).json({ error: 'Reply is required.' });

  thread.replies = Array.isArray(thread.replies) ? thread.replies : [];
  thread.replies.push({
    id: crypto.randomUUID(),
    sender: 'admin',
    text: reply.slice(0, 2000),
    createdAt: Date.now()
  });
  thread.status = 'replied';
  writeChatDB(db);
  res.json({ ok: true, message: 'Reply sent.' });
});

app.post('/api/admin/chat/:id/read', adminOnly, (req, res) => {
  const db = readChatDB();
  const thread = db.messages.find(item => item.id === req.params.id);
  if (!thread) return res.status(404).json({ error: 'Message not found.' });
  thread.status = 'read';
  writeChatDB(db);
  res.json({ ok: true });
});

app.get('/health', (req, res) => res.json({ ok: true, service: 'ACS TONMOY STUDIO' }));
app.listen(PORT, () => console.log(`ACS TONMOY STUDIO running on port ${PORT}`));

