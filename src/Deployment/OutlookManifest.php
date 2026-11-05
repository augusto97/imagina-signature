<?php
/**
 * Outlook add-in manifest (add-in only / XML manifest).
 *
 * @package ImaginaSignatures\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment;

use ImaginaSignatures\Settings\BrandKit;

defined( 'ABSPATH' ) || exit;

/**
 * Builds the XML manifest of the company's Outlook add-in.
 *
 * Microsoft offers no Graph API to set a user's (roaming) signature;
 * the supported route is an Outlook add-in that calls
 * `item.body.setSignatureAsync()` from an event-based handler. The
 * tenant admin uploads this manifest once (Microsoft 365 admin center →
 * Settings → Integrated apps → Upload custom apps) and assigns it to
 * users or groups; event-based activation only works for
 * admin-deployed add-ins.
 *
 * What the manifest declares:
 *
 *  - `MailApp`, permission `ReadWriteItem` (the least that
 *    `setSignatureAsync` / `disableClientSignatureAsync` need).
 *  - VersionOverrides V1_0 — an "Insert signature" compose button
 *    (function command) for clients without event-based activation.
 *  - VersionOverrides V1_1 — the same button, plus `LaunchEvent`
 *    handlers for `OnNewMessageCompose` and `OnNewAppointmentOrganizer`
 *    (desktop) and `OnNewMessageCompose` (MobileFormFactor). The
 *    `Runtime` is `assets/outlook/commands.html` (Outlook on the web,
 *    new Outlook for Windows, Mac, mobile) with a JavaScript override,
 *    `assets/outlook/launchevent.js`, for classic Outlook on Windows.
 *
 * Requirement set: event-based activation and `setSignatureAsync` need
 * Mailbox 1.10+ on desktop (every client that supports them supports
 * 1.12). Outlook on Android / iOS, however, only advertises Mailbox 1.5
 * while enabling those APIs for event handlers, and ignores an override
 * that asks for more — so the V1_1 override declares
 * {@see DEFAULT_OVERRIDE_MIN_MAILBOX} (filterable through
 * `imgsig/outlook/manifest_min_mailbox`, e.g. to '1.12' for a
 * desktop-only deployment) and the runtime feature-detects every call.
 *
 * Both runtime URLs carry the deployment key and the signature endpoint
 * in their query string (`?key=…&api=…`): the HTML runtime reads them
 * from `location.search`, the JavaScript-only runtime from
 * `Office.context.urls.javascriptRuntimeUrl`. That is why the manifest
 * itself is only served to callers that already know the key.
 *
 * The XML is assembled as a string with every value escaped
 * ({@see esc()}) — no dependency on the DOM / XMLWriter extensions.
 *
 * @since 1.3.0
 */
final class OutlookManifest {

	public const NS_OFFICEAPP = 'http://schemas.microsoft.com/office/appforoffice/1.1';
	public const NS_XSI       = 'http://www.w3.org/2001/XMLSchema-instance';
	public const NS_BT        = 'http://schemas.microsoft.com/office/officeappbasictypes/1.0';
	public const NS_MAILAPPOR = 'http://schemas.microsoft.com/office/mailappversionoverrides/1.0';
	public const NS_VO_1_0    = 'http://schemas.microsoft.com/office/mailappversionoverrides';
	public const NS_VO_1_1    = 'http://schemas.microsoft.com/office/mailappversionoverrides/1.1';

	/** Event handler names — must match `Office.actions.associate()` in launchevent.js. */
	public const HANDLER_MESSAGE     = 'onNewMessageComposeHandler';
	public const HANDLER_APPOINTMENT = 'onNewAppointmentOrganizerHandler';
	public const COMMAND_INSERT      = 'insertImaginaSignature';

	/** Event types. */
	public const EVENT_MESSAGE     = 'OnNewMessageCompose';
	public const EVENT_APPOINTMENT = 'OnNewAppointmentOrganizer';

