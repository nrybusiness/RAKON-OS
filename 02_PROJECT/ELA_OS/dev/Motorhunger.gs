/**
 * 🍔 SISTEMA INTEGRAL HUNGER BURGERS - BACKEND FINAL (CONSOLIDADO)
 */

const COSTO_EMPAQUE_FIJO = 2000;

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🍔 HUNGER BURGERS')
      .addItem('📥 Procesar / Siguiente Pedido', 'finalizarPedido')
      .addSeparator()
      .addItem('✅ Confirmar ÚLTIMO Pago', 'confirmarUltimoPago')
      .addSeparator()
      .addItem('❌ ANULAR TRABAJO ACTUAL', 'anularUltimoPedido')
      .addItem('📅 REALIZAR CIERRE DE TURNO', 'cierreDeTurno')
      .addSeparator()
      .addItem('🛵 Actualizar Domicilios Antiguos', 'migrarDomiciliosAntiguos')
      .addSeparator()
      .addItem('📊 Generar Análisis de Costos y Precios', 'generarReporteCostos')
      .addItem('💰 Aplicar Precios Sugeridos a Menú', 'aplicarPreciosSugeridos')
      .addSeparator()
      .addItem('🎨 Formatear Hoja de Recetas', 'formatearRecetas')
      .addToUi();
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  const nombreHoja = sh.getName();
  if (nombreHoja.startsWith("INV_")) {
    const fila = e.range.getRow();
    const col = e.range.getColumn();
    if (fila > 1 && col >= 2 && col <= 4) {
      const datos = sh.getRange(fila, 2, 1, 3).getValues()[0];
      let stockActual = (Number(datos[0]) || 0) + (Number(datos[1]) || 0) - (Number(datos[2]) || 0);
      sh.getRange(fila, 5).setValue(stockActual);
    }
  }
}

function sanitizarTexto(texto) {
  if (!texto) return "";
  let limpio = String(texto).trim();
  if (/^[=+\-@]/.test(limpio)) limpio = "'" + limpio;
  return limpio.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function doGet(e) {
  const modo = e?.parameter?.mode || 'kds';
  
  if (modo === 'api_rastreo') {
    const turno = e?.parameter?.turno || "";
    const callback = e?.parameter?.callback;
    
    if (turno) {
      const cache = CacheService.getScriptCache();
      const limitKey = "RASTREO_LIMIT_" + turno;
      let intentos = Number(cache.get(limitKey)) || 0;
      
      if (intentos > 10) {
         const errRes = { encontrado: false, estado: "BLOQUEADO TEMPORALMENTE", error: "Demasiadas consultas" };
         if (callback) return ContentService.createTextOutput(callback + '(' + JSON.stringify(errRes) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
         return ContentService.createTextOutput(JSON.stringify(errRes)).setMimeType(ContentService.MimeType.JSON);
      }
      cache.put(limitKey, intentos + 1, 60); 
    }

    const resultado = buscarEstadoPedido(turno);
    
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(resultado) + ');')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(resultado))
        .setMimeType(ContentService.MimeType.JSON);
  }

  let archivo = 'PanelUnificado';
  if (modo === 'repartidor') archivo = 'Repartidor';
  
  const tmp = HtmlService.createTemplateFromFile(archivo);
  tmp.modo = modo;
  return tmp.evaluate()
      .setTitle('Hunger Burgers - ' + modo.toUpperCase())
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

function buscarEstadoPedido(turnoBuscado) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const d = shP.getDataRange().getValues();
  
  let idOficial = "";
  let cliente = "Cliente";
  let estado = "PENDIENTE";
  let tipo = "LOCAL";
  let metodo = "EFECTIVO";
  let totalCalculado = 0;
  let encontrado = false;

  for (let i = d.length - 1; i >= 1; i--) { 
    let idCompleto = d[i][0] ? String(d[i][0]).trim() : "";
    if (idCompleto && (idCompleto.includes("-" + turnoBuscado + "-") || idCompleto.endsWith("-" + turnoBuscado) || idCompleto === turnoBuscado)) {
      idOficial = idCompleto;
      cliente = d[i][5] || "Cliente";
      estado = d[i][3] || "PENDIENTE"; 
      tipo = d[i][9] || "LOCAL";
      metodo = d[i][10] || "Efectivo";
      encontrado = true;
      break;
    }
  }

  if (!encontrado) return { encontrado: false };

  for (let i = 1; i < d.length; i++) {
    let idCompleto = d[i][0] ? String(d[i][0]).trim() : "";
    if (idCompleto === idOficial) {
      totalCalculado += (Number(d[i][8]) || 0);
    }
  }

  return {
    encontrado: true,
    cliente: cliente,
    estado: estado,
    tipo: tipo,
    total: totalCalculado,
    metodo: metodo
  };
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
    if (!shP) throw new Error("Hoja PEDIDOS_ACTIVOS no encontrada");
    
    if (!e || !e.parameter) return responderJSON("error", "Sin datos");
    const p = e.parameter;
    
    if (p.accion) {
      if (p.accion === "registrar_compras") registrarCompra();
      if (p.accion === "aplicar_merma") registrarMermaOConsumo();
      if (p.accion === "cierre_turno") cierreDeTurno();
      
      if (p.accion === "guardar_compras_lote") {
         let comprasArray = JSON.parse(p.compras_data);
         const hC = ss.getSheetByName("COMPRAS_GASTOS");
         let f = new Date();
         let filas = comprasArray.map(c => [f, "RESTOCK APP", c.nombre, c.cantidad, c.costoTotal, c.hoja]);
         if (filas.length > 0) hC.getRange(Math.max(hC.getLastRow() + 1, 2), 1, filas.length, 6).setValues(filas);
         registrarCompra();
         return responderJSON("success", "Compras registradas y stock actualizado");
      }
      
      if (p.accion === "guardar_mermas_lote") {
         let mermasArray = JSON.parse(p.mermas_data);
         const hM = ss.getSheetByName("MERMAS_Y_CONSUMO");
         let f = new Date();
         let filas = mermasArray.map(m => [f, m.nombre, m.cantidad, m.motivo, m.hoja, "PENDIENTE"]);
         if (filas.length > 0) hM.getRange(Math.max(hM.getLastRow() + 1, 2), 1, filas.length, 6).setValues(filas);
         registrarMermaOConsumo(); 
         return responderJSON("success", "Mermas registradas y descontadas");
      }
      return responderJSON("success", "Comando ejecutado");
    }

    const nombre = sanitizarTexto(p.nombre || "Invitado").toUpperCase();
    const celular = sanitizarTexto(p.celular || "");
    const notas = sanitizarTexto(p.notas || "");
    const direccion = sanitizarTexto(p.direccion || "Recoge en Local");
    const tipo_pedido = sanitizarTexto(p.tipo_pedido || "Local").toUpperCase();
    const metodo_pago = sanitizarTexto(p.metodo_pago || "Efectivo").toUpperCase();
    const numPersonas = parseInt(sanitizarTexto(p.personas)) || 1;

    if (celular) {
      const cache = CacheService.getScriptCache();
      const lockKey = "PEDIDO_LOCK_" + celular;
      if (cache.get(lockKey)) {
        return responderJSON("error", "Demasiados pedidos en poco tiempo. Por favor espera 1 minuto.");
      }
      cache.put(lockKey, "locked", 60); 
    }

    let itemsParaInsertar = [];
    
    for (let persona = 1; persona <= numPersonas; persona++) {
      let inicioProd = ((persona - 1) * 5) + 1;
      let finProd = persona * 5;
      for (let i = inicioProd; i <= finProd; i++) {
        let nombreProd = p["producto" + i];
        if (nombreProd && nombreProd !== "Elegir..." && nombreProd !== "") {
          itemsParaInsertar.push({ nombre: String(nombreProd).trim().toUpperCase(), cant: 1 });
        }
      }
    }

    const mapaAdiciones = {
      "add_queso": "EXTRA QUESO", "add_chimichurri": "CHIMICHURRI",  
      "add_tocineta": "EXTRA TOCINETA", "add_carne": "EXTRA CARNE HAMBURGUESA", 
      "add_pollo": "EXTRA POLLO DESMECHADO", "add_mechada": "EXTRA CARNE DESMECHADA", 
      "add_chorizo": "EXTRA CHORIZO", "add_champi": "EXTRA CHAMPIÑONES", 
      "add_buti": "EXTRA BUTIFARRA", "add_jamon": "EXTRA JAMÓN", 
      "add_maiz": "EXTRA MAICITOS", "add_pina": "EXTRA PIÑA", 
      "add_ensalada": "EXTRA ENSALADA ESPECIAL", "add_rosada": "SALSA ROSADA ESPECIAL", 
      "add_tartara": "SALSA TÁRTARA", "add_ajo": "SALSA AJO ESPECIAL", 
      "add_bbq": "SALSA BBQ", "add_s_maiz": "SALSA MAIZ ESPECIAL", 
      "add_s_pina": "SALSA PIÑA","add_papas": "PAPAS PARA COMBO", "add_s_tomate": "SALSA TOMATE", 
      "add_guacamole": "GUACAMOLE ESPECIAL"
    };
    for (let clave in mapaAdiciones) {
      if (p[clave] === "on" || p[clave] === "true") {
        itemsParaInsertar.push({ nombre: mapaAdiciones[clave], cant: 1 });
      }
    }

    for (let param in p) {
      if (param.startsWith("promo_") && p[param] && p[param] !== "") {
        itemsParaInsertar.push({ nombre: String(p[param]).trim().toUpperCase(), cant: 1 });
      }
    }

    let estadoInicial = (metodo_pago === "NEQUI" || (["LOCAL", "PARA LLEVAR"].includes(tipo_pedido) && metodo_pago === "EFECTIVO")) 
                        ? "POR PAGAR 💰" : "PENDIENTE";

    let existeDom = itemsParaInsertar.some(item => String(item.nombre).toUpperCase() === "DOMICILIO");
    if (tipo_pedido === "DOMICILIO" && !existeDom) {
        itemsParaInsertar.push({ nombre: "DOMICILIO", cant: 1 });
    }

    let existeEmp = itemsParaInsertar.some(item => String(item.nombre).toUpperCase() === "COSTO EMPAQUE");
    if ((tipo_pedido === "DOMICILIO" || tipo_pedido === "PARA LLEVAR") && !existeEmp) {
        itemsParaInsertar.push({ nombre: "COSTO EMPAQUE", cant: 1 });
    }

    const baseTurno = String(p.turno_temp || "0000").trim();
    const timestampID = Date.now().toString(36).toUpperCase().slice(-6); 
    const idOficial = celular ? `${celular}-${baseTurno}-${timestampID}` : `INV-${baseTurno}-${timestampID}`;
    const fechaActual = new Date();

    const shR = ss.getSheetByName("RECETAS");
    let rec = shR ? shR.getDataRange().getValues() : [];
    let preciosDB = {};
    let reqEmpaque = {};
    let catMap = {};
    for (let r = 1; r < rec.length; r++) {
      let n = String(rec[r][0]).trim().toUpperCase();
      let ing = String(rec[r][1]).trim().toUpperCase();
      let pr = Number(rec[r][4]) || 0;
      let categoriaRaw = String(rec[r][5] || "").trim().toUpperCase();
      if (n) {
        if (preciosDB[n] === undefined || (preciosDB[n] === 0 && pr > 0)) preciosDB[n] = pr;
        if (/\[LLEVAR\]/i.test(ing)) reqEmpaque[n] = true;
        if (categoriaRaw !== "" && !catMap[n]) catMap[n] = categoriaRaw;
      }
    }

    if (itemsParaInsertar.length > 0) {
      let contadorSalsas = 0;
      let filas = itemsParaInsertar.map(item => {
         let precioBase = preciosDB[item.nombre] !== undefined ? preciosDB[item.nombre] : 0;
         if (item.nombre === "COSTO EMPAQUE") precioBase = COSTO_EMPAQUE_FIJO;
         let catOficial = catMap[item.nombre] || "";

         let esSalsa = catOficial.includes("SALSA") || 
                        item.nombre.includes("SALSA") || 
                        item.nombre.includes("GUACAMOLE") || 
                        item.nombre.includes("CHIMICHURRI");

         let totalCalculado = 0;

         if (esSalsa) {
             for (let i = 0; i < item.cant; i++) {
                 if (contadorSalsas < 2) {
                     totalCalculado += 0; 
                 } else {
                     totalCalculado += 500; 
                 }
                 contadorSalsas++;
             }
         } else {
             totalCalculado = precioBase * item.cant;
         }

         return [idOficial, item.nombre, item.cant, estadoInicial, fechaActual, nombre, celular, notas, totalCalculado, tipo_pedido, metodo_pago, "", direccion];
      });
      shP.getRange(Math.max(shP.getLastRow() + 1, 2), 1, filas.length, filas[0].length).setValues(filas);
    } else {
      shP.appendRow([idOficial, "ORDEN VACÍA", 1, estadoInicial, fechaActual, nombre, celular, notas, 0, tipo_pedido, metodo_pago, "", direccion]);
    }

    return responderJSON("success", idOficial);
  } catch (error) {
    return responderJSON("error", error.toString());
  }
}

