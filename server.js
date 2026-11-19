import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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

let GoogleGenerativeAI = null;
try {
    const genAiModule = await import('@google/generative-ai');
    GoogleGenerativeAI = genAiModule.GoogleGenerativeAI || null;
} catch (err) {
    console.warn('Package @google/generative-ai not installed; fallback translator will be used.');
}

const genAI = (GoogleGenerativeAI && process.env.GEMINI_API_KEY)
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

const usersByName = {};
const socketToUser = {};
const userContacts = {};
const customizations = {};
const pushSubscriptions = {};

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

// Заглушка для Web Push: серверні VAPID-пуші вимкнені, щоб у логах не було помилок.
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

async function fallbackTranslate(text, targetLang) {
    const targetCode = LANG_CODE_MAP[targetLang] || 'uk';
    try {
        if (typeof fetch !== 'function') return text;
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetCode)}&dt=t&q=${encodeURIComponent(text)}`;
        const resp = await fetch(url);
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

    if (genAI) {
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const prompt = `Translate the following message into ${cleanTargetLang}. Return ONLY the translated text without quotes, notes, or explanations:\n\n${text}`;
            const result = await model.generateContent(prompt);
            const translated = result?.response?.text()?.trim();
            if (translated) return translated;
        } catch (err) {
            console.error('Gemini translation error, using fallback:', err.message);
        }
    }

    return await fallbackTranslate(text, cleanTargetLang);
}

async function transcribeAndTranslateAudio(base64DataUrl, targetLang) {
    const cleanTargetLang = normalizeLangName(targetLang);
    if (!genAI) {
        return { originalText: '', translatedText: '' };
    }

    try {
        const matches = base64DataUrl.match(/^data:(.+?);base64,(.+)$/);
        if (!matches) {
            return { originalText: '', translatedText: '' };
        }
        const mimeType = matches[1] || 'audio/webm';
        const base64Audio = matches[2];

        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `Listen to this voice message. First transcribe the exact spoken words in their original language, then translate them into ${cleanTargetLang}. Respond strictly in JSON format: {"original": "...", "translated": "..."}`;

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
                originalText: (parsed.original || '').trim(),
                translatedText: (parsed.translated || parsed.original || '').trim()
            };
        }
        return { originalText: raw, translatedText: raw };
    } catch (err) {
        console.error('Voice processing error:', err.message);
        return { originalText: '', translatedText: '' };
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

        const cleanLang = normalizeLangName(lang);
        socketToUser[socket.id] = cleanName;
        if (!usersByName[cleanName]) {
            usersByName[cleanName] = {
                sockets: new Set(),
                lang: cleanLang
            };
        }
        usersByName[cleanName].sockets.add(socket.id);
        usersByName[cleanName].lang = cleanLang;

        socket.emit('sync-customizations', customizations);
        broadcastUsers();
    });

    socket.on('update-language', (newLang) => {
        const user = socketToUser[socket.id];
        if (user && usersByName[user] && newLang) {
            usersByName[user].lang = normalizeLangName(newLang);
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
        const recipientLang = normalizeLangName(
            (recipientRecord && recipientRecord[1].lang) || targetLang || 'Ukrainian'
        );

        const translatedForRecipient = await translateText(cleanText, recipientLang);

        emitToUser(cleanSender, 'incoming-message', {
            sender: cleanSender,
            recipient: cleanRecipient,
            text: translatedForRecipient || cleanText,
            originalText: cleanText,
            isSent: true
        });

        emitToUser(cleanRecipient, 'incoming-message', {
            sender: cleanSender,
            recipient: cleanRecipient,
            text: translatedForRecipient || cleanText,
            originalText: cleanText,
            isSent: false
        });

        await sendPushToRecipient(cleanRecipient, {
            title: cleanSender,
            body: translatedForRecipient || cleanText
        });
    });

    socket.on('voice-message', async ({ sender, recipient, audio, targetLang }) => {
        const cleanSender = (sender || socketToUser[socket.id] || '').trim();
        const cleanRecipient = (recipient || '').trim();
        if (!cleanSender || !cleanRecipient || !audio) return;

        const recipientRecord = Object.entries(usersByName).find(
            ([name]) => name.toLowerCase() === cleanRecipient.toLowerCase()
        );
        const recipientLang = normalizeLangName(
            (recipientRecord && recipientRecord[1].lang) || targetLang || 'Ukrainian'
        );

        const { originalText, translatedText } = await transcribeAndTranslateAudio(audio, recipientLang);
        const finalText = (translatedText || originalText || '').trim();
        if (!finalText) return;

        emitToUser(cleanSender, 'incoming-message', {
            sender: cleanSender,
            recipient: cleanRecipient,
            text: finalText,
            originalText: originalText || finalText,
            isSent: true
        });

        emitToUser(cleanRecipient, 'incoming-message', {
            sender: cleanSender,
            recipient: cleanRecipient,
            text: finalText,
            originalText: originalText || finalText,
            isSent: false
        });

        await sendPushToRecipient(cleanRecipient, {
            title: cleanSender,
            body: finalText
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