	/** Minimum Mailbox set of the V1_1 override (see class doc). */
	public const DEFAULT_OVERRIDE_MIN_MAILBOX = '1.5';

	/** Icon sizes shipped in assets/outlook/ (icon-{size}.png). */
	public const ICON_SIZES = [ 16, 32, 64, 80, 128 ];

	/** Office limits: ShortStrings 125 characters, LongStrings 250. */
	private const MAX_SHORT = 125;
	private const MAX_LONG  = 250;

	/**
	 * Build context.
	 *
	 * @var array<string, mixed>
	 */
	private array $ctx;

	/**
	 * @param array<string, mixed> $ctx See {@see context()} for the keys.
	 */
	public function __construct( array $ctx ) {
		$this->ctx = $ctx;
	}

	/**
	 * Manifest for this site with the given settings.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $settings {@see OutlookSettings::get()}.
	 *
	 * @return self
	 */
	public static function for_site( array $settings ): self {
		return new self( self::context( $settings ) );
	}

	/**
	 * Resolves every site-dependent value the manifest needs.
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $settings {@see OutlookSettings::get()}.
	 *
	 * @return array<string, mixed>
	 */
	public static function context( array $settings ): array {
		$kit     = BrandKit::current();
		$company = trim( (string) ( $kit['company']['name'] ?? '' ) );
		$name    = '' !== $company ? $company : trim( wp_strip_all_tags( (string) get_bloginfo( 'name' ) ) );
		if ( '' === $name ) {
			$name = (string) wp_parse_url( home_url(), PHP_URL_HOST );
		}

		$home    = home_url( '/' );
		$version = defined( 'IMGSIG_VERSION' ) ? (string) IMGSIG_VERSION : '1.0.0';

		/**
		 * Filters the minimum Mailbox requirement set of the manifest's
		 * VersionOverrides V1_1 node ('1.5' keeps Outlook mobile eligible;
		 * '1.12' restricts the add-in to desktop / web clients).
		 *
		 * @since 1.3.0
		 *
		 * @param string $version Requirement set version.
		 */
		$min_mailbox = (string) apply_filters( 'imgsig/outlook/manifest_min_mailbox', self::DEFAULT_OVERRIDE_MIN_MAILBOX );
		if ( 1 !== preg_match( '/^1\.\d{1,2}$/', $min_mailbox ) ) {
			$min_mailbox = self::DEFAULT_OVERRIDE_MIN_MAILBOX;
		}

		return [
			'id'            => (string) ( $settings['add_in_id'] ?? '' ),
			'version'       => self::version_string( $version, (int) ( $settings['revision'] ?? 1 ) ),
			'locale'        => self::office_locale( (string) get_locale() ),
			'provider'      => $name,
			'display_name'  => sprintf(
				/* translators: %s: company or site name. */
				__( '%s signature', 'imagina-signatures' ),
				$name
			),
			'description'   => __( 'Adds your company email signature to new messages and meetings automatically.', 'imagina-signatures' ),
			'group_label'   => __( 'Signature', 'imagina-signatures' ),
			'button_label'  => __( 'Insert signature', 'imagina-signatures' ),
			'button_tip'    => __( 'Insert your company email signature into this message.', 'imagina-signatures' ),
			'support_url'   => $home,
			'app_domains'   => OutlookCors::own_origins(),
			'assets_url'    => trailingslashit( plugins_url( 'assets/outlook', IMGSIG_FILE ) ),
			'runtime_query' => self::runtime_query(
				(string) ( $settings['deploy_key'] ?? '' ),
				rest_url( 'imagina-signatures/v1/outlook/signature' )
			),
			'min_mailbox'   => $min_mailbox,
		];
	}

