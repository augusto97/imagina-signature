<?php
/**
 * Asset enqueuer for the React editor.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Core\I18n;
use ImaginaSignatures\Core\Plugin;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Settings\BrandKit;
use ImaginaSignatures\Services\RenderInputs;
use ImaginaSignatures\Services\SignatureLinkConfig;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Team\OnBehalf;

defined( 'ABSPATH' ) || exit;

/**
 * Loads `build/editor.js` + `build/editor.css` and injects the
 * `IMGSIG_EDITOR_CONFIG` bootstrap object on the editor page.
 *
 * The Vite bundle imports a shared chunk via ES modules, so the
 * script tag MUST carry `type="module"`. WordPress's enqueue API
 * doesn't have a native modifier for that — we filter
 * `script_loader_tag` to rewrite the tag for our handle.
 *
 * Loaded only on the editor page hook suffix that {@see AdminMenu}
 * registers — never globally.
 *
 * Editing someone else's signature on their behalf (1.3.0, team
 * managers — {@see OnBehalf}): everything the compiler reads (system
 * variables, footer, campaigns, output language) is the OWNER's, so the
 * HTML stored on save is what the owner's own editor would produce; the
 * UI stays in the manager's language, `onBehalfOf` drives the banner and
 * the back arrow returns to the Team page.
 *
 * @since 1.0.6
 */
final class EditorAssetEnqueuer {

	private const HANDLE = 'imgsig-editor';

	/**
	 * Hook suffix WordPress assigned to the editor admin page.
	 *
	 * @var string
	 */
	private string $hook_suffix;

	/**
	 * @param string $hook_suffix Hook suffix for the editor page.
	 */
	public function __construct( string $hook_suffix ) {
		$this->hook_suffix = $hook_suffix;
	}

	/**
	 * Hooks into WordPress's asset pipeline.
	 *
	 * @since 1.0.6
	 *
	 * @return void
	 */
	public function boot(): void {
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue' ] );
		add_filter( 'script_loader_tag', [ $this, 'tag_as_module' ], 10, 2 );
	}

