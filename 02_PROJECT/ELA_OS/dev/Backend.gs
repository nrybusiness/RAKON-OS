/**
 * RAKON - LÓGICA DE NEGOCIO (Backend.gs)
 * Base de datos, inventario y ejecución de reglas comerciales con IPS Activo.
 */

const COSTO_EMPAQUE_FIJO = 2000;
const VALOR_BASE_DOMICILIO = 2000;
const VALOR_KM_ADICIONAL = 2000;
const RADIO_MAXIMO_KM = 10;
const ORIGEN_RESTAURANTE = "Cl 20E #42-12, Zamora, Bello, Antioquia";
const TASA_KERNEL = 0.10;

function getRecetasCached() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("RECETAS_DATA");
  if (cached) return JSON.parse(cached);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("RECETAS");
  const data = sh ? sh.getDataRange().getValues() : [];
  
  if(data.length > 0) cache.put("RECETAS_DATA", JSON.stringify(data), 3600);
  return data;
}

function clearRecetasCache() {
  CacheService.getScriptCache().remove("RECETAS_DATA");
}

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
  if (nombreHoja === "RECETAS") clearRecetasCache();
  
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

function calcularTarifa(direccionDestino) {
  if (!direccionDestino) return { costo: 0, km: 0, error: "Dirección requerida." };
  try {
    const destinoFull = direccionDestino + ", Bello, Antioquia";
    const direcciones = Maps.newDirectionFinder()
      .setOrigin(ORIGEN_RESTAURANTE)
      .setDestination(destinoFull)
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .getDirections();
    if (direcciones.status !== 'OK' || !direcciones.routes[0]) {
      return { costo: VALOR_BASE_DOMICILIO, km: 0, error: "Ubicación ambigua. Tarifa base aplicada preventivamente." };
    }
    
    const leg = direcciones.routes[0].legs[0];
    const distanceKm = leg.distance.value / 1000;
    if (distanceKm > RADIO_MAXIMO_KM) {
      return { costo: 0, km: distanceKm, error: `Fuera de zona. Máximo ${RADIO_MAXIMO_KM} km.` };
    }
    
    let tarifaFinal = VALOR_BASE_DOMICILIO;
    if (distanceKm > 1) {
      const kmExtra = Math.ceil(distanceKm - 1);
      tarifaFinal += (kmExtra * VALOR_KM_ADICIONAL);
    }
    
    return { costo: tarifaFinal, km: distanceKm.toFixed(1), error: null };
  } catch (err) {
    return { costo: VALOR_BASE_DOMICILIO, km: 0, error: "Error de red. Tarifa base aplicada." };
  }
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
  let items = [];
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
      let nombreItem = d[i][1] ? String(d[i][1]).trim() : "";
      let cantItem = Number(d[i][2]) || 1;
      if (nombreItem && nombreItem !== "ORDEN VACÍA") {
        items.push({ nombre: nombreItem, cant: cantItem });
      }
    }
  }

  return { encontrado: true, cliente: cliente, estado: estado, tipo: tipo, total: totalCalculado, metodo: metodo, items: items };
}

function obtenerMenuPOS() {
  const data = getRecetasCached();
  if (data.length === 0) return [];
  
  let mapPOS = {};
  let reqEmpaque = {};
  let catMap = {};
  
  for (let i = 1; i < data.length; i++) {
    let prod = String(data[i][0]).trim().toUpperCase();
    let ing = String(data[i][1]).trim().toUpperCase();
    let precio = Number(data[i][4]) || 0;
    let categoriaRaw = String(data[i][5] || "").trim().toUpperCase();
    let imgUrl = String(data[i][6] || "").trim();
    let descripcionTexto = String(data[i][7] || "").trim(); 

    if (!prod) continue;
    if (categoriaRaw !== "" && !catMap[prod]) catMap[prod] = categoriaRaw;
    
    if (precio > 0) {
        if (mapPOS[prod] === undefined || mapPOS[prod].precio === 0) {
            mapPOS[prod] = { 
              precio: precio, 
              imagen: imgUrl,
              descripcion: descripcionTexto
            };
        } else if (descripcionTexto !== "" && !mapPOS[prod].descripcion) {
            mapPOS[prod].descripcion = descripcionTexto;
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
        precio: mapPOS[prod].precio, 
        imagen: mapPOS[prod].imagen, 
        requiereEmpaque: !!reqEmpaque[prod], 
        categoria: catOficial,
        descripcion: mapPOS[prod].descripcion || ""
    });
  }
  
  catalogo.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return catalogo;
}

