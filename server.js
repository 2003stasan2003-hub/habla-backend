socket.on('text-message', async (data) => {
        try {
            const sender = data.sender;
            const recipient = data.recipient;
            const rawText = (data.text || '').trim();
            const recipientLang = userLanguages[recipient] || 'Ukrainian';

            if (!rawText || !recipient) return;

            // Суворе блокування через ШІ
            if (await isRussianText(rawText)) {
                const errorMsg = getNotUnderstoodMessage(recipientLang);
                socket.emit('incoming-message', { sender: 'System', text: errorMsg, isSelf: false });
                return;
            }

            const translatedText = await translateText(rawText, recipientLang);
            const cleanRecipient = recipient.toLowerCase().trim();
            const recipientSocketId = Object.keys(activeSockets).find(
                id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
            );

            socket.emit('incoming-message', { sender, text: rawText, isSelf: true, originalText: rawText });

            if (recipientSocketId) {
                io.to(recipientSocketId).emit('incoming-message', { sender, text: translatedText, isSelf: false, originalText: rawText });
            }
        } catch (e) {
            console.error("❌ Помилка обробки текстового повідомлення:", e);
        }
    });
