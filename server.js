import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10 * 1024 * 1024 });

const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let activeSockets = {};
let userLanguages = {};
let userCustomizations = {};

async function transcribeAudio(audioBuffer) {
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY не заданий!");
    const tempFilePath = path.join(__dirname, `temp_${Date.now()}.webm`);
    fs.writeFileSync(tempFilePath, audioBuffer);

    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFilePath));
        formData.append('model', 'whisper-large-v3');
        formData.append('temperature', '0');

        const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${GROQ_API_KEY}`
            }
        });
        fs.unlinkSync(tempFilePath);
        return response.data.text || "";
    } catch (error) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        console.error("❌ Помилка транскрипції Groq:", error.response?.data || error.message);
        return "";
    }
}

async function translateText(text, targetLang) {
    if (!GROQ_API_KEY || !text) return text;
    
    // Переводимо назви мов у зручний формат для моделі
    let langName = targetLang;
    if (targetLang === 'Ukrainian') langName = 'clean, natural literary Ukrainian language (сучасна літературна українська мова без русизмів і кальки)';
    if (targetLang === 'English') langName = 'English';
    if (targetLang === 'Spanish') langName = 'Spanish';
    if (targetLang === 'German') langName = 'German';
    if (targetLang === 'French') langName = 'French';

    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: `You are a professional translator. Translate the given text accurately and naturally into ${langName}. Return ONLY the translated text without quotes, comments, or extra explanations.` },
                { role: "user", content: text }
            ],
            temperature: 0.2
        }, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data.choices[0]?.message?.content?.trim() || text;
    } catch (error) {
        console.error("❌ Помилка перекладу Groq:", error.response?.data || error.message);
        return text;
    }
}

io.on('connection', (socket) => {
    console.log(`👤 Користувач підключився: ${socket.id}`);

    socket.on('join', (data) => {
        const username = typeof data === 'string' ? data : data?.username;
        const lang = typeof data === 'object' ? data?.lang : 'Ukrainian';
        if (username) {
            activeSockets[socket.id] = username.trim();
            userLanguages[username.trim()] = lang;
            socket.emit('sync-customizations', userCustomizations);
            broadcastUsers();
        }
    });

    socket.on('update-language', (lang) => {
        const username = activeSockets[socket.id];
        if (username) {
            userLanguages[username] = lang;
        }
    });

    socket.on('add-contact', (contactName) => {
        broadcastUsers();
    });

    socket.on('update-customization', (data) => {
        const { targetName, color, avatar } = data;
        if (targetName) {
            userCustomizations[targetName] = { color, avatar };
            io.emit('sync-customizations', userCustomizations);
        }
    });

    socket.on('text-message', async (data) => {
        try {
            const sender = data.sender;
            const recipient = data.recipient;
            const rawText = (data.text || '').trim();
            
            // Визначаємо мову отримувача як цільову для перекладу
            const recipientLang = userLanguages[recipient] || 'Ukrainian';

            if (!rawText || !recipient) return;

            const translatedText = await translateText(rawText, recipientLang);
            const cleanRecipient = recipient.toLowerCase().trim();
            const recipientSocketId = Object.keys(activeSockets).find(
                id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
            );

            // Відправнику показуємо його оригінальний текст
            socket.emit('incoming-message', { sender, text: rawText, isSelf: true, originalText: rawText });

            // Отримувачу відправляємо перекладений текст
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('incoming-message', { sender, text: translatedText, isSelf: false, originalText: rawText });
            }
        } catch (e) {
            console.error("❌ Помилка обробки текстового повідомлення:", e);
        }
    });

    socket.on('voice-message', async (data) => {
        try {
            const { sender, recipient, audio } = data;
            if (!audio || !recipient) return;

            const base64Data = audio.replace(/^data:audio\/webm;base64,/, "");
            const audioBuffer = Buffer.from(base64Data, 'base64');

            const transcribedText = await transcribeAudio(audioBuffer);
            if (!transcribedText.trim()) return;

            // Визначаємо мову отримувача як цільову для перекладу
            const recipientLang = userLanguages[recipient] || 'Ukrainian';
            const translatedText = await translateText(transcribedText, recipientLang);

            const cleanRecipient = recipient.toLowerCase().trim();
            const recipientSocketId = Object.keys(activeSockets).find(
                id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
            );

            // Відправнику йде те, що він сказав (розпізнаний текст)
            socket.emit('incoming-message', { sender, text: transcribedText, isSelf: true, originalText: transcribedText });

            // Отримувачу йде повноцінний переклад цільовою мовою
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('incoming-message', { sender, text: translatedText, isSelf: false, originalText: transcribedText });
            }
        } catch (e) {
            console.error("❌ Помилка обробки голосового повідомлення:", e);
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ Користувач відключився: ${socket.id}`);
        delete activeSockets[socket.id];
        broadcastUsers();
    });
});

function broadcastUsers() {
    const uniqueUsers = Array.from(new Set(Object.values(activeSockets))).map(name => ({
        name,
        isOnline: true
    }));
    io.emit('update-users', uniqueUsers);
}

server.listen(PORT, () => {
    console.log(`🚀 Сервер запущено на порту ${PORT}`);
});
