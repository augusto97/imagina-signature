# CLAUDE.md — Imagina Signatures WordPress Plugin

> **Para Claude Code:** Este documento es la fuente única de verdad para el desarrollo de este plugin. Léelo completo antes de cualquier modificación. Ante ambigüedades, prefiere las convenciones aquí establecidas sobre tus defaults.

---

## 0. Identidad del Proyecto

**Nombre del producto:** Imagina Signatures
**Slug del plugin:** `imagina-signatures`
**Text domain:** `imagina-signatures`
**Namespace PHP raíz:** `ImaginaSignatures\`
**Prefijo DB:** `imgsig_`
**Prefijo de funciones globales:** `imgsig_`
**Prefijo CSS:** `is-`
**Prefijo JS global:** `ImaginaSignatures` (objeto único en `window`)
**Versión inicial:** `1.0.0`
**Autor:** Imagina WP
**Author URI:** https://imaginawp.com

**Descripción corta:** Plugin WordPress para crear firmas de correo profesionales con editor drag-and-drop, soporte multi-usuario con planes configurables, y storage dual (Media Library nativa o S3-compatible externo).

**Distribución target inicial:** Uso interno y/o venta directa desde sitio propio. Opcional a futuro: marketplaces (CodeCanyon u otros) cuando esté disponible.

**Licencia del código:** GPL v2 or later (compatible con WordPress y futuras distribuciones).

**Estado del licenciamiento del producto:** El plugin se distribuye sin sistema de verificación de licencias en esta fase. Esta decisión es deliberada para acelerar el MVP. El código debe permanecer agnóstico respecto a licenciamiento — no incluir hooks vacíos, opciones reservadas ni stubs. Si se añade en el futuro, se diseñará como módulo independiente sin tocar el core.

---

## 1. Stack Técnico Confirmado

### 1.1. Backend (PHP)

| Tech | Versión | Justificación |
|------|---------|---------------|
| WordPress | 6.0+ | Compatibilidad amplia |
| PHP | 7.4+ (target 8.0–8.3) | Compatible con hosting compartido |
| MySQL/MariaDB | 5.7+ / 10.3+ | Estándar |
| Estándar de código | WordPress Coding Standards (WPCS) + PSR-4 namespacing | Mejor de ambos mundos |
| Autoloader | Custom (sin Composer en runtime del comprador) | Buena práctica para distribución |
| Linter | PHP_CodeSniffer + `WordPress` ruleset + `PHPCompatibility` | Estándar |
| Testing | PHPUnit 9 + Brain Monkey | Mocking de WP |

### 1.2. Frontend (en wp-admin)

| Tech | Versión | Justificación |
|------|---------|---------------|
| Build | Vite 5+ | DX moderno |
| Framework | Preact 10 (alias `react` → `preact/compat`) | Bundle pequeño |
| Lenguaje | TypeScript 5+ strict | Mantenibilidad |
| Editor | GrapesJS 0.21+ con `grapesjs-preset-newsletter` | Decidido |
| Email compiler | `mjml-browser` 4.x | Compila MJML en el cliente |
| CSS inliner | `juice` (browser build) | Inline CSS en el HTML final |
| Image utils | `browser-image-compression` | Resize/compresión client-side |
| Estado | Zustand 4+ | Ligero, sin boilerplate |
| UI primitives | Radix UI (unstyled) | Accesibles |
| Estilos | Tailwind CSS 3+ con prefix `is-` | Aislamiento de wp-admin |
| HTTP | `@wordpress/api-fetch` | Maneja nonces de WP |
| Iconos | Lucide (tree-shaken) | Solo los iconos usados |
| Linter | ESLint + `@typescript-eslint` | Estándar |
| Formatter | Prettier | Estándar |
| Testing | Vitest + Testing Library | Moderno y rápido |

### 1.3. Restricciones absolutas de runtime

El plugin **NO PUEDE** depender en runtime de:
- Composer (`vendor/autoload.php` está pre-vendored, no se ejecuta `composer install` en el servidor del comprador)
- Node.js en el servidor
- `exec()`, `shell_exec()`, `proc_open()`, `system()`, `passthru()`
- Extensiones PHP no estándar: solo `curl`, `json`, `mbstring`, `openssl`, `gd` (pueden faltar — fallback siempre)
- CDNs externos (Google Fonts, jsDelivr, unpkg, etc.)
- Servicios SaaS externos del autor
- Conexiones de salida que no sean al storage configurado por el usuario

Si un feature requiere algo de lo anterior, **debe haber un fallback graceful** o el feature no entra al MVP.

---

## 2. Estructura de Archivos del Repositorio

```
imagina-signatures/
├── imagina-signatures.php            # Plugin main file (header + bootstrap)
├── uninstall.php                     # Cleanup al desinstalar
├── readme.txt                        # Formato WordPress.org
├── README.md                         # Para desarrolladores (GitHub)
├── CHANGELOG.md                      # Semver, formato Keep a Changelog
├── LICENSE                           # GPL v2
├── CONTRIBUTING.md                   # Guías para colaboradores futuros
├── CLAUDE.md                         # Este documento
├── composer.json                     # Solo para desarrollo (linting)
├── composer.lock
├── package.json                      # Build tools
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── .eslintrc.cjs
├── .prettierrc
├── phpcs.xml.dist                    # WPCS config
├── phpunit.xml.dist
├── .gitignore
├── .editorconfig
│
├── src/                              # PHP source (PSR-4)
│   ├── Core/
│   │   ├── Plugin.php                # Singleton bootstrap
│   │   ├── Activator.php             # Activación
│   │   ├── Deactivator.php           # Desactivación
│   │   ├── Uninstaller.php           # Desinstalación (limpieza)
│   │   ├── Installer.php             # DB schema + migrations
│   │   ├── Autoloader.php            # PSR-4 sin Composer
│   │   ├── Container.php             # DI container simple
│   │   └── ServiceProvider.php       # Registro de servicios
│   │
│   ├── Admin/
│   │   ├── AdminMenu.php             # Registra menús según rol
│   │   ├── Pages/
│   │   │   ├── DashboardPage.php
│   │   │   ├── SignaturesListPage.php
│   │   │   ├── EditorPage.php        # Mount point del editor JS
│   │   │   ├── TemplatesPage.php
│   │   │   ├── PlansPage.php
│   │   │   ├── UsersPage.php
│   │   │   ├── StorageSettingsPage.php
│   │   │   ├── GeneralSettingsPage.php
│   │   │   └── SetupWizardPage.php   # First-run wizard
│   │   ├── Notices.php               # Admin notices manager
│   │   └── AssetEnqueuer.php         # Enqueue scripts/styles condicionalmente
│   │
│   ├── Frontend/
│   │   └── Dashboard.php             # Integra el JS compilado
│   │
│   ├── Api/
│   │   ├── RestRouter.php            # Registra rutas
│   │   ├── BaseController.php        # Permisos, validación, response helpers
│   │   ├── Controllers/
│   │   │   ├── SignaturesController.php
│   │   │   ├── TemplatesController.php
│   │   │   ├── AssetsController.php
│   │   │   ├── UploadController.php
│   │   │   ├── UsersController.php
│   │   │   ├── PlansController.php
│   │   │   ├── StorageController.php
│   │   │   └── MeController.php
│   │   └── Middleware/
│   │       ├── NonceValidator.php
│   │       ├── CapabilityCheck.php
│   │       ├── OwnershipCheck.php
│   │       ├── RateLimiter.php
│   │       └── QuotaCheck.php
│   │
│   ├── Models/
│   │   ├── BaseModel.php             # Abstract
│   │   ├── Signature.php
│   │   ├── Template.php
│   │   ├── Asset.php
│   │   ├── Plan.php
│   │   ├── UserPlan.php
│   │   └── UsageRecord.php
│   │
│   ├── Repositories/                 # DB access layer (queries)
│   │   ├── BaseRepository.php
│   │   ├── SignatureRepository.php
│   │   ├── TemplateRepository.php
│   │   ├── AssetRepository.php
│   │   ├── PlanRepository.php
│   │   └── UsageRepository.php
│   │
│   ├── Services/                     # Business logic
│   │   ├── SignatureService.php
│   │   ├── TemplateService.php
│   │   ├── PlanService.php
│   │   ├── QuotaEnforcer.php
│   │   ├── HtmlSanitizer.php
│   │   ├── JsonSchemaValidator.php
│   │   ├── MigrationService.php      # Migrate between storage drivers
│   │   ├── UsageCalculator.php
│   │   └── ExportService.php
│   │
│   ├── Storage/
│   │   ├── StorageManager.php        # Factory según config
│   │   ├── Contracts/
│   │   │   └── StorageDriverInterface.php
│   │   ├── Drivers/
│   │   │   ├── MediaLibraryDriver.php
│   │   │   └── S3Driver.php
│   │   ├── S3/
│   │   │   ├── S3Client.php          # Implementación SigV4 minimalista
│   │   │   ├── SigV4Signer.php
│   │   │   ├── PresignedUrl.php
│   │   │   └── BucketConfig.php
│   │   └── Dto/
│   │       ├── UploadResult.php
│   │       ├── PresignedResult.php
│   │       └── TestResult.php
│   │
│   ├── Security/
│   │   ├── Encryption.php            # openssl_encrypt wrapper
│   │   ├── CapabilitiesManager.php
│   │   ├── NonceManager.php
│   │   ├── RateLimitStore.php        # Transients-based
│   │   └── InputSanitizer.php
│   │
│   ├── Setup/
│   │   ├── RolesInstaller.php
│   │   ├── DefaultPlansSeeder.php
│   │   ├── DefaultTemplatesSeeder.php
│   │   └── SchemaMigrator.php        # Versioned migrations
│   │
│   ├── Hooks/                        # Hooks públicos para extensibilidad
│   │   ├── Actions.php               # Lista de do_action() expuestos
│   │   └── Filters.php               # Lista de apply_filters() expuestos
│   │
│   ├── Integrations/                 # Hooks para 3rd-party (PMP, WooCommerce, etc.)
│   │   ├── PaidMembershipsPro.php
│   │   ├── WooCommerceMemberships.php
│   │   └── MemberPress.php
│   │
│   └── Utils/
│       ├── Logger.php
│       ├── ArrayHelper.php
│       ├── DateHelper.php
│       ├── UrlHelper.php
│       └── HashHelper.php
│
├── assets/                           # Frontend source (compiles to /build)
│   ├── editor/                       # The big React/Preact app
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── routes.tsx
│   │   │   ├── editor/
│   │   │   │   ├── GrapesEditor.tsx
│   │   │   │   ├── grapes-config.ts
│   │   │   │   ├── blocks/           # Custom blocks
│   │   │   │   │   ├── avatar.ts
│   │   │   │   │   ├── text-stack.ts
│   │   │   │   │   ├── social-row.ts
│   │   │   │   │   ├── contact-row.ts
│   │   │   │   │   ├── divider.ts
│   │   │   │   │   ├── spacer.ts
│   │   │   │   │   ├── button-cta.ts
│   │   │   │   │   ├── disclaimer.ts
│   │   │   │   │   └── image-block.ts
│   │   │   │   ├── panels/
│   │   │   │   │   ├── BlocksPanel.tsx
│   │   │   │   │   ├── PropertiesPanel.tsx
│   │   │   │   │   ├── LayersPanel.tsx
│   │   │   │   │   └── VariablesPanel.tsx
│   │   │   │   └── toolbar/
│   │   │   │       ├── DeviceSwitcher.tsx
│   │   │   │       ├── UndoRedo.tsx
│   │   │   │       └── PreviewToggle.tsx
│   │   │   ├── compiler/
│   │   │   │   ├── json-to-mjml.ts   # Schema → MJML
│   │   │   │   ├── mjml-to-html.ts   # mjml-browser wrapper
│   │   │   │   ├── html-inliner.ts   # juice wrapper
│   │   │   │   ├── html-minifier.ts
│   │   │   │   ├── grapes-to-json.ts # GrapesJS → schema interno
│   │   │   │   └── json-to-grapes.ts # schema → GrapesJS
│   │   │   ├── preview/
│   │   │   │   ├── EmailPreview.tsx
│   │   │   │   ├── clients/
│   │   │   │   │   ├── GmailEmulator.tsx
│   │   │   │   │   ├── OutlookEmulator.tsx
│   │   │   │   │   └── AppleMailEmulator.tsx
│   │   │   │   └── DarkModePreview.tsx
│   │   │   ├── templates/
│   │   │   │   ├── TemplatePicker.tsx
│   │   │   │   └── TemplateCard.tsx
│   │   │   ├── components/           # UI components
│   │   │   │   ├── ui/               # Radix-based primitives
│   │   │   │   │   ├── Button.tsx
│   │   │   │   │   ├── Input.tsx
│   │   │   │   │   ├── Dialog.tsx
│   │   │   │   │   ├── Tabs.tsx
│   │   │   │   │   └── ...
│   │   │   │   ├── ImageUploader.tsx
│   │   │   │   ├── ColorPicker.tsx
│   │   │   │   ├── IconPicker.tsx
│   │   │   │   └── CodeViewer.tsx
│   │   │   ├── stores/
│   │   │   │   ├── editorStore.ts
│   │   │   │   ├── signatureStore.ts
│   │   │   │   ├── userStore.ts
│   │   │   │   └── uiStore.ts
│   │   │   ├── api/
│   │   │   │   ├── client.ts         # @wordpress/api-fetch wrapper
│   │   │   │   ├── signatures.ts
│   │   │   │   ├── templates.ts
│   │   │   │   ├── upload.ts
│   │   │   │   └── me.ts
│   │   │   ├── schema/               # JSON schema types + validators
│   │   │   │   ├── signature.ts
│   │   │   │   ├── blocks.ts
│   │   │   │   └── validators.ts
│   │   │   ├── i18n/
│   │   │   │   └── helpers.ts        # __() wrapper
│   │   │   ├── utils/
│   │   │   │   ├── image.ts          # Compresión, hash, resize
│   │   │   │   ├── debounce.ts
│   │   │   │   └── clipboard.ts
│   │   │   └── constants.ts
│   │   ├── public/
│   │   │   └── icons/                # SVG icons embebidos
│   │   └── index.html                # Solo para dev
│   │
│   ├── admin/                        # Vistas más simples (listas, settings)
│   │   ├── src/
│   │   │   ├── settings.tsx
│   │   │   ├── plans.tsx
│   │   │   ├── users.tsx
│   │   │   ├── storage.tsx
│   │   │   └── setup-wizard.tsx
│   │   └── ...
│   │
│   ├── shared/                       # Código compartido entre editor y admin
│   │   ├── api-client.ts
│   │   ├── types.ts
│   │   └── constants.ts
│   │
│   └── styles/
│       ├── editor.css                # Tailwind layers
│       └── admin.css
│
├── build/                            # Output de Vite (committed para distribución)
│   ├── editor.js
│   ├── editor.css
│   ├── admin.js
│   └── admin.css
│
├── templates/                        # Plantillas de firmas pre-hechas (JSON)
│   ├── corporate-classic.json
│   ├── minimal-modern.json
│   ├── sales-active.json
│   ├── medical.json
│   ├── legal.json
│   ├── creative.json
│   ├── developer.json
│   ├── tech-startup.json
│   ├── consultant.json
│   └── e-commerce.json
│
├── languages/
│   ├── imagina-signatures.pot        # Source strings
│   ├── imagina-signatures-es_ES.po
│   ├── imagina-signatures-es_ES.mo
│   ├── imagina-signatures-es_CO.po   # Español Colombia
│   ├── imagina-signatures-es_CO.mo
│   ├── imagina-signatures-en_US.po
│   └── imagina-signatures-en_US.mo
│
├── docs/                             # Documentación al usuario (HTML estático)
│   ├── index.html
│   ├── installation.html
│   ├── quick-start.html
│   ├── modes/
│   │   ├── single-user.html
│   │   └── multi-user.html
│   ├── storage/
│   │   ├── overview.html
│   │   ├── media-library.html
│   │   ├── cloudflare-r2.html
│   │   ├── bunny.html
│   │   ├── amazon-s3.html
│   │   ├── backblaze-b2.html
│   │   └── digitalocean-spaces.html
│   ├── plans-and-users.html
│   ├── templates.html
│   ├── editor-guide.html
│   ├── installing-signature/
│   │   ├── gmail.html
│   │   ├── outlook-desktop.html
│   │   ├── outlook-web.html
│   │   ├── apple-mail.html
│   │   └── ios-mail.html
│   ├── developers/                   # Para extender el plugin
│   │   ├── hooks-actions.html
│   │   ├── hooks-filters.html
│   │   └── custom-blocks.html
│   ├── faq.html
│   ├── troubleshooting.html
│   └── assets/                       # CSS/imgs de la doc
│
├── tests/
│   ├── php/
│   │   ├── Unit/
│   │   ├── Integration/
│   │   └── bootstrap.php
│   ├── js/
│   │   ├── editor/
│   │   ├── compiler/
│   │   └── setup.ts
│   └── e2e/                          # Playwright (opcional, post-MVP)
│
├── vendor/                           # Pre-vendored PHP deps (mínimas)
│   └── autoload.php                  # Custom autoloader (sin Composer libs por ahora)
│
├── scripts/                          # Build/release scripts
│   ├── build-zip.sh                  # Genera ZIP listo para distribución
│   ├── update-version.sh
│   ├── make-pot.sh                   # Genera .pot
│   └── pre-commit.sh
│
└── .github/
    └── workflows/
        ├── ci.yml                    # Lint + tests
        ├── build.yml                 # Build + artifact
        └── release.yml               # Release zip
