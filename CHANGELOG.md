# Bitácora de Cambios (CHANGELOG)

Todos los cambios notables en este proyecto serán documentados en este archivo.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y este proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-11-14

### Añadido
- **Sistema de Paginación Inteligente**:
  - Paginador dinámico en la sección **Bitácora** (Registros del Servidor) con límite de 10 elementos por página, botones de navegación "Anterior" / "Siguiente" e indicador de página activa (`Página X de Y`).
  - Paginador dinámico en la sección **Tareas** con límite de 10 tareas por página, controles "Anterior" / "Siguiente" y contador reactivo.
- **Funcionalidades Extra de Experiencia de Usuario (UX)**:
  - **Búsqueda y Filtrado en Tiempo Real**:
    - Campo de búsqueda instantánea para registros de bitácora por título o contenido.
    - Filtro selectivo por nivel de prioridad (`Todas`, `Baja`, `Media`, `Alta`, `Urgente`) en bitácora.
    - Campo de búsqueda en tiempo real para tareas por título o descripción.
    - Filtro de tareas por estado (`Todos`, `Pendientes`, `En progreso`, `Completadas`).
  - **Exportación de Datos a CSV**:
    - Botón de descarga de registros del servidor en formato CSV (`bitacora_servidor_YYYY-MM-DD.csv`) con codificación UTF-8 con BOM para apertura nativa en Microsoft Excel.
    - Botón de descarga de tareas en formato CSV (`tareas_YYYY-MM-DD.csv`) con metadatos completos (estado, prioridad, fecha límite y geolocalización).

### Modificado
- **Actualización del Service Worker a v1.2.0**:
  - Renombrada la constante de caché estática a `v1.2.0` (`const CACHE_NAME = "v1.2.0"`).
  - Implementada rutina de depuración automática en el ciclo de vida `activate` para detectar y purgar de manera atómica cachés previas (como `v1.1.0` o `cosmobitacora-static-v8`), garantizando la descarga inmediata de nuevos recursos sin interferir con IndexedDB ni localStorage.
- Interfaz gráfica actualizada con barra de herramientas, controles responsivos y visualización de versión en pie de página.
- Actualizada la versión del proyecto en `package.json` a `1.2.0`.

---

## [1.1.0] - 2026-11-10

### Añadido
- Módulo de **Gestión de Tareas** con persistencia en cliente mediante IndexedDB (`tasks` store).
- Soporte de captura opcional de geolocalización (latitud, longitud y precisión) para tareas y eventos de campo.
- Módulo de **Bitácora Local** con sincronización automática y en segundo plano (Background Sync API `sync-notes`).
- Soporte para **Notificaciones Push** mediante estándar Web Push y llaves VAPID en servidor Node.js/Express.
- Notificaciones locales directas para confirmación de tareas y notas registradas.
- Integración con Spaceflight News API v4 para consulta de noticias espaciales.
- Sistema de favoritos almacenados localmente.
- Soporte PWA offline mediante Service Worker con precaching del App Shell.

### Optimizado
- Mejoras de rendimiento en Lighthouse: reducción de Total Blocking Time (TBT) e Interaction to Next Paint (INP) mediante división cooperativa de tareas (`scheduler.yield()` y `requestIdleCallback()`).
- Revalidación condicional HTTP para recursos dinámicos y caché inmutable para activos estáticos.
