<?php
/**
 * Storage settings admin page.
 *
 * @package ImaginaSignatures\Admin\Pages
 */

declare(strict_types=1);

namespace ImaginaSignatures\Admin\Pages;

use ImaginaSignatures\Admin\AdminMenu;
use ImaginaSignatures\Exceptions\StorageException;
use ImaginaSignatures\Setup\CapabilitiesInstaller;
use ImaginaSignatures\Storage\Drivers\MediaLibraryDriver;
use ImaginaSignatures\Storage\Drivers\S3Driver;
use ImaginaSignatures\Storage\Dto\TestResult;
use ImaginaSignatures\Storage\S3\ProviderPresets;
use ImaginaSignatures\Storage\StorageManager;

defined( 'ABSPATH' ) || exit;

/**
 * Server-rendered settings page for storage configuration.
 *
 * Two `admin-post.php` handlers back the form:
 *
 *  - `imgsig_save_storage` — encrypts and persists the configuration.
 *  - `imgsig_test_storage` — probes a draft configuration and stashes
 *                            the result in a per-user transient so the
 *                            next page render can show it.
 *
 * Secrets handling: `secret_key` always renders as an empty input. On
 * save, an empty value is interpreted as "keep the existing secret"
 * — so editing other fields without re-entering the secret doesn't
 * wipe it. A "(stored)" indicator next to the field tells the admin
 * a secret is on file.
 *
 * The Sprint 4 React admin app may replace this page with a richer
 * UI; until then, this is the source of truth for storage config.
 *
 * @since 1.0.0
 */
final class SettingsPage {

	private const ACTION_SAVE = 'imgsig_save_storage';
	private const ACTION_TEST = 'imgsig_test_storage';
	private const NONCE_NAME  = 'imgsig_storage_nonce';

	/**
	 * Transient key prefix for the last test result, keyed by user ID.
	 */
	private const TEST_TRANSIENT_PREFIX = 'imgsig_storage_test_';

	/**
	 * Transient key prefix for flash notices (save success/failure).
	 */
	private const FLASH_TRANSIENT_PREFIX = 'imgsig_storage_flash_';

	/**
	 * @var StorageManager
	 */
	private StorageManager $manager;

	/**
	 * @param StorageManager $manager Storage manager with the active driver.
	 */
	public function __construct( StorageManager $manager ) {
		$this->manager = $manager;
	}