	/**
	 * Query string appended to both runtime URLs.
	 *
	 * @since 1.3.0
	 *
	 * @param string $key Deployment key.
	 * @param string $api Absolute URL of `GET /outlook/signature`.
	 *
	 * @return string Without the leading `?`.
	 */
	public static function runtime_query( string $key, string $api ): string {
		return 'key=' . rawurlencode( $key ) . '&api=' . rawurlencode( $api );
	}

	/**
	 * `<Version>`: the plugin's MAJOR.MINOR.PATCH plus the settings
	 * revision, so both a plugin update and a key regeneration produce a
	 * higher version (Microsoft rejects an update with the same one).
	 *
	 * @since 1.3.0
	 *
	 * @param string $plugin_version e.g. `1.3.0`.
	 * @param int    $revision       {@see OutlookSettings} revision.
	 *
	 * @return string e.g. `1.3.0.2`.
	 */
	public static function version_string( string $plugin_version, int $revision ): string {
		$parts   = array_slice( explode( '.', $plugin_version ), 0, 3 );
		$parts   = array_map(
			static function ( string $part ): int {
				return min( 65535, (int) preg_replace( '/\D.*$/', '', $part ) );
			},
			$parts
		);
		$parts   = array_pad( $parts, 3, 0 );
		$parts[] = max( 1, min( 65535, $revision ) );
		return implode( '.', $parts );
	}

	/**
	 * WordPress locale (`es_ES`) → Office locale (`es-ES`).
	 *
	 * @since 1.3.0
	 *
	 * @param string $locale WordPress locale.
	 *
	 * @return string
	 */
	public static function office_locale( string $locale ): string {
		if ( 1 === preg_match( '/^([a-z]{2,3})(?:_([A-Z]{2}))?/', $locale, $m ) ) {
			return isset( $m[2] ) ? $m[1] . '-' . $m[2] : $m[1];
		}
		return 'en-US';
	}

	/**
	 * The manifest document.
	 *
	 * @since 1.3.0
	 *
	 * @return string UTF-8 XML.
	 */
	public function to_xml(): string {
		$c       = $this->ctx;
		$assets  = (string) $c['assets_url'];
		$query   = (string) $c['runtime_query'];
		$runtime = $assets . 'commands.html?' . $query;
		$js      = $assets . 'launchevent.js?' . $query;

		$root = self::node(
			'OfficeApp',
			[
				'xmlns'           => self::NS_OFFICEAPP,
				'xmlns:xsi'       => self::NS_XSI,
				'xmlns:bt'        => self::NS_BT,
				'xmlns:mailappor' => self::NS_MAILAPPOR,
				'xsi:type'        => 'MailApp',
			],
			[
				self::node( 'Id', [], (string) $c['id'] ),
				self::node( 'Version', [], (string) $c['version'] ),
				self::node( 'ProviderName', [], self::clip( (string) $c['provider'], self::MAX_SHORT ) ),
				self::node( 'DefaultLocale', [], (string) $c['locale'] ),
				self::node( 'DisplayName', [ 'DefaultValue' => self::clip( (string) $c['display_name'], self::MAX_SHORT ) ] ),
				self::node( 'Description', [ 'DefaultValue' => self::clip( (string) $c['description'], self::MAX_LONG ) ] ),
				self::node( 'IconUrl', [ 'DefaultValue' => $assets . 'icon-64.png' ] ),
				self::node( 'HighResolutionIconUrl', [ 'DefaultValue' => $assets . 'icon-128.png' ] ),
				self::node( 'SupportUrl', [ 'DefaultValue' => (string) $c['support_url'] ] ),
				self::node(
					'AppDomains',
					[],
					array_map(
						static function ( $domain ): array {
							return self::node( 'AppDomain', [], (string) $domain );
						},
						array_values( (array) $c['app_domains'] )
					)
				),
				self::node( 'Hosts', [], [ self::node( 'Host', [ 'Name' => 'Mailbox' ] ) ] ),
				self::node(
					'Requirements',
					[],
					[
						self::node(
							'Sets',
							[],
							[
								self::node(
									'Set',
									[
										'Name'       => 'Mailbox',
										'MinVersion' => '1.1',
									]
								),
							]
						),
					]
				),
				self::node(
					'FormSettings',
					[],
					[
						self::node(
							'Form',
							[ 'xsi:type' => 'ItemEdit' ],
							[ self::node( 'DesktopSettings', [], [ self::node( 'SourceLocation', [ 'DefaultValue' => $runtime ] ) ] ) ]
						),
					]
				),
				self::node( 'Permissions', [], 'ReadWriteItem' ),
				self::node(
					'Rule',
					[
						'xsi:type' => 'RuleCollection',
						'Mode'     => 'Or',
					],
					[
						self::node(
							'Rule',
							[
								'xsi:type' => 'ItemIs',
								'ItemType' => 'Message',
								'FormType' => 'Edit',
							]
						),
						self::node(
							'Rule',
							[
								'xsi:type' => 'ItemIs',
								'ItemType' => 'Appointment',
								'FormType' => 'Edit',
							]
						),
					]
				),
				self::node( 'DisableEntityHighlighting', [], 'false' ),
				$this->version_overrides( $runtime, $js ),
			]
		);

		return '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
			. '<!-- Imagina Signatures — Outlook add-in. Generated by WordPress; contains this site\'s deployment key: share it only with your Microsoft 365 admins. -->' . "\n"
			. self::render( $root, 0 );
	}

