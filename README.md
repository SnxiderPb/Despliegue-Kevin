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
3. Antes de usar el CRUD en producción, reemplaza en `vercel.json`
   `api.REEMPLAZAR-POR-TU-DOMINIO.com` por un dominio API tuyo que apunte al
   balanceador y tenga un certificado HTTPS válido. La regla `/api/*` pasa las
   llamadas del navegador al backend y mantiene la sesión en el mismo origen.
   Sin un backend público con HTTPS, el registro y el inicio de sesión desde
   Vercel no funcionarán. El Docker de tu computador no es accesible desde
   Vercel ni desde el navegador del instructor.

## Preparar el backend en AWS

Esta guía no crea recursos en tu cuenta. ECS, el balanceador y RDS pueden
generar cargos; revisa precios y confirma cada recurso antes de crearlo.

1. **RDS:** crea PostgreSQL 16 en subredes privadas. No habilites acceso público.
   Conserva el endpoint, nombre de base de datos y usuario.
2. **ECR:** configura AWS CLI con tu perfil/SSO y crea un repositorio de
   imágenes. Sustituye `REGION` y `ACCOUNT_ID` por los valores de tu cuenta:

   ```bash
   aws ecr create-repository --repository-name despliegue-kevin --region REGION
   aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com
   docker build -t despliegue-kevin .
   docker tag despliegue-kevin:latest ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/despliegue-kevin:latest
   docker push ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/despliegue-kevin:latest
   ```

   Si usas un perfil AWS con SSO, inicia sesión con `aws sso login --profile
   TU_PERFIL` y añade `--profile TU_PERFIL` a los comandos `aws`.
3. **Red y HTTPS:** crea un Application Load Balancer y un servicio ECS Fargate
   en la misma VPC que RDS. Para el listener HTTPS, solicita en ACM un
   certificado válido para un dominio API que controles (por ejemplo,
   `api.tudominio.com`) y crea un registro DNS que apunte al balanceador. Usa
   ese dominio API en `vercel.json`, no el hostname `*.elb.amazonaws.com`.
   Configura el health check como `/api/health` en el puerto `3000` y el grupo
   de logs de CloudWatch para el task.
4. **Reglas de red:** permite entrada HTTPS al balanceador; permite al task de
   ECS recibir tráfico del balanceador en `3000`; permite a RDS recibir
   conexiones `5432` solo desde el grupo de seguridad de ECS. Los tasks en
   subredes privadas necesitan NAT o endpoints VPC para descargar la imagen de
   ECR y consultar Secrets Manager/CloudWatch.
5. **Secretos:** guarda `DB_PASSWORD`, `JWT_SECRET` y `ADMIN_PASSWORD` en AWS
   Secrets Manager y referencia esos secretos en la definición de tarea de ECS.
   No los incluyas en Git, en la imagen ni en comandos compartidos.
6. **Entorno del task:** configura `NODE_ENV=production`, `PORT=3000`,
   `DB_HOST` (endpoint RDS), `DB_PORT=5432`, `DB_NAME`, `DB_USER`, `DB_SSL=true`,
   `DB_SSL_CA_PATH=/app/rds-global-bundle.pem`, `ADMIN_EMAIL` y los secretos.
   La imagen descarga el bundle oficial de certificados de Amazon RDS y la
   conexión TLS verifica el certificado.
7. Espera a que ECS marque el servicio como saludable. Confirma que el dominio
   API HTTPS responde y vuelve a desplegar el frontend en Vercel.

Al arrancar, el backend crea las tablas y el usuario administrador si todavía
no existe. Cambiar `ADMIN_PASSWORD` en Secrets Manager no cambia la contraseña
de una cuenta que ya existe; actualízala iniciando sesión y usando la opción de
cambiar contraseña.
