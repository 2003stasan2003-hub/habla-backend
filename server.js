const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Роздача статичних файлів інтерфейсу
app.use(express.static(__dirname));

// Ендпоінт для перекладу через Grok API
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Текст відсутній' });
        }

        // 🔑 Вставте сюди ваш діючий API-ключ від Grok (або він буде братися з налаштувань Render)
        const apiKey = process.env.GROK_API_KEY || 'ВАШ_АКТУАЛЬНИЙ_GROK_API_KEY';

        // Робимо запит до офіційного API xAI (Grok)
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "grok-beta", // Модель Grok (або інша актуальна, наприклад grok-2)
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
            console.error('Помилка Grok API:', data);
            return res.status(500).json({ error: 'Помилка від мовної моделі Grok' });
        }

        // Дістаємо перекладений текст із відповіді Grok
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
