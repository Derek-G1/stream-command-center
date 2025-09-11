const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Connect to PostgreSQL using the DATABASE_URL environment variable provided by Render.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// A function to initialize the database tables if they don't exist.
const initializeDatabase = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id SERIAL PRIMARY KEY,
                viewers INTEGER DEFAULT 0,
                followers INTEGER DEFAULT 0,
                subscribers INTEGER DEFAULT 0
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS alerts (
                id SERIAL PRIMARY KEY,
                message TEXT NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS followers (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS subscribers (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat (
                id SERIAL PRIMARY KEY,
                platform TEXT NOT NULL,
                username TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const res = await pool.query("SELECT count(*) AS count FROM stats");
        if (res.rows[0].count === '0') {
            await pool.query("INSERT INTO stats (viewers, followers, subscribers) VALUES (0, 0, 0)");
        }
    } catch (err) {
        console.error('Error initializing database:', err.message);
    }
};

initializeDatabase();

// --- API Endpoints ---

app.get('/api/stats', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM stats WHERE id = 1");
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stats/increment', async (req, res) => {
    const { field } = req.body;
    if (!['viewers', 'followers', 'subscribers'].includes(field)) {
        return res.status(400).json({ error: 'Invalid field' });
    }
    try {
        await pool.query(`UPDATE stats SET ${field} = ${field} + 1 WHERE id = 1`);
        res.json({ message: 'Stat incremented successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/alerts', async (req, res) => {
    const { message } = req.body;
    try {
        const result = await pool.query("INSERT INTO alerts (message) VALUES ($1) RETURNING id, message", [message]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/alerts', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 10");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/followers', async (req, res) => {
        const { username } = req.body;
    try {
        const result = await pool.query("INSERT INTO followers (username) VALUES ($1) RETURNING id, username", [username]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/followers', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM followers ORDER BY timestamp DESC LIMIT 10");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/subscribers', async (req, res) => {
    const { username } = req.body;
    try {
        const result = await pool.query("INSERT INTO subscribers (username) VALUES ($1) RETURNING id, username", [username]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/subscribers', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM subscribers ORDER BY timestamp DESC LIMIT 10");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/chat/:platform', async (req, res) => {
    const { platform } = req.params;
    const { username, message } = req.body;
    try {
        const result = await pool.query("INSERT INTO chat (platform, username, message) VALUES ($1, $2, $3) RETURNING id, username, message", [platform, username, message]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/chat/:platform', async (req, res) => {
    const { platform } = req.params;
    try {
        const result = await pool.query("SELECT * FROM chat WHERE platform = $1 ORDER BY timestamp DESC LIMIT 50", [platform]);
        res.json(result.rows.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve the static frontend files
app.use(express.static('.'));

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});