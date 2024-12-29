class TableGenerator {
    constructor(container) {
        this.container = container;
        this.currentData = null;
        this.filtroAlumno = null;
        this.nombreAlumno = null;
    }

    showResults(data) {
        this.currentData = data;
        this.nombreAlumno = data.nombreAlumno;
        this.container.innerHTML = '';
        
        if (!this.nombreAlumno) {
            this.createAlumnoFilter(data);
        }
        
        this.renderTable(data);
    }

    createAlumnoFilter(data) {
        const alumnos = new Set();
        data.asistenciasPorPeriodo.forEach(periodo => {
            Object.keys(periodo.asistenciasPorAlumno).forEach(alumno => {
                alumnos.add(alumno);
            });
        });

        const filterContainer = document.createElement('div');
        filterContainer.className = 'filtros';
        
        const select = document.createElement('select');
        select.id = 'alumnoFilter';
        select.innerHTML = `
            <option value="">Todos los alumnos</option>
            ${[...alumnos].sort().map(alumno => 
                `<option value="${alumno}">${alumno}</option>`
            ).join('')}
        `;

        select.addEventListener('change', (e) => {
            this.filtroAlumno = e.target.value;
            this.renderTable(this.currentData);
        });

        filterContainer.appendChild(select);
        this.container.appendChild(filterContainer);
    }

    obtenerNombreFormateado(nombreCompleto) {
        // Dividir por la coma y tomar la segunda parte (el nombre)
        const partes = nombreCompleto.split(',');
        if (partes.length === 2) {
            // Tomar solo el nombre (segunda parte) y eliminar espacios extra
            return partes[1].trim();
        }
        return nombreCompleto; // Si no hay coma, devolver el nombre completo
    }

    renderTable(data) {
        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';
        
        const table = document.createElement('table');
        table.className = 'asistencia-table';
        
        // Crear encabezado con información del bimestre
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Alumno</th>
                <th>Semana</th>
                <th>Lun</th>
                <th>Mar</th>
                <th>Mié</th>
                <th>Jue</th>
                <th>Vie</th>
            </tr>
        `;
        table.appendChild(thead);
        
        const tbody = document.createElement('tbody');
        
        data.asistenciasPorPeriodo.forEach(periodo => {
            // Agregar encabezado de bimestre
            const trBimestre = document.createElement('tr');
            trBimestre.innerHTML = `
                <td colspan="7" class="bimestre-header">
                    Bimestre ${periodo.numero}
                </td>
            `;
            tbody.appendChild(trBimestre);

            Object.entries(periodo.asistenciasPorAlumno)
                .filter(([nombre]) => !this.filtroAlumno || nombre === this.filtroAlumno)
                .forEach(([nombre, data]) => {
                    const diasPorSemana = {};
                    data.dias.forEach(dia => {
                        if (!diasPorSemana[dia.semana]) {
                            diasPorSemana[dia.semana] = Array(5).fill('-');
                        }
                        diasPorSemana[dia.semana][dia.diaEnSemana - 1] = dia.estado;
                    });

                    Object.entries(diasPorSemana).forEach(([semana, estados], index) => {
                        const tr = document.createElement('tr');
                        const nombreMostrar = index === 0 ? 
                            this.obtenerNombreFormateado(this.nombreAlumno || nombre) : '';
                        
                        tr.innerHTML = `
                            <td>${nombreMostrar}</td>
                            <td>Semana ${semana}</td>
                            ${estados.map(estado => this.renderCell(estado)).join('')}
                        `;
                        tbody.appendChild(tr);
                    });
                });
        });
        
        table.appendChild(tbody);
        tableContainer.appendChild(table);
        
        const existingTable = this.container.querySelector('.table-container');
        if (existingTable) {
            existingTable.replaceWith(tableContainer);
        } else {
            this.container.appendChild(tableContainer);
        }
    }

    renderCell(estado) {
        if (!estado || estado === '-') return '<td class="estado-none">-</td>';
        const estadoLower = estado.toLowerCase();
        return `<td class="estado-${estadoLower}">${estado}</td>`;
    }
} 