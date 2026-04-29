# CLAUDE.md — Imagina Signatures

> **Para Claude Code:** Este es el documento maestro del proyecto. Léelo completo antes de cualquier modificación. Ante ambigüedades, prefiere las convenciones aquí establecidas sobre tus defaults. Si encuentras un conflicto o algo no cubierto, pregunta antes de improvisar.

---

## 0. Identidad del Proyecto

- **Nombre:** Imagina Signatures
- **Slug:** `imagina-signatures`
- **Text domain:** `imagina-signatures`
- **Namespace PHP:** `ImaginaSignatures\`
- **Prefijo DB / options / capabilities:** `imgsig_`
- **Prefijo de hooks:** `imgsig/` (con slash)
- **Prefijo CSS:** `is-`
- **Objeto JS global:** `IMGSIG_EDITOR_CONFIG`
- **Versión inicial:** `1.0.0`
- **Autor:** Imagina WP
- **Licencia del código:** GPL v2 or later

**Qué es:** Plugin WordPress que añade un editor visual moderno de firmas de correo dentro de wp-admin. Cada usuario WordPress ve solo sus propias firmas. Soporta storage en Media Library nativa o S3-compatible externo. El editor corre en un iframe aislado con React 18, dnd-kit y Tiptap, simulando la UX de Framer/Webflow.

**Qué NO incluye este MVP** (importante para Claude Code, no implementar nada de esto sin confirmación explícita del usuario):
- Sistema de planes / cuotas / límites
- Sistema de licencias / verificación con servidores externos
- Setup wizard de modos (single/multi)
- Integraciones con plugins de membresía (PMP, WooCommerce Memberships)
- Animaciones / generación de GIFs
- OAuth con Gmail/Outlook
- Analytics de clicks
- API pública para terceros

---

## 1. Principios Fundacionales

Estos principios guían toda decisión técnica:

1. **Aislamiento del editor.** El editor visual vive dentro de un iframe controlado, sirviendo HTML propio desde nuestro backend. Cero contaminación con CSS/JS de wp-admin.
2. **Compatibilidad con hosting compartido.** PHP 7.4+, MySQL 5.7+, sin `exec`, sin Node en servidor, sin extensiones exóticas.
3. **Cero peticiones externas en runtime.** Una vez instalado el plugin, no hay llamadas a servidores del autor. Solo al storage configurado por el usuario (Media Library local o S3).
4. **Cero dependencias en CDNs externos.** Todo el JS/CSS va empaquetado en el plugin. Sin Google Fonts, sin jsDelivr, sin unpkg.
5. **WYSIWYG real.** El canvas del editor renderiza HTML email-safe (tablas + inline CSS) idéntico al output. Lo que ves es lo que se envía.
6. **Edición fuera del canvas.** El texto se edita en el sidebar derecho con Tiptap, no en contenteditable directo. Esto elimina los bugs de cursor/selección típicos de editores email.
7. **Inmutabilidad del schema.** Cada operación produce un nuevo árbol completo. Undo/redo es trivial. Tests son fáciles.
8. **Aislamiento entre usuarios WP.** Cada usuario ve solo sus firmas. Validación de ownership en cada endpoint.
9. **Schema versionado.** Toda firma tiene `schema_version`. Cambios de schema requieren migración explícita.
10. **No reinventar lo que WordPress ya da bien.** Auth, REST API, capabilities, nonces, i18n, options, transients: usar lo nativo.

---

## 2. Stack Técnico

### 2.1. Backend (PHP)

| Tech | Versión | Notas |
|------|---------|-------|
| WordPress | 6.0+ | Compatibilidad amplia |
| PHP | 7.4+ (target 8.0–8.3) | `declare(strict_types=1)` siempre |
| MySQL/MariaDB | 5.7+ / 10.3+ | Estándar |
| Estándar de código | WordPress Coding Standards (WPCS) | Con excepciones documentadas en `phpcs.xml.dist` |
| Autoloader | Custom PSR-4 | Sin Composer en runtime |
| Linter | PHP_CodeSniffer + `WordPress` ruleset + `PHPCompatibility` | |
| Testing | PHPUnit 9 + Brain Monkey | Mock de funciones WP |

### 2.2. Frontend (editor en iframe)

| Tech | Versión | Justificación |
|------|---------|---------------|
| Framework | **React 18** | dnd-kit y Tiptap funcionan óptimo |
| Lenguaje | TypeScript 5+ strict | Imprescindible |
| Build | Vite 5+ | DX moderno |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Estándar moderno |
| Editor de texto | `@tiptap/react` + extensiones | Basado en ProseMirror |
| Estado | Zustand 4 + immer | Inmutable, ligero |
| UI components | shadcn/ui (sobre Radix) | Copy-paste, premium look |
| Estilos | Tailwind CSS 3+ | Sin prefix dentro del iframe |
| Iconos | `lucide-react` (tree-shaken) | Solo los iconos usados |
| Color picker | `react-colorful` | ~2KB, moderno |
| Animaciones | `framer-motion` (selectivo) | Drop indicators, transitions |
| Image utils | `browser-image-compression` | Resize/compresión client-side |
| Linter | ESLint + `@typescript-eslint` | Estándar |
| Formatter | Prettier | Estándar |
| Testing | Vitest + Testing Library | Moderno |

### 2.3. Bundle target

- editor.js gzipped: < 600 KB
- editor.css gzipped: < 80 KB

### 2.4. Restricciones absolutas

El plugin **NO PUEDE** usar:
- `exec()`, `shell_exec()`, `proc_open()`, `system()`, `passthru()`
- `eval()`, `create_function()`
- Sessions PHP nativas (`session_start()`)
- CDNs externos en runtime
- jQuery dentro del iframe del editor
- Composer install en el servidor del comprador (todo pre-vendored)
- Bibliotecas con licencia incompatible con GPL

---

## 3. Arquitectura General

### 3.1. Vista de alto nivel

```
┌──────────────────────────────────────────────────────────────────┐
│                    WordPress (cualquier hosting)                  │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Plugin Imagina Signatures                                   │  │
│  │                                                              │  │
│  │ ┌─ wp-admin pages ─────────────────────────────────────┐   │  │
│  │ │  Dashboard / Listado / Settings (PHP renderizadas)    │   │  │
│  │ │  Editor: página que monta un <iframe> a pantalla       │   │  │
│  │ │  completa con la app React                             │   │  │
│  │ └────────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  │ ┌─ REST API /wp-json/imagina-signatures/v1/ ──────────┐   │  │
│  │ │  signatures, templates, assets, upload, me            │   │  │
│  │ │  + endpoint que sirve el HTML del iframe              │   │  │
│  │ └────────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  │ ┌─ Storage (configurable) ────────────────────────────┐   │  │
│  │ │  MediaLibraryDriver  |  S3Driver (opcional)           │   │  │
│  │ └────────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  │ ┌─ DB tables ──────────────────────────────────────────┐   │  │
│  │ │  imgsig_signatures, imgsig_templates, imgsig_assets   │   │  │
│  │ └────────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 3.2. Flujo de datos del editor

```
Usuario edita en el iframe
        ↓
schemaStore (Zustand + immer) actualiza
        ↓
Canvas re-renderiza (React)  +  historyStore guarda snapshot
        ↓
Debounced autosave (1.5s)
        ↓
fetch POST /wp-json/imagina-signatures/v1/signatures/{id}
        ↓
PHP valida, guarda JSON en imgsig_signatures.json_content
        ↓
Cuando usuario hace "Copy HTML":
        ↓
Compilador JSON → HTML email (en el browser)
        ↓
Clipboard API
```

### 3.3. Por qué iframe para el editor

WordPress admin tiene jQuery cargado, scripts antiguos, CSS global con selectors agresivos, y reset CSS que afecta a todo. Un iframe es la única forma garantizada de aislar el editor moderno (React 18 + Tailwind) de eso.

El iframe **no es contenido externo**: es nuestro propio HTML servido desde nuestro propio endpoint REST. Las cookies de WordPress llegan automáticamente, la auth funciona transparente.

---

## 4. Estructura de Archivos

