<?php
/**
 * Public install page (`/<frontend slug>/install/<token>/`).
 *
 * @package ImaginaSignatures\Deployment\Install
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Install;

use ImaginaSignatures\Core\Plugin;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Settings\BrandKit;
use ImaginaSignatures\Setup\CapabilitiesInstaller;

defined( 'ABSPATH' ) || exit;

/**
 * Renders the standalone page an employee opens from their personal
 * install link: brand header, their primary signature in a sandboxed
 * `srcdoc` iframe, copy / download actions, per-client tabs with numbered
 * steps and an "I've installed it" button.
 *
 * No login: the token in the URL is the credential
 * ({@see InstallTokens::resolve_user_id()}). The page is therefore built
 * defensively:
 *
 *  - no theme, no wp_head(): a complete document of our own;
 *  - strict CSP — scripts only through a per-request nonce (the one
 *    plugin file `assets/install/install.js`), no plugins, no `<base>`,
 *    no forms, never framed; the signature iframe inherits it, and its
 *    `sandbox` blocks scripts on top;
 *  - `noindex` (meta + `X-Robots-Tag`), `Referrer-Policy: no-referrer`
 *    (the token never leaks through a Referer), `Cache-Control: no-store`;
 *  - the signature HTML is the server copy (`html_cache`), sanitised to
 *    the email-safe subset on save. The last compiled copy is served
 *    even while it is outdated (a newer design or profile awaits a
 *    recompile); only a signature that was never compiled shows "your
 *    signature is being prepared" instead;
 *  - every string is escaped for its context; the data the script needs
 *    travels in a JSON block encoded with `JSON_HEX_TAG | JSON_HEX_AMP`.
 *
 * {@see build()} is pure (returns status, headers and body) so it can be
 * tested; {@see serve()} emits it.
 *
 * @since 1.3.0
 */
final class InstallPage {

	/**
	 * Plugin-relative path of the page script.
	 */
	public const SCRIPT = 'assets/install/install.js';

	/**
	 * Client tabs, in display order.
	 *
	 * @var string[]
	 */
	public const CLIENTS = [ 'gmail', 'outlook-web', 'outlook-desktop', 'apple-mail', 'mobile' ];

	private const GMAIL_SETTINGS_URL       = 'https://mail.google.com/mail/u/0/#settings/general';
	private const OUTLOOK_WEB_SETTINGS_URL = 'https://outlook.live.com/mail/0/options/mail/messageContent';
	private const OUTLOOK_FOLDER           = '%APPDATA%\\Microsoft\\Signatures';

	/**
	 * @var InstallService
	 */
	private InstallService $service;

	/**
	 * @param InstallService $service Install status service.
	 */
	public function __construct( InstallService $service ) {
		$this->service = $service;
	}

	/**
	 * Router entry point: builds the page for `$token` and sends it.
	 *
	 * @since 1.3.0
	 *
	 * @param string $token Token from the URL (untrusted).
	 *
	 * @return void
	 */
	public static function serve( string $token ): void {
		$page = Plugin::instance()->container()->make( self::class );
		self::emit( $page->build( $token ) );
	}

	/**
	 * Sends a built response.
	 *
	 * @since 1.3.0
	 *
	 * @param array{status: int, headers: array<string, string>, body: string} $response Response.
	 *
	 * @return void
	 */
	public static function emit( array $response ): void {
		// Page-cache plugins (WP Rocket, W3TC, Super Cache, LiteSpeed…)
		// must never store a per-person page or replay its CSP nonce.
		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			define( 'DONOTCACHEPAGE', true ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Cache-plugin convention.
		}
		status_header( $response['status'] );
		nocache_headers();
		foreach ( $response['headers'] as $name => $value ) {
			header( $name . ': ' . $value );
		}
		echo $response['body']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Built from escaped parts in build().
	}

