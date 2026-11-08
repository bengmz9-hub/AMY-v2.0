# AMY v2.0

Web personal y recorrido interactivo de **AMY**, jugadora de VALORANT y creadora de contenido.

- **Sitio web:** [https://bengmz9-hub.github.io/AMY-v2.0/](https://bengmz9-hub.github.io/AMY-v2.0/)
- **Repositorio:** [https://github.com/bengmz9-hub/AMY-v2.0](https://github.com/bengmz9-hub/AMY-v2.0)

## Descripción

La aplicación recorre cuatro escenas conectadas por scroll nativo:

1. **Inicio (`#amy-home`):** portada con vídeo integrado en las gafas, retrato y tarjeta de presentación.
2. **Especialidades (`#agents`):** galería en hélice 3D con los cinco agentes principales (`Sage`, `Gekko`, `Brimstone`, `Phoenix` y `Chamber`), ficha táctica (`Perfil`, `Kit` y `Tips`) y emblemas de rol en partículas 2D.
3. **Nebulosa:** escena WebGL de partículas 3D con retrato, enlaces a redes oficiales (`Kick`, `Twitch`, `YouTube`, `Starvios` y `TikTok`, más `Instagram` próximamente) y transición de recomposición.
4. **Setup (`#gear`):** cierre en `SETUP / UNDER CONSTRUCTION`.

Incluye soporte para `prefers-reduced-motion: reduce`, navegación por teclado y respaldo estático de enlaces principales tanto sin JavaScript (`<noscript>`) como cuando WebGL o los recursos 3D no están disponibles.

## Carga y navegación

La entrada prepara los recursos de las escenas, incluido el vídeo seleccionado completo, y mantiene el indicador de carga al menos dos segundos visibles. Si los recursos tardan más, la entrada espera hasta que estén listos. El tiempo de una pestaña oculta no consume ese mínimo; los enlaces directos y la restauración del historial conservan su entrada propia.

El modo habitual de escritorio utiliza un gesto por pantalla: gameplay de entrada, Hero, Hélice, Nebulosa y Setup. La nebulosa solar se transforma en AMY con redes dentro de un solo paso de 4,8 segundos. El Sol es una introducción breve de unos 0,35 segundos y la formación de AMY ocupa unos 2,85 segundos: el rostro se revela desde el centro mientras los granos exteriores orbitan en profundidad y una cresta de luz acompaña su llegada. Los extremos solar y retrato conservan su composición; no hay una parada adicional entre ambas formas. Permite invertir el sentido y encadenar un gesto nuevo durante la transición; agrupa la cola de una misma ráfaga para conservar su destino. El enlace anterior con `?scroll=steps` conserva este mismo recorrido. El [scroll continuo](https://bengmz9-hub.github.io/AMY-v2.0/?scroll=continuous) sigue disponible expresamente. En dispositivos táctiles y con movimiento reducido se mantiene el desplazamiento nativo.

Pruebas dirigidas adicionales, ejecutadas contra una compilación ya servida:

```sh
node tests/startup-loading.mjs
node tests/continuous-scroll.mjs
node tests/wheel-pulse.mjs
node tests/screen-steps.mjs
node tests/navbar-scene.mjs
```

Los tres primeros aceptan respectivamente `AMY_STARTUP_URL` y `AMY_TEST_BASE_URL`; los dos últimos aceptan `AMY_STEPS_URL` y `AMY_NAVBAR_URL`. Sus variables de salida son `AMY_STARTUP_OUTPUT`, `AMY_TEST_OUTPUT`, `AMY_STEPS_OUTPUT` y `AMY_NAVBAR_OUTPUT`. La URL debe apuntar a la base servida y terminar en `/`; los tests de pantallas añaden su query internamente. Las pruebas de gestos usan Chrome automatizado y no sustituyen la valoración con un ratón o teléfono físico.

## Requisitos

- **Node.js 22 o superior** (Node 22 se utiliza en integración continua).
- **Google Chrome** instalado en el sistema para ejecutar la suite de verificación en navegador (`playwright-core` utiliza el navegador instalado sin descargar binarios automáticamente).

## Comandos

```sh
# Instalar dependencias exactas del lockfile
npm ci

# Servidor de desarrollo local
npm run dev

# Compilar versión de producción en dist/
npm run build

# Previsualizar la compilación local
npm run preview

# Ejecutar verificación de humo y regresión en navegador (tras compilar)
npm run test:browser
```

Variables opcionales para `npm run test:browser`:

- `AMY_BROWSER_EXECUTABLE_PATH`: ruta al ejecutable de Chrome/Chromium si no se encuentra en la ubicación estándar del sistema.
- `AMY_TEST_BASE_URL`: URL base ya servida (por defecto el script inicia y detiene su propio servidor de previsualización en `/AMY-v2.0/`).
- `AMY_TEST_OUTPUT`: directorio opcional para guardar verification.json y capturas si una comprobación falla.

## Integración continua y despliegue

El flujo [`.github/workflows/pages.yml`](.github/workflows/pages.yml) ejecuta `npm ci`, `npm run build` y la verificación en navegador (`npm run test:browser`) en `pull_request` y en `push` a `main`. El despliegue a GitHub Pages solo se publica cuando el trabajo previo de verificación termina correctamente.

## Licencia y créditos de terceros

- El código del repositorio se distribuye bajo licencia MIT; consulta [`LICENSE`](LICENSE).
- Las excepciones y avisos de terceros se detallan en [`public/third-party-notices.txt`](public/third-party-notices.txt) (también disponible desde el enlace **Créditos visuales** del menú), incluyendo las adaptaciones de shaders y generadores de **ABYSSAL** bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) y **Three.js** bajo licencia MIT.
