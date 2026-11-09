// Avisos automáticos por WhatsApp al vendedor, con la API de WhatsApp Business
// (Meta Cloud API) y mensajes de plantilla aprobados:
//   tipo "recibida": lo llama el sitio justo después de que alguien envía su máquina.
//   tipo "aprobada": lo llama el panel admin al aprobar la publicación (con el token del admin).
// El teléfono y el contenido salen siempre de la publicación guardada en Supabase,
// nunca de lo que mande el navegador, y cada aviso se manda una sola vez por publicación.
// Si las variables de entorno no están cargadas devuelve skipped:'not_configured' y no hace nada.

const { createClient } = require('@supabase/supabase-js');

const SITE_URL = process.env.SITE_URL || 'https://maqhel.com';
const GRAPH_URL = 'https://graph.facebook.com/' + (process.env.WA_API_VERSION || 'v21.0');

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

// Meta no acepta saltos de línea ni tabulaciones dentro de un parámetro de plantilla
function limpio(s) {
  return String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
}

// deja solo dígitos con código de país; en Argentina el celular va con 9 después del 54
function telefono(raw) {
  let d = String(raw || '').replace(/[^\d]/g, '');
  if (d.length < 8) return null;
  if (d.startsWith('54') && !d.startsWith('549') && d.length === 12) d = '549' + d.slice(2);
  return d;
}

async function enviarPlantilla(to, nombre, lang, params) {
  const res = await fetch(GRAPH_URL + '/' + process.env.WA_PHONE_NUMBER_ID + '/messages', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.WA_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: nombre,
        language: { code: lang },
        components: [{ type: 'body', parameters: params.map(function (t) { return { type: 'text', text: limpio(t) }; }) }]
      }
    })
  });
  const out = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    throw new Error((out.error && out.error.message) || ('WhatsApp API ' + res.status));
  }
  return out;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'JSON inválido' }); }
  const tipo = body.tipo;
  const listingId = body.listingId;
  if ((tipo !== 'recibida' && tipo !== 'aprobada') || !listingId) {
    return json(400, { error: 'Faltan datos' });
  }

  if (!process.env.WA_TOKEN || !process.env.WA_PHONE_NUMBER_ID) {
    return json(200, { sent: false, skipped: 'not_configured' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: listing, error: listingErr } = await supabase
    .from('listings')
    .select('id, created_at, status, marca, modelo, tipo, contacto_nombre, contacto_info')
    .eq('id', listingId)
    .single();
  if (listingErr || !listing) return json(404, { error: 'Publicación no encontrada' });

  const columna = tipo === 'recibida' ? 'wa_recibido_at' : 'wa_publicada_at';

  if (tipo === 'recibida') {
    // sin login: solo sirve para una publicación recién enviada y todavía pendiente
    if (listing.status !== 'pending' || Date.now() - new Date(listing.created_at).getTime() > 30 * 60 * 1000) {
      return json(403, { error: 'No corresponde enviar este aviso' });
    }
  } else {
    // solo un admin (misma regla que el panel: estar en la tabla admins)
    const token = ((event.headers && (event.headers.authorization || event.headers.Authorization)) || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Falta la sesión de admin' });
    const { data: u, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !u || !u.user) return json(401, { error: 'Sesión inválida' });
    const { data: adm } = await supabase.from('admins').select('user_id').eq('user_id', u.user.id).maybeSingle();
    if (!adm) return json(403, { error: 'No sos admin' });
    if (listing.status !== 'published') return json(400, { error: 'La publicación no está aprobada' });
  }

  const to = telefono(listing.contacto_info);
  if (!to) return json(200, { sent: false, skipped: 'sin_telefono' });

  // reserva el aviso antes de mandarlo, así dos pedidos a la vez no lo duplican
  const { data: reservado, error: resErr } = await supabase
    .from('listings')
    .update({ [columna]: new Date().toISOString() })
    .eq('id', listing.id)
    .is(columna, null)
    .select('id');
  if (resErr) return json(500, { error: 'Falta correr sql/005_whatsapp_avisos.sql en Supabase (' + resErr.message + ')' });
  if (!reservado || !reservado.length) return json(200, { sent: false, skipped: 'already_sent' });

  const nombre = limpio(listing.contacto_nombre).split(' ')[0] || 'vendedor';
  const maquina = limpio([listing.marca, listing.modelo || listing.tipo].filter(Boolean).join(' ')) || 'máquina';
  const lang = process.env.WA_TEMPLATE_LANG || 'es_AR';

  try {
    if (tipo === 'recibida') {
      await enviarPlantilla(to, process.env.WA_TEMPLATE_RECIBIDA || 'publicacion_recibida', lang, [nombre, maquina]);
    } else {
      await enviarPlantilla(to, process.env.WA_TEMPLATE_APROBADA || 'publicacion_aprobada', lang,
        [nombre, maquina, SITE_URL + '/#usada-' + listing.id]);
    }
  } catch (e) {
    // no se pudo mandar: libera el aviso para poder reintentarlo
    await supabase.from('listings').update({ [columna]: null }).eq('id', listing.id);
    return json(502, { sent: false, error: e.message });
  }

  return json(200, { sent: true });
};
