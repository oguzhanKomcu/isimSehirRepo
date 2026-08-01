const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Statik dosyaları sun
app.use(express.static(path.join(__dirname, 'public')));

// Tüm HTTP istekleri için index.html gönder (SPA Fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Türkçe Sözlük Verisi Yükleme
let dictionary = {
  names: [],
  cities: [],
  countries: [],
  animals: [],
  plants: [],
  items: [],
  professions: []
};

try {
  const dictPath = path.join(__dirname, 'public', 'dictionary.json');
  if (fs.existsSync(dictPath)) {
    dictionary = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    console.log('Sözlük başarıyla yüklendi.');
  }
} catch (err) {
  console.error('Sözlük yüklenirken hata:', err.message);
}

// Türkçe Harf Listesi
const TURKISH_LETTERS = ['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'H', 'I', 'İ', 'J', 'K', 'L', 'M', 'N', 'O', 'Ö', 'P', 'R', 'S', 'Ş', 'T', 'U', 'Ü', 'V', 'Y', 'Z'];

// Aktif Odalar Deposu
// roomId => { id, hostId, players: Map(socketId => player), settings, state, currentRound, letter, usedLetters, answers, timer, votes }
const rooms = new Map();

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(result) ? generateRoomId() : result;
}

// Kelime Temizleme ve Türkçe Büyük Harfe Dönüştürme
function formatWord(word) {
  if (!word) return '';
  return word.trim().toLocaleUpperCase('tr-TR');
}

// Kelimenin Türkçe harf ile başlayıp başlamadığını kontrol et
function startsWithLetter(word, letter) {
  const formatted = formatWord(word);
  const formattedLetter = letter.toLocaleUpperCase('tr-TR');
  return formatted.startsWith(formattedLetter);
}

// Otomatik Sözlük Kontrolü (Öneri Mahiyetinde)
function checkDictionary(category, word) {
  if (!word) return false;
  const formatted = formatWord(word);
  const catKey = category.toLowerCase();
  
  if (catKey.includes('şehir') || catKey.includes('sehir')) {
    return dictionary.cities.some(item => formatWord(item) === formatted);
  }
  if (catKey.includes('ülke') || catKey.includes('ulke')) {
    return dictionary.countries.some(item => formatWord(item) === formatted);
  }
  if (catKey.includes('isim') || catKey.includes('ad')) {
    return dictionary.names.some(item => formatWord(item) === formatted);
  }
  if (catKey.includes('hayvan')) {
    return dictionary.animals.some(item => formatWord(item) === formatted);
  }
  if (catKey.includes('bitki') || catKey.includes('Meyve') || catKey.includes('Sebze')) {
    return dictionary.plants.some(item => formatWord(item) === formatted);
  }
  if (catKey.includes('eşya') || catKey.includes('esya')) {
    return dictionary.items.some(item => formatWord(item) === formatted);
  }
  if (catKey.includes('ünlü') || catKey.includes('unlu') || catKey.includes('sanatçı')) {
    return (dictionary.celebrities || []).some(item => formatWord(item) === formatted);
  }
  // Eğer kategoride özel veri yoksa harf kontrolü doğruysa varsayılan geçerli kabul et
  return true;
}

