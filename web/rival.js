// Rival de la computadora: nivel experto, siempre.
//
// Para decidir imagina muchas veces qué cartas pueden tener los demás y juega la
// mano en su cabeza. Lo que ya se sabe se respeta siempre: las cartas tiradas, los
// tantos que se dijeron, la flor y las señas del compañero.
// Además "lee" al rival como lo haría un jugador con calle: si te pasó el envido
// probablemente tenés poco; si cantaste truco o real envido, más vale que tengas algo
// (aunque sabe que a veces se miente). Cada mano imaginada pesa según qué tan
// creíble es con lo que hiciste.
// Para tirar carta prueba cada una de sus cartas en muchas manos imaginadas y elige
// la que más veces gana. También miente, sobre todo si el rival ya mostró cartas flojas.
import { acciones, jerarquia, envidoDe, equipo, manoDe, tieneFlor, florDe, mazo, jugar, ENVIDOS } from "./motor.js";

function tiene(acc, t) { return acc.find(function (a) { return a.tipo === t; }); }

// ---------------------------------------------------------------- señas (juego de a 4)
// Las señas de siempre del truco. Cada una avisa una carta fuerte, buen envido, flor o nada.
export const SENAS = {
  ancho_espada: { carta: "el ancho de espadas", gesto: "levanta las cejas" },
  ancho_basto: { carta: "el ancho de bastos", gesto: "guiña un ojo" },
  siete_espada: { carta: "el siete de espadas", gesto: "tuerce la boca para la derecha" },
  siete_oro: { carta: "el siete de oros", gesto: "tuerce la boca para la izquierda" },
  tres: { carta: "un tres", gesto: "se muerde el labio" },
  dos: { carta: "un dos", gesto: "tira un besito" },
  envido: { carta: "buen envido", gesto: "inclina la cabeza" },
  flor: { carta: "flor", gesto: "infla los cachetes" },
  nada: { carta: "nada", gesto: "cierra los ojos" }
};
function senaDeCarta(c) {
  if (c.n === 1 && c.p === "espada") return "ancho_espada";
  if (c.n === 1 && c.p === "basto") return "ancho_basto";
  if (c.n === 7 && c.p === "espada") return "siete_espada";
  if (c.n === 7 && c.p === "oro") return "siete_oro";
  if (c.n === 3) return "tres";
  if (c.n === 2) return "dos";
  return null;
}
// Las señas que le hace un jugador a su compañero al ver sus cartas (como mucho 3).
export function senasDe(cartas, conFlor) {
  var out = cartas.slice().sort(function (a, b) { return jerarquia(b) - jerarquia(a); }).map(senaDeCarta).filter(Boolean).slice(0, 2);
  if (conFlor && tieneFlor(cartas)) out.push("flor");
  else if (envidoDe(cartas) >= 28) out.push("envido");
  return out.length ? out : ["nada"];
}
// ¿Esta mano es coherente con las señas que hizo su dueño?
function cumpleSenas(mano, senas) {
  if (!senas || !senas.length) return true;
  var resto = mano.map(senaDeCarta);
  for (var i = 0; i < senas.length; i++) {
    var k = senas[i];
    if (k === "envido") { if (envidoDe(mano) < 28) return false; continue; }
    if (k === "flor") { if (!tieneFlor(mano)) return false; continue; }
    if (k === "nada") { if (mano.some(senaDeCarta) || envidoDe(mano) >= 28) return false; continue; }
    var j = resto.indexOf(k); if (j < 0) return false; resto.splice(j, 1);
  }
  return true;
}