```

**Reglas estrictas:**
- Nada en la raíz salvo lo listado arriba
- `build/` se commitea (necesario para distribución)
- `node_modules/` NO se commitea
- `vendor/` SÍ se commitea (pre-vendoring para distribución)
- Archivos de IDE (`.vscode/`, `.idea/`) en `.gitignore`

---

## 3. Convenciones de Código PHP

### 3.1. Estilo general

- **WordPress Coding Standards (WPCS)** como base, con excepciones documentadas en `phpcs.xml.dist`
- **PSR-4 autoloading** (`ImaginaSignatures\Core\Plugin` → `src/Core/Plugin.php`)
- **Tabs para indentación** (WPCS lo exige)
- **Yoda conditions** sí (`if ( 'value' === $var )`)
- **Llaves SIEMPRE** incluso en if de una línea
- **Prefijo `imgsig_`** en TODA función global, hook, option, transient, post type, taxonomy, capability
- **Namespacing PSR-4** para clases: `namespace ImaginaSignatures\Services;`
- **`declare(strict_types=1);`** en todo archivo PHP nuevo
- **Type hints** obligatorios en parámetros y returns (PHP 7.4+)
- **Nullable types** explícitos (`?string` no solo `string|null` en docblocks)
- **Property types** en clases (PHP 7.4+)

### 3.2. Naming

```php
// Clases: PascalCase
class SignatureService {}
class S3Driver {}

// Métodos y funciones: snake_case (estilo WP)
public function create_signature(int $user_id, array $data): Signature {}
function imgsig_get_plugin_version(): string {}

// Propiedades: snake_case
private string $api_endpoint;
protected array $cached_results;

// Constantes de clase: SCREAMING_SNAKE_CASE
const DEFAULT_PAGE_SIZE = 20;
const STATUS_DRAFT = 'draft';

// Variables locales: snake_case
$user_id = get_current_user_id();
$signature_data = wp_unslash( $_POST['data'] );

// Hooks: snake_case con namespace virtual
do_action( 'imgsig/signature/created', $signature );
apply_filters( 'imgsig/signature/before_save', $data, $context );

// Tabla DB: prefijo + snake_case
$table = $wpdb->prefix . 'imgsig_signatures';

// Options: prefijo + snake_case
get_option( 'imgsig_storage_config' );

// Transients: prefijo + snake_case
set_transient( 'imgsig_user_quota_42', $value, HOUR_IN_SECONDS );

// Capabilities: prefijo
'imgsig_admin'
'imgsig_edit_signatures'
```

### 3.3. Documentación PHPDoc

**Toda clase y método público debe tener PHPDoc.** Usa el estilo de WordPress core:

```php
/**
 * Service for managing signature CRUD operations and business logic.
 *
 * Handles validation, quota enforcement, and integration with the active
 * storage driver. All public methods are user-scoped: they receive a user_id
 * and never operate cross-user.
 *
 * @since 1.0.0
 * @package ImaginaSignatures\Services
 */
class SignatureService {

    /**
     * Creates a new signature for the given user.
     *
     * Validates against user's plan quotas before creation. Persists the JSON
     * content and triggers the `imgsig/signature/created` action.
     *
     * @since 1.0.0
     *
     * @param int   $user_id User ID who owns the signature.
     * @param array $data {
     *     Signature data.
     *
     *     @type string $name         Display name for the signature.
     *     @type array  $json_content The signature schema (validated).
     *     @type ?int   $template_id  Optional template ID used as base.
     * }
     *
     * @return Signature The created signature model.
     *
     * @throws QuotaExceededException If user has reached their plan limit.
     * @throws ValidationException    If data fails schema validation.
     */
    public function create_signature( int $user_id, array $data ): Signature {
        // ...
    }
}
```

### 3.4. Manejo de errores

- **Excepciones tipadas** para errores de dominio (no `\Exception` genérico)
- **`WP_Error`** para errores que cruzan a WordPress (REST API, hooks)
- **Conversión** de excepciones a `WP_Error` en la capa de Controllers

```php
// src/Exceptions/
class ImaginaSignaturesException extends \RuntimeException {}
class QuotaExceededException extends ImaginaSignaturesException {}
class ValidationException extends ImaginaSignaturesException {
    public function __construct(string $message, public readonly array $errors = []) {
        parent::__construct($message);
    }
}
class StorageException extends ImaginaSignaturesException {}
class OwnershipException extends ImaginaSignaturesException {}

// Uso en Service:
if ( $usage->signatures_count >= $plan->limits['max_signatures'] ) {
    throw new QuotaExceededException( 'Plan signature limit reached.' );
}

// Conversión en Controller:
try {
    $signature = $this->service->create_signature( $user_id, $data );
    return rest_ensure_response( $signature->to_array() );
} catch ( QuotaExceededException $e ) {
    return new \WP_Error( 'imgsig_quota_exceeded', $e->getMessage(), [ 'status' => 403 ] );
} catch ( ValidationException $e ) {
    return new \WP_Error( 'imgsig_validation_failed', $e->getMessage(), [ 'status' => 400, 'errors' => $e->errors ] );
}
```

### 3.5. Queries a base de datos

**Reglas absolutas:**

```php
// SIEMPRE usar $wpdb->prepare() para cualquier valor dinámico
$results = $wpdb->get_results( $wpdb->prepare(
    "SELECT * FROM {$wpdb->prefix}imgsig_signatures WHERE user_id = %d AND status = %s ORDER BY updated_at DESC LIMIT %d",
    $user_id,
    $status,
    $limit
) );

// NUNCA concatenar variables en SQL directamente
// MAL: "WHERE user_id = $user_id"  ← prohibido

// Usar el prefix dinámico de $wpdb (no hardcodear `wp_`)
$table = $wpdb->prefix . 'imgsig_signatures';

// Helpers para queries comunes en Repositories
class SignatureRepository extends BaseRepository {
    public function find_by_user(int $user_id, array $args = []): array {
        // ...
    }
    public function count_by_user(int $user_id): int {
        // ...
    }
}
```

### 3.6. Sanitización y escape

**Triple regla:**
1. **Sanitiza** al recibir input (`sanitize_text_field`, `sanitize_email`, `wp_kses`, etc.)
2. **Valida** según schema (no asumir tipos)
3. **Escapa** al output (`esc_html`, `esc_attr`, `esc_url`)

```php
// Recibir input
$name = sanitize_text_field( wp_unslash( $request->get_param( 'name' ) ?? '' ) );
$json = $request->get_param( 'json_content' ); // Validar con JsonSchemaValidator

// Output en HTML
echo '<h2>' . esc_html( $signature->name ) . '</h2>';
echo '<a href="' . esc_url( $signature->preview_url ) . '">';
echo '<input value="' . esc_attr( $value ) . '">';