io.on('connection', (socket) => {
  console.log(`[Yeni Bağlantı] Socket ID: ${socket.id}`);

  // ODA OLUŞTURMA
  socket.on('create_room', ({ username, avatar, settings }) => {
    const cleanUsername = username ? username.trim() : '';
    if (!cleanUsername) {
      return socket.emit('join_error', 'Lütfen geçerli bir kullanıcı adı girin.');
    }

    const roomId = generateRoomId();
    const defaultSettings = {
      roundTime: 60,
      totalRounds: 5,
      categories: ['İsim', 'Şehir', 'Ülke', 'Hayvan', 'Bitki', 'Eşya', 'Ünlü'],
      autoStop: true,
      stopCountdown: 5
    };

    const roomSettings = { ...defaultSettings, ...settings };

    const player = {
      id: socket.id,
      username: cleanUsername,
      avatar: avatar || '😎',
      isHost: true,
      isReady: true,
      totalScore: 0,
      roundScores: [],
      connected: true
    };

    const room = {
      id: roomId,
      hostId: socket.id,
      players: new Map([[socket.id, player]]),
      settings: roomSettings,
      state: 'LOBBY', // LOBBY, PLAYING, STOPPED, VOTING, SCOREBOARD, GAME_OVER
      currentRound: 0,
      letter: '',
      usedLetters: [],
      answers: new Map(), // socketId => { category: word }
      votes: new Map(), // socketId => { `${playerId}_${category}`: boolean }
      roundResult: null,
      timerInterval: null,
      timeLeft: roomSettings.roundTime
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    socket.roomId = roomId;

    console.log(`[Oda Oluşturuldu] Room ID: ${roomId}, Host: ${cleanUsername}`);

    socket.emit('room_created', {
      roomId,
      player,
      players: Array.from(room.players.values()),
      settings: room.settings,
      state: room.state
    });
  });

  // ODAYA KATILMA
  socket.on('join_room', ({ roomId, username, avatar }) => {
    const cleanRoomId = roomId ? roomId.trim().toUpperCase() : '';
    const cleanUsername = username ? username.trim() : '';

    if (!cleanUsername) {
      return socket.emit('join_error', 'Lütfen geçerli bir kullanıcı adı girin.');
    }

    if (!cleanRoomId || !rooms.has(cleanRoomId)) {
      return socket.emit('join_error', 'Girdiğiniz oda kodu bulunamadı!');
    }

    const room = rooms.get(cleanRoomId);

    // KULLANICI ADI ÇAKIŞMASI KONTROLÜ (Aynı odada aynı kullanıcı adı kullanılamaz!)
    const isUsernameTaken = Array.from(room.players.values()).some(
      p => p.username.toLocaleLowerCase('tr-TR') === cleanUsername.toLocaleLowerCase('tr-TR')
    );

    if (isUsernameTaken) {
      return socket.emit('join_error', `"${cleanUsername}" kullanıcı adı bu odada zaten alınmış! Lütfen farklı bir isim seçin.`);
    }

    // Oyun sırasında katılma kısıtlaması (Lobi dışındaysa izleyici veya bekleyen olarak alabiliriz)
    if (room.state !== 'LOBBY') {
      return socket.emit('join_error', 'Bu oda şu anda devam eden bir oyunda! Tur bitimini beklemeniz gerekmektedir.');
    }

    const player = {
      id: socket.id,
      username: cleanUsername,
      avatar: avatar || '🥳',
      isHost: false,
      isReady: false,
      totalScore: 0,
      roundScores: [],
      connected: true
    };

    room.players.set(socket.id, player);
    socket.join(cleanRoomId);
    socket.roomId = cleanRoomId;

    console.log(`[Odaya Katılım] Room ID: ${cleanRoomId}, Oyuncu: ${cleanUsername}`);

    // Yeni giren kişiye oda bilgisini gönder
    socket.emit('room_joined', {
      roomId: cleanRoomId,
      player,
      players: Array.from(room.players.values()),
      settings: room.settings,
      state: room.state
    });

    // Odadaki diğer kişilere haber ver
    socket.to(cleanRoomId).emit('player_joined', {
      player,
      players: Array.from(room.players.values())
    });
  });

  // OYUNU BAŞLATMA (Sadece Host)
  socket.on('start_game', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (room.hostId !== socket.id) {
      return socket.emit('game_error', 'Sadece oda kurucusu oyunu başlatabilir.');
    }

    if (room.players.size < 1) {
      return socket.emit('game_error', 'Oyunu başlatmak için en az 1 oyuncu olmalıdır.');
    }

    startNewRound(room);
  });

  // GÜNCEL AYARLARI KAYDETME (Sadece Host)
  socket.on('update_settings', (newSettings) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (room.hostId !== socket.id) return;

    room.settings = { ...room.settings, ...newSettings };
    io.to(roomId).emit('settings_updated', room.settings);
  });

  // "STOP!" BUTONUNA BASMA
  socket.on('trigger_stop', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (room.state !== 'PLAYING') return;

    const player = room.players.get(socket.id);
    console.log(`[STOP Tetiklendi] Room: ${roomId}, Oyuncu: ${player ? player.username : 'Bilinmeyen'}`);

    room.state = 'STOPPED';
    clearInterval(room.timerInterval);

    // Tüm oyunculara STOP basıldığını bildir ve kısa son geri sayım başlat
    let stopCountdown = room.settings.stopCountdown || 5;
    
    io.to(roomId).emit('stop_triggered', {
      stoppedBy: player ? player.username : 'Bir oyuncu',
      countdown: stopCountdown
    });

    const stopTimer = setInterval(() => {
      stopCountdown--;
      io.to(roomId).emit('stop_countdown_tick', stopCountdown);
      if (stopCountdown <= 0) {
        clearInterval(stopTimer);
        io.to(roomId).emit('force_submit_answers');
      }
    }, 1000);
  });

  // CEVAPLARI GÖNDERME
  socket.on('submit_answers', (playerAnswers) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    room.answers.set(socket.id, playerAnswers || {});

    // Eğer oda durumunda herkes cevap gönderdiyse veya süre bittiyse Oylama aşamasına geç
    const submittedCount = room.answers.size;
    const totalPlayers = room.players.size;

    io.to(roomId).emit('answer_submission_progress', {
      submittedCount,
      totalPlayers
    });

    if (submittedCount >= totalPlayers && room.state !== 'VOTING') {
      startVotingPhase(room);
    }
  });

  // OYLAMA İŞLEMİ (Her oyuncu kelimeleri onaylayabilir/reddedebilir)
  socket.on('submit_votes', (playerVotes) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    room.votes.set(socket.id, playerVotes);

    if (room.votes.size >= room.players.size) {
      calculateAndShowScores(room);
    }
  });

  // OYLAMAYI BİTİR (Host manuel bitirebilir veya süre ile)
  socket.on('finish_voting', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (room.hostId !== socket.id) return;
    calculateAndShowScores(room);
  });

  // SONRAKİ TURA GEÇİŞ
  socket.on('next_round', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (room.hostId !== socket.id) return;

    if (room.currentRound >= room.settings.totalRounds) {
      room.state = 'GAME_OVER';
      io.to(roomId).emit('game_over', {
        players: Array.from(room.players.values()).sort((a, b) => b.totalScore - a.totalScore)
      });
    } else {
      startNewRound(room);
    }
  });

  // OYUNU SIFIRLA / LOBİYE DÖN
  socket.on('restart_game', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (room.hostId !== socket.id) return;

    room.state = 'LOBBY';
    room.currentRound = 0;
    room.usedLetters = [];
    room.players.forEach(p => {
      p.totalScore = 0;
      p.roundScores = [];
    });

    io.to(roomId).emit('game_restarted', {
      players: Array.from(room.players.values()),
      state: room.state
    });
  });

  // KULLANICI AYRILDIĞINDA
  socket.on('disconnect', () => {
    console.log(`[Ayrıldı] Socket ID: ${socket.id}`);
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    room.players.delete(socket.id);

    if (room.players.size === 0) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      rooms.delete(roomId);
      console.log(`[Oda Silindi] Room ID: ${roomId} (Boş kaldı)`);
    } else {
      // Eğer Host ayrıldıysa yeni host ata
      if (room.hostId === socket.id) {
        const nextHost = room.players.keys().next().value;
        room.hostId = nextHost;
        room.players.get(nextHost).isHost = true;
        console.log(`[Yeni Host Atandı] Room ID: ${roomId}, Yeni Host ID: ${nextHost}`);
      }

      io.to(roomId).emit('player_left', {
        playerId: socket.id,
        players: Array.from(room.players.values()),
        hostId: room.hostId
      });

      // Eğer oyun sırasında bir oyuncu çıkarsa kalan kişilerle devam et
      if (room.state === 'STOPPED' && room.answers.size >= room.players.size) {
        startVotingPhase(room);
      }
    }
  });
});