// ---------------------------------------------------------------- leer al rival
// Qué hizo cada jugador en esta mano (desde el último reparto).
var NIVEL_ENV = { envido: 1, real_envido: 2, falta_envido: 3 }, NIVEL_TRUCO = { truco: 1, retruco: 2, vale_cuatro: 3 };
function historia(s) {
  var N = s.cfg.jugadores, h = [], ev = s.eventos, i = ev.length - 1;
  for (var q = 0; q < N; q++) h.push({ envCanto: 0, envPaso: false, envNoQuiso: false, trucoCanto: 0, trucoQuiso: false, flor: false, tiro: false });
  while (i >= 0 && ev[i].tipo !== "reparto") i--;
  var envidoHubo = false, trucoQuerido = false;
  for (var j = i + 1; j < ev.length; j++) {
    var e = ev[j], x = h[e.jugador];
    if (e.tipo === "canto") {
      if (NIVEL_ENV[e.canto]) { envidoHubo = true; x.envCanto = Math.max(x.envCanto, NIVEL_ENV[e.canto]); }
      else if (NIVEL_TRUCO[e.canto]) x.trucoCanto = Math.max(x.trucoCanto, NIVEL_TRUCO[e.canto]);
      else if (e.canto === "flor" || e.canto === "contraflor" || e.canto === "contraflor_resto") { envidoHubo = true; x.flor = true; }
    } else if (e.tipo === "respuesta") {
      if (e.de === "envido" && !e.quiero) x.envNoQuiso = true;
      if (e.de === "truco" && e.quiero) { x.trucoQuiso = true; trucoQuerido = true; }
    } else if (e.tipo === "carta" && !x.tiro) {
      x.tiro = true;
      // Tiró su primera carta sin cantar envido pudiendo hacerlo: pasó el envido.
      if (!envidoHubo && !trucoQuerido) x.envPaso = true;
    }
  }
  return h;
}
function tramo(v, tabla) { for (var i = 0; i < tabla.length; i++) if (v >= tabla[i][0]) return tabla[i][1]; return tabla[tabla.length - 1][1]; }
var P_ENV_CANTO = [
  null,
  [[31, 1], [29, 0.85], [27, 0.6], [25, 0.3], [22, 0.13], [0, 0.07]],   // envido
  [[31, 1], [30, 0.8], [28, 0.45], [26, 0.18], [0, 0.05]],              // real envido
  [[32, 1], [31, 0.7], [29, 0.3], [0, 0.04]]                            // falta envido
];
var P_ENV_PASO = [[31, 0.12], [29, 0.3], [27, 0.55], [25, 0.8], [0, 1]];
var P_ENV_NO = [[30, 0.04], [28, 0.2], [26, 0.55], [0, 1]];
// Qué tan buena es una mano para el truco (0 = nada, 1 = muy buena).
function fuerza(m) {
  var j = m.map(jerarquia).sort(function (a, b) { return b - a; });
  return Math.max(0, Math.min(1, (j[0] + (j[1] || 0) - 12) / 14));
}
// ---------------------------------------------------------------- aprender cómo juega cada uno
// Mira toda la partida: cuántas veces cantó envido con pocos tantos (se ve cuando se quiere),
// cuántas veces cantó truco con cartas flojas (se ve en lo que tiró) y cuántas veces
// no quiso el truco. Así la compu se adapta al que miente mucho o al que se achica.
function habitos(s) {
  var N = s.cfg.jugadores, ev = s.eventos, H = [];
  for (var q = 0; q < N; q++) H.push({ envCant: 0, envMiente: 0, trCant: 0, trMiente: 0, leCantaron: 0, noQuiso: 0 });
  var ronda = null;
  function cerrar() {
    if (!ronda) return;
    for (var q = 0; q < N; q++) {
      var x = ronda[q];
      if (x.envido && x.tantos != null) { H[q].envCant++; if (x.tantos <= 24) H[q].envMiente++; }
      if (x.truco && x.cartas.length >= 2) { H[q].trCant++; if (fuerza(x.cartas) < 0.25) H[q].trMiente++; }
    }
  }
  for (var i = 0; i < ev.length; i++) {
    var e = ev[i];
    if (e.tipo === "reparto") { cerrar(); ronda = []; for (var k = 0; k < N; k++) ronda.push({ envido: false, tantos: null, truco: false, cartas: [] }); continue; }
    if (!ronda) continue;
    if (e.tipo === "canto" && e.jugador != null) {
      if (NIVEL_ENV[e.canto]) ronda[e.jugador].envido = true;
      else if (NIVEL_TRUCO[e.canto]) ronda[e.jugador].truco = true;
    } else if (e.tipo === "envido" && e.tantos) {
      e.tantos.forEach(function (x) { ronda[x.jugador].tantos = x.tantos; });
    } else if (e.tipo === "carta") {
      ronda[e.jugador].cartas.push(e.carta);
    } else if (e.tipo === "respuesta" && e.de === "truco") {
      H[e.jugador].leCantaron++; if (!e.quiero) H[e.jugador].noQuiso++;
    }
  }
  // (la mano en curso no se cierra: todavía no se sabe todo)
  return H.map(function (h) {
    return {
      envMiente: (h.envMiente + 1) / (h.envCant + 5),        // arranca en 0,2
      trMiente: (h.trMiente + 1) / (h.trCant + 5),           // arranca en 0,2
      seAchica: h.leCantaron >= 3 ? (h.noQuiso + 1) / (h.leCantaron + 3) : null
    };
  });
}

