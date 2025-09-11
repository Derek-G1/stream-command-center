const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3000;

// IMPORTANT: Environment variables are used for all secrets
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors({
    origin: [FRONTEND_URL, 'https://stream-command-center.onrender.com']
}));
app.use(express.json());
app.use(session({
  secret: 'a-random-secret-key-for-sessions',
  resave: false,
  saveUninitialized: true
}));

// --- Database Initialization ---
const initDb = async () => {
    try {
        const client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id SERIAL PRIMARY KEY,
                viewers INTEGER NOT NULL DEFAULT 0,
                followers INTEGER NOT NULL DEFAULT 0,
                subscribers INTEGER NOT NULL DEFAULT 0
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS alerts (
                id SERIAL PRIMARY KEY,
                message TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS followers (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS subscribers (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat (
                id SERIAL PRIMARY KEY,
                platform TEXT NOT NULL,
                username TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        const result = await client.query('SELECT COUNT(*) FROM stats');
        if (parseInt(result.rows[0].count) === 0) {
            await client.query('INSERT INTO stats (viewers, followers, subscribers) VALUES (0, 0, 0)');
        }
        client.release();
        console.log('Database schema initialized successfully.');
    } catch (err) {
        console.error('Error initializing database:', err);
    }
};

initDb();

// --- API Endpoints ---

// Twitch OAuth flow
app.get('/api/auth/twitch', (req, res) => {
    const redirectUri = `https://stream-command-center.onrender.com/auth/twitch/callback`;
    const scopes = 'user:read:follows channel:read:subscriptions';
    const twitchAuthUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}`;
    res.redirect(twitchAuthUrl);
});

// A temporary route to handle the redirect from Twitch
app.get('/auth/twitch/callback', async (req, res) => {
    const redirectUri = `https://stream-command-center.onrender.com/auth/twitch/callback`;
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('No authorization code provided.');
    }

    try {
        const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
            }
        });

        const { access_token } = tokenResponse.data;
        
        // Get user ID from Twitch using the access token
        const userResponse = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${access_token}`
            }
        });
        const userId = userResponse.data.data[0].id;
        
        // Redirect back to the frontend with the access token and user ID
        res.redirect(`${FRONTEND_URL}/?access_token=${access_token}&twitch_user_id=${userId}`);

    } catch (error) {
        console.error('Error getting access token:', error.response ? error.response.data : error.message);
        res.status(500).send('Failed to authenticate with Twitch.');
    }
});

// Endpoint to get recent Twitch followers
app.get('/api/twitch/followers', async (req, res) => {
    const { access_token, user_id } = req.query;
    if (!access_token || !user_id) {
        return res.status(401).json({ error: 'Access token and user ID not provided.' });
    }
    try {
        const twitchResponse = await axios.get(`https://api.twitch.tv/helix/users/follows?first=10&to_id=${user_id}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${access_token}`
            }
        });
        const followers = twitchResponse.data.data.map(f => ({
            username: f.from_name,
            followed_at: f.followed_at
        }));
        res.json(followers);
    } catch (err) {
        console.error('Error fetching Twitch followers:', err.response ? err.response.data : err.message);
        res.status(500).json({ error: 'Failed to fetch Twitch followers' });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM stats ORDER BY id DESC LIMIT 1');
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/stats/increment', async (req, res) => {
    const { field } = req.body;
    try {
        await pool.query(`UPDATE stats SET ${field} = ${field} + 1`);
        res.sendStatus(200);
    } catch (err) {
        console.error('Error incrementing stat:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/api/alerts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 5');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching alerts:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/alerts', async (req, res) => {
    const { message } = req.body;
    try {
        await pool.query('INSERT INTO alerts (message) VALUES ($1)', [message]);
        res.sendStatus(200);
    } catch (err) {
        console.error('Error posting alert:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/api/followers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM followers ORDER BY timestamp DESC LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching followers:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/followers', async (req, res) => {
    const { username } = req.body;
    try {
        await pool.query('INSERT INTO followers (username) VALUES ($1)', [username]);
        res.sendStatus(200);
    } catch (err) {
        console.error('Error posting follower:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/api/subscribers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM subscribers ORDER BY timestamp DESC LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching subscribers:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/subscribers', async (req, res) => {
    const { username } = req.body;
    try {
        await pool.query('INSERT INTO subscribers (username) VALUES ($1)', [username]);
        res.sendStatus(200);
    } catch (err) {
        console.error('Error posting subscriber:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/api/chat/:platform', async (req, res) => {
    const { platform } = req.params;
    try {
        const result = await pool.query('SELECT * FROM chat WHERE platform = $1 ORDER BY timestamp DESC LIMIT 20', [platform]);
        res.json(result.rows);
    } catch (err) {
        console.error(`Error fetching chat for ${platform}:`, err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/chat/:platform', async (req, res) => {
    const { platform } = req.params;
    const { username, message } = req.body;
    try {
        await pool.query('INSERT INTO chat (platform, username, message) VALUES ($1, $2, $3)', [platform, username, message]);
        res.sendStatus(200);
    } catch (err) {
        console.error(`Error posting chat for ${platform}:`, err);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});