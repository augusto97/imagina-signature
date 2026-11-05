<?php
/**
 * Invitation and reminder emails for the install link.
 *
 * @package ImaginaSignatures\Deployment\Install
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Install;

use ImaginaSignatures\Settings\BrandKit;

defined( 'ABSPATH' ) || exit;

/**
 * Builds and sends the "your signature is ready" invitation and the
 * reminder that follows it.
 *
 * Every email is multipart/alternative: a table-based, inline-styled
 * HTML part branded with the brand kit (logo, company name, accent
 * colour) and a plain-text part. Everything user- or admin-supplied
 * (names, the admin's message, the company name) is escaped; the only
 * URLs written are the install link and the brand-kit logo, both
 * already validated http(s) URLs, escaped again on output.
 *
 * The email is rendered in the RECIPIENT's locale.
 *
 * Not `final` so PHPUnit 9 can double it in the queue tests.
 *
 * @since 1.3.0
 */
class InvitationMailer {

	public const KIND_INVITE   = 'invite';
	public const KIND_REMINDER = 'reminder';

	/**
	 * Longest admin message kept (characters).
	 */
	public const MAX_MESSAGE_LENGTH = 2000;

	/**
	 * Widest logo drawn in the email header (px).
	 */
	private const MAX_LOGO_WIDTH = 200;

	/**
	 * Builds the subject, HTML and plain-text body.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_User|object           $user        Recipient (needs `display_name`, `first_name` optional).
	 * @param string                    $install_url Personal install link.
	 * @param string                    $kind        {@see KIND_INVITE} or {@see KIND_REMINDER}.
	 * @param string                    $message     Optional admin message (plain text).
	 * @param array<string, mixed>|null $kit Brand kit; null reads the stored one.
	 *
	 * @return array{subject: string, html: string, text: string}
	 */
	public function build( $user, string $install_url, string $kind, string $message = '', ?array $kit = null ): array {
		$kit      = null === $kit ? BrandKit::current() : BrandKit::sanitize( $kit );
		$company  = (string) $kit['company']['name'];
		$brand    = '' !== $company ? $company : (string) get_bloginfo( 'name' );
		$accent   = (string) $kit['typography']['accent_color'];
		$text_col = (string) $kit['typography']['text_color'];
		$on_acc   = BrandColors::text_on( $accent );
		$name     = self::first_name( $user );
		$message  = self::clean_message( $message );
		$reminder = self::KIND_REMINDER === $kind;

		$subject = $reminder
			? __( 'Reminder: install your email signature', 'imagina-signatures' )
			: __( 'Your email signature is ready', 'imagina-signatures' );

		/* translators: %s: recipient's first name. */
		$greeting = sprintf( __( 'Hi %s,', 'imagina-signatures' ), $name );
		$intro    = $reminder
			? __( 'Your new email signature is still waiting to be installed. It only takes a minute: open your personal link and follow the steps for your email client.', 'imagina-signatures' )
			: __( 'Your new email signature is ready. Open your personal link to install it in Gmail, Outlook, Apple Mail or your phone — it takes about a minute.', 'imagina-signatures' );
		$cta      = __( 'Install my signature', 'imagina-signatures' );
		$fallback = __( 'Or copy this link into your browser:', 'imagina-signatures' );
		$private  = __( 'This link is personal. Please do not forward this email.', 'imagina-signatures' );
		$from_adm = __( 'Message from your administrator:', 'imagina-signatures' );

		$font = 'Arial,Helvetica,sans-serif';
		$url  = esc_url( $install_url );

		$logo_url = (string) $kit['company']['logo_url'];
		if ( '' !== $logo_url ) {
			$width  = min( self::MAX_LOGO_WIDTH, (int) $kit['company']['logo_width'] );
			$header = sprintf(
				'<img src="%1$s" width="%2$d" alt="%3$s" style="display:block;border:0;outline:none;width:%2$dpx;max-width:100%%;height:auto">',
				esc_url( $logo_url ),
				$width,
				esc_attr( $brand )
			);
		} else {
			$header = sprintf(
				'<span style="font-family:%1$s;font-size:18px;font-weight:bold;color:%2$s">%3$s</span>',
				$font,
				esc_attr( $text_col ),
				esc_html( $brand )
			);
		}

		$message_html = '';
		if ( '' !== $message ) {
			$message_html = sprintf(
				'<tr><td style="padding:16px 32px 0 32px"><div style="font-family:%1$s;font-size:12px;color:#6b7280;margin:0 0 6px 0">%2$s</div><div style="font-family:%1$s;font-size:14px;line-height:1.5;color:%3$s;background:#f8fafc;border-left:3px solid %4$s;padding:10px 14px">%5$s</div></td></tr>',
				$font,
				esc_html( $from_adm ),
				esc_attr( $text_col ),
				esc_attr( $accent ),
				nl2br( esc_html( $message ), false )
			);
		}

		$html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' . esc_html( $subject ) . '</title></head>'
			. '<body style="margin:0;padding:0;background:#f4f5f7">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7"><tr><td align="center" style="padding:24px 12px">'
			. '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px">'
			. '<tr><td style="padding:28px 32px 0 32px">' . $header . '</td></tr>'
			. sprintf( '<tr><td style="padding:24px 32px 0 32px;font-family:%1$s;font-size:15px;line-height:1.5;color:%2$s">%3$s</td></tr>', $font, esc_attr( $text_col ), esc_html( $greeting ) )
			. sprintf( '<tr><td style="padding:8px 32px 0 32px;font-family:%1$s;font-size:15px;line-height:1.5;color:%2$s">%3$s</td></tr>', $font, esc_attr( $text_col ), esc_html( $intro ) )
			. $message_html
			. '<tr><td style="padding:24px 32px 0 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
			. sprintf(
				'<td bgcolor="%1$s" style="background:%1$s;border-radius:6px"><a href="%2$s" target="_blank" style="display:inline-block;padding:12px 22px;font-family:%3$s;font-size:15px;font-weight:bold;color:%4$s;text-decoration:none;border-radius:6px">%5$s</a></td>',
				esc_attr( $accent ),
				$url,
				$font,
				esc_attr( $on_acc ),
				esc_html( $cta )
			)
			. '</tr></table></td></tr>'
			. sprintf(
				'<tr><td style="padding:20px 32px 0 32px;font-family:%1$s;font-size:12px;line-height:1.5;color:#6b7280">%2$s<br><a href="%3$s" style="color:%4$s;word-break:break-all">%3$s</a></td></tr>',
				$font,
				esc_html( $fallback ),
				$url,
				esc_attr( (string) $kit['typography']['link_color'] )
			)
			. sprintf(
				'<tr><td style="padding:20px 32px 28px 32px;font-family:%1$s;font-size:12px;line-height:1.5;color:#9ca3af">%2$s<br>%3$s</td></tr>',
				$font,
				esc_html( $private ),
				esc_html( $brand )
			)
			. '</table></td></tr></table></body></html>';

		$lines = [ $greeting, '', $intro, '' ];
		if ( '' !== $message ) {
			$lines[] = $from_adm;
			foreach ( preg_split( '/\R/u', $message ) ?: [] as $line ) {
				$lines[] = '> ' . $line;
			}
			$lines[] = '';
		}
		$lines[] = $cta . ': ' . $install_url;
		$lines[] = '';
		$lines[] = $private;
		$lines[] = '-- ';
		$lines[] = $brand;

		return [
			'subject' => $subject,
			'html'    => $html,
			'text'    => implode( "\n", $lines ),
		];
	}

