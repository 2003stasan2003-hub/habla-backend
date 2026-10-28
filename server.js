const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();

app.use(cors());
app.use(express.json());

// Роздаємо статичні файли (index.html, desktop.html, mobile.html)
app.use(express.static(path.join(__dirname)));

// Ініціалізація Gemini API (ключ автоматично береться зі змінної середовища GEMINI_API_KEY на Render)
const ai = new GoogleGenAI();

app.post('/api/translate', async (req, res) => {
    const { text, targetLanguage } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: "Текст відсутній" });
    }

    try {
        // Формуємо запит до Gemini для перекладу
        const prompt = `Translate the following text into ${targetLanguage || 'English'}. Return ONLY the translated text, without any extra explanations, quotes, or notes:\n\n${text}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        const translatedText = response.text ? response.text.trim() : "Помилка генерації перекладу.";

        res.json({
            detectedLanguage: "auto",
            translatedText: translatedText
        });

    } catch (error) {
        console.error("Помилка Gemini API:", error);
        res.status(500).json({ error: "Помилка сервера під час перекладу через Gemini" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Сервер Habla запущено на порту ${PORT}`);
});