	/**
	 * Builds the response for a token.
	 *
	 * @since 1.3.0
	 *
	 * @param string $token Token from the URL (untrusted).
	 *
	 * @return array{status: int, headers: array<string, string>, body: string}
	 */
	public function build( string $token ): array {
		$nonce = base64_encode( random_bytes( 16 ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- CSP nonce encoding.
		$kit   = BrandKit::current();

		$user_id = InstallTokens::resolve_user_id( $token );
		$user    = $user_id > 0 ? get_userdata( $user_id ) : false;
		if ( ! $user || ! user_can( $user, CapabilitiesInstaller::CAP_USE ) ) {
			return $this->response( 404, $nonce, $this->message_page( $kit, __( 'This link is no longer valid', 'imagina-signatures' ), __( 'Install links can be replaced by a newer one. Ask your administrator to send you a new invitation.', 'imagina-signatures' ), (string) get_locale() ) );
		}

		$locale   = (string) get_user_locale( $user_id );
		$switched = '' !== $locale && determine_locale() !== $locale && switch_to_locale( $locale );

		try {
			$signature = $this->service->primary( $user_id );
			if ( null === $signature || ! InstallService::is_deployable( $signature ) ) {
				return $this->response( 200, $nonce, $this->message_page( $kit, __( 'Your signature is being prepared', 'imagina-signatures' ), __( 'Your administrator is still finishing your email signature. Come back to this link in a little while — it will be ready here.', 'imagina-signatures' ), $locale ) );
			}

			$this->service->mark_opened( $user_id );
			$record = $this->service->record( $user_id );

			return $this->response( 200, $nonce, $this->install_page( $kit, $user, $signature, $record, $token, $nonce, $locale ) );
		} finally {
			if ( $switched ) {
				restore_previous_locale();
			}
		}
	}

	/**
	 * Wraps a body with the security headers.
	 *
	 * @param int    $status HTTP status.
	 * @param string $nonce  CSP nonce.
	 * @param string $body   HTML.
	 *
	 * @return array{status: int, headers: array<string, string>, body: string}
	 */
	private function response( int $status, string $nonce, string $body ): array {
		return [
			'status'  => $status,
			'headers' => [
				'Content-Type'            => 'text/html; charset=UTF-8',
				'Content-Security-Policy' => self::content_security_policy( $nonce, [ self::origin_of( rest_url() ) ] ),
				'X-Frame-Options'         => 'DENY',
				'X-Content-Type-Options'  => 'nosniff',
				'Referrer-Policy'         => 'no-referrer',
				'X-Robots-Tag'            => 'noindex, nofollow, noarchive',
				'Cache-Control'           => 'no-store, max-age=0',
			],
			'body'    => $body,
		];
	}

	/**
	 * The page's Content-Security-Policy.
	 *
	 *  - `default-src 'none'`: nothing loads unless listed below;
	 *  - `script-src`: only elements carrying the per-request nonce;
	 *  - `style-src 'unsafe-inline'`: the email-safe signature HTML is all
	 *    inline `style` attributes (nonces cannot cover attributes);
	 *  - `img-src`: signature images and the logo live on any https host;
	 *  - `connect-src`: same origin + the REST origin ("I've installed it");
	 *  - no `<base>`, no forms, never framed.
	 *
	 * @since 1.3.0
	 *
	 * @param string   $nonce           Base64 nonce.
	 * @param string[] $connect_origins Extra `connect-src` origins.
	 *
	 * @return string
	 */
	public static function content_security_policy( string $nonce, array $connect_origins = [] ): string {
		$connect = '';
		foreach ( array_unique( $connect_origins ) as $origin ) {
			if ( preg_match( '#^https?://[a-z0-9.\-]+(?::\d{1,5})?$#i', (string) $origin ) ) {
				$connect .= ' ' . strtolower( (string) $origin );
			}
		}
		$nonce = preg_replace( '/[^A-Za-z0-9+\/=]/', '', $nonce );

		return implode(
			'; ',
			[
				"default-src 'none'",
				"script-src 'nonce-{$nonce}'",
				"style-src 'unsafe-inline'",
				"img-src 'self' https: data:",
				"connect-src 'self'{$connect}",
				"frame-src 'self'",
				"base-uri 'none'",
				"form-action 'none'",
				"frame-ancestors 'none'",
			]
		) . ';';
	}

	/**
	 * `scheme://host[:port]` of a URL ('' when unparsable).
	 *
	 * @param string $url URL.
	 *
	 * @return string
	 */
	private static function origin_of( string $url ): string {
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['host'] ) ) {
			return '';
		}
		$origin = strtolower( (string) ( $parts['scheme'] ?? 'https' ) ) . '://' . strtolower( (string) $parts['host'] );
		return isset( $parts['port'] ) ? $origin . ':' . (int) $parts['port'] : $origin;
	}

