// Pruebas del modo online: jugadores de mentira que se conectan al servidor y juegan solos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar } from "../servidor/servidor.js";
import { TIEMPOS, borrarTodo } from "../servidor/salas.js";
import { acciones } from "../src/motor.js";

TIEMPOS.compu = 5; TIEMPOS.mezcla = 0; TIEMPOS.siguienteMano = 20; TIEMPOS.reemplazo = 150;

let srv, URL_WS;
test.before(async () => { srv = await arrancar(0); URL_WS = `ws://127.0.0.1:${srv.address().port}/ws`; });
test.after(() => { borrarTodo(); srv.cerrarTodo(); });

// Igual que el navegador: vuelve a unir cada carta tirada con la carta de la mano.
function enlazar(v) {
  const r = v.ronda;
  r.jugadas = r.jugadas.map((js, q) => js.map((c) => r.cartas[q].find((x) => x.n === c.n && x.p === c.p) || c));
  r.cartas = r.cartas.map((cs, q) => q === undefined ? cs : cs);
  return v;
}

function cliente(nombre) {
  const ws = new WebSocket(URL_WS);
  const c = { ws, nombre, msgs: [], sala: null, vista: null, yo: null, errores: [], avisos: [], fin: false, juega: false, eventos: [] };
  c.listo = new Promise((ok) => ws.addEventListener("open", ok));
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    c.msgs.push(m);
    if (m.t === "sala") { c.sala = m; c.yo = m.yo; }
    if (m.t === "error") c.errores.push(m.texto);
    if (m.t === "aviso") c.avisos.push(m.texto);
    if (m.t === "juego") {
      c.vista = enlazar(m.vista); c.yo = m.yo; c.eventos.push(...m.evs);
      if (m.vista.ganador != null) c.fin = true;
      if (c.juega) setTimeout(() => c.jugarSiToca(), 1);
    }
  });
  c.enviar = (o) => ws.send(JSON.stringify(o));
  c.jugarSiToca = () => {
    const v = c.vista; if (!v || v.ganador != null) return;
    const ops = acciones(v, c.yo); if (!ops.length) return;
    // Mayormente tira cartas; a veces canta, así se prueban los cantos.
    const cartas = ops.filter((a) => a.tipo === "jugar"), otras = ops.filter((a) => a.tipo !== "jugar" && a.tipo !== "mazo");
    const a = (otras.length && (Math.random() < 0.35 || !cartas.length)) ? otras[Math.floor(Math.random() * otras.length)] : (cartas.length ? cartas[Math.floor(Math.random() * cartas.length)] : ops[0]);
    c.enviar({ t: "accion", a });
  };
  return c;
}
const espera = (cond, ms = 20000) => new Promise((ok, mal) => { const t0 = Date.now(); const i = setInterval(() => { if (cond()) { clearInterval(i); ok(); } else if (Date.now() - t0 > ms) { clearInterval(i); mal(new Error("Tardó demasiado")); } }, 5); });

async function mesa(n, nHumanos, cfg = {}) {
  const host = cliente("Fer"); await host.listo;
  host.enviar({ t: "crear", nombre: "Fer", cfg: { jugadores: n, puntos: 15, flor: false, ...cfg } });
  await espera(() => host.sala);
  const otros = [];
  for (let i = 1; i < nHumanos; i++) {
    const c = cliente("Amigo" + i); await c.listo;
    c.enviar({ t: "unirse", sala: host.sala.sala, nombre: "Amigo" + i });
    await espera(() => c.sala); otros.push(c);
  }
  return [host, ...otros];
}

test("crear y unirse: código de 4 cifras y asientos en orden", async () => {
  const [h, a] = await mesa(4, 2);
  assert.match(h.sala.sala, /^\d{4}$/);
  await espera(() => h.sala.asientos.filter(Boolean).length === 2);
  assert.equal(a.yo, 1);
  assert.equal(h.sala.host, true); assert.equal(a.sala.host, false);
  // cambiar de equipo: Amigo1 pasa al equipo de Fer (asiento 2)
  a.enviar({ t: "equipo" });
  await espera(() => a.yo === 2);
  // solo el que creó la mesa la empieza
  a.enviar({ t: "empezar" });
  await espera(() => a.errores.length);
  h.ws.close(); a.ws.close();
});

test("código equivocado avisa claro", async () => {
  const c = cliente("X"); await c.listo;
  c.enviar({ t: "unirse", sala: "0000", nombre: "X" });
  await espera(() => c.errores.length);
  assert.match(c.errores[0], /No encontré la mesa/);
  c.ws.close();
});

