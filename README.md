# Criterios de referencia

Aplicación de consulta de criterios de referencia por patología. Iniciativa de la Dirección de Red Integrada de Prestación de Servicios de Salud Huetar Atlántica (DRIPSSHA), CCSS.

El buscador presenta 618 temas. Hay 784 fichas activas, incluidas las variantes por documento y las fichas de retorno. El registro contiene 40 fuentes. Hay PDF de 38 y fichas clínicas de 37. N15 es un manual de oferta de servicios. E01 y E02 figuran en el registro sin PDF incorporado. Los enlaces de los 78 apartados retirados del catálogo siguen explicando el motivo de su retiro.

## Consulta

El catálogo permite buscar por diagnóstico, especialidad o texto del criterio. Cada ficha conserva su página de respaldo y diferencia los estudios deseables de los condicionados. Los requisitos generales se vinculan a la misma fuente, especialidad y ruta. Se incluyen al inicio de la revisión dentro de cada ficha, incluso al buscar un diagnóstico sin seleccionar especialidad. El resultado indica si todas las variantes coincidentes incluyen requisitos generales o si dependen del documento. El acceso independiente a requisitos generales es adicional al explorar una especialidad; no se antepone a una búsqueda por diagnóstico. Los documentos sin una lista general propia conservan sus requisitos específicos, sin heredar listas de otras fuentes. Las casillas indican aspectos revisados; no certifican pertinencia clínica ni señalan automáticamente que una condición esté presente o ausente.

Los filtros activos aparecen junto a los resultados y se pueden quitar individualmente. El filtro de documento muestra únicamente las variantes de la fuente elegida en las tarjetas; las demás fuentes siguen disponibles al abrir el tema. El filtro de fuente enumera los documentos con fichas y enlaza el registro de los 40 documentos. Los alcances sin fichas no se ofrecen en el buscador. Si un filtro de atención deja la búsqueda vacía, se indica cuántos temas reaparecen al quitarlo; una prioridad no especificada en la fuente no se interpreta como consulta prioritaria.

Las nueve listas generales que carecían de casillas tienen instrucciones verificables agrupadas por numeral, sin cambiar su transcripción ni sus páginas. Las notas explicativas se conservan como lectura. La auditoría `audits/2026-10-29-general-checklists.json` protege los campos originales y los 799 registros restantes; conserva las condiciones y la diferencia entre recomendaciones y obligaciones. En Nutrición se cotejan también las columnas de inclusión y exclusión de la página original.

El esquema para copiar contiene campos vacíos. El profesional documenta en el expediente el criterio aplicable y los hallazgos del caso. La app no recibe información de pacientes. Favoritas se guardan en el dispositivo y las marcas de revisión en la sesión.

## Documentos originales

El visor de fuentes carga una imagen de página bajo demanda, sin descargar el PDF completo. Su botón de regreso conserva la ficha, la posición y las marcas de revisión. Para consultar el documento completo, el usuario pulsa Guardar o compartir PDF completo y luego abre el menú del dispositivo. La app conserva una salida al cerrar o cancelar el menú.

El caché de la aplicación guarda el catálogo y la interfaz. Los PDF y las imágenes de páginas no se descargan automáticamente. La consulta de páginas que no estén disponibles requiere conexión. La aplicación ofrece un mensaje de error y reintento si una carga falla.

## Impresión

Imprimir ficha prepara el contenido de la fuente seleccionada, incluidos sus requisitos generales y las marcas de revisión, sin navegar a otra página. En computadora se abre el diálogo de impresión. En dispositivos Apple compatibles se prepara un PDF para el menú del dispositivo. Cerrar o cancelar conserva la ficha y su revisión.

En computadora, el visor permite imprimir la página mostrada. Cuando el dispositivo permite compartir archivos, el PDF original completo se prepara a petición del usuario y se comparte en un segundo toque. La descarga tiene tiempo límite y no forma parte del caché de la app.

