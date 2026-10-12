# Goodent Laboratuvar PWA
1. Supabase'de schema.sql'i çalıştır.
2. `.env.example` dosyasını `.env` yap, URL ve anon key'i yaz (Supabase > Project Settings > API).
3. `public/` klasörüne icon-192.png ve icon-512.png koy.
4. `npm install` → `npm run dev` (test) → `npm run build` (yayın; dist/ klasörünü Vercel/Netlify'a yükle).
5. İlk kayıt olan kullanıcı admin olur. Telefonda tarayıcıdan "Ana ekrana ekle".

## Uygulama olarak paketleme
- Windows .exe : `npm run electron:build` → release/ klasöründe kurulum dosyası
- Android      : `npm run cap:sync` (ilk seferde önce `npx cap add android`) → `npx cap open android`
- iPhone (Mac) : `npx cap add ios` → `npm run cap:sync` → `npx cap open ios`
NOT: .env dosyası build sırasında uygulamaya gömülür; build'den önce dolu olmalı.
