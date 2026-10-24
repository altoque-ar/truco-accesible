// Mesas online del truco.
// El servidor tiene la partida de verdad (con todas las cartas). A cada jugador le
// manda solo lo que puede saber: sus cartas y las que ya se tiraron. Así nadie puede
// hacer trampa mirando las cartas de los otros, juegue desde la compu, un Android o un iPhone.
import { crearPartida, jugar, siguienteRonda, equipo, sortearNombres } from "../src/motor.js";
import { elegir, senasDe, SENAS } from "../src/rival.js";

export const TIEMPOS = { compu: 1300, mezcla: 4500, siguienteMano: 900, reemplazo: 30000, limpiar: 2 * 60 * 60 * 1000 };

const salas = new Map();
const azarToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const limpio = (t, n) => String(t || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);

function nuevoCodigo() {
  for (let i = 0; i < 1000; i++) {
    const c = String(1000 + Math.floor(Math.random() * 9000));
    if (!salas.has(c)) return c;
  }
  throw new Error("No hay mesas libres. Probá en un rato.");
}

export function cantidadSalas() { return salas.size; }
export function borrarTodo() { for (const s of salas.values()) cerrarSala(s); }

// ------------------------------------------------------------------ mensajes que llegan
export function mensaje(con, txt) {
  let m;
  try { m = JSON.parse(txt); } catch (e) { return; }
  try {
    if (m.t === "crear") return crear(con, m);
    if (m.t === "unirse") return unirse(con, m);
    if (m.t === "volver") return volver(con, m);
    if (m.t === "hola") return;
    const j = con.jugador;
    if (!j) return error(con, "Primero entrá a una mesa.");
    const s = j.sala;
    s.ultimo = Date.now();
    if (m.t === "empezar") return empezar(s, j);
    if (m.t === "equipo") return cambiarEquipo(s, j);
    if (m.t === "accion") return accion(s, j, m.a);
    if (m.t === "sena") return sena(s, j, m.k);
    if (m.t === "otra") return otra(s, j);
    if (m.t === "salir") return salir(s, j);
  } catch (e) { error(con, e.message || "Algo salió mal."); }
}

export function desconectado(con) {
  const j = con.jugador;
  if (!j || j.con !== con) return;
  j.con = null;
  const s = j.sala;
  if (s.estado === "espera") {
    // En la sala de espera, si se va, le guardo el lugar un rato por si vuelve.
    j.reloj = setTimeout(() => { if (!j.con) { quitar(s, j); } }, TIEMPOS.reemplazo);
    avisarSala(s);
    return;
  }
  avisar(s, `${j.nombre} se desconectó.`, j);
  j.reloj = setTimeout(() => {
    if (j.con || !s.partida) return;
    j.reemplazo = true;
    j.reemplazoNombre = j.reemplazoNombre || nombreCasa(s);
    avisar(s, `${j.reemplazoNombre} juega por ${j.nombre} hasta que vuelva.`, j);
    avisarSala(s);
    mover(s);
  }, TIEMPOS.reemplazo);
  avisarSala(s);
}

// ------------------------------------------------------------------ sala de espera
function crear(con, m) {
  if (con.jugador) salirSilencioso(con.jugador);
  const cfg = m.cfg || {};
  const jugadores = [2, 4].includes(Number(cfg.jugadores)) ? Number(cfg.jugadores) : 2;
  const s = {
    codigo: nuevoCodigo(), estado: "espera", ultimo: Date.now(),
    cfg: { jugadores, puntos: Number(cfg.puntos) === 15 ? 15 : 30, flor: !!cfg.flor },
    asientos: Array(jugadores).fill(null), partida: null, relojes: new Set(), senas: [], host: null
  };
  salas.set(s.codigo, s);
  const j = nuevoJugador(s, con, m.nombre, 0);
  s.host = j;
  s.limpiador = setInterval(() => { if (Date.now() - s.ultimo > TIEMPOS.limpiar || !s.asientos.some((x) => x && x.humano && (x.con || !x.fuera))) cerrarSala(s); }, 60000);
  avisarSala(s);
}