// Yeni Tur Başlatma Yardımcısı
function startNewRound(room) {
  room.currentRound += 1;

  // Harf Seçimi (Daha önce seçilmeyenlerden rastgele)
  let availableLetters = TURKISH_LETTERS.filter(l => !room.usedLetters.includes(l));
  if (availableLetters.length === 0) {
    room.usedLetters = [];
    availableLetters = [...TURKISH_LETTERS];
  }

  const selectedLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
  room.usedLetters.push(selectedLetter);
  room.letter = selectedLetter;
  room.state = 'PLAYING';
  room.answers.clear();
  room.votes.clear();
  room.timeLeft = room.settings.roundTime;

  if (room.timerInterval) clearInterval(room.timerInterval);

  io.to(room.id).emit('round_started', {
    round: room.currentRound,
    totalRounds: room.settings.totalRounds,
    letter: selectedLetter,
    categories: room.settings.categories,
    roundTime: room.settings.roundTime
  });

  // Zamanlayıcı
  room.timerInterval = setInterval(() => {
    room.timeLeft--;
    io.to(room.id).emit('timer_tick', room.timeLeft);

    if (room.timeLeft <= 0) {
      clearInterval(room.timerInterval);
      room.state = 'STOPPED';
      io.to(room.id).emit('time_up');
      setTimeout(() => {
        io.to(room.id).emit('force_submit_answers');
      }, 1000);
    }
  }, 1000);
}

