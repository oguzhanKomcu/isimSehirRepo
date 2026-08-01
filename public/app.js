/* ==========================================================================
   İSİM ŞEHİR MULTIPLAYER - İSTEMCİ (CLIENT) MANTIĞI
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Socket.io Bağlantısı
  const socket = io();

  // Web Audio API Synth Ses Üreteci (Kütüphanesiz Hafif Sesler)
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.muted = false;
    }

    init() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
    }

    playTick() {
      if (this.muted) return;
      this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    }

    playStop() {
      if (this.muted) return;
      this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.4);
    }

    playVictory() {
      if (this.muted) return;
      this.init();
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + i * 0.12 + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + i * 0.12);
        osc.stop(this.ctx.currentTime + i * 0.12 + 0.2);
      });
    }
  }

  const sounds = new SoundFX();

  // Durum Değişkenleri
  let myPlayerId = '';
  let currentRoomId = '';
  let isHost = false;
  let selectedAvatar = '😎';
  let activeCategories = ['İsim', 'Şehir', 'Ülke', 'Hayvan', 'Bitki', 'Eşya', 'Ünlü'];
  let currentVotingData = null;
  let myVotes = {}; // key: `${playerId}_${category}` -> boolean

  // DOM Elemanları
  const screens = {
    login: document.getElementById('login-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen'),
    voting: document.getElementById('voting-screen'),
    scoreboard: document.getElementById('scoreboard-screen'),
    gameover: document.getElementById('gameover-screen')
  };

  const toastContainer = document.getElementById('toast-container');
  const roomCodeBadge = document.getElementById('room-code-badge');
  const headerRoomId = document.getElementById('header-room-id');
  const copyLinkBtn = document.getElementById('copy-link-btn');
  const audioToggleBtn = document.getElementById('audio-toggle-btn');

  // Ekran Değiştirme Fonksiyonu
  function showScreen(screenName) {
    Object.keys(screens).forEach(key => {
      screens[key].classList.remove('active');
    });
    if (screens[screenName]) {
      screens[screenName].classList.add('active');
    }
  }

  // Toast Bildirim Gösterici
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'error' ? '⚠️' : 'ℹ️'}</span> ${message}`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }

  // URL'den Oda Kodu Okuma (Davet Bağlantısı)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    document.getElementById('room-code-input').value = roomParam.toUpperCase();
    document.getElementById('tab-join-btn').click();
    showToast(`"${roomParam.toUpperCase()}" odasına katılmak için kullanıcı adınızı yazın.`, 'info');
  }

  // Avatar Seçimi
  const avatarOptions = document.querySelectorAll('.avatar-option');
  avatarOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      avatarOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedAvatar = opt.dataset.avatar;
    });
  });

  // Tab Geçişleri (Yeni Oda / Katıl)
  const tabCreateBtn = document.getElementById('tab-create-btn');
  const tabJoinBtn = document.getElementById('tab-join-btn');
  const panelCreate = document.getElementById('panel-create');
  const panelJoin = document.getElementById('panel-join');

  tabCreateBtn.addEventListener('click', () => {
    tabCreateBtn.classList.add('active');
    tabJoinBtn.classList.remove('active');
    panelCreate.classList.add('active');
    panelJoin.classList.remove('active');
  });

  tabJoinBtn.addEventListener('click', () => {
    tabJoinBtn.classList.add('active');
    tabCreateBtn.classList.remove('active');
    panelJoin.classList.add('active');
    panelCreate.classList.remove('active');
  });

  // Ses Butonu
  audioToggleBtn.addEventListener('click', () => {
    sounds.muted = !sounds.muted;
    audioToggleBtn.textContent = sounds.muted ? '🔇' : '🔊';
  });

  // Bağlantı Kopyalama
  copyLinkBtn.addEventListener('click', () => {
    const shareUrl = `${window.location.origin}?room=${currentRoomId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Oda davet bağlantısı kopyalandı! 📋', 'success');
    }).catch(() => {
      showToast(`Oda Kodu: ${currentRoomId}`, 'info');
    });
  });

  // 1. ODA OLUŞTURMA
  document.getElementById('create-room-btn').addEventListener('click', () => {
    const username = document.getElementById('username-input').value.trim();
    if (!username) {
      return showToast('Lütfen bir kullanıcı adı girin!', 'error');
    }

    const roundTime = parseInt(document.getElementById('round-time-select').value, 10);
    const totalRounds = parseInt(document.getElementById('total-rounds-select').value, 10);

    socket.emit('create_room', {
      username,
      avatar: selectedAvatar,
      settings: {
        roundTime,
        totalRounds,
        categories: activeCategories
      }
    });
  });

  // 2. ODAYA KATILMA
  document.getElementById('join-room-btn').addEventListener('click', () => {
    const username = document.getElementById('username-input').value.trim();
    const roomCode = document.getElementById('room-code-input').value.trim();

    if (!username) {
      return showToast('Lütfen bir kullanıcı adı girin!', 'error');
    }
    if (!roomCode) {
      return showToast('Lütfen katılmak istediğiniz oda kodunu girin!', 'error');
    }

    socket.emit('join_room', {
      roomId: roomCode,
      username,
      avatar: selectedAvatar
    });
  });

  // SOKET OLAYLARI (SOCKET EVENTS)

  // Katılım Hası (Benzersiz Kullanıcı Adı veya Oda Bulunamadı Hatası)
  socket.on('join_error', (errorMsg) => {
    showToast(errorMsg, 'error');
  });

  // Oda Oluşturuldu
  socket.on('room_created', (data) => {
    myPlayerId = socket.id;
    currentRoomId = data.roomId;
    isHost = true;
    updateLobbyView(data);
    showScreen('lobby');
    showToast(`"${currentRoomId}" odası oluşturuldu!`, 'success');
  });

  // Odaya Başarıyla Katılındı
  socket.on('room_joined', (data) => {
    myPlayerId = socket.id;
    currentRoomId = data.roomId;
    isHost = data.player.isHost;
    updateLobbyView(data);
    showScreen('lobby');
    showToast(`"${currentRoomId}" odasına katıldınız.`, 'success');
  });

  // Başka Bir Oyuncu Katıldı
  socket.on('player_joined', (data) => {
    renderPlayersGrid(data.players);
    showToast(`${data.player.avatar} ${data.player.username} odaya katıldı.`, 'info');
  });

  // Bir Oyuncu Ayrıldı
  socket.on('player_left', (data) => {
    renderPlayersGrid(data.players);
    if (data.hostId === myPlayerId) {
      isHost = true;
      document.getElementById('host-controls').classList.remove('hidden');
      document.getElementById('non-host-waiting').classList.add('hidden');
    }
    showToast('Bir oyuncu odadan ayrıldı.', 'info');
  });

  // Lobi Görünümünü Güncelleme
  function updateLobbyView(data) {
    headerRoomId.textContent = data.roomId;
    roomCodeBadge.classList.remove('hidden');
    document.getElementById('lobby-room-code-display').textContent = `Oda: ${data.roomId}`;

    renderPlayersGrid(data.players);

    const hostControls = document.getElementById('host-controls');
    const waitingBox = document.getElementById('non-host-waiting');

    if (isHost) {
      hostControls.classList.remove('hidden');
      waitingBox.classList.add('hidden');
    } else {
      hostControls.classList.add('hidden');
      waitingBox.classList.remove('hidden');
    }
  }

  function renderPlayersGrid(players) {
    document.getElementById('player-count').textContent = players.length;
    const grid = document.getElementById('lobby-players-grid');
    grid.innerHTML = '';

    players.forEach(p => {
      const card = document.createElement('div');
      card.className = 'player-card';
      card.innerHTML = `
        ${p.isHost ? '<span class="host-badge" title="Oda Kurucusu">👑</span>' : ''}
        <div class="player-avatar-large">${p.avatar}</div>
        <div class="player-name">${escapeHtml(p.username)}</div>
      `;
      grid.appendChild(card);
    });
  }

  // Kategori Çipleri Seçimi (Sadece Host)
  const categoryChips = document.querySelectorAll('.chip');
  categoryChips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (!isHost) return;
      chip.classList.toggle('active');

      activeCategories = Array.from(document.querySelectorAll('.chip.active'))
        .map(c => c.dataset.cat);

      socket.emit('update_settings', { categories: activeCategories });
    });
  });

  // Oyunu Başlat (Host)
  document.getElementById('start-game-btn').addEventListener('click', () => {
    if (!isHost) return;
    socket.emit('start_game');
  });

  // TUR BAŞLADI
  socket.on('round_started', (data) => {
    showScreen('game');
    document.getElementById('active-letter').textContent = data.letter;
    document.getElementById('round-indicator').textContent = `Tur ${data.round} / ${data.totalRounds}`;
    document.getElementById('stop-banner').classList.add('hidden');
    document.getElementById('stop-game-btn').disabled = false;

    // Kategori İnputlarını Oluştur
    const container = document.getElementById('categories-inputs-container');
    container.innerHTML = '';

    data.categories.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'category-input-card';
      card.innerHTML = `
        <label for="cat-input-${cat}">${cat}:</label>
        <input type="text" id="cat-input-${cat}" data-cat="${cat}" placeholder="${data.letter} ile başlayan..." autocomplete="off">
      `;
      container.appendChild(card);
    });

    // İlk inputa odaklan
    const firstInput = container.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 300);

    // Zamanlayıcıyı Ayarla
    updateTimer(data.roundTime, data.roundTime);
  });

  // Zamanlayıcı Güncelleme
  socket.on('timer_tick', (timeLeft) => {
    const totalTime = parseInt(document.getElementById('round-time-select').value, 10) || 60;
    updateTimer(timeLeft, totalTime);
    if (timeLeft <= 5) sounds.playTick();
  });

  function updateTimer(timeLeft, totalTime) {
    document.getElementById('timer-seconds').textContent = timeLeft;
    const progressCircle = document.getElementById('timer-progress');
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (timeLeft / totalTime) * circumference;

    progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    progressCircle.style.strokeDashoffset = offset;

    if (timeLeft <= 10) {
      progressCircle.style.stroke = '#ef4444';
    } else {
      progressCircle.style.stroke = '#10b981';
    }
  }

  // STOP BUTONUNA BASILDI
  document.getElementById('stop-game-btn').addEventListener('click', () => {
    document.getElementById('stop-game-btn').disabled = true;
    sounds.playStop();
    socket.emit('trigger_stop');
  });

  socket.on('stop_triggered', (data) => {
    sounds.playStop();
    const banner = document.getElementById('stop-banner');
    document.getElementById('stop-player-name').textContent = data.stoppedBy;
    document.getElementById('stop-countdown-sec').textContent = data.countdown;
    banner.classList.remove('hidden');
  });

  socket.on('stop_countdown_tick', (sec) => {
    document.getElementById('stop-countdown-sec').textContent = sec;
    sounds.playTick();
  });

  // CEVAPLARI GÖNDER
  socket.on('force_submit_answers', () => {
    sendMyAnswers();
  });

  function sendMyAnswers() {
    const inputs = document.querySelectorAll('#categories-inputs-container input');
    const answers = {};
    inputs.forEach(input => {
      answers[input.dataset.cat] = input.value.trim();
    });
    socket.emit('submit_answers', answers);
  }

  // OYLAMA FAZI BAŞLADI
  socket.on('start_voting', (data) => {
    showScreen('voting');
    currentVotingData = data.votingData;
    myVotes = {};

    renderVotingTabsAndCards(data.votingData);

    const finishBtn = document.getElementById('finish-voting-btn');
    const waitingMsg = document.getElementById('voting-waiting-msg');

    if (isHost) {
      finishBtn.classList.remove('hidden');
      waitingMsg.classList.add('hidden');
    } else {
      finishBtn.classList.add('hidden');
      waitingMsg.classList.remove('hidden');
    }
  });

  function renderVotingTabsAndCards(votingData) {
    const tabsContainer = document.getElementById('voting-categories-tabs');
    const cardsContainer = document.getElementById('voting-cards-container');
    tabsContainer.innerHTML = '';
    cardsContainer.innerHTML = '';

    const categories = Object.keys(votingData);
    if (categories.length === 0) return;

    categories.forEach((cat, idx) => {
      const tab = document.createElement('div');
      tab.className = `voting-tab ${idx === 0 ? 'active' : ''}`;
      tab.textContent = cat;
      tab.addEventListener('click', () => {
        document.querySelectorAll('.voting-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        showVotingCategoryCards(cat, votingData[cat]);
      });
      tabsContainer.appendChild(tab);
    });

    // Varsayılan İlk Kategoriyi Göster
    showVotingCategoryCards(categories[0], votingData[categories[0]]);
  }

  function showVotingCategoryCards(category, items) {
    const cardsContainer = document.getElementById('voting-cards-container');
    cardsContainer.innerHTML = '';

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vote-card';
      const key = `${item.playerId}_${category}`;

      card.innerHTML = `
        <div class="vote-player-info">
          <span>${item.avatar}</span>
          <strong>${escapeHtml(item.username)}:</strong>
          <span class="vote-word">${item.word ? escapeHtml(item.word) : '<i>(Boş)</i>'}</span>
        </div>

        ${item.word ? `
          <div class="vote-buttons">
            <button class="vote-btn approve ${myVotes[key] === true ? 'selected' : ''}" data-key="${key}">
              👍 Doğru
            </button>
            <button class="vote-btn reject ${myVotes[key] === false ? 'selected' : ''}" data-key="${key}">
              👎 Yanlış
            </button>
          </div>
        ` : '<span class="hint-text">0 Puan</span>'}
      `;

      cardsContainer.appendChild(card);
    });

    // Oylama Buton Olayları
    cardsContainer.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const isApprove = btn.classList.contains('approve');

        myVotes[key] = isApprove;
        socket.emit('submit_votes', myVotes);

        // UI Güncelleme
        const parent = btn.parentElement;
        parent.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  // Oylamayı Tamamla (Host)
  document.getElementById('finish-voting-btn').addEventListener('click', () => {
    if (!isHost) return;
    socket.emit('finish_voting');
  });

  // TUR SONUÇLARI
  socket.on('round_results', (data) => {
    showScreen('scoreboard');
    document.getElementById('result-letter').textContent = data.letter;
    document.getElementById('result-round-text').textContent = `Tur ${data.round} / ${data.totalRounds} Tamamlandı!`;

    // Liderlik Tablosunu Oluştur
    const listContainer = document.getElementById('leaderboard-list');
    listContainer.innerHTML = '';

    data.leaderboard.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = `leaderboard-item ${idx === 0 ? 'rank-1' : ''}`;
      item.innerHTML = `
        <div class="player-score-info">
          <strong>#${idx + 1}</strong> ${p.avatar} ${escapeHtml(p.username)}
        </div>
        <div class="player-score-badge">+${data.roundScores[p.id]?.totalRoundScore || 0} Pn (Toplam: ${p.totalScore})</div>
      `;
      listContainer.appendChild(item);
    });

    // Host Butonları
    const nextBtn = document.getElementById('next-round-btn');
    const waitingText = document.getElementById('waiting-host-next');

    if (isHost) {
      nextBtn.classList.remove('hidden');
      waitingText.classList.add('hidden');
    } else {
      nextBtn.classList.add('hidden');
      waitingText.classList.remove('hidden');
    }
  });

  // Sonraki Tur (Host)
  document.getElementById('next-round-btn').addEventListener('click', () => {
    if (!isHost) return;
    socket.emit('next_round');
  });

  // OYUN BİTTİ (ŞAMPİYONLUK PODYUMU)
  socket.on('game_over', (data) => {
    showScreen('gameover');
    sounds.playVictory();

    // Konfeti Efekti
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });
    }

    // Podyum 1, 2, 3
    const p1 = data.players[0];
    const p2 = data.players[1];
    const p3 = data.players[2];

    if (p1) {
      document.getElementById('podium-avatar-1').textContent = p1.avatar;
      document.getElementById('podium-name-1').textContent = p1.username;
      document.getElementById('podium-score-1').textContent = `${p1.totalScore} Puan`;
    }
    if (p2) {
      document.getElementById('podium-avatar-2').textContent = p2.avatar;
      document.getElementById('podium-name-2').textContent = p2.username;
      document.getElementById('podium-score-2').textContent = `${p2.totalScore} Puan`;
    }
    if (p3) {
      document.getElementById('podium-avatar-3').textContent = p3.avatar;
      document.getElementById('podium-name-3').textContent = p3.username;
      document.getElementById('podium-score-3').textContent = `${p3.totalScore} Puan`;
    }

    const restartBtn = document.getElementById('restart-game-btn');
    if (isHost) {
      restartBtn.classList.remove('hidden');
    } else {
      restartBtn.classList.add('hidden');
    }
  });

  // Yeniden Oyna (Host)
  document.getElementById('restart-game-btn').addEventListener('click', () => {
    if (!isHost) return;
    socket.emit('restart_game');
  });

  socket.on('game_restarted', (data) => {
    showScreen('lobby');
    renderPlayersGrid(data.players);
  });

  // Güvenli HTML Temizliği
  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[m]);
  }
});
