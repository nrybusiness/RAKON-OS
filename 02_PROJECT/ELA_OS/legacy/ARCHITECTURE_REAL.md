# ARQUITECTURA REAL ELA_OS (RAKON)
*Última actualización: Auditoría ALPHA*

## 1. Stack Tecnológico Base
* **Backend & API:** Google Apps Script (GAS). Archivo monolítico (`dev/Codigo.gs` y `dev/Backend.gs`).
* **Base de Datos:** Google Sheets (Sistema de tablas relacionales simuladas).
* **Frontend:** HTML5 Nativo + Tailwind CSS inyectado vía CDN. Renderizado SSR a través de `HtmlService` de Google.
* **Reactividad:** Alpine.js (Exclusivo en `Menu.html`) / Vanilla JS (En paneles de administración).

## 2. Flujo de Datos
1.  **Petición Inicial:** El cliente visita el Web App URL. `Codigo.gs` intercepta el `doGet(e)`, lee el parámetro `mode` y renderiza el `.html` correspondiente.
2.  **Mutación de Estado:** Interacciones en UI envían payloads asíncronos vía `google.script.run`.
3.  **Persistencia:** `Backend.gs` procesa las reglas de negocio (Tolerancia Dinámica, IPS Blacklist, Motor de Inventario) e inserta/modifica filas en Google Sheets.
4.  **Sincronización:** Los clientes KDS y POS hacen *polling* con *Exponential Backoff* para evitar saturar la cuota de triggers de Google.

## 3. Intrusion Prevention System (IPS v1.3)
Sistema activo en capa de backend para bloquear peticiones maliciosas (Parameter Tampering):
* Evalúa disparidades entre `precioFrontend` y `precioBaseBd`.
* Aplica lista negra automática (Blacklist) basada en UID y Teléfono.
* Tolerancia configurada para ítems dinámicos: Costos de Domicilio GPS, Empaques y Algoritmos de Gratuidad (Salsas / Cabra de Oro).
