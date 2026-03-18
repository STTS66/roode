const fs = require('fs');
const crypto = require('crypto');

const data = JSON.parse(fs.readFileSync('dump.json', 'utf-8'));

function uuid() {
    return crypto.randomUUID();
}

const userMap = {}; // old_id -> new_uuid

let sql = `-- Migration Script\n\n`;

// 1. Users + Identities — в одном блоке, чтобы при дубликате пропускались оба
sql += `-- Insert Users into auth.users\n`;
for (const u of data.users) {
    const newId = uuid();
    userMap[u.id] = newId;
    const email = `${u.username}@roode.app`;
    const pass = u.password.replace(/'/g, "''");
    const identityId = uuid();

    // Один DO-блок для user + identity. Если user дублируется — весь блок откатывается
    sql += `DO $wrap$ BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (
    '${newId}',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    '${email}',
    '${pass}',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"username":"${u.username}"}',
    '${u.created_at}',
    '${u.created_at}'
  );
  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  OVERRIDING SYSTEM VALUE
  VALUES (
    '${identityId}',
    '${newId}',
    '${newId}',
    '{"sub":"${newId}","email":"${email}"}',
    'email',
    now(),
    '${u.created_at}',
    '${u.created_at}'
  );
EXCEPTION WHEN unique_violation THEN NULL;
END $wrap$;\n`;
}

sql += `\n-- Insert Projects\n`;
for (const p of data.projects) {
    const newUserId = userMap[p.user_id];
    if (!newUserId) continue;

    const name = p.name.replace(/'/g, "''");
    const folder = p.folder_path.replace(/'/g, "''");
    const lastFile = p.last_file ? p.last_file.replace(/'/g, "''") : null;
    const lastFileStr = lastFile ? `'${lastFile}'` : 'NULL';

    sql += `DO $wrap$ BEGIN
  INSERT INTO public.projects (id, user_id, name, folder_path, last_file, created_at)
  OVERRIDING SYSTEM VALUE
  VALUES (
    ${p.id},
    '${newUserId}',
    '${name}',
    '${folder}',
    ${lastFileStr},
    '${p.created_at}'
  );
EXCEPTION WHEN unique_violation OR foreign_key_violation THEN NULL;
END $wrap$;\n`;
}

sql += `\n-- Insert Versions\n`;
for (const v of data.versions) {
    const label = v.label ? v.label.replace(/'/g, "''") : null;
    const labelStr = label ? `'${label}'` : 'NULL';
    const files = v.files.replace(/'/g, "''");

    sql += `DO $wrap$ BEGIN
  INSERT INTO public.project_versions (id, project_id, version, label, files, created_at)
  OVERRIDING SYSTEM VALUE
  VALUES (
    ${v.id},
    ${v.project_id},
    '${v.version}',
    ${labelStr},
    '${files}',
    '${v.created_at}'
  );
EXCEPTION WHEN unique_violation OR foreign_key_violation THEN NULL;
END $wrap$;\n`;
}

// Reset sequences
sql += `\n-- Reset Sequences\n`;
sql += `SELECT setval('projects_id_seq', (SELECT MAX(id) FROM public.projects));\n`;
sql += `SELECT setval('project_versions_id_seq', (SELECT MAX(id) FROM public.project_versions));\n`;

fs.writeFileSync('migration.sql', sql);
console.log('Done!');