// Output en JS contexts (raro, evitar)
wp_localize_script( 'imagina-signatures-editor', 'ImaginaSignaturesData', [
    'apiUrl' => esc_url_raw( rest_url( 'imgsig/v1' ) ),
    'nonce'  => wp_create_nonce( 'wp_rest' ),
] );
```

### 3.7. Hooks (acciones y filtros)

**Convención de naming:**

```php
// Acciones: forma "imgsig/{entity}/{event}" — usar slash, no underscore para separar niveles
do_action( 'imgsig/signature/before_create', $data, $user_id );
do_action( 'imgsig/signature/created', $signature );
do_action( 'imgsig/signature/before_delete', $signature );
do_action( 'imgsig/signature/deleted', $signature_id );

do_action( 'imgsig/asset/uploaded', $asset );
do_action( 'imgsig/storage/driver_changed', $old_driver, $new_driver );
do_action( 'imgsig/user/plan_assigned', $user_id, $plan );

// Filtros: forma "imgsig/{noun}/{adjective}"
$data = apply_filters( 'imgsig/signature/data_before_save', $data, $context );
$html = apply_filters( 'imgsig/signature/compiled_html', $html, $signature );
$limits = apply_filters( 'imgsig/plan/limits', $limits, $plan );
$drivers = apply_filters( 'imgsig/storage/available_drivers', $drivers );
```

**Documentar todos los hooks públicos** en `src/Hooks/Actions.php` y `src/Hooks/Filters.php` con docblocks. Mantener una página en `docs/developers/` con la lista completa.

### 3.8. Inyección de dependencias

Usa un Container simple. **No singletons salvo el bootstrap del plugin.**

```php
// src/Core/Container.php
class Container {
    private array $bindings = [];
    private array $instances = [];

    public function bind(string $abstract, callable $factory): void {
        $this->bindings[$abstract] = $factory;
    }

    public function singleton(string $abstract, callable $factory): void {
        $this->bind($abstract, function() use ($factory, $abstract) {
            return $this->instances[$abstract] ??= $factory($this);
        });
    }

    public function make(string $abstract): mixed {
        if (!isset($this->bindings[$abstract])) {
            throw new \RuntimeException("No binding for {$abstract}");
        }
        return ($this->bindings[$abstract])($this);
    }
}

// Uso en ServiceProvider:
$container->singleton(StorageManager::class, fn($c) => new StorageManager(
    $c->make(Encryption::class),
    get_option('imgsig_storage_config', [])
));

// Inyección por constructor (no @inject ni magic):
class SignatureService {
    public function __construct(
        private SignatureRepository $repo,
        private QuotaEnforcer $quota,
        private JsonSchemaValidator $validator,
        private Logger $logger
    ) {}
}
```

### 3.9. Unidades de tiempo y fechas

- **Siempre UTC en DB** (`gmdate('Y-m-d H:i:s')`)
- **Display en timezone del sitio** (`wp_date()`)
- **Comparaciones internas con timestamps** (no strings)

```php
// Insert
$wpdb->insert($table, [
    'created_at' => gmdate('Y-m-d H:i:s'),
]);

// Display
echo esc_html(wp_date('F j, Y g:i a', strtotime($signature->created_at)));
```

### 3.10. Reglas anti-conflicto

El plugin **debe convivir** con cualquier otro plugin de WP:

- **Nunca** modificar globals de WP (`$wp_query`, `$post`, etc.) sin restaurar
- **Nunca** registrar handlers de error globales sin namespacing
- **Nunca** override de funciones core
- **Nunca** include sin verificar duplicación
- **Nunca** session_start() en código (incompatible con muchos hostings)
- **Siempre** capability checks antes de operaciones
- **Siempre** verificar `function_exists()` antes de usar funciones de WP en archivos que pueden cargarse temprano
- **Aislar CSS** en wp-admin con `body.imagina-signatures-page` selector

---

## 4. Convenciones de Código TypeScript / Frontend

### 4.1. Estilo general

- **TypeScript strict mode** activado (`"strict": true` en tsconfig)
- **No `any`** salvo en interop con librerías sin tipos (con comentario justificando)
- **Imports absolutos** desde `@/` apuntando a `src/`
- **2 espacios** para indentación (no tabs)
- **Single quotes** para strings (`'foo'` no `"foo"`)
- **Trailing commas** en multilinea
- **Semicolons** sí
- **Functional components** (no class components)
- **Hooks rules** (eslint-plugin-react-hooks activado)

### 4.2. Naming

```typescript
// Componentes: PascalCase
function SignatureCard() {}
const EditorToolbar: FC = () => {};

// Hooks: useCamelCase
function useSignature(id: number) {}

// Stores Zustand: useCamelCaseStore
const useEditorStore = create<EditorState>()(...);

// Tipos e interfaces: PascalCase
interface SignatureData {}
type BlockType = 'text' | 'image' | 'social';

// Constantes: SCREAMING_SNAKE_CASE
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const DEFAULT_FONT_FAMILY = 'Arial, Helvetica, sans-serif';

// Variables: camelCase
const signatureId = 42;
const isEditing = false;

// Archivos:
//   - Componentes: PascalCase.tsx (Button.tsx)
//   - Hooks/utils: camelCase.ts (useSignature.ts, debounce.ts)
//   - Schemas/types: camelCase.ts
```

### 4.3. Estructura de componentes

```typescript
// SignatureCard.tsx
import { FC } from 'preact/compat';
import { Button } from '@/components/ui/Button';
import { useSignatureStore } from '@/stores/signatureStore';
import type { Signature } from '@/schema/signature';

interface SignatureCardProps {
  signature: Signature;
  onEdit?: (id: number) => void;
}

export const SignatureCard: FC<SignatureCardProps> = ({ signature, onEdit }) => {
  const deleteSignature = useSignatureStore((state) => state.deleteSignature);

  return (
    <div className="is-card">
      {/* contenido */}
    </div>
  );
};
```

**Reglas:**
- Una exportación principal por archivo (puede haber sub-tipos)
- Props tipadas con interface separada
- No `default export` (mejor para refactors)
- Imports ordenados: librerías → internas → tipos → estilos

### 4.4. Estado con Zustand

```typescript
// src/stores/editorStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { SignatureSchema } from '@/schema/signature';

interface EditorState {
  // State
  currentSignature: SignatureSchema | null;
  isDirty: boolean;
  isSaving: boolean;

  // Actions (always typed, always pure)
  setSignature: (signature: SignatureSchema) => void;
  markDirty: () => void;
  save: () => Promise<void>;
  reset: () => void;
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set, get) => ({
      currentSignature: null,
      isDirty: false,
      isSaving: false,

      setSignature: (signature) => set({ currentSignature: signature, isDirty: false }),
      markDirty: () => set({ isDirty: true }),
      save: async () => {
        // ...
      },
      reset: () => set({ currentSignature: null, isDirty: false, isSaving: false }),
    }),
    { name: 'editor-store' }
  )
);
```

**Reglas:**
- Un store por dominio (no un mega-store)
- Selectors siempre granulares (`useEditorStore((s) => s.isDirty)` no `const state = useEditorStore()`)
- Devtools middleware en desarrollo

### 4.5. API client

```typescript
// src/api/client.ts
import apiFetch from '@wordpress/api-fetch';

declare global {
  interface Window {
    ImaginaSignaturesData: {
      apiUrl: string;
      nonce: string;
      currentUser: { id: number; capabilities: string[] };
      mode: 'single' | 'multi';
      storage: { driver: string; configured: boolean };
    };
  }
}

apiFetch.use(apiFetch.createNonceMiddleware(window.ImaginaSignaturesData.nonce));
apiFetch.use(apiFetch.createRootURLMiddleware(window.ImaginaSignaturesData.apiUrl));

export async function apiGet<T>(path: string): Promise<T> {
  return apiFetch({ path, method: 'GET' });
}

export async function apiPost<T>(path: string, data: unknown): Promise<T> {
  return apiFetch({ path, method: 'POST', data });
}

// Específicos por dominio:
// src/api/signatures.ts
import { apiGet, apiPost } from './client';
import type { Signature, SignatureSchema } from '@/schema/signature';

export const signaturesApi = {
  list: () => apiGet<{ items: Signature[]; total: number }>('/signatures'),
  get: (id: number) => apiGet<Signature>(`/signatures/${id}`),
  create: (data: { name: string; json_content: SignatureSchema }) =>
    apiPost<Signature>('/signatures', data),
  // ...
};
```

### 4.6. Validación de schemas

Para validar el schema JSON de firmas, usar funciones puras (no `zod` para mantener bundle pequeño):

```typescript
// src/schema/validators.ts
import type { SignatureSchema, Block } from './signature';

export interface ValidationError {
  path: string;
  message: string;
}

export function validateSignatureSchema(data: unknown): {
  valid: boolean;
  errors: ValidationError[];
  schema?: SignatureSchema;
} {
  const errors: ValidationError[] = [];
  // ... validación manual con type guards
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], schema: data as SignatureSchema };
}
```

### 4.7. i18n

```typescript
import { __, _n, sprintf } from '@wordpress/i18n';

// Strings simples
<h1>{__('My Signatures', 'imagina-signatures')}</h1>

// Plurales
<p>{sprintf(_n('%d signature', '%d signatures', count, 'imagina-signatures'), count)}</p>

// Con variables
<p>{sprintf(__('Created on %s', 'imagina-signatures'), formattedDate)}</p>
```

**Regla:** TODO string visible al usuario debe pasar por `__()` o `_n()`. Nunca strings hardcoded.

### 4.8. Estilos con Tailwind

- **Prefix `is-`** para evitar colisiones con wp-admin: configurado en `tailwind.config.ts`
- **Todas las clases** quedan como `is-flex`, `is-bg-blue-500`, etc.
- **Reset CSS** scopado a `.imagina-signatures-app` (no global)
- **Variables CSS** para colores del editor en `assets/styles/editor.css`

```typescript
// tailwind.config.ts
export default {
  prefix: 'is-',
  important: '.imagina-signatures-app',
  content: ['./assets/**/*.{ts,tsx,html}'],
  theme: { /* ... */ },
};
```

### 4.9. Performance del editor

- **Code splitting** por ruta (dashboard, editor, plantillas)
- **Lazy load** de GrapesJS (es ~500KB) — solo en la ruta del editor
- **Debounce** en eventos `onChange` del editor (300ms)
- **Memoization** con `useMemo`/`useCallback` en componentes con renders pesados
- **Virtualization** en listas de plantillas/firmas si hay 50+

```typescript
// Lazy load del editor
const EditorPage = lazy(() => import('@/pages/EditorPage'));
```

---

## 5. Modelo de Datos Detallado

### 5.1. Schema completo

```sql
-- Tabla: signatures
CREATE TABLE {prefix}imgsig_signatures (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    json_content LONGTEXT NOT NULL,
    html_cache LONGTEXT NULL,
    preview_url TEXT NULL,
    template_id BIGINT UNSIGNED NULL,
    status ENUM('draft','ready','archived') NOT NULL DEFAULT 'draft',
    schema_version VARCHAR(10) NOT NULL DEFAULT '1.0',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_user_updated (user_id, updated_at DESC),
    KEY idx_status (status),
    KEY idx_template (template_id)
) {charset_collate};

-- Tabla: templates
CREATE TABLE {prefix}imgsig_templates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'general',
    description TEXT NULL,
    preview_url TEXT NULL,
    json_content LONGTEXT NOT NULL,
    is_premium TINYINT(1) NOT NULL DEFAULT 0,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    schema_version VARCHAR(10) NOT NULL DEFAULT '1.0',
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_slug (slug),
    KEY idx_category (category, is_premium)
) {charset_collate};

-- Tabla: assets
CREATE TABLE {prefix}imgsig_assets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    storage_driver VARCHAR(50) NOT NULL,
    storage_key TEXT NOT NULL,
    public_url TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT UNSIGNED NOT NULL,
    width INT UNSIGNED NULL,
    height INT UNSIGNED NULL,
    hash_sha256 CHAR(64) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_user_created (user_id, created_at DESC),
    KEY idx_hash (hash_sha256)
) {charset_collate};

-- Tabla: plans
CREATE TABLE {prefix}imgsig_plans (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    limits_json LONGTEXT NOT NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_slug (slug),
    KEY idx_active_default (is_active, is_default)
) {charset_collate};

