-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('admin', 'colaborador', 'alumno')),
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de relación alumno-usuario
CREATE TABLE IF NOT EXISTS alumno_usuario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    alumno_nombre TEXT NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    UNIQUE(alumno_nombre)
);

-- Tabla de registros
CREATE TABLE IF NOT EXISTS registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anio INTEGER NOT NULL,
    seccion TEXT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    creado_por INTEGER,
    FOREIGN KEY (creado_por) REFERENCES usuarios(id)
);

-- Agregar índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_registros_anio ON registros(anio);
CREATE INDEX IF NOT EXISTS idx_registros_seccion ON registros(seccion);
CREATE INDEX IF NOT EXISTS idx_registros_anio_seccion ON registros(anio, seccion);

-- Tabla de asistencias
CREATE TABLE IF NOT EXISTS asistencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    registro_id INTEGER NOT NULL,
    alumno TEXT NOT NULL,
    bimestre INTEGER NOT NULL,
    semana INTEGER NOT NULL,
    dia_semana INTEGER NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('a', 't', 'i', 'j', '-')),
    FOREIGN KEY (registro_id) REFERENCES registros(id)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_asistencias_registro ON asistencias(registro_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_alumno ON asistencias(alumno);
CREATE INDEX IF NOT EXISTS idx_asistencias_bimestre ON asistencias(bimestre);
CREATE INDEX IF NOT EXISTS idx_alumno_usuario_alumno ON alumno_usuario(alumno_nombre);
CREATE INDEX IF NOT EXISTS idx_alumno_usuario_usuario ON alumno_usuario(usuario_id);

-- Después de la tabla registros
DROP INDEX IF EXISTS idx_registros_seccion_normalizada;
CREATE INDEX idx_registros_seccion_normalizada ON registros(
    REPLACE(
        REPLACE(
            UPPER(TRIM(seccion)),
            '°', ''
        ),
        'º', ''
    )
); 