const AVAILABLE_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768"
];

async function translateText(text, targetLanguage) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !text || !targetLanguage) return text;

    for (const modelName of AVAILABLE_MODELS) {
        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { role: "system", content: `Translate into ${targetLanguage}. Return ONLY the translated text.` },
                        { role: "user", content: text }
                    ],
                    max_tokens: 250
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Якщо все добре — оновлюємо ліміти і повертаємо переклад
                return data.choices[0].message.content.trim();
            } else {
                console.warn(`⚠️ Модель ${modelName} не спрацювала, пробуємо наступну...`);
            }
        } catch (err) {
            console.warn(`⚠️ Помилка з моделлю ${modelName}:`, err.message);
        }
    }

    // Якщо жодна модель не спрацювала — повертаємо оригінал і сигналізуємо в адмінку
    io.emit('groq-status', { status: 'error', message: 'Всі моделі недоступні!' });
    return text;
}