-- Tabla: user_plans (pivote)
CREATE TABLE {prefix}imgsig_user_plans (
    user_id BIGINT UNSIGNED NOT NULL,
    plan_id BIGINT UNSIGNED NOT NULL,
    assigned_at DATETIME NOT NULL,
    expires_at DATETIME NULL,
    metadata LONGTEXT NULL,
    PRIMARY KEY (user_id),
    KEY idx_plan (plan_id),
    KEY idx_expires (expires_at)
) {charset_collate};

-- Tabla: usage (cache de métricas por user)
CREATE TABLE {prefix}imgsig_usage (
    user_id BIGINT UNSIGNED NOT NULL,
    signatures_count INT UNSIGNED NOT NULL DEFAULT 0,
    storage_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
    last_activity_at DATETIME NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (user_id)
) {charset_collate};

-- Tabla: logs (opcional, toggleable)
CREATE TABLE {prefix}imgsig_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data LONGTEXT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_user_event (user_id, event_type),
    KEY idx_created (created_at DESC),
    KEY idx_event (event_type)
) {charset_collate};
```

### 5.2. Schema versionado y migraciones

```php
// src/Setup/SchemaMigrator.php
class SchemaMigrator {
    private const SCHEMA_VERSIONS = [
        '1.0.0' => Migration_1_0_0::class,
        // future: '1.1.0' => Migration_1_1_0::class,
    ];

    public function migrate(): void {
        $current = get_option('imgsig_schema_version', '0.0.0');
        foreach (self::SCHEMA_VERSIONS as $version => $migration_class) {
            if (version_compare($current, $version, '<')) {
                (new $migration_class())->up();
                update_option('imgsig_schema_version', $version);
            }
        }
    }
}
```

Cada migración es un archivo en `src/Setup/Migrations/`.

### 5.3. Options registradas

```php
// Lista exhaustiva de options del plugin
const OPTIONS = [
    'imgsig_version'               => '1.0.0',
    'imgsig_schema_version'        => '1.0.0',
    'imgsig_mode'                  => 'single', // 'single' | 'multi'
    'imgsig_storage_driver'        => 'media_library', // 'media_library' | 's3'
    'imgsig_storage_config'        => [], // ENCRYPTED JSON
    'imgsig_branding'              => [
        'custom_logo_url'  => '',
    ],
    'imgsig_default_plan_id'       => 0,
    'imgsig_setup_completed'       => false,
    'imgsig_settings'              => [
        'enable_logs'           => false,
        'rate_limit_uploads'    => 10,
        'rate_limit_signatures' => 20,
        'auto_compress_images'  => true,
        'preview_clients'       => ['gmail', 'outlook', 'apple_mail'],
    ],
];
```

---

## 6. Schema JSON de Firma (Fuente de Verdad)

### 6.1. Schema TypeScript

```typescript
// src/schema/signature.ts

export type SchemaVersion = '1.0';

export interface SignatureSchema {
  schema_version: SchemaVersion;
  meta: SignatureMeta;
  canvas: CanvasConfig;
  layout: LayoutConfig;
  blocks: Block[];
  variables: Record<string, string>;
}

export interface SignatureMeta {
  created_at: string; // ISO 8601 UTC
  updated_at: string;
  editor_version: string;
}

export interface CanvasConfig {
  width: number; // 320–800, default 600
  background_color: string; // hex
  font_family: string;
  font_size: number; // px
  text_color: string;
  link_color: string;
}

export interface LayoutConfig {
  type: 'table';
  columns: 1 | 2 | 3;
  gap: number; // px
  padding: Padding;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type Block =
  | TextBlock
  | TextStackBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | SocialIconsBlock
  | ContactRowBlock
  | ButtonCtaBlock
  | DisclaimerBlock
  | ContainerBlock;

export interface BlockBase {
  id: string; // unique within signature
  type: string;
  grid: GridPosition;
  padding?: Padding;
  visible?: boolean; // default true
}

export interface GridPosition {
  col: number;
  row: number;
  colspan?: number;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  content: string; // can include {{variables}}
  style: TextStyle;
}

export interface TextStyle {
  font_family?: string;
  font_size?: number;
  font_weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  font_style?: 'normal' | 'italic';
  color?: string;
  text_align?: 'left' | 'center' | 'right';
  text_decoration?: 'none' | 'underline';
  line_height?: number;
  letter_spacing?: number;
}

export interface TextStackBlock extends BlockBase {
  type: 'text_stack';
  spacing: number;
  children: TextBlock[];
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  asset_id?: number; // ref to imgsig_assets
  src: string; // public URL (denormalized)
  alt: string;
  width: number;
  height?: number;
  border_radius?: string; // '0' | '50%' | '8px'
  border?: { width: number; color: string; style: 'solid' };
  link?: string;
}

export interface DividerBlock extends BlockBase {
  type: 'divider';
  color: string;
  thickness: number;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface SpacerBlock extends BlockBase {
  type: 'spacer';
  height: number;
}

export interface SocialIconsBlock extends BlockBase {
  type: 'social_icons';
  networks: SocialNetwork[];
  size: number;
  gap: number;
  color: string;
  background_color?: string;
  style: 'flat' | 'rounded' | 'rounded_filled' | 'circle' | 'circle_filled';
}

export interface SocialNetwork {
  name: string; // 'linkedin' | 'twitter' | 'facebook' | etc.
  url: string;
}

export interface ContactRowBlock extends BlockBase {
  type: 'contact_row';
  items: ContactItem[];
  layout: 'inline' | 'stacked';
  icon: boolean;
  icon_color: string;
  text_style: TextStyle;
}

export interface ContactItem {
  type: 'email' | 'phone' | 'website' | 'address' | 'custom';
  value: string;
  label?: string;
  icon?: string;
}

export interface ButtonCtaBlock extends BlockBase {
  type: 'button_cta';
  text: string;
  url: string;
  background_color: string;
  text_color: string;
  border_radius: string;
  padding: Padding;
  font_size: number;
  font_weight: number;
}

export interface DisclaimerBlock extends BlockBase {
  type: 'disclaimer';
  content: string;
  style: TextStyle;
}

export interface ContainerBlock extends BlockBase {
  type: 'container';
  children: Block[];
  background_color?: string;
  border?: { width: number; color: string; style: 'solid'; radius?: string };
}
```

### 6.2. Validación

Validar **siempre** antes de persistir y antes de renderizar. PHP y TS deben tener validadores equivalentes.

```php
// src/Services/JsonSchemaValidator.php
class JsonSchemaValidator {
    public function validate(array $data): ValidationResult {
        $errors = [];
        if (!isset($data['schema_version']) || $data['schema_version'] !== '1.0') {
            $errors[] = ['path' => 'schema_version', 'message' => 'Invalid schema version'];
        }
        // ... validación recursiva de bloques
        return new ValidationResult(empty($errors), $errors);
    }
}
```

### 6.3. Migraciones de schema (futuro)

Cuando aparezca `1.1`, incluir un migrador que tome JSON `1.0` y lo convierta:

```typescript
// src/schema/migrations.ts
export function migrateToLatest(data: any): SignatureSchema {
  let current = data;
  if (current.schema_version === '1.0') {
    // current = migrate_1_0_to_1_1(current);
  }
  return current as SignatureSchema;
}
```

---

## 7. Pipeline de Compilación JSON → MJML → HTML

### 7.1. Visión general

```
SignatureSchema (JSON propio)
        ↓ json-to-mjml.ts
MJML string
        ↓ mjml-browser
HTML con tablas + <style>
        ↓ juice
HTML con CSS inline
        ↓ html-minifier
HTML final (listo para copiar)
```

**Toda la compilación corre en el navegador** del usuario editor. PHP guarda solo el JSON y opcionalmente cachea el HTML resultante (para mostrar previews sin recompilar).

### 7.2. Convertidor JSON → MJML

```typescript
// src/editor/compiler/json-to-mjml.ts
import type { SignatureSchema, Block } from '@/schema/signature';
import { interpolateVariables } from './variables';

export function compileToMjml(schema: SignatureSchema): string {
  const { canvas, blocks, variables } = schema;
  const interpolated = blocks.map((b) => interpolateBlock(b, variables));

  return `
    <mjml>
      <mj-head>
        <mj-attributes>
          <mj-all font-family="${escape(canvas.font_family)}" />
          <mj-text font-size="${canvas.font_size}px" color="${canvas.text_color}" line-height="1.4" />
        </mj-attributes>
      </mj-head>
      <mj-body width="${canvas.width}" background-color="${canvas.background_color}">
        ${renderBlocks(interpolated, schema.layout)}
      </mj-body>
    </mjml>
  `;
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case 'text': return renderText(block);
    case 'image': return renderImage(block);
    case 'social_icons': return renderSocialIcons(block);
    // ... todos los tipos
    default: return '';
  }
}
```

**Cada `render*` función** debe generar MJML que MJML compile a HTML compatible con Outlook.

### 7.3. Compilación MJML → HTML

```typescript
// src/editor/compiler/mjml-to-html.ts
import mjml2html from 'mjml-browser';

export function compileMjml(mjml: string): { html: string; errors: string[] } {
  const result = mjml2html(mjml, {
    validationLevel: 'soft',
    keepComments: false,
    minify: false, // se hace después
  });
  return {
    html: result.html,
    errors: result.errors.map((e) => e.formattedMessage),
  };
}
```

### 7.4. CSS inlining

```typescript
// src/editor/compiler/html-inliner.ts
import juice from 'juice/client';

export function inlineCss(html: string): string {
  return juice(html, {
    removeStyleTags: true,
    preserveMediaQueries: true,
    preserveFontFaces: false, // sin fonts custom
    preserveImportant: true,
    applyAttributesTableElements: true,
    applyWidthAttributes: true,
  });
}
```

### 7.5. Minificación

```typescript
// src/editor/compiler/html-minifier.ts
// Implementación minimalista: collapse whitespace, comments
export function minifyHtml(html: string): string {
  return html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '') // comments excepto MSO
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}
```

### 7.6. Pipeline completo

```typescript
// src/editor/compiler/index.ts
export interface CompileResult {
  html: string;
  mjml: string;
  errors: string[];
  warnings: string[];
  size: number;
}

export function compileSignature(schema: SignatureSchema): CompileResult {
  const mjml = compileToMjml(schema);
  const { html: rawHtml, errors } = compileMjml(mjml);
  const inlined = inlineCss(rawHtml);
  const final = minifyHtml(inlined);

  return {
    mjml,
    html: final,
    errors,
    warnings: validateEmailHtml(final), // tamaño, imágenes sin alt, etc.
    size: new Blob([final]).size,
  };
}
```

### 7.7. Validaciones del HTML resultante

El `validateEmailHtml` debe alertar de:
- Tamaño > 102KB (Gmail clipping)
- Imágenes sin atributo `alt`
- Imágenes sin `width`/`height`
- Links sin `href`
- Uso de fonts no web-safe sin fallback

---

## 8. Sistema de Storage

### 8.1. Interface común

```php
// src/Storage/Contracts/StorageDriverInterface.php
namespace ImaginaSignatures\Storage\Contracts;

use ImaginaSignatures\Storage\Dto\UploadResult;
use ImaginaSignatures\Storage\Dto\PresignedResult;
use ImaginaSignatures\Storage\Dto\TestResult;

interface StorageDriverInterface {

    /**
     * Returns whether this driver supports direct browser-to-storage uploads
     * (presigned URLs). MediaLibrary returns false; S3 returns true.
     */
    public function supports_presigned_uploads(): bool;

    /**
     * For drivers without presigned support: handles a server-side upload.
     */
    public function upload( string $source_path, string $destination_key, array $meta ): UploadResult;

    /**
     * For drivers with presigned support: generates a URL for direct upload.
     */
    public function get_presigned_upload_url( string $key, string $content_type, int $max_size, int $expires_seconds ): PresignedResult;

    /**
     * Returns the public URL for a stored object.
     */
    public function get_public_url( string $key ): string;

    /**
     * Deletes an object.
     */
    public function delete( string $key ): bool;

    /**
     * Tests connection / configuration validity.
     */
    public function test_connection(): TestResult;

    /**
     * Returns the driver identifier.
     */
    public function get_id(): string;

    /**
     * Returns whether the driver is fully configured.
     */
    public function is_configured(): bool;
}
```

### 8.2. Driver Media Library

```php
// src/Storage/Drivers/MediaLibraryDriver.php
class MediaLibraryDriver implements StorageDriverInterface {

    public function supports_presigned_uploads(): bool {
        return false;
    }

