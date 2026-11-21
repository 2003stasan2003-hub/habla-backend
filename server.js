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
        pushState.vapidKeys = webpush.generateVIDKeys ? webpush.generateVIDKeys() : webpush.generateVAPIDKeys();
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
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it"
];

async function polishAndTranslate(rawText, targetLang, nativeLang = 'Ukrainian') {
    if (!GROQ_API_KEY || !rawText) {
        return { polishedOriginal: rawText, translatedText: rawText };
    }

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
                modelsToTry = [...new Set([...FALLBACK_MODELS.filter(m => activeGroqModels.includes(m)), ...activeGroqModels])];
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
                    response_format: { type: "json_object" },
                    messages: [
                        {
                            role: "system",
                            content: `You are an expert bilingual interpreter and native-speaker editor.
The speaker's native language is ${nativeLang}, and the listener's target language is ${targetLang || 'Ukrainian'}.
The input comes from voice-to-text transcription. The speaker may speak in ${nativeLang}, OR attempt to speak in ${targetLang} (or Spanish/German/English/French) with a heavy accent, grammar mistakes, phonetic typos, or mixed ${nativeLang} words.

Your task:
1. "polishedOriginal": Reconstruct and polish the speaker's input into completely natural, fluent, grammatically flawless speech in the primary language the speaker intended to speak (e.g., if they tried speaking broken Spanish/German/English, rewrite it so it sounds like a native speaker said it; if they spoke ${nativeLang}, fix any speech-to-text typos or misheard names like "Денізо" -> "Денисе" / "Denis").
2. "translatedText": Translate that intended meaning into completely natural, idiomatic ${targetLang || 'Ukrainian'} as a native speaker would say it in everyday conversation. If the speaker was already trying to speak ${targetLang}, make "translatedText" identical to "polishedOriginal".

Return ONLY valid JSON with exact keys:
{"polishedOriginal": "...", "translatedText": "..."}`
                        },
                        { role: "user", content: rawText }
                    ],
                    temperature: 0.2
                })
            });

            const data = await response.json();
            if (data.error) continue;

            const content = data.choices?.[0]?.message?.content?.trim();
            if (content) {
                const parsed = JSON.parse(content);
                if (parsed.translatedText) {
                    return {
                        polishedOriginal: (parsed.polishedOriginal || rawText).trim(),
                        translatedText: parsed.translatedText.trim()
                    };
                }
            }
        } catch (e) {}
    }

    return { polishedOriginal: rawText, translatedText: rawText };
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
        formData.append('temperature', '0');
        formData.append(
            'prompt',
            'Привіт, як справи? Hola, ¿cómo estás? Hallo, wie geht es dir? Hello, how are you? Bonjour, comment ça va?'
        );

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: formData
        });
        const data = await response.json();
        return data.text?.trim() || "Voice message";
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

    async function handleOutgoingMessage(data, rawInputText, socketEmitter) {
        const cleanRecipient = (data.recipient || '').toLowerCase().trim();
        const senderName = data.sender || 'Habla';
        const recipientSocketId = Object.keys(activeSockets).find(
            id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
        );

        const foundKey = Object.keys(userLanguages).find(k => k.toLowerCase() === cleanRecipient);
        const recipientLang = foundKey ? userLanguages[foundKey] : (data.targetLang || 'Ukrainian');

        const senderKey = Object.keys(userLanguages).find(k => k.toLowerCase() === senderName.toLowerCase().trim());
        const senderLang = senderKey ? userLanguages[senderKey] : (data.senderLang || 'Ukrainian');

        const { polishedOriginal, translatedText } = await polishAndTranslate(rawInputText, recipientLang, senderLang);

        const messagePayload = {
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            sender: senderName,
            senderLang: senderLang,
            recipient: data.recipient,
            text: translatedText,
            originalText: polishedOriginal,
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
        await handleOutgoingMessage(data, data.text, socket);
    });

    socket.on('voice-message', async (data) => {
        const transcribedText = await transcribeAudio(data.audio);
        await handleOutgoingMessage(data, transcribedText, socket);
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
