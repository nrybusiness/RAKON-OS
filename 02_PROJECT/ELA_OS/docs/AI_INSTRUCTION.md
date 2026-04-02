CONTEXTO DEL SISTEMA: HUNGER BURGERS (NRY BUSINESS) 👤 1. Directrices de IA y Perfil de Usuario Usuario: Nicolás.

Regla de Identidad: Prohibido usar nombres de otros proyectos o clientes (ej. Yeiko).

Estilo de Respuesta: Conciso, directo, técnico. Cero muletillas. Prohibido usar frases de cierre repetitivas o preguntas genéricas. Si hay error, corregir brevemente sin disculpas extensas.

Entrega de Código: SIEMPRE entregar bloques de código completos y funcionales (listos para copiar y reemplazar). Prohibido dar fragmentos o pedir ensamblajes manuales.

Memoria: Mantener contexto estricto de la sesión actual. Cada chat es un ecosistema aislado.

🏗️ 2. Arquitectura y Base de Datos Sistema POS/KDS Serverless e impulsado por eventos.

Base de Datos (Google Sheets): INV_COMIDA, INV_DESECHABLES, INV_ASEO, RECETAS, PEDIDOS_ACTIVOS, BITACORA_DIARIA, COMPRAS_GASTOS, MERMAS_Y_CONSUMO, DB_CLIENTES, ANALISIS_COSTOS.

Backend (Motorhunger.gs): Maneja POST (pedidos, compras, mermas) y GET (renderizado UI). Protegido contra nulos (String()) y optimizado con Caché de Memoria (cacheHojas) para evitar Timeouts de Google en bucles pesados.

Frontend: Carrd.co (Formulario Cliente) y Web Apps de Apps Script (PanelUnificado.html para KDS/Admin, Repartidor.html para domicilios).

🧮 3. Lógica Core: Inventario y Finanzas (REGLAS DE ORO) Toda la matemática se basa en la columna Rendimiento (fracción del artículo físico) y en Recursividad:

Descuento e Iteración: El motor lee la hoja RECETAS en múltiples niveles de profundidad. Desglosa sub-recetas (ej. Base General) hasta descontar la materia prima original: (1 / Rendimiento) * Cantidad_Receta.

Fallback Directo: Si un ítem no está en RECETAS (ej. empaques manuales), se busca y descuenta directo en las hojas INV_.

Cálculo de Costos: Costo unitario recursivo = (Costo / Rendimiento) * Cantidad.

Precios y Márgenes: El sistema sugiere precios aplicando un margen del 66% sobre el costo real y los redondea a 500 COP. Posee un inyector automático al menú.

Costos Dinámicos: Las compras masivas recalculan automáticamente el Costo Unitario en el inventario (Total $ / Cantidad).

PROHIBIDO REDONDEAR EN BACKEND: Las variables matemáticas de stock y costos conservan todos los decimales. El redondeo es estrictamente visual en Sheets.

Integridad Referencial: Sensibilidad estricta (mayúsculas/tildes) entre: mapaAdiciones (HTML) = Producto (RECETAS) = Artículo (INV_COMIDA).

🚀 4. Flujo Operativo y Módulos KDS Recepción (POST / POS): Un pedido entra por Carrd o por el Módulo POS Interno del KDS. Estado inicial: PENDIENTE (Local/Efectivo) o POR PAGAR 💰 (Nequi). Refresco UI cada 5s con alerta sonora.

Validación de Stock (Bloqueo KDS): El sistema escanea el árbol de recetas de los pedidos pendientes. Si el inventario es insuficiente (< 0), bloquea el ticket, oculta el botón de preparar y muestra una alerta roja con los insumos faltantes.

Modales del KDS:

📝 POS: Toma de pedidos internos con buscador en vivo e inyección manual.

🛒 Compras / 🗑️ Mermas: Registro tipo "carrito" para afectar stock instantáneamente (Mermas exige motivo).

📦 Empaques: Asignación manual de desechables con opción de cobro extra al cliente.

📖 Recetas: Visor de lectura rápida para cocineros.

Preparación: Al marcar EN COCINA 👨‍🍳, el backend ejecuta en ese instante el cálculo real de utilidad neta y el descuento recursivo de stock.

Despacho: EN REPARTO 🛵 o ENTREGADO ✅ (Actualiza frecuencia en DB_CLIENTES).

Anulación (❌ ANULADO):

Pre-Cocina: Reintegra ingredientes virtualmente (nunca se descontaron).

Post-Cocina: Registra el gasto en MERMAS_Y_CONSUMO como "ANULADO POST-PREPARACIÓN".

Cierre de Turno (Admin): Genera Modal de Resumen (Entregados, Ingresos $, Utilidad $, Anulados, Desglose Nequi/Efectivo), migra a Bitácora y purga los tickets activos.
