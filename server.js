const express = require('express');
const cors = require('cors');
const app = express();

// Базові налаштування сервера
app.use(cors());
app.use(express.json());

// 👉 ОСЬ ЦЕЙ РЯДОК відкриває доступ до вашого файлу assetlinks.json для Android
app.use('/.well-known', express.static('.well-known'));

// Порт для Render або локального запуску
const PORT = process.env.PORT || 3000;

// (Якщо у вас тут є інші ендпоінти, наприклад /api/translate, вони залишаються нижче)

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
