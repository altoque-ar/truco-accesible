// Servidor del Truco online.
// - Sirve el juego (la carpeta web) para abrirlo desde cualquier celular o compu.
// - Atiende las mesas online por WebSocket en /ws.
// Sin paquetes de npm: se arranca con "node servidor/servidor.js".
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aceptar } from "./ws.js";
import { mensaje, desconectado, cantidadSalas } from "./salas.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(AQUI, "..", "web");
const PUERTO = Number(process.env.PORT) || 8080;
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".mp3": "audio/mpeg", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

export function arrancar(puerto = PUERTO) {
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/salud") { res.writeHead(200, { "content-type": "text/plain" }); res.end("ok " + cantidadSalas()); return; }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const archivo = path.resolve(WEB, "." + rel);
    if (!archivo.startsWith(WEB)) { res.writeHead(403); res.end(); return; }
    try {
      const st = await stat(archivo);
      if (!st.isFile()) throw new Error();
      const datos = await readFile(archivo);
      res.writeHead(200, { "content-type": TIPOS[path.extname(archivo)] || "application/octet-stream", "cache-control": archivo.endsWith(".html") ? "no-cache" : "public, max-age=3600" });
      res.end(datos);
    } catch (e) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("No está."); }
  });
  const sockets = new Set();
  srv.cerrarTodo = () => { for (const so of sockets) so.destroy(); srv.close(); };
  srv.on("upgrade", (req, socket) => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    if (new URL(req.url, "http://x").pathname !== "/ws") { socket.destroy(); return; }
    aceptar(req, socket, (con) => {
      con.alMensaje = (txt) => mensaje(con, txt);
      con.alCerrar = () => desconectado(con);
    });
  });
  return new Promise((ok) => srv.listen(puerto, () => ok(srv)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  arrancar().then(() => console.log(`Truco online en el puerto ${PUERTO}`));
}
