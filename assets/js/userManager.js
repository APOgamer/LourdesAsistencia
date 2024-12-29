class UserManager {
    constructor() {
        this.setupEventListeners();
        this.loadUsers();
    }

    setupEventListeners() {
        // Botón para abrir modal
        document.getElementById('createUserBtn').addEventListener('click', () => {
            this.showModal();
        });

        // Cerrar modal
        document.querySelector('.close').addEventListener('click', () => {
            this.hideModal();
        });

        // Formulario de creación
        document.getElementById('createUserForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createUser();
        });

        // Generar contraseña aleatoria
        document.getElementById('generatePassword').addEventListener('click', () => {
            const password = this.generateRandomPassword();
            document.getElementById('newPassword').value = password;
        });

        // Cambio en tipo de usuario
        document.getElementById('newUserType').addEventListener('change', (e) => {
            const alumnoFields = document.querySelectorAll('.alumno-fields');
            const showFields = e.target.value === 'alumno';
            alumnoFields.forEach(field => field.style.display = showFields ? 'block' : 'none');
            
            if (showFields) {
                this.loadSecciones();
            }
        });

        // Cambio en sección
        document.getElementById('seccionAlumno').addEventListener('change', (e) => {
            if (e.target.value) {
                this.loadAlumnosPorSeccion(e.target.value);
            }
        });

        // Filtros
        document.getElementById('userTypeFilter').addEventListener('change', () => this.filterUsers());
        document.getElementById('searchUser').addEventListener('input', () => this.filterUsers());

        // Botón para generar alumnos faltantes
        const generateBtn = document.getElementById('generateMissingBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.showGenerateModal());
        }

        // Form de generar usuarios
        document.getElementById('generateUsersForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.generarAlumnosFaltantes();
        });

        // Cerrar modal de generar usuarios
        document.querySelector('#generateUsersModal .close').addEventListener('click', () => {
            this.hideGenerateModal();
        });
    }

    async loadUsers() {
        try {
            const response = await Auth.fetchAuth('http://localhost:3000/api/users');
            if (!response.ok) throw new Error('Error al cargar usuarios');
            
            const data = await response.json();
            this.renderUsers(data.users);
        } catch (error) {
            showNotification(error.message, false);
        }
    }

    renderUsers(users) {
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.username}</td>
                <td>${user.tipo}</td>
                <td>${new Date(user.fecha_creacion).toLocaleDateString()}</td>
                <td>${user.alumno_nombre || '-'}</td>
                <td>${user.seccion || '-'}</td>
                <td>
                    ${user.tipo === 'alumno' ? `
                        <div class="action-buttons">
                            <button onclick="userManager.cambiarPassword(${user.id})" class="btn-change-pass">
                                Cambiar Contraseña
                            </button>
                            <button onclick="userManager.eliminarUsuario(${user.id})" class="btn-delete">
                                Eliminar
                            </button>
                            <button onclick="userManager.enviarCredenciales(${user.id})" class="btn-send">
                                Enviar
                            </button>
                        </div>
                    ` : '-'}
                </td>
            </tr>
        `).join('');
    }

    showModal() {
        document.getElementById('createUserModal').style.display = 'block';
        const userType = document.getElementById('newUserType');
        const alumnoFields = document.querySelectorAll('.alumno-fields');
        
        document.getElementById('createUserForm').reset();
        alumnoFields.forEach(field => field.style.display = 'none');
        
        if (auth.user.tipo !== 'admin') {
            const colaboradorOption = userType.querySelector('option[value="colaborador"]');
            if (colaboradorOption) {
                colaboradorOption.style.display = 'none';
            }
            userType.value = 'alumno';
            alumnoFields.forEach(field => field.style.display = 'block');
            this.loadSecciones();
        }
    }

    hideModal() {
        document.getElementById('createUserModal').style.display = 'none';
        document.getElementById('createUserForm').reset();
    }

    generateRandomPassword() {
        const length = 12;
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        let password = "";
        for (let i = 0; i < length; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return password;
    }

    async createUser() {
        const username = document.getElementById('newUsername').value;
        const password = document.getElementById('newPassword').value;
        const tipo = document.getElementById('newUserType').value;
        const alumnoNombre = tipo === 'alumno' ? document.getElementById('alumnoNombre').value : null;

        try {
            if (!username || !password || !tipo) {
                throw new Error('Por favor complete todos los campos requeridos');
            }

            if (tipo === 'alumno' && !alumnoNombre) {
                throw new Error('Debe seleccionar un alumno');
            }

            const response = await Auth.fetchAuth('http://localhost:3000/api/users', {
                method: 'POST',
                body: JSON.stringify({
                    username,
                    password,
                    tipo,
                    alumnoNombre
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Error al crear usuario');
            }

            showNotification('Usuario creado exitosamente');
            this.hideModal();
            this.loadUsers();
        } catch (error) {
            showNotification(error.message, false);
        }
    }

    async cambiarPassword(userId) {
        if (!confirm('¿Está seguro de cambiar la contraseña de este usuario?')) return;
        
        try {
            const response = await Auth.fetchAuth(`http://localhost:3000/api/users/${userId}/reset-password`, {
                method: 'POST'
            });

            if (!response.ok) throw new Error('Error al cambiar contraseña');
            const data = await response.json();
            
            alert(`Nueva contraseña: ${data.newPassword}`);
            showNotification('Contraseña cambiada exitosamente');
        } catch (error) {
            showNotification(error.message, false);
        }
    }

    async eliminarUsuario(userId) {
        if (!confirm('¿Está seguro de eliminar este usuario? Esta acción no se puede deshacer.')) return;
        
        try {
            const response = await Auth.fetchAuth(`http://localhost:3000/api/users/${userId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Error al eliminar usuario');
            
            showNotification('Usuario eliminado exitosamente');
            this.loadUsers();
        } catch (error) {
            showNotification(error.message, false);
        }
    }

    async showGenerateModal() {
        const modal = document.getElementById('generateUsersModal');
        const select = document.getElementById('seccionGenerar');
        
        try {
            const response = await Auth.fetchAuth('http://localhost:3000/api/secciones');
            const data = await response.json();

            if (!response.ok) {
                throw new Error('Error al cargar secciones');
            }

            if (data.secciones && data.secciones.length > 0) {
                const seccionesOrdenadas = data.secciones.sort((a, b) => a.seccion.localeCompare(b.seccion));
                select.innerHTML = `
                    <option value="">Todas las secciones</option>
                    ${seccionesOrdenadas.map(s => `
                        <option value="${s.seccion}">${s.seccion}</option>
                    `).join('')}
                `;
            }

            modal.style.display = 'block';
        } catch (error) {
            showNotification('Error al cargar secciones', false);
        }
    }

    hideGenerateModal() {
        const modal = document.getElementById('generateUsersModal');
        modal.style.display = 'none';
        document.getElementById('generateUsersForm').reset();
    }

    async generarAlumnosFaltantes() {
        const seccion = document.getElementById('seccionGenerar').value;
        
        try {
            const response = await Auth.fetchAuth('http://localhost:3000/api/users/generate-missing', {
                method: 'POST',
                body: JSON.stringify({ seccion })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Error al generar usuarios');
            }
            
            const data = await response.json();
            showNotification(`Se generaron ${data.created} usuarios nuevos`);
            this.hideGenerateModal();
            this.loadUsers();
        } catch (error) {
            console.error('Error:', error);
            showNotification(error.message, false);
        }
    }

    // Métodos auxiliares existentes
    async loadSecciones() {
        try {
            const response = await Auth.fetchAuth('http://localhost:3000/api/secciones');
            const data = await response.json();

            if (!response.ok) {
                throw new Error('Error al cargar secciones');
            }

            const select = document.getElementById('seccionAlumno');
            if (!data.secciones || !data.secciones.length) {
                select.innerHTML = '<option value="">No hay secciones disponibles</option>';
                return;
            }

            const seccionesOrdenadas = data.secciones.sort((a, b) => a.seccion.localeCompare(b.seccion));
            select.innerHTML = `
                <option value="">Seleccione sección</option>
                ${seccionesOrdenadas.map(s => `
                    <option value="${s.seccion}">${s.seccion}</option>
                `).join('')}
            `;
        } catch (error) {
            console.error('Error cargando secciones:', error);
            showNotification(error.message, false);
        }
    }

    async loadAlumnosPorSeccion(seccion) {
        try {
            const select = document.getElementById('alumnoNombre');
            select.innerHTML = '<option value="">Cargando alumnos...</option>';

            const response = await Auth.fetchAuth(`http://localhost:3000/api/secciones/${seccion}/alumnos`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error('Error al cargar alumnos');
            }

            if (!data.alumnos || data.alumnos.length === 0) {
                select.innerHTML = '<option value="">No hay alumnos disponibles</option>';
                showNotification('No hay alumnos disponibles para asignar en esta sección', false);
                return;
            }

            const alumnosOrdenados = data.alumnos.sort((a, b) => a.alumno.localeCompare(b.alumno));
            select.innerHTML = `
                <option value="">Seleccione alumno</option>
                ${alumnosOrdenados.map(a => `
                    <option value="${a.alumno}">${a.alumno}</option>
                `).join('')}
            `;
        } catch (error) {
            console.error('Error cargando alumnos:', error);
            showNotification(error.message, false);
        }
    }

    filterUsers() {
        const typeFilter = document.getElementById('userTypeFilter').value;
        const searchFilter = document.getElementById('searchUser').value.toLowerCase();
        
        const rows = document.querySelectorAll('#usersTable tbody tr');
        rows.forEach(row => {
            const tipo = row.children[1].textContent;
            const username = row.children[0].textContent.toLowerCase();
            const matchesType = !typeFilter || tipo === typeFilter;
            const matchesSearch = username.includes(searchFilter);
            row.style.display = matchesType && matchesSearch ? '' : 'none';
        });
    }

    async enviarCredenciales(userId) {
        const option = await Swal.fire({
            title: 'Enviar Credenciales',
            text: '¿Cómo desea enviar las credenciales?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'PDF',
            cancelButtonText: 'Mensaje',
            showCloseButton: true
        });

        if (option.dismiss === Swal.DismissReason.close) return;

        try {
            // Obtener credenciales
            const response = await Auth.fetchAuth(`http://localhost:3000/api/users/${userId}/credentials`);
            if (!response.ok) throw new Error('Error al obtener credenciales');
            
            const data = await response.json();

            if (option.isConfirmed) {
                // Generar PDF con jsPDF
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();

                // Configurar fuente y tamaños
                doc.setFontSize(20);
                doc.text('Credenciales de Acceso', 105, 20, { align: 'center' });
                
                doc.setFontSize(16);
                doc.text('Sistema de Asistencia LOURDES', 105, 30, { align: 'center' });

                doc.setFontSize(12);
                let y = 50;
                
                if (data.alumno_nombre) {
                    doc.text(`Alumno: ${data.alumno_nombre}`, 20, y);
                    y += 10;
                }

                // Credenciales en un recuadro
                doc.setDrawColor(200);
                doc.setFillColor(245);
                doc.rect(20, y, 170, 30, 'FD');
                
                doc.text(`Usuario: ${data.username}`, 30, y + 10);
                doc.text(`Contraseña: ${data.password}`, 30, y + 20);

                y += 40;
                
                // Instrucciones
                doc.setFontSize(10);
                doc.text('Instrucciones:', 20, y);
                y += 10;
                doc.text('1. Ingrese a la plataforma con estas credenciales', 25, y);
                y += 7;
                doc.text('2. Se recomienda cambiar la contraseña después del primer inicio de sesión', 25, y);
                y += 7;
                doc.text('3. Guarde estas credenciales en un lugar seguro', 25, y);

                // Guardar PDF
                doc.save('credenciales.pdf');
            } else {
                // Mostrar mensaje
                await Swal.fire({
                    title: 'Credenciales de Acceso',
                    html: `
                        <div style="text-align: left;">
                            ${data.alumno_nombre ? `<p><strong>Alumno:</strong> ${data.alumno_nombre}</p>` : ''}
                            <p><strong>Usuario:</strong> ${data.username}</p>
                            <p><strong>Contraseña:</strong> ${data.password}</p>
                        </div>
                    `,
                    icon: 'info'
                });
            }
        } catch (error) {
            showNotification(error.message, false);
        }
    }
}

// Inicializar el gestor de usuarios
const userManager = new UserManager(); 