// Oylama Fazını Başlatma
function startVotingPhase(room) {
  if (room.state === 'VOTING') return;
  room.state = 'VOTING';
  if (room.timerInterval) clearInterval(room.timerInterval);

  // Oyuncuların cevaplarını düzenle
  // Format: categories => { categoryName: [ { playerId, username, avatar, word, startsCorrect, isDictValid } ] }
  const votingData = {};

  room.settings.categories.forEach(category => {
    votingData[category] = [];

    room.players.forEach((player, socketId) => {
      const playerAns = room.answers.get(socketId) || {};
      const word = playerAns[category] ? playerAns[category].trim() : '';
      const formatted = formatWord(word);
      const startsCorrect = word ? startsWithLetter(word, room.letter) : false;
      const dictValid = word ? checkDictionary(category, word) : false;

      votingData[category].push({
        playerId: socketId,
        username: player.username,
        avatar: player.avatar,
        word: formatted,
        startsCorrect,
        dictValid,
        autoScoreSuggestion: !word ? 0 : (!startsCorrect ? 0 : 10)
      });
    });
  });

  io.to(room.id).emit('start_voting', {
    letter: room.letter,
    votingData
  });
}

// Puan Hesaplama ve Sonuçları Yayma
function calculateAndShowScores(room) {
  room.state = 'SCOREBOARD';

  // Puan tablosu: playerId => { totalRoundScore, categoryScores: { category: { word, points, reason } } }
  const roundScores = new Map();
  room.players.forEach((_, socketId) => {
    roundScores.set(socketId, {
      totalRoundScore: 0,
      details: {}
    });
  });

  const categories = room.settings.categories;

  categories.forEach(category => {
    // Bu kategorideki tüm oyuncuların cevaplarını topla
    const wordCounts = new Map(); // word => count of players with this word
    const playerWords = new Map(); // socketId => word

    room.players.forEach((_, socketId) => {
      const playerAns = room.answers.get(socketId) || {};
      const word = playerAns[category] ? formatWord(playerAns[category]) : '';
      playerWords.set(socketId, word);

      if (word) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    });

    // Oyları değerlendir (Oyuncu oyları çoğunlukla ne dedi?)
    room.players.forEach((player, socketId) => {
      const word = playerWords.get(socketId);
      const pScoreObj = roundScores.get(socketId);

      if (!word) {
        pScoreObj.details[category] = { word: '-', points: 0, reason: 'Boş bırakıldı' };
        return;
      }

      // Doğru harfle başlıyor mu?
      if (!startsWithLetter(word, room.letter)) {
        pScoreObj.details[category] = { word, points: 0, reason: 'Yanlış harfle başlıyor' };
        return;
      }

      // Oylama kontrolü (Kullanıcılar reddettiyse 0 puan)
      let rejectCount = 0;
      let approveCount = 0;
      const key = `${socketId}_${category}`;

      room.votes.forEach((playerVoteMap) => {
        if (playerVoteMap && playerVoteMap[key] !== undefined) {
          if (playerVoteMap[key] === false) rejectCount++;
          else approveCount++;
        }
      });

      // Çoğunluk reddettiyse
      if (rejectCount > approveCount && rejectCount > 0) {
        pScoreObj.details[category] = { word, points: 0, reason: 'Oy birliğiyle reddedildi' };
        return;
      }

      // Puan Belirleme (Aynı cevap verildiyse 5 puan, eşsizse 10 puan)
      const sameWordCount = wordCounts.get(word) || 1;
      if (sameWordCount > 1) {
        pScoreObj.totalRoundScore += 5;
        pScoreObj.details[category] = { word, points: 5, reason: `Ortak cevap (${sameWordCount} kişi)` };
      } else {
        pScoreObj.totalRoundScore += 10;
        pScoreObj.details[category] = { word, points: 10, reason: 'Özgün ve doğru cevap' };
      }
    });
  });

  // Toplam puanları güncelle
  room.players.forEach((player, socketId) => {
    const res = roundScores.get(socketId);
    player.totalScore += res.totalRoundScore;
    player.roundScores.push(res.totalRoundScore);
  });

  const leaderboard = Array.from(room.players.values()).sort((a, b) => b.totalScore - a.totalScore);

  io.to(room.id).emit('round_results', {
    round: room.currentRound,
    totalRounds: room.settings.totalRounds,
    letter: room.letter,
    roundScores: Object.fromEntries(roundScores),
    leaderboard
  });
}

// Sunucuyu Dinle
server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🎮 İsim Şehir Multiplayer Sunucusu Hazır!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
