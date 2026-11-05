<?php
/**
 * Core service provider — wires plugin services into the DI container.
 *
 * @package ImaginaSignatures\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Core;

use ImaginaSignatures\Api\Controllers\AssetsController;
use ImaginaSignatures\Api\Controllers\DeployInvitationsController;
use ImaginaSignatures\Api\Controllers\InstallController;
use ImaginaSignatures\Api\Controllers\FrontendAccessController;
use ImaginaSignatures\Api\Controllers\GroupsController;
use ImaginaSignatures\Api\Controllers\MeController;
use ImaginaSignatures\Api\Controllers\OutlookController;
use ImaginaSignatures\Api\Controllers\ProfileController;
use ImaginaSignatures\Api\Controllers\ProfileImportController;
use ImaginaSignatures\Api\Controllers\SignaturesController;
use ImaginaSignatures\Api\Controllers\SiteSettingsController;
use ImaginaSignatures\Api\Controllers\StorageController;
use ImaginaSignatures\Api\Controllers\TeamSignaturesController;
use ImaginaSignatures\Api\Controllers\TemplatesController;
use ImaginaSignatures\Api\Controllers\UploadController;
use ImaginaSignatures\Api\Middleware\RateLimiter;
use ImaginaSignatures\Deployment\Gmail\GmailServiceProvider;
use ImaginaSignatures\Deployment\OutlookSignatureService;
use ImaginaSignatures\Deployment\Install\InstallPage;
use ImaginaSignatures\Deployment\Install\InstallReminders;
use ImaginaSignatures\Deployment\Install\InstallService;
use ImaginaSignatures\Deployment\Install\InvitationMailer;
use ImaginaSignatures\Deployment\Install\InvitationQueue;
use ImaginaSignatures\Privacy\UserDataManager;
use ImaginaSignatures\Repositories\AssetRepository;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;
use ImaginaSignatures\Security\Encryption;
use ImaginaSignatures\Security\RateLimitStore;
use ImaginaSignatures\Services\HtmlSanitizer;
use ImaginaSignatures\Services\JsonSchemaValidator;
use ImaginaSignatures\Services\SchemaSanitizer;
use ImaginaSignatures\Services\SignatureService;
use ImaginaSignatures\Services\TemplateAssignmentService;
use ImaginaSignatures\Services\TemplatePropagator;
use ImaginaSignatures\Services\TemplateService;
use ImaginaSignatures\Storage\StorageManager;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the long-lived plugin services into the container.
 *
 * Called once from {@see Plugin::boot()} before any module-specific
 * registration runs. Sub-systems that need their own bindings hook
 * into {@see \ImaginaSignatures\Hooks\Actions::PLUGIN_BOOTED} so they
 * can resolve from this base set.
 *
 * @since 1.0.0
 */
final class ServiceProvider {

