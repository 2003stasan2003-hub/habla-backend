const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());
app.use(cors());

// Ініціалізація Gemini з вашим ключем з Render
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Текст для перекладу відсутній.' });
        }

        // Використовуємо найстабільнішу модель
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `Task: 
1. Automatically detect the source language of the following text.
2. Translate it into "${targetLanguage || 'English'}".
3. Return the result strictly in JSON format with two fields: "detectedLanguage" and "translatedText".

Text to process: "${text}"`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let rawResponse = response.text();
        
        // Очищення від markdown-тегів якщо вони є
        rawResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const resultData = JSON.parse(rawResponse);
        res.json(resultData);

    } catch (error) {
        console.error('Помилка сервера:', error);
        res.status(500).json({ error: 'Помилка під час обробки запиту ШІ.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер Habla запущено на порту ${PORT}`);
});