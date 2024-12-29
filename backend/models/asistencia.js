const db = require('../config/database');

class Asistencia {
    static async guardarAsistencia(alumnoId, fecha, bimestre, semana, estado) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO asistencias (alumno_id, fecha, bimestre, semana, estado)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(alumno_id, fecha) 
                DO UPDATE SET estado = excluded.estado
            `;
            
            db.run(sql, [alumnoId, fecha, bimestre, semana, estado], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    static async obtenerAsistenciasPorSeccion(seccionId, bimestre) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT a.nombre, ast.fecha, ast.estado, ast.semana
                FROM asistencias ast
                JOIN alumnos a ON a.id = ast.alumno_id
                WHERE a.seccion_id = ? AND ast.bimestre = ?
                ORDER BY a.nombre, ast.fecha
            `;
            
            db.all(sql, [seccionId, bimestre], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = Asistencia; 