function unirse(con, m) {
  const codigo = limpio(m.sala, 8).replace(/\D/g, "");
  const s = salas.get(codigo);
  if (!s) return error(con, `No encontré la mesa ${codigo.split("").join(" ") || ""}. Revisá el código.`);
  if (con.jugador && con.jugador.sala === s) return avisarSala(s);
  if (con.jugador) salirSilencioso(con.jugador);
  if (s.estado !== "espera") return error(con, "Esa mesa ya empezó a jugar.");
  const libre = s.asientos.findIndex((x) => !x);
  if (libre < 0) return error(con, "Esa mesa está completa.");
  const j = nuevoJugador(s, con, m.nombre, libre);
  avisar(s, `Entró ${j.nombre}.`, j);
  if (!s.asientos.includes(null)) avisar(s, "La mesa está completa.", null, true);
  avisarSala(s);
}

function volver(con, m) {
  const s = salas.get(limpio(m.sala, 8));
  const j = s && s.asientos.find((x) => x && x.humano && x.token === m.token);
  if (!j || j.fuera) return con.enviar({ t: "perdida", texto: "Esa mesa ya no existe." });
  if (j.con && j.con !== con) { j.con.jugador = null; try { j.con.cerrar(); } catch (e) {} }
  clearTimeout(j.reloj);
  j.con = con; con.jugador = j;
  const estabaReemplazado = j.reemplazo;
  j.reemplazo = false;
  if (s.partida) {
    avisar(s, `${j.nombre} volvió.`, j);
    enviarJuego(s, j, [], true);
    if (estabaReemplazado) mover(s);
  }
  avisarSala(s);
}

function nuevoJugador(s, con, nombre, asiento) {
  let n = limpio(nombre, 20) || "Jugador " + (asiento + 1);
  const usados = s.asientos.filter(Boolean).map((x) => x.nombre.toLowerCase());
  let base = n, k = 2;
  while (usados.includes(n.toLowerCase())) n = base + " " + k++;
  const j = { sala: s, con, nombre: n, asiento, token: azarToken(), humano: true, reemplazo: false, reloj: null };
  con.jugador = j;
  s.asientos[asiento] = j;
  return j;
}

function cambiarEquipo(s, j) {
  if (s.estado !== "espera") return error(j.con, "Ya empezó la partida.");
  if (s.cfg.jugadores !== 4) return error(j.con, "De a 2 cada uno juega solo.");
  const libre = s.asientos.findIndex((x, i) => !x && i % 2 !== j.asiento % 2);
  if (libre < 0) return error(j.con, "No hay lugar libre en el otro equipo.");
  s.asientos[j.asiento] = null; s.asientos[libre] = j; j.asiento = libre;
  avisarSala(s);
}

function quitar(s, j) {
  clearTimeout(j.reloj);
  if (s.asientos[j.asiento] === j) s.asientos[j.asiento] = null;
  if (j.con) j.con.jugador = null;
  if (s.host === j) {
    s.host = s.asientos.find((x) => x && x.humano) || null;
    if (!s.host) return cerrarSala(s);
  }
  avisar(s, `${j.nombre} se fue de la mesa.`, j);
  avisarSala(s);
}

// Un nombre de la casa que no esté ya en la mesa (para el que juega por alguien que se fue).
function nombreCasa(s) {
  const usados = s.asientos.filter(Boolean).flatMap((x) => [x.nombre, x.reemplazoNombre].filter(Boolean));
  return sortearNombres(1, usados)[0] || "Uno de la casa";
}
function salirSilencioso(j) {
  const s = j.sala;
  if (s.estado === "espera") return quitar(s, j);
  j.fuera = true; j.reemplazo = true; clearTimeout(j.reloj);
  if (j.con) j.con.jugador = null;
  j.con = null;
  j.reemplazoNombre = j.reemplazoNombre || nombreCasa(s);
  avisar(s, `${j.nombre} se fue. ${j.reemplazoNombre} juega por ${j.nombre}.`, j);
  if (!s.asientos.some((x) => x && x.humano && !x.fuera)) return cerrarSala(s);
  if (s.host === j) s.host = s.asientos.find((x) => x && x.humano && !x.fuera);
  avisarSala(s); mover(s);
}
function salir(s, j) { const con = j.con; salirSilencioso(j); if (con) con.enviar({ t: "afuera" }); }

