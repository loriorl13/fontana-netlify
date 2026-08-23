
// === PONTE NETLIFY -> ESP32 & MOCK LOCALE ===
const ESP_URL = 'https://fontana.fontanabyloriorl.it';
window.serverTimeOffset = 0;
window.esp32ScheduleReceived = false;

const originalFetch = window.fetch;
window.fetch = function(...args) {
  let url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');

  if (typeof args[0] === 'string' && args[0].startsWith('/')) {
    const sep = args[0].includes('?') ? '&' : '?';
    args[0] = ESP_URL + args[0] + sep + '_t=' + Date.now();
  }

  const devId = localStorage.getItem('device_id');
  if (devId) {
    if (!args[1]) args[1] = {};
    if (!args[1].headers) args[1].headers = {};
    if (args[1].headers instanceof Headers) {
      args[1].headers.append('device_id', devId);
    } else {
      args[1].headers['device_id'] = devId;
    }
  }



  return originalFetch.apply(window, args);
};


    const SHOW_NAMES = {
      1:"Blinding Lights", 2:"X Remix", 3:"Pa Que Lo Bailes", 4:"Titanium",
      5:"Animals", 6:"Gonna Make You Sweat", 7:"Tusa", 8:"That's Amore",
      9:"Sexy and I Know It", 10:"All I Want for Xmas", 11:"Show TEST",
      12:"Tu mi porti su", 13:"Rumore", 14:"L'Ombelico del Mondo",
      15:"Raindance", 16:"For You", 17:"Give It Up To Me", 18:"Me Rehúso",
      19:"Ora che non ho più te", 20:"Títí Me Pregúntó", 21:"Fabulous",
      22:"Don't Stop 'Til You Get Enough", 23:"Papaoutai", 24:"Billie Jean", 25:"Skyfall", 26:"Mentirosa", 27:"Symphony", 28:"Dai Dai", 29:"Fireball", 30:"Y Que Fue?", 31:"Wavin' Flag"
    };

    // =============================================// GLOBAL VOLUME MANAGEMENT
    // =============================================
    window.currentGlobalVolume = 100;
    window.currentVoiceVolume = 100;
    
    function playVolumeBeep(vol) {
      try {
        let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        let oscillator = audioCtx.createOscillator();
        let gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
        gainNode.gain.setValueAtTime(vol / 100.0, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
      } catch(e) {
        console.error("Audio beep error:", e);
      }
    }

    function applyGlobalVolume(newVol) {
      let volFactor = newVol / 100.0;
      document.querySelectorAll('audio, video').forEach(el => {
        if (!el.hasAttribute('data-orig-vol')) {
          el.setAttribute('data-orig-vol', el.volume);
        }
        let orig = parseFloat(el.getAttribute('data-orig-vol'));
        el.volume = orig * volFactor;
      });
    }

    // =============================================
    // THEME MANAGEMENT (Notte / Giorno / Auto)
    // =============================================
    let themeMode = localStorage.getItem('fontana_theme') || 'auto'; // 'night', 'day', 'auto'

    function applyTheme(mode) {
      const body = document.body;
      const statusEl = document.getElementById('mainThemeStatus');
      const hour = new Date().getHours();
      
      body.classList.remove('day-theme');
      
      let effectiveMode = mode;
      if (mode === 'auto') {
        effectiveMode = (hour >= 8 && hour < 20) ? 'day' : 'night';
      }

      if (effectiveMode === 'day') {
        body.classList.add('day-theme');
      }
      
      if (statusEl) {
        if (mode === 'auto') statusEl.textContent = '\u{1F313} Auto (' + (effectiveMode==='day'?'D':'N') + ')';
        else statusEl.textContent = mode === 'day' ? '\u2600\uFE0F Giorno' : '\uD83C\uDF19 Notte';
      }

      // Restore theme-specific zoom
      const zoomKey = 'fontana_ui_zoom_' + effectiveMode;
      const fallbackKey = 'fontana_ui_zoom';
      const themeZoom = localStorage.getItem(zoomKey) || localStorage.getItem(fallbackKey) || '1.0';
      document.documentElement.style.setProperty('--ui-zoom', themeZoom);
      const slider = document.getElementById('uiZoomSlider');
      if (slider) slider.value = themeZoom;
    }

    function toggleTheme() {
      if (themeMode === 'auto') themeMode = 'day';
      else if (themeMode === 'day') themeMode = 'night';
      else themeMode = 'auto';
      localStorage.setItem('fontana_theme', themeMode);
      applyTheme(themeMode);
    }

    applyTheme(themeMode);
    // Refresh auto theme every minute
    setInterval(() => { if(themeMode === 'auto') applyTheme('auto'); }, 60000);

    // =============================================
    // ZOOM PERSISTENCE (theme-aware)
    // =============================================
    (function initZoom() {
      // Legacy fallback
      const savedZoom = localStorage.getItem('fontana_zoom');
      if (savedZoom) {
        document.body.style.zoom = savedZoom;
      }
    })();

    function setZoom(level) {
      document.body.style.zoom = level;
      localStorage.setItem('fontana_zoom', level);
    }

    function updateUIZoom(val) {
      document.documentElement.style.setProperty('--ui-zoom', val);
      // Persist per-theme zoom
      const hour = new Date().getHours();
      let curTheme = themeMode;
      if (curTheme === 'auto') curTheme = (hour >= 8 && hour < 20) ? 'day' : 'night';
      localStorage.setItem('fontana_ui_zoom_' + curTheme, val);
      localStorage.setItem('fontana_ui_zoom', val); // also save legacy key
    }

    // Duplicate fetch interceptor removed

    // --- Auth Logic ---
    let deviceId = localStorage.getItem('device_id');
    // Reset role to user by default to ensure security
    let userRole = 'user';
    localStorage.removeItem('fontana_role'); // Force fresh recognition
    
    function updateMaintenanceUI() {
      const overlay = document.getElementById('maintenanceOverlay');
      if (!overlay) return;
      
      // La manutenzione blocca solo se è attiva E l'utente NON è admin
      // NB: se userRole è 'user' (default), l'accesso è bloccato.
      if (isMaintenanceActive && userRole !== 'admin') {
        overlay.style.display = 'flex';
      } else {
        overlay.style.display = 'none';
      }
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function showAuthScreen(screenId) {
        ['welcomeScreen'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = 'none';
        });
        const target = document.getElementById(screenId);
        if(target) target.style.display = 'flex';
    }

    function authLogout() {
        if(confirm("Vuoi davvero annullare la sessione attuale?")) {
            localStorage.removeItem('device_id');
            deviceId = null;
            userRole = 'guest';
            initAuth();
        }
    }

    /* Global State Flags */
    let isTransitioning = false;



    async function initAuth() {
        // Init Zoom: restore per-theme zoom
        const hour = new Date().getHours();
        let curTheme = themeMode;
        if (curTheme === 'auto') curTheme = (hour >= 8 && hour < 20) ? 'day' : 'night';
        const savedZoom = localStorage.getItem('fontana_ui_zoom_' + curTheme)
                       || localStorage.getItem('fontana_ui_zoom') || '1.0';
        document.documentElement.style.setProperty('--ui-zoom', savedZoom);
        const slider = document.getElementById('uiZoomSlider');
        if(slider) slider.value = savedZoom;

        if (!deviceId) {
            deviceId = generateUUID();
            localStorage.setItem('device_id', deviceId);
        }
        
        // Skip auth check and go directly to welcome screen
        showAuthScreen('welcomeScreen');
    }



    function showAdminDashboard() {
        ['authCheckScreen', 'loginScreen', 'pendingScreen', 'deniedScreen', 'welcomeScreen', 'panel'].forEach(id => {
            const el = document.getElementById(id);
            if(el) { el.classList.remove('active'); el.style.display = 'none'; }
        });
        document.getElementById('adminOverlay').style.display = 'flex';
        loadAdminUsers();
    }

    async function loadAdminUsers() {
        try {
            const res = await fetch('/api/admin/users', { headers: {'device_id': deviceId} });
            if(!res.ok) throw new Error("Unauthorized");
            const users = await res.json();
            
            const pendingHtml = [];
            const activeHtml = [];
            
            users.forEach(u => {
                const card = `
                    <div style="background:rgba(0,0,0,0.5); padding:15px; border-radius:10px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.1);">
                        <div style="font-weight:bold; font-size:1.1rem; color:#fff;">${u.nome} ${u.cognome}</div>
                        <div style="font-size:0.85rem; color:#aaa; margin-bottom:10px;">Disp: ${u.device_name} | Ruolo: <span style="color:#00e5ff;">${u.ruolo.toUpperCase()}</span></div>
                        <div style="display:flex; gap:10px; flex-wrap:wrap;">
                            ${u.ruolo === 'pending' || u.ruolo === 'denied' ? `<button onclick="setAdminRole('${u.id}', 'user')" style="padding:5px 15px; background:#4CAF50; border:none; border-radius:5px; color:white; cursor:pointer;">Approva User</button>` : ''}
                            ${u.ruolo === 'pending' || u.ruolo === 'denied' ? `<button onclick="setAdminRole('${u.id}', 'admin')" style="padding:5px 15px; background:#2196F3; border:none; border-radius:5px; color:white; cursor:pointer;">Approva Admin</button>` : ''}
                            ${u.ruolo === 'user' || u.ruolo === 'admin' ? `<button onclick="setAdminRole('${u.id}', 'denied')" style="padding:5px 15px; background:#ff3232; border:none; border-radius:5px; color:white; cursor:pointer;">Revoca</button>` : ''}
                            ${u.ruolo === 'pending' ? `<button onclick="setAdminRole('${u.id}', 'denied')" style="padding:5px 15px; background:#ff3232; border:none; border-radius:5px; color:white; cursor:pointer;">Rifiuta</button>` : ''}
                        </div>
                    </div>`;
                
                if (u.ruolo === 'pending') pendingHtml.push(card);
                else activeHtml.push(card);
            });
            
            document.getElementById('adminPendingList').innerHTML = pendingHtml.length ? pendingHtml.join('') : '<div style="color:#aaa;">Nessuna richiesta.</div>';
            document.getElementById('adminActiveList').innerHTML = activeHtml.length ? activeHtml.join('') : '<div style="color:#aaa;">Nessun utente.</div>';
        } catch(e) {
            console.error(e);
            document.getElementById('adminActiveList').innerHTML = '<div style="color:#ff3232;">Accesso Negato.</div>';
        }
    }

    async function setAdminRole(userId, role) {
        if (!confirm(`Vuoi davvero impostare il ruolo ${role.toUpperCase()} per questo utente?`)) return;
        try {
            const res = await fetch('/api/admin/set-role', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'device_id': deviceId },
                body: `target_id=${userId}&role=${role}`
            });
            if (res.ok) {
                alert("Aggiornato! ✅");
                loadAdminUsers();
            } else {
                alert("Errore aggiornamento");
            }
        } catch(e) { alert("Errore di rete"); }
    }

    const welcomeAudio = document.getElementById('welcomeAudio');
    if (welcomeAudio) {
      welcomeAudio.volume = 0.2; // volume basso per audio home
    }
    let isWelcomeAudioPlaying = false;

    function toggleWelcomeAudio() {
      if (!welcomeAudio) return;
      if (welcomeAudio.paused) {
        welcomeAudio.play();
        isWelcomeAudioPlaying = true;
        document.getElementById('speaker-container').textContent = '🔊';
      } else {
        welcomeAudio.pause();
        isWelcomeAudioPlaying = false;
        document.getElementById('speaker-container').textContent = '🔈';
      }
    }

    // ======= MONITORAGGIO LOGIC =======
    let monitoraggioInterval = null;
    let monitoraggioCanvas, monitoraggioCtx, monitoraggioParticles = [];
    let monitoraggioAnimationId = null;

    function toggleMonitoraggioMode() {
      if (userRole !== 'admin') {
          const pass = prompt("Inserisci la password Admin per uscire dal Monitoraggio:");
          if (pass === "lori123" || pass === "admin") {
              fetch('/set-monitoraggio?enable=0');
          } else {
              if (pass !== null) alert("❌ Password errata.");
          }
          return;
      }
      const newState = !isMonitoraggioActive;
      fetch(`/set-monitoraggio?enable=${newState ? 1 : 0}`);
    }

    function checkMonitoraggioLock() {
      const overlay = document.getElementById('monitoraggioOverlay');
      if (!overlay) return;

      const isShowPlaying = (typeof lastActiveShowId !== 'undefined' && lastActiveShowId > 0 && typeof lastPolledShow !== 'undefined' && lastPolledShow > 0);

      // NON visibile per gli admin
      if (isMonitoraggioActive && userRole !== 'admin') {
        if (overlay.style.display !== 'flex') {
          overlay.style.display = 'flex';
          initMonitoraggioFluidBackground();
          if (monitoraggioAnimationId) cancelAnimationFrame(monitoraggioAnimationId);
          monitoraggioAnimationId = requestAnimationFrame(updateMonitoraggioTimer);
        }
        
        const exitBtn = document.getElementById('monitoraggioExitBtn');
        if (exitBtn) exitBtn.style.display = 'block';
      } else {
        if (overlay.style.display !== 'none') {
          overlay.style.display = 'none';
          if (monitoraggioAnimationId) {
            cancelAnimationFrame(monitoraggioAnimationId);
            monitoraggioAnimationId = null;
          }
          monitoraggioParticles = [];
        }
      }
    }

    function initMonitoraggioFluidBackground() {
      monitoraggioCanvas = document.getElementById('monitoraggioCanvas');
      monitoraggioCtx = monitoraggioCanvas.getContext('2d');
      monitoraggioCanvas.width = window.innerWidth;
      monitoraggioCanvas.height = window.innerHeight;
      
      const particleCount = 20;
      monitoraggioParticles = [];
      for(let i=0; i<particleCount; i++) {
        monitoraggioParticles.push({
          x: Math.random() * monitoraggioCanvas.width,
          y: Math.random() * monitoraggioCanvas.height,
          r: Math.random() * 150 + 50,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          color: `hsla(${Math.random() * 40 + 180}, 100%, 50%, 0.15)`
        });
      }
      
      if (monitoraggioAnimationId) cancelAnimationFrame(monitoraggioAnimationId);
      
      function animate() {
        if (!isMonitoraggioActive || document.getElementById('monitoraggioOverlay').style.display === 'none') return;
        monitoraggioCtx.clearRect(0,0, monitoraggioCanvas.width, monitoraggioCanvas.height);
        
        monitoraggioParticles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          if(p.x < -p.r) p.x = monitoraggioCanvas.width + p.r;
          if(p.x > monitoraggioCanvas.width + p.r) p.x = -p.r;
          if(p.y < -p.r) p.y = monitoraggioCanvas.height + p.r;
          if(p.y > monitoraggioCanvas.height + p.r) p.y = -p.r;
          
          const grad = monitoraggioCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          grad.addColorStop(0, p.color);
          grad.addColorStop(1, 'transparent');
          monitoraggioCtx.fillStyle = grad;
          monitoraggioCtx.beginPath();
          monitoraggioCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          monitoraggioCtx.fill();
        });
        monitoraggioAnimationId = requestAnimationFrame(animate);
      }
      if (isMonitoraggioActive && document.getElementById('monitoraggioOverlay').style.display !== 'none') {
          monitoraggioAnimationId = requestAnimationFrame(updateMonitoraggioTimer);
      }
    }

    function updateMonitoraggioTimer() {
        if (typeof homeNextShowIn !== 'undefined' && homeNextShowIn !== null) {
            const timerEl = document.getElementById('monitoraggioTimer');
            const nameEl = document.getElementById('monitoraggioNextShowName');
            const hintEl = document.getElementById('monitoraggioHint');
            const overlay = document.getElementById('monitoraggioOverlay');
            
            // Applica il tema in base all'orario
            const now = new Date(Date.now() + serverTimeOffset);
            const hour = now.getHours();
            const isNight = (hour >= 20 || hour < 8);
            if (isNight) {
                overlay.classList.add('monitoraggio-night');
                overlay.classList.remove('monitoraggio-day');
            } else {
                overlay.classList.add('monitoraggio-day');
                overlay.classList.remove('monitoraggio-night');
            }
            
            if (lastActiveShowId > 0 && lastPolledShow > 0) {
                timerEl.textContent = "IN CORSO";
                const name = SHOW_NAMES[lastActiveShowId] || "Show in riproduzione";
                nameEl.textContent = name;
                hintEl.textContent = "GODITI LO SPETTACOLO! 💦✨";
                timerEl.style.transform = "scale(1)";
                timerEl.style.color = "white";
            } else if (homeNextShowIn === -1) {
                timerEl.textContent = "--:--";
                nameEl.textContent = "Auto Mode Disattivato";
                hintEl.textContent = "ATTESA INIZIO SHOW...";
                timerEl.style.transform = "scale(1)";
                timerEl.style.color = "white";
            } else if (homeNextShowIn === -2) {
                timerEl.textContent = "SILENZIO";
                nameEl.textContent = "Fascia oraria notturna";
                hintEl.textContent = "ATTESA INIZIO SHOW...";
                timerEl.style.transform = "scale(1)";
                timerEl.style.color = "white";
            } else if (homeNextShowIn === -3) {
                timerEl.textContent = "VENTO";
                nameEl.textContent = "Disattivati per vento";
                hintEl.textContent = "ATTESA INIZIO SHOW...";
                timerEl.style.transform = "scale(1)";
                timerEl.style.color = "white";
            } else {
                // Calcolo fluido
                let secRemaining = 0;
                if (targetShowTime > 0) {
                    secRemaining = Math.max(0, (targetShowTime - Date.now()) / 1000);
                } else {
                    secRemaining = homeNextShowIn > 0 ? homeNextShowIn : 0;
                }
                
                const mins = Math.floor(secRemaining / 60);
                const secsInt = Math.floor(secRemaining % 60);
                timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secsInt.toString().padStart(2, '0')}`;
                
                const name = SHOW_NAMES[homeNextShowNumber] || "Show " + homeNextShowNumber;
                nameEl.textContent = `Prossimo: ${name}`;
                hintEl.textContent = "PREPARATI, MANCA POCO!";
                
                // Animazione elegante sotto i 10 secondi
                if (secRemaining <= 10 && secRemaining > 0) {
                    timerEl.style.transform = "";
                    timerEl.style.color = "";
                    if (isNight) {
                        timerEl.classList.add('timer-warning-night');
                        timerEl.classList.remove('timer-warning-day');
                    } else {
                        timerEl.classList.add('timer-warning-day');
                        timerEl.classList.remove('timer-warning-night');
                    }
                } else {
                    timerEl.classList.remove('timer-warning-day', 'timer-warning-night');
                    timerEl.style.transform = "scale(1)";
                    timerEl.style.color = ""; // let CSS classes handle it
                }
            }
        }
        
        // Continua il loop se attivo e overlay visibile
        if (isMonitoraggioActive && document.getElementById('monitoraggioOverlay').style.display !== 'none') {
            monitoraggioAnimationId = requestAnimationFrame(updateMonitoraggioTimer);
        }
    }

    function showCommandFeedback(isError, customMsg) {
      const el = document.getElementById('commandStatus');
      if (!el) return;
      if (customMsg) {
        el.textContent = customMsg;
      } else {
        el.textContent = isError ? 'Errore ❌' : 'Comando Inviato ✅';
      }
      el.style.borderColor = isError ? '#ff5252' : '#00e5ff';
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), isError ? 4000 : 2000);
    }

    function fetchWithTimeout(url, options = {}, timeout = 3000) {
      return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeout)
        )
      ]);
    }

function disattivaModalitaAutomatica() {
  if (typeof autoTimerInterval !== 'undefined') clearInterval(autoTimerInterval);
  document.getElementById("autoModal").style.display = "none";
  fetch("/auto?enable=0");
}

    function fadeOutAudio(audio, duration = 2000) {
      const stepTime = 50; // ms
      const steps = duration / stepTime;
      let volume = audio.volume;
      let stepAmount = volume / steps;

      return new Promise(resolve => {
        let fadeInterval = setInterval(() => {
          volume -= stepAmount;
          if(volume <= 0) {
            volume = 0;
            audio.volume = 0;
            audio.pause();
            clearInterval(fadeInterval);
            resolve();
          } else {
            audio.volume = volume;
          }
        }, stepTime);
      });
    }

    async function enterSite() {
      if (isTransitioning) return;
      isTransitioning = true;

      const enterAudio = document.getElementById('enterAudio');
      const transitionEl = document.getElementById('waterTransition');
      const panel = document.getElementById('panel');
      const welcomeEl = document.getElementById('welcome');

      // Chime Alexa
      if (enterAudio) {
        enterAudio.currentTime = 0;
        enterAudio.play().catch(e => {});
      }

      // rimosso init automatico fotocamera per evitare blocchi su desktop
      if (typeof cameraSystemEnabled !== 'undefined' && cameraSystemEnabled) {
        
        if (typeof cameraInstance !== 'undefined' && cameraInstance) {
          cameraInstance.start();
        }
        const gVid = document.getElementById('gestureVideo');
        if (gVid && gVid.paused) gVid.play().catch(()=>{});
      }

      // Trigger Welcome Effect (ESP-NOW to LED ESP32)
      fetch('/welcome-effect').catch(e => console.error('Errore Welcome Effect:', e));

      // Attiva Zampilli
      if (transitionEl) transitionEl.classList.add('active');

      welcomeEl.classList.add('fade-out-special');

      try {
        if (welcomeAudio && !welcomeAudio.paused) {
          fadeOutAudio(welcomeAudio, 600).catch(e => {});
        }
      } catch(e) {}

      // Aspettiamo la transizione epica
      setTimeout(() => {
        welcomeEl.classList.remove('active');
        welcomeEl.classList.remove('fade-out-special');
        if (transitionEl) transitionEl.classList.remove('active');
        
        // Rendiamo il pannello subito attivo per permettere l'animazione dei bottoni
        panel.classList.add('active');
        
        isTransitioning = false;
        
        // Animazione a cascata per i bottoni
        setTimeout(() => {
          panel.classList.add('panel-visible');
          const cards = document.querySelectorAll('.show-card');
          cards.forEach((card, index) => {
            card.style.transitionDelay = (index * 45) + 'ms';
          });
        }, 50);
      }, 850);
      
      // Controlla se la fontana è chiusa o in chiusura imminente
      if (isFontanaClosed()) {
        const reopenEl = document.getElementById('reopenTime');
        if (reopenEl) reopenEl.textContent = minsToHHMM(homeFontanaOpenTime);
        document.getElementById('closedOverlay').style.display = 'flex';
      } else if (isClosingSoon()) {
        const secsLeft = secondsToClose();
        startMinuteCountdown(secsLeft);
      } else {
        document.getElementById('panel').classList.add('active');
      }

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (!isMobile && localStorage.getItem('camera_enabled') === '1') {
        cameraSystemEnabled = true;
        if (cameraInstance) cameraInstance.start();
      } else {
        cameraSystemEnabled = false;
        stopCameraCompletely();
      }
    }

    function send(path) {
      const fb = document.getElementById('feedback');
      if(fb) fb.textContent = 'Invio comando...';
      fetchWithTimeout(path)
        .then(r => r.text())
        .then(t => {
          if(fb) fb.textContent = '✅ OK';
          showCommandFeedback(false);
          if(path === '/stop') {
            for(let i=1; i<=6; i++) {
              const valEl = document.getElementById('val'+i);
              if(valEl) valEl.innerText = '0';
              const slider = document.querySelector("input[oninput*='setPump(" + i + ")']");
              if(slider) slider.value = 0;
            }
          }
        })
        .catch(e => {
          if(fb) fb.textContent = '❌ Errore';
          showCommandFeedback(true);
        });
    }

    function openFeedbackArea() {
      // Attiva modalità mouse globale
      mouseModeActive = true;
      const modal = document.getElementById('feedbackModal');
      if (modal) modal.style.display = 'flex';
      refreshStats();
      
      // Assicurati che il video sia avviato per la cattura foto
      const vid = document.getElementById('gestureVideo');
      if(vid && vid.paused) {
          // Riavvio camera instance se necessario (dovrebbe essere sempre attiva da initGlobalVirtualMouse)
          // Se spenta, initGlobalVirtualMouse l'ha avviata.
      }
    }

    function closeFeedbackArea() {
      document.getElementById('feedbackModal').style.display = 'none';
      // Non disattiviamo il mouseModeActive qui perché serve anche fuori per menu, 
      // ma potremmo volerlo se l'utente preferisce. Per ora lasciamo attivo.
    }

    function manualWeatherRefresh() {
      const btn = document.getElementById('refreshWeatherBtn');
      if (btn) {
        btn.classList.add('loading');
        btn.textContent = '...';
      }
      
      fetch('/weather')
        .then(response => response.json())
        .then(data => {
          if (btn) {
            btn.classList.remove('loading');
            btn.textContent = '🔄 Aggiorna Ora';
          }
          
          if(data.valid) {
             const val = data.windSpeed.toFixed(1);
             
             // Update all wind indicators
             const mainVal = document.getElementById('windMainVal');
             if(mainVal) mainVal.textContent = val;
             
             const headerVal = document.getElementById('windMainValDisplay');
             if(headerVal) headerVal.textContent = val;
             
             const speedVal = document.getElementById('windSpeed');
             if(speedVal) speedVal.textContent = val + ' km/h';

             const windCard = document.getElementById('windWidgetCard');
             if(windCard) {
                if(data.windSpeed > data.threshold) windCard.style.borderColor = "#ff5252";
                else if(data.windSpeed > (data.threshold * 0.7)) windCard.style.borderColor = "#ff9800";
                else windCard.style.borderColor = "rgba(0, 229, 255, 0.4)";
             }
             
             // Update Status Indicator
             const statusCircle = document.getElementById('weatherStatusCircle');
             const statusText = document.getElementById('weatherStatusText');
             if(statusCircle && statusText) {
                if(data.windSpeed > data.threshold) {
                   statusCircle.style.background = "#ff5252";
                   statusText.textContent = "VENTO FORTE - SHOW BLOCCATI";
                } else {
                   statusCircle.style.background = "#00e676";
                   statusText.textContent = "CONDIZIONI OTTIMALI";
                }
             }

             const ind = document.getElementById('windStatusIndicator');
             const box = document.getElementById('weatherIcon');
             const txt = document.getElementById('windStatusText');
             
             // Populate threshold input if present
             const thInput = document.getElementById('windThresholdInput');
             if(thInput && document.activeElement !== thInput) {
               thInput.value = data.threshold;
             }

             if(data.windSpeed > data.threshold) {
               if(ind) ind.className = 'status-indicator danger';
               if(box) box.style.textShadow = "0 0 20px #ff5252";
               if(txt) { txt.textContent = "VENTO ECCESSIVO"; txt.style.color = "#ff5252"; }
             } else if(data.windSpeed > (data.threshold * 0.7)) {
               if(ind) ind.className = 'status-indicator warning';
               if(box) box.style.textShadow = "0 0 20px #ff9800";
               if(txt) { txt.textContent = "Vento Moderato"; txt.style.color = "#ff9800"; }
             } else {
               if(ind) ind.className = 'status-indicator'; // green
               if(box) box.style.textShadow = "0 0 20px #00e5ff";
               if(txt) { txt.textContent = "Condizioni Ottimali"; txt.style.color = "#00e676"; }
             }
             
             const now = new Date();
             if(document.getElementById('lastUpdate')) document.getElementById('lastUpdate').textContent = "Ultimo aggiornamento: " + now.toLocaleTimeString();
             
          } else {
             if(document.getElementById('windStatusText')) document.getElementById('windStatusText').textContent = "Dati non validi";
             if(document.getElementById('windSpeed')) document.getElementById('windSpeed').textContent = "N/A";
          }
        })
        .catch(e => {
           if (btn) btn.classList.remove('loading');
           console.error("Weather fetch error:", e);
        });
    }

    // Auto-refresh weather every 60 seconds
    setInterval(manualWeatherRefresh, 60000);

    function saveWindCheck() {
      const val = document.getElementById('windThresholdInput').value;
      if(val) {
        // Add timestamp to prevent browser caching of GET request
        fetch('/save-wind-settings?threshold=' + val + '&_t=' + Date.now())
          .then(r => r.text())
          .then(t => {
             alert("Soglia vento salvata! ✅");
             manualWeatherRefresh(); // Refresh to confirm
          })
          .catch(e => alert("Errore salvataggio ❌"));
      }
    }

    function refreshStats() {
      fetch('/get-stats')
        .then(r => r.json())
        .then(data => {
          document.getElementById('statOrcCnt').textContent = data.orc_cnt;
          document.getElementById('statKarCnt').textContent = data.kar_cnt;
          
          const container = document.getElementById('showStatsContainer');
          if (container) container.innerHTML = '';
          
          // Featured Loop Data
          const featuredShows = [];
          data.shows.forEach(s => {
              if (s.id == 11) return;
              const avg = s.vts > 0 ? (s.sum / s.vts) : 0;
              if (avg >= 4.5) { // 5-star shows (or close)
                  featuredShows.push({
                      id: s.id,
                      name: SHOW_NAMES[s.id] || 'Show '+s.id,
                      stars: Math.round(avg),
                      vts: s.vts
                  });
              }
          });
          startFeaturedLoop(featuredShows);
          
          // MAP RECENT VOTES
          const recentMap = {}; // { showId: [ {photo, stars}, ... ] }
          console.log("Raw recent data:", data.recent); // DEBUG
          
          if (data.recent && Array.isArray(data.recent)) {
            data.recent.forEach(v => {
                try {
                   let vote = v;
                   if (typeof v === 'string') {
                       vote = JSON.parse(v);
                   }
                   if (vote && vote.id !== undefined) {
                       if (!recentMap[vote.id]) recentMap[vote.id] = [];
                       if (recentMap[vote.id].length < 5) {
                           recentMap[vote.id].unshift(vote);
                       }
                   }
                } catch(e) { console.error("Vote parse error for:", v, e); }
            });
          }

          data.shows.forEach(s => {
            if (s.id == 11) return;
            const card = document.createElement('div');
            card.className = 'feedback-card';
            const avg = s.vts > 0 ? (s.sum / s.vts).toFixed(1) : "0.0";
            
            let facesHtml = "";
            if (recentMap[s.id] && recentMap[s.id].length > 0) {
                facesHtml = "<div style='display:flex; gap:8px; margin-top:10px; justify-content:flex-end; flex-wrap:wrap;'>";
                recentMap[s.id].forEach(v => {
                    const starsSmall = "★".repeat(v.stars);
                    facesHtml += `<div style="text-align:center; position:relative;">
                                    <div style="width:40px; height:40px; border-radius:50%; background:#222; overflow:hidden; border:2px solid #00e5ff; box-shadow:0 0 5px rgba(0,229,255,0.5);">
                                        <img src="${v.photo}" style="width:100%; height:100%; object-fit:cover;">
                                    </div>
                                    <div style="font-size:10px; color:#fbc02d; margin-top:2px; text-shadow:0 0 2px black;">${starsSmall}</div>
                                  </div>`;
                });
                facesHtml += "</div>";
            }

            card.innerHTML = `
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:var(--accent);">${SHOW_NAMES[s.id] || 'Show '+s.id}</strong>
                <span style="font-size:0.8rem; color:#aaa;">Partenze: ${s.cnt}</span>
              </div>
              <div style="display:flex; align-items:center; gap:15px; margin-bottom:10px;">
                <div class="stars-row" id="stars-${s.id}">${[1,2,3,4,5].map(i => `<span class="star" onclick="startVoteSequence(${s.id}, ${i})">★</span>`).join('')}
                </div>
                <div style="font-size:1.1rem; font-weight:bold; color:#fbc02d;">${avg}</div>
                <div style="font-size:0.7rem; color:#666;">(${s.vts} voti)</div>
              </div>
              
              <!-- Container separato per le facce -->
              ${facesHtml}
            `;
            container.appendChild(card);
            
            // Highlight stars
            const stars = card.querySelectorAll('.star');
            const roundedAvg = Math.round(parseFloat(avg));
            for(let i=0; i<roundedAvg; i++) {
              stars[i].classList.add('active');
            }
          });
        });
    }
    
    // FEEDBACK AUTOMATICO A FINE SHOW
    let feedbackPromptTimeout = null;
    let currentEndShowId = null;

    function showEndVotePrompt(showId) {
      currentEndShowId = showId;
      const overlay = document.getElementById('endShowVoteOverlay');
      const timerSec = document.getElementById('endShowTimerSec');
      if (overlay) overlay.style.display = 'flex';
      
      let timeLeft = 15;
      if (timerSec) timerSec.innerText = timeLeft;
      
      if (feedbackPromptTimeout) clearInterval(feedbackPromptTimeout);
      
      feedbackPromptTimeout = setInterval(() => {
        timeLeft--;
        if (timerSec) timerSec.innerText = timeLeft;
        if (timeLeft <= 0) {
          closeEndVotePrompt();
        }
      }, 1000);
    }

    function closeEndVotePrompt() {
      const overlay = document.getElementById('endShowVoteOverlay');
      if (overlay) overlay.style.display = 'none';
      if (feedbackPromptTimeout) {
        clearInterval(feedbackPromptTimeout);
        feedbackPromptTimeout = null;
      }
    }

    function submitEndShowVote(stars) {
      closeEndVotePrompt();
      startVoteSequence(currentEndShowId, stars);
    }

    // SEQUENZA VOTO: Click Stella -> Countdown Overlay -> Scatta Foto -> Invia
    let pendingVote = { id: 0, stars: 0 };
    
    function startVoteSequence(id, stars) {
        if (id == 11) { showCommandFeedback(true, 'Show TEST non è votabile!'); return; }
        let wasCameraOff = !cameraSystemEnabled;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (wasCameraOff && !isMobile) {
            // Accendiamo temporaneamente la fotocamera bypassando il salvataggio globale (che farebbe toggleCameraSystem)
            cameraSystemEnabled = true;
            if (!isCameraSystemInitialized) initGlobalVirtualMouse();
            else if (cameraInstance) cameraInstance.start();
        }
        
        pendingVote = { id, stars, wasCameraOff };

        // Crea/Mostra overlay countdown
        let overlay = document.getElementById('voteOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'voteOverlay';
            overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.95); z-index:40000; display:flex; flex-direction:column; align-items:center; justify-content:center; color:white; font-family:'Segoe UI';";
            
            // Container per video e countdown sovrapposto
            const container = document.createElement('div');
            container.style.cssText = "position:relative; width:300px; height:300px; border-radius:50%; overflow:hidden; border:4px solid #00e5ff; box-shadow:0 0 30px #00e5ff;";
            
            const vid = document.createElement('video');
            vid.id = 'votePreviewVideo';
            vid.autoplay = true;
            vid.muted = true;
            vid.style.cssText = "width:100%; height:100%; object-fit:cover; transform:scaleX(-1);"; // Mirror
            
            const countEl = document.createElement('div');
            countEl.id = 'voteCount';
            countEl.style.cssText = "position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:6rem; font-weight:bold; text-shadow:0 0 20px black; color:white;";
            
            container.appendChild(vid);
            container.appendChild(countEl);
            overlay.appendChild(container);

            const msg = document.createElement('div');
            msg.innerText = "SCATTA FOTO...";
            msg.style.cssText = "margin-top:20px; font-size:1.5rem; color:#00e5ff; letter-spacing:2px;";
            overlay.appendChild(msg);

            document.body.appendChild(overlay);
        }
        
        // Collega stream video
        const mainVid = document.getElementById('gestureVideo');
        const preview = document.getElementById('votePreviewVideo');
        if (mainVid && mainVid.srcObject) {
            preview.srcObject = mainVid.srcObject;
        }

        document.getElementById('voteCount').innerText = "3";
        overlay.style.display = 'flex';
        
        let count = 3;
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                document.getElementById('voteCount').innerText = count;
            } else {
                clearInterval(interval);
                document.getElementById('voteCount').innerText = "📸";
                // Flash effect
                preview.style.filter = "brightness(5)";
                setTimeout(() => {
                    preview.style.filter = "none";
                    captureAndSubmitVote();
                    overlay.style.display = 'none';
                }, 200);
            }
        }, 1000);
    }

    // FEATURED SHOW LOOP
    let featuredIdx = 0;
    let featuredList = [];
    let featuredTimer = null;

    function startFeaturedLoop(list) {
        featuredList = list;
        const container = document.getElementById('featured-show-container');
        if (!container || list.length === 0) {
            if (container) container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        if (featuredTimer) clearInterval(featuredTimer);
        
        renderFeaturedShow();
        featuredTimer = setInterval(() => {
            featuredIdx = (featuredIdx + 1) % featuredList.length;
            renderFeaturedShow();
        }, 6000); // Sfuma ogni 6 secondi
    }

    function renderFeaturedShow() {
        const container = document.getElementById('featured-show-container');
        const show = featuredList[featuredIdx];
        if (!show) return;

        const starIcons = "★".repeat(show.stars) + "☆".repeat(5 - show.stars);
        
        container.innerHTML = `
            <div class="featured-card" onclick="sendShow(${show.id})">
                <div class="featured-badge">PIÙ APPREZZATI</div>
                <div class="card-icon" style="font-size:3.5rem;">💎</div>
                <div class="featured-info">
                    <h3>${show.name}</h3>
                    <p>Scelto dalla community • ${show.vts} voti</p>
                </div>
                <div class="featured-stars">${starIcons}</div>
            </div>
        `;
    }

    async function captureAndSubmitVote() {
        // Cattura dal video del mouse virtuale
        const video = document.getElementById('gestureVideo');
        if (!video || video.videoWidth === 0) { 
           submitVote(pendingVote.id, pendingVote.stars, ""); 
           return; 
        } // Fallback no photo
        
        const canvas = document.createElement('canvas');
        canvas.width = 120; // Ottimizzato per ESP32 (max ~4-5KB base64)
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        
        // Ritaglio quadrato centrale
        const size = Math.min(video.videoWidth, video.videoHeight);
        const x = (video.videoWidth - size) / 2;
        const y = (video.videoHeight - size) / 2;
        ctx.translate(120, 0); ctx.scale(-1, 1); // Mirror
        ctx.drawImage(video, x, y, size, size, 0, 0, 120, 120);
        
        const photo = canvas.toDataURL('image/jpeg', 0.5); // Qualità media
        submitVote(pendingVote.id, pendingVote.stars, photo);
    }

    function showVoteSuccess() {
      const popup = document.getElementById('voteSuccessPopup');
      if (popup) {
        popup.style.display = 'flex';
        popup.style.opacity = '1';
        setTimeout(() => {
          popup.style.opacity = '0';
          setTimeout(() => {
            popup.style.display = 'none';
          }, 500);
        }, 3000);
      }
    }

    function submitVote(id, stars, photo) {
      if (id == 11) {
         showCommandFeedback(true, "Show TEST non è votabile!");
         return;
      }
      const body = JSON.stringify({ id, stars, photo: photo || "" });
      
      // We don't use fetchWithTimeout here because LittleFS write might take time
      fetch('/vote', {
          method: 'POST',
          headers: {'Content-Type': 'text/plain'},
          body: body
      })
      .then(r => {
          if(r.ok) {
            showCommandFeedback(false);
            refreshStats();
            showVoteSuccess();
          } else {
            throw new Error("VOTE_ERROR");
          }
      })
      .catch(e => {
          showCommandFeedback(true, "Votazione fallita, riprova");
      })
      .finally(() => {
          if (pendingVote.wasCameraOff && cameraSystemEnabled) {
              cameraSystemEnabled = false;
              stopCameraCompletely();
              document.getElementById('globalCameraContainer').style.opacity = '0';
          }
      });
    }

    function submitShowSuggestion() {
        const nameEl = document.getElementById('suggestionName');
        const textEl = document.getElementById('showSuggestionInput');
        const feedbackEl = document.getElementById('suggestionFeedback');
        
        if (!nameEl.value.trim() || !textEl.value.trim()) {
            feedbackEl.style.display = 'block';
            feedbackEl.style.color = '#ff5252';
            feedbackEl.innerText = 'Compila entrambi i campi!';
            return;
        }

        const newIdea = {
            name: nameEl.value.trim(),
            text: textEl.value.trim(),
            date: new Date().toLocaleDateString('it-IT') + ' ' + new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})
        };

        fetch('/suggest', {
            method: 'POST',
            body: JSON.stringify(newIdea),
            headers: {'Content-Type': 'application/json'}
        }).catch(err => console.error("Idea sync error:", err));

        nameEl.value = '';
        textEl.value = '';
        feedbackEl.style.display = 'block';
        feedbackEl.style.color = '#00e5ff';
        feedbackEl.innerText = 'Idea inviata! Grazie!';
        
        setTimeout(() => { feedbackEl.style.display = 'none'; }, 3000);
        
        // If in admin area, refresh ideas list
        if (window.location.pathname === '/control-area' && typeof renderAdminIdeas === 'function') {
            renderAdminIdeas();
        }
    }

    function resetStats() {
      if(confirm("⚠️ Sei sicuro? Questo cancellerà TUTTE le statistiche e i voti permanentemente!")) {
        fetchWithTimeout('/reset-stats')
          .then(r => {
            if(r.ok) {
              alert("✅ Statistiche resettate correttamente.");
              location.reload();
            } else {
              alert("❌ Errore durante il reset.");
            }
          })
          .catch(e => alert("❌ Timeout o errore nel reset."));
      }
    }

    function setPump(i, arg) {
      const val = (typeof arg === 'object') ? arg.value : arg;
      const valEl = document.getElementById('val' + i);
      if(valEl) valEl.innerText = val;
      
      // Aggiorna anche lo stato nella riga della pompa se esiste (per Area Privata)
      const stateEl = document.getElementById("pumpState" + i);
      if(stateEl) {
        stateEl.innerText = (val > 0) ? "ON" : "OFF";
        stateEl.style.color = (val > 0) ? "#00e676" : "#ff5252";
      }

      fetchWithTimeout(`/pompa${i}?val=${val}`)
        .then(r => {
          if(!r.ok) throw new Error("POMPA_ERROR");
          return r.text();
        })
        .then(t => {
          const fb = document.getElementById('feedback');
          if(fb) fb.textContent = '✅ Pompa ' + i + ' a ' + val;
          showCommandFeedback(false);
        })
        .catch(e => {
          const fb = document.getElementById('feedback');
          if(fb) fb.textContent = '❌ Errore pompa ' + i;
          showCommandFeedback(true, "comando non ricevuto di riprovare");
        });
    }

    function stopPump(i) {
      // Usa setPump per gestire la logica di reset UI con un unico punto di entrata
      setPump(i, 0); 
      
      // Forza sincronizzazione slider se presenti
      const slider = document.querySelector("input[oninput*='setPump(" + i + ")']");
      if(slider) slider.value = 0;
    }

    // Funzione per fermare tutte le audio
    function stopAllAudio() {
      for(let i=1; i<=30; i++) {
        let audio = document.getElementById('audio' + i);
        if(audio) {
          audio.pause();
          audio.currentTime = 0;
        }
      }
      // Ferma anche l'audio orchestra
      let orchestraAudio = document.getElementById('orchestraAudio');
      if(orchestraAudio) {
        orchestraAudio.pause();
        orchestraAudio.currentTime = 0;
      }
    }

    // ======= WEATHER MONITORING FUNCTIONS =======
    let pendingShowNumber = null;

    // Controlla il vento prima di avviare uno show (ORA SINCRONO DA RAM)
    function checkWindBeforeShow(showNumber) {
      if (window.currentWindValid === false || window.currentWindSpeedVal === undefined) return true;
      
      if (window.currentWindSpeedVal <= window.currentWindThresholdVal) {
          return true;
      }
      
      console.log("VENTO FORTE! Soglia:", window.currentWindThresholdVal, "Attuale:", window.currentWindSpeedVal);
      // Vento alto: mostra avviso
      pendingShowNumber = showNumber;
      const speedEl = document.getElementById('windSpeedValue');
      const modalEl = document.getElementById('windWarningModal');
      
      if (speedEl && modalEl) {
        speedEl.textContent = window.currentWindSpeedVal.toFixed(1) + ' km/h';
        modalEl.style.display = 'flex';
          
          // Sync header badge and admin widget too
          const hv = document.getElementById('windMainValDisplay');
          if(hv) hv.textContent = val;
          const mv = document.getElementById('windMainVal');
          if(mv) mv.textContent = val;

          console.log("Modal visualizzato.");
        } else {
          console.error("ERRORE: Elementi modal non trovati!", {speedEl, modalEl});
        }
        
        return false; // Non procedere ancora (aspetta decisione utente)
      } catch (error) {
        console.error('Errore recupero dati meteo:', error);
        return true; // In caso di errore, procedi comunque (fail-safe)
      }
    }

    function cancelShowDueToWind() {
      document.getElementById('windWarningModal').style.display = 'none';
      pendingShowNumber = null;
      console.log('Show annullato a causa del vento');
    }

    function proceedWithShowDespiteWind() {
      document.getElementById('windWarningModal').style.display = 'none';
      if (pendingShowNumber !== null) {
        requestShow(pendingShowNumber);
        pendingShowNumber = null;
      }
    }

    // Funzione per gestire show con musica (ora con controllo meteo)
    function sendShow(showNumber) {
      if (isMaintenanceActive) {
        alert("⚠️ Impossibile avviare: Manutenzione in corso.");
        return;
      }
      
      // Controllo vento istantaneo (non blocca perché usa dati RAM aggiornati in background)
      if (!checkWindBeforeShow(showNumber)) return;
      
      // Avvia immediatamente lo show (audio, grafica e segnale ESP32 in parallelo)
      // Saltiamo il controllo meteo bloccante per garantire massima fluidità al click
      requestShow(showNumber);
    }

    // Funzione che esegue effettivamente lo show
    function executeShow(showNumber, elapsed = 0) {
      console.log(">>> executeShow START:", showNumber, "elapsed:", elapsed);
      
      // Guard: evita esecuzioni sovrapposte
      if (isExecutingShow) {
        console.warn("executeShow: già in esecuzione, ignorato per show", showNumber);
        return;
      }
      isExecutingShow = true;
      
      lastActiveShowId = showNumber;
      try {
        stopAllAudio();
        
        if (showCompletionTimeout) {
          clearTimeout(showCompletionTimeout);
          showCompletionTimeout = null;
        }

    if (showNumber >= 1 && showNumber <= 30) {
        let audio = document.getElementById('audio' + showNumber);
        if (audio) {
            const doPlay = () => {
                if (elapsed > 0) {
                  let baseVol = (showNumber === 11) ? 0.4 : 1.0;
                  audio.volume = baseVol * (window.currentGlobalVolume / 100.0);
                  audio.currentTime = elapsed / 1000.0;
                  audio.play().catch(e => console.log("Errore play audio sync:", e));
                } else {
                  audio.currentTime = 0;
                  audio.volume = 0;
                  audio.play().then(() => {
                      let fadeDuration = 3000;
                      let fadeSteps = 60;
                      let stepTime = fadeDuration / fadeSteps;
                      let baseTargetVolume = (showNumber === 11) ? 0.4 : 1.0;
                      let targetVolume = baseTargetVolume * (window.currentGlobalVolume / 100.0);
                      let stepAmount = targetVolume / fadeSteps;
                      let fadeInInterval = setInterval(() => {
                          if (audio.volume < targetVolume) {
                              audio.volume = Math.min(targetVolume, audio.volume + stepAmount);
                          } else {
                              clearInterval(fadeInInterval);
                          }
                      }, stepTime);
                  }).catch(e => console.log("Errore play audio:", e));
                }
              };
              if (audio.readyState >= 2) {
                doPlay();
              } else {
                let waitedMs = 0;
                const waitInterval = setInterval(() => {
                  waitedMs += 50;
                  if (audio.readyState >= 2) { clearInterval(waitInterval); doPlay(); }
                  else if (waitedMs >= 3000) { clearInterval(waitInterval); doPlay(); }
                }, 50);
              }
        }
        
        let durata = showDurate[showNumber] || 180000;
        let tempoRimanente = durata - elapsed;
        if (tempoRimanente < 0) tempoRimanente = 0;

        let hasEnded = false;
        const handleShowEnd = () => {
          if (hasEnded) return;
          hasEnded = true;
          
          chiudiSimulazione();
          if (showCompletionTimeout) {
            clearTimeout(showCompletionTimeout);
            showCompletionTimeout = null;
          }
          showEndVotePrompt(showNumber);
          
          // 1 minuto dopo la fine dello show, pronuncia frase simpatica
          setTimeout(() => {
            const phrasesEnd = [
                "Spero che lo spettacolo vi sia piaciuto! Le fontane tornano presto per emozionarvi ancora.",
                "E con questo è tutto, per ora! Ma non allontanatevi troppo, la fontana ricarica le batterie e torna presto!",
                "Un applauso all'acqua! Rimanete nei paraggi, le fontane tornano presto con nuova energia!",
                "Che show spettacolare! I getti d'acqua si riposano un momento ma tornano prestissimo, non andate via!",
                "Sipario chiuso per adesso. Andate a prendere una bibita fresca, la fontana tornerà presto a ballare per voi!"
            ];
            if (typeof speakEventPhrase === 'function') speakEventPhrase(phrasesEnd[Math.floor(Math.random() * phrasesEnd.length)]);
          }, 60000);
        };

        // Il timeout è solo safety net: +15s per assorbire ritardi rete/buffering
        showCompletionTimeout = setTimeout(handleShowEnd, tempoRimanente + 15000);
        
        if (audio) {
          // Fine canzone: chiudi show
          audio.onended = handleShowEnd;
          
          // Anti-scatto: riprendi automaticamente dopo stallo per connessione instabile
          let stallRecoveryTimer = null;
          const clearStallTimer = () => {
            if (stallRecoveryTimer) { clearTimeout(stallRecoveryTimer); stallRecoveryTimer = null; }
          };
          audio.addEventListener('waiting', () => {
            clearStallTimer();
            stallRecoveryTimer = setTimeout(() => {
              if (!audio.paused && audio.readyState < 3) {
                const t = audio.currentTime;
                audio.pause();
                audio.load();
                audio.currentTime = t;
                audio.play().catch(e => console.warn('Stall recovery error:', e));
              }
            }, 1500);
          }, { once: false });
          audio.addEventListener('playing', clearStallTimer, { once: false });
          audio.addEventListener('stalled', () => {
            clearStallTimer();
            stallRecoveryTimer = setTimeout(() => {
              if (audio.paused || audio.readyState < 2) {
                const t = audio.currentTime;
                audio.load();
                audio.currentTime = t;
                audio.play().catch(e => console.warn('Stall recovery error:', e));
              }
            }, 2000);
          }, { once: false });
        }
    }

      } catch (err) {
        console.error("ERRORE CRITICO in executeShow:", err);
      } finally {
        isExecutingShow = false;
      }
      
      console.log(">>> executeShow END (UI trigger)");
      try {
        avviaSimulazione(showNumber); 
        mostraIntro(showNumber);
      } catch (e) {
        console.error("Errore avviaSimulazione/mostraIntro:", e);
      }
    }

// =============================================
// AUDIO PRELOAD SYSTEM (RAM blob cache - universale su tutti i dispositivi)
// =============================================
const audioBlobCache = {};   // showNumber -> blobUrl (in RAM)
let currentPlayBlobUrl = null;

// Scarica un brano completamente in RAM come blob URL
async function preloadAudioForShow(showNumber, onProgress) {
  if (audioBlobCache[showNumber]) {
    if (onProgress) onProgress(100);
    return audioBlobCache[showNumber];
  }

  const audio = document.getElementById('audio' + showNumber);
  if (!audio) return null;
  const originalSrc = audio.getAttribute('src');

  try {
    const response = await fetch(originalSrc);
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const contentLength = parseInt(response.headers.get('content-length') || '0');
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (onProgress && contentLength > 0) {
        onProgress(Math.min(99, Math.round(received / contentLength * 100)));
      }
    }
    if (onProgress) onProgress(100);

    const blob = new Blob(chunks);
    const blobUrl = URL.createObjectURL(blob);
    audioBlobCache[showNumber] = blobUrl;
    audio.src = blobUrl;
    console.log('Audio in RAM per show', showNumber, '-', Math.round(blob.size/1024), 'KB');
    return blobUrl;
  } catch(e) {
    console.warn('Preload fallito per show', showNumber, '- uso streaming:', e);
    if (onProgress) onProgress(100);
    return originalSrc; // fallback streaming
  }
}

// Pre-scarica in background un show (tutti i dispositivi)
function backgroundPreloadShow(showNumber) {
  if (!showNumber || showNumber <= 0 || audioBlobCache[showNumber]) return;
  console.log('Background preload avviato per show', showNumber, '(tutti i dispositivi)');
  preloadAudioForShow(showNumber, null).catch(() => {});
}

// Libera RAM del brano finito
function releaseCurrentAudio() {
  if (currentPlayBlobUrl) {
    URL.revokeObjectURL(currentPlayBlobUrl);
    currentPlayBlobUrl = null;
  }
}

// Overlay di caricamento con progress bar
function showAudioLoadingOverlay(showNumber) {
  let overlay = document.getElementById('audioLoadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'audioLoadingOverlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 999998;
      background: rgba(0,0,0,0.88);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      backdrop-filter: blur(8px);
      font-family: 'Outfit', sans-serif;
    `;
    overlay.innerHTML = `
      <div style="font-size:3rem; margin-bottom:16px;">🎵</div>
      <div style="color:#fff; font-size:1.4rem; font-weight:600; margin-bottom:8px;">Preparazione Show...</div>
      <div id="audioLoadShowName" style="color:#00e5ff; font-size:1rem; margin-bottom:24px; opacity:0.8;"></div>
      <div style="width:280px; height:6px; background:rgba(255,255,255,0.15); border-radius:3px; overflow:hidden;">
        <div id="audioLoadProgressBar" style="height:100%; width:0%; background:linear-gradient(90deg,#00e5ff,#7b2fff); border-radius:3px; transition:width 0.15s ease;"></div>
      </div>
      <div id="audioLoadPercent" style="color:#aaa; font-size:0.9rem; margin-top:12px;">0%</div>
    `;
    document.body.appendChild(overlay);
  }
  const nameEl = overlay.querySelector('#audioLoadShowName');
  if (nameEl) {
    const names = typeof SHOW_NAMES !== 'undefined' ? SHOW_NAMES : {};
    nameEl.textContent = names[showNumber] || ('Show ' + showNumber);
  }
  overlay.style.display = 'flex';
  updateAudioLoadingProgress(0);
}

