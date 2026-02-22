# Как загрузить Roode Editor на Render с реальным доменом

Этот документ содержит пошаговую инструкцию по деплою проекта `Roode (Node.js + PostgreSQL)` на бесплатный хостинг Render и привязке вашего домена.

## Шаг 1: Подготовка (GitHub)

1. Откройте терминал в папке проекта (`c:\Users\Sasha\Downloads\roodesite`).
2. Инициализируйте Git и отправьте код на GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Render"
   git branch -M main
   # Замените ссылку ниже на ваш созданный пустой репозиторий GitHub
   git remote add origin https://github.com/ВАШ_НИК/ВАШ_РЕПОЗИТОРИЙ.git
   git push -u origin main
   ```

*(Все нужные файлы для Render, такие как `package.json`, `.gitignore` и `render.yaml` уже созданы в проекте).*

## Шаг 2: Деплой на Render (Web Service)

Так как вы создаете Web Service вручную (не через Blueprint):

1. Перейдите на сайт [Render.com](https://render.com) и войдите через GitHub.
2. В панели управления (Dashboard) нажмите кнопку **New +** в правом верхнем углу и выберите **Web Service**.
3. Выберите **Build and deploy from a Git repository**.
4. Подключите ваш GitHub аккаунт, если ещё не сделали этого, и выберите репозиторий `roode`.
5. Настройте конфигурацию сервиса:
   - **Name**: `roode-editor` (или любое другое)
   - **Language**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Бесплатный тариф (Free) — листайте вниз
6. Нажмите **Advanced** (ниже выбора тарифа).
7. Добавьте первую переменную окружения (Environment Variable):
   - **Key**: `DATABASE_URL`
   - **Value**: `postgresql://neondb_owner:npg_dHsFwb0T1hSI@ep-solitary-smoke-aimoqeek-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
8. Добавьте вторую переменную:
   - **Key**: `PORT`
   - **Value**: `10000`
9. Нажмите кнопку **Create Web Service** в самом низу.

Render начнёт собирать ваш проект. В течение пары минут ваш сайт будет готов и доступен по адресу вроде `https://roode-editor-xxxx.onrender.com`.

*(Шаг 3 из прошлой инструкции мы уже сделали выше, добавив DATABASE_URL при создании, поэтому сразу переходим к настройке вашего домена 🚀)*

## Шаг 4: Привязка реального домена (roode.pp.ua)

Чтобы сайт открывался по адресу `roode.pp.ua`:

1. В настройках сервиса **roode-editor** на Render перейдите в раздел **Settings**.
2. Прокрутите вниз до раздела **Custom Domains**.
3. Нажмите **Add Custom Domain**.
4. Введите ваш домен: `roode.pp.ua` и нажмите Save. По желанию повторите шаги для `www.roode.pp.ua`.

Render выдаст вам DNS-записи, которые нужно добавить у вашего регистратора домена (например, NIC.UA, HOSTiQ) или в Cloudflare (если вы делегировали зону туда):

### Настройка DNS-записей для pp.ua:
В панели администрирования домена добавьте следующие записи:

- **Для поддомена www (если вы добавили его):**
  - **Тип**: `CNAME`
  - **Имя (Name/Host)**: `www`
  - **Значение (Target/Alias)**: скопируйте ссылку, которую вам выдал Render (например, `roode-editor-xxxx.onrender.com`).

- **Для основного домена (без www):**
  - **Тип**: `ALIAS` или `ANAME` (в зависимости от регистратора)
  - **Имя (Name/Host)**: `@` (или оставьте пустым)
  - **Значение (Target/Alias)**: та же ссылка Render (`roode-editor-xxxx.onrender.com`).
  - *Примечание:* Если ваш регистратор не поддерживает ALIAS/ANAME записи для корневого домена, выберите тип **A**-запись и скопируйте IP-адреса, которые предлагает Render для корневых доменов (их будет два, создайте две `A`-записи).

5. В дашборде Render нажмите **Verify** возле вашего домена.
*(Обновление DNS для зоны .pp.ua может занять от 15 минут до пары часов. Render автоматически выпустит бесплатный SSL/HTTPS сертификат, как только домен успешно направится на их сервера).*

---

🎉 **Готово!** Теперь ваш редактор проектов работает в облаке и доступен по вашему домену!