function cerrarSala(s) {
  for (const r of s.relojes) clearTimeout(r);
  clearInterval(s.limpiador);
  s.asientos.forEach((j) => { if (j && j.humano) { clearTimeout(j.reloj); if (j.con) j.con.jugador = null; } });
  salas.delete(s.codigo);
}

// ------------------------------------------------------------------ la partida
function empezar(s, j) {
  if (s.host !== j) return error(j.con, "La partida la empieza el que creó la mesa.");
  if (s.estado === "jugando") return;
  // Los lugares vacíos los ocupan los de la casa, con nombres sorteados.
  const libres = s.asientos.filter((x) => !x).length;
  const nuevos = sortearNombres(libres, s.asientos.filter(Boolean).map((x) => x.nombre));
  s.asientos = s.asientos.map((x, i) => x || { sala: s, nombre: nuevos.shift() || "Jugador " + (i + 1), asiento: i, humano: false });
  s.estado = "jugando";
  s.partida = crearPartida({ ...s.cfg, nombres: s.asientos.map((x) => x.nombre) });
  s.mezclaHasta = Date.now() + TIEMPOS.mezcla; // mientras suena la mezcla nadie juega
  s.senas = Array.from({ length: s.cfg.jugadores }, () => []);
  avisarSala(s);
  difundir(s, s.partida.eventos.slice(), true);
  repartirSenas(s);
  mover(s);
}

function otra(s, j) {
  if (s.host !== j) return error(j.con, "La revancha la arranca el que creó la mesa.");
  if (!s.partida || s.partida.ganador == null) return;
  s.estado = "espera";
  // Los que se fueron dejan el lugar libre; la compu se va de la mesa.
  s.asientos = s.asientos.map((x) => x && x.humano && !x.fuera ? x : null);
  s.partida = null;
  avisar(s, "Revancha: misma mesa, mismo código.", null, true);
  avisarSala(s);
}

const humanoActivo = (j) => j && j.humano && !j.reemplazo;
const actua = (st) => st.ganador != null || st.ronda.terminada ? null : (st.ronda.pregunta ? st.ronda.pregunta.a : st.ronda.turno);

function accion(s, j, a) {
  const st = s.partida;
  if (!st || s.estado !== "jugando") return error(j.con, "La partida no empezó.");
  if (!a || typeof a.tipo !== "string") return;
  if (Date.now() < (s.mezclaHasta || 0)) return error(j.con, "Esperá, están mezclando.");
  if (a.tipo === "jugar" && a.carta) a = { tipo: "jugar", carta: { n: Number(a.carta.n), p: String(a.carta.p) } };
  let evs;
  try { evs = jugar(st, j.asiento, a); }
  catch (e) { return error(j.con, e.message); }
  difundir(s, evs);
  mover(s);
}

// Hace jugar a la compu cuando le toca, y reparte la próxima mano sola a los 3 segundos.
function mover(s) {
  const st = s.partida;
  if (!st || s.pendiente) return;
  if (st.ganador != null) { s.estado = "fin"; avisarSala(s); return; }
  if (st.ronda.terminada) {
    s.pendiente = reloj(s, () => {
      s.pendiente = null;
      if (s.partida !== st || st.ganador != null) return;
      siguienteRonda(st);
      s.mezclaHasta = Date.now() + TIEMPOS.mezcla;
      difundir(s, st.eventos.slice(-1));
      repartirSenas(s);
      mover(s);
    }, TIEMPOS.siguienteMano);
    return;
  }
  const p = actua(st);
  const quien = s.asientos[p];
  if (humanoActivo(quien)) return;
  s.pendiente = reloj(s, () => {
    s.pendiente = null;
    if (s.partida !== st || actua(st) !== p) return mover(s);
    const comp = s.asientos[(p + 2) % st.cfg.jugadores];
    const senas = st.cfg.jugadores !== 4 ? null : (comp && comp.humano && !comp.reemplazo ? s.senas[comp.asiento] : senasDe(st.ronda.cartas[(p + 2) % 4], st.cfg.flor));
    const a = elegir(st, p, { senas });
    if (a) difundir(s, jugar(st, p, a));
    mover(s);
  }, Math.max(TIEMPOS.compu, (s.mezclaHasta || 0) - Date.now() + TIEMPOS.compu));
}

