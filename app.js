// ============================================================
// UltraCarga — lógica de la app
// ============================================================
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let session = null;
let profile = null;
let calendarMonthOffset = 0;
let activeSesionId = null;   // sesión que se está registrando ahora mismo (autoguardado)
let activeSesionFecha = null; // fecha elegida para la sesión activa (permite carga retroactiva)
let activeSesionExs = [];    // sets ya guardados de la sesión activa, agrupados por ejercicio
let activeRutinaDias = [];   // días (con sus ejercicios) de la rutina activa del alumno logueado
let activeSesionDia = null;  // día del programa que el alumno eligió entrenar en la sesión activa
let activeStatsPorEjercicio = {}; // nombre ejercicio (minúsculas) -> {max, last} — para sugerir peso y detectar PR al instante
let activeEjerciciosSugeridos = []; // ejercicios del día elegido, para poder re-renderizar los botones de sugerencia
let rutinaEditorDias = [];   // bloques de día del editor de rutina (coach)
let rutinaEditorId = null;   // si se está editando una rutina existente en vez de crear una nueva
let progresoChart = null;
let cacheSeriesHistorial = {}; // set.id -> {reps, peso, nota, i, _isPR} — para poder editar una serie ya guardada desde el historial

const root = () => document.getElementById('app-root');

// ---------- ICONOGRAFÍA (SVG inline, heredan el color del texto) ----------
const ICONS = {
  chevron: `<svg class="icon icon-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  chevronRight: `<svg class="icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
  clipboard: `<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><line x1="8" y1="11" x2="16" y2="11"></line><line x1="8" y1="15" x2="13" y2="15"></line></svg>`,
  calendar: `<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
  trending: `<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`,
  book: `<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5h6a3.5 3.5 0 0 1 3.5 3.5v13a2.5 2.5 0 0 0-2.5-2.5H2z"></path><path d="M22 4.5h-6a3.5 3.5 0 0 0-3.5 3.5v13a2.5 2.5 0 0 1 2.5-2.5H22z"></path></svg>`,
  logout: `<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`,
  download: `<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  plus: `<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  check: `<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  arrowLeft: `<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`,
  activity: `<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`,
  camera: `<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`,
  users: `<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
  link: `<svg class="icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
  message: `<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`,
  share: `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>`,
  search: `<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
  mic: `<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
  edit: `<svg class="icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`
};
// Markup del lado derecho de un botón-toggle: texto según estado + flecha que rota.
function toggleStateHtml(closedTxt){
  closedTxt = closedTxt || 'Ver';
  return `<span class="toggle-state"><span class="txt-closed">${closedTxt}</span><span class="txt-open">Ocultar</span>${ICONS.chevron}</span>`;
}
// Abre/cierra una sección colapsable: pone .open en el botón, saca/pone .hidden en el contenedor,
// y dispara una pequeña animación de aparición.
function setToggleOpen(btnId, holderId, abrir){
  const btn = document.getElementById(btnId);
  const holder = document.getElementById(holderId);
  if(!btn || !holder) return;
  btn.classList.toggle('open', abrir);
  holder.classList.toggle('hidden', !abrir);
  if(abrir){
    holder.classList.remove('reveal-in');
    void holder.offsetWidth;
    holder.classList.add('reveal-in');
  }
}
// Conecta un botón-toggle con su contenedor. onOpen (opcional) corre solo al abrir
// (útil para inicializar el gráfico de progreso recién cuando se ve por primera vez).
function wireToggle(btnId, holderId, onOpen){
  const btn = document.getElementById(btnId);
  const holder = document.getElementById(holderId);
  if(!btn || !holder) return;
  btn.onclick = () => {
    const abrir = holder.classList.contains('hidden');
    setToggleOpen(btnId, holderId, abrir);
    if(abrir && onOpen) onOpen();
  };
}
function hideSplash(){
  const el = document.getElementById('splash');
  if(!el) return;
  el.classList.add('hide');
  setTimeout(() => el.remove(), 400);
}

// ---------- HELPERS ----------
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2400);
}
function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}
function todayStr(){ return new Date().toISOString().slice(0,10); }
function formatDate(iso){
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ---------- TIPO DE SERIE / LADO (drop set, rest-pause, forzada al fallo, unilateral/bilateral) ----------
// Campos opcionales y aditivos: no reemplazan nada de lo que ya existía (reps/peso/nota).
const TIPO_SERIE_LABELS = { drop_set: 'Drop set', rest_pause: 'Rest-pause', forzada: 'Forzada al fallo' };
const LADO_LABELS = { unilateral: 'Unilateral', bilateral: 'Bilateral', peso_por_lado: 'Peso por lado' };
function selectTipoSerieHtml(id, valorActual, onchangeExpr){
  const v = valorActual || '';
  const onchange = onchangeExpr ? ` onchange="${onchangeExpr.replace(/"/g,'&quot;')}"` : '';
  return `<select id="${id}"${onchange}>
    <option value=""${v===''?' selected':''}>Tipo de serie (opcional)</option>
    <option value="drop_set"${v==='drop_set'?' selected':''}>Drop set</option>
    <option value="rest_pause"${v==='rest_pause'?' selected':''}>Rest-pause</option>
    <option value="forzada"${v==='forzada'?' selected':''}>Forzada al fallo</option>
  </select>`;
}
function selectLadoHtml(id, valorActual, onchangeExpr){
  const v = valorActual || '';
  const onchange = onchangeExpr ? ` onchange="${onchangeExpr.replace(/"/g,'&quot;')}"` : '';
  return `<select id="${id}"${onchange}>
    <option value=""${v===''?' selected':''}>Lado (opcional)</option>
    <option value="unilateral"${v==='unilateral'?' selected':''}>Unilateral</option>
    <option value="bilateral"${v==='bilateral'?' selected':''}>Bilateral</option>
    <option value="peso_por_lado"${v==='peso_por_lado'?' selected':''}>Peso por lado</option>
  </select>`;
}
function renderTipoLadoPills(tipoSerie, lado){
  const tipoPill = tipoSerie && TIPO_SERIE_LABELS[tipoSerie] ? `<span class="pill" style="padding:2px 8px; font-size:10.5px;">${TIPO_SERIE_LABELS[tipoSerie]}</span>` : '';
  const ladoPill = lado && LADO_LABELS[lado] ? `<span class="pill" style="padding:2px 8px; font-size:10.5px;">${LADO_LABELS[lado]}</span>` : '';
  return `${tipoPill}${ladoPill}`;
}
function formatDateShort(iso){
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { day:'numeric', month:'short' });
}
function mondayOf(iso){
  const d = new Date(iso + 'T12:00:00');
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0,10);
}
function addDaysStr(iso, days){
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}
// Vigencia (solo vista profe/super admin): true si la fecha ya pasó su plazo de días.
function estaVencida(fechaIso, diasVigencia){
  if(!fechaIso) return false;
  return fechaIso < addDaysStr(todayStr(), -diasVigencia);
}
// Línea de estado "Rutina: 12 ago (vencida)" — en rojo si venció. Uso exclusivo de vistas de coach/super admin.
function renderEstadoVencimiento(label, fechaIso, diasVigencia, sinRegistroTexto){
  if(!fechaIso) return `<span>${escapeHtml(label)}: ${escapeHtml(sinRegistroTexto)}</span>`;
  const vencida = estaVencida(fechaIso, diasVigencia);
  const texto = `${escapeHtml(label)}: ${formatDateShort(fechaIso)}${vencida ? ' (vencida)' : ''}`;
  return vencida ? `<span style="color:var(--red); font-weight:600;">${texto}</span>` : `<span>${texto}</span>`;
}

function computeStreak(fechas){
  if(!fechas.length) return 0;
  const weekSet = new Set(fechas.map(mondayOf));
  let streak = 0;
  let cursor = mondayOf(todayStr());
  while(weekSet.has(cursor)){
    streak++;
    cursor = addDaysStr(cursor, -7);
  }
  return streak;
}

// Marca cuáles series son PR (récord personal), procesando en orden cronológico.
function markPRs(sesiones){
  const ordenadas = [...sesiones].sort((a,b)=> new Date(a.fecha) - new Date(b.fecha) || new Date(a.created_at) - new Date(b.created_at));
  const maxPorEjercicio = {};
  ordenadas.forEach(s => {
    const series = (s.sesion_series || []).slice().sort((a,b)=> (a.orden||0)-(b.orden||0));
    series.forEach(set => {
      const key = set.ejercicio_nombre.trim().toLowerCase();
      const peso = Number(set.peso) || 0;
      const max = maxPorEjercicio[key] || 0;
      set._isPR = peso > max && peso > 0;
      if(peso > max) maxPorEjercicio[key] = peso;
    });
  });
  return sesiones;
}

// Calcula, por ejercicio, el peso máximo histórico (para detectar un récord
// personal al instante) y el último peso registrado (para sugerir un peso
// al agregar ese ejercicio de nuevo) — mismo criterio cronológico que markPRs.
function computeStatsPorEjercicio(sesiones){
  const ordenadas = [...sesiones].sort((a,b)=> new Date(a.fecha) - new Date(b.fecha) || new Date(a.created_at) - new Date(b.created_at));
  const stats = {};
  ordenadas.forEach(s => {
    const series = (s.sesion_series || []).slice().sort((a,b)=> (a.orden||0)-(b.orden||0));
    series.forEach(set => {
      const key = set.ejercicio_nombre.trim().toLowerCase();
      const peso = Number(set.peso) || 0;
      if(peso <= 0) return;
      if(!stats[key]) stats[key] = { max: 0, last: 0 };
      if(peso > stats[key].max) stats[key].max = peso;
      stats[key].last = peso;
    });
  });
  return stats;
}

function groupSets(series){
  const groups = [];
  (series || []).slice().sort((a,b)=>(a.orden||0)-(b.orden||0)).forEach(set => {
    let g = groups.find(g => g.nombre.toLowerCase() === set.ejercicio_nombre.toLowerCase());
    if(!g){ g = { nombre: set.ejercicio_nombre, sets: [] }; groups.push(g); }
    g.sets.push(set);
  });
  return groups;
}

// Agrupa los ejercicios de una rutina por día (Día 1 — Empuje, Día 2 — Tracción, etc.)
function groupPorDia(ejercicios){
  const dias = [];
  (ejercicios || []).slice()
    .sort((a,b) => (a.dia_orden||0)-(b.dia_orden||0) || (a.orden||0)-(b.orden||0))
    .forEach(ex => {
      const nombreDia = ex.dia_nombre || 'Rutina';
      let d = dias.find(d => d.nombre === nombreDia);
      if(!d){ d = { nombre: nombreDia, ejercicios: [] }; dias.push(d); }
      d.ejercicios.push(ex);
    });
  return dias;
}
function renderExMeta(ex){
  const sxr = `${ex.series_objetivo || '-'} × ${escapeHtml(ex.reps_objetivo || '-')}`;
  const peso = ex.peso_objetivo ? `<span class="pill" style="padding:2px 8px; font-size:10.5px;">${escapeHtml(ex.peso_objetivo)}</span>` : '';
  const tipoLado = renderTipoLadoPills(ex.tipo_serie_objetivo, ex.lado_objetivo);
  return `<span style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;"><b>${sxr}</b>${peso}${tipoLado}</span>`;
}
function renderExNota(ex){
  return ex.nota ? `<div class="ex-nota">📝 ${escapeHtml(ex.nota)}</div>` : '';
}

// ---------- ARRANQUE ----------
function esVistaCoach(role){
  return role === 'coach' || role === 'profesor' || role === 'super_admin';
}

async function boot(){
  const { data } = await sb.auth.getSession();
  session = data.session;
  if(!session){ profile = null; renderAuth(); return; }
  await loadProfile();
  if(!profile){ renderAuth(); return; }
  if(esVistaCoach(profile.role)) await renderCoachHome();
  else await renderAlumnoHome();
}

async function loadProfile(){
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if(error || !data){ profile = null; return; }
  profile = data;
}

sb.auth.onAuthStateChange((_event, s) => {
  session = s;
});

// ---------- AUTENTICACIÓN ----------
function renderAuth(mode){
  mode = mode || 'login';
  const isLogin = mode === 'login';
  root().innerHTML = `
    <h1>${isLogin ? '¿Quién eres?' : 'Crear tu cuenta'}</h1>
    <div class="sub">${isLogin ? 'Entra con tu correo y contraseña para ver o registrar tus entrenamientos.' : 'Pídele a tu coach el link de la app y crea tu cuenta con tu correo.'}</div>
    <div class="card">
      ${!isLogin ? `
        <label>Tu nombre</label>
        <input type="text" id="auth-nombre" placeholder="Ej: Marcela Jiménez" autocomplete="name">
      ` : ''}
      <label>Correo</label>
      <input type="email" id="auth-email" placeholder="tucorreo@ejemplo.com" autocomplete="email">
      <label>Contraseña</label>
      <input type="password" id="auth-pass" placeholder="••••••••" autocomplete="${isLogin ? 'current-password' : 'new-password'}">
      <button class="btn" id="auth-submit">${isLogin ? 'Entrar' : 'Crear cuenta'}</button>
      <div id="auth-error" class="error-banner hidden" style="margin-top:12px;"></div>
    </div>
    <div class="auth-switch">
      ${isLogin ? '¿No tienes cuenta todavía? ' : '¿Ya tienes cuenta? '}
      <button id="auth-toggle">${isLogin ? 'Crear una' : 'Entrar'}</button>
    </div>
  `;
  document.getElementById('auth-toggle').onclick = () => renderAuth(isLogin ? 'signup' : 'login');
  document.getElementById('auth-submit').onclick = () => isLogin ? handleLogin() : handleSignup();
}

async function handleLogin(){
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-pass').value;
  const errBox = document.getElementById('auth-error');
  errBox.classList.add('hidden');
  if(!email || !pass){ showToast('Completa correo y contraseña'); return; }
  const btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = 'Entrando...';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Entrar';
  if(error){
    errBox.textContent = 'No se pudo entrar: correo o contraseña incorrectos.';
    errBox.classList.remove('hidden');
    return;
  }
  session = data.session;
  await loadProfile();
  if(esVistaCoach(profile.role)) renderCoachHome(); else renderAlumnoHome();
}

async function handleSignup(){
  const nombre = document.getElementById('auth-nombre').value.trim();
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-pass').value;
  const errBox = document.getElementById('auth-error');
  errBox.classList.add('hidden');
  if(!nombre || !email || !pass){ showToast('Completa todos los campos'); return; }
  if(pass.length < 6){ showToast('La contraseña debe tener al menos 6 caracteres'); return; }
  const btn = document.getElementById('auth-submit');
  btn.disabled = true; btn.textContent = 'Creando...';
  // Si la persona entró con un link de invitación (?ref=<id-del-profesor>),
  // se lo mandamos al signup para que quede asignada automáticamente.
  // Si no hay ref (la forma antigua de crear cuenta), sigue funcionando igual.
  const refProfesor = new URLSearchParams(window.location.search).get('ref') || undefined;
  const { data, error } = await sb.auth.signUp({
    email, password: pass, options: { data: { nombre, profesor_id: refProfesor } }
  });
  btn.disabled = false; btn.textContent = 'Crear cuenta';
  if(error){
    errBox.textContent = 'No se pudo crear la cuenta: ' + error.message;
    errBox.classList.remove('hidden');
    return;
  }
  if(!data.session){
    showToast('Cuenta creada. Revisa tu correo para confirmar.');
    renderAuth('login');
    return;
  }
  session = data.session;
  await loadProfile();
  showToast('¡Cuenta creada!');
  if(profile && esVistaCoach(profile.role)) renderCoachHome(); else renderAlumnoHome();
}

async function handleLogout(){
  await sb.auth.signOut();
  session = null; profile = null;
  renderAuth();
}

