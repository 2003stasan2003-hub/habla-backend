const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Дозвіл для Android приховати адресний рядок
app.use('/.well-known', express.static('.well-known'));
// Роздача інтерфейсу програми
app.use(express.static(__dirname));

// Маршрут для миттєвого перекладу
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        if (!text) return res.status(400).json({ error: 'Текст відсутній' });

        // 🔑 Якщо ваш ключ зберігається на Render у змінних середовища, він підтягнеться автоматично.
        // Якщо ні, вставте ваш GROQ API KEY замість слова 'ВАШ_GROQ_API_KEY'
        const apiKey = process.env.GROQ_API_KEY || 'ВАШ_GROQ_API_KEY';

        // Запит до Groq API (куди підключені Llama та Qwen)
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                // Тут вказана надшвидка модель. Якщо ви використовуєте конкретну версію Qwen, впишіть її сюди:
                model: "llama-3.1-8b-instant", 
                messages: [
                    {
                        role: "system",
                        content: `You are a professional translator. Translate the given text accurately into ${targetLanguage}. Return ONLY the translation.`
                    },
                    { role: "user", content: text }
                ]
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Помилка API:', data);
            return res.status(500).json({ error: 'Помилка мовної моделі' });
        }

        const translatedText = data.choices[0].message.content.trim();
        res.json({ translatedText });

    } catch (error) {
        console.error('Помилка сервера:', error);
        res.status(500).json({ error: 'Помилка сервера при перекладі.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
