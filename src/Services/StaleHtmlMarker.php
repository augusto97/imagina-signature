<?php
/**
 * Marks stored signature HTML outdated when its inputs change.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Core\Cron;
use ImaginaSignatures\Directory\Groups;
use ImaginaSignatures\Directory\ProfileFields;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Settings\BrandKit;

defined( 'ABSPATH' ) || exit;

/**
 * The HTML the server keeps for each signature (`html_cache`) is
 * compiled in a browser from the design AND from inputs that live
 * outside the signature: the owner's profile fields and WordPress user
 * fields (`{{job_title}}`, `{{wp_display_name}}`…), their groups (footer
 * override, campaign targeting), the brand kit (`{{company_*}}`), the
 * compliance footer, the banner campaigns and the profile field mapping.
 * When one of those changes, the stored HTML no longer matches what the
 * owner's editor would compile, so this listener marks it outdated
 * ({@see SignatureRepository::mark_html_outdated()}, one cheap UPDATE).
 *
 * What it listens to:
 *
 *  | Change                                         | Signatures marked        |
 *  |------------------------------------------------|--------------------------|
 *  | `imgsig/profile/updated` (plugin-stored values) | the user's               |
 *  | `profile_update` (display name, email, URL)    | the user's               |
 *  | user meta `first_name` / `last_name` / a meta key a profile field maps to | the user's |
 *  | `imgsig/group/members_changed`                 | users added and removed  |
 *  | `imgsig/group/saved` (updated) / group deleted | the group's members      |
 *  | `imgsig/profile/fields_changed`                | everyone's               |
 *  | `imgsig/site_settings/changed`: compliance footer, campaigns, company data of the brand kit | everyone's |
 *  | the set of campaigns inside their dates changed (daily cron) | everyone's |
 *
 * Marking is idempotent and never touches the design or `updated_at`;
 * a recompile (the owner's editor, or the team console) makes the HTML
 * fresh again. The install page and the Outlook add-in keep serving the
 * last compiled HTML meanwhile; Gmail push waits for the recompile.
 *
 * Not `final` so PHPUnit 9 can double it.
 *
 * @since 1.3.0
 */
class StaleHtmlMarker {

	public const REASON_PROFILE         = 'profile';
	public const REASON_USER            = 'user';
	public const REASON_GROUP           = 'group';
	public const REASON_PROFILE_FIELDS  = 'profile_fields';
	public const REASON_SITE_SETTINGS   = 'site_settings';
	public const REASON_CAMPAIGN_WINDOW = 'campaign_window';

	/**
	 * Option holding a fingerprint of the campaigns that were inside their
	 * date window at the last check.
	 */
	public const CAMPAIGN_WINDOW_OPTION = 'imgsig_campaign_window';

	/**
	 * WP user meta read by `SystemVariables` (`wp_first_name` / `wp_last_name`).
	 */
	private const USER_NAME_META = [ 'first_name', 'last_name' ];

	/**
	 * `wp_users` columns read by `SystemVariables` (`wp_display_name`, `wp_email`, `wp_url`).
	 */
	private const USER_COLUMNS = [ 'display_name', 'user_email', 'user_url' ];

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $repo;

	/**
	 * Meta keys whose change marks the owner's HTML outdated (lazy).
	 *
	 * @var array<string, true>|null
	 */
	private ?array $watched_meta = null;

	/**
	 * @param SignatureRepository $repo Signature repository.
	 */
	public function __construct( SignatureRepository $repo ) {
		$this->repo = $repo;
	}

	/**
	 * Hooks every listener. Called once on boot.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function register(): void {
		add_action( 'imgsig/profile/updated', [ $this, 'on_profile_updated' ], 10, 1 );
		add_action( 'profile_update', [ $this, 'on_wp_profile_update' ], 10, 2 );
		add_action( 'added_user_meta', [ $this, 'on_user_meta_changed' ], 10, 3 );
		add_action( 'updated_user_meta', [ $this, 'on_user_meta_changed' ], 10, 3 );
		add_action( 'deleted_user_meta', [ $this, 'on_user_meta_changed' ], 10, 3 );
		add_action( 'imgsig/group/members_changed', [ $this, 'on_members_changed' ], 10, 3 );
		add_action( 'imgsig/group/saved', [ $this, 'on_group_saved' ], 10, 2 );
		add_action( 'pre_delete_term', [ $this, 'on_term_deleting' ], 10, 2 );
		add_action( 'imgsig/profile/fields_changed', [ $this, 'on_profile_fields_changed' ], 10, 0 );
		add_action( 'imgsig/site_settings/changed', [ $this, 'on_site_settings_changed' ], 10, 3 );
		add_action( Cron::DAILY_HOOK, [ $this, 'check_campaign_window' ] );
	}

	/**
	 * Marks the HTML of these users' signatures outdated.
	 *
	 * @since 1.3.0
	 *
	 * @param int[]  $user_ids Owners.
	 * @param string $reason   One of the REASON_* constants (passed to listeners).
	 *
	 * @return int Rows marked.
	 */
	public function mark_users( array $user_ids, string $reason ): int {
		$user_ids = array_values( array_unique( array_filter( array_map( 'intval', $user_ids ) ) ) );
		if ( empty( $user_ids ) ) {
			return 0;
		}
		$rows = $this->repo->mark_html_outdated( $user_ids );
		$this->announce( $user_ids, $reason, $rows );
		return $rows;
	}

