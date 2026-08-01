# 🎮 İsim Şehir Multiplayer (Web & Mobil)

İstenilen sayıda arkadaşınızla canlı odalar kurup birlikte oynayabileceğiniz, %100 mobil ve masaüstü uyumlu, modern web ve socket tabanlı **İsim / Şehir** oyunu.

---

## 🌟 Öne Çıkan Özellikler

- **Çok Oyunculu Oda Yapısı:** İstenilen sayıda oyuncu tek oda koduna bağlanır.
- **Benzersiz Kullanıcı Adı Koruması:** Aynı odada aynı isimli kullanıcıların girmesi otomatik olarak engellenir.
- **Mobil Öncelikli (Responsive) Tasarım:** İster akıllı telefondan ister bilgisayardan akıcı ve hızlı erişim.
- **Canlı Senkronizasyon:** Harf çekme, zamanlayıcı, STOP butonu, canlı oylama ve puan hesaplama.
- **Otomatik & İnteraktif Oylama:** Türkçe şehir, ülke, isim, hayvan, bitki, eşya sözlüğü ile kelime önerileri ve oyuncu onay/red oylaması.
- **Şampiyonluk Podyumu & Konfeti:** Oyun sonunda canlı liderlik tablosu ve derece alan ilk 3 oyuncu için podyum animasyonu.

---

## 🚀 Render.com Üzerinde Ücretsiz Canlıya Alma (Deploy) Rehberi

Projeyi **Render.com** üzerinde yayınlamak için aşağıdaki adımları sırasıyla uygulayabilirsiniz:

### 1. Adım: Projeyi GitHub'a Yükleyin
Proje klasörünüzde terminal/PowerShell açın ve GitHub deposuna gönderin:

```bash
git init
git add .
git commit -m "İsim Şehir Multiplayer projesi ilk sürüm"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADINIZ/isim-sehir.git
git push -u origin main
```

### 2. Adım: Render.com'da Servisi Başlatın
1. [Render.com](https://render.com) sitesine ücretsiz üye olun veya giriş yapın.
2. Dashboard ekranından **"New +"** butonuna tıklayıp **"Web Service"** seçeneğini seçin.
3. GitHub hesabınızı bağlayarak oluşturduğunuz `isim-sehir` deposunu seçin.
4. Render ayarları otomatik algılayacaktır (Eğer elle girmek isterseniz):
   - **Name:** `isim-sehir-oyunu` (veya dilediğiniz isim)
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Free` (Ücretsiz)
5. **"Create Web Service"** butonuna basın.

Yaklaşık 1-2 dakika içinde Render projenizi derleyecek ve size `https://isim-sehir-oyunu.onrender.com` gibi canlı bir bağlantı adresi verecektir. Bu adresi arkadaşlarınıza göndererek hemen oynamaya başlayabilirsiniz!

---

## 🛠️ Yerel Geliştirme (Local Development)

Yerel bilgisayarınızda çalıştırmak için:

```bash
npm install
npm start
```

Tarayıcınızda `http://localhost:3000` adresine gidin.

---

## 📁 Proje Dosya Yapısı

- `server.js` -> Express + Socket.io sunucu ve oda yönetim mantığı
- `public/index.html` -> SPA yapısındaki web ve mobil arayüz
- `public/style.css` -> Glassmorphism dark tema ve responsive CSS
- `public/app.js` -> Socket.io istemci mantığı, oylama ve ses efektleri
- `public/dictionary.json` -> Türkçe kelime referans sözlüğü
- `render.yaml` -> Render.com otomatik canlıya alma (Blueprint) dosyası
