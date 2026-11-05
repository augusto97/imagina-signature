<?php
/**
 * Pushes template updates to the signatures linked to it.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Models\Template;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;

defined( 'ABSPATH' ) || exit;

/**
 * Template propagation (1.3.0).
 *
 * When a template's design changes, every signature linked to it is
 * rebuilt server-side with {@see TemplateLink::refresh()} (template
 * design + the signature's variables and text overrides). The rewrite
 * bumps `updated_at` but not `compiled_at`, so each refreshed row is
 * stale until a browser recompiles it (the employee opening the
 * editor, or the team console — `GET /admin/signatures/stale`).
 *
 * Up to {@see BATCH_SIZE} linked signatures are refreshed in the
 * request that saved the template. Larger sets are processed by a
 * chain of WP-Cron single events, {@see BATCH_SIZE} rows each, walking
 * the rows in id order. Progress per template lives in the
 * {@see PROGRESS_OPTION} option:
 *
 *     { "<template_id>": { template_id, status: queued|running|done,
 *       total, processed, updated, last_id, started_at, finished_at } }
 *
 * A new update of the same template restarts its run from the first
 * row. Not declared `final` so controller tests can mock it.
 *
 * @since 1.3.0
 */
class TemplatePropagator {

	/**
	 * WP-Cron hook of one batch (single event, arg: template id).
	 */
	public const CRON_HOOK = 'imgsig_propagate_template';

	/**
	 * Option holding the progress of each template's run.
	 */
	public const PROGRESS_OPTION = 'imgsig_template_propagation';

	/**
	 * Signatures refreshed per batch (and the synchronous threshold).
	 */
	public const BATCH_SIZE = 100;

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $signatures;

	/**
	 * @var TemplateRepository
	 */
	private TemplateRepository $templates;

	/**
	 * @param SignatureRepository $signatures Signature repository.
	 * @param TemplateRepository  $templates  Template repository.
	 */
	public function __construct( SignatureRepository $signatures, TemplateRepository $templates ) {
		$this->signatures = $signatures;
		$this->templates  = $templates;
	}

	/**
	 * Hooks the cron batch handler and the template-deleted cleanup.
	 *
	 * @since 1.3.0
	 *
	 * @return void
	 */
	public function register(): void {
		add_action( self::CRON_HOOK, [ $this, 'run_batch' ], 10, 1 );
		add_action( 'imgsig/template/deleted', [ $this, 'on_template_deleted' ], 10, 1 );
	}

	/**
	 * Starts propagating `$template_id` to its linked signatures:
	 * synchronously when there are at most {@see BATCH_SIZE}, otherwise
	 * the first cron batch is scheduled. Returns the progress record.
	 *
	 * @since 1.3.0
	 *
	 * @param int $template_id Template that was updated.
	 *
	 * @return array<string, mixed>
	 */
	public function propagate( int $template_id ): array {
		$total    = $this->signatures->count_linked_to_template( $template_id );
		$progress = [
			'template_id' => $template_id,
			'status'      => 'queued',
			'total'       => $total,
			'processed'   => 0,
			'updated'     => 0,
			'last_id'     => 0,
			'started_at'  => gmdate( 'Y-m-d H:i:s' ),
			'finished_at' => null,
		];

		if ( 0 === $total ) {
			return $this->finish( $progress );
		}

		$this->save_progress( $progress );

		if ( $total <= self::BATCH_SIZE ) {
			return $this->run_batch( $template_id );
		}

		$this->schedule_next( $template_id );
		return $progress;
	}

	/**
	 * Processes one batch of a template's run (cron handler; also used
	 * for the synchronous case). Schedules the next batch while rows
	 * remain.
	 *
	 * @since 1.3.0
	 *
	 * @param int|string $template_id Template id (cron passes the scheduled arg).
	 *
	 * @return array<string, mixed> The updated progress record.
	 */
	public function run_batch( $template_id ): array {
		$template_id = (int) $template_id;
		$progress    = $this->progress( $template_id ) ?? [
			'template_id' => $template_id,
			'status'      => 'running',
			'total'       => $this->signatures->count_linked_to_template( $template_id ),
			'processed'   => 0,
			'updated'     => 0,
			'last_id'     => 0,
			'started_at'  => gmdate( 'Y-m-d H:i:s' ),
			'finished_at' => null,
		];

		$template = $this->templates->find( $template_id );
		$schema   = null !== $template ? json_decode( $template->json_content, true ) : null;
		if ( null === $template || ! is_array( $schema ) ) {
			return $this->finish( $progress );
		}

		$rows = $this->signatures->find_linked_to_template( $template_id, (int) $progress['last_id'], self::BATCH_SIZE );
		foreach ( $rows as $signature ) {
			if ( $this->refresh_signature( $signature, $schema ) ) {
				++$progress['updated'];
			}
			++$progress['processed'];
			$progress['last_id'] = $signature->id;
		}

		if ( count( $rows ) < self::BATCH_SIZE ) {
			return $this->finish( $progress );
		}

		$progress['status'] = 'running';
		$this->save_progress( $progress );
		$this->schedule_next( $template_id );

		return $progress;
	}

