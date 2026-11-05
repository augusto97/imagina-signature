<?php
/**
 * Bulk profile import (rows parsed from a CSV by the admin app).
 *
 * @package ImaginaSignatures\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Directory;

use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Applies one chunk of CSV rows to user profiles.
 *
 * The browser parses the file (delimiter detection, preview, column
 * mapping) and sends rows in chunks of {@see MAX_ROWS}; each row is a
 * list of cells and `$columns` says what each cell index maps to:
 *
 *  - `email`              required, exactly once — identifies the user;
 *  - `field:<key>`        a profile field ({@see ProfileFields});
 *  - `group`              group names, separated by `|`, `;` or `,`;
 *  - `user:first_name`, `user:last_name`, `user:display_name`
 *                         only used when a missing user is created;
 *  - `''`                 ignored.
 *
 * Empty cells never clear a value. Fields mapped to another meta key
 * are read-only and reported in `skipped_fields`. With `$dry_run` the
 * same counts are produced without writing anything.
 *
 * @since 1.3.0
 */
final class ProfileImporter {

	public const MAX_ROWS    = 100;
	public const MAX_COLUMNS = 50;
	public const MAX_CELL    = 2000;

	/** Most entries listed per result array (counts stay exact). */
	private const MAX_LISTED = 200;

	/**
	 * Capabilities a role must not have to be offered for created users.
	 */
	private const PRIVILEGED_CAPS = [
		'manage_options',
		'edit_users',
		'create_users',
		'promote_users',
		'delete_users',
		'manage_network',
		CapabilitiesInstaller::CAP_MANAGE_TEAM,
		CapabilitiesInstaller::CAP_MANAGE_STORAGE,
		CapabilitiesInstaller::CAP_MANAGE_TEMPLATES,
	];

	private const USER_TARGETS = [ 'first_name', 'last_name', 'display_name' ];

	/**
	 * Group id cache for the chunk (lower-cased name => id; -1 = would be created).
	 *
	 * @var array<string, int>
	 */
	private array $group_ids = [];

	/**
	 * Validates a column mapping; returns an error message or ''.
	 *
	 * @since 1.3.0
	 *
	 * @param array<int, mixed> $columns Targets per cell index.
	 *
	 * @return string
	 */
	public static function validate_columns( array $columns ): string {
		if ( count( $columns ) > self::MAX_COLUMNS ) {
			return __( 'Too many columns.', 'imagina-signatures' );
		}
		$emails = 0;
		foreach ( $columns as $target ) {
			if ( ! is_string( $target ) ) {
				return __( 'Invalid column mapping.', 'imagina-signatures' );
			}
			if ( 'email' === $target ) {
				++$emails;
			}
		}
		if ( 1 !== $emails ) {
			return __( 'Map exactly one column to the email address.', 'imagina-signatures' );
		}
		return '';
	}

	/**
	 * Roles that may be given to created users (no administrative caps).
	 *
	 * @since 1.3.0
	 *
	 * @return array<int, array{slug: string, label: string}>
	 */
	public static function assignable_roles(): array {
		$roles = wp_roles();
		$out   = [];
		foreach ( is_object( $roles ) && is_array( $roles->roles ) ? $roles->roles : [] as $slug => $role ) {
			$caps = isset( $role['capabilities'] ) && is_array( $role['capabilities'] ) ? $role['capabilities'] : [];
			foreach ( self::PRIVILEGED_CAPS as $cap ) {
				if ( ! empty( $caps[ $cap ] ) ) {
					continue 2;
				}
			}
			$out[] = [
				'slug'  => (string) $slug,
				'label' => translate_user_role( isset( $role['name'] ) ? (string) $role['name'] : (string) $slug ),
			];
		}
		return $out;
	}

