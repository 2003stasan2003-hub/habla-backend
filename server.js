const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Роздаємо статичні файли
app.use(express.static(path.join(__dirname)));

// Перевірка працездатності сервера
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: "Текст відсутній" });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            console.error("Помилка: GROQ_API_KEY не знайдено в Environment!");
            return res.status(500).json({ error: "API ключ Groq не налаштовано на сервері" });
        }

        const targetLang = targetLanguage || 'English';
        const prompt = `Translate the following text into ${targetLang}. Return ONLY the translated text without any formatting, quotes, or markdown:\n\n${text}`;

        const url = `https://api.groq.com/openai/v1/chat/completions`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: prompt }]
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0].message && data.choices[0].message.content) {
            const translatedText = data.choices[0].message.content.trim();
            res.json({ detectedLanguage: "auto", translatedText });
        } else {
            console.error("Несподівана відповідь від Groq:", data);
            res.status(500).json({ error: "Помилка обробки від Groq" });
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
