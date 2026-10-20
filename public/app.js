/**
 * COMEX Track - Sistema de Control y Seguimiento Logístico de Exportaciones
 * Lógica de frontend, gestión de estado y conexión directa con Supabase
 */

// ----------------------------------------------------------------------------
// 1. CONFIGURACIÓN Y CLIENTE SUPABASE
// ----------------------------------------------------------------------------
// La URL y la llave anon (pública por diseño) se leen de /api/config.
// Todas las consultas se hacen como el usuario que inició sesión, así que aplican los permisos (RLS) de Supabase.
// En este código NO hay ninguna llave secreta.
let supabaseClient = null;

const $id = (x) => document.getElementById(x);
function showLogin(msg) {
    $id('loginMsg').textContent = msg || '';
    $id('loginMsg').classList.toggle('hidden', !msg);
    $id('loginOverlay').classList.remove('hidden');
    $id('userBox').classList.add('hidden'); $id('userBox').classList.remove('flex');
    setTimeout(() => $id('loginEmail') && $id('loginEmail').focus(), 0);
}
function hideLogin(email) {
    $id('loginOverlay').classList.add('hidden');
    $id('loginMsg').textContent = ''; $id('loginMsg').classList.add('hidden');
    if (email) { $id('userEmail').textContent = email; $id('userBox').classList.remove('hidden'); $id('userBox').classList.add('flex'); }
}
// Usa el nombre del responsable a partir del correo (catalina.white@... -> Catalina).
// Con un correo que no corresponde a un responsable (p. ej. el usuario compartido) no cambia nada:
// queda lo que la persona eligió en este navegador (localStorage) o vacío.
function syncUserFromEmail(email) {
    const first = String(email || '').split('@')[0].split(/[._-]/)[0];
    if (!first) return;
    const name = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    const sel = $id('globalUserSelector');
    if (sel && [...sel.options].some(o => o.value === name)) {
        AppState.currentUser = name; sel.value = name; localStorage.setItem('comex_active_user', name);
    }
}
let appStarted = false;
async function startApp(session) {
    const email = session.user && session.user.email;
    hideLogin(email);
    syncUserFromEmail(email);
    if (appStarted) { await checkDatabaseAndLoad(); return; }
    appStarted = true;
    initUserSelector();
    syncUserFromEmail(email);
    initDateInputs();
    setupNavigation();
    await checkDatabaseAndLoad();
}
async function initAuth() {
    let cfg;
    try {
        const r = await fetch('/api/config', { cache: 'no-store' });
        cfg = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(cfg.message || `Error ${r.status}`);
    } catch (e) {
        return showLogin('No pude leer la configuración del servidor: ' + e.message);
    }
    supabaseClient = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'comex-export-auth' },
    });
    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') showLogin($id('loginMsg').textContent);
    });
    $id('loginForm').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const email = $id('loginEmail').value.trim(), password = $id('loginPwd').value;
        if (!email || !password) return;
        $id('loginBtn').disabled = true; $id('loginBtn').textContent = 'Entrando…';
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        $id('loginBtn').disabled = false; $id('loginBtn').textContent = 'Entrar';
        if (error) {
            return showLogin(/invalid login/i.test(error.message) ? 'Correo o contraseña incorrectos.'
                : /not confirmed/i.test(error.message) ? 'El correo no está confirmado.' : 'No pude iniciar sesión: ' + error.message);
        }
        $id('loginPwd').value = '';
        startApp(data.session);
    });
    $id('btnLogout').addEventListener('click', async () => { await supabaseClient.auth.signOut({ scope: 'local' }).catch(() => {}); showLogin(''); });
    const { data } = await supabaseClient.auth.getSession();
    if (data && data.session) startApp(data.session); else showLogin('');
}

// ----------------------------------------------------------------------------
// 2. ESTADO GLOBAL DE LA APLICACIÓN
// ----------------------------------------------------------------------------
const AppState = {
    currentUser: localStorage.getItem('comex_active_user') || '',  // sin valor por defecto: con el usuario compartido cada persona lo elige
    activeTab: 'operations', // 'operations', 'new_operation', 'detail', 'dashboard'
    catalogs: {
        responsables: [],
        clientes: [],
        navieras: [],
        agentes_carga: [],
        etapas: []
    },
    operations: [],
    selectedOperationId: null,
    selectedOperation: null,
    filters: {
        search: '',
        etapa: '',
        responsable: '',
        modalidad: '',
        estado: 'activa',
        soloActivas: true
    },
    dashboard: {
        countryFilter: '',
        incotermFilter: '',
        stagnantDays: 5,
        charts: {}
    },
    databaseReady: true
};

// ----------------------------------------------------------------------------
// 3. COLORES Y SEMÁNTICA DE LAS 8 ETAPAS
// ----------------------------------------------------------------------------
const ETAPA_COLORS = {
    1: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-600' },
    2: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-600' },
    3: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-600' },
    4: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-600' },
    5: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-600' },
    6: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-600' },
    7: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', dot: 'bg-teal-600' },
    8: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-600' }
};

// ----------------------------------------------------------------------------
// 4. INICIALIZACIÓN
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) lucide.createIcons();
    initAuth();
});

function initUserSelector() {
    const selector = document.getElementById('globalUserSelector');
    if (selector) {
        if (![...selector.options].some(o => o.value === '')) {
            const opt = document.createElement('option'); opt.value = ''; opt.textContent = '— Elige —';
            selector.insertBefore(opt, selector.firstChild);
        }
        selector.value = AppState.currentUser;
        if (selector.value !== AppState.currentUser) { AppState.currentUser = ''; selector.value = ''; }
        selector.addEventListener('change', (e) => {
            AppState.currentUser = e.target.value;
            if (AppState.currentUser) localStorage.setItem('comex_active_user', AppState.currentUser);
            else localStorage.removeItem('comex_active_user');
            if (AppState.currentUser) showToast(`Usuario activo: ${AppState.currentUser}`);
            // Actualizar selectores en formularios si están abiertos
            const formResp = document.getElementById('newOpResponsable');
            if (formResp) formResp.value = getResponsibleIdByName(AppState.currentUser) || formResp.value;
        });
    }
}

function initDateInputs() {
    const today = new Date().toISOString().split('T')[0];
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        if (!input.value) input.value = today;
    });
}

function setupNavigation() {
    const navButtons = document.querySelectorAll('[data-tab-target]');
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = btn.getAttribute('data-tab-target');
            switchTab(target);
        });
    });
}

function switchTab(tabName) {
    AppState.activeTab = tabName;
    
    // Ocultar todos los paneles
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    // Mostrar panel activo
    const activePanel = document.getElementById(`tab-${tabName}`);
    if (activePanel) {
        activePanel.classList.remove('hidden');
    }
    
    // Actualizar estilos botones
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
        const target = btn.getAttribute('data-tab-target');
        if (target === tabName) {
            btn.className = "flex items-center gap-2 px-4 py-2 font-medium text-sm rounded-lg bg-blue-600 text-white shadow-sm transition";
        } else {
            btn.className = "flex items-center gap-2 px-4 py-2 font-medium text-sm rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition";
        }
    });

    if (tabName === 'operations') {
        renderOperationsTable();
    } else if (tabName === 'dashboard') {
        loadDashboardMetrics();
    } else if (tabName === 'new_operation') {
        resetNewOperationForm();
    }
    
    if (window.lucide) lucide.createIcons();
}

// ----------------------------------------------------------------------------
// 5. VERIFICACIÓN Y CARGA DE CATÁLOGOS
// ----------------------------------------------------------------------------
async function checkDatabaseAndLoad() {
    showLoading(true);
    try {
        // Intentar consultar etapas_catalogo
        const { data: etapas, error: etapasErr } = await supabaseClient
            .from('etapas_catalogo')
            .select('*')
            .order('orden');

        if (etapasErr) {
            console.warn("Base de datos no inicializada:", etapasErr);
            showSchemaMissingBanner(true);
            AppState.databaseReady = false;
            showLoading(false);
            return;
        }

        showSchemaMissingBanner(false);
        AppState.databaseReady = true;
        AppState.catalogs.etapas = etapas || [];

        // Cargar el resto de catálogos
        await loadAllCatalogs();
        await loadOperations();
        updateGlobalCounters();

    } catch (err) {
        console.error("Error al conectar con Supabase:", err);
        showSchemaMissingBanner(true);
    } finally {
        showLoading(false);
    }
}

async function loadAllCatalogs() {
    try {
        const [respRes, clientRes, navRes, agRes] = await Promise.all([
            supabaseClient.from('responsables').select('*').order('nombre'),
            supabaseClient.from('clientes').select('*').order('nombre'),
            supabaseClient.from('navieras').select('*').order('nombre'),
            supabaseClient.from('agentes_carga').select('*').order('nombre')
        ]);

        AppState.catalogs.responsables = respRes.data || [];
        AppState.catalogs.clientes = clientRes.data || [];
        AppState.catalogs.navieras = navRes.data || [];
        AppState.catalogs.agentes_carga = agRes.data || [];

        populateDropdowns();
    } catch (e) {
        console.error("Error cargando catálogos:", e);
    }
}