function updateAudioLoadingProgress(pct) {
  const bar = document.getElementById('audioLoadProgressBar');
  const pctEl = document.getElementById('audioLoadPercent');
  if (bar) bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
}

function hideAudioLoadingOverlay() {
  const overlay = document.getElementById('audioLoadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

// Funzione chiamata dai bottoni UI
async function requestShow(showNumber) {
  if (isMaintenanceActive) return;
  console.log('>>> requestShow START:', showNumber);

  lastLocalShowTrigger = Date.now();
  lastActiveShowId = showNumber;
  
  // 1. Apri la grafica istantaneamente
  try { avviaSimulazione(showNumber); mostraIntro(showNumber); } catch(e) {}
  
  let syncEl = document.getElementById("showSyncStatus");
  if (syncEl) syncEl.innerHTML = "⏳ <span>Sincronizzazione Audio in corso...</span>";

  // 2. Forza il pre-caricamento e l'avvio dell'audio
  let audio = document.getElementById('audio' + showNumber);
  if (audio) {
    audio.volume = 0; // Muto finché non interviene executeShow col fade-in
    try {
        await audio.play(); // IL CODICE SI FERMA QUI FINO A CHE IL DOWNLOAD NON E' SUFFICIENTE PER SUONARE!
        if (syncEl) syncEl.innerHTML = "✅ <span style='color:#00e676;'>Show Avviato!</span>";
        setTimeout(() => { if (syncEl) syncEl.innerHTML = ""; }, 3000);
    } catch(e) {
        console.warn("Audio ignorato o bloccato:", e);
        if (syncEl) syncEl.innerHTML = "⚠️ <span style='color:#ff5252;'>Audio non sincronizzato</span>";
        setTimeout(() => { if (syncEl) syncEl.innerHTML = ""; }, 3000);
    }
  } else {
    if (syncEl) syncEl.innerHTML = "";
  }

  // 3. Ora che l'audio sta suonando (o se c'è stato un errore), passiamo il controllo a executeShow
  executeShow(showNumber, 0);

  // 4. E contemporaneamente spariamo il comando alle pompe per una SINCRONIA PERFETTA
  fetchWithTimeout('/show' + showNumber)
    .then(r => r.text())
    .then(t => {
      console.log('Risposta server:', t);
      try { showCommandFeedback(false); } catch(e) {}
      
      // Pre-carica in background il prossimo show su TUTTI i dispositivi
      if (typeof nextShowNumber !== 'undefined' && nextShowNumber > 0 && nextShowNumber !== showNumber) {
        setTimeout(() => backgroundPreloadShow(nextShowNumber), 3000);
      }
    })
    .catch(e => {
      hideAudioLoadingOverlay();
      console.error('Errore fetch show:', e);
      showCommandFeedback(true);
    });
}


    

    // Funzione per fermare show e audio
    function stopAllShows() {
      console.log("stopAllShows chiamato");
      chiudiSimulazione(); // Chiude la schermata show/simulazione
      if (lastActiveShowId > 0) {

        localFinishedShowId = lastActiveShowId;
        console.log("Marcato show come finito:", localFinishedShowId);
      }
      // Ferma tutte le pompe immediatamente lato hardware
      for (let i = 0; i < 6; i++) {
        try { ledcWrite && ledcWrite(i, 0); } catch(e) {}
      }
      send('/stop');
      stopAllAudio();
      if (showCompletionTimeout) {
        clearTimeout(showCompletionTimeout);
        showCompletionTimeout = null;
      }
      // Reset slider e valori
      for(let i=1; i<=6; i++) {
        const valEl = document.getElementById('val'+i);
        if(valEl) valEl.innerText = '0';
        const slider = document.querySelector("input[oninput*='setPump(" + i + ")']");
        if(slider) slider.value = 0;
      }
    }

    // Bottone di emergenza: sempre attivo, priorità massima
    function emergencyStop() {
      // 1. Reset locale immediato (Priorità Assoluta)
      stopAllAudio();
      chiudiSimulazione(); // Chiude la schermata show/simulazione
      
      if (showCompletionTimeout) {
        clearTimeout(showCompletionTimeout);
        showCompletionTimeout = null;
      }
      
      // Ferma timer e auto mode locale
      if (typeof autoTimerInterval !== 'undefined') {
          clearInterval(autoTimerInterval);
      }
      if (typeof autoCurrentShowTimeout !== 'undefined') {
          clearTimeout(autoCurrentShowTimeout);
      }

      // Chiudi schermate automatiche senza password (è un'emergenza!)
      const autoScreen = document.getElementById("autoScreen");
      if (autoScreen) autoScreen.style.display = "none";
      
      const blocker = document.getElementById("autoScreenBlocker");
      if (blocker) blocker.remove();

      // Reset UI locale (valori e slider)
      for(let i=1; i<=6; i++) {
        const valEl = document.getElementById('val'+i);
        if (valEl) valEl.innerText = '0';
        const slider = document.querySelector("input[oninput*='setPump(" + i + ")']");
        if(slider) slider.value = 0;
      }

      // 2. Comunicazione server (priorità hardware)
      send('/stop');
      fetch("/auto?enable=0"); // Forza stop auto mode sul server
      
      // Feedback visivo immediato
      const feedback = document.getElementById('feedback');
      if (feedback) feedback.textContent = '⛔ EMERGENZA!';

      // 3. Chiusura di tutte le modali/overlay e ritorno alla home
      if (typeof closeFeedbackArea === 'function') closeFeedbackArea();
      if (typeof closeAiPopup === 'function') closeAiPopup();
      if (typeof closeGestureExperience === 'function') closeGestureExperience();
      if (typeof hideCountdown === 'function') hideCountdown();

      ['faceScannerOverlay', 'adminOverlay', 'pumpModal', 'faceEditModal', 'karaokeOverlay', 'windStatusOverlay', 'windWarningModal'].forEach(id => {
         const el = document.getElementById(id);
         if (el) el.style.display = 'none';
      });

      const welcomeEl = document.getElementById('welcome');
      const panelEl = document.getElementById('panel');
      if (panelEl && welcomeEl && !welcomeEl.classList.contains('active')) {
          panelEl.classList.add('active');
      }

      // Se non siamo nella home page (es. /led-control), ci ritorniamo
      setTimeout(() => {
          if (window.location.pathname !== '/' && window.location.pathname !== '') {
              window.location.href = '/';
          }
      }, 300);
    }

let animazioneAttiva = false;

// ====== BACKGROUND CANVAS REMOVED FOR PERFORMANCE ======
// Bollicine di sottofondo rimosse per migliorare la fluidità del cursore mano

window.addEventListener('DOMContentLoaded', function() {
  
  // Inizializza Nuovi Widget UI
  updateClock();
  setInterval(updateClock, 1000);
  refreshStats(); // Avvia anche il loop degli show migliori
  manualWeatherRefresh(); // Popola subito la card del vento
  
  // Unlock audio on first user interaction
  let audioUnlocked = false;
  const unlockAudio = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    console.log("Audio engine unlocked by user");

    // Prime the neural narrazione audio object
    if (!window._tutAudio) window._tutAudio = new Audio();
    window._tutAudio.play().then(() => {
        window._tutAudio.pause();
        window._tutAudio.currentTime = 0;
    }).catch(e => console.warn("Errore priming tutAudio:", e));

    const orchestraAudio = document.getElementById('orchestraAudio');
    if (orchestraAudio) {
      orchestraAudio.volume = 0; // Previene riproduzione accidentale durante l'unlock
      orchestraAudio.play().then(() => {
        orchestraAudio.pause();
        orchestraAudio.currentTime = 0;
        audioUnlocked = true;
        console.log("Audio unlocked successfully");
      }).catch(() => {
        // Ignore errors during unlock
      });
    }
  };
  document.addEventListener('click', unlockAudio, { once: true });
  document.addEventListener('touchstart', unlockAudio, { once: true });
});

// === SYNC POLLING LOGIC (HTTP) ===
// === SYNC WEBSOCKET LOGIC ===
let wsSync = null;
let wsReconnectTimeout = null;
let syncStatusIndicator = null;
let lastPolledShow = 0;
let localFinishedShowId = 0; // Tracks the show that was just finished or closed
let lastActiveShowId = 0;    // Tracks the current show ID playing locally
let lastLocalShowTrigger = 0;  // Timestamp of last local show trigger (requestShow)
let isExecutingShow = false;   // Guard against overlapping executeShow calls

function startWebSocketSync() {
  if (!syncStatusIndicator) {
    syncStatusIndicator = document.createElement('div');
    syncStatusIndicator.id = 'wsStatusIndicator';
    syncStatusIndicator.style.position = 'fixed';
    syncStatusIndicator.style.bottom = '10px';
    syncStatusIndicator.style.left = '10px';
    syncStatusIndicator.style.width = '12px';
    syncStatusIndicator.style.height = '12px';
    syncStatusIndicator.style.borderRadius = '50%';
    syncStatusIndicator.style.backgroundColor = 'orange'; // Starts orange (connecting)
    syncStatusIndicator.style.zIndex = '999999';
    syncStatusIndicator.style.opacity = '0.6';
    syncStatusIndicator.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
    syncStatusIndicator.title = 'Connessione WebSocket in corso...';
    document.body.appendChild(syncStatusIndicator);
  }

  // Costruiamo l'URL WebSocket puntando alla porta 81 del dominio pubblico
  // NOTA: Cloudflare potrebbe bloccare la porta 81. Se non funziona, usare l'IP locale quando in locale.
  const wsUrl = `ws://fontana.fontanabyloriorl.it:81/`;
  wsSync = new WebSocket(wsUrl);

  wsSync.onopen = () => {
    console.log("WebSocket Sync Connected");
    if (syncStatusIndicator) {
      syncStatusIndicator.style.backgroundColor = '#00e676';
      syncStatusIndicator.title = 'Sincronizzazione WS OK';
    }
  };

  wsSync.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      let showNum = parseInt(data.show);
      let elapsed = parseInt(data.elapsed) || 0;
      
      // Controllo Saluti Personalizzati / TTS remoto
      if (data.speak !== undefined && data.speak !== "") {
        console.log("WS Sync: ricevuto comando vocale remoto -> " + data.speak);
        if (typeof _speakEvent === 'function') {
          _speakEvent(data.speak);
        } else if (typeof speakEventPhrase === 'function') {
          speakEventPhrase(data.speak);
        }
      }
      
      // Aggiorna variabili vento in RAM
      if (data.windSpeed !== undefined) {
        window.currentWindSpeedVal = data.windSpeed;
        window.currentWindValid = data.windValid;
        window.currentWindThresholdVal = data.windThreshold;
      }

      if (data.volume !== undefined) {
        let newVol = parseInt(data.volume);
        if (newVol !== window.currentGlobalVolume) {
          window.currentGlobalVolume = newVol;
          applyGlobalVolume(newVol);
          
          let slider = document.getElementById('globalVolumeSlider');
          if (slider && slider.value != newVol) {
            slider.value = newVol;
            let disp = document.getElementById('globalVolumeDisplay');
            if (disp) disp.innerText = newVol + '%';
          }
          playVolumeBeep(newVol);
        }
      }

      if (data.voiceVolume !== undefined) {
        let newVol = parseInt(data.voiceVolume);
        if (newVol !== window.currentVoiceVolume) {
          window.currentVoiceVolume = newVol;
          let slider = document.getElementById('voiceVolumeSlider');
          if (slider && slider.value != newVol) {
            slider.value = newVol;
            let disp = document.getElementById('voiceVolumeDisplay');
            if (disp) disp.innerText = newVol + '%';
          }
        }
      }

      if (showNum > 0) {
        if (showNum === localFinishedShowId) return;

        // Se questo dispositivo ha già avviato lo show localmente da poco (< 3s), ignora il WS
        if (showNum === lastActiveShowId && (Date.now() - lastLocalShowTrigger) < 3000) {
          lastPolledShow = showNum;
          return;
        }

        let audio = document.getElementById('audio' + showNum);
        if (audio) {
          if (audio.paused || Math.abs(audio.currentTime - (elapsed / 1000.0)) > 3.0) {
            console.log("WS Sync: innesco show", showNum, "tempo", elapsed);
            executeShow(showNum, elapsed);
            lastActiveShowId = showNum;
            
            // Pre-carica il prossimo show in background su questo dispositivo
            if (typeof nextShowNumber !== 'undefined' && nextShowNumber > 0 && nextShowNumber !== showNum) {
              setTimeout(() => backgroundPreloadShow(nextShowNumber), 8000);
            }
          }
        } else {
           executeShow(showNum, elapsed);
           lastActiveShowId = showNum;
        }
        lastPolledShow = showNum;
      } else {
        if (localFinishedShowId !== 0) {
          localFinishedShowId = 0;
        }
        if (lastPolledShow > 0) {
          console.log("WS Sync: rilevato stop show");
          stopAllShows();
        }
        lastPolledShow = 0;
        lastActiveShowId = 0;
      }
    } catch(e) {
      console.warn("Errore parsing WS JSON", e);
    }
  };

  wsSync.onclose = () => {
    console.warn("WebSocket Disconnected. Reconnecting in 2s...");
    if (syncStatusIndicator) {
      syncStatusIndicator.style.backgroundColor = 'red';
      syncStatusIndicator.title = 'Sincronizzazione offline. Riconnessione...';
    }
    clearTimeout(wsReconnectTimeout);
    wsReconnectTimeout = setTimeout(startWebSocketSync, 2000);
  };
  
  wsSync.onerror = (err) => {
    console.error("WebSocket Error:", err);
    wsSync.close(); // Forza la chiusura per innescare onclose e la riconnessione
  };
}

