// Recibe la notificación de Mercado Pago cuando cambia el estado de un pago.
// Nunca confía en el contenido de la notificación: siempre vuelve a consultar
// el pago real contra la API de Mercado Pago con el access token antes de
// marcar algo como pagado. Si el pago está aprobado, reserva la publicación
// por 15 días.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  var params = event.queryStringParameters || {};
  var body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}

  var paymentId = params['data.id'] || (body.data && body.data.id) || params.id;
  var topic = params.type || params.topic || body.type;

  // solo nos interesan notificaciones de pagos
  if (topic && topic !== 'payment') {
    return { statusCode: 200, body: 'ignored' };
  }
  if (!paymentId) {
    return { statusCode: 200, body: 'no payment id' };
  }

  var mpRes;
  try {
    mpRes = await fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
      headers: { 'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN }
    });
  } catch (e) {
    return { statusCode: 200, body: 'error contacting MP' };
  }
  if (!mpRes.ok) {
    return { statusCode: 200, body: 'payment not found' };
  }
  var payment = await mpRes.json();

  if (payment.status !== 'approved') {
    return { statusCode: 200, body: 'not approved yet: ' + payment.status };
  }

  var listingId = payment.external_reference;
  var reservationId = payment.metadata && payment.metadata.reservation_id;
  if (!listingId) {
    return { statusCode: 200, body: 'no external_reference' };
  }

  var supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  var reservedUntil = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

  await supabase
    .from('listings')
    .update({ reserved_until: reservedUntil })
    .eq('id', listingId);

  var resQuery = supabase.from('reservations').update({
    status: 'approved',
    mp_payment_id: String(payment.id)
  });
  if (reservationId) {
    resQuery = resQuery.eq('id', reservationId);
  } else {
    resQuery = resQuery.eq('listing_id', listingId).eq('status', 'pending');
  }
  await resQuery;

  return { statusCode: 200, body: 'ok' };
};