function populateDropdowns() {
    // Dropdowns en formulario Nueva Operación
    populateSelect('newOpCliente', AppState.catalogs.clientes, 'id', 'nombre', '-- Seleccionar Cliente --');
    populateSelect('newOpResponsable', AppState.catalogs.responsables, 'id', 'nombre', '-- Seleccionar responsable --');
    populateSelect('newOpNaviera', AppState.catalogs.navieras, 'id', 'nombre', '-- Ninguna / No Aplica --');
    populateSelect('newOpAgente', AppState.catalogs.agentes_carga, 'id', 'nombre', '-- Ninguno / No Aplica --');

    // Dropdowns en filtros
    populateSelect('filterEtapa', AppState.catalogs.etapas, 'orden', (e) => `${e.orden}. ${e.nombre}`, 'Todas las Etapas');
    populateSelect('filterResponsable', AppState.catalogs.responsables, 'id', 'nombre', 'Todos los Responsables');

    // Dropdowns en modal Editar FP
    populateSelect('editOpCliente', AppState.catalogs.clientes, 'id', 'nombre', '-- Seleccionar Cliente --');
    populateSelect('editOpResponsable', AppState.catalogs.responsables, 'id', 'nombre');
    populateSelect('editOpNaviera', AppState.catalogs.navieras, 'id', 'nombre', '-- Ninguna / No Aplica --');
    populateSelect('editOpAgente', AppState.catalogs.agentes_carga, 'id', 'nombre', '-- Ninguno / No Aplica --');

    // Seleccionar por defecto el usuario activo
    const defaultRespId = getResponsibleIdByName(AppState.currentUser);
    if (defaultRespId) {
        const respSelect = document.getElementById('newOpResponsable');
        if (respSelect) respSelect.value = defaultRespId;
    }

    // Al cambiar cliente en formulario, sugerir país predeterminado
    const clientSelect = document.getElementById('newOpCliente');
    if (clientSelect) {
        clientSelect.addEventListener('change', (e) => {
            const selectedClient = AppState.catalogs.clientes.find(c => c.id === e.target.value);
            if (selectedClient && selectedClient.pais_predeterminado) {
                const countryInput = document.getElementById('newOpPaisDestino');
                if (countryInput && !countryInput.value) {
                    countryInput.value = selectedClient.pais_predeterminado;
                }
            }
        });
    }
}

function populateSelect(elementId, items, valueKey, labelKeyOrFn, defaultOptionText = null) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    el.innerHTML = '';
    if (defaultOptionText) {
        const defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = defaultOptionText;
        el.appendChild(defOpt);
    }

    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item[valueKey];
        opt.textContent = typeof labelKeyOrFn === 'function' ? labelKeyOrFn(item) : item[labelKeyOrFn];
        el.appendChild(opt);
    });
}

function getResponsibleIdByName(name) {
    const found = AppState.catalogs.responsables.find(r => r.nombre.toLowerCase() === name.toLowerCase());
    return found ? found.id : null;
}

