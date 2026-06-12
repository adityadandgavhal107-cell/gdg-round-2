// src/core/VoiceAssistant.js

const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', label: 'English (India)',   flag: '🇮🇳' },
  { code: 'hi-IN', label: 'हिन्दी',             flag: '🇮🇳' },
  { code: 'en-US', label: 'English (US)',       flag: '🇺🇸' },
  { code: 'en-GB', label: 'English (UK)',       flag: '🇬🇧' },
  { code: 'fr-FR', label: 'Français',           flag: '🇫🇷' },
  { code: 'de-DE', label: 'Deutsch',            flag: '🇩🇪' },
  { code: 'es-ES', label: 'Español',            flag: '🇪🇸' },
  { code: 'ar-SA', label: 'العربية',            flag: '🇸🇦' },
  { code: 'zh-CN', label: '中文 (普通话)',       flag: '🇨🇳' },
  { code: 'ja-JP', label: '日本語',             flag: '🇯🇵' },
  { code: 'ru-RU', label: 'Русский',            flag: '🇷🇺' },
  { code: 'pt-BR', label: 'Português',          flag: '🇧🇷' },
];

// All evacuation messages in every supported language
const MESSAGES = {
  'en-IN': {
    fireDetected:   (r) => `Fire alert near room ${r}. Stay calm. FireGuard is finding your safest exit now.`,
    followPath:     (dir, room) => `${dir === 'left' ? 'Turn left' : dir === 'right' ? 'Turn right' : 'Go straight'}. Proceed to room ${room}.`,
    toStairwell:    (side) => `Head to the ${side} stairwell now.`,
    toExit:         () => `You have reached the emergency exit. Please leave the building immediately.`,
    rerouting:      () => `Route updated. Please follow the new directions.`,
    askLocation:    () => `What room number do you see nearest to you? Please tell me.`,
    reachedSafety:  () => `You are safe. Please wait for further instructions from the FireGuard team.`,
    smokeWarning:   () => `Smoke detected ahead. Stay low and cover your mouth.`,
  },
  'hi-IN': {
    fireDetected:   (r) => `कमरा ${r} के पास आग लगी है। शांत रहें। FireGuard आपके लिए सुरक्षित रास्ता ढूंढ रहा है।`,
    followPath:     (dir, room) => `${dir === 'left' ? 'बाएं मुड़ें' : dir === 'right' ? 'दाएं मुड़ें' : 'सीधे जाएं'}। कमरा ${room} की ओर जाएं।`,
    toStairwell:    (side) => `${side === 'left' ? 'बाईं' : 'दाईं'} सीढ़ी की ओर जाएं।`,
    toExit:         () => `आप आपातकालीन निकास पर पहुंच गए हैं। तुरंत इमारत से बाहर जाएं।`,
    rerouting:      () => `नया रास्ता मिल गया है। कृपया नए निर्देशों का पालन करें।`,
    askLocation:    () => `आपके सबसे नजदीक कौन सा कमरा नंबर है? कृपया बताएं।`,
    reachedSafety:  () => `आप सुरक्षित हैं। FireGuard टीम के निर्देशों का इंतजार करें।`,
    smokeWarning:   () => `आगे धुआं है। नीचे झुकें और मुंह ढकें।`,
  },
  'en-US': {
    fireDetected:   (r) => `Fire detected near room ${r}. Stay calm. FireGuard is calculating your evacuation route.`,
    followPath:     (dir, room) => `${dir === 'left' ? 'Turn left' : dir === 'right' ? 'Turn right' : 'Continue straight'}. Head to room ${room}.`,
    toStairwell:    (side) => `Proceed to the ${side} stairwell immediately.`,
    toExit:         () => `You have reached the emergency exit. Exit the building now.`,
    rerouting:      () => `Route recalculated. Please follow the updated directions.`,
    askLocation:    () => `What room number is closest to you right now?`,
    reachedSafety:  () => `You are safe. Stand by for instructions from the response team.`,
    smokeWarning:   () => `Smoke detected ahead. Stay low and cover your nose and mouth.`,
  },
  'fr-FR': {
    fireDetected:   (r) => `Incendie détecté près de la chambre ${r}. Restez calme. FireGuard calcule votre itinéraire d'évacuation.`,
    followPath:     (dir, room) => `${dir === 'left' ? 'Tournez à gauche' : dir === 'right' ? 'Tournez à droite' : 'Continuez tout droit'}. Dirigez-vous vers la chambre ${room}.`,
    toStairwell:    (side) => `Rendez-vous à l'escalier ${side === 'left' ? 'gauche' : 'droit'} immédiatement.`,
    toExit:         () => `Vous avez atteint la sortie de secours. Quittez le bâtiment maintenant.`,
    rerouting:      () => `Itinéraire recalculé. Veuillez suivre les nouvelles directions.`,
    askLocation:    () => `Quel numéro de chambre est le plus proche de vous en ce moment ?`,
    reachedSafety:  () => `Vous êtes en sécurité. Attendez les instructions de l'équipe d'intervention.`,
    smokeWarning:   () => `Fumée détectée devant. Restez bas et couvrez-vous le nez et la bouche.`,
  },
  'de-DE': {
    fireDetected:   (r) => `Feuer in der Nähe von Zimmer ${r} erkannt. Bleiben Sie ruhig. FireGuard berechnet Ihren Fluchtweg.`,
    followPath:     (dir, room) => `${dir === 'left' ? 'Links abbiegen' : dir === 'right' ? 'Rechts abbiegen' : 'Geradeaus gehen'}. Gehen Sie zu Zimmer ${room}.`,
    toStairwell:    (side) => `Gehen Sie sofort zum ${side === 'left' ? 'linken' : 'rechten'} Treppenhaus.`,
    toExit:         () => `Sie haben den Notausgang erreicht. Verlassen Sie das Gebäude jetzt.`,
    rerouting:      () => `Route neu berechnet. Bitte folgen Sie den aktualisierten Anweisungen.`,
    askLocation:    () => `Welche Zimmernummer ist gerade am nächsten zu Ihnen?`,
    reachedSafety:  () => `Sie sind in Sicherheit. Warten Sie auf Anweisungen des Einsatzteams.`,
    smokeWarning:   () => `Rauch voraus erkannt. Bleiben Sie niedrig und bedecken Sie Mund und Nase.`,
  },
  'es-ES': {
    fireDetected:   (r) => `Incendio detectado cerca de la habitación ${r}. Mantenga la calma. FireGuard está calculando su ruta de evacuación.`,
    followPath:     (dir, room) => `${dir === 'left' ? 'Gire a la izquierda' : dir === 'right' ? 'Gire a la derecha' : 'Continúe recto'}. Diríjase a la habitación ${room}.`,
    toStairwell:    (side) => `Diríjase a la escalera ${side === 'left' ? 'izquierda' : 'derecha'} inmediatamente.`,
    toExit:         () => `Ha llegado a la salida de emergencia. Salga del edificio ahora.`,
    rerouting:      () => `Ruta recalculada. Siga las nuevas instrucciones.`,
    askLocation:    () => `¿Qué número de habitación está más cerca de usted ahora mismo?`,
    reachedSafety:  () => `Está a salvo. Espere instrucciones del equipo de respuesta.`,
    smokeWarning:   () => `Humo detectado adelante. Permanezca agachado y cúbrase la nariz y la boca.`,
  },
  'ar-SA': {
    fireDetected:   (r) => `تم اكتشاف حريق بالقرب من الغرفة ${r}. ابق هادئاً. يقوم FireGuard بحساب مسار الإخلاء الخاص بك.`,
    followPath:     (dir, room) => `${dir === 'left' ? 'انعطف يساراً' : dir === 'right' ? 'انعطف يميناً' : 'استمر مباشرة'}. توجه إلى الغرفة ${room}.`,
    toStairwell:    (side) => `توجه فوراً إلى ${side === 'left' ? 'السلم الأيسر' : 'السلم الأيمن'}.`,
    toExit:         () => `لقد وصلت إلى مخرج الطوارئ. اغادر المبنى الآن.`,
    rerouting:      () => `تم إعادة حساب المسار. يرجى اتباع التوجيهات المحدثة.`,
    askLocation:    () => `ما رقم الغرفة الأقرب إليك الآن؟`,
    reachedSafety:  () => `أنت في مأمن. انتظر تعليمات فريق الاستجابة.`,
    smokeWarning:   () => `تم اكتشاف دخان أمامك. ابق منخفضاً وغطِّ أنفك وفمك.`,
  },
  'zh-CN': {
    fireDetected:   (r) => `在${r}号房间附近检测到火情。请保持冷静。FireGuard正在为您计算疏散路线。`,
    followPath:     (dir, room) => `${dir === 'left' ? '向左转' : dir === 'right' ? '向右转' : '直走'}。前往${room}号房间。`,
    toStairwell:    (side) => `立即前往${side === 'left' ? '左侧' : '右侧'}楼梯间。`,
    toExit:         () => `您已到达紧急出口。请立即离开建筑物。`,
    rerouting:      () => `路线已重新计算。请按照更新后的指示行走。`,
    askLocation:    () => `您现在最近的房间号是什么？请告诉我。`,
    reachedSafety:  () => `您已安全。请等待应急小组的指示。`,
    smokeWarning:   () => `前方检测到烟雾。请保持低姿势并遮住口鼻。`,
  },
  'ja-JP': {
    fireDetected:   (r) => `${r}号室付近で火災が検知されました。冷静を保ってください。FireGuardが避難経路を計算中です。`,
    followPath:     (dir, room) => `${dir === 'left' ? '左に曲がって' : dir === 'right' ? '右に曲がって' : 'まっすぐ进んで'}ください。${room}号室に向かってください。`,
    toStairwell:    (side) => `すぐに${side === 'left' ? '左側' : '右側'}の階段に向かってください。`,
    toExit:         () => `非常口に到達しました。今すぐ建物から出てください。`,
    rerouting:      () => `経路が再計算されました。新しい指示に従ってください。`,
    askLocation:    () => `今あなたの一番近くにある部屋番号は何ですか？`,
    reachedSafety:  () => `安全です。対応チームからの指示をお待ちください。`,
    smokeWarning:   () => `前方で煙が検知されました。低い姿勢を保ち、口と鼻を覆ってください。`,
  },
  'ru-RU': {
    fireDetected:   (r) => `Обнаружен пожар вблизи комнаты ${r}. Сохраняйте спокойствие. FireGuard рассчитывает маршрут эвакуации.`,
    followPath:     (dir, room) => `${dir === 'left' ? 'Поверните налево' : dir === 'right' ? 'Поверните направо' : 'Идите прямо'}. Двигайтесь к комнате ${room}.`,
    toStairwell:    (side) => `Немедленно направляйтесь к ${side === 'left' ? 'левой' : 'правой'} лестнице.`,
    toExit:         () => `Вы достигли аварийного выхода. Немедленно покиньте здание.`,
    rerouting:      () => `Маршрут пересчитан. Следуйте обновлённым указаниям.`,
    askLocation:    () => `Какой номер комнаты находится ближайшим к вам сейчас?`,
    reachedSafety:  () => `Вы в безопасности. Ожидайте инструкций от группы реагирования.`,
    smokeWarning:   () => `Впереди обнаружен дым. Держитесь ниже и прикройте нос и рот.`,
  },
  'pt-BR': {
    fireDetected:   (r) => `Incêndio detectado perto do quarto ${r}. Fique calmo. O FireGuard está calculando sua rota de evacuação.`,
    followPath:     (dir, room) => `${dir === 'left' ? 'Vire à esquerda' : dir === 'right' ? 'Vire à direita' : 'Siga em frente'}. Vá para o quarto ${room}.`,
    toStairwell:    (side) => `Vá imediatamente para a escada ${side === 'left' ? 'esquerda' : 'direita'}.`,
    toExit:         () => `Você chegou à saída de emergência. Saia do prédio agora.`,
    rerouting:      () => `Rota recalculada. Siga as novas instruções.`,
    askLocation:    () => `Qual número de quarto está mais perto de você agora?`,
    reachedSafety:  () => `Você está seguro. Aguarde as instruções da equipe de resposta.`,
    smokeWarning:   () => `Fumaça detectada à frente. Fique baixo e cubra o nariz e a boca.`,
  },
};