// Avvio logic di sincronizzazione WebSocket
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWebSocketSync);
} else {
    startWebSocketSync();
}

// === HTTP POLLING FALLBACK ===
// Se Cloudflare o il browser bloccano le WebSocket su porta 81, ricadiamo su HTTP
setInterval(async () => {
  if (wsSync && wsSync.readyState === WebSocket.OPEN) return; // Se WS funziona, non fare nulla
  try {
    const res = await fetch('/sync-status');
    if (res.ok) {
      const data = await res.json();
      if (wsSync && wsSync.onmessage) {
        if (syncStatusIndicator) {
          syncStatusIndicator.style.backgroundColor = '#ffeb3b'; // Giallo per HTTP Fallback
          syncStatusIndicator.title = 'Sincronizzazione HTTP (Fallback)';
        }
        wsSync.onmessage({ data: JSON.stringify(data) });
      }
    }
  } catch(e) {
    // Silenzioso in caso di errore, WebSocket proverà comunque a riconnettersi
  }
}, 1500);

// Funzione loopBackground rimossa per migliorare le performance
const showInfo = {
  1: { titolo: '🎵 "Blinding Lights" – The Weeknd', frasi: ["✨ La notte si accende di magia!", "⚡ Un'esplosione di energia!", "🌌 I getti danzano nel buio..."] },
  2: { titolo: '🎵 "X Remix" – Nicky Jam, J Balvin, Ozuna, Maluma', frasi: ["🎶 Il ritmo latino infiamma l'acqua!", "🔥 I colori si muovono a tempo!", "💥 Un'onda di pura energia!"] },
  3: { titolo: '🎵 "Pa Que Lo Bailes" – Lomiel', frasi: ["🎉 Vibrazioni tropicali in azione!", "💃 L'acqua balla senza sosta!", "🎵 Lasciati trasportare dal ritmo!"] },
  4: { titolo: '🎵 "Titanium" – David Guetta ft. Sia', frasi: ["🔊 Potenza pura e cristallina!", "🦾 Una coreografia invincibile!", "💫 L'energia esplode nell'aria!"] },
  5: { titolo: '🎵 "Animals" – Martin Garrix', frasi: ["🐾 Bassi profondi, getti altissimi!", "🎧 La fontana si scatena!", "🔥 Un turbine di luci e suoni!"] },
  6: { titolo: '🎵 "Gonna Make You Sweat" – C+C Music Factory', frasi: ["🕺 Tutti a tempo con l'acqua!", "💥 Una danza frenetica e selvaggia!", "🎶 Il ritmo è contagioso!"] },
  7: { titolo: '🎵 "Tusa" – Karol G ft. Nicki Minaj', frasi: ["💔 Emozione e ritmo intrecciati...", "🎤 L'acqua accompagna ogni nota!", "🌙 Una coreografia dolce ma potente!"] },
  8: { titolo: '🎵 "That\'s Amore" – Dean Martin', frasi: ["🍷 Un valzer acquatico elegante...", "🎶 La magia classica prende forma!", "❤️ I getti si muovono con amore!"] },
  9: { titolo: '🎵 "Sexy and I Know It" – LMFAO', frasi: ["😎 Coreografia esplosiva e divertente!", "💃 L'acqua si muove con stile!", "🔥 Uno show dal ritmo irresistibile!"] },
  10: { titolo: '🎵 "All I want for Christamas is you" – NATALE', frasi: ["✨ La magia delle feste brilla sull'acqua!", "🎇 Colori natalizi in movimento!", "🎄 L'atmosfera perfetta per sognare!"] },
  11: { titolo: '🧪 SHOW TEST', frasi: ['🔧 Test pompe in esecuzione...', '⚙️ Verifica movimenti in corso', '✅ I sistemi stanno rispondendo'] },
  12: { titolo: '🎵 "Tu mi porti su" – Giorgia', frasi: ["✨ Emozioni che salgono in alto...", "💙 L'acqua accarezza l'aria!", "🎶 Una melodia che trasporta!"] },
  13: { titolo: '🎵 "Rumore" – Raffaella Carrà', frasi: ["✨ L'acqua fa spettacolo e rumore!", "💃 Energia e ritmo italiano!", "🔥 Una coreografia indimenticabile!"] },
  14: { titolo: '🎵 "L\'Ombelico del Mondo" – Jovanotti', frasi: ["🌍 Ritmi tribali e getti potenti!", "🎶 La fontana celebra la vita!", "💦 Un'esplosione di gioia!"] },
  15: { titolo: '💎 "Raindance" – Elegant Show', frasi: ["✨ Eleganza, luce e armonia...", "💧 L'acqua danza leggera come pioggia!", "🌟 Una magia rilassante e pura!"] },
  16: { titolo: '🔥 "For You" – Liam Payne & Rita Ora', frasi: ["✨ Passione in ogni goccia!", "⚡ Movimenti sensuali e decisi!", "🌌 Una sinfonia mozzafiato!"] },
  17: { titolo: '🎵 "Give It Up To Me" – Sean Paul', frasi: ["🔥 Atmosfera rovente, ritmo acceso!", "💃 L'acqua vibra a tempo!", "✨ Energia che sale sempre di più!"] },
  18: { titolo: '🎵 "Me Rehúso" – Danny Ocean', frasi: ["❤️ Le luci seguono il battito del cuore!", "🌊 Un'onda di emozioni latine!", "🎶 Spettacolo irresistibile e caldo!"] },
  19: { titolo: '🎵 "Ora che non ho più te" – Cesare Cremonini', frasi: ["✨ Emozione pura e profonda...", "💧 I getti si muovono con delicatezza!", "🌌 La musica avvolge tutto..."] },
  20: { titolo: '🎵 "Títí Me Pregúntó" – Bad Bunny', frasi: ["🔥 Reggaeton a tutto volume!", "🎉 L'acqua esplode di colori!", "💃 Un ritmo che fa ballare anche la fontana!"] },
  21: { titolo: '🎵 "Fabulous" – Sharpay Evans', frasi: ["✨ Stile, eleganza e scintillio!", "👑 Una coreografia favolosa!", "💖 L'acqua brilla come una star!"] },
  22: { titolo: '🎵 "Don\'t Stop \'Til You Get Enough" – Michael Jackson', frasi: ["🕺 La disco music entra in acqua!", "🎶 Il ritmo anni '70 si scatena!", "✨ Non ci si ferma mai!"] },
  23: { titolo: '🎵 "Papaoutai" – Stromae', frasi: ["🎶 Ritmo unico e ipnotico!", "⚡ I getti scattano a tempo!", "🔥 Un'energia che non si ferma!"] },
  24: { titolo: '🎵 "Billie Jean" – Michael Jackson', frasi: ["🕺 Il Re del Pop prende vita sull'acqua!", "✨ Movimenti precisi e iconici!", "🌟 Una coreografia leggendaria!"] },
  25: { titolo: '🎵 "Skyfall" – Adele', frasi: ["🌊 Un'ondata maestosa e imponente!", "💫 Emozione e potenza drammatica!", "🌌 I getti salgono verso il cielo!"] },
  26: { titolo: '🎵 "Mentirosa" – Ráfaga', frasi: ["🎺 Ritmo latino irresistibile!", "💃 Le pompe ballano a ritmo di cumbia!", "🔥 Energia esplosiva!"] },
  27: { titolo: '🎵 "Symphony" – Clean Bandit', frasi: ["🎻 Atmosfera elegante...", "✨ I just wanna be part of your symphony!", "💥 Esplosione luminosa!"] },
  28: { titolo: '⚽ "Dai Dai" – Shakira & Burna Boy', frasi: ["⚽ L'inno del Mondiale!", "🌍 Dai Dai! Give it your all!", "🔥 Afrobeats e passione!"] },
  29: { titolo: '🔥 "Fireball" – Pitbull', frasi: ["🔥 Attenzione! La fontana sta prendendo fuoco!", "☄️ Un'esplosione di energia in arrivo!", "💥 Ritmo caliente e getti incandescenti!"] },
  30: { titolo: '🌴 "Y Que Fue?" – Don Miguelo', frasi: ["🌴 Dembow caraibico in arrivo!", "🎵 Y Que Fue! Lasciati trascinare dal ritmo!", "🌊 Un'esplosione tropicale di acqua e colore!"] },
  31: { titolo: '🏆 "Wavin\' Flag" – K\'NAAN', frasi: ["🏆 Il canto della vittoria sta per iniziare!", "🌍 Senti l'Africa nell'acqua e nei colori!", "🎶 Wavin' Flag: la fontana esplode di gioia!"] }
};

// showNames alias pointing to the global SHOW_NAMES (defined at top of script)
// to keep backward compatibility with older references
const showNames = SHOW_NAMES;

const showDurate = {
  1: 214000, 2: 269000, 3: 142000, 4: 265000, 5: 256000,
  6: 258000, 7: 233000, 8: 170000, 9: 160000, 10: 247000,
  11: 71000,  12: 253000, 13: 216000, 14: 290000, 15: 219000,
  16: 238000, 17: 243000, 18: 206000, 19: 285000, 20: 239000,
  21: 152000, 22: 240000, 23: 276000, 24: 287000, 25: 280000,
  26: 192000, 27: 212000, 28: 221000, 29: 236000,
  30: 164000
};

let showCompletionTimeout = null;

// Thematic accent colors for each show
const introAccentColors = {
  1: ['#00e5ff','#7b2fff'], 2: ['#ff6b35','#ffd700'], 3: ['#ff4081','#ff9800'],
  4: ['#00e5ff','#0288d1'], 5: ['#ff6b35','#ff1744'], 6: ['#ffd700','#ff6b35'],
  7: ['#e91e63','#9c27b0'], 8: ['#ffd700','#ff8f00'], 9: ['#00e676','#00bcd4'],
  10: ['#e53935','#43a047'], 11: ['#78909c','#b0bec5'], 12: ['#7986cb','#42a5f5'],
  13: ['#f06292','#ff8a65'], 14: ['#ffb300','#e65100'], 15: ['#00bcd4','#9c27b0'],
  16: ['#ff5722','#e91e63'], 17: ['#ff9800','#ff5722'], 18: ['#e91e63','#9c27b0'],
  19: ['#00e5ff','#7b2fff'], 20: ['#ff6b35','#ffd700'], 21: ['#ff4081','#ff9800'],
  22: ['#00e5ff','#0288d1'], 23: ['#ff6b35','#ff1744'], 24: ['#ffd700','#ff6b35'],
  25: ['#e91e63','#9c27b0'], 26: ['#ff6b35','#ffd700'], 27: ['#4fc3f7','#7b2fff'], 28: ['#00c853','#ffd700'], 29: ['#ff3d00','#ffea00'], 30: ['#00e5ff','#76ff03']
};

function spawnIntroParticles(c1, c2) {
  const particleLayer = document.getElementById('showParticleLayer');
  if (!particleLayer) return;
  particleLayer.innerHTML = '';
  for (let p = 0; p < 20; p++) {
    const dot = document.createElement('div');
    dot.className = 'intro-particle';
    const startX = 10 + Math.random() * 80;
    const startY = 10 + Math.random() * 80;
    const angle = Math.random() * 360;
    const dist = 50 + Math.random() * 90;
    const px = Math.cos(angle * Math.PI / 180) * dist;
    const py = Math.sin(angle * Math.PI / 180) * dist;
    const color = Math.random() < 0.5 ? (c1||'#00e5ff') : (c2||'#7b2fff');
    const size = 2 + Math.random() * 4;
    dot.style.cssText = `left:${startX}%;top:${startY}%;--px:${px}px;--py:${py}px;animation-delay:${Math.random()*2}s;animation-duration:${2+Math.random()*2}s;background:${color};width:${size}px;height:${size}px;box-shadow:0 0 6px ${color};`;
    particleLayer.appendChild(dot);
  }
}

function mostraIntro(showNumber) {
  const introCard = document.getElementById("showIntroCard");
  const titoloEl = document.getElementById("showTitleEl");
  const phraseEl = document.getElementById("showPhraseEl");
  const waveEl = document.getElementById("showIntroWave");
  let info = showInfo[showNumber];
  if (!info) {
    let fallbackName = SHOW_NAMES[showNumber] || ("Show " + showNumber);
    info = { titolo: '🎵 ' + fallbackName, frasi: ["✨ Lo show è in esecuzione!", "🔥 L'acqua prende vita!", "🎶 La fontana danza con la musica!"] };
  }

  // Thematic colors
  const [c1, c2] = introAccentColors[showNumber] || ['#00e5ff','#7b2fff'];

  // Apply thematic accent to music bars
  document.querySelectorAll('#showMusicBars .mbar').forEach(bar => {
    bar.style.background = `linear-gradient(180deg, ${c1}, ${c2})`;
    bar.style.boxShadow = `0 0 8px ${c1}99`;
  });

  // Apply to wave
  if (waveEl) waveEl.style.background = `linear-gradient(90deg, transparent, ${c1} 30%, ${c2} 70%, transparent)`;

  // Apply to card border & glow
  if (introCard) {
    introCard.style.borderColor = c1;
    introCard.style.boxShadow = `0 0 120px ${c1}44, 0 0 40px ${c2}22, inset 0 0 60px rgba(0,50,120,0.25)`;
  }

  // Spawn particles
  spawnIntroParticles(c1, c2);

  // Setup text
  titoloEl.innerText = info.titolo;
  phraseEl.innerText = "";
  phraseEl.classList.remove("show");

  // Show the card with dramatic entrance
  introCard.classList.remove("hidden");
  introCard.classList.add("visible");

  let frasi = info.frasi;
  let i = 0;

  function mostraFrase() {
    if (!introCard.classList.contains("visible")) return;

    if (i >= frasi.length) {
      i = 0;
    }

    phraseEl.innerText = frasi[i];
    phraseEl.classList.add("show");

    setTimeout(() => {
      phraseEl.classList.remove("show");
      setTimeout(() => {
        i++;
        mostraFrase();
      }, 500);
    }, 2500);
  }

  // Small delay before first phrase
  setTimeout(mostraFrase, 800);
}




function avviaSimulazione() {
  const container = document.getElementById("simulazione");
  container.style.display = "block";
  animazioneAttiva = true;
}

function chiudiSimulazione() {
  console.log("chiudiSimulazione chiamato");
  if (lastActiveShowId > 0) {
    localFinishedShowId = lastActiveShowId;
    console.log("Marcato show come chiuso dall'utente:", localFinishedShowId);
  }
  document.getElementById("simulazione").style.display = "none";
  animazioneAttiva = false;
}
// Simulazione delle pompe rimossa per migliorare le performance



// Modalità Automatica Grafica
let isAutoModeGraphicalActive = false;
let autoModeInterval = null;

function attivaModalitaAutomatica() {
  isAutoModeGraphicalActive = true;
  
  if (userRole !== 'admin') {
     document.getElementById("autoScreen").style.display = "flex";
     if (!document.getElementById("autoScreenBlocker")) {
       const blocker = document.createElement("div");
       blocker.id = "autoScreenBlocker";
       blocker.style.position = "fixed";
       blocker.style.inset = "0";
       blocker.style.background = "rgba(0,0,0,0.01)";
       blocker.style.zIndex = "9989";
       blocker.style.pointerEvents = "auto";
       blocker.onclick = function(e) { e.stopPropagation(); e.preventDefault(); return false; };
       document.body.appendChild(blocker);
     }
  }

  if (window.speechSynthesis) {
     let msg = new SpeechSynthesisUtterance("Modalità automatica attivata");
     msg.lang = 'it-IT';
     window.speechSynthesis.speak(msg);
  }

  if (!autoModeInterval) {
    autoModeInterval = requestAnimationFrame(aggiornaAutoBigTimer);
  }
}

function aggiornaAutoBigTimer() {
  if (!isAutoModeGraphicalActive) {
    autoModeInterval = null;
    return;
  }
  
  // Calcolo fluido basato sul target timestamp
  let secRemaining = 0;
  if (targetShowTime > 0) {
    secRemaining = Math.max(0, (targetShowTime - Date.now()) / 1000);
  } else {
    secRemaining = homeNextShowIn > 0 ? homeNextShowIn : 0;
  }
  
  const minuti = Math.floor(secRemaining / 60);
  const secondiInt = Math.floor(secRemaining % 60);
  const testo = `${minuti.toString().padStart(2, '0')}:${secondiInt.toString().padStart(2, '0')}`;
  
  const timerSpan = document.getElementById("autoBigTimer");
  if (timerSpan) {
    timerSpan.textContent = testo;
    
    // Animazione elegante sotto i 10 secondi
    if (secRemaining <= 10 && secRemaining > 0) {
      // Usa i decimi per pulsare
      const fraction = secRemaining - Math.floor(secRemaining);
      // Fraction va da 1.0 a 0.0. Vogliamo pulsare.
      const scale = 1.0 + (fraction * 0.2); // Scala tra 1.0 e 1.2
      timerSpan.style.transform = `scale(${scale})`;
      timerSpan.style.color = "#ff3366";
    } else {
      timerSpan.style.transform = "scale(1)";
      timerSpan.style.color = "#00e5ff";
    }
  }
  
  autoModeInterval = requestAnimationFrame(aggiornaAutoBigTimer);
}

