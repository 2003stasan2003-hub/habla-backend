const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// Базові налаштування сервера
app.use(cors());
app.use(express.json());

// 1. Відкриваємо доступ до файлу перевірки для Android (прибирає рядок браузера)
app.use('/.well-known', express.static('.well-known'));

// 2. ДОДАЛИ ЦЕЙ РЯДОК: робимо так, щоб сервер показував index.html та інші файли інтерфейсу
app.use(express.static(__dirname));

// Порт для Render або локального запуску
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
