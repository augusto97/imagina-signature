<?php
/**
 * Registers wp-admin menu entries for the plugin.
 *
 * @package ImaginaSignatures\Admin
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Builds the plugin's admin menu tree.
 *
 * Menu items are conditional on capabilities and on the active mode
 * (`single` vs `multi`). The setup wizard intercepts navigation until
 * `imgsig_setup_completed` is true.
 *
 * @since 1.0.0
 */
final class AdminMenu {

	private const PARENT_SLUG = 'imagina-signatures';

	/**
	 * Hooks the menu registration into WordPress.
	 *
	 * @return void
	 */
	public function register(): void {
		add_action( 'admin_menu', [ $this, 'add_menu' ] );
	}

	/**
	 * Adds the menu entries.
	 *
	 * @return void
	 */
	public function add_menu(): void {
		// Site administrators always see the menu — even if the plugin caps
		// haven't been granted yet (e.g. a half-completed activation). The
		// per-page capability checks below still prevent unauthorized access.
		$is_admin = current_user_can( 'manage_options' )
			|| current_user_can( 'imgsig_admin' );
		if ( ! $is_admin && ! current_user_can( 'imgsig_read_own_signatures' ) ) {
			return;
		}

		// Use the most permissive available cap so the menu shows up even
		// when only `manage_options` is set on the current user.
		$dashboard_cap = current_user_can( 'imgsig_read_own_signatures' )
			? 'imgsig_read_own_signatures'
			: 'manage_options';

		add_menu_page(
			__( 'Imagina Signatures', 'imagina-signatures' ),
			__( 'Signatures', 'imagina-signatures' ),
			$dashboard_cap,
			self::PARENT_SLUG,
			[ $this, 'render_dashboard' ],
			'dashicons-email-alt',
			65
		);

		$read_cap   = current_user_can( 'imgsig_read_own_signatures' ) ? 'imgsig_read_own_signatures' : 'manage_options';
		$create_cap = current_user_can( 'imgsig_create_signatures' ) ? 'imgsig_create_signatures' : 'manage_options';
		$admin_cap  = current_user_can( 'imgsig_admin' ) ? 'imgsig_admin' : 'manage_options';

		add_submenu_page(
			self::PARENT_SLUG,
			__( 'My Signatures', 'imagina-signatures' ),
			__( 'My Signatures', 'imagina-signatures' ),
			$read_cap,
			self::PARENT_SLUG,
			[ $this, 'render_dashboard' ]
		);

		add_submenu_page(
			self::PARENT_SLUG,
			__( 'Editor', 'imagina-signatures' ),
			__( 'Editor', 'imagina-signatures' ),
			$create_cap,
			'imagina-signatures-editor',
			[ $this, 'render_editor' ]
		);

		add_submenu_page(
			self::PARENT_SLUG,
			__( 'Templates', 'imagina-signatures' ),
			__( 'Templates', 'imagina-signatures' ),
			$read_cap,
			'imagina-signatures-templates',
			[ $this, 'render_templates' ]
		);

		if ( $is_admin ) {
			$plans_cap    = current_user_can( 'imgsig_manage_plans' ) ? 'imgsig_manage_plans' : 'manage_options';
			$users_cap    = current_user_can( 'imgsig_manage_users' ) ? 'imgsig_manage_users' : 'manage_options';
			$storage_cap  = current_user_can( 'imgsig_manage_storage' ) ? 'imgsig_manage_storage' : 'manage_options';

			add_submenu_page(
				self::PARENT_SLUG,
				__( 'Plans', 'imagina-signatures' ),
				__( 'Plans', 'imagina-signatures' ),
				$plans_cap,
				'imagina-signatures-plans',
				[ $this, 'render_plans' ]
			);

			add_submenu_page(
				self::PARENT_SLUG,
				__( 'Users', 'imagina-signatures' ),
				__( 'Users', 'imagina-signatures' ),
				$users_cap,
				'imagina-signatures-users',
				[ $this, 'render_users' ]
			);

			add_submenu_page(
				self::PARENT_SLUG,
				__( 'Storage', 'imagina-signatures' ),
				__( 'Storage', 'imagina-signatures' ),
				$storage_cap,
				'imagina-signatures-storage',
				[ $this, 'render_storage' ]
			);

			add_submenu_page(
				self::PARENT_SLUG,
				__( 'Settings', 'imagina-signatures' ),
				__( 'Settings', 'imagina-signatures' ),
				$admin_cap,
				'imagina-signatures-settings',
				[ $this, 'render_settings' ]
			);
		}

		// Setup wizard: visible submenu while setup isn't completed, hidden
		// once it has been (so the menu doesn't carry stale items).
		$setup_completed = (bool) get_option( 'imgsig_setup_completed', false );
		if ( current_user_can( 'imgsig_admin' ) ) {
			if ( $setup_completed ) {
				add_submenu_page(
					'options.php',
					__( 'Setup Imagina Signatures', 'imagina-signatures' ),
					__( 'Setup', 'imagina-signatures' ),
					'imgsig_admin',
					'imagina-signatures-setup',
					[ $this, 'render_setup' ]
				);
			} else {
				add_submenu_page(
					self::PARENT_SLUG,
					__( 'Setup Imagina Signatures', 'imagina-signatures' ),
					'<span style="color:#f59e0b;">' . esc_html__( 'Setup', 'imagina-signatures' ) . '</span>',
					'imgsig_admin',
					'imagina-signatures-setup',
					[ $this, 'render_setup' ]
				);
			}
		}
	}