	/**
	 * VersionOverrides V1_0 with the nested V1_1.
	 *
	 * @param string $runtime HTML runtime URL.
	 * @param string $js      JavaScript runtime URL.
	 *
	 * @return array<int, mixed>
	 */
	private function version_overrides( string $runtime, string $js ): array {
		$c = $this->ctx;

		$v11 = self::node(
			'VersionOverrides',
			[
				'xmlns'    => self::NS_VO_1_1,
				'xsi:type' => 'VersionOverridesV1_1',
			],
			[
				self::requirements( (string) $c['min_mailbox'] ),
				self::node(
					'Hosts',
					[],
					[
						self::node(
							'Host',
							[ 'xsi:type' => 'MailHost' ],
							[
								self::node(
									'Runtimes',
									[],
									[
										self::node(
											'Runtime',
											[ 'resid' => 'WebViewRuntime.Url' ],
											[
												self::node(
													'Override',
													[
														'type'  => 'javascript',
														'resid' => 'JSRuntime.Url',
													]
												),
											]
										),
									]
								),
								self::node(
									'DesktopFormFactor',
									[],
									[
										self::node( 'FunctionFile', [ 'resid' => 'Commands.Url' ] ),
										self::compose_button( 'imgsigV11' ),
										self::launch_events(
											[
												self::EVENT_MESSAGE => self::HANDLER_MESSAGE,
												self::EVENT_APPOINTMENT => self::HANDLER_APPOINTMENT,
											]
										),
									]
								),
								self::node(
									'MobileFormFactor',
									[],
									[ self::launch_events( [ self::EVENT_MESSAGE => self::HANDLER_MESSAGE ] ) ]
								),
							]
						),
					]
				),
				$this->resources( $runtime, $js ),
			]
		);

		return self::node(
			'VersionOverrides',
			[
				'xmlns'    => self::NS_VO_1_0,
				'xsi:type' => 'VersionOverridesV1_0',
			],
			[
				self::requirements( '1.3' ),
				self::node(
					'Hosts',
					[],
					[
						self::node(
							'Host',
							[ 'xsi:type' => 'MailHost' ],
							[
								self::node(
									'DesktopFormFactor',
									[],
									[
										self::node( 'FunctionFile', [ 'resid' => 'Commands.Url' ] ),
										self::compose_button( 'imgsigV10' ),
									]
								),
							]
						),
					]
				),
				$this->resources( $runtime, '' ),
				$v11,
			]
		);
	}

