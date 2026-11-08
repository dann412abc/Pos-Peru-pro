/**
 * Cloudflare Pages Function: proxy only /api/* to the private NestJS API.
 *
 * Configure API_ORIGIN as a Pages environment variable (for example,
 * https://api-pos.example.com). Keep it server-side; never prefix it with VITE_.
 */
export async function onRequest({ request, env }) {
  const configuredOrigin = env.API_ORIGIN;
  if (!configuredOrigin) {
    return new Response(
      JSON.stringify({ message: "API no configurada. Define API_ORIGIN en Cloudflare Pages." }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  let origin;
  try {
    origin = new URL(configuredOrigin);
    if (origin.protocol !== "https:" && origin.hostname !== "localhost") {
      throw new Error("API_ORIGIN debe usar HTTPS");
    }
    if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) {
      throw new Error("API_ORIGIN debe ser únicamente un origen, sin ruta ni credenciales");
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ message: `Configuración API_ORIGIN inválida: ${error.message}` }),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  const incoming = new URL(request.url);
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  try {
    const upstreamResponse = await fetch(upstream.toString(), init);
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete("set-cookie");
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("x-content-type-options", "nosniff");
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return new Response(
      JSON.stringify({ message: "No se pudo conectar con la API. Verifica el servicio de backend y el túnel." }),
      { status: 502, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
    );
  }
}
