// WebSocket mínimo (RFC 6455), sin paquetes de npm.
// Solo lo que necesita el truco: mensajes de texto, ping/pong y cierre.
import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function aceptar(req, socket, alConectar) {
  const key = req.headers["sec-websocket-key"];
  if (!key || (req.headers.upgrade || "").toLowerCase() !== "websocket") { socket.destroy(); return; }
  const accept = createHash("sha1").update(key + GUID).digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  socket.setNoDelay(true);
  alConectar(new Conexion(socket));
}

class Conexion {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.abierta = true; this.partes = [];
    this.alMensaje = () => {}; this.alCerrar = () => {};
    this.vivo = true;
    socket.on("data", (d) => this.datos(d));
    socket.on("close", () => this.cerrado());
    socket.on("error", () => this.cerrado());
    // Ping cada 25 s: mantiene viva la conexión en hostings que cortan las quietas
    // y detecta celulares que se quedaron sin señal.
    this.reloj = setInterval(() => {
      if (!this.vivo) { this.socket.destroy(); return; }
      this.vivo = false; this.marco(0x9, Buffer.alloc(0));
    }, 25000);
  }
  datos(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1], op = b0 & 0x0f, fin = (b0 & 0x80) !== 0, masc = (b1 & 0x80) !== 0;
      let largo = b1 & 0x7f, pos = 2;
      if (largo === 126) { if (this.buf.length < 4) return; largo = this.buf.readUInt16BE(2); pos = 4; }
      else if (largo === 127) { if (this.buf.length < 10) return; largo = Number(this.buf.readBigUInt64BE(2)); pos = 10; }
      if (largo > 1 << 20) { this.cerrar(); return; } // nada del truco pesa tanto
      const total = pos + (masc ? 4 : 0) + largo;
      if (this.buf.length < total) return;
      let carga = this.buf.subarray(pos + (masc ? 4 : 0), total);
      if (masc) { const m = this.buf.subarray(pos, pos + 4); carga = Buffer.from(carga); for (let i = 0; i < carga.length; i++) carga[i] ^= m[i & 3]; }
      this.buf = this.buf.subarray(total);
      this.vivo = true;
      if (op === 0x8) { this.cerrar(); return; }
      if (op === 0x9) { this.marco(0xa, carga); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        this.partes.push(Buffer.from(carga));
        if (fin) { const txt = Buffer.concat(this.partes).toString("utf8"); this.partes = []; try { this.alMensaje(txt); } catch (e) { console.error(e); } }
      }
    }
  }
  marco(op, carga) {
    if (!this.abierta) return;
    const n = carga.length;
    let cab;
    if (n < 126) cab = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { cab = Buffer.alloc(4); cab[0] = 0x80 | op; cab[1] = 126; cab.writeUInt16BE(n, 2); }
    else { cab = Buffer.alloc(10); cab[0] = 0x80 | op; cab[1] = 127; cab.writeBigUInt64BE(BigInt(n), 2); }
    try { this.socket.write(Buffer.concat([cab, carga])); } catch (e) {}
  }
  enviar(obj) { this.marco(0x1, Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj), "utf8")); }
  cerrar() { if (this.abierta) { this.marco(0x8, Buffer.alloc(0)); try { this.socket.end(); } catch (e) {} } this.cerrado(); }
  cerrado() {
    if (!this.abierta) return;
    this.abierta = false; clearInterval(this.reloj);
    try { this.socket.destroy(); } catch (e) {}
    this.alCerrar();
  }
}
