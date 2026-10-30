const express = require('express');
const cors = require('cors');
const app = express();

// Базові налаштування сервера
app.use(cors());
app.use(express.json());

// Ендпоінт для перекладу повідомлень у чаті
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        
        // Тут виконується логіка перекладу (або ваш попередній код обробки)
        // Повертаємо перекладений текст назад у додаток:
        res.json({ translatedText: text }); 

    } catch (error) {
        console.error('Translation error:', error);
        res.status(500).json({ error: 'Translation error' });
    }
});

// Запуск сервера на порту Render або локально
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