function reloj(s, fn, ms) {
  const r = setTimeout(() => { s.relojes.delete(r); try { fn(); } catch (e) { console.error(e); } }, ms);
  s.relojes.add(r);
  return r;
}

// Señas: de a 4, cada uno le puede hacer señas a su compañero.
function repartirSenas(s) {
  const st = s.partida;
  s.senas = Array.from({ length: st.cfg.jugadores }, () => []);
  if (st.cfg.jugadores !== 4) return;
  s.asientos.forEach((j) => {
    if (!j.humano) return;
    const comp = s.asientos[(j.asiento + 2) % 4];
    // Si el compañero es la compu, ya le avisa sus señas al repartir.
    if (!comp.humano) enviarA(j, { t: "senas", de: comp.nombre, lista: senasDe(st.ronda.cartas[comp.asiento], st.cfg.flor) });
  });
}
function sena(s, j, k) {
  const st = s.partida;
  if (!st || st.cfg.jugadores !== 4 || st.ronda.terminada) return;
  if (!(k in SENAS)) return;
  const lista = s.senas[j.asiento];
  if (k === "nada") lista.splice(0, lista.length, "nada");
  else { const sin = lista.filter((x) => x !== "nada" && x !== k); lista.splice(0, lista.length, ...sin, k); }
  const comp = s.asientos[(j.asiento + 2) % 4];
  if (comp.humano) enviarA(comp, { t: "sena", de: j.nombre, k });
}

// ------------------------------------------------------------------ lo que se manda
// Lo que puede ver el jugador p: sus cartas y las que ya se tiraron. Nada más.
export function vista(st, p) {
  const r = st.ronda;
  const ronda = { ...r };
  ronda.cartas = r.cartas.map((c, q) => q === p ? c : r.jugadas[q]);
  if (r.envido && r.envido.resultado) ronda.envido = { ...r.envido };
  return { cfg: st.cfg, nombres: st.nombres, puntos: st.puntos, mano: st.mano, ganador: st.ganador, mano_n: st.mano_n, ronda };
}

function difundir(s, evs, todo) {
  s.asientos.forEach((j) => { if (j.humano && j.con) enviarJuego(s, j, evs, todo); });
}
function enviarJuego(s, j, evs, inicio) {
  enviarA(j, { t: "juego", yo: j.asiento, vista: vista(s.partida, j.asiento), evs, inicio: !!inicio });
}
function avisarSala(s) {
  s.asientos.forEach((j) => {
    if (!j || !j.humano || !j.con) return;
    enviarA(j, {
      t: "sala", sala: s.codigo, token: j.token, yo: j.asiento, host: s.host === j, hostNombre: s.host ? s.host.nombre : null, estado: s.estado, cfg: s.cfg,
      asientos: s.asientos.map((x) => x ? { nombre: x.nombre, compu: !x.humano || x.reemplazo, reemplazo: x.humano && x.reemplazo ? x.reemplazoNombre || null : null, conectado: !x.humano || !!x.con, fuera: !!x.fuera } : null)
    });
  });
}
function avisar(s, texto, menos, todos) {
  s.asientos.forEach((j) => { if (j && j.humano && j.con && (todos || j !== menos)) enviarA(j, { t: "aviso", texto }); });
}
function enviarA(j, m) { if (j && j.con) j.con.enviar(m); }
function error(con, texto) { if (con) con.enviar({ t: "error", texto }); }