    public function upload( string $source_path, string $destination_key, array $meta ): UploadResult {
        // 1. Validate source file
        // 2. Use wp_handle_sideload() with override
        // 3. Move to wp-content/uploads/imagina-signatures/{user_id}/
        // 4. Register attachment with post_mime_type
        // 5. Return UploadResult with public_url
    }

    public function get_presigned_upload_url( $key, $content_type, $max_size, $expires ): PresignedResult {
        throw new \LogicException('Media Library driver does not support presigned uploads');
    }

    public function get_public_url( string $key ): string {
        return wp_get_upload_dir()['baseurl'] . '/imagina-signatures/' . $key;
    }

    public function delete( string $key ): bool {
        $full_path = wp_get_upload_dir()['basedir'] . '/imagina-signatures/' . $key;
        if (file_exists($full_path)) {
            return unlink($full_path); // y wp_delete_attachment si está registrado
        }
        return true;
    }

    public function test_connection(): TestResult {
        // Verificar que wp-content/uploads/imagina-signatures/ es escribible
        $dir = wp_get_upload_dir()['basedir'] . '/imagina-signatures';
        if (!file_exists($dir)) {
            wp_mkdir_p($dir);
        }
        return new TestResult(is_writable($dir), is_writable($dir) ? 'OK' : 'Directory not writable');
    }

    public function get_id(): string { return 'media_library'; }
    public function is_configured(): bool { return true; }
}
```

### 8.3. Driver S3 (implementación SigV4 minimalista)

**Reglas:**
- NO usar `aws/aws-sdk-php` (4MB)
- Implementación propia de Signature V4 con `curl`
- Soporte para todos los providers S3-compatible vía endpoint configurable

```php
// src/Storage/S3/SigV4Signer.php
class SigV4Signer {

    public function __construct(
        private string $access_key,
        private string $secret_key,
        private string $region,
        private string $service = 's3'
    ) {}

    public function sign_presigned_url(
        string $method,
        string $endpoint,
        string $bucket,
        string $key,
        int $expires_seconds,
        array $headers = []
    ): string {
        $now = gmdate('Ymd\THis\Z');
        $date = gmdate('Ymd');
        $credential = "{$this->access_key}/{$date}/{$this->region}/{$this->service}/aws4_request";

        $query = [
            'X-Amz-Algorithm' => 'AWS4-HMAC-SHA256',
            'X-Amz-Credential' => $credential,
            'X-Amz-Date' => $now,
            'X-Amz-Expires' => (string) $expires_seconds,
            'X-Amz-SignedHeaders' => 'host',
        ];

        // Build canonical request, string to sign, signature...
        // Implementación AWS SigV4 documentada en docs.aws.amazon.com
    }

    public function sign_request(...): array {
        // PUT/GET/DELETE con headers firmados
    }
}
```

### 8.4. Provider presets

```php
// src/Storage/S3/ProviderPresets.php
class ProviderPresets {
    public const PRESETS = [
        'cloudflare_r2' => [
            'name' => 'Cloudflare R2',
            'endpoint_template' => 'https://{account_id}.r2.cloudflarestorage.com',
            'region' => 'auto',
            'extra_fields' => ['account_id'],
            'docs_url' => 'https://docs.imaginawp.com/imagina-signatures/storage/cloudflare-r2',
        ],
        'bunny' => [
            'name' => 'Bunny Storage',
            'endpoint_template' => 'https://{region}.storage.bunnycdn.com',
            'region_options' => ['ny', 'la', 'sg', 'syd', 'de', 'uk'],
            'docs_url' => 'https://docs.imaginawp.com/imagina-signatures/storage/bunny',
        ],
        's3' => [
            'name' => 'Amazon S3',
            'endpoint_template' => 'https://s3.{region}.amazonaws.com',
            'region_options' => ['us-east-1', 'us-west-2', 'eu-west-1', /* ... */],
        ],
        'b2' => [
            'name' => 'Backblaze B2',
            'endpoint_template' => 'https://s3.{region}.backblazeb2.com',
        ],
        'do_spaces' => [
            'name' => 'DigitalOcean Spaces',
            'endpoint_template' => 'https://{region}.digitaloceanspaces.com',
        ],
        'wasabi' => [
            'name' => 'Wasabi',
            'endpoint_template' => 'https://s3.{region}.wasabisys.com',
        ],
        'minio' => [
            'name' => 'MinIO (self-hosted)',
            'endpoint_template' => '{custom}',
            'extra_fields' => ['custom_endpoint'],
        ],
        'custom' => [
            'name' => 'Custom S3-compatible',
            'extra_fields' => ['custom_endpoint'],
        ],
    ];
}
```

### 8.5. Configuración encriptada

```php
// src/Security/Encryption.php
class Encryption {
    private string $key;

    public function __construct() {
        // Derivar key de AUTH_KEY de WP + salt propio
        $this->key = hash('sha256', AUTH_KEY . 'imgsig_v1', true);
    }

    public function encrypt(string $plaintext): string {
        $iv = random_bytes(16);
        $ciphertext = openssl_encrypt($plaintext, 'AES-256-CBC', $this->key, OPENSSL_RAW_DATA, $iv);
        return base64_encode($iv . $ciphertext);
    }

    public function decrypt(string $encoded): string {
        $data = base64_decode($encoded);
        $iv = substr($data, 0, 16);
        $ciphertext = substr($data, 16);
        return openssl_decrypt($ciphertext, 'AES-256-CBC', $this->key, OPENSSL_RAW_DATA, $iv);
    }
}

// Uso
$encrypted = $encryption->encrypt(wp_json_encode($credentials));
update_option('imgsig_storage_config', $encrypted);
```

### 8.6. Migración entre drivers

Implementar `MigrationService` con `WP_Background_Process` o Action Scheduler:

```php
// src/Services/MigrationService.php
class MigrationService {
    public function start_migration( string $from_driver, string $to_driver ): MigrationJob {
        $job = $this->job_repository->create([
            'type' => 'storage_migration',
            'from' => $from_driver,
            'to' => $to_driver,
            'status' => 'queued',
            'total' => $this->asset_repository->count(),
        ]);

        // Schedule in background
        as_enqueue_async_action('imgsig/migration/process_chunk', [$job->id, 0]);

        return $job;
    }
}
```

Procesar en chunks de 10 assets para no timeoutear.

---

## 9. Sistema de Planes y Cuotas

### 9.1. Estructura de un plan

```php
// src/Models/Plan.php
class Plan extends BaseModel {
    public int $id;
    public string $slug;
    public string $name;
    public ?string $description;
    public PlanLimits $limits;
    public bool $is_default;
    public bool $is_active;
    public int $sort_order;
}

// src/Models/PlanLimits.php
class PlanLimits {
    public function __construct(
        public int $max_signatures = 10,
        public int $max_storage_bytes = 100 * 1024 * 1024, // 100MB
        public int $max_image_size_bytes = 2 * 1024 * 1024, // 2MB
        public bool $allow_premium_templates = false,
        public bool $allow_animations = false,
        public bool $allow_html_export = true,
        public bool $allow_custom_branding = false,
        public bool $allow_oauth_install = false,
        public array $custom_limits = []
    ) {}

    public static function from_array(array $data): self {
        return new self(...$data);
    }

    public function to_array(): array {
        return get_object_vars($this);
    }
}
```

### 9.2. Planes default seeded

```php
// src/Setup/DefaultPlansSeeder.php
class DefaultPlansSeeder {
    public function seed(): void {
        $plans = [
            [
                'slug' => 'free',
                'name' => __('Free', 'imagina-signatures'),
                'description' => __('Basic plan for individuals.', 'imagina-signatures'),
                'is_default' => true,
                'limits' => new PlanLimits(
                    max_signatures: 1,
                    max_storage_bytes: 10 * 1024 * 1024,
                ),
            ],
            [
                'slug' => 'pro',
                'name' => __('Pro', 'imagina-signatures'),
                'limits' => new PlanLimits(
                    max_signatures: 10,
                    max_storage_bytes: 200 * 1024 * 1024,
                    allow_premium_templates: true,
                ),
            ],
            [
                'slug' => 'business',
                'name' => __('Business', 'imagina-signatures'),
                'limits' => new PlanLimits(
                    max_signatures: 50,
                    max_storage_bytes: 1024 * 1024 * 1024,
                    allow_premium_templates: true,
                    allow_animations: true,
                    allow_custom_branding: true,
                ),
            ],
        ];
        // ... persistir
    }
}
```

### 9.3. Quota Enforcer

```php
// src/Services/QuotaEnforcer.php
class QuotaEnforcer {
    public function __construct(
        private PlanRepository $plans,
        private UsageRepository $usage,
        private UserPlanRepository $user_plans
    ) {}

    public function check_can_create_signature( int $user_id ): void {
        $plan = $this->get_user_plan($user_id);
        $usage = $this->usage->get_for_user($user_id);

        if ($usage->signatures_count >= $plan->limits->max_signatures) {
            throw new QuotaExceededException(sprintf(
                __('Signature limit reached (%d). Upgrade your plan.', 'imagina-signatures'),
                $plan->limits->max_signatures
            ));
        }
    }

    public function check_can_upload( int $user_id, int $size_bytes ): void {
        $plan = $this->get_user_plan($user_id);
        $usage = $this->usage->get_for_user($user_id);

        if ($size_bytes > $plan->limits->max_image_size_bytes) {
            throw new QuotaExceededException('Image too large for your plan.');
        }

        if ($usage->storage_bytes + $size_bytes > $plan->limits->max_storage_bytes) {
            throw new QuotaExceededException('Storage limit would be exceeded.');
        }
    }

    public function get_user_plan( int $user_id ): Plan {
        if (get_option('imgsig_mode') === 'single') {
            return $this->plans->get_unlimited_plan(); // Plan virtual sin límites
        }
        return $this->user_plans->get_plan_for_user($user_id) ?? $this->plans->get_default();
    }
}
```

### 9.4. Modo Single bypass

En modo Single, el admin no tiene cuotas (es su propio sistema). El `QuotaEnforcer` retorna un `Plan` virtual con todos los límites en `PHP_INT_MAX`.

---

## 10. Roles y Capabilities

### 10.1. Roles registrados

```php
// src/Setup/RolesInstaller.php
class RolesInstaller {
    public function install(): void {
        // Solo si modo multi-user
        add_role('imgsig_user', __('Imagina Signatures User', 'imagina-signatures'), [
            'read' => true,
            'imgsig_read_own_signatures' => true,
            'imgsig_create_signatures' => true,
            'imgsig_edit_own_signatures' => true,
            'imgsig_delete_own_signatures' => true,
            'imgsig_upload_assets' => true,
            'imgsig_export_signatures' => true,
        ]);

        // Capabilities admin (al rol administrator)
        $admin = get_role('administrator');
        $admin?->add_cap('imgsig_admin');
        $admin?->add_cap('imgsig_manage_plans');
        $admin?->add_cap('imgsig_manage_users');
        $admin?->add_cap('imgsig_manage_storage');
        $admin?->add_cap('imgsig_manage_templates');
        $admin?->add_cap('imgsig_view_all_signatures');
    }

    public function uninstall(): void {
        remove_role('imgsig_user');
        $admin = get_role('administrator');
        foreach ([/* lista de caps */] as $cap) {
            $admin?->remove_cap($cap);
        }
    }
}
```

### 10.2. Hardening del usuario `imgsig_user`

```php
// src/Admin/UserHardening.php
class UserHardening {
    public function init(): void {
        if (!$this->is_imgsig_user()) return;

        add_action('admin_menu', [$this, 'remove_default_menus'], 999);
        add_action('admin_init', [$this, 'redirect_from_dashboard']);
        add_action('init', [$this, 'hide_admin_bar']);
        add_filter('show_admin_bar', '__return_false');
    }

    public function remove_default_menus(): void {
        // Remover Posts, Pages, Comments, Tools, etc.
        $remove = ['edit.php', 'edit.php?post_type=page', 'edit-comments.php', 'tools.php', /* ... */];
        foreach ($remove as $menu) remove_menu_page($menu);
    }

    public function redirect_from_dashboard(): void {
        global $pagenow;
        if ($pagenow === 'index.php') {
            wp_safe_redirect(admin_url('admin.php?page=imagina-signatures-dashboard'));
            exit;
        }
    }

