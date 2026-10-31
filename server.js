const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Дозвіл для Android та роздача файлів
app.use('/.well-known', express.static('.well-known'));
app.use(express.static(__dirname));

// Маршрут для перекладу через Groq API
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        if (!text) return res.status(400).json({ error: 'Текст відсутній' });

        // Шукаємо ваш ключ GROQ, який збережено на Render
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
                model: "llama-3.3-70b-versatile", // Потужна модель від Groq
                messages: [
                    {
                        role: "system",
                        content: `You are a professional translator. Translate the given text accurately and naturally into ${targetLanguage}. Return ONLY the translated text without any extra notes or formatting.`
                    },
                    { role: "user", content: text }
                ]
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Помилка Groq API:', data);
            return res.status(500).json({ error: 'Помилка мовної моделі Groq' });
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
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