	/**
	 * Registers the admin-post handlers.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function register_handlers(): void {
		add_action( 'admin_post_' . self::ACTION_SAVE, [ $this, 'handle_save' ] );
		add_action( 'admin_post_' . self::ACTION_TEST, [ $this, 'handle_test' ] );
	}

	/**
	 * Renders the page body.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function render(): void {
		if ( ! current_user_can( CapabilitiesInstaller::CAP_MANAGE_STORAGE ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'imagina-signatures' ) );
		}

		$user_id        = get_current_user_id();
		$current_driver = $this->manager->active_driver_id();
		$config         = $this->manager->read_active_config();
		$flash          = $this->consume_flash( $user_id );
		$test_result    = $this->consume_test_result( $user_id );

		$has_secret = isset( $config['secret_key'] ) && '' !== (string) $config['secret_key'];

		echo '<div class="wrap">';
		echo '<h1>' . esc_html__( 'Storage Settings', 'imagina-signatures' ) . '</h1>';

		if ( null !== $flash ) {
			$class = 'success' === $flash['type'] ? 'notice-success' : 'notice-error';
			printf(
				'<div class="notice %1$s is-dismissible"><p>%2$s</p></div>',
				esc_attr( $class ),
				esc_html( $flash['message'] )
			);
		}

		if ( null !== $test_result ) {
			$class = $test_result->success ? 'notice-success' : 'notice-error';
			printf(
				'<div class="notice %1$s is-dismissible"><p><strong>%2$s</strong> %3$s</p></div>',
				esc_attr( $class ),
				esc_html__( 'Connection test:', 'imagina-signatures' ),
				esc_html( $test_result->message )
			);
		}

		$action_url = admin_url( 'admin-post.php' );

		echo '<form method="post" action="' . esc_url( $action_url ) . '" id="imgsig-storage-form">';
		wp_nonce_field( self::ACTION_SAVE, self::NONCE_NAME );
		echo '<input type="hidden" name="action" value="' . esc_attr( self::ACTION_SAVE ) . '">';

		$this->render_driver_select( $current_driver );

		echo '<div id="imgsig-s3-fields" class="imgsig-driver-fields"' . ( S3Driver::ID === $current_driver ? '' : ' hidden' ) . '>';
		$this->render_s3_fields( $config, $has_secret );
		echo '</div>';

		echo '<p class="submit">';
		submit_button(
			__( 'Save Settings', 'imagina-signatures' ),
			'primary',
			'submit_save',
			false
		);
		echo ' ';
		submit_button(
			__( 'Test Connection', 'imagina-signatures' ),
			'secondary',
			'submit_test',
			false,
			[ 'formaction' => esc_url( $action_url . '?test=1' ) ]
		);
		echo '</p>';

		echo '</form>';

		// Tiny vanilla JS (no jQuery) to toggle field visibility.
		$this->render_inline_script();

		echo '</div>'; // .wrap
	}

	/**
	 * Renders the driver-selection field.
	 *
	 * @since 1.0.0
	 *
	 * @param string $current The currently-selected driver ID.
	 *
	 * @return void
	 */
	private function render_driver_select( string $current ): void {
		echo '<table class="form-table" role="presentation"><tbody>';
		echo '<tr>';
		echo '<th scope="row"><label for="imgsig-driver">' . esc_html__( 'Storage Backend', 'imagina-signatures' ) . '</label></th>';
		echo '<td>';
		echo '<select name="driver" id="imgsig-driver">';

		$labels = [
			MediaLibraryDriver::ID => __( 'WordPress Media Library (default)', 'imagina-signatures' ),
			S3Driver::ID           => __( 'S3-compatible (R2, Bunny, S3, B2, Spaces, Wasabi, custom)', 'imagina-signatures' ),
		];

		foreach ( $this->manager->available_driver_ids() as $id ) {
			$label = $labels[ $id ] ?? $id;
			printf(
				'<option value="%1$s" %2$s>%3$s</option>',
				esc_attr( $id ),
				selected( $id, $current, false ),
				esc_html( $label )
			);
		}

		echo '</select>';
		echo '<p class="description">' . esc_html__( 'Media Library works on every host with no configuration. Pick S3-compatible to point at an external bucket.', 'imagina-signatures' ) . '</p>';
		echo '</td>';
		echo '</tr>';
		echo '</tbody></table>';
	}

