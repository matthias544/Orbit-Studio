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
    db.run(`CREATE TABLE IF NOT EXISTS spiele (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, bild TEXT)`);

    // Standard-Spiele eintragen falls DB leer
    db.get("SELECT COUNT(*) as count FROM spiele", [], (err, row) => {
        if (row && row.count === 0) {
            const defaultSpiele = [
                ['Among Us', 'Among Us.png'],
                ['Arma Reforger', 'Arma Reforger Icon.png'],
                ['Assetto Corsa', 'Assetto Corsa Icon.png'],
                ['CSGO 2', 'CSGO2.png'],
                ['DCS World', 'DCS .png'],
                ['Euro Truck Sim 2', 'ETS 2 Icon.png'],
                ['Hell Let Loose', 'Hell Let Loose.png'],
                ['Hearts of Iron IV', 'Hoi 4 Icon.png'],
                ['Le Mans Ultimate', 'Le Mans Icon.png'],
                ['Minecraft', 'Minecraft Icon.png'],
                ['MS Flight Sim', 'MS Flight Sim Icon.png'],
                ['Red Dead Red. 2', 'RDR 2.png'],
                ['Ready or Not', 'Ready or Not Icon.png'],
                ['Rust', 'Rust Icon.png'],
                ['Satisfactory', 'Satisfactory Icon.png'],
                ['Sniper Elite', 'Sniper Elite .png'],
                ['Supermarket Together', 'Supermarket Together .png'],
                ['The Finals', 'The Final Icon.png'],
                ['The Hunter: COTW', 'The Hunter Call of The Wild.png'],
                ['War Thunder', 'WarThunder Icon.png']
            ];
            const stmt = db.prepare("INSERT INTO spiele (name, bild) VALUES (?, ?)");
            defaultSpiele.forEach(s => stmt.run(s[0], s[1]));
            stmt.finalize();
            console.log('Standard-Spiele eingetragen!');
        }
    });

    db.get("SELECT COUNT(*) as count FROM admins", [], (err, row) => {
        if (row && row.count === 0) {
            const hash = bcrypt.hashSync('orbit2026!', bcrypt.genSaltSync(10));
            db.run("INSERT INTO admins (username, password_hash) VALUES (?, ?)", ['admin', hash]);
        }
    });
});

// Events
app.get('/api/events', (req, res) => { db.all("SELECT * FROM events ORDER BY id DESC", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });
app.post('/api/events', (req, res) => { const { datum, kategorie, beschreibung, status } = req.body; db.run("INSERT INTO events (datum, kategorie, beschreibung, status) VALUES (?, ?, ?, ?)", [datum, kategorie, beschreibung, status], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.delete('/api/events/:id', (req, res) => { db.run("DELETE FROM events WHERE id = ?", [req.params.id], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }); });

// Login
app.post('/api/login', (req, res) => { const { username, password } = req.body; db.get("SELECT * FROM admins WHERE username = ?", [username], (err, admin) => { if (!admin || !bcrypt.compareSync(password, admin.password_hash)) return res.status(401).json({ success: false, message: 'Falscher Username oder Passwort' }); res.json({ success: true }); }); });

// Downloads
app.get('/api/downloads', (req, res) => { db.all("SELECT * FROM downloads ORDER BY id DESC", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });
app.post('/api/downloads', (req, res) => { const { name, beschreibung, version, link, icon } = req.body; db.run("INSERT INTO downloads (name, beschreibung, version, link, icon) VALUES (?, ?, ?, ?, ?)", [name, beschreibung, version || 'v1.0', link, icon || '🎮'], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.delete('/api/downloads/:id', (req, res) => { db.run("DELETE FROM downloads WHERE id = ?", [req.params.id], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }); });

// Spiele
app.get('/api/spiele', (req, res) => { db.all("SELECT * FROM spiele ORDER BY name ASC", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });
app.post('/api/spiele', (req, res) => { const { name, bild } = req.body; db.run("INSERT INTO spiele (name, bild) VALUES (?, ?)", [name, bild], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.delete('/api/spiele/:id', (req, res) => { db.run("DELETE FROM spiele WHERE id = ?", [req.params.id], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }); });

// SPA Fallback
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, () => console.log(`Orbit-Server läuft auf Port ${PORT}`));
