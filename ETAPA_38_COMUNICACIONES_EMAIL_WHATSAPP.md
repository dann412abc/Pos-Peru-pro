# Etapa 38 — Comunicaciones por email y WhatsApp

- SMTP y WhatsApp Business Cloud API se configuran exclusivamente mediante variables privadas del backend. La ruta usa Graph API v26.0 por defecto y permite fijar versión mediante variable.
- Se añadió consulta de estado no sensible y endpoints de prueba protegidos para administradores.
- Los envíos automáticos de comprobantes aceptados pueden habilitarse por canal con `ENVIO_AUTOMATICO_EMAIL` y `ENVIO_AUTOMATICO_WHATSAPP`.
- Los mensajes automáticos y de prueba WhatsApp se envían mediante una plantilla aprobada de Meta (`WHATSAPP_TEMPLATE_NAME`, dos variables de texto: comprobante y total), evitando depender de la ventana de conversación de 24 horas. La plantilla y su idioma son configurables.
- Se registra el resultado, destino, canal, simulación y error en el historial existente.

**Requiere configuración del titular:** cuenta de Meta, número verificado y plantilla aprobada con dos variables de cuerpo (`comprobante` y `total`) bajo el nombre configurado. El ZIP no crea ni somete plantillas a aprobación. También se requiere cuenta/proveedor SMTP y sus credenciales. La API de mensajes no debe considerarse activa hasta completar esas validaciones.


**Control de seguridad añadido en la auditoría 1.43.1:** los endpoints manuales y automáticos no envían documentos cuya aceptación FE sea simulada. El correo requiere además un generador PDF completo; mientras el provider sea `StubPdfService`, se rechaza el envío en lugar de adjuntar una hoja provisional. La cola offline usa el ID de comprobante del servidor y los fallos de resultado incierto pasan a revisión manual para evitar duplicados.
