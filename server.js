io.on('connection', (socket) => {
    console.log('Користувач підключився:', socket.id);

    socket.on('register-username', (username, callback) => {
        if (!username || typeof username !== 'string') {
            return callback({ success: false, message: "Некоректне ім'я!" });
        }
        const trimmed = username.trim();
        if (registeredUsers.has(trimmed)) {
            return callback({ success: false, message: "Це ім'я вже зайняте!" });
        }
        registeredUsers.add(trimmed);
        socket.username = trimmed;
        callback({ success: true });
    });

    socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`Користувач ${socket.username} приєднався до кімнати: ${room}`);
    });

    // Новий обробник для повідомлень чату
    socket.on('chat-message', ({ room, message }) => {
        if (!socket.username) return;
        
        io.to(room).emit('chat-message', {
            sender: socket.username,
            text: message,
            timestamp: new Date().toISOString()
        });
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            registeredUsers.delete(socket.username);
        }
        console.log('Користувач відключився:', socket.id);
    });
});
