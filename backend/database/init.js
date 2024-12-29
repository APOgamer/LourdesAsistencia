const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const dbPath = path.join(__dirname, 'asistencia.db');

// Eliminar base de datos existente si existe
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
}

const db = new sqlite3.Database(dbPath);

// Leer y ejecutar el archivo SQL de inicialización
const initSQL = fs.readFileSync(path.join(__dirname, 'migrations', 'init.sql'), 'utf8');

const createAdminUser = async () => {
    const hashedPassword = await bcrypt.hash('administratorASIST676#', config.saltRounds);
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO usuarios (username, password, tipo) VALUES (?, ?, ?)',
            ['admin', hashedPassword, 'admin'],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};

db.serialize(async () => {
    // Ejecutar las sentencias SQL de inicialización
    db.exec(initSQL, async (err) => {
        if (err) {
            console.error('Error al inicializar la base de datos:', err);
            process.exit(1);
        }

        try {
            await createAdminUser();
            console.log('Base de datos inicializada correctamente');
            console.log('Usuario admin creado exitosamente');
        } catch (error) {
            console.error('Error durante la inicialización:', error);
        } finally {
            db.close();
        }
    });
}); 