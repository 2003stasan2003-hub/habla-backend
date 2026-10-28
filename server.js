const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Роздаємо статичні файли
app.use(express.static(path.join(__dirname)));

// Простий шлях перевірки, щоб Render бачив, що сервер живий
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: "Текст відсутній" });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("Помилка: GEMINI_API_KEY не знайдено в Environment!");
            return res.status(500).json({ error: "Ключ API не налаштовано на сервері" });
        }

        const targetLang = targetLanguage || 'English';
        const prompt = `Translate the following text into ${targetLang}. Return ONLY the translated text without any formatting, quotes, or notes:\n\n${text}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        if (data.candidates && data.candidates[0].content.parts[0].text) {
            const translatedText = data.candidates[0].content.parts[0].text.trim();
            res.json({ detectedLanguage: "auto", translatedText });
        } else {
            console.error("Несподівана відповідь від Gemini:", data);
            res.status(500).json({ error: "Помилка обробки від Gemini" });
        }

    } catch (error) {
        console.error("Критична помилка сервера:", error.message);
        res.status(500).json({ error: "Серверна помилка під час перекладу" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Сервер Habla успішно запущено на порту ${PORT}`);
});
