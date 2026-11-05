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

// Роздача статичних файлів (index.html) з поточної папки
app.use(express.static(__dirname));

// Зберігаємо активних користувачів за їх socket.id
const activeUsers = new Map();
// Зберігаємо персональні контакти для кожного користувача: username -> Set(contactNames)
const userContacts = new Map();

io.on('connection', (socket) => {
    console.log(`Користувач підключився: ${socket.id}`);

    // Реєстрація користувача при вході
    socket.on('register_user', (userData) => {
        const username = userData && userData.name ? userData.name.trim() : 'Tester';
        // Перевірка на прихованого адміністратора StasAn
        const isAdmin = (username === 'StasAn');

        activeUsers.set(socket.id, {
            id: socket.id,
            name: username,
            isAdmin: isAdmin
        });

        if (!userContacts.has(username)) {
            userContacts.set(username, new Set());
        }

        // Надсилаємо персональний список контактів і доступних користувачів
        sendPersonalizedContacts(socket);
        sendAvailableUsers(socket);
    });

    // Запит на отримання списку всіх активних користувачів (для додавання в контакти)
    socket.on('get_available_users', () => {
        sendAvailableUsers(socket);
    });

    // Додавання користувача до своїх контактів
    socket.on('add_contact', (contactName) => {
        const currentUser = activeUsers.get(socket.id);
        if (!currentUser) return;

        const myName = currentUser.name;
        if (myName === contactName) return;

        if (!userContacts.has(myName)) {
            userContacts.set(myName, new Set());
        }
        userContacts.get(myName).add(contactName);

        // Оновлюємо список контактів для користувача
        sendPersonalizedContacts(socket);
        sendAvailableUsers(socket);
    });

    // Перевірка прав адміністратора (для StasAn)
    socket.on('check_admin', () => {
        const currentUser = activeUsers.get(socket.id);
        if (currentUser && currentUser.isAdmin) {
            socket.emit('admin_status', { isAdmin: true, message: 'Вітаю, адміністраторе StasAn!' });
        } else {
            socket.emit('admin_status', { isAdmin: false });
        }
    });

    // Обробка вхідних повідомлень
    socket.on('chat_message', (data) => {
        const sender = activeUsers.get(socket.id);
        if (sender) {
            io.emit('chat_message', {
                senderId: socket.id,
                senderName: sender.name,
                text: data.text,
                targetLanguage: data.targetLanguage || 'en'
            });
        }
    });

    // Відключення користувача
    socket.on('disconnect', () => {
        console.log(`Користувач відключився: ${socket.id}`);
        activeUsers.delete(socket.id);
    });
});

// Функція надсилання персональних контактів
function sendPersonalizedContacts(socket) {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    const myContacts = userContacts.get(user.name)` || new Set();
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

// Функція надсилання доступних користувачів для додавання
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
