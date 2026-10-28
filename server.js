const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Роздаємо статичні файли (index.html, desktop.html, mobile.html)
app.use(express.static(path.join(__dirname)));

// Реальний ендпоинт для перекладу через публічний API
app.post('/api/translate', async (req, res) => {
    const { text, targetLanguage } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: "Текст відсутній" });
    }

    try {
        let langCode = 'en';
        if (targetLanguage === 'Spanish') langCode = 'es';
        else if (targetLanguage === 'Ukrainian') langCode = 'uk';
        else if (targetLanguage === 'German') langCode = 'de';
        else if (targetLanguage === 'French') langCode = 'fr';
        else if (targetLanguage === 'English') langCode = 'en';

        const encodedText = encodeURIComponent(text);
        const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=uk|${langCode}`;

        const fetchModule = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        const response = await fetchModule(url);
        const data = await response.json();

        if (data && data.responseData && data.responseData.translatedText) {
            res.json({
                detectedLanguage: "uk",
                translatedText: data.responseData.translatedText
            });
        } else {
            res.json({
                detectedLanguage: "uk",
                translatedText: "Помилка перекладу від сервісу."
            });
        }
    } catch (error) {
        console.error("Помилка сервера:", error);
        res.status(500).json({ error: "Помилка сервера під час перекладу" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Сервер Habla запущено на порту ${PORT}`);
});
