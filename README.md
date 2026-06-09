# 🎮 Tetris

Implementación del clásico **Tetris** en JavaScript vanilla, usando HTML5 Canvas y CSS. Sin dependencias externas, sin frameworks, sin proceso de build: solo abrir y jugar.

[![▶ Jugar ahora](https://img.shields.io/badge/▶%20Jugar%20ahora-imkhub1.github.io-brightgreen?style=for-the-badge&logo=github)](https://imkhub1.github.io/imk-tetris/)
![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-orange)
![CSS3](https://img.shields.io/badge/CSS3-blueviolet)
![JavaScript Vanilla](https://img.shields.io/badge/JavaScript-Vanilla-yellow)

---

## 📸 Vista previa

> 💡 **Sin instalar nada** → haz clic en el badge verde de arriba para jugar en el navegador.

<!-- DEMO GIF — graba gameplay con ScreenToGif o ShareX y sube el archivo a assets/gameplay.gif -->
<!-- ![Gameplay](assets/gameplay.gif) -->

| Pantalla de inicio | Gameplay | Game Over |
|---|---|---|
| *(captura pendiente)* | *(captura pendiente)* | *(captura pendiente)* |

> Para agregar las capturas: toma screenshots o graba un GIF del juego, guárdalos en `assets/` y reemplaza las celdas de arriba con `![Descripción](assets/nombre.png)` o `![Descripción](assets/nombre.gif)`.

---

## ¿Qué incluye?

- Tablero de **10 × 20** celdas.
- Las **7 piezas estándar** (I, O, T, S, Z, J, L) con colores diferenciados.
- **Rotación** con *wall kicks* (±1, ±2 columnas para rotar cerca de paredes).
- **Soft drop** (bajada acelerada) y **Hard drop** (caída instantánea, también con clic de mouse).
- **Pieza fantasma** (*ghost piece*): muestra dónde aterrizará la pieza.
- **Vista previa** de la siguiente pieza.
- **Selector de skins** para bloques (**Pastel**, **Arcade** y **Glass**).
- **Sistema de puntuación** clásico (100 / 300 / 500 / 800 × nivel).
- **Niveles** que suben cada 10 líneas y aceleran la caída.
- **Cuenta regresiva 3-2-1** antes de iniciar cada partida.
- **Pausa** y **Game Over** con opción de reinicio.
- **Tabla de high scores** con entrada de nombre, persistida en `localStorage`.
- **Audio**: efectos de sonido y música de fondo sintetizada (menú y gameplay).
- **Control de volumen** y **silenciador** en el menú de pausa.
- **Modo claro / oscuro** (toggle, persistido en `localStorage`).
- **Modo freeze**: congela el juego sin mostrar el menú de pausa.

---

## Cómo ejecutar

No hay nada que instalar. Tienes dos opciones:

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

| Tecla             | Acción                             |
| ----------------- | ---------------------------------- |
| `←` / `→`        | Mover horizontalmente              |
| `↑`               | Rotar en sentido horario           |
| `↓`               | Soft drop (bajar más rápido)       |
| `Espacio`         | Hard drop (caída instantánea)      |
| Clic en tablero   | Hard drop (caída instantánea)      |
| `P` / `Escape`    | Pausar / reanudar                  |
| `Enter`           | Reiniciar (en Game Over)           |

---

## Estructura del proyecto

```
tetris/
├── assets/          # Screenshots y GIFs para README
├── index.html       # Estructura del DOM y canvas
├── style.css        # Estilos (dark retro arcade theme)
├── theme-init.js    # Aplica el tema guardado antes del primer render (evita flash)
├── audio.js         # Motor de audio: SFX y música sintetizada (Web Audio API)
├── game.js          # Lógica completa del juego
└── README.md
```

---

## Cómo funciona

### `index.html`
Define la estructura visual:
- Un `<canvas id="board">` de **300 × 600** px (tablero principal).
- Un `<canvas id="next">` de **120 × 120** px (vista previa).
- Paneles laterales con score/lines/level y vista previa de la siguiente pieza.
- Overlay para pausa y game over.

### `style.css`
Estética *dark retro arcade*:
- Variables CSS para colores y efectos de neón.
- Tipografía `Press Start 2P` (pixel art).
- Efectos glow con `text-shadow` y `box-shadow`.
- Grid de fondo sutil.

### `game.js`
Contiene toda la lógica (~1 400 líneas):

| Función         | Responsabilidad                                     |
|-----------------|-----------------------------------------------------|
| `init()`        | Reinicia el estado completo del juego               |
| `createBoard()` | Crea la matriz ROWS × COLS llena de ceros           |
| `spawn()`       | Coloca la siguiente pieza como activa               |
| `collide()`     | Detecta colisiones con paredes y bloques fijados    |
| `rotateCW()`    | Rota una matriz 90° en sentido horario              |
| `tryRotate()`   | Intenta rotar con wall kicks                        |
| `lockPiece()`   | Fija la pieza en el tablero                         |
| `clearLines()`  | Elimina líneas completas y actualiza puntaje        |
| `getGhostY()`   | Calcula la posición Y final de la ghost piece       |
| `draw()`        | Renderiza todo: grid, tablero, ghost, pieza activa  |
| `loop()`        | Game loop con `requestAnimationFrame`               |

### Flujo del juego

```
init()
  ├── createBoard()
  ├── next = randomPiece()
  ├── spawn() → mueve next a current, genera nuevo next
  └── requestAnimationFrame(loop)
        ↓
   loop(timestamp)
     ├── acumula dt
     ├── si dt ≥ dropInterval → baja o fija la pieza
     ├── draw()
     └── requestAnimationFrame(loop)

   keydown → mover / rotar / soft-drop / hard-drop / pausa
```

---

## Personalización

Parámetros fáciles de ajustar en `game.js`:

| Constante      | Significado                                | Por defecto           |
|----------------|--------------------------------------------|-----------------------|
| `COLS`         | Columnas del tablero                       | `10`                  |
| `ROWS`         | Filas del tablero                          | `20`                  |
| `BLOCK`        | Tamaño en px de cada celda                 | `30`                  |
| `COLORS`       | Paleta de colores por tipo de pieza        | 7 colores neón        |
| `LINE_SCORES`  | Puntos por 1-4 líneas eliminadas           | `[0,100,300,500,800]` |

> Si cambias `COLS`, `ROWS` o `BLOCK`, ajusta también `width`/`height` del `<canvas id="board">` en `index.html`.

---

## Ideas para mejorar

- [ ] Soporte táctil (swipe) para móviles
- [ ] Animación de flash al eliminar líneas
- [ ] Rotación en sentido antihorario (`Z`)
- [ ] Hold piece (guardar pieza actual)
- [ ] Modo multijugador

---

## Tecnologías

- **HTML5** – Canvas 2D API
- **CSS3** – Flexbox, variables CSS, animaciones
- **JavaScript ES6+** – Sin dependencias externas

---

## Licencia

Proyecto de uso libre con fines educativos y de práctica.
