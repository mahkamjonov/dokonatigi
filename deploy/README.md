# Atigi — serverga o'rnatish

Bitta VPS serverda hammasi ishlaydi: **PostgreSQL** baza, **API** (Node.js, PM2 boshqaradi) va **sayt** (Nginx, HTTPS).

## Nima kerak

- VPS: **Ubuntu 24.04** (yoki 22.04), kamida 1 GB RAM (2 GB tavsiya), 20 GB disk.
- Provayder beradigan **server IP** va **root** kirish (parol yoki SSH kalit).
- Domen hozircha shart emas: boshida bepul `<ip>.sslip.io` manzil ishlatiladi (masalan `203-0-113-10.sslip.io`).

## 1. Serverga ulanish

Windows PowerShell'da:

```bash
ssh root@SERVER_IP
```

## 2. O'rnatish (bir marta)

Serverda:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/mahkamjonov/dokonatigi.git /srv/atigi
bash /srv/atigi/deploy/setup.sh
```

5–10 daqiqa davom etadi. Oxirida **certbot** (bepul HTTPS sertifikati) e-mail so'raydi va Let's Encrypt shartlariga rozilik so'raydi. Tugagach, sayt manzili chiqadi.

Skript nima qiladi: yetishmayotgan dasturlarni (Node.js, PostgreSQL, Nginx, PM2) o'rnatadi — serverda boshqa loyihalar bo'lsa, mavjud dasturlar yangilanmaydi va API birinchi bo'sh portni (3000 dan boshlab) oladi; faqat 22/80/443 portlarini ochiq qoldiradi; bazani va maxfiy kalitlarni yaratib, `apps/api/.env` ga yozadi; saytni build qilib ishga tushiradi; server qayta yoqilganda ham avtomatik ishga tushadigan qiladi; har kuni bazaning zaxira nusxasini oladi.

## 3. Do'kon egasini yaratish

```bash
cd /srv/atigi/apps/api && sudo -u atigi node dist/scripts/createOwner.js
```

Do'kon nomi, ism, login va parolni so'raydi. Tizimda faqat bitta ega bo'ladi; sotuvchilarni ega saytning o'zida qo'shadi.

## 4. Telegram bot (ixtiyoriy)

1. **@BotFather** → `/mybots` → botingiz → **API Token** → **Revoke** (eski token GitHub'da ochiq qolgan) → yangi tokenni oling.
2. Tokenni yozing: `nano /srv/atigi/apps/api/.env` → `TELEGRAM_BOT_TOKEN=...` → saqlash: `Ctrl+O`, `Enter`, `Ctrl+X`.
3. Qayta ishga tushiring: `sudo -u atigi -H pm2 restart atigi-api`

## Yangilash (kod o'zgarganda)

O'zgarishlar GitHub'ga push qilingandan keyin serverda:

```bash
sudo -u atigi -H bash /srv/atigi/deploy/deploy.sh
```

## Domen olganda

1. Domen sozlamalarida ikkita **A record**: `@` va `www` → server IP.
2. Bir necha daqiqadan keyin (`ping DOMEN` server IP'sini ko'rsatsa):

```bash
bash /srv/atigi/deploy/set-domain.sh atigi.uz www.atigi.uz
```

Nginx, HTTPS sertifikati va Telegram bot manzili yangi domenga o'tadi.

## Zaxira nusxalar

- Har kuni soat 03:00 da `/var/backups/atigi/` ga olinadi, 14 kun saqlanadi.
- Vaqti-vaqti bilan kompyuteringizga ham ko'chirib qo'ying — server butunlay ishdan chiqsa, undagi nusxalar ham yo'qoladi:

```bash
scp root@SERVER_IP:/var/backups/atigi/atigi-2026-10-28.dump .
```

- Tiklash (**joriy ma'lumotlar ustidan yoziladi!**):

```bash
sudo -u postgres pg_restore --clean --if-exists -d atigi /var/backups/atigi/atigi-2026-10-28.dump
```

## Foydali buyruqlar

| Nima uchun | Buyruq |
|---|---|
| Loglarni ko'rish | `sudo -u atigi -H pm2 logs atigi-api` |
| Holat | `sudo -u atigi -H pm2 status` |
| Qayta ishga tushirish | `sudo -u atigi -H pm2 restart atigi-api` |

## Muammolar

- **Sayt manzili noto'g'ri IP bilan chiqdi** (ba'zi serverlarda birinchi IP ichki tarmoqniki bo'ladi): to'g'ri manzil bilan `bash /srv/atigi/deploy/set-domain.sh 203-0-113-10.sslip.io`.
- **HTTPS sertifikati olinmadi**: sayt vaqtincha `http://` da ishlaydi (Telegram Mini App esa ishlamaydi). Sababini tuzatib, `set-domain.sh` ni qayta ishga tushiring.
- **`deploy.sh` "API did not answer" dedi**: `sudo -u atigi -H pm2 logs atigi-api` dagi xatoni ko'ring.
