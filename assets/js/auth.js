class Auth {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user'));
        this.setupEventListeners();
        this.checkAuth();
    }

    setupEventListeners() {
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }

    async login() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error);
            }

            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('token', this.token);
            localStorage.setItem('user', JSON.stringify(this.user));

            if (this.user.tipo === 'alumno') {
                window.location.href = 'alumno_view.html';
            } else {
                this.showApp();
                setTimeout(() => {
                    window.location.reload();
                }, 100);
            }
        } catch (error) {
            showNotification(error.message, false);
        }
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.token = null;
        this.user = null;
        this.showLogin();
    }

    checkAuth() {
        if (this.token && this.user) {
            this.showApp();
        } else {
            this.showLogin();
        }
    }

    showApp() {
        if (this.user.tipo === 'alumno') {
            window.location.href = 'alumno_view.html';
            return;
        }

        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        
        const adminOnlyElements = document.querySelectorAll('.admin-only');
        const adminColabElements = document.querySelectorAll('.admin-colab');

        adminOnlyElements.forEach(el => {
            el.style.display = this.user.tipo === 'admin' ? 'block' : 'none';
        });

        adminColabElements.forEach(el => {
            el.style.display = ['admin', 'colaborador'].includes(this.user.tipo) ? 'block' : 'none';
        });

        document.querySelector('[data-section="upload"]').click();
    }

    showLogin() {
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('mainContent').style.display = 'none';
    }

    static async fetchAuth(url, options = {}) {
        const token = localStorage.getItem('token');
        if (!token) {
            const auth = new Auth();
            auth.logout();
            throw new Error('No authenticated');
        }

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        const response = await fetch(url, { ...options, headers });
        
        if (response.status === 401) {
            const auth = new Auth();
            auth.logout();
            throw new Error('Session expired');
        }

        return response;
    }
}

// Inicializar autenticación
const auth = new Auth(); 