// 🛡️ MÓDULO IPS: Intrusion Prevention System
function verificarBloqueo(uid, celular) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName("BLACKLIST");
  if (!sh) return false;
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    let baneado = String(data[i][0]).trim();
    if (baneado === String(uid).trim() || (celular && baneado === String(celular).trim())) {
      return true;
    }
  }
  return false;
}

function registrarEnBlacklist(identificador, motivo) {
  if (!identificador) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName("BLACKLIST");
  if (!sh) {
     sh = ss.insertSheet("BLACKLIST");
     sh.appendRow(["IDENTIFICADOR", "MOTIVO", "FECHA"]);
     sh.getRange("A1:C1").setBackground("#000000").setFontColor("white").setFontWeight("bold");
  }
  sh.appendRow([identificador, motivo, new Date()]);
}

// 🍔 LÓGICA DE PEDIDOS CON BOLSA DE SALSAS GRATIS
function guardarPedidoPOS(clienteObj, carritoJSON, uid) {
  if (verificarBloqueo(uid, clienteObj.celular)) {
      throw new Error("ACCESO DENEGADO: El dispositivo o usuario se encuentra bloqueado por políticas de seguridad.");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  let carrito = JSON.parse(carritoJSON);
  let nombre = sanitizarTexto(clienteObj.nombre || "Cliente POS").toUpperCase();
  let celular = sanitizarTexto(clienteObj.celular || "");
  let direccion = sanitizarTexto(clienteObj.direccion || "");
  let notas = sanitizarTexto(clienteObj.notas || "");
  let tipo_pedido = sanitizarTexto(clienteObj.tipo_pedido || "LOCAL").toUpperCase();
  let metodo_pago = sanitizarTexto(clienteObj.metodo_pago || "EFECTIVO").toUpperCase();
  let turnoTemp = Math.floor(1000 + Math.random() * 9000).toString();
  const timestampID = Date.now().toString(36).toUpperCase().slice(-6);
  let idOficial = celular ? `${celular}-${turnoTemp}-${timestampID}` : `POS-${turnoTemp}-${timestampID}`;
  let fechaActual = new Date();
  let estadoInicial = (metodo_pago === "NEQUI" || (["LOCAL", "LOCAL ⚡", "PARA LLEVAR"].includes(tipo_pedido) && metodo_pago === "EFECTIVO")) ?
  "POR PAGAR 💰" : "PENDIENTE";

  if (tipo_pedido === "DOMICILIO") {
     let existeDom = carrito.find(i => String(i.nombre).toUpperCase() === "DOMICILIO");
     if (!existeDom) carrito.push({nombre: "DOMICILIO", cant: 1, precioTotalCalculado: VALOR_BASE_DOMICILIO});
  }

  if (tipo_pedido === "DOMICILIO" || tipo_pedido === "PARA LLEVAR") {
     let existeEmp = carrito.find(i => String(i.nombre).toUpperCase() === "COSTO EMPAQUE");
     if (!existeEmp) carrito.push({nombre: "COSTO EMPAQUE", cant: 1, precioTotalCalculado: COSTO_EMPAQUE_FIJO});
  }

  const recetasData = getRecetasCached();
  let preciosSeguros = {};
  for(let r = 1; r < recetasData.length; r++) {
      if(recetasData[r][0]) {
          preciosSeguros[String(recetasData[r][0]).trim().toUpperCase()] = Number(recetasData[r][4]) || 0;
      }
  }

  if (carrito.length === 0) {
     shP.appendRow([idOficial, "ORDEN VACÍA", 1, estadoInicial, fechaActual, nombre, celular, notas, 0, tipo_pedido, metodo_pago, "", direccion]);
  } else {
     let manipulacionDetectada = false;

     // 👇 INICIO: CÁLCULO DE BOLSA GLOBAL DE SALSAS GRATIS 👇
     let salsasGratisDisponibles = 0;
     carrito.forEach(item => {
         let nombreItemTemp = sanitizarTexto(item.nombre).toUpperCase();
         // Consideramos como "producto principal" a todo lo que NO sea salsa, domicilio ni empaque
         if (!nombreItemTemp.includes("SALSA") && 
             !nombreItemTemp.includes("DOMICILIO") && 
             !nombreItemTemp.includes("EMPAQUE") && 
             nombreItemTemp !== "CABRA DE ORO") {
             
             let cantP = Math.max(1, Number(item.cant) || 1); 
             salsasGratisDisponibles += (cantP * 2); // Agrega 2 salsas al pozo por cada producto
         }
     });
     // 👆 FIN CÁLCULO 👆

     let filas = carrito.map(item => {
        let nombreItem = sanitizarTexto(item.nombre).toUpperCase();
        
        // Parche de seguridad para que no inyecten cantidades negativas
        let cantReal = Math.max(1, Number(item.cant) || 1);

        let precioBaseBd = preciosSeguros[nombreItem] || 0;
        let precioForzado = precioBaseBd * cantReal;
        let precioFrontend = item.precioTotalCalculado !== undefined ? Number(item.precioTotalCalculado) : (Number(item.precio) * cantReal);

        // Tolerancia Dinámica IPS
        if (nombreItem === "DOMICILIO") {
            if (precioFrontend < VALOR_BASE_DOMICILIO) precioFrontend = VALOR_BASE_DOMICILIO; 
            precioForzado = precioFrontend; 
        } else if (nombreItem === "COSTO EMPAQUE") {
            precioForzado = COSTO_EMPAQUE_FIJO * cantReal;
            if (precioFrontend < precioForzado) precioFrontend = precioForzado;
        
        // 👇 INICIO: APLICACIÓN DE SALSAS AL IPS 👇
        } else if (nombreItem.includes("SALSA")) {
            let salsasACobrar = 0;
            
            // Consumimos las salsas del "pozo global"
            if (salsasGratisDisponibles >= cantReal) {
                salsasGratisDisponibles -= cantReal;
                salsasACobrar = 0;
            } else {
                salsasACobrar = cantReal - salsasGratisDisponibles;
                salsasGratisDisponibles = 0; 
            }
            
            // Cobramos solo las que superen el límite
            precioForzado = precioBaseBd * salsasACobrar;
            
            // Auto-corrección: Si el frontend manda un precio menor al forzado, 
            // ajustamos el precio para cobrarlo bien, SIN enviar a Blacklist.
            if (precioFrontend < precioForzado) {
                precioFrontend = precioForzado;
            }
        // 👆 FIN SALSAS 👆

        } else if (nombreItem !== "CABRA DE ORO") {
            // Evaluamos artículos normales
            if (precioFrontend < precioForzado) {
                manipulacionDetectada = true;
            }
        }

        return [idOficial, nombreItem, cantReal, estadoInicial, fechaActual, nombre, celular, notas, precioFrontend, tipo_pedido, metodo_pago, "", direccion];
     });

     if (manipulacionDetectada) {
         registrarEnBlacklist(uid, "Parameter Tampering - Modificación de Precios");
         if (celular) registrarEnBlacklist(celular, "Parameter Tampering - Modificación de Precios");
         throw new Error("TRANSACCIÓN ABORTADA: Violación de integridad detectada. El dispositivo ha sido bloqueado.");
     }

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
  let hojasModificadas = new Set();
  
  for (let i = d.length - 1; i >= 1; i--) {
    let idActual = d[i][0] ? String(d[i][0]).trim() : "";
    if (idActual === String(idAEditar).trim()) {
       fechaOriginal = d[i][4] || new Date();
       let estado = d[i][3] ? String(d[i][3]).trim() : "";
       estadoOriginal = estado;
       if (estado !== "PENDIENTE" && estado !== "POR PAGAR 💰" && estado !== "EN COCINA 👨‍🍳") throw new Error("El pedido ya está en reparto o despachado. No se puede modificar.");
       if (estado === "EN COCINA 👨‍🍳") {
           let tipoP = d[i][9] ? String(d[i][9]).toUpperCase() : "LOCAL";
           let tipoPedidoLogico = (tipoP === "DOMICILIO" || tipoP === "PARA LLEVAR") ? "DOMICILIO" : "LOCAL";
           motorInventario(ss, d[i][1], d[i][2], true, [], cacheHojasObj, cacheDataObj, tipoPedidoLogico, hojasModificadas);
       }
       shP.deleteRow(i + 1);
       filasBorradas = true;
    }
  }
  
  for (let hoja of hojasModificadas) {
    let sheet = cacheHojasObj[hoja];
    let data = cacheDataObj[hoja];
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  }

  if (!filasBorradas) throw new Error("No se encontró el pedido a modificar.");
  return guardarPedidoPOS(clienteObj, carritoJSON, "ADMIN_MOD");
}

function guardarExtraTicketRemoto(idPedido, extraName, cobroExtra) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const d = shP.getDataRange().getValues();
  let idBuscado = String(idPedido).trim();
  let datosPedido = null;
  for (let i = 1; i < d.length; i++) {
    if (d[i][0] && String(d[i][0]).trim() === idBuscado) { datosPedido = d[i];
      break; }
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
  if (d.length <= 1) return SpreadsheetApp.getUi().alert("No hay pedidos para revisar.");

  let pedidosMap = {};
  for (let i = 1; i < d.length; i++) {
    let id = String(d[i][0]).trim();
    if (!id) continue;
    let nombreProd = String(d[i][1]).trim().toUpperCase();
    let estado = String(d[i][3]).trim();
    let tipo = String(d[i][9]).trim().toUpperCase();
    if (estado === "ENTREGADO ✅" || estado === "❌ ANULADO") continue;
    if (!pedidosMap[id]) pedidosMap[id] = { esDomicilio: (tipo === "DOMICILIO"), tieneItemDom: false, refData: d[i] };
    if (nombreProd === "DOMICILIO") pedidosMap[id].tieneItemDom = true;
  }

  let filasAInsertar = [];
  let insertados = 0;
  for (let id in pedidosMap) {
    let p = pedidosMap[id];
    if (p.esDomicilio && !p.tieneItemDom) {
      let ref = p.refData;
      filasAInsertar.push([id, "DOMICILIO", 1, ref[3], ref[4], ref[5], ref[6], "Añadido por Migración", VALOR_BASE_DOMICILIO, ref[9], ref[10], 0, ref[12]]);
      insertados++;
    }
  }

  if (filasAInsertar.length > 0) {
    shP.getRange(shP.getLastRow() + 1, 1, filasAInsertar.length, 13).setValues(filasAInsertar);
    SpreadsheetApp.getUi().alert(`✅ Migración completada.\n\nSe añadieron ${insertados} ítems de 'DOMICILIO'.`);
  } else {
    SpreadsheetApp.getUi().alert("ℹ️ Todo al día.");
  }
}

function acumularRequerimientos(nombreProd, cant, cacheHojas, reqMap, tipoPedido = "DOMICILIO") {
  if (!nombreProd) return;
  let nombreTrim = String(nombreProd).trim().replace(/\[LLEVAR\]/ig, "").trim().toUpperCase();
  const rec = getRecetasCached();
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
  
  const rec = getRecetasCached();
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
      for (let item of t.itemsObj) { acumularRequerimientos(item.nombre, item.cant, cacheHojas, reqMap, tipoPedidoParaReq);
      }
      
      let faltantes = [];
      for (let key in reqMap) { if (reqMap[key].stock < (reqMap[key].gasto - 0.0001)) { faltantes.push(reqMap[key].nombre);
      } }
      if (faltantes.length > 0) { t.bloqueado = true; t.motivosBloqueo = [...new Set(faltantes)];
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
      if (!shP) throw new Error("Hoja base no encontrada");
      
      const d = shP.getDataRange().getValues();
      const rec = getRecetasCached();
      let clienteActualizado = false;

      let cacheHojas = {}; 
      let cacheData = { "RECETAS": rec };
      let hojasModificadas = new Set();
      let tipoPedidoTicket = "LOCAL";

      for (let i = 1; i < d.length; i++) {
        let idActual = d[i][0] ? String(d[i][0]).trim() : "";
        if (idActual === idBuscado) { tipoPedidoTicket = d[i][9] ? String(d[i][9]).trim().toUpperCase() : "LOCAL"; break;
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
            if (celdaPrecio !== "" && celdaPrecio !== null) { pVentaFinal = (Number(celdaPrecio) || 0) / Number(d[i][2]);
            } 
            else { pVentaFinal = pVenta;
            }
            
            shP.getRange(i + 1, 9).setValue(pVentaFinal * d[i][2]);
            shP.getRange(i + 1, 12).setValue((pVentaFinal * d[i][2]) - (cTotal * d[i][2]));
            
            motorInventario(ss, d[i][1], d[i][2], false, omitir, cacheHojas, cacheData, tipoPedidoLogico, hojasModificadas);
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
              if (!clienteActualizado) { actualizarOcrearCliente(d[i][6], d[i][5], d[i][4]); clienteActualizado = true;
              }
            }
          }
        }
      }
      
      for (let hoja of hojasModificadas) {
        let sheet = cacheHojas[hoja];
        let data = cacheData[hoja];
        sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
        
        for (let j = 1; j < data.length; j++) {
            let stockActual = Number(data[j][4]) || 0;
            let stockMinimo = Number(data[j][7]) || 0;
            if (stockActual <= stockMinimo) sheet.getRange(j + 1, 5).setBackground("#ea9999");
            else sheet.getRange(j + 1, 5).setBackground(null);
        }
      }
      
      return "OK";
  } catch (err) { throw new Error(err.message); }
}