```
imagina-signatures/
├── imagina-signatures.php            # Plugin main file (header + bootstrap)
├── uninstall.php                     # Cleanup al desinstalar
├── readme.txt                        # Formato WordPress
├── README.md                         # Para desarrolladores (GitHub)
├── CHANGELOG.md                      # Keep a Changelog format
├── LICENSE                           # GPL v2
├── CONTRIBUTING.md
├── CLAUDE.md                         # Este documento
├── composer.json                     # Solo desarrollo (linting, tests)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── components.json                   # shadcn/ui config
├── .eslintrc.cjs
├── .prettierrc
├── phpcs.xml.dist
├── phpunit.xml.dist
├── .gitignore
├── .editorconfig
│
├── src/                              # PHP source (PSR-4)
│   ├── Core/
│   │   ├── Plugin.php                # Bootstrap singleton
│   │   ├── Activator.php
│   │   ├── Deactivator.php
│   │   ├── Uninstaller.php
│   │   ├── Installer.php             # DB schema runner
│   │   ├── Autoloader.php            # PSR-4 sin Composer
│   │   ├── Container.php             # DI simple
│   │   └── ServiceProvider.php
│   │
│   ├── Admin/
│   │   ├── AdminMenu.php             # Registra menús
│   │   ├── Pages/
│   │   │   ├── DashboardPage.php     # Listado de firmas
│   │   │   ├── EditorPage.php        # Mount point del iframe
│   │   │   ├── TemplatesPage.php     # Gestión de plantillas (admins)
│   │   │   └── SettingsPage.php      # Storage settings
│   │   ├── Notices.php
│   │   └── AssetEnqueuer.php         # Enqueue condicional
│   │
│   ├── Api/
│   │   ├── RestRouter.php            # Registra todos los routes
│   │   ├── BaseController.php        # Helpers comunes (perms, response)
│   │   ├── Controllers/
│   │   │   ├── SignaturesController.php
│   │   │   ├── TemplatesController.php
│   │   │   ├── AssetsController.php
│   │   │   ├── UploadController.php
│   │   │   ├── StorageController.php
│   │   │   ├── MeController.php
│   │   │   └── EditorIframeController.php  # Sirve el HTML del iframe
│   │   └── Middleware/
│   │       ├── CapabilityCheck.php
│   │       ├── OwnershipCheck.php
│   │       └── RateLimiter.php
│   │
│   ├── Models/
│   │   ├── BaseModel.php
│   │   ├── Signature.php
│   │   ├── Template.php
│   │   └── Asset.php
│   │
│   ├── Repositories/
│   │   ├── BaseRepository.php
│   │   ├── SignatureRepository.php
│   │   ├── TemplateRepository.php
│   │   └── AssetRepository.php
│   │
│   ├── Services/
│   │   ├── SignatureService.php
│   │   ├── TemplateService.php
│   │   ├── HtmlSanitizer.php
│   │   └── JsonSchemaValidator.php
│   │
│   ├── Storage/
│   │   ├── StorageManager.php        # Factory según config
│   │   ├── Contracts/
│   │   │   └── StorageDriverInterface.php
│   │   ├── Drivers/
│   │   │   ├── MediaLibraryDriver.php
│   │   │   └── S3Driver.php
│   │   ├── S3/
│   │   │   ├── S3Client.php          # SigV4 minimalista propio
│   │   │   ├── SigV4Signer.php
│   │   │   ├── PresignedUrl.php
│   │   │   └── ProviderPresets.php
│   │   └── Dto/
│   │       ├── UploadResult.php
│   │       ├── PresignedResult.php
│   │       └── TestResult.php
│   │
│   ├── Security/
│   │   ├── Encryption.php            # openssl wrapper para credenciales S3
│   │   ├── CapabilitiesManager.php
│   │   ├── RateLimitStore.php        # Transients
│   │   └── InputSanitizer.php
│   │
│   ├── Setup/
│   │   ├── DefaultTemplatesSeeder.php
│   │   ├── SchemaMigrator.php
│   │   └── Migrations/
│   │       └── Migration_1_0_0.php
│   │
│   ├── Hooks/
│   │   ├── Actions.php               # Documentación de actions expuestas
│   │   └── Filters.php               # Documentación de filters expuestos
│   │
│   ├── Exceptions/
│   │   ├── ImaginaSignaturesException.php
│   │   ├── ValidationException.php
│   │   ├── StorageException.php
│   │   ├── OwnershipException.php
│   │   └── RateLimitException.php
│   │
│   └── Utils/
│       ├── Logger.php
│       ├── ArrayHelper.php
│       ├── DateHelper.php
│       └── HashHelper.php
│
├── assets/
│   ├── editor/                       # App React 18 del editor (iframe)
│   │   ├── src/
│   │   │   ├── main.tsx              # Entry, monta <App />
│   │   │   ├── App.tsx
│   │   │   ├── bridge/
│   │   │   │   ├── postMessageBridge.ts
│   │   │   │   ├── apiClient.ts
│   │   │   │   └── types.ts
│   │   │   ├── core/
│   │   │   │   ├── schema/           # Tipos del JSON
│   │   │   │   │   ├── signature.ts
│   │   │   │   │   ├── blocks.ts
│   │   │   │   │   ├── styles.ts
│   │   │   │   │   └── validators.ts
│   │   │   │   ├── compiler/         # JSON → HTML email
│   │   │   │   │   ├── compile.ts
│   │   │   │   │   ├── table-builder.ts
│   │   │   │   │   ├── inline-styles.ts
│   │   │   │   │   ├── outlook-fixes.ts
│   │   │   │   │   ├── minify.ts
│   │   │   │   │   └── validate.ts
│   │   │   │   ├── history/
│   │   │   │   │   └── historyStore.ts
│   │   │   │   └── blocks/           # Definición de bloques
│   │   │   │       ├── registry.ts
│   │   │   │       ├── text/
│   │   │   │       │   ├── TextBlock.tsx          # Canvas component
│   │   │   │       │   ├── TextProperties.tsx     # Sidebar properties
│   │   │   │       │   ├── compileText.ts         # JSON → HTML
│   │   │   │       │   └── definition.ts          # Registro en registry
│   │   │   │       ├── heading/
│   │   │   │       ├── image/
│   │   │   │       ├── avatar/
│   │   │   │       ├── divider/
│   │   │   │       ├── spacer/
│   │   │   │       ├── social-icons/
│   │   │   │       ├── contact-row/
│   │   │   │       ├── button-cta/
│   │   │   │       ├── disclaimer/
│   │   │   │       └── container/
│   │   │   ├── editor/
│   │   │   │   ├── EditorShell.tsx
│   │   │   │   ├── canvas/
│   │   │   │   │   ├── Canvas.tsx
│   │   │   │   │   ├── BlockRenderer.tsx
│   │   │   │   │   ├── SortableBlock.tsx
│   │   │   │   │   ├── SelectionOverlay.tsx
│   │   │   │   │   ├── HoverOverlay.tsx
│   │   │   │   │   ├── DropIndicators.tsx
│   │   │   │   │   ├── BlockToolbar.tsx
│   │   │   │   │   └── EmptyState.tsx
│   │   │   │   ├── sidebar-left/
│   │   │   │   │   ├── LeftSidebar.tsx
│   │   │   │   │   ├── BlockLibrary.tsx
│   │   │   │   │   ├── BlockCard.tsx
│   │   │   │   │   ├── LayersPanel.tsx
│   │   │   │   │   └── TemplatesTab.tsx
│   │   │   │   ├── sidebar-right/
│   │   │   │   │   ├── RightSidebar.tsx
│   │   │   │   │   ├── PropertyPanel.tsx
│   │   │   │   │   ├── CanvasProperties.tsx
│   │   │   │   │   ├── sections/
│   │   │   │   │   │   ├── PropertySection.tsx
│   │   │   │   │   │   ├── LayoutSection.tsx
│   │   │   │   │   │   ├── TypographySection.tsx
│   │   │   │   │   │   ├── BorderSection.tsx
│   │   │   │   │   │   └── BackgroundSection.tsx
│   │   │   │   │   └── inputs/
│   │   │   │   │       ├── ColorInput.tsx
│   │   │   │   │       ├── DimensionInput.tsx
│   │   │   │   │       ├── PaddingInput.tsx
│   │   │   │   │       ├── FontFamilyInput.tsx
│   │   │   │   │       ├── FontWeightInput.tsx
│   │   │   │   │       └── ToggleInput.tsx
│   │   │   │   ├── topbar/
│   │   │   │   │   ├── Topbar.tsx
│   │   │   │   │   ├── DeviceSwitcher.tsx
│   │   │   │   │   ├── HistoryControls.tsx
│   │   │   │   │   ├── SaveIndicator.tsx
│   │   │   │   │   ├── PreviewButton.tsx
│   │   │   │   │   └── ExportMenu.tsx
│   │   │   │   ├── modals/
│   │   │   │   │   ├── PreviewModal.tsx
│   │   │   │   │   ├── ExportModal.tsx
│   │   │   │   │   └── TemplatePicker.tsx
│   │   │   │   └── shortcuts/
│   │   │   │       └── useKeyboardShortcuts.ts
│   │   │   ├── stores/
│   │   │   │   ├── schemaStore.ts
│   │   │   │   ├── selectionStore.ts
│   │   │   │   ├── editorStore.ts
│   │   │   │   ├── deviceStore.ts
│   │   │   │   └── persistenceStore.ts
│   │   │   ├── components/
│   │   │   │   ├── ui/               # shadcn/ui
│   │   │   │   │   ├── button.tsx
│   │   │   │   │   ├── input.tsx
│   │   │   │   │   ├── label.tsx
│   │   │   │   │   ├── tabs.tsx
│   │   │   │   │   ├── dialog.tsx
│   │   │   │   │   ├── tooltip.tsx
│   │   │   │   │   ├── separator.tsx
│   │   │   │   │   ├── scroll-area.tsx
│   │   │   │   │   ├── select.tsx
│   │   │   │   │   ├── popover.tsx
│   │   │   │   │   ├── slider.tsx
│   │   │   │   │   ├── toggle.tsx
│   │   │   │   │   └── toast.tsx
│   │   │   │   └── shared/
│   │   │   │       ├── BlockIcon.tsx
│   │   │   │       ├── ImageUploader.tsx
│   │   │   │       └── VariablePill.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useSchema.ts
│   │   │   │   ├── useSelection.ts
│   │   │   │   ├── useDragAndDrop.ts
│   │   │   │   ├── useAutosave.ts
│   │   │   │   └── useImageUpload.ts
│   │   │   ├── tiptap/
│   │   │   │   ├── TiptapEditor.tsx
│   │   │   │   └── extensions/
│   │   │   │       ├── EmailSafeFormatting.ts
│   │   │   │       ├── VariablePill.ts
│   │   │   │       └── EmailLink.ts
│   │   │   ├── utils/
│   │   │   │   ├── idGenerator.ts
│   │   │   │   ├── tree.ts
│   │   │   │   ├── clipboard.ts
│   │   │   │   ├── debounce.ts
│   │   │   │   └── cn.ts             # className merger
│   │   │   ├── i18n/
│   │   │   │   ├── translations.ts
│   │   │   │   └── helpers.ts
│   │   │   ├── styles/
│   │   │   │   ├── globals.css       # Tailwind base + tokens
│   │   │   │   └── canvas.css        # Reset email del canvas
│   │   │   └── constants.ts
│   │   ├── public/
│   │   │   └── icons/                # SVG redes sociales
│   │   └── index.html                # Solo para `vite dev`
│   │
│   ├── admin/                        # Vistas de wp-admin (no iframe)
│   │   ├── src/
│   │   │   ├── settings.tsx
│   │   │   ├── storage.tsx
│   │   │   └── dashboard.tsx
│   │   └── styles/
│   │       └── admin.css
│   │
│   └── shared/                       # Compartido editor + admin
│       ├── api-types.ts
│       └── constants.ts
│
├── build/                            # Output de Vite (committed para distribución)
│   ├── editor.js
│   ├── editor.css
│   ├── admin.js
│   └── admin.css
│
├── templates/                        # Plantillas pre-built (JSON files)
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
│   ├── imagina-signatures.pot
│   ├── imagina-signatures-es_ES.po
│   ├── imagina-signatures-es_ES.mo
│   ├── imagina-signatures-es_CO.po
│   ├── imagina-signatures-es_CO.mo
│   ├── imagina-signatures-en_US.po
│   └── imagina-signatures-en_US.mo
│
├── docs/                             # Docs HTML estático para usuarios
│   ├── index.html
│   ├── installation.html
│   ├── editor-guide.html
│   ├── storage/
│   │   ├── media-library.html
│   │   ├── cloudflare-r2.html
│   │   ├── bunny.html
│   │   └── amazon-s3.html
│   └── installing-signature/
│       ├── gmail.html
│       ├── outlook.html
│       └── apple-mail.html
│
├── tests/
│   ├── php/
│   │   ├── Unit/
│   │   ├── Integration/
│   │   └── bootstrap.php
│   └── js/
│       ├── compiler/
│       ├── stores/
│       └── setup.ts
│
├── vendor/                           # Pre-vendored mínimo (commited)
│   └── autoload.php                  # Custom PSR-4
│
├── scripts/
│   ├── build-zip.sh
│   ├── update-version.sh
│   └── make-pot.sh
│
└── .github/
    └── workflows/
        ├── ci.yml
        └── release.yml
```

**Reglas estrictas:**
- `build/` se commitea (necesario para distribución del ZIP)
- `node_modules/` NO se commitea
- `vendor/` SÍ se commitea (pre-vendoring)
- `.vscode/`, `.idea/` en `.gitignore`
- Nada en la raíz salvo lo listado

