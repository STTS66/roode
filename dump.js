const { Client } = require('pg');
const fs = require('fs');

const connectionString = 'postgresql://neondb_owner:npg_dHsFwb0T1hSI@ep-solitary-smoke-aimoqeek-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function dump() {
    const client = new Client({ connectionString });
    await client.connect();

    const users = await client.query('SELECT * FROM users');
    const projects = await client.query('SELECT * FROM projects');
    const versions = await client.query('SELECT * FROM project_versions');

    const data = {
        users: users.rows,
        projects: projects.rows,
        versions: versions.rows
    };

    fs.writeFileSync('dump.json', JSON.stringify(data, null, 2));
    console.log(`Dumped ${users.rowCount} users, ${projects.rowCount} projects, ${versions.rowCount} versions.`);
    await client.end();
}

dump().catch(console.error);
