# Despliegue-Kevin

Guía estática de despliegue hecha con HTML, CSS y JavaScript.

## Ejecutar las pruebas

Se requiere Node.js 20 o superior. Desde la carpeta del proyecto:

```bash
npm test
```

GitHub Actions ejecuta estas pruebas automáticamente al subir cambios o abrir
un Pull Request. El resultado se muestra en la pestaña **Actions** del
repositorio.

## Publicar en GitHub

1. Crea un repositorio en GitHub.
2. Desde esta carpeta, inicializa Git y sube los archivos:

   ```bash
   git init
   git add .
   git commit -m "Publicar sitio y configurar pruebas"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   git push -u origin main
   ```

3. Abre **Actions** en GitHub y confirma que el workflow **Pruebas** finalice
   correctamente. No subas contraseñas ni archivos `.env`.

## Publicar en Vercel

1. Entra a [vercel.com](https://vercel.com) e inicia sesión con GitHub.
2. Selecciona **Add New → Project** e importa el repositorio.
3. Para este sitio HTML/CSS/JS, configura:
   - **Framework Preset:** Other
   - **Root Directory:** `./` (la raíz del repositorio)
   - **Build Command:** vacío / sin comando
   - **Output Directory:** `.` (la raíz del proyecto)
4. Pulsa **Deploy**. Vercel te dará una URL pública.
5. Cada `git push` a `main` inicia un nuevo despliegue de producción. Los Pull
   Requests generan despliegues de vista previa.

Conecta GitHub a Vercel para que el sitio y su código permanezcan en el
repositorio; Vercel publica una copia del sitio, no reemplaza el repositorio.
