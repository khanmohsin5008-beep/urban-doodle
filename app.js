const UI = {
    body: document.body,
    chat: document.getElementById('chat'),
    statusLabel: document.getElementById('statusLabel'),
    latencyBadge: document.getElementById('latencyBadge'),
    modelBadge: document.getElementById('modelBadge'),
    statusBar: document.getElementById('statusBar'),
    statusBarText: document.getElementById('statusBarText'),
    stopSpeakBtn: document.getElementById('stopSpeakBtn'),
    textInput: document.getElementById('textInput'),
    sendBtn: document.getElementById('sendBtn'),
    micBtn: document.getElementById('micBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    proxyUrlInput: document.getElementById('proxyUrlInput'),
    modelInput: document.getElementById('modelInput'),
    voiceToggle: document.getElementById('voiceToggle'),
    recogLangSelect: document.getElementById('recogLangSelect'),
    voiceSelect: document.getElementById('voiceSelect'),
    toggleKeyVisBtn: document.getElementById('toggleKeyVisBtn')
};

let config = {
    apiKey: localStorage.getItem('jarvis_apiKey') || '',
    proxyUrl: localStorage.getItem('jarvis_proxyUrl') || '',
    model: localStorage.getItem('jarvis_model') || 'gemini-1.5-flash',
    speak: localStorage.getItem('jarvis_speak') !== 'false',
    recogLang: localStorage.getItem('jarvis_recogLang') || 'en-IN',
    voiceUri: localStorage.getItem('jarvis_voiceUri') || ''
};

let chatHistory = JSON.parse(localStorage.getItem('jarvis_history')) || [];
let recognition = null;
let synth = window.speechSynthesis;
let isSpeaking = false;
let requestStartTime = 0;

function init() {
    loadSettingsUI();
    populateVoices();
    synth.onvoiceschanged = populateVoices;
    renderHistory();
    setupEventListeners();
    updateState('idle');
}

function getSystemPrompt() {
    return `You are JARVIS, a highly intelligent personal AI assistant. 
CREATOR & BOSS: Mohsin Khan.
LOCATION: Chhatrapati Sambhajinagar, Maharashtra, India.
CURRENT TIME: ${new Date().toLocaleString('en-IN')}.
EXPERTISE: AI Content Creation (Cinematic videos, 4K/8K, Goku/Anime concepts), YouTube Shorts strategy (CTR, AVD, viral hooks, SEO), and Marvel universe.
RULES FOR REPLYING:
1. Address Mohsin as "Boss", "Mohsin Boss", or "Mohsin".
2. Speak naturally like a smart AI friend in conversational Hinglish. Understand imperfect dictation context.
3. Keep normal answers concise (1-4 sentences) and extremely fast. Provide detailed scripts/prompts ONLY when specifically asked.
4. Plain text only. NO markdown, NO asterisks, NO bullet points, NO complex tables. Output must be readable by TTS perfectly.
5. Never pretend to be human. Maintain conversational context from history.`;
}

function updateState(state, statusText = '') {
    UI.body.setAttribute('data-status', state);
    UI.statusLabel.innerText = state.toUpperCase();
    if (statusText) {
        UI.statusBar.classList.remove('hidden');
        UI.statusBarText.innerText = statusText;
    } else {
        UI.statusBar.classList.add('hidden');
    }
}

function populateVoices() {
    const voices = synth.getVoices();
    UI.voiceSelect.innerHTML = '';
    voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} (${v.lang})`;
        if (v.voiceURI === config.voiceUri || v.name.includes('Google हिन्दी') || v.lang.includes('hi-IN')) {
            opt.selected = true;
            config.voiceUri = v.voiceURI;
        }
        UI.voiceSelect.appendChild(opt);
    });
}

function speak(text) {
    if (!config.speak) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const selectedVoice = voices.find(v => v.voiceURI === config.voiceUri);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 1.15;
    
    utterance.onstart = () => { isSpeaking = true; updateState('speaking', 'Speaking...'); UI.stopSpeakBtn.classList.remove('hidden'); };
    utterance.onend = () => { isSpeaking = false; updateState('idle'); UI.stopSpeakBtn.classList.add('hidden'); };
    utterance.onerror = () => { isSpeaking = false; updateState('idle'); UI.stopSpeakBtn.classList.add('hidden'); };
    
    synth.speak(utterance);
}

UI.stopSpeakBtn.addEventListener('click', () => { synth.cancel(); updateState('idle'); });

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = text;
    UI.chat.appendChild(div);
    UI.chat.scrollTop = UI.chat.scrollHeight;
    if(role === 'user') {
        chatHistory.push({ role: "user", parts: [{ text }] });
    } else {
        chatHistory.push({ role: "model", parts: [{ text }] });
    }
    // Keep last 10 messages for context window size limits
    if(chatHistory.length > 10) chatHistory = chatHistory.slice(chatHistory.length - 10);
    localStorage.setItem('jarvis_history', JSON.stringify(chatHistory));
}

function renderHistory() {
    UI.chat.innerHTML = '';
    chatHistory.forEach(msg => {
        const div = document.createElement('div');
        div.className = `msg ${msg.role === 'user' ? 'user' : 'ai'}`;
        div.textContent = msg.parts[0].text;
        UI.chat.appendChild(div);
    });
    setTimeout(() => UI.chat.scrollTop = UI.chat.scrollHeight, 100);
}

async function handleSend(text) {
    if (!text.trim()) return;
    UI.textInput.value = '';
    appendMessage('user', text);
    synth.cancel();
    updateState('thinking', 'Processing context...');
    requestStartTime = Date.now();
    
    if (!config.apiKey && !config.proxyUrl) {
        appendMessage('ai', "Boss, API key ya Proxy set nahi hai. Settings check karo.");
        updateState('idle');
        return;
    }

    const payload = {
        model: config.model,
        contents: chatHistory,
        systemInstruction: { parts: { text: getSystemPrompt() } },
        generationConfig: { maxOutputTokens: 250, temperature: 0.7 }
    };

    let fetchUrl = config.proxyUrl;
    if (!fetchUrl) {
        fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    }

    try {
        const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        let reply = data.candidates[0].content.parts[0].text;
        reply = reply.replace(/[*#_[\]]/g, '').trim(); // Sanitize for speech
        
        UI.latencyBadge.innerText = `${Date.now() - requestStartTime}ms`;
        appendMessage('model', reply);
        speak(reply);

    } catch (err) {
        console.error(err);
        appendMessage('model', "Connection error aa raha hai Boss. Network ya API key check karo.");
        updateState('idle');
    }
}

function toggleMic() {
    if (isSpeaking) { synth.cancel(); }
    
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) { alert("Browser voice input support nahi karta. Chrome use karo."); return; }
    
    if (recognition) { recognition.stop(); recognition = null; updateState('idle'); return; }
    
    recognition = new SpeechRec();
    recognition.lang = config.recogLang;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => updateState('listening', 'Listening to Boss...');
    recognition.onresult = (e) => {
        let transcript = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
            transcript += e.results[i][0].transcript;
        }
        UI.statusBarText.innerText = `"${transcript}"`;
        if (e.results[0].isFinal) {
            recognition.stop();
            recognition = null;
            handleSend(transcript);
        }
    };
    recognition.onerror = () => { recognition = null; updateState('idle'); };
    recognition.onend = () => { recognition = null; if (UI.body.getAttribute('data-status') === 'listening') updateState('idle'); };
    
    recognition.start();
}

function loadSettingsUI() {
    UI.apiKeyInput.value = config.apiKey;
    UI.proxyUrlInput.value = config.proxyUrl;
    UI.modelInput.value = config.model;
    UI.voiceToggle.checked = config.speak;
    UI.recogLangSelect.value = config.recogLang;
    UI.modelBadge.innerText = config.model;
}

function saveSettings() {
    config.apiKey = UI.apiKeyInput.value.trim();
    config.proxyUrl = UI.proxyUrlInput.value.trim();
    config.model = UI.modelInput.value.trim() || 'gemini-1.5-flash';
    config.speak = UI.voiceToggle.checked;
    config.recogLang = UI.recogLangSelect.value;
    config.voiceUri = UI.voiceSelect.value;

    localStorage.setItem('jarvis_apiKey', config.apiKey);
    localStorage.setItem('jarvis_proxyUrl', config.proxyUrl);
    localStorage.setItem('jarvis_model', config.model);
    localStorage.setItem('jarvis_speak', config.speak);
    localStorage.setItem('jarvis_recogLang', config.recogLang);
    localStorage.setItem('jarvis_voiceUri', config.voiceUri);
    
    UI.modelBadge.innerText = config.model;
    UI.settingsOverlay.classList.add('hidden');
}

function setupEventListeners() {
    UI.sendBtn.addEventListener('click', () => handleSend(UI.textInput.value));
    UI.textInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(UI.textInput.value); } });
    UI.micBtn.addEventListener('click', toggleMic);
    document.querySelector('.core-orb').addEventListener('click', toggleMic);
    
    UI.settingsBtn.addEventListener('click', () => UI.settingsOverlay.classList.remove('hidden'));
    UI.closeSettingsBtn.addEventListener('click', () => UI.settingsOverlay.classList.add('hidden'));
    UI.saveSettingsBtn.addEventListener('click', saveSettings);
    
    UI.toggleKeyVisBtn.addEventListener('click', () => {
        UI.apiKeyInput.type = UI.apiKeyInput.type === 'password' ? 'text' : 'password';
    });
    
    UI.clearChatBtn.addEventListener('click', () => {
        chatHistory = [];
        localStorage.removeItem('jarvis_history');
        renderHistory();
        UI.settingsOverlay.classList.add('hidden');
    });
}

window.addEventListener('DOMContentLoaded', init);
