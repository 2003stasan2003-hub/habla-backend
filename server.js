import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e7
});

const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const usersByName = {};
const socketToUser = {};
const userContacts = {};
const customizations = {};
const pushSubscriptions = {};

// Заглушка для Web Push: серверні VAPID-пуші вимкнені, щоб не засмічувати логи помилками.
async function sendPushToRecipient(recipientName, payload) {
    return;
}

function getUsersPayload() {
    const allNames = new Set([
        ...Object.keys(usersByName),
        ...Object.keys(customizations)
    ]);

    return Array.from(allNames).map((name) => {
        const record = usersByName[name];
        return {
            name,
            isOnline: Boolean(record && record.sockets && record.sockets.size > 0),
            lang: record ? record.lang : 'Ukrainian'
        };
    });
}

function broadcastUsers() {
    io.emit('update-users', getUsersPayload());
}

async function translateText(text, targetLang) {
    if (!text || !text.trim()) return text;
    if (!genAI) return text;

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `Translate the following message into ${targetLang}. Return ONLY the translated text without quotes, notes, or explanations:\n\n${text}`;
        const result = await model.generateContent(prompt);
        const translated = result?.response?.text()?.trim();
        return translated || text;
    } catch (err) {
        console.error('Translation error:', err.message);
        return text;
    }
}

async function transcribeAndTranslateAudio(base64DataUrl, targetLang) {
    if (!genAI) {
        return { originalText: '[Голосове повідомлення]', translatedText: '[Голосове повідомлення]' };
    }

    try {
        const matches = base64DataUrl.match(/^data:(.+?);base64,(.+)$/);
        if (!matches) {
            return { originalText: '[Аудіо]', translatedText: '[Аудіо]' };
        }
        const mimeType = matches[1] || 'audio/webm';
        const base64Audio = matches[2];

        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `Listen to this voice message. First transcribe the exact spoken words in their original language, then translate them into ${targetLang}. Respond strictly in JSON format: {"original": "...", "translated": "..."}`;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Audio,
                    mimeType: mimeType
                }
            }
        ]);

        const raw = result?.response?.text()?.trim() || '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                originalText: parsed.original || '',
                translatedText: parsed.translated || parsed.original || ''
            };
        }
        return { originalText: raw, translatedText: raw };
    } catch (err) {
        console.error('Voice processing error:', err.message);
        return { originalText: '[Помилка розпізнавання голосу]', translatedText: '[Помилка розпізнавання голосу]' };
    }
}

function emitToUser(targetName, eventName, data) {
    const cleanTarget = (targetName || '').trim();
    const entry = Object.entries(usersByName).find(
        ([name]) => name.toLowerCase() === cleanTarget.toLowerCase()
    );
    if (entry && entry[1].sockets) {
        entry[1].sockets.forEach((sockId) => {
            io.to(sockId).emit(eventName, data);
        });
        return true;
    }
    return false;
}

io.on('connection', (socket) => {
    socket.on('join', ({ username, lang }) => {
        const cleanName = (username || '').trim();
        if (!cleanName) return;

        socketToUser[socket.id] = cleanName;
        if (!usersByName[cleanName]) {
            usersByName[cleanName] = {
                sockets: new Set(),
                lang: lang || 'Ukrainian'
            };
        }
        usersByName[cleanName].sockets.add(socket.id);
        if (lang) usersByName[cleanName].lang = lang;

        socket.emit('sync-customizations', customizations);
        broadcastUsers();
    });

    socket.on('update-language', (newLang) => {
        const user = socketToUser[socket.id];
        if (user && usersByName[user] && newLang) {
            usersByName[user].lang = newLang;
            broadcastUsers();
        }
    });

    socket.on('add-contact', (contactName) => {
        const user = socketToUser[socket.id];
        const cleanContact = (contactName || '').trim();
        if (!user || !cleanContact) return;

        if (!userContacts[user]) userContacts[user] = new Set();
        userContacts[user].add(cleanContact);
        broadcastUsers();
    });

    socket.on('update-customization', ({ targetName, color, avatar }) => {
        const cleanTarget = (targetName || '').trim();
        if (!cleanTarget) return;
        customizations[cleanTarget] = {
            color: color || '#2b5278',
            avatar: avatar || ''
        };
        io.emit('sync-customizations', customizations);
        broadcastUsers();
    });

    socket.on('subscribe-push', ({ username, subscription }) => {
        const cleanName = (username || '').trim();
        if (cleanName && subscription) {
            pushSubscriptions[cleanName] = subscription;
        }
    });

    socket.on('text-message', async ({ sender, recipient, text, targetLang }) => {
        const cleanSender = (sender || socketToUser[socket.id] || '').trim();
        const cleanRecipient = (recipient || '').trim();
        const cleanText = (text || '').trim();
        if (!cleanSender || !cleanRecipient || !cleanText) return;

        const recipientRecord = Object.entries(usersByName).find(
            ([name]) => name.toLowerCase() === cleanRecipient.toLowerCase()
        );
        const recipientLang = recipientRecord ? recipientRecord[1].lang : (targetLang || 'Ukrainian');

        const translated = await translateText(cleanText, recipientLang);

        emitToUser(cleanSender, 'incoming-message', {
            sender: cleanSender,
            recipient: cleanRecipient,
            text: translated,
            originalText: cleanText,
            isSent: true
        });

        emitToUser(cleanRecipient, 'incoming-message', {
            sender: cleanSender,
            recipient: cleanRecipient,
            text: translated,
            originalText: cleanText,
            isSent: false
        });

        await sendPushToRecipient(cleanRecipient, {
            title: cleanSender,
            body: translated
        });
    });

    socket.on('voice-message', async ({ sender, recipient, audio, targetLang }) => {
        const cleanSender = (sender || socketToUser[socket.id] || '').trim();
        const cleanRecipient = (recipient || '').trim();
        if (!cleanSender || !cleanRecipient || !audio) return;

        const recipientRecord = Object.entries(usersByName).find(
            ([name]) => name.toLowerCase() === cleanRecipient.toLowerCase()
        );
        const recipientLang = recipientRecord ? recipientRecord[1].lang : (targetLang || 'Ukrainian');

        const { originalText, translatedText } = await transcribeAndTranslateAudio(audio, recipientLang);

        emitToUser(cleanSender, 'incoming-message', {
            sender: cleanSender,
            recipient: cleanRecipient,
            text: translatedText,
            originalText: originalText,
            isSent: true
        });

        emitToUser(cleanRecipient, 'incoming-message', {
            sender: cleanSender,
            recipient: cleanRecipient,
            text: translatedText,
            originalText: originalText,
            isSent: false
        });

        await sendPushToRecipient(cleanRecipient, {
            title: cleanSender,
            body: translatedText
        });
    });

    socket.on('disconnect', () => {
        const user = socketToUser[socket.id];
        delete socketToUser[socket.id];
        if (user && usersByName[user]) {
            usersByName[user].sockets.delete(socket.id);
            broadcastUsers();
        }
    });
});

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('index.html not found');
    }
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