// Fallback: any unsupported lang code gets English India
function getMessages(lang) {
  return MESSAGES[lang] || MESSAGES['en-IN'];
}

class VoiceAssistant {
  constructor() {
    this.lang = 'en-IN';
    this.synth = window.speechSynthesis;
    this.recognition = null;
    this.voices = [];
    this.isListening = false;

    // Voices load async — must wait for this event
    this.voicesReady = new Promise((resolve) => {
      const load = () => {
        this.voices = this.synth.getVoices();
        if (this.voices.length > 0) resolve(this.voices);
      };
      load();
      if (this.synth) {
        this.synth.addEventListener('voiceschanged', load);
      }
    });

    this._initRecognition();
  }

  _initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return; // Safari fallback — recognition simply won't work
    this.recognition = new SR();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = this.lang;
  }

  // Pick the best available voice for a language code
  async _getBestVoice(lang) {
    await this.voicesReady;
    if (!this.voices || this.voices.length === 0) return null;
    // Try exact match first (e.g. 'hi-IN'), then language prefix (e.g. 'hi')
    return (
      this.voices.find(v => v.lang === lang) ||
      this.voices.find(v => v.lang.startsWith(lang.split('-')[0])) ||
      this.voices.find(v => v.lang.startsWith('en')) || // last resort: any English
      this.voices[0]
    );
  }

  setLanguage(lang) {
    this.lang = lang;
    if (this.recognition) this.recognition.lang = lang;
  }

  // Returns array of { code, label, flag, available } for the language picker UI
  async getAvailableLanguages() {
    await this.voicesReady;
    return SUPPORTED_LANGUAGES.map(l => ({
      ...l,
      available: this.voices.some(v =>
        v.lang === l.code || v.lang.startsWith(l.code.split('-')[0])
      ),
    }));
  }

  async speak(text) {
    if (!this.synth) return Promise.resolve();
    this.synth.cancel(); // Stop any current speech immediately
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.lang;
    utterance.rate = 0.92;   // Slightly slower — emergency context
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.voice = await this._getBestVoice(this.lang);
    this.synth.speak(utterance);
    return new Promise((resolve) => {
      utterance.onend = resolve;
      utterance.onerror = resolve; // Don't block if speech fails
    });
  }

  startListening() {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(new Error('Speech recognition not supported'));
        return;
      }
      this.isListening = true;
      this.recognition.lang = this.lang;
      this.recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        this.isListening = false;
        resolve(transcript);
      };
      this.recognition.onerror = (e) => {
        this.isListening = false;
        reject(e);
      };
      this.recognition.onend = () => { this.isListening = false; };
      this.recognition.start();
    });
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  // Parse room number from speech transcript (works across languages —
  // digits are universal, and most TTS returns numerals even in Hindi)
  parseLocationResponse(transcript) {
    if (!transcript) return null;
    const match = transcript.match(/\b([1-8][0-9]{2})\b/);
    return match ? match[1] : null;
  }

  // Convenience: message shortcuts in current language
  msg() {
    return getMessages(this.lang);
  }
}

export const voiceAssistant = new VoiceAssistant();
export { SUPPORTED_LANGUAGES };