// ============================================================
// VISTA ALUMNO
// ============================================================
async function renderAlumnoHome(){
  root().innerHTML = `<div class="loading">Cargando tu historial...</div>`;

  const [{ data: sesiones }, { data: rutina }, { data: historialRutinas }] = await Promise.all([
    sb.from('sesiones').select('*, sesion_series(*)').eq('alumno_id', profile.id).order('fecha', { ascending: false }),
    sb.from('rutinas').select('*, rutina_ejercicios(*)').eq('alumno_id', profile.id).eq('activa', true).maybeSingle(),
    sb.from('rutinas').select('id').eq('alumno_id', profile.id).eq('activa', false)
  ]);

  const todasSesiones = markPRs(sesiones || []);
  const conSeries = todasSesiones.filter(s => (s.sesion_series || []).length > 0);
  const fechas = conSeries.map(s => s.fecha);
  const streak = computeStreak(fechas);
  activeRutinaDias = (rutina && rutina.rutina_ejercicios) ? groupPorDia(rutina.rutina_ejercicios) : [];
  activeStatsPorEjercicio = computeStatsPorEjercicio(sesiones || []);
  const hayEntrenamientoHoy = (sesiones || []).some(s => s.fecha === todayStr());

  root().innerHTML = `
    <div class="header-actions">
      <div>
        <h1 style="font-size:20px;">Hola, ${escapeHtml(profile.nombre.split(' ')[0])}</h1>
        <div class="sub" style="margin-bottom:0;">Tu registro de entrenamiento</div>
      </div>
      <button class="switch-user" id="btn-logout">${ICONS.logout} Salir</button>
    </div>

    <div class="streak-row">
      <div class="stat-tile"><div class="num">${streak}</div><div class="label">semana${streak===1?'':'s'} seguidas</div></div>
      <div class="stat-tile"><div class="num">${conSeries.length}</div><div class="label">sesiones totales</div></div>
    </div>

    <button class="btn" id="btn-nueva-sesion" style="margin-bottom:16px;">${ICONS.plus} ${hayEntrenamientoHoy ? 'Seguir con el entrenamiento de hoy' : 'Nueva sesión de hoy'}</button>

    ${rutina ? `
      <button class="btn-toggle-rutina" id="btn-toggle-rutina">
        <span class="toggle-label">${ICONS.clipboard} Rutina: ${escapeHtml(rutina.nombre)}</span>
        ${toggleStateHtml()}
      </button>
      <div class="card hidden" id="rutina-detail-card">
        <div class="row-flex" style="margin-bottom:6px;">
          <h2 style="margin:0;">${escapeHtml(rutina.nombre)}</h2>
          <button class="btn-sm" id="btn-pdf-rutina">${ICONS.download} Descargar PDF</button>
        </div>
        ${rutina.objetivo ? `<div class="sub" style="margin-bottom:12px;">${escapeHtml(rutina.objetivo)}</div>` : ''}
        ${activeRutinaDias.map(d => `
          <div class="dia-heading">${escapeHtml(d.nombre)}</div>
          ${d.ejercicios.map(ex => `
            <div class="set-line"><span>${escapeHtml(ex.nombre)}</span>${renderExMeta(ex)}</div>${renderExNota(ex)}
          `).join('')}
        `).join('')}
      </div>
    ` : `<div class="card"><div class="empty" style="padding:16px;">Tu coach todavía no te ha asignado una rutina activa.</div></div>`}

    ${historialRutinas && historialRutinas.length ? `<button class="link-btn" id="btn-ver-mis-rutinas" style="margin-bottom:16px;">Ver rutinas anteriores (${historialRutinas.length}) →</button>` : ''}

    <button class="btn-toggle-rutina" id="btn-toggle-calendario">
      <span class="toggle-label">${ICONS.calendar} Calendario</span>
      ${toggleStateHtml()}
    </button>
    <div class="hidden" id="calendar-holder"></div>

    ${conSeries.length ? `
      <button class="btn-toggle-rutina" id="btn-toggle-progreso">
        <span class="toggle-label">${ICONS.trending} Progresión por ejercicio</span>
        ${toggleStateHtml()}
      </button>
      <div class="chart-wrap hidden" id="progreso-wrap">
        <select id="progreso-select" style="margin-bottom:10px;"></select>
        <canvas id="progreso-canvas"></canvas>
      </div>
    ` : ''}

    <button class="btn-toggle-rutina" id="btn-toggle-mediciones">
      <span class="toggle-label">${ICONS.activity} Mediciones corporales</span>
      ${toggleStateHtml()}
    </button>
    <div class="hidden" id="mediciones-holder"></div>

    <button class="btn-toggle-rutina" id="btn-toggle-historial">
      <span class="toggle-label">${ICONS.book} Historial de entrenamiento</span>
      ${toggleStateHtml()}
    </button>
    <div class="hidden" id="sesiones-list"></div>

    <button class="btn-toggle-rutina" id="btn-toggle-opinar">
      <span class="toggle-label">${ICONS.message} Opinar sobre el servicio</span>
      ${toggleStateHtml()}
    </button>
    <div class="hidden" id="opinar-holder"></div>
  `;

  document.getElementById('btn-logout').onclick = handleLogout;
  document.getElementById('btn-nueva-sesion').onclick = () => iniciarNuevaSesion(rutina);
  if(rutina){
    document.getElementById('btn-pdf-rutina').onclick = () => descargarRutinaPDF(rutina, activeRutinaDias);
    wireToggle('btn-toggle-rutina', 'rutina-detail-card');
  }
  if(historialRutinas && historialRutinas.length){
    document.getElementById('btn-ver-mis-rutinas').onclick = () => renderHistorialRutinas(profile, renderAlumnoHome, false);
  }
  wireToggle('btn-toggle-calendario', 'calendar-holder');
  wireToggle('btn-toggle-historial', 'sesiones-list');
  if(conSeries.length){
    let progresoInicializado = false;
    wireToggle('btn-toggle-progreso', 'progreso-wrap', () => {
      if(!progresoInicializado){ setupProgresoChart(conSeries); progresoInicializado = true; }
      else if(progresoChart){ progresoChart.resize(); }
    });
  }
  {
    let medicionesInicializado = false;
    wireToggle('btn-toggle-mediciones', 'mediciones-holder', () => {
      if(!medicionesInicializado){ renderMediciones('mediciones-holder', profile.id); medicionesInicializado = true; }
    });
  }
  wireToggle('btn-toggle-opinar', 'opinar-holder', () => renderOpinionForm('opinar-holder', profile.id));

  renderCalendar('calendar-holder', fechas);
  renderSesionesList('sesiones-list', conSeries, false, renderAlumnoHome);
}

function renderCalendar(holderId, fechas){
  const set = new Set(fechas);
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + calendarMonthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const nombreMes = base.toLocaleDateString('es-CL', { month:'long', year:'numeric' });

  let cells = '';
  for(let i=0;i<startOffset;i++) cells += `<div class="calendar-day empty-cell"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const trained = set.has(iso);
    cells += `<div class="calendar-day ${trained ? 'trained' : ''}" ${trained ? `onclick="irASesion('${iso}')"` : ''}>${d}</div>`;
  }

  document.getElementById(holderId).innerHTML = `
    <div class="calendar">
      <div class="calendar-head">
        <button class="btn-sm" id="cal-prev">←</button>
        <span style="text-transform:capitalize;">${nombreMes}</span>
        <button class="btn-sm" id="cal-next">→</button>
      </div>
      <div class="calendar-grid">
        <div class="dow">L</div><div class="dow">M</div><div class="dow">M</div><div class="dow">J</div><div class="dow">V</div><div class="dow">S</div><div class="dow">D</div>
        ${cells}
      </div>
    </div>
  `;
  document.getElementById('cal-prev').onclick = () => { calendarMonthOffset--; renderCalendar(holderId, fechas); };
  document.getElementById('cal-next').onclick = () => { calendarMonthOffset++; renderCalendar(holderId, fechas); };
}

function irASesion(fecha){
  const el = document.querySelector(`.session-card[data-fecha="${fecha}"]`);
  if(!el) return;
  const holder = el.closest('.hidden');
  if(holder){
    setToggleOpen('btn-toggle-historial', holder.id, true);
  }
  el.scrollIntoView({ behavior:'smooth', block:'center' });
  el.classList.add('highlight');
  setTimeout(()=> el.classList.remove('highlight'), 1600);
}

// Línea de una serie ya guardada, dentro del historial de sesiones.
// El coach la ve de solo lectura. El alumno puede editar reps, peso y
// nota de una serie ya guardada — es su propio registro de entrenamiento,
// así que la decisión es dejarlo abierto: si alguien lo edita mal, solo
// se engaña a sí mismo con su propio historial.
function renderSetLineHistorial(set, i, isCoachView){
  if(isCoachView){
    const pr = set._isPR ? '<span class="pill pr">🏆 PR</span>' : '';
    const nota = set.nota ? `<span class="pill" style="padding:2px 8px; font-size:10.5px;">${escapeHtml(set.nota)}</span>` : '';
    return `<div class="set-line">S${i+1}: <b>${set.reps}</b> reps × <b>${set.peso}kg</b> ${nota} ${pr}</div>`;
  }
  cacheSeriesHistorial[set.id] = { reps: set.reps, peso: set.peso, nota: set.nota || '', i, _isPR: !!set._isPR };
  return `<div class="set-line" id="set-line-${set.id}">${lineaSerieVista(set.id)}</div>`;
}

function lineaSerieVista(setId){
  const s = cacheSeriesHistorial[setId];
  if(!s) return '';
  const pr = s._isPR ? '<span class="pill pr">🏆 PR</span>' : '';
  const nota = s.nota ? `<span class="pill" style="padding:2px 8px; font-size:10.5px;">${escapeHtml(s.nota)}</span>` : '';
  return `
    <span>S${s.i+1}: <b>${s.reps}</b> reps × <b>${s.peso}kg</b> ${nota} ${pr}</span>
    <button type="button" class="link-btn" onclick="mostrarEditorSerieHistorial('${setId}')">Editar</button>
  `;
}

function mostrarEditorSerieHistorial(setId){
  const holder = document.getElementById(`set-line-${setId}`);
  const s = cacheSeriesHistorial[setId];
  if(!holder || !s) return;
  holder.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; width:100%;">
      <span style="white-space:nowrap;">S${s.i+1}:</span>
      <input type="number" id="edit-reps-${setId}" value="${s.reps}" placeholder="Reps" style="width:60px; margin:0; padding:4px 6px; font-size:11.5px;">
      <span style="white-space:nowrap;">reps ×</span>
      <input type="number" id="edit-peso-${setId}" value="${s.peso}" placeholder="Peso" style="width:60px; margin:0; padding:4px 6px; font-size:11.5px;">
      <span style="white-space:nowrap;">kg</span>
      <input type="text" id="edit-nota-${setId}" value="${escapeHtml(s.nota)}" placeholder="Nota (opcional)" style="flex:1; min-width:110px; margin:0; padding:4px 6px; font-size:11.5px;">
      <button type="button" class="link-btn" onclick="guardarSerieHistorial('${setId}')">Guardar</button>
      <button type="button" class="link-btn" onclick="cancelarEdicionSerieHistorial('${setId}')">Cancelar</button>
    </div>
  `;
  const input = document.getElementById(`edit-reps-${setId}`);
  if(input){ input.focus(); input.select(); }
}

function cancelarEdicionSerieHistorial(setId){
  const holder = document.getElementById(`set-line-${setId}`);
  if(holder) holder.innerHTML = lineaSerieVista(setId);
}

async function guardarSerieHistorial(setId){
  const repsEl = document.getElementById(`edit-reps-${setId}`);
  const pesoEl = document.getElementById(`edit-peso-${setId}`);
  const notaEl = document.getElementById(`edit-nota-${setId}`);
  const reps = repsEl ? repsEl.value : '';
  const peso = pesoEl ? pesoEl.value : '';
  const nota = notaEl ? notaEl.value.trim() : '';
  if(!reps){ showToast('Completa las repeticiones'); return; }

  const { error } = await sb.from('sesion_series').update({ reps, peso: peso || 0, nota: nota || null }).eq('id', setId);
  if(error){ showToast('No se pudo guardar, intenta de nuevo'); return; }

  cacheSeriesHistorial[setId] = { ...cacheSeriesHistorial[setId], reps, peso: peso || 0, nota };
  const holder = document.getElementById(`set-line-${setId}`);
  if(holder) holder.innerHTML = lineaSerieVista(setId);
  showToast('Serie actualizada ✓');
}

function renderSesionesList(holderId, sesiones, isCoachView, onDeleted, soloLectura){
  const holder = document.getElementById(holderId);
  if(!sesiones.length){
    holder.innerHTML = `<div class="empty">Aún no hay entrenamientos registrados.</div>`;
    return;
  }
  holder.innerHTML = sesiones.map(s => {
    const groups = groupSets(s.sesion_series);
    const totalSeries = (s.sesion_series || []).length;
    return `
    <div class="session-card" data-fecha="${s.fecha}">
      <div class="session-head">
        <span>${formatDate(s.fecha)}</span>
        <span style="display:flex; gap:6px; flex-wrap:wrap;">
          ${s.dia_nombre ? `<span class="pill">${escapeHtml(s.dia_nombre)}</span>` : ''}
          <span class="pill">${totalSeries} series</span>
        </span>
      </div>
      <div class="session-body">
        ${groups.map(g => `
          <div class="exercise-group">
            <div class="ex-head"><span class="ex-name">${escapeHtml(g.nombre)}</span></div>
            ${g.sets.map((set,i) => renderSetLineHistorial(set, i, isCoachView)).join('')}
          </div>
        `).join('')}
        ${isCoachView
          ? (s.nota_alumno ? `<div class="note-box"><div class="note-label">Nota del alumno</div>${escapeHtml(s.nota_alumno)}</div>` : '')
          : `<div class="note-box" style="margin-top:12px;">
              <div class="note-label">Tu nota</div>
              <textarea id="nota-alumno-${s.id}" placeholder="¿Cómo te sentiste en este entrenamiento?">${escapeHtml(s.nota_alumno || '')}</textarea>
              <button class="btn-sm" onclick="guardarNotaAlumno('${s.id}')">Guardar nota</button>
            </div>`
        }
        ${s.foto_url ? `<img class="session-photo" src="${s.foto_url}" alt="Foto de la sesión">` : ''}
        ${isCoachView && !soloLectura ? `
          <div class="note-box" style="margin-top:12px;">
            <div class="note-label">Nota del coach</div>
            <textarea id="nota-coach-${s.id}" placeholder="Escribe una observación para esta sesión...">${escapeHtml(s.nota_coach || '')}</textarea>
            <button class="btn-sm" onclick="guardarNotaCoach('${s.id}')">Guardar nota</button>
          </div>
        ` : (s.nota_coach ? `<div class="note-box"><div class="note-label">Nota del coach</div>${escapeHtml(s.nota_coach)}</div>` : '')}
        ${soloLectura ? '' : `<button class="btn-sm btn-eliminar-sesion" data-id="${s.id}" style="margin-top:12px;">Eliminar sesión</button>`}
      </div>
    </div>
  `;
  }).join('');

  holder.querySelectorAll('.btn-eliminar-sesion').forEach(btn => {
    btn.onclick = () => {
      if(btn.dataset.confirm === '1'){
        eliminarSesion(btn.dataset.id, onDeleted);
      } else {
        btn.dataset.confirm = '1';
        btn.textContent = '¿Seguro? Toca de nuevo para eliminar';
        btn.classList.add('btn-danger-confirm');
        setTimeout(() => {
          if(!btn.isConnected) return;
          btn.dataset.confirm = '';
          btn.textContent = 'Eliminar sesión';
          btn.classList.remove('btn-danger-confirm');
        }, 3000);
      }
    };
  });
}

async function eliminarSesion(id, onDeleted){
  const { error } = await sb.from('sesiones').delete().eq('id', id);
  if(error){ showToast('No se pudo eliminar la sesión'); return; }
  showToast('Sesión eliminada');
  if(onDeleted) onDeleted();
}

// ---------- MEDICIONES CORPORALES (foto del resumen de InBody, con historial) ----------
async function renderMediciones(holderId, alumnoId, soloLectura){
  const holder = document.getElementById(holderId);
  holder.innerHTML = `<div class="loading">Cargando mediciones...</div>`;

  const { data: mediciones } = await sb.from('mediciones').select('*').eq('alumno_id', alumnoId).order('fecha', { ascending: false });

  const listaHtml = (mediciones && mediciones.length)
    ? mediciones.map(m => `
      <div class="session-card">
        <div class="session-head"><span>${formatDate(m.fecha)}</span></div>
        <div class="session-body">
          <img class="session-photo" src="${m.foto_url}" alt="Medición InBody">
          ${soloLectura ? '' : `<button class="btn-sm btn-eliminar-sesion" data-id="${m.id}" style="margin-top:12px;">Eliminar medición</button>`}
        </div>
      </div>
    `).join('')
    : `<div class="empty">Aún no hay mediciones registradas.</div>`;

  holder.innerHTML = soloLectura ? listaHtml : `
    <div class="card" style="margin-bottom:16px;">
      <label>Fecha de la medición</label>
      <input type="date" id="input-fecha-medicion" value="${todayStr()}" max="${todayStr()}">
      <label class="photo-input-label" for="input-foto-medicion">
        <span id="medicion-foto-label-text">${ICONS.camera} Sube la foto del resumen de InBody</span>
        <input type="file" id="input-foto-medicion" accept="image/*">
      </label>
      <button class="btn" id="btn-guardar-medicion">${ICONS.plus} Guardar medición</button>
    </div>
    ${listaHtml}
  `;

  if(soloLectura) return;

  document.getElementById('input-foto-medicion').onchange = (e) => {
    const f = e.target.files[0];
    document.getElementById('medicion-foto-label-text').innerHTML = f ? `${ICONS.check} ${escapeHtml(f.name)}` : `${ICONS.camera} Sube la foto del resumen de InBody`;
  };
  document.getElementById('btn-guardar-medicion').onclick = () => guardarMedicion(alumnoId, holderId);

  holder.querySelectorAll('.btn-eliminar-sesion').forEach(btn => {
    btn.onclick = () => {
      if(btn.dataset.confirm === '1'){
        eliminarMedicion(btn.dataset.id, alumnoId, holderId);
      } else {
        btn.dataset.confirm = '1';
        btn.textContent = '¿Seguro? Toca de nuevo para eliminar';
        btn.classList.add('btn-danger-confirm');
        setTimeout(() => {
          if(!btn.isConnected) return;
          btn.dataset.confirm = '';
          btn.textContent = 'Eliminar medición';
          btn.classList.remove('btn-danger-confirm');
        }, 3000);
      }
    };
  });
}