	/**
	 * Registers core bindings.
	 *
	 * @since 1.0.0
	 *
	 * @param Container $container The plugin's DI container.
	 *
	 * @return void
	 */
	public static function register( Container $container ): void {
		// Storage / security primitives.
		$container->singleton(
			Encryption::class,
			static function (): Encryption {
				return new Encryption();
			}
		);
		$container->singleton(
			StorageManager::class,
			static function ( Container $c ): StorageManager {
				return new StorageManager( $c->make( Encryption::class ) );
			}
		);

		// Domain helpers.
		$container->singleton(
			JsonSchemaValidator::class,
			static function (): JsonSchemaValidator {
				return new JsonSchemaValidator();
			}
		);
		$container->singleton(
			HtmlSanitizer::class,
			static function (): HtmlSanitizer {
				return new HtmlSanitizer();
			}
		);
		$container->singleton(
			SchemaSanitizer::class,
			static function ( Container $c ): SchemaSanitizer {
				return new SchemaSanitizer( $c->make( HtmlSanitizer::class ) );
			}
		);

		// Rate-limit primitives.
		$container->singleton(
			RateLimitStore::class,
			static function (): RateLimitStore {
				return new RateLimitStore();
			}
		);
		$container->singleton(
			RateLimiter::class,
			static function ( Container $c ): RateLimiter {
				return new RateLimiter( $c->make( RateLimitStore::class ) );
			}
		);

		// Repositories. Each one needs $wpdb at construction time —
		// resolved lazily so test harnesses can rebind it.
		$container->singleton(
			SignatureRepository::class,
			static function (): SignatureRepository {
				global $wpdb;
				return new SignatureRepository( $wpdb );
			}
		);
		$container->singleton(
			TemplateRepository::class,
			static function (): TemplateRepository {
				global $wpdb;
				return new TemplateRepository( $wpdb );
			}
		);
		$container->singleton(
			AssetRepository::class,
			static function (): AssetRepository {
				global $wpdb;
				return new AssetRepository( $wpdb );
			}
		);

		// Domain services.
		$container->singleton(
			SignatureService::class,
			static function ( Container $c ): SignatureService {
				return new SignatureService(
					$c->make( SignatureRepository::class ),
					$c->make( JsonSchemaValidator::class ),
					$c->make( SchemaSanitizer::class ),
					$c->make( TemplateRepository::class )
				);
			}
		);
		// Linked signatures (1.3.0).
		$container->singleton(
			TemplatePropagator::class,
			static function ( Container $c ): TemplatePropagator {
				return new TemplatePropagator(
					$c->make( SignatureRepository::class ),
					$c->make( TemplateRepository::class )
				);
			}
		);
		$container->singleton(
			TemplateAssignmentService::class,
			static function ( Container $c ): TemplateAssignmentService {
				return new TemplateAssignmentService(
					$c->make( SignatureService::class ),
					$c->make( SignatureRepository::class )
				);
			}
		);
		$container->singleton(
			TemplateService::class,
			static function ( Container $c ): TemplateService {
				return new TemplateService(
					$c->make( TemplateRepository::class ),
					$c->make( JsonSchemaValidator::class ),
					$c->make( SchemaSanitizer::class )
				);
			}
		);

		// REST controllers.
		$container->singleton(
			MeController::class,
			static function (): MeController {
				return new MeController();
			}
		);
		$container->singleton(
			SignaturesController::class,
			static function ( Container $c ): SignaturesController {
				return new SignaturesController(
					$c->make( SignatureService::class ),
					$c->make( SignatureRepository::class ),
					$c->make( RateLimiter::class ),
					$c->make( HtmlSanitizer::class )
				);
			}
		);
		$container->singleton(
			TemplatesController::class,
			static function ( Container $c ): TemplatesController {
				return new TemplatesController(
					$c->make( TemplateService::class ),
					$c->make( TemplateRepository::class ),
					$c->make( SignatureService::class ),
					$c->make( SignatureRepository::class ),
					$c->make( TemplateAssignmentService::class ),
					$c->make( TemplatePropagator::class )
				);
			}
		);
		$container->singleton(
			TeamSignaturesController::class,
			static function ( Container $c ): TeamSignaturesController {
				return new TeamSignaturesController(
					$c->make( SignatureRepository::class ),
					$c->make( SignatureService::class )
				);
			}
		);
		$container->singleton(
			StorageController::class,
			static function ( Container $c ): StorageController {
				return new StorageController( $c->make( StorageManager::class ) );
			}
		);
		$container->singleton(
			UploadController::class,
			static function ( Container $c ): UploadController {
				return new UploadController(
					$c->make( StorageManager::class ),
					$c->make( AssetRepository::class ),
					$c->make( RateLimiter::class )
				);
			}
		);
		$container->singleton(
			AssetsController::class,
			static function ( Container $c ): AssetsController {
				return new AssetsController(
					$c->make( AssetRepository::class ),
					$c->make( StorageManager::class )
				);
			}
		);
		$container->singleton(
			SiteSettingsController::class,
			static function (): SiteSettingsController {
				return new SiteSettingsController();
			}
		);
		$container->singleton(
			FrontendAccessController::class,
			static function (): FrontendAccessController {
				return new FrontendAccessController();
			}
		);

		// Google Workspace: Gmail signature push (1.3.0).
		GmailServiceProvider::register( $container );
		// Outlook add-in deployment (1.3.0).
		$container->singleton(
			OutlookSignatureService::class,
			static function ( Container $c ): OutlookSignatureService {
				return new OutlookSignatureService( $c->make( SignatureService::class ) );
			}
		);
		$container->singleton(
			OutlookController::class,
			static function ( Container $c ): OutlookController {
				return new OutlookController(
					$c->make( OutlookSignatureService::class ),
					$c->make( RateLimiter::class )
				);
			}
		);

		// 1.3.0 directory: profile fields, groups, CSV profile import.
		$container->singleton(
			ProfileController::class,
			static function ( Container $c ): ProfileController {
				return new ProfileController( $c->make( RateLimiter::class ) );
			}
		);
		$container->singleton(
			GroupsController::class,
			static function (): GroupsController {
				return new GroupsController();
			}
		);
		$container->singleton(
			ProfileImportController::class,
			static function (): ProfileImportController {
				return new ProfileImportController();
			}
		);

		// Install link, invitations and reminders (1.3.0).
		self::register_install( $container );

		// Privacy tools + user lifecycle.
		$container->singleton(
			UserDataManager::class,
			static function ( Container $c ): UserDataManager {
				return new UserDataManager(
					$c->make( SignatureRepository::class ),
					$c->make( AssetRepository::class ),
					$c->make( StorageManager::class )
				);
			}
		);
	}

	/**
	 * Install-link bindings (Fase 2 deployment).
	 *
	 * @since 1.3.0
	 *
	 * @param Container $container The plugin's DI container.
	 *
	 * @return void
	 */
	private static function register_install( Container $container ): void {
		$container->singleton(
			InstallService::class,
			static function ( Container $c ): InstallService {
				return new InstallService( $c->make( SignatureService::class ) );
			}
		);
		$container->singleton(
			InvitationMailer::class,
			static function (): InvitationMailer {
				return new InvitationMailer();
			}
		);
		$container->singleton(
			InvitationQueue::class,
			static function ( Container $c ): InvitationQueue {
				return new InvitationQueue( $c->make( InstallService::class ), $c->make( InvitationMailer::class ) );
			}
		);
		$container->singleton(
			InstallReminders::class,
			static function ( Container $c ): InstallReminders {
				return new InstallReminders( $c->make( InvitationQueue::class ) );
			}
		);
		$container->singleton(
			InstallPage::class,
			static function ( Container $c ): InstallPage {
				return new InstallPage( $c->make( InstallService::class ) );
			}
		);
		$container->singleton(
			InstallController::class,
			static function ( Container $c ): InstallController {
				return new InstallController( $c->make( InstallService::class ), $c->make( RateLimiter::class ) );
			}
		);
		$container->singleton(
			DeployInvitationsController::class,
			static function ( Container $c ): DeployInvitationsController {
				return new DeployInvitationsController( $c->make( InvitationQueue::class ), $c->make( RateLimiter::class ) );
			}
		);
	}
}
