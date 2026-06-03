// ==========================================
// viaGO - Frontend Application (Hybrid Django API + Standalone Fallback)
// ==========================================

const app = {
    // ===== STATE =====
    state: {
        token: null,
        user: null,
        vehiculos: [],
        movimientos: [],
    },

    // ===== ONBOARDING DATA =====
    onboardingSlides: [
        { icon: 'fa-solid fa-road', title: 'ACCESO FÁCIL', desc: 'Pasa por los peajes sin detenerte. Tu saldo se descuenta de forma automática.' },
        { icon: 'fa-solid fa-clock', title: 'OPTIMIZA TU TIEMPO', desc: 'Olvídate de las colas. Con viaGO tu viaje es más rápido y eficiente.' },
        { icon: 'fa-solid fa-shield-halved', title: 'TRANSACCIONES SEGURAS', desc: 'Tus pagos están protegidos con la más alta seguridad en cada transacción.' },
    ],
    currentSlide: 0,

    // ===== ONLINE/OFFLINE DETECTOR =====
    isOnline() {
        if (window.location.hostname.endsWith('github.io')) {
            return false;
        }
        return window.location.protocol.startsWith('http');
    },

    // ===== API CLIENT =====
    async apiCall(url, method = 'GET', body = null) {
        if (!this.isOnline()) return null;
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.state.token) {
            headers['Authorization'] = `Bearer ${this.state.token}`;
        }
        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }
        try {
            const response = await fetch(url, options);
            if (response.status === 401) {
                this.logout();
                return { ok: false, error: 'Sesión expirada' };
            }
            const data = await response.json();
            return data;
        } catch (err) {
            console.error('API Error:', err);
            return { ok: false, error: 'Error de conexión con el servidor' };
        }
    },

    // ===== DB (localStorage Standalone Fallback) =====
    db: {
        getUsers() {
            return JSON.parse(localStorage.getItem('viago_users') || '[]');
        },
        saveUsers(users) {
            localStorage.setItem('viago_users', JSON.stringify(users));
        },
        getMovimientos(userId) {
            const all = JSON.parse(localStorage.getItem('viago_movimientos') || '{}');
            return all[userId] || [];
        },
        saveMovimiento(userId, mov) {
            const all = JSON.parse(localStorage.getItem('viago_movimientos') || '{}');
            if (!all[userId]) all[userId] = [];
            all[userId].unshift(mov);
            localStorage.setItem('viago_movimientos', JSON.stringify(all));
        },
        getVehiculos(userId) {
            const all = JSON.parse(localStorage.getItem('viago_vehiculos') || '{}');
            return all[userId] || [];
        },
        saveVehiculo(userId, v) {
            const all = JSON.parse(localStorage.getItem('viago_vehiculos') || '{}');
            if (!all[userId]) all[userId] = [];
            all[userId].push(v);
            localStorage.setItem('viago_vehiculos', JSON.stringify(all));
        },
        updateUserSaldo(userId, nuevoSaldo) {
            const users = this.getUsers();
            const u = users.find(x => x.id === userId);
            if (u) {
                u.saldo = nuevoSaldo;
                this.saveUsers(users);
            }
        }
    },

    // ===== INIT =====
    init() {
        // Seed default user if offline and empty
        if (!this.isOnline()) {
            const users = this.db.getUsers();
            if (users.length === 0) {
                this.db.saveUsers([{
                    id: 1,
                    name: 'Angely',
                    email: 'test@viago.com',
                    password: '123456',
                    cedula: 'V-12345678',
                    telefono: '0412-1234567',
                    saldo: 120.00
                }]);
            }
        }

        // Check stored session
        const token = localStorage.getItem('viago_token');
        const user = localStorage.getItem('viago_user');
        if (token && user) {
            this.state.token = token;
            this.state.user = JSON.parse(user);
        }

        // Apply dark mode preference
        const isDark = localStorage.getItem('viago_dark_mode') === 'true';
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            const sw = document.getElementById('dark-mode-switch');
            if (sw) sw.classList.add('active');
        }

        // Show splash for 2s
        setTimeout(async () => {
            if (this.state.token) {
                await this.loadUserData();
                this.updateNotifBadge();
                this.navigate('dashboard');
            } else {
                const onboarded = localStorage.getItem('viago_onboarded');
                this.navigate(onboarded ? 'login' : 'onboarding');
            }
        }, 2000);

        // Onboarding next
        document.getElementById('btn-onboarding-next').addEventListener('click', () => this.nextSlide());
    },

    // ===== LOAD USER DATA =====
    async loadUserData() {
        if (!this.state.user) return;
        if (this.isOnline()) {
            const res = await this.apiCall('/api/user/data/');
            if (res && res.ok) {
                this.state.user = res.user;
                this.state.vehiculos = res.vehiculos;
                this.state.movimientos = res.movimientos;
                localStorage.setItem('viago_user', JSON.stringify(res.user));
            } else {
                this.logout();
            }
        } else {
            const users = this.db.getUsers();
            const fresh = users.find(u => u.id === this.state.user.id);
            if (fresh) {
                this.state.user = fresh;
                localStorage.setItem('viago_user', JSON.stringify(fresh));
            }
            this.state.movimientos = this.db.getMovimientos(this.state.user.id);
            this.state.vehiculos = this.db.getVehiculos(this.state.user.id);
        }
    },

    // ===== NAVIGATION =====
    async navigate(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(`view-${viewId}`);
        if (target) target.classList.add('active');

        const nav = document.getElementById('bottom-nav');
        const authViews = ['splash', 'onboarding', 'login', 'register'];
        nav.classList.toggle('hidden', authViews.includes(viewId));

        // Update active nav
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewId);
        });

        // View-specific renders
        switch (viewId) {
            case 'onboarding': this.renderSlide(); break;
            case 'dashboard': await this.loadUserData(); this.renderDashboard(); break;
            case 'recharge': this.renderRechargeBalance(); break;
            case 'movements': 
                await this.loadUserData(); 
                this.switchMovementTab('list'); 
                break;
            case 'vehicles': await this.loadUserData(); this.renderVehicles(); break;
            case 'profile': this.renderProfile(); break;
            case 'map': this.renderMap(); break;
            case 'simulator': await this.loadUserData(); this.renderSimulator(); break;
        }

        if (viewId !== 'map') {
            document.getElementById('view-container').scrollTop = 0;
        }
    },

    // ===== ONBOARDING =====
    renderSlide() {
        const slide = this.onboardingSlides[this.currentSlide];
        document.getElementById('onboarding-content').innerHTML = `
            <i class="${slide.icon} onboarding-icon"></i>
            <h2 class="onboarding-title">${slide.title}</h2>
            <p class="onboarding-desc">${slide.desc}</p>
        `;

        document.getElementById('onboarding-dots').innerHTML = this.onboardingSlides.map((_, i) =>
            `<div class="onboarding-dot ${i === this.currentSlide ? 'active' : ''}"></div>`
        ).join('');

        const btn = document.getElementById('btn-onboarding-next');
        btn.innerHTML = this.currentSlide === this.onboardingSlides.length - 1
            ? 'Empezar <i class="fa-solid fa-check"></i>'
            : 'Siguiente <i class="fa-solid fa-arrow-right"></i>';
    },

    nextSlide() {
        if (this.currentSlide < this.onboardingSlides.length - 1) {
            this.currentSlide++;
            this.renderSlide();
        } else {
            localStorage.setItem('viago_onboarded', '1');
            this.navigate('login');
        }
    },

    // ===== LOGIN =====
    async login() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const btn = document.getElementById('btn-login');

        if (!email || !password) return this.toast('Completa todos los campos', 'error');

        btn.disabled = true;
        btn.textContent = 'Ingresando...';

        if (this.isOnline()) {
            const res = await this.apiCall('/api/auth/login/', 'POST', { username: email, password });
            if (res && res.ok) {
                this.state.token = res.token;
                this.state.user = res.user;
                localStorage.setItem('viago_token', this.state.token);
                localStorage.setItem('viago_user', JSON.stringify(res.user));
                document.getElementById('form-login').reset();
                this.toast('¡Bienvenido!', 'success');
                this.addNotification('fa-solid fa-right-to-bracket', 'info', 'Inicio de sesión exitoso', '');
                await this.loadUserData();
                this.navigate('dashboard');
            } else {
                this.toast(res ? res.error : 'Error de conexión', 'error');
            }
            btn.disabled = false;
            btn.textContent = 'ENTRAR';
        } else {
            setTimeout(() => {
                const users = this.db.getUsers();
                const user = users.find(u => u.email === email && u.password === password);

                if (user) {
                    this.state.token = String(user.id);
                    this.state.user = user;
                    localStorage.setItem('viago_token', this.state.token);
                    localStorage.setItem('viago_user', JSON.stringify(user));
                    document.getElementById('form-login').reset();
                    this.toast('¡Bienvenido!', 'success');
                    this.addNotification('fa-solid fa-right-to-bracket', 'info', 'Inicio de sesión exitoso', '');
                    this.loadUserData();
                    this.navigate('dashboard');
                } else {
                    this.toast('Credenciales incorrectas', 'error');
                }

                btn.disabled = false;
                btn.textContent = 'ENTRAR';
            }, 600);
        }
    },

    // ===== REGISTER =====
    async register() {
        const nombre = document.getElementById('reg-name').value.trim();
        const cedula = document.getElementById('reg-cedula').value.trim();
        const telefono = document.getElementById('reg-telefono').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        const btn = document.getElementById('btn-register');

        if (!nombre || !cedula || !telefono || !email || !password) {
            return this.toast('Completa todos los campos', 'error');
        }
        if (password.length < 6) {
            return this.toast('La contraseña debe tener al menos 6 caracteres', 'error');
        }

        btn.disabled = true;
        btn.textContent = 'Creando cuenta...';

        if (this.isOnline()) {
            const res = await this.apiCall('/api/auth/register/', 'POST', { nombre, email, password, cedula, telefono });
            if (res && res.ok) {
                this.state.token = res.token;
                this.state.user = res.user;
                localStorage.setItem('viago_token', this.state.token);
                localStorage.setItem('viago_user', JSON.stringify(res.user));
                document.getElementById('form-register').reset();
                this.toast('¡Cuenta creada exitosamente!', 'success');
                this.addNotification('fa-solid fa-user-check', 'info', '¡Bienvenido a viaGO!', 'Tu cuenta ha sido creada correctamente.');
                await this.loadUserData();
                this.navigate('dashboard');
            } else {
                this.toast(res ? res.error : 'Error de conexión', 'error');
            }
            btn.disabled = false;
            btn.textContent = 'CREAR CUENTA';
        } else {
            setTimeout(() => {
                const users = this.db.getUsers();

                if (users.find(u => u.email === email)) {
                    this.toast('El correo ya está registrado', 'error');
                    btn.disabled = false;
                    btn.textContent = 'CREAR CUENTA';
                    return;
                }
                if (users.find(u => u.cedula === cedula)) {
                    this.toast('La cédula ya está registrada', 'error');
                    btn.disabled = false;
                    btn.textContent = 'CREAR CUENTA';
                    return;
                }

                const newUser = {
                    id: Date.now(),
                    name: nombre,
                    email,
                    password,
                    cedula,
                    telefono,
                    saldo: 0.00
                };

                users.push(newUser);
                this.db.saveUsers(users);

                this.state.token = String(newUser.id);
                this.state.user = newUser;
                localStorage.setItem('viago_token', this.state.token);
                localStorage.setItem('viago_user', JSON.stringify(newUser));
                document.getElementById('form-register').reset();
                this.toast('¡Cuenta creada exitosamente!', 'success');
                this.addNotification('fa-solid fa-user-check', 'info', '¡Bienvenido a viaGO!', 'Tu cuenta ha sido creada correctamente.');
                this.loadUserData();
                this.navigate('dashboard');

                btn.disabled = false;
                btn.textContent = 'CREAR CUENTA';
            }, 800);
        }
    },

    // ===== DASHBOARD =====
    renderDashboard() {
        if (!this.state.user) return this.navigate('login');
        const u = this.state.user;

        document.getElementById('dash-name').textContent = u.name || u.email;
        document.getElementById('dash-balance').textContent = `${parseFloat(u.saldo || 0).toFixed(2)} Bs`;
        this.updateNotifBadge();

        const list = document.getElementById('dash-recent-tx');
        const txs = this.state.movimientos.slice(0, 3);

        if (txs.length === 0) {
            list.innerHTML = '<li class="empty-state"><i class="fa-regular fa-file-lines"></i><p>Sin movimientos recientes</p></li>';
        } else {
            list.innerHTML = txs.map(tx => this.renderTxItem(tx)).join('');
        }
    },

    renderRechargeBalance() {
        if (!this.state.user) return;
        document.getElementById('recharge-balance').textContent = `${parseFloat(this.state.user.saldo || 0).toFixed(2)} Bs`;
    },

    // ===== RECHARGE =====
    async recharge() {
        const monto = parseFloat(document.getElementById('recharge-amount').value);
        const metodo = document.getElementById('recharge-method').value;
        const btn = document.getElementById('btn-recharge');

        if (!monto || monto <= 0) return this.toast('Ingresa un monto válido', 'error');

        btn.disabled = true;
        btn.textContent = 'Procesando...';

        if (this.isOnline()) {
            const res = await this.apiCall('/api/payments/recharge/', 'POST', { monto, metodo });
            if (res && res.ok) {
                this.state.user.saldo = res.nuevo_saldo;
                localStorage.setItem('viago_user', JSON.stringify(this.state.user));
                document.getElementById('form-recharge').reset();
                this.toast(`+${monto.toFixed(2)} Bs recargados exitosamente`, 'success');
                this.addNotification('fa-solid fa-arrow-down', 'recarga', `Recarga de +${monto.toFixed(2)} Bs`, `Vía ${metodo}. Nuevo saldo: ${parseFloat(res.nuevo_saldo).toFixed(2)} Bs`);
                setTimeout(() => this.navigate('dashboard'), 1000);
            } else {
                this.toast(res ? res.error : 'Error de conexión', 'error');
            }
            btn.disabled = false;
            btn.textContent = 'Confirmar Recarga';
        } else {
            setTimeout(() => {
                const nuevoSaldo = parseFloat(this.state.user.saldo || 0) + monto;
                this.state.user.saldo = nuevoSaldo;
                this.db.updateUserSaldo(this.state.user.id, nuevoSaldo);
                localStorage.setItem('viago_user', JSON.stringify(this.state.user));

                this.db.saveMovimiento(this.state.user.id, {
                    id: Date.now(),
                    tipo: 'RECARGA',
                    monto: monto,
                    ubicacion: metodo,
                    fecha: new Date().toISOString()
                });

                document.getElementById('form-recharge').reset();
                this.toast(`+${monto.toFixed(2)} Bs recargados exitosamente`, 'success');
                this.addNotification('fa-solid fa-arrow-down', 'recarga', `Recarga de +${monto.toFixed(2)} Bs`, `Vía ${metodo}. Nuevo saldo: ${nuevoSaldo.toFixed(2)} Bs`);

                btn.disabled = false;
                btn.textContent = 'Confirmar Recarga';

                setTimeout(() => this.navigate('dashboard'), 1000);
            }, 1000);
        }
    },

    // ===== MOVEMENTS =====
    renderMovements() {
        const list = document.getElementById('movements-list');
        const txs = this.state.movimientos;

        if (txs.length === 0) {
            list.innerHTML = '<li class="empty-state"><i class="fa-regular fa-file-lines"></i><p>Sin movimientos</p></li>';
        } else {
            list.innerHTML = txs.map(tx => this.renderTxItem(tx)).join('');
        }
    },

    renderTxItem(tx) {
        const isRecarga = tx.tipo === 'RECARGA';
        const icon = isRecarga ? 'fa-solid fa-arrow-down' : 'fa-solid fa-arrow-up';
        const cls = isRecarga ? 'recarga' : 'pago';
        const sign = isRecarga ? '+' : '-';
        const amtCls = isRecarga ? 'positive' : 'negative';
        const label = isRecarga ? (tx.ubicacion || 'Recarga') : (tx.ubicacion || 'Peaje');
        const date = tx.fecha ? new Date(tx.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

        return `
            <li class="tx-item">
                <div class="tx-icon ${cls}"><i class="${icon}"></i></div>
                <div class="tx-info">
                    <strong>${label}</strong>
                    <small>${date}</small>
                </div>
                <span class="tx-amount ${amtCls}">${sign}${parseFloat(tx.monto).toFixed(2)} Bs</span>
            </li>
        `;
    },

    // ===== TABS (MOVEMENTS / STATS) =====
    switchMovementTab(tabId) {
        const btnList = document.getElementById('tab-btn-list');
        const btnStats = document.getElementById('tab-btn-stats');
        const listTab = document.getElementById('movements-list-tab');
        const statsTab = document.getElementById('movements-stats-tab');

        if (tabId === 'list') {
            btnList.classList.add('active');
            btnStats.classList.remove('active');
            listTab.classList.remove('hidden');
            statsTab.classList.add('hidden');
            this.renderMovements();
        } else {
            btnList.classList.remove('active');
            btnStats.classList.add('active');
            listTab.classList.add('hidden');
            statsTab.classList.remove('hidden');
            this.renderStats();
        }
    },

    // ===== RENDER STATS (BI/SVG CHARTS) =====
    renderStats() {
        const txs = this.state.movimientos;

        const recargas = txs.filter(m => m.tipo === 'RECARGA');
        const pagos = txs.filter(m => m.tipo === 'PAGO');

        const totalRecargas = recargas.reduce((sum, m) => sum + parseFloat(m.monto), 0);
        const totalPagos = pagos.reduce((sum, m) => sum + parseFloat(m.monto), 0);

        document.getElementById('stats-total-recharge').textContent = `${totalRecargas.toFixed(2)} Bs`;
        document.getElementById('stats-total-paid').textContent = `${totalPagos.toFixed(2)} Bs`;

        // Donut/Bar Chart of recent payments
        const chartContainer = document.getElementById('stats-chart-container');
        const lastPagos = pagos.slice(0, 5).reverse();

        if (lastPagos.length === 0) {
            chartContainer.innerHTML = '<p class="text-center" style="font-size:0.85rem;color:var(--text-secondary);">No hay cobros registrados para graficar</p>';
        } else {
            const maxVal = Math.max(...lastPagos.map(p => parseFloat(p.monto)), 100);
            
            let svgContent = `<svg viewBox="0 0 320 160" width="100%" height="160" style="font-family: inherit;">`;
            svgContent += `<line x1="40" y1="20" x2="40" y2="130" stroke="var(--border)" stroke-width="1.5"/>`;
            svgContent += `<line x1="40" y1="130" x2="300" y2="130" stroke="var(--border)" stroke-width="1.5"/>`;

            const barWidth = 28;
            const gap = 18;
            
            lastPagos.forEach((p, idx) => {
                const x = 52 + idx * (barWidth + gap);
                const amount = parseFloat(p.monto);
                const height = (amount / maxVal) * 90;
                const y = 130 - height;
                const label = p.ubicacion.replace('Peaje ', '');

                svgContent += `
                    <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="url(#barGrad)" rx="5"/>
                    <text x="${x + barWidth/2}" y="${y - 6}" text-anchor="middle" font-size="9" font-weight="700" fill="var(--text)">${amount.toFixed(0)}</text>
                    <text x="${x + barWidth/2}" y="146" text-anchor="middle" font-size="8" font-weight="500" fill="var(--text-secondary)">${label.substring(0, 7)}</text>
                `;
            });

            svgContent += `
                <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--primary-light)"/>
                        <stop offset="100%" stop-color="var(--primary)"/>
                    </linearGradient>
                </defs>
            </svg>`;
            
            chartContainer.innerHTML = svgContent;
        }

        // Top Tolls visited
        const topTollsContainer = document.getElementById('stats-top-tolls');
        const tollCounts = {};
        pagos.forEach(p => {
            tollCounts[p.ubicacion] = (tollCounts[p.ubicacion] || 0) + 1;
        });

        const sortedTolls = Object.entries(tollCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

        if (sortedTolls.length === 0) {
            topTollsContainer.innerHTML = '<p class="text-center" style="font-size:0.85rem;color:var(--text-secondary);">Sin visitas registradas</p>';
        } else {
            const maxVisits = sortedTolls[0][1];
            topTollsContainer.innerHTML = sortedTolls.map(([tollName, count]) => {
                const percentage = (count / maxVisits) * 100;
                return `
                    <div class="top-toll-row">
                        <div class="top-toll-info">
                            <span>${tollName}</span>
                            <span>${count} ${count === 1 ? 'visita' : 'visitas'}</span>
                        </div>
                        <div class="top-toll-bar-bg">
                            <div class="top-toll-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    },

    // ===== VEHICLES (PREMIUM V-TAG CARDS) =====
    renderVehicles() {
        const container = document.getElementById('vehicles-list');
        const vs = this.state.vehiculos;

        if (vs.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-car"></i><p>No tienes vehículos registrados</p></div>';
        } else {
            container.innerHTML = vs.map(v => {
                const qrData = `viago-user:${this.state.user.id}-plate:${v.placa}`;
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;
                return `
                    <div class="vehicle-card" id="vcard-${v.id}" onclick="app.toggleVehicleQr(${v.id})">
                        <div class="vehicle-card-main">
                            <div class="vehicle-icon"><i class="fa-solid fa-car"></i></div>
                            <div class="vehicle-info">
                                <strong>${v.marca} · ${v.placa}</strong>
                                <small>Serial: ${v.serial} · ${v.color}</small>
                            </div>
                            <div class="vtag-badge">V-TAG</div>
                        </div>
                        <div class="vtag-qr-container">
                            <img src="${qrUrl}" class="vtag-qr" alt="QR Pases" />
                            <span class="vtag-desc">ESCANEABLE EN PEAJE</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    },

    toggleVehicleQr(vehicleId) {
        const card = document.getElementById(`vcard-${vehicleId}`);
        if (card) {
            card.classList.toggle('show-qr');
        }
    },

    async addVehicle() {
        const marca = document.getElementById('v-marca').value.trim();
        const placa = document.getElementById('v-placa').value.trim();
        const serial = document.getElementById('v-serial').value.trim();
        const color = document.getElementById('v-color').value.trim();

        if (!marca || !placa || !serial || !color) return this.toast('Completa todos los campos', 'error');

        if (this.isOnline()) {
            const res = await this.apiCall('/api/user/vehicle/', 'POST', { marca, placa, serial, color });
            if (res && res.ok) {
                document.getElementById('form-vehicle').reset();
                this.toast('Vehículo registrado', 'success');
                this.addNotification('fa-solid fa-car', 'vehiculo', 'Vehículo registrado', `${marca} [${placa.toUpperCase()}] agregado a tu cuenta.`);
                this.navigate('vehicles');
            } else {
                this.toast(res ? res.error : 'Error de conexión', 'error');
            }
        } else {
            const allVehiculos = JSON.parse(localStorage.getItem('viago_vehiculos') || '{}');
            const allPlacas = Object.values(allVehiculos).flat().map(v => v.placa.toUpperCase());
            if (allPlacas.includes(placa.toUpperCase())) {
                return this.toast('La placa ya está registrada', 'error');
            }

            const newV = { id: Date.now(), marca, placa: placa.toUpperCase(), serial, color };
            this.db.saveVehiculo(this.state.user.id, newV);
            document.getElementById('form-vehicle').reset();
            this.toast('Vehículo registrado', 'success');
            this.addNotification('fa-solid fa-car', 'vehiculo', 'Vehículo registrado', `${marca} [${placa.toUpperCase()}] agregado a tu cuenta.`);
            this.navigate('vehicles');
        }
    },

    // ===== PROFILE =====
    renderProfile() {
        if (!this.state.user) return;
        const u = this.state.user;

        document.getElementById('profile-avatar').textContent = (u.name || 'U').charAt(0).toUpperCase();
        document.getElementById('profile-name').textContent = u.name || u.email;
        document.getElementById('profile-email').textContent = u.email || '';
        document.getElementById('profile-cedula').textContent = u.cedula || '—';
        document.getElementById('profile-telefono').textContent = u.telefono || '—';
        document.getElementById('profile-saldo').textContent = `${parseFloat(u.saldo || 0).toFixed(2)} Bs`;
    },

    // ===== MAP =====
    renderMap() {
        if (!this._mapInitialized) {
            this._mapInitialized = true;
            setTimeout(() => {
                this.map = L.map('peajes-map', { zoomControl: false }).setView([10.4806, -66.9036], 7);
                L.control.zoom({ position: 'bottomright' }).addTo(this.map);
                
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                const tileUrl = isDark 
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

                L.tileLayer(tileUrl, {
                    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
                }).addTo(this.map);

                this.peajesData = [
                    // ===== Autopista Regional del Centro (ARC) — Caracas → Valencia =====
                    { name: 'Peaje Tazón', lat: 10.38897, lng: -66.88929, info: 'ARC, Hoyo de la Puerta, Miranda' },
                    { name: 'Peaje Las Tejerías', lat: 10.2522, lng: -67.15221, info: 'ARC, Distribuidor Tejerías, Aragua' },
                    { name: 'Peaje Palo Negro', lat: 10.2219, lng: -67.5764, info: 'ARC, Distribuidor Palo Negro, Aragua' },
                    { name: 'Peaje Tapa Tapa', lat: 10.2484, lng: -67.6259, info: 'ARC, Maracay Oeste, Aragua' },
                    { name: 'Peaje Villa de Cura', lat: 10.03863, lng: -67.48938, info: 'ARC, Villa de Cura, Aragua' },
                    { name: 'Peaje La Cabrera', lat: 10.26014, lng: -67.64447, info: 'ARC, Límite Aragua-Carabobo' },
                    { name: 'Peaje Guacara', lat: 10.25171, lng: -67.83478, info: 'ARC, San Joaquín, Carabobo' },

                    // ===== Carabobo / Valencia =====
                    { name: 'Peaje La Entrada', lat: 10.29807, lng: -68.04137, info: 'Valencia-Pto. Cabello, Carabobo' },

                    // ===== Autopista Centro Occidental (Cimarrón Andresote) =====
                    { name: 'Peaje La Raya', lat: 10.44477, lng: -68.41974, info: 'Aut. Centro Occidental, Yaracuy' },
                    { name: 'Peaje Caseteja', lat: 10.09144, lng: -69.20231, info: 'Aut. Centro Occidental, Lím. Yaracuy-Lara' },

                    // ===== Miranda (Valles del Tuy) =====
                    { name: 'Peaje Las Peñitas', lat: 10.28079, lng: -66.83307, info: 'Autopista Charallave, Miranda' },

                    // ===== Oriente (Anzoátegui / Monagas) =====
                    { name: 'Peaje San Juan de Unare', lat: 10.0561, lng: -65.3428, info: 'Troncal 9, Píritu, Anzoátegui' },
                    { name: 'Peaje Los Potocos', lat: 10.0503, lng: -64.7592, info: 'Barcelona vía Anaco, Anzoátegui' },
                    { name: 'Peaje Mesones', lat: 10.0672, lng: -64.6725, info: 'Acceso Barcelona, Anzoátegui' },

                    // ===== Zulia =====
                    { name: 'Peaje Puente Gral. Rafael Urdaneta', lat: 10.57336, lng: -71.61407, info: 'Puente sobre el Lago, Zulia' },

                    // ===== Andes (Mérida / Táchira) =====
                    { name: 'Peaje El Vigía', lat: 8.59102, lng: -71.61797, info: 'Mun. Alberto Adriani, Mérida' },
                    { name: 'Peaje Isaías Medina Angarita', lat: 8.4356, lng: -71.9814, info: 'La Palmita, Vía Panamericana, Táchira' },
                    { name: 'Peaje San Cristóbal', lat: 7.64094, lng: -72.18358, info: 'Mun. Torbes, Táchira' }
                ];

                const markerIcon = L.divIcon({
                    html: '<div style="background:var(--primary);color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 6px rgba(0,0,0,0.3); font-size: 0.9rem;"><i class="fa-solid fa-car-side"></i></div>',
                    className: '',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                });

                this.peajesData.forEach(p => {
                    L.marker([p.lat, p.lng], { icon: markerIcon }).addTo(this.map)
                     .bindPopup(`<div style="text-align:center;"><b>${p.name}</b><br><small style="color:#666;">${p.info}</small></div>`);
                });
            }, 300);
        } else {
            setTimeout(() => this.map.invalidateSize(), 100);
        }
    },

    // ===== NAVIGATION & GEOLOCATION =====
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; 
    },

    locateUser() {
        if (!navigator.geolocation) {
            return this.toast('Tu navegador no soporta geolocalización', 'error');
        }

        const btn = document.getElementById('btn-locate');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        if (this._watchId) {
            navigator.geolocation.clearWatch(this._watchId);
        }

        this._watchId = navigator.geolocation.watchPosition((pos) => {
            btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
            btn.style.color = 'var(--success)';

            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;

            if (!this.userMarker) {
                const markerIcon = L.divIcon({
                    html: '<div style="background:var(--primary);border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 0 10px rgba(0,86,179,0.5);"></div>',
                    className: '', iconSize: [18, 18], iconAnchor: [9, 9]
                });
                this.userMarker = L.marker([lat, lng], { icon: markerIcon }).addTo(this.map);
                this.map.setView([lat, lng], 13);
            } else {
                this.userMarker.setLatLng([lat, lng]);
            }

            this.updateNearestPeaje(lat, lng);

        }, (err) => {
            btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
            this.toast('Por favor, activa el GPS', 'error');
        }, { enableHighAccuracy: true });
    },

    updateNearestPeaje(lat, lng) {
        if (!this.peajesData) return;

        let nearest = null;
        let minDist = Infinity;

        this.peajesData.forEach(p => {
            const dist = this.calculateDistance(lat, lng, p.lat, p.lng);
            if (dist < minDist) {
                minDist = dist;
                nearest = p;
            }
        });

        if (nearest) {
            document.getElementById('nav-info-card').style.display = 'block';
            document.getElementById('nav-peaje-name').textContent = nearest.name;
            document.getElementById('nav-peaje-info').textContent = nearest.info;
            
            const realDist = minDist * 1.25; 
            document.getElementById('nav-dist').textContent = realDist.toFixed(1) + ' km';
            
            const horas = realDist / 75;
            const minutos = Math.round(horas * 60);
            
            let timeStr = '';
            if (minutos < 1) timeStr = '< 1 min';
            else if (minutos < 60) timeStr = minutos + ' min';
            else {
                const h = Math.floor(minutos / 60);
                const m = minutos % 60;
                timeStr = `${h}h ${m}m`;
            }
            
            document.getElementById('nav-time').textContent = 'aprox ' + timeStr;
        }
    },

    // ===== TOLL CROSSING SIMULATOR =====
    renderSimulator() {
        const vehicleSelect = document.getElementById('sim-vehicle');
        const tollSelect = document.getElementById('sim-toll');
        
        // Reset Visual elements
        document.getElementById('sim-lcd-screen').textContent = 'Listo para escanear';
        document.getElementById('sim-lcd-screen').style.color = '#38bdf8';
        document.getElementById('light-red').classList.add('active');
        document.getElementById('light-green').classList.remove('active');
        document.getElementById('sim-barrier').classList.remove('open');
        document.getElementById('sim-car').style.left = '-40px';

        // Populate Vehicles
        if (this.state.vehiculos.length === 0) {
            vehicleSelect.innerHTML = '<option value="">Sin vehículos registrados</option>';
        } else {
            vehicleSelect.innerHTML = this.state.vehiculos.map(v => 
                `<option value="${v.id}">${v.marca} [${v.placa}]</option>`
            ).join('');
        }

        // Populate Tolls
        const tolls = this.peajesData || [
            { name: 'Peaje Tazón' },
            { name: 'Peaje Las Tejerías' },
            { name: 'Peaje Palo Negro' },
            { name: 'Peaje Guacara' }
        ];
        tollSelect.innerHTML = tolls.map(p => 
            `<option value="${p.name}">${p.name}</option>`
        ).join('');
    },

    async startTollSimulation() {
        const vehicleId = document.getElementById('sim-vehicle').value;
        const tollName = document.getElementById('sim-toll').value;
        const rate = parseFloat(document.getElementById('sim-category').value);
        const btn = document.getElementById('btn-start-sim');

        if (!vehicleId) {
            return this.toast('Registra un vehículo primero', 'error');
        }

        btn.disabled = true;
        
        const carEl = document.getElementById('sim-car');
        const lcdEl = document.getElementById('sim-lcd-screen');
        const barrierEl = document.getElementById('sim-barrier');
        const lightRed = document.getElementById('light-red');
        const lightGreen = document.getElementById('light-green');

        // Reset positions
        carEl.style.left = '-40px';
        barrierEl.classList.remove('open');
        lightRed.classList.add('active');
        lightGreen.classList.remove('active');
        lcdEl.textContent = 'Aproximando...';
        lcdEl.style.color = '#38bdf8';

        // Phase 1: Car approaches toll barrier (0.8s transition)
        setTimeout(async () => {
            carEl.style.left = '60px'; // positioned in front of barrier
            lcdEl.textContent = 'Escaneando V-Tag...';

            // Phase 2: Simulating RFID scanner validation (1.5s delay)
            setTimeout(async () => {
                const currentBalance = parseFloat(this.state.user.saldo || 0);

                if (currentBalance >= rate) {
                    // Success Path
                    lcdEl.textContent = 'Paso Autorizado';
                    lcdEl.style.color = '#22c55e';
                    lightRed.classList.remove('active');
                    lightGreen.classList.add('active');
                    barrierEl.classList.add('open');
                    
                    this.playBeep(true);

                    // Process Payment
                    if (this.isOnline()) {
                        const res = await this.apiCall('/api/payments/pay-toll/', 'POST', { monto: rate, peaje: tollName });
                        if (res && res.ok) {
                            this.state.user.saldo = res.nuevo_saldo;
                            localStorage.setItem('viago_user', JSON.stringify(this.state.user));
                        }
                    } else {
                        const nuevoSaldo = currentBalance - rate;
                        this.state.user.saldo = nuevoSaldo;
                        this.db.updateUserSaldo(this.state.user.id, nuevoSaldo);
                        localStorage.setItem('viago_user', JSON.stringify(this.state.user));

                        this.db.saveMovimiento(this.state.user.id, {
                            id: Date.now(),
                            tipo: 'PAGO',
                            monto: rate,
                            ubicacion: tollName,
                            fecha: new Date().toISOString()
                        });
                    }

                    this.toast(`Cruce registrado: -${rate.toFixed(2)} Bs`, 'success');
                    this.addNotification('fa-solid fa-arrow-up', 'pago', `Cobro de peaje: -${rate.toFixed(2)} Bs`, `${tollName}`);

                    // Phase 3: Car drives through gate
                    setTimeout(() => {
                        carEl.style.left = '200px'; // passed through

                        // Reset visual board after car exits
                        setTimeout(() => {
                            barrierEl.classList.remove('open');
                            lightRed.classList.add('active');
                            lightGreen.classList.remove('active');
                            lcdEl.textContent = 'Listo para escanear';
                            lcdEl.style.color = '#38bdf8';
                            carEl.style.left = '-40px';
                            btn.disabled = false;
                        }, 1200);

                    }, 1000);

                } else {
                    // Insufficient Balance Path
                    lcdEl.textContent = 'Saldo Insuficiente';
                    lcdEl.style.color = '#ef4444';
                    this.playBeep(false);
                    this.toast('Saldo insuficiente en tu cuenta viaGO', 'error');

                    // Reset car position
                    setTimeout(() => {
                        carEl.style.left = '-40px';
                        lcdEl.textContent = 'Listo para escanear';
                        lcdEl.style.color = '#38bdf8';
                        btn.disabled = false;
                    }, 2000);
                }

            }, 1500);

        }, 200);
    },

    playBeep(success = true) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            if (success) {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1000, ctx.currentTime);
                gain.gain.setValueAtTime(0.08, ctx.currentTime);
                osc.start();
                osc.stop(ctx.currentTime + 0.12);
            } else {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(140, ctx.currentTime);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                osc.start();
                osc.stop(ctx.currentTime + 0.35);
            }
        } catch (e) {
            console.error('Audio synthesizer error:', e);
        }
    },

    // ===== SLEEK DARK MODE TOGGLE =====
    toggleDarkMode() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('viago_dark_mode', newTheme === 'dark');
        
        const sw = document.getElementById('dark-mode-switch');
        if (sw) {
            sw.classList.toggle('active', newTheme === 'dark');
        }

        this.toast(`Modo ${newTheme === 'dark' ? 'oscuro' : 'claro'} activado`);

        // If map is loaded, swap layers dynamically
        if (this.map) {
            this.map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) {
                    this.map.removeLayer(layer);
                }
            });
            const tileUrl = newTheme === 'dark' 
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
            L.tileLayer(tileUrl, {
                attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
            }).addTo(this.map);
        }
    },

    // ===== LOGOUT =====
    showLogoutModal() {
        document.getElementById('modal-logout').classList.add('active');
    },

    closeModal(id) {
        document.getElementById(id).classList.remove('active');
    },

    logout() {
        this.closeModal('modal-logout');
        this.state.token = null;
        this.state.user = null;
        this.state.vehiculos = [];
        this.state.movimientos = [];
        localStorage.removeItem('viago_token');
        localStorage.removeItem('viago_user');
        this.toast('Sesión cerrada');
        this.navigate('login');
    },

    // ===== TOAST =====
    toast(msg, type = '') {
        const el = document.getElementById('toast-msg');
        if (el) {
            el.textContent = msg;
            el.className = 'toast show ' + type;
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
        }
    },

    // ===== NOTIFICATIONS SYSTEM =====
    getNotifications() {
        return JSON.parse(localStorage.getItem('viago_notifications') || '[]');
    },

    saveNotifications(notifs) {
        localStorage.setItem('viago_notifications', JSON.stringify(notifs));
    },

    addNotification(icon, iconClass, title, body) {
        const notifs = this.getNotifications();
        notifs.unshift({
            id: Date.now(),
            icon,
            iconClass,
            title,
            body,
            time: new Date().toISOString(),
            read: false
        });
        // Keep max 20 notifications
        if (notifs.length > 20) notifs.length = 20;
        this.saveNotifications(notifs);
        this.updateNotifBadge();
    },

    updateNotifBadge() {
        const notifs = this.getNotifications();
        const unread = notifs.filter(n => !n.read).length;
        const badge = document.getElementById('notif-badge');
        if (badge) {
            badge.classList.toggle('visible', unread > 0);
        }
    },

    toggleNotifications() {
        const dd = document.getElementById('notif-dropdown');
        const isOpen = dd.classList.contains('open');
        if (isOpen) {
            dd.classList.remove('open');
        } else {
            // Position dropdown below the bell icon
            const bell = document.querySelector('.notif-wrapper .bell');
            if (bell) {
                const rect = bell.getBoundingClientRect();
                dd.style.top = (rect.bottom + 10) + 'px';
                dd.style.right = (window.innerWidth - rect.right - 10) + 'px';
            }
            this.renderNotifications();
            dd.classList.add('open');
        }
    },

    renderNotifications() {
        const list = document.getElementById('notif-list');
        const notifs = this.getNotifications();

        if (notifs.length === 0) {
            list.innerHTML = '<li class="notif-empty"><i class="fa-regular fa-bell-slash"></i> Sin notificaciones</li>';
            return;
        }

        list.innerHTML = notifs.map(n => {
            const date = new Date(n.time);
            const timeStr = date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            return `
                <li class="notif-item ${n.read ? '' : 'unread'}">
                    <div class="notif-icon ${n.iconClass}"><i class="${n.icon}"></i></div>
                    <div class="notif-body">
                        <strong>${n.title}</strong>
                        <small>${timeStr}</small>
                    </div>
                </li>
            `;
        }).join('');
    },

    clearNotifications() {
        const notifs = this.getNotifications();
        notifs.forEach(n => n.read = true);
        this.saveNotifications(notifs);
        this.updateNotifBadge();
        this.renderNotifications();
        this.toast('Notificaciones marcadas como leídas');
    }
};

// Close notification dropdown when clicking outside
document.addEventListener('click', (e) => {
    const wrapper = document.querySelector('.notif-wrapper');
    const dd = document.getElementById('notif-dropdown');
    if (wrapper && dd && !wrapper.contains(e.target)) {
        dd.classList.remove('open');
    }
});

// ===== BOOT =====
window.addEventListener('DOMContentLoaded', () => app.init());