function chiudiAutoScreen() {
  const pass = prompt("Inserisci la password per uscire dalla modalità automatica:");
  if (pass !== "lori123" && pass !== "admin") {
    alert("❌ Password errata. Non puoi uscire dalla modalità automatica.");
    return;
  }
  
  isAutoModeGraphicalActive = false;
  document.getElementById("autoScreen").style.display = "none";
  const blocker = document.getElementById("autoScreenBlocker");
  if (blocker) blocker.remove();
  
  if (autoModeInterval) {
    cancelAnimationFrame(autoModeInterval);
    autoModeInterval = null;
  }
  
  if (window.speechSynthesis) {
     let msg = new SpeechSynthesisUtterance("Modalità automatica disattivata");
     msg.lang = 'it-IT';
     window.speechSynthesis.speak(msg);
  }
}

   let homeTimeAutoEnabled = true;
   let homeAutoInterval = 15;
   let homeQuietStart = 22;
   let homeQuietEnd = 10;
   let homeFontanaOpenTime  = 600;   // Minuti dalla mezzanotte: apertura (default 10:00)
   let homeFontanaCloseTime = 1320;  // Minuti dalla mezzanotte: chiusura (default 22:00)
   let serverTimeOffset = 0;
    let nextShowNumber = -1;
    let homeNextShowIn = -1;
    let homeNextShowNumber = -1;
   let targetShowTime = 0; // Timestamp target per countdown fluido
   let countdownActive = false;
   let adminDismissedCountdown = false; // flag to prevent reopening if admin closes it
   let closingCountdownInterval = null;  // Timer conto alla rovescia chiusura

   // =============================================
   // TRACCIAMENTO STATO PISCINA E MANUTENZIONE
   // =============================================
   let lastFontanaClosedState = null;   // null = non ancora determinato
   let lastMaintenanceSpokenState = null; // null = non ancora determinato

   // Pronuncia una frase con la voce unificata per la fontana
   function speakEventPhrase(text, opts) {
     if (!('speechSynthesis' in window)) return;
     const voice = typeof getBestItalianVoice === 'function' ? getBestItalianVoice() : null;
     const msg = new SpeechSynthesisUtterance(text);
     window.__currentSpeechMsg = msg; // Previene il garbage collection
     if (voice) msg.voice = voice;
     msg.lang = 'it-IT';
     // Usiamo lo stesso rate e pitch universale degli show automatici (se non forzato)
     msg.rate  = (opts && opts.rate)  || 0.95;
     msg.pitch = (opts && opts.pitch) || 1.1;
     msg.volume = typeof window.currentVoiceVolume !== 'undefined' ? window.currentVoiceVolume / 100.0 : 1.0;
     
     if (typeof stopParentSpeech === 'function') stopParentSpeech();
     msg.onend = function() {
       window.__currentSpeechMsg = null;
       if (typeof startParentSpeech === 'function') setTimeout(startParentSpeech, 500);
     };
     
     // NON facciamo .cancel() perché interromperebbe altri annunci in corso (come i timer del vento o del countdown).
     // Vogliamo che si accodi normalmente.
     window.speechSynthesis.speak(msg);
   }

   // Frasi simpatiche apertura piscina
   function speakPoolOpen() {
     const frasi = [
       "Evviva! La piscina è aperta! L'acqua vi aspetta con le braccia bagnate!",
       "Attenzione attenzione! Le porte sono aperte, i getti pronti, lo spettacolo può cominciare!",
       "Buongiorno a tutti! La fontana ha appena aperto gli occhi… anzi, i getti! Benvenuti!",
       "La piscina è ufficialmente aperta! Preparate i costumi, arrivano le fontane!",
       "Din don! Si apre il sipario sull'acqua! La fontana è pronta per stupirvi!",
       "Olé! Siamo aperti! Oggi l'acqua ballerà per voi con energia!",
       "Buongiorno! La fontana si è svegliata ed è di ottimo umore. Benvenuti!",
       "Ding ding! Piscina aperta! Chi fa il primo tuffo con gli occhi?"
     ];
     speakEventPhrase(frasi[Math.floor(Math.random() * frasi.length)]);
   }

   // Frasi simpatiche chiusura piscina
   function speakPoolClose() {
     const frasi = [
       "Attenzione! La piscina sta per chiudersi. L'acqua va a dormire, arrivederci!",
       "Ok ok, la festa è finita! La fontana stacca la spina per oggi. A domani!",
       "Buonanotte a tutti! La fontana si mette il pigiama e va a riposare!",
       "Chiusura imminente! I getti abbassano la testa e salutano con una riverenza. Alla prossima!",
       "Sipario! Lo spettacolo acquatico di oggi è terminato. Grazie e arrivederci!",
       "La piscina chiude i battenti! L'acqua va in ferie… ma solo fino a domani!",
       "Fine delle trasmissioni acquatiche! Ci rivediamo presto, con nuove sorprese!",
       "Attenzione: la fontana ha i piedi stanchi. Chiudiamo per oggi, a presto!"
     ];
     speakEventPhrase(frasi[Math.floor(Math.random() * frasi.length)]);
   }

   // Frasi simpatiche inizio manutenzione
   function speakMaintenanceStart() {
     const frasi = [
       "Attenzione! Il nostro ingegnere supremo Lorenzo è entrato nel codice! Manutenzione in corso, aspettatevi magie software!",
       "La fontana si prende una pausa tecnica. Lorenzo è armato di tastiera e chiave inglese per sistemare le pompe!",
       "Manutenzione attivata! Lorenzo sta litigando con i cavi e gli aggiornamenti software. Torneremo più forti di prima!",
       "Lavori in corso! La fontana va in officina da Lorenzo. Vietato disturbare il genio al lavoro!",
       "Manutenzione in corso! Lorenzo sta ricaricando le batterie e riavviando il sistema. Aspettateci!",
       "Stop! Lorenzo è dentro la fontana che fa a pugni con le valvole dell'acqua! La fontana torna prestissimo, promesso!",
       "Manutenzione attiva! Lorenzo sta sussurrando righe di codice alle pompe per farle funzionare meglio!"
     ];
     speakEventPhrase(frasi[Math.floor(Math.random() * frasi.length)]);
   }

   // Frasi simpatiche fine manutenzione
   function speakMaintenanceEnd() {
     const frasi = [
       "Manutenzione completata! Lorenzo è sopravvissuto al codice e la fontana è tornata in forma! Benvenuti di nuovo!",
       "Lorenzo ha finito! La fontana è aggiornata, le pompe sono pronte e il software vola!",
       "Manutenzione terminata! Le pompe sono riposate, il software è fresco e Lorenzo può bersi un caffè!",
       "Lavori finiti! La fontana ha superato la visita medica di Lorenzo a pieni voti. Spettacolo imminente!",
       "Evviva! Lorenzo ha fatto un capolavoro! La fontana è di nuovo operativa e felicissima!",
       "Fine manutenzione! La fontana ringrazia il suo inimitabile tecnico Lorenzo e torna in pista!",
       "Tutto a posto! I bug sono stati schiacciati e le pompe sistemate da Lorenzo. Siamo pronti!"
     ];
     speakEventPhrase(frasi[Math.floor(Math.random() * frasi.length)]);
   }

   function updateClock() {
      const now = new Date(Date.now() + serverTimeOffset);
      const h = now.getHours().toString().padStart(2, '0');
      const m = now.getMinutes().toString().padStart(2, '0');
      const s = now.getSeconds().toString().padStart(2, '0');
      
      const timeEl = document.getElementById('clock-time');
      const dateEl = document.getElementById('clock-date');
      const statusEl = document.getElementById('clock-status');
      
      if(timeEl) timeEl.textContent = `${h}:${m}:${s}`;
      if(dateEl) {
          const options = { weekday: 'long', day: 'numeric', month: 'long' };
          dateEl.textContent = now.toLocaleDateString('it-IT', options).toUpperCase();
      }
      
      const oldClock = document.getElementById('clock');
      if (oldClock) {
        const d = now.getDate().toString().padStart(2, '0');
        const mo = (now.getMonth() + 1).toString().padStart(2, '0');
        const y = now.getFullYear();
        oldClock.textContent = `${d}/${mo}/${y} ${h}:${m}:${s}`;
      }
      
      // Info Prossimo Show
      if(statusEl) {
          if (typeof homeTimeAutoEnabled === 'undefined' || !homeTimeAutoEnabled) {
              statusEl.textContent = "Show Automatici: OFF";
              statusEl.style.opacity = "0.5";
          } else if (homeNextShowIn === -2) {
              statusEl.textContent = "Modalità Silenziosa 🌙";
              statusEl.style.opacity = "0.7";
          } else if (homeNextShowIn === -3) {
              statusEl.textContent = "DISATTIVATI PER VENTO 💨";
              statusEl.style.opacity = "0.7";
          } else if (homeNextShowIn > 0) {
              statusEl.textContent = "PROSSIMO SHOW: " + Math.ceil(homeNextShowIn / 60) + " MIN";
              statusEl.style.opacity = "1";
          } else {
              statusEl.textContent = "ATTIVAZIONE SHOW... 🌊";
              statusEl.style.opacity = "1";
          }
      }
      
      // Calcolo fluido del tempo mancante basato sul target locale
      if (typeof homeTimeAutoEnabled !== 'undefined' && homeTimeAutoEnabled && targetShowTime > 0) {
          const diff = Math.max(0, Math.round((targetShowTime - Date.now()) / 1000));
          if (diff !== homeNextShowIn) {
              homeNextShowIn = diff;
          }
      }
      
      if (typeof homeNextShowIn !== 'undefined' && homeNextShowIn >= 0) {
        if (homeNextShowIn > 0 && homeNextShowIn <= 60) {
            if (!adminDismissedCountdown && typeof showCountdown === 'function') {
                showCountdown(homeNextShowIn, homeNextShowNumber);
            }
        } else if (homeNextShowIn === 0) {
            adminDismissedCountdown = false; // Reset per il prossimo show
            if (countdownActive && typeof hideCountdown === 'function') hideCountdown();
            // Trigger immediato per sincronia audio/web (evita il ritardo del polling)
            if (homeNextShowNumber > 0) {
                console.log("Auto-trigger locale: ", homeNextShowNumber);
                if (typeof executeShow === 'function') executeShow(homeNextShowNumber, 0);
                targetShowTime = 0; // Reset target
                homeNextShowIn = -1; 
            }
        } else if (homeNextShowIn > 60) {
            adminDismissedCountdown = false; // Reset per il prossimo show
            if (countdownActive && typeof hideCountdown === 'function') hideCountdown();
        }
      }
   }

    let isMaintenanceActive = false;
    let isMonitoraggioActive = false;
    let lastMonitoraggioSpokenState = null;
    let currentWindSpeedVal = 0;
    
    let spokenAnnouncements = { 10: false, 5: false, 1: false };

    function getBestItalianVoice() {
      if (!('speechSynthesis' in window)) return null;
      let voices = window.speechSynthesis.getVoices();
      let itVoices = voices.filter(v => v.lang.startsWith('it'));
      if (itVoices.length === 0) return null;

      const premiumNames = ['microsoft elsa online', 'google italiano', 'alice', 'siri', 'elsa', 'carla', 'bianca', 'luciana', 'paola', 'martina'];
      for (let p of premiumNames) {
        let match = itVoices.find(v => v.name.toLowerCase().includes(p));
        if (match) return match;
      }
      
      const maleNames = ['luca', 'cosimo', 'marco', 'pietro', 'diego', 'antonio'];
      let fallback = itVoices.find(v => !maleNames.some(m => v.name.toLowerCase().includes(m)));
      return fallback || itVoices[0];
    }

    // Alias locale per speakEventPhrase (usa la funzione definita in scope esterno)
    function _speakEvent(text) {
      if (typeof speakEventPhrase === 'function') speakEventPhrase(text);
    }

    function speakAnnouncement(minutes) {
      if (!('speechSynthesis' in window)) return;
      let bestVoice = getBestItalianVoice();
      
      let msg = new SpeechSynthesisUtterance();
      if (bestVoice) msg.voice = bestVoice;
      msg.lang = 'it-IT';
      msg.rate = 0.95;
      msg.pitch = 1.1;
      msg.volume = typeof window.currentVoiceVolume !== 'undefined' ? window.currentVoiceVolume / 100.0 : 1.0;
      
      if (minutes === 30) {
        const phrases30 = [
            "Amici della fontana, mancano circa trenta minuti all'inizio dello spettacolo. Prendetevi il vostro tempo!",
            "Ehi voi! Tra mezz'ora esatta l'acqua prenderà vita, preparatevi alla magia.",
            "Mezz'ora al prossimo show! Un sacco di tempo per uno snack prima di godervi lo spettacolo."
        ];
        msg.text = phrases30[Math.floor(Math.random() * phrases30.length)];
      } else if (minutes === 15) {
        const phrases15 = [
            "Amici, mancano quindici minuti al prossimo show! Prendetevi un drink e preparatevi alla magia.",
            "Solo un quarto d'ora e poi l'acqua inizierà a ballare per voi. Rimanete nei paraggi!",
            "Ehi voi! Tra quindici minuti esatti la fontana si risveglierà. Non perdetevi lo spettacolo!"
        ];
        msg.text = phrases15[Math.floor(Math.random() * phrases15.length)];
      } else if (minutes === 10) {
        const phrases10 = [
            "Ehi, attenzione! Le pompe si stanno scaldando. Tra esattamente dieci minuti inizierà un nuovo show!",
            "Prendete posto e preparate le fotocamere! La magia dell'acqua prenderà vita tra soli dieci minuti.",
            "Amici della fontana, l'attesa sta per finire. Mancano dieci minuti al prossimo spettacolo acquatico."
        ];
        msg.text = phrases10[Math.floor(Math.random() * phrases10.length)];
      } else if (minutes === 5) {
        const phrases5 = [
            "Solo cinque minuti di attesa! Presto l'acqua inizierà a danzare a tempo di musica.",
            "Ci siamo quasi! Mancano cinque minuti al prossimo fantastico show della fontana.",
            "L'emozione sale... preparatevi perché tra cinque minuti esatti i nostri getti d'acqua prenderanno vita."
        ];
        msg.text = phrases5[Math.floor(Math.random() * phrases5.length)];
      } else if (minutes === 1) {
        const phrases1 = [
            "Manca solo un minuto! Fate silenzio e aprite bene gli occhi, lo spettacolo sta per cominciare!",
            "Sessanta secondi all'inizio! Siete pronti a farvi stupire?",
            "L'acqua è in posizione, le luci sono pronte. Lo show inizia in un minuto esatto. Allacciate le cinture!"
        ];
        msg.text = phrases1[Math.floor(Math.random() * phrases1.length)];
      }

      // Evita che la fontana si ascolti da sola attivando comandi involontari
      if (typeof stopParentSpeech === 'function') stopParentSpeech();
      msg.onend = function() {
          if (typeof startParentSpeech === 'function') setTimeout(startParentSpeech, 500);
      };

      window.speechSynthesis.speak(msg);
    }

    function pollAutoSettings() {
      fetch('/get-auto-settings').then(r => r.json()).then(data => {
        homeTimeAutoEnabled = data.enabled;
        homeAutoInterval = data.interval;
        homeQuietStart = data.quietStart;
        homeQuietEnd = data.quietEnd;
        nextShowNumber = data.nextShowNumber;
        // Tutti i dispositivi (telefono, computer casse, tablet) pre-scaricano in background il prossimo show
        if (data.nextShowNumber > 0) {
          setTimeout(() => backgroundPreloadShow(data.nextShowNumber), 1000);
        }
        if (data.fontanaOpenTime  !== undefined) homeFontanaOpenTime  = data.fontanaOpenTime;
        if (data.fontanaCloseTime !== undefined) homeFontanaCloseTime = data.fontanaCloseTime;

        const updateExpBtn = (id, enabled) => {
            const btn = document.getElementById(id);
            if (btn) {
                if (enabled) {
                    btn.style.opacity = '1';
                    btn.style.pointerEvents = 'auto';
                    btn.style.filter = 'none';
                } else {
                    btn.style.opacity = '0.4';
                    btn.style.pointerEvents = 'none';
                    btn.style.filter = 'grayscale(100%)';
                }
            }
        };
        if (data.expAi !== undefined) updateExpBtn('expAiBtn', data.expAi);
        if (data.expOrch !== undefined) updateExpBtn('expOrchBtn', data.expOrch);
        if (data.expKar !== undefined) updateExpBtn('expKarBtn', data.expKar);
        if (data.expFeed !== undefined) updateExpBtn('expFeedBtn', data.expFeed);
        
        // Sincronizzazione Manutenzione
        if (data.maintenance !== undefined) {
          const oldState = isMaintenanceActive;
          isMaintenanceActive = data.maintenance;
          if (oldState !== isMaintenanceActive) {
            updateMaintenanceUI();
            syncMaintenanceButtonUI();
            // Pronuncia frasi simpatiche al cambio stato manutenzione (da remoto)
            if (lastMaintenanceSpokenState !== null && lastMaintenanceSpokenState !== isMaintenanceActive) {
              if (isMaintenanceActive) {
                setTimeout(() => { if (typeof speakMaintenanceStart === 'function') speakMaintenanceStart(); }, 600);
              } else {
                setTimeout(() => { if (typeof speakMaintenanceEnd === 'function') speakMaintenanceEnd(); }, 600);
              }
            }
            lastMaintenanceSpokenState = isMaintenanceActive;
          } else if (lastMaintenanceSpokenState === null) {
            lastMaintenanceSpokenState = isMaintenanceActive;
          }
        }

        // Sincronizzazione Monitoraggio (Kiosk Mode)
        if (data.monitoraggio !== undefined) {
          const oldMonitoraggio = isMonitoraggioActive;
          isMonitoraggioActive = data.monitoraggio;
          if (oldMonitoraggio !== isMonitoraggioActive) {
            if (lastMonitoraggioSpokenState !== null && lastMonitoraggioSpokenState !== isMonitoraggioActive) {
              if (isMonitoraggioActive) {
                setTimeout(() => { if (typeof speakMonitoraggioStart === 'function') speakMonitoraggioStart(); }, 600);
              } else {
                setTimeout(() => { if (typeof speakMonitoraggioEnd === 'function') speakMonitoraggioEnd(); }, 600);
              }
            }
            lastMonitoraggioSpokenState = isMonitoraggioActive;
            checkMonitoraggioLock();
          } else if (lastMonitoraggioSpokenState === null) {
            lastMonitoraggioSpokenState = isMonitoraggioActive;
            checkMonitoraggioLock();
          }
        }
        
        // Dati vento per overlay 'V'
        if (data.windSpeed !== undefined) {
          currentWindSpeedVal = data.windSpeed;
          const overlayVal = document.getElementById('windOverlayValue');
          const overlayStatus = document.getElementById('windOverlayStatus');
          const threshold = data.threshold || 30;

          if (overlayVal) overlayVal.textContent = currentWindSpeedVal.toFixed(1) + ' km/h';
          
          if (overlayStatus) {
            if (currentWindSpeedVal > threshold) {
              overlayStatus.textContent = "Ouch! Meglio restare asciutti, c'è troppo vento! 💨🚫";
              overlayStatus.style.color = "#ff5252";
            } else if (currentWindSpeedVal > (threshold * 0.7)) {
              overlayStatus.textContent = "Attenzione! Un soffio di troppo potrebbe bagnare tutti! 🌬️⚠️";
              overlayStatus.style.color = "#ff9800";
            } else {
              overlayStatus.textContent = "Perfetto! La fontana è tutta tua, goditi lo show! ✨💎";
              overlayStatus.style.color = "#00e5ff";
            }
          }
        }

       // Sincronizza l'offset temporale se necessario (una volta ogni tanto)
       if (data.serverTime) {
         const localTime = Date.now();
         const serverTime = data.serverTime * 1000;
         serverTimeOffset = serverTime - localTime;
       }

       // Controlla se fontana è chiusa
       checkFontanaClosed();

       // Sincronizzazione intelligente: aggiorna il target locale solo se c'è un drift significativo (>2s)
       // o se non avevamo ancora un target impostato. Questo evita il jitter del countdown.
       const serverNextShowIn = (data.nextShowIn !== undefined) ? data.nextShowIn : -1;
       if (serverNextShowIn > 0) {
           const localPredicted = Math.max(0, Math.round((targetShowTime - Date.now()) / 1000));
           if (Math.abs(localPredicted - serverNextShowIn) > 2 || targetShowTime === 0) {
               targetShowTime = Date.now() + (serverNextShowIn * 1000);
           }
       } else {
           targetShowTime = 0;
       }

       homeNextShowIn = serverNextShowIn;
       homeNextShowNumber = data.nextShowNumber;
       const nextShowIn = homeNextShowIn;
       const statusDiv = document.getElementById('autoStatus');
       
       if (!homeTimeAutoEnabled) {
         if (statusDiv) statusDiv.textContent = "Show automatici disattivati";
         if (typeof hideCountdown === 'function') hideCountdown();
       } else if (nextShowIn === -2) {
         if (statusDiv) statusDiv.textContent = "Modalità silenziosa";
         if (typeof hideCountdown === 'function') hideCountdown();
       } else {
         if (statusDiv) statusDiv.textContent = "Prossimo show tra " + Math.ceil(nextShowIn / 60) + " min";
         
         // Trigger voice announcements
         if (nextShowIn > 1810) {
           spokenAnnouncements = { 30: false, 15: false, 10: false, 5: false, 1: false };
         }
         if (typeof spokenAnnouncements[30] === 'undefined') spokenAnnouncements[30] = true;
         if (typeof spokenAnnouncements[15] === 'undefined') spokenAnnouncements[15] = true;
         
         let mins = Math.ceil(nextShowIn / 60);
         if (mins === 30 && nextShowIn <= 1800 && !spokenAnnouncements[30]) {
           spokenAnnouncements[30] = true;
           speakAnnouncement(30);
         } else if (mins === 15 && nextShowIn <= 900 && !spokenAnnouncements[15]) {
           spokenAnnouncements[15] = true;
           speakAnnouncement(15);
         } else if (mins === 10 && nextShowIn <= 600 && !spokenAnnouncements[10]) {
           spokenAnnouncements[10] = true;
           speakAnnouncement(10);
         } else if (mins === 5 && nextShowIn <= 300 && !spokenAnnouncements[5]) {
           spokenAnnouncements[5] = true;
           speakAnnouncement(5);
         } else if (mins === 1 && nextShowIn <= 60 && !spokenAnnouncements[1]) {
           spokenAnnouncements[1] = true;
           speakAnnouncement(1);
         }
         
         // Gestione Countdown: ora parte a 60 secondi
          if (nextShowIn <= 60 && nextShowIn > 0 && !countdownActive) {
            showCountdown(nextShowIn, nextShowNumber);
          } else if (nextShowIn <= 0 && countdownActive) {
            handleAutoStart();
          } else if (nextShowIn > 65 && countdownActive) {
            hideCountdown(); // Reset se posticipato
          }
       }
     });
   }

   // === LOGICA CHIUSURA FONTANA (precisione al minuto) ===
   function minsToHHMM(totalMins) {
     const h = Math.floor(totalMins / 60) % 24;
     const m = totalMins % 60;
     return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
   }

   function currentTimeMinutes() {
     const now = new Date(Date.now() + serverTimeOffset);
     return now.getHours() * 60 + now.getMinutes();
   }

   function currentTimeSeconds() {
     const now = new Date(Date.now() + serverTimeOffset);
     return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
   }

   function isFontanaClosed() {
     const cur  = currentTimeMinutes();
     const open  = homeFontanaOpenTime;
     const close = homeFontanaCloseTime;
     if (open === close) return false; // uguale = sempre aperto
     if (open < close) {
       return (cur < open || cur >= close);
     } else {
       // attraversa mezzanotte
       return (cur >= close && cur < open);
     }
   }

   // Ritorna true se mancano meno di 60 secondi alla chiusura
   function isClosingSoon() {
     if (isFontanaClosed()) return false;
     const secs = secondsToClose();
     return (secs !== null && secs <= 60 && secs > 0);
   }

   // Ritorna i secondi mancanti alla chiusura (null se non applicabile)
   function secondsToClose() {
     const secNow  = currentTimeSeconds();
     const open    = homeFontanaOpenTime;
     const close   = homeFontanaCloseTime;
     if (open === close) return null;
     let closeSec = close * 60;   // chiusura in secondi dalla mezzanotte
     if (open < close) {
       // Fontana aperta dalle open alle close (stesso giorno)
       if (secNow < open * 60 || secNow >= close * 60) return null; // già chiusa
       return closeSec - secNow;
     } else {
       // Attraversa mezzanotte
       if (secNow >= close * 60 && secNow < open * 60) return null; // già chiusa
       const secsToMidnight = 86400 - secNow;
       return secsToMidnight + closeSec;
     }
   }

   function startMinuteCountdown(totalSeconds) {
     // Mostra overlay e pannello
     const csOverlay = document.getElementById('closingSoonOverlay');
     if (!csOverlay) return;
     csOverlay.style.display = 'flex';
     document.getElementById('panel').classList.add('active');

     let remaining = Math.max(1, Math.round(totalSeconds));
     const totalSecs = remaining;

     function tick() {
       const countEl = document.getElementById('closingCountdownBig');
       const fillEl  = document.getElementById('closingProgressFill');
       if (countEl) countEl.textContent = remaining;
       if (fillEl)  fillEl.style.width  = (remaining / totalSecs * 100) + '%';
       remaining--;
       if (remaining < 0) {
         clearInterval(closingCountdownInterval);
         closingCountdownInterval = null;
         csOverlay.style.display = 'none';
         // Mostra schermata chiusa
         const reopenEl = document.getElementById('reopenTime');
         if (reopenEl) reopenEl.textContent = minsToHHMM(homeFontanaOpenTime);
         document.getElementById('closedOverlay').style.display = 'flex';
         document.getElementById('panel').classList.remove('active');
       }
     }
     tick();
     closingCountdownInterval = setInterval(tick, 1000);
   }

   function checkFontanaClosed() {
     const closed = isFontanaClosed();
     const soon   = !closed && isClosingSoon();
     const closedEl = document.getElementById('closedOverlay');
     const soonEl   = document.getElementById('closingSoonOverlay');

     // Rilevamento cambio stato: pronuncia frasi simpatiche
     if (lastFontanaClosedState !== null) {
       if (!lastFontanaClosedState && closed) {
         // Piscina appena chiusa
         setTimeout(() => { if (typeof speakPoolClose === 'function') speakPoolClose(); }, 800);
       } else if (lastFontanaClosedState && !closed) {
         // Piscina appena aperta
         setTimeout(() => { if (typeof speakPoolOpen === 'function') speakPoolOpen(); }, 800);
       }
     }
     lastFontanaClosedState = closed;

     if (closed) {
       if (closedEl) {
         const reopenEl = document.getElementById('reopenTime');
         if (reopenEl) reopenEl.textContent = minsToHHMM(homeFontanaOpenTime);
         closedEl.style.display = 'flex';
       }
       if (soonEl) soonEl.style.display = 'none';
       document.getElementById('panel').classList.remove('active');
       document.getElementById('welcome').classList.remove('active');
       // Ferma eventuale countdown in corso
       if (closingCountdownInterval) { clearInterval(closingCountdownInterval); closingCountdownInterval = null; }
     } else if (soon && !closingCountdownInterval) {
       // Avvia conto alla rovescia se non già in corso
       const secsLeft = secondsToClose();
       if (secsLeft !== null && secsLeft > 0) startMinuteCountdown(secsLeft);
     } else if (!closed && !soon) {
       if (closedEl) closedEl.style.display = 'none';
       if (soonEl && !closingCountdownInterval) soonEl.style.display = 'none';
       // Fix: Riattiva la visibilità corretta del pannello quando la fontana riapre
       if (!document.getElementById('panel').classList.contains('active') && !document.getElementById('welcome').classList.contains('active')) {
         if (userRole === 'admin' || userRole === 'user') {
           document.getElementById('panel').classList.add('active');
         } else {
           document.getElementById('welcome').classList.add('active');
         }
       }
     }
   }

   function exitClosedScreen() {
     const pass = prompt("Inserisci la password per sbloccare la fontana:");
     if (pass === "lori123") {
       document.getElementById('closedOverlay').style.display = 'none';
       document.getElementById('closingSoonOverlay').style.display = 'none';
       document.getElementById('panel').classList.add('active');
       if (closingCountdownInterval) {
         clearInterval(closingCountdownInterval);
         closingCountdownInterval = null;
       }
     } else {
       if (pass !== null) alert("❌ Password errata.");
     }
   }


   let countdownParticles = [];
   let countdownAnimationId = null;

   function initCountdownCanvas() {
     const canvas = document.getElementById('countdownCanvas');
     if (!canvas) return;
     const ctx = canvas.getContext('2d');
     canvas.width = window.innerWidth;
     canvas.height = window.innerHeight;
     
     countdownParticles = [];
     for(let i=0; i<80; i++) {
       countdownParticles.push({
         x: Math.random() * canvas.width,
         y: canvas.height + Math.random() * 500,
         speed: 8 + Math.random() * 12,
         radius: 1 + Math.random() * 3,
         color: i % 3 === 0 ? '#00e5ff' : (i % 3 === 1 ? '#ff00ff' : '#fbc02d'),
         opacity: 0.4 + Math.random() * 0.6
       });
     }

     function animate() {
       ctx.clearRect(0, 0, canvas.width, canvas.height);
       
       countdownParticles.forEach(p => {
         p.y -= p.speed;
         if (p.y < -50) {
           p.y = canvas.height + 50;
           p.x = Math.random() * canvas.width;
         }
         
         ctx.beginPath();
         ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
         ctx.fillStyle = p.color;
         ctx.globalAlpha = p.opacity;
         ctx.shadowBlur = 10;
         ctx.shadowColor = p.color;
         ctx.fill();
       });
       
       countdownAnimationId = requestAnimationFrame(animate);
     }
     animate();
   }

    function showCountdown(seconds, showNum) {
      if (countdownActive) return;
      countdownActive = true;
      
      const overlay = document.getElementById('autoCountdownOverlay');
      const timerDisplay = document.getElementById('autoCountdownTimer');
      const nameDisplay = document.getElementById('autoCountdownShowName');
      const circle = document.querySelector('.progress-ring__circle');
      const glass = document.querySelector('.countdown-glass');
      const startAudio = document.getElementById('timerStartAudio');
      const warningAudio = document.getElementById('timerWarningAudio');

      overlay.style.display = 'flex';
      initCountdownCanvas();
      
      if (userRole === 'admin') {
         let closeBtn = document.getElementById('autoCountdownCloseBtn');
         if (!closeBtn) {
             closeBtn = document.createElement('button');
             closeBtn.id = 'autoCountdownCloseBtn';
             closeBtn.innerHTML = '✖ Chiudi Countdown';
             closeBtn.style.cssText = 'position:absolute; top:20px; right:20px; font-size:1.2rem; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.3); color:white; cursor:pointer; padding:10px 20px; border-radius:30px; z-index:100; font-family:"Segoe UI", sans-serif; backdrop-filter: blur(10px);';
             closeBtn.onclick = function() {
                 adminDismissedCountdown = true;
                 hideCountdown();
             };
             overlay.appendChild(closeBtn);
         }
         closeBtn.style.display = 'block';
      }
      
      nameDisplay.textContent = "Prossimo Show: " + (showNames[showNum] || "Musica");
      
      const totalTime = 60; // Base per il calcolo della percentuale (cerchio)
      let startTime = Date.now();
      let endTime = startTime + (seconds * 1000);
      let lastSecond = -1;
      let warningPlayed = false;

      // Play start sound
      console.log("Attempting to play start sound...");
      if (startAudio) {
        startAudio.currentTime = 0;
        startAudio.volume = 0.8;
        startAudio.play()
          .then(() => console.log("Start sound playing success"))
          .catch(e => {
            console.error("Audio play start failed:", e);
            // Fallback for interaction requirement
            document.body.addEventListener('click', () => startAudio.play(), {once: true});
          });
      }

      function update() {
        if (!countdownActive) return;
        
        const now = Date.now();
        const remaining = Math.max(0, endTime - now);
        const remainingSec = Math.ceil(remaining / 1000);
        
        // Update timer text
        if (remainingSec !== lastSecond) {
          timerDisplay.textContent = remainingSec;
          lastSecond = remainingSec;
          
          // Controllo vento a 30 secondi e annuncio vocale simpatico
          if (remainingSec === 30) {
              fetch('/weather').then(r => r.json()).then(data => {
                  if (!data.valid) {
                      return; // Ignora se dati non validi
                  }
                  const windSpeed = data.windSpeed;
                  const threshold = data.threshold || 30;
                  
                  if (windSpeed > threshold) {
                      // Vento Forte
                      const frasiForte = [
                          "Attenzione! Ho rilevato troppo vento. Per non fare il bagno a tutti, devo annullare lo spettacolo. Sicurezza prima di tutto!",
                          "Ehi, tira un po' troppo vento! Mi dispiace, ma devo cancellare l'esibizione per evitare docce indesiderate."
                      ];
                      if (typeof speakEventPhrase === 'function') speakEventPhrase(frasiForte[Math.floor(Math.random() * frasiForte.length)]);
                      // Solo su forte blocca lo show
                      hideCountdown();
                      pendingShowNumber = null;
                  } else if (windSpeed > (threshold * 0.7)) {
                      // Vento Moderato
                      const frasiModerato = [
                          "Il vento è moderato, si sta alzando un po' la brezza. Lo spettacolo continua, ma tenete d'occhio i getti più alti!",
                          "Attenzione, c'è un po' di vento moderato in zona. Preparatevi a qualche piccola gocciolina volante durante lo show!",
                          "La brezza si fa sentire, vento moderato confermato! Ma non preoccupatevi, lo spettacolo andrà in scena regolarmente."
                      ];
                      if (typeof speakEventPhrase === 'function') speakEventPhrase(frasiModerato[Math.floor(Math.random() * frasiModerato.length)]);
                  } else {
                      // Vento Calmo
                      const frasiCalmo = [
                          "Ho appena controllato l'anemometro: il vento è calmo! Lo spettacolo partirà a breve senza problemi.",
                          "Controllo vento superato a pieni voti! Nessuna bufera in vista, preparatevi allo show.",
                          "Il vento è nostro amico stasera! Tutto è calmo e perfetto per far danzare l'acqua tranquillamente."
                      ];
                      if (typeof speakEventPhrase === 'function') speakEventPhrase(frasiCalmo[Math.floor(Math.random() * frasiCalmo.length)]);
                  }
              }).catch(e => console.error(e));
          }

          // Shake and alert at 5 seconds
          if (remainingSec <= 5) {
            timerDisplay.style.color = "#ff5252";
            if (glass) glass.classList.add('shake-intense');
            if (remainingSec > 0 && !warningPlayed) {
              console.log("Attempting to play warning sound...");
              if (warningAudio) {
                warningAudio.currentTime = 0;
                warningAudio.volume = 0.9;
                warningAudio.play()
                  .then(() => console.log("Warning sound playing success"))
                  .catch(e => console.error("Audio warning failed:", e));
              }
              warningPlayed = true;
            }
          }
        }

        // Update progress circle (stroke-dashoffset: 942 to 0)
        // Offset = 942 - (942 * (elapsed / total))
        if (circle) {
          const ratio = remaining / (totalTime * 1000);
          const offset = 942 * (1 - ratio);
          circle.style.strokeDashoffset = offset;
        }

        if (remaining <= 0) {
          handleAutoStart();
        } else {
          requestAnimationFrame(update);
        }
      }

      requestAnimationFrame(update);
    }

    function hideCountdown() {
      countdownActive = false;
      const overlay = document.getElementById('autoCountdownOverlay');
      if (overlay) overlay.style.display = 'none';
      
      const glass = document.querySelector('.countdown-glass');
      if (glass) glass.classList.remove('shake-intense');
      
      const timer = document.getElementById('autoCountdownTimer');
      if (timer) {
        timer.style.color = "#fff";
        timer.textContent = "60";
      }

      const circle = document.querySelector('.progress-ring__circle');
      if (circle) circle.style.strokeDashoffset = 942;

      // Stop any alert audio if playing
      ['timerStartAudio', 'timerWarningAudio'].forEach(id => {
        const a = document.getElementById(id);
        if (a) { a.pause(); a.currentTime = 0; }
      });
    }

    window.addEventListener('keydown', (e) => {
      // Ignora se siamo in un input o textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const maintenance = document.getElementById('maintenanceOverlay');

      const windOverlay = document.getElementById('windStatusOverlay');

      if (e.code === 'Space') {
        e.preventDefault(); // Previene lo scroll della pagina
        emergencyStop();
        return;
      }

      if (e.key.toLowerCase() === 'm') {
        fetch('/set-maintenance?enable=1').then(() => {
          isMaintenanceActive = true;
          updateMaintenanceUI();
          console.log("Maintenance mode ON (Server Synced)");
        });
      } else if (e.key.toLowerCase() === 'a') {
        fetch('/set-maintenance?enable=0').then(() => {
          isMaintenanceActive = false;
          updateMaintenanceUI();
          console.log("Maintenance mode OFF (Server Synced)");
        });
      } else if (e.key.toLowerCase() === 'v') {
        if (windOverlay) {
          const isVisible = windOverlay.style.display === 'flex';
          if (!isVisible) {
            // Opening Wind Overlay: Trigger LED visual
            windOverlay.style.display = 'flex';
            fetch(`/set-wind-visual?speed=${currentWindSpeedVal}&threshold=${homeTimeAutoEnabled ? 0 : 30}`);
          } else {
            // Closing Wind Overlay: Restore previous state
            windOverlay.style.display = 'none';
            if (isMaintenanceActive) {
              fetch('/set-maintenance?enable=1'); // Restore maintenance LEDs
            } else {
              fetch('/set-maintenance?enable=0'); // Restore base LEDs
            }
          }
        }
      }
    });

   function handleAutoStart() {
     if (countdownActive) {
       hideCountdown();
     }
   }

   setInterval(updateClock, 1000);
   setInterval(pollAutoSettings, 3000); 
   pollAutoSettings();
   updateClock();

  // === TUTORIAL LOGIC ===
  let tutorialActive = false;
  const tutorialSteps = [
    { text: "Ciao! Sono Fontana A I, la tua assistente virtuale. Ti faccio una rapida guida interattiva per scoprire tutte le mie potenzialità!", target: null },
    { text: "Al centro dello schermo ci sono gli spettacoli principali. Puoi avviarli toccandoli, o dicendomi a voce il nome della canzone.", target: ".show-grid" },
    { text: "Premendo questo bottone o chiamandomi dicendo 'Ehi Fontana!', entrerai nel mio vero cuore d'Intelligenza Artificiale!", target: "div[onclick*='openAiPopup']" },
    { text: "Qui trovi due chicche speciali: la Modalità Orchestra per dirigere i getti d'acqua muovendo le tue mani nell'aria, e il Karaoke per farmi danzare a ritmo della tua voce!", target: "div[onclick*='startGestureExperience'], div[onclick*='startKaraokeMode']" },
    { text: "Se hai un'idea per un nuovo spettacolo o per migliorare la fontana, puoi inviarmela a voce! Ti basta dire al microfono: 'Ho un'idea'.", target: null },
    { text: "In alto a destra trovi l'orologio di sistema. Lo uso per capire quando attivare e disattivare la fontana da sola.", target: ".elegant-clock" },
    { text: "Lassù in alto vedi quell'icona azzurra a forma di pillola? Quello è il mio sensore del vento! Lo tengo sempre d'occhio in tempo reale: se il vento è troppo forte, evito di avviare gli show per non farvi la doccia fuori dalla vasca!", target: "#mainWindBadge" },
    { text: "In basso trovi il Pulsante di Emergenza. Se lo premi, spegnerò immediatamente tutti gli spettacoli e chiuderò l'acqua.", target: "#emergencyStopBtn" },
    { text: "L'Area di Controllo serve per gestire la fontana e la sua programmazione. Ma attenzione: l'accesso a quest'area è riservato esclusivamente a Lorenzo!", target: "div[onclick*='openControlArea']" },
    { text: "Ehi, se vuoi essere il vero regista della serata, inquadra questo bel codice QR col tuo smartphone, oppure usa quello appoggiato fisicamente sulla fontana! Così avrai la mia regia comodamente tra le tue mani.", target: "#qrDesktopBanner" },
    { text: "Tutto chiaro? Ricorda che sono sempre qui per te! Per chiamarmi premi il microfono o strilla 'Ehi Fontana!'. Se ti perdi di nuovo, chiedimi 'Aiuto' e tornerò a salvarti! Buon divertimento!", target: null }
  ];

  function stopTutorial() {
    tutorialActive = false;
    document.querySelectorAll('.tutorial-focus').forEach(el => el.classList.remove('tutorial-focus'));
    if(document.getElementById('tutorialOverlay')) {
       document.getElementById('tutorialOverlay').style.display = 'none';
       document.getElementById('tutorialOverlay').style.opacity = '0';
    }
    const spotlight = document.getElementById('tutorialSpotlight');
    if(spotlight) spotlight.style.opacity = '0';
    if (typeof stopParentSpeech === 'function') stopParentSpeech();
    if (typeof isSpeakingNow !== 'undefined') isSpeakingNow = false;
  }

  function runTutorialStep(index) {
    if(!tutorialActive || index >= tutorialSteps.length) {
      stopTutorial();
      return;
    }
    
    document.querySelectorAll('.tutorial-focus').forEach(el => el.classList.remove('tutorial-focus'));
    let spotlight = document.getElementById('tutorialSpotlight');
    let overlay = document.getElementById('tutorialOverlay');
    
    const step = tutorialSteps[index];
    if(step.target) {
      const targetEls = document.querySelectorAll(step.target);
      if(targetEls.length > 0) {
          targetEls[0].classList.add('tutorial-focus');
          targetEls[0].scrollIntoView({ behavior: 'smooth', block: 'center' });

          setTimeout(() => {
            if(!tutorialActive) return;
            let minX = 99999, minY = 99999, maxX = -99999, maxY = -99999;
            targetEls.forEach(el => {
               const r = el.getBoundingClientRect();
               if(r.width > 0 && r.height > 0) {
                  if(r.left < minX) minX = r.left;
                  if(r.top < minY) minY = r.top;
                  if(r.right > maxX) maxX = r.right;
                  if(r.bottom > maxY) maxY = r.bottom;
               }
            });
            if(minX !== 99999 && spotlight) {
              if(overlay) overlay.style.background = 'transparent';
              spotlight.style.opacity = '1';
              spotlight.style.width = (maxX - minX + 30) + 'px';
              spotlight.style.height = (maxY - minY + 30) + 'px';
              spotlight.style.top = (minY - 15) + 'px';
              spotlight.style.left = (minX - 15) + 'px';
            }
          }, 400);
      }
    } else {
      if(spotlight) spotlight.style.opacity = '0';
      if(overlay) overlay.style.background = 'rgba(0,0,0,0.85)';
    }

    if (!('speechSynthesis' in window)) {
        setTimeout(() => runTutorialStep(index + 1), 4000);
        return;
    }
    
    if (typeof stopParentSpeech === 'function') stopParentSpeech();
    if (typeof isSpeakingNow !== 'undefined') isSpeakingNow = true;
    let bestVoice = typeof getBestItalianVoice === 'function' ? getBestItalianVoice() : null;
    let msg = new SpeechSynthesisUtterance(step.text);
    if (bestVoice) msg.voice = bestVoice;
    msg.lang = 'it-IT';
    msg.rate = 0.95; 
    msg.pitch = 1.0;
    msg.volume = typeof window.currentVoiceVolume !== 'undefined' ? window.currentVoiceVolume / 100.0 : 1.0;
    
    msg.onend = function() {
      if (typeof isSpeakingNow !== 'undefined') isSpeakingNow = false;
      setTimeout(() => runTutorialStep(index + 1), 800);
    };
    
    window.speechSynthesis.speak(msg);
  }

  function startTutorial() {
    if(tutorialActive) return;
    tutorialActive = true;
    let overlay = document.getElementById('tutorialOverlay');
    if (overlay) {
        overlay.style.display = 'block';
        setTimeout(() => {
          overlay.style.opacity = '1';
          runTutorialStep(0);
        }, 50);
    } else {
        runTutorialStep(0);
    }
  }

