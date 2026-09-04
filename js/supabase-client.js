// Cliente único de Supabase, usado por index.html y admin.html.
// Depende de supabase-config.js (definido antes en el HTML) y del SDK
// cargado por CDN (window.supabase, expuesto por @supabase/supabase-js).

window.mhSupabase = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

// Redimensiona y recomprime una foto en el navegador antes de subirla. Las
// fotos que salen directo de la cámara del celu (sin editar) suelen pesar
// varios MB; varias juntas en una galería/carrusel/lightbox hacen que el
// celu se quede sin memoria para decodificarlas y las va "recargando" --
// eso es el parpadeo a negro que se ve en las fichas de máquinas usadas.
// Si algo falla (o la comprimida sale más pesada que el original, poco
// común pero posible con ciertos PNG) devolvemos el archivo tal cual vino,
// para nunca bloquear una publicación por esto.
async function mhCompressImage(file, maxDim, quality) {
  if (!file || !file.type || file.type.indexOf('image/') !== 0) return file;
  maxDim = maxDim || 1600;
  quality = quality || 0.82;
  var objectUrl;
  try {
    var img = await new Promise(function (resolve, reject) {
      var im = new Image();
      objectUrl = URL.createObjectURL(file);
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('no se pudo leer la imagen')); };
      im.src = objectUrl;
    });
    var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', quality); });
    if (!blob || blob.size >= file.size) return file;
    var name = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch (err) {
    console.error('mhCompressImage falló, subiendo el archivo original:', err);
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

// Sube un File a un bucket de Storage y devuelve su URL pública.
async function mhUploadFile(bucket, file, pathPrefix) {
  var ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'bin';
  var path = pathPrefix + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  var { error } = await window.mhSupabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  var { data } = window.mhSupabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