---

## 5. Convenciones de Código PHP

### 5.1. Estilo

- WPCS como base, con excepciones documentadas en `phpcs.xml.dist`
- PSR-4 para autoloading: `ImaginaSignatures\Core\Plugin` → `src/Core/Plugin.php`
- Tabs para indentación (WPCS lo exige)
- Yoda conditions: `if ( 'value' === $var )`
- Llaves SIEMPRE incluso en if de una línea
- `declare(strict_types=1);` en todo archivo PHP nuevo
- Type hints en todos los parámetros y returns
- Property types en clases (PHP 7.4+)
- Constructor property promotion (PHP 8.0+) cuando sea posible

### 5.2. Naming

```php
// Clases: PascalCase
class SignatureService {}
class S3Driver {}

// Métodos y funciones: snake_case
public function create_signature( int $user_id, array $data ): Signature {}
function imgsig_get_plugin_version(): string {}

// Propiedades y variables: snake_case
private string $api_endpoint;
$user_id = get_current_user_id();

// Constantes: SCREAMING_SNAKE_CASE
const DEFAULT_PAGE_SIZE = 20;
const STATUS_DRAFT = 'draft';

// Hooks: prefijo + slash
do_action( 'imgsig/signature/created', $signature );
apply_filters( 'imgsig/signature/before_save', $data );

// Tablas: prefijo
$table = $wpdb->prefix . 'imgsig_signatures';

// Options: prefijo (underscore)
get_option( 'imgsig_storage_config' );

// Capabilities: prefijo (underscore)
'imgsig_use_signatures'
```

### 5.3. PHPDoc

Toda clase y método público necesita docblock:

```php
/**
 * Service for managing signature CRUD operations.
 *
 * Handles validation, ownership checks, and integration with the active
 * storage driver. All public methods are user-scoped.
 *
 * @since 1.0.0
 * @package ImaginaSignatures\Services
 */
class SignatureService {

    /**
     * Creates a new signature for the given user.
     *
     * @since 1.0.0
     *
     * @param int   $user_id User ID who owns the signature.
     * @param array $data    Signature data (name, json_content, template_id).
     *
     * @return Signature The created signature model.
     *
     * @throws ValidationException If data fails schema validation.
     */
    public function create_signature( int $user_id, array $data ): Signature {
        // ...
    }
}
```

### 5.4. Manejo de errores

```php
// Excepciones tipadas en src/Exceptions/
class ImaginaSignaturesException extends \RuntimeException {}
class ValidationException extends ImaginaSignaturesException {
    public function __construct( string $message, public readonly array $errors = [] ) {
        parent::__construct( $message );
    }
}
class StorageException extends ImaginaSignaturesException {}
class OwnershipException extends ImaginaSignaturesException {}

// Conversión a WP_Error en Controllers:
try {
    $signature = $this->service->create_signature( $user_id, $data );
    return rest_ensure_response( $signature->to_array() );
} catch ( ValidationException $e ) {
    return new \WP_Error(
        'imgsig_validation_failed',
        $e->getMessage(),
        [ 'status' => 400, 'errors' => $e->errors ]
    );
} catch ( OwnershipException $e ) {
    return new \WP_Error( 'imgsig_forbidden', $e->getMessage(), [ 'status' => 403 ] );
}
```

### 5.5. Queries DB

```php
// SIEMPRE $wpdb->prepare() con valores dinámicos
$results = $wpdb->get_results( $wpdb->prepare(
    "SELECT * FROM {$wpdb->prefix}imgsig_signatures
     WHERE user_id = %d AND status = %s
     ORDER BY updated_at DESC LIMIT %d",
    $user_id,
    $status,
    $limit
) );

// PROHIBIDO concatenar valores en SQL
// MAL: "WHERE user_id = $user_id"

// Prefix dinámico siempre
$table = $wpdb->prefix . 'imgsig_signatures';

// Helpers comunes en Repositories
class SignatureRepository extends BaseRepository {
    public function find_by_user( int $user_id, array $args = [] ): array {}
    public function count_by_user( int $user_id ): int {}
    public function find_owned_by( int $signature_id, int $user_id ): ?Signature {}
}
```

### 5.6. Sanitización y escape

Triple regla:
1. **Sanitiza** al recibir input
2. **Valida** según schema
3. **Escapa** al output

```php
// Input
$name = sanitize_text_field( wp_unslash( $request->get_param( 'name' ) ?? '' ) );

// Output HTML
echo '<h2>' . esc_html( $signature->name ) . '</h2>';
echo '<a href="' . esc_url( $url ) . '">';
echo '<input value="' . esc_attr( $value ) . '">';

// JS context
wp_localize_script( 'imagina-signatures-admin', 'IMGSIG_ADMIN', [
    'apiUrl' => esc_url_raw( rest_url( 'imagina-signatures/v1' ) ),
    'nonce'  => wp_create_nonce( 'wp_rest' ),
] );
```

### 5.7. Hooks expuestos

```php
// Acciones: imgsig/{entity}/{event}
do_action( 'imgsig/signature/before_create', array $data, int $user_id );
do_action( 'imgsig/signature/created', Signature $signature );
do_action( 'imgsig/signature/before_update', Signature $old, array $changes );
do_action( 'imgsig/signature/updated', Signature $signature );
do_action( 'imgsig/signature/before_delete', Signature $signature );
do_action( 'imgsig/signature/deleted', int $signature_id );
do_action( 'imgsig/asset/uploaded', Asset $asset );
do_action( 'imgsig/asset/deleted', int $asset_id );
do_action( 'imgsig/storage/driver_changed', string $old_driver, string $new_driver );
do_action( 'imgsig/template/created', Template $template );

// Filtros: imgsig/{noun}/{adjective}
$data    = apply_filters( 'imgsig/signature/data_before_save', array $data, string $context );
$html    = apply_filters( 'imgsig/signature/compiled_html', string $html, Signature $signature );
$drivers = apply_filters( 'imgsig/storage/available_drivers', array $drivers );
$blocks  = apply_filters( 'imgsig/editor/registered_blocks', array $blocks );
$networks = apply_filters( 'imgsig/social/networks', array $networks );
$fonts   = apply_filters( 'imgsig/canvas/font_families', array $fonts );
```

Documentar todos en `src/Hooks/Actions.php` y `src/Hooks/Filters.php`.

### 5.8. Inyección de dependencias

```php
// src/Core/Container.php — DI minimalista
class Container {
    private array $bindings = [];
    private array $instances = [];

    public function bind( string $abstract, callable $factory ): void {
        $this->bindings[ $abstract ] = $factory;
    }

    public function singleton( string $abstract, callable $factory ): void {
        $this->bind( $abstract, function () use ( $factory, $abstract ) {
            return $this->instances[ $abstract ] ??= $factory( $this );
        } );
    }

    public function make( string $abstract ): mixed {
        if ( ! isset( $this->bindings[ $abstract ] ) ) {
            throw new \RuntimeException( "No binding for {$abstract}" );
        }
        return ( $this->bindings[ $abstract ] )( $this );
    }
}

// Inyección por constructor:
class SignatureService {
    public function __construct(
        private SignatureRepository $repo,
        private JsonSchemaValidator $validator,
        private Logger $logger
    ) {}
}
```

### 5.9. Fechas

- UTC en DB: `gmdate( 'Y-m-d H:i:s' )`
- Display en timezone del sitio: `wp_date()`
- Comparaciones con timestamps, no strings

### 5.10. Reglas anti-conflicto

- No modificar globals de WP sin restaurar
- No override de funciones core
- No `session_start()`
- Siempre capability checks antes de operaciones
- CSS aislado con `body.imagina-signatures-page` o dentro del iframe

---

## 6. Convenciones TypeScript

### 6.1. Estilo

- TypeScript strict mode (`"strict": true`)
- No `any` salvo interop justificado con comentario
- Imports absolutos desde `@/`
- 2 espacios indentación
- Single quotes
- Trailing commas en multilinea
- Semicolons sí
- Functional components únicamente
- Hooks rules (eslint-plugin-react-hooks)

### 6.2. Naming

```typescript
// Componentes: PascalCase
function SignatureCard() {}

// Hooks: useCamelCase
function useSignature(id: number) {}

// Stores Zustand: useCamelCaseStore
const useSchemaStore = create<SchemaState>()(...);

// Tipos: PascalCase
interface SignatureSchema {}
type BlockType = 'text' | 'image';

// Constantes módulo: SCREAMING_SNAKE_CASE
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

// Variables: camelCase
const signatureId = 42;

// Archivos:
//   Componentes: PascalCase.tsx
//   Hooks/utils/stores: camelCase.ts
//   Tipos/schemas: camelCase.ts
```

### 6.3. Componentes

```tsx
import { FC } from 'react';
import type { Signature } from '@/core/schema/signature';

interface SignatureCardProps {
  signature: Signature;
  onEdit?: (id: number) => void;
}

export const SignatureCard: FC<SignatureCardProps> = ({ signature, onEdit }) => {
  return <div className="rounded-lg border p-4">{/* ... */}</div>;
};
```

Reglas:
- Una exportación principal por archivo
- Props tipadas con interface
- No `default export`
- Imports ordenados: React → libs → internas → tipos → estilos

### 6.4. Estado con Zustand

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface SchemaState {
  schema: SignatureSchema;
  addBlock: (block: Block, parentId?: string) => void;
  updateBlock: (id: string, updates: Partial<Block>) => void;
  deleteBlock: (id: string) => void;
}

export const useSchemaStore = create<SchemaState>()(
  devtools(
    immer((set) => ({
      schema: createEmptySchema(),
      addBlock: (block, parentId) => set((state) => {
        // Mutación segura via immer
      }),
      updateBlock: (id, updates) => set((state) => {
        const block = findBlockById(state.schema.blocks, id);
        if (block) Object.assign(block, updates);
      }),
      deleteBlock: (id) => set((state) => {
        state.schema.blocks = state.schema.blocks.filter((b) => b.id !== id);
      }),
    })),
    { name: 'schema-store' }
  )
);
```

Reglas:
- Un store por dominio (no mega-store)
- Selectors granulares: `useSchemaStore((s) => s.schema)` no `useSchemaStore()`
- Devtools middleware en desarrollo
- Immer para mutaciones complejas

### 6.5. i18n

```tsx
import { __ } from '@/i18n/helpers';

