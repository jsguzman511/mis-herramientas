# Mis Herramientas: guía para publicar la app

Esta carpeta contiene la app completa (Cotizador, Finanzas y Calendario) lista para publicar en internet como **app instalable**, con **notificaciones del Calendario que llegan aunque la app esté cerrada**.

No necesitas saber programar. Sigue los pasos en orden; la primera vez toma unos 30 minutos.

---

## Qué hay en la carpeta

| Carpeta o archivo | Para qué sirve |
|---|---|
| `public/` | La app que ven las personas (páginas, íconos, funcionamiento sin conexión). |
| `netlify/` | El pequeño servidor que envía las notificaciones a la hora indicada. |
| `netlify.toml`, `package.json` | La configuración que Netlify lee al publicar. No hace falta tocarlos. |
| `herramientas/generar-claves.html` | Página para crear las claves de las notificaciones (paso 3). |
| `herramientas/servidor-local.mjs` | Opcional: para probar la app en tu computador. |

---

## Paso 1. Subir la carpeta a GitHub

1. Crea una cuenta gratis en **github.com** (si no tienes).
2. Arriba a la derecha toca **+** → **New repository**. Ponle un nombre, por ejemplo `mis-herramientas`, déjalo en **Private** y toca **Create repository**.
3. En la página del repositorio nuevo toca **uploading an existing file**.
4. Arrastra **todo el contenido** de esta carpeta (las carpetas `public`, `netlify`, `herramientas` y los archivos `netlify.toml`, `package.json`, `LEEME.md`, `.gitignore`). Usa Chrome o Edge para que se suban también las subcarpetas.
5. Toca **Commit changes**.

## Paso 2. Publicar en Netlify

1. Crea una cuenta gratis en **netlify.com** entrando con tu cuenta de GitHub.
2. Toca **Add new project** → **Import an existing project** → **GitHub** y elige `mis-herramientas`.
3. No cambies nada de la configuración (Netlify la lee del archivo `netlify.toml`) y toca **Deploy**.
4. En uno o dos minutos tendrás una dirección como `https://nombre-al-azar.netlify.app`. En **Project configuration → Change project name** puedes cambiarla, por ejemplo a `mis-herramientas.netlify.app`.

> No uses la opción «Netlify Drop» (arrastrar la carpeta a la web): esa forma no instala el servidor de notificaciones.

## Paso 3. Activar las notificaciones en el servidor

1. En tu computador, abre el archivo `herramientas/generar-claves.html` con doble clic (se abre en el navegador).
2. Toca **Generar claves nuevas**. Aparecen dos claves. Escribe tu correo en el tercer campo (`mailto:tucorreo@...`).
3. En Netlify ve a **Project configuration → Environment variables → Add a variable** y crea estas tres, copiando cada valor:
   - `VAPID_PUBLIC_KEY` → la clave pública
   - `VAPID_PRIVATE_KEY` → la clave privada (**no la compartas con nadie**)
   - `VAPID_SUBJECT` → `mailto:tucorreo@ejemplo.com`
4. Ve a **Deploys → Trigger deploy → Deploy project** para que tome las claves.
5. Comprueba: abre `https://TU-DIRECCION.netlify.app/api/config`. Debe decir `"push":true`. Si dice `false`, revisa que las variables estén bien escritas y vuelve a publicar.

Guarda las claves en un lugar seguro. **No las cambies después**: si lo haces, cada persona tendrá que volver a activar las notificaciones.

## Paso 4. Instalar la app en el teléfono

**iPhone (iOS 16.4 o posterior):**
1. Abre tu dirección en **Safari** (no en Chrome).
2. Toca **Compartir** (el cuadro con la flecha) → **Agregar a pantalla de inicio** → **Agregar**.
3. Abre la app desde el ícono nuevo.
4. Entra a **Calendario → toca la campana** (o Más → Recordatorios) → **Activar notificaciones** → **Permitir**.
5. Toca **Enviar una prueba**: debe llegarte una notificación en segundos.

**Android:**
1. Abre tu dirección en **Chrome**. Toca **Instalar la app** en la pantalla de inicio de la app (o ⋮ → **Instalar app**).
2. Abre la app y activa las notificaciones igual que en iPhone (pasos 4 y 5).

En computador (Chrome o Edge) también se puede instalar desde el ícono de instalar en la barra de direcciones.

## Paso 5. Pasar tus datos desde Claude

Los datos de cada herramienta viven en el dispositivo donde los creaste. Para llevarlos de la versión de Claude a la versión web:

| Herramienta | En la versión de Claude | En la versión web |
|---|---|---|
| Cotizador | Marca → **Exportar respaldo** | Marca → **Importar respaldo** |
| Finanzas | Más → **Copia de seguridad** → Descargar | Más → **Copia de seguridad** → Importar |
| Calendario | Más → **Copias de seguridad** → Copia (.json) | Más → **Copias de seguridad** → Importar (.json) |

Al importar puedes **combinar** con lo que ya tengas o **reemplazar**; nunca se borra nada sin confirmación.

---