function responderJSON(status, data) {
  return ContentService.createTextOutput(JSON.stringify({"result": status, "data": data})).setMimeType(ContentService.MimeType.JSON);
}

function obtenerMenuPOS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shR = ss.getSheetByName("RECETAS");
  if (!shR) return [];
  const data = shR.getDataRange().getValues();
  
  let mapPOS = {};
  let reqEmpaque = {};
  let catMap = {}; 

  for (let i = 1; i < data.length; i++) {
    let prod = String(data[i][0]).trim().toUpperCase();
    let ing = String(data[i][1]).trim().toUpperCase();
    let precio = Number(data[i][4]) || 0;
    let categoriaRaw = String(data[i][5] || "").trim().toUpperCase();

    if (!prod) continue;
    if (categoriaRaw !== "" && !catMap[prod]) {
        catMap[prod] = categoriaRaw;
    }

    if (precio > 0) {
        if (mapPOS[prod] === undefined || (mapPOS[prod] === 0 && precio > 0)) {
            mapPOS[prod] = precio;
        }
    }
    if (/\[LLEVAR\]/i.test(ing)) reqEmpaque[prod] = true;
  }
  
  let catalogo = [];
  for (let prod in mapPOS) {
    let catOficial = catMap[prod] || "PRINCIPAL"; 
    
    if (catOficial.includes("INGREDIENTE") || prod === "EMPAQUE LLEVAR" || prod === "COSTO EMPAQUE") continue;
    catalogo.push({ 
        nombre: prod, 
        precio: mapPOS[prod], 
        requiereEmpaque: !!reqEmpaque[prod],
        categoria: catOficial 
    });
  }
  
  catalogo.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return catalogo;
}

