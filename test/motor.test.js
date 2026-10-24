import { test } from "node:test";
import assert from "node:assert/strict";
import { crearPartida, jugar, acciones, siguienteRonda, envidoDe, florDe, tieneFlor, jerarquia, nombreCarta, mazo, equipo } from "../src/motor.js";
import { elegir } from "../src/rival.js";

const C = (n, p) => ({ n, p });
function rngFijo(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1e6) / 1e6; }; }
function poner(s, manos) { s.ronda.cartas = manos.map((m) => m.slice()); }
const jugarCarta = (s, p, c) => jugar(s, p, { tipo: "jugar", carta: s.ronda.cartas[p].find((x) => x.n === c.n && x.p === c.p) });

test("el mazo tiene 40 cartas sin 8 ni 9", () => {
  const m = mazo(); assert.equal(m.length, 40);
  assert.ok(!m.some((c) => c.n === 8 || c.n === 9));
});

test("jerarquía del truco", () => {
  const orden = [C(1, "espada"), C(1, "basto"), C(7, "espada"), C(7, "oro"), C(3, "copa"), C(2, "oro"), C(1, "copa"), C(12, "oro"), C(11, "basto"), C(10, "copa"), C(7, "copa"), C(6, "oro"), C(5, "basto"), C(4, "copa")];
  for (let i = 1; i < orden.length; i++) assert.ok(jerarquia(orden[i - 1]) > jerarquia(orden[i]), nombreCarta(orden[i - 1]) + " > " + nombreCarta(orden[i]));
  assert.equal(jerarquia(C(1, "oro")), jerarquia(C(1, "copa")));
  assert.equal(nombreCarta(C(1, "espada")), "ancho de espadas");
  assert.equal(nombreCarta(C(12, "copa")), "rey de copas");
});

test("tantos del envido y flor", () => {
  assert.equal(envidoDe([C(7, "oro"), C(6, "oro"), C(1, "espada")]), 33);
  assert.equal(envidoDe([C(12, "oro"), C(11, "oro"), C(4, "copa")]), 20);
  assert.equal(envidoDe([C(7, "oro"), C(3, "copa"), C(12, "basto")]), 7);
  assert.equal(envidoDe([C(10, "oro"), C(11, "copa"), C(12, "basto")]), 0);
  assert.equal(envidoDe([C(7, "oro"), C(5, "oro"), C(6, "oro")]), 33);
  assert.ok(tieneFlor([C(7, "oro"), C(5, "oro"), C(6, "oro")]));
  assert.equal(florDe([C(7, "oro"), C(5, "oro"), C(12, "oro")]), 32);
});

test("mano sin cantos: gana quien gana dos bazas y suma 1", () => {
  const s = crearPartida({ jugadores: 2 }, rngFijo(1));
  poner(s, [[C(1, "espada"), C(4, "copa"), C(3, "oro")], [C(7, "oro"), C(5, "basto"), C(2, "copa")]]);
  jugarCarta(s, 0, C(1, "espada")); jugarCarta(s, 1, C(7, "oro"));
  assert.equal(s.ronda.bazas[0].gano, 0);
  assert.equal(s.ronda.turno, 0);
  jugarCarta(s, 0, C(3, "oro")); jugarCarta(s, 1, C(2, "copa"));
  assert.ok(s.ronda.terminada); assert.deepEqual(s.puntos, [1, 0]);
});

test("pardas: primera parda, gana la segunda; todas pardas gana la mano", () => {
  let s = crearPartida({ jugadores: 2 }, rngFijo(2));
  poner(s, [[C(3, "oro"), C(4, "copa"), C(5, "oro")], [C(3, "copa"), C(7, "espada"), C(6, "basto")]]);
  jugarCarta(s, 0, C(3, "oro")); jugarCarta(s, 1, C(3, "copa"));
  assert.equal(s.ronda.bazas[0].gano, -1);
  jugarCarta(s, 0, C(4, "copa")); jugarCarta(s, 1, C(7, "espada"));
  assert.ok(s.ronda.terminada); assert.equal(s.ronda.ganoRonda, 1);

  s = crearPartida({ jugadores: 2 }, rngFijo(3));
  poner(s, [[C(3, "oro"), C(2, "oro"), C(5, "oro")], [C(3, "copa"), C(2, "copa"), C(5, "copa")]]);
  for (const [a, b] of [[C(3, "oro"), C(3, "copa")], [C(2, "oro"), C(2, "copa")], [C(5, "oro"), C(5, "copa")]]) { jugarCarta(s, 0, a); jugarCarta(s, 1, b); }
  assert.ok(s.ronda.terminada); assert.equal(s.ronda.ganoRonda, equipo(s.mano));
});