	/**
	 * `<Requirements><bt:Sets>` block.
	 *
	 * @param string $min Minimum Mailbox version.
	 *
	 * @return array<int, mixed>
	 */
	private static function requirements( string $min ): array {
		return self::node(
			'Requirements',
			[],
			[ self::node( 'bt:Sets', [ 'DefaultMinVersion' => $min ], [ self::node( 'bt:Set', [ 'Name' => 'Mailbox' ] ) ] ) ]
		);
	}

	/**
	 * Compose-surface "Insert signature" button (function command).
	 *
	 * @param string $prefix Id prefix — ids must be unique per override.
	 *
	 * @return array<int, mixed>
	 */
	private static function compose_button( string $prefix ): array {
		return self::node(
			'ExtensionPoint',
			[ 'xsi:type' => 'MessageComposeCommandSurface' ],
			[
				self::node(
					'OfficeTab',
					[ 'id' => 'TabDefault' ],
					[
						self::node(
							'Group',
							[ 'id' => $prefix . 'ComposeGroup' ],
							[
								self::node( 'Label', [ 'resid' => 'Group.Label' ] ),
								self::node(
									'Control',
									[
										'xsi:type' => 'Button',
										'id'       => $prefix . 'InsertButton',
									],
									[
										self::node( 'Label', [ 'resid' => 'InsertButton.Label' ] ),
										self::node(
											'Supertip',
											[],
											[
												self::node( 'Title', [ 'resid' => 'InsertButton.Label' ] ),
												self::node( 'Description', [ 'resid' => 'InsertButton.Tooltip' ] ),
											]
										),
										self::node(
											'Icon',
											[],
											[
												self::node(
													'bt:Image',
													[
														'size'  => '16',
														'resid' => 'Icon.16x16',
													]
												),
												self::node(
													'bt:Image',
													[
														'size'  => '32',
														'resid' => 'Icon.32x32',
													]
												),
												self::node(
													'bt:Image',
													[
														'size'  => '80',
														'resid' => 'Icon.80x80',
													]
												),
											]
										),
										self::node(
											'Action',
											[ 'xsi:type' => 'ExecuteFunction' ],
											[ self::node( 'FunctionName', [], self::COMMAND_INSERT ) ]
										),
									]
								),
							]
						),
					]
				),
			]
		);
	}

	/**
	 * `LaunchEvent` extension point.
	 *
	 * @param array<string, string> $events Event type => handler name.
	 *
	 * @return array<int, mixed>
	 */
	private static function launch_events( array $events ): array {
		$children = [];
		foreach ( $events as $type => $handler ) {
			$children[] = self::node(
				'LaunchEvent',
				[
					'Type'         => $type,
					'FunctionName' => $handler,
				]
			);
		}
		return self::node(
			'ExtensionPoint',
			[ 'xsi:type' => 'LaunchEvent' ],
			[
				self::node( 'LaunchEvents', [], $children ),
				self::node( 'SourceLocation', [ 'resid' => 'WebViewRuntime.Url' ] ),
			]
		);
	}