	/**
	 * Renders the S3 fieldset.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $config     Decrypted current config.
	 * @param bool                 $has_secret Whether a secret is already stored.
	 *
	 * @return void
	 */
	private function render_s3_fields( array $config, bool $has_secret ): void {
		$provider        = (string) ( $config['provider'] ?? 'cloudflare_r2' );
		$bucket          = (string) ( $config['bucket'] ?? '' );
		$region          = (string) ( $config['region'] ?? '' );
		$access_key      = (string) ( $config['access_key'] ?? '' );
		$account_id      = (string) ( $config['account_id'] ?? '' );
		$custom_endpoint = (string) ( $config['custom_endpoint'] ?? '' );
		$public_url_base = (string) ( $config['public_url_base'] ?? '' );

		echo '<h2>' . esc_html__( 'S3-Compatible Configuration', 'imagina-signatures' ) . '</h2>';
		echo '<table class="form-table" role="presentation"><tbody>';

		// Provider preset.
		echo '<tr>';
		echo '<th scope="row"><label for="imgsig-provider">' . esc_html__( 'Provider', 'imagina-signatures' ) . '</label></th>';
		echo '<td><select name="provider" id="imgsig-provider">';
		foreach ( ProviderPresets::PRESETS as $id => $preset ) {
			printf(
				'<option value="%1$s" %2$s>%3$s</option>',
				esc_attr( (string) $id ),
				selected( (string) $id, $provider, false ),
				esc_html( (string) $preset['name'] )
			);
		}
		echo '</select></td>';
		echo '</tr>';

		// Bucket.
		$this->render_text_input(
			'imgsig-bucket',
			'bucket',
			__( 'Bucket', 'imagina-signatures' ),
			$bucket,
			__( 'The bucket / container that will hold uploaded assets.', 'imagina-signatures' )
		);

		// Region (most providers).
		echo '<tr class="imgsig-field" data-providers="bunny,s3,b2,do_spaces,wasabi,custom">';
		echo '<th scope="row"><label for="imgsig-region">' . esc_html__( 'Region', 'imagina-signatures' ) . '</label></th>';
		echo '<td><input type="text" id="imgsig-region" name="region" value="' . esc_attr( $region ) . '" class="regular-text" autocomplete="off">';
		echo '<p class="description">' . esc_html__( 'Region or zone code. Cloudflare R2 ignores this (always "auto").', 'imagina-signatures' ) . '</p>';
		echo '</td></tr>';

		// Account ID (R2 only).
		echo '<tr class="imgsig-field" data-providers="cloudflare_r2">';
		echo '<th scope="row"><label for="imgsig-account-id">' . esc_html__( 'Account ID', 'imagina-signatures' ) . '</label></th>';
		echo '<td><input type="text" id="imgsig-account-id" name="account_id" value="' . esc_attr( $account_id ) . '" class="regular-text" autocomplete="off">';
		echo '<p class="description">' . esc_html__( 'Cloudflare account ID (used to build the R2 endpoint URL).', 'imagina-signatures' ) . '</p>';
		echo '</td></tr>';

		// Custom endpoint (custom only).
		echo '<tr class="imgsig-field" data-providers="custom">';
		echo '<th scope="row"><label for="imgsig-custom-endpoint">' . esc_html__( 'Custom Endpoint URL', 'imagina-signatures' ) . '</label></th>';
		echo '<td><input type="url" id="imgsig-custom-endpoint" name="custom_endpoint" value="' . esc_attr( $custom_endpoint ) . '" class="regular-text" autocomplete="off">';
		echo '<p class="description">' . esc_html__( 'Full S3-compatible endpoint URL (https://...). Used for self-hosted or unlisted providers.', 'imagina-signatures' ) . '</p>';
		echo '</td></tr>';

		// Access key.
		$this->render_text_input(
			'imgsig-access-key',
			'access_key',
			__( 'Access Key', 'imagina-signatures' ),
			$access_key,
			__( 'Public part of the credential pair.', 'imagina-signatures' )
		);

		// Secret key — never echoed back.
		echo '<tr>';
		echo '<th scope="row"><label for="imgsig-secret-key">' . esc_html__( 'Secret Key', 'imagina-signatures' ) . '</label></th>';
		echo '<td><input type="password" id="imgsig-secret-key" name="secret_key" value="" class="regular-text" autocomplete="new-password">';
		if ( $has_secret ) {
			echo '<p class="description">' . esc_html__( 'A secret is stored. Leave blank to keep it; type a new value to replace it.', 'imagina-signatures' ) . '</p>';
		} else {
			echo '<p class="description">' . esc_html__( 'Private part of the credential pair.', 'imagina-signatures' ) . '</p>';
		}
		echo '</td></tr>';

		// Public URL base (optional CDN).
		$this->render_text_input(
			'imgsig-public-url-base',
			'public_url_base',
			__( 'Public URL Base (optional)', 'imagina-signatures' ),
			$public_url_base,
			__( 'CDN or custom-domain prefix that fronts the bucket. Leave blank to use the endpoint directly.', 'imagina-signatures' )
		);

		echo '</tbody></table>';
	}

	/**
	 * Renders a generic text input row.
	 *
	 * @since 1.0.0
	 *
	 * @param string $id          Input ID.
	 * @param string $name        Input name (form param).
	 * @param string $label       Field label.
	 * @param string $value       Current value.
	 * @param string $description Help text.
	 *
	 * @return void
	 */
	private function render_text_input( string $id, string $name, string $label, string $value, string $description ): void {
		echo '<tr>';
		echo '<th scope="row"><label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label></th>';
		echo '<td>';
		echo '<input type="text" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $value ) . '" class="regular-text" autocomplete="off">';
		echo '<p class="description">' . esc_html( $description ) . '</p>';
		echo '</td></tr>';
	}

