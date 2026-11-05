<?php
/**
 * Employee profile fields: definitions, mapping, storage, resolution.
 *
 * @package ImaginaSignatures\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Directory;

defined( 'ABSPATH' ) || exit;

/**
 * The per-user data a signature pulls in as `{{job_title}}`,
 * `{{phone}}`, … — everything about an employee that is not in the
 * WordPress user record itself.
 *
 * Fields:
 *  - ten canonical keys ({@see CANONICAL}) — the same keys the shipped
 *    templates use as signature variables;
 *  - up to {@see MAX_CUSTOM} admin-defined custom fields (key + label +
 *    type), stored in the `imgsig_profile_fields` option.
 *
 * Every field has a source, chosen by the administrator in Settings →
 * Profile fields:
 *  - `plugin` (default) — the value lives in the `imgsig_profile` user
 *    meta (one array per user) and is edited on the WP profile screen,
 *    the "My profile" page or by CSV import;
 *  - `meta` — read from an existing user meta key owned by something
 *    else (an ACF field, WooCommerce `billing_phone`, an HR sync…) or
 *    one of the WP_User columns in {@see USER_FIELDS}. Such fields are
 *    read-only inside the plugin.
 *
 * {@see values_for()} applies the mapping and is the one resolver every
 * consumer (editor system variables, team console, deployment) calls.
 *
 * @since 1.3.0
 */
final class ProfileFields {

	/** User meta holding the plugin-stored values (array key => string). */
	public const META_KEY = 'imgsig_profile';

	/** Option holding the mapping + custom field definitions. */
	public const OPTION = 'imgsig_profile_fields';

	public const MAX_CUSTOM = 10;

	public const TYPE_TEXT  = 'text';
	public const TYPE_PHONE = 'phone';
	public const TYPE_URL   = 'url';
	public const TYPE_EMAIL = 'email';

	public const TYPES = [ self::TYPE_TEXT, self::TYPE_PHONE, self::TYPE_URL, self::TYPE_EMAIL ];

	public const SOURCE_PLUGIN = 'plugin';
	public const SOURCE_META   = 'meta';

	/**
	 * Canonical profile keys => value type, in display order. Keep in
	 * sync with `assets/shared/profileFields.ts` (PROFILE_KEYS).
	 */
	public const CANONICAL = [
		'job_title'    => self::TYPE_TEXT,
		'department'   => self::TYPE_TEXT,
		'phone'        => self::TYPE_PHONE,
		'mobile'       => self::TYPE_PHONE,
		'photo_url'    => self::TYPE_URL,
		'linkedin_url' => self::TYPE_URL,
		'calendar_url' => self::TYPE_URL,
		'website_url'  => self::TYPE_URL,
		'address_line' => self::TYPE_TEXT,
		'pronouns'     => self::TYPE_TEXT,
	];

	/**
	 * WP_User columns that can be picked as a source like a meta key
	 * (they live in `wp_users`, not `wp_usermeta`).
	 */
	public const USER_FIELDS = [ 'user_url', 'user_email', 'display_name' ];

	/**
	 * Meta keys that may never be used as a source: credentials, roles,
	 * session data and the plugin's own records.
	 */
	private const DENIED_META_PATTERN = '/(pass|pwd|token|secret|session|capabilit|user_level|auth|nonce|salt|hash|^imgsig_)/i';

	/** Transient caching the site's distinct user meta keys (5 minutes). */
	private const META_KEYS_TRANSIENT = 'imgsig_profile_meta_keys';

	/** Key prefixes owned by other variable families. */
	private const RESERVED_PREFIXES = [ 'wp_', 'company_' ];

	private const MAX_TEXT_LENGTH  = 255;
	private const MAX_URL_LENGTH   = 2048;
	private const MAX_PHONE_LENGTH = 40;
	private const MAX_LABEL_LENGTH = 60;

