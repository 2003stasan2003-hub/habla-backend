import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.use('/.well-known', express.static('.well-known'));
app.use(express.static(__dirname));

let currentGroqLimits = { requests: '---', tokens: '---' };

const activeSockets = {}; 
const allKnownUsers = new Set(); 
const userContacts = {}; 
const userLanguages = {}; 
const userCustomizations = {}; 

function checkIsAdmin(username) {
    if (!username) return false;
    const lower = username.toLowerCase().trim();
    return lower === 'stasan' || lower === 'admin' || lower === 'стасан';
}

function hasContactCaseInsensitive(ownerName, targetName) {
    const set = userContacts[ownerName];
    if (!set || !targetName) return false;
    const targetLower = targetName.toLowerCase().trim();
    for (let item of set) {
        if (item && item.toLowerCase().trim() === targetLower) {
            return true;
        }
    }
    return false;
}

function isUserOnlineCaseInsensitive(onlineLowerSet, targetName) {
    if (!targetName) return false;
    return onlineLowerSet.has(targetName.toLowerCase().trim());
}

function updateUsers() {
    const onlineNames = new Set(Object.values(activeSockets));
    const onlineLowerSet = new Set(
        Array.from(onlineNames).map(n => (n || '').toLowerCase().trim()).filter(Boolean)
    );
    
    for (let [id, socket] of io.of("/").sockets) {
        const currentUsername = activeSockets[id];
        if (!currentUsername) continue;

        const isAdmin = checkIsAdmin(currentUsername);

        const usersList = Array.from(allKnownUsers).map(name => {
            if (name.toLowerCase().trim() === currentUsername.toLowerCase().trim()) return null;

            const isOnline = isUserOnlineCaseInsensitive(onlineLowerSet, name);
            const myAdd = hasContactCaseInsensitive(currentUsername, name);
            const theirAdd = hasContactCaseInsensitive(name, currentUsername);
            const isMutual = myAdd && theirAdd;

            if (!isAdmin && !myAdd) {
                return null;
            }

            return {
                name: name,
                isOnline: isOnline,
                myAdd: myAdd,
                theirAdd: theirAdd,
                isMutual: isMutual
            };
        }).filter(Boolean);

        socket.emit('update-users', { users: usersList, isAdmin });
    }

    io.emit('onlineCount', onlineNames.size);
}

async function getActiveModel(apiKey) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await response.json();
        if (response.ok && data.data && data.data.length > 0) {
            const chatModels = data.data.filter(m => {
                const id = m.id.toLowerCase();
                const isChat = id.includes('llama') || id.includes('mixtral') || id.includes('gemma') || id.includes('gpt') || id.includes('qwen');
                const isSystem = id.includes('guard') || id.includes('whisper') || id.includes('embed') || id.includes('tool') || id.includes('audio');
                return isChat && !isSystem;
            });
            if (chatModels.length > 0) return chatModels[0].id;
            return data.data[0].id;
        }
    } catch (e) {
        console.error("Помилка отримання списку моделей:", e.message);
    }
    return "llama-3.1-70b-versatile";
}

async function translateText(text, targetLanguage) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !text || !targetLanguage) return text;

    const modelName = await getActiveModel(apiKey);

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    {
                        role: "system",
                        content: `You are a professional translator. Translate the given text accurately and naturally into ${targetLanguage}. Return ONLY the translated text without any extra notes or formatting.`
                    },
                    { role: "user", content: text }
                ],
                max_tokens: 250
            })
        });

        const data = await response.json();

        if (response.ok) {
            const remReq = response.headers.get('x-ratelimit-remaining-requests');
            const remTok = response.headers.get('x-ratelimit-remaining-tokens');
            if (remReq) {
                currentGroqLimits = { requests: remReq, tokens: remTok };
                io.emit('groq-limits', currentGroqLimits);
            }

            if (data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content.trim();
            }
        }
    } catch (error) {
        console.error(`❌ Помилка перекладу:`, error.message);
    }

    return text;
}