	/**
	 * Inline JS to toggle field visibility based on driver / provider.
	 *
	 * Intentionally vanilla (no jQuery) and dependency-free, embedded
	 * directly in the page so we don't ship an additional file just for
	 * a few lines of UX.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	private function render_inline_script(): void {
		?>
		<script>
		(function () {
			var driverSelect = document.getElementById('imgsig-driver');
			var providerSelect = document.getElementById('imgsig-provider');
			var s3Fields = document.getElementById('imgsig-s3-fields');
			if (!driverSelect || !s3Fields) { return; }

			function toggle() {
				var isS3 = driverSelect.value === 's3';
				s3Fields.hidden = !isS3;
				if (!isS3 || !providerSelect) { return; }

				var current = providerSelect.value;
				var rows = s3Fields.querySelectorAll('.imgsig-field');
				rows.forEach(function (row) {
					var providers = (row.getAttribute('data-providers') || '').split(',');
					row.hidden = providers.indexOf(current) === -1;
				});
			}

			driverSelect.addEventListener('change', toggle);
			if (providerSelect) { providerSelect.addEventListener('change', toggle); }
			toggle();
		})();
		</script>
		<?php
	}

	/**
	 * Handles the save action posted from the form.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function handle_save(): void {
		$this->guard_post_request( self::ACTION_SAVE );

		// "Test Connection" button posts to the same handler with ?test=1.
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( isset( $_GET['test'] ) ) {
			$this->handle_test();
			return;
		}

		$user_id    = get_current_user_id();
		$driver_id  = $this->read_param( 'driver', MediaLibraryDriver::ID );
		$new_config = [];

		if ( S3Driver::ID === $driver_id ) {
			$new_config = $this->collect_s3_config();
		}

		try {
			$this->manager->save_config( $driver_id, $new_config );
		} catch ( StorageException $e ) {
			$this->set_flash( $user_id, 'error', $e->getMessage() );
			$this->redirect_back();
			return;
		}

		$this->set_flash(
			$user_id,
			'success',
			__( 'Storage settings saved.', 'imagina-signatures' )
		);
		$this->redirect_back();
	}

	/**
	 * Handles the test action.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	public function handle_test(): void {
		$this->guard_post_request( self::ACTION_SAVE );

		$user_id   = get_current_user_id();
		$driver_id = $this->read_param( 'driver', MediaLibraryDriver::ID );
		$config    = S3Driver::ID === $driver_id ? $this->collect_s3_config() : [];

		$result = $this->manager->test_config( $driver_id, $config );

		set_transient(
			self::TEST_TRANSIENT_PREFIX . $user_id,
			$result->to_array(),
			MINUTE_IN_SECONDS
		);

		$this->redirect_back();
	}

	/**
	 * Reads, sanitises, and assembles the S3 configuration from the POST.
	 *
	 * Empty `secret_key` falls back to the previously-stored secret so
	 * editing other fields doesn't wipe credentials.
	 *
	 * @since 1.0.0
	 *
	 * @return array<string, string>
	 */
	private function collect_s3_config(): array {
		$current = $this->manager->read_active_config();

		$provider = $this->read_param( 'provider', '' );
		if ( ! ProviderPresets::exists( $provider ) ) {
			$provider = 'cloudflare_r2';
		}

		$bucket          = $this->read_param( 'bucket', '' );
		$region          = $this->read_param( 'region', '' );
		$access_key      = $this->read_param( 'access_key', '' );
		$account_id      = $this->read_param( 'account_id', '' );
		$custom_endpoint = $this->read_url_param( 'custom_endpoint' );
		$public_url_base = $this->read_url_param( 'public_url_base' );

		// Secret: empty value means "keep existing".
		// Nonce was already verified in guard_post_request() before this method runs.
		// phpcs:disable WordPress.Security.NonceVerification.Missing
		$incoming_secret = isset( $_POST['secret_key'] )
			? sanitize_text_field( wp_unslash( $_POST['secret_key'] ) )
			: '';
		// phpcs:enable WordPress.Security.NonceVerification.Missing
		$secret_key      = '' !== $incoming_secret
			? $incoming_secret
			: (string) ( $current['secret_key'] ?? '' );

		// R2 has a fixed region; users can leave the field blank.
		$fixed_region = ProviderPresets::fixed_region( $provider );
		if ( null !== $fixed_region ) {
			$region = $fixed_region;
		}

		return array_filter(
			[
				'provider'        => $provider,
				'bucket'          => $bucket,
				'region'          => $region,
				'access_key'      => $access_key,
				'secret_key'      => $secret_key,
				'account_id'      => $account_id,
				'custom_endpoint' => $custom_endpoint,
				'public_url_base' => $public_url_base,
			],
			static function ( string $value ): bool {
				return '' !== $value;
			}
		);
	}