<h1>{__('My Signatures')}</h1>
<p>{__('Created on %s', formattedDate)}</p>
```

Helper interno carga del bundle de traducciones inyectado por PHP (`window.IMGSIG_EDITOR_CONFIG.translations`).

Regla: TODO string visible debe pasar por `__()`. Nunca hardcoded.

### 6.6. Tailwind dentro del iframe

Como el iframe es un contexto aislado, Tailwind se usa **sin prefix** (default):

```typescript
// tailwind.config.ts (para el editor)
export default {
  content: ['./assets/editor/src/**/*.{ts,tsx,html}'],
  theme: { /* tokens propios */ },
};
```

Para `assets/admin/` (vistas de WP admin fuera del iframe), Tailwind sí lleva prefix `is-`.

### 6.7. Performance

- Code splitting por ruta (dashboard del editor, modal de plantillas)
- Lazy load de componentes pesados (TiptapEditor, ColorPicker)
- Debounce en autoguardado (1500ms)
- `useMemo` en cálculos del compilador
- `React.memo` en bloques del canvas para no re-renderizar todo el árbol

---

## 7. Modelo de Datos

### 7.1. Schema SQL

```sql
-- Firmas (user-scoped)
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

-- Plantillas (globales, gestionadas por admin)
CREATE TABLE {prefix}imgsig_templates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'general',
    description TEXT NULL,
    preview_url TEXT NULL,
    json_content LONGTEXT NOT NULL,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    schema_version VARCHAR(10) NOT NULL DEFAULT '1.0',
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_slug (slug),
    KEY idx_category (category)
) {charset_collate};

-- Assets (user-scoped)
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
```

### 7.2. Migraciones

```php
class SchemaMigrator {
    private const SCHEMA_VERSIONS = [
        '1.0.0' => Migration_1_0_0::class,
    ];

    public function migrate(): void {
        $current = get_option( 'imgsig_schema_version', '0.0.0' );
        foreach ( self::SCHEMA_VERSIONS as $version => $migration_class ) {
            if ( version_compare( $current, $version, '<' ) ) {
                ( new $migration_class() )->up();
                update_option( 'imgsig_schema_version', $version );
            }
        }
    }
}
```

### 7.3. Options registradas

```php
const OPTIONS = [
    'imgsig_version'         => '1.0.0',
    'imgsig_schema_version'  => '1.0.0',
    'imgsig_storage_driver'  => 'media_library',  // 'media_library' | 's3'
    'imgsig_storage_config'  => '',               // ENCRYPTED JSON (S3 creds)
    'imgsig_settings'        => [
        'enable_logs'           => false,
        'rate_limit_uploads'    => 10,
        'rate_limit_signatures' => 30,
        'auto_compress_images'  => true,
    ],
];
```

---

## 8. Schema JSON de Firma

### 8.1. Tipos TypeScript (fuente de verdad)

```typescript
// src/core/schema/signature.ts
export type SchemaVersion = '1.0';

export interface SignatureSchema {
  schema_version: SchemaVersion;
  meta: SignatureMeta;
  canvas: CanvasConfig;
  blocks: Block[];
  variables: Record<string, string>;
}

export interface SignatureMeta {
  created_at: string;       // ISO 8601 UTC
  updated_at: string;
  editor_version: string;
}

export interface CanvasConfig {
  width: number;            // 320–800, default 600
  background_color: string;
  font_family: string;
  font_size: number;
  text_color: string;
  link_color: string;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BlockBase {
  id: string;               // unique within signature, generado en cliente
  type: string;
  padding?: Padding;
  visible?: boolean;        // default true
}

export type Block =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | AvatarBlock
  | DividerBlock
  | SpacerBlock
  | SocialIconsBlock
  | ContactRowBlock
  | ButtonCtaBlock
  | DisclaimerBlock
  | ContainerBlock;

// Tipos individuales por bloque definidos en src/core/schema/blocks.ts
```

### 8.2. Validación

PHP y TS validan equivalentemente. Validar SIEMPRE antes de persistir.

```php
// src/Services/JsonSchemaValidator.php
class JsonSchemaValidator {
    public function validate( array $data ): ValidationResult {
        $errors = [];
        if ( ! isset( $data['schema_version'] ) || '1.0' !== $data['schema_version'] ) {
            $errors[] = [ 'path' => 'schema_version', 'message' => 'Invalid schema version' ];
        }
        // Validación recursiva de bloques
        return new ValidationResult( empty( $errors ), $errors );
    }
}
```

### 8.3. Versionado

Cuando aparezca `1.1`, incluir migrador en TS y PHP. Las firmas viejas se migran al cargarse.

---

## 9. Pipeline de Compilación a HTML Email

### 9.1. Visión general

```
SignatureSchema (JSON)
    ↓
Por cada bloque: blockRegistry[type].compile(block, ctx)
    ↓
Concatenación + email shell wrapper
    ↓
Inline CSS (función propia, no juice externo)
    ↓
Outlook fixes (VML, mso conditionals)
    ↓
Minify (whitespace, comments)
    ↓
HTML final + warnings
```

**Toda la compilación corre en el browser (TypeScript).** El backend solo guarda JSON. NO usamos MJML — escribimos un compilador propio que genera tablas anidadas + inline CSS directamente.

### 9.2. Función principal

```typescript
// src/core/compiler/compile.ts
export interface CompileContext {
  canvas: CanvasConfig;
  variables: Record<string, string>;
  warnings: string[];
}

export interface CompileResult {
  html: string;
  warnings: string[];
  size: number;
}

export function compileSignature(schema: SignatureSchema): CompileResult {
  const ctx: CompileContext = {
    canvas: schema.canvas,
    variables: schema.variables,
    warnings: [],
  };

  // 1. Compile each block
  const blocksHtml = schema.blocks
    .map((block) => {
      const def = blockRegistry[block.type];
      if (!def) {
        ctx.warnings.push(`Unknown block type: ${block.type}`);
        return '';
      }
      return def.compile(block as never, ctx);
    })
    .join('\n');

  // 2. Wrap in email shell (DOCTYPE, mso conditionals, container table)
  const shellHtml = wrapInEmailShell(blocksHtml, schema.canvas);

  // 3. Outlook-specific fixes
  const withFixes = applyOutlookFixes(shellHtml);

  // 4. Minify
  const minified = minifyHtml(withFixes);

  // 5. Validate
  const validations = validateEmailHtml(minified);

  return {
    html: minified,
    warnings: [...ctx.warnings, ...validations],
    size: new Blob([minified]).size,
  };
}
```

### 9.3. Email shell

```typescript
// src/core/compiler/table-builder.ts
export function wrapInEmailShell(content: string, canvas: CanvasConfig): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<title>Email Signature</title>
</head>
<body style="margin:0;padding:0;background:${canvas.background_color};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${canvas.width}" style="border-collapse:collapse;width:${canvas.width}px;font-family:${canvas.font_family};color:${canvas.text_color};">
<tr><td>
${content}
</td></tr>
</table>
</body>
</html>`;
}
```

### 9.4. Inline styles helper

```typescript
// src/core/compiler/inline-styles.ts
export function stylesToInline(styles: Record<string, string | number | undefined>): string {
  return Object.entries(styles)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${kebabCase(k)}:${v}`)
    .join(';');
}

export function paddingToCss(p?: Padding): string {
  if (!p) return '0';
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
}
```

### 9.5. Outlook fixes

VML para botones redondeados, mso-line-height-rule, etc. Implementación en `src/core/compiler/outlook-fixes.ts` siguiendo patrones documentados en https://www.caniemail.com.

### 9.6. Validador

```typescript
// src/core/compiler/validate.ts
export function validateEmailHtml(html: string): string[] {
  const warnings: string[] = [];
  const size = new Blob([html]).size;

  if (size > 102 * 1024) {
    warnings.push('HTML exceeds 102KB; Gmail will clip it.');
  }

  const imgs = html.match(/<img[^>]*>/gi) ?? [];
  imgs.forEach((img) => {
    if (!/alt=["'][^"']*["']/.test(img)) warnings.push('Image missing alt attribute');
    if (!/width=["']?\d+/.test(img)) warnings.push('Image missing width');
  });

  return warnings;
}
```

---

## 10. Sistema de Bloques

### 10.1. Definición

Cada bloque sigue el mismo contrato:

```typescript
// src/core/blocks/registry.ts
import type { LucideIcon } from 'lucide-react';
import type { Block, BlockBase } from '@/core/schema/blocks';

export interface BlockDefinition<T extends BlockBase = BlockBase> {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: 'basic' | 'content' | 'social' | 'layout';

  // Crear instancia con valores default
  create: () => T;

  // Componente que se renderiza en el canvas (DEBE producir HTML email-safe)
  Renderer: React.FC<{ block: T; isPreview?: boolean }>;

  // Componente del panel de propiedades en sidebar derecho
  PropertiesPanel: React.FC<{ block: T; onChange: (updates: Partial<T>) => void }>;

  // Función pura: bloque → string HTML email-safe
  compile: (block: T, ctx: CompileContext) => string;

  // Validación pre-render (opcional)
  validate?: (block: T) => string[];

  // Si acepta otros bloques como hijos
  acceptsChildren?: boolean;
}

export const blockRegistry: Record<string, BlockDefinition> = {};

export function registerBlock<T extends BlockBase>(definition: BlockDefinition<T>) {
  blockRegistry[definition.type] = definition as BlockDefinition;
}
```

### 10.2. Bloques del MVP

| Tipo | Categoría | Descripción |
|------|-----------|-------------|
| `text` | content | Texto rico con Tiptap (bold, italic, underline, link) |
| `heading` | content | Texto destacado (h1/h2 size) |
| `image` | content | Imagen con upload, alt, link, border-radius |
| `avatar` | content | Imagen circular (preset de image) |
| `divider` | layout | Línea horizontal con estilo |
| `spacer` | layout | Espacio vertical |
| `social_icons` | social | Fila de iconos de redes con presets |
| `contact_row` | content | Email/phone/web con iconos opcionales |
| `button_cta` | content | Botón con VML para Outlook |
| `disclaimer` | content | Texto legal pequeño |
| `container` | layout | Contenedor 2-column para layouts side-by-side |

### 10.3. Estructura por bloque

Cada bloque vive en su carpeta:

```
src/core/blocks/text/
├── definition.ts       # Registra en registry
├── TextBlock.tsx       # Renderer del canvas
├── TextProperties.tsx  # Panel del sidebar derecho
└── compileText.ts      # Función de compilación a HTML
```

### 10.4. Renderer del canvas

Los renderers devuelven JSX que **es HTML email**:

```tsx
// src/core/blocks/text/TextBlock.tsx
import { FC } from 'react';
import type { TextBlockType } from '@/core/schema/blocks';
import { paddingToCss } from '@/core/compiler/inline-styles';

export const TextBlock: FC<{ block: TextBlockType }> = ({ block }) => {
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: 'collapse', width: '100%' }}
    >
      <tbody>
        <tr>
          <td
            style={{
              fontFamily: block.style.font_family,
              fontSize: `${block.style.font_size}px`,
              fontWeight: block.style.font_weight,
              color: block.style.color,
              lineHeight: block.style.line_height ?? 1.4,
              textAlign: block.style.text_align,
              padding: paddingToCss(block.padding),
            }}
            dangerouslySetInnerHTML={{ __html: block.content }}
          />
        </tr>
      </tbody>
    </table>
  );
};
```

### 10.5. Edición fuera del canvas

Cuando se selecciona un Text block, el sidebar derecho muestra Tiptap:

```tsx
// src/core/blocks/text/TextProperties.tsx
import { FC } from 'react';
import { TiptapEditor } from '@/tiptap/TiptapEditor';
import { PropertySection } from '@/editor/sidebar-right/sections/PropertySection';