// Probabilidad de que alguien con esta mano haga lo que hizo.
// "hab" son sus costumbres en esta partida: si miente mucho, se le cree menos.
function creible(x, m, hab) {
  var w = 1, e, mEnv = hab ? hab.envMiente : 0.2, mTr = hab ? hab.trMiente : 0.2;
  if (x.envCanto) w *= Math.max(tramo(envidoDe(m), P_ENV_CANTO[x.envCanto]), mEnv * 0.6);
  else if (x.envPaso) w *= tramo(envidoDe(m), P_ENV_PASO);
  if (x.envNoQuiso) w *= tramo(envidoDe(m), P_ENV_NO);
  if (x.trucoCanto) { e = fuerza(m); var b = x.trucoCanto === 1 ? Math.min(0.6, mTr * 0.9) : Math.min(0.5, mTr * 0.6); w *= b + (1 - b) * Math.pow(e, x.trucoCanto === 1 ? 1.3 : 1.8); }
  if (x.trucoQuiso) w *= 0.3 + 0.7 * fuerza(m);
  return w;
}

// ---------------------------------------------------------------- imaginar las cartas de los demás
var N_TRUCO = 260, N_ENVIDO = 360, N_CARTA = 240, N_FLOR = 200;
function mismo(a, b) { return a.n === b.n && a.p === b.p; }
function companero(s, p) { var N = s.cfg.jugadores; return N < 4 ? null : (p + N / 2) % N; }

// Arma una ronda posible: los demás reciben cartas al azar entre las que no se vieron.
// Lo seguro se respeta siempre; lo que se deduce de cómo jugó el rival pesa como probabilidad.
function imaginar(s, p, o) {
  var r = s.ronda, N = s.cfg.jugadores, comp = companero(s, p);
  var vistas = r.cartas[p].slice();
  for (var q = 0; q < N; q++) if (q !== p) vistas = vistas.concat(r.jugadas[q]);
  var libres = mazo().filter(function (c) { return !vistas.some(function (v) { return mismo(c, v); }); });
  var dichos = {};
  if (r.envido.resultado) r.envido.resultado.tantos.forEach(function (x) { dichos[x.jugador] = x.tantos; });
  var h = o.hist, manos = null, mejor = null, mejorW = -1;
  for (var intento = 0; intento < 300; intento++) {
    var pila = libres.slice(), ok = true, w = 1;
    manos = [];
    for (var q2 = 0; q2 < N; q2++) {
      if (q2 === p) { manos.push(r.cartas[p]); continue; }
      var faltan = 3 - r.jugadas[q2].length, nuevas = [];
      for (var k = 0; k < faltan; k++) nuevas.push(pila.splice(Math.floor(o.azar() * pila.length), 1)[0]);
      var mano = r.jugadas[q2].concat(nuevas);
      manos.push(mano);
      if (!ok) continue;
      if (dichos[q2] != null && envidoDe(mano) !== dichos[q2]) ok = false;
      else if (q2 === comp && !cumpleSenas(mano, o.senas)) ok = false;
      else if (s.cfg.flor && h[q2].flor && !tieneFlor(mano)) ok = false;
      else if (equipo(q2) !== equipo(p)) w *= creible(h[q2], mano, o.hab && o.hab[q2]);
    }
    if (!ok) continue;
    if (o.azar() < w) return manos;
    if (w > mejorW) { mejorW = w; mejor = manos; }
  }
  return mejor || manos;
}