	/**
	 * Translated labels of the canonical fields.
	 *
	 * @since 1.3.0
	 *
	 * @return array<string, string>
	 */
	public static function canonical_labels(): array {
		return [
			'job_title'    => __( 'Job title', 'imagina-signatures' ),
			'department'   => __( 'Department', 'imagina-signatures' ),
			'phone'        => __( 'Phone', 'imagina-signatures' ),
			'mobile'       => __( 'Mobile', 'imagina-signatures' ),
			'photo_url'    => __( 'Photo URL', 'imagina-signatures' ),
			'linkedin_url' => __( 'LinkedIn URL', 'imagina-signatures' ),
			'calendar_url' => __( 'Booking / calendar URL', 'imagina-signatures' ),
			'website_url'  => __( 'Personal website', 'imagina-signatures' ),
			'address_line' => __( 'Office address', 'imagina-signatures' ),
			'pronouns'     => __( 'Pronouns', 'imagina-signatures' ),
		];
	}

	/**
	 * The stored mapping + custom field definitions, sanitised.
	 *
	 * @since 1.3.0
	 *
	 * @return array{mapping: array<string, array{source: string, meta_key: string}>, custom: array<int, array{key: string, label: string, type: string}>}
	 */
	public static function config(): array {
		return self::sanitize_config( get_option( self::OPTION, [] ) );
	}

