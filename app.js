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
let rutinaEditorDias = [];   // bloques de día del editor de rutina (coach)
let rutinaEditorId = null;   // si se está editando una rutina existente en vez de crear una nueva
let progresoChart = null;

const root = () => document.getElementById('app-root');

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
  return `<span style="display:flex; align-items:center; gap:6px;"><b>${sxr}</b>${peso}</span>`;
}

// ---------- ARRANQUE ----------
async function boot(){
  const { data } = await sb.auth.getSession();
  session = data.session;
  if(!session){ profile = null; renderAuth(); return; }
  await loadProfile();
  if(!profile){ renderAuth(); return; }
  if(profile.role === 'coach') renderCoachHome();
  else renderAlumnoHome();
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
  if(profile.role === 'coach') renderCoachHome(); else renderAlumnoHome();
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
  const { data, error } = await sb.auth.signUp({
    email, password: pass, options: { data: { nombre } }
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
  if(profile && profile.role === 'coach') renderCoachHome(); else renderAlumnoHome();
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
  const hayEntrenamientoHoy = (sesiones || []).some(s => s.fecha === todayStr());

  root().innerHTML = `
    <div class="header-actions">
      <div>
        <h1 style="font-size:20px;">Hola, ${escapeHtml(profile.nombre.split(' ')[0])}</h1>
        <div class="sub" style="margin-bottom:0;">Tu registro de entrenamiento</div>
      </div>
      <button class="switch-user" id="btn-logout">Salir</button>
    </div>

    <div class="streak-row">
      <div class="stat-tile"><div class="num">${streak}</div><div class="label">semana${streak===1?'':'s'} seguidas</div></div>
      <div class="stat-tile"><div class="num">${conSeries.length}</div><div class="label">sesiones totales</div></div>
    </div>

    <button class="btn" id="btn-nueva-sesion" style="margin-bottom:16px;">${hayEntrenamientoHoy ? '+ Seguir con el entrenamiento de hoy' : '+ Nueva sesión de hoy'}</button>

    ${rutina ? `
      <button class="btn-toggle-rutina" id="btn-toggle-rutina">
        <span>📋 Rutina: ${escapeHtml(rutina.nombre)}</span>
        <span id="rutina-toggle-icon">Ver →</span>
      </button>
      <div class="card hidden" id="rutina-detail-card">
        <div class="row-flex" style="margin-bottom:6px;">
          <h2 style="margin:0;">${escapeHtml(rutina.nombre)}</h2>
          <button class="btn-sm" id="btn-pdf-rutina">Descargar PDF</button>
        </div>
        ${rutina.objetivo ? `<div class="sub" style="margin-bottom:12px;">${escapeHtml(rutina.objetivo)}</div>` : ''}
        ${activeRutinaDias.map(d => `
          <div class="dia-heading">${escapeHtml(d.nombre)}</div>
          ${d.ejercicios.map(ex => `
            <div class="set-line"><span>${escapeHtml(ex.nombre)}</span>${renderExMeta(ex)}</div>
          `).join('')}
        `).join('')}
      </div>
    ` : `<div class="card"><div class="empty" style="padding:16px;">Tu coach todavía no te ha asignado una rutina activa.</div></div>`}

    ${historialRutinas && historialRutinas.length ? `<button class="link-btn" id="btn-ver-mis-rutinas" style="margin-bottom:16px;">Ver rutinas anteriores (${historialRutinas.length}) →</button>` : ''}

    <button class="btn-toggle-rutina" id="btn-toggle-calendario">
      <span>📅 Calendario</span>
      <span id="calendario-toggle-icon">Ver →</span>
    </button>
    <div class="hidden" id="calendar-holder"></div>

    ${conSeries.length ? `
      <div class="chart-wrap">
        <h2>Progresión por ejercicio</h2>
        <select id="progreso-select" style="margin-bottom:10px;"></select>
        <canvas id="progreso-canvas"></canvas>
      </div>
    ` : ''}

    <h2>Historial de entrenamiento</h2>
    <div id="sesiones-list"></div>
  `;

  document.getElementById('btn-logout').onclick = handleLogout;
  document.getElementById('btn-nueva-sesion').onclick = () => iniciarNuevaSesion(rutina);
  if(rutina){
    document.getElementById('btn-pdf-rutina').onclick = () => descargarRutinaPDF(rutina, activeRutinaDias);
    const btnToggleRutina = document.getElementById('btn-toggle-rutina');
    const rutinaDetailCard = document.getElementById('rutina-detail-card');
    const rutinaToggleIcon = document.getElementById('rutina-toggle-icon');
    btnToggleRutina.onclick = () => {
      const abrir = rutinaDetailCard.classList.contains('hidden');
      rutinaDetailCard.classList.toggle('hidden', !abrir);
      rutinaToggleIcon.textContent = abrir ? 'Ocultar ▲' : 'Ver →';
    };
  }
  if(historialRutinas && historialRutinas.length){
    document.getElementById('btn-ver-mis-rutinas').onclick = () => renderHistorialRutinas(profile, renderAlumnoHome, false);
  }
  {
    const btnToggleCal = document.getElementById('btn-toggle-calendario');
    const calHolder = document.getElementById('calendar-holder');
    const calToggleIcon = document.getElementById('calendario-toggle-icon');
    btnToggleCal.onclick = () => {
      const abrir = calHolder.classList.contains('hidden');
      calHolder.classList.toggle('hidden', !abrir);
      calToggleIcon.textContent = abrir ? 'Ocultar ▲' : 'Ver →';
    };
  }

  renderCalendar('calendar-holder', fechas);
  renderSesionesList('sesiones-list', conSeries, false, renderAlumnoHome);

  if(conSeries.length) setupProgresoChart(conSeries);
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
  el.scrollIntoView({ behavior:'smooth', block:'center' });
  el.classList.add('highlight');
  setTimeout(()=> el.classList.remove('highlight'), 1600);
}

function renderSesionesList(holderId, sesiones, isCoachView, onDeleted){
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
            ${g.sets.map((set,i) => `<div class="set-line">S${i+1}: <b>${set.peso}kg</b> × <b>${set.reps}</b> reps ${set._isPR ? '<span class="pill pr">🏆 PR</span>' : ''}</div>`).join('')}
          </div>
        `).join('')}
        ${s.nota_alumno ? `<div class="note-box"><div class="note-label">Nota del alumno</div>${escapeHtml(s.nota_alumno)}</div>` : ''}
        ${s.foto_url ? `<img class="session-photo" src="${s.foto_url}" alt="Foto de la sesión">` : ''}
        ${isCoachView ? `
          <div class="note-box" style="margin-top:12px;">
            <div class="note-label">Nota del coach</div>
            <textarea id="nota-coach-${s.id}" placeholder="Escribe una observación para esta sesión...">${escapeHtml(s.nota_coach || '')}</textarea>
            <button class="btn-sm" onclick="guardarNotaCoach('${s.id}')">Guardar nota</button>
          </div>
        ` : (s.nota_coach ? `<div class="note-box"><div class="note-label">Nota del coach</div>${escapeHtml(s.nota_coach)}</div>` : '')}
        <button class="btn-sm btn-eliminar-sesion" data-id="${s.id}" style="margin-top:12px;">Eliminar sesión</button>
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
          borderColor: '#3D6EE0',
          backgroundColor: 'rgba(61,110,224,0.15)',
          tension: 0.25,
          fill: true,
          pointBackgroundColor: '#3D6EE0'
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
        <span>📅 ${activeSesionDia ? 'Día: ' + escapeHtml(activeSesionDia) : '¿Qué día de tu programa entrenas hoy?'}</span>
        <span id="dia-toggle-icon">${activeSesionDia ? 'Cambiar' : 'Elegir →'}</span>
      </button>
      <div class="hidden" id="dia-picker-holder" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">
        ${activeRutinaDias.map(d => `<button type="button" class="dia-btn ${activeSesionDia === d.nombre ? 'selected' : ''}" onclick="seleccionarDiaSesion('${escapeHtml(d.nombre).replace(/'/g,"\\'")}')">${escapeHtml(d.nombre)}</button>`).join('')}
      </div>
    ` : ''}

    ${ejerciciosSugeridos.length ? `
      <div class="sub" style="margin-bottom:8px;">Ejercicios de ${escapeHtml(activeSesionDia)} (toca para agregarlo):</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">
        ${ejerciciosSugeridos.map(ex => `<button type="button" class="btn-sm" onclick="agregarBloqueEjercicio('${escapeHtml(ex.nombre).replace(/'/g,"\\'")}')">${escapeHtml(ex.nombre)}</button>`).join('')}
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
      <button class="btn" id="btn-finalizar-sesion">✓ Finalizar entrenamiento de hoy</button>
    </div>
  `;
  document.getElementById('btn-cancelar-sesion').onclick = cancelarSesion;
  document.getElementById('input-fecha-sesion').onchange = actualizarFechaSesion;
  if(activeRutinaDias.length){
    const btnToggleDia = document.getElementById('btn-toggle-dia');
    const diaPickerHolder = document.getElementById('dia-picker-holder');
    const diaToggleIcon = document.getElementById('dia-toggle-icon');
    btnToggleDia.onclick = () => {
      const abrir = diaPickerHolder.classList.contains('hidden');
      diaPickerHolder.classList.toggle('hidden', !abrir);
      diaToggleIcon.textContent = abrir ? 'Ocultar ▲' : (activeSesionDia ? 'Cambiar' : 'Elegir →');
    };
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

  activeSesionExs.push({ nombre, sets: [] });
  renderDraftExercises();
}

async function actualizarFechaSesion(){
  const input = document.getElementById('input-fecha-sesion');
  const val = input.value;
  if(!val) return;

  const { data: choque } = await sb.from('sesiones')
    .select('id')
    .eq('alumno_id', profile.id)
    .eq('fecha', val)
    .neq('id', activeSesionId)
    .limit(1);

  if(choque && choque.length){
    showToast('Ya hay un entrenamiento guardado en esa fecha — cancela esta sesión y entra a ese día para seguir sumando ahí.');
    input.value = activeSesionFecha;
    return;
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

async function agregarSetABloque(idx){
  const grupo = activeSesionExs[idx];
  if(!grupo) return;
  const pesoEl = document.getElementById(`input-peso-${idx}`);
  const repsEl = document.getElementById(`input-reps-${idx}`);
  const peso = pesoEl ? pesoEl.value : '';
  const reps = repsEl ? repsEl.value : '';
  if(!reps){ showToast('Completa las repeticiones'); return; }

  const btn = document.getElementById(`btn-serie-${idx}`);
  if(btn) btn.disabled = true;
  const orden = activeSesionExs.reduce((acc,g)=>acc+g.sets.length,0);
  const { data, error } = await sb.from('sesion_series').insert({
    sesion_id: activeSesionId,
    ejercicio_nombre: grupo.nombre,
    peso: peso || 0,
    reps: reps,
    orden
  }).select().single();
  if(btn) btn.disabled = false;

  if(error){ showToast('No se pudo guardar la serie, intenta de nuevo'); return; }

  grupo.sets.push(data);
  const setsHolder = document.getElementById(`bloque-sets-${idx}`);
  if(setsHolder){
    setsHolder.innerHTML = grupo.sets.map((s,i) => `<div class="set-line">S${i+1}: <b>${s.reps}</b> × <b>${s.peso}kg</b></div>`).join('');
  }
  if(pesoEl) pesoEl.value = '';
  if(repsEl){ repsEl.value = ''; repsEl.focus(); }
  showToast('Serie guardada ✓');
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
        ${ex.sets.map((s,i)=>`<div class="set-line">S${i+1}: <b>${s.reps}</b> × <b>${s.peso}kg</b></div>`).join('')}
      </div>
      <div class="set-input-row" style="margin-top:8px;">
        <div><input type="number" id="input-reps-${idx}" placeholder="Reps" style="margin-bottom:0;"></div>
        <div><input type="number" id="input-peso-${idx}" placeholder="Peso kg" style="margin-bottom:0;"></div>
        <div><button type="button" class="btn-sm" id="btn-serie-${idx}" style="width:100%;" onclick="agregarSetABloque(${idx})">+ Serie</button></div>
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
    await sb.from('sesiones').update({ nota_alumno: nota || null, foto_url }).eq('id', activeSesionId);
    showToast('¡Sesión guardada!');
  }catch(e){
    showToast('Hubo un problema guardando algunos detalles, pero tus series ya quedaron guardadas.');
  }

  activeSesionId = null; activeSesionExs = []; activeSesionDia = null;
  renderAlumnoHome();
}

function descargarRutinaPDF(rutina, dias){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('UltraCarga', 14, 18);
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
      y += 8;
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
      <button class="switch-user" id="btn-volver-historial">← Volver</button>
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
      <div class="row-flex" style="margin-bottom:${permitirDuplicar ? '6px' : '0'};">
        <h2 style="margin:0;">${escapeHtml(r.nombre)}</h2>
        ${permitirDuplicar ? `
          <div style="display:flex; gap:6px;">
            <button class="btn-sm" data-dup-id="${r.id}">Usar como base</button>
            <button class="btn-sm" data-del-id="${r.id}">Eliminar</button>
          </div>
        ` : ''}
      </div>
      ${r.objetivo ? `<div class="sub" style="margin-bottom:6px;">${escapeHtml(r.objetivo)}</div>` : ''}
      <div class="sub" style="margin-bottom:10px;">Creada el ${formatDateShort(String(r.created_at).slice(0,10))}</div>
      ${dias.map(d => `
        <div class="dia-heading">${escapeHtml(d.nombre)}</div>
        ${d.ejercicios.map(ex => `
          <div class="set-line"><span>${escapeHtml(ex.nombre)}</span>${renderExMeta(ex)}</div>
        `).join('')}
      `).join('')}
    </div>
  `;
  }).join('');

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
      descanso_seg: ex.descanso_seg != null ? String(ex.descanso_seg) : ''
    }))
  }));
  renderRutinaEditor(alumno, { nombre: rutinaVieja.nombre, objetivo: rutinaVieja.objetivo || '', dias });
}

