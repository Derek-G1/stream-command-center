const RENDER_API_URL = 'https://stream-command-center.onrender.com/api';

let currentPlatform = 'twitch';
let twitchAccessToken = null;

// --- Functions to fetch and render data from the server ---

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

const renderStats = async () => {
    const stats = await fetchData('stats');
    if (stats) {
        document.getElementById('viewers').textContent = stats.viewers;
        document.getElementById('followers').textContent = stats.followers;
        document.getElementById('subscribers').textContent = stats.subscribers;
    }
};

const renderAlerts = async () => {
    const alerts = await fetchData('alerts');
    const alertsContainer = document.getElementById('alerts-container');
    alertsContainer.innerHTML = '';
    alerts.forEach(alert => {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'bg-blue-600 text-white p-3 rounded-lg shadow-lg mb-2 animate-bounce-in';
        alertDiv.textContent = alert.message;
        alertsContainer.prepend(alertDiv);
    });
};

const renderFollowers = async () => {
    const followers = await fetchData('followers');
    const followersList = document.getElementById('followers-list');
    followersList.innerHTML = '';
    followers.forEach(follower => {
        const followerItem = document.createElement('div');
        followerItem.className = 'p-2 rounded-lg bg-gray-700 mb-1';
        followerItem.innerHTML = `<span class="text-emerald-400 font-semibold">${follower.username}</span> just followed!`;
        followersList.appendChild(followerItem);
    });
};

const renderSubscribers = async () => {
    const subscribers = await fetchData('subscribers');
    const subscribersList = document.getElementById('subscribers-list');
    subscribersList.innerHTML = '';
    subscribers.forEach(subscriber => {
        const subscriberItem = document.createElement('div');
        subscriberItem.className = 'p-2 rounded-lg bg-gray-700 mb-1';
        subscriberItem.innerHTML = `<span class="text-purple-400 font-semibold">${subscriber.username}</span> just subscribed!`;
        subscribersList.appendChild(subscriberItem);
    });
};

const renderChat = async (platform) => {
    const messages = await fetchData(`chat/${platform}`);
    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = '';
    messages.forEach(message => {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'p-2 rounded-lg mb-1';
        messageDiv.innerHTML = `<span class="font-bold text-emerald-400">${message.username}:</span> ${message.message}`;
        chatContainer.appendChild(messageDiv);
    });
    chatContainer.scrollTop = chatContainer.scrollHeight;
};

const switchChat = (platform) => {
    document.querySelectorAll('.chat-tab').forEach(btn => {
        btn.classList.remove('bg-gray-700', 'text-white');
        btn.classList.add('bg-gray-800', 'text-gray-400');
    });
    document.getElementById(`tab-${platform}`).classList.remove('bg-gray-800', 'text-gray-400');
    document.getElementById(`tab-${platform}`).classList.add('bg-gray-700', 'text-white');

    document.getElementById('twitch-chat-btn').classList.add('hidden');
    document.getElementById('youtube-chat-btn').classList.add('hidden');
    document.getElementById('kick-chat-btn').classList.add('hidden');

    document.getElementById(`${platform}-chat-btn`).classList.remove('hidden');
    currentPlatform = platform;
    renderChat(currentPlatform);
};

// --- Functions to send data to the server ---

const postData = async (endpoint, data) => {
    try {
        const url = `${RENDER_API_URL}/${endpoint}`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    } catch (error) {
        console.error(`Error posting to ${endpoint}:`, error);
    }
};

const handleNewFollower = () => {
    postData('followers', { username: `User${Math.floor(Math.random() * 1000)}` });
    postData('alerts', { message: 'A new user just followed!' });
    postData('stats/increment', { field: 'followers' });
};

const handleNewDonation = () => {
    postData('alerts', { message: '$10.00 donation received!' });
};

const handleNewSubscriber = () => {
    postData('subscribers', { username: `SubUser${Math.floor(Math.random() * 1000)}` });
    postData('alerts', { message: 'A new subscriber joined the team!' });
    postData('stats/increment', { field: 'subscribers' });
};

const handleNewRaid = () => {
    postData('alerts', { message: 'A raid is incoming!' });
};

const incrementStat = (field) => {
    postData('stats/increment', { field });
    postData('alerts', { message: `Manually incremented ${field} count.` });
};

const handleNewChatMessage = () => {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    if (!message) return;
    postData(`chat/${currentPlatform}`, { username: 'Streamer', message });
    chatInput.value = '';
};

// --- TTS and Alert Modal Logic (unchanged from previous version) ---

const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const pcmToWav = (pcmData, sampleRate) => {
    const numChannels = 1;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true);
    writeString(view, 8, 'WAVE');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.byteLength, true);

    const pcmView = new Uint8Array(pcmData);
    for (let i = 0; i < pcmData.byteLength; i++) {
        view.setUint8(44 + i, pcmView[i]);
    }

    return new Blob([view], { type: 'audio/wav' });
};

const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

const tts = async (text, voice) => {
    const payload = {
        contents: [{ parts: [{ text: text }] }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
        },
        model: "gemini-2.5-flash-preview-tts"
    };

    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API call failed with status: ${response.status}`);
        }

        const result = await response.json();
        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType;

        if (audioData && mimeType && mimeType.startsWith("audio/L16")) {
            const sampleRateMatch = mimeType.match(/rate=(\d+)/);
            if (!sampleRateMatch) {
                throw new Error("Sample rate not found in MIME type.");
            }
            const sampleRate = parseInt(sampleRateMatch[1], 10);
            const pcmData = base64ToArrayBuffer(audioData);
            const pcm16 = new Int16Array(pcmData);
            const wavBlob = pcmToWav(pcm16, sampleRate);
            const audioUrl = URL.createObjectURL(wavBlob);
            const audio = new Audio(audioUrl);
            audio.play();
        } else {
            console.error("Invalid audio data or MIME type:", mimeType);
        }
    } catch (error) {
        console.error("Error during TTS generation:", error);
    }
};

const handleTTSClick = () => {
    const text = document.getElementById('tts-input').value;
    if (text) {
        tts(text, 'Zephyr');
    }
};

const showCustomAlert = (message) => {
    const modal = document.getElementById('custom-alert-modal');
    document.getElementById('custom-alert-message').textContent = message;
    modal.classList.remove('hidden');
};

const hideCustomAlert = () => {
    const modal = document.getElementById('custom-alert-modal');
    modal.classList.add('hidden');
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
};

const addTwitchConnectButton = () => {
    const connectButton = document.createElement('a');
    connectButton.textContent = 'Connect to Twitch';
    connectButton.className = 'btn btn-purple';
    connectButton.href = `${RENDER_API_URL}/auth/twitch`;
    document.getElementById('twitch-connect-container').appendChild(connectButton);
};

document.addEventListener('DOMContentLoaded', () => {
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