function guardarPedidoPOS(clienteObj, carritoJSON) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  let carrito = JSON.parse(carritoJSON);
  
  let nombre = String(clienteObj.nombre || "Cliente POS").trim().toUpperCase();
  let celular = String(clienteObj.celular || "").trim();
  let direccion = String(clienteObj.direccion || "").trim();
  let notas = String(clienteObj.notas || "").trim();
  let tipo_pedido = String(clienteObj.tipo_pedido || "LOCAL").trim().toUpperCase();
  let metodo_pago = String(clienteObj.metodo_pago || "EFECTIVO").trim().toUpperCase();
  
  let turnoTemp = Math.floor(1000 + Math.random() * 9000).toString();
  const timestampID = Date.now().toString(36).toUpperCase().slice(-6); 
  let idOficial = celular ? `${celular}-${turnoTemp}-${timestampID}` : `POS-${turnoTemp}-${timestampID}`;
  let fechaActual = new Date();
  let estadoInicial = (metodo_pago === "NEQUI" || (["LOCAL", "PARA LLEVAR"].includes(tipo_pedido) && metodo_pago === "EFECTIVO")) 
                      ? "POR PAGAR 💰" : "PENDIENTE";
  
  if (tipo_pedido === "DOMICILIO") {
     let existeDom = carrito.find(i => String(i.nombre).toUpperCase() === "DOMICILIO");
     if (!existeDom) {
         let pDom = 0;
         const shR = ss.getSheetByName("RECETAS");
         if (shR) {
             let dR = shR.getDataRange().getValues();
             for(let r = 1; r < dR.length; r++) {
                 if (String(dR[r][0]).trim().toUpperCase() === "DOMICILIO") {
                     pDom = Number(dR[r][4]) || 0; break;
                 }
             }
         }
         carrito.push({nombre: "DOMICILIO", cant: 1, precioTotalCalculado: pDom});
     }
  }

  if (tipo_pedido === "DOMICILIO" || tipo_pedido === "PARA LLEVAR") {
     let existeEmp = carrito.find(i => String(i.nombre).toUpperCase() === "COSTO EMPAQUE");
     if (!existeEmp) {
         carrito.push({nombre: "COSTO EMPAQUE", cant: 1, precioTotalCalculado: COSTO_EMPAQUE_FIJO});
     }
  }

  if (carrito.length === 0) {
     shP.appendRow([idOficial, "ORDEN VACÍA", 1, estadoInicial, fechaActual, nombre, celular, notas, 0, tipo_pedido, metodo_pago, "", direccion]);
  } else {
     let filas = carrito.map(item => {
        let precioCalculado = item.precioTotalCalculado !== undefined ? Number(item.precioTotalCalculado) : (Number(item.precio) * Number(item.cant));
        return [idOficial, String(item.nombre).toUpperCase(), item.cant, estadoInicial, fechaActual, nombre, celular, notas, precioCalculado, tipo_pedido, metodo_pago, "", direccion];
     });
     shP.getRange(Math.max(shP.getLastRow() + 1, 2), 1, filas.length, filas[0].length).setValues(filas);
  }
  return idOficial;
}

function modificarPedidoPOS(idAEditar, clienteObj, carritoJSON) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const d = shP.getDataRange().getValues();
  let filasBorradas = false;
  let fechaOriginal = new Date();
  let estadoOriginal = "";
  
  let cacheHojasObj = {};
  let cacheDataObj = {};
  
  for (let i = d.length - 1; i >= 1; i--) {
    let idActual = d[i][0] ? String(d[i][0]).trim() : "";
    if (idActual === String(idAEditar).trim()) {
       fechaOriginal = d[i][4] || new Date();
       let estado = d[i][3] ? String(d[i][3]).trim() : "";
       estadoOriginal = estado;
       
       if (estado !== "PENDIENTE" && estado !== "POR PAGAR 💰" && estado !== "EN COCINA 👨‍🍳") {
          throw new Error("El pedido ya está en reparto o despachado. No se puede modificar.");
       }
       
       if (estado === "EN COCINA 👨‍🍳") {
           let tipoP = d[i][9] ? String(d[i][9]).toUpperCase() : "LOCAL";
           let tipoPedidoLogico = (tipoP === "DOMICILIO" || tipoP === "PARA LLEVAR") ? "DOMICILIO" : "LOCAL";
           motorInventario(ss, d[i][1], d[i][2], true, [], cacheHojasObj, cacheDataObj, tipoPedidoLogico);
       }
       
       shP.deleteRow(i + 1);
       filasBorradas = true;
    }
  }
  
  if (!filasBorradas) throw new Error("No se encontró el pedido a modificar.");
  let carrito = JSON.parse(carritoJSON);
  let nombre = String(clienteObj.nombre || "Cliente POS").trim().toUpperCase();
  let celular = String(clienteObj.celular || "").trim();
  let direccion = String(clienteObj.direccion || "").trim();
  let notas = String(clienteObj.notas || "").trim();
  let tipo_pedido = String(clienteObj.tipo_pedido || "LOCAL").trim().toUpperCase();
  let metodo_pago = String(clienteObj.metodo_pago || "EFECTIVO").trim().toUpperCase();
  
  let estadoInicial = (metodo_pago === "NEQUI" || (["LOCAL", "PARA LLEVAR"].includes(tipo_pedido) && metodo_pago === "EFECTIVO")) 
                      ? "POR PAGAR 💰" : "PENDIENTE";
                      
  if (estadoOriginal === "EN COCINA 👨‍🍳") {
      estadoInicial = "PENDIENTE"; 
  }
  
  if (tipo_pedido === "DOMICILIO") {
     let existeDom = carrito.find(i => String(i.nombre).toUpperCase() === "DOMICILIO");
     if (!existeDom) {
         let pDom = 0;
         const shR = ss.getSheetByName("RECETAS");
         if (shR) {
             let dR = shR.getDataRange().getValues();
             for(let r = 1; r < dR.length; r++) {
                 if (String(dR[r][0]).trim().toUpperCase() === "DOMICILIO") {
                     pDom = Number(dR[r][4]) || 0; break;
                 }
             }
         }
         carrito.push({nombre: "DOMICILIO", cant: 1, precioTotalCalculado: pDom});
     }
  }

  if (tipo_pedido === "DOMICILIO" || tipo_pedido === "PARA LLEVAR") {
     let existeEmp = carrito.find(i => String(i.nombre).toUpperCase() === "COSTO EMPAQUE");
     if (!existeEmp) {
         carrito.push({nombre: "COSTO EMPAQUE", cant: 1, precioTotalCalculado: COSTO_EMPAQUE_FIJO});
     }
  }

  if (carrito.length === 0) {
     shP.appendRow([idAEditar, "ORDEN VACÍA", 1, estadoInicial, fechaOriginal, nombre, celular, notas, 0, tipo_pedido, metodo_pago, "", direccion]);
  } else {
     let filas = carrito.map(item => {
        let precioCalculado = item.precioTotalCalculado !== undefined ? Number(item.precioTotalCalculado) : (Number(item.precio) * Number(item.cant));
        return [idAEditar, String(item.nombre).toUpperCase(), item.cant, estadoInicial, fechaOriginal, nombre, celular, notas, precioCalculado, tipo_pedido, metodo_pago, "", direccion];
     });
     shP.getRange(Math.max(shP.getLastRow() + 1, 2), 1, filas.length, filas[0].length).setValues(filas);
  }
  return idAEditar;
}

function guardarExtraTicketRemoto(idPedido, extraName, cobroExtra) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const d = shP.getDataRange().getValues();
  let idBuscado = String(idPedido).trim();
  let datosPedido = null;
  for (let i = 1; i < d.length; i++) {
    if (d[i][0] && String(d[i][0]).trim() === idBuscado) {
      datosPedido = d[i];
      break;
    }
  }
  
  if (!datosPedido) throw new Error("Pedido no encontrado.");
  let cobro = Number(cobroExtra) || 0;
  shP.appendRow([idBuscado, "EXTRA: " + String(extraName).toUpperCase(), 1, datosPedido[3], new Date(), datosPedido[5], datosPedido[6], "Agregado KDS", cobro, datosPedido[9], datosPedido[10], 0, datosPedido[12]]);
  return "OK";
}

function migrarDomiciliosAntiguos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  if (!shP) return;

  const d = shP.getDataRange().getValues();
  if (d.length <= 1) {
    SpreadsheetApp.getUi().alert("No hay pedidos para revisar.");
    return;
  }

  let pedidosMap = {};
  for (let i = 1; i < d.length; i++) {
    let id = String(d[i][0]).trim();
    if (!id) continue;
    let nombreProd = String(d[i][1]).trim().toUpperCase();
    let estado = String(d[i][3]).trim();
    let tipo = String(d[i][9]).trim().toUpperCase();
    if (estado === "ENTREGADO ✅" || estado === "❌ ANULADO") continue;
    if (!pedidosMap[id]) {
      pedidosMap[id] = {
        esDomicilio: (tipo === "DOMICILIO"),
        tieneItemDom: false,
        refData: d[i]
      };
    }

    if (nombreProd === "DOMICILIO") {
      pedidosMap[id].tieneItemDom = true;
    }
  }

  let filasAInsertar = [];
  let insertados = 0;
  
  let pDom = 0;
  const shR = ss.getSheetByName("RECETAS");
  if (shR) {
      let dR = shR.getDataRange().getValues();
      for(let r = 1; r < dR.length; r++) {
          if (String(dR[r][0]).trim().toUpperCase() === "DOMICILIO") {
              pDom = Number(dR[r][4]) || 0; break;
          }
      }
  }

  for (let id in pedidosMap) {
    let p = pedidosMap[id];
    if (p.esDomicilio && !p.tieneItemDom) {
      let ref = p.refData;
      filasAInsertar.push([
        id, "DOMICILIO", 1, ref[3], ref[4], ref[5], ref[6], "Añadido por Migración", pDom, ref[9], ref[10], 0, ref[12]
      ]);
      insertados++;
    }
  }

  if (filasAInsertar.length > 0) {
    shP.getRange(shP.getLastRow() + 1, 1, filasAInsertar.length, 13).setValues(filasAInsertar);
    SpreadsheetApp.getUi().alert(`✅ Migración completada.\n\nSe añadieron ${insertados} ítems de 'DOMICILIO' a pedidos activos que no lo tenían.`);
  } else {
    SpreadsheetApp.getUi().alert("ℹ️ Todo al día.\n\nNo se encontraron domicilios activos a los que les falte el ítem.");
  }
}

