import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Groq from 'groq-sdk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(cors());

// Роздаємо статичні файли фронтенду
app.use(express.static(__dirname));

// Ініціалізація офіційного SDK Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const activeUsers = new Map();

io.on('connection', (socket) => {
    console.log(`Користувач підключився: ${socket.id}`);

    socket.on('register_user', (data) => {
        const nickname = data && data.nickname ? data.nickname.trim() : `User-${socket.id.slice(-4)}`;
        activeUsers.set(socket.id, { socketId: socket.id, nickname });
        broadcastContacts();
    });

    socket.on('find_user', (targetNickname, callback) => {
        let found = false;
        const cleanTarget = targetNickname.trim().toLowerCase();

        for (let [sId, user] of activeUsers.entries()) {
            if (user.nickname.toLowerCase() === cleanTarget && sId !== socket.id) {
                found = true;
                break;
            }
        }

        if (found) {
            callback({ success: true, nickname: targetNickname });
        } else {
            callback({ success: false, message: 'Користувача з таким ніком немає в мережі.' });
        }
    });

    socket.on('disconnect', () => {
        activeUsers.delete(socket.id);
        broadcastContacts();
    });
});

function broadcastContacts() {
    const contactsList = Array.from(activeUsers.values());
    io.emit('update_contacts', contactsList);
}

// Ендпоінт перекладу через офіційний Groq SDK з моделлю DeepSeek R1
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLang } = req.body;

        if (!text) {
            return res.status(400).json({ error: "Відсутній текст для перекладу" });
        }

        let targetLanguageName = "Spanish";
        if (targetLang === 'es' || targetLang === 'es-ES') targetLanguageName = "Spanish";
        else if (targetLang === 'uk' || targetLang === 'uk-UA') targetLanguageName = "Ukrainian";
        else if (targetLang === 'en' || targetLang === 'en-US') targetLanguageName = "English";
        else if (targetLang === 'de' || targetLang === 'de-DE') targetLanguageName = "German";
        else if (targetLang === 'pl' || targetLang === 'pl-PL') targetLanguageName = "Polish";

        const completion = await groq.chat.completions.create({
            model: "deepseek-r1-distill-llama-70b",
            messages: [
                {
                    role: "system",
                    content: `You are a professional real-time translator. Translate the given text accurately and naturally into ${targetLanguageName}. Return ONLY the translated text without extra explanations, quotes, thinking tags, or formatting.`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0.3,
            max_tokens: 300
        });

        let translatedText = completion.choices[0]?.message?.content?.trim() || "Помилка розбору відповіді AI";
        
        // Очищуємо можливі теги міркувань, якщо модель їх виведе
        translatedText = translatedText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        res.json({ translatedText });

    } catch (error) {
        console.error("Помилка сервера при перекладі:", error);
        res.status(500).json({ error: error.message || "Server translation error" });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер Habla Mobile запущено на порту ${PORT}`);
});