// Juega el resto de la mano "en la cabeza" con las cartas imaginadas. Devuelve si gana mi equipo.
// Si se pasa "primera", el jugador p tira esa carta antes de seguir.
function simularTruco(s, p, manos, primera) {
  var sim = { cfg: Object.assign({}, s.cfg, { flor: false, puntos: 99 }), nombres: s.nombres, puntos: [0, 0], mano: s.mano, ganador: null, mano_n: s.mano_n, eventos: [], ronda: null };
  var r = s.ronda, N = s.cfg.jugadores;
  // Copia de la ronda que respeta que una carta tirada sea el mismo objeto en la mano y en la mesa.
  var copia = {}, cl = function (c) { var key = c.n + c.p; return copia[key] || (copia[key] = { n: c.n, p: c.p }); };
  sim.ronda = {
    cartas: manos.map(function (m) { return m.map(cl); }),
    jugadas: r.jugadas.map(function (js) { return js.map(cl); }),
    bazas: r.bazas.map(function (b) { return { jugadas: b.jugadas.map(function (j) { return { jugador: j.jugador, carta: cl(j.carta) }; }), gano: b.gano, ganador: b.ganador, inicio: b.inicio }; }),
    baza: { jugadas: r.baza.jugadas.map(function (j) { return { jugador: j.jugador, carta: cl(j.carta) }; }), inicio: r.baza.inicio },
    turno: r.turno, truco: { nivel: 1, dueno: null }, envido: { estado: "terminado", cadena: [], cantaron: [] }, flor: { cantada: [], terminada: true },
    pregunta: null, trucoEnEspera: null, terminada: false, ganoRonda: null, puntosRonda: 0
  };
  if (primera) jugar(sim, p, { tipo: "jugar", carta: cl(primera) });
  for (var paso = 0; paso < 3 * N + 2 && !sim.ronda.terminada; paso++) {
    var q = sim.ronda.turno;
    jugar(sim, q, { tipo: "jugar", carta: cartaRapida(sim, q, manoDe(sim, q)) });
  }
  return sim.ronda.ganoRonda === equipo(p);
}
// Como chanceTruco, pero además estima si el rival se achica cuando le cantan:
// devuelve la chance de ganar, la chance de que no quiera y la chance de ganar si quiere.
function detalleTruco(s, p, o) {
  var r = s.ronda, N = s.cfg.jugadores, g = 0, f = 0, gAcc = 0, nAcc = 0, lleva = ventaja(s, p);
  for (var i = 0; i < N_TRUCO; i++) {
    var manos = imaginar(s, p, o), gano = simularTruco(s, p, manos), mejor = 0;
    for (var q = 0; q < N; q++) if (equipo(q) !== equipo(p)) {
      var quedan = manos[q].filter(function (c) { return !r.jugadas[q].some(function (x) { return mismo(x, c); }); });
      mejor = Math.max(mejor, quedan.length ? fuerza(quedan) + (lleva < 0 ? 0.25 : 0) : 0);
    }
    var seVa = mejor < 0.32;
    if (gano) g++;
    if (seVa) f++; else { nAcc++; if (gano) gAcc++; }
  }
  var fModelo = f / N_TRUCO, fObs = null;
  for (var q2 = 0; q2 < N; q2++) if (equipo(q2) !== equipo(p) && o.hab && o.hab[q2].seAchica != null) fObs = fObs == null ? o.hab[q2].seAchica : Math.min(fObs, o.hab[q2].seAchica);
  var fFin = fObs == null ? fModelo * 0.85 : 0.5 * fModelo + 0.5 * fObs;
  return { pv: g / N_TRUCO, f: fFin, pvAcc: nAcc ? gAcc / nAcc : g / N_TRUCO, obs: fObs != null, fObs: fObs };
}
function chanceTruco(s, p, o) {
  var g = 0;
  for (var i = 0; i < N_TRUCO; i++) if (simularTruco(s, p, imaginar(s, p, o))) g++;
  return g / N_TRUCO;
}
// Probabilidad de que mi equipo gane el envido (el empate lo gana el más cerca de la mano).
function chanceEnvido(s, p, o) {
  var N = s.cfg.jugadores, g = 0;
  for (var i = 0; i < N_ENVIDO; i++) {
    var manos = imaginar(s, p, o), mejor = null;
    for (var k = 0; k < N; k++) { var q = (s.mano + k) % N, v = envidoDe(manos[q]); if (!mejor || v > mejor.v) mejor = { q: q, v: v }; }
    if (equipo(mejor.q) === equipo(p)) g++;
  }
  return g / N_ENVIDO;
}
// Probabilidad de que la mejor flor sea de mi equipo.
function chanceFlor(s, p, o) {
  var N = s.cfg.jugadores, g = 0;
  for (var i = 0; i < N_FLOR; i++) {
    var manos = imaginar(s, p, o), mejor = null;
    for (var k = 0; k < N; k++) { var q = (s.mano + k) % N; if (tieneFlor(manos[q])) { var v = florDe(manos[q]); if (!mejor || v > mejor.v) mejor = { q: q, v: v }; } }
    if (mejor && equipo(mejor.q) === equipo(p)) g++;
  }
  return g / N_FLOR;
}
function faltaEnvido(s) { return s.cfg.puntos - Math.max(s.puntos[0], s.puntos[1]); }
function valorEnvido(s, cadena, querido) {
  if (querido && cadena[cadena.length - 1] === "falta_envido") return faltaEnvido(s);
  var c = querido ? cadena : cadena.slice(0, -1);
  return Math.max(1, c.reduce(function (t, x) { return t + (ENVIDOS[x] || 0); }, 0));
}
// ¿El rival ya mostró cartas flojas en esta mano? (sirve para mentir con más confianza)
function rivalFlojo(s, p) {
  var r = s.ronda, malas = 0, vistas = 0;
  for (var q = 0; q < s.cfg.jugadores; q++) if (equipo(q) !== equipo(p)) r.jugadas[q].forEach(function (c) { vistas++; if (jerarquia(c) <= 7) malas++; });
  return vistas > 0 && malas === vistas;
}

