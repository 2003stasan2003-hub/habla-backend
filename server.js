const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

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

// Повністю робочий API перекладу зі стабільною моделлю
app.post('/api/translate', async (req, res) => {
    const { text, targetLang } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: 'Відсутній текст для перекладу' });
    }

    try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API ключ Groq не налаштовано на сервері' });
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama3-8b-8192', // Гарантовано працююча, надшвидка модель
                messages: [
                    { 
                        role: 'system', 
                        content: `Translate the following text accurately into language code "${targetLang}". Return ONLY the translated text without extra explanations.` 
                    },
                    { role: 'user', content: text }
                ],
                temperature: 0.3
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Помилка від Groq API:', JSON.stringify(data));
            const errorMsg = data.error && data.error.message ? data.error.message : 'Помилка від сервера Groq';
            return res.status(500).json({ error: errorMsg });
        }

        const translatedText = data.choices && data.choices[0] && data.choices[0].message 
            ? data.choices[0].message.content.trim() 
            : 'Помилка розбору відповіді AI';

        res.json({ translatedText });
    } catch (error) {
        console.error('Помилка сервера під час запиту до Groq:', error);
        res.status(500).json({ error: 'Помилка мережі або сервера' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});
