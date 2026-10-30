# Criterios de referencia

Aplicación de consulta de criterios de referencia por patología. Iniciativa de la Dirección de Red Integrada de Prestación de Servicios de Salud Huetar Atlántica (DRIPSSHA), CCSS.

El catálogo inicial presenta 567 temas agrupados de 29 especialidades o servicios. Los datos conservan 730 registros documentales activos: las versiones de distintas fuentes permanecen separadas y siete temas de retorno se consultan desde su documento. El registro original tiene 808 apartados; se retiraron del catálogo 78 sin criterio independiente o con destino pendiente de aclaración. Sus enlaces anteriores muestran el motivo y permiten consultar el respaldo. Las 40 fuentes identifican 38 documentos disponibles y dos pendientes de obtener.

## Consulta

El catálogo permite buscar por diagnóstico, especialidad o texto del criterio. Cada ficha conserva su página de respaldo y diferencia los estudios deseables de los condicionados. Los requisitos generales se vinculan a la misma fuente, especialidad y ruta. Se incluyen al inicio de la revisión dentro de cada ficha, incluso al buscar un diagnóstico sin seleccionar especialidad. El resultado indica si todas las variantes coincidentes incluyen requisitos generales o si dependen del documento. El acceso independiente a requisitos generales es adicional al explorar una especialidad; no se antepone a una búsqueda por diagnóstico. Los documentos sin una lista general propia conservan sus requisitos específicos, sin heredar listas de otras fuentes. Las casillas indican aspectos revisados; no certifican pertinencia clínica ni señalan automáticamente que una condición esté presente o ausente.

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

La información de Resumen y Texto de la fuente proviene de las mismas secciones. La transcripción facilita consultar el contenido; las páginas originales conservan su presentación, colores y notas al pie.

## Construcción y comprobación

Requiere Node.js 22 o posterior. No tiene dependencias de ejecución ni necesita claves de API.

```bash
node scripts/check.mjs
node scripts/build.mjs
```

El resultado está en `dist/`. Las rutas son relativas para funcionar en GitHub Pages dentro de un repositorio. El workflow incluido comprueba los datos, construye y publica ese directorio cuando Pages esté configurado para GitHub Actions.

Las verificaciones comprueban IDs, contenido y páginas de todas las fichas, existencia de imágenes de respaldo, conservación de los periodos por confirmar y clasificación conservadora de prioridades. La revisión de navegador comprobó búsqueda, selección de fuente, persistencia de marcas y navegación al documento con retorno.

## Estadísticas

`data/config.json` define el identificador de medición y los sitios autorizados de esta app. La propiedad de Google Analytics es Criterios de referencia · DRIPSSHA, con ID de medición G-PLDNSL0CSR y zona horaria America/Costa_Rica; no se reutilizan etiquetas de las apps EPSS ni del Congreso. El módulo no envía búsquedas libres, texto del expediente, marcas individuales ni información de pacientes. Los eventos permitidos usan identificadores del catálogo y contadores. Una copia alojada fuera de los sitios autorizados mantiene desactivada la medición.

## Actualizaciones

Los datos están en `data/cards.json` y `data/sources.json`. Cada ficha tiene un ID estable y referencia una fuente mediante `sourceId`. Al corregir una fuente deben conservarse las condiciones y actualizarse sus páginas. El caché de `sw.js` debe cambiar de versión cuando cambien la interfaz o los datos.

Observaciones y nuevos documentos: msolanoc@ccss.sa.cr. Indicar ficha y fuente, sin datos de pacientes.

La fecha y hora visibles proceden de `data/release.json` (`updatedAt`) y se muestran en la zona `America/Costa_Rica`. Actualice ese valor y `appVersion` al preparar una nueva publicación. La autoría de la herramienta es regional; el correo de contacto no se presenta como crédito personal.

## Revisión del contenido

La auditoría de 28 de octubre de 2026 revisó los 808 apartados contra sus copias de respaldo. Registró 186 incidencias: 78 apartados separados del catálogo y 108 fichas corregidas o reclasificadas. Las condiciones de envío encontradas en observaciones o prioridad se hicieron visibles en la revisión operativa. Se conservan los criterios de documentos distintos por separado. Las casillas corregidas tienen identificadores nuevos para no heredar marcas hechas sobre el significado anterior. El registro de decisiones está en `audits/2026-10-28-content-audit.json`. Esta revisión de selección y extracción no sustituye la confirmación institucional de la vigencia clínica de las fuentes.


## Estudios y elección del documento

La orientación operativa sobre EDUS aparece dentro de la revisión de las fichas que solicitan estudios, incluidos los requisitos generales del mismo documento. También se conserva en la impresión y en los textos para completar o revisar la referencia. Explica cómo localizar los estudios ya disponibles y cómo incorporar resultados o informes impresos mediante Asistente EDUS, con identificación de sus adjuntos en la referencia. Los requisitos clínicos originales y sus casillas permanecen sin cambios; digitalizar un informe no sustituye las imágenes ni materiales originales que la fuente solicite. El respaldo de esta orientación se identifica aparte de la fuente clínica.

Los temas con varias fuentes requieren elegir documento antes de mostrar los criterios y las casillas. Se presenta el ámbito de cada fuente y su vigencia declarada. Un filtro explícito por documento desde el catálogo se respeta cuando identifica una sola variante. Después de elegir, el selector compacto permite cambiar de documento y consultar su comparación. Las marcas de revisión se mantienen por fuente. La apertura de una ficha en Analytics se registra cuando se muestra efectivamente el documento, sin contar la pantalla previa de elección.

## Lectura de la ficha

La ficha presenta una sola lista de revisión con los requisitos generales y los criterios específicos del documento elegido. Cada grupo conserva enlaces a sus páginas originales. Las condiciones y observaciones que no estén ya en las casillas permanecen visibles, incluidas las precisiones sobre estudios y los avisos de alcance. El texto documental completo se consulta en un desplegable cerrado inicialmente. La orientación de EDUS se despliega a petición; las indicaciones sobre material original permanecen visibles. Los identificadores de las casillas y las marcas por fuente se conservan. «Desmarcar todas las casillas» reinicia la revisión de la ficha y sus requisitos generales.