export const TextProperties: FC<TextPropsProps> = ({ block, onChange }) => (
  <>
    <PropertySection title="Content">
      <TiptapEditor
        content={block.content}
        onChange={(html) => onChange({ content: html })}
        allowedFormats={['bold', 'italic', 'underline', 'link']}
      />
    </PropertySection>

    <PropertySection title="Typography">
      <FontFamilyInput value={block.style.font_family} onChange={(v) => onChange({ style: { ...block.style, font_family: v } })} />
      <DimensionInput label="Size" value={block.style.font_size} unit="px" />
      <FontWeightInput value={block.style.font_weight} />
      <ColorInput label="Color" value={block.style.color} />
    </PropertySection>

    <PropertySection title="Spacing">
      <PaddingInput value={block.padding} onChange={(p) => onChange({ padding: p })} />
    </PropertySection>
  </>
);
```

**Crítico:** No hay `contentEditable` directo en el canvas. Esto elimina toda la categoría de bugs de cursor/selección típicos.

### 10.6. Compile function

Cada bloque define una función pura `compile`:

```typescript
// src/core/blocks/text/compileText.ts
import type { TextBlockType } from '@/core/schema/blocks';
import type { CompileContext } from '@/core/compiler/compile';
import { stylesToInline, paddingToCss } from '@/core/compiler/inline-styles';
import { sanitizeEmailHtml } from '@/core/compiler/sanitize';

export function compileText(block: TextBlockType, ctx: CompileContext): string {
  const style = stylesToInline({
    font_family: block.style.font_family,
    font_size: `${block.style.font_size}px`,
    font_weight: block.style.font_weight,
    color: block.style.color,
    line_height: block.style.line_height ?? 1.4,
    text_align: block.style.text_align,
    padding: paddingToCss(block.padding),
  });

  // Sanitiza HTML del Tiptap a tags email-safe
  const safe = sanitizeEmailHtml(block.content, ctx.variables);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;"><tr><td style="${style}">${safe}</td></tr></table>`;
}
```

---

## 11. Drag and Drop con dnd-kit

### 11.1. Setup base

```tsx
// src/editor/canvas/Canvas.tsx
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

export const Canvas: FC = () => {
  const blocks = useSchemaStore((s) => s.schema.blocks);
  const moveBlock = useSchemaStore((s) => s.moveBlock);
  const insertBlockFromLibrary = useSchemaStore((s) => s.insertBlockFromLibrary);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    if (active.data.current?.source === 'library') {
      insertBlockFromLibrary(active.data.current.blockType, over.id as string);
      return;
    }

    if (active.id !== over.id) {
      moveBlock(active.id as string, over.id as string);
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <div className="canvas-container">
          {blocks.map((block) => <SortableBlock key={block.id} block={block} />)}
        </div>
      </SortableContext>
      <DragOverlay>{/* preview during drag */}</DragOverlay>
    </DndContext>
  );
};
```

### 11.2. Drop indicators

dnd-kit no provee indicators visuales. Los construimos:

```tsx
// src/editor/canvas/DropIndicators.tsx
export const DropIndicator: FC<{ position: 'top' | 'bottom' }> = ({ position }) => (
  <div className={cn(
    'pointer-events-none absolute left-0 right-0 h-0.5 rounded-full bg-blue-500',
    position === 'top' ? '-top-px' : '-bottom-px',
  )} />
);
```

### 11.3. Containers anidados

Para bloques container, anidamos `SortableContext`:

```tsx
function ContainerBlock({ block }: Props) {
  return (
    <SortableContext items={block.children.map((c) => c.id)}>
      <table>...</table>
      {block.children.map((child) => <SortableBlock key={child.id} block={child} />)}
    </SortableContext>
  );
}
```

dnd-kit soporta nesting nativamente.

---

## 12. Tiptap (Edición de Texto)

### 12.1. Configuración email-safe

```tsx
// src/tiptap/TiptapEditor.tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { VariablePill } from './extensions/VariablePill';

export interface TiptapEditorProps {
  content: string;
  onChange: (html: string) => void;
  allowedFormats?: ('bold' | 'italic' | 'underline' | 'link')[];
}

export const TiptapEditor: FC<TiptapEditorProps> = ({ content, onChange, allowedFormats = ['bold', 'italic', 'underline', 'link'] }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        bold: allowedFormats.includes('bold') && {},
        italic: allowedFormats.includes('italic') && {},
      }),
      allowedFormats.includes('underline') && Underline,
      allowedFormats.includes('link') && Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener', target: '_blank' },
        validate: (url) => /^(https?:\/\/|mailto:|tel:)/.test(url),
      }),
      VariablePill,
    ].filter(Boolean) as never[],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className="rounded-md border border-border">
      <TiptapToolbar editor={editor} formats={allowedFormats} />
      <EditorContent editor={editor} className="prose-sm min-h-[80px] p-3" />
    </div>
  );
};
```

### 12.2. Variables como pills

Las variables (`{{name}}`, `{{title}}`) se insertan como nodos no editables tipo pill (similar a mentions de Notion). Implementación en `src/tiptap/extensions/VariablePill.ts`.

---

## 13. Stores (Zustand)

### 13.1. schemaStore

```typescript
// src/stores/schemaStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useHistoryStore } from './historyStore';
import type { SignatureSchema, Block } from '@/core/schema/signature';

interface SchemaState {
  schema: SignatureSchema;
  setSchema: (schema: SignatureSchema) => void;
  addBlock: (block: Block, position?: number) => void;
  updateBlock: (id: string, updates: Partial<Block>) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (id: string, targetId: string, position: 'before' | 'after') => void;
  duplicateBlock: (id: string) => void;
  updateCanvas: (updates: Partial<CanvasConfig>) => void;
  setVariable: (key: string, value: string) => void;
}

export const useSchemaStore = create<SchemaState>()(
  immer((set, get) => ({
    schema: createEmptySchema(),

    setSchema: (schema) => set({ schema }),

    addBlock: (block, position) => {
      useHistoryStore.getState().push(get().schema);
      set((state) => {
        if (position !== undefined) state.schema.blocks.splice(position, 0, block);
        else state.schema.blocks.push(block);
        state.schema.meta.updated_at = new Date().toISOString();
      });
    },

    updateBlock: (id, updates) => {
      // No snapshot per-keystroke; history captures on debounce
      set((state) => {
        const block = findBlockById(state.schema.blocks, id);
        if (block) Object.assign(block, updates);
      });
    },
    // ... resto
  })),
);
```

### 13.2. historyStore

```typescript
// src/stores/historyStore.ts
interface HistoryState {
  past: SignatureSchema[];
  future: SignatureSchema[];
  push: (schema: SignatureSchema) => void;
  undo: () => SignatureSchema | null;
  redo: () => SignatureSchema | null;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  push: (schema) => set((state) => ({
    past: [...state.past.slice(-49), structuredClone(schema)],
    future: [],
  })),
  undo: () => {
    const { past } = get();
    if (past.length === 0) return null;
    const previous = past[past.length - 1];
    set((state) => ({
      past: state.past.slice(0, -1),
      future: [useSchemaStore.getState().schema, ...state.future],
    }));
    return previous;
  },
  redo: () => {
    const { future } = get();
    if (future.length === 0) return null;
    const next = future[0];
    set((state) => ({
      past: [...state.past, useSchemaStore.getState().schema],
      future: state.future.slice(1),
    }));
    return next;
  },
  clear: () => set({ past: [], future: [] }),
}));
```

### 13.3. Otros stores

- `selectionStore` — block ID seleccionado, hover ID
- `editorStore` — sidebars abiertos/cerrados, tab activo
- `deviceStore` — desktop/mobile preview
- `persistenceStore` — saving status, dirty flag, last saved at

---

## 14. Integración con WordPress

### 14.1. La página del editor en wp-admin

```php
// src/Admin/Pages/EditorPage.php
declare(strict_types=1);

namespace ImaginaSignatures\Admin\Pages;

class EditorPage {

    public function render(): void {
        $signature_id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;

        // Verificar ownership o que es nuevo
        if ( $signature_id > 0 ) {
            $signature = $this->repo->find( $signature_id );
            if ( ! $signature || $signature->user_id !== get_current_user_id() ) {
                wp_die( esc_html__( 'Signature not found or access denied.', 'imagina-signatures' ), 403 );
            }
        }

        $token = $this->generate_iframe_token( get_current_user_id(), $signature_id );
        $iframe_url = rest_url( 'imagina-signatures/v1/editor/iframe?token=' . urlencode( $token ) );

        ?>
        <div class="imagina-signatures-fullscreen">
            <iframe
                src="<?php echo esc_url( $iframe_url ); ?>"
                style="width:100vw;height:100vh;border:0;position:fixed;inset:0;z-index:100000;"
                allow="clipboard-write"
                title="Imagina Signatures Editor"
            ></iframe>
        </div>
        <style>
            #wpadminbar, #adminmenuwrap, #adminmenuback, #wpfooter { display:none !important; }
            html.wp-toolbar { padding-top: 0 !important; }
            #wpcontent, #wpbody-content { margin: 0 !important; padding: 0 !important; }
        </style>
        <?php
    }

    private function generate_iframe_token( int $user_id, int $signature_id ): string {
        $payload = [
            'user_id'      => $user_id,
            'signature_id' => $signature_id,
            'expires'      => time() + 3600,
        ];
        $json = wp_json_encode( $payload );
        return base64_encode( $json ) . '.' . wp_hash( $json );
    }
}
```

### 14.2. Endpoint que sirve el iframe HTML

```php
// src/Api/Controllers/EditorIframeController.php
declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

class EditorIframeController {

