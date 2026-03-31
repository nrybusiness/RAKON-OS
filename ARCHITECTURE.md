# ARQUITECTURA HÍBRIDA: GITHUB + DRIVE

## 1. Sincronización de Contexto
El KERNEL extrae la memoria operativa leyendo el árbol de archivos de GitHub al inicio de cada sesión de desarrollo. Los activos visuales requeridos por BETA se referencian mediante enlaces estáticos apuntando a las carpetas correspondientes en Google Drive.

## 2. Estructura de Rutas Espejo
Todo proyecto nuevo debe existir en ambos entornos simultáneamente:
- **Lógica (GitHub):** `RAKON_OS_REPO/02_PROJECTS/[Nombre_Proyecto]/dev/`
- **Media (Drive):** `RAKON_OS_DRIVE/02_PROJECTS/[Nombre_Proyecto]/media/`

## 3. Flujo de Trabajo Operativo
1. **Planeación:** GAMMA define objetivos y requerimientos en `/00_SYSTEM`.
2. **Desarrollo:** ALPHA escribe código en el repositorio local y ejecuta el control de versiones hacia GitHub.
3. **Diseño:** BETA carga maquetas, vectores y recursos pesados en la carpeta asignada en Drive.
4. **Registro:** Se actualiza el `MASTER_INDEX.md` documentando las coordenadas cruzadas de ambos entornos.