    private function is_imgsig_user(): bool {
        $user = wp_get_current_user();
        return in_array('imgsig_user', $user->roles, true) && !in_array('administrator', $user->roles, true);
    }
}
```

---

## 11. REST API — Especificación Completa

### 11.1. Convenciones

- **Namespace:** `imgsig/v1`
- **Base URL:** `{site}/wp-json/imgsig/v1/`
- **Auth:** Cookie + nonce (estándar WP REST)
- **Content-Type:** `application/json`
- **Errores:** `WP_Error` con códigos `imgsig_*` y status HTTP correctos
- **Paginación:** `?page=1&per_page=20` con headers `X-WP-Total`, `X-WP-TotalPages`
- **Filtering:** `?status=draft&template_id=5`
- **Sorting:** `?orderby=updated_at&order=desc`

### 11.2. Endpoints

```
=== Signatures (user-scoped) ===

GET    /signatures
       Lista firmas del usuario actual.
       Query: ?page, per_page, status, orderby, order, search
       Response: { items: Signature[], total: number }

POST   /signatures
       Crea nueva firma. Valida cuotas.
       Body: { name, json_content, template_id? }
       Response: Signature
       Errors: 403 (quota), 400 (validation)

GET    /signatures/:id
       Obtiene una firma. Valida ownership.
       Response: Signature
       Errors: 404, 403

PATCH  /signatures/:id
       Actualiza. Valida ownership y schema.
       Body: { name?, json_content?, status? }
       Response: Signature

DELETE /signatures/:id
       Borra. Valida ownership.
       Response: { deleted: true }

POST   /signatures/:id/duplicate
       Duplica. Valida cuota.
       Response: Signature (la nueva)

GET    /signatures/:id/export
       Devuelve HTML compilado.
       Query: ?format=html|mjml
       Response: { html: string, size: number, warnings: string[] }

=== Templates ===

GET    /templates
       Lista plantillas según plan del usuario.
       Query: ?category, premium
       Response: { items: Template[] }

GET    /templates/:id
       Obtiene una plantilla.
       Response: Template (con json_content completo)

POST   /templates                       [admin only]
POST   /templates/:id/preview-image     [admin only]
PATCH  /templates/:id                   [admin only]
DELETE /templates/:id                   [admin only]

=== Assets / Upload ===

POST   /upload/init
       Solicita inicio de upload. Valida cuotas.
       Body: { filename, mime_type, size_bytes, hash_sha256, width?, height? }
       Response (Media Library):
         { method: 'direct', upload_url: '/wp-json/imgsig/v1/upload/direct?token=...' }
       Response (S3 driver):
         { method: 'presigned', upload_url, public_url, headers, expires_at, asset_id }

POST   /upload/direct                   [si MediaLibrary]
       Sube directamente al servidor.
       Body: multipart/form-data
       Response: Asset

POST   /upload/finalize
       Confirma upload exitoso (post-PUT a S3).
       Body: { asset_id, etag? }
       Response: Asset

GET    /assets
       Lista assets del usuario.
       Response: { items: Asset[], total }

DELETE /assets/:id
       Borra asset (storage + DB).
       Response: { deleted: true }

=== Me / Current User ===

GET    /me
       Info del usuario actual + plan + uso.
       Response: { user, plan, usage, capabilities }

=== Admin: Plans ===                    [imgsig_admin only]

GET    /admin/plans
POST   /admin/plans
GET    /admin/plans/:id
PATCH  /admin/plans/:id
DELETE /admin/plans/:id

=== Admin: Users ===                    [imgsig_admin only]

GET    /admin/users
       Lista usuarios con plan y uso.
       Query: ?search, plan_id

POST   /admin/users
       Crea usuario WP con rol imgsig_user.
       Body: { email, name, plan_id, send_email }

GET    /admin/users/:id
PATCH  /admin/users/:id/plan
       Cambia plan de un usuario.
DELETE /admin/users/:id
       Remueve rol imgsig_user (no borra el WP user).

=== Admin: Storage ===                  [imgsig_admin only]

GET    /admin/storage
       Config actual (sin secretos).

PATCH  /admin/storage
       Actualiza config. Encripta secretos.
       Body: { driver, config: {...} }

POST   /admin/storage/test
       Prueba conexión.
       Response: { ok: bool, message: string, details? }

POST   /admin/storage/migrate
       Inicia migración entre drivers.
       Body: { from_driver, to_driver, dry_run? }
       Response: { job_id }

GET    /admin/storage/migrate/:job_id
       Estado de migración.

=== Admin: Stats ===                    [imgsig_admin only]

GET    /admin/stats
       Métricas globales.
       Response: { total_users, total_signatures, total_storage, by_plan, recent_activity }
```

### 11.3. Estructura de Controller (ejemplo)

```php
// src/Api/Controllers/SignaturesController.php
namespace ImaginaSignatures\Api\Controllers;

class SignaturesController extends BaseController {

    public function __construct(
        private SignatureService $service,
        private SignatureRepository $repo,
        private QuotaEnforcer $quota
    ) {}

    public function register_routes(): void {
        register_rest_route('imgsig/v1', '/signatures', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'index'],
                'permission_callback' => [$this, 'check_read_permission'],
                'args' => $this->index_args(),
            ],
            [
                'methods' => 'POST',
                'callback' => [$this, 'create'],
                'permission_callback' => [$this, 'check_write_permission'],
                'args' => $this->create_args(),
            ],
        ]);
        // ... etc
    }

    public function index( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
        $user_id = get_current_user_id();
        $query = $this->parse_query($request);
        try {
            $result = $this->repo->find_by_user($user_id, $query);
            $response = rest_ensure_response([
                'items' => array_map(fn($s) => $s->to_array(), $result->items),
                'total' => $result->total,
            ]);
            $response->header('X-WP-Total', (string) $result->total);
            return $response;
        } catch (\Throwable $e) {
            return $this->handle_exception($e);
        }
    }

    public function create( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
        $user_id = get_current_user_id();
        try {
            $signature = $this->service->create_signature($user_id, [
                'name' => $request->get_param('name'),
                'json_content' => $request->get_param('json_content'),
                'template_id' => $request->get_param('template_id'),
            ]);
            return rest_ensure_response($signature->to_array());
        } catch (QuotaExceededException $e) {
            return new \WP_Error('imgsig_quota_exceeded', $e->getMessage(), ['status' => 403]);
        } catch (ValidationException $e) {
            return new \WP_Error('imgsig_validation_failed', $e->getMessage(), ['status' => 400, 'errors' => $e->errors]);
        }
    }

    // ... resto de métodos
}
```

### 11.4. Permission callbacks

```php
public function check_read_permission( \WP_REST_Request $request ): bool {
    return current_user_can('imgsig_read_own_signatures');
}

public function check_ownership( int $signature_id ): bool {
    if (current_user_can('imgsig_view_all_signatures')) return true; // admin
    $signature = $this->repo->find($signature_id);
    return $signature && $signature->user_id === get_current_user_id();
}
```

---

## 12. Integración GrapesJS

### 12.1. Configuración base

```typescript
// src/editor/grapes-config.ts
import { Editor } from 'grapesjs';
import grapesjsNewsletter from 'grapesjs-preset-newsletter';
import { registerCustomBlocks } from './blocks';

export function initGrapesEditor(container: HTMLElement): Editor {
  const editor = grapesjs.init({
    container,
    height: '100%',
    width: 'auto',
    storageManager: false, // we manage saves ourselves
    plugins: [grapesjsNewsletter],
    pluginsOpts: {
      'grapesjs-preset-newsletter': {
        modalLabelImport: __('Paste your HTML code here', 'imagina-signatures'),
        modalLabelExport: __('Copy or download HTML', 'imagina-signatures'),
        codeViewerTheme: 'hopscotch',
        importPlaceholder: '<!-- ... -->',
        cellStyle: { 'font-size': '12px' },
        // ... ajustar
      },
    },
    canvas: {
      styles: [], // sin styles externos
      scripts: [],
    },
    deviceManager: {
      devices: [
        { name: __('Desktop', 'imagina-signatures'), width: '600px' },
        { name: __('Mobile', 'imagina-signatures'), width: '320px' },
      ],
    },
    // i18n
    i18n: { /* mappings */ },
  });

  registerCustomBlocks(editor);
  return editor;
}
```

### 12.2. Bloques custom

Cada bloque vive en `src/editor/blocks/{name}.ts`:

```typescript
// src/editor/blocks/avatar.ts
import type { Editor } from 'grapesjs';

export function registerAvatarBlock(editor: Editor): void {
  editor.BlockManager.add('is-avatar', {
    label: __('Avatar', 'imagina-signatures'),
    category: __('Imagina Signatures', 'imagina-signatures'),
    media: '<svg>...</svg>',
    content: {
      type: 'is-avatar', // referencia al component
      attributes: { 'data-type': 'is-avatar' },
    },
  });

  // Definir el component
  editor.DomComponents.addType('is-avatar', {
    model: {
      defaults: {
        tagName: 'img',
        attributes: {
          src: 'placeholder.png',
          width: 80,
          alt: 'Avatar',
          style: 'border-radius: 50%; display: block;',
        },
        // Traits = panel de propiedades
        traits: [
          { type: 'image-uploader', name: 'src', label: __('Image', 'imagina-signatures') },
          { type: 'number', name: 'width', label: __('Width', 'imagina-signatures'), min: 40, max: 200 },
          { type: 'select', name: 'border_radius', label: __('Shape', 'imagina-signatures'), options: [
            { value: '0', name: 'Square' },
            { value: '8px', name: 'Rounded' },
            { value: '50%', name: 'Circle' },
          ]},
          { name: 'alt', label: __('Alt text', 'imagina-signatures') },
        ],
      },
    },
  });
}
```

Bloques a implementar (MVP):
- Avatar (image)
- Text Stack (info bloque)
- Social Icons Row
- Contact Row (email/phone/web)
- CTA Button
- Divider
- Spacer
- Disclaimer (legal text)
- Image Block (free)
- Container (2-column layout)

### 12.3. Bridge JSON ↔ GrapesJS

Como GrapesJS tiene su propio modelo, necesitamos converters:

```typescript
// src/editor/compiler/grapes-to-json.ts
export function grapesToSchema(editor: Editor): SignatureSchema {
  const components = editor.getComponents();
  const blocks = components.map(traverseComponent);
  return {
    schema_version: '1.0',
    meta: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      editor_version: '1.0.0',
    },
    canvas: extractCanvasConfig(editor),
    layout: extractLayoutConfig(editor),
    blocks,
    variables: extractVariables(components),
  };
}

// src/editor/compiler/json-to-grapes.ts
export function schemaToGrapes(schema: SignatureSchema, editor: Editor): void {
  editor.setComponents(buildGrapesComponents(schema.blocks));
  editor.setStyle(buildGrapesStyles(schema.canvas));
}
```

---

## 13. Setup Wizard (First-run UX)

Tras activar el plugin, redireccionar a un wizard de 3 pasos:

```
Paso 1: Bienvenida
  └── Tour rápido del producto

Paso 2: Modo de operación
  ( ) Single User — Solo yo crearé firmas
  ( ) Multi User — Crearé usuarios y planes

Paso 3: Storage
  ( ) Media Library (recomendado para empezar)
  ( ) S3-compatible (avanzado)
      └── Si elige S3: pantalla de configuración
```

`imgsig_setup_completed` se marca `true` solo al completar.

---

## 14. Seguridad — Reglas Absolutas

### 14.1. Validación de input

**Toda entrada del usuario** pasa por:
1. `wp_unslash()` (deshacer slashes WP)
2. Sanitización tipo-específica
3. Validación contra schema

```php
$name = sanitize_text_field( wp_unslash( $request->get_param('name') ?? '' ) );
$json = $request->get_param('json_content'); // ya parseado por REST API
$validator->validate($json); // throws on invalid
```

### 14.2. Autorización

**Cada endpoint** valida:
1. Nonce (REST cookie auth lo hace automático)
2. Capability (`current_user_can(...)`)
3. Ownership (`signature->user_id === get_current_user_id()`)

```php
// En cada endpoint de recurso específico:
$signature = $this->repo->find($id);
if (!$signature) return new \WP_Error('not_found', '', ['status' => 404]);
if ($signature->user_id !== $user_id && !current_user_can('imgsig_view_all_signatures')) {
    return new \WP_Error('forbidden', '', ['status' => 403]);
}
```

### 14.3. Rate limiting

```php
// src/Security/RateLimiter.php
class RateLimiter {
    public function check( string $action, int $user_id, int $max, int $window_seconds ): void {
        $key = "imgsig_rl_{$action}_{$user_id}";
        $count = (int) get_transient($key);
        if ($count >= $max) {
            throw new RateLimitException(sprintf(
                __('Too many requests. Try again in %d seconds.', 'imagina-signatures'),
                $window_seconds
            ));
        }
        set_transient($key, $count + 1, $window_seconds);
    }
}

