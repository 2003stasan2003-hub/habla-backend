import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());

// Роздаємо статичні файли (наприклад, ваш index.html з кореня або папки public)
app.use(express.static(__dirname));

// Ініціалізація Groq SDK (ключ береться з безпечних змінних середовища Render)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Ендпоінт для перекладу
app.post('/api/translate', async (req, res) => {
    try {
        const { text, sourceLang, targetLang } = req.body;

        if (!text) {
            return res.status(400).json({ error: "Text is required" });
        }

        // Перетворюємо код мови на зрозумілу для моделі назву
        let targetLanguageName = "Spanish"; // за замовчуванням
        if (targetLang === 'es-ES') targetLanguageName = "Spanish";
        else if (targetLang === 'uk-UA') targetLanguageName = "Ukrainian";
        else if (targetLang === 'en-US' || targetLang === 'en-GB') targetLanguageName = "English";
        else if (targetLang === 'de-DE') targetLanguageName = "German";
        else if (targetLang === 'pl-PL') targetLanguageName = "Polish";

        // Робимо запит до Groq API з використанням легкої моделі qwen/qwen3.8-27b
        const completion = await groq.chat.completions.create({
            model: "qwen/qwen3.8-27b",
            messages: [
                {
                    role: "system",
                    content: `You are a professional translator. Translate the given text accurately and naturally into ${targetLanguageName}. Return ONLY the translated text without any extra comments, explanations, or quotation marks.`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0.3,
            max_tokens: 300
        });

        const translatedText = completion.choices[0]?.message?.content?.trim() || "Помилка перекладу";
        
        // Повертаємо результат на мобільний додаток
        res.json({ translatedText });

    } catch (error) {
        console.error("Помилка сервера при перекладі:", error);
        res.status(500).json({ error: "Server translation error" });
    }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер Habla Mobile запущено на порту ${PORT}`);
});
