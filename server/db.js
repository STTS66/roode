const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(file, defaultVal = []) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2));
        return defaultVal;
    }
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content || JSON.stringify(defaultVal));
    } catch (e) {
        console.error(`Error reading ${file}:`, e);
        return defaultVal;
    }
}

function writeJSON(file, data) {
    const filePath = path.join(DATA_DIR, file);
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`Error writing ${file}:`, e);
    }
}

const db = {
    // === Users ===
    findUserByUsername(username) {
        if (!username) return null;
        const users = readJSON('users.json');
        return users.find(u => u.username.toLowerCase() === username.toLowerCase());
    },
    findUserById(id) {
        const users = readJSON('users.json');
        return users.find(u => u.id === Number(id));
    },
    createUser(username, passwordHash) {
        const users = readJSON('users.json');
        const id = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
        const newUser = {
            id,
            username,
            password: passwordHash,
            created_at: new Date().toISOString(),
            last_project_id: null
        };
        users.push(newUser);
        writeJSON('users.json', users);
        return newUser;
    },

    // === Projects ===
    findProjectsByUserId(userId) {
        const projects = readJSON('projects.json');
        return projects
            .filter(p => p.user_id === Number(userId))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    createProject(userId, name, folderPath) {
        const projects = readJSON('projects.json');
        const id = projects.length > 0 ? Math.max(...projects.map(p => p.id)) + 1 : 1;
        const newProject = {
            id,
            user_id: Number(userId),
            name,
            folder_path: folderPath || '',
            last_file: null,
            created_at: new Date().toISOString()
        };
        projects.push(newProject);
        writeJSON('projects.json', projects);
        return newProject;
    },
    updateProject(id, userId, updates) {
        const projects = readJSON('projects.json');
        const project = projects.find(p => p.id === Number(id) && p.user_id === Number(userId));
        if (!project) return null;
        if (updates.name !== undefined) project.name = updates.name;
        if (updates.folder_path !== undefined) project.folder_path = updates.folder_path;
        if (updates.last_file !== undefined) project.last_file = updates.last_file;
        writeJSON('projects.json', projects);
        return project;
    },
    deleteProject(id, userId) {
        let projects = readJSON('projects.json');
        const initialLen = projects.length;
        projects = projects.filter(p => !(p.id === Number(id) && p.user_id === Number(userId)));
        if (projects.length === initialLen) return false;
        writeJSON('projects.json', projects);
        
        // Also cascade delete project versions
        let versions = readJSON('project_versions.json');
        versions = versions.filter(v => v.project_id !== Number(id));
        writeJSON('project_versions.json', versions);
        
        return true;
    },

    // === Project Versions ===
    findVersionsByProjectId(projectId, userId) {
        const projects = readJSON('projects.json');
        const project = projects.find(p => p.id === Number(projectId) && p.user_id === Number(userId));
        if (!project) return [];
        
        const versions = readJSON('project_versions.json');
        return versions
            .filter(v => v.project_id === Number(projectId))
            .map(({ id, version, label, created_at }) => ({ id, version, label, created_at }))
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    findVersionById(id, userId) {
        const versions = readJSON('project_versions.json');
        const version = versions.find(v => v.id === Number(id));
        if (!version) return null;
        
        const projects = readJSON('projects.json');
        const project = projects.find(p => p.id === version.project_id && p.user_id === Number(userId));
        if (!project) return null;
        
        return version;
    },
    createVersion(projectId, versionString, label, files) {
        const versions = readJSON('project_versions.json');
        const id = versions.length > 0 ? Math.max(...versions.map(v => v.id)) + 1 : 1;
        const newVersion = {
            id,
            project_id: Number(projectId),
            version: versionString,
            label: label || null,
            files: typeof files === 'string' ? files : JSON.stringify(files),
            created_at: new Date().toISOString()
        };
        versions.push(newVersion);
        writeJSON('project_versions.json', versions);
        return newVersion;
    },
    deleteVersion(id, userId) {
        const versions = readJSON('project_versions.json');
        const idx = versions.findIndex(v => v.id === Number(id));
        if (idx === -1) return false;
        
        const projects = readJSON('projects.json');
        const project = projects.find(p => p.id === versions[idx].project_id && p.user_id === Number(userId));
        if (!project) return false;
        
        versions.splice(idx, 1);
        writeJSON('project_versions.json', versions);
        return true;
    },

    // === Notes ===
    findNotesByUserId(userId) {
        const notes = readJSON('notes.json');
        return notes
            .filter(n => n.user_id === Number(userId))
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    },
    createNote(userId, title, content) {
        const notes = readJSON('notes.json');
        const id = notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1;
        const newNote = {
            id,
            user_id: Number(userId),
            title: title || 'Без названия',
            content: content || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        notes.push(newNote);
        writeJSON('notes.json', notes);
        return newNote;
    },
    updateNote(id, userId, title, content) {
        const notes = readJSON('notes.json');
        const note = notes.find(n => n.id === Number(id) && n.user_id === Number(userId));
        if (!note) return null;
        if (title !== undefined) note.title = title || 'Без названия';
        if (content !== undefined) note.content = content || '';
        note.updated_at = new Date().toISOString();
        writeJSON('notes.json', notes);
        return note;
    },
    deleteNote(id, userId) {
        let notes = readJSON('notes.json');
        const initialLen = notes.length;
        notes = notes.filter(n => !(n.id === Number(id) && n.user_id === Number(userId)));
        if (notes.length === initialLen) return false;
        writeJSON('notes.json', notes);
        return true;
    },
    
    // === Health check ===
    checkHealth() {
        try {
            readJSON('users.json');
            return true;
        } catch (e) {
            return false;
        }
    }
};

module.exports = db;
