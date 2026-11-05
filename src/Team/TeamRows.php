<?php
/**
 * Team console row model.
 *
 * @package ImaginaSignatures\Team
 */

declare(strict_types=1);

namespace ImaginaSignatures\Team;

use ImaginaSignatures\Deployment\DeploymentStatus;
use ImaginaSignatures\Deployment\Install\InstallService;
use ImaginaSignatures\Models\Signature;

defined( 'ABSPATH' ) || exit;

/**
 * Pure functions that turn one user's signatures and deployment records
 * into the team console row (1.3.0) — no database access, so the whole
 * team can be classified from a handful of batched queries
 * ({@see TeamDirectory}).
 *
 * Row (`state()`), every key always present:
 *
 * ```
 * {
 *   user_id, signature_count,
 *   primary: null | { id, name, status, template_id, link: linked|copy|none,
 *                     updated_at, compiled_at, marked },
 *   html:    { state: none|outdated|fresh, compiled_at },
 *   gmail:   { state: not_configured|never|pushed|outdated|failed|skipped, at, message },
 *   outlook: { state: not_configured|never|delivered|outdated, at },
 *   install: { state: none|invited|opened|installed|outdated, invited_at,
 *              opened_at, installed_at, client, reminders },
 * }
 * ```
 *
 * "Deployed" states compare the hash a channel recorded with the
 * primary signature's current `html_hash` (the HTML the server holds,
 * even while it is outdated).
 *
 * @since 1.3.0
 */
final class TeamRows {

	public const HTML_NONE     = 'none';
	public const HTML_OUTDATED = 'outdated';
	public const HTML_FRESH    = 'fresh';

	public const STATE_ALL              = 'all';
	public const STATE_NO_SIGNATURE     = 'no_signature';
	public const STATE_OUTDATED         = 'outdated';
	public const STATE_UP_TO_DATE       = 'up_to_date';
	public const STATE_GMAIL_FAILED     = 'gmail_failed';
	public const STATE_NOT_INSTALLED    = 'not_installed';
	public const STATE_INSTALL_OUTDATED = 'install_outdated';

	/**
	 * Values of the `state` filter.
	 *
	 * @var string[]
	 */
	public const STATES = [
		self::STATE_ALL,
		self::STATE_NO_SIGNATURE,
		self::STATE_OUTDATED,
		self::STATE_UP_TO_DATE,
		self::STATE_GMAIL_FAILED,
		self::STATE_NOT_INSTALLED,
		self::STATE_INSTALL_OUTDATED,
	];

	/**
	 * Gmail skips that are not an error but explain why nothing was pushed.
	 */
	private const GMAIL_SKIPS = [ 'needs_recompile', 'domain_not_allowed', 'no_email', 'no_signature', 'user_not_found' ];

	/**
	 * The signature a user deploys — same rule as
	 * {@see \ImaginaSignatures\Services\SignatureService::primary_for_user()}:
	 * the marked one if it still exists, else the most recently updated
	 * "ready" one, else the most recently updated one.
	 *
	 * @since 1.3.0
	 *
	 * @param Signature[] $signatures The user's signatures, updated_at DESC.
	 * @param int         $marked     `imgsig_primary_signature` meta (0 = none).
	 *
	 * @return Signature|null
	 */
	public static function primary_of( array $signatures, int $marked ): ?Signature {
		if ( $marked > 0 ) {
			foreach ( $signatures as $signature ) {
				if ( $signature->id === $marked ) {
					return $signature;
				}
			}
		}
		foreach ( $signatures as $signature ) {
			if ( Signature::STATUS_READY === $signature->status ) {
				return $signature;
			}
		}
		return $signatures[0] ?? null;
	}