/* === GESTURE PRO LOGIC === */
let gestureActive = false;
let selectedPump = 0;
let lastSentVal = -1;
let lastSentTime = 0;
let handsInstance;
let cameraInstance;
let gestureStep = 'tutorial'; // tutorial, tracking

// --- VIRTUAL MOUSE GLOBALS ---
let mouseModeActive = false; // Disattivato di default per alleggerire
let cameraSystemEnabled = false; // Fotocamera disabilitata di default per ottimizzare risorse
let isCameraSystemInitialized = false;
let isFaceAPIInitialized = false;
let lastCursorActivity = Date.now();
let cursorHidden = false;
let hoverElement = null;
let hoverStartTime = 0;
let cursorX = 0, cursorY = 0;
let smoothedCursorX = null;
let smoothedCursorY = null;
let cursorVelocityX = 0;
let cursorVelocityY = 0;
let lastHandSeenTime = 0;

function nextSlide(n) {
  document.querySelectorAll('.tutorial-slide').forEach(s => s.style.display = 'none');
  document.getElementById('slide' + n).style.display = 'block';
}

function startGestureExperience() {
  console.log("=== START GESTURE EXPERIENCE ===");
  stopAllAudio(); // Ferma tutti gli altri audio prima di iniziare
  
  document.getElementById('welcome').classList.remove('active');
  document.getElementById('panel').classList.remove('active');
  document.getElementById('gestureOverlay').style.display = 'flex';
  document.getElementById('globalCameraContainer').style.opacity = '0.4';
  nextSlide(1);
  document.getElementById('gestureHUD').style.display = 'none';
  gestureActive = true;
  gestureStep = 'tutorial';
  // mouseModeActive = true; // Abilita mouse virtuale per il tutorial
  
  // Avvia audio orchestra - LOGICA SEMPLICE come welcomeAudio
  const orchestraAudio = document.getElementById('orchestraAudio');
  console.log("orchestraAudio element:", orchestraAudio);
  if (orchestraAudio) {
    console.log("Audio src:", orchestraAudio.src);
    console.log("Audio readyState:", orchestraAudio.readyState);
    orchestraAudio.volume = 0.5;
    orchestraAudio.currentTime = 0;
    orchestraAudio.play()
      .then(() => console.log("✅ Orchestra audio playing!"))
      .catch(err => console.error("❌ Orchestra audio error:", err));
  } else {
    console.error("❌ orchestraAudio element NOT FOUND!");
  }
  
  fetch('/gestureMode?state=100');
}

function stopGestureExperience() {
  document.getElementById('gestureOverlay').style.display = 'none';
  document.getElementById('globalCameraContainer').style.opacity = '0';
  document.getElementById('panel').classList.add('active');
  gestureActive = false;
  // mouseModeActive = true; // Riabilita mouse virtuale
  
  const orchestraAudio = document.getElementById('orchestraAudio');
  if (orchestraAudio) {
    fadeOutAudio(orchestraAudio, 1000).then(() => {
      orchestraAudio.pause();
      orchestraAudio.currentTime = 0;
    });
  }
  
  fetch('/gestureMode?state=0');
  fetch('/random-led'); // RIPRISTINO LED BASE
  
  fetch('/pumps?p1=110&p2=110&p3=110&p4=110&p5=110&p6=110');
}

function startCalibration() {
  document.querySelectorAll('.tutorial-slide').forEach(s => s.style.display = 'none');
  document.getElementById('slideCalib').style.display = 'block';
  gestureStep = 'calibration';
  calibStartTime = 0;
  mouseModeActive = false;
}

let calibStartTime = 0;
function processGestureCalibration(landmarks) {
  const instr = document.getElementById('calibInstruction');
  const bar = document.getElementById('calibProgressBar');
  
  if (!landmarks || landmarks.length === 0) {
    instr.textContent = "🖐️ Alza la mano per iniziare";
    instr.style.color = "#ff5252";
    calibStartTime = 0;
    bar.style.width = "0%";
    return;
  }

  const hand = landmarks[0];
  const x = hand[9].x; // Middle finger MCP for centering
  const wrist = hand[0];
  const index = hand[5];
  const handSize = Math.sqrt(Math.pow(wrist.x - index.x, 2) + Math.pow(wrist.y - index.y, 2));

  let msg = "";
  let ok = true;

  // 1. Controllo Orizzontale (Centratura)
  if (x < 0.35) {
    msg = "⬅️ Spostati a SINISTRA";
    ok = false;
  } else if (x > 0.65) {
    msg = "➡️ Spostati a DESTRA";
    ok = false;
  } 
  // 2. Controllo Profondità (Distanza)
  else if (handSize < 0.08) {
    msg = "🏃 AVVICINATI alla camera";
    ok = false;
  } else if (handSize > 0.18) {
    msg = "🚶 ALLONTANATI dalla camera";
    ok = false;
  } else {
    msg = "✅ POSIZIONE OTTIMALE! Rimani fermo...";
  }

  instr.textContent = msg;
  instr.style.color = ok ? "#00e676" : "#ffbd39";

  if (ok) {
    if (calibStartTime === 0) calibStartTime = Date.now();
    const elapsed = Date.now() - calibStartTime;
    const progress = Math.min((elapsed / 2000) * 100, 100);
    bar.style.width = progress + "%";
    
    if (progress >= 100) {
      startGestureTracking(); // Vai alla performance!
    }
  } else {
    calibStartTime = 0;
    bar.style.width = "0%";
  }
}

async function startGestureTracking() {
  document.querySelectorAll('.tutorial-slide').forEach(s => s.style.display = 'none');
  document.getElementById('gestureHUD').style.display = 'block';
  gestureStep = 'tracking';
  mouseModeActive = false; // Disabilita mouse virtuale durante la performance
  // L'istanza hands e camera è già gestita globalmente ora
}


// === LOGICA REGISTRAZIONE VOCALE ===
let voiceRegActive = false;
let voiceRegStep = 0;
let voiceRegDescriptor = null;
let voiceRegName = "";
let voiceRegPhoto = "";

function abortVoiceReg() {
  voiceRegActive = false;
  document.getElementById('voiceRegOverlay').style.display = 'none';
  document.getElementById('manualScattaBtn').style.display = 'none';
  document.getElementById('manualNameContainer').style.display = 'none';
  document.getElementById('voiceRegShowsList').style.display = 'none';
  document.getElementById('manualNameInput').value = '';
  const vid = document.getElementById('voiceRegPreview');
  if(vid) vid.srcObject = null;
  speakAndListen("Registrazione annullata.", false);
}

async function startVoiceRegistration() {
  if(!faceRecognitionActive) {
      speakAndListen("Errore, intelligenza artificiale non caricata.", true);
      return;
  }
  voiceRegActive = true;
  voiceRegStep = 0;
  
  document.getElementById('voiceRegOverlay').style.display = 'flex';
  document.getElementById('voiceRegStepText').innerText = "Verifica Permessi in corso...";
  document.getElementById('voiceRegShowsList').style.display = 'none';
  
  // Clona stream per preview
  const mainVid = document.getElementById('gestureVideo');
  const preVid = document.getElementById('voiceRegPreview');
  if(mainVid && mainVid.srcObject) preVid.srcObject = mainVid.srcObject;
  
  speakAndListen("Controllo permessi. Posizionati per la verifica...", true);
  setTimeout(() => {
      voiceRegStep = 1;
      document.getElementById('voiceRegStepText').innerText = "Step 1: Inquadrati e premi Scatta";
      document.getElementById('manualScattaBtn').style.display = 'block';
      speakAndListen("Accesso consentito. Posizionati davanti alla fotocamera. Quando sei pronto, premi il bottone scatta.", false);
  }, 1000);
}

function processVoiceRegScatta() {
  if(voiceRegStep !== 1) return;
  document.getElementById('voiceRegStepText').innerText = "Acquisizione in corso...";
  document.getElementById('manualScattaBtn').style.display = 'none';
  setTimeout(async () => {
    const video = document.getElementById('gestureVideo');
    if(video && video.readyState >= 2) {
        const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
        if(detections) {
            voiceRegDescriptor = Array.from(detections.descriptor);
            
            // Cattura foto per thumbnail
            const canvas = document.createElement('canvas');
            canvas.width = 150; canvas.height = 150;
            const ctx = canvas.getContext('2d');
            const size = Math.min(video.videoWidth, video.videoHeight);
            const x = (video.videoWidth - size) / 2;
            const y = (video.videoHeight - size) / 2;
            ctx.drawImage(video, x, y, size, size, 0, 0, 150, 150);
            voiceRegPhoto = canvas.toDataURL('image/jpeg', 0.8);
            
            voiceRegStep = 2;
            document.getElementById('voiceRegStepText').innerText = "Step 2: Digita il tuo nome";
            document.getElementById('manualNameContainer').style.display = 'flex';
            speakAndListen("Volto registrato con successo. Digita il tuo nome e premi conferma.", false);
        } else {
            document.getElementById('voiceRegStepText').innerText = "Step 1: Inquadrati e premi Scatta";
            document.getElementById('manualScattaBtn').style.display = 'block';
            speakAndListen("Non riesco a vedere il tuo volto. Posizionati meglio e premi scatta.", false);
        }
    } else {
        document.getElementById('voiceRegStepText').innerText = "Step 1: Inquadrati e premi Scatta";
        document.getElementById('manualScattaBtn').style.display = 'block';
        speakAndListen("Errore fotocamera. Riprova e premi scatta.", false);
    }
  }, 500);
}

function processManualRegName() {
  if(voiceRegStep !== 2) return;
  const input = document.getElementById('manualNameInput').value.trim();
  if(!input) {
      speakAndListen("Per favore digita un nome prima di confermare.", false);
      return;
  }
  voiceRegName = input.charAt(0).toUpperCase() + input.slice(1);
  voiceRegStep = 3;
  
  document.getElementById('manualNameContainer').style.display = 'none';
  document.getElementById('voiceRegStepText').innerText = "Step 3: Clicca sullo show che preferisci";
  
  // Render shows list come bottoni cliccabili
  let html = "<div style='width:100%; text-align:center; margin-bottom:10px;'><b>Show Disponibili:</b></div>";
  for(const [id, name] of Object.entries(SHOW_NAMES)) {
      html += `<button onclick="finishVoiceReg(${id})" style="margin:5px; background:rgba(0,229,255,0.2); padding:10px 15px; border-radius:10px; border:1px solid #00e5ff; color:#fff; cursor:pointer; font-weight:bold; transition:0.3s;">${id}. ${name}</button>`;
  }
  document.getElementById('voiceRegShowsList').innerHTML = html;
  document.getElementById('voiceRegShowsList').style.display = 'flex';
  
  speakAndListen("Piacere " + voiceRegName + "! Scegli il tuo show preferito cliccando sulla lista.", false);
}

function finishVoiceReg(showId) {
    let profile = {
        name: voiceRegName,
        descriptor: voiceRegDescriptor,
        photo: voiceRegPhoto,
        showId: showId,
        ruolo: 'user'
    };
    
    try {
        let currentFaces = [];
        const localData = localStorage.getItem('fontana_faces');
        if (localData) {
            try { currentFaces = JSON.parse(localData); if(!Array.isArray(currentFaces)) currentFaces = []; } catch(e){}
        }
        currentFaces.push(profile);
        localStorage.setItem('fontana_faces', JSON.stringify(currentFaces));
        
        speakAndListen("Ottimo! Utente salvato con successo. Ciao " + voiceRegName + "!", false);
        voiceRegActive = false;
        document.getElementById('voiceRegOverlay').style.display = 'none';
        document.getElementById('manualScattaBtn').style.display = 'none';
        document.getElementById('manualNameContainer').style.display = 'none';
        document.getElementById('voiceRegShowsList').style.display = 'none';
        document.getElementById('manualNameInput').value = '';
        
        const vid = document.getElementById('voiceRegPreview');
        if(vid) vid.srcObject = null;
        
        loadSavedFaces(); 
        if (typeof renderFacesList === 'function') renderFacesList(); 
    } catch(e) {
        speakAndListen("Errore di memoria durante il salvataggio locale.", true);
        voiceRegActive = false;
        document.getElementById('voiceRegOverlay').style.display = 'none';
        console.error(e);
    }
}

/* === FACE RECOGNITION LOGIC === */
let faceMatcher = null;
let labeledDescriptors = [];
let faceRecognitionActive = false;
let lastFaceDetected = null;
let faceDetectionTime = 0;
let sessionResetTimer = null;
let activeUserName = null;

let isFaceAPIInitializing = false;

async function initFaceAPI() {
  if (isFaceAPIInitialized || isFaceAPIInitializing) return;
  isFaceAPIInitializing = true;
  
  const statusEl = document.getElementById('welcomeSubtext');
  try {
    if (typeof faceapi === 'undefined') {
      if (statusEl) statusEl.textContent = "Errore: AI non caricata";
      isFaceAPIInitializing = false;
      return;
    }
    
    const CDN_URLS = [
      'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights',
      'https://vladmandic.github.io/face-api/model',
      'https://justadudewhohacks.github.io/face-api.js/models',
      'https://unpkg.com/@vladmandic/face-api@1.7.15/model'
    ];
    
    let success = false;
    let lastError = null;
    
    for (const url of CDN_URLS) {
      try {
        if (statusEl) statusEl.textContent = "Connessione CDN...";
        await faceapi.nets.tinyFaceDetector.loadFromUri(url);
        if (statusEl) statusEl.textContent = "Caricamento 2/3...";
        await faceapi.nets.faceLandmark68Net.loadFromUri(url);
        if (statusEl) statusEl.textContent = "Caricamento 3/3...";
        await faceapi.nets.faceRecognitionNet.loadFromUri(url);
        success = true;
        break; // Usciamo dal loop se tutto ha funzionato
      } catch(e) {
        console.warn("Fallback CDN per modelli AI: fallito " + url, e);
        lastError = e;
      }
    }

    if (!success) {
      throw new Error((lastError && lastError.message) ? lastError.message : "Tutti i CDN bloccati");
    }
    
    console.log("AI: Modelli caricati con successo!");
    if (statusEl) statusEl.textContent = "In attesa di riconoscimento...";
    isFaceAPIInitialized = true;
    isFaceAPIInitializing = false;
    loadSavedFaces();
    faceRecognitionActive = true;
  } catch (err) {
    isFaceAPIInitializing = false;
    console.error("AI: Errore inizializzazione:", err);
    if (statusEl) statusEl.innerHTML = "Errore AI: " + (err.message || "Load failed") + "<br><small>Disabilita AdBlock/VPN/Tracker Blocker in questo profilo Safari!</small>";
  }
}


let savedProfilesCache = [];
async function loadSavedFaces() {
  try {
    let data = [];
    const localData = localStorage.getItem('fontana_faces');
    if (localData) {
      try {
        data = JSON.parse(localData);
        if (!Array.isArray(data)) data = [];
      } catch(e) { data = []; }
    }
    
    savedProfilesCache = data;
    if (data && data.length > 0) {
      labeledDescriptors = data.filter(d => d.descriptor).map(d => {
        try {
          const descArray = Array.isArray(d.descriptor) ? d.descriptor : Object.values(d.descriptor);
          const descriptors = [new Float32Array(descArray)];
          return new faceapi.LabeledFaceDescriptors(d.name, descriptors);
        } catch(err) {
          console.error("AI: Errore parsing descrittore per " + d.name, err);
          return null;
        }
      }).filter(ld => ld !== null);

      if (labeledDescriptors.length > 0) {
        faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.62);
        console.log("AI: Caricati " + labeledDescriptors.length + " profili volto.");
      } else {
        console.warn("AI: Database presente ma nessun profilo valido trovato.");
        faceMatcher = null;
      }
    } else {
      console.log("AI: Database volti vuoto.");
      faceMatcher = null;
    }
  } catch (e) { 
    console.error("AI: Errore critico loadSavedFaces:", e); 
    faceMatcher = null;
  }
}

let lastUnknownDetectedTime = 0;
let unknownPopupMuteUntil = 0;
let lastRecognizedUser = null; // Track the currently recognized user
let noFaceFrameCount = 0; // Count frames without face detection

function closeUnknownPopup() {
  const popup = document.getElementById('faceUnknownPopup');
  if (popup) popup.style.display = 'none';
  // Reset anche il timer di auto-chiusura se chiuso manualmente
  if (typeof unknownPopupAutoCloseTimer !== 'undefined' && unknownPopupAutoCloseTimer) {
    clearTimeout(unknownPopupAutoCloseTimer);
    unknownPopupAutoCloseTimer = null;
  }
}

 let lastPopupShownPerPerson = {}; // Track timestamps: { "Name": timestamp }

async function processFaceRecognition(video) {
  if (!faceRecognitionActive || gestureActive) return;
  
  // Forza play se in pausa
  if (video.paused) {
    video.play().catch(() => {});
  }

  try {
    // SSD Mobilenet è molto più accurato, lo proviamo come alternativa se Tiny fallisce
    // Ma per ora ottimizziamo Tiny
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ 
      scoreThreshold: 0.2, // Ulteriormente abbassata per massima sensibilità
      inputSize: 416 // Aumentato da 160 a 416 per vedere le facce in lontananza
    }))
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length > 0) {
      // Reset no-face counter
      noFaceFrameCount = 0;
      
      // Se c'è un utente attivo, resettiamo il timer di logout
      if (activeUserName) {
        if (sessionResetTimer) clearTimeout(sessionResetTimer);
        sessionResetTimer = null;
      }

      let bestMatch = { label: 'unknown', distance: 1.0 };
      if (faceMatcher) {
        bestMatch = faceMatcher.findBestMatch(detections[0].descriptor);
        console.log("AI Feedback: " + bestMatch.label + " (conf: " + (1 - bestMatch.distance).toFixed(2) + ")");
      } else {
        console.log("AI Feedback: Sconosciuto (Database Vuoto)");
      }

      if (bestMatch.label !== 'unknown') {
         // UTENTE CONOSCIUTO
         lastUnknownDetectedTime = 0; // Reset timer sconosciuto
         
         const saved = savedProfilesCache;
         const profile = saved.find(p => p.name === bestMatch.label);
         if (profile) {
             // Aggiorna ruolo e UI
             userRole = profile.ruolo || 'user';
             animateLogin(profile);
             
             // Mostra bottone ENTRA se siamo nel welcome screen
             const enterCont = document.getElementById('enterContainer');
             const welcomeText = document.getElementById('welcomeSubtext');
             if (enterCont && enterCont.style.display === 'none') {
                 document.getElementById('welcomeUserImg').src = profile.photo || '';
                 document.getElementById('welcomeUserName').textContent = profile.name;
                 enterCont.style.display = 'flex';
                 if (welcomeText) welcomeText.style.display = 'none';
             }

             // Il POPUP GRANDE invece appare solo 1 volta ogni 5 minuti per persona (se già dentro)
             const welcomeActive = document.getElementById('welcome').classList.contains('active');
             if (!welcomeActive) {
                 const now = Date.now();
                 const lastShown = lastPopupShownPerPerson[bestMatch.label] || 0;
                 if (now - lastShown > 5 * 60 * 1000) {
                    showFacePopup(bestMatch.label);
                    lastPopupShownPerPerson[bestMatch.label] = now;
                 }
             }
         }
         lastRecognizedUser = bestMatch.label;
      } else {
         // UTENTE SCONOSCIUTO
         lastFaceDetected = null;
         
         // Mostra popup sconosciuto se rileviamo un volto ma non lo riconosciamo
         if (Date.now() > unknownPopupMuteUntil) {
           if (lastUnknownDetectedTime === 0) {
             lastUnknownDetectedTime = Date.now();
           } else if (Date.now() - lastUnknownDetectedTime > 1500) { // Soglia alzata a 1.5s per ridurre falsi positivi
             showUnknownPopup();
             unknownPopupMuteUntil = Date.now() + 180000; // Mute per 3 minuti dopo averlo mostrato
           }
         }
      }
    } else {
      // NESSUN VOLTO: Grace period before clearing recognized user
      noFaceFrameCount++;
      
      // Only clear after 3 consecutive frames without detection (~4.5 seconds)
      if (noFaceFrameCount > 3) {
        lastRecognizedUser = null;
        lastFaceDetected = null;
        lastUnknownDetectedTime = 0;
        
        // Logout immediato per nascondere subito l'area admin
        if (activeUserName) {
          logoutUser();
        }
      }
    }
  } catch (e) { /* ignore */ }
}

function closeFacePopup_deprecated() {
  const el = document.getElementById('facePopup');
  if (el) el.style.display = 'none';
}

// =============================================
// SONG RECOMMENDATION CARD
// =============================================
function showSongRecommendationCard(profile) {
  const card = document.getElementById('songRecommendCard');
  if (!card) return;

  document.getElementById('srcName').textContent = profile.name;
  document.getElementById('srcSong').textContent = SHOW_NAMES[profile.showId] || 'Show ' + profile.showId;
  
  const avatarEl = document.getElementById('srcAvatar');
  if (profile.photo) { avatarEl.src = profile.photo; avatarEl.style.display = 'block'; }
  else { avatarEl.style.display = 'none'; }

  document.getElementById('srcPlayBtn').onclick = () => {
    sendShow(profile.showId);
    hideSongRecommendationCard();
    closeFacePopup();
  };

  card.style.display = 'block';
  requestAnimationFrame(() => card.classList.add('visible'));

  // Auto-hide after 12 seconds
  if (card._autoHide) clearTimeout(card._autoHide);
  card._autoHide = setTimeout(hideSongRecommendationCard, 12000);
}

function hideSongRecommendationCard() {
  const card = document.getElementById('songRecommendCard');
  if (!card) return;
  card.classList.remove('visible');
  setTimeout(() => { card.style.display = 'none'; }, 400);
  if (card._autoHide) clearTimeout(card._autoHide);
}

// =============================================
// MANUTENZIONE
// =============================================
function syncMaintenanceButtonUI() {
  const btn = document.getElementById('maintenanceBtn');
  const status = document.getElementById('maintenanceBtnStatus');
  const fb = document.getElementById('feedback');
  if (isMaintenanceActive) {
    if (btn) btn.style.borderColor = 'rgba(255,152,0,0.9)';
    if (status) status.textContent = '\u26a0\ufe0f ATTIVA';
    if (fb) fb.textContent = '\ud83d\udd27 Manutenzione attiva';
  } else {
    if (btn) btn.style.borderColor = 'rgba(255,152,0,0.4)';
    if (status) status.textContent = 'Disattivata';
    if (fb) fb.textContent = '\u2705 Manutenzione terminata';
  }
}

function toggleMaintenance() {
  const newState = !isMaintenanceActive;
  fetch(`/set-maintenance?enable=${newState ? 1 : 0}`).then(() => {
    isMaintenanceActive = newState;
    lastMaintenanceSpokenState = newState;
    updateMaintenanceUI();
    syncMaintenanceButtonUI();
    // Pronuncia frasi simpatiche al cambio stato manutenzione (manuale)
    if (newState) {
      setTimeout(() => { if (typeof speakMaintenanceStart === 'function') speakMaintenanceStart(); }, 400);
    } else {
      setTimeout(() => { if (typeof speakMaintenanceEnd === 'function') speakMaintenanceEnd(); }, 400);
    }
    console.log("Maintenance mode toggled to: " + newState);
  }).catch(err => {
    console.error("Errore sync manutenzione:", err);
  });
}

let userFaceGreetings = {};

function greetUser(name) {
    const now = new Date();
    const hour = now.getHours();
    const dateStr = now.toLocaleDateString('it-IT');
    
    let timePeriod = "";
    let baseGreeting = "";
    
    if (hour >= 5 && hour < 12) {
        timePeriod = "mattina";
        baseGreeting = "Buongiorno";
    } else if (hour >= 12 && hour < 18) {
        timePeriod = "pomeriggio";
        baseGreeting = "Buon pomeriggio";
    } else {
        timePeriod = "sera";
        baseGreeting = "Buonasera";
    }
    
    if (!userFaceGreetings[name]) userFaceGreetings[name] = { date: '', period: '' };
    const lastGreeting = userFaceGreetings[name];
    
    if (lastGreeting.date === dateStr && lastGreeting.period === timePeriod) return;
    
    userFaceGreetings[name] = { date: dateStr, period: timePeriod };
    
    const fountainPhrases = [
        "Sei pronto per goderti lo spettacolo dell'acqua?",
        "L'acqua danza solo per te oggi.",
        "Spero che tu ti stia rilassando.",
        "La magia dell'acqua ti aspetta.",
        "Un nuovo gioco di luci e zampilli è pronto a partire.",
        "Che bello vederti qui davanti alla fontana."
    ];
    const randomPhrase = fountainPhrases[Math.floor(Math.random() * fountainPhrases.length)];
    const textToSpeak = `${baseGreeting} ${name}! ${randomPhrase}`;
    
    if ('speechSynthesis' in window) {
        let bestVoice = typeof getBestItalianVoice === 'function' ? getBestItalianVoice() : null;
        let msg = new SpeechSynthesisUtterance(textToSpeak);
        if (bestVoice) msg.voice = bestVoice;
        msg.lang = 'it-IT';
        msg.rate = 0.95;
        msg.pitch = 1.05;
        msg.volume = typeof window.currentVoiceVolume !== 'undefined' ? window.currentVoiceVolume / 100.0 : 1.0;
        
        if (typeof stopParentSpeech === 'function') stopParentSpeech();
        msg.onend = function() {
            if (typeof startParentSpeech === 'function') setTimeout(startParentSpeech, 500);
        };
        window.speechSynthesis.speak(msg);
    }
}

function showFacePopup(name) {
  const saved = savedProfilesCache;
  const profile = saved.find(p => p.name === name);
  if (!profile) return;

  // Mostra la scheda suggerimento show e saluta
  showSongRecommendationCard(profile);
  playUISound('uiPopupSound');
  greetUser(profile.name);
}

