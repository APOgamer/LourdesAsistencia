const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
const config = require('../config/config');

class UserController {
    async getUserByUsername(username) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM usuarios WHERE username = ?',
                [username],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async insertUser(username, hashedPassword, tipo) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO usuarios (username, password, tipo) VALUES (?, ?, ?)',
                [username, hashedPassword, tipo],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async linkAlumnoToUser(userId, alumnoNombre) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO alumno_usuario (usuario_id, alumno_nombre) VALUES (?, ?)',
                [userId, alumnoNombre],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async generateUserPDF(username, password, tipo) {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument();
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            // Agregar logo o encabezado institucional
            doc.fontSize(20).text('Sistema de Asistencia', { align: 'center' });
            doc.moveDown();
            doc.fontSize(16).text('Credenciales de Usuario', { align: 'center' });
            doc.moveDown();

            // Información del usuario
            doc.fontSize(12);
            doc.text('Credenciales de acceso al sistema:', { underline: true });
            doc.moveDown();
            doc.text(`Usuario: ${username}`);
            doc.text(`Contraseña: ${password}`);
            doc.text(`Tipo de usuario: ${tipo}`);
            doc.moveDown();

            // Instrucciones y notas
            doc.moveDown();
            doc.fontSize(10);
            doc.text('Notas importantes:', { underline: true });
            doc.text('1. Guarde estas credenciales en un lugar seguro.');
            doc.text('2. Se recomienda cambiar la contraseña en el primer inicio de sesión.');
            doc.text('3. No comparta sus credenciales con otras personas.');
            
            doc.end();
        });
    }

    async login(req, res) {
        const { username, password } = req.body;

        try {
            const user = await this.getUserByUsername(username);
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign(
                { 
                    id: user.id, 
                    username: user.username, 
                    tipo: user.tipo 
                },
                config.jwtSecret,
                { expiresIn: config.jwtExpiration }
            );

            res.json({ 
                token, 
                user: { 
                    id: user.id, 
                    username: user.username, 
                    tipo: user.tipo 
                } 
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async createUser(req, res) {
        const { username, password, tipo, alumnoNombre } = req.body;

        try {
            // Verificar permisos
            if (req.user.tipo === 'colaborador' && tipo !== 'alumno') {
                return res.status(403).json({ error: 'No autorizado para crear este tipo de usuario' });
            }

            // Verificar si el usuario ya existe
            const existingUser = await this.getUserByUsername(username);
            if (existingUser) {
                return res.status(400).json({ error: 'El nombre de usuario ya existe' });
            }

            const hashedPassword = await bcrypt.hash(password, config.saltRounds);
            const userId = await this.insertUser(username, hashedPassword, tipo);

            if (tipo === 'alumno' && alumnoNombre) {
                await this.linkAlumnoToUser(userId, alumnoNombre);
            }

            // Generar PDF con credenciales
            const pdfBuffer = await this.generateUserPDF(username, password, tipo);

            res.json({
                success: true,
                message: 'Usuario creado exitosamente',
                pdf: pdfBuffer.toString('base64')
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getUsers(req, res) {
        try {
            const users = await new Promise((resolve, reject) => {
                const query = `
                    SELECT u.id, u.username, u.tipo, u.fecha_creacion, 
                           au.alumno_nombre,
                           (SELECT r.seccion 
                            FROM registros r 
                            JOIN asistencias a ON r.id = a.registro_id 
                            WHERE a.alumno = au.alumno_nombre 
                            ORDER BY r.fecha_creacion DESC 
                            LIMIT 1) as seccion
                    FROM usuarios u 
                    LEFT JOIN alumno_usuario au ON u.id = au.usuario_id
                    ORDER BY u.fecha_creacion DESC
                `;
                
                db.all(query, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            res.json({ users });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async resetPassword(req, res) {
        const { userId } = req.params;
        try {
            // Obtener datos del usuario
            const user = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM usuarios WHERE id = ?', [userId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            // Generar nueva contraseña
            const nombres = user.username.split(' ');
            const primerNombre = nombres[0].toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
            const randomNum = Math.floor(Math.random() * 900) + 100;
            const newPassword = `${primerNombre}${randomNum}`;

            // Hashear y guardar nueva contraseña
            const hashedPassword = await bcrypt.hash(newPassword, config.saltRounds);
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE usuarios SET password = ? WHERE id = ?',
                    [hashedPassword, userId],
                    (err) => err ? reject(err) : resolve()
                );
            });

            res.json({
                success: true,
                message: 'Contraseña reseteada exitosamente',
                username: user.username,
                newPassword
            });
        } catch (error) {
            console.error('Error en resetPassword:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getSecciones(req, res) {
        try {
            const secciones = await new Promise((resolve, reject) => {
                db.all(
                    'SELECT DISTINCT seccion FROM registros ORDER BY seccion',
                    [],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            res.json({ secciones });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getAlumnosPorSeccion(req, res) {
        try {
            const { seccion } = req.params;
            const alumnos = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT DISTINCT a.alumno 
                     FROM asistencias a
                     JOIN registros r ON a.registro_id = r.id
                     WHERE r.seccion = ?
                     AND a.alumno NOT IN (SELECT alumno_nombre FROM alumno_usuario)
                     ORDER BY a.alumno`,
                    [seccion],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            res.json({ alumnos });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async deleteUser(req, res) {
        const { userId } = req.params;
        try {
            await db.run('DELETE FROM usuarios WHERE id = ?', [userId]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async generateMissingUsers(req, res) {
        try {
            const { seccion } = req.body;
            
            // Construir la consulta base
            let query = `
                SELECT DISTINCT a.alumno 
                FROM asistencias a
                JOIN registros r ON a.registro_id = r.id
                WHERE a.alumno NOT IN (SELECT alumno_nombre FROM alumno_usuario)
            `;
            
            // Agregar filtro de sección si se especifica
            const params = [];
            if (seccion) {
                query += ` AND r.seccion = ?`;
                params.push(seccion);
            }
            
            // Obtener alumnos sin usuario
            const alumnos = await new Promise((resolve, reject) => {
                db.all(query, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            let created = 0;
            for (const { alumno } of alumnos) {
                try {
                    // Obtener el primer nombre
                    const nombres = alumno.split(',')[1].trim().toLowerCase();
                    const primerNombre = nombres.split(' ')[0]
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, ""); // Eliminar acentos

                    // Generar contraseña
                    const randomNum = Math.floor(Math.random() * 900) + 100;
                    const password = `${primerNombre}${randomNum}`;
                    const hashedPassword = await bcrypt.hash(password, config.saltRounds);

                    // Insertar usuario
                    const result = await new Promise((resolve, reject) => {
                        db.run(
                            'INSERT INTO usuarios (username, password, tipo) VALUES (?, ?, ?)',
                            [primerNombre, hashedPassword, 'alumno'],
                            function(err) {
                                if (err) reject(err);
                                else resolve(this.lastID);
                            }
                        );
                    });

                    // Vincular con alumno
                    await new Promise((resolve, reject) => {
                        db.run(
                            'INSERT INTO alumno_usuario (usuario_id, alumno_nombre) VALUES (?, ?)',
                            [result, alumno],
                            err => err ? reject(err) : resolve()
                        );
                    });

                    created++;
                } catch (error) {
                    console.error(`Error creando usuario para ${alumno}:`, error);
                    continue;
                }
            }

            res.json({ 
                success: true, 
                created,
                message: `Se generaron ${created} usuarios nuevos${seccion ? ` para la sección ${seccion}` : ''}`
            });
        } catch (error) {
            console.error('Error en generateMissingUsers:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async getCredentials(req, res) {
        const { userId } = req.params;
        try {
            const user = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT u.*, au.alumno_nombre 
                    FROM usuarios u 
                    LEFT JOIN alumno_usuario au ON u.id = au.usuario_id 
                    WHERE u.id = ?
                `, [userId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            // Generar nueva contraseña
            const nombres = user.username.split(' ');
            const primerNombre = nombres[0].toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
            const randomNum = Math.floor(Math.random() * 900) + 100;
            const newPassword = `${primerNombre}${randomNum}`;

            // Actualizar contraseña
            const hashedPassword = await bcrypt.hash(newPassword, config.saltRounds);
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE usuarios SET password = ? WHERE id = ?',
                    [hashedPassword, userId],
                    err => err ? reject(err) : resolve()
                );
            });

            res.json({
                username: user.username,
                password: newPassword,
                alumno_nombre: user.alumno_nombre
            });
        } catch (error) {
            console.error('Error en getCredentials:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async generateCredentialsPDF(req, res) {
        const { userId } = req.params;
        try {
            const user = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT u.*, au.alumno_nombre 
                    FROM usuarios u 
                    LEFT JOIN alumno_usuario au ON u.id = au.usuario_id 
                    WHERE u.id = ?
                `, [userId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!user) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            // Generar nueva contraseña
            const nombres = user.username.split(' ');
            const primerNombre = nombres[0].toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
            const randomNum = Math.floor(Math.random() * 900) + 100;
            const newPassword = `${primerNombre}${randomNum}`;

            // Actualizar contraseña
            const hashedPassword = await bcrypt.hash(newPassword, config.saltRounds);
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE usuarios SET password = ? WHERE id = ?',
                    [hashedPassword, userId],
                    err => err ? reject(err) : resolve()
                );
            });

            // Crear contenido HTML para el PDF
            const html = `
                <html>
                <head>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            padding: 40px;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 30px;
                        }
                        .content {
                            margin: 20px 0;
                        }
                        .credentials {
                            background: #f5f5f5;
                            padding: 20px;
                            border-radius: 5px;
                            margin: 20px 0;
                        }
                        .footer {
                            margin-top: 40px;
                            font-size: 12px;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Credenciales de Acceso</h1>
                        <h2>Sistema de Asistencia</h2>
                    </div>
                    
                    <div class="content">
                        ${user.alumno_nombre ? `<p><strong>Alumno:</strong> ${user.alumno_nombre}</p>` : ''}
                        <div class="credentials">
                            <p><strong>Usuario:</strong> ${user.username}</p>
                            <p><strong>Contraseña:</strong> ${newPassword}</p>
                        </div>
                    </div>

                    <div class="footer">
                        <p><strong>Instrucciones:</strong></p>
                        <ol>
                            <li>Ingrese a la plataforma con estas credenciales</li>
                            <li>Se recomienda cambiar la contraseña después del primer inicio de sesión</li>
                            <li>Guarde estas credenciales en un lugar seguro</li>
                        </ol>
                    </div>
                </body>
                </html>
            `;

            // Opciones para el PDF
            const options = {
                format: 'Letter',
                border: {
                    top: "20px",
                    right: "20px",
                    bottom: "20px",
                    left: "20px"
                }
            };

            // Generar PDF
            pdf.create(html, options).toBuffer((err, buffer) => {
                if (err) {
                    console.error('Error generando PDF:', err);
                    return res.status(500).json({ error: 'Error generando PDF' });
                }
                res.json({
                    success: true,
                    pdf: buffer.toString('base64')
                });
            });

        } catch (error) {
            console.error('Error en generateCredentialsPDF:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // ... más métodos del controlador ...
}

module.exports = new UserController(); 