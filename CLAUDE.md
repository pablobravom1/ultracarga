# UltraCarga — notas del proyecto

App de seguimiento de entrenamientos para el gimnasio STC (Pablo Bravo). Stack: Supabase (Postgres + Auth + RLS) + Vercel (deploy) + GitHub (repo `pablobravom1/ultracarga`, deploy automático al hacer push a `main`). Producción: ultracarga.vercel.app.

## ⚠️ EN PRODUCCIÓN CON DATOS REALES — máxima precaución

Desde el 19 de agosto de 2026 la app fue aprobada por el jefe de Pablo y se empezó a usar en la empresa. **La base de datos ahora contiene información real de clientes/alumnos del gimnasio** (rutinas, sesiones, mediciones, mensajes). Ya no es un entorno de pruebas.

Regla explícita de Pablo: ningún cambio futuro puede arriesgar borrar información. Cero margen de error en eso.

Antes de cualquier cambio que toque datos, aplicar estas precauciones:

- **SQL destructivo (DELETE/DROP/TRUNCATE/UPDATE masivo)**: nunca correrlo directo en Supabase SQL Editor contra la base de producción sin antes revisar el `WHERE` con una consulta `SELECT` equivalente para confirmar exactamente qué filas afecta. Si el editor muestra el diálogo "Potential issue detected", leerlo con atención real, no confirmarlo por reflejo.
- **Funciones `security definer` que borran datos** (ej. `eliminar_alumno`): no probarlas contra cuentas reales. Si hace falta probar un flujo destructivo, usar o pedir una cuenta de prueba dedicada (como se hizo con "Pablo Segundo"), y limpiar después.
- **Cambios de RLS policies**: son la última línea de defensa entre un profesor/alumno y los datos de otros. Cualquier migración de políticas debe revisarse dos veces antes de correr — un error acá puede exponer o permitir borrar datos de alumnos que no le corresponden al usuario que hace la acción.
- **Migraciones de schema**: preferir `add column if not exists`, `create table if not exists`, y evitar `drop column`/`drop table` salvo que sea explícitamente pedido y confirmado.
- **Nunca asumir "total 1 usuario" solo hace pruebas**: ahora hay usuarios reales de la empresa además de Pablo. Cualquier acción irreversible (eliminar alumno, eliminar rutina/sesión, etc.) debe evaluarse asumiendo que puede haber datos reales de por medio, no solo datos de prueba.
- Ante cualquier duda sobre si una acción es reversible o segura, preguntarle a Pablo antes de ejecutarla — no asumir.

## Flujo de deploy (sin cambios)

1. Editar archivos localmente en `/root/ultracarga/`.
2. `node --check app.js` para verificar sintaxis antes de subir.
3. Copiar los archivos modificados a `/mnt/user-data/outputs/` (solo esos, limpiar el resto).
4. Subir vía navegador a `https://github.com/pablobravom1/ultracarga/upload/main` (file_upload + click en "Commit changes").
5. Verificar el commit en `https://github.com/pablobravom1/ultracarga/commits/main/<archivo>`.
6. Verificar en `https://vercel.com/ultra-carga/ultracarga` que el deploy quedó "Ready" con el mismo hash de commit.
7. Sanity check visual en el sitio en vivo (y consola sin errores) antes de dar por terminado.
8. Cambios de base de datos van en un archivo `schema_*.sql` nuevo (no editar los anteriores) y se corren manualmente en el SQL Editor de Supabase — no hay migración automática.

## Roles y modelo de datos (resumen)

- `profiles.role`: `alumno` | `profesor` | `super_admin`. Pablo es `super_admin`.
- `profiles.profesor_id`: alumno → profesor asignado (o null).
- Helpers RLS: `is_super_admin()`, `is_profesor()`, `puede_gestionar_alumno(target_alumno_id)`.
- Trigger `prevent_role_escalation`: nadie que no sea super_admin puede cambiarse el rol o el profesor asignado.
- `opiniones`: buzón privado alumno → super_admin, invisible para profesores a propósito (no usa `puede_gestionar_alumno`).
- Patrón de borrado en la UI: doble-tap-confirm (botón cambia de texto y pide tocar de nuevo dentro de 3s), clase compartida `btn-eliminar-sesion` pero SIEMPRE referenciada por `id` único vía `getElementById` — nunca por `querySelector` sobre la clase compartida (esto causó un incidente de borrado accidental en el pasado).
