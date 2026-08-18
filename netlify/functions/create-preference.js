// Crea una preferencia de pago (Checkout Pro) en Mercado Pago por el 10% de
// seña de una publicación puntual, y devuelve el link para redirigir al
// comprador. El monto se calcula acá adentro (server-side) a partir del precio
// real guardado en Supabase — nunca se confía en un monto que mande el navegador.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const listingId = body.listingId;
  const buyerWhatsapp = (body.buyerWhatsapp || '').trim();
  if (!listingId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta listingId' }) };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: listing, error: listingErr } = await supabase
    .from('listings')
    .select('id, marca, modelo, tipo, precio, moneda, status, reserved_until')
    .eq('id', listingId)
    .single();

  if (listingErr || !listing) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Publicación no encontrada' }) };
  }
  if (listing.status !== 'published') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Esta publicación no está disponible' }) };
  }
  if (listing.reserved_until && new Date(listing.reserved_until) > new Date()) {
    return { statusCode: 409, body: JSON.stringify({ error: 'Esta máquina ya está reservada' }) };
  }
  if (!listing.precio || listing.precio <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Esta publicación no tiene precio cargado' }) };
  }

  const monto = Math.round(listing.precio * 0.10 * 100) / 100;
  const moneda = listing.moneda === 'ARS' ? 'ARS' : 'USD';
  const titulo = 'Seña 10% - ' + [listing.marca, listing.modelo || listing.tipo].filter(Boolean).join(' ');

  const { data: reservation, error: resErr } = await supabase
    .from('reservations')
    .insert({
      listing_id: listing.id,
      status: 'pending',
      monto: monto,
      moneda: moneda,
      buyer_whatsapp: buyerWhatsapp || null
    })
    .select()
    .single();

  if (resErr || !reservation) {
    return { statusCode: 500, body: JSON.stringify({ error: 'No se pudo iniciar la reserva' }) };
  }

  const siteUrl = 'https://' + (event.headers['x-forwarded-host'] || event.headers.host);
  const notifyBase = process.env.URL || siteUrl;

  const prefBody = {
    items: [{
      title: titulo,
      quantity: 1,
      currency_id: moneda,
      unit_price: monto
    }],
    external_reference: listing.id,
    statement_descriptor: 'MAQHEL',
    metadata: { reservation_id: reservation.id, listing_id: listing.id },
    back_urls: {
      success: siteUrl + '/#usada',
      failure: siteUrl + '/#usada',
      pending: siteUrl + '/#usada'
    },
    auto_return: 'approved',
    notification_url: notifyBase + '/.netlify/functions/mp-webhook'
  };

  let mpRes;
  try {
    mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN
      },
      body: JSON.stringify(prefBody)
    });
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: 'No se pudo contactar a Mercado Pago' }) };
  }

  const mpData = await mpRes.json();
  if (!mpRes.ok || !mpData.init_point) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Mercado Pago rechazó la preferencia', detail: mpData }) };
  }

  await supabase
    .from('reservations')
    .update({ mp_preference_id: mpData.id })
    .eq('id', reservation.id);

  return {
    statusCode: 200,
    body: JSON.stringify({
      initPoint: mpData.init_point,
      reservationId: reservation.id,
      listingId: listing.id
    })
  };
};