test("truco no querido da 1; retruco no querido da 2; vale cuatro querido da 4", () => {
  let s = crearPartida({ jugadores: 2 }, rngFijo(4));
  jugar(s, 0, { tipo: "truco" }); jugar(s, 1, { tipo: "no_quiero" });
  assert.deepEqual(s.puntos, [1, 0]);

  s = crearPartida({ jugadores: 2 }, rngFijo(5));
  jugar(s, 0, { tipo: "truco" }); jugar(s, 1, { tipo: "retruco" }); jugar(s, 0, { tipo: "no_quiero" });
  assert.deepEqual(s.puntos, [0, 2]);

  s = crearPartida({ jugadores: 2 }, rngFijo(6));
  poner(s, [[C(1, "espada"), C(1, "basto"), C(3, "oro")], [C(4, "copa"), C(5, "basto"), C(6, "copa")]]);
  jugar(s, 0, { tipo: "truco" }); jugar(s, 1, { tipo: "quiero" });
  assert.ok(!acciones(s, 1).length, "el que no tiene el quiero no puede subir fuera de turno");
  jugarCarta(s, 0, C(1, "espada"));
  assert.ok(acciones(s, 1).some((a) => a.tipo === "retruco"), "el que aceptó puede retrucar");
  jugar(s, 1, { tipo: "retruco" }); jugar(s, 0, { tipo: "vale_cuatro" }); jugar(s, 1, { tipo: "quiero" });
  jugarCarta(s, 1, C(4, "copa")); jugarCarta(s, 0, C(1, "basto")); jugarCarta(s, 1, C(5, "basto"));
  assert.deepEqual(s.puntos, [4, 0]);
});

test("envido: querido suma, no querido da 1, real envido y falta", () => {
  let s = crearPartida({ jugadores: 2 }, rngFijo(7));
  poner(s, [[C(7, "oro"), C(6, "oro"), C(1, "espada")], [C(4, "copa"), C(5, "copa"), C(12, "basto")]]);
  jugar(s, 0, { tipo: "envido" }); jugar(s, 1, { tipo: "quiero" });
  assert.deepEqual(s.puntos, [2, 0]);
  assert.ok(!acciones(s, 0).some((a) => a.tipo === "envido"), "el envido se canta una sola vez");

  s = crearPartida({ jugadores: 2 }, rngFijo(8));
  jugar(s, 0, { tipo: "envido" }); jugar(s, 1, { tipo: "no_quiero" });
  assert.deepEqual(s.puntos, [1, 0]);

  s = crearPartida({ jugadores: 2 }, rngFijo(9));
  poner(s, [[C(7, "oro"), C(6, "oro"), C(1, "espada")], [C(4, "copa"), C(5, "copa"), C(12, "basto")]]);
  jugar(s, 0, { tipo: "envido" }); jugar(s, 1, { tipo: "envido" }); jugar(s, 0, { tipo: "real_envido" }); jugar(s, 1, { tipo: "no_quiero" });
  assert.deepEqual(s.puntos, [4, 0], "envido envido no querido después del real = 4");

  s = crearPartida({ jugadores: 2, puntos: 30 }, rngFijo(10));
  s.puntos = [12, 20];
  poner(s, [[C(7, "oro"), C(6, "oro"), C(1, "espada")], [C(4, "copa"), C(5, "copa"), C(12, "basto")]]);
  jugar(s, 0, { tipo: "falta_envido" }); jugar(s, 1, { tipo: "quiero" });
  assert.equal(s.puntos[0], 22, "la falta da lo que le falta al que va ganando (10)");
});

