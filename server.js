const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Роздаємо всі статичні файли (index.html, desktop.html, mobile.html) з папки проєкту
app.use(express.static(path.join(__dirname)));

// Ваш поточний API для перекладу
app.post('/api/translate', (req, res) => {
    const { text, targetLanguage } = req.body;
    // Логіка перекладу, яка у вас вже була
    res.json({
        detectedLanguage: "en",
        translatedText: "Перекладено: " + text
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Сервер Habla запущено на порту ${PORT}`);
});