function acumularRequerimientos(nombreProd, cant, cacheHojas, reqMap, tipoPedido = "DOMICILIO") {
  if (!nombreProd) return;
  let nombreTrim = String(nombreProd).trim().replace(/\[LLEVAR\]/ig, "").trim().toUpperCase();
  const rec = cacheHojas["RECETAS"];
  let encontradoEnRecetas = false;

  for (let i = 1; i < rec.length; i++) {
    let itemRec = rec[i][0] ? String(rec[i][0]).trim().toUpperCase() : "";
    if (itemRec === nombreTrim) {
      encontradoEnRecetas = true;
      let hojaDestino = rec[i][3] ? String(rec[i][3]).trim() : "N/A";
      let ingredienteOriginal = rec[i][1] ? String(rec[i][1]).trim() : "";
      let cantIngrediente = Number(rec[i][2]) || 0;

      if (hojaDestino === "N/A" || hojaDestino === "undefined" || !hojaDestino) continue;
      let esParaLlevar = /\[LLEVAR\]/i.test(ingredienteOriginal);
      if (esParaLlevar && tipoPedido === "LOCAL") continue;
      
      let ingredienteLimpio = ingredienteOriginal.replace(/\[LLEVAR\]/ig, "").trim().toUpperCase();
      if (hojaDestino.toUpperCase() === "RECETAS") {
        acumularRequerimientos(ingredienteOriginal, cantIngrediente * cant, cacheHojas, reqMap, tipoPedido);
      } else {
        let hojaLimpia = hojaDestino.toUpperCase();
        let shData = cacheHojas[hojaLimpia];
        if (shData) {
          for (let j = 1; j < shData.length; j++) {
            let targetIng = shData[j][0] ? String(shData[j][0]).trim().toUpperCase() : "";
            if (targetIng === ingredienteLimpio) {
              let rendimiento = Number(shData[j][8]) || 1;
              let stockActual = Number(shData[j][4]) || 0;
              let gasto = (1 / rendimiento) * cantIngrediente * cant;
              let key = hojaLimpia + "|" + targetIng;

              if (!reqMap[key]) reqMap[key] = { gasto: 0, stock: stockActual, nombre: targetIng };
              reqMap[key].gasto += gasto;
              break;
            }
          }
        }
      }
    }
  }

  if (!encontradoEnRecetas) {
    const hojasInv = ["INV_DESECHABLES", "INV_COMIDA", "INV_ASEO"];
    for (let h of hojasInv) {
      let shData = cacheHojas[h];
      if (!shData) continue;
      for (let j = 1; j < shData.length; j++) {
        let itemD = shData[j][0] ? String(shData[j][0]).trim().toUpperCase() : "";
        if (itemD === nombreTrim) {
          let stockActual = Number(shData[j][4]) || 0;
          let key = h + "|" + itemD;
          if (!reqMap[key]) reqMap[key] = { gasto: 0, stock: stockActual, nombre: itemD };
          reqMap[key].gasto += cant;
          return;
        }
      }
    }
  }
}

function obtenerPedidosKDS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  if (!shP) return [];
  const ultimaFila = shP.getLastRow();
  if (ultimaFila < 2) return [];
  const d = shP.getRange(2, 1, ultimaFila - 1, 13).getValues();
  
  const shR = ss.getSheetByName("RECETAS");
  let rec = shR ? shR.getDataRange().getValues() : [];
  
  let cacheHojas = {
    "RECETAS": rec,
    "INV_COMIDA": ss.getSheetByName("INV_COMIDA") ? ss.getSheetByName("INV_COMIDA").getDataRange().getValues() : [],
    "INV_DESECHABLES": ss.getSheetByName("INV_DESECHABLES") ? ss.getSheetByName("INV_DESECHABLES").getDataRange().getValues() : [],
    "INV_ASEO": ss.getSheetByName("INV_ASEO") ? ss.getSheetByName("INV_ASEO").getDataRange().getValues() : []
  };

  let precios = {};
  let reqEmpaque = {};
  for (let r = 1; r < rec.length; r++) {
    let nombre = rec[r][0] ? String(rec[r][0]).trim().toUpperCase() : "";
    let ing = String(rec[r][1]).trim().toUpperCase();
    let precio = Number(rec[r][4]) || 0;
    if (nombre) {
      if (precios[nombre] === undefined || (precios[nombre] === 0 && precio > 0)) precios[nombre] = precio;
      if (/\[LLEVAR\]/i.test(ing)) reqEmpaque[nombre] = true;
    }
  }

  let ticketsMap = {};
  for (let i = 0; i < d.length; i++) {
    let id = d[i][0] ? String(d[i][0]).trim() : "";
    if (!id) continue;
    let est = d[i][3] ? String(d[i][3]).trim() : "";
    if (est === "PENDIENTE" || est === "EN COCINA 👨‍🍳" || est === "POR PAGAR 💰") {
      if (!ticketsMap[id]) {
        ticketsMap[id] = { id: id, cliente: d[i][5], celular: d[i][6], direccion: d[i][12], tipo: d[i][9], notas: d[i][7], est: est, items: [], itemsObj: [], total: 0, metodo_pago: d[i][10] || "Efectivo", bloqueado: false, motivosBloqueo: [] };
      }
      
      let nombreProd = d[i][1] ? String(d[i][1]).trim().toUpperCase() : "";
      let cantItem = Number(d[i][2]) || 1;
      
      let celdaPrecio = d[i][8];
      let precioGuardadoTotal = 0;
      let precioUnitario = 0;
      
      if (celdaPrecio !== "" && celdaPrecio !== null) {
          precioGuardadoTotal = Number(celdaPrecio) || 0;
          precioUnitario = cantItem > 0 ? precioGuardadoTotal / cantItem : 0;
      } else {
          precioUnitario = precios[nombreProd] !== undefined ? precios[nombreProd] : 0;
          if (nombreProd === "COSTO EMPAQUE") precioUnitario = COSTO_EMPAQUE_FIJO;
          precioGuardadoTotal = precioUnitario * cantItem;
      }

      ticketsMap[id].items.push(nombreProd + " (x" + cantItem + ")");
      ticketsMap[id].itemsObj.push({ nombre: nombreProd, cant: cantItem, precio: precioUnitario });
      ticketsMap[id].total += precioGuardadoTotal;
      if (est === "POR PAGAR 💰") ticketsMap[id].est = "POR PAGAR 💰";
      else if (est === "EN COCINA 👨‍🍳" && ticketsMap[id].est !== "POR PAGAR 💰") ticketsMap[id].est = "EN COCINA 👨‍🍳";
    }
  }
  
  let ticketsArray = Object.values(ticketsMap);
  for (let t of ticketsArray) {
    if (t.est === "PENDIENTE") {
      let reqMap = {};
      let tipoPedidoParaReq = (t.tipo.toUpperCase() === "DOMICILIO" || t.tipo.toUpperCase() === "PARA LLEVAR") ? "DOMICILIO" : "LOCAL";
      for (let item of t.itemsObj) {
         acumularRequerimientos(item.nombre, item.cant, cacheHojas, reqMap, tipoPedidoParaReq);
      }
      
      let faltantes = [];
      for (let key in reqMap) {
         if (reqMap[key].stock < (reqMap[key].gasto - 0.0001)) {
            faltantes.push(reqMap[key].nombre);
         }
      }
      if (faltantes.length > 0) {
         t.bloqueado = true;
         t.motivosBloqueo = [...new Set(faltantes)];
      }
    }
  }
  
  return ticketsArray;
}

