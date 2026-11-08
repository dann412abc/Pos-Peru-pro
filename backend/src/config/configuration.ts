/**
 * Carga y validacion de variables de entorno para Mi Carrito POS.
 * Esta entrega solo incluye el adaptador OSE simulado; OSE_MOCK=false no habilita SUNAT real.
 */
export default () => {
  const env = process.env.NODE_ENV || 'development';
  if (process.env.OSE_MOCK === 'false') {
    throw new Error('OSE_MOCK=false no es compatible: esta entrega solo incluye el adaptador OSE simulado. Configure un adaptador OSE real antes de desactivar el modo de prueba.');
  }

  if (env === 'production') {
    const required = ['DB_HOST', 'DB_USERNAME', 'DB_DATABASE', 'DB_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CORS_ORIGIN'];
    const missing = required.filter((key) => !process.env[key] || process.env[key]!.trim().length < (key.startsWith('JWT_') ? 32 : 1));
    if (missing.length) throw new Error(`Configuración de producción incompleta: ${missing.join(', ')}. Los secretos JWT deben tener al menos 32 caracteres.`);

    const dbHost = (process.env.DB_HOST || '').toLowerCase();
    const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
    if (!(dbHost.endsWith('.supabase.co') || dbHost.endsWith('.pooler.supabase.com'))) {
      throw new Error('Producción debe conectarse a un host PostgreSQL de Supabase (DB_HOST).');
    }
    if (dbPort === 6543) {
      throw new Error('No uses el pooler en modo transacción (puerto 6543) con NestJS/TypeORM; usa conexión directa o Session pooler en 5432.');
    }
    if (process.env.DB_SSL !== 'true') {
      throw new Error('DB_SSL=true es obligatorio para conectar con Supabase en producción.');
    }
    if (process.env.CRON_SECRET && process.env.CRON_SECRET.trim().length < 32) {
      throw new Error('CRON_SECRET debe tener al menos 32 caracteres.');
    }
    if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser diferentes.');
    }
  }

  return {
    env,
    corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean),
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'micarrito',
      password: process.env.DB_PASSWORD || 'micarrito_secret',
      database: process.env.DB_DATABASE || 'mi_carrito_pos',
      ssl: process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
      refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
      accessTtl: process.env.JWT_ACCESS_TTL || '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
    },
    ose: {
      provider: 'mock',
      endpoint: process.env.OSE_ENDPOINT || 'https://api.nubefact.com/api/v1/sandbox',
      token: process.env.OSE_TOKEN || 'token_simulado',
      mock: true,
    },
    fe: {
      xmlDir: process.env.FE_XML_DIR || './storage/fe/xml',
      cdrDir: process.env.FE_CDR_DIR || './storage/fe/cdr',
      formatoTicketDefault: (process.env.FORMATO_TICKET_DEFAULT || '80mm') as '58mm' | '80mm' | 'A5',
    },
    smtp: {
      host: process.env.SMTP_HOST || undefined,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      from: process.env.SMTP_FROM || 'Mi Carrito POS <no-responder@micarritopos.pe>',
    },
    whatsapp: {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || undefined,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || undefined,
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v26.0',
      templateName: process.env.WHATSAPP_TEMPLATE_NAME || undefined,
      templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_PE',
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || undefined,
    },
    notificaciones: {
      envioAutomaticoEmail: (process.env.ENVIO_AUTOMATICO_EMAIL || 'false') === 'true',
      envioAutomaticoWhatsapp: (process.env.ENVIO_AUTOMATICO_WHATSAPP || 'false') === 'true',
    },
    cron: { secret: process.env.CRON_SECRET || undefined },
  };
};
