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

app.use(cors());
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
        req.session.twitchAccessToken = access_token;

        res.redirect(`${FRONTEND_URL}/`);
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
```eof
```javascript:Stream Command Center Script:script.js
const RENDER_API_URL = 'https://stream-command-center.onrender.com';
let twitchAccessToken = null;

// This function runs when the page loads to check for a token
const checkAccessToken = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const accessTokenParam = urlParams.get('access_token');
    if (accessTokenParam) {
        twitchAccessToken = accessTokenParam;
        console.log("Twitch access token received:", twitchAccessToken);
        // You would typically save this to local storage for persistence
        window.history.replaceState({}, document.title, window.location.pathname);
    }
};

const fetchData = async (endpoint, options = {}) => {
    try {
        const url = `${RENDER_API_URL}/${endpoint}`;
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching from ${endpoint}:`, error);
        return [];
    }
};

const fetchTwitchFollowers = async () => {
    if (!twitchAccessToken) {
        console.error("Twitch access token not available.");
        return;
    }
    const endpoint = `twitch/followers?access_token=${twitchAccessToken}`;
    const followers = await fetchData(endpoint);
    console.log("Fetched Twitch followers:", followers);
};

const renderStats = async () => {
    // ... same as before
};
const renderAlerts = async () => {
    // ... same as before
};
const renderFollowers = async () => {
    // ... same as before
};
const renderSubscribers = async () => {
    // ... same as before
};
const renderChat = async (platform) => {
    // ... same as before
};
const switchChat = (platform) => {
    // ... same as before
};

const postData = async (endpoint, data) => {
    // ... same as before
};
const handleNewFollower = () => {
    // ... same as before
};
const handleNewDonation = () => {
    // ... same as before
};
const handleNewSubscriber = () => {
    // ... same as before
};
const handleNewRaid = () => {
    // ... same as before
};
const incrementStat = (field) => {
    // ... same as before
};
const handleNewChatMessage = () => {
    // ... same as before
};
const handleTTSClick = () => {
    // ... same as before
};
const showCustomAlert = (message) => {
    // ... same as before
};
const hideCustomAlert = () => {
    // ... same as before
};

const setupEventListeners = () => {
    document.getElementById('hide-alert-btn').addEventListener('click', hideCustomAlert);
    document.getElementById('new-follower-btn').addEventListener('click', handleNewFollower);
    document.getElementById('new-subscriber-btn').addEventListener('click', handleNewSubscriber);
    document.getElementById('new-donation-btn').addEventListener('click', handleNewDonation);
    document.getElementById('new-raid-btn').addEventListener('click', handleNewRaid);
    document.getElementById('add-viewer-btn').addEventListener('click', () => incrementStat('viewers'));
    document.getElementById('add-follower-btn').addEventListener('click', () => incrementStat('followers'));
    document.getElementById('add-subscriber-btn').addEventListener('click', () => incrementStat('subscribers'));
    document.getElementById('tts-button').addEventListener('click', handleTTSClick);
    document.getElementById('twitch-chat-btn').addEventListener('click', () => handleNewChatMessage());
    document.getElementById('youtube-chat-btn').addEventListener('click', () => handleNewChatMessage());
    document.getElementById('kick-chat-btn').addEventListener('click', () => handleNewChatMessage());
    document.getElementById('tab-twitch').addEventListener('click', () => switchChat('twitch'));
    document.getElementById('tab-youtube').addEventListener('click', () => switchChat('youtube'));
    document.getElementById('tab-kick').addEventListener('click', () => switchChat('kick'));
    document.getElementById('twitch-followers-btn').addEventListener('click', fetchTwitchFollowers);
};

const addTwitchConnectButton = () => {
    const connectButton = document.createElement('a');
    connectButton.textContent = 'Connect to Twitch';
    connectButton.className = 'btn btn-purple';
    connectButton.href = `${RENDER_API_URL}/api/auth/twitch`;
    document.getElementById('twitch-connect-container').appendChild(connectButton);
};

document.addEventListener('DOMContentLoaded', () => {
    checkAccessToken();
    setupEventListeners();
    addTwitchConnectButton();
    switchChat('twitch');
    
    // Initial fetch and continuous updates
    renderStats();
    renderAlerts();
    renderFollowers();
    renderSubscribers();
    
    setInterval(renderStats, 5000);
    setInterval(renderAlerts, 5000);
    setInterval(renderFollowers, 5000);
    setInterval(renderSubscribers, 5000);
    setInterval(() => renderChat(currentPlatform), 2000);
});
