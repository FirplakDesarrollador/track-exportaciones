# COMEX Track · Exportaciones

Dashboard de seguimiento logístico de exportaciones (FP) de Firplak. Usa la base de Supabase del proyecto `ahcrtxmlotzagtwwyvny`.

## Cómo funciona

- `public/`: la página (index.html, app.js, styles.css, `tailwind.css` ya compilado y `vendor/` con Lucide, Chart.js y supabase-js). No depende de ningún CDN.
- `api/config.js`: función de Vercel que entrega al navegador solo la URL de Supabase y la llave **anon** (pública por diseño) y la lista opcional de correos autorizados.
- La página inicia sesión con **Supabase Auth** (correo y contraseña) y todas las consultas se hacen como ese usuario, así que aplican los permisos por filas (RLS) de la base: leer, crear y editar. **No hay ninguna llave secreta en el código** (la antigua `service_role` se quitó).
- **Borrar operaciones está deshabilitado**: RLS no permite DELETE a los usuarios. Para anular una FP, cámbiale el estado.
- `server.py`: modo local. Sirve `public/` y responde `/api/config` con los datos del `.env`.

## Publicarlo en Vercel

1. **Crear los usuarios en Supabase:** Authentication → Users → Add user → Create new user, con **Auto Confirm User** marcado: catalina.white@firplak.com, laura.buitrago@firplak.com, john.salazar@firplak.com (si ya los creaste para Importaciones, son los mismos).
2. **Apagar los registros públicos:** Authentication → Sign In / Providers → desactiva **Allow new users to sign up**. Esto es lo que de verdad impide que alguien más se cree una cuenta; `ALLOWED_EMAILS` solo es un filtro adicional en la página.
3. En Vercel: **Add New → Project**, importa `FirplakDesarrollador/track-exportaciones`. **Framework Preset: Other**. Build Command, Output Directory e Install Command vacíos (se toman de `vercel.json`).
4. **Settings → Environment Variables** (Production y Preview):
   - `SUPABASE_URL` = `https://ahcrtxmlotzagtwwyvny.supabase.co`
   - `SUPABASE_ANON_KEY` = la llave anon / publishable (Supabase → Project Settings → API Keys)
   - `ALLOWED_EMAILS` = `catalina.white@firplak.com,laura.buitrago@firplak.com,john.salazar@firplak.com`
   - **No** pongas la llave `service_role`: esta app no la necesita.
5. **Deployments → Redeploy**. Al abrir el enlace pide correo y contraseña; arriba aparecen el correo y **Cerrar sesión**. El selector "Usuario" se ajusta solo según el correo.

## Modo local (Windows)

1. Copia `.env.example` como `.env` y pega la llave anon en `SUPABASE_ANON_KEY=`.
2. Doble clic en `iniciar_servidor.bat` (o `py server.py`) y abre http://localhost:8000.

## Seguridad pendiente

- **Rotar la llave `service_role`** en Supabase: estuvo dentro del `app.js` de la versión anterior.
- La llave anon todavía puede **leer** (no escribir) algunas tablas de exportaciones (operaciones, clientes, facturas, pedidos_sap, historial_etapas, etapas_catalogo, agentes_carga, cotizaciones_sin_fp) y las vistas. Cuando esta versión con inicio de sesión esté en uso, conviene quitar esas lecturas anon.

## Si cambias clases de Tailwind

```
npx tailwindcss@3.4.16 -c tailwind.config.js -i tailwind.input.css -o public/tailwind.css --minify
```