    public function serve_iframe( \WP_REST_Request $request ): void {
        $token = $request->get_param( 'token' );
        $payload = $this->verify_iframe_token( $token );

        if ( ! $payload || $payload['expires'] < time() ) {
            wp_die( esc_html__( 'Invalid or expired token.', 'imagina-signatures' ), 403 );
        }

        wp_set_current_user( $payload['user_id'] );

        $editor_js  = plugins_url( 'build/editor.js', IMGSIG_FILE );
        $editor_css = plugins_url( 'build/editor.css', IMGSIG_FILE );
        $api_base   = rest_url( 'imagina-signatures/v1' );
        $rest_nonce = wp_create_nonce( 'wp_rest' );

        $config = [
            'signatureId' => (int) $payload['signature_id'],
            'userId'      => (int) $payload['user_id'],
            'apiBase'     => $api_base,
            'restNonce'   => $rest_nonce,
            'locale'      => get_locale(),
            'pluginUrl'   => plugins_url( '', IMGSIG_FILE ),
        ];

        header( 'Content-Type: text/html; charset=utf-8' );
        header( 'X-Frame-Options: SAMEORIGIN' );
        header( "Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self';" );

        ?><!DOCTYPE html>
<html lang="<?php echo esc_attr( get_locale() ); ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Imagina Signatures Editor</title>
<link rel="stylesheet" href="<?php echo esc_url( $editor_css ); ?>">
</head>
<body>
<div id="imagina-editor-root"></div>
<script>window.IMGSIG_EDITOR_CONFIG = <?php echo wp_json_encode( $config ); ?>;</script>
<script src="<?php echo esc_url( $editor_js ); ?>"></script>
</body>
</html><?php
        exit;
    }
}
```

### 14.3. Bridge dentro del iframe

```typescript
// src/bridge/postMessageBridge.ts
type OutgoingMessage =
  | { type: 'ready' }
  | { type: 'dirty'; dirty: boolean }
  | { type: 'saved' }
  | { type: 'request-close' };

type IncomingMessage =
  | { type: 'force-save' }
  | { type: 'request-close' };

export class PostMessageBridge {
  private listeners = new Map<string, Set<(msg: IncomingMessage) => void>>();

  constructor(private parentOrigin: string = window.location.origin) {
    window.addEventListener('message', this.handleMessage);
  }

  send(message: OutgoingMessage): void {
    window.parent.postMessage({ source: 'imgsig-editor', ...message }, this.parentOrigin);
  }

  on<T extends IncomingMessage['type']>(type: T, callback: (msg: IncomingMessage) => void): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(callback);
    return () => this.listeners.get(type)!.delete(callback);
  }

  private handleMessage = (event: MessageEvent) => {
    if (event.origin !== this.parentOrigin) return;
    if (event.data?.source !== 'imgsig-host') return;
    const callbacks = this.listeners.get(event.data.type);
    callbacks?.forEach((cb) => cb(event.data));
  };
}
```

### 14.4. API client del iframe

```typescript
// src/bridge/apiClient.ts
const config = (window as Window & { IMGSIG_EDITOR_CONFIG?: AppConfig }).IMGSIG_EDITOR_CONFIG!;

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export async function apiCall<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${config.apiBase}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-WP-Nonce': config.restNonce,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(error.code ?? 'unknown', error.message ?? 'Request failed', response.status);
  }

  return response.json();
}
```

---

## 15. Roles y Capabilities

Como NO tenemos sistema de planes ni rol custom, usamos las capabilities nativas de WordPress y agregamos una propia mínima:

### 15.1. Capabilities

```php
// src/Setup/CapabilitiesInstaller.php
class CapabilitiesInstaller {
    public function install(): void {
        // Por default: cualquier rol con `edit_posts` puede usar el plugin
        // (admins, editors, authors). Esto incluye admins automáticamente.
        $roles = [ 'administrator', 'editor', 'author' ];
        foreach ( $roles as $role_name ) {
            $role = get_role( $role_name );
            $role?->add_cap( 'imgsig_use_signatures' );
        }

        // Solo administradores gestionan plantillas y storage settings
        $admin = get_role( 'administrator' );
        $admin?->add_cap( 'imgsig_manage_templates' );
        $admin?->add_cap( 'imgsig_manage_storage' );
    }

    public function uninstall(): void {
        $caps = [ 'imgsig_use_signatures', 'imgsig_manage_templates', 'imgsig_manage_storage' ];
        foreach ( wp_roles()->roles as $role_name => $_ ) {
            $role = get_role( $role_name );
            if ( ! $role ) continue;
            foreach ( $caps as $cap ) $role->remove_cap( $cap );
        }
    }
}
```

### 15.2. Capabilities expuestas

| Capability | Quién la tiene | Para qué |
|-----------|----------------|----------|
| `imgsig_use_signatures` | admin, editor, author | Crear/editar/borrar **sus propias** firmas |
| `imgsig_manage_templates` | admin | CRUD de plantillas globales |
| `imgsig_manage_storage` | admin | Configurar storage settings |

### 15.3. Aislamiento entre usuarios

Cada query y endpoint filtra por `user_id`. El `OwnershipCheck` middleware se aplica a endpoints que reciben un signature_id:

```php
public function check_ownership( int $signature_id ): bool {
    $signature = $this->repo->find( $signature_id );
    if ( ! $signature ) return false;
    return $signature->user_id === get_current_user_id();
}
```

Los assets siguen la misma regla. Las plantillas son globales (cualquiera con `imgsig_use_signatures` puede usarlas, solo admins las gestionan).

---

## 16. REST API

### 16.1. Convenciones

- Namespace: `imagina-signatures/v1`
- Auth: cookie WP + nonce
- Errores: `WP_Error` con códigos `imgsig_*` y status HTTP correctos
- Paginación: `?page=1&per_page=20` con headers `X-WP-Total`, `X-WP-TotalPages`

### 16.2. Endpoints

```
=== Signatures (user-scoped) ===

GET    /signatures                      Lista firmas del usuario actual
POST   /signatures                      Crear nueva firma
GET    /signatures/:id                  Obtener (valida ownership)
PATCH  /signatures/:id                  Actualizar
DELETE /signatures/:id                  Borrar
POST   /signatures/:id/duplicate        Duplicar
GET    /signatures/:id/export           HTML compilado

=== Templates (read open, write admin) ===

GET    /templates                       Lista plantillas
GET    /templates/:id                   Obtener
POST   /templates                       [admin] Crear
PATCH  /templates/:id                   [admin] Editar
DELETE /templates/:id                   [admin] Borrar

=== Assets / Upload (user-scoped) ===

POST   /upload/init                     Solicita inicio de upload
POST   /upload/direct                   Upload server-side (Media Library)
POST   /upload/finalize                 Confirma upload (tras PUT a S3)
GET    /assets                          Lista del usuario
DELETE /assets/:id                      Borrar

=== Me ===

GET    /me                              Info del usuario actual + capabilities

=== Storage (admin only) ===

GET    /admin/storage                   Config (sin secretos)
PATCH  /admin/storage                   Actualizar config (encripta)
POST   /admin/storage/test              Probar conexión
POST   /admin/storage/migrate           Iniciar migración

=== Editor iframe ===

GET    /editor/iframe?token=...         Sirve HTML del editor
```

### 16.3. Estructura de Controller

```php
// src/Api/Controllers/SignaturesController.php
declare(strict_types=1);

namespace ImaginaSignatures\Api\Controllers;

class SignaturesController extends BaseController {

    public function __construct(
        private SignatureService $service,
        private SignatureRepository $repo
    ) {}

    public function register_routes(): void {
        register_rest_route( 'imagina-signatures/v1', '/signatures', [
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'index' ],
                'permission_callback' => [ $this, 'check_use' ],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [ $this, 'create' ],
                'permission_callback' => [ $this, 'check_use' ],
                'args'                => $this->create_args(),
            ],
        ] );

        register_rest_route( 'imagina-signatures/v1', '/signatures/(?P<id>\d+)', [
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'show' ],
                'permission_callback' => [ $this, 'check_ownership' ],
            ],
            [
                'methods'             => 'PATCH',
                'callback'            => [ $this, 'update' ],
                'permission_callback' => [ $this, 'check_ownership' ],
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [ $this, 'delete' ],
                'permission_callback' => [ $this, 'check_ownership' ],
            ],
        ] );
    }

    public function check_use(): bool {
        return current_user_can( 'imgsig_use_signatures' );
    }

    public function check_ownership( \WP_REST_Request $request ): bool {
        if ( ! current_user_can( 'imgsig_use_signatures' ) ) return false;
        $id = (int) $request['id'];
        $signature = $this->repo->find( $id );
        return $signature && $signature->user_id === get_current_user_id();
    }

    // ... handlers
}
```

---

## 17. Sistema de Storage

### 17.1. Interface

```php
// src/Storage/Contracts/StorageDriverInterface.php
namespace ImaginaSignatures\Storage\Contracts;

interface StorageDriverInterface {
    public function supports_presigned_uploads(): bool;
    public function upload( string $source_path, string $destination_key, array $meta ): UploadResult;
    public function get_presigned_upload_url( string $key, string $content_type, int $max_size, int $expires_seconds ): PresignedResult;
    public function get_public_url( string $key ): string;
    public function delete( string $key ): bool;
    public function test_connection(): TestResult;
    public function get_id(): string;
    public function is_configured(): bool;
}
```

### 17.2. MediaLibraryDriver

- Sube a `wp-content/uploads/imagina-signatures/{user_id}/`
- Usa `wp_handle_sideload()` 
- Cero configuración requerida
- Funciona en cualquier hosting

### 17.3. S3Driver

- Implementación SigV4 propia (~150 líneas, sin AWS SDK)
- Soporta R2, Bunny, S3, B2, Spaces, Wasabi, MinIO via endpoint configurable
- Pre-signed URLs para upload directo desde browser
- Credenciales encriptadas con `Encryption` service (AES-256-CBC, key derivada de `AUTH_KEY`)

### 17.4. Provider presets

```php
class ProviderPresets {
    public const PRESETS = [
        'cloudflare_r2' => [
            'name' => 'Cloudflare R2',
            'endpoint_template' => 'https://{account_id}.r2.cloudflarestorage.com',
            'region' => 'auto',
            'extra_fields' => [ 'account_id' ],
        ],
        'bunny' => [
            'name' => 'Bunny Storage',
            'endpoint_template' => 'https://{region}.storage.bunnycdn.com',
            'region_options' => [ 'ny', 'la', 'sg', 'syd', 'de', 'uk' ],
        ],
        's3' => [
            'name' => 'Amazon S3',
            'endpoint_template' => 'https://s3.{region}.amazonaws.com',
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
        'custom' => [
            'name' => 'Custom S3-compatible',
            'extra_fields' => [ 'custom_endpoint' ],
        ],
    ];
}
```

### 17.5. Upload flow

**Media Library:**
1. Browser comprime imagen client-side (`browser-image-compression`)
2. POST `/upload/init` → server responde `{ method: 'direct', url: ... }`
3. Browser hace POST multipart al `/upload/direct`
4. Server recibe, valida, mueve a uploads/, registra en `imgsig_assets`
5. Server responde con `Asset` completo

**S3:**
1. Browser comprime imagen
2. POST `/upload/init` → server genera pre-signed URL, registra asset preliminar
3. Browser hace PUT directo al S3 con la URL firmada
4. POST `/upload/finalize` → server marca asset como completo
5. Browser usa `public_url` del asset

---

## 18. Look & Feel del Editor (Framer/Webflow)

### 18.1. Tokens de diseño

```css
/* src/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --bg-primary: #fafafa;       /* canvas fondo */
    --bg-panel: #ffffff;
    --bg-hover: #f5f5f5;
    --bg-selected: #eff6ff;

