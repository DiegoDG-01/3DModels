# Cámara 3D · Dentro de una cámara

Laboratorio interactivo en 3D (Three.js) para entender **cómo funciona una cámara fotográfica**:
desmonta sus piezas, sigue los **rayos de luz** desde la escena hasta el sensor y mira en directo
**cómo quedaría la foto**, con la maqueta 3D justo delante de la pantalla del resultado.

## Puesta en marcha

```bash
npm install
npm run dev      # abre http://localhost:5173
npm run build    # genera dist/ (estático, rutas relativas: sirve en GitHub Pages o cualquier hosting)
```

## Qué se puede hacer

- **4 cámaras**: réflex digital (espejo + pentaprisma), sin espejo (sensor APS-C y visor electrónico),
  analógica de 35 mm (película ISO 400) y estenopeica (sin lente, ƒ/180).
- **5 objetivos**: 24, 35, 50, 85 y 135 mm (el encuadre y la profundidad de campo cambian de verdad).
- **4 maquetas**: cabaña y montaña, bodegón, ajedrez y calle de noche.
- **Piezas interactivas**: pasa el ratón o haz clic en cualquier pieza (lente frontal, grupo de enfoque,
  anillo de enfoque, diafragma, montura, espejo, pentaprisma, obturador, sensor/película…) para ver
  qué es y qué le hace a la luz. El **anillo de enfoque** y el **anillo de diafragma** se pueden arrastrar.
- **Vista montada / despiezada** y **rayos X** para ver el interior del cuerpo.
- **Rayos de luz** desde tres puntos de la escena (primer plano, medio y fondo): se ve cómo convergen
  en un punto (nítido) o llegan como un disco (borroso) al sensor, cómo el espejo los desvía al visor
  y cómo el obturador los corta.
- **Plano de enfoque y zona nítida** dibujados dentro de la maqueta.
- **Foto real**: la maqueta se renderiza desde el centro óptico con profundidad de campo física
  (círculo de confusión calculado con la fórmula de lente delgada), exposición (apertura, velocidad,
  ISO), ruido, grano de película y trepidación si disparas lento a pulso.
- **Galería de aperturas** en la pared (ƒ/2 · ƒ/5.6 · ƒ/16) y **carrete** con las fotos que dispares.

Atajos: `1` `2` `3` enfoque · `←` `→` apertura · `E` despiece · `X` rayos X · `R` rayos · `L` etiquetas · `Espacio` disparar.

## Estructura

```
src/
  main.js              estado, interacción, disparo y HUD
  optics.js            óptica de lente delgada, profundidad de campo y exposición
  data/cameras.js      cámaras y objetivos
  data/parts.js        fichas didácticas de cada pieza
  scene/cameraRig.js   modelo 3D de las cámaras (posiciones montada/despiezada, iris, obturador, espejo…)
  scene/subjects.js    maquetas fotografiables
  scene/rays.js        trazado de rayos, fotones y discos de confusión
  scene/stage.js       sala, banco óptico, luces, pantalla de resultado y plano de enfoque
  scene/textures.js    texturas generadas con canvas
  render/photo.js      render de la foto: bokeh, exposición, ruido y trepidación
  ui/sound.js          sonido del obturador (Web Audio)
```

Notas sobre la escala: en el lado de la escena 1 unidad = 10 cm reales; en el lado de la cámara
1 mm del sensor = 0,05 unidades. El desenfoque de los rayos en el banco se exagera para que se vea;
los números del HUD y la foto usan los valores físicos reales.