	public function render_dashboard(): void {
		$this->render_app_root( 'dashboard' );
	}
	public function render_editor(): void {
		$this->render_app_root( 'editor' );
	}
	public function render_templates(): void {
		$this->render_app_root( 'templates' );
	}
	public function render_plans(): void {
		$this->render_app_root( 'plans' );
	}
	public function render_users(): void {
		$this->render_app_root( 'users' );
	}
	public function render_storage(): void {
		$this->render_app_root( 'storage' );
	}
	public function render_settings(): void {
		$this->render_app_root( 'settings' );
	}
	public function render_setup(): void {
		// Render the SPA mount point AND a no-JS fallback form. The SPA
		// (admin.js) takes over and hides the fallback. If the SPA fails to
		// load — bundle missing, JS errors, security plugin blocking the
		// asset — the fallback form remains usable so the user can still
		// finish setup.
		echo '<div class="imagina-signatures-app" data-route="setup"></div>';
		$this->render_setup_fallback();
	}

	/**
	 * Renders an HTML-only setup form. The SPA hides it with inline CSS once
	 * it boots; if the SPA never boots, the user can still complete setup.
	 *
	 * @return void
	 */
	private function render_setup_fallback(): void {
		$current_mode   = (string) get_option( 'imgsig_mode', 'single' );
		$current_driver = (string) get_option( 'imgsig_storage_driver', 'media_library' );
		?>
		<noscript>
			<style>.imagina-signatures-app { display: none; }</style>
		</noscript>
		<div class="is-fallback-setup" style="max-width:560px;margin:24px auto;padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;">
			<h2 style="margin-top:0;"><?php esc_html_e( 'Quick setup (no-JS fallback)', 'imagina-signatures' ); ?></h2>
			<p style="color:#64748b;">
				<?php esc_html_e( 'If the visual wizard above does not load, use this form to complete setup.', 'imagina-signatures' ); ?>
			</p>
			<form method="post" action="<?php echo esc_url( \ImaginaSignatures\Admin\SetupFallback::action_url() ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( \ImaginaSignatures\Admin\SetupFallback::ACTION ); ?>" />
				<input type="hidden" name="_wpnonce" value="<?php echo esc_attr( \ImaginaSignatures\Admin\SetupFallback::nonce() ); ?>" />

				<fieldset style="margin:16px 0;">
					<legend style="font-weight:600;"><?php esc_html_e( 'Operating mode', 'imagina-signatures' ); ?></legend>
					<label style="display:block;margin:6px 0;">
						<input type="radio" name="mode" value="single" <?php checked( $current_mode, 'single' ); ?> />
						<?php esc_html_e( 'Single user (just me)', 'imagina-signatures' ); ?>
					</label>
					<label style="display:block;margin:6px 0;">
						<input type="radio" name="mode" value="multi" <?php checked( $current_mode, 'multi' ); ?> />
						<?php esc_html_e( 'Multi user (with plans and quotas)', 'imagina-signatures' ); ?>
					</label>
				</fieldset>

				<fieldset style="margin:16px 0;">
					<legend style="font-weight:600;"><?php esc_html_e( 'Storage driver', 'imagina-signatures' ); ?></legend>
					<label style="display:block;margin:6px 0;">
						<input type="radio" name="storage_driver" value="media_library" <?php checked( $current_driver, 'media_library' ); ?> />
						<?php esc_html_e( 'WordPress Media Library (recommended)', 'imagina-signatures' ); ?>
					</label>
					<label style="display:block;margin:6px 0;">
						<input type="radio" name="storage_driver" value="s3" <?php checked( $current_driver, 's3' ); ?> />
						<?php esc_html_e( 'S3-compatible (configure later in Storage Settings)', 'imagina-signatures' ); ?>
					</label>
				</fieldset>

				<button type="submit" class="button button-primary">
					<?php esc_html_e( 'Finish setup', 'imagina-signatures' ); ?>
				</button>
			</form>
		</div>
		<script>
			// Hide this fallback once the SPA mounts. The SPA replaces the
			// .imagina-signatures-app contents, so we wait a moment and
			// check whether anything was injected.
			setTimeout(function() {
				var app = document.querySelector('.imagina-signatures-app');
				if (app && app.innerHTML.trim().length > 0) {
					var fb = document.querySelector('.is-fallback-setup');
					if (fb) fb.style.display = 'none';
				}
			}, 800);
		</script>
		<?php
	}

	/**
	 * Renders the SPA mount point.
	 *
	 * The actual UI is bundled by Vite and enqueued in `AssetEnqueuer`.
	 *
	 * @param string $route Logical route name.
	 *
	 * @return void
	 */
	private function render_app_root( string $route ): void {
		echo '<div class="imagina-signatures-app" data-route="' . esc_attr( $route ) . '"></div>';
	}
}