// Aplicar en endpoints críticos:
$rate_limiter->check('upload', $user_id, 10, 60); // max 10 uploads/min
```

### 14.4. XSS

- Bloqueo de tags peligrosos en bloques de texto
- Whitelist HTML: `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<a href>`, `<br>`, `<span style>`
- URLs solo `http`, `https`, `mailto`, `tel`
- SVG bloqueado en uploads
- CSP headers en página del editor:

```php
add_action('admin_init', function() {
    if (imgsig_is_editor_page()) {
        header("Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval' 'unsafe-inline';");
    }
});
```

(Note: `unsafe-eval` necesario por GrapesJS internamente; documentar.)

### 14.5. SQL injection

`$wpdb->prepare()` SIEMPRE. Nunca concatenar.

### 14.6. CSRF

Nonces de WP. `@wordpress/api-fetch` los maneja automáticamente.

### 14.7. SSRF

Si alguna feature toma URLs del usuario para fetcheo (p.ej. preview de imagen externa), validar:
- Solo `http://`, `https://`
- No private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, ::1)
- Timeout corto

### 14.8. Logs

Logear eventos sensibles SIN datos sensibles:

```php
$logger->info('signature_created', ['user_id' => $user_id, 'signature_id' => $id]);
// NUNCA logear contenido de firmas, credenciales, etc.
```

---

## 15. Compatibilidad de Email

### 15.1. Reglas obligatorias del HTML output

Todo HTML compilado debe cumplir:

- Tablas anidadas para layout (no flexbox/grid)
- CSS inline (juice ya lo hace)
- `width` en atributos HTML, no solo CSS, en imágenes
- `alt` en toda imagen
- Max 600px ancho
- VML para botones redondeados (preset newsletter lo hace)
- Comments condicionales para Outlook (preset newsletter lo hace)
- Sin scripts, sin formularios, sin video, sin SVG inline

### 15.2. Validador post-compilación

```typescript
// src/editor/compiler/html-validator.ts
export function validateEmailHtml(html: string): string[] {
  const warnings: string[] = [];
  const size = new Blob([html]).size;
  if (size > 102 * 1024) warnings.push(__('HTML exceeds 102KB (Gmail will clip).', 'imagina-signatures'));

  const imgRegex = /<img[^>]*>/gi;
  const imgs = html.match(imgRegex) ?? [];
  imgs.forEach((img) => {
    if (!/alt=["'][^"']*["']/.test(img)) warnings.push('Image missing alt attribute');
    if (!/width=["']?\d+/.test(img)) warnings.push('Image missing width');
  });

  return warnings;
}
```

### 15.3. Fonts

Solo web-safe:
- Arial, Helvetica, sans-serif
- Georgia, serif
- Tahoma, Verdana, sans-serif
- Times New Roman, serif
- Courier New, monospace
- Trebuchet MS, sans-serif

(Documentar que custom fonts requieren imagen/SVG fallback.)

---

## 16. Internacionalización (i18n)

### 16.1. Reglas

- Text domain: `imagina-signatures` (consistente)
- Domain path: `/languages`
- Toda string visible al usuario pasa por `__()`, `_e()`, `esc_html__()`, etc.
- En JS: `@wordpress/i18n` con `wp_set_script_translations()`

### 16.2. Generación del .pot

```bash
# scripts/make-pot.sh
wp i18n make-pot . languages/imagina-signatures.pot \
  --domain=imagina-signatures \
  --include="src,assets" \
  --exclude="node_modules,vendor,build"
```

### 16.3. Idiomas iniciales

- `en_US` (source)
- `es_ES`
- `es_CO` (Colombia)
- `es_MX` (México)

(Más se agregan post-launch o vía Translate WordPress.)

### 16.4. RTL

- CSS con `[dir="rtl"]` selectors donde necesario
- Tailwind con `rtl:` prefix

---

## 17. Testing

### 17.1. PHP Unit Tests

```bash
# vendor/bin/phpunit
phpunit --testdox tests/php/Unit
```

Estructura:
```
tests/php/
├── bootstrap.php
├── Unit/
│   ├── Services/
│   │   ├── QuotaEnforcerTest.php
│   │   ├── HtmlSanitizerTest.php
│   │   └── JsonSchemaValidatorTest.php
│   ├── Storage/
│   │   ├── S3SignerTest.php
│   │   └── MediaLibraryDriverTest.php
│   └── Security/
│       ├── EncryptionTest.php
│       └── RateLimiterTest.php
└── Integration/
    ├── Api/
    │   ├── SignaturesControllerTest.php
    │   └── ...
    └── ...
```

Usar **Brain Monkey** para mockear funciones de WP en unit tests.

**Cobertura mínima target:** 70% en `src/Services/`, 80% en `src/Storage/S3/`, 100% en `src/Security/`.

### 17.2. JS Tests

```bash
npm test  # Vitest
```

Tests críticos:
- Pipeline JSON → MJML → HTML (snapshot tests)
- Validators de schema
- Compresión de imágenes (mock canvas)
- API client (mock fetch)

### 17.3. E2E (post-MVP)

Playwright con suite básica:
- Login + crear firma + copiar HTML
- Upload de imagen (en ambos drivers)

### 17.4. Cross-client testing

**Antes de cada release:**
- Litmus o Email on Acid: ejecutar suite contra las 10 plantillas default
- Test manual en: Outlook 365 Desktop (Windows), Outlook Web, Gmail Web, Gmail iOS, Apple Mail macOS, Apple Mail iOS
- Documentar issues conocidos en `docs/troubleshooting.html`

---

## 18. Build y Distribución

### 18.1. Build de desarrollo

```bash
npm run dev    # Vite dev server con HMR para editor
composer install
```

### 18.2. Build de producción

```bash
npm run build  # Vite build → /build
composer install --no-dev --optimize-autoloader  # vendor/ minimal
```

### 18.3. Generación del ZIP de distribución

```bash
# scripts/build-zip.sh
#!/bin/bash
set -e

VERSION=$(php -r "include 'imagina-signatures.php'; echo \$plugin_data['Version'];")
DIST="dist/imagina-signatures-$VERSION"

rm -rf $DIST dist/imagina-signatures-$VERSION.zip
mkdir -p $DIST

# Copiar solo lo necesario (sin node_modules ni dev files)
rsync -av \
  --exclude='node_modules' \
  --exclude='tests' \
  --exclude='.github' \
  --exclude='.git*' \
  --exclude='*.log' \
  --exclude='dist' \
  --exclude='scripts' \
  --exclude='package*.json' \
  --exclude='vite.config.ts' \
  --exclude='tsconfig.json' \
  --exclude='tailwind.config.ts' \
  --exclude='.eslintrc*' \
  --exclude='.prettierrc' \
  --exclude='phpcs.xml.dist' \
  --exclude='phpunit.xml.dist' \
  --exclude='composer.json' \
  --exclude='composer.lock' \
  --exclude='CLAUDE.md' \
  --exclude='CONTRIBUTING.md' \
  --exclude='assets/*/src' \
  ./ $DIST/

cd dist
zip -r imagina-signatures-$VERSION.zip imagina-signatures-$VERSION

echo "Built: dist/imagina-signatures-$VERSION.zip"
```

### 18.4. Checklist pre-release

Antes de empaquetar una versión:

- [ ] Versión actualizada en `imagina-signatures.php` header
- [ ] Versión actualizada en `readme.txt`
- [ ] CHANGELOG.md actualizado
- [ ] `composer install --no-dev` corrido
- [ ] `npm run build` corrido
- [ ] `phpcs` sin errores
- [ ] `eslint` sin errores
- [ ] `phpunit` passing
- [ ] `vitest` passing
- [ ] WP_DEBUG sin warnings/notices
- [ ] Test manual en PHP 7.4, 8.0, 8.1, 8.2, 8.3
- [ ] Test manual en WP 6.0, 6.4, 6.6, 6.7
- [ ] .pot regenerado
- [ ] Traducciones es_ES y en_US completas
- [ ] Litmus suite passing en 10 templates
- [ ] Documentación actualizada en `docs/`

---

## 19. CI/CD (GitHub Actions)

### 19.1. ci.yml — Run on PR

```yaml
name: CI
on: [pull_request]
jobs:
  php:
    strategy:
      matrix:
        php: [7.4, 8.0, 8.1, 8.2, 8.3]
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: ${{ matrix.php }} }
      - run: composer install
      - run: composer run lint
      - run: composer run test

  js:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

### 19.2. release.yml — Run on tag

Genera el ZIP y lo sube como release artifact.

---

## 20. Convenciones de Git

### 20.1. Branches

- `main` — producción, siempre estable, releases tagged
- `develop` — integración
- `feature/xxx` — features
- `fix/xxx` — bugs
- `release/x.y.z` — preparación de release

### 20.2. Commits — Conventional Commits

```
feat(editor): add social icons block
fix(storage): handle s3 connection timeout
chore(deps): bump grapesjs to 0.21.5
docs(api): document signatures endpoints
refactor(services): extract quota logic
test(unit): add tests for HtmlSanitizer
```

### 20.3. Versionado

**Semver estricto:**
- `MAJOR.MINOR.PATCH`
- Breaking changes (DB schema, API): MAJOR
- Features: MINOR
- Fixes: PATCH

### 20.4. PRs

- Descripción con: contexto, cambios, screenshots si UI, tests añadidos
- CI debe pasar antes de merge
- Squash merge a `develop`

---

## 21. Performance

### 21.1. Backend

- Queries DB siempre con índices apropiados
- Cache de `imgsig_usage` con transients (TTL 1h)
- HTML compilado cacheado en `signatures.html_cache` (regenerar solo on edit)
- Lazy load de servicios via Container

### 21.2. Frontend

- **Bundle size budget:**
  - editor: < 800KB gzipped
  - admin: < 200KB gzipped
- Code splitting por ruta
- Lazy load de GrapesJS
- Debounce en autoguardado (300ms)
- Virtualization en listas > 50 items
- Imágenes con `loading="lazy"` en thumbnails

### 21.3. Assets

- PNG/JPG optimizados (TinyPNG en build)
- SVG inline (no peticiones extra)
- No webfonts custom

---

## 22. Logging y Debugging

### 22.1. Logger

```php
// src/Utils/Logger.php
class Logger {
    public function debug(string $message, array $context = []): void { /* ... */ }
    public function info(string $message, array $context = []): void { /* ... */ }
    public function warning(string $message, array $context = []): void { /* ... */ }
    public function error(string $message, array $context = []): void { /* ... */ }
}
```

Activable desde Settings (`imgsig_settings.enable_logs`).

Persiste en `imgsig_logs` o usa `error_log()` cuando es crítico.

### 22.2. Debug mode

Si `WP_DEBUG` está activo:
- REST API responses incluyen `_debug` con queries ejecutadas
- Editor muestra MJML compilado
- Sin minificación

---

## 23. Hooks Públicos para Extensibilidad

### 23.1. Actions disponibles

```php
// Lifecycle
do_action('imgsig/plugin/activated');
do_action('imgsig/plugin/deactivated');

// Signatures
do_action('imgsig/signature/before_create', array $data, int $user_id);
do_action('imgsig/signature/created', Signature $signature);
do_action('imgsig/signature/before_update', Signature $old, array $changes);
do_action('imgsig/signature/updated', Signature $signature);
do_action('imgsig/signature/before_delete', Signature $signature);
do_action('imgsig/signature/deleted', int $signature_id);

// Templates
do_action('imgsig/template/created', Template $template);

// Assets
do_action('imgsig/asset/uploaded', Asset $asset);
do_action('imgsig/asset/deleted', int $asset_id);

// Storage
do_action('imgsig/storage/driver_changed', string $old, string $new);
do_action('imgsig/storage/migration_completed', int $job_id);