	/**
	 * Marks every signature's HTML outdated.
	 *
	 * @since 1.3.0
	 *
	 * @param string $reason One of the REASON_* constants.
	 *
	 * @return int Rows marked.
	 */
	public function mark_all( string $reason ): int {
		$rows = $this->repo->mark_html_outdated( null );
		$this->announce( null, $reason, $rows );
		return $rows;
	}

	/**
	 * `imgsig/profile/updated` — plugin-stored profile values changed.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $user_id User.
	 *
	 * @return void
	 */
	public function on_profile_updated( $user_id ): void {
		$this->mark_users( [ (int) $user_id ], self::REASON_PROFILE );
	}

	/**
	 * `profile_update` — only when a `wp_users` column the signature
	 * reads actually changed (a password or colour-scheme change doesn't).
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $user_id       User.
	 * @param mixed $old_user_data WP_User before the update.
	 *
	 * @return void
	 */
	public function on_wp_profile_update( $user_id, $old_user_data = null ): void {
		$user_id = (int) $user_id;
		$current = $user_id > 0 ? get_userdata( $user_id ) : false;
		if ( ! is_object( $current ) ) {
			return;
		}
		if ( is_object( $old_user_data ) ) {
			$changed = false;
			foreach ( self::USER_COLUMNS as $column ) {
				if ( (string) ( $old_user_data->{$column} ?? '' ) !== (string) ( $current->{$column} ?? '' ) ) {
					$changed = true;
					break;
				}
			}
			if ( ! $changed ) {
				return;
			}
		}
		$this->mark_users( [ $user_id ], self::REASON_USER );
	}

	/**
	 * `added_user_meta` / `updated_user_meta` / `deleted_user_meta` — fires
	 * for every user meta write on the site, so anything but a watched key
	 * returns at once. WordPress only fires "updated" when the value
	 * actually changed.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $meta_id  Meta id(s) (unused).
	 * @param mixed $user_id  User.
	 * @param mixed $meta_key Meta key.
	 *
	 * @return void
	 */
	public function on_user_meta_changed( $meta_id, $user_id, $meta_key ): void {
		unset( $meta_id );
		if ( ! is_string( $meta_key ) || ! isset( $this->watched_meta_keys()[ $meta_key ] ) ) {
			return;
		}
		$this->mark_users( [ (int) $user_id ], self::REASON_USER );
	}

	/**
	 * `imgsig/group/members_changed` — the footer override, campaign
	 * targeting and group order of these users may have changed.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $group_id Group.
	 * @param mixed $added    Users added.
	 * @param mixed $removed  Users removed.
	 *
	 * @return void
	 */
	public function on_members_changed( $group_id, $added = [], $removed = [] ): void {
		unset( $group_id );
		$this->mark_users( array_merge( (array) $added, (array) $removed ), self::REASON_GROUP );
	}

	/**
	 * `imgsig/group/saved` — an edited group may carry a new footer
	 * override or name (the first group alphabetically wins).
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $group_id Group.
	 * @param mixed $event    `created` | `updated`.
	 *
	 * @return void
	 */
	public function on_group_saved( $group_id, $event = 'updated' ): void {
		if ( 'updated' !== $event ) {
			return; // A new group has no members yet.
		}
		$this->mark_users( Groups::members( (int) $group_id ), self::REASON_GROUP );
	}

	/**
	 * `pre_delete_term` — runs while the group still has its members.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $term_id  Term.
	 * @param mixed $taxonomy Taxonomy.
	 *
	 * @return void
	 */
	public function on_term_deleting( $term_id, $taxonomy = '' ): void {
		if ( Groups::TAXONOMY !== $taxonomy ) {
			return;
		}
		$this->mark_users( Groups::members( (int) $term_id ), self::REASON_GROUP );
	}