	/**
	 * Sanitises a config payload (option value or REST body). Unknown
	 * keys are dropped, every known field gets a mapping entry.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $raw Untrusted input.
	 *
	 * @return array{mapping: array<string, array{source: string, meta_key: string}>, custom: array<int, array{key: string, label: string, type: string}>}
	 */
	public static function sanitize_config( $raw ): array {
		$raw = is_array( $raw ) ? $raw : [];

		$custom = [];
		$seen   = [];
		foreach ( ( isset( $raw['custom'] ) && is_array( $raw['custom'] ) ) ? $raw['custom'] : [] as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$key = self::sanitize_custom_key( isset( $entry['key'] ) ? (string) $entry['key'] : '' );
			if ( '' === $key || isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;

			$label = isset( $entry['label'] ) && is_scalar( $entry['label'] ) ? self::truncate( sanitize_text_field( (string) $entry['label'] ), self::MAX_LABEL_LENGTH ) : '';
			$type  = isset( $entry['type'] ) && in_array( $entry['type'], self::TYPES, true ) ? (string) $entry['type'] : self::TYPE_TEXT;

			$custom[] = [
				'key'   => $key,
				'label' => '' !== $label ? $label : $key,
				'type'  => $type,
			];
			if ( count( $custom ) >= self::MAX_CUSTOM ) {
				break;
			}
		}

		$raw_mapping = isset( $raw['mapping'] ) && is_array( $raw['mapping'] ) ? $raw['mapping'] : [];
		$mapping     = [];
		$keys        = array_merge( array_keys( self::CANONICAL ), array_column( $custom, 'key' ) );
		foreach ( $keys as $key ) {
			$entry    = isset( $raw_mapping[ $key ] ) && is_array( $raw_mapping[ $key ] ) ? $raw_mapping[ $key ] : [];
			$meta_key = isset( $entry['meta_key'] ) && is_string( $entry['meta_key'] ) ? self::sanitize_source_key( $entry['meta_key'] ) : '';
			$is_meta  = isset( $entry['source'] ) && self::SOURCE_META === $entry['source'] && '' !== $meta_key;

			$mapping[ $key ] = [
				'source'   => $is_meta ? self::SOURCE_META : self::SOURCE_PLUGIN,
				'meta_key' => $is_meta ? $meta_key : '',
			];
		}

		return [
			'mapping' => $mapping,
			'custom'  => $custom,
		];
	}

	/**
	 * Sanitises and stores the config; returns what was stored.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $raw Untrusted input.
	 *
	 * @return array{mapping: array<string, array{source: string, meta_key: string}>, custom: array<int, array{key: string, label: string, type: string}>}
	 */
	public static function save_config( $raw ): array {
		$previous = self::config();
		$config   = self::sanitize_config( $raw );
		update_option( self::OPTION, $config, true );

		if ( $previous !== $config ) {
			/**
			 * Fires after the profile field mapping / custom fields change
			 * (not on a save that changed nothing).
			 *
			 * @since 1.3.0
			 *
			 * @param array<string, mixed> $config Sanitised config.
			 */
			do_action( 'imgsig/profile/fields_changed', $config );
		}

		return $config;
	}

	/**
	 * Every field (canonical first, then custom) with its resolved source.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>|null $config Sanitised config (null reads the option).
	 *
	 * @return array<int, array{key: string, label: string, type: string, custom: bool, source: string, meta_key: string}>
	 */
	public static function definitions( ?array $config = null ): array {
		return self::specs( $config, true );
	}

	/**
	 * Field specs; labels are only translated when asked for (value
	 * resolution never needs them).
	 *
	 * @param array<string, mixed>|null $config        Sanitised config (null reads the option).
	 * @param bool                      $with_labels   Translate canonical labels.
	 *
	 * @return array<int, array{key: string, label: string, type: string, custom: bool, source: string, meta_key: string}>
	 */
	private static function specs( ?array $config, bool $with_labels ): array {
		$config = null === $config ? self::config() : self::sanitize_config( $config );
		$labels = $with_labels ? self::canonical_labels() : [];
		$out    = [];

		foreach ( self::CANONICAL as $key => $type ) {
			$out[] = self::definition( $key, $labels[ $key ] ?? $key, $type, false, $config['mapping'][ $key ] );
		}
		foreach ( $config['custom'] as $field ) {
			$out[] = self::definition( $field['key'], $field['label'], $field['type'], true, $config['mapping'][ $field['key'] ] );
		}

		return $out;
	}

	/**
	 * The definitions as handed to the editor bootstrap
	 * (`IMGSIG_EDITOR_CONFIG.profileFields`): no meta key names.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>|null $config Sanitised config (null reads the option).
	 *
	 * @return array<int, array{key: string, label: string, type: string, custom: bool, readonly: bool}>
	 */
	public static function public_definitions( ?array $config = null ): array {
		$out = [];
		foreach ( self::definitions( $config ) as $field ) {
			$out[] = [
				'key'      => $field['key'],
				'label'    => $field['label'],
				'type'     => $field['type'],
				'custom'   => $field['custom'],
				'readonly' => self::SOURCE_PLUGIN !== $field['source'],
			];
		}
		return $out;
	}

	/**
	 * Every profile key, canonical first.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>|null $config Sanitised config (null reads the option).
	 *
	 * @return string[]
	 */
	public static function keys( ?array $config = null ): array {
		return array_column( self::specs( $config, false ), 'key' );
	}

	/**
	 * The resolved profile of a user: every field key => value ('' when
	 * missing), with the admin's source mapping applied.
	 *
	 * @since 1.3.0
	 *
	 * @param int                       $user_id User.
	 * @param array<string, mixed>|null $config  Sanitised config (null reads the option).
	 *
	 * @return array<string, string>
	 */
	public static function values_for( int $user_id, ?array $config = null ): array {
		$stored = self::stored( $user_id );
		$user   = null;
		$out    = [];

		foreach ( self::specs( $config, false ) as $field ) {
			$raw = '';
			if ( self::SOURCE_META === $field['source'] ) {
				if ( in_array( $field['meta_key'], self::USER_FIELDS, true ) ) {
					if ( null === $user ) {
						$user = $user_id > 0 ? get_userdata( $user_id ) : false;
					}
					$raw = is_object( $user ) && isset( $user->{$field['meta_key']} ) ? $user->{$field['meta_key']} : '';
				} elseif ( $user_id > 0 ) {
					$raw = get_user_meta( $user_id, $field['meta_key'], true );
				}
			} else {
				$raw = $stored[ $field['key'] ] ?? '';
			}
			$out[ $field['key'] ] = is_scalar( $raw ) ? self::sanitize_value( $field['type'], (string) $raw ) : '';
		}

		/**
		 * Filters a user's resolved profile values (system variables,
		 * team console, deployment).
		 *
		 * @since 1.3.0
		 *
		 * @param array<string, string> $out     Key => value.
		 * @param int                   $user_id User.
		 */
		$filtered = apply_filters( 'imgsig/profile/values', $out, $user_id );

		$clean = [];
		foreach ( is_array( $filtered ) ? $filtered : $out as $key => $value ) {
			if ( is_string( $key ) && is_scalar( $value ) ) {
				$clean[ $key ] = (string) $value;
			}
		}
		return $clean;
	}

	/**
	 * Values stored by the plugin itself (`imgsig_profile` meta), whatever
	 * the mapping says. Keys of fields that no longer exist are kept.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id User.
	 *
	 * @return array<string, string>
	 */
	public static function stored( int $user_id ): array {
		if ( $user_id <= 0 ) {
			return [];
		}
		$raw = get_user_meta( $user_id, self::META_KEY, true );
		$out = [];
		foreach ( is_array( $raw ) ? $raw : [] as $key => $value ) {
			if ( is_string( $key ) && is_scalar( $value ) && '' !== (string) $value ) {
				$out[ $key ] = (string) $value;
			}
		}
		return $out;
	}

	/**
	 * Writes plugin-sourced values for a user. Keys that are unknown or
	 * mapped to another meta key are ignored; an empty value clears the
	 * field. Fires `imgsig/profile/updated` when anything changed.
	 *
	 * @since 1.3.0
	 *
	 * @param int                       $user_id User.
	 * @param array<string, mixed>      $values  Key => raw value.
	 * @param string                    $context `rest` | `profile_screen` | `import` | ….
	 * @param array<string, mixed>|null $config  Sanitised config (null reads the option).
	 *
	 * @return array{changed: string[], ignored: string[]}
	 */
	public static function save( int $user_id, array $values, string $context = 'rest', ?array $config = null ): array {
		$changes = self::diff( $user_id, $values, $config );
		if ( empty( $changes['changed'] ) ) {
			return $changes;
		}

		$stored = self::stored( $user_id );
		foreach ( $changes['next'] as $key => $value ) {
			if ( '' === $value ) {
				unset( $stored[ $key ] );
			} else {
				$stored[ $key ] = $value;
			}
		}

		if ( empty( $stored ) ) {
			delete_user_meta( $user_id, self::META_KEY );
		} else {
			update_user_meta( $user_id, self::META_KEY, $stored );
		}

		/**
		 * Fires after a user's plugin-stored profile values change. The
		 * user's signatures resolve these as `{{key}}`, so listeners can
		 * flag their compiled HTML as outdated.
		 *
		 * @since 1.3.0
		 *
		 * @param int      $user_id User.
		 * @param string[] $changed Keys that changed.
		 * @param string   $context `rest` | `profile_screen` | `import`.
		 */
		do_action( 'imgsig/profile/updated', $user_id, $changes['changed'], $context );

		return [
			'changed' => $changes['changed'],
			'ignored' => $changes['ignored'],
		];
	}

	/**
	 * What {@see save()} would change, without writing.
	 *
	 * @since 1.3.0
	 *
	 * @param int                       $user_id User.
	 * @param array<string, mixed>      $values  Key => raw value.
	 * @param array<string, mixed>|null $config  Sanitised config (null reads the option).
	 *
	 * @return array{changed: string[], ignored: string[], next: array<string, string>}
	 */
	public static function diff( int $user_id, array $values, ?array $config = null ): array {
		$writable = [];
		foreach ( self::specs( $config, false ) as $field ) {
			if ( self::SOURCE_PLUGIN === $field['source'] ) {
				$writable[ $field['key'] ] = $field['type'];
			}
		}

		$stored  = self::stored( $user_id );
		$changed = [];
		$ignored = [];
		$next    = [];

		foreach ( $values as $key => $raw ) {
			$key = (string) $key;
			if ( ! isset( $writable[ $key ] ) ) {
				$ignored[] = $key;
				continue;
			}
			$value = is_scalar( $raw ) || null === $raw ? self::sanitize_value( $writable[ $key ], (string) $raw ) : '';
			if ( ( $stored[ $key ] ?? '' ) !== $value ) {
				$changed[]    = $key;
				$next[ $key ] = $value;
			}
		}

		return [
			'changed' => $changed,
			'ignored' => $ignored,
			'next'    => $next,
		];
	}

	/**
	 * Sanitises one value for its type. Always returns a string ('' when
	 * the input is not valid for the type).
	 *
	 * @since 1.3.0
	 *
	 * @param string $type  One of {@see TYPES}.
	 * @param string $value Raw value.
	 *
	 * @return string
	 */
	public static function sanitize_value( string $type, string $value ): string {
		switch ( $type ) {
			case self::TYPE_URL:
				return self::url( $value );
			case self::TYPE_EMAIL:
				$email = sanitize_email( trim( $value ) );
				return is_string( $email ) ? $email : '';
			case self::TYPE_PHONE:
				return self::phone( $value );
			default:
				return self::truncate( sanitize_text_field( $value ), self::MAX_TEXT_LENGTH );
		}
	}

	/**
	 * A safe meta key to read a field from ('' when refused). Allows the
	 * {@see USER_FIELDS} columns too.
	 *
	 * @since 1.3.0
	 *
	 * @param string $key Raw meta key.
	 *
	 * @return string
	 */
	public static function sanitize_source_key( string $key ): string {
		$key = trim( $key );
		if ( '' === $key || strlen( $key ) > 191 || ! preg_match( '/^[A-Za-z0-9_\-.:]+$/', $key ) ) {
			return '';
		}
		if ( in_array( $key, self::USER_FIELDS, true ) ) {
			return $key;
		}
		if ( preg_match( self::DENIED_META_PATTERN, $key ) ) {
			return '';
		}
		return $key;
	}

	/**
	 * Distinct user meta keys on the site, for the mapping UI's
	 * suggestions. Excludes protected (`_`-prefixed) and denied keys;
	 * the {@see USER_FIELDS} come first.
	 *
	 * @since 1.3.0
	 *
	 * @param string $search Optional substring.
	 * @param int    $limit  Maximum entries.
	 *
	 * @return string[]
	 */
	public static function meta_key_suggestions( string $search = '', int $limit = 100 ): array {
		global $wpdb;

		$search = trim( $search );
		$limit  = max( 1, min( 200, $limit ) );

		// One cached list for every search (filtered in PHP), so typing
		// in the suggestion box never fans out into one query per key.
		$all = get_transient( self::META_KEYS_TRANSIENT );
		if ( ! is_array( $all ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$rows = $wpdb->get_col(
				$wpdb->prepare(
					"SELECT DISTINCT meta_key FROM {$wpdb->usermeta} WHERE meta_key NOT LIKE %s ORDER BY meta_key ASC LIMIT %d",
					$wpdb->esc_like( '_' ) . '%',
					1000
				)
			);
			$all  = [];
			foreach ( is_array( $rows ) ? $rows : [] as $key ) {
				$key = (string) $key;
				if ( '' !== self::sanitize_source_key( $key ) ) {
					$all[] = $key;
				}
			}
			set_transient( self::META_KEYS_TRANSIENT, $all, 5 * MINUTE_IN_SECONDS );
		}

		$out = [];
		foreach ( array_merge( self::USER_FIELDS, $all ) as $key ) {
			if ( ( '' === $search || false !== stripos( $key, $search ) ) && ! in_array( $key, $out, true ) ) {
				$out[] = $key;
			}
			if ( count( $out ) >= $limit ) {
				break;
			}
		}
		return $out;
	}

	/**
	 * Custom field key: lower-case `[a-z][a-z0-9_]{0,39}`, not a canonical
	 * key and not in a reserved family (`wp_*`, `company_*`).
	 *
	 * @param string $key Raw key.
	 *
	 * @return string '' when invalid.
	 */
	private static function sanitize_custom_key( string $key ): string {
		$key = strtolower( trim( $key ) );
		if ( ! preg_match( '/^[a-z][a-z0-9_]{0,39}$/', $key ) || isset( self::CANONICAL[ $key ] ) ) {
			return '';
		}
		foreach ( self::RESERVED_PREFIXES as $prefix ) {
			if ( 0 === strpos( $key, $prefix ) ) {
				return '';
			}
		}
		return $key;
	}

	/**
	 * @param string                                  $key     Field key.
	 * @param string                                  $label   Label.
	 * @param string                                  $type    Type.
	 * @param bool                                    $custom  Admin-defined.
	 * @param array{source: string, meta_key: string} $mapping Source.
	 *
	 * @return array{key: string, label: string, type: string, custom: bool, source: string, meta_key: string}
	 */
	private static function definition( string $key, string $label, string $type, bool $custom, array $mapping ): array {
		return [
			'key'      => $key,
			'label'    => $label,
			'type'     => $type,
			'custom'   => $custom,
			'source'   => $mapping['source'],
			'meta_key' => $mapping['meta_key'],
		];
	}

	/**
	 * Free-form phone: digits, spaces and `+ ( ) - . /`, plus an optional
	 * trailing extension (`ext. 12`, `x12`).
	 *
	 * @param string $value Raw phone.
	 *
	 * @return string
	 */
	private static function phone( string $value ): string {
		$value = sanitize_text_field( $value );
		$ext   = '';
		if ( preg_match( '/\s*(?:ext\.?|extension|x)\s*(\d{1,6})\s*$/i', $value, $m ) ) {
			$ext   = ' ext. ' . $m[1];
			$value = substr( $value, 0, -strlen( $m[0] ) );
		}
		$value = (string) preg_replace( '/[^0-9+()\-.\/\s]/', '', $value );
		$value = trim( (string) preg_replace( '/\s+/', ' ', $value ) );
		if ( ! preg_match( '/\d/', $value ) ) {
			return '';
		}
		return self::truncate( $value . $ext, self::MAX_PHONE_LENGTH );
	}

	/**
	 * Absolute http(s) URL, or ''. A bare domain gets `https://`.
	 *
	 * @param string $value Raw URL.
	 *
	 * @return string
	 */
	private static function url( string $value ): string {
		$value = trim( $value );
		if ( '' === $value || strlen( $value ) > self::MAX_URL_LENGTH ) {
			return '';
		}
		if ( false === strpos( $value, '://' ) && preg_match( '#^[a-z0-9\-]+(\.[a-z0-9\-]+)+(?::\d{1,5})?(?:[/?\#]|$)#i', $value ) ) {
			$value = 'https://' . $value;
		}

		$clean = esc_url_raw( $value, [ 'http', 'https' ] );
		if ( ! is_string( $clean ) || ! preg_match( '#^https?://[^/\s?\#]+#i', $clean ) ) {
			return '';
		}

		$parts = wp_parse_url( $clean );
		if (
			! is_array( $parts )
			|| empty( $parts['host'] )
			|| ! preg_match( '/^[a-z0-9\x80-\xff\-]+(?:\.[a-z0-9\x80-\xff\-]+)*$/i', (string) $parts['host'] )
		) {
			return '';
		}
		return $clean;
	}

	/**
	 * @param string $value Text.
	 * @param int    $max   Maximum characters.
	 *
	 * @return string
	 */
	private static function truncate( string $value, int $max ): string {
		return function_exists( 'mb_substr' ) ? mb_substr( $value, 0, $max ) : substr( $value, 0, $max );
	}
}
