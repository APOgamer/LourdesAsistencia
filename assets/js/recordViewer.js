class RecordViewer {
    constructor(container) {
        this.container = container;
        this.currentData = null;
        this.setupFilters();
        this.loadRegistros();
    }

    setupFilters() {
        // Remover filtros existentes si los hay
        const existingFilters = this.container.querySelector('.filters-container');
        if (existingFilters) {
            existingFilters.remove();
        }

        // Crear contenedor de filtros una sola vez
        const filterContainer = document.createElement('div');
        filterContainer.className = 'filters-container';
        filterContainer.innerHTML = `
            <div class="filter-group">
                <label for="yearFilter">Año:</label>
                <select id="yearFilter">
                    <option value="">Todos</option>
                </select>
            </div>
            <div class="filter-group">
                <label for="sectionFilter">Sección:</label>
                <select id="sectionFilter">
                    <option value="">Todas</option>
                </select>
            </div>
        `;
        
        // Insertar al inicio del contenedor
        this.container.insertBefore(filterContainer, this.container.firstChild);

        // Event listeners para filtros
        document.getElementById('yearFilter').addEventListener('change', () => this.applyFilters());
        document.getElementById('sectionFilter').addEventListener('change', () => this.applyFilters());
    }

    async loadRegistros() {
        try {
            const response = await Auth.fetchAuth('http://localhost:3000/api/registros');
            if (!response.ok) {
                throw new Error('Error al cargar los registros');
            }
            const data = await response.json();
            const userType = localStorage.getItem('userType');
            
            if (userType === 'alumno') {
                // Mostrar indicador de carga
                this.container.innerHTML = '<p>Cargando registros...</p>';
                
                // Procesar registros uno por uno y actualizar la vista
                this.currentData = [];
                for (const registro of data.registros) {
                    try {
                        const tieneAsistencias = await this.verificarAsistencias(registro.id);
                        if (tieneAsistencias) {
                            this.currentData.push(registro);
                            // Actualizar la vista cada vez que encontramos un registro válido
                            this.updateFilters();
                            this.renderRegistros(this.currentData);
                        }
                    } catch (error) {
                        console.error(`Registro ${registro.id} sin datos:`, error);
                    }
                }
            } else {
                this.currentData = data.registros;
                this.updateFilters();
                this.renderRegistros(this.currentData);
            }
        } catch (error) {
            console.error('Error al cargar registros:', error);
            this.container.innerHTML = '<p class="error">Error al cargar los registros</p>';
        }
    }

    async verificarAsistencias(registroId) {
        try {
            const bimestres = [1, 2, 3];
            let tieneAsistencias = false;

            for (const bimestre of bimestres) {
                try {
                    const response = await Auth.fetchAuth(`http://localhost:3000/api/registros/${registroId}/asistencias/${bimestre}`);
                    const data = await response.json();
                    
                    if (response.ok && data.alumnos && data.alumnos.length > 0) {
                        tieneAsistencias = true;
                        break; // Si encuentra asistencias en algún bimestre, no necesita seguir buscando
                    }
                } catch (error) {
                    continue;
                }
            }

            return tieneAsistencias;
        } catch (error) {
            return false;
        }
    }

    updateFilters() {
        if (!this.currentData) return;

        // Actualizar filtro de años
        const years = [...new Set(this.currentData.map(r => r.anio))].sort((a, b) => b - a);
        const yearFilter = document.getElementById('yearFilter');
        yearFilter.innerHTML = '<option value="">Todos</option>' + 
            years.map(year => `<option value="${year}">${year}</option>`).join('');

        // Actualizar filtro de secciones
        const sections = [...new Set(this.currentData.map(r => normalizarSeccion(r.seccion)))].sort();
        const sectionFilter = document.getElementById('sectionFilter');
        sectionFilter.innerHTML = '<option value="">Todas</option>' + 
            sections.map(section => `<option value="${section}">${section}</option>`).join('');

        console.log('Datos disponibles para filtros:', {
            years,
            sections,
            registros: this.currentData.map(r => ({
                id: r.id,
                anio: r.anio,
                seccion: normalizarSeccion(r.seccion)
            }))
        });
    }

    applyFilters() {
        const yearFilter = document.getElementById('yearFilter').value;
        const sectionFilter = document.getElementById('sectionFilter').value;

        let filteredData = [...this.currentData];

        if (yearFilter) {
            const yearNum = parseInt(yearFilter);
            filteredData = filteredData.filter(r => r.anio === yearNum);
        }

        if (sectionFilter) {
            const normalizedFilter = normalizarSeccion(sectionFilter);
            filteredData = filteredData.filter(r => {
                const normalizedSection = normalizarSeccion(r.seccion);
                return normalizedSection === normalizedFilter;
            });
        }

        this.renderRegistros(filteredData);
    }

    async verDetalles(registroId) {
        try {
            const bimestres = [1, 2, 3];
            const asistenciasPorBimestre = {};

            for (const bimestre of bimestres) {
                try {
                    const response = await Auth.fetchAuth(`http://localhost:3000/api/registros/${registroId}/asistencias/${bimestre}`);
                    const data = await response.json();
                    
                    if (!response.ok) {
                        throw new Error(data.error || `Error al cargar el bimestre ${bimestre}`);
                    }

                    if (data.alumnos && data.alumnos.length > 0) {
                        asistenciasPorBimestre[bimestre] = data.alumnos;
                    }
                } catch (error) {
                    console.error(`Error en bimestre ${bimestre}:`, error);
                    continue; // Continuar con el siguiente bimestre si hay error
                }
            }

            // Verificar si se obtuvo algún dato
            if (Object.keys(asistenciasPorBimestre).length === 0) {
                throw new Error('No se encontraron datos de asistencia');
            }

            const tableGenerator = new TableGenerator(document.getElementById('tableContainer'));
            tableGenerator.showResults({
                asistenciasPorPeriodo: Object.entries(asistenciasPorBimestre).map(([bimestre, alumnos]) => ({
                    numero: parseInt(bimestre),
                    asistenciasPorAlumno: alumnos.reduce((acc, alumno) => {
                        acc[alumno.nombre] = alumno;
                        return acc;
                    }, {})
                }))
            });

            document.querySelector('[data-section="upload"]').click();
            showNotification('Detalles cargados correctamente');
        } catch (error) {
            console.error('Error al cargar detalles:', error);
            showNotification('Error al cargar los detalles del registro: ' + error.message, false);
        }
    }

    async renderRegistros(registros) {
        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';

        if (!registros || registros.length === 0) {
            tableContainer.innerHTML = '<p>No hay registros disponibles</p>';
            this.updateTableContainer(tableContainer);
            return;
        }

        // Verificar si es alumno
        const userType = localStorage.getItem('userType');
        
        if (userType === 'alumno') {
            // Crear contenedor de tarjetas
            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'registros-cards';
            
            // Crear tarjetas para cada registro
            registros.forEach(registro => {
                const card = document.createElement('div');
                card.className = 'registro-card';
                card.id = `registro-${registro.id}`;
                
                card.innerHTML = `
                    <div class="registro-card-header">
                        <h3>Sección ${this.escaparHTML(normalizarSeccion(registro.seccion))}</h3>
                        <span class="registro-year">${registro.anio}</span>
                    </div>
                    <div class="registro-card-body">
                        <p><strong>Fecha de Inicio:</strong> ${new Date(registro.fecha_inicio).toLocaleDateString()}</p>
                        <p><strong>Bimestres:</strong> ${registro.total_bimestres}</p>
                    </div>
                    <div class="registro-card-footer">
                        <button onclick="recordViewer.verDetalles(${registro.id})" class="btn-ver">
                            Ver Mis Asistencias
                        </button>
                    </div>
                `;
                
                cardsContainer.appendChild(card);
            });

            tableContainer.appendChild(cardsContainer);
        } else {
            // Mantener el formato de tabla para admin y colaborador
            const table = document.createElement('table');
            table.className = 'registros-table';
            
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Sección</th>
                        <th>Año</th>
                        <th>Fecha Inicio</th>
                        <th>Total Alumnos</th>
                        <th>Total Bimestres</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${registros.map(registro => `
                        <tr id="registro-${registro.id}" class="registro-row">
                            <td>${this.escaparHTML(normalizarSeccion(registro.seccion))}</td>
                            <td>${registro.anio}</td>
                            <td>${new Date(registro.fecha_inicio).toLocaleDateString()}</td>
                            <td>${registro.total_alumnos}</td>
                            <td>${registro.total_bimestres}</td>
                            <td>
                                <button onclick="recordViewer.verDetalles(${registro.id})" class="btn-ver">Ver Detalles</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
            
            tableContainer.appendChild(table);
        }

        this.updateTableContainer(tableContainer);

        // Si es alumno, verificar cada registro
        if (userType === 'alumno') {
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'loading-indicator';
            loadingIndicator.textContent = 'Verificando registros...';
            this.container.appendChild(loadingIndicator);

            for (const registro of registros) {
                try {
                    const tieneAsistencias = await this.verificarAsistencias(registro.id);
                    const card = document.getElementById(`registro-${registro.id}`);
                    if (card) {
                        if (!tieneAsistencias) {
                            card.style.display = 'none';
                        } else {
                            card.style.display = 'block';
                        }
                    }
                } catch (error) {
                    console.error(`Error verificando registro ${registro.id}:`, error);
                    const card = document.getElementById(`registro-${registro.id}`);
                    if (card) {
                        card.style.display = 'none';
                    }
                }
            }

            loadingIndicator.remove();

            // Verificar si hay registros visibles
            const registrosVisibles = document.querySelectorAll('.registro-card[style="display: block"]');
            if (registrosVisibles.length === 0) {
                const noRegistrosMsg = document.createElement('p');
                noRegistrosMsg.className = 'no-registros-msg';
                noRegistrosMsg.textContent = 'No hay registros disponibles para mostrar';
                tableContainer.appendChild(noRegistrosMsg);
            }
        }
    }

    updateTableContainer(newContainer) {
        // Mantener los filtros y actualizar solo la tabla
        const existingTable = this.container.querySelector('.table-container');
        if (existingTable) {
            existingTable.replaceWith(newContainer);
        } else {
            this.container.appendChild(newContainer);
        }
    }

    escaparHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Hacer la instancia accesible globalmente
window.recordViewer = new RecordViewer(document.getElementById('recordsContainer')); 