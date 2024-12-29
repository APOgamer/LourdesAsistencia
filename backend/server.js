const express = require('express');
const cors = require('cors');
const db = require('./config/database');
const bodyParser = require('body-parser');
const { authMiddleware, checkRole } = require('./middleware/auth');
const userController = require('./controllers/userController');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({limit: '100mb'}));
app.use(bodyParser.urlencoded({limit: '100mb', extended: true}));

// Rutas públicas
app.post('/api/login', (req, res) => userController.login(req, res));

// Middleware de autenticación para rutas protegidas
app.use('/api', (req, res, next) => {
    if (req.path === '/login') {
        return next();
    }
    authMiddleware(req, res, next);
});

// Rutas de usuarios
app.get('/api/users', checkRole(['admin']), (req, res) => userController.getUsers(req, res));
app.post('/api/users', checkRole(['admin', 'colaborador']), (req, res) => userController.createUser(req, res));
app.post('/api/users/:userId/reset-password', checkRole(['admin']), (req, res) => userController.resetPassword(req, res));

// Ruta para guardar registro
app.post('/api/guardar-registro', checkRole(['admin', 'colaborador']), async (req, res) => {
    try {
        const { anio, fechaInicio, seccion, asistenciasPorPeriodo } = req.body;
        const userId = req.user.id;

        // Limpiar completamente la sección antes de guardar
        const seccionNormalizada = seccion.trim()
            .replace(/[°º"']/g, '')  // Eliminar °, º y comillas
            .replace(/\s+/g, '')     // Eliminar espacios
            .toUpperCase();

        console.log('Guardando registro:', {
            anio,
            seccionOriginal: seccion,
            seccionNormalizada,
            fechaInicio
        });

        await db.run('BEGIN TRANSACTION');

        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO registros (anio, seccion, fecha_inicio, creado_por) VALUES (?, ?, ?, ?)',
                [anio, seccionNormalizada, fechaInicio, userId],
                function(err) {
                    if (err) {
                        console.error('Error al insertar registro:', err);
                        reject(err);
                    } else {
                        resolve(this);
                    }
                }
            );
        });

        const registroId = result.lastID;

        // Insertar asistencias
        for (const periodo of asistenciasPorPeriodo) {
            for (const [alumno, data] of Object.entries(periodo.asistenciasPorAlumno)) {
                for (const dia of data.dias) {
                    await new Promise((resolve, reject) => {
                        // Convertir el estado a minúsculas solo al guardar
                        const estado = (dia.estado || '').toLowerCase();
                        db.run(
                            `INSERT INTO asistencias 
                            (registro_id, alumno, bimestre, semana, dia_semana, estado) 
                            VALUES (?, ?, ?, ?, ?, ?)`,
                            [registroId, alumno, periodo.numero, dia.semana, dia.diaEnSemana, estado],
                            (err) => {
                                if (err) {
                                    console.error('Error al insertar asistencia:', err);
                                    console.error('Datos:', {
                                        registroId, alumno, bimestre: periodo.numero,
                                        semana: dia.semana, diaEnSemana: dia.diaEnSemana,
                                        estado, estadoOriginal: dia.estado
                                    });
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            }
                        );
                    });
                }
            }
        }

        await db.run('COMMIT');
        res.json({ 
            success: true, 
            message: 'Registro guardado correctamente', 
            registroId 
        });
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error completo:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Ruta para obtener registros
app.get('/api/registros', checkRole(['admin', 'colaborador', 'alumno']), async (req, res) => {
    try {
        const userId = req.user.id;
        const userType = req.user.tipo;

        let query = '';
        let params = [];

        if (userType === 'alumno') {
            query = `
                SELECT DISTINCT
                    r.id,
                    r.anio,
                    TRIM(r.seccion) as seccion,
                    r.fecha_inicio,
                    r.fecha_creacion,
                    r.creado_por,
                    (
                        SELECT COUNT(DISTINCT a2.alumno)
                        FROM asistencias a2
                        WHERE a2.registro_id = r.id
                    ) as total_alumnos,
                    (
                        SELECT COUNT(DISTINCT a3.bimestre)
                        FROM asistencias a3
                        WHERE a3.registro_id = r.id
                    ) as total_bimestres
                FROM registros r
                JOIN asistencias a ON r.id = a.registro_id
                JOIN alumno_usuario au ON au.usuario_id = ?
                WHERE a.alumno = au.alumno_nombre
                GROUP BY r.id
                ORDER BY r.fecha_creacion DESC
            `;
            params = [userId];
        } else {
            query = `
                SELECT 
                    r.id,
                    r.anio,
                    TRIM(r.seccion) as seccion,
                    r.fecha_inicio,
                    r.fecha_creacion,
                    r.creado_por,
                    COUNT(DISTINCT a.alumno) as total_alumnos,
                    COUNT(DISTINCT a.bimestre) as total_bimestres
                FROM registros r
                LEFT JOIN asistencias a ON r.id = a.registro_id
                GROUP BY r.id
                ORDER BY r.fecha_creacion DESC
            `;
        }

        const registros = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) {
                    console.error('Error al obtener registros:', err);
                    reject(err);
                } else {
                    const processedRows = rows.map(row => ({
                        ...row,
                        seccion: row.seccion.trim()
                            .replace(/[°º"']/g, '')
                            .replace(/\s+/g, '')
                            .toUpperCase()
                    }));
                    resolve(processedRows);
                }
            });
        });

        res.json({ registros });
    } catch (error) {
        console.error('Error al obtener registros:', error);
        res.status(500).json({ error: error.message });
    }
});

