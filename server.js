import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const activeUsers = new Map();
const userContacts = new Map();

async function translateWithGroq(text, targetLanguage) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return text;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `You are a professional translator. Translate the following text into ${targetLanguage}. Output ONLY the translated text without any extra explanations, quotes, or conversational filler.`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                temperature: 0.3
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content.trim();
        }
    } catch (err) {
        console.error('Помилка Groq API перекладу:', err);
    }
    return text;
}

io.on('connection', (socket) => {
    console.log(`Користувач підключився: ${socket.id}`);

    socket.on('register_user', (userData) => {
        const username = userData && userData.name ? userData.name.trim() : 'Tester';
        const isAdmin = (username === 'StasAn');

        activeUsers.set(socket.id, {
            id: socket.id,
            name: username,
            isAdmin: isAdmin
        });

        if (!userContacts.has(username)) {
            userContacts.set(username, new Set());
        }

        sendPersonalizedContacts(socket);
        sendAvailableUsers(socket);
    });

    socket.on('get_available_users', () => {
        sendAvailableUsers(socket);
    });

    socket.on('add_contact', (contactName) => {
        const currentUser = activeUsers.get(socket.id);
        if (!currentUser) return;

        const myName = currentUser.name;
        if (myName === contactName) return;

        if (!userContacts.has(myName)) {
            userContacts.set(myName, new Set());
        }
        userContacts.get(myName).add(contactName);

        sendPersonalizedContacts(socket);
        sendAvailableUsers(socket);
    });

    socket.on('check_admin', () => {
        const currentUser = activeUsers.get(socket.id);
        if (currentUser && currentUser.isAdmin) {
            socket.emit('admin_status', { isAdmin: true });
        } else {
            socket.emit('admin_status', { isAdmin: false });
        }
    });

    socket.on('chat_message', async (data) => {
        const sender = activeUsers.get(socket.id);
        if (sender) {
            const originalText = data.text;
            const targetLang = data.targetLanguage || 'English';
            
            const translatedText = await translateWithGroq(originalText, targetLang);

            io.emit('chat_message', {
                senderId: socket.id,
                senderName: sender.name,
                text: translatedText,
                targetLanguage: targetLang
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Користувач відключився: ${socket.id}`);
        activeUsers.delete(socket.id);
    });
});

function sendPersonalizedContacts(socket) {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const myContacts = userContacts.get(user.name) || new Set();
    const contactsList = [];

    myContacts.forEach(contactName => {
        let isOnline = false;
        for (let [_, u] of activeUsers) {
            if (u.name === contactName) {
                isOnline = true;
                break;
            }
        }
        contactsList.push({
            name: contactName,
            online: isOnline
        });
    });

    socket.emit('contacts_update', contactsList);
}

function sendAvailableUsers(socket) {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const myContacts = userContacts.get(user.name) || new Set();
    const available = [];
    const seenNames = new Set();

    for (let [_, u] of activeUsers) {
        if (u.name !== user.name && !seenNames.has(u.name)) {
            seenNames.add(u.name);
            available.push({
                name: u.name,
                isContact: myContacts.has(u.name)
            });
        }
    }

    socket.emit('available_users_update', available);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});