test("el envido está primero: se canta encima del truco y después se responde el truco", () => {
  const s = crearPartida({ jugadores: 2 }, rngFijo(11));
  poner(s, [[C(4, "oro"), C(5, "basto"), C(6, "copa")], [C(7, "oro"), C(6, "oro"), C(1, "espada")]]);
  jugar(s, 0, { tipo: "truco" });
  jugar(s, 1, { tipo: "envido" });
  jugar(s, 0, { tipo: "quiero" });
  assert.deepEqual(s.puntos, [0, 2]);
  assert.equal(s.ronda.pregunta.tipo, "truco"); assert.equal(s.ronda.pregunta.a, 1);
  jugar(s, 1, { tipo: "quiero" });
  assert.equal(s.ronda.truco.nivel, 2);
});

test("irse al mazo", () => {
  let s = crearPartida({ jugadores: 2 }, rngFijo(12));
  jugar(s, 0, { tipo: "mazo" }); assert.deepEqual(s.puntos, [0, 1]);
  s = crearPartida({ jugadores: 2 }, rngFijo(13));
  jugar(s, 0, { tipo: "truco" }); jugar(s, 1, { tipo: "quiero" }); jugar(s, 0, { tipo: "mazo" });
  assert.deepEqual(s.puntos, [0, 2]);
});

test("flor: 3 puntos, y si los dos tienen gana la más alta", () => {
  let s = crearPartida({ jugadores: 2, flor: true }, rngFijo(14));
  poner(s, [[C(7, "oro"), C(6, "oro"), C(5, "oro")], [C(4, "copa"), C(5, "basto"), C(12, "basto")]]);
  assert.ok(acciones(s, 0).some((a) => a.tipo === "flor"));
  jugar(s, 0, { tipo: "flor" }); assert.deepEqual(s.puntos, [3, 0]);
  assert.ok(!acciones(s, 0).some((a) => a.tipo === "envido"), "con flor no hay envido");

  s = crearPartida({ jugadores: 2, flor: true }, rngFijo(15));
  poner(s, [[C(4, "oro"), C(5, "oro"), C(6, "oro")], [C(7, "copa"), C(6, "copa"), C(5, "copa")]]);
  jugar(s, 0, { tipo: "flor" }); jugar(s, 1, { tipo: "contraflor" }); jugar(s, 0, { tipo: "quiero" });
  assert.deepEqual(s.puntos, [0, 6]);
});

test("la flor no se canta sola: si te olvidás, no suma", () => {
  const s = crearPartida({ jugadores: 2, flor: true }, rngFijo(14));
  poner(s, [[C(7, "oro"), C(6, "oro"), C(5, "oro")], [C(4, "copa"), C(5, "basto"), C(12, "basto")]]);
  jugar(s, 0, { tipo: "jugar", carta: s.ronda.cartas[0][0] });
  assert.deepEqual(s.puntos, [0, 0]);
  assert.ok(!acciones(s, 0).some((a) => a.tipo === "flor"));
});

test("se juega de a 4 con equipos alternados", () => {
  const s = crearPartida({ jugadores: 4 }, rngFijo(16));
  poner(s, [[C(1, "espada"), C(4, "copa"), C(5, "copa")], [C(4, "oro"), C(5, "oro"), C(6, "oro")], [C(1, "basto"), C(6, "copa"), C(7, "copa")], [C(4, "basto"), C(5, "basto"), C(6, "basto")]]);
  for (let b = 0; b < 2; b++) { const t = s.ronda.turno; for (let k = 0; k < 4; k++) { const p = (t + k) % 4; jugar(s, p, { tipo: "jugar", carta: s.ronda.cartas[p].filter((c) => s.ronda.jugadas[p].indexOf(c) < 0).sort((a, b2) => jerarquia(b2) - jerarquia(a))[0] }); } }
  assert.ok(s.ronda.terminada); assert.equal(s.ronda.ganoRonda, 0);
});