// Ruta para obtener asistencias de un registro
app.get('/api/registros/:registroId/asistencias/:bimestre', checkRole(['admin', 'colaborador', 'alumno']), async (req, res) => {
    try {
        const { registroId, bimestre } = req.params;
        const userId = req.user.id;
        const userType = req.user.tipo;

        let query = `
            SELECT DISTINCT a.alumno, a.bimestre, a.semana, a.dia_semana, a.estado
            FROM asistencias a
        `;

        let params = [registroId, bimestre];

        if (userType === 'alumno') {
            query += `
                JOIN alumno_usuario au ON a.alumno = au.alumno_nombre
                WHERE a.registro_id = ? AND a.bimestre = ? AND au.usuario_id = ?
            `;
            params.push(userId);
        } else {
            query += 'WHERE a.registro_id = ? AND a.bimestre = ?';
        }

        query += ' ORDER BY a.alumno, a.semana, a.dia_semana';

        const asistencias = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);  // Asegurar que siempre devolvemos un array
            });
        });

        // Procesar los datos
        const alumnosPorBimestre = {};
        asistencias.forEach(row => {
            if (!alumnosPorBimestre[row.alumno]) {
                alumnosPorBimestre[row.alumno] = {
                    nombre: row.alumno,
                    dias: []
                };
            }
            alumnosPorBimestre[row.alumno].dias.push({
                semana: row.semana,
                diaEnSemana: row.dia_semana,
                estado: row.estado.toUpperCase()
            });
        });

        res.json({ alumnos: Object.values(alumnosPorBimestre) });
    } catch (error) {
        console.error('Error al obtener asistencias:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rutas para gestión de usuarios y secciones
app.get('/api/users', checkRole(['admin']), (req, res) => userController.getUsers(req, res));
app.post('/api/users', checkRole(['admin', 'colaborador']), (req, res) => userController.createUser(req, res));
app.post('/api/users/:userId/reset-password', checkRole(['admin']), (req, res) => userController.resetPassword(req, res));

// Nuevas rutas para secciones y alumnos
app.get('/api/secciones', checkRole(['admin', 'colaborador']), async (req, res) => {
    try {
        const secciones = await new Promise((resolve, reject) => {
            db.all(
                `SELECT DISTINCT r.seccion, r.anio 
                 FROM registros r 
                 INNER JOIN asistencias a ON r.id = a.registro_id
                 GROUP BY r.seccion, r.anio
                 ORDER BY r.anio DESC, r.seccion ASC`,
                [],
                (err, rows) => {
                    if (err) {
                        console.error('Error al obtener secciones:', err);
                        reject(err);
                    } else {
                        console.log('Secciones encontradas:', rows);
                        resolve(rows);
                    }
                }
            );
        });
        res.json({ secciones });
    } catch (error) {
        console.error('Error al obtener secciones:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/secciones/:seccion/alumnos', checkRole(['admin', 'colaborador']), async (req, res) => {
    try {
        const { seccion } = req.params;
        const alumnos = await new Promise((resolve, reject) => {
            db.all(
                `SELECT DISTINCT a.alumno 
                 FROM asistencias a
                 INNER JOIN registros r ON a.registro_id = r.id
                 WHERE r.seccion = ?
                 AND NOT EXISTS (
                     SELECT 1 
                     FROM alumno_usuario au 
                     WHERE au.alumno_nombre = a.alumno
                 )
                 GROUP BY a.alumno
                 ORDER BY a.alumno`,
                [seccion],
                (err, rows) => {
                    if (err) {
                        console.error('Error al obtener alumnos:', err);
                        reject(err);
                    } else {
                        console.log(`Alumnos encontrados para sección ${seccion}:`, rows);
                        resolve(rows);
                    }
                }
            );
        });

        res.json({ alumnos: alumnos || [] });
    } catch (error) {
        console.error('Error al obtener alumnos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Agregar esta ruta para verificar alumnos disponibles
app.get('/api/debug/alumnos/:seccion', checkRole(['admin']), async (req, res) => {
    try {
        const { seccion } = req.params;
        
        // Todos los alumnos en la sección
        const todosAlumnos = await new Promise((resolve, reject) => {
            db.all(
                `SELECT DISTINCT a.alumno 
                 FROM asistencias a
                 JOIN registros r ON a.registro_id = r.id
                 WHERE r.seccion = ?
                 GROUP BY a.alumno`,
                [seccion],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        // Alumnos ya asignados
        const alumnosAsignados = await new Promise((resolve, reject) => {
            db.all(
                'SELECT alumno_nombre FROM alumno_usuario',
                [],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        res.json({
            seccion,
            total_alumnos: todosAlumnos.length,
            alumnos_asignados: alumnosAsignados.length,
            alumnos_disponibles: todosAlumnos.filter(a => 
                !alumnosAsignados.some(aa => aa.alumno_nombre === a.alumno)
            ),
            debug: {
                todos_alumnos: todosAlumnos,
                alumnos_asignados: alumnosAsignados
            }
        });
    } catch (error) {
        console.error('Error en debug de alumnos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rutas protegidas
app.delete('/api/users/:userId', checkRole(['admin']), (req, res) => userController.deleteUser(req, res));
app.post('/api/users/generate-missing', checkRole(['admin']), (req, res) => userController.generateMissingUsers(req, res));

// Agregar estas rutas
app.get('/api/users/:userId/credentials-pdf', checkRole(['admin']), (req, res) => userController.generateCredentialsPDF(req, res));
app.get('/api/users/:userId/credentials', checkRole(['admin']), (req, res) => userController.getCredentials(req, res));

// Iniciar servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
}); 