	/**
	 * Sends the email (multipart/alternative) in the recipient's locale.
	 *
	 * @since 1.3.0
	 *
	 * @param \WP_User|object      $user        Recipient (`ID`, `user_email`, `display_name`).
	 * @param string               $install_url Personal install link.
	 * @param string               $kind        Email kind.
	 * @param string               $message     Optional admin message.
	 * @param \WP_User|object|null $reply_to    Admin who sent the invitation (Reply-To), if any.
	 *
	 * @return bool Whether wp_mail() accepted it.
	 */
	public function send( $user, string $install_url, string $kind, string $message = '', $reply_to = null ): bool {
		$locale   = function_exists( 'get_user_locale' ) ? (string) get_user_locale( (int) $user->ID ) : '';
		$switched = '' !== $locale && function_exists( 'switch_to_locale' ) && switch_to_locale( $locale );

		try {
			$mail = $this->build( $user, $install_url, $kind, $message );
		} finally {
			if ( $switched ) {
				restore_previous_locale();
			}
		}

		$headers = [ 'Content-Type: text/html; charset=UTF-8' ];
		if ( is_object( $reply_to ) && ! empty( $reply_to->user_email ) && is_email( $reply_to->user_email ) ) {
			$reply_name = trim( (string) preg_replace( '/[\r\n"<>]+/', ' ', (string) ( $reply_to->display_name ?? '' ) ) );
			$headers[]  = 'Reply-To: ' . ( '' !== $reply_name ? '"' . $reply_name . '" ' : '' ) . '<' . $reply_to->user_email . '>';
		}

		$alt_body = $mail['text'];

		// wp_mail() has no multipart API; PHPMailer turns a non-empty
		// AltBody into multipart/alternative. Scoped to this one send.
		$set_alt_body = static function ( $phpmailer ) use ( $alt_body ): void {
			if ( is_object( $phpmailer ) && property_exists( $phpmailer, 'AltBody' ) ) {
				$phpmailer->AltBody = $alt_body; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
			}
		};
		add_action( 'phpmailer_init', $set_alt_body );

		try {
			return (bool) wp_mail( (string) $user->user_email, $mail['subject'], $mail['html'], $headers );
		} finally {
			remove_action( 'phpmailer_init', $set_alt_body );
		}
	}

	/**
	 * Plain-text admin message: tags stripped, length capped.
	 *
	 * @since 1.3.0
	 *
	 * @param string $message Untrusted text.
	 *
	 * @return string
	 */
	public static function clean_message( string $message ): string {
		$message = trim( sanitize_textarea_field( $message ) );
		if ( function_exists( 'mb_substr' ) ) {
			return mb_substr( $message, 0, self::MAX_MESSAGE_LENGTH );
		}
		return substr( $message, 0, self::MAX_MESSAGE_LENGTH );
	}

	/**
	 * Recipient's first name, else display name.
	 *
	 * @param \WP_User|object $user User.
	 *
	 * @return string
	 */
	private static function first_name( $user ): string {
		$first = isset( $user->first_name ) ? trim( (string) $user->first_name ) : '';
		if ( '' !== $first ) {
			return $first;
		}
		return isset( $user->display_name ) ? trim( (string) $user->display_name ) : '';
	}
}