	/**
	 * `imgsig/profile/fields_changed` — a field may now read another
	 * meta key, or a custom field was added or removed.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function on_profile_fields_changed(): void {
		$this->watched_meta = null;
		$this->mark_all( self::REASON_PROFILE_FIELDS );
	}

	/**
	 * `imgsig/site_settings/changed` — only the settings the compiled
	 * HTML contains: the compliance footer, the banner campaigns and the
	 * brand kit's company data (`{{company_*}}`). Palette or typography
	 * changes (editor defaults) don't outdate anything.
	 *
	 * @since 1.3.0
	 *
	 * @param mixed $changed Keys of the settings that changed.
	 * @param mixed $before  Values before the save, by key.
	 * @param mixed $after   Values after the save, by key.
	 *
	 * @return void
	 */
	public function on_site_settings_changed( $changed, $before = [], $after = [] ): void {
		$changed = is_array( $changed ) ? $changed : [];
		$before  = is_array( $before ) ? $before : [];
		$after   = is_array( $after ) ? $after : [];

		$relevant = in_array( 'compliance_footer', $changed, true ) || in_array( 'banner_campaigns', $changed, true );
		if ( ! $relevant && in_array( 'brand_kit', $changed, true ) ) {
			$relevant = BrandKit::company_variables( is_array( $before['brand_kit'] ?? null ) ? $before['brand_kit'] : [] )
				!== BrandKit::company_variables( is_array( $after['brand_kit'] ?? null ) ? $after['brand_kit'] : [] );
		}

		if ( in_array( 'banner_campaigns', $changed, true ) ) {
			// The daily window check starts from what was just saved.
			update_option( self::CAMPAIGN_WINDOW_OPTION, self::campaign_window_fingerprint(), false );
		}

		if ( $relevant ) {
			$this->mark_all( self::REASON_SITE_SETTINGS );
		}
	}

	/**
	 * Daily: a campaign that started or ended since the last check
	 * changes every compiled signature (campaigns are scheduled by day).
	 * The first check only records the current state.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function check_campaign_window(): void {
		$fingerprint = self::campaign_window_fingerprint();
		$stored      = get_option( self::CAMPAIGN_WINDOW_OPTION, null );
		if ( $stored === $fingerprint ) {
			return;
		}
		update_option( self::CAMPAIGN_WINDOW_OPTION, $fingerprint, false );
		if ( is_string( $stored ) ) {
			$this->mark_all( self::REASON_CAMPAIGN_WINDOW );
		}
	}

	/**
	 * Fingerprint of the campaigns inside their date window today
	 * (enabled, with an image), whatever their group targeting.
	 *
	 * @since 1.3.0
	 *
	 * @return string
	 */
	public static function campaign_window_fingerprint(): string {
		$today = current_time( 'Y-m-d' );
		$ids   = [];
		foreach ( SiteSettingsController::current_banner_campaigns() as $campaign ) {
			if ( empty( $campaign['enabled'] ) || empty( $campaign['image_url'] ) ) {
				continue;
			}
			if ( ! empty( $campaign['start_date'] ) && (string) $campaign['start_date'] > $today ) {
				continue;
			}
			if ( ! empty( $campaign['end_date'] ) && (string) $campaign['end_date'] < $today ) {
				continue;
			}
			$ids[] = (string) ( $campaign['id'] ?? '' );
		}
		sort( $ids );
		return md5( implode( ',', $ids ) );
	}

	/**
	 * User meta keys whose change outdates the owner's HTML: first / last
	 * name, every meta key a profile field reads (an ACF field, an HR
	 * sync…), plus whatever `imgsig/signature/stale_meta_keys` adds.
	 *
	 * @since 1.3.0
	 *
	 * @return array<string, true>
	 */
	public function watched_meta_keys(): array {
		if ( null !== $this->watched_meta ) {
			return $this->watched_meta;
		}

		$keys = self::USER_NAME_META;
		foreach ( ProfileFields::config()['mapping'] as $mapping ) {
			if ( ProfileFields::SOURCE_META === $mapping['source'] && '' !== $mapping['meta_key'] && ! in_array( $mapping['meta_key'], ProfileFields::USER_FIELDS, true ) ) {
				$keys[] = $mapping['meta_key'];
			}
		}

		/**
		 * Filters the user meta keys whose change marks the owner's
		 * compiled signature HTML as outdated — add the keys a
		 * `imgsig/editor/system_variables` callback reads.
		 *
		 * @since 1.3.0
		 *
		 * @param string[] $keys Meta keys.
		 */
		$keys = apply_filters( 'imgsig/signature/stale_meta_keys', $keys );

		$this->watched_meta = [];
		foreach ( is_array( $keys ) ? $keys : [] as $key ) {
			// The plugin's own records (deploy status, tokens…) never outdate HTML;
			// `imgsig_profile` is covered by `imgsig/profile/updated`.
			if ( is_string( $key ) && '' !== $key && 0 !== strpos( $key, 'imgsig_' ) ) {
				$this->watched_meta[ $key ] = true;
			}
		}
		return $this->watched_meta;
	}

	/**
	 * Fires `imgsig/signature/html_outdated`.
	 *
	 * @param int[]|null $user_ids Owners (null = everyone).
	 * @param string     $reason   Reason.
	 * @param int        $rows     Rows marked.
	 *
	 * @return void
	 */
	private function announce( ?array $user_ids, string $reason, int $rows ): void {
		/**
		 * Fires after stored signature HTML was marked outdated because
		 * an input outside the signature changed.
		 *
		 * @since 1.3.0
		 *
		 * @param int[]|null $user_ids Owners whose signatures were marked (null = everyone).
		 * @param string     $reason   `profile` | `user` | `group` | `profile_fields` | `site_settings` | `campaign_window`.
		 * @param int        $rows     Rows that were fresh and are now outdated.
		 */
		do_action( 'imgsig/signature/html_outdated', $user_ids, $reason, $rows );
	}
}