    --border-default: #e5e7eb;
    --border-strong: #d1d5db;
    --border-selected: #3b82f6;

    --text-primary: #111827;
    --text-secondary: #6b7280;
    --text-muted: #9ca3af;

    --accent: #3b82f6;
    --accent-hover: #2563eb;

    --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.06);

    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 8px;
  }
}
```

### 18.2. Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Topbar 48px                                                      │
│  [Logo]  [Device]  [Undo Redo]   [Saved 2s]   [Preview] [Copy]   │
├─────────────────────────────────────────────────────────────────┤
│         │                                              │          │
│  Left   │                                              │  Right   │
│ Sidebar │              Canvas Area                     │ Sidebar  │
│  240px  │              fondo gris claro                │  280px   │
│         │                                              │          │
│ Tabs:   │      ┌──────────────────────┐               │ Properties│
│ Blocks  │      │                       │               │ Sections │
│ Layers  │      │   Firma viva (max     │               │ collapse │
│ Templates│     │       600px)          │               │ ables    │
│         │      │   con sombra sutil    │               │          │
│ Block   │      │                       │               │ Inputs   │
│ cards   │      └──────────────────────┘               │ stand-   │
│ grid 2  │                                              │ ardized  │
│ columns │                                              │          │
│         │                                              │          │
└─────────────────────────────────────────────────────────────────┘
```

### 18.3. Detalles visuales

**Sidebar izquierdo:**
- Tabs superior: Blocks / Layers / Templates
- Tab Blocks: grid 2 columnas con tarjetas (icono Lucide grande + nombre)
- Categorías con headers separadores discretos
- Hover sutil con sombra

**Sidebar derecho:**
- Sin selección: muestra propiedades del Canvas (background, font default, width)
- Con selección: muestra propiedades del bloque
- Secciones colapsables con chevron
- Inputs estandarizados: label arriba en gris pequeño, control debajo

**Canvas:**
- Fondo gris muy claro (#fafafa)
- Firma centrada con sombra sutil
- Outline azul 1px en seleccionado
- Outline gris translúcido en hover
- Block toolbar floating (duplicar, borrar, mover) en esquina superior del bloque

**Topbar:**
- 48px alto
- Logo izquierda
- Device switcher (Desktop/Mobile) centro-izquierda
- Undo/Redo iconos
- Save status: "Saved 2s ago" pequeño en gris
- Preview + Copy HTML a la derecha

**Animaciones (Framer Motion):**
- Sidebar abre/cierra: 200ms ease-out
- Drop indicators: pulse animation
- Selection outline: aparece con scale 1.02 → 1
- Modal: fade + scale-up suave

### 18.4. Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + D` | Duplicar bloque |
| `Cmd/Ctrl + S` | Guardar inmediato (override autosave) |
| `Backspace` / `Delete` | Borrar bloque seleccionado |
| `Esc` | Deseleccionar |
| `↑` / `↓` | Mover selección entre bloques |
| `Cmd/Ctrl + C` (con bloque) | Copiar bloque |
| `Cmd/Ctrl + V` | Pegar bloque |

---

## 19. Seguridad

### 19.1. Validación de input

Toda entrada del usuario:
1. `wp_unslash()` (deshacer slashes WP)
2. Sanitización tipo-específica
3. Validación contra schema

### 19.2. Autorización

Cada endpoint valida:
1. Nonce (REST cookie auth lo hace automático)
2. Capability (`current_user_can( 'imgsig_use_signatures' )`)
3. Ownership (`signature->user_id === get_current_user_id()`)

### 19.3. Rate limiting

```php
class RateLimiter {
    public function check( string $action, int $user_id, int $max, int $window_seconds ): void {
        $key = "imgsig_rl_{$action}_{$user_id}";
        $count = (int) get_transient( $key );
        if ( $count >= $max ) {
            throw new RateLimitException( sprintf(
                __( 'Too many requests. Try again in %d seconds.', 'imagina-signatures' ),
                $window_seconds
            ) );
        }
        set_transient( $key, $count + 1, $window_seconds );
    }
}
```

Aplicar en: uploads (10/min), creación de firmas (30/hora).

### 19.4. XSS

- Whitelist HTML en bloques de texto (Tiptap restringido)
- Tags permitidos: `<strong>`, `<em>`, `<u>`, `<a href>`, `<br>`, `<span>`
- URLs solo: `http`, `https`, `mailto`, `tel`
- SVG bloqueado en uploads
- CSP headers en página del editor (sección 14.2)

### 19.5. SQL injection

`$wpdb->prepare()` SIEMPRE. Nunca concatenar.

### 19.6. CSRF

Nonces de WP. `X-WP-Nonce` header automático.

### 19.7. SSRF

Si alguna feature toma URLs del usuario para fetch (preview, etc.):
- Solo `http://`, `https://`
- Bloquear private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, ::1)
- Timeout corto

### 19.8. Logs

Logear eventos importantes SIN datos sensibles:

```php
$logger->info( 'signature_created', [ 'user_id' => $user_id, 'signature_id' => $id ] );
// NUNCA logear contenido de firmas, credenciales, etc.
```

---

## 20. Compatibilidad de Email

### 20.1. Reglas obligatorias del HTML output

- Tablas anidadas para layout (no flexbox/grid)
- CSS inline en todo elemento
- `width` en atributos HTML, no solo CSS, en imágenes
- `alt` en toda imagen
- Max 600px ancho
- VML para botones redondeados (Outlook)
- Comments condicionales `<!--[if mso]>`
- Sin scripts, sin formularios, sin video, sin SVG inline
- Solo web-safe fonts (Arial, Helvetica, Georgia, Times, Tahoma, Verdana, Trebuchet)

### 20.2. Validador post-compilación

`validateEmailHtml()` en `src/core/compiler/validate.ts`:
- Tamaño > 102KB → warning de Gmail clipping
- Imágenes sin alt → warning
- Imágenes sin width → warning
- Links sin href → warning

### 20.3. Testing manual obligatorio

Antes de release, probar templates en:
- Outlook 365 Desktop (Windows) — el más difícil
- Outlook Web (OWA)
- Outlook Mac
- Gmail Web (Chrome)
- Gmail App (iOS, Android)
- Apple Mail (macOS, iOS)
- Yahoo Mail
- Thunderbird

---

## 21. i18n

### 21.1. Reglas

- Text domain: `imagina-signatures`
- Toda string visible pasa por `__()` o equivalente
- En JS: helper propio que carga del bundle inyectado por PHP

### 21.2. Idiomas iniciales

- `en_US` (source)
- `es_ES`
- `es_CO`

---

## 22. Testing

### 22.1. PHP

```bash
composer test  # PHPUnit
```

Cobertura mínima:
- `src/Services/`: 70%
- `src/Storage/S3/`: 80%
- `src/Security/`: 100%

Mocks con Brain Monkey.

### 22.2. JS

```bash
npm test  # Vitest
```

Tests críticos:
- Pipeline JSON → HTML email (snapshot tests por bloque)
- Validators de schema
- Stores (schema, history)
- Compresión de imágenes (mock canvas)

### 22.3. E2E (post-MVP)

Playwright con flujos clave:
- Login + crear firma + agregar bloques + copiar HTML
- Upload de imagen (Media Library y S3)

---

## 23. Build y Distribución

### 23.1. Comandos

```bash
# Desarrollo
npm run dev              # Vite dev server con HMR
composer install         # Deps PHP

# Producción
npm run build            # Bundle a /build
composer install --no-dev --optimize-autoloader

# Lint y test
npm run lint
npm run typecheck
npm test
composer run lint
composer run test
```

### 23.2. Generación del ZIP

```bash
# scripts/build-zip.sh
#!/bin/bash
set -e
VERSION=$(php -r "include 'imagina-signatures.php'; echo \$plugin_data['Version'];")
DIST="dist/imagina-signatures-$VERSION"

rm -rf "$DIST" "dist/imagina-signatures-$VERSION.zip"
mkdir -p "$DIST"

rsync -av \
  --exclude='node_modules' \
  --exclude='tests' \
  --exclude='.github' \
  --exclude='.git*' \
  --exclude='dist' \
  --exclude='scripts' \
  --exclude='package*.json' \
  --exclude='vite.config.ts' \
  --exclude='tsconfig.json' \
  --exclude='tailwind.config.ts' \
  --exclude='postcss.config.js' \
  --exclude='components.json' \
  --exclude='.eslintrc*' \
  --exclude='.prettierrc' \
  --exclude='phpcs.xml.dist' \
  --exclude='phpunit.xml.dist' \
  --exclude='composer.json' \
  --exclude='composer.lock' \
  --exclude='CLAUDE.md' \
  --exclude='CONTRIBUTING.md' \
  --exclude='assets/*/src' \
  ./ "$DIST/"

cd dist
zip -r "imagina-signatures-$VERSION.zip" "imagina-signatures-$VERSION"
echo "Built: dist/imagina-signatures-$VERSION.zip"
```

### 23.3. Checklist pre-release

- [ ] Versión en `imagina-signatures.php` header
- [ ] Versión en `readme.txt`
- [ ] CHANGELOG.md actualizado
- [ ] `npm run build` corrido
- [ ] `composer install --no-dev` corrido
- [ ] phpcs sin errores
- [ ] eslint sin errores
- [ ] PHPUnit passing
- [ ] Vitest passing
- [ ] WP_DEBUG sin warnings
- [ ] Test manual en PHP 7.4, 8.0, 8.1, 8.2, 8.3
- [ ] Test manual en WP 6.0, 6.4, 6.6, 6.7
- [ ] .pot regenerado
- [ ] Test manual en Outlook + Gmail + Apple Mail
- [ ] ZIP generado, instalable limpio en WP fresco

---

## 24. CI/CD

### 24.1. ci.yml (PRs)

```yaml
name: CI
on: [pull_request]
jobs:
  php:
    strategy:
      matrix:
        php: ['7.4', '8.0', '8.1', '8.2', '8.3']
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '${{ matrix.php }}' }
      - run: composer install
      - run: composer run lint
      - run: composer run test

  js:
    runs-on: ubuntu-latest
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

---

## 25. Convenciones de Git

### 25.1. Branches

- `main` — producción, releases tagged
- `develop` — integración
- `feature/xxx`
- `fix/xxx`
- `release/x.y.z`

### 25.2. Commits — Conventional Commits

```
feat(editor): add social icons block
fix(storage): handle s3 connection timeout
chore(deps): bump @dnd-kit/core
docs(api): document signatures endpoints
refactor(compiler): extract table-builder
test(unit): add tests for HtmlSanitizer
```

### 25.3. Versionado

Semver estricto:
- Breaking changes (DB schema, API): MAJOR
- Features: MINOR
- Fixes: PATCH

---

## 26. Hooks Públicos

### 26.1. Actions

```php
do_action( 'imgsig/plugin/activated' );
do_action( 'imgsig/plugin/deactivated' );

