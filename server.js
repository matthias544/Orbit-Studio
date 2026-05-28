const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'orbit_ultra_secret_2026_!xK9#mP';

// Rate Limiter (manuell, kein extra Package nötig)
const loginAttempts = {};
function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, firstAttempt: now, blocked: false };
    const data = loginAttempts[ip];
    // Reset nach 15 Minuten
    if (now - data.firstAttempt > 15 * 60 * 1000) {
        loginAttempts[ip] = { count: 0, firstAttempt: now, blocked: false };
    }
    if (data.blocked) {
        const remaining = Math.ceil((15 * 60 * 1000 - (now - data.firstAttempt)) / 60000);
        return res.status(429).json({ success: false, message: `Zu viele Versuche. Bitte warte ${remaining} Minuten.` });
    }
    data.count++;
    if (data.count >= 5) {
        data.blocked = true;
        console.warn(`IP ${ip} wurde nach 5 fehlgeschlagenen Logins gesperrt.`);
        return res.status(429).json({ success: false, message: 'Zu viele Versuche. IP für 15 Minuten gesperrt.' });
    }
    next();
}

// JWT Middleware
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Kein Token.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Token ungültig oder abgelaufen.' });
    }
}

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

    db.get("SELECT COUNT(*) as count FROM admins", [], (err, row) => {
        if (row && row.count === 0) {
            const hash = bcrypt.hashSync('orbit2026!', bcrypt.genSaltSync(12));
            db.run("INSERT INTO admins (username, password_hash) VALUES (?, ?)", ['admin', hash]);
        }
    });

    db.get("SELECT COUNT(*) as count FROM spiele", [], (err, row) => {
        if (row && row.count === 0) {
            const defaultSpiele = [
                ['Among Us', 'Among Us.png'], ['Arma Reforger', 'Arma Reforger Icon.png'],
                ['Assetto Corsa', 'Assetto Corsa Icon.png'], ['CSGO 2', 'CSGO2.png'],
                ['DCS World', 'DCS .png'], ['Euro Truck Sim 2', 'ETS 2 Icon.png'],
                ['Hell Let Loose', 'Hell Let Loose.png'], ['Hearts of Iron IV', 'Hoi 4 Icon.png'],
                ['Le Mans Ultimate', 'Le Mans Icon.png'], ['Minecraft', 'Minecraft Icon.png'],
                ['MS Flight Sim', 'MS Flight Sim Icon.png'], ['Red Dead Red. 2', 'RDR 2.png'],
                ['Ready or Not', 'Ready or Not Icon.png'], ['Rust', 'Rust Icon.png'],
                ['Satisfactory', 'Satisfactory Icon.png'], ['Sniper Elite', 'Sniper Elite .png'],
                ['Supermarket Together', 'Supermarket Together .png'], ['The Finals', 'The Final Icon.png'],
                ['The Hunter: COTW', 'The Hunter Call of The Wild.png'], ['War Thunder', 'WarThunder Icon.png']
            ];
            const stmt = db.prepare("INSERT INTO spiele (name, bild) VALUES (?, ?)");
            defaultSpiele.forEach(s => stmt.run(s[0], s[1]));
            stmt.finalize();
        }
    });
});

