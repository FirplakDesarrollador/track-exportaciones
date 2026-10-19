// Solo para regenerar public/tailwind.css (ver README). Vercel no lo usa.
module.exports = {
  content: ['./public/index.html', './public/app.js'],
  theme: { extend: { colors: { brand: { 50: '#f0f7ff', 100: '#e0effe', 500: '#0284c7', 600: '#0369a1', 700: '#075985', 900: '#0c4a6e' } } } },
};