async function guardarMedicion(alumnoId, holderId){
  const btn = document.getElementById('btn-guardar-medicion');
  const fechaInput = document.getElementById('input-fecha-medicion');
  const fotoInput = document.getElementById('input-foto-medicion');
  const file = fotoInput.files[0];
  if(!file){ showToast('Selecciona la foto del resumen de InBody'); return; }

  btn.disabled = true; btn.textContent = 'Guardando...';
  try{
    const ext = file.name.split('.').pop();
    const path = `${alumnoId}/${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from('medicion-fotos').upload(path, file, { upsert: true });
    if(upErr){ showToast('No se pudo subir la foto'); btn.disabled = false; btn.innerHTML = `${ICONS.plus} Guardar medición`; return; }
    const foto_url = sb.storage.from('medicion-fotos').getPublicUrl(path).data.publicUrl;
    const { error } = await sb.from('mediciones').insert({ alumno_id: alumnoId, fecha: fechaInput.value, foto_url });
    if(error){ showToast('No se pudo guardar la medición'); btn.disabled = false; btn.innerHTML = `${ICONS.plus} Guardar medición`; return; }
    showToast('¡Medición guardada!');
    renderMediciones(holderId, alumnoId);
  }catch(e){
    showToast('Hubo un problema guardando la medición');
    btn.disabled = false; btn.innerHTML = `${ICONS.plus} Guardar medición`;
  }
}

async function eliminarMedicion(id, alumnoId, holderId){
  const { error } = await sb.from('mediciones').delete().eq('id', id);
  if(error){ showToast('No se pudo eliminar la medición'); return; }
  showToast('Medición eliminada');
  renderMediciones(holderId, alumnoId);
}

// ---------- ENTREVISTA INICIAL (audio, solo profe/super admin — no aparece en la vista del alumno) ----------
let entrevistaMediaRecorder = null;
let entrevistaRecStream = null;
let entrevistaRecStart = null;
let entrevistaRecInterval = null;

function formatMSS(segs){
  const m = Math.floor(segs/60), s = segs%60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

async function iniciarGrabacionEntrevista(){
  const btn = document.getElementById('btn-grabar-entrevista');
  const estado = document.getElementById('entrevista-rec-estado');
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined'){
    showToast('Este navegador no permite grabar audio — usa "Sube el audio" con una nota de voz.');
    return;
  }
  try{
    entrevistaRecStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }catch(e){
    showToast('No se pudo acceder al micrófono — revisa los permisos del navegador.');
    return;
  }
  const chunks = [];
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  entrevistaMediaRecorder = mimeType ? new MediaRecorder(entrevistaRecStream, { mimeType }) : new MediaRecorder(entrevistaRecStream);
  entrevistaMediaRecorder.ondataavailable = (e) => { if(e.data && e.data.size > 0) chunks.push(e.data); };
  entrevistaMediaRecorder.onstop = () => {
    entrevistaRecStream.getTracks().forEach(t => t.stop());
    entrevistaRecStream = null;
    const blob = new Blob(chunks, { type: entrevistaMediaRecorder.mimeType || 'audio/webm' });
    const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
    const file = new File([blob], `entrevista-${Date.now()}.${ext}`, { type: blob.type });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById('input-audio-entrevista');
    if(input){
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    }
    entrevistaMediaRecorder = null;
  };
  entrevistaRecStart = Date.now();
  entrevistaMediaRecorder.start();
  if(btn){ btn.textContent = '⏹ Detener grabación'; btn.classList.add('btn-danger-confirm'); }
  entrevistaRecInterval = setInterval(() => {
    if(estado) estado.textContent = `🔴 Grabando… ${formatMSS(Math.floor((Date.now() - entrevistaRecStart)/1000))}`;
  }, 500);
}

function detenerGrabacionEntrevista(){
  if(entrevistaRecInterval){ clearInterval(entrevistaRecInterval); entrevistaRecInterval = null; }
  const btn = document.getElementById('btn-grabar-entrevista');
  const estado = document.getElementById('entrevista-rec-estado');
  if(btn){ btn.textContent = `${ICONS.mic} Grabar audio aquí`; btn.classList.remove('btn-danger-confirm'); }
  if(estado) estado.textContent = '';
  if(entrevistaMediaRecorder && entrevistaMediaRecorder.state !== 'inactive'){
    entrevistaMediaRecorder.stop();
  }
}

// A partir de la URL pública guardada, reconstruye el path interno del
// archivo dentro del bucket — necesario para poder borrarlo de verdad.
function extraerPathStorage(publicUrl, bucket){
  if(!publicUrl) return null;
  const marker = `/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if(idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}

async function renderEntrevista(holderId, alumnoId, audioUrl, fecha, soloLectura){
  const holder = document.getElementById(holderId);

  if(soloLectura){
    holder.innerHTML = audioUrl ? `
      <div class="card">
        <div class="sub" style="margin-bottom:8px;">${fecha ? 'Grabada el ' + formatDateShort(fecha) : 'Fecha no registrada'}</div>
        <audio controls style="width:100%;" src="${audioUrl}"></audio>
      </div>
    ` : `<div class="empty">Todavía no se registró la entrevista inicial.</div>`;
    return;
  }

  holder.innerHTML = audioUrl ? `
    <div class="card">
      <div class="sub" style="margin-bottom:8px;">${fecha ? 'Grabada el ' + formatDateShort(fecha) : 'Fecha no registrada'}</div>
      <audio controls style="width:100%;" src="${audioUrl}"></audio>
      <button class="btn-sm btn-eliminar-sesion" id="btn-eliminar-entrevista" style="margin-top:12px;">Eliminar entrevista</button>
    </div>
  ` : `
    <div class="card">
      <label>Fecha de la entrevista</label>
      <input type="date" id="input-fecha-entrevista" value="${todayStr()}" max="${todayStr()}">

      <div class="row-flex" style="margin-bottom:10px;">
        <button type="button" class="btn-sm" id="btn-grabar-entrevista">${ICONS.mic} Grabar audio aquí</button>
        <span class="sub" id="entrevista-rec-estado" style="margin-bottom:0;"></span>
      </div>

      <div class="sub" style="margin-top:0;">o, si ya tienes el audio grabado (nota de voz, etc.):</div>
      <label class="photo-input-label" for="input-audio-entrevista">
        <span id="entrevista-audio-label-text">${ICONS.mic} Sube el audio de la entrevista</span>
        <input type="file" id="input-audio-entrevista" accept="audio/*">
      </label>
      <button class="btn" id="btn-guardar-entrevista">${ICONS.plus} Guardar entrevista</button>
    </div>
  `;

  if(audioUrl){
    const btnDel = document.getElementById('btn-eliminar-entrevista');
    btnDel.onclick = () => {
      if(btnDel.dataset.confirm === '1'){
        eliminarEntrevista(alumnoId, holderId, audioUrl);
      } else {
        btnDel.dataset.confirm = '1';
        btnDel.textContent = '¿Seguro? Toca de nuevo para eliminar';
        btnDel.classList.add('btn-danger-confirm');
        setTimeout(() => {
          if(!btnDel.isConnected) return;
          btnDel.dataset.confirm = '';
          btnDel.textContent = 'Eliminar entrevista';
          btnDel.classList.remove('btn-danger-confirm');
        }, 3000);
      }
    };
  } else {
    document.getElementById('input-audio-entrevista').onchange = (e) => {
      const f = e.target.files[0];
      document.getElementById('entrevista-audio-label-text').innerHTML = f ? `${ICONS.check} ${escapeHtml(f.name)}` : `${ICONS.mic} Sube el audio de la entrevista`;
    };
    document.getElementById('btn-guardar-entrevista').onclick = () => guardarEntrevista(alumnoId, holderId);
    document.getElementById('btn-grabar-entrevista').onclick = () => {
      if(entrevistaMediaRecorder && entrevistaMediaRecorder.state === 'recording'){
        detenerGrabacionEntrevista();
      } else {
        iniciarGrabacionEntrevista();
      }
    };
  }
}

async function guardarEntrevista(alumnoId, holderId){
  const btn = document.getElementById('btn-guardar-entrevista');
  const fechaInput = document.getElementById('input-fecha-entrevista');
  const audioInput = document.getElementById('input-audio-entrevista');
  const file = audioInput.files[0];
  if(!file){ showToast('Selecciona el archivo de audio'); return; }
  const MAX_BYTES = 60 * 1024 * 1024; // ~60MB — cubre una entrevista larga grabada en vivo (~2h de audio comprimido) o una nota de voz subida a mano
  if(file.size > MAX_BYTES){ showToast('El audio es muy pesado (máx. 60MB).'); return; }

  btn.disabled = true; btn.textContent = 'Guardando...';
  try{
    const ext = file.name.split('.').pop();
    const path = `${alumnoId}/${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from('entrevistas').upload(path, file, { upsert: true });
    if(upErr){ showToast('No se pudo subir el audio'); btn.disabled = false; btn.innerHTML = `${ICONS.plus} Guardar entrevista`; return; }
    const entrevista_audio_url = sb.storage.from('entrevistas').getPublicUrl(path).data.publicUrl;
    const { error } = await sb.from('profiles').update({ entrevista_audio_url, entrevista_fecha: fechaInput.value }).eq('id', alumnoId);
    if(error){ showToast('No se pudo guardar la entrevista'); btn.disabled = false; btn.innerHTML = `${ICONS.plus} Guardar entrevista`; return; }
    showToast('¡Entrevista guardada!');
    renderEntrevista(holderId, alumnoId, entrevista_audio_url, fechaInput.value);
  }catch(e){
    showToast('Hubo un problema guardando la entrevista');
    btn.disabled = false; btn.innerHTML = `${ICONS.plus} Guardar entrevista`;
  }
}

async function eliminarEntrevista(alumnoId, holderId, audioUrl){
  // Primero se limpia la referencia en el perfil del alumno — así la ficha
  // nunca queda apuntando a un audio roto, pase lo que pase con el paso
  // siguiente. Borrar el archivo del storage es un segundo paso, aparte:
  // si por algo falla, el archivo queda huérfano (ocupa espacio) pero no
  // rompe nada visible en la app.
  const { error } = await sb.from('profiles').update({ entrevista_audio_url: null, entrevista_fecha: null }).eq('id', alumnoId);
  if(error){ showToast('No se pudo eliminar la entrevista'); return; }

  const path = extraerPathStorage(audioUrl, 'entrevistas');
  if(path){
    try{
      await sb.storage.from('entrevistas').remove([path]);
    }catch(e){
      console.warn('No se pudo borrar el audio del storage (queda huérfano, sin afectar la app):', e);
    }
  }

  showToast('Entrevista eliminada');
  renderEntrevista(holderId, alumnoId, null, null);
}

// ---------- OPINAR SOBRE EL SERVICIO (buzón privado alumno → super admin) ----------
async function renderOpinionForm(holderId, alumnoId){
  const holder = document.getElementById(holderId);
  holder.innerHTML = `<div class="loading">Cargando...</div>`;
  const { data: opiniones } = await sb.from('opiniones').select('*').eq('alumno_id', alumnoId).order('created_at', { ascending: false });
  const listaHtml = (opiniones && opiniones.length)
    ? opiniones.map(o => `
      <div class="session-card">
        <div class="session-head"><span>${formatDate(o.created_at.slice(0,10))}</span></div>
        <div class="session-body"><div class="sub" style="margin-bottom:0;">${escapeHtml(o.mensaje)}</div></div>
      </div>
    `).join('')
    : `<div class="empty">Todavía no has enviado ningún mensaje.</div>`;
  holder.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="sub" style="margin-bottom:12px;">Este mensaje lo lee directamente la jefatura de STC — tu profesor no lo ve. Úsalo para contarle cómo va el servicio, la infraestructura, o cualquier sugerencia.</div>
      <label>Tu mensaje</label>
      <textarea id="input-opinion" placeholder="Escribe aquí..." rows="4"></textarea>
      <button class="btn" id="btn-enviar-opinion">${ICONS.message} Enviar</button>
    </div>
    ${listaHtml}
  `;
  document.getElementById('btn-enviar-opinion').onclick = () => enviarOpinion(alumnoId, holderId);
}

async function enviarOpinion(alumnoId, holderId){
  const textarea = document.getElementById('input-opinion');
  const mensaje = textarea.value.trim();
  if(!mensaje){ showToast('Escribe un mensaje primero'); return; }
  const btn = document.getElementById('btn-enviar-opinion');
  btn.disabled = true; btn.textContent = 'Enviando...';
  const { error } = await sb.from('opiniones').insert({ alumno_id: alumnoId, mensaje });
  if(error){ showToast('No se pudo enviar: ' + error.message); btn.disabled = false; btn.innerHTML = `${ICONS.message} Enviar`; return; }
  showToast('¡Gracias! Tu mensaje fue enviado.');
  renderOpinionForm(holderId, alumnoId);
}

// ---------- BUZÓN DE SUGERENCIAS (solo super admin) ----------
async function renderBuzonOpiniones(holderId){
  const holder = document.getElementById(holderId);
  holder.innerHTML = `<div class="loading">Cargando...</div>`;
  const { data: opiniones, error } = await sb.from('opiniones').select('*, profiles(nombre)').order('created_at', { ascending: false });
  if(error){ holder.innerHTML = `<div class="error-banner">No se pudo cargar el buzón.</div>`; return; }
  holder.innerHTML = (opiniones && opiniones.length)
    ? opiniones.map(o => `
      <div class="session-card">
        <div class="session-head"><span>${escapeHtml(o.profiles ? o.profiles.nombre : 'Alumno')}</span><span>${formatDateShort(o.created_at.slice(0,10))}</span></div>
        <div class="session-body"><div class="sub" style="margin-bottom:0;">${escapeHtml(o.mensaje)}</div></div>
      </div>
    `).join('')
    : `<div class="empty">Todavía no hay mensajes en el buzón.</div>`;
}

function setupProgresoChart(sesiones){
  const ejercicios = [...new Set(sesiones.flatMap(s => (s.sesion_series||[]).map(x => x.ejercicio_nombre)))];
  const select = document.getElementById('progreso-select');
  select.innerHTML = ejercicios.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
  const draw = () => {
    const ej = select.value;
    const puntos = sesiones
      .map(s => {
        const sets = (s.sesion_series||[]).filter(x => x.ejercicio_nombre === ej);
        if(!sets.length) return null;
        const max = Math.max(...sets.map(x => Number(x.peso)||0));
        return { fecha: s.fecha, peso: max };
      })
      .filter(Boolean)
      .sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));

    if(progresoChart) progresoChart.destroy();
    const ctx = document.getElementById('progreso-canvas').getContext('2d');
    progresoChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: puntos.map(p => formatDateShort(p.fecha)),
        datasets: [{
          label: 'Peso máximo (kg)',
          data: puntos.map(p => p.peso),
          borderColor: '#FFC72C',
          backgroundColor: 'rgba(255,199,44,0.18)',
          tension: 0.25,
          fill: true,
          pointBackgroundColor: '#FFC72C'
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9CA39A' }, grid: { color: '#3A3E37' } },
          y: { ticks: { color: '#9CA39A' }, grid: { color: '#3A3E37' } }
        }
      }
    });
  };
  select.onchange = draw;
  draw();
}