io.on('connection', (socket) => {
    console.log(`Користувач підключився: ${socket.id}`);
    socket.emit('groq-limits', currentGroqLimits);

    socket.on('join', (data) => {
        let username, lang;
        if (typeof data === 'object' && data !== null) {
            username = data.username;
            lang = data.lang || 'Spanish';
        } else {
            username = data;
            lang = 'Spanish';
        }

        if (!username) return;
        username = username.trim();
        activeSockets[socket.id] = username;
        allKnownUsers.add(username);
        userLanguages[username] = lang;

        if (!userContacts[username]) {
            userContacts[username] = new Set();
        }

        if (userCustomizations[username]) {
            socket.emit('sync-customizations', userCustomizations[username]);
        }

        updateUsers();
    });

    socket.on('update-language', (newLang) => {
        const username = activeSockets[socket.id];
        if (username && newLang) {
            userLanguages[username] = newLang;
        }
    });

    socket.on('update-customization', ({ targetName, color, avatar }) => {
        const username = activeSockets[socket.id];
        if (!username || !targetName) return;

        if (!userCustomizations[username]) {
            userCustomizations[username] = {};
        }
        userCustomizations[username][targetName] = { color, avatar };

        for (let [id, name] of Object.entries(activeSockets)) {
            if (name === username) {
                io.to(id).emit('sync-customizations', userCustomizations[username]);
            }
        }
    });

    socket.on('add-contact', (targetName) => {
        const username = activeSockets[socket.id];
        if (!username || !targetName) return;
        const cleanTarget = targetName.trim();
        if (!cleanTarget || username.toLowerCase() === cleanTarget.toLowerCase()) return;

        allKnownUsers.add(cleanTarget);
        if (!userContacts[username]) {
            userContacts[username] = new Set();
        }
        userContacts[username].add(cleanTarget);
        updateUsers();
    });

    // Текстове повідомлення з перекладом
    socket.on('text-message', async (data) => {
        try {
            const sender = data.sender;
            const recipient = data.recipient;
            const rawText = (data.text || '').trim();
            const targetLang = data.targetLang || userLanguages[recipient] || 'Spanish';

            if (!rawText || !recipient) return;

            const translatedText = await translateText(rawText, targetLang);

            const cleanRecipient = recipient.toLowerCase().trim();
            const recipientSocketId = Object.keys(activeSockets).find(
                id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
            );

            socket.emit('incoming-message', { sender, text: rawText, isSelf: true });

            if (recipientSocketId) {
                io.to(recipientSocketId).emit('incoming-message', { sender, text: translatedText, isSelf: false });
            }
        } catch (e) {
            console.error("❌ Помилка обробки текстового повідомлення:", e);
        }
    });

    // Голосове повідомлення через Whisper
    socket.on('voice-message', async (data) => {
        try {
            const sender = data.sender;
            const recipient = data.recipient;
            const audioBase64 = data.audio;

            if (!audioBase64 || !recipient) return;

            const base64Data = audioBase64.split(';base64,').pop();
            const audioBuffer = Buffer.from(base64Data, 'base64');

            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) return;

            const formData = new FormData();
            const blob = new Blob([audioBuffer], { type: 'audio/webm' });
            formData.append('file', blob, 'audio.webm');
            formData.append('model', 'whisper-large-v3');

            const transcriptionResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData
            });

            const transcriptionData = await transcriptionResponse.json();
            if (!transcriptionResponse.ok || !transcriptionData.text) return;

            const recognizedText = transcriptionData.text.trim();
            const recipientLang = userLanguages[recipient] || 'Spanish';
            const translatedText = await translateText(recognizedText, recipientLang);

            const cleanRecipient = recipient.toLowerCase().trim();
            const recipientSocketId = Object.keys(activeSockets).find(
                id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
            );

            socket.emit('incoming-message', { sender, text: recognizedText, isSelf: true });

            if (recipientSocketId) {
                io.to(recipientSocketId).emit('incoming-message', { sender, text: translatedText, isSelf: false });
            }
        } catch (e) {
            console.error("❌ Помилка голосу:", e);
        }
    });

    socket.on('disconnect', () => {
        delete activeSockets[socket.id];
        updateUsers();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
