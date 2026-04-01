# Roode

Roode is a self-hosted web editor with:

- Node.js backend
- PostgreSQL storage
- static frontend served by the same Node process
- WebSocket collaboration support

Repository: [STTS66/roode](https://github.com/STTS66/roode)

## Structure

- `server/` - production app that should be uploaded to the VDS
- `server/public/` - frontend files
- `server/server.js` - API + static server + WebSocket server
- `server/init.sql` - PostgreSQL schema
- `server/deploy/nginx/roode.pp.ua.conf` - nginx config for `roode.pp.ua`
- `server/deploy/systemd/roode.service` - systemd service
- `server/DEPLOY_VDS.md` - detailed deployment guide

## Quick deploy to VDS with WinSCP

This project is already prepared for deployment on:

- domain: `roode.pp.ua`
- server IP: `91.233.168.135`

### 1. Upload files through WinSCP

Connect to the VDS with WinSCP and upload the full contents of `server/` into:

`/var/www/roode`

### 2. Create environment file on the server

Create:

`/var/www/roode/.env`

Example:

```env
PORT=3000
JWT_SECRET=change-this-to-a-long-random-string
DATABASE_URL=postgresql://postgres:strong-password@127.0.0.1:5432/roode_db
```

If you already use Neon, just paste your Neon connection string into `DATABASE_URL`.

### 3. Install packages on Ubuntu

```bash
sudo apt update
sudo apt install -y nginx postgresql postgresql-contrib curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 4. Install Node.js dependencies

```bash
cd /var/www/roode
npm install --omit=dev
```

### 5. Configure PostgreSQL

Skip this step if you use Neon.

```bash
sudo -u postgres psql
```

```sql
CREATE USER roode WITH PASSWORD 'strong-password';
CREATE DATABASE roode_db OWNER roode;
\q
```

```bash
psql postgresql://roode:strong-password@127.0.0.1:5432/roode_db -f /var/www/roode/init.sql
```

### 6. Start the app with systemd

```bash
sudo cp /var/www/roode/deploy/systemd/roode.service /etc/systemd/system/roode.service
sudo systemctl daemon-reload
sudo systemctl enable --now roode
sudo systemctl status roode
```

Test local backend response:

```bash
curl http://127.0.0.1:3000/api/health
```

### 7. Connect domain through nginx

```bash
sudo cp /var/www/roode/deploy/nginx/roode.pp.ua.conf /etc/nginx/sites-available/roode.pp.ua
sudo ln -s /etc/nginx/sites-available/roode.pp.ua /etc/nginx/sites-enabled/roode.pp.ua
sudo nginx -t
sudo systemctl reload nginx
```

### 8. Enable HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d roode.pp.ua
```

### 9. Open firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## How to update the site later

1. Upload changed files to `/var/www/roode` through WinSCP.
2. Run:

```bash
cd /var/www/roode
npm install --omit=dev
sudo systemctl restart roode
```

## Useful commands for debugging

```bash
sudo systemctl status roode
sudo journalctl -u roode -n 100 --no-pager
sudo nginx -t
curl http://127.0.0.1:3000/api/health
```

## Notes

- WinSCP is only for file upload.
- Final server setup still requires SSH access.
- The app serves frontend and backend from one Node.js process, so there is no separate frontend hosting step.
- The server now reads `.env`, so secrets do not need to be hardcoded.