El service worker utiliza la URL canónica y reconstruye las respuestas válidas del mismo origen antes de servirlas, para evitar que Safari rechace las navegaciones por una cadena de redirecciones guardada. Una actualización comprueba todos los recursos de la interfaz y del catálogo antes de activar el nuevo caché y retirar la versión anterior.

## Alcance y revisión documental

Cada fuente conserva código, fecha y vigencia declarada. Pediatría, Cirugía Pediátrica y Urología tienen periodos impresos concluidos, por lo que se identifican para confirmar continuidad o actualización. Los documentos regionales y de servicio no se presentan como nacionales. Los documentos de ORL y Psicología identificados por cita están registrados como pendientes de obtener. Las discrepancias expresas de la guía regional permanecen visibles en las fichas correspondientes.

La lista de revisión y la transcripción documental proceden de las mismas secciones. La transcripción facilita consultar el contenido; las páginas originales conservan su presentación, colores y notas al pie.

## Construcción y comprobación

La compilación utiliza Node.js 22 o posterior y Python 3.11 o posterior con PyMuPDF y Pillow. El visor genera imágenes de páginas desde los PDF originales y las carga cuando el lector abre una página.

```bash
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install PyMuPDF==1.26.6 Pillow==12.0.0
node scripts/check.mjs
node scripts/build.mjs
```

El resultado está en `dist/`. Las rutas son relativas para funcionar en GitHub Pages dentro de un repositorio. El workflow incluido comprueba los datos, construye y publica ese directorio cuando Pages esté configurado para GitHub Actions.

Las verificaciones comprueban IDs, contenido y páginas de todas las fichas, existencia de imágenes de respaldo, conservación de los periodos por confirmar y clasificación conservadora de prioridades. La revisión de navegador comprobó búsqueda, selección de fuente, persistencia de marcas y navegación al documento con retorno.

## Estadísticas

`data/config.json` define el identificador de medición y los sitios autorizados de esta app. La propiedad de Google Analytics es Criterios de referencia · DRIPSSHA, con ID de medición G-PLDNSL0CSR y zona horaria America/Costa_Rica; no se reutilizan etiquetas de las apps EPSS ni del Congreso. El módulo no envía búsquedas libres, texto del expediente, marcas individuales ni información de pacientes. Los eventos permitidos usan identificadores del catálogo y contadores. Una copia alojada fuera de los sitios autorizados mantiene desactivada la medición.

## Actualizaciones

El catálogo auditado original está en `data/`. Las guías por destino y sus datos de procedencia están en `content/referral-guides.json` y `content/referral-sources.json`. La compilación los reúne en `dist/data/` y calcula los conteos que utiliza la app. Cada ficha tiene un ID estable y referencia una fuente mediante `sourceId`. Al corregir una fuente deben conservarse las condiciones y actualizarse sus páginas. El caché de `sw.js` debe cambiar de versión cuando cambien la interfaz o los datos.

Observaciones y nuevos documentos: msolanoc@ccss.sa.cr. Indicar ficha y fuente, sin datos de pacientes.

La fecha y hora visibles proceden de `data/release.json` (`updatedAt`) y se muestran en la zona `America/Costa_Rica`. Actualice ese valor y `appVersion` al preparar una nueva publicación. La autoría de la herramienta es regional; el correo de contacto no se presenta como crédito personal.

## Revisión del contenido

La auditoría de 28 de octubre de 2026 revisó los 808 apartados contra sus copias de respaldo. Registró 186 incidencias: 78 apartados separados del catálogo y 108 fichas corregidas o reclasificadas. Las condiciones de envío encontradas en observaciones o prioridad se hicieron visibles en la revisión operativa. Se conservan los criterios de documentos distintos por separado. Las casillas corregidas tienen identificadores nuevos para no heredar marcas hechas sobre el significado anterior. El registro de decisiones está en `audits/2026-10-28-content-audit.json`. Esta revisión de selección y extracción no sustituye la confirmación institucional de la vigencia clínica de las fuentes.


