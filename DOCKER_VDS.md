# Docker deploy on VDS

## First install

```bash
cd /opt
git clone https://github.com/STTS66/roode.git
cd /opt/roode
cp env.vds.example env.vds
nano env.vds
```

Put your values into `env.vds`:

```env
DOMAIN=roode.pp.ua
JWT_SECRET=replace-this-with-a-long-random-string
POSTGRES_DB=roode
POSTGRES_USER=roode
POSTGRES_PASSWORD=replace-this-with-a-strong-password
```

Then start everything:

```bash
bash deploy-vds.sh env.vds
docker compose --env-file env.vds ps
```

## Next updates

```bash
cd /opt/roode
cat env.vds
git pull
bash deploy-vds.sh env.vds
docker compose --env-file env.vds ps
```

## If values are missing in `env.vds`

Check file:

```bash
cd /opt/roode
cat env.vds
```

If output does not contain the required lines, append them:

```bash
echo "DOMAIN=roode.pp.ua" >> env.vds
echo "POSTGRES_DB=roode" >> env.vds
echo "POSTGRES_USER=roode" >> env.vds
echo "POSTGRES_PASSWORD=replace-this-with-a-strong-password" >> env.vds
echo "JWT_SECRET=replace-this-with-a-long-random-string" >> env.vds
```

Then update code and stack:

```bash
git pull
bash deploy-vds.sh env.vds
```

## Check logs

```bash
docker compose --env-file env.vds logs --tail=80 app
docker compose --env-file env.vds logs --tail=80 db
docker compose --env-file env.vds logs --tail=80 caddy
```
