# Etapa 41 — Validación fiscal peruana y límites SUNAT

- Se mantiene IGV 18% y los tipos UBL usuales para factura (01), boleta (03), nota de crédito (07) y nota de débito (08).
- La validación documental del proyecto comprueba estructura y prefijos de RUC, y longitud de DNI; no consulta el padrón de SUNAT ni confirma estado activo/habido.
- Se incorporó `es_simulacion` al comprobante electrónico. El adaptador Mock devuelve explícitamente `simulado: true`, y los eventos quedan etiquetados como prueba.
- La pantalla de facturación advierte que el estado Aceptado/CDR del mock no constituye una recepción tributaria real.

**No es facturación electrónica real aún.** El proyecto no implementa firma digital productiva, certificado PFX, integración real de envío/consulta/descarga CDR con un OSE/PSE, ni credenciales de producción. Se necesita un proveedor homologado o integración autorizada, certificado vigente, credenciales y pruebas de homologación/producción. No se debe declarar al negocio emisor electrónico por instalar este ZIP.


La configuración rechaza `OSE_MOCK=false` mientras no exista un adaptador real registrado. Cambiar esa variable no conecta con SUNAT; hacerlo fallar explícitamente evita una falsa habilitación productiva.