## Estudios y elección del documento

La orientación operativa sobre EDUS aparece dentro de la revisión de las fichas que solicitan estudios, incluidos los requisitos generales del mismo documento. También se conserva en la impresión y en los textos para completar o revisar la referencia. Explica cómo localizar los estudios ya disponibles y cómo incorporar resultados o informes impresos mediante Asistente EDUS, con identificación de sus adjuntos en la referencia. Los requisitos clínicos originales y sus casillas permanecen sin cambios; digitalizar un informe no sustituye las imágenes ni materiales originales que la fuente solicite. El respaldo de esta orientación se identifica aparte de la fuente clínica.

Los temas con varias fuentes requieren elegir documento antes de mostrar los criterios y las casillas. Se presenta el ámbito de cada fuente y su vigencia declarada. Un filtro explícito por documento desde el catálogo se respeta cuando identifica una sola variante. La elección autoriza esa apertura; al volver a abrir el diagnóstico desde el catálogo o mediante un enlace se vuelve a pedir documento. El regreso desde el visor conserva el documento consultado y las marcas. Después de elegir, el selector compacto permite cambiar de documento y consultar su comparación. Las marcas de revisión se mantienen por fuente. La apertura de una ficha en Analytics se registra cuando se muestra efectivamente el documento, sin contar la pantalla previa de elección.

## Lectura de la ficha

La ficha presenta una sola lista de revisión con los requisitos generales y los criterios específicos del documento elegido. Cada grupo conserva enlaces a sus páginas originales. Las condiciones y observaciones que no estén ya en las casillas permanecen visibles, incluidas las precisiones sobre estudios y los avisos de alcance. El texto documental completo se consulta en un desplegable cerrado inicialmente. La orientación sobre EDUS y Asistente EDUS permanece visible antes de las casillas en las fichas que solicitan estudios o heredan ese requisito. Solo los enlaces de respaldo institucional se despliegan a petición; las indicaciones sobre material original también permanecen visibles. Los identificadores de las casillas y las marcas por fuente se conservan. «Desmarcar todas las casillas» reinicia la revisión de la ficha y sus requisitos generales.

## Vista previa al compartir

El inicio declara una portada horizontal de 1200 × 630 píxeles en Open Graph, con URL HTTPS pública y dimensiones explícitas. La imagen para compartir está en `assets/social-card-v15.png` y su diseño editable en `assets/social-card.svg`. Los iconos de instalación se conservan separados. El enlace canónico y la imagen corresponden a la publicación de GitHub Pages. El formato final de la vista previa depende de la aplicación receptora.

## Clasificación odontológica

Odontología especializada se presenta en dos especialidades del documento R01: Odontología general avanzada y Endodoncia. Las siete fichas de Endodoncia corresponden a las páginas PDF 160–161, bajo el encabezado de la página 159. Conservan sus identificadores y todo el contenido clínico, incluidas las casillas y el aviso de protocolo no validado por nivel central. Los requisitos generales odontológicos del mismo documento se comparten explícitamente entre ambas especialidades, sin heredar requisitos de otras fuentes o rutas. El registro de verificación está en `audits/2026-11-07-dental-specialties.json`.

## Consulta por destino

En artrosis de cadera, la ficha N21 muestra los requisitos generales y permite elegir el destino. Los criterios y las páginas cambian con esa elección. La ficha regional R01 de coxalgias conserva su propio enlace y su alcance pediátrico y adulto. Se puede llegar a las dos desde la búsqueda por «coxartrosis». El nombre de archivo de N21 en BINASSS y la marca de agua de la copia difieren. La ficha informa de esa discrepancia.

Los criterios alternativos y las limitaciones se presentan como notas de lectura. Cuando una tabla distingue escenarios por filas o columnas, la ficha enlaza la página correspondiente. Las marcas de revisión se guardan por documento y destino.