function ajustarTotalPedidoRemoto(idPedido, diferencia) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const d = shP.getDataRange().getValues();
  let idBuscado = String(idPedido).trim();
  let datosPedido = null;
  for (let i = 1; i < d.length; i++) {
    if (d[i][0] && String(d[i][0]).trim() === idBuscado) { datosPedido = d[i];
      break; }
  }
  if (!datosPedido) throw new Error("Pedido no encontrado.");
  shP.appendRow([idBuscado, "AJUSTE DE PRECIO ADMIN", 1, datosPedido[3], new Date(), datosPedido[5], datosPedido[6], "Ajuste manual", diferencia, datosPedido[9], datosPedido[10], 0, datosPedido[12]]);
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
      if (["EN COCINA 👨‍🍳", "POR PAGAR 💰", "PENDIENTE", "EN REPARTO 🛵"].includes(d[i][3])) { ejecutarLogicaAnulacion(i + 1);
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
    let hojasModificadas = new Set();
    let cacheHojasObj = {};
    let cacheDataObj = {};
    motorInventario(ss, filaData[1], filaData[2], true, [], cacheHojasObj, cacheDataObj, tipoPedidoLogico, hojasModificadas);
    for (let hoja of hojasModificadas) {
        let sheet = cacheHojasObj[hoja];
        let data = cacheDataObj[hoja];
        sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    }
  }
  shP.getRange(f, 4).setValue("❌ ANULADO").setBackground("#ea9999");
}

