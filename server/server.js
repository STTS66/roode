const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');

for (const envPath of [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env')
]) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, quiet: true });
        break;
    }
}

// ============ CONFIG ============
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'roode_super_secret_key_change_me';
const DB_URL = process.env.DATABASE_URL;
const poolConfig = DB_URL ? {
    connectionString: DB_URL
} : {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'roode',
    password: process.env.PGPASSWORD || 'roode_pass',
    database: process.env.PGDATABASE || 'roode_db'
};

const pool = new Pool(poolConfig);

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// ============ AUTH MIDDLEWARE ============
function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'No token' });
    const token = header.replace('Bearer ', '');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.username = decoded.username;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// ============ AUTH ROUTES ============

// Register
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Введите логин и пароль' });
    if (username.length < 2) return res.status(400).json({ error: 'Логин слишком короткий' });
    if (password.length < 4) return res.status(400).json({ error: 'Пароль должен быть минимум 4 символа' });

    try {
        // Check if user exists
        const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
        if (existing.rows.length > 0) return res.status(409).json({ error: 'Пользователь уже существует' });

        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username, created_at',
            [username, hash]
        );
        res.json({ ok: true, user: result.rows[0] });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Введите логин и пароль' });

    try {
        const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Неверный логин или пароль' });

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Неверный логин или пароль' });

        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, username: user.username, userId: user.id });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    res.json({ userId: req.userId, username: req.username });
});

// ============ PROJECTS ROUTES ============

// List projects
app.get('/api/projects', authMiddleware, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
            [req.userId]
        );
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка загрузки проектов' });
    }
});

// Create project
app.post('/api/projects', authMiddleware, async (req, res) => {
    const { name, folder_path } = req.body;
    if (!name) return res.status(400).json({ error: 'Укажите имя проекта' });

    try {
        const { rows } = await pool.query(
            'INSERT INTO projects (user_id, name, folder_path) VALUES ($1, $2, $3) RETURNING *',
            [req.userId, name, folder_path || '']
        );
        res.json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка создания проекта' });
    }
});

// Update project
app.put('/api/projects/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { name, folder_path, last_file } = req.body;
    try {
        const fields = [];
        const values = [];
        let idx = 1;

        if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
        if (folder_path !== undefined) { fields.push(`folder_path = $${idx++}`); values.push(folder_path); }
        if (last_file !== undefined) { fields.push(`last_file = $${idx++}`); values.push(last_file); }

        if (fields.length === 0) return res.status(400).json({ error: 'Нет данных для обновления' });

        values.push(id, req.userId);
        const { rows } = await pool.query(
            `UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
            values
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Проект не найден' });
        res.json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка обновления' });
    }
});

// Delete project
app.delete('/api/projects/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// ============ VERSIONS ROUTES ============

// List versions for a project
app.get('/api/projects/:projectId/versions', authMiddleware, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT pv.id, pv.version, pv.label, pv.created_at 
             FROM project_versions pv
             JOIN projects p ON p.id = pv.project_id
             WHERE pv.project_id = $1 AND p.user_id = $2
             ORDER BY pv.created_at DESC`,
            [req.params.projectId, req.userId]
        );
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка загрузки версий' });
    }
});

// Save version
app.post('/api/projects/:projectId/versions', authMiddleware, async (req, res) => {
    const { version, label, files } = req.body;
    if (!version || !files) return res.status(400).json({ error: 'Укажите версию и файлы' });

    try {
        const { rows } = await pool.query(
            'INSERT INTO project_versions (project_id, version, label, files) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.params.projectId, version, label || null, typeof files === 'string' ? files : JSON.stringify(files)]
        );
        res.json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка сохранения версии' });
    }
});

// Get single version (for restore)
app.get('/api/versions/:id', authMiddleware, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT pv.* FROM project_versions pv
             JOIN projects p ON p.id = pv.project_id
             WHERE pv.id = $1 AND p.user_id = $2`,
            [req.params.id, req.userId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Версия не найдена' });
        res.json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка загрузки версии' });
    }
});

// Delete version
app.delete('/api/versions/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            `DELETE FROM project_versions pv USING projects p 
             WHERE pv.project_id = p.id AND pv.id = $1 AND p.user_id = $2`,
            [req.params.id, req.userId]
        );
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка удаления версии' });
    }
});

// ============ NOTES ROUTES ============

app.get('/api/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true, service: 'roode-server', database: 'up' });
    } catch (error) {
        res.status(503).json({ ok: false, service: 'roode-server', database: 'down' });
    }
});

// List notes
app.get('/api/notes', authMiddleware, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM notes WHERE user_id = $1 ORDER BY updated_at DESC',
            [req.userId]
        );
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error loading notes' });
    }
});

// Create note
app.post('/api/notes', authMiddleware, async (req, res) => {
    const { title, content } = req.body;
    try {
        const { rows } = await pool.query(
            'INSERT INTO notes (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
            [req.userId, title || 'Без названия', content || '']
        );
        res.json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error creating note' });
    }
});

// Update note
app.put('/api/notes/:id', authMiddleware, async (req, res) => {
    const { title, content } = req.body;
    try {
        const { rows } = await pool.query(
            'UPDATE notes SET title = COALESCE($1, title), content = COALESCE($2, content), updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING *',
            [title, content, req.params.id, req.userId]
        );
        res.json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error updating note' });
    }
});

// Delete note
app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error deleting note' });
    }
});

// ============ CATCH-ALL: serve index.html for SPA ============
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ HTTP + WEBSOCKET SERVER ============
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Rooms for collaboration
const rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;
    let userId = null;
    let userName = null;

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw);

            if (msg.type === 'join') {
                currentRoom = msg.room;
                userId = msg.userId;
                userName = msg.username;
                if (!rooms[currentRoom]) rooms[currentRoom] = new Set();
                rooms[currentRoom].add(ws);
                // Broadcast user joined
                broadcast(currentRoom, { type: 'user-joined', userId, username: userName }, ws);
            }

            if (msg.type === 'code-update' || msg.type === 'cursor-move' || msg.type === 'file-switch') {
                if (currentRoom) broadcast(currentRoom, msg, ws);
            }

            if (msg.type === 'leave') {
                leaveRoom(ws, currentRoom, userId, userName);
            }
        } catch (e) { }
    });

    ws.on('close', () => {
        leaveRoom(ws, currentRoom, userId, userName);
    });
});

function broadcast(room, data, exclude) {
    if (!rooms[room]) return;
    const msg = JSON.stringify(data);
    for (const client of rooms[room]) {
        if (client !== exclude && client.readyState === 1) {
            client.send(msg);
        }
    }
}

function leaveRoom(ws, room, userId, userName) {
    if (room && rooms[room]) {
        rooms[room].delete(ws);
        if (rooms[room].size === 0) delete rooms[room];
        else broadcast(room, { type: 'user-left', userId, username: userName });
    }
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Roode Server running on http://0.0.0.0:${PORT}`);
});
