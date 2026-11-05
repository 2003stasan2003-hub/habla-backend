<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Habla Mobile</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            background-color: #0d0e15;
            color: #e0e0e0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            height: 100vh;
            height: 100dvh;
            overflow: hidden;
        }

        header {
            background: #151823;
            border-bottom: 1px solid #2a2f45;
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 20px rgba(0, 255, 204, 0.05);
            z-index: 10;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .menu-btn {
            background: none;
            border: none;
            color: #00ffcc;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 6px;
            transition: background 0.2s;
        }

        .menu-btn:hover {
            background: rgba(0, 255, 204, 0.1);
        }

        .logo {
            font-size: 1.2rem;
            font-weight: 700;
            color: #00ffcc;
            text-shadow: 0 0 10px rgba(0, 255, 204, 0.4);
            letter-spacing: 0.5px;
        }

        .online-status {
            font-size: 0.85rem;
            color: #a0a5c0;
            background: #1e2233;
            padding: 4px 10px;
            border-radius: 12px;
            border: 1px solid #2f3552;
            cursor: pointer;
            transition: border-color 0.2s;
        }

        .online-status:hover {
            border-color: #00ffcc;
        }

        .lang-panel {
            background: #121520;
            padding: 8px 16px;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid #1f2438;
            font-size: 0.9rem;
        }

        .lang-panel label {
            color: #8a91b4;
        }

        .lang-select {
            background: #1a1e2e;
            color: #00ffcc;
            border: 1px solid #2f3552;
            padding: 6px 12px;
            border-radius: 8px;
            outline: none;
            font-size: 0.9rem;
            cursor: pointer;
        }

        .side-menu {
            position: fixed;
            top: 0;
            left: -280px;
            width: 280px;
            height: 100%;
            background: #121520;
            border-right: 1px solid #2a2f45;
            box-shadow: 5px 0 25px rgba(0, 0, 0, 0.5);
            z-index: 100;
            transition: left 0.3s ease;
            display: flex;
            flex-direction: column;
            padding: 20px;
            gap: 20px;
            overflow-y: auto;
        }

        .side-menu.open {
            left: 0;
        }

        .menu-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #1f2438;
            padding-bottom: 15px;
        }

        .menu-title {
            color: #00ffcc;
            font-size: 1.1rem;
            font-weight: bold;
        }

        .close-menu-btn {
            background: none;
            border: none;
            color: #a0a5c0;
            font-size: 1.3rem;
            cursor: pointer;
        }

        .menu-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .menu-section label {
            font-size: 0.85rem;
            color: #8a91b4;
        }

        .user-badge {
            background: #1a1e2e;
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid #2f3552;
            color: #00ffcc;
            font-weight: 600;
            font-size: 0.95rem;
        }

        .online-users-list {
            background: #1a1e2e;
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid #2f3552;
            color: #e0e0e0;
            font-size: 0.9rem;
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 150px;
            overflow-y: auto;
        }

        .online-user-item {
            color: #00ffcc;
            font-size: 0.9rem;
        }

        .toggle-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #1a1e2e;
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid #2f3552;
        }

        .switch {
            position: relative;
            display: inline-block;
            width: 46px;
            height: 24px;
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #2f3552;
            transition: .3s;
            border-radius: 24px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: #fff;
            transition: .3s;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: #00ffcc;
            box-shadow: 0 0 8px rgba(0, 255, 204, 0.4);
        }

        input:checked + .slider:before {
            transform: translateX(22px);
            background-color: #0d0e15;
        }

        .menu-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6);
            z-index: 99;
            display: none;
        }

        .menu-overlay.active {
            display: block;
        }

        #chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            background: radial-gradient(circle at center, #111422 0%, #0d0e15 100%);
        }

        .message {
            max-width: 80%;
            padding: 10px 14px;
            border-radius: 12px;
            font-size: 0.95rem;
            line-height: 1.4;
            word-break: break-word;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message.incoming {
            background: #1a1e2e;
            color: #e0e0e0;
            align-self: flex-start;
            border-left: 3px solid #7928ca;
        }

        .message.outgoing {
            background: #0056b3;
            color: #fff;
            align-self: flex-end;
            border-right: 3px solid #00ffcc;
        }

        .message .author {
            font-size: 0.75rem;
            color: #a0a5c0;
            margin-bottom: 4px;
            font-weight: 600;
        }

        .input-container {
            background: #151823;
            padding: 12px 16px;
            border-top: 1px solid #2a2f45;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .input-wrapper {
            flex: 1;
            position: relative;
            display: flex;
            align-items: center;
        }

        #message-input {
            width: 100%;
            background: #1a1e2e;
            border: 1px solid #2f3552;
            color: #fff;
            padding: 12px 45px 12px 16px;
            border-radius: 24px;
            outline: none;
            font-size: 0.95rem;
            transition: border-color 0.2s;
        }

        #message-input:focus {
            border-color: #00ffcc;
            box-shadow: 0 0 8px rgba(0, 255, 204, 0.2);
        }

        .mic-button {
            position: absolute;
            right: 10px;
            background: none;
            border: none;
            font-size: 1.2rem;
            cursor: pointer;
            padding: 6px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s, background 0.2s;
        }

        .mic-button:hover {
            background: rgba(255, 255, 255, 0.05);
            transform: scale(1.1);
        }

        .mic-button.listening {
            background-color: rgba(255, 59, 48, 0.2) !important;
            box-shadow: 0 0 12px #ff3b30;
            animation: pulseMic 1.5s infinite;
        }

        @keyframes pulseMic {
            0% { transform: scale(1); }
            50% { transform: scale(1.15); }
            100% { transform: scale(1); }
        }

        .send-button {
            background: linear-gradient(135deg, #00ffcc 0%, #00b894 100%);
            color: #0d0e15;
            border: none;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 10px rgba(0, 255, 204, 0.3);
            transition: transform 0.2s, opacity 0.2s;
            flex-shrink: 0;
        }

        .send-button:active {
            transform: scale(0.95);
        }
    </style>
</head>
<body>

    <header>
        <div class="header-left">
            <button id="menu-btn" class="menu-btn" title="Меню">☰</button>
            <div class="logo">Habla Mobile 3.0</div>
        </div>
        <div id="online-count" class="online-status" title="Натисніть для перегляду списку">Онлайн: 1</div>
    </header>

    <div class="lang-panel">
        <label for="target-lang" id="label-translate-to">Перекладати на:</label>
        <select id="target-lang" class="lang-select">
            <option value="English">English</option>
            <option value="Spanish">Spanish</option>
            <option value="Ukrainian">Ukrainian</option>
            <option value="German">German</option>
            <option value="French">French</option>
        </select>
    </div>

    <div id="menu-overlay" class="menu-overlay"></div>

    <div id="side-menu" class="side-menu">
        <div class="menu-header">
            <span class="menu-title" id="menu-title-text">Налаштування</span>
            <button id="close-menu-btn" class="close-menu-btn">✕</button>
        </div>

        <div class="menu-section">
            <label id="label-profile">Ваш профіль</label>
            <div id="user-display" class="user-badge">Гість</div>
        </div>

        <div class="menu-section">
            <label id="label-online-users">Користувачі онлайн</label>
            <div id="online-users-list" class="online-users-list">
                <span class="online-user-item">Завантаження...</span>
            </div>
        </div>

        <div class="menu-section">
            <label for="interface-lang" id="label-interface-lang">Мова інтерфейсу:</label>
            <select id="interface-lang" class="lang-select">
                <option value="Ukrainian">Ukrainian</option>
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="German">German</option>
                <option value="French">French</option>
            </select>
        </div>

        <div class="menu-section">
            <label id="label-voice-over">Озвучування перекладу</label>
            <div class="toggle-container">
                <span id="label-enable-sound" style="font-size: 0.9rem; color: #e0e0e0;">Увімкнути звук</span>
                <label class="switch">
                    <input type="checkbox" id="sound-toggle" checked>
                    <span class="slider"></span>
                </label>
            </div>
        </div>
    </div>

    <div id="chat-messages"></div>

    <div class="input-container">
        <div class="input-wrapper">
            <input type="text" id="message-input" placeholder="Введіть повідомлення або скажіть..." autocomplete="off">
            <button id="mic-btn" class="mic-button" title="Голосовий ввід">🎤</button>
        </div>
        <button id="send-btn" class="send-button" title="Відправити">➤</button>
    </div>

    <script>
        const socket = io();

        let availableVoices = [];
        function populateVoiceList() {
            if (typeof speechSynthesis === 'undefined') {
                return;
            }
            availableVoices = speechSynthesis.getVoices();
        }
        populateVoiceList();
        if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = populateVoiceList;
        }

        const ttsLangMap = {
            'Ukrainian': 'uk-UA',
            'English': 'en-US',
            'Spanish': 'es-ES',
            'German': 'de-DE',
            'French': 'fr-FR'
        };

        const translations = {
            Ukrainian: {
                settings: "Налаштування",
                profile: "Ваш профіль",
                onlineUsersTitle: "Користувачі онлайн",
                interfaceLang: "Мова інтерфейсу",
                voiceOver: "Озвучування перекладу",
                enableSound: "Увімкнути звук",
                translateTo: "Перекладати на:",
                online: "Онлайн",
                placeholder: "Введіть повідомлення або скажіть...",
                guest: "Гість"
            },
            English: {
                settings: "Settings",
                profile: "Your profile",
                onlineUsersTitle: "Online users",
                interfaceLang: "Interface language",
                voiceOver: "Translation voiceover",
                enableSound: "Enable sound",
                translateTo: "Translate to:",
                online: "Online",
                placeholder: "Type a message or speak...",
                guest: "Guest"
            },
            Spanish: {
                settings: "Configuración",
                profile: "Tu perfil",
                onlineUsersTitle: "Usuarios en línea",
                interfaceLang: "Idioma de la interfaz",
                voiceOver: "Locución de traducción",
                enableSound: "Activar sonido",
                translateTo: "Traducir a:",
                online: "En línea",
                placeholder: "Escribe un mensaje o habla...",
                guest: "Invitado"
            },
            German: {
                settings: "Einstellungen",
                profile: "Ihr Profil",
                onlineUsersTitle: "Online-Benutzer",
                interfaceLang: "Benutzeroberflächensprache",
                voiceOver: "Übersetzungs-Sprachausgabe",
                enableSound: "Ton einschalten",
                translateTo: "Übersetzen in:",
                online: "Online",
                placeholder: "Nachricht eingeben oder sprechen...",
                guest: "Gast"
            },
            French: {
                settings: "Paramètres",
                profile: "Votre profil",
                onlineUsersTitle: "Utilisateurs en ligne",
                interfaceLang: "Langue de l'interface",
                voiceOver: "Voix de traduction",
                enableSound: "Activer le son",
                translateTo: "Traduire vers :",
                online: "En ligne",
                placeholder: "Tapez un message ou parlez...",
                guest: "Invité"
            }
        };

        let username = prompt("Введіть ваш нікнейм:") || "Гість";
        username = username.trim();

        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        const chatMessages = document.getElementById('chat-messages');
        const targetLangSelect = document.getElementById('target-lang');
        const interfaceLangSelect = document.getElementById('interface-lang');
        const onlineCount = document.getElementById('online-count');
        const micBtn = document.getElementById('mic-btn');
        
        const menuBtn = document.getElementById('menu-btn');
        const closeMenuBtn = document.getElementById('close-menu-btn');
        const sideMenu = document.getElementById('side-menu');
        const menuOverlay = document.getElementById('menu-overlay');
        const userDisplay = document.getElementById('user-display');
        const onlineUsersList = document.getElementById('online-users-list');
        const soundToggle = document.getElementById('sound-toggle');

        const labelTranslateTo = document.getElementById('label-translate-to');
        const menuTitleText = document.getElementById('menu-title-text');
        const labelProfile = document.getElementById('label-profile');
        const labelOnlineUsers = document.getElementById('label-online-users');
        const labelInterfaceLang = document.getElementById('label-interface-lang');
        const labelVoiceOver = document.getElementById('label-voice-over');
        const labelEnableSound = document.getElementById('label-enable-sound');

        let currentOnlineCount = 1;

        function updateInterfaceTexts() {
            const lang = interfaceLangSelect.value;
            const t = translations[lang] || translations.Ukrainian;

            menuTitleText.textContent = t.settings;
            labelProfile.textContent = t.profile;
            labelOnlineUsers.textContent = t.onlineUsersTitle;
            labelInterfaceLang.textContent = t.interfaceLang;
            labelVoiceOver.textContent = t.voiceOver;
            labelEnableSound.textContent = t.enableSound;
            labelTranslateTo.textContent = t.translateTo;
            messageInput.placeholder = t.placeholder;
            onlineCount.textContent = `${t.online}: ${currentOnlineCount}`;
        }

        interfaceLangSelect.addEventListener('change', updateInterfaceTexts);

        userDisplay.textContent = username;
        socket.emit('join', username);

        function openMenu() {
            sideMenu.classList.add('open');
            menuOverlay.classList.add('active');
        }

        function closeMenu() {
            sideMenu.classList.remove('open');
            menuOverlay.classList.remove('active');
        }

        menuBtn.addEventListener('click', openMenu);
        onlineCount.addEventListener('click', openMenu);
        closeMenuBtn.addEventListener('click', closeMenu);
        menuOverlay.addEventListener('click', closeMenu);

        function sendMessage() {
            const text = messageInput.value.trim();
            if (!text) return;

            const targetLang = targetLangSelect.value;

            socket.emit('chatMessage', {
                text: text,
                targetLang: targetLang,
                user: username
            });

            messageInput.value = '';
            messageInput.focus();
        }

        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        socket.on('chatMessage', (data) => {
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message');
            
            const isSelf = data.user === username;
            messageDiv.classList.add(isSelf ? 'outgoing' : 'incoming');

            let htmlContent = `<div class="author">${escapeHtml(data.user)}</div>`;
            htmlContent += `<div>${escapeHtml(data.text)}</div>`;

            messageDiv.innerHTML = htmlContent;
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            if (soundToggle.checked && 'speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(data.text);
                const selectedLangCode = ttsLangMap[targetLangSelect.value] || 'uk-UA';
                utterance.lang = selectedLangCode;
                
                if (availableVoices.length > 0) {
                    const langVoices = availableVoices.filter(v => v.lang.startsWith(selectedLangCode.split('-')[0]));
                    if (langVoices.length > 0) {
                        const bestVoice = langVoices.find(v => v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Natural')) || langVoices[0];
                        utterance.voice = bestVoice;
                    }
                }
                
                window.speechSynthesis.speak(utterance);
            }
        });

        socket.on('onlineCount', (count) => {
            currentOnlineCount = count;
            const lang = interfaceLangSelect.value;
            const t = translations[lang] || translations.Ukrainian;
            onlineCount.textContent = `${t.online}: ${count}`;
        });

        socket.on('update-users', (users) => {
            onlineUsersList.innerHTML = '';
            users.forEach(user => {
                const userDiv = document.createElement('div');
                userDiv.classList.add('online-user-item');
                userDiv.textContent = `• ${user}`;
                onlineUsersList.appendChild(userDiv);
            });
        });

        function escapeHtml(text) {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, function(m) { return map[m]; });
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.warn("Speech Recognition API не підтримується цим браузером.");
            micBtn.style.display = 'none';
        } else {
            const recognition = new SpeechRecognition();
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
            let isListening = false;

            micBtn.addEventListener('click', () => {
                if (isListening) {
                    recognition.stop();
                    return;
                }

                recognition.lang = 'uk-UA'; 

                try {
                    recognition.start();
                } catch (e) {
                    console.error("Помилка запуску розпізнавання:", e);
                }
            });

            recognition.onstart = () => {
                isListening = true;
                micBtn.classList.add('listening');
                micBtn.textContent = "🔴";
            };

            recognition.onresult = (event) => {
                const speechText = event.results[0][0].transcript;
                messageInput.value += (messageInput.value ? ' ' : '') + speechText;
                messageInput.focus();
            };

            recognition.onerror = (event) => {
                console.error("Помилка мікрофона:", event.error);
                stopListeningState();
            };

            recognition.onend = () => {
                stopListeningState();
            };

            function stopListeningState() {
                isListening = false;
                micBtn.classList.remove('listening');
                micBtn.textContent = "🎤";
            }
        }
    </script>
</body>
</html>
