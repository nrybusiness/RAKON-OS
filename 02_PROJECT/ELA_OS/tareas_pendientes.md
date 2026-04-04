Tareas pendientes: 

Optimización del Núcleo (Backend.gs)
Transaccionalidad en Stock: Actualmente, motorInventario realiza múltiples llamadas a setValue(). Esto es lento y propenso a errores si hay concurrencia.

Mejora: Implementar un sistema de "Batch Update" que procese todos los descuentos de inventario en una sola escritura al final de la ejecución

Caché de Recetas: El sistema consulta la hoja RECETAS repetidamente para calcular costos y ETAs.

Mejora: Utilizar CacheService para almacenar el objeto del menú/recetas por 1 hora, reduciendo el tiempo de respuesta del doGet.

Estabilización de Módulos (Frontend)
Sincronización en Tiempo Real (WebSockets Virtual): Los módulos dependen de un setInterval de 5 segundos.

Mejora: Implementar un sistema de "Long Polling" o, en su defecto, un comparador de hash más ligero en el cliente para evitar re-renderizados innecesarios del DOM que causan parpadeo visual.

Módulo Repartidor (Geolocalización): El visor de domicilios usa enlaces estáticos de Google Maps.

Mejora: Integrar la API de Geocoding para validar direcciones en el Menu.html antes de enviar el pedido, evitando errores de entrega.

Gestión de Estados de Tienda: El estado AUTO depende del reloj del servidor.

Mejora: Añadir un "Modo Vacaciones" o "Cierre Temporal por Lluvia/Saturación" accesible desde el Admin que bloquee el Menu.html instantáneamente.

automatizar el cálculo de distancia y asegurar que la tarifa sea ajustable sin intervención del cliente, la arquitectura debe evolucionar hacia una validación del lado del servidor utilizando los servicios geoespaciales de Google.

Estrategia de Automatización (Módulo ALPHA / EPSILON)
Geocodificación y Matriz de Distancia:

Se utilizará el servicio Maps.newDirectionFinder() de Google Apps Script.

Lógica: Al ingresar la dirección en Menu.html, el sistema enviará el string al backend. El script calculará la ruta óptima desde la ubicación fija de Hunger Burgers hasta el destino.

Precisión: Se extraerá la distancia exacta en metros, eliminando el margen de error del selector manual actual.

Tarificación Dinámica (Configurable):

Se creará una tabla de control en una nueva hoja o en PropertiesService.

Variables Ajustables: * VALOR_BASE: Tarifa para el primer kilómetro ($2.000).

VALOR_KM_ADICIONAL: Incremento por cada kilómetro extra ($2.000).

RADIO_MAXIMO: Límite de cobertura para evitar pedidos fuera de zona.

El cálculo final será: Costo = Base + (KM_Excedentes * Adicional).

Flujo de Ejecución Propuesto
Frontend (Menu.html): * Eliminación del componente <select x-model="cliente.distancia_km">.

Implementación de un trigger @blur (al salir del campo de dirección) que dispare una función de servidor google.script.run.calcularTarifa(direccion).

Bloqueo preventivo del botón de envío mientras se valida la cobertura.

Backend (Backend.gs): * La función recibirá la dirección, validará si es una ubicación real y devolverá el costo total del domicilio y la distancia estimada al cliente.

Si la dirección es ambigua, el sistema solicitará mayor detalle antes de permitir el checkout.

Transparencia: El cliente verá el costo del domicilio calculado automáticamente en el desglose final, sin posibilidad de alterarlo manualmente.

Experiencia de Usuario (UX/UI)
Upsell Inteligente: El mostrarUpsell actual es genérico para todas las hamburguesas.

Mejora: Implementar un motor de recomendaciones basado en el producto (ej. si elige "Carnes Asadas", ofrecer "Bebida Litro" en lugar de "Combo Papas").