function avanzarTicketCompleto(idPedido, omitirStr = "") {
  try {
      if (!idPedido) return;
      const idBuscado = String(idPedido).trim();
      let omitir = (typeof omitirStr === "string" && omitirStr) ? omitirStr.split(",") : [];
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
      const shR = ss.getSheetByName("RECETAS");
      if (!shP || !shR) throw new Error("Hojas base no encontradas");
      
      const d = shP.getDataRange().getValues();
      const rec = shR.getDataRange().getValues();
      let clienteActualizado = false;

      let cacheHojas = { "RECETAS": shR }; 
      let cacheData = { "RECETAS": rec };
      let tipoPedidoTicket = "LOCAL";

      for (let i = 1; i < d.length; i++) {
        let idActual = d[i][0] ? String(d[i][0]).trim() : "";
        if (idActual === idBuscado) {
           tipoPedidoTicket = d[i][9] ? String(d[i][9]).trim().toUpperCase() : "LOCAL";
           break;
        }
      }
      
      let tipoPedidoLogico = (tipoPedidoTicket === "DOMICILIO" || tipoPedidoTicket === "PARA LLEVAR") ? "DOMICILIO" : "LOCAL";

      for (let i = 1; i < d.length; i++) {
        let idActual = d[i][0] ? String(d[i][0]).trim() : "";
        if (idActual === idBuscado) {
          let est = d[i][3] ? String(d[i][3]).trim() : "";
          let prodActual = d[i][1] ? String(d[i][1]).trim().toUpperCase() : "";
          if (est === "PENDIENTE") {
            let pVenta = 0, cTotal = 0;
            for (let r = 1; r < rec.length; r++) {
              let prodReceta = rec[r][0] ? String(rec[r][0]).trim().toUpperCase() : "";
              if (prodReceta === prodActual) {
                let precioFila = Number(rec[r][4]) || 0;
                if (pVenta === 0 && precioFila > 0) pVenta = precioFila;
                cTotal += obtenerCostoIngrediente(ss, rec[r][3], rec[r][1], rec[r][2], cacheData, tipoPedidoLogico);
              }
            }
            
            let celdaPrecio = d[i][8];
            let pVentaFinal = 0;
            if (celdaPrecio !== "" && celdaPrecio !== null) {
                pVentaFinal = (Number(celdaPrecio) || 0) / Number(d[i][2]);
            } else {
                pVentaFinal = pVenta;
            }
            
            shP.getRange(i + 1, 9).setValue(pVentaFinal * d[i][2]);
            shP.getRange(i + 1, 12).setValue((pVentaFinal * d[i][2]) - (cTotal * d[i][2]));
            
            motorInventario(ss, d[i][1], d[i][2], false, omitir, cacheHojas, cacheData, tipoPedidoLogico);
            shP.getRange(i + 1, 4).setValue("EN COCINA 👨‍🍳");
            shP.getRange(i + 1, 1, 1, 13).setBackground("#ffe599");
          } 
          else if (est === "EN COCINA 👨‍🍳") {
            if (tipoPedidoTicket === "DOMICILIO") {
              shP.getRange(i + 1, 4).setValue("EN REPARTO 🛵");
              shP.getRange(i + 1, 1, 1, 13).setBackground("#cfe2ff"); 
            } else {
              shP.getRange(i + 1, 4).setValue("ENTREGADO ✅");
              shP.getRange(i + 1, 1, 1, 13).setBackground(null);
              if (!clienteActualizado) {
                actualizarOcrearCliente(d[i][6], d[i][5], d[i][4]);
                clienteActualizado = true;
              }
            }
          }
        }
      }
      return "OK";
  } catch (err) {
      throw new Error(err.message);
  }
}

function ajustarTotalPedidoRemoto(idPedido, diferencia) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const d = shP.getDataRange().getValues();
  let idBuscado = String(idPedido).trim();
  let datosPedido = null;
  for (let i = 1; i < d.length; i++) {
    if (d[i][0] && String(d[i][0]).trim() === idBuscado) {
      datosPedido = d[i];
      break;
    }
  }
  if (!datosPedido) throw new Error("Pedido no encontrado.");
  shP.appendRow([
    idBuscado, 
    "AJUSTE DE PRECIO ADMIN", 
    1, 
    datosPedido[3], 
    new Date(), 
    datosPedido[5], 
    datosPedido[6], 
    "Ajuste manual", 
    diferencia, 
    datosPedido[9], 
    datosPedido[10], 
    0, 
    datosPedido[12]
  ]);
  return "OK";
}

function confirmarPagoEspecifico(idPedido) {
  if (!idPedido) return;
  const idBuscado = String(idPedido).trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const d = shP.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    let idActual = d[i][0] ? String(d[i][0]).trim() : "";
    if (idActual === idBuscado && d[i][3] === "POR PAGAR 💰") {
      shP.getRange(i + 1, 4).setValue("PENDIENTE");
      shP.getRange(i + 1, 1, 1, 13).setBackground("#d9ead3");
    }
  }
}

function anularTicketEspecifico(idPedido) {
  if (!idPedido) return;
  const idBuscado = String(idPedido).trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const d = shP.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) {
    let idActual = d[i][0] ? String(d[i][0]).trim() : "";
    if (idActual === idBuscado) {
      if (["EN COCINA 👨‍🍳", "POR PAGAR 💰", "PENDIENTE", "EN REPARTO 🛵"].includes(d[i][3])) {
        ejecutarLogicaAnulacion(i + 1);
      }
    }
  }
}

function ejecutarLogicaAnulacion(f) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS"), filaData = shP.getRange(f, 1, 1, 13).getValues()[0];
  if (filaData[3] === "EN COCINA 👨‍🍳" || filaData[3] === "EN REPARTO 🛵") { 
    const shM = ss.getSheetByName("MERMAS_Y_CONSUMO");
    shM.appendRow([new Date(), filaData[1], filaData[2], "ANULADO POST-PREPARACIÓN", "INV_COMIDA", "PROCESADO"]);
  } else if (filaData[3] === "PENDIENTE") { 
    let tipoP = String(filaData[9]).toUpperCase();
    let tipoPedidoLogico = (tipoP === "DOMICILIO" || tipoP === "PARA LLEVAR") ? "DOMICILIO" : "LOCAL";
    motorInventario(ss, filaData[1], filaData[2], true, [], {}, {}, tipoPedidoLogico);
  }
  shP.getRange(f, 4).setValue("❌ ANULADO").setBackground("#ea9999");
}

