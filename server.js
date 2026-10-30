const express = require('express');
const cors = require('cors');
const app = express();

// Базові налаштування
app.use(cors());
app.use(express.json());

// Роздача файлів фронтенду (index.html, стилі тощо)
app.use(express.static(__dirname));

// Ендпоінт для перекладу повідомлень у Хабла 3.0
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        
        // Тут виконується логіка перекладу або інтеграція з API
        // Повертаємо успішний результат назад у чат:
        res.json({ translatedText: text }); 

    } catch (error) {
        console.error('Translation error:', error);
        res.status(500).json({ error: 'Помилка сервера при перекладі' });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
