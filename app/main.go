//go:build windows

// Truco para Windows.
// La primera vez se instala solo en %LOCALAPPDATA%\Programs\Truco,
// crea los accesos directos en el Escritorio y en el menú Inicio, y abre el
// juego en una ventana propia de Edge (sin barras de navegador). Anda sin internet.
// Cada vez que se abre, se fija en internet (GitHub) si hay una versión más nueva del
// juego; si hay, la baja y la usa la próxima vez que se abra. Sin internet usa la que tiene.
package main

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// De dónde se bajan las versiones nuevas (el repositorio público del juego).
const (
	urlVersion = "https://raw.githubusercontent.com/altoque-ar/truco-accesible/main/version.json"
	urlJuego   = "https://raw.githubusercontent.com/altoque-ar/truco-accesible/main/Truco.html"
)

var reVersion = regexp.MustCompile(`name="truco-version" content="(\d+)"`)

// Número de versión que trae adentro un Truco.html (0 si no tiene).
func versionDe(html []byte) int {
	m := reVersion.FindSubmatch(html)
	if m == nil {
		return 0
	}
	v, _ := strconv.Atoi(string(m[1]))
	return v
}

// Se fija si hay una versión más nueva en internet y la deja guardada para la próxima vez.
func buscarVersionNueva(dir string, tengo int) {
	cli := &http.Client{Timeout: 20 * time.Second}
	r, err := cli.Get(urlVersion + "?t=" + strconv.FormatInt(time.Now().Unix(), 10))
	if err != nil {
		return
	}
	var v struct {
		Version int `json:"version"`
	}
	err = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&v)
	r.Body.Close()
	if err != nil || v.Version <= tengo {
		return
	}
	cli.Timeout = 3 * time.Minute
	r, err = cli.Get(urlJuego + "?v=" + strconv.Itoa(v.Version))
	if err != nil {
		return
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return
	}
	b, err := io.ReadAll(io.LimitReader(r.Body, 64<<20))
	// Solo se guarda si llegó entera y es de verdad el juego con esa versión.
	if err != nil || len(b) < 500000 || versionDe(b) != v.Version || !bytes.Contains(b, []byte("</html>")) {
		return
	}
	destino := filepath.Join(dir, "juego", "descargado.html")
	if os.WriteFile(destino+".nuevo", b, 0644) == nil {
		os.Remove(destino)
		os.Rename(destino+".nuevo", destino)
	}
}

//go:embed "Truco.html"
var juego []byte

const nombre = "Truco"

func oculto(c *exec.Cmd) *exec.Cmd {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	return c
}

func carpetaApp() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local")
	}
	return filepath.Join(base, "Programs", nombre)
}

func copiar(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".nuevo"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err = io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	out.Close()
	os.Remove(dst)
	return os.Rename(tmp, dst)
}

func mismoArchivo(a, b string) bool {
	x, e1 := os.ReadFile(a)
	y, e2 := os.ReadFile(b)
	return e1 == nil && e2 == nil && bytes.Equal(x, y)
}

// Instala (o actualiza) el programa y crea los accesos directos.
func instalar(dir string) string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	exe, _ = filepath.EvalSymlinks(exe)
	destino := filepath.Join(dir, nombre+".exe")
	if !strings.EqualFold(filepath.Clean(exe), filepath.Clean(destino)) && !mismoArchivo(exe, destino) {
		if copiar(exe, destino) != nil {
			destino = exe // si no se pudo copiar, se usa este mismo
		}
	}
	ps := `$w = New-Object -ComObject WScript.Shell
foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  if (-not $d) { continue }
  Remove-Item -LiteralPath (Join-Path $d 'Truco Accesible.lnk') -ErrorAction SilentlyContinue
  $s = $w.CreateShortcut((Join-Path $d 'Truco.lnk'))
  $s.TargetPath = $env:TRUCO_EXE
  $s.WorkingDirectory = Split-Path $env:TRUCO_EXE
  $s.Description = 'Truco argentino accesible'
  $s.Save()
}`
	c := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps)
	c.Env = append(os.Environ(), "TRUCO_EXE="+destino)
	oculto(c).Run()
	return destino
}

// Si se cortó la luz con el juego abierto, Edge mostraría "Restaurar páginas".
// Se marca la última salida como normal para que abra limpio.
func limpiarPerfil(perfil string) {
	p := filepath.Join(perfil, "Default", "Preferences")
	b, err := os.ReadFile(p)
	if err != nil {
		return
	}
	var m map[string]any
	if json.Unmarshal(b, &m) != nil {
		return
	}
	prof, _ := m["profile"].(map[string]any)
	if prof == nil {
		return
	}
	prof["exit_type"] = "Normal"
	prof["exited_cleanly"] = true
	if nb, err := json.Marshal(m); err == nil {
		os.WriteFile(p, nb, 0644)
	}
}

func navegador() string {
	var c []string
	for _, v := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
		if d := os.Getenv(v); d != "" {
			c = append(c, filepath.Join(d, "Microsoft", "Edge", "Application", "msedge.exe"))
		}
	}
	for _, v := range []string{"ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"} {
		if d := os.Getenv(v); d != "" {
			c = append(c, filepath.Join(d, "Google", "Chrome", "Application", "chrome.exe"))
		}
	}
	for _, p := range c {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func main() {
	dir := carpetaApp()
	os.MkdirAll(filepath.Join(dir, "juego"), 0755)

	// Instalar la primera vez o si esta copia es más nueva.
	exe, _ := os.Executable()
	if !strings.EqualFold(filepath.Dir(filepath.Clean(exe)), filepath.Clean(dir)) {
		instalar(dir)
	} else if _, err := os.Stat(filepath.Join(dir, ".accesos")); err != nil {
		instalar(dir)
	}
	os.WriteFile(filepath.Join(dir, ".accesos"), []byte("ok"), 0644)

	// El juego: la versión más nueva entre la que trae este programa y la que se bajó de internet.
	html := filepath.Join(dir, "juego", nombre+".html")
	usar := juego
	if bajado, err := os.ReadFile(filepath.Join(dir, "juego", "descargado.html")); err == nil && versionDe(bajado) > versionDe(juego) {
		usar = bajado
	}
	if old, err := os.ReadFile(html); err != nil || !bytes.Equal(old, usar) {
		os.WriteFile(html, usar, 0644)
	}
	tengo := versionDe(usar)
	u := (&url.URL{Scheme: "file", Path: "/" + filepath.ToSlash(html)}).String()

	perfil := filepath.Join(dir, "perfil")
	limpiarPerfil(perfil)

	if nav := navegador(); nav != "" {
		exec.Command(nav,
			"--app="+u,
			"--user-data-dir="+perfil,
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-sync",
			"--autoplay-policy=no-user-gesture-required",
			"--start-maximized",
		).Start()
	} else {
		// Sin Edge ni Chrome: se abre con el navegador que haya.
		oculto(exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", html)).Start()
	}
	// Mientras se juega, se fija si hay versión nueva (sin molestar: si no hay internet, no pasa nada).
	buscarVersionNueva(dir, tengo)
}