// ---------- NUEVA SESIÓN (con autoguardado) ----------
async function iniciarNuevaSesion(rutina){
  const btn = document.getElementById('btn-nueva-sesion');
  if(btn){ btn.disabled = true; btn.textContent = 'Cargando...'; }
  activeSesionFecha = todayStr();

  // Si el alumno ya tiene una sesión guardada hoy, seguimos sumando ahí
  // en vez de crear una tarjeta nueva por cada ejercicio.
  const { data: existentes } = await sb.from('sesiones')
    .select('*, sesion_series(*)')
    .eq('alumno_id', profile.id)
    .eq('fecha', activeSesionFecha)
    .order('created_at', { ascending: false })
    .limit(1);
  const existente = existentes && existentes[0];

  if(existente){
    activeSesionId = existente.id;
    activeSesionExs = groupSets(existente.sesion_series);
    activeSesionDia = existente.dia_nombre || null;
    renderNuevaSesionForm();
    return;
  }

  const { data, error } = await sb.from('sesiones').insert({
    alumno_id: profile.id,
    rutina_id: rutina ? rutina.id : null,
    fecha: activeSesionFecha
  }).select().single();
  if(error){ showToast('No se pudo iniciar la sesión'); if(btn){btn.disabled=false; btn.textContent='+ Nueva sesión de hoy';} return; }
  activeSesionId = data.id;
  activeSesionExs = [];
  activeSesionDia = null;
  renderNuevaSesionForm();
}

function renderNuevaSesionForm(){
  const diaSeleccionadoObj = activeRutinaDias.find(d => d.nombre === activeSesionDia);
  const ejerciciosSugeridos = diaSeleccionadoObj ? diaSeleccionadoObj.ejercicios : [];
  activeEjerciciosSugeridos = ejerciciosSugeridos;

  root().innerHTML = `
    <div class="row-flex">
      <h1 style="font-size:20px;">Registrar entrenamiento</h1>
      <button class="link-btn" id="btn-cancelar-sesion">Cancelar</button>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <label>Fecha del entrenamiento</label>
      <input type="date" id="input-fecha-sesion" value="${activeSesionFecha}" max="${todayStr()}" style="margin-bottom:0;">
    </div>
    <div class="sub" id="sesion-fecha-label">${formatDate(activeSesionFecha)} — cada serie se guarda sola apenas la agregas.</div>
    <div class="sub" style="margin-top:-10px;">Agrega un ejercicio, sumale sus series, y agrega otro ejercicio si te falta — todo queda en el mismo entrenamiento hasta que finalices.</div>

    ${activeRutinaDias.length ? `
      <button type="button" class="btn-toggle-rutina" id="btn-toggle-dia">
        <span class="toggle-label">${ICONS.calendar} ${activeSesionDia ? 'Día: ' + escapeHtml(activeSesionDia) : '¿Qué día de tu programa entrenas hoy?'}</span>
        ${toggleStateHtml(activeSesionDia ? 'Cambiar' : 'Elegir')}
      </button>
      <div class="hidden" id="dia-picker-holder" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">
        ${activeRutinaDias.map(d => `<button type="button" class="dia-btn ${activeSesionDia === d.nombre ? 'selected' : ''}" onclick="seleccionarDiaSesion('${escapeHtml(d.nombre).replace(/'/g,"\\'")}')">${escapeHtml(d.nombre)}</button>`).join('')}
      </div>
    ` : ''}

    ${ejerciciosSugeridos.length ? `
      <div class="sub" style="margin-bottom:8px;">Ejercicios de ${escapeHtml(activeSesionDia)} (toca para agregarlo):</div>
      <div id="sugeridos-holder" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">
        ${renderSugeridosButtonsHtml(ejerciciosSugeridos)}
      </div>
    ` : ''}

    <div id="draft-exercises"></div>

    <div class="card">
      <label>Agregar ejercicio</label>
      <div style="display:flex; gap:8px;">
        <input type="text" id="input-nuevo-ejercicio" placeholder="Ej: Remo Frontal con Polea" style="margin-bottom:0; flex:1;">
        <button type="button" class="btn-sm" id="btn-agregar-ejercicio" style="white-space:nowrap;">+ Agregar</button>
      </div>
    </div>

    <div class="card">
      <label>Nota (opcional)</label>
      <textarea id="input-nota-alumno" placeholder="¿Cómo te sentiste hoy?"></textarea>
      <label class="photo-input-label" for="input-foto">
        <span id="foto-label-text">📷 Agregar una foto de la sesión (opcional)</span>
        <input type="file" id="input-foto" accept="image/*">
      </label>
      <div class="sub" style="margin-top:0;">Toca esto recién cuando termines <b>todos</b> los ejercicios de hoy:</div>
      <button class="btn" id="btn-finalizar-sesion">${ICONS.check} Finalizar entrenamiento de hoy</button>
    </div>
  `;
  document.getElementById('btn-cancelar-sesion').onclick = cancelarSesion;
  document.getElementById('input-fecha-sesion').onchange = actualizarFechaSesion;
  if(activeRutinaDias.length){
    wireToggle('btn-toggle-dia', 'dia-picker-holder');
  }
  document.getElementById('btn-agregar-ejercicio').onclick = () => agregarBloqueEjercicio();
  document.getElementById('input-nuevo-ejercicio').onkeydown = (e) => { if(e.key === 'Enter'){ e.preventDefault(); agregarBloqueEjercicio(); } };
  document.getElementById('btn-finalizar-sesion').onclick = finalizarSesion;
  document.getElementById('input-foto').onchange = (e) => {
    const f = e.target.files[0];
    document.getElementById('foto-label-text').textContent = f ? `✅ ${f.name}` : '📷 Agregar una foto de la sesión (opcional)';
  };
  renderDraftExercises();
}

// Botones de "ejercicios de tu rutina": muestran el peso objetivo (si lo
// cargó el coach) y se marcan como agregados apenas el ejercicio ya está
// en el entrenamiento de hoy, para saber de un vistazo qué falta.
function renderSugeridosButtonsHtml(lista){
  return (lista || []).map(ex => {
    const yaAgregado = activeSesionExs.some(g => g.nombre.toLowerCase() === ex.nombre.trim().toLowerCase());
    const pesoPill = ex.peso_objetivo ? ` <span class="pill" style="padding:2px 8px; font-size:10px;">${escapeHtml(ex.peso_objetivo)}</span>` : '';
    return `<button type="button" class="btn-sm${yaAgregado ? ' added' : ''}" onclick="agregarBloqueEjercicio('${escapeHtml(ex.nombre).replace(/'/g,"\\'")}')">${yaAgregado ? '✓ ' : ''}${escapeHtml(ex.nombre)}${pesoPill}</button>`;
  }).join('');
}
function actualizarSugeridosHolder(){
  const holder = document.getElementById('sugeridos-holder');
  if(holder) holder.innerHTML = renderSugeridosButtonsHtml(activeEjerciciosSugeridos);
}

// Crea (o enfoca) un bloque de ejercicio dentro del entrenamiento de hoy.
// nombreForzado se usa cuando viene de un botón de sugerencia; si no, toma el input de texto.
function agregarBloqueEjercicio(nombreForzado){
  const input = document.getElementById('input-nuevo-ejercicio');
  const nombre = (nombreForzado || (input ? input.value : '')).trim();
  if(!nombre){ showToast('Escribe el nombre del ejercicio'); return; }

  const existente = activeSesionExs.find(g => g.nombre.toLowerCase() === nombre.toLowerCase());
  if(input) input.value = '';
  if(existente){
    showToast('Ese ejercicio ya está en tu entrenamiento de hoy — sumale series ahí abajo');
    return;
  }

  // Peso sugerido = el último peso real que registró en este ejercicio,
  // para no tener que escribirlo de cero cada vez (se puede ajustar igual).
  const stat = activeStatsPorEjercicio[nombre.toLowerCase()];
  const pesoSugerido = stat && stat.last ? stat.last : null;

  // Se agrega al INICIO (no al final) para que el ejercicio recién
  // seleccionado quede arriba de todo, sin tener que scrollear hacia
  // abajo pasando los ejercicios que ya se agregaron antes hoy.
  activeSesionExs.unshift({ nombre, sets: [], pesoSugerido });
  renderDraftExercises();
  actualizarSugeridosHolder();
}

async function actualizarFechaSesion(){
  const input = document.getElementById('input-fecha-sesion');
  const val = input.value;
  if(!val) return;

  const { data: choque } = await sb.from('sesiones')
    .select('id, dia_nombre, nota_alumno, nota_coach, foto_url, sesion_series(id)')
    .eq('alumno_id', profile.id)
    .eq('fecha', val)
    .neq('id', activeSesionId);

  // Una sesión "fantasma" es una que quedó abierta (se creó al tocar "Nueva
  // sesión") pero se abandonó sin registrar nada — sin series, sin nota, sin
  // foto. No tiene ningún dato real adentro, así que no debería bloquear la
  // fecha para siempre: la limpiamos sola y dejamos seguir. Si tiene aunque
  // sea un dato real, ahí sí es un entrenamiento guardado de verdad y bloqueamos.
  const candidatos = choque || [];
  const reales = candidatos.filter(s =>
    (s.sesion_series && s.sesion_series.length) || s.dia_nombre || s.nota_alumno || s.nota_coach || s.foto_url
  );
  const fantasmas = candidatos.filter(s => !reales.includes(s));

  if(reales.length){
    showToast('Ya hay un entrenamiento guardado en esa fecha — cancela esta sesión y entra a ese día para seguir sumando ahí.');
    input.value = activeSesionFecha;
    return;
  }

  if(fantasmas.length){
    await sb.from('sesiones').delete().in('id', fantasmas.map(f => f.id));
  }

  activeSesionFecha = val;
  const label = document.getElementById('sesion-fecha-label');
  if(label) label.textContent = `${formatDate(val)} — cada serie se guarda sola apenas la agregas.`;
  const { error } = await sb.from('sesiones').update({ fecha: val }).eq('id', activeSesionId);
  if(error){ showToast('No se pudo actualizar la fecha'); return; }
  showToast('Fecha actualizada ✓');
}

async function seleccionarDiaSesion(nombre){
  activeSesionDia = nombre;
  await sb.from('sesiones').update({ dia_nombre: nombre }).eq('id', activeSesionId);
  renderNuevaSesionForm();
}

function renderSetLine(s, i, idx){
  const nota = s.nota ? `<span class="pill" style="padding:2px 8px; font-size:10.5px;">${escapeHtml(s.nota)}</span>` : '';
  const tipoLado = renderTipoLadoPills(s.tipo_serie, s.lado);
  const pr = s._isPR ? '<span class="pill pr">🔥 PR</span>' : '';
  const btnBorrar = (idx != null && s.id) ? `<button type="button" class="remove-x" style="height:22px; width:22px; font-size:10px; flex-shrink:0;" onclick="eliminarSetIndividual(${idx}, '${s.id}')" title="Quitar esta serie">✕</button>` : '';
  return `<div class="set-line"><span>S${i+1}: <b>${s.reps}</b> × <b>${s.peso}kg</b>${nota ? ` ${nota}` : ''}${tipoLado ? ` ${tipoLado}` : ''}${pr ? ` ${pr}` : ''}</span>${btnBorrar}</div>`;
}

async function eliminarSetIndividual(idx, setId){
  const grupo = activeSesionExs[idx];
  if(!grupo) return;
  const { error } = await sb.from('sesion_series').delete().eq('id', setId);
  if(error){ showToast('No se pudo quitar la serie'); return; }
  grupo.sets = grupo.sets.filter(s => s.id !== setId);
  const setsHolder = document.getElementById(`bloque-sets-${idx}`);
  if(setsHolder){
    setsHolder.innerHTML = grupo.sets.map((s, i) => renderSetLine(s, i, idx)).join('');
  }
  showToast('Serie quitada');
}

async function agregarSetABloque(idx){
  const grupo = activeSesionExs[idx];
  if(!grupo) return;
  const pesoEl = document.getElementById(`input-peso-${idx}`);
  const repsEl = document.getElementById(`input-reps-${idx}`);
  const notaEl = document.getElementById(`input-nota-${idx}`);
  const tipoSerieEl = document.getElementById(`select-tiposerie-${idx}`);
  const ladoEl = document.getElementById(`select-lado-${idx}`);
  const peso = pesoEl ? pesoEl.value : '';
  const reps = repsEl ? repsEl.value : '';
  const nota = notaEl ? notaEl.value.trim() : '';
  const tipo_serie = tipoSerieEl ? tipoSerieEl.value : '';
  const lado = ladoEl ? ladoEl.value : '';
  if(!reps){ showToast('Completa las repeticiones'); return; }

  const btn = document.getElementById(`btn-serie-${idx}`);
  if(btn) btn.disabled = true;
  const orden = activeSesionExs.reduce((acc,g)=>acc+g.sets.length,0);
  const { data, error } = await sb.from('sesion_series').insert({
    sesion_id: activeSesionId,
    ejercicio_nombre: grupo.nombre,
    peso: peso || 0,
    reps: reps,
    nota: nota || null,
    tipo_serie: tipo_serie || null,
    lado: lado || null,
    orden
  }).select().single();
  if(btn) btn.disabled = false;

  if(error){ showToast('No se pudo guardar la serie, intenta de nuevo'); return; }

  // Detecta un récord personal al instante, con el mismo criterio que se
  // usa para marcar los PR en el historial (peso > máximo previo de ese
  // ejercicio). Actualiza también el "último peso" para la próxima sugerencia.
  const key = grupo.nombre.trim().toLowerCase();
  const pesoNum = Number(data.peso) || 0;
  if(!activeStatsPorEjercicio[key]) activeStatsPorEjercicio[key] = { max: 0, last: 0 };
  const stat = activeStatsPorEjercicio[key];
  const esPR = pesoNum > 0 && pesoNum > stat.max;
  if(pesoNum > stat.max) stat.max = pesoNum;
  if(pesoNum > 0) stat.last = pesoNum;
  data._isPR = esPR;

  grupo.sets.push(data);
  const setsHolder = document.getElementById(`bloque-sets-${idx}`);
  if(setsHolder){
    setsHolder.innerHTML = grupo.sets.map((s, i) => renderSetLine(s, i, idx)).join('');
  }
  if(pesoEl) pesoEl.value = '';
  if(repsEl){ repsEl.value = ''; repsEl.focus(); }
  if(notaEl) notaEl.value = '';
  if(tipoSerieEl) tipoSerieEl.value = '';
  if(ladoEl) ladoEl.value = '';
  showToast(esPR ? `🔥 ¡Nuevo récord en ${grupo.nombre}!` : 'Serie guardada ✓');
}

function quitarBloqueEjercicio(idx, btn){
  const grupo = activeSesionExs[idx];
  if(!grupo) return;
  if(grupo.sets.length && btn && btn.dataset.confirm !== '1'){
    btn.dataset.confirm = '1';
    btn.textContent = '✕✕';
    btn.title = 'Toca de nuevo para quitar este ejercicio y sus series';
    setTimeout(() => {
      if(btn.isConnected){ btn.dataset.confirm = ''; btn.textContent = '✕'; btn.title = 'Quitar ejercicio'; }
    }, 3000);
    return;
  }
  eliminarBloqueEjercicio(idx);
}

async function eliminarBloqueEjercicio(idx){
  const grupo = activeSesionExs[idx];
  if(!grupo) return;
  const ids = grupo.sets.map(s => s.id).filter(Boolean);
  if(ids.length){
    const { error } = await sb.from('sesion_series').delete().in('id', ids);
    if(error){ showToast('No se pudo quitar el ejercicio'); return; }
  }
  activeSesionExs.splice(idx, 1);
  renderDraftExercises();
  actualizarSugeridosHolder();
  showToast('Ejercicio quitado');
}

function renderDraftExercises(){
  const el = document.getElementById('draft-exercises');
  if(!activeSesionExs.length){ el.innerHTML = ''; return; }
  el.innerHTML = activeSesionExs.map((ex, idx) => `
    <div class="exercise-group">
      <div class="ex-head">
        <span class="ex-name">${escapeHtml(ex.nombre)}</span>
        <button type="button" class="remove-x" style="height:28px; width:28px; font-size:12px;" onclick="quitarBloqueEjercicio(${idx}, this)" title="Quitar ejercicio">✕</button>
      </div>
      <div id="bloque-sets-${idx}">
        ${ex.sets.map((s, i) => renderSetLine(s, i, idx)).join('')}
      </div>
      <div class="set-input-row" style="margin-top:8px;">
        <div><input type="number" id="input-reps-${idx}" placeholder="Reps" style="margin-bottom:0;"></div>
        <div><input type="number" id="input-peso-${idx}" placeholder="Peso kg" value="${ex.pesoSugerido != null ? ex.pesoSugerido : ''}" style="margin-bottom:0;"></div>
        <div><button type="button" class="btn-sm" id="btn-serie-${idx}" style="width:100%;" onclick="agregarSetABloque(${idx})">+ Serie</button></div>
      </div>
      <input type="text" id="input-nota-${idx}" placeholder="Nota de esta serie (opcional): drop set, rest-pause, al fallo..." style="margin-top:8px; margin-bottom:0;">
      <div style="display:flex; gap:8px; margin-top:8px;">
        <div style="flex:1;">${selectTipoSerieHtml(`select-tiposerie-${idx}`)}</div>
        <div style="flex:1;">${selectLadoHtml(`select-lado-${idx}`)}</div>
      </div>
    </div>
  `).join('');
}

