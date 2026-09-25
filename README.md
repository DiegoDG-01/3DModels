# Laboratorios 3D · Cómo funcionan las cosas por dentro

Entornos interactivos en 3D (Three.js) para entender cómo funcionan objetos reales: se desmontan
pieza a pieza, cada pieza tiene su ficha y los mandos cambian el comportamiento en directo.

**Demo:** https://diegodg-01.github.io/Camera3D/

| Entorno | Ruta | Qué enseña |
| --- | --- | --- |
| Cámara fotográfica | `camera/` | Rayos de luz hasta el sensor, enfoque, apertura, exposición y la foto resultante |
| Motor 2JZ-GTE | `engine/` | Ciclo de 4 tiempos, orden de encendido, flujo de aire y gases, turbo e intercooler |

## Puesta en marcha

```bash
npm install
npm run dev      # http://localhost:5173 (hub) · /camera/ · /engine/
npm run build    # genera dist/ (estático, rutas relativas: sirve en GitHub Pages o cualquier hosting)
```

Cada push a `main` publica la web en GitHub Pages con `.github/workflows/deploy-pages.yml`
(en *Settings → Pages* la fuente debe ser **GitHub Actions**).

## Cámara fotográfica

- **4 cámaras**: réflex digital, sin espejo (APS-C), analógica de 35 mm y estenopeica; **5 objetivos** (24–135 mm) y **4 maquetas**.
- **Rayos de luz** desde tres puntos de la escena: convergen en un punto (nítido) o llegan como disco (borroso); el espejo los desvía al visor y el obturador los corta.
- **Foto real** con profundidad de campo física, exposición, ruido ISO, grano y trepidación, mostrada detrás de la maqueta 3D.

Atajos: `1` `2` `3` enfoque · `←` `→` apertura · `E` despiece · `X` rayos X · `R` rayos · `L` etiquetas · `Espacio` disparar.

## Motor 2JZ-GTE

- **Modelo completo**: bloque, culata, cigüeñal con contrapesos, 6 bielas y pistones, 2 árboles de levas, 24 válvulas con muelles y taqués, correa de distribución, bobinas, colectores, inyectores, mariposa, turbos, wastegate, blow-off, intercooler, filtro, cárter y volante.
- **Cinemática real**: biela-manivela exacta, orden de encendido 1-5-3-6-2-4 (una explosión cada 120°), levas a media velocidad y alzada de válvulas según la distribución.
- **Rayos X**: color del gas en cada cilindro (admisión, compresión, explosión, escape), chispa y llama.
- **Flujo**: partículas de aire (frío → caliente al salir del turbo → enfriado por el intercooler) y gases de escape que mueven la turbina.
- **Turbo**: twin turbo secuencial de serie (el segundo entra a 4000 rpm) o un single grande; retraso (lag), wastegate y "psshh" de la blow-off al soltar el acelerador.
- **Banco de potencia** con curvas de par y potencia (≈330 CV / 450 Nm de serie) y el punto de funcionamiento actual; corte animado de un cilindro con los 4 tiempos.
- **Cámara lenta** (hasta ÷200) y sonido sintetizado del motor y del turbo.

Atajos: `↑` `↓` régimen · `Espacio` (mantener) a fondo · `1`–`6` cilindro · `E` despiece · `X` rayos X · `F` flujo · `S` sonido.

El modelo físico es simplificado (rendimiento volumétrico, presión media efectiva, eficiencia del compresor
y del intercooler) pero da cifras realistas.

## Estructura

```
index.html              hub de entrada con la lista de laboratorios
camera/index.html       entorno de la cámara
engine/index.html       entorno del motor
src/
  shared/               registro de laboratorios, navegación, estilos del HUD y texturas comunes
  hub/                  página de entrada
  camera/               óptica, modelo 3D de las cámaras, maquetas, rayos y render de la foto
  engine/               física del motor, modelo 3D, partículas, banco de potencia, corte del cilindro y sonido
```

### Añadir un entorno nuevo

1. Crea `mi-entorno/index.html` y su código en `src/mi-entorno/` (puedes reutilizar `src/shared/hud.css`).
2. Regístralo en `src/shared/labs.js` (aparecerá en el hub y en la barra de navegación).
3. Añade su HTML a `build.rollupOptions.input` en `vite.config.js`.
