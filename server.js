import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import webpush from 'web-push';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname)));

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BP_THGEIwmo7Npka3AqDRmOnT-zXf_V6wC5j_mdo9qrA4JWin71UsPryXS2h4HzrxNqX4m6IqfWHTPT_xfbLVw';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';

if (publicVapidKey && privateVapidKey) {
    try {
        webpush.setVapidDetails('mailto:admin@habla.com', publicVapidKey, privateVapidKey);
    } catch (e) {
        console.warn('VAPID config warning:', e.message);
    }
}

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const FALLBACK_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.3-70b-specdec",
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "gemma2-9b-it",
    "mixtral-8x7b-32768"
];

const LANG_CODE_MAP = {
    Ukrainian: 'uk',
    English: 'en',
    Spanish: 'es',
    German: 'de',
    French: 'fr'
};

function normalizeLang(lang) {
    if (!lang) return 'Ukrainian';
    const lower = String(lang).trim().toLowerCase();
    if (lower.startsWith('uk') || lower.includes('ukrain')) return 'Ukrainian';
    if (lower.startsWith('en') || lower.includes('engl')) return 'English';
    if (lower.startsWith('es') || lower.includes('span')) return 'Spanish';
    if (lower.startsWith('de') || lower.includes('germ')) return 'German';
    if (lower.startsWith('fr') || lower.includes('fren')) return 'French';
    return 'Ukrainian';
}

async function googleFallbackTranslate(text, targetLang) {
    const cleanTarget = normalizeLang(targetLang);
    const tl = LANG_CODE_MAP[cleanTarget] || 'uk';
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
        const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(4500) : undefined;
        const res = await fetch(url, { signal });
        if (!res.ok) return text;
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
            const out = data[0].map(item => (Array.isArray(item) ? item[0] : '')).join('').trim();
            if (out) return out;
        }
    } catch (e) {}
    return text;
}

async function translateText(text, targetLang) {
    if (!text || !text.trim()) return text;
    const cleanTargetLang = normalizeLang(targetLang);

    if (GROQ_API_KEY) {
        let modelsToTry = [...FALLBACK_MODELS];

        try {
            const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }
            });
            const modelsData = await modelsRes.json();
            if (modelsData && modelsData.data) {
                const activeGroqModels = modelsData.data
                    .map(m => m.id)
                    .filter(id => !id.includes('whisper') && !id.includes('embed') && !id.includes('guard'));
                if (activeGroqModels.length > 0) {
                    modelsToTry = [...new Set([...activeGroqModels, ...FALLBACK_MODELS])];
                }
            }
        } catch (e) {}

        for (const model of modelsToTry) {
            try {
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            {
                                role: "system",
                                content: `You are a strict translation machine. Your ONLY task is to translate the user's text directly into ${cleanTargetLang}. Do not converse, do not answer questions, do not add greetings, do not explain anything, and do not act as an AI assistant. Return ONLY the direct translation of the text.`
                            },
                            { role: "user", content: text }
                        ],
                        temperature: 0.1
                    })
                });
                
                const data = await response.json();
                if (data.error) continue;

                const translated = data.choices?.[0]?.message?.content?.trim();
                if (translated) return translated;
            } catch (e) {}
        }
    }

    return await googleFallbackTranslate(text, cleanTargetLang);
}

async function transcribeAudio(base64Audio) {
    if (!GROQ_API_KEY || !base64Audio) return "";
    try {
        const base64Data = base64Audio.split(';base64,').pop();
        const buffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([buffer], { type: 'audio/webm' });
        
        const formData = new FormData();
        formData.append('file', blob, 'audio.webm');
        formData.append('model', 'whisper-large-v3');

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: formData
        });
        const data = await response.json();
        return (data.text || "").trim();
    } catch (e) {
        return "";
    }
}

let activeSockets = {};
let userSockets = {};
let userDisplayNames = {};
let userLanguages = {}; 
let userPushSubscriptions = {};
let userCustomizations = {};
let userUnreadCounts = {};

function emitToAllUserDevices(userKey, eventName, payload) {
    const cleanKey = (userKey || '').toLowerCase().trim();
    const sockSet = userSockets[cleanKey];
    if (!sockSet) return false;
    let sent = false;
    sockSet.forEach(sockId => {
        if (activeSockets[sockId]) {
            io.to(sockId).emit(eventName, payload);
            sent = true;
        }
    });
    return sent;
}

async function sendPushNotification(userKey, payloadObj) {
    const cleanKey = (userKey || '').toLowerCase().trim();
    const subs = userPushSubscriptions[cleanKey];
    if (!subs || subs.length === 0 || !privateVapidKey) return;

    const payloadStr = JSON.stringify(payloadObj);
    const validSubs = [];
    for (const sub of subs) {
        try {
            await webpush.sendNotification(sub, payloadStr);
            validSubs.push(sub);
        } catch (err) {
            if (err && err.statusCode !== 410 && err.statusCode !== 404) {
                validSubs.push(sub);
            }
        }
    }
    userPushSubscriptions[cleanKey] = validSubs;
}

