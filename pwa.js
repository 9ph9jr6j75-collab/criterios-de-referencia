/* Instalación voluntaria: las instrucciones no cambian la ficha ni cargan PDF. */
(() => {
  'use strict';
  const APP_NAME = 'Criterios de referencia';
  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  let installPrompt = null, lastTrigger = null, chosenDevice = '', dialog = null;
  let nativeInstallPending = false, confirmedInstalled = false;
  const isInstalled = () => confirmedInstalled || navigator.standalone === true || standaloneQuery.matches;
  const detectedDevice = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iphone' : /Android/i.test(navigator.userAgent) ? 'android' : 'computer';
  const appURL = () => new URL('index.html', document.baseURI).href;
  const $ = id => document.getElementById(id);

  function announce(message) {
    const status = $('install-status');
    if (status) status.textContent = message;
  }
  function syncEntrypoints() {
    const installed = isInstalled();
    document.querySelectorAll('[data-install-app]').forEach(entry => {
      const text = entry.querySelector('[data-install-label]');
      if (text) text.textContent = installed ? 'App instalada' : 'Instalar app';
      else if (!entry.children.length) entry.textContent = installed ? 'App instalada' : 'Instalar app';
      if (entry.tagName === 'BUTTON') entry.disabled = installed;
      entry.setAttribute('aria-disabled', String(installed));
      entry.setAttribute('aria-label', installed ? 'La app ya está abierta como aplicación' : 'Ver cómo instalar Criterios de referencia');
      entry.dataset.installState = installed ? 'installed' : 'available';
    });
    const native = $('install-native');
    if (native) {
      native.hidden = !installPrompt || installed;
      native.disabled = nativeInstallPending;
    }
  }
  function chooseDevice(device) {
    if (!['iphone','android','computer'].includes(device)) return;
    chosenDevice = device;
    dialog.querySelectorAll('[data-install-device]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.installDevice === device)));
    dialog.querySelectorAll('[data-install-panel]').forEach(panel => panel.hidden = panel.dataset.installPanel !== device);
  }
  function buildDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.id = 'install-dialog';
    dialog.className = 'install-dialog no-print';
    dialog.setAttribute('aria-labelledby','install-title');
    dialog.setAttribute('aria-describedby','install-description');
    dialog.innerHTML = `
      <div class="install-header"><span>Acceso en su dispositivo</span><button type="button" id="install-close" class="icon-button" aria-label="Cerrar instrucciones de instalación">×</button></div>
      <div class="install-app-heading"><img src="assets/icon-192-v12.png" width="64" height="64" alt=""><div><p class="eyebrow">DRIPSSHA · Huetar Atlántica</p><h2 id="install-title">Cómo instalar ${APP_NAME}</h2></div></div>
      <p id="install-description" class="install-intro">Agregue el ícono al teléfono o a la computadora y abra los criterios desde ahí.</p>
      <div class="install-browser-note"><strong>Si abrió el enlace desde WhatsApp, correo o dentro de otra app</strong><p>Copie el enlace y ábralo en Safari en iPhone o iPad, o en Chrome en Android. En computadora puede usar Chrome, Edge o Safari.</p><button type="button" id="install-copy-link" class="button button-secondary">Copiar enlace de la app</button></div>
      <div class="install-device-tabs" role="group" aria-label="Instrucciones según dispositivo"><button type="button" data-install-device="iphone" aria-pressed="false">iPhone / iPad</button><button type="button" data-install-device="android" aria-pressed="false">Android</button><button type="button" data-install-device="computer" aria-pressed="false">Computadora</button></div>
      <button type="button" id="install-native" class="button button-primary" hidden>Instalar en este dispositivo</button>
      <section class="install-device-panel" data-install-panel="iphone" hidden><h3>En iPhone o iPad · Safari</h3><ol class="install-steps"><li>Abra esta app en <strong>Safari</strong>.</li><li>Toque <strong>Compartir</strong>, el cuadro con flecha hacia arriba. Según la disposición de Safari, primero abra el <strong>Menú de página</strong>.</li><li>Elija <strong>Agregar a Inicio</strong> o <strong>Añadir a pantalla de inicio</strong>.</li><li>Si aparece <strong>Abrir como app web</strong>, actívelo.</li><li>Toque <strong>Agregar</strong> o <strong>Añadir</strong>.</li></ol><p class="install-tip">Si no encuentra la opción, al final del menú Compartir entre en <strong>Editar acciones</strong> y agréguela.</p><a class="install-help-link" href="https://support.apple.com/es-lamr/guide/iphone/iphea86e5236/ios" target="_blank" rel="noopener noreferrer">Ver instrucciones de Apple ↗</a></section>
      <section class="install-device-panel" data-install-panel="android" hidden><h3>En Android · Chrome</h3><ol class="install-steps"><li>Abra esta app en <strong>Google Chrome</strong>.</li><li>Toque el menú de <strong>tres puntos</strong>, junto a la barra de direcciones.</li><li>Elija <strong>Instalar y crear acceso directo</strong> y luego <strong>Instalar</strong>. En otras versiones puede aparecer <strong>Instalar app</strong> o <strong>Agregar a la pantalla principal</strong>.</li><li>Confirme y abra los criterios desde el nuevo ícono.</li></ol><a class="install-help-link" href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&amp;hl=es-419" target="_blank" rel="noopener noreferrer">Ver instrucciones de Chrome ↗</a></section>
      <section class="install-device-panel" data-install-panel="computer" hidden><h3>En Windows, Mac o Linux · Chrome o Edge</h3><ol class="install-steps"><li>Abra esta app en <strong>Chrome</strong> o <strong>Edge</strong>.</li><li>Si ve el símbolo de <strong>instalación</strong> en la barra de direcciones, selecciónelo.</li><li>En Chrome también puede abrir el menú <strong>⋮</strong> y elegir <strong>Transmitir, guardar y compartir</strong> y después <strong>Instalar página como app</strong>.</li><li>En Edge puede abrir <strong>…</strong>, <strong>Más herramientas</strong>, <strong>Aplicaciones</strong> y <strong>Instalar este sitio como una aplicación</strong>. El orden del menú puede variar con la versión.</li><li>Confirme el nombre <strong>${APP_NAME}</strong>. Luego puede anclar el ícono a la barra de tareas o crear un acceso directo desde las opciones del navegador.</li></ol><a class="install-help-link" href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DDesktop&amp;hl=es-419" target="_blank" rel="noopener noreferrer">Ver instrucciones de Chrome ↗</a><h3>En Mac · Safari</h3><ol class="install-steps"><li>Abra esta app en <strong>Safari</strong>.</li><li>En el menú <strong>Archivo</strong> o en <strong>Compartir</strong>, elija <strong>Agregar al Dock</strong>.</li><li>Confirme el nombre y elija <strong>Agregar</strong>.</li></ol><p class="install-tip">Agregar al Dock está disponible desde macOS Sonoma 14.</p><a class="install-help-link" href="https://support.apple.com/es-la/104996" target="_blank" rel="noopener noreferrer">Ver instrucciones de Apple para Mac ↗</a></section>
      <p class="install-note">No necesita buscarla en App Store ni Google Play. Instalarla no descarga todos los documentos: las páginas y los PDF requieren conexión cuando no estén disponibles en este dispositivo.</p>
      <p id="install-status" class="install-status" role="status" aria-live="polite"></p>`;
    document.body.append(dialog);
    $('install-close').addEventListener('click', closeDialog);
    $('install-copy-link').addEventListener('click', copyAppLink);
    $('install-native').addEventListener('click', runNativeInstall);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
    dialog.addEventListener('close', releaseDialog);
    dialog.addEventListener('click', event => {
      const deviceButton = event.target.closest('[data-install-device]');
      if (deviceButton) { chooseDevice(deviceButton.dataset.installDevice); return; }
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
    });
    dialog.addEventListener('keydown', event => {
      if (!dialog.open) return;
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button:not(:disabled),a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(element => !element.hidden && element.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length-1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    });
  }
  function showDialog(trigger, instructions = false) {
    if (isInstalled() && !instructions) return;
    buildDialog();
    if (dialog.open) return;
    lastTrigger = trigger;
    chooseDevice(chosenDevice || detectedDevice());
    announce('');
    syncEntrypoints();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.setAttribute('open',''); dialog.classList.add('install-inline-fallback'); }
    document.body.classList.add('install-open');
    $('install-close').focus();
  }
  function releaseDialog() {
    document.body.classList.remove('install-open');
    const target = lastTrigger && lastTrigger.isConnected && !lastTrigger.disabled ? lastTrigger : document.querySelector('.brand');
    lastTrigger = null;
    target?.focus({preventScroll:true});
  }
  function closeDialog() {
    if (!dialog?.open) return;
    if (typeof dialog.close === 'function') dialog.close();
    else { dialog.removeAttribute('open'); releaseDialog(); }
  }
  async function copyAppLink() {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(appURL());
      else {
        const text = document.createElement('textarea');
        text.value = appURL(); text.setAttribute('readonly','');
        text.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none';
        dialog.append(text); text.focus(); text.select();
        const copied = document.execCommand('copy'); text.remove();
        if (!copied) throw Error('clipboard');
      }
      announce('Enlace copiado. Péguelo en el navegador indicado.');
    } catch {
      announce('El navegador no permitió copiar. Copie la dirección desde la barra del navegador.');
    } finally { $('install-copy-link').focus(); }
  }
  async function runNativeInstall() {
    if (!installPrompt || nativeInstallPending || isInstalled()) return;
    const prompt = installPrompt;
    installPrompt = null;
    nativeInstallPending = true;
    syncEntrypoints();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      announce(choice?.outcome === 'accepted' ? 'Solicitud aceptada. El navegador completará la instalación.' : 'Puede instalarla después usando el menú del navegador.');
    } catch {
      announce('No se pudo abrir la instalación automática. Use los pasos de su navegador.');
    } finally {
      nativeInstallPending = false;
      syncEntrypoints();
      if (dialog?.open) $('install-close').focus();
    }
  }
  document.addEventListener('click', event => {
    const help = event.target.closest?.('[data-install-help]');
    if (help) {
      event.preventDefault();
      showDialog(help, true);
      return;
    }
    const trigger = event.target.closest?.('[data-install-app]');
    if (!trigger) return;
    event.preventDefault();
    showDialog(trigger);
  });
  window.addEventListener('beforeinstallprompt', event => {
    if (typeof event.prompt !== 'function') return;
    event.preventDefault();
    if (isInstalled()) return;
    installPrompt = event;
    syncEntrypoints();
  });
  window.addEventListener('appinstalled', () => {
    confirmedInstalled = true;
    installPrompt = null;
    syncEntrypoints();
    if (dialog?.open) closeDialog();
  });
  if (standaloneQuery.addEventListener) standaloneQuery.addEventListener('change',syncEntrypoints);
  else if (standaloneQuery.addListener) standaloneQuery.addListener(syncEntrypoints);
  window.addEventListener('pageshow', syncEntrypoints);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncEntrypoints(); });
  syncEntrypoints();
})();
