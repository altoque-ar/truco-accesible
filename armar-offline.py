import base64, json, os, re, sys
web = sys.argv[1]; out = sys.argv[2]
html = open(os.path.join(web, "index.html"), encoding="utf-8").read()
def mod(n):
    t = open(os.path.join(web, n), encoding="utf-8").read()
    t = re.sub(r'^import [^;]+;\s*$', '', t, flags=re.M)
    t = re.sub(r'^export (function|const|var|let)', r'\1', t, flags=re.M)
    return t
# rival.js tiene su propia faltaEnvido/valorEnvido: lo envuelvo en un bloque propio
motor = mod("motor.js"); rival = mod("rival.js")

rival_exp = "elegir, senasDe, SENAS"
motor_exp = ", ".join(re.findall(r"^export (?:function|const|var|let) (\w+)", open(os.path.join(web,"motor.js"),encoding="utf-8").read(), flags=re.M))
bundle = "const __M = (() => {\n" + motor + "\nreturn {" + motor_exp + "};\n})();\nconst {crearPartida, jugar, acciones, siguienteRonda, nombreCarta, envidoDe, equipo, manoDe, NOMBRE_CANTO, sortearNombres} = __M;\n" + "const {" + rival_exp + "} = (() => {\nconst {acciones, jerarquia, envidoDe, equipo, manoDe, tieneFlor, florDe, mazo, jugar, ENVIDOS} = __M;\n" + rival + "\nreturn {" + rival_exp + "};\n})();\n"
html = html.replace('import { crearPartida, jugar, acciones, siguienteRonda, nombreCarta, envidoDe, equipo, manoDe, NOMBRE_CANTO, sortearNombres } from "./motor.js";\nimport { elegir, senasDe, SENAS } from "./rival.js";', bundle)
assert "from \"./motor.js\"" not in html
son = {}
for raiz, _, archivos in os.walk(os.path.join(web, "sonidos")):
    for a in archivos:
        if a.endswith(".mp3"):
            p = os.path.relpath(os.path.join(raiz, a), web).replace(os.sep, "/")
            son[p] = "data:audio/mpeg;base64," + base64.b64encode(open(os.path.join(raiz, a), "rb").read()).decode()
pre = "<script>window.__SON=" + json.dumps(son) + ";(function(){var f=window.fetch.bind(window);window.fetch=function(u,o){var d=window.__SON[u];if(d){var b=atob(d.split(',')[1]),x=new Uint8Array(b.length);for(var i=0;i<b.length;i++)x[i]=b.charCodeAt(i);return Promise.resolve(new Response(x.buffer,{status:200}));}return f(u,o);};})();</script>\n"
html = html.replace('<script type="module">', pre + '<script type="module">', 1)
open(out, "w", encoding="utf-8").write(html)
print(len(html), len(son))

# version.json al lado del juego armado: la app de Windows lo mira para saber si hay versión nueva
m = re.search(r'name="truco-version" content="(\d+)"', html)
if m:
    open(os.path.join(os.path.dirname(os.path.abspath(out)), "version.json"), "w").write(json.dumps({"version": int(m.group(1))}) + "\n")
    print("versión", m.group(1))
