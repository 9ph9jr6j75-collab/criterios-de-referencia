/* Acciones de archivos: nunca sustituyen la app instalada por un PDF. */
(() => {
 'use strict';
 if(window.ReferencePDF)return;
 let dialog,trigger,controller,sequence=0,file,objectURL;
 const $=id=>document.getElementById(id);
 const apple=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
 const installed=()=>navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches;
 function canShare(value){try{return typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[value]});}catch{return false;}}
 function status(text){$('pdf-action-status').textContent=text;}
 function release(){sequence++;controller?.abort();controller=null;file=null;if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;trigger?.focus?.({preventScroll:true});trigger=null;}
 function close(){if(typeof dialog.close==='function')dialog.close();else{dialog.removeAttribute('open');release();}}
 function build(){
  if(dialog?.isConnected)return;
  dialog=document.createElement('dialog');dialog.id='pdf-action-dialog';dialog.className='pdf-action-dialog';dialog.setAttribute('aria-labelledby','pdf-action-title');
  dialog.innerHTML='<header><h2 id="pdf-action-title">PDF completo</h2><button type="button" id="pdf-action-close">← Volver a la app</button></header><p id="pdf-action-name"></p><p id="pdf-action-status" role="status" aria-live="polite"></p><div class="pdf-action-buttons"><button type="button" id="pdf-action-prepare">Preparar PDF</button><button type="button" id="pdf-action-save" hidden>Abrir menú para guardar o compartir</button><a id="pdf-action-download" download target="_blank" rel="noopener" hidden>Guardar PDF en este equipo</a></div><p id="pdf-action-help" class="pdf-action-help"></p>';
  document.body.append(dialog);
  $('pdf-action-close').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',release);
  $('pdf-action-prepare').addEventListener('click',prepare);
  $('pdf-action-save').addEventListener('click',()=>{
   if(!file)return;
   const button=$('pdf-action-save'),seq=sequence;button.disabled=true;
   // Se ejecuta en el toque del usuario, sin esperar otra descarga.
   try{Promise.resolve(navigator.share({files:[file]})).then(()=>{if(seq===sequence)status('Puede volver a la ficha con el botón superior.');}).catch(error=>{if(seq===sequence)status(error.name==='AbortError'?'Se cerró el menú. Puede abrirlo de nuevo o volver a la ficha.':'No se pudo abrir el menú. Puede reintentar o volver a la ficha.');}).finally(()=>{if(seq===sequence)button.disabled=false;});}
   catch{if(seq===sequence){button.disabled=false;status('No se pudo abrir el menú. Puede reintentar o volver a la ficha.');}}
  });
 }
 async function prepare(){
  const seq=++sequence,button=$('pdf-action-prepare');button.disabled=true;button.textContent='Preparando PDF…';status('Preparando el documento completo. Puede cancelar y volver a la app en cualquier momento.');
  controller?.abort();controller=new AbortController();const own=controller,timeout=setTimeout(()=>own.abort(),25000);
  try{
   const response=await fetch(dialog.dataset.url,{signal:own.signal,credentials:'same-origin'});if(!response.ok)throw Error('load');
   const blob=await response.blob();if(await blob.slice(0,5).text()!=='%PDF-')throw Error('format');if(seq!==sequence)return;
   file=new File([blob],dialog.dataset.filename,{type:'application/pdf'});
   if(canShare(file)){$('pdf-action-save').hidden=false;$('pdf-action-help').textContent=apple()?'En el menú de iPhone o iPad, elija Guardar en Archivos para seleccionar la carpeta, o Imprimir si aparece. Puede cerrar este cuadro para volver a la ficha.':'Elija el destino en el menú de su dispositivo. Puede cerrar este cuadro para volver a la ficha.';status('PDF listo. Toque Abrir menú para guardar o compartir y elija qué hacer con el archivo.');}
   else if(!apple()&&!installed()){
    objectURL=URL.createObjectURL(file);const link=$('pdf-action-download');link.href=objectURL;link.download=file.name;link.hidden=false;$('pdf-action-help').textContent='La ubicación del archivo depende de la configuración de descargas del navegador. Cierre este cuadro para volver a la ficha.';status('PDF listo. El botón de guardar usa la configuración de descargas de su navegador.');
   }else{status('Este dispositivo no habilitó el menú para archivos. Abra la app en Safari para guardar el documento. Puede volver a la ficha sin perder la revisión.');}
   button.hidden=true;
  }catch{if(seq!==sequence)return;button.textContent='Reintentar preparación';status('No se pudo preparar el PDF. Compruebe la conexión y reintente, o vuelva a la app.');}
  finally{clearTimeout(timeout);if(seq===sequence){button.disabled=false;controller=null;}}
 }
 function open(url,name,filename,element){
  let address;try{address=new URL(url,document.baseURI);if(address.origin!==location.origin||!/^https?:$/.test(address.protocol))return;}catch{return;}
  build();release();trigger=element;dialog.dataset.url=address.href.split('#')[0];dialog.dataset.filename=filename||'criterios-referencia.pdf';
  $('pdf-action-name').textContent=name||'Documento de fuente';$('pdf-action-prepare').hidden=false;$('pdf-action-prepare').disabled=false;$('pdf-action-prepare').textContent='Preparar PDF';$('pdf-action-save').hidden=true;$('pdf-action-save').disabled=false;$('pdf-action-download').hidden=true;
  $('pdf-action-help').textContent='La ficha permanece abierta mientras se prepara el archivo. Puede cerrar este cuadro en cualquier momento.';
  status('El PDF se prepara sin salir de la app. Después podrá guardarlo o compartirlo.');
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');$('pdf-action-close').focus();
  prepare();
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-pdf-url]');if(!button)return;
  event.preventDefault();open(button.dataset.pdfUrl,button.dataset.pdfName,button.dataset.pdfFilename,button);
 });
 window.addEventListener('pagehide',release);
 window.ReferencePDF={open};
})();