function motorInventario(ss, prod, cant, modoA, omitir = [], cacheHojasObj = {}, cacheDataObj = {}, tipoPedido = "DOMICILIO", hojasModificadas = new Set()) {
  if (!prod) return;
  let nombreProdLimpio = String(prod).trim().replace(/\[LLEVAR\]/ig, "").trim().toUpperCase();
  if (omitir.includes(nombreProdLimpio)) return;

  if (!cacheDataObj["RECETAS"]) cacheDataObj["RECETAS"] = getRecetasCached();
  
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
        motorInventario(ss, ingredienteOriginal, cantIngrediente * Number(cant), modoA, omitir, cacheHojasObj, cacheDataObj, tipoPedido, hojasModificadas);
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
            let stockInicial = Number(dI[j][1]) || 0;
            let entradas = Number(dI[j][2]) || 0;
            let stockActualCalculado = stockInicial + entradas - nuevasSalidas;
            dI[j][3] = nuevasSalidas;
            dI[j][4] = stockActualCalculado;
            hojasModificadas.add(hojaDestino);
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
          let stockInicial = Number(dI[j][1]) || 0;
          let entradas = Number(dI[j][2]) || 0;
          let stockActualCalculado = stockInicial + entradas - nuevasSalidas;
          dI[j][3] = nuevasSalidas;
          dI[j][4] = stockActualCalculado;
          hojasModificadas.add(h);
          return; 
        }
      }
    }
  }
}

