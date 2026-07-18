#!/bin/bash

# Este script genera un build de producción (DMG y archivo .app) de Visual Git para Mac.

echo "🦈🌊 Preparando el build de Visual Git para macOS..."

# Aseguramos que todas las dependencias estén instaladas
echo "📦 Instalando dependencias..."
npm install

# Construimos la aplicación
echo "🏗️  Construyendo la app y generando el DMG..."
npm run dist

echo ""
echo "✅ ¡Build completado exitosamente!"
echo "Tu instalador (.dmg) y la aplicación compilada se encuentran en la carpeta:"
echo "👉 $(pwd)/dist/"
echo ""
echo "Para instalarla en tu Mac, simplemente hace doble clic en el archivo .dmg"
echo "que está adentro de la carpeta 'dist' y arrastrá el ícono del tiburón"
echo "hacia tu carpeta de Aplicaciones (Applications)."
