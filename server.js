// قعدة 90 · إعداد م. إياد حلوبي
// سيرفر Express بسيط: حسابات بلا إيميل (رمز سري لكل جهاز)، عادات، شراكات بدعوة ورمز.
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
// بالنسخة المدفوعة: اربط قرص على Render وخلّي DATA_DIR يأشّر عليه (شوف render.yaml)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

const MAX_HABITS = 3;
const MAX_MEMBERS = 8;
const INVITE_DAYS = 7;
const MAX_TRIES = 5;

let db = { users: {}, habits: {}, invites: {}, stats: { visits: 0, days: {}, joins: 0, habits: 0 } };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, "utf8"))); } catch (e) {}

let saveT = null;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const tmp = DB_FILE + ".tmp";
    fs.writeFile(tmp, JSON.stringify(db), err => { if (!err) fs.rename(tmp, DB_FILE, () => {}); });
  }, 300);
}

const rid = n => crypto.randomBytes(n).toString("base64url");
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from(crypto.randomBytes(5), b => CODE_CHARS[b % CODE_CHARS.length]).join("");
const clip = (s, n) => String(s || "").trim().slice(0, n);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const COLORS = ["#3f5d7a", "#7a4f6d", "#8a5a3c", "#4b6b5a", "#6a5a8c", "#8c4f4f", "#3c6e7a", "#7a6a3f"];

app.use(express.json({ limit: "300kb" }));

function auth(req, res) {
  const t = req.body && req.body.token;
  const u = t && Object.values(db.users).find(x => x.token === t);
  if (!u) { res.status(401).json({ error: "auth" }); return null; }
  u.seen = Date.now();
  return u;
}
function userHabits(uid) { return Object.values(db.habits).filter(h => h.members[uid]); }

// تنظيف سجل المستخدم قبل الحفظ
function cleanMe(me) {
  const out = { start: isDate(me.start) ? me.start : null, log: {}, ms: [], gw: {}, notice: clip(me.notice, 10), color: clip(me.color, 9) };
  if (me.log && typeof me.log === "object") {
    let n = 0;
    for (const [d, v] of Object.entries(me.log)) {
      if (!isDate(d) || n++ > 800) continue;
      out.log[d] = { done: !!(v && v.done) };
      if (v && v.done && Number.isInteger(v.feel) && v.feel >= 0 && v.feel <= 4) out.log[d].feel = v.feel;
      if (v && v.late) out.log[d].late = true;
    }
  }
  if (Array.isArray(me.ms)) out.ms = me.ms.filter(x => [21, 40, 90].includes(x));
  if (me.gw && typeof me.gw === "object") for (const [k, v] of Object.entries(me.gw)) if (/^\d{1,3}$/.test(k) && (v === "d" || v === "h")) out.gw[k] = v;
  return out;
}

function view(h, uid) {
  const members = Object.entries(h.members).map(([id, m]) => {
    const u = db.users[id] || {};
    return { uid: id, name: u.name || "", gender: u.gender || "m", owner: id === h.owner, joined: m.joined,
      start: m.start, log: m.log, ms: m.ms, gw: m.gw, color: m.color };
  });
  const invites = Object.entries(db.invites)
    .filter(([, i]) => i.habitId === h.id && i.from === uid && !i.used && i.exp > Date.now())
    .map(([id, i]) => ({ id, code: i.code, gender: i.gender, name: i.name, exp: i.exp }));
  return { id: h.id, name: h.name, type: h.type, triggers: h.triggers, alt: h.alt, owner: h.owner, created: h.created, members, invites };
}

// ---------- الحساب ----------
app.post("/api/register", (req, res) => {
  const name = clip(req.body.name, 24) || "صديق";
  const gender = req.body.gender === "f" ? "f" : "m";
  const uid = "u" + rid(6), token = rid(24);
  db.users[uid] = { uid, token, name, gender, created: Date.now(), seen: Date.now() };
  persist();
  res.json({ uid, token, name, gender });
});
app.post("/api/profile", (req, res) => {
  const u = auth(req, res); if (!u) return;
  if (req.body.name) u.name = clip(req.body.name, 24);
  if (req.body.gender) u.gender = req.body.gender === "f" ? "f" : "m";
  persist(); res.json({ ok: true, name: u.name, gender: u.gender });
});

// ---------- مزامنة ----------
// العميل بيبعت سجلّه هو بس بكل عادة (وبيانات العادة إذا هو صاحبها)، والسيرفر بيرجّع كل العادات مع الشركاء
app.post("/api/sync", (req, res) => {
  const u = auth(req, res); if (!u) return;
  const mine = Array.isArray(req.body.mine) ? req.body.mine.slice(0, 10) : [];
  for (const it of mine) {
    if (!it || typeof it.id !== "string" || it.id.length > 40) continue;
    let h = db.habits[it.id];
    if (!h) {
      if (!it.meta || !it.create) continue;
      if (userHabits(u.uid).length >= MAX_HABITS) continue;
      h = db.habits[it.id] = { id: it.id, owner: u.uid, created: Date.now(), name: "", type: "pos", triggers: [], alt: "", members: {} };
      h.members[u.uid] = { joined: Date.now() };
      db.stats.habits++;
    }
    if (!h.members[u.uid]) continue;
    if (it.meta && h.owner === u.uid) {
      h.name = clip(it.meta.name, 40) || h.name;
      h.type = it.meta.type === "neg" ? "neg" : "pos";
      h.triggers = Array.isArray(it.meta.triggers) ? it.meta.triggers.slice(0, 12).map(x => clip(x, 30)) : [];
      h.alt = clip(it.meta.alt, 60);
    }
    if (it.me) Object.assign(h.members[u.uid], cleanMe(it.me));
  }
  persist();
  res.json({ me: { uid: u.uid, name: u.name, gender: u.gender }, habits: userHabits(u.uid).map(h => view(h, u.uid)) });
});