function obtenerRecetaProducto(nombreProd) {
  const data = getRecetasCached();
  let receta = [];
  for(let i = 1; i < data.length; i++) {
    if(String(data[i][0]).trim().toUpperCase() === String(nombreProd).trim().toUpperCase()) {
      receta.push({ ingrediente: String(data[i][1]).trim().toUpperCase(), cantidad: data[i][2] });
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
    if (!cacheData["RECETAS"]) cacheData["RECETAS"] = getRecetasCached();
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
  if (!shC) shC = ss.insertSheet("ANALISIS_COSTOS"); else shC.clear();
  shC.appendRow(["Producto Final", "Costo Real", "Precio Sugerido (66% Margen)", "Precio Redondeado", "Precio Actual (RECETAS)", "Ajuste Necesario"]);
  shC.getRange("A1:F1").setFontWeight("bold").setBackground("#343a40").setFontColor("white");
  
  const rec = getRecetasCached();
  let productos = {};
  let cacheData = { "RECETAS": rec };
  for (let i = 1; i < rec.length; i++) {
    let nombre = String(rec[i][0]).trim().toUpperCase();
    if (!nombre) continue;
    let pr = Number(rec[i][4]) || 0;

    if (!productos[nombre]) productos[nombre] = { costo: 0, precioActual: pr };
    else if (productos[nombre].precioActual === 0 && pr > 0) productos[nombre].precioActual = pr;
    
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
       if (ajuste > 0) cell.setBackground("#f8d7da").setFontColor("#721c24");
       else if (ajuste < 0) cell.setBackground("#d4edda").setFontColor("#155724");
       else cell.setBackground("#d1ecf1").setFontColor("#856404");
    }
  }
  shC.autoResizeColumns(1, 6);
  clearRecetasCache();
}

function aplicarPreciosSugeridos() {
  const ui = SpreadsheetApp.getUi();
  const respuesta = ui.alert("⚠️ ACTUALIZACIÓN AUTOMÁTICA DE PRECIOS", "¿Sobreescribir precios en RECETAS?", ui.ButtonSet.YES_NO);
  if (respuesta !== ui.Button.YES) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shC = ss.getSheetByName("ANALISIS_COSTOS");
  const shR = ss.getSheetByName("RECETAS");
  if (!shC || !shR) return ui.alert("❌ Faltan hojas. Genera Análisis primero.");

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
           filas.forEach(f => { shR.getRange(f, 5).setValue(precioRedondeado); });
           actualizados++;
       }
    }
  }
  clearRecetasCache();
  generarReporteCostos();
  ui.alert(`✅ ¡Precios actualizados!\n\nSe han modificado ${actualizados} productos.`);
}