// ============================================================
// VISTA COACH
// ============================================================
async function renderCoachHome(){
  root().innerHTML = `<div class="loading">Cargando alumnos...</div>`;
  const { data: alumnos, error } = await sb.from('profiles').select('*').eq('role', 'alumno').order('nombre');
  if(error){ root().innerHTML = `<div class="error-banner">No se pudo cargar la lista de alumnos.</div>`; return; }

  const conUltima = await Promise.all((alumnos||[]).map(async a => {
    const { data } = await sb.from('sesiones').select('fecha').eq('alumno_id', a.id).order('fecha', { ascending:false }).limit(1);
    return { ...a, ultima: data && data[0] ? data[0].fecha : null };
  }));

  root().innerHTML = `
    <div class="header-actions">
      <div>
        <h1 style="font-size:20px;">Vista Coach</h1>
        <div class="sub" style="margin-bottom:0;">Selecciona un alumno para ver su registro</div>
      </div>
      <button class="switch-user" id="btn-logout">Salir</button>
    </div>
    <div class="card" style="font-size:12.5px; color:var(--chalk-dim);">
      Para que un alumno nuevo entre, compártele el link de la app: te va a pedir crear su cuenta con su correo la primera vez.
    </div>
    <div id="coach-alumnos-list"></div>
  `;
  document.getElementById('btn-logout').onclick = handleLogout;

  const listEl = document.getElementById('coach-alumnos-list');
  if(!conUltima.length){
    listEl.innerHTML = `<div class="empty">Aún no hay alumnos registrados.<br>Cuando alguien cree su cuenta, va a aparecer aquí.</div>`;
    return;
  }
  listEl.innerHTML = conUltima.map(a => `
    <div class="coach-list-item" onclick="renderCoachAlumnoDetail('${a.id}')">
      <div>
        <div class="coach-name">${escapeHtml(a.nombre)}</div>
        <div class="coach-meta">${a.ultima ? 'Última sesión: ' + formatDateShort(a.ultima) : 'Sin sesiones todavía'}</div>
      </div>
      <span class="pill">Ver →</span>
    </div>
  `).join('');
}