	/**
	 * Rebuilds one linked signature from its template. Rows whose
	 * design wouldn't change are left alone (their HTML stays fresh).
	 *
	 * @since 1.3.0
	 *
	 * @param Signature            $signature Linked signature.
	 * @param array<string, mixed> $template  Decoded template schema.
	 *
	 * @return bool Whether the row was rewritten.
	 */
	public function refresh_signature( Signature $signature, array $template ): bool {
		$current = json_decode( $signature->json_content, true );
		$current = is_array( $current ) ? $current : [];
		$next    = TemplateLink::refresh( $template, $current, gmdate( 'Y-m-d\TH:i:s\Z' ) );

		if ( TemplateLink::equivalent( $next, $current, true ) ) {
			return false;
		}

		$updated = $this->signatures->update(
			$signature->id,
			[
				'json_content'   => TemplateLink::encode( $next ),
				'schema_version' => (string) ( $next['schema_version'] ?? SchemaMigration::CURRENT_VERSION ),
			]
		);

		if ( null !== $updated ) {
			/** This action is documented in CLAUDE.md §26.1. */
			do_action( 'imgsig/signature/updated', $updated );
		}

		return true;
	}

	/**
	 * Progress of a template's last run, or null when none.
	 *
	 * @since 1.3.0
	 *
	 * @param int $template_id Template.
	 *
	 * @return array<string, mixed>|null
	 */
	public function progress( int $template_id ): ?array {
		$all = get_option( self::PROGRESS_OPTION, [] );
		return is_array( $all ) && isset( $all[ $template_id ] ) && is_array( $all[ $template_id ] ) ? $all[ $template_id ] : null;
	}

	/**
	 * A deleted template can't be followed any more: its linked
	 * signatures keep their current design as detached copies.
	 *
	 * @since 1.3.0
	 *
	 * @param int|string $template_id Deleted template.
	 *
	 * @return void
	 */
	public function on_template_deleted( $template_id ): void {
		$template_id = (int) $template_id;
		$this->signatures->detach_all_from_template( $template_id );

		$all = get_option( self::PROGRESS_OPTION, [] );
		if ( is_array( $all ) && isset( $all[ $template_id ] ) ) {
			unset( $all[ $template_id ] );
			update_option( self::PROGRESS_OPTION, $all, false );
		}
		wp_clear_scheduled_hook( self::CRON_HOOK, [ $template_id ] );
	}

	/**
	 * Marks a run finished and stores it.
	 *
	 * @param array<string, mixed> $progress Progress record.
	 *
	 * @return array<string, mixed>
	 */
	private function finish( array $progress ): array {
		$progress['status']      = 'done';
		$progress['finished_at'] = gmdate( 'Y-m-d H:i:s' );
		$this->save_progress( $progress );
		return $progress;
	}

	/**
	 * @param array<string, mixed> $progress Progress record.
	 *
	 * @return void
	 */
	private function save_progress( array $progress ): void {
		$all = get_option( self::PROGRESS_OPTION, [] );
		$all = is_array( $all ) ? $all : [];

		$all[ (int) $progress['template_id'] ] = $progress;
		update_option( self::PROGRESS_OPTION, $all, false );
	}

	/**
	 * Queues the next batch of a template's run.
	 *
	 * @param int $template_id Template.
	 *
	 * @return void
	 */
	private function schedule_next( int $template_id ): void {
		if ( false === wp_next_scheduled( self::CRON_HOOK, [ $template_id ] ) ) {
			wp_schedule_single_event( time(), self::CRON_HOOK, [ $template_id ] );
		}
	}
}