function formatearRecetas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("RECETAS");
  if (!sh) return;
  const ultimaFila = sh.getLastRow();
  if (ultimaFila < 2) return;

  const rangoDatos = sh.getRange(2, 1, ultimaFila - 1, sh.getLastColumn());
  rangoDatos.setBorder(false, false, false, false, false, false).setBackground(null);
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
  sh.getRange(1, 1, 1, sh.getLastColumn()).setBackground("#343a40").setFontColor("white").setFontWeight("bold").setBorder(true, true, true, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
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

function ejecutarCierreTurnoKDS() { return cierreDeTurno(); }

function cierreDeTurno() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shP = ss.getSheetByName("PEDIDOS_ACTIVOS");
  const shB = ss.getSheetByName("BITACORA_DIARIA");
  
  let shH = ss.getSheetByName("HISTORICO_PEDIDOS");
  if (!shH) {
    shH = ss.insertSheet("HISTORICO_PEDIDOS");
    const headers = shP.getRange(1, 1, 1, shP.getLastColumn()).getValues()[0];
    shH.appendRow(headers);
    shH.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#343a40").setFontColor("white");
  }

  const d = shP.getDataRange().getValues();
  let v = 0, tD = 0, uT = 0, anuladosCount = 0, valorAnulados = 0, tComisionKernel = 0;
  let tNequi = 0, tEfectivo = 0;
  let newData = [d[0]];
  let historicoData = []; 

  let ticketsUnicos = new Set();
  let ticketsAnuladosUnicos = new Set();

  for (let i = 1; i < d.length; i++) {
    let estado = String(d[i][3]).trim();
    let idPedido = String(d[i][0]).trim();
    let precioItem = Number(d[i][8]) || 0;
    let utilidadItem = Number(d[i][11]) || 0;
    let metodo = d[i][10] ? String(d[i][10]).trim().toUpperCase() : "EFECTIVO";
    let nombreProd = String(d[i][1]).trim().toUpperCase();
    if (estado === "ENTREGADO ✅") { 
      v++;
      ticketsUnicos.add(idPedido);
      tD += precioItem; 
      uT += utilidadItem;
      if (nombreProd !== "DOMICILIO" && nombreProd !== "COSTO EMPAQUE") {
          tComisionKernel += (precioItem * TASA_KERNEL);
      }
      
      if (metodo.includes("NEQUI")) tNequi += precioItem;
      else tEfectivo += precioItem; 
      
      historicoData.push(d[i]);
    } else if (estado === "❌ ANULADO") { 
      anuladosCount++;
      ticketsAnuladosUnicos.add(idPedido);
      valorAnulados += precioItem;
      historicoData.push(d[i]);
    } else { 
      newData.push(d[i]);
    }
  }

  let numPedidosReales = ticketsUnicos.size;
  let ticketPromedio = numPedidosReales > 0 ? (tD / numPedidosReales) : 0;
  let rentabilidad = tD > 0 ? (uT / tD) : 0;
  if (v > 0) {
      shB.appendRow([
        new Date(), 
        tD, 
        v, 
        numPedidosReales, 
        anuladosCount, 
        "Cierre Exitoso", 
        uT,
        ticketPromedio,
        rentabilidad,
        tNequi,
        tEfectivo,
        valorAnulados,
        tComisionKernel
      ]);
      let lastRow = shB.getLastRow();
      shB.getRange(lastRow, 8).setNumberFormat("$#,##0"); 
      shB.getRange(lastRow, 9).setNumberFormat("0.00%"); 
      shB.getRange(lastRow, 10).setNumberFormat("$#,##0"); 
      shB.getRange(lastRow, 11).setNumberFormat("$#,##0"); 
      shB.getRange(lastRow, 12).setNumberFormat("$#,##0");
      shB.getRange(lastRow, 13).setNumberFormat("$#,##0");
  }

  if (historicoData.length > 0) {
      shH.getRange(shH.getLastRow() + 1, 1, historicoData.length, historicoData[0].length).setValues(historicoData);
  }

  shP.getDataRange().clearContent();
  if (newData.length > 0) {
      shP.getRange(1, 1, newData.length, newData[0].length).setValues(newData);
  }
  
  return { ventas: v, total: tD, utilidad: uT, anulados: anuladosCount, nequi: tNequi, efectivo: tEfectivo, comision_kernel: tComisionKernel };
}