function requestAdminAccess() {
  let modal = document.getElementById("adminPassModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "adminPassModal";
    modal.innerHTML = `
      <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:100000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px);">
        <div style="background:#111; border:2px solid #00e5ff; border-radius:15px; padding:30px; text-align:center; width:90%; max-width:350px;">
          <h3 style="color:#00e5ff; margin-top:0;">Accesso Admin</h3>
          <input type="password" id="adminPassInput" style="width:100%; padding:12px; margin:20px 0; border-radius:8px; border:1px solid #444; background:#222; color:white; text-align:center; font-size:1.2rem; outline:none;" placeholder="Password">
          <div style="display:flex; gap:10px; justify-content:center;">
            <button onclick="document.getElementById('adminPassModal').style.display='none'" style="padding:10px 20px; background:#ff5252; color:white; border:none; border-radius:8px; cursor:pointer; flex:1;">Annulla</button>
            <button onclick="checkAdminPass()" style="padding:10px 20px; background:#00e5ff; color:#000; font-weight:bold; border:none; border-radius:8px; cursor:pointer; flex:1;">Entra</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    window.checkAdminPass = function() {
      const val = document.getElementById("adminPassInput").value;
      if (val === "lori123") {
        window.location.href = "/control-area";
      } else {
        alert("Password errata contatta Lorenzo!");
        document.getElementById("adminPassInput").value = "";
      }
    };
  }
  document.getElementById("adminPassModal").style.display = "flex";
  document.getElementById("adminPassInput").value = "";
  setTimeout(() => document.getElementById("adminPassInput").focus(), 100);
}

let lastUnknownFaceTime = 0;
let unknownPopupAutoCloseTimer = null;

function showUnknownPopup() {
  const now = Date.now();
  // Cooldown aumentato a 3 minuti tra un popup sconosciuto e l'altro
  if (now - lastUnknownFaceTime < 180000) return;
  lastUnknownFaceTime = now;

  const popup = document.getElementById('faceUnknownPopup');
  if (!popup) return;
  popup.style.display = 'block';
  playUISound('uiPopupSound');
  closeFacePopup();

  // Cancella eventuale timer precedente e imposta chiusura automatica dopo 5s
  if (unknownPopupAutoCloseTimer) clearTimeout(unknownPopupAutoCloseTimer);
  unknownPopupAutoCloseTimer = setTimeout(() => {
    popup.style.display = 'none';
    unknownPopupAutoCloseTimer = null;
  }, 5000);
}

function animateLogin(profile) {
  activeUserName = profile.name;
  userRole = profile.ruolo || 'user'; // Sincronizza ruolo globale
  
  const badge = document.getElementById('activeUserBadge');
  const img = document.getElementById('activeUserImg');
  const nameSpan = document.getElementById('activeUserName');
  
  if (img) img.src = profile.photo || '';
  if (nameSpan) nameSpan.innerText = profile.name;
  if (badge) badge.classList.add('show');
  
  // Sincronizza visibilità area Admin
  const adminSec = document.getElementById('adminSystemSection');
  if (adminSec) {
    adminSec.style.display = (userRole === 'admin') ? '' : 'none';
  }
  


  closeUnknownPopup();
  updateMaintenanceUI();
  if (sessionResetTimer) clearTimeout(sessionResetTimer);
}

function logoutUser() {
  const badge = document.getElementById('activeUserBadge');
  if (badge) badge.classList.remove('show');
  
  activeUserName = null;
  userRole = 'user'; // Reset role on logout
  
  // Hide admin section
  const adminSec = document.getElementById('adminSystemSection');
  if (adminSec) adminSec.style.display = 'none';
  


  hideSongRecommendationCard();
  updateMaintenanceUI();
}


function playUISound(id) {
  const sound = document.getElementById(id);
  if (sound) {
    sound.pause();
    sound.currentTime = 0;
    // Play with a slight delay to ensure it's ready and bypass some mobile quirks
    setTimeout(() => {
      sound.play().catch(e => console.log("Audio play blocked/failed for " + id + ":", e));
    }, 10);
  }
}

// Global Click Sound for all buttons
document.addEventListener('click', (e) => {
  const target = e.target.closest('button') || (e.target.tagName === 'BUTTON' ? e.target : null);
  if (target) {
    playUISound('uiClickSound');
  }
});

function closeFacePopup() {
  const el = document.getElementById('facePopup');
  if (el) el.style.display = 'none';
}

// Auto-adjust per luminosità ambientale (sole / buio)
let aiBrightness = 1.0;
let aiContrast = 1.0;
let lastAiVideoProcessTime = 0;
let aiProcessedCanvas = null;

function getProcessedVideoFrame(video) {
  if (!aiProcessedCanvas) {
    aiProcessedCanvas = document.createElement('canvas');
    aiProcessedCanvas.id = 'aiProcessCanvas';
    aiProcessedCanvas.width = 640;
    aiProcessedCanvas.height = 480;
    aiProcessedCanvas.style.display = 'none';
    document.body.appendChild(aiProcessedCanvas);
  }
  
  const now = Date.now();
  if (now - lastAiVideoProcessTime < 30) {
     return aiProcessedCanvas; // Cache per performance
  }
  lastAiVideoProcessTime = now;

  const ctx = aiProcessedCanvas.getContext('2d', { willReadFrequently: true });
  
  if (!aiProcessedCanvas._lastSample || now - aiProcessedCanvas._lastSample > 1500) {
    aiProcessedCanvas._lastSample = now;
    ctx.filter = 'none';
    ctx.drawImage(video, 0, 0, aiProcessedCanvas.width, aiProcessedCanvas.height);
    const frameData = ctx.getImageData(0, 0, aiProcessedCanvas.width, aiProcessedCanvas.height);
    const data = frameData.data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 64) {
      sum += (data[i] + data[i+1] + data[i+2]) / 3;
      count++;
    }
    const avg = sum / count;
    
    // Logica di correzione
    if (avg > 180) { // Troppa luce (es. Sole/giorno)
      aiBrightness = 0.5;
      aiContrast = 1.5;
    } else if (avg < 50) { // Troppo buio
      aiBrightness = 1.8;
      aiContrast = 1.3;
    } else {
      aiBrightness = 1.0;
      aiContrast = 1.0;
    }
  }
  
  ctx.filter = `brightness(${aiBrightness}) contrast(${aiContrast})`;
  ctx.drawImage(video, 0, 0, aiProcessedCanvas.width, aiProcessedCanvas.height);
  return aiProcessedCanvas;
}

// Chiamata periodica nel loop camera
setInterval(async () => {
  if (!cameraSystemEnabled || !isFaceAPIInitialized) return;
  const video = document.getElementById('gestureVideo');
  if (video && video.readyState === 4 && !gestureActive) {
     const processedFrame = getProcessedVideoFrame(video);
     await processFaceRecognition(processedFrame);
  }
}, 1500);

// --- GLOBAL INITIALIZATION (Camera/Gesture only) ---
// NOTA: La visibilità del bottone "Richiedi Accesso" è gestita
// esclusivamente dal listener del sistema accesso (più in basso nel file).
async function initGlobalVirtualMouse() {
  if (isCameraSystemInitialized) return;
  if (!window.isSecureContext) {
      console.warn("Fotocamera bloccata causa HTTP (IP locale senza SSL). Usare chrome://flags/#unsafely-treat-insecure-origin-as-secure");
  }
  isCameraSystemInitialized = true;
  const videoElement = document.getElementById('gestureVideo');
  const canvasElement = document.getElementById('gestureCanvas');
  const canvasCtx = canvasElement.getContext('2d');
  const cursor = document.getElementById('virtualCursor');
  const progress = document.getElementById('cursorProgress');

  function resize() {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  handsInstance = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  handsInstance.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
  });

  handsInstance.onResults((results) => {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      updateCursorActivity();
      
      // LOGICA MOUSE VIRTUALE (Globale se non in modalità tracking gesture)
      if (mouseModeActive) {
        cursor.style.display = 'block';
        
        // Risoluzione 2 Mani: Trova la mano più vicina alla posizione attuale del cursore
        let activeHand = results.multiHandLandmarks[0];
        if (results.multiHandLandmarks.length > 1 && smoothedCursorX !== null && smoothedCursorY !== null) {
          let minDistance = Infinity;
          for (const hand of results.multiHandLandmarks) {
            // Usa una stima grezza basata sul landmark 9 per la distanza
            const px = (1 - hand[9].x) * window.innerWidth;
            const py = hand[9].y * window.innerHeight;
            const dist = Math.sqrt(Math.pow(px - smoothedCursorX, 2) + Math.pow(py - smoothedCursorY, 2));
            if (dist < minDistance) {
              minDistance = dist;
              activeHand = hand;
            }
          }
        }
        const landmarks = activeHand;
        
        // Punto di ancoraggio stabile: Centro del palmo (media tra polso e nocche)
        const palmLandmarks = [0, 5, 9, 13, 17];
        let palmX = 0;
        let palmY = 0;
        for (let i of palmLandmarks) {
          palmX += landmarks[i].x;
          palmY += landmarks[i].y;
        }
        palmX /= palmLandmarks.length;
        palmY /= palmLandmarks.length;
        
        // Calcolo dinamico della distanza dell'utente (dimensione della mano)
        const wrist = landmarks[0];
        const middleMCP = landmarks[9];
        const handSize = Math.sqrt(Math.pow(wrist.x - middleMCP.x, 2) + Math.pow(wrist.y - middleMCP.y, 2));
        
        // Margini dinamici: se l'utente è lontano, i margini aumentano per far muovere il cursore su tutto lo schermo
        let marginX = 0.20;
        let marginY = 0.20;
        if (handSize < 0.12) {
          marginX = 0.35; // Lontano: sensibilità massima
          marginY = 0.35;
        } else if (handSize < 0.22) {
          marginX = 0.28; // Media distanza
          marginY = 0.28;
        }
        
        const minX = marginX;
        const maxX = 1.0 - marginX;
        const minY = marginY;
        const maxY = 1.0 - marginY;
        
        const normalizedX = 1 - palmX; // Invertito orizzontalmente (effetto specchio)
        const normalizedY = palmY;
        
        let targetX = (normalizedX - minX) / (maxX - minX);
        targetX = Math.max(0, Math.min(1, targetX)) * window.innerWidth;
        
        let targetY = (normalizedY - minY) / (maxY - minY);
        targetY = Math.max(0, Math.min(1, targetY)) * window.innerHeight;
        
        const now = Date.now();
        if (smoothedCursorX === null || smoothedCursorY === null || (now - lastHandSeenTime > 500)) {
          smoothedCursorX = targetX;
          smoothedCursorY = targetY;
          cursorVelocityX = 0;
          cursorVelocityY = 0;
        } else {
          // Dinamica Fisica (Molla + Smorzatore)
          const dx = targetX - smoothedCursorX;
          const dy = targetY - smoothedCursorY;
          const distance = Math.sqrt(dx*dx + dy*dy);
          
          let pullForce = 0.15; // Reattività base (molla)
          let friction = 0.70;  // Smorzamento (0.0 = inerzia infinita, 1.0 = stop istantaneo)
          
          // Adattamento alla luminosità (luce eccessiva o buio = rumore = serve più stabilità)
          let deadZone = 5;
          let lowSpeedZone = 20;
          if (typeof aiBrightness !== 'undefined' && aiBrightness !== 1.0) {
            // Se aiBrightness non è 1.0 significa che c'è troppa luce (sole) o troppo buio, 
            // e l'algoritmo sta forzando la correzione, causando potenziale rumore
            deadZone = 14; // Deadzone aumentata
            lowSpeedZone = 38;
            pullForce *= 0.65; // Sensibilità ridotta per filtrare i tremolii
          }

          // Dead zone e filtro stabilità adattivo
          if (distance < deadZone) {
            pullForce = 0.01; // Forte smorzamento quando quasi fermo
            friction = 0.40;
          } else if (distance < lowSpeedZone) {
            pullForce = 0.06;
            friction = 0.60;
          }
          
          cursorVelocityX = (cursorVelocityX + dx * pullForce) * friction;
          cursorVelocityY = (cursorVelocityY + dy * pullForce) * friction;
          
          smoothedCursorX += cursorVelocityX;
          smoothedCursorY += cursorVelocityY;
        }
        lastHandSeenTime = now;
        
        cursor.style.left = smoothedCursorX + 'px';
        cursor.style.top = smoothedCursorY + 'px';
        
        handleVirtualClick(smoothedCursorX, smoothedCursorY);
      } else {
        cursor.style.display = 'none';
      }

      // LOGICA GESTURE PRO (Se attiva)
      if (gestureActive) {
        if (gestureStep === 'calibration') {
          processGestureCalibration(results.multiHandLandmarks);
        } else if (gestureStep === 'tracking') {
          for (const hand of results.multiHandLandmarks) {
             drawConnectors(canvasCtx, hand, HAND_CONNECTIONS, {color: '#00e5ff', lineWidth: 3});
             drawLandmarks(canvasCtx, hand, {color: '#fff', lineWidth: 1, radius: 2});
          }
          processGestureProLogic(results.multiHandLandmarks);
        }
      }
    } else {
      cursor.style.display = 'none';
      if (gestureActive && gestureStep === 'tracking') {
         document.getElementById('hudStatus').innerText = "In attesa di mani...";
         processGestureProLogic([]); // Forza reset se non ci sono mani
      }
      hoverElement = null;
      hoverStartTime = 0;
      progress.style.display = 'none';
    }
    canvasCtx.restore();
  });

  let lastAiFrame = 0;
  let isAiProcessing = false;
  cameraInstance = new Camera(videoElement, {
    onFrame: async () => {
      const now = Date.now();
      if (cameraSystemEnabled && !isAiProcessing && (now - lastAiFrame > 100)) { // Max 10 FPS
        isAiProcessing = true;
        lastAiFrame = now;
        const processedFrame = getProcessedVideoFrame(videoElement);
        await handsInstance.send({image: processedFrame});
        isAiProcessing = false;
      }
    },
    width: 640,
    height: 480
  });
  
  if (cameraSystemEnabled) {
    cameraInstance.start();
  }
}

function updateCursorActivity() {
  lastCursorActivity = Date.now();
  if (cursorHidden) {
    cursorHidden = false;
    document.body.classList.remove('hide-cursor');
    const virtualCursor = document.getElementById('virtualCursor');
    if (virtualCursor && mouseModeActive && cameraSystemEnabled) {
      virtualCursor.style.display = 'block';
    }
  }
}

// Monitor cursor activity
window.addEventListener('mousemove', updateCursorActivity);
window.addEventListener('touchstart', updateCursorActivity);

setInterval(() => {
  if (!cursorHidden && Date.now() - lastCursorActivity > 5000) {
    cursorHidden = true;
    document.body.classList.add('hide-cursor');
    const virtualCursor = document.getElementById('virtualCursor');
    if (virtualCursor) {
      virtualCursor.style.display = 'none';
    }
  }
}, 1000);

function stopCameraCompletely() {
  if (cameraInstance) cameraInstance.stop();
  const vid = document.getElementById('gestureVideo');
  if (vid && vid.srcObject) {
    vid.srcObject.getTracks().forEach(t => t.stop());
    vid.srcObject = null;
  }
}

function toggleCameraSystem() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    showCommandFeedback(true, "Fotocamera non disponibile su mobile");
    return;
  }
  cameraSystemEnabled = !cameraSystemEnabled;
  localStorage.setItem('camera_enabled', cameraSystemEnabled ? '1' : '0');
  
  const btn = document.getElementById('cameraToggleBtn');
  if (btn) {
    btn.textContent = cameraSystemEnabled ? "📷 Sistema Camera ON" : "📷 Sistema Camera OFF";
    btn.style.background = cameraSystemEnabled ? "linear-gradient(135deg,#00bcd4,#0097a7)" : "#555";
  }

  if (cameraSystemEnabled) {
    if (!isCameraSystemInitialized) {
      initGlobalVirtualMouse();
      initFaceAPI();
    } else {
      if (cameraInstance) cameraInstance.start();
      const virtualCursor = document.getElementById('virtualCursor');
      if (virtualCursor && mouseModeActive) virtualCursor.style.display = 'block';
    }
  } else {
    stopCameraCompletely();
    const virtualCursor = document.getElementById('virtualCursor');
    if (virtualCursor) virtualCursor.style.display = 'none';
  }
}

function handleVirtualClick(x, y) {
  const el = document.elementFromPoint(x, y);
  const cursor = document.getElementById('virtualCursor');
  const progress = document.getElementById('cursorProgress');

  let target = null;
  if (el) {
    let curr = el;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      const style = window.getComputedStyle(curr);
      const tagName = curr.tagName;
      if (
        tagName === 'BUTTON' || 
        tagName === 'A' || 
        tagName === 'INPUT' || 
        tagName === 'SELECT' || 
        tagName === 'TEXTAREA' ||
        curr.hasAttribute('onclick') || 
        curr.getAttribute('role') === 'button' ||
        style.cursor === 'pointer' ||
        curr.classList.contains('star') ||
        curr.closest('.karaoke-result-item')
      ) {
        target = curr;
        break;
      }
      curr = curr.parentElement;
    }
  }

  if (target) {
    if (target !== hoverElement) {
      if (hoverElement) hoverElement.style.boxShadow = '';
      hoverElement = target;
      hoverStartTime = Date.now();
      progress.style.display = 'block';
      cursor.classList.add('active');
      target.style.boxShadow = '0 0 20px #ff00ff';
    } else {
      const elapsed = Date.now() - hoverStartTime;
      // Visual Feedback: Progress circle filling
      const percent = Math.min(100, (elapsed / 2000) * 100);
      cursor.style.borderWidth = (2 + (percent/10)) + 'px';
      
      if (elapsed >= 2000) {
        if (target.tagName === 'INPUT') target.focus();
        else target.click();
        hoverStartTime = Date.now(); 
        cursor.style.backgroundColor = 'white';
        setTimeout(() => cursor.style.backgroundColor = 'rgba(0,229,255,0.1)', 200);
        target.style.boxShadow = '';
      }
    }
  } else {
    if (hoverElement) hoverElement.style.boxShadow = '';
    hoverElement = null;
    hoverStartTime = 0;
    progress.style.display = 'none';
    cursor.classList.remove('active');
    cursor.style.borderWidth = '2px';
  }
}

function countFingers(landmarks) {
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  let count = 0;
  for (let i = 0; i < tips.length; i++) {
    if (landmarks[tips[i]].y < landmarks[pips[i]].y) count++;
  }
  const thumbTip = landmarks[4];
  const thumbBase = landmarks[2];
  const isThumbExtended = Math.abs(thumbTip.x - thumbBase.x) > 0.08;
  if (isThumbExtended && count === 0) return 6;
  if (count === 4 && isThumbExtended) return 5;
  return count;
}

let selectionStartTime = 0;
let lastDetectedFingers = 0;
let resetStartTime = 0;

let lastPumpValues = [110, 110, 110, 110, 110, 110];
let smoothedPumpValues = [110, 110, 110, 110, 110, 110]; // Nuova variabile per smoothing
let lastGlobalSentTime = 0;
let fistModeActive = false; 

function processGestureProLogic(allHands, ctx) { // Aggiunto ctx per disegnare feedback
  const statusEl = document.getElementById('hudStatus');
  const now = Date.now();
  
  // Reset target per questo frame (su cui fare smoothing)
  let targetFrameValues = [110, 110, 110, 110, 110, 110];
  let handsDetected = false;
  let fistDetected = false;
  
  if (allHands && allHands.length > 0) {
    handsDetected = true;
    
    // 1. Controllo Pugno / Thumbs Up (Priorità Assoluta)
    for (const landmarks of allHands) {
      const fingerCount = countFingers(landmarks);
      if (fingerCount === 0 || fingerCount === 6) {
        fistDetected = true;
        break; 
      }
    }
    
    if (fistDetected) {
      statusEl.innerText = "👊 PUGNO! MAX POWER!!";
      // Pugno bypassa smoothing: va diretto a 255
      targetFrameValues = [255, 255, 255, 255, 255, 255];
      fistModeActive = true;
      // Reset smoothing al valore target immediato per evitare trascinamenti al rilascio
      smoothedPumpValues = [255, 255, 255, 255, 255, 255];
    } else {
      statusEl.innerText = "Orchestra: muovi veloce per reattività!";
      fistModeActive = false;
      
      for (const landmarks of allHands) {
        // COORDINATE: X invertita per specchio
        const handX = 1 - landmarks[9].x;
        const handY = landmarks[9].y;
        
        // 2. Mappatura Settore
        let sector = Math.floor(handX * 6);
        sector = Math.max(0, Math.min(5, sector));
        
        // 3. Mappatura Altezza Migliorata (Deadzone)
        // Y va da 0 (alto) a 1 (basso)
        // < 10% (0.1) -> MAX (255)
        // > 85% (0.85) -> MIN (110 / OFF)
        // Nel mezzo: Interpolazione lineare
        let power = 110;
        
        if (handY < 0.1) {
             power = 255; // Zona MAX in alto
        } else if (handY > 0.85) {
             power = 110; // Zona MIN in basso
        } else {
             // Range utile: 0.1 a 0.85 (delta 0.75)
             // Normalizziamo: 0 (alto) a 1 (basso) rispetto al range
             const normalized = (handY - 0.1) / 0.75; 
             // Invertiamo: 1 (alto) a 0 (basso)
             const val = 1.0 - normalized;
             // Scaliamo su 110-255
             power = 110 + Math.round(val * 145);
        }
        
        targetFrameValues[sector] = Math.max(targetFrameValues[sector], power);

        // 4. Visual Feedback (Cursore)
        if (ctx) {
           const canvasW = ctx.canvas.width;
           const canvasH = ctx.canvas.height;
           ctx.beginPath();
           ctx.arc(handX * canvasW, handY * canvasH, 20, 0, 2 * Math.PI);
           ctx.fillStyle = "rgba(0, 255, 255, 0.4)";
           ctx.fill();
           ctx.lineWidth = 3;
           ctx.strokeStyle = "#00e5ff";
           ctx.stroke();
           // Indicatore livello potenza
           ctx.beginPath();
           ctx.arc(handX * canvasW, handY * canvasH, 25, 0, 2 * Math.PI * ((power-110)/145));
           ctx.strokeStyle = "#ff00ff";
           ctx.stroke();
        }
      }
    }
  } else {
    statusEl.innerText = "Attesa mani...";
    fistModeActive = false;
    // Se non ci sono mani, target è tutto 110
  }

  // 5. Smoothing Adattivo & Aggiornamento
  let changed = false;
  let forceImmediate = (!handsDetected && lastPumpValues.some(v => v > 110)); // Shutdown veloce
  
  for (let i = 0; i < 6; i++) {
     let target = targetFrameValues[i];
     
     if (fistDetected || forceImmediate) {
         // Nessun smoothing per pugno o spegnimento rapido
         smoothedPumpValues[i] = target;
     } else {
         // Smoothing Adattivo
         let diff = Math.abs(target - smoothedPumpValues[i]);
         // Se la differenza è grande (movimento veloce) -> Alpha alto (segui veloce)
         // Se la differenza è piccola (tremolio) -> Alpha basso (filtra)
         let alpha = (diff > 25) ? 0.8 : 0.2; 
         
         smoothedPumpValues[i] = smoothedPumpValues[i] + alpha * (target - smoothedPumpValues[i]);
     }
     
     let finalVal = Math.round(smoothedPumpValues[i]);
     
     // Update HUD Bar
     const fillEl = document.getElementById('fillP' + (i + 1));
     if (fillEl) {
       fillEl.style.height = Math.round(((finalVal - 110) / 145) * 100) + "%";
       fillEl.style.opacity = (finalVal > 115) ? "0.9" : "0.2";
       if (finalVal > 115) fillEl.closest('.sector-v').style.background = "rgba(0, 229, 255, 0.15)";
       else fillEl.closest('.sector-v').style.background = "transparent";
     }
     
     // Check changes logic (usando finalVal)
     // Aggiorniamo 'currentFrameValues' (che ora è finalVal) solo per confronto invio
     if (Math.abs(finalVal - lastPumpValues[i]) > 3) { // Soglia leggermente aumentata per stabilità
       changed = true;
     }
     
     // Salviamo il valore "visualizzato/deciso" temporaneamente in targetFrameValues per ciclo invio
     targetFrameValues[i] = finalVal; 
  }

  // 6. Throttling Aggressivo (80ms invece di 120ms) per reattività
  if (changed && (forceImmediate || (now - lastGlobalSentTime > 80))) {
    let query = "";
    for (let i = 0; i < 6; i++) {
      const val = targetFrameValues[i];
      if (forceImmediate || Math.abs(val - lastPumpValues[i]) > 3) {
        query += (query ? "&" : "") + `p${i + 1}=${val}`;
        lastPumpValues[i] = val;
      }
    }
    
    if (query) {
      fetch(`/pumps?${query}`); // Invio non bloccante
    }
    
    lastGlobalSentTime = now;
  }
}

// Funzione per inviare comando Random LED
function sendRandomLED() {
  fetch("/random-led")
    .then(r => r.text())
    .then(t => console.log("Comando Random LED inviato: " + t))
    .catch(e => console.error("Errore invio comando Random LED:", e));
}
function openControlArea() {
  window.location.href = "/control-area";
}

/* === KARAOKE MODE LOGIC === */
let karaokeActive = false;
let micStream = null;
let audioCtx = null;
let analyser = null;
let karaokeInterval = null;
let lastPumpUpdate = 0;

// === AI ASSISTANT POPUP LOGIC ===
let iframeLoaded = false;
let isIframeAiBusy = false;

function sendPopupStateToIframe(isOpen) {
  const iframe = document.getElementById('aiPopupIframe');
  if (iframe && iframe.src) {
    console.log("[Voice] Invio stato popup all'iframe:", isOpen);
    iframe.contentWindow.postMessage({
      type: 'fontana_popup_state',
      open: isOpen
    }, 'https://ai.fontanabyloriorl.it');
  }
}

function openAiPopup() {
  const overlay = document.getElementById('aiPopupOverlay');
  const card = document.getElementById('aiPopupCard');
  const iframe = document.getElementById('aiPopupIframe');
  const loading = document.getElementById('aiPopupLoading');
  const voiceWidget = document.getElementById('voiceWidget');
  
  isAiPopupOpen = true;
  if (!isIframeAiBusy) {
    stopParentSpeech(); // Ferma momentaneamente se necessario
  }
  
  if (voiceWidget) voiceWidget.style.opacity = '0'; // Smoothly hide the parent voice widget
  
  if (loading) loading.style.opacity = '1';
  
  // Carica dinamicamente l'iframe solo all'apertura del popup
  if (iframe) {
    iframe.src = 'https://fontana-ai.onrender.com';
    iframe.onload = () => { 
      iframeLoaded = true;
      if (loading) loading.style.opacity = '0';
      sendPopupStateToIframe(true);
    };
  }
  
  overlay.style.visibility = 'visible';
  void overlay.offsetWidth;
  
  overlay.style.opacity = '1';
  card.style.opacity = '1';
  card.style.transform = 'scale(1) rotateX(0deg) translateY(0)';
  
  resetAiInactivityTimer(); // Avvia il timer di 3 minuti
  
  try {
    playSound('uiPopupSound');
  } catch(e) {}
}

function closeAiPopup() {
  const overlay = document.getElementById('aiPopupOverlay');
  const card = document.getElementById('aiPopupCard');
  const iframe = document.getElementById('aiPopupIframe');
  const voiceWidget = document.getElementById('voiceWidget');
  const loading = document.getElementById('aiPopupLoading');
  
  isAiPopupOpen = false;
  clearAiInactivityTimeout(); // Cancella il timer di inattività
  
  // Svuota completamente l'iframe e disabilitalo per rilasciare ogni risorsa
  if (iframe) {
    iframe.src = 'about:blank';
    iframeLoaded = false;
  }
  if (loading) loading.style.opacity = '0';
  
  overlay.style.opacity = '0';
  card.style.opacity = '0';
  card.style.transform = 'scale(0.8) rotateX(5deg) translateY(30px)';
  
  setTimeout(() => {
    overlay.style.visibility = 'hidden';
    if (voiceWidget && voiceControlEnabled) voiceWidget.style.opacity = '1'; // Restore parent voice widget
    
    startParentSpeech(); // Riattiva il microfono locale
  }, 450); // Deve matchare la durata della transition CSS
  
  try {
    playSound('uiClickSound');
  } catch(e) {}
}

let aiInactivityTimeout = null;

function resetAiInactivityTimer() {
  clearAiInactivityTimeout();
  if (isAiPopupOpen) {
    console.log("[Voice] Reset timer inattività AI (3 minuti)");
    aiInactivityTimeout = setTimeout(() => {
      console.log("[Voice] 3 minuti di inattività AI raggiunti. Chiusura automatica popup.");
      closeAiPopup();
    }, 180000); // 3 minuti = 180000 ms
  }
}

function clearAiInactivityTimeout() {
  if (aiInactivityTimeout) {
    clearTimeout(aiInactivityTimeout);
    aiInactivityTimeout = null;
  }
}

function startKaraokeMode() {
  karaokeActive = true;
  fetch('/karaoke-start');
  // mouseModeActive = true; // Forziamo il mouse virtuale per navigare
  gestureActive = false;  // Disabilitiamo modalità orchestra se era attiva
  document.getElementById('welcome').classList.remove('active');
  document.getElementById('panel').classList.remove('active');
  document.getElementById('karaokeOverlay').style.display = 'flex';
  stopAllAudio();
}

function stopKaraokeMode() {
  karaokeActive = false;
  document.getElementById('karaokeOverlay').style.display = 'none';
  document.getElementById('panel').classList.add('active');
  
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  if (karaokeInterval) clearInterval(karaokeInterval);
  
  // Reset IFrame
  document.getElementById('karaokePlayerArea').innerHTML = `
    <div id="yt-player-placeholder" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; flex-direction:column; color:#444;">
      <span style="font-size:4rem;">📺</span>
      <p>Cerca un video o incolla un link YouTube</p>
    </div>`;
  
  fetch('/stop');
}

const invidiousInstances = [
  "https://yewtu.be",
  "https://invidious.flokinet.to",
  "https://invidious.snopyta.org",
  "https://vid.puffyan.us"
];

const pipedInstances = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.colnect.com"
];

function searchKaraoke(engine = 'dailymotion', idx = 0) {
  const queryInput = document.getElementById('karaokeSearchInput');
  const query = queryInput.value.trim();
  const searchBtn = document.getElementById('karaokeSearchBtn');
  const resultsDiv = document.getElementById('karaokeResults');
  
  if (!query) return;
  
  if (engine === 'dailymotion' && idx === 0) {
    const ytMatch = query.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/);
    if (ytMatch) {
      selectKaraoke(ytMatch[1].split('&')[0], "Video da link", 'youtube');
      return;
    }
    searchBtn.textContent = "⏳...";
    searchBtn.disabled = true;
    resultsDiv.style.display = 'none';
  }

  if (engine === 'dailymotion') {
    // Dailymotion è la fonte più stabile (API Ufficiale)
    fetch(`https://api.dailymotion.com/videos?fields=id,title,thumbnail_180_url&search=${encodeURIComponent(query + " karaoke")}&limit=3`)
      .then(r => r.json())
      .then(data => {
        if (data.list && data.list.length > 0) {
          renderResults(data.list, 'dailymotion');
        } else {
          console.warn("Nessun risultato su Dailymotion, provo YouTube...");
          searchKaraoke('invidious', 0);
        }
      })
      .catch(() => {
        console.warn("Dailymotion fallito, provo YouTube...");
        searchKaraoke('invidious', 0);
      });
  } else if (engine === 'invidious') {
    if (idx >= invidiousInstances.length) {
      searchKaraoke('piped', 0);
      return;
    }
    const url = `${invidiousInstances[idx]}/api/v1/search?q=${encodeURIComponent(query + " karaoke")}`;
    console.log(`[Search] Invidious ${idx+1}/${invidiousInstances.length}`);
    fetch(url).then(r => r.json()).then(data => renderResults(data, 'invidious')).catch(() => searchKaraoke('invidious', idx + 1));
  } else if (engine === 'piped') {
    if (idx >= pipedInstances.length) {
      searchBtn.textContent = "🔍 Cerca";
      searchBtn.disabled = false;
      alert("Nessun risultato trovato. Prova con parole più semplici o incolla un link YouTube.");
      return;
    }
    const url = `${pipedInstances[idx]}/search?q=${encodeURIComponent(query + " karaoke")}&filter=videos`;
    console.log(`[Search] Piped ${idx+1}/${pipedInstances.length}`);
    fetch(url).then(r => r.json()).then(data => renderResults(data, 'piped')).catch(() => searchKaraoke('piped', idx + 1));
  }
}

function renderResults(data, source) {
  const resultsDiv = document.getElementById('karaokeResults');
  const searchBtn = document.getElementById('karaokeSearchBtn');
  searchBtn.textContent = "🔍 Cerca";
  searchBtn.disabled = false;

  let items = [];
  if (source === 'dailymotion') {
    items = data.map(v => ({ id: v.id, title: v.title, thumb: v.thumbnail_180_url, type: 'dailymotion' }));
  } else if (source === 'invidious') {
    items = data.filter(v => v.type === "video").slice(0, 3).map(v => ({ id: v.videoId, title: v.title, thumb: `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`, type: 'youtube' }));
  } else if (source === 'piped') {
    items = (data.items || []).filter(v => v.type === "stream").slice(0, 3).map(v => ({ id: v.url.split('=')[1], title: v.title, thumb: `https://img.youtube.com/vi/${v.url.split('=')[1]}/mqdefault.jpg`, type: 'youtube' }));
  }

  resultsDiv.innerHTML = items.map(v => `
    <div class="karaoke-result-item" onclick="selectKaraoke('${v.id}', '${v.title.replace(/'/g, "\\'")}', '${v.type}')">
      <img src="${v.thumb}">
      <div style="display:flex; flex-direction:column;">
        <span>${v.title}</span>
        <small style="color:${v.type === 'youtube' ? '#ff3d00' : '#00e5ff'}; font-size:0.7rem; font-weight:bold;">${v.type.toUpperCase()}</small>
      </div>
    </div>
  `).join('');
  resultsDiv.style.display = 'flex';
}

