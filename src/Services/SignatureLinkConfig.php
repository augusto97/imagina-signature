<?php
/**
 * Linked-signature bootstrap for the editor.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Core\Plugin;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Models\Template;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Setup\DefaultTemplatesSeeder;

defined( 'ABSPATH' ) || exit;

/**
 * Builds `IMGSIG_EDITOR_CONFIG.signatureLink` and `canBypassLocks`
 * (1.3.0), shared by both editor bootstraps (`EditorAssetEnqueuer`
 * and `FrontendPage`) so they never drift apart:
 *
 * ```
 * signatureLink: {
 *   mode:         'linked' | 'detached',
 *   templateId:   int | null,
 *   employeeMode: 'free' | 'locked_design' | 'fields_only',
 *   templateName: string,
 * }
 * ```
 *
 * `employeeMode` comes from the template row (authoritative), not from
 * the copy of `settings` inside the signature.
 *
 * @since 1.3.0
 */
final class SignatureLinkConfig {

	/**
	 * Link state of the signature `$user_id` opens in the editor.
	 *
	 * @since 1.3.0
	 *
	 * @param int $signature_id Signature (0 = new).
	 * @param int $user_id      Editor user.
	 *
	 * @return array{mode: string, templateId: int|null, employeeMode: string, templateName: string}
	 */
	public static function for_signature( int $signature_id, int $user_id ): array {
		$detached = [
			'mode'         => Signature::LINK_DETACHED,
			'templateId'   => null,
			'employeeMode' => TemplateLink::MODE_FREE,
			'templateName' => '',
		];

		if ( $signature_id <= 0 || $user_id <= 0 ) {
			return $detached;
		}

		try {
			$container = Plugin::instance()->container();
			$signature = $container->make( SignatureRepository::class )->find_owned_by( $signature_id, $user_id );
			if ( null === $signature || null === $signature->template_id ) {
				return $detached;
			}
			$template = $container->make( TemplateRepository::class )->find( $signature->template_id );
		} catch ( \Throwable $e ) {
			return $detached;
		}

		return self::build( $signature, $template );
	}

	/**
	 * Pure part of {@see for_signature()}.
	 *
	 * @since 1.3.0
	 *
	 * @param Signature     $signature Signature row.
	 * @param Template|null $template  Its template (null when deleted).
	 *
	 * @return array{mode: string, templateId: int|null, employeeMode: string, templateName: string}
	 */
	public static function build( Signature $signature, ?Template $template ): array {
		if ( null === $template ) {
			return [
				'mode'         => Signature::LINK_DETACHED,
				'templateId'   => $signature->template_id,
				'employeeMode' => TemplateLink::MODE_FREE,
				'templateName' => '',
			];
		}

		$schema = json_decode( $template->json_content, true );

		return [
			'mode'         => $signature->is_linked() ? Signature::LINK_LINKED : Signature::LINK_DETACHED,
			'templateId'   => $template->id,
			'employeeMode' => is_array( $schema ) ? TemplateLink::employee_mode( $schema ) : TemplateLink::MODE_FREE,
			'templateName' => (string) ( DefaultTemplatesSeeder::localize( $template->to_array() )['name'] ?? $template->name ),
		];
	}

	/**
	 * Whether the editor user ignores locks and employee modes.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id Editor user.
	 *
	 * @return bool
	 */
	public static function can_bypass_locks( int $user_id ): bool {
		return TemplateLink::can_bypass_locks( $user_id );
	}
}
