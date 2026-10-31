const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Роздача файлів для Android (assetlinks) та інтерфейсу
app.use('/.well-known', express.static('.well-known'));
app.use(express.static(__dirname));

// Маршрут для перекладу на льоту через Groq API
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Текст відсутній' });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API ключ Groq не знайдено на сервері' });
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", // Стабільна та потужна модель Groq
                messages: [
                    {
                        role: "system",
                        content: `You are a professional translator. Translate the given text accurately and naturally into ${targetLanguage}. Return ONLY the translated text without any extra notes, formatting, or introductory phrases.`
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                temperature: 0.3
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Помилка Groq API:', data);
            return res.status(500).json({ error: 'Помилка від мовної моделі Groq' });
        }

        const translatedText = data.choices && data.choices[0] && data.choices[0].message 
            ? data.choices[0].message.content.trim() 
            : text;

        res.json({ translatedText });

    } catch (error) {
        console.error('Помилка сервера:', error);
        res.status(500).json({ error: 'Помилка сервера при перекладі.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