function motorInventario(ss, prod, cant, modoA, omitir = [], cacheHojasObj = {}, cacheDataObj = {}, tipoPedido = "DOMICILIO") {
  if (!prod) return;
  let nombreProdLimpio = String(prod).trim().replace(/\[LLEVAR\]/ig, "").trim().toUpperCase();
  if (omitir.includes(nombreProdLimpio)) return;

  if (!cacheHojasObj["RECETAS"]) {
      cacheHojasObj["RECETAS"] = ss.getSheetByName("RECETAS");
      cacheDataObj["RECETAS"] = cacheHojasObj["RECETAS"].getDataRange().getValues();
  }
  const recetas = cacheDataObj["RECETAS"];
  let encontradoEnRecetas = false;
  for (let i = 1; i < recetas.length; i++) {
    let itemRec = recetas[i][0] ? String(recetas[i][0]).trim().toUpperCase() : "";
    if (itemRec === nombreProdLimpio) {
      encontradoEnRecetas = true;
      let hojaDestino = recetas[i][3] ? String(recetas[i][3]).trim() : "N/A";
      let ingredienteOriginal = recetas[i][1] ? String(recetas[i][1]).trim() : "";
      let cantIngrediente = Number(recetas[i][2]) || 0;
      
      if (hojaDestino === "N/A" || hojaDestino === "undefined" || !hojaDestino) continue;
      let esParaLlevar = /\[LLEVAR\]/i.test(ingredienteOriginal);
      if (esParaLlevar && tipoPedido === "LOCAL") continue;
      
      let ingredienteLimpio = ingredienteOriginal.replace(/\[LLEVAR\]/ig, "").trim().toUpperCase();
      if (omitir.includes(ingredienteLimpio)) continue;
      if (hojaDestino.toUpperCase() === "RECETAS") {
        motorInventario(ss, ingredienteOriginal, cantIngrediente * Number(cant), modoA, omitir, cacheHojasObj, cacheDataObj, tipoPedido);
        continue;
      }
      
      if (!cacheHojasObj[hojaDestino]) {
          cacheHojasObj[hojaDestino] = ss.getSheetByName(hojaDestino);
          if (cacheHojasObj[hojaDestino]) cacheDataObj[hojaDestino] = cacheHojasObj[hojaDestino].getDataRange().getValues();
      }
      const shI = cacheHojasObj[hojaDestino];
      const dI = cacheDataObj[hojaDestino];
      if (shI && dI) {
        for (let j = 1; j < dI.length; j++) {
          let targetIng = dI[j][0] ? String(dI[j][0]).trim().toUpperCase() : "";
          if (targetIng === ingredienteLimpio) {
            let rendimiento = Number(dI[j][8]) || 1; 
            let gastoPorcion = (1 / rendimiento) * cantIngrediente * Number(cant);
            let salidasActuales = Number(dI[j][3]) || 0;
            let nuevasSalidas = modoA ? salidasActuales - gastoPorcion : salidasActuales + gastoPorcion;
            if (nuevasSalidas < 0) nuevasSalidas = 0;
            shI.getRange(j + 1, 4).setValue(nuevasSalidas); 
            let stockInicial = Number(dI[j][1]) || 0;
            let entradas = Number(dI[j][2]) || 0;
            let stockActualCalculado = stockInicial + entradas - nuevasSalidas;
            shI.getRange(j + 1, 5).setValue(stockActualCalculado);
            let stockMinimo = Number(dI[j][7]) || 0;
            if (stockActualCalculado <= stockMinimo) { shI.getRange(j + 1, 5).setBackground("#ea9999"); } 
            else { shI.getRange(j + 1, 5).setBackground(null); }
            
            dI[j][3] = nuevasSalidas;
            break;
          }
        }
      }
    }
  }

  if (!encontradoEnRecetas) {
    const hojasInv = ["INV_DESECHABLES", "INV_COMIDA", "INV_ASEO"];
    for (let h of hojasInv) {
      if (!cacheHojasObj[h]) {
          cacheHojasObj[h] = ss.getSheetByName(h);
          if (cacheHojasObj[h]) cacheDataObj[h] = cacheHojasObj[h].getDataRange().getValues();
      }
      const shI = cacheHojasObj[h];
      const dI = cacheDataObj[h];
      if (!shI || !dI) continue;
      for (let j = 1; j < dI.length; j++) {
        let itemD = dI[j][0] ? String(dI[j][0]).trim().toUpperCase() : "";
        if (itemD === nombreProdLimpio) {
          let salidasActuales = Number(dI[j][3]) || 0;
          let nuevasSalidas = modoA ? salidasActuales - cant : salidasActuales + cant;
          if (nuevasSalidas < 0) nuevasSalidas = 0;
          shI.getRange(j + 1, 4).setValue(nuevasSalidas);
          let stockInicial = Number(dI[j][1]) || 0;
          let entradas = Number(dI[j][2]) || 0;
          let stockActualCalculado = stockInicial + entradas - nuevasSalidas;
          shI.getRange(j + 1, 5).setValue(stockActualCalculado);
          let stockMinimo = Number(dI[j][7]) || 0;
          if (stockActualCalculado <= stockMinimo) { shI.getRange(j + 1, 5).setBackground("#ea9999"); } 
          else { shI.getRange(j + 1, 5).setBackground(null); }
          
          dI[j][3] = nuevasSalidas;
          return; 
        }
      }
    }
  }
}

function obtenerRecetaProducto(nombreProd) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shR = ss.getSheetByName("RECETAS");
  if(!shR) return [];
  const data = shR.getDataRange().getValues();
  let receta = [];
  for(let i = 1; i < data.length; i++) {
    if(String(data[i][0]).trim().toUpperCase() === String(nombreProd).trim().toUpperCase()) {
      receta.push({
        ingrediente: String(data[i][1]).trim().toUpperCase(),
        cantidad: data[i][2]
      });
    }
  }
  return receta;
}

function obtenerCostoIngrediente(ss, hoja, ing, cantR, cacheData = null, tipoPedido = "DOMICILIO") {
  if(!hoja || hoja === "N/A") return 0;
  let hojaLimpia = String(hoja).trim().toUpperCase();
  let nombreIngRaw = String(ing).trim();
  
  let esParaLlevar = /\[LLEVAR\]/i.test(nombreIngRaw);
  if (esParaLlevar && tipoPedido === "LOCAL") return 0;
  let nombreIng = nombreIngRaw.replace(/\[LLEVAR\]/ig, "").trim().toUpperCase();

  if (!cacheData) cacheData = {};
  if (hojaLimpia === "RECETAS") {
    if (!cacheData["RECETAS"]) {
       let shR = ss.getSheetByName("RECETAS");
       cacheData["RECETAS"] = shR ? shR.getDataRange().getValues() : [];
    }
    const rec = cacheData["RECETAS"];
    let costoSubReceta = 0;
    for (let i = 1; i < rec.length; i++) {
      let recIng = rec[i][0] ? String(rec[i][0]).trim().toUpperCase() : "";
      if (recIng === nombreIng) {
        costoSubReceta += obtenerCostoIngrediente(ss, rec[i][3], rec[i][1], Number(rec[i][2]), cacheData, tipoPedido);
      }
    }
    return costoSubReceta * Number(cantR);
  }
  
  if (!cacheData[hojaLimpia]) {
     let sh = ss.getSheetByName(hojaLimpia);
     cacheData[hojaLimpia] = sh ? sh.getDataRange().getValues() : [];
  }
  let shData = cacheData[hojaLimpia];

  for (let i = 1; i < shData.length; i++) {
    let itemInv = shData[i][0] ? String(shData[i][0]).trim().toUpperCase() : "";
    if (itemInv === nombreIng) {
      let rendimiento = Number(shData[i][8]) || 1;
      return (Number(shData[i][6]) / rendimiento) * Number(cantR); 
    }
  }
  return 0;
}

function generarReporteCostos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let shC = ss.getSheetByName("ANALISIS_COSTOS");
  if (!shC) {
    shC = ss.insertSheet("ANALISIS_COSTOS");
  } else {
    shC.clear();
  }
  
  shC.appendRow(["Producto Final", "Costo Real", "Precio Sugerido (66% Margen)", "Precio Redondeado", "Precio Actual (RECETAS)", "Ajuste Necesario"]);
  shC.getRange("A1:F1").setFontWeight("bold").setBackground("#343a40").setFontColor("white");
  const shR = ss.getSheetByName("RECETAS");
  if(!shR) return SpreadsheetApp.getUi().alert("❌ No se encontró la hoja RECETAS");
  
  const rec = shR.getDataRange().getValues();
  let productos = {};
  
  let cacheData = { "RECETAS": rec };
  for (let i = 1; i < rec.length; i++) {
    let nombre = String(rec[i][0]).trim().toUpperCase();
    if (!nombre) continue;
    
    let pr = Number(rec[i][4]) || 0;

    if (!productos[nombre]) {
      productos[nombre] = { costo: 0, precioActual: pr };
    } else {
       if (productos[nombre].precioActual === 0 && pr > 0) {
           productos[nombre].precioActual = pr;
       }
    }
    
    let ing = rec[i][1];
    let cant = Number(rec[i][2]);
    let hoja = rec[i][3];
    
    productos[nombre].costo += obtenerCostoIngrediente(ss, hoja, ing, cant, cacheData, "DOMICILIO");
  }
  
  let datosReporte = [];
  for (let prod in productos) {
    let costoReal = productos[prod].costo;
    let precioActual = productos[prod].precioActual;
    if (precioActual > 0 || costoReal > 0) {
      let precioSugerido = costoReal * 3;
      let precioRedondeado = Math.round(precioSugerido / 500) * 500;
      let ajuste = precioRedondeado - precioActual;
      
      datosReporte.push([prod, costoReal, precioSugerido, precioRedondeado, precioActual, ajuste]);
    }
  }
  
  if (datosReporte.length > 0) {
    shC.getRange(2, 1, datosReporte.length, 6).setValues(datosReporte);
    shC.getRange(2, 2, datosReporte.length, 5).setNumberFormat("$#,##0");
    
    for(let i = 0; i < datosReporte.length; i++) {
       let ajuste = datosReporte[i][5];
       let cell = shC.getRange(i + 2, 6);
       if (ajuste > 0) {
         cell.setBackground("#f8d7da").setFontColor("#721c24");
       } else if (ajuste < 0) {
         cell.setBackground("#d4edda").setFontColor("#155724");
       } else {
         cell.setBackground("#d1ecf1").setFontColor("#856404");
       }
    }
  }
  
  shC.autoResizeColumns(1, 6);
}

