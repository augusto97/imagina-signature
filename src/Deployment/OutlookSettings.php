<?php
/**
 * Microsoft 365 / Outlook add-in settings.
 *
 * @package ImaginaSignatures\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment;

defined( 'ABSPATH' ) || exit;

/**
 * The `imgsig_outlook` option: everything the Outlook add-in
 * integration needs, in one non-autoloaded row.
 *
 *  - `enabled`                  master switch. Off → the public add-in
 *                               routes answer 404.
 *  - `deploy_key`               64 hex chars (32 random bytes). Embedded
 *                               in the manifest's runtime URLs and sent by
 *                               the add-in as `X-Imgsig-Deploy-Key`.
 *                               Regenerating it invalidates every manifest
 *                               generated before.
 *  - `replace_client_signature` when true the add-in also calls
 *                               `disableClientSignatureAsync()` so the
 *                               user's own Outlook signature doesn't stack
 *                               on top of the company one.
 *  - `add_in_id`                the manifest `<Id>` (GUID v4). Generated
 *                               once and never changed, so re-uploading
 *                               a manifest updates the same add-in in the
 *                               Microsoft 365 admin center.
 *  - `revision`                 bumped on every key regeneration; the
 *                               4th part of the manifest `<Version>`
 *                               (Microsoft only accepts an updated
 *                               manifest with a higher version).
 *
 * Every read goes through {@see sanitize()}, so a corrupt or partial row
 * can't produce an empty key: a missing key / id is generated and
 * persisted on first read.
 *
 * @since 1.3.0
 */
final class OutlookSettings {

	public const OPTION = 'imgsig_outlook';

	/** 32 random bytes, lower-case hex. */
	public const KEY_PATTERN = '/^[a-f0-9]{64}$/';

	/** Lower-case GUID v4. */
	public const ID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';

	/** Highest revision (the manifest version part is capped at 65535). */
	private const MAX_REVISION = 65535;

	/**
	 * Stored shape with neutral values (key / id filled in by sanitize()).
	 *
	 * @since 1.3.0
	 *
	 * @return array{enabled: bool, deploy_key: string, replace_client_signature: bool, add_in_id: string, revision: int}
	 */
	public static function defaults(): array {
		return [
			'enabled'                  => false,
			'deploy_key'               => '',
			'replace_client_signature' => false,
			'add_in_id'                => '',
			'revision'                 => 1,
		];
	}

	/**
	 * Normalises a stored (or corrupted) value into the exact stored
	 * shape. Unknown keys are dropped; an invalid key / id is replaced by
	 * a freshly generated one.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $raw Option value.
	 *
	 * @return array{enabled: bool, deploy_key: string, replace_client_signature: bool, add_in_id: string, revision: int}
	 */
	public static function sanitize( $raw ): array {
		$raw = is_array( $raw ) ? $raw : [];
		$out = self::defaults();

		$out['enabled']                  = ! empty( $raw['enabled'] );
		$out['replace_client_signature'] = ! empty( $raw['replace_client_signature'] );

		$key               = isset( $raw['deploy_key'] ) && is_string( $raw['deploy_key'] ) ? strtolower( trim( $raw['deploy_key'] ) ) : '';
		$out['deploy_key'] = 1 === preg_match( self::KEY_PATTERN, $key ) ? $key : self::generate_key();

		$id               = isset( $raw['add_in_id'] ) && is_string( $raw['add_in_id'] ) ? strtolower( trim( $raw['add_in_id'] ) ) : '';
		$out['add_in_id'] = 1 === preg_match( self::ID_PATTERN, $id ) ? $id : self::generate_guid();

		$revision        = isset( $raw['revision'] ) && is_numeric( $raw['revision'] ) ? (int) $raw['revision'] : 1;
		$out['revision'] = max( 1, min( self::MAX_REVISION, $revision ) );

		return $out;
	}

