const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, initDB } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-roode-key';

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// --- AUTH ROUTES ---

app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
            [username, hashedPassword]
        );
        res.status(201).json({ message: 'User created' });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Username already exists' });
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, username: user.username, last_project_id: user.last_project_id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Save last active project to user profile
app.patch('/api/auth/last-project', authenticateToken, async (req, res) => {
    const { last_project_id } = req.body;
    try {
        await pool.query('UPDATE users SET last_project_id = $1 WHERE id = $2', [last_project_id, req.user.userId]);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get current user info (for page reload)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, last_project_id FROM users WHERE id = $1', [req.user.userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Middleware to verify JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// --- API ROUTES ---

// Ping route for UptimeRobot to keep the free server awake
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Get all projects
app.get('/api/projects', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC', [req.user.userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching projects' });
    }
});

// Create a new project
app.post('/api/projects', authenticateToken, async (req, res) => {
    const { name, folder_path } = req.body;
    if (!name || !folder_path) {
        return res.status(400).json({ error: 'Name and folder_path are required' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO projects (user_id, name, folder_path) VALUES ($1, $2, $3) RETURNING *',
            [req.user.userId, name, folder_path]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error creating project' });
    }
});

// Update last opened file for a project
app.patch('/api/projects/:id/last-file', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { last_file } = req.body;

    try {
        const result = await pool.query(
            'UPDATE projects SET last_file = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [last_file, id, req.user.userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found or unauthorized' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error updating last file' });
    }
});

// Edit project name or folder
app.patch('/api/projects/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, folder_path } = req.body;

    try {
        let query = '';
        let params = [];

        if (name && folder_path) {
            query = 'UPDATE projects SET name = $1, folder_path = $2 WHERE id = $3 AND user_id = $4 RETURNING *';
            params = [name, folder_path, id, req.user.userId];
        } else if (name) {
            query = 'UPDATE projects SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *';
            params = [name, id, req.user.userId];
        } else if (folder_path) {
            query = 'UPDATE projects SET folder_path = $1 WHERE id = $2 AND user_id = $3 RETURNING *';
            params = [folder_path, id, req.user.userId];
        } else {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const result = await pool.query(query, params);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found or unauthorized' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error updating project' });
    }
});

// Delete a project
app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING *', [id, req.user.userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found or unauthorized' });
        }
        res.json({ message: 'Project deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error deleting project' });
    }
});

// --- VERSION CONTROL ROUTES ---

// List all versions of a project
app.get('/api/projects/:id/versions', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        // Verify ownership
        const proj = await pool.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [id, req.user.userId]);
        if (proj.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

        const result = await pool.query(
            'SELECT id, version, label, created_at FROM project_versions WHERE project_id=$1 ORDER BY created_at DESC',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Save a new version snapshot
app.post('/api/projects/:id/versions', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { version, label, files } = req.body;
    if (!version || !files) return res.status(400).json({ error: 'version and files are required' });
    try {
        const proj = await pool.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [id, req.user.userId]);
        if (proj.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

        const result = await pool.query(
            'INSERT INTO project_versions (project_id, version, label, files) VALUES ($1,$2,$3,$4) RETURNING id, version, label, created_at',
            [id, version, label || null, JSON.stringify(files)]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get a single version's file contents
app.get('/api/projects/:id/versions/:vid', authenticateToken, async (req, res) => {
    const { id, vid } = req.params;
    try {
        const proj = await pool.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [id, req.user.userId]);
        if (proj.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

        const result = await pool.query(
            'SELECT * FROM project_versions WHERE id=$1 AND project_id=$2',
            [vid, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Version not found' });
        const row = result.rows[0];
        row.files = JSON.parse(row.files);
        res.json(row);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete a version
app.delete('/api/projects/:id/versions/:vid', authenticateToken, async (req, res) => {
    const { id, vid } = req.params;
    try {
        const proj = await pool.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2', [id, req.user.userId]);
        if (proj.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

        await pool.query('DELETE FROM project_versions WHERE id=$1 AND project_id=$2', [vid, id]);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Default route to serve the frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- SOCKET.IO REAL-TIME COLLABORATION ---
io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // Join a specific project room
    socket.on('join-room', (roomId, username) => {
        socket.join(roomId);
        socket.username = username || 'Guest';
        socket.roomId = roomId;
        console.log(`👤 ${socket.username} (${socket.id}) joined room: ${roomId}`);
        socket.to(roomId).emit('user-joined', { id: socket.id, username: socket.username });
    });

    // Handle code changes
    socket.on('code-update', (data) => {
        // data = { roomId, file, content }
        socket.to(data.roomId).emit('code-update', {
            file: data.file,
            content: data.content,
            senderId: socket.id
        });
    });

    // Handle cursor movements
    socket.on('cursor-move', (data) => {
        // data = { roomId, file, pos }
        socket.to(data.roomId).emit('cursor-move', {
            file: data.file,
            pos: data.pos,
            username: socket.username,
            senderId: socket.id
        });
    });

    // Handle code suggestions from guests
    socket.on('code-suggestion', (data) => {
        // data = { roomId, file, content, guestName }
        socket.to(data.roomId).emit('code-suggestion', data);
    });

    // Handle Figma-style mouse tracking
    socket.on('mouse-move', (data) => {
        // data = { roomId, x, y }
        socket.to(data.roomId).emit('mouse-move', {
            senderId: socket.id,
            username: socket.username,
            x: data.x,
            y: data.y
        });
    });

    // Handle initial state sync from Host to a specific Guest
    socket.on('collab-state', (data) => {
        // data = { targetId, users }
        socket.to(data.targetId).emit('collab-state', data);
    });

    // Handle Host changing a User's role
    socket.on('role-update', (data) => {
        // data = { roomId, targetId, role }
        socket.to(data.roomId).emit('role-update', data);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected: ${socket.id}`);
        if (socket.roomId) {
            socket.to(socket.roomId).emit('user-left', { id: socket.id, username: socket.username });
        }
    });

    // Handle Project Tree Sync Events
    socket.on('request-project', (roomId) => {
        socket.to(roomId).emit('request-project', socket.id);
    });

    socket.on('project-data', (data) => {
        if (data.targetId) {
            socket.to(data.targetId).emit('project-data', data);
        } else {
            socket.to(data.roomId).emit('project-data', data);
        }
    });

    socket.on('request-file', (data) => {
        // Broadcasts to room, host will intercept and send code-update
        socket.to(data.roomId).emit('request-file', data);
    });
});

// Initialize DB and start server
initDB().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
});