async function cancelarSesion(){
  const totalSets = activeSesionExs.reduce((acc,g)=>acc+g.sets.length,0);
  if(totalSets === 0 && activeSesionId){
    await sb.from('sesiones').delete().eq('id', activeSesionId);
  }
  activeSesionId = null; activeSesionExs = []; activeSesionDia = null;
  renderAlumnoHome();
}

async function finalizarSesion(){
  const totalSets = activeSesionExs.reduce((acc,g)=>acc+g.sets.length,0);
  if(totalSets === 0){ showToast('Agrega al menos una serie antes de finalizar'); return; }
  const btn = document.getElementById('btn-finalizar-sesion');
  btn.disabled = true; btn.textContent = 'Guardando...';

  const nota = document.getElementById('input-nota-alumno').value.trim();
  const fotoInput = document.getElementById('input-foto');
  let foto_url = null;

  // Si algo falla acá abajo, NO borramos activeSesionId ni el formulario:
  // dejamos todo tal cual (con la nota que escribió) para que pueda tocar
  // "Finalizar" de nuevo sin perder lo que escribió. Sus series ya están
  // guardadas de antes (autoguardado), así que lo único en juego acá es
  // la nota y la foto.
  function reintentar(mensaje){
    showToast(mensaje);
    btn.disabled = false;
    btn.textContent = `${ICONS.check} Finalizar entrenamiento de hoy`;
  }

  try{
    if(fotoInput.files[0]){
      const file = fotoInput.files[0];
      const ext = file.name.split('.').pop();
      const path = `${profile.id}/${activeSesionId}.${ext}`;
      const { error: upErr } = await sb.storage.from('sesion-fotos').upload(path, file, { upsert: true });
      if(!upErr){
        foto_url = sb.storage.from('sesion-fotos').getPublicUrl(path).data.publicUrl;
      }
    }
    const { error } = await sb.from('sesiones').update({ nota_alumno: nota || null, foto_url }).eq('id', activeSesionId);
    if(error){
      reintentar('Tus series ya están guardadas, pero no se pudo guardar la nota — toca "Finalizar" de nuevo para reintentar.');
      return;
    }
    showToast('¡Sesión guardada!');
  }catch(e){
    reintentar('Tus series ya están guardadas, pero no se pudo guardar la nota — toca "Finalizar" de nuevo para reintentar.');
    return;
  }

  activeSesionId = null; activeSesionExs = []; activeSesionDia = null;
  renderAlumnoHome();
}

function descargarRutinaPDF(rutina, dias){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('STC app', 14, 18);
  doc.setFontSize(13);
  doc.text(rutina.nombre, 14, 28);
  let y = 36;
  if(rutina.objetivo){
    doc.setFontSize(10);
    doc.text(rutina.objetivo, 14, y);
    y += 8;
  }

  (dias || []).forEach(dia => {
    if(y > 265){ doc.addPage(); y = 20; }
    y += 4;
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(dia.nombre, 14, y);
    doc.setFont(undefined, 'normal');
    y += 8;

    doc.setFontSize(10);
    doc.text('Ejercicio', 14, y);
    doc.text('Series', 95, y);
    doc.text('Reps', 116, y);
    doc.text('Peso', 138, y);
    doc.text('Descanso', 168, y);
    y += 5;
    doc.setLineWidth(0.2);
    doc.line(14, y, 196, y);
    y += 6;

    doc.setFontSize(11);
    dia.ejercicios.forEach(ex => {
      if(y > 280){ doc.addPage(); y = 20; }
      doc.text(String(ex.nombre).slice(0,38), 14, y);
      doc.text(String(ex.series_objetivo || '-'), 95, y);
      doc.text(String(ex.reps_objetivo || '-'), 116, y);
      doc.text(String(ex.peso_objetivo || '-').slice(0,12), 138, y);
      doc.text(ex.descanso_seg ? `${ex.descanso_seg}s` : '-', 168, y);
      y += 6;
      if(ex.nota){
        if(y > 280){ doc.addPage(); y = 20; }
        doc.setFontSize(9);
        doc.setFont(undefined, 'italic');
        doc.text(`Nota: ${String(ex.nota).slice(0,80)}`, 14, y);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(11);
        y += 6;
      }
      y += 2;
    });
    y += 4;
  });

  doc.save(`${rutina.nombre.replace(/\s+/g,'_')}.pdf`);
}

// ---------- HISTORIAL Y DUPLICADO DE RUTINAS ----------
async function renderHistorialRutinas(alumno, volverFn, permitirDuplicar){
  root().innerHTML = `<div class="loading">Cargando rutinas anteriores...</div>`;
  const { data: rutinas } = await sb.from('rutinas')
    .select('*, rutina_ejercicios(*)')
    .eq('alumno_id', alumno.id)
    .eq('activa', false)
    .order('created_at', { ascending: false });

  root().innerHTML = `
    <div class="header-actions">
      <div>
        <h1 style="font-size:20px;">Rutinas anteriores</h1>
        <div class="sub" style="margin-bottom:0;">${escapeHtml(alumno.nombre)}</div>
      </div>
      <button class="switch-user" id="btn-volver-historial">${ICONS.arrowLeft} Volver</button>
    </div>
    <div id="historial-rutinas-list"></div>
  `;
  document.getElementById('btn-volver-historial').onclick = volverFn;

  const listEl = document.getElementById('historial-rutinas-list');
  if(!rutinas || !rutinas.length){
    listEl.innerHTML = `<div class="empty">Todavía no hay rutinas anteriores guardadas.</div>`;
    return;
  }

  listEl.innerHTML = rutinas.map(r => {
    const dias = groupPorDia(r.rutina_ejercicios);
    return `
    <div class="card">
      <div class="row-flex" style="margin-bottom:6px;">
        <h2 style="margin:0;">${escapeHtml(r.nombre)}</h2>
        <div style="display:flex; gap:6px;">
          <button class="btn-sm" data-pdf-id="${r.id}">${ICONS.download} PDF</button>
          ${permitirDuplicar ? `
            <button class="btn-sm" data-dup-id="${r.id}">Usar como base</button>
            <button class="btn-sm" data-del-id="${r.id}">Eliminar</button>
          ` : ''}
        </div>
      </div>
      ${r.objetivo ? `<div class="sub" style="margin-bottom:6px;">${escapeHtml(r.objetivo)}</div>` : ''}
      <div class="sub" style="margin-bottom:10px;">Creada el ${formatDateShort(String(r.created_at).slice(0,10))}</div>
      ${dias.map(d => `
        <div class="dia-heading">${escapeHtml(d.nombre)}</div>
        ${d.ejercicios.map(ex => `
          <div class="set-line"><span>${escapeHtml(ex.nombre)}</span>${renderExMeta(ex)}</div>${renderExNota(ex)}
        `).join('')}
      `).join('')}
    </div>
  `;
  }).join('');

  listEl.querySelectorAll('[data-pdf-id]').forEach(btn => {
    btn.onclick = () => {
      const rutina = rutinas.find(r => r.id === btn.dataset.pdfId);
      descargarRutinaPDF(rutina, groupPorDia(rutina.rutina_ejercicios));
    };
  });

  if(permitirDuplicar){
    listEl.querySelectorAll('[data-dup-id]').forEach(btn => {
      btn.onclick = () => {
        const rutina = rutinas.find(r => r.id === btn.dataset.dupId);
        duplicarRutinaComoNueva(alumno, rutina);
      };
    });
    listEl.querySelectorAll('[data-del-id]').forEach(btn => {
      btn.onclick = () => {
        if(btn.dataset.confirm === '1'){
          eliminarRutina(btn.dataset.delId, () => renderHistorialRutinas(alumno, volverFn, permitirDuplicar));
        } else {
          btn.dataset.confirm = '1';
          btn.textContent = '¿Seguro?';
          btn.classList.add('btn-danger-confirm');
          setTimeout(() => {
            if(!btn.isConnected) return;
            btn.dataset.confirm = '';
            btn.textContent = 'Eliminar';
            btn.classList.remove('btn-danger-confirm');
          }, 3000);
        }
      };
    });
  }
}

async function eliminarRutina(id, onDeleted){
  const { error } = await sb.from('rutinas').delete().eq('id', id);
  if(error){ showToast('No se pudo eliminar la rutina'); return; }
  showToast('Rutina eliminada');
  if(onDeleted) onDeleted();
}

function duplicarRutinaComoNueva(alumno, rutinaVieja){
  const dias = groupPorDia(rutinaVieja.rutina_ejercicios).map(d => ({
    nombre: d.nombre,
    ejercicios: d.ejercicios.map(ex => ({
      nombre: ex.nombre || '',
      series_objetivo: ex.series_objetivo != null ? String(ex.series_objetivo) : '',
      reps_objetivo: ex.reps_objetivo || '',
      peso_objetivo: ex.peso_objetivo || '',
      nota: ex.nota || '',
      descanso_seg: ex.descanso_seg != null ? String(ex.descanso_seg) : '',
      tipo_serie_objetivo: ex.tipo_serie_objetivo || '',
      lado_objetivo: ex.lado_objetivo || ''
    }))
  }));
  renderRutinaEditor(alumno, { nombre: rutinaVieja.nombre, objetivo: rutinaVieja.objetivo || '', dias });
}