	/**
	 * Current settings. Persists the generated key / id the first time
	 * (or after corruption), so every later read returns the same ones.
	 *
	 * @since 1.3.0
	 *
	 * @return array{enabled: bool, deploy_key: string, replace_client_signature: bool, add_in_id: string, revision: int}
	 */
	public static function get(): array {
		$raw      = get_option( self::OPTION, [] );
		$settings = self::sanitize( $raw );
		if ( ! is_array( $raw ) || $raw !== $settings ) {
			update_option( self::OPTION, $settings, false );
		}
		return $settings;
	}

	/**
	 * Applies the admin-editable fields of `$patch` (`enabled`,
	 * `replace_client_signature`). The key, id and revision can't be set
	 * from input: they change only through {@see regenerate_key()}.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $patch Untrusted input.
	 *
	 * @return array{enabled: bool, deploy_key: string, replace_client_signature: bool, add_in_id: string, revision: int}
	 */
	public static function update( array $patch ): array {
		$settings = self::get();
		foreach ( [ 'enabled', 'replace_client_signature' ] as $field ) {
			if ( array_key_exists( $field, $patch ) ) {
				$settings[ $field ] = self::to_bool( $patch[ $field ] );
			}
		}
		update_option( self::OPTION, $settings, false );
		return $settings;
	}

	/**
	 * Replaces the deployment key (and bumps the manifest revision).
	 * Every manifest generated before stops working: the admin must
	 * upload the new one.
	 *
	 * @since 1.3.0
	 *
	 * @return array{enabled: bool, deploy_key: string, replace_client_signature: bool, add_in_id: string, revision: int}
	 */
	public static function regenerate_key(): array {
		$settings               = self::get();
		$previous               = $settings['deploy_key'];
		$settings['deploy_key'] = self::generate_key();
		// Astronomically unlikely, but never hand back the old key.
		while ( hash_equals( $previous, $settings['deploy_key'] ) ) {
			$settings['deploy_key'] = self::generate_key();
		}
		$settings['revision'] = min( self::MAX_REVISION, $settings['revision'] + 1 );
		update_option( self::OPTION, $settings, false );

		/**
		 * Fires after the Outlook deployment key is regenerated.
		 *
		 * @since 1.3.0
		 *
		 * @param int $revision New manifest revision.
		 */
		do_action( 'imgsig/outlook/key_regenerated', $settings['revision'] );

		return $settings;
	}

	/**
	 * Constant-time comparison of a presented key with the stored one.
	 * An empty / malformed presented key never matches.
	 *
	 * @since 1.3.0
	 *
	 * @param string                    $presented Key sent by the client.
	 * @param array<string, mixed>|null $settings  Settings (null reads the stored ones).
	 *
	 * @return bool
	 */
	public static function verify_key( string $presented, ?array $settings = null ): bool {
		$settings  = $settings ?? self::get();
		$expected  = (string) ( $settings['deploy_key'] ?? '' );
		$presented = strtolower( trim( $presented ) );
		if ( '' === $expected || 1 !== preg_match( self::KEY_PATTERN, $presented ) ) {
			return false;
		}
		return hash_equals( $expected, $presented );
	}

	/**
	 * A new deployment key: 32 bytes from the CSPRNG, hex-encoded.
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public static function generate_key(): string {
		return bin2hex( random_bytes( 32 ) );
	}

	/**
	 * A random GUID v4 (lower case).
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public static function generate_guid(): string {
		$bytes    = random_bytes( 16 );
		$bytes[6] = chr( ( ord( $bytes[6] ) & 0x0f ) | 0x40 );
		$bytes[8] = chr( ( ord( $bytes[8] ) & 0x3f ) | 0x80 );
		return vsprintf( '%s%s-%s-%s-%s-%s%s%s', str_split( bin2hex( $bytes ), 4 ) );
	}

	/**
	 * Loose boolean parsing for REST input (`true`, `1`, `"yes"`, `"on"`).
	 *
	 * @param mixed $value Input.
	 *
	 * @return bool
	 */
	private static function to_bool( $value ): bool {
		if ( is_bool( $value ) ) {
			return $value;
		}
		if ( is_string( $value ) ) {
			return in_array( strtolower( trim( $value ) ), [ '1', 'true', 'yes', 'on' ], true );
		}
		return is_numeric( $value ) && 0 !== (int) $value;
	}
}
