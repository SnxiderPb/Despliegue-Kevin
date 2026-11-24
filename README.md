# Despliegue-Kevin

[![CI: pruebas](https://github.com/SnxiderPb/Despliegue-Kevin/actions/workflows/ci.yml/badge.svg)](https://github.com/SnxiderPb/Despliegue-Kevin/actions/workflows/ci.yml)

Guía de despliegue con un CRUD de proyectos protegido por login, una API
Node.js/Express y PostgreSQL.

## Requisitos

- Node.js 22 o superior.
- Docker Desktop con Docker Compose.

## Ejecutar localmente con Docker

Abre Docker Desktop. En PowerShell, desde la raíz del proyecto:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

En `.env`, reemplaza los valores de ejemplo por valores privados:

- `ADMIN_EMAIL`: correo para la cuenta administradora inicial.
- `ADMIN_PASSWORD`: contraseña inicial del administrador, al menos 12 caracteres.
- `DB_PASSWORD`: contraseña local de PostgreSQL, distinta de la anterior.
- `JWT_SECRET`: cadena aleatoria de al menos 32 caracteres.

El valor `change-this-admin-password` es solo un ejemplo público: cámbialo antes
de iniciar el sistema. No pegues aquí tus claves ni subas `.env` a GitHub.
`ADMIN_EMAIL` y `ADMIN_PASSWORD` solo crean la cuenta administradora la primera
vez; luego administra la contraseña desde la pantalla de cuenta.

Levanta la aplicación y la base de datos:

```powershell
docker compose up --build
```

Abre `http://localhost:3000/Proyectos.Html`. Puedes crear una cuenta pública,
pero esta recibe el rol **Usuario** y solo ve sus propios proyectos. Inicia
sesión con `ADMIN_EMAIL` y `ADMIN_PASSWORD` de `.env` para administrar cuentas.
El administrador inicial no se puede borrar, desactivar ni degradar desde la
API. El sistema crea las tablas al arrancar; los datos persisten en un volumen
de Docker. Borrar un usuario también borra sus proyectos.

La API ofrece:

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me` y `POST /api/auth/change-password`.
- `GET/POST /api/projects` y `PUT/DELETE /api/projects/:id`; cada usuario solo
  puede operar sobre sus proyectos.
- Administración protegida por rol: `GET/POST /api/users` y
  `PUT/DELETE /api/users/:id`.
- `GET /api/health` para comprobar el backend y PostgreSQL.

Las contraseñas se guardan con hash bcrypt; las sesiones son cookies HTTP-only,
SameSite Strict, con expiración y revocación al cambiar contraseña o desactivar
una cuenta. El inicio de sesión y el registro están limitados por IP.

## Pruebas y pipeline

Las pruebas unitarias validan los datos del CRUD. Las de integración arrancan la
API contra un PostgreSQL real y comprueban login y operaciones de crear, listar,
actualizar y borrar. El pipeline de **Actions** también construye la imagen
Docker.

En GitHub, cada push y Pull Request ejecuta estos pasos; los nombres de cada
prueba y su resultado aparecen en el paso **Ejecutar pruebas unitarias e
integración**. [Ver ejecuciones](https://github.com/SnxiderPb/Despliegue-Kevin/actions).

Para ejecutar las pruebas unitarias e integración localmente (Node.js 22+):

```powershell
npm install
docker compose --profile test up -d test-database
$env:DB_PORT = "5433"
npm test
if ($LASTEXITCODE -ne 0) { throw "Fallaron las pruebas." }
Remove-Item Env:DB_PORT
docker compose --profile test stop test-database
```

La base de pruebas se llama `despliegue_test`; la prueba de integración rechaza
ejecutarse si el nombre configurado no termina en `_test`.

## Publicar el frontend en Vercel

El build prepara solamente el sitio estático en `dist/`; la API y los archivos
del servidor no se publican desde Vercel.

1. Importa el repositorio en Vercel.
2. Usa **Framework Preset: Other**, **Build Command: `npm run build`** y
   **Output Directory: `dist`** (también declarado en `vercel.json`). Configura
   Node.js 22 para el build.
3. Antes de usar el CRUD, configura en `vercel.json` el destino HTTPS del
   backend. Para la demo temporal de AWS, usa la URL `trycloudflare.com`
   generada por el túnel descrito abajo; para un despliegue permanente, usa un
   dominio API estable con HTTPS. La regla `/api/*` mantiene las llamadas y la
   sesión en el mismo origen de Vercel. Sin un backend público con HTTPS, el
   registro y el inicio de sesión no funcionarán. El Docker de tu computador
   no es accesible desde Vercel ni desde el navegador del instructor.

## Demo temporal en AWS EC2 con Docker

Esta alternativa mantiene la API y PostgreSQL en contenedores Docker en una
instancia EC2. El túnel de Cloudflare entrega una URL HTTPS temporal para que
Vercel pueda enviar las solicitudes. No es un despliegue de producción: la URL
cambia al reiniciar el túnel y cualquier persona que la conozca puede abrirla.

AWS ofrece créditos a cuentas elegibles, pero no garantiza alojamiento gratis
permanente. Revisa el saldo y la fecha de vencimiento antes de crear recursos;
detén la instancia cuando no estés presentando. La instancia y el almacenamiento
pueden consumir créditos. No ingreses datos personales o reales en la demo.

1. En AWS, selecciona una región disponible (por ejemplo, `us-east-2`) y crea
   una instancia EC2 pequeña elegible para tu cuenta. Usa Ubuntu 24.04 LTS.
   En su grupo de seguridad permite SSH (`22`) solo desde **My IP**. No abras
   `3000`, `5432`, `80` ni `443`: Cloudflare establece el túnel desde la
   instancia hacia afuera.
2. Conéctate por SSH e instala Docker, Compose y Git:

   ```bash
   sudo apt update
   sudo apt install -y docker.io docker-compose-v2 git
   sudo systemctl enable --now docker
   ```

   Clona el repositorio y crea tu archivo local de variables:

   ```bash
   git clone https://github.com/SnxiderPb/Despliegue-Kevin.git
   cd Despliegue-Kevin
   cp .env.example .env
   nano .env
   ```

   Pon valores secretos nuevos para `DB_PASSWORD`, `JWT_SECRET` y
   `ADMIN_PASSWORD`. Usa `ADMIN_EMAIL` para la primera cuenta administradora.
   No copies las claves del equipo local ni compartas el contenido de `.env`.
3. Inicia los servicios:

   ```bash
   sudo docker compose -f docker-compose.aws-demo.yml up -d --build
   sudo docker compose -f docker-compose.aws-demo.yml ps
   ```

   La configuración no publica los puertos de la API ni de PostgreSQL en la
   instancia; solo los servicios de la red privada de Docker pueden acceder.
4. Obtén la URL temporal del túnel:

   ```bash
   sudo docker compose -f docker-compose.aws-demo.yml logs -f tunnel
   ```

   Copia la URL `https://....trycloudflare.com` que muestra el log. El túnel
   debe seguir ejecutándose mientras el instructor prueba la aplicación. La
   URL puede cambiar si el túnel se reinicia.
5. En `vercel.json`, cambia el destino `/api/*` por
   `https://TU-URL.trycloudflare.com/api/:path*`. Sube ese cambio a GitHub para
   que Vercel despliegue la nueva configuración. Comprueba
   `https://TU-URL.trycloudflare.com/api/health` y después prueba el registro
   desde el frontend de Vercel.

Los datos quedan en el volumen Docker de la instancia. Detenerla conserva ese
volumen, pero terminarla puede borrar el disco y los datos. Tras la presentación,
detén o elimina los recursos de AWS que ya no necesites y guarda una copia de
la base si deseas conservar los registros.
