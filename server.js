const express = require('http');
const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const path = require('path');

// Обслуговування статичних файлів з кореня проєкту
app.use(require('express').static(path.join(__dirname)));

// --- СХОВИЩЕ ДЛЯ ІСТОРІЇ ТА ЧАСУ ВІДКЛЮЧЕННЯ ---
let messageHistory = [];         // Масив для збереження повідомлень
let userDisconnectTimes = {};    // Час останнього виходу користувача: { username: timestamp }
let activeUsers = new Map();     // Список активних користувачів
let customizations = {};         // Кастомізації (кольори, аватарки)
let groqUsage = { requests: 0, tokens: 0 }; // Статистика API

// 3 дні у мілісекундах (3 доби * 24 години * 60 хв * 60 сек * 1000 мс)
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Функція автоматичного видалення повідомлень, старших за 3 дні
function cleanExpiredMessages() {
    const now = Date.now();
    const initialLength = messageHistory.length;
    messageHistory = messageHistory.filter(msg => (now - msg.timestamp) < THREE_DAYS_MS);
    if (messageHistory.length !== initialLength) {
        console.log(`[Очищення] Видалено прострочених повідомлень: ${initialLength - messageHistory.length}`);
    }
}

// Запускаємо перевірку прострочених повідомлень кожну годину
setInterval(cleanExpiredMessages, 60 * 60 * 1000);

io.on('connection', (socket) => {
    console.log('Користувач підключився ID:', socket.id);

    // Приєднання користувача до чату
    socket.on('join', (userData) => {
        if (!userData || !userData.username) return;
        
        const username = userData.username.trim();
        socket.username = username;
        socket.join(username); // Особиста кімната для приватних повідомлень

        activeUsers.set(socket.id, {
            name: username,
            isOnline: true,
            lang: userData.lang || 'Spanish'
        });

        // Очищаємо старі повідомлення перед видачею пропущених
        cleanExpiredMessages();

        // Визначаємо час, коли користувач востаннє виходив з мережі
        // Якщо заходив уперше або дані не збереглися, беремо межу за останні 3 дні
        const lastActiveTime = userDisconnectTimes[username] || (Date.now() - THREE_DAYS_MS);

        // Фільтруємо пропущені повідомлення:
        // 1. Вони адресовані саме цьому користувачу (приватні) або загальні (без recipientName)
        // 2. Вони надійшли ПІСЛЯ того, як користувач востаннє вийшов
        // 3. Вони надіслані НЕ самим користувачем
        const missedMessages = messageHistory.filter(msg => {
            const isForMe = (msg.recipientName === username) || (!msg.recipientName && msg.user !== username);
            const isNewerThanDisconnect = msg.timestamp > lastActiveTime;
            return isForMe && isNewerThanDisconnect;
        });

        // Надсилаємо пропущені повідомлення користувачу одразу при вході
        if (missedMessages.length > 0) {
            console.log(`[Доставка] Відправляємо ${missedMessages.length} пропущених повідомлень для ${username}`);
            missedMessages.forEach(msg => {
                socket.emit('chatMessage', msg);
            });
        }

        // Синхронізуємо кастомізації та користувачів
        socket.emit('sync-customizations', customizations);
        broadcastUsersUpdate();
        io.emit('onlineCount', activeUsers.size);
    });

    // Обробка вхідного повідомлення
    socket.on('chatMessage', (data) => {
        if (!data || !data.text || !data.user) return;

        const messageData = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            text: data.text,
            user: data.user,
            recipientName: data.recipientName || null,
            isPrivate: !!data.recipientName,
            timestamp: Date.now() // Фіксуємо точний час створення
        };

        // Очищаємо старі й додаємо нове повідомлення в історію
        cleanExpiredMessages();
        messageHistory.push(messageData);

        if (messageData.recipientName) {
            // Приватне повідомлення: надсилаємо отримувачу та відправнику
            io.to(messageData.recipientName).emit('chatMessage', messageData);
            socket.emit('chatMessage', messageData);
        } else {
            // Загальне повідомлення для всіх
            io.emit('chatMessage', messageData);
        }
    });

    // Додавання контакту
    socket.on('add-contact', (targetName) => {
        // Логіка додавання контактів залишається незмінною
    });

    // Оновлення кастомізацій (кольори, аватарки)
    socket.on('update-customization', (data) => {
        if (data && data.targetName) {
            customizations[data.targetName] = {
                color: data.color,
                avatar: data.avatar
            };
            io.emit('sync-customizations', customizations);
        }
    });

    // Відключення користувача
    socket.on('disconnect', () => {
        if (socket.username) {
            // Фіксуємо точний час, коли користувач покинув додаток
            userDisconnectTimes[socket.username] = Date.now();
        }
        activeUsers.delete(socket.id);
        broadcastUsersUpdate();
        io.emit('onlineCount', activeUsers.size);
        console.log('Користувач відключився:', socket.id);
    });
});

function broadcastUsersUpdate() {
    const usersList = Array.from(activeUsers.values());
    io.emit('update-users', { users: usersList, isAdmin: false });
}

// Порт для запуску ( Render автоматично підставляє process.env.PORT )
const PORT = process.env.PORT || 3000;
server.PORT = PORT;
server.listen(PORT, () => {
    console.log(`Сервер успішно запущено на порту ${PORT}`);
});