do_action( 'imgsig/signature/before_create', array $data, int $user_id );
do_action( 'imgsig/signature/created', Signature $signature );
do_action( 'imgsig/signature/before_update', Signature $old, array $changes );
do_action( 'imgsig/signature/updated', Signature $signature );
do_action( 'imgsig/signature/before_delete', Signature $signature );
do_action( 'imgsig/signature/deleted', int $signature_id );

do_action( 'imgsig/template/created', Template $template );
do_action( 'imgsig/template/deleted', int $template_id );

do_action( 'imgsig/asset/uploaded', Asset $asset );
do_action( 'imgsig/asset/deleted', int $asset_id );

do_action( 'imgsig/storage/driver_changed', string $old, string $new );
```

### 26.2. Filters

```php
$data    = apply_filters( 'imgsig/signature/data_before_save', array $data, string $context );
$html    = apply_filters( 'imgsig/signature/compiled_html', string $html, Signature $signature );

$drivers = apply_filters( 'imgsig/storage/available_drivers', array $drivers );
$config  = apply_filters( 'imgsig/storage/config', array $config, string $driver );

$blocks  = apply_filters( 'imgsig/editor/registered_blocks', array $blocks );
$networks = apply_filters( 'imgsig/social/networks', array $networks );
$fonts   = apply_filters( 'imgsig/canvas/font_families', array $fonts );

$capabilities = apply_filters( 'imgsig/capabilities', array $caps, string $role );
```

Documentar todos en `src/Hooks/Actions.php` y `src/Hooks/Filters.php`.

---

## 27. Plantillas Pre-construidas (MVP)

10 plantillas como JSON files en `templates/`:

1. `corporate-classic` — Foto + nombre + cargo + contacto + redes
2. `minimal-modern` — Una columna, espaciado generoso
3. `sales-active` — CTA destacado, botones
4. `medical` — Profesional, info de licencia
5. `legal` — Disclaimer largo, datos firma
6. `creative` — Colores vivos
7. `developer` — GitHub, monospace
8. `tech-startup` — Logo grande, links a producto
9. `consultant` — Foto + credenciales + LinkedIn
10. `e-commerce` — Logo tienda, links productos

Seedeadas en activación del plugin via `DefaultTemplatesSeeder`.

---

## 28. Roadmap de Implementación

### Sprint 1 (semanas 1–2): Setup y Backend Base

- Repo init: composer, package.json, vite, eslint, phpcs, phpunit, vitest
- Plugin file con header válido WP + bootstrap
- Autoloader PSR-4 propio
- Container DI
- Activator/Deactivator/Uninstaller
- SchemaMigrator + tablas (`imgsig_signatures`, `imgsig_templates`, `imgsig_assets`)
- CapabilitiesInstaller
- CI básico
- README + CONTRIBUTING

### Sprint 2 (semana 3): Storage Base

- StorageDriverInterface
- MediaLibraryDriver completo
- S3Driver: SigV4 propio + provider presets + test_connection
- Encryption service
- StorageManager con factory
- Settings page (admin) para configurar storage
- Tests unitarios de SigV4Signer

### Sprint 3 (semana 4): REST API Backend

- BaseController con helpers
- SignaturesController completo (CRUD)
- TemplatesController (read open, write admin)
- UploadController (init/direct/finalize)
- StorageController (admin)
- MeController
- Middleware: CapabilityCheck, OwnershipCheck, RateLimiter
- Tests integración con WP_REST_Request

### Sprint 4 (semana 5): Iframe Setup + React Foundation

- EditorIframeController con HTML mínimo + token auth
- EditorPage en wp-admin que monta el iframe
- Vite + React 18 + TypeScript strict
- Tailwind + shadcn/ui init
- postMessageBridge funcional
- apiClient con auth WP nonce
- Layout vacío (Topbar + sidebars + canvas placeholder)

### Sprint 5 (semanas 6–7): Schema, Stores, Canvas Básico

- Schema TypeScript completo
- Validadores schema (TS y PHP equivalentes)
- schemaStore con immer
- historyStore con snapshots
- selectionStore, editorStore, deviceStore
- persistenceStore con autosave debounced
- Canvas que renderiza schema → JSX email-safe
- 3 bloques iniciales: Text (string simple, sin Tiptap), Image, Divider
- SelectionOverlay y HoverOverlay

### Sprint 6 (semanas 8–9): dnd-kit Completo

- Setup DndContext + SortableContext
- Drag desde sidebar al canvas (insertar)
- Drag dentro del canvas (reordenar)
- Drop indicators visuales
- DragOverlay con preview
- Block toolbar (duplicar, borrar, mover up/down)
- Atajos de teclado (Cmd+Z, Cmd+D, Backspace, etc.)

### Sprint 7 (semana 10): Tiptap + Properties

- TiptapEditor email-safe
- Variables como pills (extension custom)
- Toolbar de Tiptap (bold, italic, underline, link)
- Link picker con validación
- TextBlock migrado a Tiptap
- Properties panel completo: ColorInput, DimensionInput, PaddingInput, FontFamilyInput, FontWeightInput
- CanvasProperties (sidebar derecho cuando no hay selección)

### Sprint 8 (semana 11): Resto de Bloques

- Heading, Avatar, Spacer, SocialIcons (con biblioteca SVG inline), ContactRow, ButtonCta (con VML), Disclaimer, Container 2-col
- Properties panels de cada uno
- compile functions de cada uno

### Sprint 9 (semana 12): Compilador HTML Email

- compile() función principal
- table-builder con email shell
- inline-styles helper
- outlook-fixes (VML, mso conditionals)
- minify
- validateEmailHtml warnings
- Snapshot tests del output por bloque

### Sprint 10 (semana 13): Templates + Export

- DefaultTemplatesSeeder con 10 plantillas
- TemplatePicker modal en sidebar izquierdo
- Aplicar plantilla → reemplazar schema actual
- Export modal con HTML formateado
- Copy to clipboard
- Download como .html

### Sprint 11 (semana 14): UX Polish + Preview

- Animaciones Framer Motion
- Empty states
- Loading states
- Error boundaries
- Toast notifications (shadcn/ui)
- Preview modal multi-cliente (Gmail/Outlook/Apple emulated)

### Sprint 12 (semana 15): Testing + Docs + Release

- Tests E2E con Playwright (flujos clave)
- Cross-client testing real (Outlook, Gmail, Apple Mail)
- Bug fixes
- Documentación al usuario en `docs/`
- .pot generado, traducciones es_ES y es_CO
- v1.0.0 release

**Total: 15 semanas (~3.5 meses)**

---

## 29. Reglas para Claude Code

Cuando trabajes en este proyecto:

1. **Lee este documento completo en cada sesión nueva.** No asumas convenciones — están aquí.

2. **Antes de implementar una feature:**
   - Identifica en qué sprint está
   - Revisa secciones relevantes
   - Confirma con el usuario si hay ambigüedad

3. **Al escribir PHP:**
   - WPCS desde el primer carácter
   - Type hints obligatorios
   - PHPDoc en métodos públicos
   - Prefijo `imgsig_` siempre

4. **Al escribir TS/TSX:**
   - Strict mode
   - Sin `any` injustificado
   - Functional components
   - i18n con `__()`

5. **Al modificar el schema JSON:**
   - Bump del `schema_version`
   - Migración escrita
   - Tests actualizados

6. **Al añadir endpoints REST:**
   - Permission callback obligatorio
   - Sanitización en `args`
   - Documentar en sección 16.2

7. **Al añadir un hook:**
   - Documentar en sección 26
   - Documentar en `src/Hooks/Actions.php` o `Filters.php`

8. **Al añadir dependencias:**
   - Justificar el peso (bundle JS) o tamaño (vendor PHP)
   - Verificar licencia GPL-compatible

9. **Al hacer commits:**
   - Conventional Commits
   - Un commit = un cambio lógico

10. **Al detectar ambigüedad o conflicto:**
    - Pregunta al usuario antes de improvisar
    - Propón actualización del CLAUDE.md

11. **NUNCA:**
    - Uses `eval()`, `create_function()`, `extract()`
    - Hagas requests HTTP a dominios no autorizados
    - Modifiques tablas de WP core
    - Uses `$_POST`/`$_GET` directo (siempre via REST request)
    - Uses sessions PHP nativas
    - Implementes sistema de planes, cuotas, licencias o usuarios custom sin pedir confirmación previa
    - Uses GrapesJS, MJML browser, juice externo, Backbone, jQuery dentro del iframe del editor

12. **SIEMPRE:**
    - Test connection antes de marcar storage como configurado
    - Validar ownership en endpoints user-scoped
    - Cachear queries pesadas
    - Liberar transients en uninstall
    - Componer el editor con React 18, dnd-kit, Tiptap, shadcn/ui exclusivamente
    - Mantener el iframe aislado de wp-admin

---

## 30. Glosario

- **Canvas** — Área central del editor donde se ve la firma viva
- **Block** — Unidad de contenido del editor (Text, Image, Social, etc.)
- **Schema** — JSON estructurado que representa una firma (versionado)
- **Compile** — Proceso JSON → HTML email-safe
- **Editor** — App React 18 que corre en iframe aislado dentro de wp-admin
- **Bridge** — postMessage API entre iframe y wp-admin host
- **Driver** — Implementación de `StorageDriverInterface` (Media Library o S3)
- **Provider** — Servicio backend del driver S3 (R2, Bunny, AWS, etc.)
- **Ownership** — Validación que un signature/asset pertenece al user_id actual

---

## 31. Calidad de Release

Antes de cada release:

- ✅ Cero errores en `WP_DEBUG=true`
- ✅ Cero notices/warnings PHP
- ✅ Funciona en PHP 7.4, 8.0, 8.1, 8.2, 8.3
- ✅ Funciona en WP 6.0+
- ✅ Funciona con plugins comunes (Yoast, WooCommerce, Elementor, WPForms) sin conflictos
- ✅ Funciona con themes comunes (Astra, GeneratePress, Hello, Twenty Twenty-X)
- ✅ Editor abre y cierra sin errores en consola
- ✅ Drag-and-drop fluido sin colapsos
- ✅ Autosave funciona y muestra status correcto
- ✅ HTML output testeado en Outlook + Gmail + Apple Mail
- ✅ Documentación completa
- ✅ Changelog actualizado
- ✅ Versión bumped
- ✅ ZIP instalable limpio en WP fresco

---

**Fin del CLAUDE.md.**

Este documento se actualiza con cada cambio estructural del proyecto. Antes de modificarlo en producción, abre un PR de discusión.