io.on('connection', (socket) => {
    let currentUsername = null;

    socket.on('join', ({ username, lang }) => {
        if (!username) return;
        currentUsername = username.trim();
        const cleanKey = currentUsername.toLowerCase();

        activeSockets[socket.id] = currentUsername;
        userDisplayNames[cleanKey] = currentUsername;

        if (!userSockets[cleanKey]) userSockets[cleanKey] = new Set();
        userSockets[cleanKey].add(socket.id);

        if (lang) {
            userLanguages[cleanKey] = normalizeLang(lang);
        } else if (!userLanguages[cleanKey]) {
            userLanguages[cleanKey] = 'Ukrainian';
        }

        if (typeof userUnreadCounts[cleanKey] !== 'number') {
            userUnreadCounts[cleanKey] = 0;
        }

        socket.emit('sync-customizations', userCustomizations);
        socket.emit('sync-unread-count', { count: userUnreadCounts[cleanKey] });
        broadcastUsers();
    });

    socket.on('update-language', (lang) => {
        if (currentUsername && lang) {
            userLanguages[currentUsername.toLowerCase()] = normalizeLang(lang);
        }
    });

    socket.on('subscribe-push', ({ username, subscription }) => {
        if (!username || !subscription || !subscription.endpoint) return;
        const cleanKey = username.toLowerCase().trim();
        if (!userPushSubscriptions[cleanKey]) userPushSubscriptions[cleanKey] = [];
        const exists = userPushSubscriptions[cleanKey].some(s => s.endpoint === subscription.endpoint);
        if (!exists) {
            userPushSubscriptions[cleanKey].push(subscription);
        }
    });

    socket.on('mark-read', ({ username } = {}) => {
        const targetName = (username || currentUsername || '').trim();
        if (!targetName) return;
        const cleanKey = targetName.toLowerCase();
        userUnreadCounts[cleanKey] = 0;
        emitToAllUserDevices(cleanKey, 'sync-unread-count', { count: 0 });
    });

    socket.on('update-customization', ({ targetName, color, avatar }) => {
        if (!targetName) return;
        userCustomizations[targetName] = { color, avatar };
        io.emit('sync-customizations', userCustomizations);
    });

    socket.on('add-contact', (contactName) => {
        socket.emit('sync-customizations', userCustomizations);
    });

    socket.on('text-message', async (data) => {
        const cleanRecipient = (data.recipient || '').toLowerCase().trim();
        const senderName = (data.sender || currentUsername || 'notebook').trim();
        const senderKey = senderName.toLowerCase();
        if (!cleanRecipient || !data.text || !data.text.trim()) return;

        if (data.senderLang) {
            userLanguages[senderKey] = normalizeLang(data.senderLang);
        }

        const recipientLang = userLanguages[cleanRecipient] || normalizeLang(data.targetLang || 'Ukrainian');
        const translatedText = await translateText(data.text.trim(), recipientLang);

        userUnreadCounts[cleanRecipient] = (userUnreadCounts[cleanRecipient] || 0) + 1;
        const currentBadgeCount = userUnreadCounts[cleanRecipient];

        const messagePayload = {
            sender: senderName,
            recipient: userDisplayNames[cleanRecipient] || data.recipient,
            text: translatedText,
            originalText: data.text.trim(),
            unreadCount: currentBadgeCount
        };

        emitToAllUserDevices(cleanRecipient, 'incoming-message', messagePayload);
        emitToAllUserDevices(cleanRecipient, 'sync-unread-count', { count: currentBadgeCount });

        await sendPushNotification(cleanRecipient, {
            title: `${senderName}`,
            body: translatedText,
            badgeCount: currentBadgeCount,
            sound: '/mixkit-retro-game-notification-212.wav'
        });

        emitToAllUserDevices(senderKey, 'incoming-message', {
            ...messagePayload,
            isSent: true
        });
    });

    socket.on('voice-message', async (data) => {
        const cleanRecipient = (data.recipient || '').toLowerCase().trim();
        const senderName = (data.sender || currentUsername || 'notebook').trim();
        const senderKey = senderName.toLowerCase();
        if (!cleanRecipient || !data.audio) return;

        if (data.senderLang) {
            userLanguages[senderKey] = normalizeLang(data.senderLang);
        }

        const transcribedText = await transcribeAudio(data.audio);
        if (!transcribedText) return;

        const recipientLang = userLanguages[cleanRecipient] || normalizeLang(data.targetLang || 'Ukrainian');
        const translatedText = await translateText(transcribedText, recipientLang);

        userUnreadCounts[cleanRecipient] = (userUnreadCounts[cleanRecipient] || 0) + 1;
        const currentBadgeCount = userUnreadCounts[cleanRecipient];

        const messagePayload = {
            sender: senderName,
            recipient: userDisplayNames[cleanRecipient] || data.recipient,
            text: translatedText,
            originalText: transcribedText,
            unreadCount: currentBadgeCount
        };

        emitToAllUserDevices(cleanRecipient, 'incoming-message', messagePayload);
        emitToAllUserDevices(cleanRecipient, 'sync-unread-count', { count: currentBadgeCount });

        await sendPushNotification(cleanRecipient, {
            title: `${senderName}`,
            body: translatedText,
            badgeCount: currentBadgeCount,
            sound: '/mixkit-retro-game-notification-212.wav'
        });

        emitToAllUserDevices(senderKey, 'incoming-message', {
            ...messagePayload,
            isSent: true
        });
    });

    socket.on('disconnect', () => {
        const user = activeSockets[socket.id];
        delete activeSockets[socket.id];
        if (user) {
            const cleanKey = user.toLowerCase();
            if (userSockets[cleanKey]) {
                userSockets[cleanKey].delete(socket.id);
                if (userSockets[cleanKey].size === 0) {
                    delete userSockets[cleanKey];
                }
            }
        }
        broadcastUsers();
    });
});

function broadcastUsers() {
    const allKnownKeys = new Set([
        ...Object.keys(userDisplayNames),
        ...Object.keys(userCustomizations).map(n => n.toLowerCase())
    ]);

    const usersList = Array.from(allKnownKeys).map(key => {
        const displayName = userDisplayNames[key] || Object.keys(userCustomizations).find(k => k.toLowerCase() === key) || key;
        const isOnline = Boolean(userSockets[key] && userSockets[key].size > 0);
        return { name: displayName, isOnline };
    });

    io.emit('update-users', usersList);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
