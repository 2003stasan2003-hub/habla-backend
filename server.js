Import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// Ключ та лічильники Groq API
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''; 
let apiRequestsCount = 0;
let apiTokensCount = 0;

// Зберігання повідомлень (зберігаються 3 дні)[span_1](start_span)[span_1](end_span)
let messages = [];
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function cleanOldMessages() {
    const now = Date.now();
    messages = messages.filter(msg => (now - msg.timestamp) < THREE_DAYS_MS);
}

// Автоматичне очищення старих повідомлень щогодини[span_2](start_span)[span_2](end_span)
setInterval(cleanOldMessages, 60 * 60 * 1000);

let users = {}; // socket.id -> { name, lang, disconnectedAt }[span_3](start_span)[span_3](end_span)
let customizations = {}; // username -> { color, avatar }

// Функція перекладу через Groq API
async function translateText(text, targetLang) {
    if (!targetLang || targetLang === 'Original' || !GROQ_API_KEY) return text;
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama3-8b-8192',
                messages: [
                    {
                        role: 'system',
                        content: `Translate the following text into ${targetLang}. Return ONLY the translated text without extra explanations.`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) return text;
        const data = await response.json();
        apiRequestsCount++;
        if (data.usage && data.usage.total_tokens) {
            apiTokensCount += data.usage.total_tokens;
        }
        return data.choices[0].message.content.trim();
    } catch (err) {
        console.error('Translation error:', err);
        return text;
    }
}

io.on('connection', (socket) => {
    console.log('Користувач підключився:', socket.id);

    socket.on('join', ({ username, lang }) => {
        users[socket.id] = { name: username, lang: lang || 'Spanish', disconnectedAt: null };
        
        // Синхронізація кастомізацій
        socket.emit('sync-customizations', customizations);
        
        // Доставка пропущених повідомлень за останні 3 дні[span_4](start_span)[span_4](end_span)
        cleanOldMessages();
        messages.forEach(msg => {
            if (!msg.recipientName || msg.recipientName === username || msg.user === username) {
                socket.emit('chatMessage', msg);
            }
        });

        broadcastUsers();
    });

    socket.on('chatMessage', async (data) => {
        const timestamp = Date.now();
        let translatedText = data.text;

        // Переклад на мову отримувача, якщо він в мережі
        if (data.recipientName) {
            const recipientSocketId = Object.keys(users).find(id => users[id].name === data.recipientName);
            if (recipientSocketId && users[recipientSocketId]) {
                const targetLang = users[recipientSocketId].lang;
                translatedText = await translateText(data.text, targetLang);
            }
        }

        const messageObj = {
            id: timestamp,
            user: data.user,
            text: translatedText,
            originalText: data.text,
            recipientName: data.recipientName || null,
            timestamp: timestamp
        };

        messages.push(messageObj);
        cleanOldMessages();

        if (data.recipientName) {
            const recipientSocketId = Object.keys(users).find(id => users[id].name === data.recipientName);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('chatMessage', messageObj);
            }
            socket.emit('chatMessage', messageObj);
        } else {
            io.emit('chatMessage', messageObj);
        }

        io.emit('groq-limits', { requests: apiRequestsCount, tokens: apiTokensCount });
    });

    socket.on('update-customization', ({ targetName, color, avatar }) => {
        customizations[targetName] = { color, avatar };
        io.emit('sync-customizations', customizations);
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            users[socket.id].disconnectedAt = Date.now(); // Відстеження часу відключення[span_5](start_span)[span_5](end_span)
        }
        setTimeout(() => {
            delete users[socket.id];
            broadcastUsers();
        }, 5000);
    });
});

function broadcastUsers() {
    const activeUsersList = Object.values(users).map(u => ({
        name: u.name,
        isOnline: true,
        lang: u.lang
    }));
    io.emit('update-users', { users: activeUsersList, isAdmin: true });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});
