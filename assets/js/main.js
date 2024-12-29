document.addEventListener('DOMContentLoaded', () => {
    const excelReader = new ExcelReader();
    const tableGenerator = new TableGenerator(document.getElementById('tableContainer'));
    const guardarBtn = document.getElementById('guardarSistema');
    const anioSelect = document.getElementById('anioRegistro');
    const fechaInicio = document.getElementById('fechaInicio');
    let datosActuales = null;

    // Cargar años disponibles
    const cargarAnios = () => {
        const currentYear = new Date().getFullYear();
        anioSelect.innerHTML = '<option value="">Seleccione año</option>';
        for (let year = currentYear; year >= currentYear - 5; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            anioSelect.appendChild(option);
        }
    };

    cargarAnios();

    // Validar campos requeridos
    const validarCampos = () => {
        return anioSelect.value && fechaInicio.value && datosActuales;
    };

    // Actualizar estado del botón
    const actualizarBotonGuardar = () => {
        guardarBtn.disabled = !validarCampos();
    };

    // Event listeners para campos
    anioSelect.addEventListener('change', actualizarBotonGuardar);
    fechaInicio.addEventListener('change', actualizarBotonGuardar);

    document.getElementById('excelFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            datosActuales = await excelReader.readFile(file);
            tableGenerator.showResults(datosActuales);
            actualizarBotonGuardar();
        } catch (error) {
            console.error('Error al procesar el archivo:', error);
            alert('Error al procesar el archivo. Por favor, verifica que sea un archivo Excel válido.');
            datosActuales = null;
            actualizarBotonGuardar();
        }
    });

    // Función para mostrar notificaciones
    function showNotification(message, isSuccess = true) {
        Toastify({
            text: message,
            duration: 3000,
            gravity: "top",
            position: "right",
            style: {
                background: isSuccess ? "#4CAF50" : "#f44336",
                borderRadius: "8px",
                boxShadow: "0 2px 5px rgba(0,0,0,0.2)"
            }
        }).showToast();
    }

    // En el evento click del botón guardar
    guardarBtn.addEventListener('click', async () => {
        if (!validarCampos()) {
            showNotification('Por favor, complete el año y la fecha de inicio', false);
            return;
        }

        try {
            guardarBtn.disabled = true;
            guardarBtn.textContent = 'Guardando...';

            const user = JSON.parse(localStorage.getItem('user'));
            if (!user || !['admin', 'colaborador'].includes(user.tipo)) {
                throw new Error('No tiene permisos para realizar esta acción');
            }

            const datosParaGuardar = {
                anio: parseInt(anioSelect.value),
                fechaInicio: fechaInicio.value,
                seccion: datosActuales.seccion,
                asistenciasPorPeriodo: datosActuales.asistenciasPorPeriodo
            };

            const response = await Auth.fetchAuth('http://localhost:3000/api/guardar-registro', {
                method: 'POST',
                body: JSON.stringify(datosParaGuardar)
            });

            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(responseData.error || 'Error desconocido del servidor');
            }

            showNotification('Registro guardado exitosamente');
            
            // Limpiar formulario
            document.getElementById('excelFile').value = '';
            anioSelect.value = '';
            fechaInicio.value = '';
            datosActuales = null;
            tableGenerator.showResults({ asistenciasPorPeriodo: [] });

        } catch (error) {
            console.error('Error detallado:', error);
            showNotification(error.message, false);
        } finally {
            guardarBtn.disabled = false;
            guardarBtn.textContent = 'Guardar en el Sistema';
        }
    });

    // Navegación
    const navButtons = document.querySelectorAll('.nav-button');
    const sections = document.querySelectorAll('.section');
    
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetSection = button.dataset.section;
            
            // Actualizar botones
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Actualizar secciones
            sections.forEach(section => {
                if (section.id === `${targetSection}Section`) {
                    section.classList.add('active');
                } else {
                    section.classList.remove('active');
                }
            });
        });
    });

    // Actualizar la función verDetalles
    window.verDetalles = async (registroId) => {
        try {
            const bimestres = [1, 2, 3];
            const asistenciasPorBimestre = {};

            for (const bimestre of bimestres) {
                const response = await Auth.fetchAuth(`http://localhost:3000/api/registros/${registroId}/asistencias/${bimestre}`);
                if (!response.ok) {
                    throw new Error(`Error al cargar el bimestre ${bimestre}`);
                }
                const data = await response.json();
                if (data.alumnos && data.alumnos.length > 0) {
                    asistenciasPorBimestre[bimestre] = data.alumnos;
                }
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
    };
});

// Agregar el script de gestión de usuarios
document.write('<script src="assets/js/userManager.js"></script>'); 