function aplicarPreciosSugeridos() {
  const ui = SpreadsheetApp.getUi();
  const respuesta = ui.alert(
    "⚠️ ACTUALIZACIÓN AUTOMÁTICA DE PRECIOS",
    "¿Estás seguro de que deseas sobreescribir los precios en tu hoja de RECETAS con los 'Precios Redondeados' del último Análisis de Costos?\n\nEsta acción modificará tu menú automáticamente.",
    ui.ButtonSet.YES_NO
  );
  if (respuesta !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shC = ss.getSheetByName("ANALISIS_COSTOS");
  const shR = ss.getSheetByName("RECETAS");
  if (!shC || !shR) {
    ui.alert("❌ Faltan hojas. Asegúrate de generar el Análisis de Costos primero.");
    return;
  }

  const dataC = shC.getDataRange().getValues();
  const dataR = shR.getDataRange().getValues();

  let filasConPrecio = {};
  for (let i = 1; i < dataR.length; i++) {
     let p = String(dataR[i][0]).trim().toUpperCase();
     let precio = Number(dataR[i][4]) || 0;
     if (!p) continue;

     if (precio > 0) {
         if (!filasConPrecio[p]) filasConPrecio[p] = [];
         filasConPrecio[p].push(i + 1);
     }
  }

  let actualizados = 0;
  for (let i = 1; i < dataC.length; i++) {
    let producto = String(dataC[i][0]).trim().toUpperCase();
    let precioRedondeado = Number(dataC[i][3]);
    let precioActual = Number(dataC[i][4]);

    if (producto && precioRedondeado > 0 && precioRedondeado !== precioActual) {
       let filas = filasConPrecio[producto];
       if (filas && filas.length > 0) {
           filas.forEach(f => {
               shR.getRange(f, 5).setValue(precioRedondeado);
           });
           actualizados++;
       }
    }
  }

  generarReporteCostos();
  ui.alert(`✅ ¡Precios actualizados!\n\nSe han modificado los precios de ${actualizados} productos en tu hoja de RECETAS y el reporte se ha vuelto a generar.`);
}

function formatearRecetas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("RECETAS");
  if (!sh) return;

  const ultimaFila = sh.getLastRow();
  if (ultimaFila < 2) return;

  const rangoDatos = sh.getRange(2, 1, ultimaFila - 1, sh.getLastColumn());
  rangoDatos.setBorder(false, false, false, false, false, false);
  rangoDatos.setBackground(null);

  const valores = sh.getRange(2, 1, ultimaFila - 1, 1).getValues();

  let inicioBloque = 2;
  let recetaActual = String(valores[0][0]).trim();
  let colorAlterno = true;

  for (let i = 1; i < valores.length; i++) {
    let recetaFila = String(valores[i][0]).trim();
    if (recetaFila !== "" && recetaFila !== recetaActual) {
      let numFilas = (i + 2) - inicioBloque;
      let bloqueRango = sh.getRange(inicioBloque, 1, numFilas, sh.getLastColumn());

      bloqueRango.setBorder(true, true, true, true, false, false, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      bloqueRango.setBackground(colorAlterno ? "#f8f9fa" : "#ffffff");
      colorAlterno = !colorAlterno;
      inicioBloque = i + 2;
      recetaActual = recetaFila;
    }
  }

  let numFilasUltimo = (valores.length + 2) - inicioBloque;
  let ultimoBloqueRango = sh.getRange(inicioBloque, 1, numFilasUltimo, sh.getLastColumn());
  ultimoBloqueRango.setBorder(true, true, true, true, false, false, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  ultimoBloqueRango.setBackground(colorAlterno ? "#f8f9fa" : "#ffffff");
  sh.getRange(1, 1, 1, sh.getLastColumn())
    .setBackground("#343a40")
    .setFontColor("white")
    .setFontWeight("bold")
    .setBorder(true, true, true, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  SpreadsheetApp.getUi().alert("✅ ¡Hoja de RECETAS formateada con éxito!");
}

function registrarCompra() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hC = ss.getSheetByName("COMPRAS_GASTOS");
  const dC = hC.getDataRange().getValues();
  
  let sheetsCache = {};
  let dataCache = {};
  for (let i = 1; i < dC.length; i++) {
    if (hC.getRange(i + 1, 1).getBackground() !== "#d9ead3" && dC[i][2] !== "") {
      let cant = Number(dC[i][3]);
      let costo = Number(dC[i][4]);
      if (isNaN(cant) || cant <= 0 || isNaN(costo) || costo < 0) continue;
      let nombreHoja = dC[i][5];
      if (!sheetsCache[nombreHoja]) {
          sheetsCache[nombreHoja] = ss.getSheetByName(nombreHoja);
          if (sheetsCache[nombreHoja]) dataCache[nombreHoja] = sheetsCache[nombreHoja].getDataRange().getValues();
      }
      
      const hI = sheetsCache[nombreHoja];
      const dI = dataCache[nombreHoja];
      
      if (hI && dI) {
        let itemC = String(dC[i][2]).trim().toUpperCase();
        for (let j = 1; j < dI.length; j++) {
          let itemInv = dI[j][0] ? String(dI[j][0]).trim().toUpperCase() : "";
          if (itemInv === itemC) {
            let entradasActuales = Number(dI[j][2]) || 0;
            let nuevasEntradas = entradasActuales + cant;
            hI.getRange(j + 1, 3).setValue(nuevasEntradas);
            hI.getRange(j + 1, 7).setValue(costo / cant);
            let stockInicial = Number(dI[j][1]) || 0;
            let salidas = Number(dI[j][3]) || 0; 
            let stockActualCalculado = stockInicial + nuevasEntradas - salidas;
            hI.getRange(j + 1, 5).setValue(stockActualCalculado);
            
            dI[j][2] = nuevasEntradas; 
            hC.getRange(i + 1, 1).setValue(new Date()).setBackground("#d9ead3");
            break;
          }
        }
      }
    }
  }
}

function registrarMermaOConsumo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shM = ss.getSheetByName("MERMAS_Y_CONSUMO");
  const mermas = shM.getDataRange().getValues();
  
  let sheetsCache = {};
  let dataCache = {};
  for (let i = 1; i < mermas.length; i++) {
    if (mermas[i][5] !== "PROCESADO") { 
      let cant = Number(mermas[i][2]);
      if (isNaN(cant) || cant <= 0) continue; 
      
      const insumo = mermas[i][1] ? String(mermas[i][1]).trim().toUpperCase() : "";
      const hoja = mermas[i][4];
      if (!sheetsCache[hoja]) {
          sheetsCache[hoja] = ss.getSheetByName(hoja);
          if (sheetsCache[hoja]) dataCache[hoja] = sheetsCache[hoja].getDataRange().getValues();
      }
      
      const shI = sheetsCache[hoja];
      const dI = dataCache[hoja];
      let mermaProcesada = false;
      
      if (shI && dI) {
        for (let j = 1; j < dI.length; j++) {
          let itemInv = dI[j][0] ? String(dI[j][0]).trim().toUpperCase() : "";
          if (itemInv === insumo) {
            let salidasActuales = Number(dI[j][3]) || 0;
            let nuevasSalidas = salidasActuales + cant;
            shI.getRange(j + 1, 4).setValue(nuevasSalidas);
            
            let stockInicial = Number(dI[j][1]) || 0;
            let entradas = Number(dI[j][2]) || 0;
            let stockActualCalculado = stockInicial + entradas - nuevasSalidas;
            shI.getRange(j + 1, 5).setValue(stockActualCalculado);
            dI[j][3] = nuevasSalidas; 
            mermaProcesada = true;
            break;
          }
        }
      }
      if (mermaProcesada) shM.getRange(i + 1, 6).setValue("PROCESADO");
    }
  }
}

function ejecutarCierreTurnoKDS() {
  return cierreDeTurno();
}

function cierreDeTurno() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const shB = ss.getSheetByName("BITACORA_DIARIA");
  const d = shP.getDataRange().getValues();
  
  let v = 0, tD = 0, uT = 0;
  let anuladosCount = 0;
  let desglosePagos = {};
  let newData = [d[0]];
  for (let i = 1; i < d.length; i++) {
    if (d[i][3] === "ENTREGADO ✅") { 
      v++;
      tD += Number(d[i][8]) || 0; 
      uT += Number(d[i][11]) || 0; 
      let metodo = d[i][10] ? String(d[i][10]).trim().toUpperCase() : "EFECTIVO";
      desglosePagos[metodo] = (desglosePagos[metodo] || 0) + (Number(d[i][8]) || 0);
    } else if (d[i][3] === "❌ ANULADO") { 
      anuladosCount++;
    } else {
      newData.push(d[i]); 
    }
  }
  
  if (v > 0) shB.appendRow([new Date(), tD, v, v, 0, "Cierre Exitoso", uT]);
  shP.getDataRange().clearContent();
  if (newData.length > 0) {
      shP.getRange(1, 1, newData.length, newData[0].length).setValues(newData);
  }
  
  return { ventas: v, total: tD, utilidad: uT, anulados: anuladosCount, pagos: desglosePagos };
}

