const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json());
app.use(cors());

// Ініціалізація Gemini SDK з вашим ключем
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Текст для перекладу відсутній.' });
        }

        // Промпт для автовизначення мови та перекладу
        const prompt = `Task: 
1. Automatically detect the source language of the following text.
2. Translate it into "${targetLanguage || 'English'}".
3. Return the result strictly in JSON format with two fields: "detectedLanguage" and "translatedText".

Text to process: "${text}"`;

        // Використовуємо стабільну швидку модель Flash
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
        });

        let rawResponse = response.text;
        
        // Очищення від markdown-тегів якщо вони є
        rawResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const resultData = JSON.parse(rawResponse);
        res.json(resultData);

    } catch (error) {
        console.error('Помилка сервера:', error);
        res.status(5005).json({ error: 'Помилка під час обробки запиту ШІ.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер Habla 1.0 запущено на порту ${PORT}`);
});