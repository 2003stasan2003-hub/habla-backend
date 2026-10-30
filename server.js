const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// 1. Доступ до файлу перевірки для Android (прибирає адресний рядок)
app.use('/.well-known', express.static('.well-known'));

// 2. Роздача інтерфейсу програми (щоб не було білої сторінки)
app.use(express.static(__dirname));

// 3. Маршрут для перекладу (повертаємо назад, щоб працював чат!)
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        // Тут працює ваша логіка перекладу, яка була раніше
        // Якщо ви використовували якийсь пакет або зовнішній API, вставте його сюди:
        
        // Тимчасова заглушка-відповідь для перевірки, якщо потрібно:
        res.json({ translatedText: `[${targetLanguage}] ${text}` });
    } catch (error) {
        res.status(500).json({ error: 'Translation error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
