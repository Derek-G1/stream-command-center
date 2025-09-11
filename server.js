const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Twitch credentials from environment variables
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'YOUR_CLIENT_ID';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Function to initialize the database tables
const initializeDb = async () => {
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS stats (
        viewers INT DEFAULT 0,
        followers INT DEFAULT 0,
        subscribers INT DEFAULT 0
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        message TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS followers (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_twitch (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255),
        message TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_youtube (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255),
        message TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_kick (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255),
        message TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure there is at least one row in the stats table
    const result = await client.query('SELECT COUNT(*) FROM stats;');
    if (result.rows[0].count === '0') {
      await client.query('INSERT INTO stats (viewers, followers, subscribers) VALUES (0, 0, 0);');
    }
    client.release();
    console.log("Database tables initialized successfully.");
  } catch (err) {
    console.error("Error initializing database:", err);
  }
};

initializeDb();

// Twitch authentication route
app.get('/auth/twitch', (req, res) => {
  const TWITCH_REDIRECT_URI = 'https://stream-command-center.onrender.com/auth/twitch/callback';
  const TWITCH_AUTH_URL = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=code&scope=channel%3Aread%3Afollowers`;
  res.redirect(TWITCH_AUTH_URL);
});

// Twitch auth callback route
app.get('/auth/twitch/callback', async (req, res) => {
  const TWITCH_REDIRECT_URI = 'https://stream-command-center.onrender.com/auth/twitch/callback';
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
        redirect_uri: TWITCH_REDIRECT_URI,
      }
    });

    const { access_token } = tokenResponse.data;

    // Store the access token in the database or an in-memory store
    // For simplicity, we'll send it back to the client
    res.redirect(`/success?access_token=${access_token}`);

  } catch (error) {
    console.error('Error getting access token:', error.response ? error.response.data : error.message);
    res.status(500).send('Failed to authenticate with Twitch.');
  }
});

// Twitch API routes
app.get('/api/twitch/followers', async (req, res) => {
  const { access_token } = req.query;
  if (!access_token) {
    return res.status(401).json({ error: 'Access token not provided.' });
  }

  try {
    const usersResponse = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${access_token}`
      }
    });
    const streamerId = usersResponse.data.data[0].id;
    
    const followersResponse = await axios.get(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${streamerId}`, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${access_token}`
      }
    });

    res.json(followersResponse.data.data.map(f => ({ username: f.user_name })));

  } catch (error) {
    console.error('Error fetching Twitch followers:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to fetch Twitch followers.' });
  }
});

// --- API Routes for Database Interaction ---

// Get all stats
app.get('/api/stats', async (req, res) => {
  const result = await pool.query('SELECT * FROM stats LIMIT 1;');
  res.json(result.rows[0]);
});

// Get all alerts, ordered by most recent
app.get('/api/alerts', async (req, res) => {
  const result = await pool.query('SELECT message FROM alerts ORDER BY timestamp DESC LIMIT 10;');
  res.json(result.rows);
});

// Get all followers, ordered by most recent
app.get('/api/followers', async (req, res) => {
  const result = await pool.query('SELECT username FROM followers ORDER BY timestamp DESC LIMIT 10;');
  res.json(result.rows);
});

// Get all subscribers, ordered by most recent
app.get('/api/subscribers', async (req, res) => {
  const result = await pool.query('SELECT username FROM subscribers ORDER BY timestamp DESC LIMIT 10;');
  res.json(result.rows);
});

// Get all chat messages for a platform
app.get('/api/chat/:platform', async (req, res) => {
  const { platform } = req.params;
  const tableName = `chat_${platform}`;
  if (!['twitch', 'youtube', 'kick'].includes(platform)) {
    return res.status(400).send('Invalid platform.');
  }
  const result = await pool.query(`SELECT username, message FROM ${tableName} ORDER BY timestamp DESC LIMIT 50;`);
  res.json(result.rows.reverse());
});

// --- API Routes to POST Data (Simulate Events) ---

// Post a new alert
app.post('/api/alerts', async (req, res) => {
  const { message } = req.body;
  await pool.query('INSERT INTO alerts (message) VALUES ($1);', [message]);
  res.status(201).send('Alert added.');
});

// Post a new follower
app.post('/api/followers', async (req, res) => {
  const { username } = req.body;
  await pool.query('INSERT INTO followers (username) VALUES ($1);', [username]);
  res.status(201).send('Follower added.');
});

// Post a new subscriber
app.post('/api/subscribers', async (req, res) => {
  const { username } = req.body;
  await pool.query('INSERT INTO subscribers (username) VALUES ($1);', [username]);
  res.status(201).send('Subscriber added.');
});

// Increment a stat
app.post('/api/stats/increment', async (req, res) => {
  const { field } = req.body;
  if (!['viewers', 'followers', 'subscribers'].includes(field)) {
    return res.status(400).send('Invalid stat field.');
  }
  await pool.query(`UPDATE stats SET ${field} = ${field} + 1;`);
  res.status(200).send('Stat incremented.');
});

// Post a new chat message
app.post('/api/chat/:platform', async (req, res) => {
  const { platform } = req.params;
  const { username, message } = req.body;
  const tableName = `chat_${platform}`;
  if (!['twitch', 'youtube', 'kick'].includes(platform)) {
    return res.status(400).send('Invalid platform.');
  }
  await pool.query(`INSERT INTO ${tableName} (username, message) VALUES ($1, $2);`, [username, message]);
  res.status(201).send('Chat message added.');
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});