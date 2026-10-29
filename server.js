const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Роздаємо статичні файли (index.html, desktop.html, mobile.html)
app.use(express.static(path.join(__dirname)));

// Перевірка працездатності сервера
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Список моделей за пріоритетом. Якщо перша не працює — сервер автоматично спробує наступну.
const CANDIDATE_MODELS = [
    "llama-3.1-8b-instant",
    "llama-3.2-3b-preview",
    "llama-3.3-70b-versatile",
    "gemma2-9b-it",
    "llama3-8b-8192"
];

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

        let translatedText = null;
        let lastError = null;

        // Цикл автоматичного перебору моделей
        for (const model of CANDIDATE_MODELS) {
            try {
                console.log(`Спроба перекладу через модель: ${model}...`);
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: "user", content: prompt }]
                    })
                });

                const data = await response.json();

                if (response.ok && data.choices && data.choices[0] && data.choices[0].message) {
                    translatedText = data.choices[0].message.content.trim();
                    console.log(`Успішно перекладено через модель: ${model}`);
                    break; // Вдалося перекласти — перериваємо цикл і віддаємо результат
                } else {
                    console.warn(`Модель ${model} недоступна (${data.error?.code || 'помилка'}). Переходимо до наступної...`);
                    lastError = data.error?.message || "Помилка відповіді";
                }
            } catch (err) {
                console.warn(`Помилка запиту до ${model}:`, err.message);
                lastError = err.message;
            }
        }

        if (translatedText) {
            return res.json({ detectedLanguage: "auto", translatedText });
        } else {
            console.error("Усі моделі зі списку повернули помилку.");
            return res.status(500).json({ error: `Жодна модель не відповіла. Остання помилка: ${lastError}` });
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