function selectKaraoke(id, title, type) {
  document.getElementById('karaokeResults').style.display = 'none';
  const playerArea = document.getElementById('karaokePlayerArea');
  
  if (type === 'youtube') {
    playerArea.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  } else {
    playerArea.innerHTML = `<iframe width="100%" height="100%" src="https://www.dailymotion.com/embed/video/${id}?autoplay=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }
}

async function toggleMicrophone() {
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
    document.getElementById('toggleMicBtn').textContent = "🎤 Attiva Mic";
    document.getElementById('toggleMicBtn').style.background = "#ff5252";
    if (karaokeInterval) clearInterval(karaokeInterval);
    document.getElementById('vocalBar').style.width = "0%";
    return;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    document.getElementById('toggleMicBtn').textContent = "🎤 Mic Attivo";
    document.getElementById('toggleMicBtn').style.background = "#00e676";
    setupAudioAnalysis();
  } catch (err) {
    alert("Impossibile accedere al microfono: " + err);
  }
}

let pumpEMA = [0, 0, 0, 0, 0, 0];
let currentPattern = 0;
let lastPatternSwitch = 0;
let isFetchingPumps = false;
let lastBassPeak = 0;
let dynamicBoost = 1.0;
const PUMP_MIN = 110;
const PATTERN_COUNT = 8;

let ledShowState = {
  palette: [
    [0, 229, 255],  // Cyan
    [255, 0, 150],  // Magenta
    [0, 255, 100],  // Neon Green
    [255, 200, 0],  // Gold
    [100, 100, 255] // Soft Blue
  ],
  currentIdx: 0,
  lastPaletteSwitch: 0,
  currentR: 0,
  currentG: 229,
  currentB: 255,
  currentEffect: 202,
  lastEffectSwitch: 0
};

function updateLEDChoreography(vol, isBeat) {
  const now = Date.now();
  if (now - ledShowState.lastPaletteSwitch > 12000) {
    ledShowState.currentIdx = (ledShowState.currentIdx + 1) % ledShowState.palette.length;
    ledShowState.lastPaletteSwitch = now;
  }
  if (now - ledShowState.lastEffectSwitch > 25000) {
    const effects = [200, 202, 205];
    ledShowState.currentEffect = effects[Math.floor(Math.random() * effects.length)];
    ledShowState.lastEffectSwitch = now;
  }
  const targetColor = ledShowState.palette[ledShowState.currentIdx];
  ledShowState.currentR += (targetColor[0] - ledShowState.currentR) * 0.05;
  ledShowState.currentG += (targetColor[1] - ledShowState.currentG) * 0.05;
  ledShowState.currentB += (targetColor[2] - ledShowState.currentB) * 0.05;
  let r = ledShowState.currentR, g = ledShowState.currentG, b = ledShowState.currentB;
  let br = Math.min(vol * 2.8, 255);
  let effId = ledShowState.currentEffect;
  if (isBeat) {
    r = Math.min(r + 60, 255); g = Math.min(g + 60, 255); b = Math.min(b + 60, 255);
    br = Math.min(br + 40, 255);
  }
  if (vol < 6) {
    br = (Math.sin(now / 400) * 0.5 + 0.5) * 50 + 10;
    effId = 201; // Zen/Breath
  }
  return { r: Math.floor(r), g: Math.floor(g), b: Math.floor(b), br: Math.floor(br), id: effId };
}


function setupAudioAnalysis() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(micStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  karaokeInterval = setInterval(() => {
    analyser.getByteFrequencyData(dataArray);
    
    // Check for pattern switch every 15 seconds
    const now = Date.now();
    if (now - lastPatternSwitch > 15000) {
      currentPattern = (currentPattern + 1) % PATTERN_COUNT;
      lastPatternSwitch = now;
      console.log("Nuovo pattern coreografico:", currentPattern);
    }

    let sum = 0;
    for(let i=0; i<bufferLength; i++) { sum += dataArray[i]; }
    const avgVolume = sum / bufferLength;
    const vocalBar = document.getElementById('vocalBar');
    if (vocalBar) vocalBar.style.width = Math.min(avgVolume * 2, 100) + "%";
    
    processVocalChoreography(dataArray, avgVolume);
  }, 66); // ~15Hz
}

function processVocalChoreography(dataArray, avgVolume) {
  const now = Date.now();
  if (now - lastPumpUpdate < 60) return;
  
  const sampleRate = audioCtx.sampleRate;
  const binSize = sampleRate / analyser.fftSize;
  
  // Auto-Gain Control (AGC)
  if (avgVolume > 5 && avgVolume < 30) dynamicBoost = Math.min(dynamicBoost + 0.05, 3.0);
  else if (avgVolume > 60) dynamicBoost = Math.max(dynamicBoost - 0.1, 1.0);
  
  const boost = 1.8 * dynamicBoost;
  let bass = 0, mids = 0, highs = 0;
  const bassEnd = Math.floor(150 / binSize);
  const midsEnd = Math.floor(2000 / binSize);
  for(let i=0; i<bassEnd; i++) bass = Math.max(bass, dataArray[i] * boost);
  for(let i=bassEnd; i<midsEnd; i++) mids = Math.max(mids, dataArray[i] * boost);
  for(let i=midsEnd; i<dataArray.length; i++) highs = Math.max(highs, dataArray[i] * boost);

  const vol = avgVolume * boost;
  const phase = (now / 1000) * 2.0; 
  
  // Beat Detection
  let isBeat = false;
  if (bass > 180 && now - lastBassPeak > 400) {
    lastBassPeak = now;
    isBeat = true;
  }

  let targets = [0, 0, 0, 0, 0, 0];
  
  // PATTERN ENGINE - 8 Styles
  switch(currentPattern) {
    case 0: // CLASSIC BANDS
      targets[2] = targets[3] = bass > 25 ? 130 + bass * 0.5 : 0;
      targets[1] = targets[4] = mids > 35 ? 125 + mids * 0.6 : 0;
      targets[0] = targets[5] = highs > 20 ? 120 + highs * 0.8 : 0;
      break;
      
    case 1: // WAVE
      for(let i=0; i<6; i++) {
        let wave = Math.sin(phase + i * 0.8) * 0.5 + 0.5;
        targets[i] = (vol > 10) ? (125 + vol * 0.6) * wave : 0;
      }
      break;
      
    case 2: // EXPANDING (Inside out)
      let pulse = Math.abs(Math.sin(phase * 1.5));
      for(let i=0; i<6;i++) {
        let dist = Math.abs(2.5 - i);
        let factor = Math.max(0, 1 - (dist * pulse * 0.4));
        targets[i] =(vol > 15) ? (130 + vol * 0.7) * factor : 0;
      }
      break;
      
    case 3: // ALTERNATING
      let side = Math.sin(phase * 3.0) > 0;
      for(let i=0; i<6; i++) {
        let isOdd = (i % 2 === 0);
        if (isOdd === side) targets[i] = (bass > 35) ? 140 + bass * 0.5 : 0;
        else targets[i] = (mids > 30) ? 110 + mids * 0.4 : 0;
      }
      break;
      
    case 4: // CHASE
      let lead = Math.floor(now / 500) % 6;
      for(let i=0; i<6; i++) {
        targets[i] = (i === lead) ? (vol > 10 ? 190 + vol * 0.6 : 0) : (vol > 25 ? 100 : 0);
      }
      break;

    case 5: // MIRROR PULSE (Sides vs Center)
      let sideState = Math.sin(phase * 2.5) > 0;
      if (sideState) {
        targets[0] = targets[1] = targets[4] = targets[5] = (vol > 12) ? 130 + vol * 0.7 : 0;
      } else {
        targets[2] = targets[3] = (bass > 30) ? 160 + bass * 0.4 : 0;
      }
      break;

    case 6: // V-SHAPE Rise
      for(let i=0; i<6; i++) {
        let vFactor = [1.0, 0.7, 0.4, 0.4, 0.7, 1.0][i];
        targets[i] = (vol > 15) ? (120 + vol * 0.8) * vFactor : 0;
      }
      break;

    case 7: // BASS SLAM (Beat focused)
      if (isBeat) {
        targets = [150, 150, 255, 255, 150, 150];
      } else {
        targets[2] = targets[3] = bass > 40 ? 120 : 0;
        targets[0] = targets[1] = targets[4] = targets[5] = mids > 50 ? 110 : 0;
      }
      break;
  }

  // Global Beat Sync Overlay (Pulsazione extra sui bassi per ogni pattern)
  if (isBeat) {
    targets[2] = Math.max(targets[2], 230);
    targets[3] = Math.max(targets[3], 230);
  }

  // "Breathing" logic for silence
  const breathing = (vol < 5) ? Math.sin(now / 400) * 4 : 0;

  // Enforce PUMP_MIN and Asymmetric EMA
  for(let i=0; i<6; i++) {
    let target = Math.min(targets[i], 255);
    
    if (target > 0) {
      target = Math.max(PUMP_MIN, target + breathing);
    } else if (breathing !== 0) {
      target = PUMP_MIN + breathing;
    }

    // Risposta Asimmetrica: 
    // - Se vol > soglia: EMA fluida per salire (alpha 0.8)
    // - Se vol < soglia: Istantanea per cadere (alpha 1.0)
    let alpha = (target < pumpEMA[i]) ? (vol < 8 ? 1.0 : 0.6) : 0.8;
    
    pumpEMA[i] = pumpEMA[i] * (1 - alpha) + target * alpha;
  }

  // Send to ESP - Protection against network hangs
  const p = pumpEMA.map(v => Math.floor(v));
  if (isFetchingPumps) return;

  if (p.some(v => v > 0) || now - lastPumpUpdate > 1000) {
    isFetchingPumps = true;
    
    // Calcolo LED dinamici
    const led = updateLEDChoreography(avgVolume, isBeat);
    
    // Timeout di sicurezza per sbloccare se la rete fallisce
    const networkTimeout = setTimeout(() => { isFetchingPumps = false; }, 500);

    fetch(`/pumps?p1=${p[0]}&p2=${p[1]}&p3=${p[2]}&p4=${p[3]}&p5=${p[4]}&p6=${p[5]}&karaoke=1&r=${led.r}&g=${led.g}&b=${led.b}&brightness=${led.br}&id=${led.id}`)

      .then(() => { 
        clearTimeout(networkTimeout);
        isFetchingPumps = false; 
        lastPumpUpdate = now;
      })
      .catch(() => { 
        clearTimeout(networkTimeout);
        isFetchingPumps = false; 
      });
  }
}

/* === VOICE SEARCH LOGIC === */
let recognition = null;
let voiceSearchTimer = null;

function startVoiceSearch() {
  if (!('webkitSpeechRecognition' in window)) {
    console.warn("Speech recognition not supported");
    return;
  }
  
  if (!micStream) {
    toggleMicrophone().then(() => {
       if (micStream) initRecognition();
    });
  } else {
    initRecognition();
  }
}

function initRecognition() {
  if (recognition) return;
  
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'it-IT';
  
  recognition.onstart = () => {
    document.getElementById('voiceSearchStatus').style.display = 'block';
  };
  
  recognition.onresult = (event) => {
    const input = document.getElementById('karaokeSearchInput');
    let text = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
    
    console.log("Speech:", text);
    
    if (text === "cancella") {
      input.value = input.value.slice(0, -1);
    } else if (text === "elimina") {
      input.value = "";
    } else {
      input.value += (input.value ? " " : "") + text;
    }
    
    // Auto-search after 2s of silence
    if (voiceSearchTimer) clearTimeout(voiceSearchTimer);
    voiceSearchTimer = setTimeout(() => {
      if (input.value.trim().length > 2) searchKaraoke();
    }, 2000);
  };
  
  recognition.onerror = (err) => console.error("Speech error:", err);
  recognition.onend = () => {
    if (document.activeElement === document.getElementById('karaokeSearchInput')) {
      recognition.start(); // Restart if still focused
    } else {
      document.getElementById('voiceSearchStatus').style.display = 'none';
      recognition = null;
    }
  };
  
  recognition.start();
}

function stopVoiceSearch() {
  if (recognition) {
    recognition.stop();
  }
  if (voiceSearchTimer) clearTimeout(voiceSearchTimer);
  document.getElementById('voiceSearchStatus').style.display = 'none';
}


  /* ===================================================
     ACCESS REQUEST SYSTEM — Logica pagina principale
     (openAccessRequest, submitAccessRequest, ecc.)
     deve essere QUI perché il bottone è in INDEX_HTML
     =================================================== */

  function getDeviceId() {
    let id = localStorage.getItem('fontana_device_id');
    if (!id) {
      id = 'dev-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
      localStorage.setItem('fontana_device_id', id);
    }
    return id;
  }

  function openAccessRequest_deprecated() {
    const modal = document.getElementById('accessRequestModal');
    if (!modal) { console.error('[ACCESS] Modal non trovato!'); return; }

    const input = document.getElementById('accessNameInput');
    const btn   = modal.querySelector('.access-btn');
    if (input) input.value = '';
    if (btn)   { btn.disabled = false; btn.innerHTML = 'INVIA RICHIESTA'; }

    modal.classList.remove('active');
    modal.style.display = 'flex';
    void modal.offsetWidth;
    modal.classList.add('active');

    if (input) setTimeout(function() { input.focus(); }, 350);
  }

  // === GESTIONE ACCESSO (CONSOLIDATED) ===

  function openAccessRequest() {
    const modal = document.getElementById('accessRequestModal');
    if (!modal) return;
    const input = document.getElementById('accessNameInput');
    const btn = modal.querySelector('.access-btn');
    if (input) input.value = '';
    if (btn)   { btn.disabled = false; btn.innerHTML = 'INVIA RICHIESTA'; }

    modal.classList.remove('active');
    modal.style.display = 'flex';
    void modal.offsetWidth;
    modal.classList.add('active');
    if (input) setTimeout(() => input.focus(), 350);
  }

  function closeAccessRequest() {
    const modal = document.getElementById('accessRequestModal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 350);
  }

  function submitAccessRequest() {
    const nameInput = document.getElementById('accessNameInput');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      if (nameInput) { nameInput.style.borderColor = '#ff5252'; setTimeout(() => nameInput.style.borderColor = '', 1500); }
      return;
    }
    const btn = document.querySelector('#accessRequestModal .access-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="access-spinner"></span>Invio...'; }

    const id = getDeviceId();
    fetch(`/request-access?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`)
      .then(r => r.text())
      .then(res => {
        if (res === 'PENDING') {
          localStorage.setItem('access_requested', '1');
          const statusEl = document.getElementById('requestStatusText');
          if (statusEl) statusEl.style.display = 'block';
          closeAccessRequest();
          startAccessPolling();
        } else { throw new Error(res); }
      })
      .catch(err => {
        console.error('[ACCESS] Errore:', err);
        if (btn) { btn.disabled = false; btn.innerHTML = 'INVIA RICHIESTA'; }
      });
  }

  let accessPollingInterval = null;
  function startAccessPolling() {
    if (accessPollingInterval) return;
    accessPollingInterval = setInterval(() => {
      const id = getDeviceId();
      fetch(`/check-access?id=${encodeURIComponent(id)}`)
        .then(r => r.json())
        .then(data => {
          if (data.status === 'approved') {
            clearInterval(accessPollingInterval);
            accessPollingInterval = null;
            localStorage.setItem('access_approved', '1');
            location.reload();
          }
        })
        .catch(err => console.warn('[ACCESS] Polling fallito:', err));
    }, 5000);
  }

  // selectFaceAuth e selectManualAuth mantenuti per compatibilità ma non più usati all'ingresso
  function selectFaceAuth() {
    console.log('[Auth] Face ID disabilitato all\'ingresso - usa il form');
  }

  function selectManualAuth() {
    // Non più necessario - il form è sempre visibile
    console.log('[Auth] Form già visibile');
  }

  // === ADMIN ACCESS FUNCTIONS ===
  function refreshAccessAdmin() {
    fetch('/admin/get-requests').then(r=>r.json()).then(reqs=>{
      const list = document.getElementById('pendingAccessList');
      if (!list) return;
      if (!reqs || reqs.length === 0) list.innerHTML = '<p style="font-size:0.8rem; opacity:0.5; margin:0;">Nessuna richiesta.</p>';
      else list.innerHTML = reqs.map(r=>`<div class="access-list-item"><span>${r.name}</span><div style="display:flex; gap:5px;"><button onclick="approveAccess('${r.id}','user')" style="background:#4caf50; color:white; border:none; padding:5px 8px; border-radius:4px; font-size:0.7rem;">User</button><button onclick="approveAccess('${r.id}','admin')" style="background:#f44336; color:white; border:none; padding:5px 8px; border-radius:4px; font-size:0.7rem;">Admin</button><button onclick="rejectAccess('${r.id}')" style="background:#555; color:white; border:none; padding:5px 8px; border-radius:4px; font-size:0.7rem;">×</button></div></div>`).join('');
    });
    fetch('/admin/get-approved').then(r=>r.json()).then(devs=>{
      const list = document.getElementById('approvedAccessList');
      if (!list || !devs) return;
      list.innerHTML = devs.map(d=>`<div class="access-list-item"><div><strong>${d.name}</strong> <span class="access-badge-${d.role}">${d.role}</span></div><button onclick="revokeAccess('${d.id}')" style="background:#ff5252; color:white; border:none; padding:5px 8px; border-radius:4px; font-size:0.7rem;">Revoca</button></div>`).join('');
    });
  }

  function loadPlaylistData(shuffle = false) {
    const url = shuffle ? '/admin/playlist?shuffle=1' : '/admin/playlist';
    fetch(url)
      .then(r => r.json())
      .then(data => {
          const listEl = document.getElementById('adminPlaylistList');
          if(!listEl) return;
          listEl.innerHTML = '';
          
          const nextShow = SHOW_NAMES[data.nextShowNumber] || ("Show " + data.nextShowNumber);
          listEl.innerHTML += `<div style="padding:8px; background:rgba(0,229,255,0.1); border-left:3px solid #00e5ff; margin-bottom:10px; border-radius:4px;">
              <strong>Prossimo in Canna:</strong> ${nextShow}
          </div>`;
          
          if (data.playlist && data.playlist.length > 0) {
              let html = '<div style="margin-bottom:8px; font-weight:bold; color:#fbc02d;">In Coda:</div>';
              data.playlist.forEach((showId, idx) => {
                  const sName = SHOW_NAMES[showId] || ("Show " + showId);
                  html += `<div style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; gap:10px;">
                      <span style="opacity:0.5; width:20px;">${idx + 1}.</span>
                      <span>${sName}</span>
                  </div>`;
              });
              listEl.innerHTML += html;
          } else {
              listEl.innerHTML += `<p style='opacity:0.5'>Coda in fase di generazione o vuota.</p>`;
          }
      }).catch(e => console.error("Errore playlist:", e));
  }

  function shufflePlaylist() {
      if(confirm("Vuoi rimescolare l'ordine degli show automatici? Il prossimo show cambierà immediatamente.")) {
          loadPlaylistData(true);
          setTimeout(pollAutoSettings, 1000); // sync the main interface
      }
  }
  function approveAccess(id, role) { fetch(`/admin/approve-access?id=${id}&role=${role}`).then(()=>refreshAccessAdmin()); }
  function rejectAccess(id) { fetch(`/admin/reject-access?id=${id}`).then(()=>refreshAccessAdmin()); }
  function revokeAccess(id) { if(confirm('Revocare?')) fetch(`/admin/revoke-access?id=${id}`).then(()=>refreshAccessAdmin()); }

  // === INIZIALIZZAZIONE VISIBILITÀ ===
  // Face ID rimosso dall'ingresso. Tutti vedono il bottone "Richiedi Accesso".
  window.addEventListener('DOMContentLoaded', () => {
    const id = getDeviceId();
    const reqEl  = document.getElementById('requestAccessContainer');
    const subEl  = document.getElementById('welcomeSubtext');

    fetch(`/check-access?id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === 'approved') {
          userRole = data.role || 'user';
          activeUserName = data.name || '';
          const enterCont = document.getElementById('enterContainer');
          if (enterCont) {
            const nameEl = document.getElementById('welcomeUserName');
            const imgEl  = document.getElementById('welcomeUserImg');
            if (nameEl) nameEl.textContent = data.name || 'Utente';
            if (imgEl)  imgEl.src = 'https://raw.githubusercontent.com/loriorl13/fontana-audio/main/logo-loriorl-256.png';
            if (subEl)  subEl.style.display = 'none';
            if (reqEl)  reqEl.style.display = 'none';
            enterCont.style.display = 'flex';
            // Fotocamera e funzioni AI riabilitate
            cameraSystemEnabled = true;
            if (!isCameraSystemInitialized) initGlobalVirtualMouse();
            if (!isFaceAPIInitialized) initFaceAPI();
          }
          const adminSec = document.getElementById('adminSystemSection');
          if (adminSec) adminSec.style.display = (data.role === 'admin') ? '' : 'none';
          if (data.role === 'admin') { refreshAccessAdmin(); setInterval(refreshAccessAdmin, 30000); }
        } else if (data.status === 'pending') {
          // Richiesta già inviata: mostra solo il messaggio di attesa
          if (reqEl) reqEl.style.display = 'block';
          const statusEl = document.getElementById('requestStatusText');
          if (statusEl) statusEl.style.display = 'block';
          const mainBtn = reqEl ? reqEl.querySelector('button') : null;
          if (mainBtn) mainBtn.style.display = 'none';
          startAccessPolling();
        } else {
          // Nuovo utente: mostra bottone Richiedi Accesso
          if (reqEl) reqEl.style.display = 'block';
        }
      })
      .catch(err => {
        console.warn('[ACCESS] Error check-access:', err);
        // In caso di errore rete, mostra comunque il bottone
        if (reqEl) reqEl.style.display = 'block';
      });
  });

  // =========================================================================
  // VOICE CONTROL SYSTEM (WEB SPEECH API)
  // =========================================================================
  
  // Custom CSS styles for voice badge overlays and the floating voice assistant widget
  const VOICE_STYLES = `
    .voice-badge {
      position: absolute;
      top: 6px;
      left: 6px;
      background: rgba(0, 8, 20, 0.85);
      border: 1.5px solid #00f0ff;
      color: #00f0ff;
      font-size: 10px;
      font-weight: 700;
      border-radius: 50%;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 6px rgba(0, 240, 255, 0.4);
      z-index: 100;
      pointer-events: none;
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.2s ease, color 0.2s ease;
    }
    .voice-badge.pulse {
      transform: scale(1.4);
      background: #00f0ff;
      color: #000;
      box-shadow: 0 0 12px #00f0ff;
    }
    .voice-clicked {
      box-shadow: 0 0 25px rgba(0, 240, 255, 0.8) !important;
      border-color: #00f0ff !important;
      transform: scale(0.96) !important;
      transition: all 0.2s ease !important;
    }
    .voice-widget {
      position: relative;
      background: rgba(0, 15, 30, 0.95);
      border: 2px solid rgba(0, 229, 255, 0.4);
      border-radius: 20px;
      padding: 10px 16px;
      display: flex;
      flex-direction: column;
      z-index: 99999;
      box-shadow: 0 8px 32px rgba(0, 240, 255, 0.15);
      max-width: 280px;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      transform: scale(0.8);
      opacity: 0;
      pointer-events: none;
    }
    .voice-widget.visible {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    .voice-widget-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .voice-indicator {
      position: relative;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .voice-circle {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(0, 229, 255, 0.1);
      border: 1.5px solid rgba(0, 229, 255, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #00e5ff;
      transition: all 0.3s ease;
    }
    .voice-ring {
      position: absolute;
      top: -1.5px;
      left: -1.5px;
      right: -1.5px;
      bottom: -1.5px;
      border-radius: 50%;
      border: 1.5px solid #00f0ff;
      opacity: 0;
      transition: all 0.3s ease;
      pointer-events: none;
    }
    .voice-wave {
      display: none;
      align-items: center;
      gap: 3px;
      height: 18px;
      margin-left: 2px;
      position: absolute;
      top: 9px;
      left: 36px;
    }
    .voice-wave span {
      width: 2.5px;
      height: 100%;
      background-color: #ff007f;
      border-radius: 3px;
      animation: voiceBounce 1.2s ease-in-out infinite;
    }
    .voice-wave span:nth-child(1) { animation-delay: 0.1s; }
    .voice-wave span:nth-child(2) { animation-delay: 0.3s; }
    .voice-wave span:nth-child(3) { animation-delay: 0.5s; }
    .voice-wave span:nth-child(4) { animation-delay: 0.2s; }
    .voice-wave span:nth-child(5) { animation-delay: 0.4s; }

    @keyframes voiceBounce {
      0%, 100% { transform: scaleY(0.3); }
      50% { transform: scaleY(1.1); }
    }
    .voice-info {
      display: flex;
      flex-direction: column;
    }
    .voice-status {
      font-size: 0.75rem;
      font-weight: 700;
      color: #fff;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .voice-transcript {
      font-size: 0.7rem;
      color: rgba(0, 229, 255, 0.7);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 180px;
    }

    /* Widget states visual cues */
    .voice-widget.listening .voice-circle {
      background: rgba(0, 229, 255, 0.15);
      border-color: #00f0ff;
      box-shadow: 0 0 12px rgba(0, 240, 255, 0.35);
    }
    .voice-widget.listening .voice-ring {
      opacity: 1;
      animation: voiceRingPulse 1.8s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
    }
    @keyframes voiceRingPulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      100% { transform: scale(1.45); opacity: 0; }
    }
    .voice-widget.processing .voice-circle {
      background: rgba(255, 0, 127, 0.15);
      border-color: #ff007f;
      color: #ff007f;
      box-shadow: 0 0 12px rgba(255, 0, 127, 0.35);
    }
    .voice-widget.processing .voice-ring {
      opacity: 1;
      border-color: #ff007f;
      animation: voiceRingPulse 1.2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
    }
    .voice-widget.processing .voice-wave {
      display: flex;
    }
    .voice-widget.error .voice-circle {
      background: rgba(255, 82, 82, 0.15);
      border-color: #ff5252;
      color: #ff5252;
    }
    .voice-widget.success .voice-circle {
      background: rgba(0, 230, 118, 0.15);
      border-color: #00e676;
      color: #00e676;
      box-shadow: 0 0 15px rgba(0, 230, 118, 0.4);
    }
  `;

  let voiceElements = [];
  let voiceRecognitionInstance = null;
  let voiceControlEnabled = !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)); // Disattivato di default su mobile
  let isProcessingVoiceCommand = false;
  let lastElementCount = -1;
  let isAiPopupOpen = false;
  let isParentMicActive = false;
  let lastMicStartTime = 0;

  // Inietta lo style CSS
  const styleEl = document.createElement('style');
  styleEl.textContent = VOICE_STYLES;
  document.head.appendChild(styleEl);

  // Crea la GUI per il feedback
  function createVoiceWidget() {
    if (document.getElementById('voiceWidget')) return;
    const widget = document.createElement('div');
    widget.id = 'voiceWidget';
    widget.className = 'voice-widget';
    widget.innerHTML = `
      <div class="voice-widget-header">
        <div class="voice-indicator">
          <div class="voice-circle">
            <svg class="mic-svg" viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z" />
            </svg>
            <div class="voice-ring"></div>
          </div>
          <div class="voice-wave">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <div class="voice-info">
          <div class="voice-status">Assistente Vocale</div>
          <div class="voice-transcript">In attesa...</div>
        </div>
      </div>
    `;
    const container = document.getElementById('micWidgetContainer');
    if (container) {
      container.appendChild(widget);
    } else {
      document.body.appendChild(widget);
    }
    setTimeout(() => widget.classList.add('visible'), 100);
  }

  function updateVoiceWidgetStatus(state, text) {
    const widget = document.getElementById('voiceWidget');
    if (!widget) return;
    widget.classList.remove('listening', 'processing', 'error', 'success');
    widget.classList.add(state);
    const transcriptEl = widget.querySelector('.voice-transcript');
    if (transcriptEl) transcriptEl.textContent = text;
    // Aggiorna anche il bottone nell'header
    const btn = document.getElementById('headerMicBtn');
    const icon = document.getElementById('headerMicIcon');
    const label = document.getElementById('headerMicLabel');
    if (btn && icon && label) {
      if (state === 'listening') {
        btn.style.background = 'rgba(0,229,255,0.2)';
        btn.style.border = '1px solid rgba(0,229,255,0.6)';
        btn.style.boxShadow = '0 0 12px rgba(0,229,255,0.4)';
        icon.style.fill = '#00e5ff';
        label.style.color = '#00e5ff';
        label.textContent = 'MIC ON';
      } else if (state === 'processing') {
        btn.style.background = 'rgba(255,152,0,0.2)';
        btn.style.border = '1px solid rgba(255,152,0,0.6)';
        btn.style.boxShadow = '0 0 12px rgba(255,152,0,0.3)';
        icon.style.fill = '#ff9800';
        label.style.color = '#ff9800';
        label.textContent = 'PARLA...';
      } else {
        btn.style.background = 'rgba(255,255,255,0.07)';
        btn.style.border = '1px solid rgba(255,255,255,0.15)';
        btn.style.boxShadow = 'none';
        icon.style.fill = 'rgba(255,255,255,0.5)';
        label.style.color = 'rgba(255,255,255,0.5)';
        label.textContent = 'MIC OFF';
      }
    }
  }

  let voiceAutoOffTimer = null;
  function resetVoiceAutoOffTimer() {
    if (voiceAutoOffTimer) clearTimeout(voiceAutoOffTimer);
    voiceAutoOffTimer = setTimeout(() => {
      if (voiceControlEnabled) {
        voiceControlEnabled = false;
        isParentMicActive = false;
        if (voiceRecognitionInstance) {
          try { voiceRecognitionInstance.stop(); } catch(e) {}
        }
        updateVoiceWidgetStatus('error', 'Mic spento (inattività)');
        setTimeout(() => {
           const widget = document.getElementById('voiceWidget');
           if (widget) widget.classList.remove('visible');
        }, 3000);
      }
    }, 20000); // 20 secondi senza input
  }

  // Funzione header mic button
  window.headerMicActivate = function() {
    if (!window.isSecureContext) {
      alert("⚠️ ATTENZIONE:\nIl browser blocca Microfono e Fotocamera se accedi da IP locale (HTTP).\n\nPer abilitare questo IP nel browser (Chrome/Edge/Safari):\nVai su: chrome://flags/#unsafely-treat-insecure-origin-as-secure\ne aggiungi l'IP della fontana.");
    }
    const widget = document.getElementById('voiceWidget');
    if (widget) widget.classList.remove('collapsed');
    voiceControlEnabled = true;
    resetVoiceAutoOffTimer();
    if (voiceRecognitionInstance) {
      try { voiceRecognitionInstance.stop(); } catch(e) {}
    }
    setTimeout(startParentSpeech, 150);
  };


  // Scansiona e assegna i numeri ai bottoni
  function assignVoiceNumbers() {
    document.querySelectorAll('.voice-badge').forEach(badge => badge.remove());
    voiceElements = [];

    const welcomeEl = document.getElementById('welcome');
    if (welcomeEl && welcomeEl.classList.contains('active')) {
      const enterBtn = document.getElementById('mainEnterBtn');
      if (enterBtn && enterBtn.offsetWidth > 0) {
        voiceElements.push(enterBtn);
        createVoiceBadge(enterBtn, 1);
      }
      const authCards = document.querySelectorAll('.desktop-auth-card');
      authCards.forEach((card) => {
        if (card.offsetWidth > 0) {
          voiceElements.push(card);
          createVoiceBadge(card, voiceElements.length);
        }
      });
      return;
    }

    const panel = document.getElementById('panel');
    if (panel && panel.classList.contains('active')) {
      // Troviamo tutte le show-card visibili
      const cards = Array.from(document.querySelectorAll('#panel .show-card'));
      const visibleCards = cards.filter(card => card.offsetWidth > 0 && card.offsetHeight > 0);
      
      visibleCards.forEach((card, idx) => {
        voiceElements.push(card);
        createVoiceBadge(card, idx + 1);
      });

      // Troviamo il pulsante stop d'emergenza
      const stopBtn = document.getElementById('emergencyStopBtn');
      if (stopBtn && stopBtn.offsetWidth > 0) {
        voiceElements.push(stopBtn);
        createVoiceBadge(stopBtn, voiceElements.length);
      }
    }
  }

  function createVoiceBadge(element, number) {
    const style = window.getComputedStyle(element);
    if (style.position === 'static') {
      element.style.position = 'relative';
    }
    const badge = document.createElement('span');
    badge.className = 'voice-badge';
    badge.textContent = number;
    if (element.id === 'emergencyStopBtn') {
      badge.style.top = '-10px';
      badge.style.left = '-10px';
    }
    element.appendChild(badge);
  }

  // Parser numeri in Italiano
  function parseItalianNumber(text) {
    const numberMap = {
      "zero": 0, "uno": 1, "due": 2, "tre": 3, "quattro": 4, "cinque": 5,
      "sei": 6, "sette": 7, "otto": 8, "nove": 9, "dieci": 10,
      "undici": 11, "dodici": 12, "tredici": 13, "quattordici": 14, "quindici": 15,
      "sedici": 16, "diciassette": 17, "diciotto": 18, "diciannove": 19, "venti": 20,
      "ventuno": 21, "ventidue": 22, "ventitre": 23, "ventiquattro": 24, "venticinque": 25, "ventisei": 26,
      "ventisei": 26, "ventisette": 27, "ventiotto": 28, "ventinove": 29, "trenta": 30,
      "trentuno": 31, "trentadue": 32, "trentatre": 33, "trentaquattro": 34, "trentacinque": 35,
      "trentasei": 36, "trentasette": 37, "trentaotto": 38, "trentanove": 39, "quaranta": 40,
      "quarantuno": 41, "quarantadue": 42, "quarantatre": 43, "quarantaquattro": 44, "quarantacinque": 45,
      "quarantasei": 46, "quarantasette": 47, "quarantaotto": 48, "quarantanove": 49, "cinquanta": 50
    };

    const digitMatch = text.match(/\d+/);
    if (digitMatch) return parseInt(digitMatch[0], 10);

    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (numberMap[word] !== undefined) return numberMap[word];
    }

    const condensed = words.join('');
    if (numberMap[condensed] !== undefined) return numberMap[condensed];
    
    return null;
  }

  // Gestione del click simulato da voce
  function triggerVoiceClick(element, name) {
    element.classList.add('voice-clicked');
    const badge = element.querySelector('.voice-badge');
    if (badge) badge.classList.add('pulse');

    updateVoiceWidgetStatus('success', 'Eseguito: ' + name);

    setTimeout(() => {
      try {
        element.click();
      } catch(e) {
        console.error("[Voice] Click error:", e);
      }
    }, 250);

    setTimeout(() => {
      element.classList.remove('voice-clicked');
      if (badge) badge.classList.remove('pulse');
      updateVoiceWidgetStatus('listening', 'Ascolto...');
      isProcessingVoiceCommand = false;
    }, 1500);
  }

  // Gestione comandi
  let voiceIdeaState = 0; // 0: inactive, 1: waiting for name, 2: waiting for idea
  let voiceIdeaName = "";

  function speakAndListen(text, stopListening = false) {
      if (!('speechSynthesis' in window)) return;
      stopParentSpeech(); // ferma ascolto per non auto-ascoltarsi
      
      let bestVoice = getBestItalianVoice();
      
      let msg = new SpeechSynthesisUtterance(text);
      if (bestVoice) msg.voice = bestVoice;
      msg.lang = 'it-IT';
      msg.volume = typeof window.currentVoiceVolume !== 'undefined' ? window.currentVoiceVolume / 100.0 : 1.0;
      msg.onend = function() {
          if (!stopListening) {
              setTimeout(() => { startParentSpeech(); }, 500);
          } else {
              setTimeout(() => { startParentSpeech(); }, 1500);
          }
      };
      window.speechSynthesis.speak(msg);
  }

  function handleVoiceCommand(transcript) {
    if (isProcessingVoiceCommand) return;
    
    const text = transcript.toLowerCase().trim();
    updateVoiceWidgetStatus('processing', 'Elaborazione: "' + transcript + '"');
    isProcessingVoiceCommand = true;

    // --- LOGICA REGISTRAZIONE VOCALE (INTERCETTAZIONE) ---
    if (voiceRegActive) {
        console.log("VoiceReg command:", text);
        if (text.includes('annulla') || text.includes('esci') || text.includes('ferma')) {
            abortVoiceReg();
        } else if (voiceRegStep === 1 && text.includes('scatta')) {
            processVoiceRegScatta();
        } else if (voiceRegStep === 2) {
            processVoiceRegName(transcript); // Nome con maiuscole
        } else if (voiceRegStep === 3) {
            processVoiceRegShowNumber(text);
        }
        isProcessingVoiceCommand = false;
        return;
    }

    // --- NUOVA LOGICA IDEA SHOW VOCALE ---
    if (voiceIdeaState === 1) {
       voiceIdeaName = transcript.trim();
       voiceIdeaState = 2;
       speakAndListen("Ciao " + voiceIdeaName + ", qual è la tua idea per il nuovo show?");
       isProcessingVoiceCommand = false;
       return;
    } else if (voiceIdeaState === 2) {
       let ideaTesto = transcript.trim();
       voiceIdeaState = 0;
       
       let ideaObj = {
           name: voiceIdeaName + " (Vocale)",
           text: ideaTesto,
           date: new Date().toLocaleDateString('it-IT') + ' ' + new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})
       };
       fetch('/suggest', {
           method: 'POST',
           body: JSON.stringify(ideaObj),
           headers: {'Content-Type': 'application/json'}
       }).catch(e => console.error("Idea voice sync error:", e));
       
       speakAndListen("Idea registrata! La invio subito a Lorenzo. Grazie " + voiceIdeaName + "!", true);
       isProcessingVoiceCommand = false;
       return;
    }

    // --- AVVIO REGISTRAZIONE VOCALE ---
    if (text.includes('registra nuovo utente') || (text.includes('registra') && !text.includes('ferma') && !text.includes('idea'))) {
        startVoiceRegistration();
        isProcessingVoiceCommand = false;
        return;
    }

    if (text.includes("ho un'idea") || text.includes("ho un idea") || text.includes("consiglio") || text.includes("nuovo show") || text.includes("nuova idea") || text.includes("idea") || text.includes("idee") || text.includes("suggeriment")) {
       voiceIdeaState = 1;
       speakAndListen("Ottimo! Come ti chiami?");
       isProcessingVoiceCommand = false;
       return;
    }
    // -------------------------------------

    // Check Song Recommendation Popup
    const card = document.getElementById('songRecommendCard');
    if (card && card.classList.contains('visible')) {
      if (text.includes("sì") || text.includes("si") || text.includes("ok") || text.includes("riproduci") || text.includes("avvia") || text.includes("certo") || text.includes("vai")) {
        console.log("[Voice] Conferma popup rilevata");
        document.getElementById('srcPlayBtn').click();
        setTimeout(() => {
          updateVoiceWidgetStatus('success', 'Avvio show...');
          isProcessingVoiceCommand = false;
        }, 500);
        return;
      }
    }

    // Check for Wake Word to trigger FontanaAI popup
    const WAKE_PATTERNS = [/ehy\s+fontana/i, /ehi\s+fontana/i, /hey\s+fontana/i, /ei\s+fontana/i, /ok\s+fontana/i];const isWake = WAKE_PATTERNS.some(pat => pat.test(text));
    if (isWake && !text.includes("gestione") && !text.includes("impostazioni")) {
      openAiPopup();
      const iframe = document.getElementById('aiPopupIframe');
      if (iframe && iframe.src) {
        iframe.contentWindow.postMessage({
          type: 'fontana_wake_trigger',
          text: text
        }, 'https://ai.fontanabyloriorl.it');
      }
      isProcessingVoiceCommand = false;
      return;
    }

    // 1. Controlla numero
    const num = parseItalianNumber(text);
    if (num !== null && num > 0 && num <= voiceElements.length) {
      const targetEl = voiceElements[num - 1];
      let name = "Pulsante " + num;
      const titleEl = targetEl.querySelector('.card-title') || targetEl.querySelector('h2') || targetEl.querySelector('span');
      if (titleEl) name = titleEl.textContent;
      triggerVoiceClick(targetEl, name);
      return;
    }

    // 1.5. Regolazione Volume Vocale
    if (text.includes("volume") || text.includes("alza") || text.includes("abbassa")) {
       let newVol = -1;
       const matchNum = text.match(/\b(\d+)\b/);
       if (matchNum) {
           newVol = parseInt(matchNum[1], 10);
       } else if (text.includes("massimo") || text.includes("tutto") || text.includes("cento")) {
           newVol = 100;
       } else if (text.includes("metà") || text.includes("mezzo")) {
           newVol = 50;
       } else if (text.includes("minimo") || text.includes("zero") || text.includes("muto") || text.includes("zitto")) {
           newVol = 0;
       }
       
       if (newVol >= 0 && newVol <= 100) {
           if (typeof setGlobalVolume === 'function') setGlobalVolume(newVol);
           updateVoiceWidgetStatus('success', `Volume: ${newVol}%`);
           speakAndListen(`Volume al ${newVol} percento.`);
           return;
       }
    }

    // 2. Comandi speciali
    if (text.includes("stop") || text.includes("emergenza") || text.includes("ferma") || text.includes("blocca")) {
      const stopBtn = document.getElementById('emergencyStopBtn');
      if (stopBtn && stopBtn.offsetWidth > 0) {
        triggerVoiceClick(stopBtn, "STOP EMERGENZA");
        return;
      }
    }

    const welcomeEl = document.getElementById('welcome');
    if (welcomeEl && welcomeEl.classList.contains('active')) {
      if (text.includes("entra") || text.includes("accedi") || text.includes("avvia") || text.includes("continua")) {
        const enterBtn = document.getElementById('mainEnterBtn');
        if (enterBtn && enterBtn.offsetWidth > 0) {
          triggerVoiceClick(enterBtn, "Accesso Regia");
          return;
        }
      }
      if (text.includes("face id") || text.includes("volto") || text.includes("faccia") || text.includes("riconoscimento")) {
        const faceBtn = document.querySelector('.desktop-auth-card[onclick="selectFaceAuth()"]');
        if (faceBtn && faceBtn.offsetWidth > 0) { triggerVoiceClick(faceBtn, "Face ID"); return; }
      }
      if (text.includes("manuale") || text.includes("codice") || text.includes("password")) {
        const manualBtn = document.querySelector('.desktop-auth-card[onclick="selectManualAuth()"]');
        if (manualBtn && manualBtn.offsetWidth > 0) { triggerVoiceClick(manualBtn, "Manuale"); return; }
      }
    }

    // Custom implicit keywords
    const keywords = [
      { words: ['gestione', 'regia', 'impostazioni', 'pannello', 'area privata'], selector: '[onclick="openControlArea()"]', name: 'Gestione Regia' },
      { words: ['notte', 'giorno', 'tema', 'chiaro', 'scuro', 'luce'], selector: '[onclick="toggleTheme()"]', name: 'Cambia Tema' },
      { words: ['gesti', 'mani', 'movimento', 'telecamera'], selector: '[onclick="startGestureExperience()"]', name: 'Modalità Gesti' },
      { words: ['chiudi gesti', 'esci da gesti'], selector: '#closeGestureBtn', name: 'Chiudi Gesti' },
      { words: ['karaoke', 'canta'], selector: '[onclick="toggleKaraokeMode()"]', name: 'Karaoke' }
    ];

    for (let k of keywords) {
      if (k.words.some(w => text.includes(w))) {
        const el = document.querySelector(k.selector);
        if (el && el.offsetWidth > 0) {
          triggerVoiceClick(el, k.name);
          return;
        }
      }
    }

    // 3. Match testuale del titolo dello show e pulsanti
    let bestMatch = null;
    let maxMatchLength = 0;

    voiceElements.forEach((el) => {
      const titleEl = el.querySelector('.card-title') || el.querySelector('h2') || el.querySelector('span');
      const titleText = titleEl ? titleEl.textContent : el.textContent;
      const cleanTitle = titleText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const cleanText = text.replace(/[^a-z0-9\s]/g, '').trim();

      if (cleanTitle.length > 2) {
        if (cleanText.includes(cleanTitle) || cleanTitle.includes(cleanText)) {
          if (cleanTitle.length > maxMatchLength) {
            maxMatchLength = cleanTitle.length;
            bestMatch = { element: el, name: titleText };
          }
        }
      }
    });

    if (bestMatch) {
      triggerVoiceClick(bestMatch.element, bestMatch.name);
      return;
    }

    // Nessun match locale -> NON inviare a FontanaAI, mostra solo errore locale
    console.log("[Voice] Comando locale non riconosciuto:", transcript);
    setTimeout(() => {
      updateVoiceWidgetStatus('listening', 'Comando non riconosciuto');
      isProcessingVoiceCommand = false;
    }, 300);
  }

  // Funzioni sicure di avvio/spegnimento microfono parent
  function startParentSpeech() {
    if (!voiceControlEnabled) return;
    if (isAiPopupOpen && isIframeAiBusy) {
      console.log("[Voice] startParentSpeech: non avvio perché l'AI è in ascolto/parla");
      return;
    }
    if (isParentMicActive) {
      console.log("[Voice] startParentSpeech: microfono già attivo");
      return;
    }
    if (voiceRecognitionInstance) {
      try {
        voiceRecognitionInstance.start();
        isParentMicActive = true;
        lastMicStartTime = Date.now();
        console.log("[Voice] startParentSpeech: avviato con successo");
      } catch (e) {
        console.error("[Voice] startParentSpeech errore:", e);
      }
    }
  }

  function stopParentSpeech() {
    if (voiceRecognitionInstance && isParentMicActive) {
      try {
        voiceRecognitionInstance.stop();
        isParentMicActive = false;
        console.log("[Voice] stopParentSpeech: spento con successo");
      } catch (e) {
        console.error("[Voice] stopParentSpeech errore:", e);
      }
    }
  }

  // Inizializza SpeechRecognition
  function initVoiceControl() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition non supportata in questo browser.");
      createVoiceWidget();
      updateVoiceWidgetStatus('error', 'Browser non supportato');
      return;
    }

    createVoiceWidget();

    const recognition = new SpeechRecognition();
    recognition.lang = 'it-IT';
    recognition.continuous = true;
    recognition.interimResults = true; // Messo a true per reattività fulminea
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("[Voice] SpeechRecognition avviata");
      isParentMicActive = true;
      updateVoiceWidgetStatus('listening', 'Ascolto...');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interimTranscript += event.results[i][0].transcript;
      }
      
      if (typeof resetVoiceAutoOffTimer === 'function') resetVoiceAutoOffTimer();

      const text = (finalTranscript || interimTranscript).toLowerCase().trim();
      if (!text) return;
      
      // Reattività fulminea: se trova keyword importanti esegue subito senza aspettare la pausa
      const fastKeys = ["idea", "idee", "consiglio", "suggerimento", "stop", "emergenza", "ferma", "blocca", "gestione", "regia", "notte", "giorno", "fontana", "volume", "alza", "abbassa"];
      const hasFastKey = fastKeys.some(k => text.includes(k)) || /\b(sì|si|ok|vai|certo)\b/.test(text) || /\b(uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/.test(text) || /\d/.test(text);

      // Durante l'attesa di input vocale per l'idea (nome o testo), vogliamo il testo completo, quindi aspettiamo isFinal
      const isWaitingForIdeaInput = (voiceIdeaState === 1 || voiceIdeaState === 2);

      if (event.results[event.results.length - 1].isFinal || (!isWaitingForIdeaInput && hasFastKey)) {
          if (!isWaitingForIdeaInput && hasFastKey && !event.results[event.results.length - 1].isFinal) {
              recognition.stop();
          }
          console.log("[Voice] Eseguo:", text);
          handleVoiceCommand(text);
      } else {
          updateVoiceWidgetStatus('listening', 'Ascolto: ' + text + '...');
      }
    };

    recognition.onerror = (event) => {
      console.warn("[Voice] Errore riconoscimento:", event.error);
      if (event.error === 'not-allowed') {
        updateVoiceWidgetStatus('error', 'Mic disattivato (not-allowed)');
        voiceControlEnabled = false;
        isParentMicActive = false;
      } else if (event.error === 'no-speech') {
        // Nessun parlato, continua in silenzio
      } else {
        updateVoiceWidgetStatus('error', 'Errore: ' + event.error);
        isParentMicActive = false;
      }
    };

    recognition.onend = () => {
      console.log("[Voice] SpeechRecognition terminata");
      isParentMicActive = false;
      if (voiceControlEnabled && !(isAiPopupOpen && isIframeAiBusy)) {
        let activeDuration = Date.now() - lastMicStartTime;
        let delay = 50;
        if (activeDuration < 2000) {
          delay = 100;
          console.warn("[Voice] Rilevato arresto rapido (" + activeDuration + "ms). Riavvio rapido.");
        }
        setTimeout(() => {
          startParentSpeech();
        }, delay);
      } else if (isAiPopupOpen) {
        updateVoiceWidgetStatus('processing', 'AI attiva - mic locale disattivato');
      } else {
        updateVoiceWidgetStatus('error', 'Controllo vocale spento');
      }
    };

    voiceRecognitionInstance = recognition;
    startParentSpeech();
  }

  // Inizializzazione pulita all'onload completo con un piccolo delay
  if (document.readyState === 'complete') {
    setTimeout(initVoiceControl, 1000);
  } else {
    window.addEventListener('load', () => {
      setTimeout(initVoiceControl, 1000);
    });
  }

  // Gestione visibilità scheda per prevenire conflitti multi-tab/background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log("[Voice] Scheda in background, sospendo il microfono locale");
      stopParentSpeech();
    } else {
      console.log("[Voice] Scheda visibile, ripristino il microfono locale");
      startParentSpeech();
    }
  });

  // Loop di rilevazione cambiamenti per aggiornare i numeri (ogni 2s)
  setInterval(() => {
    const welcomeEl = document.getElementById('welcome');
    const panel = document.getElementById('panel');
    let currentCount = 0;
    
    if (welcomeEl && welcomeEl.classList.contains('active')) {
      currentCount = 1;
    } else if (panel && panel.classList.contains('active')) {
      currentCount = document.querySelectorAll('#panel .show-card').length + 
                     (document.getElementById('emergencyStopBtn') ? 1 : 0);
    }
    
    if (currentCount !== lastElementCount) {
      lastElementCount = currentCount;
      assignVoiceNumbers();
    }
  }, 2000);

  // === COORDINAZIONE CON FONTANAI IN IFRAME ===
  function toggleParentVoiceControl() {
    if (voiceControlEnabled) {
      voiceControlEnabled = false;
      stopParentSpeech();
      updateVoiceWidgetStatus('error', 'Controllo vocale spento');
    } else {
      voiceControlEnabled = true;
      if (voiceRecognitionInstance) {
        startParentSpeech();
      } else {
        initVoiceControl();
      }
    }
  }

  // Listener per comunicazioni bidirezionali dall'iframe FontanaAI
  window.addEventListener('message', (event) => {
    if (event.origin !== 'https://ai.fontanabyloriorl.it') return;
    const d = event.data;
    if (!d) return;

    if (d.type === 'fontana_toggle_mic') {
      toggleParentVoiceControl();
    } else if (d.type === 'fontana_ai_busy') {
      resetAiInactivityTimer();
      isIframeAiBusy = true;
      stopParentSpeech();
    } else if (d.type === 'fontana_ai_idle') {
      resetAiInactivityTimer();
      isIframeAiBusy = false;
      startParentSpeech();
    }
  });

  // Mantiene l'iframe inizialmente scaricato per prevenire conflitti all'avvio
  document.addEventListener('DOMContentLoaded', () => {
    const iframe = document.getElementById('aiPopupIframe');
    const loading = document.getElementById('aiPopupLoading');
    if (iframe) {
      iframe.src = 'about:blank';
      iframeLoaded = false;
      if (loading) loading.style.opacity = '0';
    }
  });



