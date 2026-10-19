// COMEX Track · Exportaciones — /api/config (función de Vercel)
// Entrega al navegador solo la URL de Supabase y la llave anon (pública por diseño).
// Nunca expone la llave service_role.
'use strict';
module.exports = function handler(req, res) {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || '';
  const allowed = String(process.env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if ((req.method || 'GET').toUpperCase() !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ message: 'No permitido' })); }
  if (!url.startsWith('https://') || !anon) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ message: 'Faltan SUPABASE_URL o SUPABASE_ANON_KEY en las variables de entorno de Vercel.' }));
  }
  res.statusCode = 200;
  res.end(JSON.stringify({ supabaseUrl: url, supabaseAnonKey: anon, allowedEmails: allowed }));
};