function actualizarOcrearCliente(cel, nom, fecha) {
  if (!cel) return;
  const celBuscado = String(cel).trim();
  const shC = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DB_CLIENTES");
  if (!shC) return;
  const dC = shC.getDataRange().getValues();
  let fE = -1;
  for (let i = 1; i < dC.length; i++) { 
    if (dC[i][0] && String(dC[i][0]).trim() === celBuscado) { fE = i + 1;
      break; } 
  }
  if (fE !== -1) {
    shC.getRange(fE, 3).setValue(fecha);
    shC.getRange(fE, 4).setValue((Number(dC[fE - 1][3]) || 0) + 1);
  } else { shC.appendRow([cel, nom, fecha, 1, "Cliente Nuevo"]);
  }
}

function obtenerAlertasInventario() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojasAvisar = ["INV_COMIDA"]; 
  let alertas = [];
  hojasAvisar.forEach(nombreHoja => {
    const hoja = ss.getSheetByName(nombreHoja);
    if (hoja) {
      const data = hoja.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        let insumo = data[i][0]; 
        let stockActual = Number(data[i][4]); 
        let stockMinimo = Number(data[i][7]); 
        if (insumo && stockActual <= stockMinimo) {
          alertas.push(`${insumo} (Quedan: ${stockActual.toFixed(1)})`);
        }
      }
    }
  });
  return alertas;
}

function obtenerCatalogoCompras() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojas = ["INV_COMIDA", "INV_DESECHABLES", "INV_ASEO"];
  let catalogo = [];
  hojas.forEach(nombreHoja => {
    const sh = ss.getSheetByName(nombreHoja);
    if(sh) {
      const data = sh.getDataRange().getValues();
      for(let i = 1; i < data.length; i++) {
        if(data[i][0] && data[i][0] !== "") {
          catalogo.push({ nombre: String(data[i][0]).trim().toUpperCase(), hoja: nombreHoja, unidad: data[i][5] || 'Und' });
        }
      }
    }
  });
  return catalogo;
}

function obtenerPedidosReparto() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  if (!shP) return [];
  const ultimaFila = shP.getLastRow();
  if (ultimaFila < 2) return [];
  const d = shP.getRange(2, 1, ultimaFila - 1, 13).getValues();
  const shR = ss.getSheetByName("RECETAS");
  let precios = {};
  if (shR) {
    const rec = shR.getDataRange().getValues();
    for (let r = 1; r < rec.length; r++) {
      let nombre = rec[r][0] ? String(rec[r][0]).trim().toUpperCase() : "";
      let precio = Number(rec[r][4]) || 0;
      if (nombre) {
        if (precios[nombre] === undefined || (precios[nombre] === 0 && precio > 0)) {
          precios[nombre] = precio;
        }
      }
    }
  }

  let ticketsMap = {};
  for (let i = 0; i < d.length; i++) {
    let id = d[i][0] ? String(d[i][0]).trim() : "";
    if (!id) continue;
    
    let est = d[i][3] ? String(d[i][3]).trim() : "";
    let tipo = d[i][9] ? String(d[i][9]).trim().toUpperCase() : "LOCAL";
    
    if (tipo === "DOMICILIO" && ["PENDIENTE", "POR PAGAR 💰", "EN COCINA 👨‍🍳", "EN REPARTO 🛵"].includes(est)) {
      if (!ticketsMap[id]) {
        ticketsMap[id] = { 
          id: id, 
          cliente: d[i][5], 
          celular: d[i][6],
          direccion: d[i][12] || "Sin dirección", 
          notas: d[i][7], 
          est: est, 
          items: [], 
          total: 0, 
          metodo_pago: d[i][10] || "Efectivo" 
        };
      }
      ticketsMap[id].items.push(d[i][1] + " (x" + (Number(d[i][2]) || 1) + ")");
      
      let celdaPrecio = d[i][8];
      let precioGuardado = 0;
      
      if (celdaPrecio !== "" && celdaPrecio !== null) {
          precioGuardado = Number(celdaPrecio) || 0;
      } else {
          let nombreProd = d[i][1] ? String(d[i][1]).trim().toUpperCase() : "";
          precioGuardado = (precios[nombreProd] !== undefined ? precios[nombreProd] : 0) * (Number(d[i][2]) || 1);
      }
      ticketsMap[id].total += precioGuardado;
    }
  }
  return Object.values(ticketsMap);
}

function finalizarReparto(idPedido) {
  if (!idPedido) return;
  const idBuscado = String(idPedido).trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const d = shP.getDataRange().getValues();
  let clienteActualizado = false;

  for (let i = 1; i < d.length; i++) {
    let idActual = d[i][0] ? String(d[i][0]).trim() : "";
    if (idActual === idBuscado) {
      let est = d[i][3] ? String(d[i][3]).trim() : "";
      if (est === "EN REPARTO 🛵") {
        shP.getRange(i + 1, 4).setValue("ENTREGADO ✅");
        shP.getRange(i + 1, 1, 1, 13).setBackground(null);
        if (!clienteActualizado) {
          actualizarOcrearCliente(d[i][6], d[i][5], d[i][4]);
          clienteActualizado = true;
        }
      }
    }
  }
  return "OK";
}

function ejecutarConfirmacionPagoRemoto(turno) {
  if (!turno) return;
  const turnoBuscado = String(turno).trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const d = shP.getDataRange().getValues();
  
  for (let i = 1; i < d.length; i++) {
    let idCompleto = d[i][0] ? String(d[i][0]).trim() : "";
    if ((idCompleto.includes("-" + turnoBuscado + "-") || idCompleto.endsWith("-" + turnoBuscado) || idCompleto === turnoBuscado) && d[i][3] === "POR PAGAR 💰") {
      shP.getRange(i + 1, 4).setValue("PENDIENTE");
      shP.getRange(i + 1, 1, 1, 13).setBackground("#d9ead3");
    }
  }
  return "OK";
}
