import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import webpush from 'web-push';
import fs from 'fs';
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

const PUSH_STATE_FILE = path.join(__dirname, 'push-state.json');
const OFFLINE_MSGS_FILE = path.join(__dirname, 'offline-messages.json');

let pushState = {
    vapidKeys: null,
    subscriptions: {}
};

if (fs.existsSync(PUSH_STATE_FILE)) {
    try {
        pushState = JSON.parse(fs.readFileSync(PUSH_STATE_FILE, 'utf8'));
    } catch (e) {}
}

if (!pushState.vapidKeys) {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        pushState.vapidKeys = {
            publicKey: process.env.VAPID_PUBLIC_KEY,
            privateKey: process.env.VAPID_PRIVATE_KEY
        };
    } else {
        pushState.vapidKeys = webpush.generateVAPIDKeys();
    }
    fs.writeFileSync(PUSH_STATE_FILE, JSON.stringify(pushState, null, 2));
}

webpush.setVapidDetails(
    'mailto:admin@habla.com',
    pushState.vapidKeys.publicKey,
    pushState.vapidKeys.privateKey
);

let offlineMessages = {};
if (fs.existsSync(OFFLINE_MSGS_FILE)) {
    try {
        offlineMessages = JSON.parse(fs.readFileSync(OFFLINE_MSGS_FILE, 'utf8'));
    } catch (e) {}
}

function saveOfflineMessages() {
    try {
        fs.writeFileSync(OFFLINE_MSGS_FILE, JSON.stringify(offlineMessages, null, 2));
    } catch (e) {}
}

function savePushState() {
    try {
        fs.writeFileSync(PUSH_STATE_FILE, JSON.stringify(pushState, null, 2));
    } catch (e) {}
}

app.get('/api/vapid-public-key', (req, res) => {
    res.json({ publicKey: pushState.vapidKeys.publicKey });
});

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

async function translateText(text, targetLang) {
    if (!GROQ_API_KEY || !text) return text;

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
                            content: `You are a strict translation machine. Your ONLY task is to translate the user's text directly into ${targetLang || 'Ukrainian'}. Do not converse, do not answer questions, do not add greetings, do not explain anything, and do not act as an AI assistant. Return ONLY the direct translation of the text.`
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

    return text;
}

async function transcribeAudio(base64Audio) {
    if (!GROQ_API_KEY || !base64Audio) return "Voice message";
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
        return data.text || "Voice message";
    } catch (e) {
        return "Voice message";
    }
}

let activeSockets = {};
let userLanguages = {};
let userCustomizations = {};

function deliverPendingMessages(socket, username) {
    const cleanUser = username.toLowerCase().trim();
    if (offlineMessages[cleanUser] && offlineMessages[cleanUser].length > 0) {
        socket.emit('sync-offline-messages', offlineMessages[cleanUser]);
        delete offlineMessages[cleanUser];
        saveOfflineMessages();
    }
}

io.on('connection', (socket) => {
    let currentUsername = null;

    socket.on('join', ({ username, lang }) => {
        if (!username) return;
        currentUsername = username.trim();
        activeSockets[socket.id] = currentUsername;
        if (lang) userLanguages[currentUsername.toLowerCase()] = lang;
        socket.emit('sync-customizations', userCustomizations);
        deliverPendingMessages(socket, currentUsername);
        broadcastUsers();
    });

    socket.on('request-offline-messages', (username) => {
        if (username) deliverPendingMessages(socket, username);
    });

    socket.on('update-language', (lang) => {
        if (currentUsername && lang) {
            userLanguages[currentUsername.toLowerCase()] = lang;
        }
    });

    socket.on('subscribe-push', ({ username, subscription }) => {
        if (username && subscription) {
            pushState.subscriptions[username.toLowerCase().trim()] = subscription;
            savePushState();
        }
    });

    socket.on('update-customization', ({ targetName, color, avatar }) => {
        if (!targetName) return;
        userCustomizations[targetName] = { color, avatar };
        io.emit('sync-customizations', userCustomizations);
    });

    socket.on('add-contact', () => {
        socket.emit('sync-customizations', userCustomizations);
    });

    async function handleOutgoingMessage(data, textToTranslate, originalText, socketEmitter) {
        const cleanRecipient = (data.recipient || '').toLowerCase().trim();
        const senderName = data.sender || 'Habla';
        const recipientSocketId = Object.keys(activeSockets).find(
            id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
        );

        const foundKey = Object.keys(userLanguages).find(k => k.toLowerCase() === cleanRecipient);
        const recipientLang = foundKey ? userLanguages[foundKey] : (data.targetLang || 'Ukrainian');

        const senderKey = Object.keys(userLanguages).find(k => k.toLowerCase() === senderName.toLowerCase().trim());
        const senderLang = senderKey ? userLanguages[senderKey] : (data.senderLang || 'Ukrainian');

        const translatedText = await translateText(textToTranslate, recipientLang);

        const messagePayload = {
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            sender: senderName,
            senderLang: senderLang,
            recipient: data.recipient,
            text: translatedText,
            originalText: originalText,
            timestamp: Date.now()
        };

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-message', messagePayload);
        } else {
            if (!offlineMessages[cleanRecipient]) {
                offlineMessages[cleanRecipient] = [];
            }
            offlineMessages[cleanRecipient].push(messagePayload);
            saveOfflineMessages();
        }

        if (pushState.subscriptions[cleanRecipient]) {
            const unreadTotal = (offlineMessages[cleanRecipient]?.length) || 1;
            const pushPayload = JSON.stringify({
                title: senderName,
                body: translatedText,
                tag: `habla-${senderName.toLowerCase()}`,
                unreadCount: unreadTotal,
                sound: '/mixkit-retro-game-notification-212.wav',
                url: '/'
            });
            webpush.sendNotification(pushState.subscriptions[cleanRecipient], pushPayload).catch(() => {});
        }

        socketEmitter.emit('incoming-message', {
            ...messagePayload,
            isSent: true
        });
    }

    socket.on('text-message', async (data) => {
        await handleOutgoingMessage(data, data.text, data.text, socket);
    });

    socket.on('voice-message', async (data) => {
        const transcribedText = await transcribeAudio(data.audio);
        await handleOutgoingMessage(data, transcribedText, transcribedText, socket);
    });

    socket.on('disconnect', () => {
        delete activeSockets[socket.id];
        broadcastUsers();
    });
});

function broadcastUsers() {
    const usersList = Object.values(activeSockets).map(name => ({ name, isOnline: true }));
    io.emit('update-users', usersList);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