// Plans
do_action('imgsig/plan/created', Plan $plan);
do_action('imgsig/plan/user_assigned', int $user_id, Plan $plan);

// Quotas
do_action('imgsig/quota/exceeded', int $user_id, string $resource);
```

### 23.2. Filters disponibles

```php
$data = apply_filters('imgsig/signature/data_before_save', array $data, string $context);
$html = apply_filters('imgsig/signature/compiled_html', string $html, Signature $signature);
$mjml = apply_filters('imgsig/signature/compiled_mjml', string $mjml, SignatureSchema $schema);

$drivers = apply_filters('imgsig/storage/available_drivers', array $drivers);
$config = apply_filters('imgsig/storage/config', array $config, string $driver);

$limits = apply_filters('imgsig/plan/limits', PlanLimits $limits, Plan $plan, ?int $user_id);
$can_create = apply_filters('imgsig/quota/can_create_signature', bool $allowed, int $user_id, Plan $plan);

$blocks = apply_filters('imgsig/editor/registered_blocks', array $blocks);
$networks = apply_filters('imgsig/social/networks', array $networks);
$fonts = apply_filters('imgsig/canvas/font_families', array $fonts);

$capabilities = apply_filters('imgsig/roles/capabilities', array $caps, string $role);
```

### 23.3. Documentación

`docs/developers/hooks-actions.html` y `docs/developers/hooks-filters.html` con la lista completa, signatures, ejemplos y casos de uso.

---

## 24. Plantillas Pre-construidas (MVP)

10 plantillas como JSON files en `templates/`:

1. **corporate-classic** — Foto + nombre + cargo + empresa + datos contacto + redes
2. **minimal-modern** — Layout limpio, una columna, espaciado generoso
3. **sales-active** — CTA destacado, banner promocional, botones
4. **medical** — Tono profesional, info de licencia, datos de práctica
5. **legal** — Disclaimer largo, datos de firma de abogados
6. **creative** — Colores vivos, tipografía moderna
7. **developer** — GitHub icon, stack tecnológico, fuente monospace en partes
8. **tech-startup** — Logo grande, simple, links a producto
9. **consultant** — Foto + credenciales + LinkedIn destacado
10. **e-commerce** — Logo de tienda, link a productos, redes

Cada uno con `is_premium: false` o `true` según se decida (ej: 5 free + 5 premium).

---

## 25. Documentación al Usuario (`docs/`)

Sitio HTML estático generable con un script simple. Mínimo:

- Quick Start (5 min de instalación)
- Modo Single vs Multi explicado
- Setup de cada provider de storage (con screenshots)
- Cómo instalar firmas en Gmail, Outlook, Apple Mail, etc.
- Cómo crear plantillas custom
- Cómo gestionar planes y usuarios
- FAQ
- Troubleshooting (errores comunes)
- Developers: hooks, filters, custom blocks
- Changelog

**Idioma principal:** español (audiencia inicial). Inglés como traducción.

---

## 26. Roadmap de Implementación

### Sprint 1 (semanas 1–2): Foundations

- Setup repo: composer, package.json, phpcs, eslint, prettier, phpunit, vitest
- Plugin file con header válido WordPress + bootstrap
- Autoloader PSR-4
- Container DI
- Activator/Deactivator/Uninstaller básicos
- Schema migrator + tabla `signatures` y `templates`
- CI básico (lint + test)
- Roles y capabilities install
- README + CONTRIBUTING

### Sprint 2 (semanas 3–4): Admin Foundation

- Setup wizard (3 steps)
- Storage settings page con UI de configuración
- Encryption service
- Driver Media Library completo
- Driver S3 (SigV4 implementation + connection test)
- General settings

### Sprint 3 (semanas 5–6): Plans + Users

- Plans CRUD + UI admin
- Users CRUD + UI admin
- Default plans seeded
- QuotaEnforcer service
- UserHardening (ocultar wp-admin para imgsig_user)
- Modo Single vs Multi switcher
- Integration hooks (PMP, WC Memberships) — solo skeletons

### Sprint 4 (semanas 7–9): Editor Core

- Vite + Preact setup
- Mount point en wp-admin
- API client TS
- Zustand stores
- GrapesJS integration con preset-newsletter
- 5 bloques custom (avatar, text-stack, social, contact, divider)
- Schema JSON propio
- Bridge JSON ↔ GrapesJS
- Save/load endpoints

### Sprint 5 (semanas 10–11): Compilation Pipeline

- Compilador JSON → MJML
- mjml-browser integration
- juice CSS inliner
- HTML minifier
- HTML validator (warnings)
- Preview en vivo
- Botón copiar HTML
- Export como archivo .html

### Sprint 6 (semanas 12–13): Templates + Assets

- 10 plantillas creadas y testeadas
- Templates CRUD admin
- Template picker UI
- Assets management UI
- Image uploader con compresión client-side
- Pre-signed URL flow para S3
- Direct upload flow para Media Library
- Asset gallery del usuario

### Sprint 7 (semana 14): Multi-client Preview + Polish

- Preview emulators (Gmail, Outlook, Apple Mail)
- Dark mode preview
- Variables/dynamic fields
- Duplicar firma
- Archivar firma
- Search/filter en listado

### Sprint 8 (semana 15): Pulido y Calidad

- Notices admin (quota near, errores comunes)
- Toasts y feedback UI consistente
- Empty states diseñados
- Loading states en todas las vistas
- Error boundaries en frontend
- Accessibility audit (teclado, ARIA, screen readers)
- Mejora de copy en español

### Sprint 9 (semana 16): i18n + Testing

- Generar .pot
- Traducciones es_ES, en_US
- PHPUnit coverage > 70% en core services
- Vitest tests para compilador
- Cross-client testing en Litmus
- Bug fixes

### Sprint 10 (semana 17): Docs + Launch interno

- Sitio de docs completo
- Videos tutoriales (5–10 mins por flujo)
- Demo site interno
- Screenshots para futuro material de venta
- Pre-release checklist completo
- Empaquetar v1.0.0 final

### Post-launch (meses siguientes)

- Animaciones (client-side GIF generation con `html2canvas + gif.js`)
- Analytics de clicks (link tracking opcional)
- OAuth Gmail/Outlook para auto-install
- Más plantillas
- White-label (premium feature)
- API pública v2
- Sistema de licenciamiento (cuando se decida modelo de distribución)

---

## 27. Reglas para Claude Code (Meta)

Cuando trabajes en este proyecto:

1. **Lee este documento completo en cada sesión nueva.** No asumas convenciones — están aquí.

2. **Antes de implementar una feature:**
   - Identifica en qué sprint está
   - Revisa secciones relevantes (modelo de datos, API, etc.)
   - Confirma con el usuario el alcance específico

3. **Al escribir PHP:**
   - Aplica WPCS desde el primer carácter
   - Type hints obligatorios
   - PHPDoc en métodos públicos
   - Prefijo `imgsig_` siempre

4. **Al escribir TS/TSX:**
   - Strict mode
   - Sin `any` injustificado
   - Componentes funcionales
   - i18n con `__()`

5. **Al modificar el schema JSON de firma:**
   - Bump del `schema_version`
   - Migración escrita
   - Tests actualizados

6. **Al añadir endpoints REST:**
   - Permission callback obligatorio
   - Sanitización en `args`
   - Documentación en este archivo (sección 11.2)

7. **Al añadir un hook:**
   - Documentar en sección 23
   - Documentar en `docs/developers/`

8. **Al añadir dependencias:**
   - Justificar el peso (bundle JS) o tamaño (vendor PHP)
   - Verificar licencia (GPL-compatible)
   - Pre-vendoring si PHP

9. **Al hacer commits:**
   - Conventional Commits
   - Un commit = un cambio lógico

10. **Al detectar ambigüedad o conflicto en este documento:**
    - Pregunta al usuario antes de improvisar
    - Propone actualización del CLAUDE.md

11. **Nunca:**
    - Uses `eval()`, `create_function()`, `extract()`
    - Hagas requests HTTP a dominios no autorizados
    - Modifiques tablas de WP core
    - Uses `$_POST`/`$_GET` directo (siempre via REST request o `$_REQUEST` con sanitize+nonce)
    - Implementes sistema de licenciamiento sin discusión previa con el usuario
    - Uses sessions PHP nativas

12. **Siempre:**
    - Test connection antes de marcar storage como configurado
    - Validar ownership en endpoints user-scoped
    - Cachear queries pesadas
    - Liberar transients en uninstall

---

## 28. Glosario

- **Admin del plugin** — usuario con `imgsig_admin` cap, normalmente quien instaló el plugin
- **User del plugin** — usuario con rol `imgsig_user`, gestionado por el admin (solo en modo multi)
- **Driver** — implementación concreta de `StorageDriverInterface` (Media Library, S3, etc.)
- **Provider** — servicio backend del driver S3 (R2, Bunny, AWS S3, B2, Spaces, Wasabi, MinIO)
- **Block** — unidad de contenido del editor (avatar, texto, social, etc.)
- **Schema** — el JSON estructurado que representa una firma (versionado)
- **Compile** — proceso JSON → MJML → HTML inline
- **Editor** — la app React/Preact que corre en `/wp-admin/admin.php?page=imagina-signatures-editor`
- **Single Mode** — el admin usa el plugin para sí mismo, sin planes
- **Multi Mode** — el admin gestiona usuarios con planes y cuotas
- **Quota** — límite de un plan (firmas, storage, etc.)

---

## 29. Reglas de Calidad (Generales)

Antes de cada release:

- ✅ Cero errores en `WP_DEBUG=true`
- ✅ Cero notices/warnings PHP
- ✅ Funciona en PHP 7.4, 8.0, 8.1, 8.2, 8.3
- ✅ Funciona en WP 6.0+
- ✅ Funciona con plugins comunes (Yoast, WooCommerce, Elementor, WPForms) sin conflictos
- ✅ Funciona con themes comunes (Astra, GeneratePress, Hello, Twenty Twenty-X)
- ✅ Documentación completa en `docs/`
- ✅ Video demo grabado
- ✅ 6+ screenshots de calidad
- ✅ Demo site online (interno o público)
- ✅ Changelog actualizado
- ✅ Versión bumped
- ✅ ZIP generado con script (sin archivos sobrantes)
- ✅ Verificación: el ZIP se instala limpio en un WP fresco

---

**Fin del CLAUDE.md.**

Este documento se actualiza con cada cambio estructural del proyecto. Antes de modificarlo, abre un PR de discusión.

## 30. Notas sobre el Sistema de Licenciamiento (Fase Futura)

El MVP **NO incluye** sistema de licenciamiento. El plugin opera sin restricciones en cualquier instalación.

Cuando se decida añadirlo en el futuro, debe seguir estos principios:

1. **Modular y desacoplable.** Implementar mediante una interface `LicenseProviderInterface` con drivers intercambiables (Envato, propio, Gumroad, Lemon Squeezy, etc.).

2. **Driver `null` por defecto.** Si no hay proveedor configurado, el plugin opera sin restricciones (comportamiento actual del MVP).

3. **Sin destrucción de datos.** Si una licencia se invalida, las firmas ya creadas siguen siendo accesibles y exportables. Solo se restringen acciones nuevas (crear, plantillas premium).

4. **Modo gracia.** Tras 3 fallos de verificación, otorgar 7 días antes de degradar.

5. **Verificación periódica.** Background job semanal con `wp_schedule_event`, no en cada request.

6. **Sin telemetría adicional.** El check de licencia es lo único que toca servidores externos.

7. **Encriptación de keys.** Como todas las credenciales, encriptadas con `Encryption` service.

8. **UI consistente.** Página de licencia bajo `Imagina Signatures → License` con activar/desactivar/verificar.

9. **Interface propuesta:**

```php
interface LicenseProviderInterface {
    public function activate(string $key): LicenseResult;
    public function verify(): LicenseResult;
    public function deactivate(): bool;
    public function get_status(): LicenseStatus;
    public function get_provider_id(): string;
}
```

10. **Implementación inicial sugerida cuando se necesite:** Driver propio basado en endpoint JSON simple. Es el más flexible y no depende de marketplaces específicos.

**Importante para Claude Code:** Si el usuario solicita implementar licenciamiento, NO lo hagas sin antes confirmar que esta fase está iniciando explícitamente. El MVP debe quedar libre de cualquier código relacionado con licencias.