	/**
	 * A one-card page (invalid link / signature being prepared).
	 *
	 * @param array<string, mixed> $kit    Brand kit.
	 * @param string               $title  Heading.
	 * @param string               $text   Explanation.
	 * @param string               $locale Locale.
	 *
	 * @return string
	 */
	private function message_page( array $kit, string $title, string $text, string $locale ): string {
		$body = '<main class="wrap"><section class="card message"><h1>' . esc_html( $title ) . '</h1><p>' . esc_html( $text ) . '</p></section></main>';
		return $this->shell( $kit, $title, $body, $locale, '' );
	}

	/**
	 * The full install page.
	 *
	 * @param array<string, mixed> $kit       Brand kit.
	 * @param \WP_User|object      $user      Owner.
	 * @param Signature            $signature Deployable primary signature.
	 * @param array<string, mixed> $record    Install channel record.
	 * @param string               $token     Valid token.
	 * @param string               $nonce     CSP nonce.
	 * @param string               $locale    Owner's locale.
	 *
	 * @return string
	 */
	private function install_page( array $kit, $user, Signature $signature, array $record, string $token, string $nonce, string $locale ): string {
		$fragment = (string) $signature->html_cache;
		$text     = (string) $signature->html_text;
		$name     = trim( (string) ( $user->first_name ?? '' ) );
		$name     = '' !== $name ? $name : (string) $user->display_name;
		$state    = InstallService::state( $record, $signature->html_hash );
		$lang     = self::lang_tag( $locale );

		$h  = '<main class="wrap">';
		$h .= '<h1>' . esc_html__( 'Install your email signature', 'imagina-signatures' ) . '</h1>';
		/* translators: %s: the employee's first name. */
		$h .= '<p class="lead">' . esc_html( sprintf( __( 'Hi %s! This is your email signature. Pick your email client below and follow the steps — it takes about a minute.', 'imagina-signatures' ), $name ) ) . '</p>';

		if ( InstallService::STATE_OUTDATED === $state ) {
			$h .= '<p class="notice warn">' . esc_html__( 'Your signature has changed since you installed it. Install the new version below, then press "I\'ve installed it" again.', 'imagina-signatures' ) . '</p>';
		}

		// The signature, isolated: own document, no scripts (sandbox +
		// inherited CSP), links open outside the frame.
		$doc = '<!DOCTYPE html><html' . ( '' !== $lang ? ' lang="' . esc_attr( $lang ) . '"' : '' ) . '><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:16px;background:#ffffff">' . $fragment . '</body></html>';
		$h  .= '<section class="card preview"><h2 class="label">' . esc_html__( 'Your signature', 'imagina-signatures' ) . '</h2>';
		$h  .= '<iframe id="imgsig-install-preview" title="' . esc_attr__( 'Your signature', 'imagina-signatures' ) . '" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" srcdoc="' . self::attr_exact( $doc ) . '"></iframe></section>';

		$h .= '<div class="actions needs-js">';
		$h .= self::button( 'copy-rich', __( 'Copy signature', 'imagina-signatures' ), true );
		$h .= self::button( 'copy-html', __( 'Copy HTML', 'imagina-signatures' ) );
		$h .= self::button( 'download-html', __( 'Download .html', 'imagina-signatures' ) );
		$h .= '</div><p id="imgsig-install-status" class="status" role="status" aria-live="polite"></p>';

		$h .= '<section class="card"><h2>' . esc_html__( 'Install in your email client', 'imagina-signatures' ) . '</h2>';
		$h .= '<p class="muted">' . esc_html__( 'Pick your email client: each tab has the export it needs and the exact steps.', 'imagina-signatures' ) . '</p>';
		$h .= $this->client_tabs();
		$h .= '</section>';

		$h .= '<section class="card done needs-js"><h2>' . esc_html__( 'Finished?', 'imagina-signatures' ) . '</h2>';
		$h .= '<p>' . esc_html__( 'Once the signature shows up when you write a new email, let your administrator know you are all set.', 'imagina-signatures' ) . '</p>';
		$h .= self::button( 'installed', __( 'I\'ve installed it', 'imagina-signatures' ), true );
		$h .= '<p id="imgsig-install-state" class="muted">';
		if ( InstallService::STATE_INSTALLED === $state ) {
			$at = strtotime( (string) $record['installed_at'] . ' UTC' );
			/* translators: %s: date. */
			$h .= esc_html( sprintf( __( 'Installed on %s.', 'imagina-signatures' ), false !== $at ? (string) wp_date( (string) get_option( 'date_format', 'Y-m-d' ), $at ) : '' ) );
		}
		$h .= '</p></section>';

		$h .= '<p class="footnote">' . esc_html__( 'This page is personal to you. Please do not share its link.', 'imagina-signatures' ) . '</p>';
		$h .= '</main>';

		$data = [
			'fragment'     => $fragment,
			'text'         => '' !== trim( $text ) ? $text : wp_strip_all_tags( $fragment ),
			'name'         => $signature->name,
			'lang'         => $lang,
			'dir'          => function_exists( 'is_rtl' ) && is_rtl() ? 'rtl' : 'ltr',
			'installedUrl' => esc_url_raw( rest_url( 'imagina-signatures/v1/install/' . $token . '/installed' ) ),
			'i18n'         => [
				'copied'          => __( 'Copied!', 'imagina-signatures' ),
				'copyFailed'      => __( 'Could not copy — your browser blocked clipboard access. Use "Copy HTML" or one of the downloads instead.', 'imagina-signatures' ),
				'saving'          => __( 'Saving…', 'imagina-signatures' ),
				'installedOk'     => __( 'Thanks! Your administrator can now see that your signature is installed.', 'imagina-signatures' ),
				'installedFailed' => __( 'Could not save — please try again in a moment.', 'imagina-signatures' ),
				'installedLabel'  => __( 'Installed', 'imagina-signatures' ),
				'newTabTitle'     => __( 'Signature — press Cmd + A, then Cmd + C', 'imagina-signatures' ),
				'fileName'        => __( 'Signature', 'imagina-signatures' ),
			],
		];

		$scripts  = '<script type="application/json" id="imgsig-install-data">' . wp_json_encode( $data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . '</script>';
		$script   = add_query_arg( 'ver', defined( 'IMGSIG_VERSION' ) ? IMGSIG_VERSION : '0', plugins_url( self::SCRIPT, IMGSIG_FILE ) );
		// data-cfasync: Cloudflare Rocket Loader would re-create the script without its CSP nonce.
		$scripts .= '<script data-cfasync="false" src="' . esc_url( $script ) . '" nonce="' . esc_attr( $nonce ) . '" defer></script>'; // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedScript -- Standalone page without wp_head().

		return $this->shell( $kit, __( 'Install your email signature', 'imagina-signatures' ), $h, $locale, $scripts );
	}

	/**
	 * Tab list + one panel per client.
	 *
	 * @return string
	 */
	private function client_tabs(): string {
		$labels = [
			'gmail'           => __( 'Gmail / Google Workspace', 'imagina-signatures' ),
			'outlook-web'     => __( 'New Outlook / Outlook on the web', 'imagina-signatures' ),
			'outlook-desktop' => __( 'Outlook for Windows (classic)', 'imagina-signatures' ),
			'apple-mail'      => __( 'Apple Mail', 'imagina-signatures' ),
			'mobile'          => __( 'iPhone / Android', 'imagina-signatures' ),
		];

		$h = '<div class="tabs needs-js" role="tablist" aria-label="' . esc_attr__( 'Email client', 'imagina-signatures' ) . '">';
		foreach ( self::CLIENTS as $i => $client ) {
			$h .= sprintf(
				'<button type="button" role="tab" id="imgsig-tab-%1$s" aria-controls="imgsig-panel-%1$s" aria-selected="%2$s" tabindex="%3$s" data-imgsig-tab="%1$s">%4$s</button>',
				esc_attr( $client ),
				0 === $i ? 'true' : 'false',
				0 === $i ? '0' : '-1',
				esc_html( $labels[ $client ] )
			);
		}
		$h .= '</div>';

		foreach ( self::CLIENTS as $client ) {
			$h .= sprintf( '<section class="panel" role="tabpanel" id="imgsig-panel-%1$s" aria-labelledby="imgsig-tab-%1$s" data-imgsig-panel="%1$s" tabindex="0">', esc_attr( $client ) );
			$h .= '<h3 class="panel-title">' . esc_html( $labels[ $client ] ) . '</h3>';
			$h .= $this->panel( $client );
			$h .= '</section>';
		}

		return $h;
	}

	/**
	 * One client panel: actions, steps, notes.
	 *
	 * @param string $client Client id.
	 *
	 * @return string
	 */
	private function panel( string $client ): string {
		switch ( $client ) {
			case 'gmail':
				return '<div class="actions">'
					. self::button( 'copy-rich', __( 'Copy for Gmail', 'imagina-signatures' ), true )
					/* translators: %s: email client name. */
					. self::link( self::GMAIL_SETTINGS_URL, sprintf( __( 'Open %s settings', 'imagina-signatures' ), __( 'Gmail', 'imagina-signatures' ) ) )
					. '</div>'
					. self::steps(
						[
							__( 'Press "Copy for Gmail".', 'imagina-signatures' ),
							__( 'Open Gmail settings (link above) — or the gear icon → "See all settings" → "General" tab.', 'imagina-signatures' ),
							__( 'Scroll to "Signature", click "Create new" and give it a name.', 'imagina-signatures' ),
							__( 'Click into the signature box and paste (Cmd/Ctrl + V). Avoid editing it there afterwards — Gmail may drop formatting.', 'imagina-signatures' ),
							__( 'Under "Signature defaults" pick it for new emails and for replies/forwards, then click "Save changes" at the bottom of the page.', 'imagina-signatures' ),
						]
					)
					. self::note( __( 'Google Workspace: if the signature box is missing or locked, your administrator manages signatures centrally.', 'imagina-signatures' ) );

			case 'outlook-web':
				return '<div class="actions">'
					. self::button( 'copy-rich', __( 'Copy signature', 'imagina-signatures' ), true )
					/* translators: %s: email client name. */
					. self::link( self::OUTLOOK_WEB_SETTINGS_URL, sprintf( __( 'Open %s settings', 'imagina-signatures' ), __( 'Outlook on the web', 'imagina-signatures' ) ) )
					. '</div>'
					. self::steps(
						[
							__( 'Press "Copy signature" so the signature is in your clipboard.', 'imagina-signatures' ),
							__( 'Outlook on the web: Settings (gear) → Account → Signatures. New Outlook for Windows: Settings → Accounts → Signatures.', 'imagina-signatures' ),
							__( 'Click "+ New signature", give it a name, click into the editor and paste (Cmd/Ctrl + V).', 'imagina-signatures' ),
							__( 'Pick it under "Select default signatures" for new messages and for replies/forwards, then click "Save".', 'imagina-signatures' ),
						]
					);

			case 'outlook-desktop':
				return '<div class="actions">'
					. self::button( 'download-htm', __( 'Download for Outlook (.htm)', 'imagina-signatures' ), true )
					. self::button( 'download-txt', __( 'Download plain text (.txt)', 'imagina-signatures' ) )
					. self::button( 'copy-folder', __( 'Copy folder path', 'imagina-signatures' ) )
					. '</div>'
					. self::steps(
						[
							__( 'Download both files above. Keep their names identical — only the extension differs; the name is what Outlook lists.', 'imagina-signatures' ),
							__( 'Close Outlook completely.', 'imagina-signatures' ),
							/* translators: %s: Windows folder path. */
							sprintf( __( 'Press Windows + R, paste %s and press Enter. Create the "Signatures" folder if it does not exist.', 'imagina-signatures' ), self::OUTLOOK_FOLDER ),
							__( 'Move the two downloaded files into that folder.', 'imagina-signatures' ),
							__( 'Open Outlook → File → Options → Mail → Signatures…, choose the new signature for "New messages" and "Replies/forwards", then click "OK".', 'imagina-signatures' ),
						]
					)
					. self::note( __( 'If your organisation syncs Microsoft 365 cloud signatures, Outlook may replace files in that folder. Then press "Copy signature" and paste into File → Options → Mail → Signatures… → New instead.', 'imagina-signatures' ) );

			case 'apple-mail':
				return '<div class="actions">'
					. self::button( 'open-tab', __( 'Open signature in a new tab', 'imagina-signatures' ), true )
					. '</div>'
					. self::steps(
						[
							__( 'Press "Open signature in a new tab" (Safari works best). The tab shows only the signature.', 'imagina-signatures' ),
							__( 'In that tab press Cmd + A, then Cmd + C.', 'imagina-signatures' ),
							__( 'Open Mail → Settings… → Signatures, pick the account on the left and click "+" to add a signature.', 'imagina-signatures' ),
							__( 'Untick "Always match my default message font" — otherwise Mail replaces the signature’s fonts with your default font.', 'imagina-signatures' ),
							__( 'Click into the signature area on the right, delete the placeholder text and paste (Cmd + V). Close the window; Mail saves automatically.', 'imagina-signatures' ),
						]
					)
					. self::note( __( 'Send yourself a test message to check the result.', 'imagina-signatures' ) );

			default:
				return '<p>' . esc_html__( 'Open this page on your phone — the link in your invitation email works there too — and press "Copy signature".', 'imagina-signatures' ) . '</p>'
					. '<div class="actions">' . self::button( 'copy-rich', __( 'Copy signature', 'imagina-signatures' ), true ) . '</div>'
					. '<h4>' . esc_html__( 'iPhone / iPad (Mail)', 'imagina-signatures' ) . '</h4>'
					. self::steps(
						[
							__( 'Press "Copy signature" above.', 'imagina-signatures' ),
							__( 'Open Settings → Apps → Mail → Signature (older iOS: Settings → Mail → Signature), choose "All Accounts" or "Per Account", clear the field and paste.', 'imagina-signatures' ),
							__( 'iOS removes the formatting right after pasting: immediately shake the iPhone and tap "Undo" to bring the formatting back.', 'imagina-signatures' ),
							__( 'Go back to save.', 'imagina-signatures' ),
						]
					)
					. '<h4>' . esc_html__( 'Gmail app (Android / iPhone)', 'imagina-signatures' ) . '</h4>'
					. self::steps(
						[
							__( 'The Gmail app’s own "Mobile signature" is plain text only — images, colours and links are not kept. For the full visual signature, install it in Gmail on a computer (Gmail tab).', 'imagina-signatures' ),
							__( 'To set the text version: in the app open Settings → your account → Mobile signature and paste the signature (only its text is kept).', 'imagina-signatures' ),
						]
					)
					. '<h4>' . esc_html__( 'Outlook app (Android / iPhone)', 'imagina-signatures' ) . '</h4>'
					. self::steps(
						[
							__( 'Press "Copy signature" above.', 'imagina-signatures' ),
							__( 'Open the Outlook app → Settings → Signature (per account when offered) and paste.', 'imagina-signatures' ),
							__( 'How much formatting survives depends on the app version: send yourself a message to check, and keep the mobile signature simple if images are dropped.', 'imagina-signatures' ),
						]
					);
		}
	}

	/**
	 * An action button the script wires up.
	 *
	 * @param string $action  `data-imgsig-action` value.
	 * @param string $label   Label.
	 * @param bool   $primary Accent style.
	 *
	 * @return string
	 */
	private static function button( string $action, string $label, bool $primary = false ): string {
		return sprintf(
			'<button type="button" class="btn%1$s" data-imgsig-action="%2$s">%3$s</button>',
			$primary ? ' primary' : '',
			esc_attr( $action ),
			esc_html( $label )
		);
	}

	/**
	 * External settings link styled as a button.
	 *
	 * @param string $url   URL.
	 * @param string $label Label.
	 *
	 * @return string
	 */
	private static function link( string $url, string $label ): string {
		return '<a class="btn" href="' . esc_url( $url ) . '" target="_blank" rel="noopener noreferrer">' . esc_html( $label ) . ' ↗</a>';
	}

	/**
	 * Numbered steps.
	 *
	 * @param string[] $steps Plain-text steps.
	 *
	 * @return string
	 */
	private static function steps( array $steps ): string {
		$h = '<ol class="steps">';
		foreach ( $steps as $step ) {
			$h .= '<li>' . esc_html( $step ) . '</li>';
		}
		return $h . '</ol>';
	}

	/**
	 * Muted note.
	 *
	 * @param string $text Text.
	 *
	 * @return string
	 */
	private static function note( string $text ): string {
		return '<p class="note">' . esc_html( $text ) . '</p>';
	}

	/**
	 * Escapes a value for an attribute EXACTLY: every `&` is encoded too,
	 * so entities inside the signature (`&lt;`, `&amp;`) survive the
	 * attribute decoding of `srcdoc` instead of turning into markup.
	 * (`esc_attr()` deliberately leaves existing entities alone.)
	 *
	 * @since 1.3.0
	 *
	 * @param string $value Raw value.
	 *
	 * @return string
	 */
	public static function attr_exact( string $value ): string {
		return htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', true );
	}

	/**
	 * BCP 47 tag of a WP locale ('' when unusable).
	 *
	 * @param string $locale Locale (`es_ES`).
	 *
	 * @return string
	 */
	private static function lang_tag( string $locale ): string {
		$tag = str_replace( '_', '-', $locale );
		return 1 === preg_match( '/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/', $tag ) ? $tag : '';
	}

	/**
	 * Complete document: brand header + `$body` + scripts.
	 *
	 * @param array<string, mixed> $kit     Brand kit.
	 * @param string               $title   Document title.
	 * @param string               $body    Escaped body markup.
	 * @param string               $locale  Locale for `lang`.
	 * @param string               $scripts Script elements ('' for none).
	 *
	 * @return string
	 */
	private function shell( array $kit, string $title, string $body, string $locale, string $scripts ): string {
		$company = (string) $kit['company']['name'];
		$brand   = '' !== $company ? $company : (string) get_bloginfo( 'name' );
		$accent  = (string) $kit['typography']['accent_color'];
		$lang    = self::lang_tag( $locale );
		$dir     = function_exists( 'is_rtl' ) && is_rtl() ? 'rtl' : 'ltr';

		$logo = (string) $kit['company']['logo_url'];
		if ( '' !== $logo ) {
			$width   = min( 240, (int) $kit['company']['logo_width'] );
			$header  = '<img class="logo" src="' . esc_url( $logo ) . '" width="' . $width . '" alt="' . esc_attr( $brand ) . '">';
			$header .= '' !== $company ? '<span class="sr-only">' . esc_html( $company ) . '</span>' : '';
		} else {
			$header = '<span class="company">' . esc_html( $brand ) . '</span>';
		}

		$doc_title = '' !== $brand ? $title . ' — ' . $brand : $title;

		return '<!DOCTYPE html><html class="no-js"' . ( '' !== $lang ? ' lang="' . esc_attr( $lang ) . '"' : '' ) . ' dir="' . esc_attr( $dir ) . '"><head>'
			. '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
			. '<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer">'
			. '<title>' . esc_html( $doc_title ) . '</title>'
			. '<style>' . self::css( $accent ) . '</style></head><body>'
			. '<header class="brand"><div class="wrap">' . $header . '</div></header>'
			. $body
			. $scripts
			. '</body></html>';
	}

	/**
	 * Page styles (accent from the brand kit, already a validated hex).
	 *
	 * @param string $accent `#rgb` / `#rrggbb`.
	 *
	 * @return string
	 */
	private static function css( string $accent ): string {
		$accent = preg_match( '/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i', $accent ) ? $accent : '#2563eb';
		$on     = BrandColors::text_on( $accent );

		return ':root{--accent:' . $accent . ';--on-accent:' . $on . ';--text:#111827;--muted:#6b7280;--border:#e5e7eb;--bg:#f4f5f7}'
			. '*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}'
			. '.wrap{max-width:820px;margin:0 auto;padding:0 16px}'
			. '.brand{background:#fff;border-bottom:1px solid var(--border)}.brand .wrap{display:flex;align-items:center;min-height:64px;padding-top:12px;padding-bottom:12px}'
			. '.logo{display:block;max-height:48px;width:auto;max-width:240px;height:auto}.company{font-weight:700;font-size:18px}'
			. 'h1{font-size:24px;line-height:1.25;margin:28px 0 6px}h2{font-size:16px;margin:0 0 6px}h3,h4{font-size:14px;margin:16px 0 6px}'
			. '.lead{color:var(--muted);margin:0 0 20px}.muted,.note,.footnote{color:var(--muted)}.note{font-size:13px;background:#f8fafc;border-radius:6px;padding:8px 12px}'
			. '.footnote{font-size:12px;text-align:center;margin:24px 0 40px}'
			. '.card{background:#fff;border:1px solid var(--border);border-radius:10px;padding:20px;margin:0 0 16px}.message{margin-top:40px;text-align:center}'
			. '.label{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}'
			. '#imgsig-install-preview{display:block;width:100%;height:220px;min-height:80px;border:1px dashed var(--border);border-radius:6px;background:#fff}'
			. '.actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}'
			. '.btn{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:8px 14px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text);font:inherit;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer}'
			. '.btn:hover{background:#f9fafb}.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}.btn.primary:hover{filter:brightness(.95)}'
			. '.btn:focus-visible,[role=tab]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.btn[disabled]{opacity:.6;cursor:default}'
			. '.status{min-height:1.5em;margin:0 0 12px;font-size:14px;color:var(--muted)}.status.ok{color:#047857}.status.err{color:#b91c1c}'
			. '.notice{border-radius:8px;padding:10px 14px;margin:0 0 16px}.notice.warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e}'
			. '.tabs{display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--border);margin:12px 0 4px;padding-bottom:8px}'
			. '[role=tab]{border:0;background:none;font:inherit;font-size:13px;font-weight:600;color:var(--muted);padding:6px 10px;border-radius:6px;cursor:pointer}'
			. '[role=tab][aria-selected=true]{background:#eef2ff;color:var(--text);box-shadow:inset 0 -2px 0 var(--accent)}'
			. '.panel{padding-top:4px}.js .panel-title{display:none}.no-js .needs-js{display:none}'
			. '.steps{margin:8px 0;padding-left:22px}.steps li{margin:4px 0}'
			. '.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';
	}
}