	/**
	 * Reads a sanitised text param from $_POST.
	 *
	 * @since 1.0.0
	 *
	 * @param string $name    Param name.
	 * @param string $default Fallback value.
	 *
	 * @return string
	 */
	private function read_param( string $name, string $default ): string {
		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		if ( ! isset( $_POST[ $name ] ) ) {
			return $default;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		return sanitize_text_field( wp_unslash( (string) $_POST[ $name ] ) );
	}

	/**
	 * Reads a sanitised URL param from $_POST.
	 *
	 * @since 1.0.0
	 *
	 * @param string $name Param name.
	 *
	 * @return string
	 */
	private function read_url_param( string $name ): string {
		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		if ( ! isset( $_POST[ $name ] ) ) {
			return '';
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		return esc_url_raw( wp_unslash( (string) $_POST[ $name ] ) );
	}

	/**
	 * Verifies nonce + capability for both POST handlers; aborts on failure.
	 *
	 * @since 1.0.0
	 *
	 * @param string $nonce_action Nonce action name.
	 *
	 * @return void
	 */
	private function guard_post_request( string $nonce_action ): void {
		if ( ! current_user_can( CapabilitiesInstaller::CAP_MANAGE_STORAGE ) ) {
			wp_die( esc_html__( 'You do not have permission to perform this action.', 'imagina-signatures' ) );
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		$nonce = isset( $_POST[ self::NONCE_NAME ] )
			? sanitize_text_field( wp_unslash( $_POST[ self::NONCE_NAME ] ) )
			: '';
		if ( ! wp_verify_nonce( $nonce, $nonce_action ) ) {
			wp_die( esc_html__( 'Security check failed.', 'imagina-signatures' ) );
		}
	}

	/**
	 * Stashes a flash message for the next page render.
	 *
	 * @since 1.0.0
	 *
	 * @param int    $user_id User ID.
	 * @param string $type    `success` or `error`.
	 * @param string $message Localized message.
	 *
	 * @return void
	 */
	private function set_flash( int $user_id, string $type, string $message ): void {
		set_transient(
			self::FLASH_TRANSIENT_PREFIX . $user_id,
			[
				'type'    => $type,
				'message' => $message,
			],
			MINUTE_IN_SECONDS
		);
	}

	/**
	 * Reads and deletes the pending flash message for this user, if any.
	 *
	 * @since 1.0.0
	 *
	 * @param int $user_id User ID.
	 *
	 * @return array{type: string, message: string}|null
	 */
	private function consume_flash( int $user_id ): ?array {
		$key   = self::FLASH_TRANSIENT_PREFIX . $user_id;
		$flash = get_transient( $key );
		if ( false === $flash ) {
			return null;
		}
		delete_transient( $key );

		if ( ! is_array( $flash ) || ! isset( $flash['type'], $flash['message'] ) ) {
			return null;
		}

		return [
			'type'    => (string) $flash['type'],
			'message' => (string) $flash['message'],
		];
	}

	/**
	 * Reads and deletes the pending test result transient.
	 *
	 * @since 1.0.0
	 *
	 * @param int $user_id User ID.
	 *
	 * @return TestResult|null
	 */
	private function consume_test_result( int $user_id ): ?TestResult {
		$key  = self::TEST_TRANSIENT_PREFIX . $user_id;
		$data = get_transient( $key );
		if ( false === $data ) {
			return null;
		}
		delete_transient( $key );

		if ( ! is_array( $data ) || ! isset( $data['success'], $data['message'] ) ) {
			return null;
		}

		return new TestResult(
			(bool) $data['success'],
			(string) $data['message'],
			isset( $data['details'] ) && is_array( $data['details'] ) ? $data['details'] : []
		);
	}

	/**
	 * Redirects back to the settings page after a save / test.
	 *
	 * @since 1.0.0
	 *
	 * @return void
	 */
	private function redirect_back(): void {
		wp_safe_redirect(
			add_query_arg(
				[ 'page' => AdminMenu::SETTINGS_SLUG ],
				admin_url( 'admin.php' )
			)
		);
		exit;
	}
}