// ============================================================
// VISTA COACH
// ============================================================
// Quita tildes y pasa a minúsculas, para que buscar "jose" encuentre "José".
function normalizarTexto(txt){
  return (txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

async function renderCoachHome(){
  root().innerHTML = `<div class="loading">Cargando alumnos...</div>`;
  const esSuperAdmin = profile.role === 'super_admin';

  const [{ data: alumnos, error }, profesoresRes] = await Promise.all([
    sb.from('profiles').select('*').eq('role', 'alumno').order('nombre'),
    sb.from('profiles').select('*').eq('role', 'profesor').order('nombre')
  ]);
  if(error){ root().innerHTML = `<div class="error-banner">No se pudo cargar la lista de alumnos.</div>`; return; }
  const profesores = profesoresRes.data || [];

  const conUltima = await Promise.all((alumnos||[]).map(async a => {
    const [{ data }, { data: rutinaActiva }, { data: medData }] = await Promise.all([
      sb.from('sesiones').select('fecha').eq('alumno_id', a.id).order('fecha', { ascending:false }).limit(1),
      sb.from('rutinas').select('fecha').eq('alumno_id', a.id).eq('activa', true).maybeSingle(),
      sb.from('mediciones').select('fecha').eq('alumno_id', a.id).order('fecha', { ascending:false }).limit(1)
    ]);
    return {
      ...a,
      ultima: data && data[0] ? data[0].fecha : null,
      rutinaFecha: rutinaActiva ? rutinaActiva.fecha : null,
      medicionFecha: medData && medData[0] ? medData[0].fecha : null
    };
  }));

  const nombreProfesor = (profesorId) => {
    const p = profesores.find(p => p.id === profesorId);
    return p ? p.nombre : null;
  };

  root().innerHTML = `
    <div class="header-actions">
      <div>
        <h1 style="font-size:20px;">${esSuperAdmin ? 'Vista Super Admin' : 'Vista Profesor'}</h1>
        <div class="sub" style="margin-bottom:0;">Selecciona un alumno para ver su registro</div>
      </div>
      <button class="switch-user" id="btn-logout">${ICONS.logout} Salir</button>
    </div>
    <div class="card" style="font-size:12.5px; color:var(--chalk-dim);">
      Para que un alumno nuevo entre, compártele el link de la app: te va a pedir crear su cuenta con su correo la primera vez.
    </div>
    ${esSuperAdmin ? `
      <button class="btn-toggle-rutina" id="btn-toggle-profesores">
        <span class="toggle-label">${ICONS.users} Gestión de profesores</span>
        ${toggleStateHtml()}
      </button>
      <div class="hidden" id="profesores-holder"></div>

      <button class="btn-toggle-rutina" id="btn-toggle-buzon">
        <span class="toggle-label">${ICONS.message} Buzón de sugerencias</span>
        ${toggleStateHtml()}
      </button>
      <div class="hidden" id="buzon-holder"></div>

      <button class="btn-toggle-rutina" id="btn-toggle-alumnos">
        <span class="toggle-label">${ICONS.users} Alumnos</span>
        ${toggleStateHtml()}
      </button>
      <div class="hidden" id="alumnos-holder">
        ${conUltima.length ? `
          <div style="position:relative; margin-bottom:14px;">
            <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--chalk-dim); display:flex;">${ICONS.search}</span>
            <input type="text" id="input-buscar-alumno" placeholder="Buscar alumno por nombre..." style="padding-left:36px; margin-bottom:0;" autocomplete="off">
          </div>
        ` : ''}
        <div id="coach-alumnos-list"></div>
      </div>
    ` : `
      <div class="row-flex" style="margin-bottom:10px; align-items:center;">
        <div class="sub" style="margin-bottom:0;" id="alumnos-scope-label">Tus alumnos</div>
        ${conUltima.length ? `<button class="btn-sm" id="btn-toggle-scope">${ICONS.users} Ver todos los alumnos</button>` : ''}
      </div>
      ${conUltima.length ? `
        <div style="position:relative; margin-bottom:14px;">
          <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--chalk-dim); display:flex;">${ICONS.search}</span>
          <input type="text" id="input-buscar-alumno" placeholder="Buscar alumno por nombre..." style="padding-left:36px; margin-bottom:0;" autocomplete="off">
        </div>
      ` : ''}
      <div class="card hidden" id="alumnos-scope-note" style="font-size:12.5px; color:var(--chalk-dim); margin-bottom:14px;">
        Estás viendo a todos los alumnos del gimnasio, no solo los tuyos — puedes ver el perfil de cualquiera, por si necesitas cubrir a otro profe, pero solo puedes editar o eliminar cosas en los alumnos asignados a ti.
      </div>
      <div id="coach-alumnos-list"></div>
    `}
  `;
  document.getElementById('btn-logout').onclick = handleLogout;

  if(esSuperAdmin){
    wireToggle('btn-toggle-profesores', 'profesores-holder', () => {
      renderGestionProfesores('profesores-holder', profesores, conUltima, renderCoachHome);
    });
    wireToggle('btn-toggle-buzon', 'buzon-holder', () => renderBuzonOpiniones('buzon-holder'));
    wireToggle('btn-toggle-alumnos', 'alumnos-holder');

    const inputBuscar = document.getElementById('input-buscar-alumno');
    if(inputBuscar){
      inputBuscar.oninput = () => {
        const q = normalizarTexto(inputBuscar.value.trim());
        const filtrados = q ? conUltima.filter(a => normalizarTexto(a.nombre).includes(q)) : conUltima;
        renderListaAlumnos(filtrados, esSuperAdmin, profesores, nombreProfesor, conUltima.length, q);
      };
    }

    renderListaAlumnos(conUltima, esSuperAdmin, profesores, nombreProfesor, conUltima.length, '');
  } else {
    // Por defecto el profesor solo ve a sus propios alumnos; con el botón puede
    // pasar a ver a todos (modo observador) — el buscador filtra dentro de esa vista.
    const misAlumnos = conUltima.filter(a => a.profesor_id === profile.id);
    let mostrarTodos = false;

    const btnToggleScope = document.getElementById('btn-toggle-scope');
    const notaScope = document.getElementById('alumnos-scope-note');
    const scopeLabel = document.getElementById('alumnos-scope-label');
    const inputBuscar = document.getElementById('input-buscar-alumno');

    const refrescarLista = () => {
      const base = mostrarTodos ? conUltima : misAlumnos;
      const q = inputBuscar ? normalizarTexto(inputBuscar.value.trim()) : '';
      const filtrados = q ? base.filter(a => normalizarTexto(a.nombre).includes(q)) : base;
      const emptyMsg = (!mostrarTodos && !misAlumnos.length && conUltima.length)
        ? 'Todavía no tienes alumnos asignados.<br>Pídele al super admin que te asigne alumnos, o toca "Ver todos los alumnos" para ver el resto.'
        : null;
      renderListaAlumnos(filtrados, esSuperAdmin, profesores, nombreProfesor, base.length, q, emptyMsg);
    };

    if(btnToggleScope){
      btnToggleScope.onclick = () => {
        mostrarTodos = !mostrarTodos;
        btnToggleScope.innerHTML = `${ICONS.users} ${mostrarTodos ? 'Ver solo mis alumnos' : 'Ver todos los alumnos'}`;
        scopeLabel.textContent = mostrarTodos ? 'Todos los alumnos' : 'Tus alumnos';
        if(notaScope) notaScope.classList.toggle('hidden', !mostrarTodos);
        if(inputBuscar) inputBuscar.value = '';
        refrescarLista();
      };
    }
    if(inputBuscar){
      inputBuscar.oninput = refrescarLista;
    }

    refrescarLista();
  }
}

function renderListaAlumnos(lista, esSuperAdmin, profesores, nombreProfesor, totalSinFiltrar, query, emptyMsgHtml){
  const listEl = document.getElementById('coach-alumnos-list');
  if(!totalSinFiltrar){
    listEl.innerHTML = `<div class="empty">${emptyMsgHtml || 'Aún no hay alumnos registrados.<br>Cuando alguien cree su cuenta, va a aparecer aquí.'}</div>`;
    return;
  }
  if(!lista.length){
    listEl.innerHTML = `<div class="empty">No hay ningún alumno que coincida con "${escapeHtml(query)}".</div>`;
    return;
  }
  listEl.innerHTML = lista.map(a => `
    <div class="coach-list-item">
      <div style="flex:1; min-width:0; cursor:pointer;" onclick="renderCoachAlumnoDetail('${a.id}')">
        <div class="coach-name">${escapeHtml(a.nombre)}</div>
        <div class="coach-meta">${a.ultima ? 'Última sesión: ' + formatDateShort(a.ultima) : 'Sin sesiones todavía'} · ${nombreProfesor(a.profesor_id) ? escapeHtml(nombreProfesor(a.profesor_id)) : 'Sin profesor asignado'}</div>
        <div class="coach-meta" style="margin-top:2px;">${renderEstadoVencimiento('Rutina', a.rutinaFecha, 30, 'sin rutina activa')} · ${renderEstadoVencimiento('Medición', a.medicionFecha, 60, 'sin mediciones')}</div>
      </div>
      ${esSuperAdmin ? `
        <select class="select-inline select-asignar-profesor" data-alumno="${a.id}">
          <option value="">Sin asignar</option>
          ${profesores.map(p => `<option value="${p.id}" ${a.profesor_id === p.id ? 'selected' : ''}>${escapeHtml(p.nombre)}</option>`).join('')}
        </select>
      ` : ''}
      <span class="pill" style="cursor:pointer;" onclick="renderCoachAlumnoDetail('${a.id}')">Ver ${ICONS.chevronRight}</span>
    </div>
  `).join('');

  if(esSuperAdmin){
    listEl.querySelectorAll('.select-asignar-profesor').forEach(sel => {
      sel.onclick = (e) => e.stopPropagation();
      sel.onchange = async () => {
        const alumnoId = sel.dataset.alumno;
        const nuevoProfesorId = sel.value || null;
        const { error } = await sb.from('profiles').update({ profesor_id: nuevoProfesorId }).eq('id', alumnoId);
        if(error){ showToast('No se pudo asignar: ' + error.message); return; }
        showToast('Profesor asignado');
        renderCoachHome();
      };
    });
  }
}

// ---------- GESTIÓN DE PROFESORES (solo super admin) ----------
function renderGestionProfesores(holderId, profesores, alumnos, onCambio){
  const holder = document.getElementById(holderId);
  const conteos = {};
  (alumnos||[]).forEach(a => { if(a.profesor_id) conteos[a.profesor_id] = (conteos[a.profesor_id] || 0) + 1; });
  const linkBase = `${window.location.origin}${window.location.pathname}`;
  const alumnosSinProfesor = (alumnos||[]).filter(a => a.role !== 'profesor');

  holder.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="row-flex" style="margin-bottom:8px;">
        <label style="margin:0;">Profesores</label>
        <button class="btn-sm" id="btn-pdf-protocolos">${ICONS.download} PDF: alumnos por profesor</button>
      </div>
      ${profesores.length ? profesores.map(p => `
        <div class="coach-list-item" style="cursor:default; align-items:flex-start; margin-bottom:4px;">
          <div style="flex:1; min-width:0;">
            <div class="coach-name">${escapeHtml(p.nombre)}</div>
            <div class="coach-meta">${conteos[p.id] || 0} alumno${(conteos[p.id]||0) === 1 ? '' : 's'} asignado${(conteos[p.id]||0) === 1 ? '' : 's'}</div>
          </div>
          <button class="btn-sm btn-copiar-link" data-id="${p.id}">${ICONS.link} Copiar link</button>
        </div>
        <button class="btn-toggle-rutina" id="btn-toggle-alumnos-profe-${p.id}" style="margin-bottom:14px;">
          <span class="toggle-label">${ICONS.users} Alumnos de ${escapeHtml(p.nombre)}</span>
          ${toggleStateHtml()}
        </button>
        <div class="hidden" id="alumnos-profe-holder-${p.id}" style="margin-bottom:14px;"></div>
      `).join('') : `<div class="empty">Aún no hay profesores.</div>`}
    </div>
    <div class="card">
      <label>Convertir un alumno en profesor</label>
      <select id="select-nuevo-profesor">
        <option value="">Elige un alumno...</option>
        ${alumnosSinProfesor.map(a => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('')}
      </select>
      <button class="btn-sm" id="btn-hacer-profesor">${ICONS.users} Hacer profesor</button>
    </div>
  `;

  holder.querySelectorAll('.btn-copiar-link').forEach(btn => {
    btn.onclick = async () => {
      const link = `${linkBase}?ref=${btn.dataset.id}`;
      try {
        await navigator.clipboard.writeText(link);
        showToast('Link copiado');
      } catch(e){
        showToast('No se pudo copiar. Link: ' + link);
      }
    };
  });

  document.getElementById('btn-pdf-protocolos').onclick = async (ev) => {
    const btn = ev.currentTarget;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Generando...';
    try{
      await descargarPDFEstadoProtocolos(profesores, alumnos);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  };

  profesores.forEach(p => {
    const suyos = (alumnos||[]).filter(a => a.profesor_id === p.id);
    wireToggle(`btn-toggle-alumnos-profe-${p.id}`, `alumnos-profe-holder-${p.id}`, () => {
      renderListaAlumnosProfesor(`alumnos-profe-holder-${p.id}`, p, suyos);
    });
  });

  document.getElementById('btn-hacer-profesor').onclick = async () => {
    const sel = document.getElementById('select-nuevo-profesor');
    const alumnoId = sel.value;
    if(!alumnoId){ showToast('Elige un alumno primero'); return; }
    const { error } = await sb.from('profiles').update({ role: 'profesor', profesor_id: null }).eq('id', alumnoId);
    if(error){ showToast('No se pudo convertir: ' + error.message); return; }
    showToast('Ahora es profesor');
    if(onCambio) onCambio();
  };
}

// Lista de alumnos actuales de un profesor (clickeable a su ficha), con el estado de sus 3 protocolos.
function renderListaAlumnosProfesor(holderId, profesor, alumnosDelProfesor){
  const holder = document.getElementById(holderId);
  if(!alumnosDelProfesor.length){
    holder.innerHTML = `<div class="empty">Este profesor todavía no tiene alumnos asignados.</div>`;
    return;
  }
  holder.innerHTML = `
    <div class="card">
      <label style="margin-bottom:10px; display:block;">${alumnosDelProfesor.length} alumno${alumnosDelProfesor.length === 1 ? '' : 's'}</label>
      ${alumnosDelProfesor.map(a => `
        <div class="set-line" style="cursor:pointer; flex-direction:column; align-items:flex-start; gap:4px; padding:8px 0;" onclick="renderCoachAlumnoDetail('${a.id}')">
          <div style="display:flex; justify-content:space-between; width:100%;">
            <span>${escapeHtml(a.nombre)}</span>
            ${a.ultima ? `<span>${formatDateShort(a.ultima)}</span>` : ''}
          </div>
          <div style="font-size:10.5px;">${renderEstadoVencimiento('Rutina', a.rutinaFecha, 30, 'sin rutina activa')} · ${renderEstadoVencimiento('Medición', a.medicionFecha, 60, 'sin mediciones')} · ${a.entrevista_audio_url ? 'Entrevista: ' + (a.entrevista_fecha ? formatDateShort(a.entrevista_fecha) : 'realizada') : 'Entrevista: NO realizada'}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ---------- Panel de protocolos en PDF (inspirado en la planilla "PROTOCOLOS [MES]"
// que ya usa STC: profesores en columnas, cada protocolo con su fila de "cuántos
// al día" y su fila de "% al día", más una columna de totales a la derecha —
// pero con los colores institucionales STC en vez de la planilla original. ----------
// Umbral: 90% o más = verde (al día). 85-89% = amarillo (atención). Menos de 85% =
// rojo (bajo el mínimo que activa revisión, igual que en la planilla de Google Sheets).
function pctColorProtocolo(pct){
  if(pct === null || pct === undefined) return '#9CA39A';
  if(pct >= 90) return '#4CAF6D';
  if(pct >= 85) return '#FFC72C';
  return '#E5484D';
}

function hexToRgb(hex){
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Tarjeta con un número grande (vector, no imagen — nítida en cualquier zoom/impresión).
function dibujarTarjetaStat(doc, x, y, w, h, label, pct, ok, total, unidadTxt){
  const rgb = hexToRgb(pctColorProtocolo(pct));
  const cx = x + w / 2;

  doc.setDrawColor(210, 210, 205);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'S');
  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.rect(x, y, w, 1.3, 'F');

  doc.setTextColor(rgb.r, rgb.g, rgb.b);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(18);
  const pctTxt = (pct === null || pct === undefined) ? 's/d' : `${Math.round(pct)}%`;
  doc.text(pctTxt, cx, y + 12.5, { align: 'center' });

  doc.setTextColor(26, 29, 28);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(8.5);
  doc.text(label, cx, y + 19, { align: 'center' });

  doc.setFont(undefined, 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(120, 120, 120);
  const countTxt = (!total) ? 'sin alumnos' : `${ok}/${total} ${unidadTxt || 'alumnos al día'}`;
  doc.text(countTxt, cx, y + 24, { align: 'center' });
  doc.setTextColor(26, 29, 28);
}

// Fila de grilla genérica: primera columna = etiqueta, columnas del medio = un
// valor por profesor, última columna = total general (con su propio color de fondo).
function filaGrid(doc, x, y, colWidths, celdas, opts){
  opts = opts || {};
  const rowH = opts.rowH || 7;

  let cx = x;
  colWidths.forEach((w, i) => {
    const isLast = i === colWidths.length - 1;
    const bg = (isLast && opts.totalColBg) ? opts.totalColBg : opts.bgColor;
    if(bg){
      const rgb = hexToRgb(bg);
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.rect(cx, y, w, rowH, 'F');
    }
    cx += w;
  });

  // Bordes de celda tipo planilla Excel — una línea gris fina alrededor de cada celda.
  doc.setDrawColor(176, 176, 168);
  doc.setLineWidth(0.15);
  cx = x;
  colWidths.forEach((w) => {
    doc.rect(cx, y, w, rowH, 'S');
    cx += w;
  });

  cx = x;
  colWidths.forEach((w, i) => {
    const val = celdas[i] || {};
    const fontSize = val.fontSize || 7.2;
    doc.setFont(undefined, val.bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const rgb = hexToRgb(val.color || opts.textColor || '#1A1D1C');
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    const align = val.align || (i === 0 ? 'left' : 'center');
    let text = val.text != null ? String(val.text) : '';
    while(doc.getTextWidth(text) > w - 2.5 && text.length > 1){
      text = text.slice(0, -2) + '…';
    }
    const tx = align === 'left' ? cx + 2 : cx + w / 2;
    doc.text(text, tx, y + rowH / 2 + 1, { align });
    cx += w;
  });

  doc.setTextColor(26, 29, 28);
  doc.setFont(undefined, 'normal');
  return y + rowH;
}

// Barra amarilla de sección (ej. "RUTINA — vigente a 30 días"), ancho completo de la grilla.
function barraSeccion(doc, x, y, wTotal, texto){
  doc.setFillColor(255, 199, 44);
  doc.rect(x, y, wTotal, 6.5, 'F');
  doc.setTextColor(26, 29, 28);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(8);
  doc.text(texto, x + 3, y + 4.5);
  doc.setFont(undefined, 'normal');
  return y + 6.5;
}

// Línea de detalle de un alumno (macrociclo / medición / entrevista) — devuelve el nuevo y.
function lineaAlumnoPDF(doc, a, x, y){
  doc.setFontSize(10.5);
  doc.setFont(undefined, 'bold');
  doc.text(a.nombre, x, y);
  doc.setFont(undefined, 'normal');
  y += 5.5;

  doc.setFontSize(9);
  const rutinaTxt = a.rutinaFecha ? `Macrociclo: ${formatDateShort(a.rutinaFecha)}${a.rutinaOk ? '' : ' (VENCIDA)'}` : 'Macrociclo: sin macrociclo activo';
  const medicionTxt = a.medicionFecha ? `Medición: ${formatDateShort(a.medicionFecha)}${a.medicionOk ? '' : ' (VENCIDA)'}` : 'Medición: sin mediciones';
  const entrevistaTxt = a.entrevistaOk ? `Entrevista: ${a.entrevista_fecha ? formatDateShort(a.entrevista_fecha) : 'realizada'}` : 'Entrevista: NO realizada';
  doc.text(`   ${rutinaTxt}   ·   ${medicionTxt}   ·   ${entrevistaTxt}`, x, y);
  return y + 7;
}

// PDF de estado de protocolos — panel general (profesores en columnas, como la
// planilla "PROTOCOLOS [MES]" de STC) + detalle alumno por alumno debajo.
// "Al día" = rutina vigente (≤30 días) + medición vigente (≤60 días) + entrevista
// realizada alguna vez (no vence). Columnas ordenadas de menor a mayor % general,
// para que el profesor que más necesita atención aparezca primero (a la izquierda).
async function descargarPDFEstadoProtocolos(profesores, alumnos){
  if(!alumnos || !alumnos.length){ showToast('No hay alumnos registrados todavía'); return; }

  const alumnosConEstado = alumnos.map(a => ({
    ...a,
    rutinaOk: !!a.rutinaFecha && !estaVencida(a.rutinaFecha, 30),
    medicionOk: !!a.medicionFecha && !estaVencida(a.medicionFecha, 60),
    entrevistaOk: !!a.entrevista_audio_url
  }));

  const statsPorProfesor = profesores
    .map(p => {
      const suyos = alumnosConEstado.filter(a => a.profesor_id === p.id);
      const n = suyos.length;
      const rutinaOkN = suyos.filter(a => a.rutinaOk).length;
      const medicionOkN = suyos.filter(a => a.medicionOk).length;
      const entrevistaOkN = suyos.filter(a => a.entrevistaOk).length;
      return {
        profesor: p,
        alumnos: suyos,
        n,
        rutinaOkN, medicionOkN, entrevistaOkN,
        pctRutina: n ? rutinaOkN / n * 100 : null,
        pctMedicion: n ? medicionOkN / n * 100 : null,
        pctEntrevista: n ? entrevistaOkN / n * 100 : null,
        pctTotal: n ? (rutinaOkN + medicionOkN + entrevistaOkN) / (n * 3) * 100 : null
      };
    })
    .sort((a, b) => {
      if(a.pctTotal === null && b.pctTotal === null) return a.profesor.nombre.localeCompare(b.profesor.nombre);
      if(a.pctTotal === null) return 1;
      if(b.pctTotal === null) return -1;
      return a.pctTotal - b.pctTotal;
    });

  const sinAsignar = alumnosConEstado.filter(a => !a.profesor_id);

  const universoTotal = statsPorProfesor.reduce((acc, s) => acc + s.n, 0);
  const granRutinaOk = statsPorProfesor.reduce((acc, s) => acc + s.rutinaOkN, 0);
  const granMedicionOk = statsPorProfesor.reduce((acc, s) => acc + s.medicionOkN, 0);
  const granEntrevistaOk = statsPorProfesor.reduce((acc, s) => acc + s.entrevistaOkN, 0);
  const pctGranRutina = universoTotal ? granRutinaOk / universoTotal * 100 : null;
  const pctGranMedicion = universoTotal ? granMedicionOk / universoTotal * 100 : null;
  const pctGranEntrevista = universoTotal ? granEntrevistaOk / universoTotal * 100 : null;
  const pctGranTotal = universoTotal ? (granRutinaOk + granMedicionOk + granEntrevistaOk) / (universoTotal * 3) * 100 : null;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = 297, pageH = 210, marginX = 12, contentW = pageW - marginX * 2;

  function encabezadoBanda(subtitulo){
    doc.setFillColor(26, 29, 28);
    doc.rect(0, 0, pageW, 24, 'F');
    doc.setFillColor(255, 199, 44);
    doc.rect(0, 0, 4, 24, 'F');
    doc.setTextColor(255, 199, 44);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(18);
    doc.text('STC app', marginX, 13);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(subtitulo, marginX, 19.5);
    doc.setTextColor(26, 29, 28);
  }

  function tituloSeccion(texto, y){
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(texto, marginX, y);
    doc.setFont(undefined, 'normal');
    y += 3;
    doc.setFillColor(255, 199, 44);
    doc.rect(marginX, y, 18, 1, 'F');
    return y + 7;
  }

  encabezadoBanda('Estado de protocolos — panel general');
  doc.setFontSize(8.3);
  doc.setTextColor(110, 110, 110);
  doc.text(`Generado el ${formatDateShort(todayStr())}  ·  Macrociclo vence a 30 días  ·  Medición vence a 2 meses  ·  Entrevista no vence  ·  Verde 90% o más  ·  Amarillo 85-89%  ·  Rojo bajo 85%`, marginX, 30);
  doc.setTextColor(26, 29, 28);

  let y = 38;

  // ---- estado general: universo + 4 tarjetas ----
  y = tituloSeccion('Estado general de protocolos', y);
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  let universoTxt = `Universo: ${universoTotal} alumno${universoTotal === 1 ? '' : 's'} con profesor asignado`;
  if(sinAsignar.length) universoTxt += `  ·  ${sinAsignar.length} sin profesor asignado (no incluido en este cálculo)`;
  doc.text(universoTxt, marginX, y);
  doc.setTextColor(26, 29, 28);
  y += 6;

  const cardGap = 4;
  const cardW = (contentW - cardGap * 3) / 4;
  const cardH = 26;
  dibujarTarjetaStat(doc, marginX, y, cardW, cardH, 'Macrociclo vigente', pctGranRutina, granRutinaOk, universoTotal);
  dibujarTarjetaStat(doc, marginX + (cardW + cardGap), y, cardW, cardH, 'Medición vigente', pctGranMedicion, granMedicionOk, universoTotal);
  dibujarTarjetaStat(doc, marginX + (cardW + cardGap) * 2, y, cardW, cardH, 'Entrevista hecha', pctGranEntrevista, granEntrevistaOk, universoTotal);
  dibujarTarjetaStat(doc, marginX + (cardW + cardGap) * 3, y, cardW, cardH, 'TOTAL GENERAL', pctGranTotal, granRutinaOk + granMedicionOk + granEntrevistaOk, universoTotal * 3, 'protocolos al día (de 3 c/u)');
  y += cardH + 10;

  // ---- panel por profesor: profesores en columnas, cada protocolo con su bloque ----
  if(statsPorProfesor.length){
    y = tituloSeccion('Detalle por profesor', y);

    const labelW = 40, totalW = 24;
    const nCoaches = statsPorProfesor.length;
    const coachW = (contentW - labelW - totalW) / nCoaches;
    const colWidths = [labelW, ...statsPorProfesor.map(() => coachW), totalW];
    const wTotalGrid = colWidths.reduce((a, w) => a + w, 0);
    const primerNombre = (nombre) => (nombre || '').trim().split(/\s+/)[0].toUpperCase();

    y = filaGrid(doc, marginX, y, colWidths, [
      { text: 'PROFESOR', align: 'left', bold: true },
      ...statsPorProfesor.map(s => ({ text: primerNombre(s.profesor.nombre), bold: true })),
      { text: 'TOTAL', bold: true }
    ], { rowH: 8, bgColor: '#1A1D1C', textColor: '#FFC72C' });

    y = filaGrid(doc, marginX, y, colWidths, [
      { text: 'Alumnos', align: 'left', bold: true },
      ...statsPorProfesor.map(s => ({ text: String(s.n) })),
      { text: String(universoTotal), bold: true }
    ], { rowH: 7, bgColor: '#F5F4F0', totalColBg: '#FFE9A8' });

    y = filaGrid(doc, marginX, y, colWidths, [
      { text: '% General', align: 'left', bold: true },
      ...statsPorProfesor.map(s => ({ text: s.pctTotal === null ? 's/d' : `${Math.round(s.pctTotal)}%`, color: pctColorProtocolo(s.pctTotal), bold: true })),
      { text: pctGranTotal === null ? 's/d' : `${Math.round(pctGranTotal)}%`, color: pctColorProtocolo(pctGranTotal), bold: true }
    ], { rowH: 7.5, bgColor: '#FBF3D9', totalColBg: '#FFE9A8' });
    doc.setDrawColor(220, 220, 214);
    doc.line(marginX, y, marginX + wTotalGrid, y);
    y += 3;

    const bloques = [
      { titulo: 'MACROCICLO — vigente a 30 días', okKey: 'rutinaOkN', pctKey: 'pctRutina', granOk: granRutinaOk, pctGran: pctGranRutina },
      { titulo: 'MEDICIÓN — vigente a 2 meses', okKey: 'medicionOkN', pctKey: 'pctMedicion', granOk: granMedicionOk, pctGran: pctGranMedicion },
      { titulo: 'ENTREVISTA — no vence', okKey: 'entrevistaOkN', pctKey: 'pctEntrevista', granOk: granEntrevistaOk, pctGran: pctGranEntrevista }
    ];

    bloques.forEach(b => {
      if(y + 25 > pageH - 12){ doc.addPage(); y = 16; }
      y = barraSeccion(doc, marginX, y, wTotalGrid, b.titulo);

      y = filaGrid(doc, marginX, y, colWidths, [
        { text: 'Alumnos al día', align: 'left' },
        ...statsPorProfesor.map(s => ({ text: s.n ? `${s[b.okKey]}/${s.n}` : 's/d' })),
        { text: `${b.granOk}/${universoTotal}`, bold: true }
      ], { rowH: 7, bgColor: '#FFFFFF', totalColBg: '#FFF3CE' });

      y = filaGrid(doc, marginX, y, colWidths, [
        { text: '% al día', align: 'left', bold: true },
        ...statsPorProfesor.map(s => ({ text: s[b.pctKey] === null ? 's/d' : `${Math.round(s[b.pctKey])}%`, color: pctColorProtocolo(s[b.pctKey]), bold: true })),
        { text: b.pctGran === null ? 's/d' : `${Math.round(b.pctGran)}%`, color: pctColorProtocolo(b.pctGran), bold: true }
      ], { rowH: 7.5, bgColor: '#FBF3D9', totalColBg: '#FFE9A8' });

      doc.setDrawColor(220, 220, 214);
      doc.line(marginX, y, marginX + wTotalGrid, y);
      y += 3;
    });

    y += 2;
    doc.setFontSize(7.5);
    doc.setTextColor(150, 105, 15);
    doc.text('Nota: todo % general bajo 85% queda marcado en rojo y activa revisión del protocolo con el profesor a cargo.', marginX, y);
    doc.setTextColor(26, 29, 28);
    y += 10;
  }

  // ---- detalle alumno por alumno, por profesor ----
  const conAlumnos = statsPorProfesor.filter(s => s.n > 0);
  for(const s of conAlumnos){
    if(y > pageH - 55){ doc.addPage(); y = 16; }
    y = tituloSeccion(`${s.profesor.nombre} (${s.n} alumno${s.n === 1 ? '' : 's'})`, y);

    [...s.alumnos].sort((a, b) => a.nombre.localeCompare(b.nombre)).forEach(a => {
      if(y > pageH - 20){ doc.addPage(); y = 16; }
      y = lineaAlumnoPDF(doc, a, marginX, y);
    });
    y += 5;
  }

  if(sinAsignar.length){
    if(y > pageH - 40){ doc.addPage(); y = 16; }
    y = tituloSeccion(`Sin profesor asignado (${sinAsignar.length})`, y);

    [...sinAsignar].sort((a, b) => a.nombre.localeCompare(b.nombre)).forEach(a => {
      if(y > pageH - 20){ doc.addPage(); y = 16; }
      y = lineaAlumnoPDF(doc, a, marginX, y);
    });
  }

  doc.save(`Estado_protocolos_${todayStr()}.pdf`);
}

async function renderCoachAlumnoDetail(alumnoId){
  root().innerHTML = `<div class="loading">Cargando...</div>`;
  const [{ data: alumno }, { data: sesiones }, { data: rutina }, { data: historial }, { data: medicionesUltima }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', alumnoId).single(),
    sb.from('sesiones').select('*, sesion_series(*)').eq('alumno_id', alumnoId).order('fecha', { ascending:false }),
    sb.from('rutinas').select('*, rutina_ejercicios(*)').eq('alumno_id', alumnoId).eq('activa', true).maybeSingle(),
    sb.from('rutinas').select('id').eq('alumno_id', alumnoId).eq('activa', false),
    sb.from('mediciones').select('fecha').eq('alumno_id', alumnoId).order('fecha', { ascending:false }).limit(1)
  ]);

  const todasSesiones = markPRs(sesiones || []);
  const conSeries = todasSesiones.filter(s => (s.sesion_series||[]).length > 0);
  const fechas = conSeries.map(s => s.fecha);
  const diasRutina = (rutina && rutina.rutina_ejercicios) ? groupPorDia(rutina.rutina_ejercicios) : [];
  const medicionFecha = medicionesUltima && medicionesUltima[0] ? medicionesUltima[0].fecha : null;
  const rutinaVencida = rutina ? estaVencida(rutina.fecha, 30) : false;
  // Modo observador: un profesor que no es el asignado a este alumno puede entrar a mirar
  // (por ejemplo si el profe titular faltó), pero no puede crear, editar ni eliminar nada.
  const soloObservador = profile.role === 'profesor' && alumno.profesor_id !== profile.id;
  const esSuperAdmin = profile.role === 'super_admin';

  root().innerHTML = `
    <div class="header-actions">
      <div style="flex:1; min-width:0;">
        <div id="alumno-nombre-holder">
          <h1 style="font-size:20px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span id="alumno-nombre-texto">${escapeHtml(alumno.nombre)}</span>
            ${esSuperAdmin ? `<button class="btn-sm" id="btn-editar-nombre-alumno" style="font-size:11px; padding:3px 8px;">${ICONS.edit} Editar nombre</button>` : ''}
          </h1>
        </div>
        <div class="sub" style="margin-bottom:0;">Registro de entrenamiento</div>
      </div>
      <button class="switch-user" id="btn-volver">${ICONS.arrowLeft} Volver</button>
    </div>

    ${soloObservador ? `
      <div class="card" style="font-size:12.5px; border-color:var(--orange); color:var(--chalk);">
        ${ICONS.activity} Estás viendo este alumno en modo observador (no está asignado a ti) — puedes ver todo, pero no editar ni eliminar nada.
      </div>
    ` : ''}

    <div class="card" style="font-size:12.5px;">
      <div>${renderEstadoVencimiento('Última rutina', rutina ? rutina.fecha : null, 30, 'sin rutina activa')}</div>
      <div style="margin-top:4px;">${renderEstadoVencimiento('Última medición', medicionFecha, 60, 'sin mediciones registradas')}</div>
    </div>

    ${rutina ? `
      <button class="btn-toggle-rutina" id="btn-toggle-rutina">
        <span class="toggle-label" style="${rutinaVencida ? 'color:var(--red);' : ''}">${ICONS.clipboard} Rutina: ${escapeHtml(rutina.nombre)}${rutinaVencida ? ' (vencida)' : ''}</span>
        ${toggleStateHtml()}
      </button>
    ` : `
      <div class="card">
        <div class="row-flex" style="margin-bottom:0;">
          <h2 style="margin:0;">Sin rutina activa</h2>
          ${soloObservador ? '' : '<button class="btn-sm" id="btn-nueva-rutina">+ Crear rutina</button>'}
        </div>
      </div>
    `}
    ${historial && historial.length ? `<button class="link-btn" id="btn-ver-historial-rutinas" style="margin-bottom:16px;">Ver rutinas anteriores (${historial.length}) →</button>` : ''}
    ${rutina ? `
      <div class="card hidden" id="rutina-detail-card">
        <div class="row-flex" style="margin-bottom:6px;">
          <h2 style="margin:0; ${rutinaVencida ? 'color:var(--red);' : ''}">${escapeHtml(rutina.nombre)}${rutinaVencida ? ' (vencida)' : ''}</h2>
          ${soloObservador ? '' : `
            <div style="display:flex; gap:6px;">
              <button class="btn-sm" id="btn-editar-rutina">Editar</button>
              <button class="btn-sm" id="btn-nueva-rutina">Crear nueva rutina</button>
            </div>
          `}
        </div>
        ${rutina.objetivo ? `<div class="sub" style="margin-bottom:8px;">${escapeHtml(rutina.objetivo)}</div>` : ''}
        ${diasRutina.map(d => `
          <div class="dia-heading">${escapeHtml(d.nombre)}</div>
          ${d.ejercicios.map(ex => `
            <div class="set-line"><span>${escapeHtml(ex.nombre)}</span>${renderExMeta(ex)}</div>${renderExNota(ex)}
          `).join('')}
        `).join('')}
        ${soloObservador ? '' : '<button class="btn-sm btn-eliminar-sesion" id="btn-eliminar-rutina" style="margin-top:12px;">Eliminar rutina</button>'}
      </div>
    ` : ''}

    <button class="btn-toggle-rutina" id="btn-toggle-mediciones">
      <span class="toggle-label">${ICONS.activity} Mediciones corporales</span>
      ${toggleStateHtml()}
    </button>
    <div class="hidden" id="mediciones-holder"></div>

    <button class="btn-toggle-rutina" id="btn-toggle-entrevista">
      <span class="toggle-label">${ICONS.mic} Entrevista inicial</span>
      ${toggleStateHtml()}
    </button>
    <div class="hidden" id="entrevista-holder"></div>

    <button class="btn-toggle-rutina" id="btn-toggle-calendario">
      <span class="toggle-label">${ICONS.calendar} Calendario</span>
      ${toggleStateHtml()}
    </button>
    <div class="hidden" id="calendar-holder"></div>

    <button class="btn-toggle-rutina" id="btn-toggle-historial">
      <span class="toggle-label">${ICONS.book} Historial de sesiones</span>
      ${toggleStateHtml()}
    </button>
    <div class="hidden" id="sesiones-list"></div>

    ${profile.role === 'super_admin' ? `
      <button class="btn-sm btn-eliminar-sesion" id="btn-eliminar-alumno" style="margin-top:16px; width:100%; justify-content:center;">Eliminar alumno</button>
    ` : ''}
  `;
  document.getElementById('btn-volver').onclick = () => {
    // Si se navega hacia atrás en medio de una grabación de entrevista sin
    // haber tocado "Detener", igual la cortamos acá — para no dejar el
    // micrófono grabando de fondo sin que el profe se dé cuenta.
    detenerGrabacionEntrevista();
    renderCoachHome();
  };
  if(esSuperAdmin){
    const btnEditarNombre = document.getElementById('btn-editar-nombre-alumno');
    if(btnEditarNombre){
      btnEditarNombre.onclick = () => {
        document.getElementById('alumno-nombre-holder').innerHTML = `
          <div class="row-flex" style="gap:8px; align-items:center; flex-wrap:wrap;">
            <input type="text" id="input-editar-nombre-alumno" value="${escapeHtml(alumno.nombre)}" style="margin-bottom:0; flex:1; min-width:160px;">
            <button class="btn-sm" id="btn-guardar-nombre-alumno">Guardar</button>
            <button class="btn-sm" id="btn-cancelar-nombre-alumno">Cancelar</button>
          </div>
        `;
        const input = document.getElementById('input-editar-nombre-alumno');
        input.focus();
        input.select();
        document.getElementById('btn-cancelar-nombre-alumno').onclick = () => renderCoachAlumnoDetail(alumnoId);
        const guardarNombreAlumno = async () => {
          const nuevoNombre = input.value.trim();
          if(!nuevoNombre){ showToast('El nombre no puede quedar vacío'); return; }
          if(nuevoNombre === alumno.nombre){ renderCoachAlumnoDetail(alumnoId); return; }
          const btnGuardar = document.getElementById('btn-guardar-nombre-alumno');
          btnGuardar.disabled = true; btnGuardar.textContent = 'Guardando...';
          const { error } = await sb.from('profiles').update({ nombre: nuevoNombre }).eq('id', alumnoId);
          if(error){ showToast('No se pudo actualizar el nombre: ' + error.message); btnGuardar.disabled = false; btnGuardar.textContent = 'Guardar'; return; }
          showToast('Nombre actualizado');
          renderCoachAlumnoDetail(alumnoId);
        };
        document.getElementById('btn-guardar-nombre-alumno').onclick = guardarNombreAlumno;
        input.onkeydown = (e) => { if(e.key === 'Enter') guardarNombreAlumno(); };
      };
    }
  }
  const btnNuevaRutina = document.getElementById('btn-nueva-rutina');
  if(btnNuevaRutina) btnNuevaRutina.onclick = () => renderRutinaEditor(alumno);
  if(rutina){
    wireToggle('btn-toggle-rutina', 'rutina-detail-card');
  }
  {
    let medicionesInicializado = false;
    wireToggle('btn-toggle-mediciones', 'mediciones-holder', () => {
      if(!medicionesInicializado){ renderMediciones('mediciones-holder', alumnoId, soloObservador); medicionesInicializado = true; }
    });
  }
  {
    let entrevistaInicializada = false;
    wireToggle('btn-toggle-entrevista', 'entrevista-holder', () => {
      if(!entrevistaInicializada){ renderEntrevista('entrevista-holder', alumnoId, alumno.entrevista_audio_url, alumno.entrevista_fecha, soloObservador); entrevistaInicializada = true; }
    });
  }
  wireToggle('btn-toggle-calendario', 'calendar-holder');
  wireToggle('btn-toggle-historial', 'sesiones-list');
  renderCalendar('calendar-holder', fechas);
  if(rutina && !soloObservador){
    document.getElementById('btn-editar-rutina').onclick = () => {
      const dias = diasRutina.map(d => ({
        nombre: d.nombre,
        ejercicios: d.ejercicios.map(ex => ({
          nombre: ex.nombre || '',
          series_objetivo: ex.series_objetivo != null ? String(ex.series_objetivo) : '',
          reps_objetivo: ex.reps_objetivo || '',
          peso_objetivo: ex.peso_objetivo || '',
          nota: ex.nota || '',
          descanso_seg: ex.descanso_seg != null ? String(ex.descanso_seg) : ''
        }))
      }));
      renderRutinaEditor(alumno, { nombre: rutina.nombre, objetivo: rutina.objetivo || '', dias }, rutina.id);
    };
  }
  if(historial && historial.length){
    document.getElementById('btn-ver-historial-rutinas').onclick = () => renderHistorialRutinas(alumno, () => renderCoachAlumnoDetail(alumnoId), !soloObservador);
  }
  if(rutina && !soloObservador){
    const btnDelRutina = document.getElementById('btn-eliminar-rutina');
    btnDelRutina.onclick = () => {
      if(btnDelRutina.dataset.confirm === '1'){
        eliminarRutina(rutina.id, () => renderCoachAlumnoDetail(alumnoId));
      } else {
        btnDelRutina.dataset.confirm = '1';
        btnDelRutina.textContent = '¿Seguro? Toca de nuevo para eliminar';
        btnDelRutina.classList.add('btn-danger-confirm');
        setTimeout(() => {
          if(!btnDelRutina.isConnected) return;
          btnDelRutina.dataset.confirm = '';
          btnDelRutina.textContent = 'Eliminar rutina';
          btnDelRutina.classList.remove('btn-danger-confirm');
        }, 3000);
      }
    };
  }
  renderSesionesList('sesiones-list', conSeries, true, () => renderCoachAlumnoDetail(alumnoId), soloObservador);

  if(profile.role === 'super_admin'){
    const btnElimAlumno = document.getElementById('btn-eliminar-alumno');
    btnElimAlumno.onclick = () => {
      if(btnElimAlumno.dataset.confirm === '1'){
        eliminarAlumno(alumnoId, alumno.nombre, btnElimAlumno);
      } else {
        btnElimAlumno.dataset.confirm = '1';
        btnElimAlumno.textContent = '¿Seguro? Toca de nuevo para eliminar';
        btnElimAlumno.classList.add('btn-danger-confirm');
        setTimeout(() => {
          if(!btnElimAlumno.isConnected) return;
          btnElimAlumno.dataset.confirm = '';
          btnElimAlumno.textContent = 'Eliminar alumno';
          btnElimAlumno.classList.remove('btn-danger-confirm');
        }, 3000);
      }
    };
  }
}

async function eliminarAlumno(alumnoId, nombre, btn){
  btn.disabled = true; btn.textContent = 'Eliminando...';
  const { error } = await sb.rpc('eliminar_alumno', { target_id: alumnoId });
  if(error){
    showToast('No se pudo eliminar: ' + error.message);
    btn.disabled = false; btn.textContent = 'Eliminar alumno';
    btn.classList.remove('btn-danger-confirm');
    return;
  }
  showToast(`Cuenta de ${nombre} eliminada`);
  renderCoachHome();
}

async function guardarNotaCoach(sesionId){
  const val = document.getElementById(`nota-coach-${sesionId}`).value.trim();
  const { error } = await sb.from('sesiones').update({ nota_coach: val || null }).eq('id', sesionId);
  if(error){ showToast('No se pudo guardar la nota'); return; }
  showToast('Nota guardada ✓');
}

async function guardarNotaAlumno(sesionId){
  const val = document.getElementById(`nota-alumno-${sesionId}`).value.trim();
  const { error } = await sb.from('sesiones').update({ nota_alumno: val || null }).eq('id', sesionId);
  if(error){ showToast('No se pudo guardar la nota'); return; }
  showToast('Nota guardada ✓');
}

function renderRutinaEditor(alumno, prefill, editingRutinaId){
  rutinaEditorId = editingRutinaId || null;
  rutinaEditorDias = (prefill && prefill.dias && prefill.dias.length)
    ? prefill.dias.map(d => ({ nombre: d.nombre, ejercicios: d.ejercicios.map(ex => ({...ex})) }))
    : [{ nombre: 'Día 1', ejercicios: [{ nombre:'', series_objetivo:'', reps_objetivo:'', peso_objetivo:'', nota:'', descanso_seg:'', tipo_serie_objetivo:'', lado_objetivo:'' }] }];

  const titulo = rutinaEditorId ? 'Editar rutina' : (prefill ? 'Duplicar rutina' : 'Nueva rutina');
  const subtitulo = rutinaEditorId
    ? 'Estás editando la rutina activa del alumno: los cambios se guardan sobre esta misma rutina.'
    : 'Esta va a quedar como la rutina activa del alumno. Puedes armar hasta 5 días distintos (ej: Empuje, Tracción, Piernas).';

  root().innerHTML = `
    <div class="header-actions">
      <div>
        <h1 style="font-size:20px;">${titulo} — ${escapeHtml(alumno.nombre)}</h1>
        <div class="sub" style="margin-bottom:0;">${subtitulo}</div>
      </div>
      <button class="switch-user" id="btn-cancelar-rutina">Cancelar</button>
    </div>

    <div class="card">
      <label>Nombre del programa</label>
      <input type="text" id="rutina-nombre" placeholder="Ej: Hipertrofia — Fase 1" value="${escapeHtml(prefill ? prefill.nombre : '')}">
      <label>Objetivo (opcional)</label>
      <input type="text" id="rutina-objetivo" placeholder="Ej: Hipertrofia tren superior" value="${escapeHtml(prefill ? prefill.objetivo : '')}">
    </div>

    <div id="rutina-dias-holder"></div>
    <button class="btn-ghost" id="btn-agregar-dia">+ Agregar otro día</button>
    <button class="btn" id="btn-guardar-rutina" style="margin-top:16px;">${rutinaEditorId ? 'Guardar cambios' : 'Guardar rutina'}</button>
  `;
  document.getElementById('btn-cancelar-rutina').onclick = () => renderCoachAlumnoDetail(alumno.id);
  document.getElementById('btn-agregar-dia').onclick = () => {
    if(rutinaEditorDias.length >= 5){ showToast('Máximo 5 días por programa'); return; }
    rutinaEditorDias.push({ nombre: `Día ${rutinaEditorDias.length + 1}`, ejercicios: [{ nombre:'', series_objetivo:'', reps_objetivo:'', peso_objetivo:'', nota:'', descanso_seg:'', tipo_serie_objetivo:'', lado_objetivo:'' }] });
    renderRutinaDiasEditor();
  };
  document.getElementById('btn-guardar-rutina').onclick = () => guardarRutina(alumno);
  renderRutinaDiasEditor();
}

function renderRutinaDiasEditor(){
  const holder = document.getElementById('rutina-dias-holder');
  holder.innerHTML = rutinaEditorDias.map((dia, d) => `
    <div class="card">
      <div class="row-flex" style="margin-bottom:10px;">
        <input type="text" value="${escapeHtml(dia.nombre)}" style="margin-bottom:0; font-family:'Oswald'; font-weight:600;" oninput="rutinaEditorDias[${d}].nombre=this.value" placeholder="Ej: Día 1 — Empuje">
        ${rutinaEditorDias.length > 1 ? `<button type="button" class="btn-sm" onclick="quitarDiaRutina(${d})" style="margin-left:8px; white-space:nowrap;">Quitar día</button>` : ''}
      </div>
      <div id="rutina-dia-ex-${d}"></div>
      <button type="button" class="btn-ghost" onclick="agregarEjercicioADia(${d})">+ Agregar ejercicio</button>
    </div>
  `).join('');

  rutinaEditorDias.forEach((dia, d) => {
    document.getElementById(`rutina-dia-ex-${d}`).innerHTML = dia.ejercicios.map((row, e) => `
      <div class="rutina-ex-card">
        <div class="rutina-ex-top">
          <input type="text" placeholder="Nombre del ejercicio" value="${escapeHtml(row.nombre)}" oninput="rutinaEditorDias[${d}].ejercicios[${e}].nombre=this.value">
          <button type="button" class="remove-x" onclick="quitarEjercicioDeDia(${d},${e})">✕</button>
        </div>
        <div class="rutina-ex-meta">
          <div><label>Series</label><input type="number" value="${escapeHtml(row.series_objetivo)}" oninput="rutinaEditorDias[${d}].ejercicios[${e}].series_objetivo=this.value"></div>
          <div><label>Reps</label><input type="text" value="${escapeHtml(row.reps_objetivo)}" oninput="rutinaEditorDias[${d}].ejercicios[${e}].reps_objetivo=this.value"></div>
          <div><label>Peso</label><input type="text" placeholder="Ej: 40 kg" value="${escapeHtml(row.peso_objetivo)}" oninput="rutinaEditorDias[${d}].ejercicios[${e}].peso_objetivo=this.value"></div>
        </div>
        <div class="rutina-ex-nota-row">
          <label>Nota técnica (opcional)</label>
          <input type="text" placeholder="Ej: última serie al fallo, drop set, rest-pause..." value="${escapeHtml(row.nota)}" oninput="rutinaEditorDias[${d}].ejercicios[${e}].nota=this.value">
        </div>
        <div class="rutina-ex-tipolado-row">
          <div>${selectTipoSerieHtml(`rutina-tiposerie-${d}-${e}`, row.tipo_serie_objetivo, `rutinaEditorDias[${d}].ejercicios[${e}].tipo_serie_objetivo=this.value`)}</div>
          <div>${selectLadoHtml(`rutina-lado-${d}-${e}`, row.lado_objetivo, `rutinaEditorDias[${d}].ejercicios[${e}].lado_objetivo=this.value`)}</div>
        </div>
      </div>
    `).join('');
  });
}

function agregarEjercicioADia(d){
  rutinaEditorDias[d].ejercicios.push({ nombre:'', series_objetivo:'', reps_objetivo:'', peso_objetivo:'', nota:'', descanso_seg:'', tipo_serie_objetivo:'', lado_objetivo:'' });
  renderRutinaDiasEditor();
}

function quitarEjercicioDeDia(d, e){
  rutinaEditorDias[d].ejercicios.splice(e, 1);
  if(!rutinaEditorDias[d].ejercicios.length) rutinaEditorDias[d].ejercicios.push({ nombre:'', series_objetivo:'', reps_objetivo:'', peso_objetivo:'', nota:'', descanso_seg:'', tipo_serie_objetivo:'', lado_objetivo:'' });
  renderRutinaDiasEditor();
}

function quitarDiaRutina(d){
  rutinaEditorDias.splice(d, 1);
  renderRutinaDiasEditor();
}

async function guardarRutina(alumno){
  const nombre = document.getElementById('rutina-nombre').value.trim();
  const objetivo = document.getElementById('rutina-objetivo').value.trim();

  const filas = [];
  rutinaEditorDias.forEach((dia, di) => {
    const nombreDia = (dia.nombre || '').trim() || `Día ${di+1}`;
    dia.ejercicios.filter(r => r.nombre.trim()).forEach((r, ei) => {
      filas.push({
        nombre: r.nombre.trim(),
        series_objetivo: r.series_objetivo ? Number(r.series_objetivo) : null,
        reps_objetivo: r.reps_objetivo || null,
        peso_objetivo: (r.peso_objetivo || '').trim() || null,
        nota: (r.nota || '').trim() || null,
        descanso_seg: r.descanso_seg ? Number(r.descanso_seg) : null,
        tipo_serie_objetivo: (r.tipo_serie_objetivo || '').trim() || null,
        lado_objetivo: (r.lado_objetivo || '').trim() || null,
        dia_nombre: nombreDia,
        dia_orden: di,
        orden: ei
      });
    });
  });

  if(!nombre || !filas.length){ showToast('Ponle un nombre al programa y al menos un ejercicio en algún día'); return; }

  const btn = document.getElementById('btn-guardar-rutina');
  btn.disabled = true; btn.textContent = 'Guardando...';

  if(rutinaEditorId){
    const { error: errUpd } = await sb.from('rutinas')
      .update({ nombre, objetivo: objetivo || null })
      .eq('id', rutinaEditorId);
    if(errUpd){ showToast('No se pudo actualizar la rutina'); btn.disabled=false; btn.textContent='Guardar cambios'; return; }

    await sb.from('rutina_ejercicios').delete().eq('rutina_id', rutinaEditorId);
    const { error: errIns } = await sb.from('rutina_ejercicios').insert(filas.map(f => ({ ...f, rutina_id: rutinaEditorId })));
    if(errIns){ showToast('No se pudieron guardar los ejercicios'); btn.disabled=false; btn.textContent='Guardar cambios'; return; }

    showToast('¡Rutina actualizada!');
    rutinaEditorId = null;
    renderCoachAlumnoDetail(alumno.id);
    return;
  }

  await sb.from('rutinas').update({ activa: false }).eq('alumno_id', alumno.id).eq('activa', true);

  const { data: rutina, error } = await sb.from('rutinas').insert({
    alumno_id: alumno.id, nombre, objetivo: objetivo || null, activa: true, fecha: todayStr()
  }).select().single();

  if(error){ showToast('No se pudo crear la rutina'); btn.disabled=false; btn.textContent='Guardar rutina'; return; }

  await sb.from('rutina_ejercicios').insert(filas.map(f => ({ ...f, rutina_id: rutina.id })));

  showToast('¡Rutina guardada!');
  renderCoachAlumnoDetail(alumno.id);
}

// ---------- INSTALAR EN IPHONE (banner PWA para Safari) ----------
function esIOSSafariSinInstalar(){
  if(window.navigator.standalone === true) return false; // ya instalada
  if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return false;
  const ua = window.navigator.userAgent || '';
  const esIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  if(!esIOS) return false;
  const esOtroNavegador = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  if(esOtroNavegador) return false;
  return true;
}

function initIOSInstallBanner(){
  try{
    if(!esIOSSafariSinInstalar()) return;
    if(localStorage.getItem('ios_install_banner_cerrado') === '1') return;

    const wrap = document.querySelector('.wrap');
    const appRoot = document.getElementById('app-root');
    if(!wrap || !appRoot) return;

    const banner = document.createElement('div');
    banner.className = 'card ios-install-banner';
    banner.innerHTML = `
      <button type="button" class="ios-install-close" title="Cerrar">✕</button>
      <div class="ios-install-row">
        <div class="ios-install-icon">${ICONS.share}</div>
        <div>
          <div class="ios-install-title">Instalá STC app en tu iPhone</div>
          <div>Tocá <b>Compartir</b> abajo en Safari y elegí <b>"Añadir a pantalla de inicio"</b>. Así la abrís como una app, sin el navegador.</div>
        </div>
      </div>
    `;
    wrap.insertBefore(banner, appRoot);

    banner.querySelector('.ios-install-close').onclick = () => {
      localStorage.setItem('ios_install_banner_cerrado', '1');
      banner.remove();
    };
  } catch(e){
    // si algo falla acá, que no rompa el resto de la app
  }
}

// ---------- ARRANCA LA APP ----------
const _splashStart = Date.now();
boot().finally(() => {
  const wait = Math.max(0, 500 - (Date.now() - _splashStart));
  setTimeout(hideSplash, wait);
});
initIOSInstallBanner();