async function renderCoachAlumnoDetail(alumnoId){
  root().innerHTML = `<div class="loading">Cargando...</div>`;
  const [{ data: alumno }, { data: sesiones }, { data: rutina }, { data: historial }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', alumnoId).single(),
    sb.from('sesiones').select('*, sesion_series(*)').eq('alumno_id', alumnoId).order('fecha', { ascending:false }),
    sb.from('rutinas').select('*, rutina_ejercicios(*)').eq('alumno_id', alumnoId).eq('activa', true).maybeSingle(),
    sb.from('rutinas').select('id').eq('alumno_id', alumnoId).eq('activa', false)
  ]);

  const todasSesiones = markPRs(sesiones || []);
  const conSeries = todasSesiones.filter(s => (s.sesion_series||[]).length > 0);
  const diasRutina = (rutina && rutina.rutina_ejercicios) ? groupPorDia(rutina.rutina_ejercicios) : [];

  root().innerHTML = `
    <div class="header-actions">
      <div>
        <h1 style="font-size:20px;">${escapeHtml(alumno.nombre)}</h1>
        <div class="sub" style="margin-bottom:0;">Registro de entrenamiento</div>
      </div>
      <button class="switch-user" id="btn-volver">← Volver</button>
    </div>

    ${rutina ? `
      <button class="btn-toggle-rutina" id="btn-toggle-rutina">
        <span>📋 Rutina: ${escapeHtml(rutina.nombre)}</span>
        <span id="rutina-toggle-icon">Ver →</span>
      </button>
    ` : `
      <div class="card">
        <div class="row-flex" style="margin-bottom:0;">
          <h2 style="margin:0;">Sin rutina activa</h2>
          <button class="btn-sm" id="btn-nueva-rutina">+ Crear rutina</button>
        </div>
      </div>
    `}
    ${historial && historial.length ? `<button class="link-btn" id="btn-ver-historial-rutinas" style="margin-bottom:16px;">Ver rutinas anteriores (${historial.length}) →</button>` : ''}
    ${rutina ? `
      <div class="card hidden" id="rutina-detail-card">
        <div class="row-flex" style="margin-bottom:6px;">
          <h2 style="margin:0;">${escapeHtml(rutina.nombre)}</h2>
          <div style="display:flex; gap:6px;">
            <button class="btn-sm" id="btn-editar-rutina">Editar</button>
            <button class="btn-sm" id="btn-nueva-rutina">Crear nueva rutina</button>
          </div>
        </div>
        ${rutina.objetivo ? `<div class="sub" style="margin-bottom:8px;">${escapeHtml(rutina.objetivo)}</div>` : ''}
        ${diasRutina.map(d => `
          <div class="dia-heading">${escapeHtml(d.nombre)}</div>
          ${d.ejercicios.map(ex => `
            <div class="set-line"><span>${escapeHtml(ex.nombre)}</span>${renderExMeta(ex)}</div>
          `).join('')}
        `).join('')}
        <button class="btn-sm btn-eliminar-sesion" id="btn-eliminar-rutina" style="margin-top:12px;">Eliminar rutina</button>
      </div>
    ` : ''}

    <h2>Historial de sesiones</h2>
    <div id="sesiones-list"></div>
  `;
  document.getElementById('btn-volver').onclick = renderCoachHome;
  document.getElementById('btn-nueva-rutina').onclick = () => renderRutinaEditor(alumno);
  if(rutina){
    const btnToggleRutina = document.getElementById('btn-toggle-rutina');
    const rutinaDetailCard = document.getElementById('rutina-detail-card');
    const rutinaToggleIcon = document.getElementById('rutina-toggle-icon');
    btnToggleRutina.onclick = () => {
      const abrir = rutinaDetailCard.classList.contains('hidden');
      rutinaDetailCard.classList.toggle('hidden', !abrir);
      rutinaToggleIcon.textContent = abrir ? 'Ocultar ▲' : 'Ver →';
    };
  }
  if(rutina){
    document.getElementById('btn-editar-rutina').onclick = () => {
      const dias = diasRutina.map(d => ({
        nombre: d.nombre,
        ejercicios: d.ejercicios.map(ex => ({
          nombre: ex.nombre || '',
          series_objetivo: ex.series_objetivo != null ? String(ex.series_objetivo) : '',
          reps_objetivo: ex.reps_objetivo || '',
          peso_objetivo: ex.peso_objetivo || '',
          descanso_seg: ex.descanso_seg != null ? String(ex.descanso_seg) : ''
        }))
      }));
      renderRutinaEditor(alumno, { nombre: rutina.nombre, objetivo: rutina.objetivo || '', dias }, rutina.id);
    };
  }
  if(historial && historial.length){
    document.getElementById('btn-ver-historial-rutinas').onclick = () => renderHistorialRutinas(alumno, () => renderCoachAlumnoDetail(alumnoId), true);
  }
  if(rutina){
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
  renderSesionesList('sesiones-list', conSeries, true, () => renderCoachAlumnoDetail(alumnoId));
}

