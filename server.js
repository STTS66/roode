const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// --- API ROUTES ---

// Get all projects
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching projects' });
    }
});

// Create a new project
app.post('/api/projects', async (req, res) => {
    const { name, folder_path } = req.body;
    if (!name || !folder_path) {
        return res.status(400).json({ error: 'Name and folder_path are required' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO projects (name, folder_path) VALUES ($1, $2) RETURNING *',
            [name, folder_path]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error creating project' });
    }
});

// Update last opened file for a project
app.patch('/api/projects/:id/last-file', async (req, res) => {
    const { id } = req.params;
    const { last_file } = req.body;

    try {
        const result = await pool.query(
            'UPDATE projects SET last_file = $1 WHERE id = $2 RETURNING *',
            [last_file, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error updating last file' });
    }
});

// Delete a project
app.delete('/api/projects/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.json({ message: 'Project deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error deleting project' });
    }
});

// Default route to serve the frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize DB and start server
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
});
