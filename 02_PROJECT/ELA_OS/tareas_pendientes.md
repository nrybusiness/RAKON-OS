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

Experiencia de Usuario (UX/UI)
Upsell Inteligente: El mostrarUpsell actual es genérico para todas las hamburguesas.

Mejora: Implementar un motor de recomendaciones basado en el producto (ej. si elige "Carnes Asadas", ofrecer "Bebida Litro" en lugar de "Combo Papas").
