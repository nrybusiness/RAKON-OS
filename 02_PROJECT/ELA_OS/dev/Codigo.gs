/**
 * RAKON - ENRUTADOR MAESTRO (Codigo.gs)
 * Gestión exclusiva de peticiones GET (Vistas) y POST (Endpoints).
 */

function doGet(e) {
  const modo = e?.parameter?.mode || 'menu';
  
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

  let archivo = 'Menu';
  if (modo === 'repartidor') archivo = 'Repartidor';
  if (modo === 'admin') archivo = 'Admin';
  if (modo === 'kds') archivo = 'KDS';
  if (modo === 'menu') archivo = 'Menu';
  
  const tmp = HtmlService.createTemplateFromFile(archivo);
  tmp.modo = modo;
  return tmp.evaluate()
      .setTitle('Hunger Burgers - ' + modo.toUpperCase())
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // <-- Directiva inyectada correctamente
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