async function guardarNotaCoach(sesionId){
  const val = document.getElementById(`nota-coach-${sesionId}`).value.trim();
  const { error } = await sb.from('sesiones').update({ nota_coach: val || null }).eq('id', sesionId);
  if(error){ showToast('No se pudo guardar la nota'); return; }
  showToast('Nota guardada ✓');
}

function renderRutinaEditor(alumno, prefill, editingRutinaId){
  rutinaEditorId = editingRutinaId || null;
  rutinaEditorDias = (prefill && prefill.dias && prefill.dias.length)
    ? prefill.dias.map(d => ({ nombre: d.nombre, ejercicios: d.ejercicios.map(ex => ({...ex})) }))
    : [{ nombre: 'Día 1', ejercicios: [{ nombre:'', series_objetivo:'', reps_objetivo:'', peso_objetivo:'', descanso_seg:'' }] }];

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
    rutinaEditorDias.push({ nombre: `Día ${rutinaEditorDias.length + 1}`, ejercicios: [{ nombre:'', series_objetivo:'', reps_objetivo:'', peso_objetivo:'', descanso_seg:'' }] });
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
      </div>
    `).join('');
  });
}

function agregarEjercicioADia(d){
  rutinaEditorDias[d].ejercicios.push({ nombre:'', series_objetivo:'', reps_objetivo:'', peso_objetivo:'', descanso_seg:'' });
  renderRutinaDiasEditor();
}

function quitarEjercicioDeDia(d, e){
  rutinaEditorDias[d].ejercicios.splice(e, 1);
  if(!rutinaEditorDias[d].ejercicios.length) rutinaEditorDias[d].ejercicios.push({ nombre:'', series_objetivo:'', reps_objetivo:'', peso_objetivo:'', descanso_seg:'' });
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
        descanso_seg: r.descanso_seg ? Number(r.descanso_seg) : null,
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
    alumno_id: alumno.id, nombre, objetivo: objetivo || null, activa: true
  }).select().single();

  if(error){ showToast('No se pudo crear la rutina'); btn.disabled=false; btn.textContent='Guardar rutina'; return; }

  await sb.from('rutina_ejercicios').insert(filas.map(f => ({ ...f, rutina_id: rutina.id })));

  showToast('¡Rutina guardada!');
  renderCoachAlumnoDetail(alumno.id);
}

// ---------- ARRANCA LA APP ----------
boot();
