class ExcelReader {
    constructor() {
        this.workbook = null;
        this.periodos = [
            { start: 'BH', end: 'CZ' },
            { start: 'DJ', end: 'FB' },
            { start: 'FL', end: 'HC' }
        ];
    }

    async readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    this.workbook = XLSX.read(data, { type: 'array' });
                    
                    const targetSheet = this.findTargetSheet();
                    if (!targetSheet) {
                        throw new Error('No se encontró una hoja válida');
                    }

                    // Obtener información básica
                    const seccionOriginal = this.getCellValue(targetSheet, 'CD5');
                    const seccion = normalizarSeccion(seccionOriginal);
                    const bimestreTexto = this.getCellValue(targetSheet, 'CO5');
                    const semanaInicial = parseInt(this.getCellValue(targetSheet, 'BH7')) || 1;

                    // Convertir texto del bimestre a número
                    const bimestreInicial = this.convertirBimestreANumero(bimestreTexto);

                    // Obtener lista de alumnos
                    const alumnos = this.obtenerListaAlumnos(targetSheet);

                    // Procesar asistencias con semanas consecutivas
                    const asistenciasPorPeriodo = this.procesarAsistencias(targetSheet, alumnos, bimestreInicial, semanaInicial);

                    resolve({
                        seccion,
                        bimestreInicial,
                        semanaInicial,
                        asistenciasPorPeriodo
                    });
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    convertirBimestreANumero(texto) {
        const bimestres = {
            'PRIMERO': 1,
            'SEGUNDO': 2,
            'TERCERO': 3,
            'CUARTO': 4
        };
        return bimestres[texto.toUpperCase()] || 1;
    }

    procesarAsistencias(sheet, alumnos, bimestreInicial, semanaInicial) {
        const asistenciasPorPeriodo = [];
        let semanaActual = semanaInicial;

        this.periodos.forEach((periodo, periodoIndex) => {
            const bimestreActual = bimestreInicial + periodoIndex;
            const asistenciasPeriodo = {
                numero: bimestreActual,
                asistenciasPorAlumno: {}
            };

            alumnos.forEach(alumno => {
                const asistenciasAlumno = {
                    nombre: alumno.nombre,
                    dias: []
                };

                let colIndex = this.columnToIndex(periodo.start);
                const endColIndex = this.columnToIndex(periodo.end);
                let diaActual = 0;

                while (colIndex <= endColIndex && diaActual < 45) {
                    const colLetra = this.indexToColumn(colIndex);
                    const cellRef = `${colLetra}${alumno.fila}`;
                    const estado = this.getCellValue(sheet, cellRef);

                    const semana = Math.floor(diaActual / 5) + semanaActual;
                    const diaEnSemana = (diaActual % 5) + 1;

                    if (estado && 'ATIJ'.includes(estado)) {
                        asistenciasAlumno.dias.push({
                            dia: diaActual + 1,
                            semana,
                            diaEnSemana,
                            estado
                        });
                    }
                    
                    colIndex++;
                    diaActual++;
                }

                if (asistenciasAlumno.dias.length > 0) {
                    asistenciasPeriodo.asistenciasPorAlumno[alumno.nombre] = asistenciasAlumno;
                }
            });

            // Actualizar semanaActual para el siguiente periodo
            semanaActual += 9; // 45 días = 9 semanas
            asistenciasPorPeriodo.push(asistenciasPeriodo);
        });

        return asistenciasPorPeriodo;
    }

    obtenerListaAlumnos(sheet) {
        const alumnos = [];
        for (let row = 12; row <= 51; row++) {
            const nombre = this.getCellValue(sheet, `B${row}`);
            if (!nombre) break;
            alumnos.push({ nombre, fila: row });
        }
        return alumnos;
    }

    findTargetSheet() {
        const sheets = this.workbook.SheetNames;
        if (sheets.length === 1) {
            return this.workbook.Sheets[sheets[0]];
        }
        
        const asistSheet = sheets.find(name => name.startsWith('ASIST'));
        return asistSheet ? this.workbook.Sheets[asistSheet] : null;
    }

    columnToIndex(col) {
        let result = 0;
        for (let i = 0; i < col.length; i++) {
            result = result * 26 + (col.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
        }
        return result;
    }

    indexToColumn(index) {
        let temp = index;
        let letter = '';
        while (temp > 0) {
            const remainder = (temp - 1) % 26;
            letter = String.fromCharCode(65 + remainder) + letter;
            temp = Math.floor((temp - 1) / 26);
        }
        return letter || 'A';
    }

    getCellValue(sheet, cell) {
        if (!sheet[cell]) return null;
        const value = sheet[cell].v;
        // Asegurarse de que solo devolvemos strings de un carácter para estados
        if (typeof value === 'string' && value.length === 1) {
            return value.toUpperCase();
        }
        return value;
    }
} 