// ----------------------------------------------------------------------------
// 6. GESTIÓN Y LISTADO DE OPERACIONES
// ----------------------------------------------------------------------------
async function loadOperations() {
    showLoading(true);
    try {
        const { data, error } = await supabaseClient
            .from('operaciones')
            .select(`
                *,
                cliente:clientes(id, nombre, pais_predeterminado),
                responsable:responsables!responsable_id(id, nombre),
                naviera:navieras(id, nombre),
                agente:agentes_carga(id, nombre),
                pedidos:pedidos_sap(id, numero_ov, valor, facturas(id, numero_factura, valor_usd, fecha_factura))
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        AppState.operations = data || [];
        renderOperationsTable();
        updateGlobalCounters();
    } catch (e) {
        console.error("Error al cargar operaciones:", e);
        showToast("Error al cargar operaciones", "error");
    } finally {
        showLoading(false);
    }
}

// ----------------------------------------------------------------------------
// REGLAS FIRPLAK: FACTURACIÓN Y CONVERSIÓN DE PORCENTAJES
// ----------------------------------------------------------------------------
function calcularEstadoFacturacion(op) {
    const pedidos = op.pedidos || [];
    if (!pedidos || pedidos.length === 0) {
        return 'PENDIENTE';
    }
    const ovsConFactura = pedidos.filter(p => p.facturas && p.facturas.length > 0).length;
    if (ovsConFactura === 0) {
        return 'PENDIENTE';
    }
    if (ovsConFactura === pedidos.length) {
        return 'FACTURADA';
    }
    return 'PARCIAL';
}

function getFacturacionBadge(estado) {
    switch (estado) {
        case 'FACTURADA':
            return `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> FACTURADA
            </span>`;
        case 'PARCIAL':
            return `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span> PARCIAL
            </span>`;
        case 'PENDIENTE':
        default:
            return `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> PENDIENTE
            </span>`;
    }
}

function parsePercentageForDb(val) {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(val);
    if (isNaN(num)) return null;
    // Si el usuario ingresa 90 (para 90%) se almacena 0.90; si ingresa 100 se almacena 1.00
    if (num > 1.5) {
        return parseFloat((num / 100).toFixed(4));
    }
    return num;
}

function renderOperationsTable() {
    const tbody = document.getElementById('operationsTableBody');
    if (!tbody) return;

    const filtered = filterOperations(AppState.operations);
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-12 text-slate-400">
                    <div class="flex flex-col items-center justify-center gap-2">
                        <i data-lucide="inbox" class="w-10 h-10 text-slate-300"></i>
                        <p class="text-base font-medium text-slate-600">No se encontraron operaciones</p>
                        <p class="text-sm">Ajusta los filtros o crea una nueva operación.</p>
                    </div>
                </td>
            </tr>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    const today = new Date();

    filtered.forEach(op => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition border-b border-slate-100 cursor-pointer";
        
        // Calcular días sin movimiento
        const lastDate = op.fecha_ultima_etapa ? new Date(op.fecha_ultima_etapa) : new Date(op.created_at);
        const diffDays = Math.max(0, Math.floor((today - lastDate) / (1000 * 60 * 60 * 24)));
        const isStagnant = op.estado === 'activa' && diffDays >= AppState.dashboard.stagnantDays;

        // Estilo de Etapa
        const etapaCfg = ETAPA_COLORS[op.etapa_actual_orden] || ETAPA_COLORS[1];

        // Total SAP
        const totalSap = (op.pedidos || []).reduce((acc, p) => acc + (parseFloat(p.valor) || 0), 0);
        const cantSap = (op.pedidos || []).length;
        const estadoFact = calcularEstadoFacturacion(op);

        tr.innerHTML = `
            <td class="px-4 py-3.5 font-semibold text-slate-900">
                <div class="flex items-center gap-1.5">
                    ${!op.tiene_fp ? '<span class="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-800 rounded font-medium">Sin FP</span>' : ''}
                    <span>${op.fp}</span>
                </div>
            </td>
            <td class="px-4 py-3.5">
                <div class="font-medium text-slate-800">${op.cliente?.nombre || 'N/A'}</div>
                <div class="text-xs text-slate-500">${op.pais_destino}</div>
            </td>
            <td class="px-4 py-3.5">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                    ${op.modalidad}
                </span>
                <span class="text-xs text-slate-500 ml-1">(${op.incoterm})</span>
            </td>
            <td class="px-4 py-3.5 text-sm text-slate-600 font-mono text-xs">
                ${op.contenedor || '<span class="text-slate-400">Sin asignar</span>'}
            </td>
            <td class="px-4 py-3.5">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${etapaCfg.bg} ${etapaCfg.text} border ${etapaCfg.border}">
                    <span class="w-1.5 h-1.5 rounded-full ${etapaCfg.dot}"></span>
                    ${op.etapa_actual_orden}. ${op.etapa_actual_nombre}
                </span>
            </td>
            <td class="px-4 py-3.5">
                ${getFacturacionBadge(estadoFact)}
            </td>
            <td class="px-4 py-3.5 text-sm">
                <div class="flex items-center gap-1.5">
                    ${isStagnant ? `
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded bg-rose-100 text-rose-700 animate-pulse" title="Alerta: Operación estancada">
                            <i data-lucide="alert-triangle" class="w-3 h-3"></i> ${diffDays}d
                        </span>
                    ` : `
                        <span class="text-xs text-slate-600">${diffDays} días</span>
                    `}
                </div>
            </td>
            <td class="px-4 py-3.5 text-sm text-slate-700">
                <div class="text-xs font-medium">${cantSap > 0 ? `${cantSap} pedidos` : '<span class="text-slate-400">0</span>'}</div>
                ${totalSap > 0 ? `<div class="text-xs text-slate-500">$${totalSap.toLocaleString('es-CO', { minimumFractionDigits: 0 })} USD</div>` : ''}
            </td>
            <td class="px-4 py-3.5 text-right">
                <button onclick="viewOperationDetail('${op.id}')" class="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition inline-flex items-center gap-1">
                    Ver Detalle <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                </button>
            </td>
        `;

        tr.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                viewOperationDetail(op.id);
            }
        });

        tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

function filterOperations(ops) {
    const f = AppState.filters;
    const searchLow = f.search.trim().toLowerCase();

    return ops.filter(op => {
        // Regla: filtro "Solo activas" activado por defecto
        if (f.soloActivas) {
            if (op.estado !== 'activa') return false;
        } else if (f.estado && op.estado !== f.estado) {
            return false;
        }

        // Filtro por Etapa
        if (f.etapa && String(op.etapa_actual_orden) !== String(f.etapa)) return false;

        // Filtro por Responsable
        if (f.responsable && op.responsable_id !== f.responsable) return false;

        // Filtro por Modalidad
        if (f.modalidad && op.modalidad !== f.modalidad) return false;

        // Búsqueda por texto (FP, Cliente, Contenedor, Pedidos SAP, BL, MN/VY)
        if (searchLow) {
            const fpMatch = (op.fp || '').toLowerCase().includes(searchLow);
            const clientMatch = (op.cliente?.nombre || '').toLowerCase().includes(searchLow);
            const containerMatch = (op.contenedor || '').toLowerCase().includes(searchLow);
            const blMatch = (op.documento_transporte || '').toLowerCase().includes(searchLow);
            const mnMatch = (op.motonave_viaje || '').toLowerCase().includes(searchLow);
            const sapMatch = (op.pedidos || []).some(p => ((p.numero_ov || p.numero_pedido_sap || '')).toLowerCase().includes(searchLow));
            if (!fpMatch && !clientMatch && !containerMatch && !blMatch && !mnMatch && !sapMatch) return false;
        }

        return true;
    });
}

function handleSoloActivasChange(checked) {
    AppState.filters.soloActivas = checked;
    const estadoSelect = document.getElementById('filterEstado');
    if (estadoSelect) {
        if (checked) {
            estadoSelect.value = 'activa';
            AppState.filters.estado = 'activa';
        }
    }
    renderOperationsTable();
}

function handleFilterChange() {
    AppState.filters.search = document.getElementById('filterSearch')?.value || '';
    AppState.filters.etapa = document.getElementById('filterEtapa')?.value || '';
    AppState.filters.responsable = document.getElementById('filterResponsable')?.value || '';
    AppState.filters.modalidad = document.getElementById('filterModalidad')?.value || '';
    AppState.filters.estado = document.getElementById('filterEstado')?.value || '';

    const soloActivasCheckbox = document.getElementById('filterSoloActivas');
    if (soloActivasCheckbox) {
        if (AppState.filters.estado && AppState.filters.estado !== 'activa') {
            soloActivasCheckbox.checked = false;
            AppState.filters.soloActivas = false;
        } else if (AppState.filters.estado === 'activa') {
            soloActivasCheckbox.checked = true;
            AppState.filters.soloActivas = true;
        }
    }

    renderOperationsTable();
}

function updateGlobalCounters() {
    const ops = AppState.operations;
    const total = ops.length;
    const activas = ops.filter(o => o.estado === 'activa').length;
    const cerradas = ops.filter(o => o.estado === 'cerrada').length;
    
    const today = new Date();
    const estancadas = ops.filter(o => {
        if (o.estado !== 'activa') return false;
        const last = o.fecha_ultima_etapa ? new Date(o.fecha_ultima_etapa) : new Date(o.created_at);
        const days = Math.floor((today - last) / (1000 * 60 * 60 * 24));
        return days >= AppState.dashboard.stagnantDays;
    }).length;

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('statTotalOps', total);
    setTxt('statActivas', activas);
    setTxt('statCerradas', cerradas);
    setTxt('statEstancadas', estancadas);

    const badgeEstancadas = document.getElementById('statEstancadasBadge');
    if (badgeEstancadas) {
        if (estancadas > 0) {
            badgeEstancadas.className = "flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold animate-pulse";
        } else {
            badgeEstancadas.className = "flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold";
        }
    }
}

// ----------------------------------------------------------------------------
// 7. PANTALLA: NUEVA OPERACIÓN
// ----------------------------------------------------------------------------
function toggleTieneFp(checkbox) {
    const tieneFp = checkbox.checked;
    const blockCotizacion = document.getElementById('blockCotizacionSinFp');
    const fpInput = document.getElementById('newOpFp');
    const labelTieneFp = document.getElementById('labelTieneFp');

    if (tieneFp) {
        if (blockCotizacion) blockCotizacion.classList.add('hidden');
        if (labelTieneFp) labelTieneFp.textContent = "Sí, cuenta con consecutivo FP oficial";
        if (fpInput && fpInput.placeholder.startsWith('COT-')) fpInput.value = '';
    } else {
        if (blockCotizacion) blockCotizacion.classList.remove('hidden');
        if (labelTieneFp) labelTieneFp.textContent = "No tiene FP (Requiere registro de cotización MAC)";
        // Sugerir código provisional de cotización si está vacío
        if (fpInput && !fpInput.value) {
            const year = new Date().getFullYear();
            const rand = Math.floor(1000 + Math.random() * 9000);
            fpInput.value = `COT-${year}-${rand}`;
        }
    }
}

function resetNewOperationForm() {
    const form = document.getElementById('formNewOperation');
    if (form) form.reset();
    initDateInputs();
    
    const tieneFpCheck = document.getElementById('newOpTieneFp');
    if (tieneFpCheck) {
        tieneFpCheck.checked = true;
        toggleTieneFp(tieneFpCheck);
    }

    const defaultRespId = getResponsibleIdByName(AppState.currentUser);
    if (defaultRespId) {
        const respSelect = document.getElementById('newOpResponsable');
        if (respSelect) respSelect.value = defaultRespId;
    }

    ['newOpTipoFp', 'newOpDecisionMes', 'newOpOcupacion', 'newOpPorcentajeEntrega', 
     'newOpEstadoPlanta', 'newOpFechaProgDespacho', 'newOpDocumentoTransporte', 
     'newOpFechaBl', 'newOpMotonaveViaje'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

async function handleCreateOperation(e) {
    e.preventDefault();
    showLoading(true);

    try {
        const fp = document.getElementById('newOpFp').value.trim();
        const cliente_id = document.getElementById('newOpCliente').value;
        const pais_destino = document.getElementById('newOpPaisDestino').value.trim();
        const incoterm = document.getElementById('newOpIncoterm').value;
        const modalidad = document.querySelector('input[name="modalidad"]:checked')?.value || 'FCL';
        const contenedor = document.getElementById('newOpContenedor').value.trim() || null;
        const responsable_id = document.getElementById('newOpResponsable').value;
        const naviera_id = document.getElementById('newOpNaviera').value || null;
        const agente_carga_id = document.getElementById('newOpAgente').value || null;
        const fecha_modulacion = document.getElementById('newOpFechaModulacion').value;
        const tiene_fp = document.getElementById('newOpTieneFp').checked;

        // Nuevos campos operacionales Firplak (todos opcionales)
        const tipo_fp = document.getElementById('newOpTipoFp')?.value || null;
        const decision_mes = document.getElementById('newOpDecisionMes')?.value || null;
        const ocupacion_contenedor = parsePercentageForDb(document.getElementById('newOpOcupacion')?.value);
        const porcentaje_entrega = parsePercentageForDb(document.getElementById('newOpPorcentajeEntrega')?.value);
        const estado_planta = document.getElementById('newOpEstadoPlanta')?.value.trim() || null;
        const fecha_programada_despacho = document.getElementById('newOpFechaProgDespacho')?.value || null;
        const documento_transporte = document.getElementById('newOpDocumentoTransporte')?.value.trim() || null;
        const fecha_bl = document.getElementById('newOpFechaBl')?.value || null;
        const motonave_viaje = document.getElementById('newOpMotonaveViaje')?.value.trim() || null;

        if (!fp || !cliente_id || !pais_destino || !incoterm || !responsable_id || !fecha_modulacion) {
            showToast("Por favor completa los campos obligatorios.", "warning");
            showLoading(false);
            return;
        }

        // Datos de la operación
        const opPayload = {
            fp,
            cliente_id,
            pais_destino,
            incoterm,
            modalidad,
            contenedor,
            responsable_id,
            naviera_id,
            agente_carga_id,
            tiene_fp,
            fecha_modulacion,
            estado: 'activa',
            tipo_fp,
            decision_mes,
            ocupacion_contenedor,
            porcentaje_entrega,
            estado_planta,
            fecha_programada_despacho,
            documento_transporte,
            fecha_bl,
            motonave_viaje
        };

        const { data: opData, error: opError } = await supabaseClient
            .from('operaciones')
            .insert(opPayload)
            .select()
            .single();

        if (opError) {
            if (opError.message.includes('unique') || opError.message.includes('fp')) {
                throw new Error(`El consecutivo FP '${fp}' ya se encuentra registrado.`);
            }
            throw opError;
        }

        // Si no tiene FP, registrar la cotización en cotizaciones_sin_fp
        if (!tiene_fp) {
            const archivo_o_link = document.getElementById('cotLink').value.trim();
            const fecha_envio_mac = document.getElementById('cotFechaMac').value;
            const motivo = document.getElementById('cotMotivo').value;
            const observaciones = document.getElementById('cotObservaciones').value.trim();

            if (!archivo_o_link) {
                showToast("Operación creada, pero falta el enlace de la cotización.", "warning");
            } else {
                const { error: cotErr } = await supabaseClient
                    .from('cotizaciones_sin_fp')
                    .insert({
                        operacion_id: opData.id,
                        archivo_o_link,
                        fecha_envio_mac,
                        motivo,
                        observaciones: observaciones || null
                    });
                if (cotErr) console.error("Error al registrar cotización:", cotErr);
            }
        }

        showToast(`¡Operación ${fp} creada con éxito! Etapa 1 inicializada.`, "success");
        await loadOperations();
        viewOperationDetail(opData.id);

    } catch (err) {
        console.error("Error al crear operación:", err);
        showToast(err.message || "Error al crear operación.", "error");
    } finally {
        showLoading(false);
    }
}

// ----------------------------------------------------------------------------
// 8. PANTALLA: DETALLE DE OPERACIÓN & STEPPER DE 8 ETAPAS
// ----------------------------------------------------------------------------
async function viewOperationDetail(operationId) {
    AppState.selectedOperationId = operationId;
    switchTab('detail');
    await loadOperationDetail(operationId);
}

async function loadOperationDetail(operationId) {
    showLoading(true);
    try {
        const { data: op, error: opErr } = await supabaseClient
            .from('operaciones')
            .select(`
                *,
                cliente:clientes(*),
                responsable:responsables!responsable_id(*),
                naviera:navieras(*),
                agente:agentes_carga(*),
                pedidos:pedidos_sap(*, facturas(*)),
                historial:historial_etapas(*, etapa:etapas_catalogo(*), responsable:responsables(*)),
                cotizacion:cotizaciones_sin_fp(*)
            `)
            .eq('id', operationId)
            .single();

        if (opErr) throw opErr;
        AppState.selectedOperation = op;
        renderOperationDetailView(op);
    } catch (err) {
        console.error("Error al cargar detalle de operación:", err);
        showToast("Error al cargar el detalle de la operación.", "error");
    } finally {
        showLoading(false);
    }
}

function renderOperationDetailView(op) {
    // Encabezado
    document.getElementById('detFp').textContent = op.fp;
    document.getElementById('detCliente').textContent = op.cliente?.nombre || 'N/A';
    document.getElementById('detPais').textContent = op.pais_destino;
    document.getElementById('detModalidad').textContent = `${op.modalidad} (${op.incoterm})`;
    document.getElementById('detContenedor').textContent = op.contenedor || 'Sin asignar';
    document.getElementById('detResponsable').textContent = op.responsable?.nombre || 'N/A';
    document.getElementById('detNaviera').textContent = op.naviera?.nombre || 'N/A';
    document.getElementById('detAgente').textContent = op.agente?.nombre || 'N/A';
    document.getElementById('detFechaModulacion').textContent = op.fecha_modulacion || 'N/A';

    // Fila 2 Firplak: Estado Facturación y datos de despacho
    const estadoFact = calcularEstadoFacturacion(op);
    const factEl = document.getElementById('detEstadoFacturacion');
    if (factEl) factEl.innerHTML = getFacturacionBadge(estadoFact);

    const setDet = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setDet('detTipoFp', op.tipo_fp || 'Sin definir');
    setDet('detDecisionMes', op.decision_mes || 'Sin definir');

    // N° BL y Fecha BL (el N° BL ya existe en documento_transporte)
    const blNum = op.documento_transporte || 'Sin N° BL';
    const blFecha = op.fecha_bl ? ` (${op.fecha_bl})` : '';
    setDet('detBlInfo', `${blNum}${blFecha}`);

    // Motonave / Viaje
    setDet('detMotonaveViaje', op.motonave_viaje || 'Sin asignar');

    // Ocupación / Entrega
    const ocupPct = op.ocupacion_contenedor != null 
        ? `${(op.ocupacion_contenedor <= 1.5 ? op.ocupacion_contenedor * 100 : op.ocupacion_contenedor).toFixed(0)}% ocup.` 
        : '-';
    const entPct = op.porcentaje_entrega != null 
        ? `${(op.porcentaje_entrega <= 1.5 ? op.porcentaje_entrega * 100 : op.porcentaje_entrega).toFixed(0)}% ent.` 
        : '-';
    const stPlanta = op.estado_planta ? ` [${op.estado_planta}]` : '';
    setDet('detOcupacionEntrega', `${ocupPct} / ${entPct}${stPlanta}`);

    // Estado Badge y Selector
    const statusBadge = document.getElementById('detEstadoBadge');
    if (statusBadge) {
        const statusColors = {
            activa: 'bg-blue-100 text-blue-800 border-blue-200',
            cerrada: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            bloqueada: 'bg-rose-100 text-rose-800 border-rose-200'
        };
        statusBadge.className = `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${statusColors[op.estado] || statusColors.activa}`;
        statusBadge.textContent = op.estado;
    }

    const statusSelect = document.getElementById('detChangeStatusSelect');
    if (statusSelect) statusSelect.value = op.estado;

    // Renderizar Timeline de las 8 Etapas
    renderTimelineStepper(op);

    // Renderizar Auditoría de Historial
    renderHistoryTable(op.historial || []);

    // Renderizar Órdenes de Venta (SAP) y Facturas
    renderOvSection(op.pedidos || []);

    // Renderizar Tarjeta Cotización MAC (si aplica)
    renderCotizacionCard(op);

    if (window.lucide) lucide.createIcons();
}

function renderTimelineStepper(op) {
    const container = document.getElementById('timelineStepperContainer');
    if (!container) return;
    container.innerHTML = '';

    const etapas = AppState.catalogs.etapas;
    const historial = op.historial || [];

    // Mapear qué etapas están registradas.
    // Regla: mostrar siempre la fila más recientemente INSERTADA (created_at más alto),
    // que corresponde a la última corrección o registro confirmado.
    const stageMap = {};
    historial.forEach(h => {
        const ord = h.etapa?.orden;
        if (ord) {
            if (!stageMap[ord] || new Date(h.created_at) >= new Date(stageMap[ord].created_at)) {
                stageMap[ord] = h;
            }
        }
    });

    const maxOrdenRegistrado = op.etapa_actual_orden || 1;
    const siguienteOrdenPendiente = maxOrdenRegistrado < 8 ? maxOrdenRegistrado + 1 : null;

    // Contenedor principal de pasos
    const wrapper = document.createElement('div');
    wrapper.className = "grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-3 relative";

    etapas.forEach(etapa => {
        const ord = etapa.orden;
        const isCompleted = ord < maxOrdenRegistrado || (ord === 8 && maxOrdenRegistrado === 8);
        const isCurrent = ord === maxOrdenRegistrado && !(ord === 8 && op.estado === 'cerrada');
        const isNext = ord === siguienteOrdenPendiente;
        const regInfo = stageMap[ord];

        const card = document.createElement('div');
        card.className = `p-3 rounded-xl border flex flex-col justify-between transition relative ${
            isCurrent ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-300 ring-offset-1 stage-active-pulse' :
            isCompleted ? 'bg-emerald-50/50 border-emerald-300' :
            isNext ? 'bg-white border-dashed border-blue-300 shadow-sm' :
            'bg-slate-50/60 border-slate-200 opacity-60'
        }`;

        card.innerHTML = `
            <div>
                <div class="flex items-center justify-between mb-2">
                    <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCompleted ? 'bg-emerald-600 text-white' :
                        isCurrent ? 'bg-blue-600 text-white' :
                        isNext ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-200 text-slate-500'
                    }">
                        ${isCompleted ? '✓' : ord}
                    </span>
                    <span class="text-[10px] font-semibold uppercase tracking-wider ${
                        isCompleted ? 'text-emerald-700' :
                        isCurrent ? 'text-blue-700 font-bold' :
                        isNext ? 'text-blue-600' : 'text-slate-400'
                    }">
                        ${isCompleted ? 'Completada' : isCurrent ? 'Actual' : isNext ? 'Siguiente' : 'Pendiente'}
                    </span>
                </div>
                <h4 class="text-xs font-bold text-slate-800 leading-snug line-clamp-2">${etapa.nombre}</h4>
            </div>

            <div class="mt-3 pt-2 border-t border-slate-200/60 text-[11px]">
                ${regInfo ? `
                    <div class="text-slate-700 font-medium">${regInfo.fecha}</div>
                    <div class="text-[10px] text-slate-500 truncate">${ord === 2 ? 'Vía Orden de Venta (OV)' : `Por: ${regInfo.responsable?.nombre || 'COMEX'}`}</div>
                    ${ord !== 2 ? `
                        <button onclick="openCorrectStageModal(${ord}, '${etapa.nombre}', '${regInfo.fecha}', '${regInfo.id}')" class="mt-2 text-[10px] font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md transition flex items-center gap-1 w-full justify-center">
                            <i data-lucide="edit-3" class="w-3 h-3"></i> Corregir fecha
                        </button>
                    ` : ''}
                ` : isNext && op.estado === 'activa' ? (ord === 2 ? `
                    <button onclick="openAddOvModal()" class="w-full mt-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1">
                        <i data-lucide="plus" class="w-3 h-3"></i> Agregar OV
                    </button>
                ` : `
                    <button onclick="openRegisterStageModal(${ord}, '${etapa.nombre}')" class="w-full mt-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition">
                        Registrar
                    </button>
                `) : `
                    <span class="text-slate-400 italic">En espera</span>
                `}
            </div>
        `;

        wrapper.appendChild(card);
    });

    container.appendChild(wrapper);

    // Botón principal de Registrar Siguiente Etapa en la cabecera del stepper
    const mainActionBtn = document.getElementById('btnRegistrarSiguienteEtapa');
    if (mainActionBtn) {
        if (siguienteOrdenPendiente && op.estado === 'activa') {
            const proxEtapa = etapas.find(e => e.orden === siguienteOrdenPendiente);
            mainActionBtn.classList.remove('hidden');
            if (siguienteOrdenPendiente === 2) {
                mainActionBtn.className = "px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-indigo-500/20 transition flex items-center gap-2";
                mainActionBtn.innerHTML = `
                    <i data-lucide="layers" class="w-4 h-4"></i>
                    Agregar Primera OV (Etapa 2)
                `;
                mainActionBtn.onclick = () => openAddOvModal();
            } else {
                mainActionBtn.className = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-blue-500/20 transition flex items-center gap-2";
                mainActionBtn.innerHTML = `
                    <i data-lucide="play-circle" class="w-4 h-4"></i>
                    Registrar Etapa ${siguienteOrdenPendiente}: ${proxEtapa?.nombre || ''}
                `;
                mainActionBtn.onclick = () => openRegisterStageModal(siguienteOrdenPendiente, proxEtapa?.nombre || '');
            }
        } else {
            mainActionBtn.classList.add('hidden');
        }
    }
}

function renderHistoryTable(historial) {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (historial.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">Sin historial registrado.</td></tr>`;
        return;
    }

    // Ordenar de más reciente a más antiguo
    const sorted = [...historial].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    sorted.forEach((h, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50 text-xs";
        const cfg = ETAPA_COLORS[h.etapa?.orden] || ETAPA_COLORS[1];

        tr.innerHTML = `
            <td class="px-4 py-2.5 font-medium text-slate-600">
                ${new Date(h.created_at).toLocaleString('es-CO')}
            </td>
            <td class="px-4 py-2.5">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${cfg.bg} ${cfg.text}">
                    ${h.etapa?.orden}. ${h.etapa?.nombre}
                </span>
            </td>
            <td class="px-4 py-2.5 font-semibold text-slate-800">
                ${h.fecha}
            </td>
            <td class="px-4 py-2.5 text-slate-700">
                ${h.responsable?.nombre || 'N/A'}
            </td>
            <td class="px-4 py-2.5 text-slate-600 max-w-xs truncate" title="${h.observaciones || ''}">
                ${h.observaciones || '<span class="text-slate-400 italic">Sin observaciones</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderOvSection(pedidos) {
    const container = document.getElementById('ovListContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!pedidos || pedidos.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-400 border border-dashed border-slate-200 rounded-xl space-y-2">
                <i data-lucide="file-question" class="w-7 h-7 mx-auto text-slate-300"></i>
                <p class="text-xs">No hay Órdenes de Venta (OV) registradas.</p>
                <button onclick="openAddOvModal()" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition">
                    + Registrar Primera OV
                </button>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    pedidos.forEach(p => {
        const facturas = p.facturas || [];
        const numOv = p.numero_ov || p.numero_pedido_sap || 'Sin número';
        const card = document.createElement('div');
        card.className = "border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 hover:bg-white transition space-y-2.5 shadow-sm";

        card.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                    <span class="font-mono font-black text-sm text-slate-900 tracking-tight">OV: ${numOv}</span>
                    <span class="text-[11px] text-slate-500 font-medium">Ingreso SAP: <strong class="text-slate-700">${p.fecha_ingreso_sap || '-'}</strong></span>
                </div>
                <button onclick="openAddFacturaModal('${p.id}', '${numOv}')" class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition flex items-center gap-1">
                    <i data-lucide="plus" class="w-3 h-3"></i> Factura
                </button>
            </div>

            ${p.observaciones ? `<p class="text-xs text-slate-600 italic bg-white/70 p-2 rounded-lg border border-slate-100">${p.observaciones}</p>` : ''}

            <!-- Facturas vinculadas a esta OV -->
            <div class="pt-2 border-t border-slate-200/60 space-y-1.5">
                <div class="flex items-center justify-between text-[11px] text-slate-500">
                    <span class="font-semibold flex items-center gap-1">
                        <i data-lucide="file-check-2" class="w-3.5 h-3.5 text-emerald-600"></i> Facturas emitidas (${facturas.length}):
                    </span>
                </div>

                ${facturas.length > 0 ? `
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                        ${facturas.map(f => `
                            <div class="flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-200/80 rounded-lg text-xs shadow-xs">
                                <div>
                                    <span class="font-mono font-bold text-slate-800">${f.numero_factura}</span>
                                    ${f.valor_usd != null ? `<span class="ml-1 text-[11px] font-semibold text-emerald-700">$${parseFloat(f.valor_usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>` : ''}
                                </div>
                                <span class="text-[10px] text-slate-500 font-medium">${f.fecha_factura}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="text-[11px] text-slate-400 italic py-0.5">Sin facturas registradas para esta OV.</div>
                `}
            </div>
        `;

        container.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
}

function renderCotizacionCard(op) {
    const card = document.getElementById('detCotizacionCard');
    if (!card) return;

    const cot = op.cotizacion && op.cotizacion.length > 0 ? op.cotizacion[0] : null;

    if (!op.tiene_fp && cot) {
        card.classList.remove('hidden');
        document.getElementById('detCotMotivo').textContent = cot.motivo.toUpperCase();
        document.getElementById('detCotFechaMac').textContent = cot.fecha_envio_mac;
        document.getElementById('detCotObservaciones').textContent = cot.observaciones || 'Sin observaciones adicionales';
        const linkEl = document.getElementById('detCotLink');
        if (linkEl) {
            linkEl.href = cot.archivo_o_link;
            linkEl.textContent = cot.archivo_o_link;
        }
    } else {
        card.classList.add('hidden');
    }
}

// ----------------------------------------------------------------------------
// 9. MODALES: REGISTRAR ETAPA & AGREGAR PEDIDO SAP
// ----------------------------------------------------------------------------
let currentModalTargetStage = null;

function openRegisterStageModal(etapaOrden, etapaNombre) {
    // La Etapa 2 no se registra manualmente: se completa de forma automática al registrar la primera OV
    if (etapaOrden === 2) {
        showToast("La Etapa 2 se registra automáticamente al crear la primera Orden de Venta (OV).", "info");
        openAddOvModal();
        return;
    }

    currentModalTargetStage = etapaOrden;
    const etapaObj = AppState.catalogs.etapas.find(e => e.orden === etapaOrden);
    
    document.getElementById('modalStageTitle').textContent = `Registrar Etapa ${etapaOrden}: ${etapaNombre}`;
    document.getElementById('modalStageOrden').value = etapaOrden;
    document.getElementById('modalStageId').value = etapaObj ? etapaObj.id : '';
    document.getElementById('modalStageDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalStageNotes').value = '';

    // Etapas 2 (Pedido ingresado en SAP) y 3 (Pedido entregado a CEDI) no requieren responsable
    const etapassinResponsable = [2, 3];
    const responsableRow = document.getElementById('modalStageResponsableRow');
    if (etapassinResponsable.includes(etapaOrden)) {
        if (responsableRow) responsableRow.classList.add('hidden');
    } else {
        if (responsableRow) responsableRow.classList.remove('hidden');
        // Asignar responsable default solo cuando el campo está visible
        populateSelect('modalStageResponsible', AppState.catalogs.responsables, 'id', 'nombre', '-- Seleccionar responsable --');
        const defaultRespId = getResponsibleIdByName(AppState.currentUser);
        if (defaultRespId) document.getElementById('modalStageResponsible').value = defaultRespId;
    }

    document.getElementById('modalRegisterStage').classList.remove('hidden');
}

function closeRegisterStageModal() {
    document.getElementById('modalRegisterStage').classList.add('hidden');
}

async function handleConfirmRegisterStage(e) {
    e.preventDefault();
    if (!AppState.selectedOperationId || !currentModalTargetStage) return;

    showLoading(true);
    try {
        const etapaId = document.getElementById('modalStageId').value;
        const fecha = document.getElementById('modalStageDate').value;
        const observaciones = document.getElementById('modalStageNotes').value.trim();

        // Etapas 2 y 3 no requieren responsable_id
        const etapasSinResponsable = [2, 3];
        const requiereResponsable = !etapasSinResponsable.includes(currentModalTargetStage);
        const responsableId = requiereResponsable
            ? document.getElementById('modalStageResponsible').value
            : null;

        if (requiereResponsable && !responsableId) {
            showToast("Elige el responsable de esta etapa.", "warning");
            showLoading(false);
            return;
        }
        if (!etapaId || !fecha) {
            showToast("Por favor completa los campos requeridos.", "warning");
            showLoading(false);
            return;
        }

        if (requiereResponsable && !responsableId) {
            showToast("Por favor selecciona el responsable del registro.", "warning");
            showLoading(false);
            return;
        }

        // Construir payload: omitir responsable_id si es null (etapas 2 y 3)
        const payload = {
            operacion_id: AppState.selectedOperationId,
            etapa_id: etapaId,
            fecha: fecha,
            observaciones: observaciones || null
        };
        if (responsableId) payload.responsable_id = responsableId;

        // Insertar en historial_etapas (Append-Only)
        const { error } = await supabaseClient
            .from('historial_etapas')
            .insert(payload);

        if (error) throw error;

        showToast("¡Etapa registrada exitosamente!", "success");
        closeRegisterStageModal();

        // Recargar operación y lista
        await loadOperationDetail(AppState.selectedOperationId);
        await loadOperations();

    } catch (err) {
        console.error("Error al registrar etapa:", err);
        showToast(err.message || "Error al registrar etapa", "error");
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// 9.1 GESTIÓN DE ÓRDENES DE VENTA (OV)
// ============================================================================
function openAddOvModal() {
    const numInput = document.getElementById('modalOvNumber');
    const dateInput = document.getElementById('modalOvDate');
    const notesInput = document.getElementById('modalOvNotes');
    if (numInput) numInput.value = '';
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    if (notesInput) notesInput.value = '';
    const modal = document.getElementById('modalAddOv');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

function closeAddOvModal() {
    const modal = document.getElementById('modalAddOv');
    if (modal) modal.classList.add('hidden');
}

// Compatibilidad por si se llama la función anterior
function openAddSapOrderModal() {
    openAddOvModal();
}
function closeAddSapOrderModal() {
    closeAddOvModal();
}

async function handleConfirmAddOv(e) {
    e.preventDefault();
    if (!AppState.selectedOperationId) return;

    showLoading(true);
    try {
        const numero = document.getElementById('modalOvNumber')?.value.trim();
        const fecha = document.getElementById('modalOvDate')?.value;
        const observaciones = document.getElementById('modalOvNotes')?.value.trim();

        if (!numero || !fecha) {
            showToast("Número de OV y fecha de ingreso son obligatorios.", "warning");
            showLoading(false);
            return;
        }

        const { error } = await supabaseClient
            .from('pedidos_sap')
            .insert({
                operacion_id: AppState.selectedOperationId,
                numero_ov: numero,
                fecha_ingreso_sap: fecha,
                observaciones: observaciones || null
            });

        if (error) throw error;

        showToast("¡Orden de Venta (OV) guardada con éxito!", "success");
        closeAddOvModal();

        // Recargar operación y lista (el trigger de Supabase actualizará la Etapa 2 si es la primera OV)
        await loadOperationDetail(AppState.selectedOperationId);
        await loadOperations();

    } catch (err) {
        console.error("Error al registrar OV:", err);
        showToast(err.message || "Error al registrar OV", "error");
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// 9.2 GESTIÓN DE FACTURAS POR OV
// ============================================================================
function openAddFacturaModal(pedidoSapId, numeroOv) {
    const ovIdInput = document.getElementById('modalFacturaPedidoSapId');
    const badge = document.getElementById('modalFacturaOvBadge');
    const numInput = document.getElementById('modalFacturaNumero');
    const dateInput = document.getElementById('modalFacturaFecha');

    if (ovIdInput) ovIdInput.value = pedidoSapId;
    if (badge) badge.textContent = `OV: ${numeroOv}`;
    if (numInput) numInput.value = '';
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    const valorInput = document.getElementById('modalFacturaValorUsd');
    if (valorInput) valorInput.value = '';

    const modal = document.getElementById('modalAddFactura');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

function closeAddFacturaModal() {
    const modal = document.getElementById('modalAddFactura');
    if (modal) modal.classList.add('hidden');
}

async function handleConfirmAddFactura(e) {
    e.preventDefault();
    showLoading(true);
    try {
        const pedidoSapId = document.getElementById('modalFacturaPedidoSapId')?.value;
        const numeroFactura = document.getElementById('modalFacturaNumero')?.value.trim();
        const fechaFactura = document.getElementById('modalFacturaFecha')?.value;
        const valorUsdRaw = document.getElementById('modalFacturaValorUsd')?.value;
        const valor_usd = valorUsdRaw !== '' && valorUsdRaw != null && !isNaN(parseFloat(valorUsdRaw)) ? parseFloat(valorUsdRaw) : null;

        if (!pedidoSapId || !numeroFactura || !fechaFactura) {
            showToast("Número de factura y fecha son obligatorios.", "warning");
            showLoading(false);
            return;
        }

        const factPayload = {
            pedido_sap_id: pedidoSapId,
            numero_factura: numeroFactura,
            fecha_factura: fechaFactura
        };
        if (valor_usd !== null) {
            factPayload.valor_usd = valor_usd;
        }

        const { error } = await supabaseClient
            .from('facturas')
            .insert(factPayload);

        if (error) throw error;

        showToast("¡Factura agregada a la OV exitosamente!", "success");
        closeAddFacturaModal();

        if (AppState.selectedOperationId) {
            await loadOperationDetail(AppState.selectedOperationId);
        }
        await loadOperations();

    } catch (err) {
        console.error("Error al registrar factura:", err);
        showToast(err.message || "Error al registrar factura", "error");
    } finally {
        showLoading(false);
    }
}

async function handleStatusChange(newStatus) {
    if (!AppState.selectedOperationId) return;
    showLoading(true);
    try {
        const { error } = await supabaseClient
            .from('operaciones')
            .update({ estado: newStatus, updated_at: new Date().toISOString() })
            .eq('id', AppState.selectedOperationId);

        if (error) throw error;
        showToast(`Estado cambiado a ${newStatus.toUpperCase()}`, "success");
        await loadOperationDetail(AppState.selectedOperationId);
        await loadOperations();
    } catch (e) {
        console.error("Error al actualizar estado:", e);
        showToast("Error al cambiar estado.", "error");
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// 9.3 CORRECCIÓN DE FECHA DE ETAPA — actualiza la fila existente directamente
// ============================================================================
let currentCorrectTargetStage = null;
let currentCorrectHistorialId = null; // ID de la fila del historial a actualizar

function openCorrectStageModal(etapaOrden, etapaNombre, fechaActual, historialId) {
    currentCorrectTargetStage = etapaOrden;
    currentCorrectHistorialId = historialId || null;
    const etapaObj = AppState.catalogs.etapas.find(e => e.orden === etapaOrden);

    const titleEl = document.getElementById('modalCorrectTitle');
    if (titleEl) titleEl.textContent = `Corregir Fecha - Etapa ${etapaOrden}: ${etapaNombre}`;

    document.getElementById('modalCorrectStageId').value = etapaObj ? etapaObj.id : '';
    document.getElementById('modalCorrectStageOrden').value = etapaOrden;
    document.getElementById('modalCorrectDate').value = fechaActual || new Date().toISOString().split('T')[0];
    document.getElementById('modalCorrectReason').value = '';

    // Manejar responsable: etapas 2 y 3 no requieren responsable
    const etapasSinResp = [2, 3];
    const respRow = document.getElementById('modalCorrectResponsableRow');
    if (etapasSinResp.includes(etapaOrden)) {
        if (respRow) respRow.classList.add('hidden');
    } else {
        if (respRow) respRow.classList.remove('hidden');
        populateSelect('modalCorrectResponsible', AppState.catalogs.responsables, 'id', 'nombre', '-- Seleccionar responsable --');
        const defaultRespId = getResponsibleIdByName(AppState.currentUser);
        if (defaultRespId) document.getElementById('modalCorrectResponsible').value = defaultRespId;
    }

    const modal = document.getElementById('modalCorrectStage');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

function closeCorrectStageModal() {
    const modal = document.getElementById('modalCorrectStage');
    if (modal) modal.classList.add('hidden');
}

async function handleConfirmCorrectStage(e) {
    e.preventDefault();
    if (!AppState.selectedOperationId || !currentCorrectTargetStage) return;

    showLoading(true);
    try {
        const nuevaFecha = document.getElementById('modalCorrectDate').value;
        const motivo = document.getElementById('modalCorrectReason').value.trim();

        const etapasSinResp = [2, 3];
        const requiereResp = !etapasSinResp.includes(currentCorrectTargetStage);
        const responsableId = requiereResp ? document.getElementById('modalCorrectResponsible')?.value : null;

        if (!nuevaFecha || !motivo) {
            showToast("Por favor completa la nueva fecha y el motivo de corrección.", "warning");
            showLoading(false);
            return;
        }

        if (currentCorrectHistorialId) {
            // ACTUALIZAR la fila existente directamente (queda 1 sola fecha por etapa)
            // El motivo queda registrado en las observaciones para trazabilidad
            const updatePayload = {
                fecha: nuevaFecha,
                observaciones: `[CORRECCIÓN ${new Date().toLocaleDateString('es-CO')}]: ${motivo}`
            };
            if (responsableId) updatePayload.responsable_id = responsableId;

            const { error } = await supabaseClient
                .from('historial_etapas')
                .update(updatePayload)
                .eq('id', currentCorrectHistorialId);

            if (error) throw error;
        } else {
            // Fallback: si no se tiene el id de la fila, insertar nueva fila
            const etapaId = document.getElementById('modalCorrectStageId').value;
            const payload = {
                operacion_id: AppState.selectedOperationId,
                etapa_id: etapaId,
                fecha: nuevaFecha,
                observaciones: `[CORRECCIÓN ${new Date().toLocaleDateString('es-CO')}]: ${motivo}`
            };
            if (responsableId) payload.responsable_id = responsableId;

            const { error } = await supabaseClient
                .from('historial_etapas')
                .insert(payload);

            if (error) throw error;
        }

        showToast("¡Fecha corregida con exito!", "success");
        closeCorrectStageModal();

        // Recargar detalle y lista
        await loadOperationDetail(AppState.selectedOperationId);
        await loadOperations();

    } catch (err) {
        console.error("Error al corregir etapa:", err);
        showToast(err.message || "Error al corregir etapa", "error");
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// 9.4 ELIMINAR OPERACIÓN DEFINITIVAMENTE (CAMBIO 7)
// ============================================================================
function openDeleteOperationModal() {
    if (!AppState.selectedOperation) return;
    const badge = document.getElementById('deleteModalFpBadge');
    if (badge) badge.textContent = AppState.selectedOperation.fp || 'Sin FP';
    const modal = document.getElementById('modalDeleteOperation');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

function closeDeleteOperationModal() {
    const modal = document.getElementById('modalDeleteOperation');
    if (modal) modal.classList.add('hidden');
}

async function handleConfirmDeleteOperation() {
    // Borrar está deshabilitado: los permisos de la base (RLS) no permiten DELETE a los usuarios.
    // Si se intentara, Supabase no borraría nada y no daría error. Para anular una FP, cámbiale el estado.
    closeDeleteOperationModal();
    showToast('Eliminar operaciones está deshabilitado. Para anular una FP, cámbiale el estado.', 'error');
    return;
    // eslint-disable-next-line no-unreachable
    if (!AppState.selectedOperationId) return;
    const opId = AppState.selectedOperationId;
    const fpName = AppState.selectedOperation?.fp || 'desconocida';

    showLoading(true);
    try {
        // Orden estricto solicitado:
        // 1. Facturas (vía las OV de esa operación)
        const { data: ovs, error: ovsErr } = await supabaseClient
            .from('pedidos_sap')
            .select('id')
            .eq('operacion_id', opId);

        if (ovsErr) throw ovsErr;

        if (ovs && ovs.length > 0) {
            const ovIds = ovs.map(o => o.id);
            const { error: fErr } = await supabaseClient
                .from('facturas')
                .delete()
                .in('pedido_sap_id', ovIds);
            if (fErr) throw fErr;
        }

        // 2. pedidos_sap
        const { error: pErr } = await supabaseClient
            .from('pedidos_sap')
            .delete()
            .eq('operacion_id', opId);
        if (pErr) throw pErr;

        // 3. historial_etapas
        const { error: hErr } = await supabaseClient
            .from('historial_etapas')
            .delete()
            .eq('operacion_id', opId);
        if (hErr) throw hErr;

        // 4. cotizaciones_sin_fp (si aplica)
        const { error: cErr } = await supabaseClient
            .from('cotizaciones_sin_fp')
            .delete()
            .eq('operacion_id', opId);
        if (cErr) throw cErr;

        // 5. fila en operaciones
        const { error: opErr } = await supabaseClient
            .from('operaciones')
            .delete()
            .eq('id', opId);
        if (opErr) throw opErr;

        closeDeleteOperationModal();
        showToast(`Operación FP ${fpName} eliminada exitosamente.`, "success");

        // Redirigir a la lista de operaciones
        AppState.selectedOperationId = null;
        AppState.selectedOperation = null;
        showTab('operaciones');
        await loadOperations();

    } catch (err) {
        console.error("Error al eliminar operación:", err);
        showToast(err.message || "Error al eliminar operación", "error");
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// 9.5 EDITAR OPERACIÓN / FP (FIRPLAK)
// ============================================================================
function openEditOperationModal() {
    const op = AppState.selectedOperation;
    if (!op) return;

    // Badges y datos base
    const badge = document.getElementById('editOpFpBadge');
    if (badge) badge.textContent = `(${op.fp})`;

    // Asegurar que los dropdowns estén poblados
    populateSelect('editOpCliente', AppState.catalogs.clientes, 'id', 'nombre', '-- Seleccionar Cliente --');
    populateSelect('editOpResponsable', AppState.catalogs.responsables, 'id', 'nombre');
    populateSelect('editOpNaviera', AppState.catalogs.navieras, 'id', 'nombre', '-- Ninguna / No Aplica --');
    populateSelect('editOpAgente', AppState.catalogs.agentes_carga, 'id', 'nombre', '-- Ninguno / No Aplica --');

    // Llenar formulario con valores actuales
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val !== null && val !== undefined) ? val : ''; };

    setVal('editOpCliente', op.cliente_id);
    setVal('editOpPaisDestino', op.pais_destino);
    setVal('editOpIncoterm', op.incoterm);
    setVal('editOpModalidad', op.modalidad);
    setVal('editOpContenedor', op.contenedor);
    setVal('editOpResponsable', op.responsable_id);
    setVal('editOpNaviera', op.naviera_id);
    setVal('editOpAgente', op.agente_carga_id);

    // Campos operacionales Firplak
    setVal('editOpTipoFp', op.tipo_fp);
    setVal('editOpDecisionMes', op.decision_mes);

    // Ocupación: si en BD está como 0.90, mostrar 90 para facilitar edición
    const ocupVal = op.ocupacion_contenedor != null 
        ? (op.ocupacion_contenedor <= 1.5 ? Math.round(op.ocupacion_contenedor * 10000) / 100 : op.ocupacion_contenedor)
        : '';
    setVal('editOpOcupacion', ocupVal);

    // % Entrega: si en BD está como 1.00, mostrar 100 para facilitar edición
    const entVal = op.porcentaje_entrega != null 
        ? (op.porcentaje_entrega <= 1.5 ? Math.round(op.porcentaje_entrega * 10000) / 100 : op.porcentaje_entrega)
        : '';
    setVal('editOpPorcentajeEntrega', entVal);

    setVal('editOpEstadoPlanta', op.estado_planta);
    setVal('editOpFechaProgDespacho', op.fecha_programada_despacho);
    setVal('editOpDocumentoTransporte', op.documento_transporte);
    setVal('editOpFechaBl', op.fecha_bl);
    setVal('editOpMotonaveViaje', op.motonave_viaje);

    const modal = document.getElementById('modalEditOperation');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

function closeEditOperationModal() {
    const modal = document.getElementById('modalEditOperation');
    if (modal) modal.classList.add('hidden');
}

async function handleConfirmEditOperation(e) {
    e.preventDefault();
    if (!AppState.selectedOperationId) return;

    showLoading(true);
    try {
        const cliente_id = document.getElementById('editOpCliente')?.value;
        const pais_destino = document.getElementById('editOpPaisDestino')?.value.trim();
        const incoterm = document.getElementById('editOpIncoterm')?.value;
        const modalidad = document.getElementById('editOpModalidad')?.value;
        const contenedor = document.getElementById('editOpContenedor')?.value.trim() || null;
        const responsable_id = document.getElementById('editOpResponsable')?.value;
        const naviera_id = document.getElementById('editOpNaviera')?.value || null;
        const agente_carga_id = document.getElementById('editOpAgente')?.value || null;

        if (!cliente_id || !pais_destino || !incoterm || !modalidad || !responsable_id) {
            showToast("Por favor completa los campos obligatorios.", "warning");
            showLoading(false);
            return;
        }

        // Nuevos campos operacionales Firplak (todos opcionales)
        const tipo_fp = document.getElementById('editOpTipoFp')?.value || null;
        const decision_mes = document.getElementById('editOpDecisionMes')?.value || null;
        const ocupacion_contenedor = parsePercentageForDb(document.getElementById('editOpOcupacion')?.value);
        const porcentaje_entrega = parsePercentageForDb(document.getElementById('editOpPorcentajeEntrega')?.value);
        const estado_planta = document.getElementById('editOpEstadoPlanta')?.value.trim() || null;
        const fecha_programada_despacho = document.getElementById('editOpFechaProgDespacho')?.value || null;
        const documento_transporte = document.getElementById('editOpDocumentoTransporte')?.value.trim() || null;
        const fecha_bl = document.getElementById('editOpFechaBl')?.value || null;
        const motonave_viaje = document.getElementById('editOpMotonaveViaje')?.value.trim() || null;

        const updatePayload = {
            cliente_id,
            pais_destino,
            incoterm,
            modalidad,
            contenedor,
            responsable_id,
            naviera_id,
            agente_carga_id,
            tipo_fp,
            decision_mes,
            ocupacion_contenedor,
            porcentaje_entrega,
            estado_planta,
            fecha_programada_despacho,
            documento_transporte,
            fecha_bl,
            motonave_viaje,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabaseClient
            .from('operaciones')
            .update(updatePayload)
            .eq('id', AppState.selectedOperationId);

        if (error) throw error;

        showToast("¡Datos de la operación actualizados con éxito!", "success");
        closeEditOperationModal();

        // Recargar detalle y lista
        await loadOperationDetail(AppState.selectedOperationId);
        await loadOperations();

    } catch (err) {
        console.error("Error al actualizar operación:", err);
        showToast(err.message || "Error al actualizar la operación", "error");
    } finally {
        showLoading(false);
    }
}

// ----------------------------------------------------------------------------
// 10. PANTALLA: DASHBOARD ANALÍTICO COMEX
// ----------------------------------------------------------------------------
async function loadDashboardMetrics() {
    showLoading(true);
    try {
        // Consultar métricas desde las vistas analíticas o calcularlas directamente
        let metricasOps = [];
        const { data: vMetricas, error: metErr } = await supabaseClient
            .from('v_operaciones_metricas')
            .select('*');

        if (!metErr && vMetricas) {
            metricasOps = vMetricas;
        } else {
            console.warn("Vista v_operaciones_metricas no disponible aún, calculando localmente...");
            metricasOps = computeMetricsLocally(AppState.operations);
        }

        // Consultar vista de carga responsables
        let cargaResp = [];
        const { data: vCarga, error: cargaErr } = await supabaseClient
            .from('v_carga_responsables')
            .select('*');

        if (!cargaErr && vCarga) {
            cargaResp = vCarga;
        }

        // Consultar vista de pedidos facturados sin despachar (Cambio 6)
        let facturadosSinDespachar = [];
        const { data: vFact, error: factErr } = await supabaseClient
            .from('v_pedidos_facturados_sin_despachar')
            .select('*')
            .order('dias_facturado_sin_despachar', { ascending: false });

        if (!factErr && vFact) {
            facturadosSinDespachar = vFact;
        }

        renderDashboardLeadTimes(metricasOps);
        renderNavierasAndAgentesMetrics(metricasOps);
        renderWorkloadSection(cargaResp, metricasOps);
        renderStagnantOperationsSection(metricasOps);
        renderInvoicedUnshippedSection(facturadosSinDespachar);

    } catch (e) {
        console.error("Error al cargar métricas del dashboard:", e);
    } finally {
        showLoading(false);
    }
}

function computeMetricsLocally(operations) {
    // Cálculo seguro de respaldo en caso de que las vistas SQL no se hayan corrido
    return operations.map(op => {
        return {
            operacion_id: op.id,
            fp: op.fp,
            pais_destino: op.pais_destino,
            incoterm: op.incoterm,
            modalidad: op.modalidad,
            estado: op.estado,
            naviera_nombre: op.naviera?.nombre,
            agente_carga_nombre: op.agente?.nombre,
            responsable_nombre: op.responsable?.nombre,
            etapa_actual_orden: op.etapa_actual_orden,
            fecha_ultima_etapa: op.fecha_ultima_etapa,
            dias_sin_movimiento: Math.max(0, Math.floor((new Date() - new Date(op.fecha_ultima_etapa || op.created_at)) / (86400000)))
        };
    });
}

function renderDashboardLeadTimes(metricas) {
    // Filtros de país e incoterm del dashboard
    const country = document.getElementById('dashFilterCountry')?.value || '';
    const incoterm = document.getElementById('dashFilterIncoterm')?.value || '';

    // Poblar opciones de filtros si están vacías
    populateDashboardFilterOptions(metricas);

    const filtered = metricas.filter(m => {
        if (country && m.pais_destino !== country) return false;
        if (incoterm && m.incoterm !== incoterm) return false;
        return true;
    });

    // 4 Tramos solicitados
    const tramos = [
        { key: 'lt_modulacion_a_bodega', idAvg: 'ltModAvg', idMed: 'ltModMed', idP90: 'ltModP90', idCount: 'ltModCount' },
        { key: 'lt_despacho_a_bodega', idAvg: 'ltDespAvg', idMed: 'ltDespMed', idP90: 'ltDespP90', idCount: 'ltDespCount' },
        { key: 'lt_embarque_a_llegada_puerto', idAvg: 'ltEmbAvg', idMed: 'ltEmbMed', idP90: 'ltEmbP90', idCount: 'ltEmbCount' },
        { key: 'lt_llegada_puerto_a_bodega', idAvg: 'ltPtoAvg', idMed: 'ltPtoMed', idP90: 'ltPtoP90', idCount: 'ltPtoCount' }
    ];

    tramos.forEach(t => {
        const values = filtered
            .map(m => m[t.key])
            .filter(v => v !== null && v !== undefined && !isNaN(v) && v >= 0)
            .sort((a, b) => a - b);

        const stats = calculateStats(values);
        setElementText(t.idAvg, stats.avg !== null ? `${stats.avg} d` : '-');
        setElementText(t.idMed, stats.median !== null ? `${stats.median} d` : '-');
        setElementText(t.idP90, stats.p90 !== null ? `${stats.p90} d` : '-');
        setElementText(t.idCount, `${values.length} ops`);
    });
}

function calculateStats(arr) {
    if (!arr || arr.length === 0) return { avg: null, median: null, p90: null };
    
    // Promedio
    const sum = arr.reduce((acc, v) => acc + v, 0);
    const avg = Math.round((sum / arr.length) * 10) / 10;

    // Mediana (Percentil 50)
    const mid = Math.floor(arr.length / 2);
    const median = arr.length % 2 !== 0 ? arr[mid] : Math.round(((arr[mid - 1] + arr[mid]) / 2) * 10) / 10;

    // P90 (Percentil 90)
    const p90Idx = Math.floor(arr.length * 0.9);
    const p90 = arr[Math.min(p90Idx, arr.length - 1)];

    return { avg, median, p90 };
}

function populateDashboardFilterOptions(metricas) {
    const countryEl = document.getElementById('dashFilterCountry');
    const incotermEl = document.getElementById('dashFilterIncoterm');

    if (countryEl && countryEl.options.length <= 1) {
        const countries = [...new Set(metricas.map(m => m.pais_destino).filter(Boolean))].sort();
        countries.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            countryEl.appendChild(opt);
        });
    }

    if (incotermEl && incotermEl.options.length <= 1) {
        const incos = [...new Set(metricas.map(m => m.incoterm).filter(Boolean))].sort();
        incos.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = i;
            incotermEl.appendChild(opt);
        });
    }
}

function renderNavierasAndAgentesMetrics(metricas) {
    // 1. Tiempos de tránsito por naviera (lt_embarque_a_llegada_puerto)
    const navieraMap = {};
    metricas.forEach(m => {
        if (m.naviera_nombre && m.lt_embarque_a_llegada_puerto != null) {
            if (!navieraMap[m.naviera_nombre]) navieraMap[m.naviera_nombre] = [];
            navieraMap[m.naviera_nombre].push(m.lt_embarque_a_llegada_puerto);
        }
    });

    const navLabels = Object.keys(navieraMap);
    const navAvgData = navLabels.map(l => calculateStats(navieraMap[l]).avg || 0);

    renderChart('chartNavieras', 'bar', {
        labels: navLabels.length > 0 ? navLabels : ['Sin datos'],
        datasets: [{
            label: 'Tránsito Marítimo Promedio (días)',
            data: navAvgData.length > 0 ? navAvgData : [0],
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: 'rgb(59, 130, 246)',
            borderWidth: 1,
            borderRadius: 6
        }]
    }, { indexAxis: 'y' });

    // 2. Gestión portuaria por agente de carga (lt_gestion_portuaria)
    const agenteMap = {};
    metricas.forEach(m => {
        if (m.agente_carga_nombre && m.lt_gestion_portuaria != null) {
            if (!agenteMap[m.agente_carga_nombre]) agenteMap[m.agente_carga_nombre] = [];
            agenteMap[m.agente_carga_nombre].push(m.lt_gestion_portuaria);
        }
    });

    const agLabels = Object.keys(agenteMap);
    const agAvgData = agLabels.map(l => calculateStats(agenteMap[l]).avg || 0);

    renderChart('chartAgentes', 'bar', {
        labels: agLabels.length > 0 ? agLabels : ['Sin datos'],
        datasets: [{
            label: 'Gestión Portuaria Promedio (días)',
            data: agAvgData.length > 0 ? agAvgData : [0],
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderColor: 'rgb(16, 185, 129)',
            borderWidth: 1,
            borderRadius: 6
        }]
    }, { indexAxis: 'y' });
}

function renderWorkloadSection(cargaResp, metricas) {
    const container = document.getElementById('responsiblesCardsContainer');
    if (!container) return;
    container.innerHTML = '';

    // Si la vista v_carga_responsables arrojó datos
    if (cargaResp && cargaResp.length > 0) {
        cargaResp.forEach(r => {
            const card = document.createElement('div');
            card.className = "p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between";
            card.innerHTML = `
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="font-bold text-slate-800 text-base">${r.responsable_nombre}</h4>
                        <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${r.operaciones_activas > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}">
                            ${r.operaciones_activas} activas
                        </span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-xs text-slate-600 mt-3 pt-3 border-t border-slate-100">
                        <div>
                            <span class="text-slate-400 block">Total histórico:</span>
                            <span class="font-semibold text-slate-700">${r.operaciones_totales} ops</span>
                        </div>
                        <div>
                            <span class="text-slate-400 block">Cerradas:</span>
                            <span class="font-semibold text-emerald-600">${r.operaciones_cerradas} ops</span>
                        </div>
                    </div>
                </div>
                <div class="mt-4 pt-3 border-t border-slate-100">
                    <span class="text-xs text-slate-500 block">Promedio entre etapas:</span>
                    <span class="text-lg font-extrabold text-blue-600">${r.promedio_dias_entre_etapas} días</span>
                </div>
            `;
            container.appendChild(card);
        });
    }

    // Gráfico de operaciones por etapa y responsable
    const responsables = AppState.catalogs.responsables;
    const etapas = AppState.catalogs.etapas;

    const datasets = responsables.map((resp, idx) => {
        const colors = [
            'rgba(59, 130, 246, 0.85)',
            'rgba(16, 185, 129, 0.85)',
            'rgba(245, 158, 11, 0.85)',
            'rgba(139, 92, 246, 0.85)'
        ];
        const dataPerStage = etapas.map(et => {
            return metricas.filter(m => m.responsable_nombre === resp.nombre && m.etapa_actual_orden === et.orden && m.estado === 'activa').length;
        });

        return {
            label: resp.nombre,
            data: dataPerStage,
            backgroundColor: colors[idx % colors.length]
        };
    });

    renderChart('chartStagesByResp', 'bar', {
        labels: etapas.map(e => `${e.orden}. ${e.nombre.split(' ')[0]}`),
        datasets: datasets
    }, {
        scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } }
        }
    });
}

function renderStagnantOperationsSection(metricas) {
    const slider = document.getElementById('dashStagnantSlider');
    const display = document.getElementById('dashStagnantDaysDisplay');
    const tbody = document.getElementById('stagnantOpsTableBody');
    if (!tbody) return;

    const threshold = parseInt(slider?.value || AppState.dashboard.stagnantDays);
    AppState.dashboard.stagnantDays = threshold;
    if (display) display.textContent = `${threshold} días`;

    const stagnant = metricas.filter(m => m.estado === 'activa' && m.dias_sin_movimiento >= threshold)
        .sort((a, b) => b.dias_sin_movimiento - a.dias_sin_movimiento);

    tbody.innerHTML = '';
    const alertCount = document.getElementById('dashStagnantCount');
    if (alertCount) alertCount.textContent = stagnant.length;

    if (stagnant.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-emerald-600 font-medium">✓ No hay operaciones activas estancadas con más de ${threshold} días sin movimiento.</td></tr>`;
        return;
    }

    stagnant.forEach(op => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50 text-xs";
        tr.innerHTML = `
            <td class="px-4 py-3 font-bold text-slate-800">${op.fp}</td>
            <td class="px-4 py-3 text-slate-700">${op.pais_destino}</td>
            <td class="px-4 py-3">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    ${op.etapa_actual_orden}. ${op.etapa_actual_nombre}
                </span>
            </td>
            <td class="px-4 py-3 font-semibold text-slate-800">${op.responsable_nombre || 'N/A'}</td>
            <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-extrabold bg-rose-100 text-rose-700">
                    ${op.dias_sin_movimiento} días sin avance
                </span>
            </td>
            <td class="px-4 py-3 text-right">
                <button onclick="viewOperationDetail('${op.operacion_id}')" class="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded transition">
                    Gestionar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ============================================================================
// 10.1 REPORTE DE PEDIDOS FACTURADOS SIN DESPACHAR (CAMBIO 6)
// ============================================================================
function renderInvoicedUnshippedSection(reporte) {
    const tbody = document.getElementById('invoicedUnshippedTableBody');
    const badge = document.getElementById('badgeInvoicedUnshippedCount');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (badge) {
        badge.textContent = `${reporte.length} pendientes`;
        badge.className = reporte.length > 0 
            ? "text-xs font-bold px-3 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-full"
            : "text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-500 rounded-full";
    }

    if (!reporte || reporte.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-6 text-slate-400">
                    <i data-lucide="check-circle" class="w-5 h-5 mx-auto text-emerald-500 mb-1"></i>
                    No hay pedidos facturados pendientes de despacho a puerto.
                </td>
            </tr>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    reporte.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50 text-xs transition cursor-pointer";

        const dias = parseInt(r.dias_facturado_sin_despachar) || 0;
        let badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
        if (dias > 15) {
            badgeColor = "bg-rose-100 text-rose-800 border-rose-300 font-extrabold animate-pulse";
        } else if (dias > 7) {
            badgeColor = "bg-amber-100 text-amber-800 border-amber-300 font-bold";
        }

        tr.innerHTML = `
            <td class="px-4 py-2.5 font-mono font-bold text-blue-600 hover:underline">${r.fp}</td>
            <td class="px-4 py-2.5 font-medium text-slate-800">${r.cliente}</td>
            <td class="px-4 py-2.5 font-mono font-semibold text-slate-700">OV: ${r.numero_ov}</td>
            <td class="px-4 py-2.5 text-slate-500">${r.fecha_ingreso_sap || '-'}</td>
            <td class="px-4 py-2.5 text-slate-700 font-medium">${r.fecha_primera_factura || '-'}</td>
            <td class="px-4 py-2.5 text-center">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ${r.cantidad_facturas} fact.
                </span>
            </td>
            <td class="px-4 py-2.5 text-right">
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border ${badgeColor}">
                    ${dias} días
                </span>
            </td>
        `;

        tr.onclick = () => {
            const op = AppState.operations.find(o => o.fp === r.fp);
            if (op) {
                viewOperationDetail(op.id);
            }
        };

        tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

function renderChart(canvasId, type, data, extraOptions = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (AppState.dashboard.charts[canvasId]) {
        AppState.dashboard.charts[canvasId].destroy();
    }

    AppState.dashboard.charts[canvasId] = new Chart(ctx, {
        type: type,
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { boxWidth: 12, font: { family: 'Plus Jakarta Sans', size: 11 } }
                }
            },
            ...extraOptions
        }
    });
}

// ----------------------------------------------------------------------------
// 11. UTILIDADES Y NOTIFICACIONES
// ----------------------------------------------------------------------------
function showToast(message, type = 'info') {
    const toast = document.getElementById('globalToast');
    if (!toast) return;

    const colors = {
        success: 'bg-emerald-600 text-white',
        error: 'bg-rose-600 text-white',
        warning: 'bg-amber-600 text-white',
        info: 'bg-slate-900 text-white'
    };

    toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl font-medium text-sm transition-all transform duration-300 flex items-center gap-2 ${colors[type] || colors.info}`;
    toast.textContent = message;
    toast.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
    }, 4000);
}

function showLoading(show) {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        if (show) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }
}

function showSchemaMissingBanner(show) {
    const banner = document.getElementById('schemaMissingBanner');
    if (banner) {
        if (show) banner.classList.remove('hidden');
        else banner.classList.add('hidden');
    }
}

function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

window.showTab = function(tab) {
    if (tab === 'operaciones') tab = 'operations';
    switchTab(tab);
};
