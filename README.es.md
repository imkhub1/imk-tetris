# 🎮 Tetris

Tetris clásico en JavaScript puro, con Canvas 2D y Web Audio API. Sin dependencias, sin bundler: abre y juega.

<div align="center">

[![▶ JUGAR AHORA](https://img.shields.io/badge/▶%20%20JUGAR%20AHORA-7eff6e?style=for-the-badge&labelColor=0d1117&color=7eff6e&logoColor=7eff6e)](https://imkhub1.github.io/imk-tetris/)

</div>

<div align="center">

![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-orange)
![CSS3](https://img.shields.io/badge/CSS3-blueviolet)
![JavaScript Vanilla](https://img.shields.io/badge/JavaScript-Vanilla-yellow)

</div>

---

## 📸 Vista previa

> 💡 **Sin instalación** → haz clic en el badge verde para jugar en el navegador.

| Pantalla de inicio | Gameplay | Game Over |
|:---:|:---:|:---:|
| <img src="assets/start-screen.jpg" width="220" alt="Pantalla de inicio"> | <img src="assets/gameplay.gif" width="220" alt="Gameplay"> | <img src="assets/game-over.jpg" width="220" alt="Game Over"> |

---

## Qué incluye

- Tablero de **10 × 20** celdas.
- Las **7 piezas estándar** (I, O, T, S, Z, J, L) con colores distintos.
- **Rotación** con *wall kicks* (±1, ±2 columnas cerca de paredes).
- **Soft drop** (caída acelerada) y **Hard drop** (caída instantánea, también con clic izquierdo).
- **Pieza fantasma**: muestra dónde caerá la pieza.
- **Vista previa** de la siguiente pieza.
- **Selector de skin** (**Pastel**, **Arcade** y **Glass**).
- **Sistema de puntuación** clásico (100 / 300 / 500 / 800 × nivel).
- **Niveles** que aumentan cada 10 líneas y aceleran la caída.
- **Cuenta regresiva 3-2-1** antes de cada partida.
- **Pausa** y **Game Over** con opción de reinicio.
- **Tabla de puntuaciones** con ingreso de nombre, persistida en `localStorage`.
- **Audio**: efectos de sonido y música sintetizada (menú y gameplay) via Web Audio API.
- **Control de volumen** y **silencio** en el menú de pausa.
- **Modo claro / oscuro** (toggle, persistido en `localStorage`).
- **Modo freeze**: congela el juego sin mostrar el menú de pausa.

---

## Cómo ejecutar

Sin instalación. Dos opciones:

### Opción 1: abrir directamente

```bash
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Opción 2: servidor local (recomendado)

```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx serve .

# PHP
php -S localhost:8000
```

Luego abre `http://localhost:8000` en el navegador.

---

## Controles

| Tecla                      | Acción                                      |
| -------------------------- | ------------------------------------------- |
| `←` / `→` · `A` / `D`      | Mover horizontalmente                       |
| `↑` / `W` · Clic derecho   | Rotar en sentido horario                    |
| `↓` / `S`                  | Soft drop (caída rápida)                    |
| `Space` · Clic izquierdo   | Hard drop (caída instantánea)               |
| `F`                        | Freeze (congelar sin pausar)                |
| `P` / `Esc` · Clic central | Pausar / reanudar                           |
| `Enter`                    | Iniciar · Pausar · Reiniciar (en Game Over) |

> El menú de pausa también permite elegir el **nivel de inicio** (1–10) antes de la siguiente partida.

---

## Estructura del proyecto

```
imk-tetris/
├── assets/          # Capturas y GIFs para el README
├── index.html       # Estructura DOM y canvas
├── style.css        # Estilos (tema retro arcade oscuro)
├── theme-init.js    # Aplica el tema guardado antes del primer render
├── audio.js         # Motor de audio: SFX y música sintetizada (Web Audio API)
├── game.js          # Lógica completa del juego (~460 líneas)
└── README.md
```

---

## Personalización

Parámetros fáciles de ajustar en `game.js`:

| Constante      | Significado                                 | Por defecto           |
|----------------|---------------------------------------------|-----------------------|
| `COLS`         | Columnas del tablero                        | `10`                  |
| `ROWS`         | Filas del tablero                           | `20`                  |
| `BLOCK`        | Tamaño de celda en px                       | `30`                  |
| `SKINS`        | Paleta de colores por skin y pieza          | Pastel / Arcade / Glass |
| `LINE_SCORES`  | Puntos por 1-4 líneas borradas              | `[0,100,500,800]`  |

> Si cambias `COLS`, `ROWS` o `BLOCK`, actualiza también `width`/`height` en `<canvas id="board">` dentro de `index.html`.

---

## Para contribuir

Consulta el código fuente — `game.js` contiene la lógica del juego y `audio.js` el motor de audio. Reporta issues o abre un PR en el repositorio.

---

## Licencia

Publicado bajo la [Licencia MIT](LICENSE).
