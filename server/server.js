const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const db = require('./db');

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
        const existing = db.findUserByUsername(username);
        if (existing) return res.status(409).json({ error: 'Пользователь уже существует' });

        const hash = await bcrypt.hash(password, 10);
        const newUser = db.createUser(username, hash);
        res.json({ ok: true, user: { id: newUser.id, username: newUser.username, created_at: newUser.created_at } });
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
        const user = db.findUserByUsername(username);
        if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

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
        const rows = db.findProjectsByUserId(req.userId);
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
        const newProject = db.createProject(req.userId, name, folder_path);
        res.json(newProject);
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
        const project = db.updateProject(id, req.userId, { name, folder_path, last_file });
        if (!project) return res.status(404).json({ error: 'Проект не найден' });
        res.json(project);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка обновления' });
    }
});

// Delete project
app.delete('/api/projects/:id', authMiddleware, async (req, res) => {
    try {
        const success = db.deleteProject(req.params.id, req.userId);
        res.json({ ok: success });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// ============ VERSIONS ROUTES ============

// List versions for a project
app.get('/api/projects/:projectId/versions', authMiddleware, async (req, res) => {
    try {
        const rows = db.findVersionsByProjectId(req.params.projectId, req.userId);
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
        const newVersion = db.createVersion(req.params.projectId, version, label, files);
        res.json(newVersion);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка сохранения версии' });
    }
});

// Get single version (for restore)
app.get('/api/versions/:id', authMiddleware, async (req, res) => {
    try {
        const version = db.findVersionById(req.params.id, req.userId);
        if (!version) return res.status(404).json({ error: 'Версия не найдена' });
        res.json(version);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка загрузки версии' });
    }
});

// Delete version
app.delete('/api/versions/:id', authMiddleware, async (req, res) => {
    try {
        const success = db.deleteVersion(req.params.id, req.userId);
        res.json({ ok: success });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка удаления версии' });
    }
});

// ============ NOTES ROUTES ============

app.get('/api/health', async (_req, res) => {
    const dbOk = db.checkHealth();
    if (dbOk) {
        res.json({ ok: true, service: 'roode-server', database: 'json-file-db' });
    } else {
        res.status(503).json({ ok: false, service: 'roode-server', database: 'down' });
    }
});

// List notes
app.get('/api/notes', authMiddleware, async (req, res) => {
    try {
        const rows = db.findNotesByUserId(req.userId);
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
        const newNote = db.createNote(req.userId, title, content);
        res.json(newNote);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error creating note' });
    }
});

// Update note
app.put('/api/notes/:id', authMiddleware, async (req, res) => {
    const { title, content } = req.body;
    try {
        const note = db.updateNote(req.params.id, req.userId, title, content);
        if (!note) return res.status(404).json({ error: 'Error updating note: note not found' });
        res.json(note);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error updating note' });
    }
});

// Delete note
app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
    try {
        const success = db.deleteNote(req.params.id, req.userId);
        res.json({ ok: success });
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
