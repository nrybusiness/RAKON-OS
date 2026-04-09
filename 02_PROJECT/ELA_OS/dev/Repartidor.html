<!DOCTYPE html>
<html lang="es">
<head>
  <base target="_top">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Repartidor - Hunger Burgers</title>
  <style>
    body { background-color: #f0f2f5; margin: 0; padding: 15px; font-family: sans-serif; }
    .header { text-align: center; margin-bottom: 20px; color: #333; background: white; padding: 10px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);}
    
    .grid-tickets { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 15px; }
    .ticket { background: white; border-radius: 12px; padding: 15px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); border-top: 10px solid #ccc; display: flex; flex-direction: column;}
    
    .t-porpagar { border-top-color: #dc3545; background: #fff5f5; }
    .t-pendiente { border-top-color: #ffc107; }
    .t-cocina { border-top-color: #0dcaf0; }
    .t-reparto { border-top-color: #6f42c1; } 
    
    .t-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
    .t-id { font-size: 22px; font-weight: 900; color: #333; }
    .t-badge { font-size: 12px; font-weight: bold; padding: 4px 8px; border-radius: 20px; background: #eee; }
    
    .t-cliente { font-size: 20px; font-weight: bold; color: #000; margin-bottom: 10px;}
    
    .btn-action { text-decoration: none; padding: 8px 12px; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block; margin-right: 5px; margin-bottom: 10px;}
    .btn-wa { background: #25D366; color: white; }
    .btn-call { background: #0d6efd; color: white; }
    .btn-map { background: #ea4335; color: white; } 
    
    .t-direccion { background: #e9ecef; padding: 10px; border-radius: 8px; font-size: 16px; font-weight: bold; margin-bottom: 10px; border-left: 5px solid #6c757d; }
    
    .item-list { margin: 10px 0; padding: 0; list-style: none; border-top: 1px dashed #ccc; padding-top: 10px; flex-grow: 1;}
    .item-list li { font-size: 16px; font-weight: 600; padding: 3px 0; color: #222; }
    
    .t-pago { display: flex; justify-content: space-between; align-items: center; font-size: 18px; font-weight: bold; background: #fff3cd; padding: 10px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #ffeeba;}
    .t-metodo { background: #ffc107; padding: 3px 8px; border-radius: 4px; font-size: 14px; color: #000;}
    
    .btn-ticket { width: 100%; padding: 15px; font-size: 18px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; color: white; margin-top: auto; transition: opacity 0.2s;}
    .btn-green { background: #198754; } .btn-red { background: #dc3545; }
    .btn-ticket:disabled { background: #e9ecef !important; color: #adb5bd !important; cursor: not-allowed; border: 1px solid #ced4da;}
    .btn-ticket:active { opacity: 0.8; }
    
    #loader { position: fixed; top: 10px; right: 10px; background: #333; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; display: none; z-index: 100;}

    .nota-cambio { background: #d4edda; color: #155724; padding: 8px; margin-top: 8px; border-radius: 6px; border: 2px solid #28a745; font-weight: bold; text-align: center; font-size: 16px; animation: parpadeoCambio 1.5s infinite; }
    @keyframes parpadeoCambio { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }
  </style>
</head>
<body>

  <div id="loader">Procesando...</div>

  <div class="header">
    <img src="https://humgerimages.carrd.co/assets/images/image07.png?v=9dc15a34" alt="Moto" style="height: 80px; margin-bottom: 10px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));">
    <h2 style="margin: 0;">🛵 Visor de Domicilios</h2>
  </div>

  <div id="pantalla-reparto" class="grid-tickets">
    <div id="estado-vacio" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-top: 40px;">
      <img src="https://humgerimages.carrd.co/assets/images/image18.png?v=9dc15a34" style="height: 120px; animation: parpadeoCambio 1.5s infinite; margin-bottom: 15px;">
      <h3 style="text-align:center; color:#6c757d;">Cargando pedidos...</h3>
    </div>
  </div>

  <script>
    // ==========================================
    // [MÓDULO 03] - ESTADO Y BLOQUEO DE UI       
    // ==========================================
    let procesando = false;

    function lockUI(status) {
      procesando = status;
      document.getElementById('loader').style.display = status ? 'block' : 'none';
      document.querySelectorAll('.btn-ticket').forEach(b => { 
          if(!b.hasAttribute('data-disabled-state')) {
              b.disabled = status; 
          }
      });
    }

    // ==========================================
    // [MÓDULO 04] - MOTOR DE RENDERIZADO (DOM)   
    // ==========================================
    function cargarRepartos() {
      if (typeof google === 'undefined') {
          document.getElementById('pantalla-reparto').innerHTML = '<h3 style="color:red; text-align:center; margin-top:40px;">Error: Entorno local detectado.</h3>';
          return;
      }

      google.script.run
      .withSuccessHandler(res => {
        if (!res || !Array.isArray(res)) { reintentarCarga(); return; }

        const cont = document.getElementById('pantalla-reparto');

        if (res.length === 0) {
            cont.innerHTML = '<div id="estado-vacio" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-top: 40px;"><img src="https://humgerimages.carrd.co/assets/images/image10.png?v=9dc15a34" style="height: 160px; margin-bottom: 15px;"><h3 style="text-align:center; color:#6c757d;">No hay domicilios activos ✅</h3></div>';
            reintentarCarga(); return;
        }

        let msgVacio = document.getElementById('estado-vacio');
        if (msgVacio) msgVacio.remove();

        let idsActuales = res.map(p => 'dom-' + p.id);
        
        Array.from(cont.children).forEach(child => { 
          if (child.id && child.id.startsWith('dom-') && !idsActuales.includes(child.id)) {
            cont.removeChild(child); 
          }
        });

        res.forEach(p => {
            try {
              let claseBorde = '', badge = '', botonHTML = '';
              let est = String(p.est || "").trim();

              if (est === "POR PAGAR 💰") {
                claseBorde = 't-porpagar'; badge = '🔴 Falta Pago';
                botonHTML = `<button class="btn-ticket btn-red" onclick="confirmarPago('${p.id}')">💰 Confirmar Pago</button>`;
              } else if (est === "PENDIENTE") {
                claseBorde = 't-pendiente'; badge = '⏳ En Cola';
                botonHTML = `<button class="btn-ticket" disabled data-disabled-state="true">Esperando a Cocina...</button>`;
              } else if (est === "EN COCINA 👨‍🍳") {
                claseBorde = 't-cocina'; badge = '🍳 Preparando';
                botonHTML = `<button class="btn-ticket" disabled data-disabled-state="true">Cocinando...</button>`;
              } else if (est === "EN REPARTO 🛵") {
                claseBorde = 't-reparto'; badge = '🛵 LISTO PARA LLEVAR';
                botonHTML = `<button class="btn-ticket btn-green" onclick="entregar('${p.id}')">✅ Confirmar Entrega</button>`;
              } else {
                claseBorde = 't-pendiente'; badge = est;
                botonHTML = `<button class="btn-ticket" disabled data-disabled-state="true">${est}</button>`;
              }

              let dirCompleta = String(p.direccion || "").trim() + ", Bello, Antioquia";
              let urlMapa = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(dirCompleta);
              let rawTel = String(p.celular || p.telefono || "").trim();
              let htmlContacto = "";
              
              if (rawTel.length > 0) {
                 let telLimpio = rawTel.replace(/\D/g, "");
                 if (telLimpio.length === 10 && telLimpio.startsWith("3")) telLimpio = "57" + telLimpio;
                 htmlContacto = telLimpio.length > 0 ? `<div style='font-size:16px; font-weight:bold; margin-bottom:8px; color:#333;'>📱 +${telLimpio}</div><a href='https://api.whatsapp.com/send?phone=${telLimpio}' target='_top' class='btn-action btn-wa'>💬 WhatsApp</a><a href='tel:+${telLimpio}' target='_top' class='btn-action btn-call'>📞 Llamar</a>` : "<span style='color:red;'>❌ Teléfono inválido</span><br>";
              } else {
                 htmlContacto = "<span style='color:red;'>❌ Sin teléfono registrado</span><br>";
              }

              let notasDesplegadas = '';
              let notasRaw = String(p.notas || "");
              if (notasRaw) {
                 if (notasRaw.includes('[💵 LLEVAR CAMBIO')) {
                    let parts = notasRaw.split('\n');
                    let cambioStr = parts.find(s => s.includes('[💵'));
                    let otras = parts.filter(s => !s.includes('[💵')).join(' ');
                    notasDesplegadas = `<div class="nota-cambio">${cambioStr}</div>`;
                    if(otras && otras.trim() !== '') notasDesplegadas += `<div style="font-size:14px; margin-top:5px; color:#dc3545;">📝 ${otras}</div>`;
                 } else {
                    notasDesplegadas = `<div style="font-size:14px; margin-top:5px;">📝 ${notasRaw}</div>`;
                 }
              }

              let idCorto = String(p.id).includes('-') ? String(p.id).split('-').slice(-2)[0] : String(p.id);
              let itemsHtml = Array.isArray(p.items) ? p.items.map(item => `<li>• ${item}</li>`).join('') : `<li>• ${p.items || ""}</li>`;

              let htmlInner = `
                <div class="t-header"><span class="t-id">#${idCorto}</span><span class="t-badge">${badge}</span></div>
                <div class="t-cliente">👤 ${p.cliente || "Cliente"}</div>
                <div>${htmlContacto}<a href="${urlMapa}" target="_blank" class="btn-action btn-map">🗺️ Mapa</a></div>
                <div class="t-direccion">📍 ${p.direccion || "Sin dirección"}${notasDesplegadas}</div>
                <ul class="item-list">${itemsHtml}</ul>
                <div class="t-pago"><div>Cobrar: <span style="color:#dc3545;">$${(Number(p.total) || 0).toLocaleString()}</span></div><div class="t-metodo">${String(p.metodo_pago || "EFECTIVO").toUpperCase()}</div></div>
                ${botonHTML}`;

              let hash = est + p.total + notasRaw + JSON.stringify(p.items);
              let existing = document.getElementById('dom-' + p.id);
              
              if (existing) {
                  if (existing.dataset.hash !== hash) { existing.innerHTML = htmlInner; existing.dataset.hash = hash; existing.className = `ticket ${claseBorde}`; }
              } else {
                  let div = document.createElement('div'); div.id = 'dom-' + p.id; div.className = `ticket ${claseBorde}`; div.dataset.hash = hash; div.innerHTML = htmlInner; cont.appendChild(div);
              }
            } catch (errLoop) { console.error("Error render:", errLoop); }
        }); reintentarCarga();
      })
      .withFailureHandler(err => {
        const cont = document.getElementById('pantalla-reparto');
        if (cont.children.length === 0 || cont.innerHTML.includes("Cargando")) {
            cont.innerHTML = `<div id="estado-vacio" style="grid-column: 1 / -1; background:#f8d7da; color:#721c24; padding:20px; border-radius:10px; text-align:center; margin-top:40px;"><h3>⚠️ RECONECTANDO...</h3></div>`;
        }
        setTimeout(cargarRepartos, 8000);
      }).obtenerPedidosReparto();
    }

    // ==========================================
    // [MÓDULO 05] - ACCIONES DE REPARTO          
    // ==========================================
    function entregar(id) {
      if (procesando) return; lockUI(true);
      google.script.run
        .withSuccessHandler(() => { lockUI(false); let t = document.getElementById('dom-' + id); if (t) t.remove(); cargarRepartos(); })
        .withFailureHandler(err => { lockUI(false); alert("Error: " + err.message); })
        .finalizarReparto(id);
    }

    function confirmarPago(id) {
      if (procesando) return; lockUI(true);
      let turnoCorte = String(id).includes('-') ? String(id).split('-').slice(-2)[0] : String(id);
      google.script.run
        .withSuccessHandler(() => { lockUI(false); cargarRepartos(); })
        .withFailureHandler(err => { lockUI(false); alert("Error: " + err.message); })
        .ejecutarConfirmacionPagoRemoto(turnoCorte);
    }

    // ==========================================
    // [MÓDULO 06] - INICIALIZACIÓN Y POLLING     
    // ==========================================
    function reintentarCarga() { if (!procesando) setTimeout(cargarRepartos, 5000); }
    window.onload = cargarRepartos;
  </script>
</body>
</html>