(function() {
  const layouts = {
    default: [
      ['1','2','3','4','5','6','7','8','9','0','-','+'],
      ['Q','W','E','R','T','Y','U','I','O','P','@'],
      ['A','S','D','F','G','H','J','K','L',':'],
      ['⇧','Z','X','C','V','B','N','M', '.', ',', '⌫'],
      ['CHIUDI', 'SPAZIO', 'INVIO']
    ]
  };
  const container = document.getElementById('vkbd-container');
  let activeInput = null;
  let isShift = false;
  
  function initKeyboard() {
    container.innerHTML = '';
    layouts.default.forEach(row => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'vkbd-row';
      row.forEach(key => {
        const keyDiv = document.createElement('div');
        keyDiv.className = 'vkbd-key';
        keyDiv.textContent = key;
        
        if (key === '⌫') keyDiv.classList.add('wide');
        if (key === 'CHIUDI') keyDiv.classList.add('wide', 'close');
        if (key === 'SPAZIO') keyDiv.classList.add('space');
        if (key === 'INVIO') keyDiv.classList.add('wide');
        if (key === '⇧') keyDiv.id = 'vkbd-shift';
        
        const triggerKey = (e) => { e.preventDefault(); handleKey(key); };
        keyDiv.addEventListener('mousedown', triggerKey);
        keyDiv.addEventListener('touchstart', triggerKey, {passive: false});
        rowDiv.appendChild(keyDiv);
      });
      container.appendChild(rowDiv);
    });
  }
  
  function handleKey(key) {
    if (!activeInput) return;
    let val = activeInput.value;
    let start = activeInput.selectionStart !== null ? activeInput.selectionStart : val.length;
    let end = activeInput.selectionEnd !== null ? activeInput.selectionEnd : val.length;
    
    if (key === 'CHIUDI') {
      container.classList.remove('active');
      activeInput.blur();
      activeInput = null;
      return;
    } else if (key === '⌫') {
      if (start === end && start > 0) {
        val = val.substring(0, start - 1) + val.substring(end);
        start--;
      } else {
        val = val.substring(0, start) + val.substring(end);
      }
    } else if (key === 'SPAZIO') {
      val = val.substring(0, start) + ' ' + val.substring(end);
      start++;
    } else if (key === 'INVIO') {
      container.classList.remove('active');
      activeInput.blur();
      activeInput.dispatchEvent(new KeyboardEvent('keydown', {'key': 'Enter'}));
      return;
    } else if (key === '⇧') {
      isShift = !isShift;
      const sh = document.getElementById('vkbd-shift');
      if(sh) { sh.style.background = isShift ? '#00e5ff' : ''; sh.style.color = isShift ? '#000' : ''; }
      return;
    } else {
      let char = isShift ? key.toUpperCase() : key.toLowerCase();
      val = val.substring(0, start) + char + val.substring(end);
      start++;
      if (isShift) {
        isShift = false;
        const sh = document.getElementById('vkbd-shift');
        if(sh) { sh.style.background = ''; sh.style.color = ''; }
      }
    }
    activeInput.value = val;
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    try { activeInput.setSelectionRange(start, start); } catch(e) {}
  }
  
  document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' && ['text', 'password', 'number', 'email', 'time', 'search'].includes(e.target.type)) {
      activeInput = e.target;
      container.classList.add('active');
    }
  });
  
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target) && e.target.tagName !== 'INPUT') {
      container.classList.remove('active');
      if (activeInput) activeInput.blur();
      activeInput = null;
    }
  });
  
  initKeyboard();
  
  // Hide virtual keyboard if physical keyboard is used
  document.addEventListener('keydown', (e) => {
    if (container.classList.contains('active')) {
      // Ignore modifier keys
      if (!['Shift', 'Alt', 'Control', 'Meta', 'Tab'].includes(e.key)) {
        container.classList.remove('active');
      }
    }
  });
})();





// === GESTIONE UNIFICATA DELLE SCHERMATE ED AUTO-LOGIN ===

function triggerWaterSurge(callback) {
  const transitionEl = document.getElementById('waterTransition');
  if (transitionEl) {
    transitionEl.classList.add('active');
    setTimeout(() => {
      if (typeof callback === 'function') callback();
      setTimeout(() => {
        transitionEl.classList.remove('active');
      }, 400);
    }, 900);
  } else {
    if (typeof callback === 'function') callback();
  }
}

function showScreen(screen) {
  const welcome = document.getElementById('welcome');
  const panel = document.getElementById('panel');
  if (screen === 'REGIA') {
    if (welcome) {
      welcome.classList.add('hidden-screen');
    }
    if (panel) {
      panel.classList.add('active-screen');
      panel.classList.add('active'); // Mantiene compatibilità col CSS originale
      
      // Ritardo breve per animare l'entrata degli show (come nel vecchio enterSite)
      setTimeout(() => {
        panel.classList.add('panel-visible');
        const cards = document.querySelectorAll('.show-card');
        cards.forEach((card, index) => {
          card.style.transitionDelay = (index * 45) + 'ms';
        });
      }, 50);
      
      // Trigger effetto di benvenuto LED ESP32
      try { fetch('/welcome-effect').catch(()=>{}); } catch(e) {}
    }
  } else {
    if (panel) {
      panel.classList.remove('active-screen');
      panel.classList.remove('active');
      panel.classList.remove('panel-visible');
    }
    if (welcome) {
      welcome.classList.remove('hidden-screen');
    }
  }
}

function toggleAdminPanel() {
  const p = document.getElementById('adminLoginPanel');
  const main = document.getElementById('mainRegistrationCard');
  const toggleTxt = document.getElementById('adminToggleText');
  
  if (p && main) {
    if (p.style.display === 'none' || !p.style.display) {
      p.style.display = 'flex';
      main.style.display = 'none';
      if (toggleTxt) toggleTxt.innerHTML = '● ● ● Richiedi Accesso';
    } else {
      p.style.display = 'none';
      main.style.display = 'block';
      if (toggleTxt) toggleTxt.innerHTML = '● ● ● Accesso Admin';
    }
  } else if (p) {
    p.style.display = (p.style.display === 'none' || !p.style.display) ? 'flex' : 'none';
  }
}

function adminLogin() {
  const u = (document.getElementById('adminUser').value || '').trim();
  const p = (document.getElementById('adminPass').value || '').trim();
  const errEl = document.getElementById('adminLoginError');
  if ((u === 'admin' || u === 'loriorl') && (p === 'lori123' || p === 'admin')) {
    if (errEl) errEl.style.display = 'none';
    window.userRole = 'admin';
    window.activeUserName = (u === 'loriorl') ? 'Lorenzo' : 'Admin';
    try {
      localStorage.setItem('fontana_user_session', JSON.stringify({
        approved: true,
        name: window.activeUserName,
        role: window.userRole,
        timestamp: Date.now()
      }));
    } catch(e) {}
    
    // Esegui animazione zampilli ed entra IN REGIA
    triggerWaterSurge(() => {
      showScreen('REGIA');
    });
  } else {
    if (errEl) { errEl.style.display = 'block'; setTimeout(() => errEl.style.display='none', 3000); }
    const passEl = document.getElementById('adminPass');
    if (passEl) { passEl.value = ''; passEl.focus(); }
  }
}

function submitMainAccessRequest() {
  const input = document.getElementById('mainAccessNameInput');
  const statusEl = document.getElementById('mainRequestStatus');
  const name = input ? input.value.trim() : '';
  if (!name) {
    if (input) { input.style.borderColor = '#ff5252'; setTimeout(() => input.style.borderColor = '', 1500); }
    return;
  }
  
  let devId = localStorage.getItem('fontana_device_id');
  if (!devId) {
    devId = 'dev-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
    localStorage.setItem('fontana_device_id', devId);
  }
  localStorage.setItem('device_id', devId);
  
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.innerHTML = '⏳ Invio richiesta al server in corso…';
  }
  
  fetch('/request-access?id=' + encodeURIComponent(devId) + '&name=' + encodeURIComponent(name))
    .then(r => r.text())
    .then(res => {
      if (statusEl) {
        statusEl.innerHTML = '✅ <strong>Richiesta inviata a Lorenzo!</strong><br><span style="font-size:0.8rem; opacity:0.85;">Attendi che il tuo dispositivo venga abilitato.</span>';
      }
      try {
        localStorage.setItem('fontana_user_session', JSON.stringify({
          approved: false,
          pending: true,
          name: name,
          deviceId: devId
        }));
      } catch(e) {}
    })
    .catch(e => {
      if (statusEl) {
        statusEl.innerHTML = '✅ <strong>Richiesta inviata!</strong><br><span style="font-size:0.8rem; opacity:0.85;">Attendi abilitazione.</span>';
      }
    });
}

function logoutUserSession() {
  try {
    localStorage.removeItem('fontana_user_session');
    localStorage.removeItem('access_approved');
  } catch(e) {}
  triggerWaterSurge(() => {
    showScreen('WELCOME');
    // Ripristina la visibilità del form di login che era stato nascosto in auto-login
    const welcomeScreenForm = document.getElementById('welcomeScreen');
    if (welcomeScreenForm) welcomeScreenForm.style.display = 'flex';
    
    const statusEl = document.getElementById('mainRequestStatus');
    if (statusEl) statusEl.style.display = 'none';
  });
}

// INIZIALIZZAZIONE ALL'APERTURA DELLA PAGINA
window.addEventListener('DOMContentLoaded', () => {
  let isApproved = false;
  let savedName = 'Admin';
  let savedRole = 'admin';
  let isPending = false;

  let savedDeviceId = '';

  try {
    const sessionStr = localStorage.getItem('fontana_user_session');
    if (sessionStr) {
      const sess = JSON.parse(sessionStr);
      if (sess && sess.approved) {
        isApproved = true;
        savedName = sess.name || 'Admin';
        savedRole = sess.role || 'admin';
      } else if (sess && sess.pending) {
        isPending = true;
        savedName = sess.name;
        savedDeviceId = sess.deviceId || '';
      }
    }
  } catch(e) {}

  if (isApproved) {
    window.userRole = savedRole;
    window.activeUserName = savedName;
    
    // Hide the login form immediately so we just see the blue background
    const welcomeScreenForm = document.getElementById('welcomeScreen');
    if (welcomeScreenForm) welcomeScreenForm.style.display = 'none';
    
    // Wait a brief moment to allow the browser to paint, then trigger the animation
    setTimeout(() => {
      triggerWaterSurge(() => {
        showScreen('REGIA');
      });
    }, 100);
  } else {
    showScreen('WELCOME');
    if (isPending) {
      const statusEl = document.getElementById('mainRequestStatus');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = '⏳ <strong>Richiesta in attesa per (' + savedName + ')</strong><br><span style="font-size:0.8rem; opacity:0.85;">In attesa di abilitazione da Lorenzo.</span>';
      }
      
      // Polling: controlla ogni 3 secondi se Lorenzo ha approvato la richiesta
      if (savedDeviceId) {
        const checkInterval = setInterval(() => {
          fetch(`/check-access?id=${encodeURIComponent(savedDeviceId)}`)
            .then(r => r.json())
            .then(data => {
              if (data.status === 'approved') {
                clearInterval(checkInterval);
                try {
                  const sessStr = localStorage.getItem('fontana_user_session');
                  let sess = sessStr ? JSON.parse(sessStr) : {};
                  sess.approved = true;
                  sess.pending = false;
                  sess.role = data.role || 'user';
                  localStorage.setItem('fontana_user_session', JSON.stringify(sess));
                } catch(e) {}
                
                // Ricarica la pagina per far partire l'animazione di entrata!
                window.location.reload();
              }
            }).catch(e => {
              // Ignora errori di rete temporanei
            });
        }, 3000);
      }
    }
  }
});