	/**
	 * `<Resources>` block.
	 *
	 * @param string $runtime HTML runtime URL.
	 * @param string $js      JavaScript runtime URL ('' = V1_0, which has no runtimes).
	 *
	 * @return array<int, mixed>
	 */
	private function resources( string $runtime, string $js ): array {
		$c      = $this->ctx;
		$assets = (string) $c['assets_url'];

		$images = [];
		foreach ( [ 16, 32, 80 ] as $size ) {
			$images[] = self::node(
				'bt:Image',
				[
					'id'           => 'Icon.' . $size . 'x' . $size,
					'DefaultValue' => $assets . 'icon-' . $size . '.png',
				]
			);
		}

		$urls = [
			self::node(
				'bt:Url',
				[
					'id'           => 'Commands.Url',
					'DefaultValue' => $runtime,
				]
			),
		];
		if ( '' !== $js ) {
			$urls[] = self::node(
				'bt:Url',
				[
					'id'           => 'WebViewRuntime.Url',
					'DefaultValue' => $runtime,
				]
			);
			$urls[] = self::node(
				'bt:Url',
				[
					'id'           => 'JSRuntime.Url',
					'DefaultValue' => $js,
				]
			);
		}

		return self::node(
			'Resources',
			[],
			[
				self::node( 'bt:Images', [], $images ),
				self::node( 'bt:Urls', [], $urls ),
				self::node(
					'bt:ShortStrings',
					[],
					[
						self::node(
							'bt:String',
							[
								'id'           => 'Group.Label',
								'DefaultValue' => self::clip( (string) $c['group_label'], self::MAX_SHORT ),
							]
						),
						self::node(
							'bt:String',
							[
								'id'           => 'InsertButton.Label',
								'DefaultValue' => self::clip( (string) $c['button_label'], self::MAX_SHORT ),
							]
						),
					]
				),
				self::node(
					'bt:LongStrings',
					[],
					[
						self::node(
							'bt:String',
							[
								'id'           => 'InsertButton.Tooltip',
								'DefaultValue' => self::clip( (string) $c['button_tip'], self::MAX_LONG ),
							]
						),
					]
				),
			]
		);
	}

	/**
	 * Node tuple: [name, attributes, children (list) | text (string) | null].
	 *
	 * @param string                        $name     Qualified element name.
	 * @param array<string, string>         $attrs    Attributes.
	 * @param array<int, mixed>|string|null $children Child nodes or text.
	 *
	 * @return array<int, mixed>
	 */
	private static function node( string $name, array $attrs = [], $children = null ): array {
		return [ $name, $attrs, $children ];
	}

	/**
	 * Serialises a node tree with two-space indentation.
	 *
	 * @param array<int, mixed> $node  Node tuple.
	 * @param int               $depth Indentation level.
	 *
	 * @return string
	 */
	private static function render( array $node, int $depth ): string {
		[ $name, $attrs, $children ] = $node;
		$pad                         = str_repeat( '  ', $depth );
		$out                         = $pad . '<' . $name;
		foreach ( $attrs as $attr => $value ) {
			$out .= ' ' . $attr . '="' . self::esc( (string) $value ) . '"';
		}

		if ( null === $children || [] === $children ) {
			return $out . "/>\n";
		}
		if ( is_string( $children ) ) {
			return $out . '>' . self::esc( $children ) . '</' . $name . ">\n";
		}

		$out .= ">\n";
		foreach ( $children as $child ) {
			$out .= self::render( $child, $depth + 1 );
		}
		return $out . $pad . '</' . $name . ">\n";
	}

	/**
	 * XML-escapes a text / attribute value and drops characters XML 1.0
	 * can't carry (control characters from a pasted company name).
	 *
	 * @param string $value Raw value.
	 *
	 * @return string
	 */
	private static function esc( string $value ): string {
		$value = (string) preg_replace( '/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u', '', $value );
		return htmlspecialchars( $value, ENT_QUOTES | ENT_XML1, 'UTF-8' );
	}

	/**
	 * Truncates to `$max` characters (multibyte-safe).
	 *
	 * @param string $value Value.
	 * @param int    $max   Maximum characters.
	 *
	 * @return string
	 */
	private static function clip( string $value, int $max ): string {
		$value = trim( $value );
		if ( function_exists( 'mb_strlen' ) && function_exists( 'mb_substr' ) ) {
			return mb_strlen( $value, 'UTF-8' ) > $max ? rtrim( mb_substr( $value, 0, $max - 1, 'UTF-8' ) ) . '…' : $value;
		}
		return strlen( $value ) > $max ? substr( $value, 0, $max ) : $value;
	}
}
