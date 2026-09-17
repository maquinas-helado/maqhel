// Trae números resumidos de Google Analytics (GA4) para mostrarlos en el
// panel de admin, sin que Santiago tenga que entrar a analytics.google.com.
//
// Usa una cuenta de servicio de Google Cloud con permiso de solo lectura
// sobre la propiedad de GA4 (nunca las credenciales del login normal). El
// token de acceso se pide armando el JWT a mano con el módulo "crypto" de
// Node -- no hace falta agregar ninguna dependencia nueva al proyecto.
//
// Variables de entorno necesarias (se configuran en Netlify, nunca en el
// código): GA_PROPERTY_ID, GA_CLIENT_EMAIL, GA_PRIVATE_KEY.

const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getAccessToken() {
  const clientEmail = process.env.GA_CLIENT_EMAIL;
  const privateKey = (process.env.GA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('Faltan GA_CLIENT_EMAIL / GA_PRIVATE_KEY en las variables de entorno');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const unsigned = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey);
  const jwt = unsigned + '.' + signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error('No se pudo autenticar con Google: ' + JSON.stringify(data));
  }
  return data.access_token;
}

async function runReport(accessToken, propertyId, body) {
  const res = await fetch(
    'https://analyticsdata.googleapis.com/v1beta/properties/' + propertyId + ':runReport',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken
      },
      body: JSON.stringify(body)
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error('GA4 rechazó el reporte: ' + JSON.stringify(data));
  return data;
}

exports.handler = async function () {
  try {
    const propertyId = process.env.GA_PROPERTY_ID;
    if (!propertyId) throw new Error('Falta GA_PROPERTY_ID en las variables de entorno');

    const accessToken = await getAccessToken();

    const resumen = await runReport(accessToken, propertyId, {
      dateRanges: [
        { startDate: 'today', endDate: 'today', name: 'hoy' },
        { startDate: '7daysAgo', endDate: 'today', name: '7dias' },
        { startDate: '30daysAgo', endDate: 'today', name: '30dias' }
      ],
      metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }]
    });

    const paginas = await runReport(accessToken, propertyId, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 6
    });

    const porRango = {};
    (resumen.rows || []).forEach(function (row) {
      var rango = row.dimensionValues[0].value;
      porRango[rango] = {
        usuarios: Number(row.metricValues[0].value),
        vistas: Number(row.metricValues[1].value)
      };
    });

    var topPaginas = (paginas.rows || []).map(function (row) {
      return { pagina: row.dimensionValues[0].value, vistas: Number(row.metricValues[0].value) };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        hoy: porRango.hoy || { usuarios: 0, vistas: 0 },
        ultimos7dias: porRango['7dias'] || { usuarios: 0, vistas: 0 },
        ultimos30dias: porRango['30dias'] || { usuarios: 0, vistas: 0 },
        topPaginas: topPaginas
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