	/**
	 * Classifies one user.
	 *
	 * @since 1.3.0
	 *
	 * @param int                 $user_id    User.
	 * @param Signature[]         $signatures Their signatures, updated_at DESC.
	 * @param int                 $marked     Marked primary id (0 = none).
	 * @param mixed               $deploy     `imgsig_deploy_status` meta value.
	 * @param array<string, bool> $channels   `gmail` (configured), `outlook` (enabled).
	 *
	 * @return array<string, mixed>
	 */
	public static function state( int $user_id, array $signatures, int $marked, $deploy, array $channels ): array {
		$primary = self::primary_of( $signatures, $marked );
		$records = self::records( $deploy );

		return [
			'user_id'         => $user_id,
			'signature_count' => count( $signatures ),
			'primary'         => null === $primary ? null : [
				'id'          => $primary->id,
				'name'        => $primary->name,
				'status'      => $primary->status,
				'template_id' => $primary->template_id,
				'link'        => null === $primary->template_id ? 'none' : ( $primary->is_linked() ? 'linked' : 'copy' ),
				'updated_at'  => $primary->updated_at,
				'compiled_at' => $primary->compiled_at,
				'marked'      => $marked > 0 && $primary->id === $marked,
			],
			'html'            => self::html_state( $primary ),
			'gmail'           => self::gmail_state( $records['gmail'] ?? null, $primary, ! empty( $channels['gmail'] ) ),
			'outlook'         => self::outlook_state( $records['outlook'] ?? null, $primary, ! empty( $channels['outlook'] ) ),
			'install'         => self::install_state( $records['install'] ?? null, $primary ),
		];
	}

	/**
	 * State of the HTML the server holds for the primary signature.
	 *
	 * @since 1.3.0
	 *
	 * @param Signature|null $primary Primary signature.
	 *
	 * @return array{state: string, compiled_at: string|null}
	 */
	public static function html_state( ?Signature $primary ): array {
		if ( null === $primary || ! $primary->has_html ) {
			return [
				'state'       => self::HTML_NONE,
				'compiled_at' => null,
			];
		}
		return [
			'state'       => $primary->is_html_stale() ? self::HTML_OUTDATED : self::HTML_FRESH,
			'compiled_at' => $primary->compiled_at,
		];
	}

	/**
	 * Gmail column.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>|null $record     `gmail` DeploymentStatus record.
	 * @param Signature|null            $primary    Primary signature.
	 * @param bool                      $configured Google Workspace connected.
	 *
	 * @return array{state: string, at: string|null, message: string}
	 */
	public static function gmail_state( ?array $record, ?Signature $primary, bool $configured ): array {
		$out = [
			'state'   => 'never',
			'at'      => null,
			'message' => '',
		];
		if ( ! $configured ) {
			$out['state'] = 'not_configured';
			return $out;
		}
		if ( null === $record ) {
			return $out;
		}

		if ( ! empty( $record['error'] ) ) {
			$out['state']   = 'failed';
			$out['at']      = self::text_or_null( $record['checked_at'] ?? null );
			$out['message'] = (string) $record['error'];
			return $out;
		}

		$hash = self::text_or_null( $record['hash'] ?? null );
		if ( null !== $hash ) {
			$current      = null !== $primary ? $primary->html_hash : null;
			$out['state'] = null !== $current && hash_equals( $hash, (string) $current ) ? 'pushed' : 'outdated';
			$out['at']    = self::text_or_null( $record['at'] ?? null );
			// A skip recorded after the last push (e.g. needs_recompile) explains why it is behind.
			if ( 'outdated' === $out['state'] && in_array( $record['status'] ?? '', self::GMAIL_SKIPS, true ) ) {
				$out['message'] = (string) ( $record['message'] ?? '' );
			}
			return $out;
		}

		if ( in_array( $record['status'] ?? '', self::GMAIL_SKIPS, true ) ) {
			$out['state']   = 'skipped';
			$out['at']      = self::text_or_null( $record['checked_at'] ?? null );
			$out['message'] = (string) ( $record['message'] ?? '' );
		}
		return $out;
	}

	/**
	 * Outlook add-in column (what the add-in last fetched).
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>|null $record  `outlook` DeploymentStatus record.
	 * @param Signature|null            $primary Primary signature.
	 * @param bool                      $enabled Add-in enabled in Settings.
	 *
	 * @return array{state: string, at: string|null}
	 */
	public static function outlook_state( ?array $record, ?Signature $primary, bool $enabled ): array {
		if ( ! $enabled ) {
			return [
				'state' => 'not_configured',
				'at'    => null,
			];
		}
		$hash = null !== $record ? self::text_or_null( $record['hash'] ?? null ) : null;
		if ( null === $hash ) {
			return [
				'state' => 'never',
				'at'    => null,
			];
		}
		$current = null !== $primary ? $primary->html_hash : null;
		return [
			'state' => null !== $current && hash_equals( $hash, (string) $current ) ? 'delivered' : 'outdated',
			'at'    => self::text_or_null( $record['at'] ?? null ),
		];
	}