	/**
	 * Processes one chunk.
	 *
	 * @since 1.3.0
	 *
	 * @param array<int, mixed>    $rows       Rows of cells.
	 * @param array<int, string>   $columns    Target per cell index (see class doc).
	 * @param array<string, mixed> $options    create_missing (bool), role (string),
	 *                                         send_notification (bool), create_groups (bool).
	 * @param bool                 $dry_run    Count only.
	 * @param int                  $row_offset Number of data rows before this chunk (for row numbers).
	 *
	 * @return array<string, mixed>
	 */
	public function run( array $rows, array $columns, array $options, bool $dry_run, int $row_offset = 0 ): array {
		$create_missing = ! empty( $options['create_missing'] );
		$create_groups  = ! empty( $options['create_groups'] );
		$notify         = ! empty( $options['send_notification'] );
		$role           = isset( $options['role'] ) && is_string( $options['role'] ) ? sanitize_key( $options['role'] ) : '';

		$result = [
			'dry_run'           => $dry_run,
			'rows'              => 0,
			'matched'           => 0,
			'created'           => 0,
			'unknown'           => [],
			'unknown_count'     => 0,
			'invalid'           => [],
			'users_changed'     => 0,
			'field_changes'     => 0,
			'group_assignments' => 0,
			'groups_created'    => [],
			'groups_missing'    => [],
			'skipped_fields'    => [],
		];

		if ( $create_missing && ! in_array( $role, array_column( self::assignable_roles(), 'slug' ), true ) ) {
			$result['invalid'][] = [
				'row'     => 0,
				'message' => __( 'Choose a valid role for the new users.', 'imagina-signatures' ),
			];
			return $result;
		}

		$config   = ProfileFields::config();
		$fields   = [];
		$readonly = [];
		foreach ( ProfileFields::definitions( $config ) as $field ) {
			if ( ProfileFields::SOURCE_PLUGIN === $field['source'] ) {
				$fields[ $field['key'] ] = $field['type'];
			} else {
				$readonly[ $field['key'] ] = true;
			}
		}

		$skipped = [];
		foreach ( $columns as $target ) {
			$key = self::field_key( (string) $target );
			if ( '' !== $key && isset( $readonly[ $key ] ) ) {
				$skipped[ $key ] = true;
			}
		}
		$result['skipped_fields'] = array_keys( $skipped );

		$this->group_ids = [];

		foreach ( array_values( $rows ) as $index => $row ) {
			$line = $row_offset + $index + 1;
			if ( ! is_array( $row ) ) {
				self::add_invalid( $result, $line, __( 'Malformed row.', 'imagina-signatures' ) );
				continue;
			}
			++$result['rows'];

			$values = [];
			$user   = [];
			$groups = [];
			$email  = '';
			foreach ( $columns as $col => $target ) {
				$cell = isset( $row[ $col ] ) && is_scalar( $row[ $col ] ) ? trim( (string) $row[ $col ] ) : '';
				$cell = substr( $cell, 0, self::MAX_CELL );
				if ( '' === $cell ) {
					continue;
				}
				$target = (string) $target;
				if ( 'email' === $target ) {
					$email = $cell;
				} elseif ( 'group' === $target ) {
					$groups = array_merge( $groups, self::split_groups( $cell ) );
				} elseif ( 0 === strpos( $target, 'user:' ) && in_array( substr( $target, 5 ), self::USER_TARGETS, true ) ) {
					$user[ substr( $target, 5 ) ] = sanitize_text_field( $cell );
				} else {
					$key = self::field_key( $target );
					if ( '' !== $key && isset( $fields[ $key ] ) ) {
						$values[ $key ] = $cell;
					}
				}
			}

			$clean_email = sanitize_email( $email );
			if ( '' === $clean_email || ! is_email( $clean_email ) ) {
				self::add_invalid(
					$result,
					$line,
					'' === $email
						? __( 'Missing email address.', 'imagina-signatures' )
						/* translators: %s: the email value found in the row. */
						: sprintf( __( 'Invalid email address “%s”.', 'imagina-signatures' ), sanitize_text_field( $email ) )
				);
				continue;
			}

			$existing = get_user_by( 'email', $clean_email );
			$user_id  = is_object( $existing ) ? (int) $existing->ID : 0;
			if ( $user_id > 0 && is_multisite() && ! is_user_member_of_blog( $user_id ) ) {
				$user_id = 0;
				if ( ! $create_missing ) {
					self::add_unknown( $result, $clean_email );
					continue;
				}
				if ( ! $dry_run ) {
					add_user_to_blog( get_current_blog_id(), (int) $existing->ID, $role );
					$user_id = (int) $existing->ID;
				}
				++$result['created'];
			} elseif ( $user_id > 0 ) {
				++$result['matched'];
			} elseif ( ! $create_missing ) {
				self::add_unknown( $result, $clean_email );
				continue;
			} else {
				if ( ! $dry_run ) {
					$created = $this->create_user( $clean_email, $role, $user, $notify );
					if ( is_wp_error( $created ) ) {
						self::add_invalid( $result, $line, $created->get_error_message() );
						continue;
					}
					$user_id = $created;
				}
				++$result['created'];
			}

			// Field changes.
			if ( $user_id > 0 ) {
				$diff    = ProfileFields::diff( $user_id, $values, $config );
				$changes = count( $diff['changed'] );
				if ( $changes > 0 && ! $dry_run ) {
					ProfileFields::save( $user_id, $values, 'import', $config );
				}
			} else {
				$changes = 0;
				foreach ( $values as $key => $value ) {
					if ( '' !== ProfileFields::sanitize_value( $fields[ $key ], $value ) ) {
						++$changes;
					}
				}
			}
			if ( $changes > 0 ) {
				++$result['users_changed'];
				$result['field_changes'] += $changes;
			}

			// Groups.
			$current = $user_id > 0 ? Groups::for_user( $user_id ) : [];
			foreach ( array_unique( $groups ) as $name ) {
				$group_id = $this->resolve_group( $name, $create_groups, $dry_run, $result );
				if ( 0 === $group_id || in_array( $group_id, $current, true ) ) {
					continue;
				}
				$current[] = $group_id;
				++$result['group_assignments'];
				if ( ! $dry_run && $group_id > 0 && $user_id > 0 ) {
					Groups::add_member( $user_id, $group_id );
				}
			}
		}

		return $result;
	}