// ترك العادة: إذا لحالي بتنحذف، وإذا في شركاء بتضل إلهن وبتنتقل الملكية
app.post("/api/leave", (req, res) => {
  const u = auth(req, res); if (!u) return;
  const h = db.habits[req.body.habitId];
  if (!h || !h.members[u.uid]) return res.json({ ok: true });
  delete h.members[u.uid];
  const rest = Object.keys(h.members);
  if (!rest.length) {
    delete db.habits[h.id];
    for (const [id, i] of Object.entries(db.invites)) if (i.habitId === h.id) delete db.invites[id];
  } else if (h.owner === u.uid) h.owner = rest[0];
  persist(); res.json({ ok: true });
});

// ---------- الدعوات ----------
app.post("/api/invite", (req, res) => {
  const u = auth(req, res); if (!u) return;
  const h = db.habits[req.body.habitId];
  if (!h || !h.members[u.uid]) return res.status(404).json({ error: "habit" });
  if (Object.keys(h.members).length >= MAX_MEMBERS) return res.status(400).json({ error: "full" });
  const id = rid(9), code = makeCode();
  db.invites[id] = { habitId: h.id, from: u.uid, code, gender: req.body.gender === "f" ? "f" : "m", name: clip(req.body.name, 24),
    created: Date.now(), exp: Date.now() + INVITE_DAYS * 864e5, tries: 0, used: false };
  persist(); res.json({ id, code });
});
app.post("/api/invite/cancel", (req, res) => {
  const u = auth(req, res); if (!u) return;
  const i = db.invites[req.body.id];
  if (i && i.from === u.uid) { delete db.invites[req.body.id]; persist(); }
  res.json({ ok: true });
});
// معلومات الدعوة بلا الرمز
app.get("/api/invite/:id", (req, res) => {
  const i = db.invites[req.params.id];
  if (!i) return res.status(404).json({ error: "none" });
  const h = db.habits[i.habitId], from = db.users[i.from] || {};
  if (!h) return res.status(404).json({ error: "none" });
  const state = i.used ? "used" : i.exp < Date.now() ? "expired" : i.tries >= MAX_TRIES ? "locked" : "ok";
  res.json({ state, gender: i.gender, name: i.name, fromName: from.name || "", fromGender: from.gender || "m",
    habit: { name: h.name, type: h.type }, members: Object.keys(h.members).map(id => (db.users[id] || {}).name || "") });
});
app.post("/api/join", (req, res) => {
  const u = auth(req, res); if (!u) return;
  const i = db.invites[req.body.inviteId];
  if (!i) return res.status(404).json({ error: "none" });
  const h = db.habits[i.habitId];
  if (!h) return res.status(404).json({ error: "none" });
  if (i.used) return res.status(400).json({ error: "used" });
  if (i.exp < Date.now()) return res.status(400).json({ error: "expired" });
  if (i.tries >= MAX_TRIES) return res.status(400).json({ error: "locked" });
  if (String(req.body.code || "").toUpperCase().replace(/\s/g, "") !== i.code) {
    i.tries++; persist();
    return res.status(400).json({ error: "code", left: MAX_TRIES - i.tries });
  }
  if (h.members[u.uid]) return res.status(400).json({ error: "already" });
  if (userHabits(u.uid).length >= MAX_HABITS) return res.status(400).json({ error: "limit" });
  if (Object.keys(h.members).length >= MAX_MEMBERS) return res.status(400).json({ error: "full" });
  const used = Object.values(h.members).map(m => m.color);
  h.members[u.uid] = { joined: Date.now(), start: isDate(req.body.today) ? req.body.today : null, log: {}, ms: [], gw: {},
    color: COLORS.find(c => !used.includes(c)) || COLORS[0] };
  i.used = true; i.usedBy = u.uid;
  db.stats.joins++;
  persist();
  res.json({ ok: true, habitId: h.id });
});

// ---------- إحصائيات ----------
app.post("/api/hit", (req, res) => {
  const d = new Date().toISOString().slice(0, 10);
  db.stats.visits++; db.stats.days[d] = (db.stats.days[d] || 0) + 1; persist(); res.json({ ok: true });
});
app.get("/stats", (req, res) => {
  const s = db.stats, users = Object.keys(db.users).length, habits = Object.values(db.habits);
  const shared = habits.filter(h => Object.keys(h.members).length > 1).length;
  const rows = Object.entries(s.days).sort().reverse().slice(0, 30).map(([d, n]) => `<tr><td>${d}</td><td>${n}</td></tr>`).join("");
  res.send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>إحصائيات قعدة 90</title>
  <body style="font-family:system-ui;background:#f4efe6;color:#1f1d1a;max-width:480px;margin:30px auto;padding:0 16px">
  <h2>إحصائيات قعدة 90</h2>
  <p>الزيارات: <b>${s.visits}</b> · المستخدمين: <b>${users}</b></p>
  <p>العادات الحالية: <b>${habits.length}</b> · منها بشراكة: <b>${shared}</b> · شراكات مقبولة: <b>${s.joins}</b></p>
  <p>عادات إيجابية: <b>${habits.filter(h => h.type === "pos").length}</b> · سلبية: <b>${habits.filter(h => h.type === "neg").length}</b></p>
  <table style="width:100%;border-collapse:collapse" border="1" cellpadding="6"><tr><th>اليوم</th><th>زيارات</th></tr>${rows}</table></body></html>`);
});

app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1h",
  setHeaders: (res, p) => { if (p.endsWith("sw.js") || p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); }
}));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log("قعدة 90 شغّالة على " + PORT));