// ===== PUBLIC ROUTES =====
app.get('/api/events', (req, res) => { db.all("SELECT * FROM events ORDER BY id DESC", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });
app.get('/api/downloads', (req, res) => { db.all("SELECT * FROM downloads ORDER BY id DESC", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });
app.get('/api/spiele', (req, res) => { db.all("SELECT * FROM spiele ORDER BY name ASC", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json(rows); }); });

// ===== LOGIN (mit Rate Limiter) =====
app.post('/api/login', rateLimiter, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Fehlende Felder.' });
    db.get("SELECT * FROM admins WHERE username = ?", [username], (err, admin) => {
        if (err) return res.status(500).json({ success: false, message: 'Serverfehler.' });
        if (!admin) {
            return res.status(401).json({ success: false, message: 'Falscher Username oder Passwort.' });
        }
        const valid = bcrypt.compareSync(password, admin.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, message: 'Falscher Username oder Passwort.' });
        }
        // IP-Sperrzähler zurücksetzen bei Erfolg
        const ip = req.ip || req.connection.remoteAddress;
        if (loginAttempts[ip]) loginAttempts[ip] = { count: 0, firstAttempt: Date.now(), blocked: false };
        const token = jwt.sign({ username: admin.username, id: admin.id }, JWT_SECRET, { expiresIn: '4h' });
        res.json({ success: true, token });
    });
});

// ===== PROTECTED ADMIN ROUTES (JWT erforderlich) =====
app.post('/api/events', verifyToken, (req, res) => { const { datum, kategorie, beschreibung, status } = req.body; db.run("INSERT INTO events (datum, kategorie, beschreibung, status) VALUES (?, ?, ?, ?)", [datum, kategorie, beschreibung, status], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.delete('/api/events/:id', verifyToken, (req, res) => { db.run("DELETE FROM events WHERE id = ?", [req.params.id], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }); });
app.post('/api/downloads', verifyToken, (req, res) => { const { name, beschreibung, version, link, icon } = req.body; db.run("INSERT INTO downloads (name, beschreibung, version, link, icon) VALUES (?, ?, ?, ?, ?)", [name, beschreibung, version || 'v1.0', link, icon || '🎮'], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.delete('/api/downloads/:id', verifyToken, (req, res) => { db.run("DELETE FROM downloads WHERE id = ?", [req.params.id], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }); });
app.post('/api/spiele', verifyToken, (req, res) => { const { name, bild } = req.body; db.run("INSERT INTO spiele (name, bild) VALUES (?, ?)", [name, bild], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); }); });
app.delete('/api/spiele/:id', verifyToken, (req, res) => { db.run("DELETE FROM spiele WHERE id = ?", [req.params.id], function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true }); }); });

// Coaching (public – Nutzer schicken Anfragen)
app.post('/api/coaching', (req, res) => {
    const { nutzername, email, spiel, nachricht } = req.body;
    if (!nutzername || !email || !spiel || !nachricht) return res.status(400).json({ success: false, message: 'Alle Felder sind Pflicht.' });
    const emailTo = process.env.EMAIL_TO || 'crxy-production@proton.me';
    const apiKey = process.env.BREVO_API_KEY;
    const payload = JSON.stringify({
        sender: { name: 'Orbit Coaching', email: 'matthiassonntag10@gmail.com' },
        to: [{ email: emailTo, name: 'Orbit Team' }],
        replyTo: { email: email, name: nutzername },
        subject: `🎮 Neue Coaching-Anfrage: ${spiel}`,
        htmlContent: `<h2 style="color:#00c8ff;">Neue Coaching-Anfrage</h2><table><tr><td><b>Nutzername:</b></td><td>${nutzername}</td></tr><tr><td><b>E-Mail:</b></td><td>${email}</td></tr><tr><td><b>Spiel:</b></td><td>${spiel}</td></tr><tr><td><b>Nachricht:</b></td><td>${nachricht}</td></tr></table>`
    });
    const options = { hostname: 'api.brevo.com', path: '/v3/smtp/email', method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': apiKey, 'Content-Length': Buffer.byteLength(payload) } };
    const request = https.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => { if (response.statusCode >= 200 && response.statusCode < 300) { res.json({ success: true }); } else { res.status(500).json({ success: false, message: 'E-Mail Fehler.' }); } });
    });
    request.on('error', () => res.status(500).json({ success: false, message: 'Verbindungsfehler.' }));
    request.write(payload);
    request.end();
});

// SPA Fallback
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, () => console.log(`Orbit-Server läuft auf Port ${PORT}`));