// ---------------------------------------------------------------- decidir
export function elegir(s, p, opciones) {
  var o = Object.assign({ rng: Math.random, azar: null, senas: null }, opciones || {});
  if (!o.azar) o.azar = Math.random;
  var acc = acciones(s, p), r = s.ronda;
  if (!acc.length) return null;
  o.hist = historia(s);
  o.hab = habitos(s);
  var q = r.pregunta, enMano = manoDe(s, p);
  var mios = s.puntos[equipo(p)], suyos = s.puntos[1 - equipo(p)], meta = s.cfg.puntos;
  var leQueda = meta - suyos, meQueda = meta - mios;

  // --- flor y contraflor
  if (q && q.tipo === "flor") {
    var pf = chanceFlor(s, p, o), F = faltaEnvido(s);
    var alResto = pf >= 0.88 || (pf >= 0.7 && suyos > mios + 6);
    if (q.etapa === "flor") {
      if (alResto && tiene(acc, "contraflor_resto") && (F <= 15 || suyos > mios)) return { tipo: "contraflor_resto" };
      if (pf >= 0.42 || o.rng() < 0.06) return { tipo: "contraflor" };
      return { tipo: "achico" };
    }
    if (q.etapa === "contraflor" && alResto && tiene(acc, "contraflor_resto") && (F <= 15 || suyos > mios)) return { tipo: "contraflor_resto" };
    var siF = q.etapa === "resto" ? F : 6, noF = q.etapa === "resto" && q.antes === "contraflor" ? 6 : 4;
    if (noF >= leQueda) return { tipo: "quiero" };
    if (siF >= leQueda) return { tipo: pf >= 0.6 ? "quiero" : "no_quiero" };
    return { tipo: siF * (2 * pf - 1) > -noF ? "quiero" : "no_quiero" };
  }
  if (tiene(acc, "flor")) return { tipo: "flor" };

  // --- me cantaron envido
  if (q && q.tipo === "envido") {
    var pe = chanceEnvido(s, p, o);
    var ult = q.cadena[q.cadena.length - 1];
    var si = valorEnvido(s, q.cadena, true), no = valorEnvido(s, q.cadena, false);
    if (pe >= 0.86 && tiene(acc, "falta_envido") && ult !== "falta_envido" && (faltaEnvido(s) <= 10 || suyos > mios + 8)) return { tipo: "falta_envido" };
    if (pe >= 0.76 && tiene(acc, "real_envido")) return { tipo: "real_envido" };
    if (pe >= 0.7 && tiene(acc, "envido") && o.rng() < 0.5) return { tipo: "envido" };
    // Si con el "no quiero" el rival gana la partida, conviene arriesgar.
    if (no >= leQueda) return { tipo: "quiero" };
    // Si al querer y perder el rival gana la partida, hay que estar más seguro.
    if (si >= leQueda) return { tipo: pe >= 0.6 ? "quiero" : "no_quiero" };
    // Si al querer y ganar gano la partida, vale la pena.
    if (si >= meQueda && pe >= 0.4) return { tipo: "quiero" };
    return { tipo: si * (2 * pe - 1) > -no ? "quiero" : "no_quiero" };
  }

  // --- me cantaron truco
  if (q && q.tipo === "truco") {
    // El envido está primero: si tengo buen envido lo canto antes de responder.
    if (tiene(acc, "envido")) {
      var pe2 = chanceEnvido(s, p, o);
      if (pe2 >= 0.72) return { tipo: pe2 >= 0.88 && tiene(acc, "real_envido") ? "real_envido" : "envido" };
    }
    var pt = chanceTruco(s, p, o);
    var n = q.nivel, subir = { 2: "retruco", 3: "vale_cuatro" }[n];
    if (subir && tiene(acc, subir) && (pt >= 0.72 || (pt >= 0.5 && rivalFlojo(s, p) && o.rng() < 0.2))) return { tipo: subir };
    // Querer gana o pierde n puntos; no querer pierde n - 1.
    if (n - 1 >= leQueda) return { tipo: "quiero" };
    if (n >= leQueda) return { tipo: pt >= 0.5 ? "quiero" : "no_quiero" };
    if (n >= meQueda && pt >= 0.35) return { tipo: "quiero" };
    return { tipo: n * (2 * pt - 1) > -(n - 1) + 0.15 ? "quiero" : "no_quiero" };
  }

  // --- es mi turno
  if (tiene(acc, "envido")) {
    var pe3 = chanceEnvido(s, p, o);
    if (pe3 >= 0.92 && tiene(acc, "falta_envido") && (faltaEnvido(s) <= 6 || suyos > mios + 10)) return { tipo: "falta_envido" };
    if (pe3 >= 0.85 && tiene(acc, "real_envido") && o.rng() < 0.45) return { tipo: "real_envido" };
    if (pe3 >= 0.6) return { tipo: "envido" };
    if (pe3 < 0.3 && o.rng() < 0.07) return { tipo: "envido" }; // mentira
  }
  var trucoT = acc.find(function (a) { return a.tipo === "truco" || a.tipo === "retruco" || a.tipo === "vale_cuatro"; });
  if (trucoT) {
    var d = detalleTruco(s, p, o), pv = d.pv, L = r.truco.nivel;
    var necesito = { truco: 0.64, retruco: 0.72, vale_cuatro: 0.8 }[trucoT.tipo];
    // Si con un punto más gano la partida, el truco no hace falta: me alcanza con ganar la mano.
    var alcanza = meQueda <= L && pv >= 0.5;
    if (alcanza) necesito = 0.99;
    if (pv >= necesito) return { tipo: trucoT.tipo };
    // Contra el que se achica seguido: si la cuenta da, le canto aunque no tenga tanto.
    if (!alcanza && d.obs && d.fObs > 0.5 && L + 1 < leQueda) {
      var sinCantar = L * (2 * pv - 1), cantando = d.f * L + (1 - d.f) * (L + 1) * (2 * d.pvAcc - 1);
      if (cantando > sinCantar + 0.25) return { tipo: trucoT.tipo };
    }
    var mentir = rivalFlojo(s, p) ? 0.3 : 0.1;
    if (d.obs && d.fObs < 0.2) mentir *= 0.5;        // al que nunca se achica le miento menos
    else if (d.obs && d.fObs > 0.5) mentir *= 1.6;   // al que se achica mucho, más
    if (pv >= 0.3 && leQueda > 2 && o.rng() < mentir) return { tipo: trucoT.tipo };
  }
  return { tipo: "jugar", carta: cartaExperta(s, p, o, enMano) };
}

