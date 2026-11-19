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

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';

if (publicVapidKey && privateVapidKey) {
    try {
        webpush.setVapidDetails('mailto:admin@habla.com', publicVapidKey, privateVapidKey);
    } catch (e) {
        console.warn('VAPID setup skipped:', e.message);
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
    "mixtral-8x7b-32768",
    "llama-guard-3-8b"
];

const LANG_CODE_MAP = {
    Ukrainian: 'uk',
    English: 'en',
    Spanish: 'es',
    German: 'de',
    French: 'fr'
};

function normalizeLangName(rawLang) {
    if (!rawLang) return 'Ukrainian';
    const clean = String(rawLang).trim();
    const lower = clean.toLowerCase();
    if (lower.startsWith('uk') || lower.includes('ukrain')) return 'Ukrainian';
    if (lower.startsWith('en') || lower.includes('engl')) return 'English';
    if (lower.startsWith('es') || lower.includes('span')) return 'Spanish';
    if (lower.startsWith('de') || lower.includes('germ')) return 'German';
    if (lower.startsWith('fr') || lower.includes('fren')) return 'French';
    return 'Ukrainian';
}

async function fallbackGoogleTranslate(text, targetLang) {
    const targetCode = LANG_CODE_MAP[normalizeLangName(targetLang)] || 'uk';
    try {
        if (typeof fetch !== 'function') return text;
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetCode)}&dt=t&q=${encodeURIComponent(text)}`;
        const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(4000)
            : undefined;
        const resp = await fetch(url, { signal });
        if (!resp.ok) return text;
        const data = await resp.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
            const translated = data[0].map(part => (Array.isArray(part) ? part[0] : '')).join('').trim();
            if (translated) return translated;
        }
        return text;
    } catch (e) {
        return text;
    }
}

async function translateText(text, targetLang) {
    if (!text || !text.trim()) return text;
    const cleanTargetLang = normalizeLangName(targetLang);

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

    return await fallbackGoogleTranslate(text, cleanTargetLang);
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
        formData.append('language', 'uk');

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
let userLanguages = {};
let userPushSubscriptions = {};
let userCustomizations = {};
let knownUsers = new Set();

function findSocketsByUsername(targetName) {
    const clean = (targetName || '').toLowerCase().trim();
    if (!clean) return [];
    return Object.entries(activeSockets)
        .filter(([, name]) => name && name.toLowerCase().trim() === clean)
        .map(([sockId]) => sockId);
}

function getRecipientLanguage(cleanRecipient, fallbackLang) {
    const foundKey = Object.keys(userLanguages).find(k => k.toLowerCase().trim() === cleanRecipient);
    if (foundKey && userLanguages[foundKey]) {
        return normalizeLangName(userLanguages[foundKey]);
    }
    return normalizeLangName(fallbackLang || 'Ukrainian');
}

function broadcastUsers() {
    const onlineSet = new Set(
        Object.values(activeSockets)
            .filter(Boolean)
            .map(name => name.trim().toLowerCase())
    );

    const allNames = new Set([
        ...Array.from(knownUsers),
        ...Object.values(activeSockets).filter(Boolean).map(n => n.trim()),
        ...Object.keys(userCustomizations)
    ]);

    const usersList = Array.from(allNames).map(name => ({
        name,
        isOnline: onlineSet.has(name.toLowerCase()),
        lang: getRecipientLanguage(name.toLowerCase(), 'Ukrainian')
    }));

    io.emit('update-users', usersList);
}

io.on('connection', (socket) => {
    let currentUsername = null;

    socket.on('join', ({ username, lang }) => {
        if (!username) return;
        currentUsername = username.trim();
        if (!currentUsername) return;

        knownUsers.add(currentUsername);
        activeSockets[socket.id] = currentUsername;
        if (lang) {
            userLanguages[currentUsername.toLowerCase()] = normalizeLangName(lang);
        } else if (!userLanguages[currentUsername.toLowerCase()]) {
            userLanguages[currentUsername.toLowerCase()] = 'Ukrainian';
        }

        socket.emit('sync-customizations', userCustomizations);
        broadcastUsers();
    });

    socket.on('update-language', (lang) => {
        if (currentUsername && lang) {
            userLanguages[currentUsername.toLowerCase()] = normalizeLangName(lang);
            broadcastUsers();
        }
    });

    socket.on('subscribe-push', ({ username, subscription }) => {
        if (username && subscription) {
            userPushSubscriptions[username.toLowerCase().trim()] = subscription;
        }
    });

    socket.on('update-customization', ({ targetName, color, avatar }) => {
        if (!targetName) return;
        const cleanTarget = targetName.trim();
        knownUsers.add(cleanTarget);
        userCustomizations[cleanTarget] = { color, avatar };
        io.emit('sync-customizations', userCustomizations);
        broadcastUsers();
    });

    socket.on('add-contact', (contactName) => {
        if (contactName && contactName.trim()) {
            knownUsers.add(contactName.trim());
        }
        socket.emit('sync-customizations', userCustomizations);
        broadcastUsers();
    });

    socket.on('text-message', async (data) => {
        const cleanRecipient = (data.recipient || '').toLowerCase().trim();
        const senderName = (data.sender || currentUsername || 'notebook').trim();
        const rawText = (data.text || '').trim();
        if (!cleanRecipient || !rawText) return;

        knownUsers.add(senderName);
        if (data.recipient && data.recipient.trim()) {
            knownUsers.add(data.recipient.trim());
        }
        if (data.senderLang) {
            userLanguages[senderName.toLowerCase()] = normalizeLangName(data.senderLang);
        }

        const recipientSocketIds = findSocketsByUsername(cleanRecipient);
        const recipientLang = getRecipientLanguage(cleanRecipient, data.targetLang || 'Ukrainian');
        const translatedText = await translateText(rawText, recipientLang);

        const messagePayload = {
            sender: senderName,
            recipient: data.recipient,
            text: translatedText || rawText,
            originalText: rawText
        };

        recipientSocketIds.forEach(sockId => {
            io.to(sockId).emit('incoming-message', messagePayload);
        });

        if (publicVapidKey && privateVapidKey && userPushSubscriptions[cleanRecipient]) {
            const pushPayload = JSON.stringify({
                title: `${senderName}`,
                body: translatedText || rawText,
                sound: '/mixkit-retro-game-notification-212.wav'
            });
            webpush.sendNotification(userPushSubscriptions[cleanRecipient], pushPayload).catch(() => {});
        }

        socket.emit('incoming-message', {
            ...messagePayload,
            isSent: true
        });
    });

    socket.on('voice-message', async (data) => {
        const cleanRecipient = (data.recipient || '').toLowerCase().trim();
        const senderName = (data.sender || currentUsername || 'notebook').trim();
        if (!cleanRecipient || !data.audio) return;

        knownUsers.add(senderName);
        if (data.recipient && data.recipient.trim()) {
            knownUsers.add(data.recipient.trim());
        }
        if (data.senderLang) {
            userLanguages[senderName.toLowerCase()] = normalizeLangName(data.senderLang);
        }

        const transcribedText = await transcribeAudio(data.audio);
        if (!transcribedText) return;

        const recipientSocketIds = findSocketsByUsername(cleanRecipient);
        const recipientLang = getRecipientLanguage(cleanRecipient, data.targetLang || 'Ukrainian');
        const translatedText = await translateText(transcribedText, recipientLang);

        const messagePayload = {
            sender: senderName,
            recipient: data.recipient,
            text: translatedText || transcribedText,
            originalText: transcribedText
        };

        recipientSocketIds.forEach(sockId => {
            io.to(sockId).emit('incoming-message', messagePayload);
        });

        if (publicVapidKey && privateVapidKey && userPushSubscriptions[cleanRecipient]) {
            const pushPayload = JSON.stringify({
                title: `${senderName}`,
                body: translatedText || transcribedText,
                sound: '/mixkit-retro-game-notification-212.wav'
            });
            webpush.sendNotification(userPushSubscriptions[cleanRecipient], pushPayload).catch(() => {});
        }

        socket.emit('incoming-message', {
            ...messagePayload,
            isSent: true
        });
    });

    socket.on('disconnect', () => {
        delete activeSockets[socket.id];
        broadcastUsers();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