## Trabajar en equipo (tu teléfono y el de tu asistente)

1. En **tu** teléfono abre la app → en la pantalla de inicio, sección **Trabajar en equipo** → **Crear espacio compartido**. Tus datos actuales de las tres herramientas se suben cifrados.
2. Toca **Compartir** (o **Copiar código**) y envíale el código a tu asistente por WhatsApp. **Trátalo como una contraseña**: quien lo tenga puede ver y editar los datos.
3. Tu asistente instala la app en su teléfono (paso 4), la abre desde el ícono → **Unirme con un código** → pega el código → **Unirme**.
4. Listo: Cotizador, Finanzas y Calendario quedan iguales en los dos teléfonos.

Cómo funciona:

- Los datos se **cifran en el teléfono** antes de subir. El servidor solo guarda texto ilegible; ni Netlify ni nadie sin el código puede leerlo.
- La app sincroniza al abrirse, después de cada cambio y cada 30 segundos mientras está abierta. Arriba a la derecha verás **● Sincronizado**.
- Si los dos cambian cosas al mismo tiempo, los cambios se combinan registro por registro (cada cliente, cotización, movimiento o evento por separado). Si los dos editan **exactamente el mismo registro**, queda la versión más reciente.
- Sin internet se sigue trabajando normal y se sincroniza cuando vuelve la señal.
- Cada teléfono conserva lo suyo: el borrador de cotización en curso, el perfil de Finanzas abierto, el tema y los avisos descartados del Calendario. Los recordatorios (notificaciones) se activan en cada teléfono por separado.
- En Finanzas, el saldo de cada cuenta ahora se calcula con el saldo inicial más los movimientos, y las transferencias quedan registradas como movimientos. Así los saldos cuadran aunque dos personas registren cosas a la vez.
- **Salir del espacio** deja los datos en ese teléfono pero sin sincronizar. **Eliminar el espacio del servidor** borra la copia cifrada (cada teléfono conserva la suya).

---

## Cómo actualizar la app

1. Cambia los archivos (por ejemplo, pídele a Claude una mejora y que te entregue la carpeta `public` actualizada).
2. En tu repositorio de GitHub toca **Add file → Upload files**, arrastra los archivos nuevos y toca **Commit changes**.
3. Netlify publica solo en uno o dos minutos.
4. La próxima vez que alguien abra la app verá **«Hay una versión nueva → Actualizar»**. Sus datos no se pierden.

---

## Cómo funcionan las notificaciones (y sus límites)

- Al activar los avisos, el teléfono le entrega al servidor una dirección segura de notificaciones (de Apple, Google o Mozilla).
- Cada vez que creas o cambias algo en el Calendario, la app envía al servidor los recordatorios de los **próximos 60 días**: hora, título y un texto corto. Nada más: ni notas, ni descripciones, ni datos de Cotizador o Finanzas.
- Cada minuto el servidor revisa qué avisos tocan y los envía. Por eso pueden llegar con hasta un minuto de diferencia.
- Si activas **«Ocultar el título en la notificación»**, el aviso solo dice «Tienes una actividad próxima».
- Necesitas **internet** en el teléfono a la hora del aviso. Si no hay señal, llega cuando vuelva (hasta 6 horas después; luego se descarta).
- Si cambias un evento **sin conexión**, el servidor se entera cuando vuelvas a tener internet.
- **Abre la app al menos una vez al mes** para que la lista de 60 días se mantenga al día.
- Los modos Concentración o No molestar del teléfono pueden silenciar los avisos, como con cualquier app.
- En iPhone, si borras la app de la pantalla de inicio, dejan de llegar los avisos.

## Costos

- **GitHub:** gratis.
- **Netlify plan gratuito:** 300 créditos al mes, sin cobros. Cada publicación (deploy) cuesta 15 créditos y el servidor que revisa los avisos cada minuto gasta pocos créditos al mes. Con uso personal y unas pocas actualizaciones al mes alcanza. Si se acaban los créditos, el plan gratuito pausa el sitio hasta el mes siguiente (y con él las notificaciones); para abrir la app al público conviene pasar a un plan de pago.
- **Dominio propio (opcional):** si quieres una dirección como `misherramientas.com`, se compra aparte y se conecta en Netlify → Domain management.

## Antes de abrirla al público

- **Política de privacidad:** explica que los datos se guardan en el teléfono y que, si se activan los avisos, el servidor guarda la suscripción y los recordatorios de los próximos 60 días.
- **Copias de seguridad:** recomienda a las personas descargarlas; si borran los datos del navegador o cambian de teléfono, se pierden.
- **Escala:** el servidor revisa uno por uno los teléfonos registrados. Funciona bien con cientos de usuarios; con miles conviene pasar a una base de datos con índices por hora.

## Probar en tu computador (opcional)

Con Node.js 20 o posterior instalado, desde esta carpeta:

```sh
VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... node herramientas/servidor-local.mjs
```

Abre `http://localhost:8888`. Las notificaciones reales solo llegan con la app publicada en `https://` (o en `localhost`).