// Prueba cada carta en muchas manos imaginadas y se queda con la que más gana.
// Si dos cartas dan casi lo mismo, tira la más baja (se guarda la fuerte para después).
function cartaExperta(s, p, o, enMano) {
  if (enMano.length === 1) return enMano[0];
  var cand = enMano.slice().sort(function (a, b) { return jerarquia(a) - jerarquia(b); });
  cand = cand.filter(function (c, i) { return i === 0 || jerarquia(c) !== jerarquia(cand[i - 1]); });
  if (cand.length === 1) return cand[0];
  var gana = cand.map(function () { return 0; });
  for (var i = 0; i < N_CARTA; i++) {
    var manos = imaginar(s, p, o);
    for (var k = 0; k < cand.length; k++) if (simularTruco(s, p, manos, cand[k])) gana[k]++;
  }
  var mejor = 0;
  for (var k2 = 1; k2 < cand.length; k2++) if (gana[k2] > gana[mejor] + N_CARTA * 0.03) mejor = k2;
  return cand[mejor];
}

// Cuántas bazas lleva ganadas mi equipo menos las del rival.
function ventaja(s, p) {
  return s.ronda.bazas.reduce(function (t, b) { return t + (b.gano === equipo(p) ? 1 : b.gano === -1 ? 0 : -1); }, 0);
}

