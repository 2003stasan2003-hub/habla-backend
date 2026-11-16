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

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'YOUR_PUBLIC_VAPID_KEY';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || 'YOUR_PRIVATE_VAPID_KEY';

if (publicVapidKey !== 'YOUR_PUBLIC_VAPID_KEY') {
    webpush.setVapidDetails('mailto:admin@habla.com', publicVapidKey, privateVapidKey);
}

// Groq API конфігурація
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

async function translateText(text, targetLang) {
    if (!GROQ_API_KEY || !text) return text;
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: `You are a professional translator. Translate the following text accurately into ${targetLang || 'Ukrainian'}. Return ONLY the translated text without quotes or explanations.`
                    },
                    { role: "user", content: text }
                ],
                temperature: 0.3
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || text;
    } catch (e) {
        console.error("Translation error:", e);
        return text;
    }
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
        console.error("Transcription error:", e);
        return "Voice message";
    }
}

let activeSockets = {};
let userLanguages = {}; 
let userPushSubscriptions = {};
let userCustomizations = {};

io.on('connection', (socket) => {
    let currentUsername = null;

    socket.on('join', ({ username, lang }) => {
        if (!username) return;
        currentUsername = username.trim();
        activeSockets[socket.id] = currentUsername;
        if (lang) userLanguages[currentUsername.toLowerCase()] = lang;
        
        socket.emit('sync-customizations', userCustomizations);
        broadcastUsers();
    });

    socket.on('update-language', (lang) => {
        if (currentUsername && lang) {
            userLanguages[currentUsername.toLowerCase()] = lang;
        }
    });

    socket.on('subscribe-push', ({ username, subscription }) => {
        if (username) {
            userPushSubscriptions[username.toLowerCase().trim()] = subscription;
        }
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
        const recipientSocketId = Object.keys(activeSockets).find(
            id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
        );

        // Виправляємо пошук мови отримувача без урахування регістру літер
        const foundKey = Object.keys(userLanguages).find(k => k.toLowerCase() === cleanRecipient);
        const recipientLang = foundKey ? userLanguages[foundKey] : (data.targetLang || 'Ukrainian');
        
        const translatedText = await translateText(data.text, recipientLang);

        const messagePayload = {
            sender: data.sender,
            recipient: data.recipient,
            text: translatedText,
            originalText: data.text
        };

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-message', messagePayload);
        } else if (userPushSubscriptions[cleanRecipient]) {
            const pushPayload = JSON.stringify({
                title: `Habla Mobile (${data.sender})`,
                body: translatedText
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
        const recipientSocketId = Object.keys(activeSockets).find(
            id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
        );

        const transcribedText = await transcribeAudio(data.audio);
        
        const foundKey = Object.keys(userLanguages).find(k => k.toLowerCase() === cleanRecipient);
        const recipientLang = foundKey ? userLanguages[foundKey] : (data.targetLang || 'Ukrainian');
        
        const translatedText = await translateText(transcribedText, recipientLang);

        const messagePayload = {
            sender: data.sender,
            recipient: data.recipient,
            text: translatedText,
            originalText: transcribedText
        };

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-message', messagePayload);
        } else if (userPushSubscriptions[cleanRecipient]) {
            const pushPayload = JSON.stringify({
                title: `Habla Mobile (${data.sender})`,
                body: translatedText
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

function broadcastUsers() {
    const usersList = Object.values(activeSockets).map(name => ({ name, isOnline: true }));
    io.emit('update-users', usersList);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