	/**
	 * Enqueue the editor bundle when on the editor page.
	 *
	 * @since 1.0.6
	 *
	 * @param string $hook_suffix Current admin page hook suffix.
	 *
	 * @return void
	 */
	public function enqueue( string $hook_suffix ): void {
		if ( $hook_suffix !== $this->hook_suffix ) {
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$signature_id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		$version      = defined( 'IMGSIG_VERSION' ) ? IMGSIG_VERSION : '1.0.0';

		// Hashed filenames from the Vite manifest — every release ships
		// fresh URLs so caches can't possibly serve a stale bundle.
		// Empty string means the manifest is missing or the entry is
		// not registered. ManifestReader has already queued an admin
		// notice; we refuse to emit a dead `<script>` URL here.
		$js_file  = ManifestReader::file_for( 'assets/editor/src/main.tsx' );
		$css_file = ManifestReader::css_for( 'assets/editor/src/main.tsx' );

		if ( '' === $js_file ) {
			return;
		}

		if ( '' !== $css_file ) {
			wp_enqueue_style(
				self::HANDLE,
				plugins_url( 'build/' . $css_file, IMGSIG_FILE ),
				[],
				$version
			);
		}

		wp_enqueue_script(
			self::HANDLE,
			plugins_url( 'build/' . $js_file, IMGSIG_FILE ),
			[],
			$version,
			true
		);

		wp_add_inline_script(
			self::HANDLE,
			'window.IMGSIG_EDITOR_CONFIG = ' . wp_json_encode( $this->build_config( $signature_id ) ) . ';',
			'before'
		);
	}

	/**
	 * Rewrites our script tag to `type="module"`.
	 *
	 * @since 1.0.6
	 *
	 * @param string $tag    Existing script tag HTML.
	 * @param string $handle WP script handle.
	 *
	 * @return string
	 */
	public function tag_as_module( string $tag, string $handle ): string {
		if ( self::HANDLE !== $handle ) {
			return $tag;
		}
		return str_replace( ' src=', ' type="module" src=', $tag );
	}

	/**
	 * Build the `IMGSIG_EDITOR_CONFIG` payload.
	 *
	 * @since 1.0.6
	 *
	 * @param int $signature_id 0 for "new", >0 for existing.
	 *
	 * @return array<string, mixed>
	 */
	private function build_config( int $signature_id ): array {
		$user_id   = get_current_user_id();
		$user      = wp_get_current_user();
		$site_opts = SiteSettingsController::current_settings();
		$owner     = null;
		try {
			$owner = self::on_behalf_owner( $signature_id, Plugin::instance()->container()->make( SignatureRepository::class ) );
		} catch ( \Throwable $e ) {
			$owner = null;
		}
		// Read the active driver ID directly from the option rather
		// than spinning up a `StorageManager` instance (which would
		// also instantiate `Encryption` just to know the driver ID).
		// The frontend only needs to know "is URL-only mode active?"
		// so we compare against the `url_only` driver id.
		$active_driver  = (string) get_option( 'imgsig_storage_driver', 'media_library' );
		$upload_enabled = 'url_only' !== $active_driver;

		return [
			'pluginVersion'  => defined( 'IMGSIG_VERSION' ) ? IMGSIG_VERSION : '0.0.0',
			'signatureId'    => $signature_id,
			'userId'         => $user_id,
			'apiBase'        => esc_url_raw( rest_url( 'imagina-signatures/v1' ) ),
			'restNonce'      => wp_create_nonce( 'wp_rest' ),
			// For refreshing an expired REST nonce via core's
			// `admin-ajax.php?action=rest-nonce`.
			'ajaxUrl'        => esc_url_raw( admin_url( 'admin-ajax.php' ) ),
			'locale'         => get_user_locale( $user_id ),
			// `{ msgid: msgstr }` for the user's locale ({} for English).
			'translations'   => I18n::js_translations( get_user_locale( $user_id ) ),
			'pluginUrl'      => esc_url_raw( plugins_url( '', IMGSIG_FILE ) ),
			'capabilities'   => [
				'use'              => current_user_can( CapabilitiesInstaller::CAP_USE ),
				'manage_templates' => current_user_can( CapabilitiesInstaller::CAP_MANAGE_TEMPLATES ),
			],
			// 1.0.29: false when the active storage driver is
			// `url_only` — the editor reads this to hide upload
			// affordances (Crop button, image picker) and surface
			// only URL inputs in the Image / Avatar / Banner property
			// panels.
			'uploadEnabled'  => $upload_enabled,
			// Public brand kit: new signatures start from its typography.
			'brandKit'       => BrandKit::public_payload( $site_opts['brand_kit'] ),
			'brandPalette'   => $site_opts['brand_palette'],
			'canBypassLocks' => SignatureLinkConfig::can_bypass_locks( $user_id ),
		] + self::owner_context( $signature_id, $user, $owner, $site_opts );
	}

	/**
	 * The owner of `$signature_id` when the current user is editing it on
	 * their behalf ({@see OnBehalf}), else null (their own signature, a
	 * new one, or no permission — {@see EditorPage} already refused that).
	 *
	 * @since 1.3.0
	 *
	 * @param int                 $signature_id Signature (0 = new).
	 * @param SignatureRepository $repo         Signature repository.
	 *
	 * @return \WP_User|null
	 */
	public static function on_behalf_owner( int $signature_id, SignatureRepository $repo ): ?\WP_User {
		if ( $signature_id <= 0 ) {
			return null;
		}
		$owner_id = $repo->owner_of( $signature_id );
		if ( ! OnBehalf::current_user_can_edit( $owner_id ) ) {
			return null;
		}
		$owner = get_userdata( $owner_id );
		return $owner instanceof \WP_User ? $owner : null;
	}

	/**
	 * The bootstrap keys that depend on whose signature is open: the
	 * compile inputs ({@see RenderInputs}) of the signature's owner — the
	 * viewer's own, or the owner's when editing on their behalf — plus
	 * the link state, the back-arrow / profile URLs and `onBehalfOf`.
	 *
	 * @since 1.3.0
	 *
	 * @param int                  $signature_id Signature (0 = new).
	 * @param \WP_User             $viewer       Current user.
	 * @param \WP_User|null        $owner        Owner when editing on their behalf.
	 * @param array<string, mixed> $site         {@see SiteSettingsController::current_settings()}.
	 *
	 * @return array<string, mixed>
	 */
	public static function owner_context( int $signature_id, \WP_User $viewer, ?\WP_User $owner, array $site ): array {
		$subject = null !== $owner ? $owner : $viewer;
		// `wp_*` / profile / `company_*` variables (filtered through
		// `imgsig/editor/system_variables`), the footer of the first group
		// with an override, and only the campaigns active today and
		// targeted at the subject.
		$inputs = RenderInputs::for_user( $subject, $site );

		return [
			'signaturesUrl'    => null !== $owner
				? DirectoryPages::team_url()
				: esc_url_raw( admin_url( 'admin.php?page=imagina-signatures' ) ),
			'systemVariables'  => $inputs['systemVariables'],
			'complianceFooter' => $inputs['complianceFooter'],
			'bannerCampaigns'  => $inputs['bannerCampaigns'],
			// 1.3.0: profile field definitions (Variables panel) + where to edit them.
			'profileFields'    => $inputs['profileFields'],
			'profileUrl'       => null !== $owner
				? DirectoryPages::team_url( [ 'profile' => (int) $owner->ID ] )
				: DirectoryPages::profile_url(),
			// Language of the compiled output (`lang` / `dir`): the subject's.
			'signatureLocale'  => $inputs['locale'],
			// 1.3.0: whether the signature follows a template and what its
			// employee mode lets the subject change (see SignatureLinkConfig).
			'signatureLink'    => SignatureLinkConfig::for_signature( $signature_id, (int) $subject->ID ),
			'onBehalfOf'       => null === $owner ? null : [
				'userId'      => (int) $owner->ID,
				'displayName' => (string) $owner->display_name,
				'email'       => (string) $owner->user_email,
			],
		];
	}
}
