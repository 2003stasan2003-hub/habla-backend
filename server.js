const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Роздаємо статичні файли
app.use(express.static(path.join(__dirname)));

app.post('/api/translate', async (req, res) => {
    const { text, targetLanguage } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: "Текст відсутній" });
    }

    // Беремо ключ із налаштувань Render (перевірте, щоб змінна називалася GEMINI_API_KEY)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "API ключ Gemini не налаштовано на сервері" });
    }

    try {
        let targetLang = targetLanguage || 'English';
        const prompt = `Translate the following text into ${targetLang}. Return ONLY the translated text without any formatting, quotes, or markdown:\n\n${text}`;

        // Прямий запит до офіційного Gemini API без важких бібліотек
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(geminiUrl, {
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
            res.status(500).json({ error: "Не вдалося отримати переклад від Gemini" });
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
