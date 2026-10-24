// Motor del truco argentino.
// Sin pantalla ni sonido: solo las reglas. Lo usan la mesa (la página), el rival
// de la computadora y, más adelante, el servidor para jugar online.
//
// Pensado para 2, 4 y 6 jugadores (equipos alternados en la mesa: jugador 0 y 2
// y 4 son el equipo 0; 1, 3 y 5 el equipo 1). El "pica pica" de 6 queda para
// una versión futura.

export const PALOS = ["espada", "basto", "oro", "copa"];
const PALOS_PLURAL = { espada: "espadas", basto: "bastos", oro: "oros", copa: "copas" };
const NUMEROS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const NOMBRE_NUM = { 1: "uno", 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco", 6: "seis", 7: "siete", 10: "sota", 11: "caballo", 12: "rey" };

// Jerarquía del truco: más alto, más fuerte.
export function jerarquia(c) {
  if (c.n === 1 && c.p === "espada") return 14;
  if (c.n === 1 && c.p === "basto") return 13;
  if (c.n === 7 && c.p === "espada") return 12;
  if (c.n === 7 && c.p === "oro") return 11;
  return { 3: 10, 2: 9, 1: 8, 12: 7, 11: 6, 10: 5, 7: 4, 6: 3, 5: 2, 4: 1 }[c.n];
}

export function nombreCarta(c) {
  if (c.n === 1 && c.p === "espada") return "ancho de espadas";
  if (c.n === 1 && c.p === "basto") return "ancho de bastos";
  return NOMBRE_NUM[c.n] + " de " + PALOS_PLURAL[c.p];
}

export function mazo() {
  var m = [];
  PALOS.forEach(function (p) { NUMEROS.forEach(function (n) { m.push({ n: n, p: p }); }); });
  return m;
}

// Valor de una carta para el envido: las figuras valen 0.
function valorEnvido(c) { return c.n >= 10 ? 0 : c.n; }

export function envidoDe(cartas) {
  var mejor = 0;
  for (var i = 0; i < cartas.length; i++) {
    mejor = Math.max(mejor, valorEnvido(cartas[i]));
    for (var j = i + 1; j < cartas.length; j++) {
      if (cartas[i].p === cartas[j].p) mejor = Math.max(mejor, 20 + valorEnvido(cartas[i]) + valorEnvido(cartas[j]));
    }
  }
  return mejor;
}
export function tieneFlor(cartas) { return cartas.length === 3 && cartas[0].p === cartas[1].p && cartas[1].p === cartas[2].p; }
export function florDe(cartas) { return 20 + cartas.reduce(function (s, c) { return s + valorEnvido(c); }, 0); }

// ---------------------------------------------------------------- partida
export const ENVIDOS = { envido: 2, real_envido: 3, falta_envido: 0 };
const TRUCOS = { truco: 2, retruco: 3, vale_cuatro: 4 };
const SIG_TRUCO = { 1: "truco", 2: "retruco", 3: "vale_cuatro" };

function azar(rng) { return rng || Math.random; }
function mezclar(a, rng) { var r = azar(rng); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

export function equipo(p) { return p % 2; }

export function crearPartida(opciones, rng) {
  var cfg = Object.assign({ jugadores: 2, puntos: 30, flor: false, nombres: null }, opciones || {});
  if ([2, 4, 6].indexOf(cfg.jugadores) < 0) throw new Error("Se juega de a 2, 4 o 6.");
  var nombres = cfg.nombres || Array.from({ length: cfg.jugadores }, function (_, i) { return "Jugador " + (i + 1); });
  var s = { cfg: cfg, nombres: nombres, puntos: [0, 0], mano: 0, ganador: null, mano_n: 0, rng: null, eventos: [] };
  Object.defineProperty(s, "rng", { value: rng || null, enumerable: false, writable: true });
  repartir(s);
  return s;
}

// La mano arranca: se reparten 3 cartas a cada uno.
export function repartir(s) {
  var m = mezclar(mazo(), s.rng), N = s.cfg.jugadores;
  s.mano_n++;
  s.ronda = {
    cartas: Array.from({ length: N }, function (_, i) { return m.slice(i * 3, i * 3 + 3); }),
    jugadas: Array.from({ length: N }, function () { return []; }),  // cartas que ya tiró cada uno
    bazas: [],                 // { jugadas: [{jugador, carta}], gano: equipo | -1 (parda), inicio }
    baza: { jugadas: [], inicio: s.mano },
    turno: s.mano,
    truco: { nivel: 1, dueno: null },            // dueno: equipo que puede subir la apuesta
    envido: { estado: "nada", cadena: [] },     // nada | cantado | terminado
    flor: { cantada: [], terminada: false },
    pregunta: null,                               // { tipo: "truco" | "envido", por: jugador, a: jugador, cadena / nivel }
    trucoEnEspera: null,                          // si se cantó envido estando el truco sin responder
    terminada: false, ganoRonda: null, puntosRonda: 0
  };
  var r = s.ronda;
  evento(s, { tipo: "reparto", mano: s.mano, numero: s.mano_n });
  return r;
}

function evento(s, e) { s.eventos.push(e); return e; }
function sumar(s, eq, pts, motivo) {
  if (s.ganador != null || pts <= 0) return;
  s.puntos[eq] = Math.min(s.cfg.puntos, s.puntos[eq] + pts);
  evento(s, { tipo: "puntos", equipo: eq, puntos: pts, motivo: motivo, total: s.puntos.slice() });
  if (s.puntos[eq] >= s.cfg.puntos) { s.ganador = eq; evento(s, { tipo: "fin_partida", ganador: eq, total: s.puntos.slice() }); }
}

function siguiente(s, p) { return (p + 1) % s.cfg.jugadores; }
// Primer jugador del otro equipo después de p (el que responde un canto).
function rivalSiguiente(s, p) { var q = siguiente(s, p); while (equipo(q) === equipo(p)) q = siguiente(s, q); return q; }
function enPrimera(s) { return s.ronda.bazas.length === 0; }
function yaJugoPrimera(s, p) { return s.ronda.jugadas[p].length > 0; }
function cartasEnMano(s, p) { var r = s.ronda, usadas = r.jugadas[p]; return r.cartas[p].filter(function (c) { return usadas.indexOf(c) < 0; }); }
export function manoDe(s, p) { return cartasEnMano(s, p); }

function faltaEnvido(s) { return s.cfg.puntos - Math.max(s.puntos[0], s.puntos[1]); }
function valorCadena(s, cadena, aceptada) {
  var c = aceptada ? cadena : cadena.slice(0, -1);
  if (aceptada && cadena[cadena.length - 1] === "falta_envido") return faltaEnvido(s);
  var v = c.reduce(function (t, x) { return t + (ENVIDOS[x] || 0); }, 0);
  return Math.max(1, v);
}
function siguientesEnvidos(cadena) {
  var ult = cadena[cadena.length - 1], nEnv = cadena.filter(function (x) { return x === "envido"; }).length;
  if (!ult) return ["envido", "real_envido", "falta_envido"];
  if (ult === "falta_envido") return [];
  if (ult === "real_envido") return ["falta_envido"];
  return nEnv >= 2 ? ["real_envido", "falta_envido"] : ["envido", "real_envido", "falta_envido"];
}

function envidoPermitido(s, p) {
  var r = s.ronda;
  // Se puede cantar mientras no termine la primera baza, aunque ya hayas tirado tu carta
  // (ej.: sos mano, tirás, y el otro te canta truco sin tirar: el envido va primero).
  if (!enPrimera(s) || r.envido.estado !== "nada") return false;
  if (s.cfg.flor && r.flor.cantada.length) return false;
  if (r.truco.nivel > 1) return false; // el truco ya fue aceptado
  return true;
}

// ---------------------------------------------------------------- qué puede hacer cada uno
export function acciones(s, p) {
  var r = s.ronda, out = [];
  if (s.ganador != null || r.terminada) return out;
  var q = r.pregunta;
  if (q) {
    if (q.a !== p) return out;
    if (q.tipo === "flor") { opcionesFlor(q).forEach(function (t) { out.push({ tipo: t }); }); return out; }
    out.push({ tipo: "quiero" }, { tipo: "no_quiero" });
    if (q.tipo === "envido") siguientesEnvidos(q.cadena).forEach(function (t) { out.push({ tipo: t }); });
    if (q.tipo === "truco") {
      if (q.nivel < 4) out.push({ tipo: SIG_TRUCO[q.nivel] });
      if (envidoPermitido(s, p) && !r.trucoEnEspera) ["envido", "real_envido", "falta_envido"].forEach(function (t) { out.push({ tipo: t }); });
      if (s.cfg.flor && enPrimera(s) && !yaJugoPrimera(s, p) && tieneFlor(r.cartas[p]) && r.flor.cantada.indexOf(p) < 0) out.push({ tipo: "flor" });
    }
    out.push({ tipo: "mazo" });
    return out;
  }
  if (r.turno !== p) return out;
  cartasEnMano(s, p).forEach(function (c) { out.push({ tipo: "jugar", carta: c }); });
  if (s.cfg.flor && enPrimera(s) && !yaJugoPrimera(s, p) && tieneFlor(r.cartas[p]) && r.flor.cantada.indexOf(p) < 0) out.push({ tipo: "flor" });
  if (envidoPermitido(s, p)) ["envido", "real_envido", "falta_envido"].forEach(function (t) { out.push({ tipo: t }); });
  if (r.truco.nivel < 4 && (r.truco.dueno == null || r.truco.dueno === equipo(p))) out.push({ tipo: SIG_TRUCO[r.truco.nivel] });
  out.push({ tipo: "mazo" });
  return out;
}

function vale(s, p, tipo) { return acciones(s, p).some(function (a) { return a.tipo === tipo; }); }

// ---------------------------------------------------------------- aplicar una acción
// Devuelve los eventos que produjo (para anunciarlos en pantalla y por voz).
export function jugar(s, p, accion) {
  var desde = s.eventos.length, r = s.ronda, t = accion.tipo;
  if (s.ganador != null) throw new Error("La partida terminó.");
  if (r.terminada) throw new Error("La mano terminó. Falta repartir.");
  if (t === "jugar") {
    var c = accion.carta;
    var en = cartasEnMano(s, p).find(function (x) { return x === c || (x.n === c.n && x.p === c.p); });
    if (!en || r.turno !== p || r.pregunta) throw new Error("No podés tirar esa carta ahora.");
    tirar(s, p, en);
  } else if (!vale(s, p, t)) {
    throw new Error("No podés hacer eso ahora.");
  } else if (r.pregunta && r.pregunta.tipo === "flor") {
    responderFlor(s, p, t);
  } else if (t === "mazo") {
    alMazo(s, p);
  } else if (t === "flor") {
    cantarFlor(s, p);
  } else if (ENVIDOS.hasOwnProperty(t)) {
    cantarEnvido(s, p, t);
  } else if (TRUCOS.hasOwnProperty(t)) {
    cantarTruco(s, p, t);
  } else if (t === "quiero" || t === "no_quiero") {
    responder(s, p, t === "quiero");
  }
  return s.eventos.slice(desde);
}

function tirar(s, p, c) {
  var r = s.ronda;
  // La flor ya no se canta sola: si el jugador se olvida de cantarla, la pierde.
  if (s.ganador != null || r.terminada || r.pregunta) return;
  r.jugadas[p].push(c);
  r.baza.jugadas.push({ jugador: p, carta: c });
  evento(s, { tipo: "carta", jugador: p, carta: c, nombre: nombreCarta(c) });
  if (r.baza.jugadas.length < s.cfg.jugadores) { r.turno = siguiente(s, p); return; }
  cerrarBaza(s);
}

function cerrarBaza(s) {
  var r = s.ronda, b = r.baza, mejor = -1, quienes = [];
  b.jugadas.forEach(function (j) {
    var v = jerarquia(j.carta);
    if (v > mejor) { mejor = v; quienes = [j]; } else if (v === mejor) quienes.push(j);
  });
  var equipos = quienes.map(function (j) { return equipo(j.jugador); }).filter(function (e, i, a) { return a.indexOf(e) === i; });
  b.gano = equipos.length > 1 ? -1 : equipos[0];
  b.ganador = equipos.length > 1 ? null : quienes[0].jugador;
  r.bazas.push(b);
  evento(s, { tipo: "baza", numero: r.bazas.length, gano: b.gano, jugador: b.ganador });
  var g = ganadorRonda(s);
  if (g != null) return terminarRonda(s, g, "bazas");
  var empieza = b.gano === -1 ? s.mano : b.ganador;
  r.baza = { jugadas: [], inicio: empieza };
  r.turno = empieza;
}

function ganadorRonda(s) {
  var b = s.ronda.bazas.map(function (x) { return x.gano; });
  if (b.length < 2) return null;
  var a = b[0], c = b[1];
  if (a !== -1 && a === c) return a;
  if (a === -1 && c !== -1) return c;
  if (a !== -1 && c === -1) return a;
  if (b.length < 3) return null;
  var d = b[2];
  if (d !== -1) return d;
  return a !== -1 ? a : equipo(s.mano);
}

function terminarRonda(s, eq, motivo, pts) {
  var r = s.ronda;
  if (r.terminada) return;
  r.terminada = true; r.ganoRonda = eq;
  var v = pts != null ? pts : r.truco.nivel;
  r.puntosRonda = v;
  evento(s, { tipo: "fin_ronda", equipo: eq, motivo: motivo, puntos: v });
  sumar(s, eq, v, "truco");
}

// Después de terminar una mano, se llama para repartir la siguiente.
export function siguienteRonda(s) {
  if (s.ganador != null) return null;
  if (!s.ronda.terminada) throw new Error("La mano no terminó.");
  s.mano = siguiente(s, s.mano);
  return repartir(s);
}

function alMazo(s, p) {
  var r = s.ronda, otro = 1 - equipo(p), pts = r.truco.nivel;
  // Si se va al mazo cuando le cantaron truco, cuenta como "no quiero".
  if (r.pregunta && r.pregunta.tipo === "truco") pts = r.pregunta.nivel - 1;
  if (r.pregunta && r.pregunta.tipo === "envido") { var q = r.pregunta; r.pregunta = null; sumar(s, equipo(q.por), valorCadena(s, q.cadena, false), "envido"); if (s.ganador != null) return; }
  if (r.trucoEnEspera) pts = r.trucoEnEspera.nivel - 1;
  evento(s, { tipo: "mazo", jugador: p });
  r.pregunta = null; r.trucoEnEspera = null;
  terminarRonda(s, otro, "mazo", Math.max(1, pts));
}

function cantarEnvido(s, p, t) {
  var r = s.ronda, q = r.pregunta;
  if (q && q.tipo === "truco") { r.trucoEnEspera = q; q = null; }
  var cadena = q && q.tipo === "envido" ? q.cadena.concat(t) : [t];
  r.envido.estado = "cantado";
  r.pregunta = { tipo: "envido", por: p, a: rivalSiguiente(s, p), cadena: cadena };
  evento(s, { tipo: "canto", jugador: p, canto: t });
}

function cantarTruco(s, p, t) {
  var r = s.ronda, q = r.pregunta;
  if (q && q.tipo === "truco") { r.truco.nivel = q.nivel; r.truco.dueno = equipo(p); evento(s, { tipo: "respuesta", jugador: p, quiero: true, de: "truco", nivel: q.nivel }); }
  r.pregunta = { tipo: "truco", por: p, a: rivalSiguiente(s, p), nivel: TRUCOS[t] };
  evento(s, { tipo: "canto", jugador: p, canto: t });
}

function responder(s, p, quiero) {
  var r = s.ronda, q = r.pregunta;
  r.pregunta = null;
  evento(s, { tipo: "respuesta", jugador: p, quiero: quiero, de: q.tipo });
  if (q.tipo === "truco") {
    if (!quiero) return terminarRonda(s, equipo(q.por), "no_quiso", q.nivel - 1);
    r.truco.nivel = q.nivel; r.truco.dueno = equipo(p);
    return;
  }
  // envido
  r.envido.estado = "terminado"; r.envido.cadena = q.cadena;
  if (!quiero) {
    sumar(s, equipo(q.por), valorCadena(s, q.cadena, false), "envido");
  } else {
    var res = compararEnvido(s);
    r.envido.resultado = res;
    evento(s, { tipo: "envido", tantos: res.tantos, gano: res.equipo, jugador: res.jugador });
    sumar(s, res.equipo, valorCadena(s, q.cadena, true), "envido");
  }
  if (s.ganador != null) return;
  if (r.trucoEnEspera) { r.pregunta = r.trucoEnEspera; r.trucoEnEspera = null; }
}

// Gana el tanto más alto; si empatan, el más cerca de la mano.
function compararEnvido(s) {
  var N = s.cfg.jugadores, tantos = [], mejor = null;
  for (var k = 0; k < N; k++) {
    var p = (s.mano + k) % N, v = envidoDe(s.ronda.cartas[p]);
    tantos.push({ jugador: p, tantos: v });
    if (!mejor || v > mejor.tantos) mejor = { jugador: p, tantos: v };
  }
  return { equipo: equipo(mejor.jugador), jugador: mejor.jugador, tantos: tantos };
}

// Flor: 3 puntos si el otro equipo no tiene flor.
// Si el otro equipo también tiene flor, le toca contestar:
//   "con flor me achico"   -> el que cantó flor suma 4.
//   "contraflor"           -> el que cantó flor contesta: quiero (la mejor flor suma 6),
//                             no quiero (el de la contraflor suma 4) o contraflor al resto.
//   "contraflor al resto"  -> quiero: la mejor flor se lleva lo que le falta al que va ganando
//                             (como la falta envido); no quiero: el que la cantó suma 4
//                             (6 si antes ya se había cantado contraflor).
export const FLORES = { contraflor: true, contraflor_resto: true, achico: true };
function cantarFlor(s, p) {
  var r = s.ronda, q = r.pregunta;
  r.flor.cantada.push(p);
  r.envido.estado = "terminado";
  evento(s, { tipo: "canto", jugador: p, canto: "flor" });
  if (q && q.tipo === "envido") { r.pregunta = null; q = null; }
  var N = s.cfg.jugadores, rivales = [];
  for (var k = 1; k < N; k++) { var j = (p + k) % N; if (equipo(j) !== equipo(p) && tieneFlor(r.cartas[j])) rivales.push(j); }
  if (!rivales.length) return sumar(s, equipo(p), 3, "flor");
  // El otro equipo también tiene flor: contesta el primero de ellos que tenga flor.
  if (q && q.tipo === "truco") r.trucoEnEspera = q;
  r.pregunta = { tipo: "flor", por: p, a: rivales[0], etapa: "flor", florDe: p };
}
function opcionesFlor(q) {
  if (q.etapa === "flor") return ["contraflor", "contraflor_resto", "achico"];
  if (q.etapa === "contraflor") return ["quiero", "no_quiero", "contraflor_resto"];
  return ["quiero", "no_quiero"];
}
function mejorFlor(s) {
  var r = s.ronda, N = s.cfg.jugadores, mejor = null;
  for (var k = 0; k < N; k++) { var j = (s.mano + k) % N; if (tieneFlor(r.cartas[j])) { var v = florDe(r.cartas[j]); if (!mejor || v > mejor.v) mejor = { j: j, v: v }; } }
  return mejor;
}
function responderFlor(s, p, t) {
  var r = s.ronda, q = r.pregunta;
  if (r.flor.cantada.indexOf(p) < 0) r.flor.cantada.push(p);
  if (t === "contraflor" || t === "contraflor_resto") {
    evento(s, { tipo: "canto", jugador: p, canto: t });
    r.pregunta = { tipo: "flor", por: p, a: q.por, etapa: t === "contraflor" ? "contraflor" : "resto", florDe: q.florDe, antes: q.etapa };
    return;
  }
  r.pregunta = null;
  if (t === "achico") {
    evento(s, { tipo: "canto", jugador: p, canto: "achico" });
    sumar(s, equipo(q.por), 4, "flor");
  } else if (t === "no_quiero") {
    evento(s, { tipo: "respuesta", jugador: p, quiero: false, de: "flor" });
    sumar(s, equipo(q.por), q.etapa === "resto" && q.antes === "contraflor" ? 6 : 4, "flor");
  } else {
    evento(s, { tipo: "respuesta", jugador: p, quiero: true, de: "flor" });
    var m = mejorFlor(s), pts = q.etapa === "resto" ? faltaEnvido(s) : 6;
    evento(s, { tipo: "flor", gano: equipo(m.j), jugador: m.j, tantos: m.v, contra: q.etapa });
    sumar(s, equipo(m.j), pts, "flor");
  }
  if (s.ganador != null) return;
  if (r.trucoEnEspera) { r.pregunta = r.trucoEnEspera; r.trucoEnEspera = null; }
}

// ---------------------------------------------------------------- textos para anunciar
export const NOMBRE_CANTO = {
  envido: "envido", real_envido: "real envido", falta_envido: "falta envido",
  truco: "truco", retruco: "quiero retruco", vale_cuatro: "quiero vale cuatro", flor: "flor",
  contraflor: "contraflor", contraflor_resto: "contraflor al resto", achico: "con flor me achico",
  quiero: "quiero", no_quiero: "no quiero", mazo: "me voy al mazo"
};