// Forma rápida de elegir carta, para jugar las manos imaginadas.
function cartaRapida(s, p, enMano) {
  var orden = enMano.slice().sort(function (a, b) { return jerarquia(a) - jerarquia(b); });
  var r = s.ronda, mesa = r.baza.jugadas, primeraParda = r.bazas.length > 0 && r.bazas[0].gano === -1;
  if (!mesa.length) {
    // Abro la baza.
    if (r.bazas.length === 0) {
      // En primera: si tengo dos buenas, salgo con la del medio; si tengo una sola buena, la guardo y salgo con la peor.
      var buenas = orden.filter(function (c) { return jerarquia(c) >= 9; }).length;
      return buenas >= 2 ? orden[1] : buenas === 1 ? orden[0] : orden[orden.length - 1];
    }
    if (primeraParda) return orden[orden.length - 1];             // después de parda, el que gana se lleva todo
    return ventaja(s, p) > 0 ? orden[0] : orden[orden.length - 1]; // gané primera: obligo a gastar; perdí: voy con todo
  }
  var mejorRival = -1, mejorMio = -1;
  mesa.forEach(function (j) { var v = jerarquia(j.carta); if (equipo(j.jugador) === equipo(p)) mejorMio = Math.max(mejorMio, v); else mejorRival = Math.max(mejorRival, v); });
  var faltanJugar = s.cfg.jugadores - mesa.length - 1;
  // Mi compañero ya la gana y no queda nadie del otro equipo por jugar: tiro la más baja.
  if (mejorMio > mejorRival && faltanJugar === 0) return orden[0];
  if (mejorMio > mejorRival && mejorMio >= 11) return orden[0];
  var gana = orden.find(function (c) { return jerarquia(c) > Math.max(mejorRival, mejorMio); });
  if (gana) return gana;
  var empata = orden.find(function (c) { return jerarquia(c) === mejorRival; });
  // Empatar sirve si ya gané la primera (la parda me da la mano) o si en primera me guardo algo mejor.
  if (empata && (ventaja(s, p) > 0 || (r.bazas.length === 0 && jerarquia(orden[orden.length - 1]) > jerarquia(empata)))) return empata;
  return orden[0];
}
