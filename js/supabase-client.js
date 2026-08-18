// Cliente único de Supabase, usado por index.html y admin.html.
// Depende de supabase-config.js (definido antes en el HTML) y del SDK
// cargado por CDN (window.supabase, expuesto por @supabase/supabase-js).

window.mhSupabase = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

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
