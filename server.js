const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./orbit.db', (err) => {
    if (err) console.error('Datenbank-Fehler:', err.message);
    else console.log('Verbunden mit der SQLite-Datenbank.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, datum TEXT, kategorie TEXT, beschreibung TEXT, status TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS downloads (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, beschreibung TEXT, version TEXT, link TEXT, icon TEXT)`);
    db.get("SELECT COUNT(*) as count FROM admins", [], (err, row) => {
        if (row && row.count === 0) {
            const hash = bcrypt.hashSync('orbit2026!', bcrypt.genSaltSync(10));
            db.run("INSERT INTO admins (username, password_hash) VALUES (?, ?)", ['admin', hash]);
        }
    });
});

app.get('/api/events', (req, res) => { db.all("SELECT * FROM events ORDER BY id DESC", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });
app.post('/api/login', (req, res) => { const { username, password } = req.body; db.get("SELECT * FROM admins WHERE username = ?", [username], (err, admin) => { if (!admin || !bcrypt.compareSync(password, admin.password_hash)) return res.status(401).json({ success: false, message: 'Falscher Username oder Passwort' }); res.json({ success: true }); }); });
app.post('/api/events', (req, res) => { const { datum, kategorie, beschreibung, status } = req.body; db.run("INSERT INTO events (datum, kategorie, beschreibung, status) VALUES (?, ?, ?, ?)", [datum, kategorie, beschreibung, status], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.delete('/api/events/:id', (req, res) => { db.run("DELETE FROM events WHERE id = ?", [req.params.id], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }); });
app.get('/api/downloads', (req, res) => { db.all("SELECT * FROM downloads ORDER BY id DESC", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });
app.post('/api/downloads', (req, res) => { const { name, beschreibung, version, link, icon } = req.body; db.run("INSERT INTO downloads (name, beschreibung, version, link, icon) VALUES (?, ?, ?, ?, ?)", [name, beschreibung, version || 'v1.0', link, icon || '🎮'], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.delete('/api/downloads/:id', (req, res) => { db.run("DELETE FROM downloads WHERE id = ?", [req.params.id], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }); });
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, () => console.log(`Orbit-Server läuft auf Port ${PORT}`));