	/**
	 * Install link column.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed>|null $record  `install` DeploymentStatus record.
	 * @param Signature|null            $primary Primary signature.
	 *
	 * @return array{state: string, invited_at: string|null, opened_at: string|null, installed_at: string|null, client: string|null, reminders: int}
	 */
	public static function install_state( ?array $record, ?Signature $primary ): array {
		$record = $record ?? [];
		$state  = InstallService::state( $record, null !== $primary ? $primary->html_hash : null );
		// Not installed yet, but the install page was opened (from an
		// invitation or from "Install" in My signatures).
		if ( in_array( $state, [ InstallService::STATE_NONE, InstallService::STATE_INVITED ], true ) && ! empty( $record['opened_at'] ) ) {
			$state = 'opened';
		}

		return [
			'state'        => $state,
			'invited_at'   => self::text_or_null( $record['invited_at'] ?? null ),
			'opened_at'    => self::text_or_null( $record['opened_at'] ?? null ),
			'installed_at' => self::text_or_null( $record['installed_at'] ?? null ),
			'client'       => self::text_or_null( $record['client'] ?? null ),
			'reminders'    => (int) ( $record['reminders'] ?? 0 ),
		];
	}

	/**
	 * Whether a row passes the `state` filter.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $row   {@see state()}.
	 * @param string               $state One of {@see STATES}.
	 *
	 * @return bool
	 */
	public static function matches( array $row, string $state ): bool {
		$has = null !== $row['primary'];
		switch ( $state ) {
			case self::STATE_NO_SIGNATURE:
				return ! $has;
			case self::STATE_OUTDATED:
				return $has && self::HTML_FRESH !== $row['html']['state'];
			case self::STATE_UP_TO_DATE:
				return $has && self::HTML_FRESH === $row['html']['state'];
			case self::STATE_GMAIL_FAILED:
				return 'failed' === $row['gmail']['state'];
			case self::STATE_NOT_INSTALLED:
				return $has && in_array( $row['install']['state'], [ 'none', 'invited', 'opened' ], true );
			case self::STATE_INSTALL_OUTDATED:
				return 'outdated' === $row['install']['state'];
			default:
				return true;
		}
	}

	/**
	 * Counters over a set of rows.
	 *
	 * @since 1.3.0
	 *
	 * @param array<int, array<string, mixed>> $rows {@see state()} rows.
	 *
	 * @return array<string, int>
	 */
	public static function summarize( array $rows ): array {
		$out = [
			'users'             => 0,
			'with_signature'    => 0,
			'without_signature' => 0,
			'outdated_html'     => 0,
			'gmail_pushed'      => 0,
			'gmail_failed'      => 0,
			'outlook_delivered' => 0,
			'installed'         => 0,
			'install_outdated'  => 0,
			'not_installed'     => 0,
		];
		foreach ( $rows as $row ) {
			++$out['users'];
			if ( null === $row['primary'] ) {
				++$out['without_signature'];
				continue;
			}
			++$out['with_signature'];
			if ( self::HTML_FRESH !== $row['html']['state'] ) {
				++$out['outdated_html'];
			}
			if ( 'pushed' === $row['gmail']['state'] ) {
				++$out['gmail_pushed'];
			} elseif ( 'failed' === $row['gmail']['state'] ) {
				++$out['gmail_failed'];
			}
			if ( 'delivered' === $row['outlook']['state'] ) {
				++$out['outlook_delivered'];
			}
			if ( 'installed' === $row['install']['state'] ) {
				++$out['installed'];
			} elseif ( 'outdated' === $row['install']['state'] ) {
				++$out['install_outdated'];
			} else {
				++$out['not_installed'];
			}
		}
		return $out;
	}

	/**
	 * Channel records of a `imgsig_deploy_status` meta value (same
	 * filtering as {@see DeploymentStatus::get()}).
	 *
	 * @param mixed $raw Meta value.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private static function records( $raw ): array {
		$out = [];
		if ( ! is_array( $raw ) ) {
			return $out;
		}
		foreach ( DeploymentStatus::CHANNELS as $channel ) {
			if ( isset( $raw[ $channel ] ) && is_array( $raw[ $channel ] ) ) {
				$out[ $channel ] = $raw[ $channel ];
			}
		}
		return $out;
	}

	/**
	 * @param mixed $value Value.
	 *
	 * @return string|null Non-empty string, else null.
	 */
	private static function text_or_null( $value ): ?string {
		return is_scalar( $value ) && '' !== (string) $value ? (string) $value : null;
	}
}