test("partidas completas contra la computadora terminan sin errores (2, 4 y 6 jugadores, con y sin flor)", () => {
  for (const cfg of [{ jugadores: 2 }, { jugadores: 2, flor: true, puntos: 15 }, { jugadores: 4 }, { jugadores: 6, flor: true }]) {
    for (let semilla = 1; semilla <= 12; semilla++) {
      const rng = rngFijo(semilla * 97 + cfg.jugadores);
      const s = crearPartida(cfg, rng);
      let pasos = 0;
      while (s.ganador == null && pasos < 20000) {
        pasos++;
        if (s.ronda.terminada) { siguienteRonda(s); continue; }
        let hizo = false;
        for (let p = 0; p < cfg.jugadores && !hizo; p++) {
          const a = elegir(s, p, { rng });
          if (a) { jugar(s, p, a); hizo = true; }
        }
        assert.ok(hizo, "siempre hay alguien que puede jugar");
      }
      assert.ok(s.ganador === 0 || s.ganador === 1, "la partida termina con un ganador");
      assert.ok(s.puntos[s.ganador] === s.cfg.puntos);
    }
  }
});

// ---------------------------------------------------------------- señas
import { senasDe, SENAS } from "../src/rival.js";

test("señas: avisa las dos cartas más fuertes y el envido", () => {
  assert.deepEqual(senasDe([C(1, "espada"), C(4, "copa"), C(3, "oro")]), ["ancho_espada", "tres"]);
  assert.deepEqual(senasDe([C(7, "oro"), C(6, "oro"), C(2, "basto")]), ["siete_oro", "dos", "envido"]);
  assert.deepEqual(senasDe([C(4, "copa"), C(5, "basto"), C(11, "oro")]), ["nada"]);
  assert.deepEqual(senasDe([C(4, "copa"), C(5, "copa"), C(6, "copa")], true), ["flor"]);
  for (const k of ["ancho_espada", "tres", "envido", "flor", "nada"]) assert.ok(SENAS[k].gesto && SENAS[k].carta);
});

test("señas: el compañero de la compu quiere el truco si le avisaste cartas buenas", () => {
  const s = crearPartida({ jugadores: 4 }, rngFijo(5));
  // El jugador 2 (compañero) tiene cartas flojas; el rival 1 le canta truco.
  poner(s, [[C(1, "espada"), C(1, "basto"), C(4, "oro")], [C(4, "copa"), C(5, "copa"), C(6, "basto")], [C(4, "basto"), C(5, "oro"), C(6, "espada")], [C(4, "espada"), C(5, "espada"), C(6, "copa")]]);
  s.ronda.pregunta = { tipo: "truco", por: 1, a: 2, nivel: 2 };
  const nunca = () => 0.99;
  // Si el compañero (vos) avisó que no tiene nada, con cartas flojas no se quiere.
  assert.equal(elegir(s, 2, { rng: nunca, senas: ["nada"] }).tipo, "no_quiero");
  assert.notEqual(elegir(s, 2, { rng: nunca, senas: ["ancho_espada", "ancho_basto"] }).tipo, "no_quiero");
});

test("el mano tira, el otro canta truco sin tirar: el mano todavía puede cantar envido", () => {
  const s = crearPartida({ jugadores: 2 }, rngFijo(3));
  const mano = s.ronda.turno, pie = 1 - mano;
  const m = [];
  m[mano] = [C(7, "oro"), C(6, "oro"), C(4, "copa")]; m[pie] = [C(1, "espada"), C(5, "basto"), C(2, "copa")];
  poner(s, m);
  jugarCarta(s, mano, C(4, "copa"));
  jugar(s, pie, { tipo: "truco" });
  const tipos = acciones(s, mano).map((a) => a.tipo);
  assert.ok(tipos.includes("envido"), "debería poder cantar envido: " + tipos);
  jugar(s, mano, { tipo: "envido" });
  jugar(s, pie, { tipo: "quiero" });
  assert.equal(s.ronda.pregunta.tipo, "truco"); // vuelve el truco que estaba esperando
  assert.equal(s.ronda.pregunta.a, mano);
});
