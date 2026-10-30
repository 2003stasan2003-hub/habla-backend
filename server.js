const express = require('express');
const cors = require('cors');
const app = express();

// Базові налаштування сервера
app.use(cors());
app.use(express.json());

// Роздача статичних файлів фронтенду (index.html тощо)
app.use(express.static(__dirname));

// Повноцінний маршрут для перекладу повідомлень
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Текст для перекладу відсутній' });
        }

        // 👉 ТУТ знаходиться інтеграція з вашою моделлю/API перекладу, 
        // яка була налаштована раніше (наприклад, виклик Gemini Flash або іншого API).
        // Якщо ви використовували прямий запит до моделі, вставте його тут.

        // Поки що для стабільності повертаємо структуру відповіді, яку очікує фронтенд:
        // (Замініть цей рядок на ваш робочий виклик моделі, якщо потрібно)
        const translatedText = `[Переклад на ${targetLanguage}]: ${text}`;

        res.json({ translatedText });

    } catch (error) {
        console.error('Помилка сервера при перекладі:', error);
        res.status(500).json({ error: 'Помилка сервера при перекладі.' });
    }
});

// Запуск сервера на порту Render або локально
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