	/**
	 * `field:<key>` → `<key>`, else ''.
	 *
	 * @param string $target Column target.
	 *
	 * @return string
	 */
	private static function field_key( string $target ): string {
		return 0 === strpos( $target, 'field:' ) ? substr( $target, 6 ) : '';
	}

	/**
	 * @param string $cell Group cell.
	 *
	 * @return string[]
	 */
	private static function split_groups( string $cell ): array {
		$out = [];
		foreach ( preg_split( '/[|;,]/', $cell ) ?: [] as $name ) {
			$name = trim( sanitize_text_field( (string) $name ) );
			if ( '' !== $name ) {
				$out[] = $name;
			}
		}
		return $out;
	}

	/**
	 * Group id for a name: existing, created (or -1 for "would be
	 * created" in a dry run), or 0 when missing and not created.
	 *
	 * @param string               $name          Group name.
	 * @param bool                 $create_groups Create missing groups.
	 * @param bool                 $dry_run       Count only.
	 * @param array<string, mixed> $result        Result accumulator.
	 *
	 * @return int
	 */
	private function resolve_group( string $name, bool $create_groups, bool $dry_run, array &$result ): int {
		$cache_key = function_exists( 'mb_strtolower' ) ? mb_strtolower( $name ) : strtolower( $name );
		if ( isset( $this->group_ids[ $cache_key ] ) ) {
			return $this->group_ids[ $cache_key ];
		}

		$group_id = Groups::find_by_name( $name );
		if ( 0 === $group_id ) {
			if ( ! $create_groups ) {
				if ( count( $result['groups_missing'] ) < self::MAX_LISTED ) {
					$result['groups_missing'][] = $name;
				}
			} elseif ( $dry_run ) {
				$group_id                   = -1;
				$result['groups_created'][] = $name;
			} else {
				$created = Groups::create( [ 'name' => $name ] );
				if ( is_array( $created ) ) {
					$group_id                   = (int) $created['id'];
					$result['groups_created'][] = $name;
				}
			}
		}

		$this->group_ids[ $cache_key ] = $group_id;
		return $group_id;
	}

	/**
	 * Creates a user with a generated password.
	 *
	 * @param string                $email  Address.
	 * @param string                $role   Role slug (pre-validated).
	 * @param array<string, string> $names  first_name / last_name / display_name.
	 * @param bool                  $notify Send WordPress' new-user email.
	 *
	 * @return int|\WP_Error
	 */
	private function create_user( string $email, string $role, array $names, bool $notify ) {
		$data = [
			'user_login' => self::unique_login( $email ),
			'user_email' => $email,
			'user_pass'  => wp_generate_password( 24, true, true ),
			'role'       => $role,
		];
		foreach ( self::USER_TARGETS as $field ) {
			if ( isset( $names[ $field ] ) && '' !== $names[ $field ] ) {
				$data[ $field ] = $names[ $field ];
			}
		}

		$user_id = wp_insert_user( $data );
		if ( is_wp_error( $user_id ) ) {
			return $user_id;
		}
		if ( $notify ) {
			wp_new_user_notification( (int) $user_id, null, 'user' );
		}
		return (int) $user_id;
	}

	/**
	 * A free login derived from the email's local part.
	 *
	 * @param string $email Address.
	 *
	 * @return string
	 */
	private static function unique_login( string $email ): string {
		$local = (string) strstr( $email, '@', true );
		$base  = sanitize_user( strtolower( $local ), true );
		$base  = '' !== $base ? substr( $base, 0, 50 ) : 'user';

		$login = $base;
		$i     = 2;
		while ( $i < 100 && username_exists( $login ) ) {
			$login = $base . $i;
			++$i;
		}
		if ( username_exists( $login ) ) {
			$login = $base . '-' . strtolower( wp_generate_password( 6, false ) );
		}
		return $login;
	}

	/**
	 * @param array<string, mixed> $result  Accumulator.
	 * @param int                  $line    Data row number.
	 * @param string               $message Message.
	 *
	 * @return void
	 */
	private static function add_invalid( array &$result, int $line, string $message ): void {
		if ( count( $result['invalid'] ) < self::MAX_LISTED ) {
			$result['invalid'][] = [
				'row'     => $line,
				'message' => $message,
			];
		}
	}

	/**
	 * @param array<string, mixed> $result Accumulator.
	 * @param string               $email  Address.
	 *
	 * @return void
	 */
	private static function add_unknown( array &$result, string $email ): void {
		++$result['unknown_count'];
		if ( count( $result['unknown'] ) < self::MAX_LISTED ) {
			$result['unknown'][] = $email;
		}
	}
}
