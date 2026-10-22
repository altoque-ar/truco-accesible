# Truco Accesible

Truco argentino 100% accesible para personas ciegas: se juega con lector de pantalla
(NVDA, JAWS, VoiceOver, TalkBack), contra la compu o online con amigos, desde la compu,
Android o iPhone en la misma mesa.

- `web/`: el juego (se abre en el navegador; se puede agregar a la pantalla de inicio del celular).
- `src/`: el motor con las reglas y el rival de la compu.
- `servidor/`: el servidor online (mesas con código de 4 números). Sin paquetes de npm.

Arrancar el servidor: `node servidor/servidor.js` (usa el puerto de la variable PORT, o 8080).
Pruebas: `npm test`.
