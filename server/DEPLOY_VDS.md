# Deploy on VDS for `roode.pp.ua`

## 1. What to upload with WinSCP

Upload the contents of the `server` folder to:

`/var/www/roode`

After upload, the server should contain:

- `server.js`
- `package.json`
- `public/`
- `init.sql`
- `deploy/`

## 2. Prepare `.env`

On the server, create:

`/var/www/roode/.env`

Example:

```env
PORT=3000
JWT_SECRET=change-this-to-a-long-random-string
DATABASE_URL=postgresql://postgres:strong-password@127.0.0.1:5432/roode_db
```

If you already use Neon or another external PostgreSQL, put that URL into `DATABASE_URL` and skip local PostgreSQL setup below.

## 3. Install runtime packages on Ubuntu

```bash
sudo apt update
sudo apt install -y nginx postgresql postgresql-contrib curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 4. Install app dependencies

```bash
cd /var/www/roode
npm install --omit=dev
```

## 5. Create PostgreSQL database

Skip this section if `DATABASE_URL` points to Neon or any other ready external database.

```bash
sudo -u postgres psql
```

Inside `psql`:

```sql
CREATE USER roode WITH PASSWORD 'strong-password';
CREATE DATABASE roode_db OWNER roode;
\q
```

Then import schema:

```bash
psql postgresql://roode:strong-password@127.0.0.1:5432/roode_db -f /var/www/roode/init.sql
```

## 6. Enable systemd service

```bash
sudo cp /var/www/roode/deploy/systemd/roode.service /etc/systemd/system/roode.service
sudo systemctl daemon-reload
sudo systemctl enable --now roode
sudo systemctl status roode
```

Quick check:

```bash
curl http://127.0.0.1:3000/api/health
```

## 7. Enable nginx for domain

```bash
sudo cp /var/www/roode/deploy/nginx/roode.pp.ua.conf /etc/nginx/sites-available/roode.pp.ua
sudo ln -s /etc/nginx/sites-available/roode.pp.ua /etc/nginx/sites-enabled/roode.pp.ua
sudo nginx -t
sudo systemctl reload nginx
```

## 8. Issue HTTPS certificate

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d roode.pp.ua
```

## 9. Open firewall if UFW is enabled

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 10. Update the site later

To update through WinSCP:

1. Re-upload changed files into `/var/www/roode`
2. Run:

```bash
cd /var/www/roode
npm install --omit=dev
sudo systemctl restart roode
```

## Notes

- `roode.pp.ua` already resolves to `91.233.168.135`, so DNS A record is in place.
- WinSCP is only for file upload. `nginx`, `systemd`, PostgreSQL, and HTTPS still need terminal access over SSH.
- The app serves frontend and API from the same Node process, so no separate frontend deploy is required.