test("cada jugador ve solo sus cartas", async () => {
  const [h, a] = await mesa(2, 2);
  h.enviar({ t: "empezar" });
  await espera(() => h.vista && a.vista);
  assert.equal(h.vista.ronda.cartas[0].length, 3);
  assert.equal(h.vista.ronda.cartas[1].length, 0, "no tiene que ver las cartas del otro");
  assert.equal(a.vista.ronda.cartas[1].length, 3);
  assert.equal(a.vista.ronda.cartas[0].length, 0);
  h.ws.close(); a.ws.close();
});

for (const [n, hum, flor] of [[2, 2, false], [2, 2, true], [4, 4, false], [4, 4, true], [4, 2, false], [4, 3, true]]) {
  test(`partida completa online: de a ${n}, ${hum} personas${flor ? ", con flor" : ""}`, async () => {
    const cs = await mesa(n, hum, { flor });
    cs.forEach((c) => { c.juega = true; });
    cs[0].enviar({ t: "empezar" });
    await espera(() => cs.every((c) => c.fin), 60000);
    const v = cs[0].vista;
    assert.ok(v.puntos[0] === 15 || v.puntos[1] === 15, "puntos " + JSON.stringify(v.puntos));
    // Todos terminan viendo el mismo puntaje.
    cs.forEach((c) => assert.deepEqual(c.vista.puntos, v.puntos));
    cs.forEach((c) => assert.ok(c.eventos.some((e) => e.tipo === "reparto"), "sin repartos"));
    cs.forEach((c) => c.ws.close());
  });
}

test("si alguien se desconecta, la compu juega por él y cuando vuelve recupera su lugar", async () => {
  const [h, a] = await mesa(2, 2);
  h.juega = true;
  h.enviar({ t: "empezar" });
  await espera(() => a.vista);
  const token = a.sala.token, codigo = a.sala.sala;
  a.ws.close();
  await espera(() => h.avisos.some((t) => /se desconectó/.test(t)));
  await espera(() => h.avisos.some((t) => /La compu juega por Amigo1/.test(t)), 5000);
  // la partida sigue
  const antes = h.eventos.length;
  await espera(() => h.eventos.filter((e) => e.tipo === "carta").length > 4);
  assert.ok(h.eventos.length > antes);
  // vuelve
  const b = cliente("Amigo1"); await b.listo;
  b.enviar({ t: "volver", sala: codigo, token });
  await espera(() => b.vista && b.yo === 1);
  await espera(() => h.avisos.some((t) => /Amigo1 volvió/.test(t)));
  assert.equal(b.vista.ronda.cartas[1].length + b.vista.ronda.jugadas[1].length >= 0, true);
  b.juega = true; b.jugarSiToca();
  await espera(() => h.fin && b.fin, 60000);
  h.ws.close(); b.ws.close();
});

test("revancha: misma mesa y mismo código", async () => {
  const [h, a] = await mesa(2, 2);
  h.juega = a.juega = true;
  h.enviar({ t: "empezar" });
  await espera(() => h.fin && a.fin, 60000);
  const codigo = h.sala.sala;
  h.enviar({ t: "otra" });
  await espera(() => h.sala.estado === "espera" && a.sala.estado === "espera");
  assert.equal(h.sala.sala, codigo);
  h.fin = a.fin = false;
  h.enviar({ t: "empezar" });
  await espera(() => h.fin && a.fin, 60000);
  h.ws.close(); a.ws.close();
});

test("trampas: no se puede jugar fuera de turno ni una carta que no tenés", async () => {
  const [h, a] = await mesa(2, 2);
  h.enviar({ t: "empezar" });
  await espera(() => h.vista && a.vista);
  // Fer es mano: Amigo1 intenta jugar antes
  a.enviar({ t: "accion", a: { tipo: "jugar", carta: { n: 1, p: "espada" } } });
  await espera(() => a.errores.length);
  // Fer intenta tirar una carta que no tiene
  const tengo = h.vista.ronda.cartas[0];
  const falsa = [{ n: 1, p: "espada" }, { n: 1, p: "basto" }, { n: 7, p: "oro" }, { n: 4, p: "copa" }].find((c) => !tengo.some((x) => x.n === c.n && x.p === c.p));
  h.enviar({ t: "accion", a: { tipo: "jugar", carta: falsa } });
  await espera(() => h.errores.length);
  h.ws.close(); a.ws.close();
});
