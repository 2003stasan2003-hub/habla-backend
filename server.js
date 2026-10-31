import Groq from "groq-sdk";

// Ініціалізація Groq SDK із перевіркою наявності ключа
const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
  console.warn("⚠️ УВАГА: GROQ_API_KEY не налаштовано в змінних середовища!");
}

const groq = new Groq({ apiKey: groqApiKey });

// Покращена функція перекладу
async function translateText(text, targetLanguage) {
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is missing on server");
  }

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a professional translator. Translate the following text accurately into ${targetLanguage}. Return ONLY the translated text without any extra explanations, formatting, or introductory phrases.`
      },
      {
        role: "user",
        content: text
      }
    ],
    temperature: 0.2,
  });
  
  return completion.choices[0]?.message?.content?.trim() || text;
}

// Гнучкий HTTP-ендпоінт перекладу з підтримкою різних варіантів назв полів
app.post("/api/translate", async (req, res) => {
  try {
    // Підтримуємо різні варіанти написання параметрів від клієнта (text/message, targetLanguage/target_language)
    const text = req.body.text || req.body.message;
    const targetLanguage = req.body.targetLanguage || req.body.target_language || req.body.language || "English";

    if (!text) {
      return.status(400).json({ error: "Відсутній текст для перекладу (text)" });
    }

    console.log(`[Translate] Запит перекладу на мову: "${targetLanguage}" для тексту: "${text.substring(0, 30)}..."`);

    const translatedText = await translateText(text, targetLanguage);
    
    // Повертаємо результат у форматі, який очікує мобільний додаток
    res.json({ 
      success: true, 
      translatedText: translatedText,
      translation: translatedText // дублюємо для сумісності з різними варіантами клієнта
    });

  } catch (error) {
    console.error("❌ Помилка сервера при перекладі:", error.message || error);
    res.status(500).json({ 
      success: false, 
      error: "Помилка сервера при перекладі" 
    });
  }
});
