const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Datenbank initialisieren (erstellt eine Datei namens orbit.db)
const db = new sqlite3.Database('./orbit.db', (err) => {
    if (err) console.error('Datenbank-Fehler:', err.message);
    else console.log('Verbunden mit der SQLite-Datenbank.');
});

// Tabellen erstellen falls nicht vorhanden
db.serialize(() => {
    // Admin-Tabelle
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT
    )`);

    // Event-Tabelle
    db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        datum TEXT,
        kategorie TEXT,
        beschreibung TEXT,
        status TEXT
    )`);

    // Standard-Admin anlegen falls Tabelle leer ist
    db.get("SELECT COUNT(*) as count FROM admins", [], (err, row) => {
        if (row && row.count === 0) {
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync('orbit2026!', salt); // Euer Start-Passwort!
            db.run("INSERT INTO admins (username, password_hash) VALUES (?, ?)", ['admin', hash]);
            console.log('Standard-Admin-Konto erstellt! User: admin | PW: orbit2026!');
        }
    });
});

// ===== API ENDPUNKTE =====

// 1. Alle Events abrufen
app.get('/api/events', (req, require) => {
    db.all("SELECT * FROM events ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. Admin Login prüfen
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM admins WHERE username = ?", [username], (err, admin) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!admin) return res.status(401).json({ success: false, message: 'Falscher Username oder Passwort' });

        const passwordIsValid = bcrypt.compareSync(password, admin.password_hash);
        if (!passwordIsValid) return res.status(401).json({ success: false, message: 'Falscher Username oder Passwort' });

        // In einer Produktionsumgebung würde man hier ein JWT-Token senden.
        // Für eure unkomplizierte Studio-Verwaltung reicht uns ein simpler Session-Status-Erfolg im Client.
        res.json({ success: true, message: 'Login erfolgreich!' });
    });
});

// 3. Neues Event erstellen (geschützt/erwartet Admin-Aktion)
app.post('/api/events', (req, res) => {
    const { datum, kategorie, beschreibung, status } = req.body;
    db.run("INSERT INTO events (datum, kategorie, beschreibung, status) VALUES (?, ?, ?, ?)",
           [datum, kategorie, beschreibung, status],
           function(err) {
               if (err) return res.status(500).json({ error: err.message });
               res.json({ success: true, id: this.lastID });
           }
    );
});

// 4. Event löschen
app.delete('/api/events/:id', (req, res) => {
    const id = req.params.id;
    db.run("DELETE FROM events WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Server starten
app.listen(PORT, () => {
    console.log(`Orbit-Server läuft auf http://localhost:${PORT}`);
});