function actualizarOcrearCliente(cel, nom, fecha) {
  if (!cel) return;
  const celBuscado = String(cel).trim();
  const shC = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DB_CLIENTES");
  if (!shC) return;
  const dC = shC.getDataRange().getValues();
  let fE = -1;
  for (let i = 1; i < dC.length; i++) { if (dC[i][0] && String(dC[i][0]).trim() === celBuscado) { fE = i + 1;
      break; } }
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
        let insumo = data[i][0]; let stockActual = Number(data[i][4]); let stockMinimo = Number(data[i][7]); 
        if (insumo && stockActual <= stockMinimo) alertas.push(`${insumo} (Quedan: ${stockActual.toFixed(1)})`);
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
        if(data[i][0] && data[i][0] !== "") catalogo.push({ nombre: String(data[i][0]).trim().toUpperCase(), hoja: nombreHoja, unidad: data[i][5] || 'Und' });
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
  const rec = getRecetasCached();
  let precios = {};
  
  for (let r = 1; r < rec.length; r++) {
    let nombre = rec[r][0] ? String(rec[r][0]).trim().toUpperCase() : "";
    let precio = Number(rec[r][4]) || 0;
    if (nombre) {
      if (precios[nombre] === undefined || (precios[nombre] === 0 && precio > 0)) precios[nombre] = precio;
    }
  }

  let ticketsMap = {};
  for (let i = 0; i < d.length; i++) {
    let id = d[i][0] ? String(d[i][0]).trim() : "";
    if (!id) continue;
    let est = d[i][3] ? String(d[i][3]).trim() : "";
    let tipo = d[i][9] ? String(d[i][9]).trim().toUpperCase() : "LOCAL";
    
    if (tipo === "DOMICILIO" && ["PENDIENTE", "POR PAGAR 💰", "EN COCINA 👨‍🍳", "EN REPARTO 🛵"].includes(est)) {
      if (!ticketsMap[id]) ticketsMap[id] = { id: id, cliente: d[i][5], celular: d[i][6], direccion: d[i][12] || "Sin dirección", notas: d[i][7], est: est, items: [], total: 0, metodo_pago: d[i][10] || "Efectivo" };
      ticketsMap[id].items.push(d[i][1] + " (x" + (Number(d[i][2]) || 1) + ")");
      let celdaPrecio = d[i][8];
      let precioGuardado = 0;
      if (celdaPrecio !== "" && celdaPrecio !== null) { precioGuardado = Number(celdaPrecio) || 0;
      } 
      else {
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
        if (!clienteActualizado) { actualizarOcrearCliente(d[i][6], d[i][5], d[i][4]); clienteActualizado = true;
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

function obtenerEstadoLocal() { return PropertiesService.getScriptProperties().getProperty('ESTADO_LOCAL') || 'AUTO';
}
function fijarEstadoLocal(estado) { PropertiesService.getScriptProperties().setProperty('ESTADO_LOCAL', estado); return estado; }

function marcarPedidoRushRemoto(idStr) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PEDIDOS_ACTIVOS');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(idStr)) {
      let notasActuales = data[i][9] || "";
      if (!notasActuales.includes("[RUSH ⚡]")) sheet.getRange(i + 1, 10).setValue("[RUSH ⚡] " + notasActuales);
      return true;
    }
  }
  return false;
}
