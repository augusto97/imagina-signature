<?php
/**
 * Signature service — domain operations on signatures.
 *
 * @package ImaginaSignatures\Services
 */

declare(strict_types=1);

namespace ImaginaSignatures\Services;

use ImaginaSignatures\Exceptions\OwnershipException;
use ImaginaSignatures\Exceptions\ValidationException;
use ImaginaSignatures\Models\Signature;
use ImaginaSignatures\Repositories\SignatureRepository;
use ImaginaSignatures\Repositories\TemplateRepository;

defined( 'ABSPATH' ) || exit;

/**
 * Coordinates create / update / delete / duplicate flows for signatures.
 *
 * Owns three kinds of work that don't belong to either the controller
 * or the repository:
 *
 *  - Validation (delegates to {@see JsonSchemaValidator}).
 *  - Ownership enforcement at the service boundary (so any caller —
 *    not just REST controllers — can't bypass it).
 *  - Firing public action hooks (`imgsig/signature/*`) at the right
 *    moments so extensions can react.
 *
 * Controllers translate the typed exceptions thrown here into
 * `WP_Error` via {@see \ImaginaSignatures\Api\BaseController::exception_to_wp_error()}.
 *
 * Not declared `final` so PHPUnit 9 can produce mock doubles in
 * controller tests. The public surface is the supported contract.
 *
 * @since 1.0.0
 */
class SignatureService {

	/**
	 * @var SignatureRepository
	 */
	private SignatureRepository $repo;

	/**
	 * @var JsonSchemaValidator
	 */
	private JsonSchemaValidator $validator;

	/**
	 * @var SchemaSanitizer
	 */
	private SchemaSanitizer $sanitizer;

	/**
	 * Email-safe sanitiser for compiled HTML sent by the editor.
	 *
	 * @var HtmlSanitizer
	 */
	private HtmlSanitizer $html_sanitizer;

	/**
	 * Notes produced by the sanitizer during the last create / update.
	 *
	 * @var array<int, array{path: string, message: string}>
	 */
	private array $last_notes = [];

	/**
	 * Templates, for enforcing a linked signature's design on save
	 * (1.3.0). Null disables enforcement (unit tests of other flows).
	 *
	 * @var TemplateRepository|null
	 */
	private ?TemplateRepository $templates;

	/**
	 * @param SignatureRepository     $repo      Signature repository.
	 * @param JsonSchemaValidator     $validator Schema validator.
	 * @param SchemaSanitizer|null    $sanitizer Recursive schema sanitizer (defaults to a fresh one).
	 * @param TemplateRepository|null $templates Template repository (linked-signature enforcement).
	 */
	public function __construct( SignatureRepository $repo, JsonSchemaValidator $validator, ?SchemaSanitizer $sanitizer = null, ?TemplateRepository $templates = null ) {
		$this->repo           = $repo;
		$this->validator      = $validator;
		$this->sanitizer      = $sanitizer ?? new SchemaSanitizer( new HtmlSanitizer() );
		$this->html_sanitizer = new HtmlSanitizer();
		$this->templates      = $templates;
	}

	/**
	 * User meta key holding the id of the user's primary signature —
	 * the one deployed to Gmail / Outlook and shown on install links.
	 */
	public const PRIMARY_META_KEY = 'imgsig_primary_signature';

	/** Largest compiled HTML accepted on save, in bytes. */
	public const MAX_HTML_BYTES = 200 * 1024;

	/** Largest plain-text alternative accepted on save, in bytes. */
	public const MAX_TEXT_BYTES = 20 * 1024;

	/**
	 * The signature a user deploys: the one they marked as primary if
	 * it still exists, else their most recently updated "ready" one,
	 * else their most recently updated one. Null when they have none.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id Owner.
	 *
	 * @return Signature|null
	 */
	public function primary_for_user( int $user_id ): ?Signature {
		$marked = (int) get_user_meta( $user_id, self::PRIMARY_META_KEY, true );
		if ( $marked > 0 ) {
			$signature = $this->repo->find_owned_by( $marked, $user_id );
			if ( null !== $signature ) {
				return $signature;
			}
		}

		foreach ( [ Signature::STATUS_READY, '' ] as $status ) {
			$args = [
				'per_page' => 1,
				'order_by' => 'updated_at',
				'order'    => 'desc',
			];
			if ( '' !== $status ) {
				$args['status'] = $status;
			}
			$rows = $this->repo->find_by_user( $user_id, $args );
			if ( ! empty( $rows ) ) {
				return $rows[0];
			}
		}

		return null;
	}

	/**
	 * Marks one of the user's signatures as primary.
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id      Owner.
	 * @param int $signature_id Signature to mark.
	 *
	 * @return Signature
	 *
	 * @throws OwnershipException When the signature isn't the user's.
	 */
	public function set_primary( int $user_id, int $signature_id ): Signature {
		$signature = $this->repo->find_owned_by( $signature_id, $user_id );
		if ( null === $signature ) {
			throw new OwnershipException( __( 'Signature not found or not owned by the caller.', 'imagina-signatures' ) );
		}
		$previous = $this->primary_id_for_user( $user_id );
		update_user_meta( $user_id, self::PRIMARY_META_KEY, $signature_id );

		/**
		 * Fires after a user's primary signature changes.
		 *
		 * @since 1.3.0
		 *
		 * @param int $user_id      Owner.
		 * @param int $signature_id New primary signature.
		 */
		do_action( 'imgsig/signature/primary_changed', $user_id, $signature_id );

		if ( $previous !== $signature_id ) {
			$this->maybe_announce_primary_html( $signature );
		}

		return $signature;
	}

	/**
	 * Fires `imgsig/deploy/primary_html_changed` when `$signature` is its
	 * owner's primary signature and has compiled HTML — the signal the
	 * deployment channels (Gmail push, Outlook add-in cache, install
	 * reminders) listen to.
	 *
	 * @since 1.3.0
	 *
	 * @param Signature $signature Freshly persisted row.
	 *
	 * @return void
	 */
	private function maybe_announce_primary_html( Signature $signature ): void {
		if ( ! $signature->has_html || $this->primary_id_for_user( $signature->user_id ) !== $signature->id ) {
			return;
		}

		/**
		 * Fires when the HTML a user deploys changes: their primary
		 * signature was re-compiled, or another signature became primary.
		 *
		 * @since 1.3.0
		 *
		 * @param int       $user_id   Owner.
		 * @param Signature $signature The primary signature (with html_cache).
		 */
		do_action( 'imgsig/deploy/primary_html_changed', $signature->user_id, $signature );
	}

	/**
	 * Id of the signature currently treated as primary (0 when none).
	 *
	 * @since 1.3.0
	 *
	 * @param int $user_id Owner.
	 *
	 * @return int
	 */
	public function primary_id_for_user( int $user_id ): int {
		$primary = $this->primary_for_user( $user_id );
		return null === $primary ? 0 : $primary->id;
	}

	/**
	 * Returns the sanitisation notes from the last create / update:
	 * one entry per value the server removed (disallowed URL scheme,
	 * HTML outside the email-safe allowlist, markup in a text field).
	 *
	 * @since 1.0.40
	 *
	 * @return array<int, array{path: string, message: string}>
	 */
	public function last_sanitization_notes(): array {
		return $this->last_notes;
	}

	/**
	 * Creates a new signature owned by `$user_id`.
	 *
	 * `$data` is filtered through `imgsig/signature/data_before_save`
	 * before validation so extensions can normalise or augment it.
	 *
	 * @since 1.0.0
	 *
	 * `link_mode: linked` is only honoured for trusted callers (template
	 * assignment) and for owners who manage templates or the team; an
	 * employee can't link a signature of their own to a template.
	 *
	 * @param int                  $user_id Owner.
	 * @param array<string, mixed> $data    Field map (`name`, `json_content`, `link_mode`, ...).
	 * @param bool                 $trusted Server-side caller acting for an administrator (1.3.0).
	 *
	 * @return Signature
	 *
	 * @throws ValidationException When the JSON schema check fails.
	 */
	public function create( int $user_id, array $data, bool $trusted = false ): Signature {
		// `prepare_for_save()` runs the `imgsig/signature/data_before_save`
		// filter on the payload. Listeners can normalise / augment fields,
		// but they must NOT be allowed to set `user_id` — that would let
		// a third-party plugin (or a future internal bug) silently re-
		// assign ownership of a fresh row to another user. Strip any
		// listener-injected `user_id` and stamp ours AFTER the filter.
		$prepared = $this->prepare_for_save( $data, 'create' );
		unset( $prepared['user_id'] );
		$prepared['user_id'] = $user_id;

		if (
			Signature::LINK_LINKED === ( $prepared['link_mode'] ?? null )
			&& ( empty( $prepared['template_id'] ) || ( ! $trusted && ! TemplateLink::can_bypass_locks( $user_id ) ) )
		) {
			unset( $prepared['link_mode'] );
		}

		$prepared = $this->flag_html_from_old_inputs( $prepared, $data, $user_id );

		do_action( 'imgsig/signature/before_create', $prepared, $user_id );

		$signature = $this->repo->insert( $prepared );

		// Read-after-write verify: hash the JSON we asked the DB to
		// store, hash the JSON the DB gave back, compare. PHP's
		// `json_encode → json_decode → json_encode` is idempotent for
		// well-formed data, so any mismatch points to silent
		// corruption (charset issue, column truncation, broken filter,
		// failed migration). Throwing here gives the user a definite
		// "save failed" instead of the autosave-era "Saved · HH:MM"
		// false positive.
		$this->assert_persisted_json( $signature, $prepared, 'create' );

		do_action( 'imgsig/signature/created', $signature );

		if ( isset( $prepared['html_hash'] ) ) {
			$this->maybe_announce_primary_html( $signature );
		}

		return $signature;
	}

	/**
	 * Updates an existing signature.
	 *
	 * Fetches the row through `find_owned_by` so ownership is enforced
	 * even if the caller passes the wrong user_id by mistake. Propagates
	 * a {@see ValidationException} from {@see prepare_for_save()} when
	 * the new payload fails schema validation.
	 *
	 * @since 1.0.0
	 *
	 * Linked signatures (1.3.0): unless the caller is trusted or the
	 * owner manages templates / the team, the template's employee mode
	 * is enforced — see {@see enforce_link_rules()}.
	 *
	 * @param int                  $signature_id Primary key.
	 * @param int                  $user_id      Caller's user ID.
	 * @param array<string, mixed> $changes      Partial field map.
	 * @param bool                 $trusted      Server-side caller acting for an administrator (1.3.0).
	 *
	 * @return Signature
	 *
	 * @throws OwnershipException When the row is missing or owned by someone else.
	 */
	public function update( int $signature_id, int $user_id, array $changes, bool $trusted = false ): Signature {
		$existing = $this->repo->find_owned_by( $signature_id, $user_id );
		if ( null === $existing ) {
			throw new OwnershipException( __( 'Signature not found or not owned by the caller.', 'imagina-signatures' ) );
		}

		$prepared = $this->prepare_for_save( $changes, 'update' );

		if (
			! $trusted
			&& ( $existing->is_linked() || array_key_exists( 'link_mode', $prepared ) )
			&& ! TemplateLink::can_bypass_locks( $user_id )
		) {
			$prepared = $this->enforce_link_rules( $existing, $prepared );
		}

		// Only a row with a template can follow one.
		if (
			Signature::LINK_LINKED === ( $prepared['link_mode'] ?? null )
			&& empty( $prepared['template_id'] ?? $existing->template_id )
		) {
			unset( $prepared['link_mode'] );
		}

		$prepared = $this->flag_html_from_old_inputs( $prepared, $changes, $existing->user_id );

		do_action( 'imgsig/signature/before_update', $existing, $prepared );

		$updated = $this->repo->update( $signature_id, $prepared );
		// `update()` always returns a row when the original existed.
		$updated = $updated ?? $existing;

		// Read-after-write verify (only when the json_content was part
		// of the change set — name-only / status-only updates don't
		// touch the schema blob).
		if ( array_key_exists( 'json_content', $prepared ) ) {
			$this->assert_persisted_json( $updated, $prepared, 'update' );
		}

		do_action( 'imgsig/signature/updated', $updated );

		if ( array_key_exists( 'html_hash', $prepared ) && $prepared['html_hash'] !== $existing->html_hash ) {
			$this->maybe_announce_primary_html( $updated );
		}

		return $updated;
	}

	/**
	 * Stores compiled output for any user's signature — the team
	 * console recompiling stale signatures in the administrator's
	 * browser (1.3.0). Same sanitising / hashing path as a save from the
	 * editor; only `html` and `text` are accepted. Callers check the
	 * administrator's capability.
	 *
	 * @since 1.3.0
	 *
	 * @param int                  $signature_id Primary key.
	 * @param array<string, mixed> $data         `html` (required) and `text`.
	 *
	 * @return Signature
	 *
	 * @throws OwnershipException  When the signature doesn't exist.
	 * @throws ValidationException When no HTML is supplied or it is too large.
	 */
	public function store_html( int $signature_id, array $data ): Signature {
		$signature = $this->repo->find( $signature_id );
		if ( null === $signature ) {
			throw new OwnershipException( __( 'Signature not found.', 'imagina-signatures' ) );
		}

		if ( ! isset( $data['html'] ) || ! is_string( $data['html'] ) ) {
			throw new ValidationException(
				__( 'No compiled HTML supplied.', 'imagina-signatures' ),
				[
					[
						'path'    => 'html',
						'message' => __( 'html is required.', 'imagina-signatures' ),
					],
				]
			);
		}

		$payload = [ 'html' => $data['html'] ];
		if ( isset( $data['text'] ) && is_string( $data['text'] ) ) {
			$payload['text'] = $data['text'];
		}

		return $this->update( $signature->id, $signature->user_id, $payload, true );
	}

	/**
	 * HTML sent with a save is compiled from the editor's bootstrap — the
	 * owner's profile, groups, brand kit, footer and campaigns as they were
	 * when the editor page loaded. When the save carries that bootstrap's
	 * fingerprint (`inputs_hash`) and it no longer matches the owner's
	 * current inputs ({@see RenderInputs}), the HTML is still stored (the
	 * install page and the Outlook add-in can serve it) but flagged
	 * `html_outdated`: the repository leaves `compiled_at` empty, so the
	 * signature shows as outdated until it is recompiled. Without this, an
	 * editor left open across a brand-kit or profile change would mark
	 * stale HTML as fresh (1.3.0).
	 *
	 * @since 1.3.0
	 *
	 * @param array<string, mixed> $prepared Sanitised change set.
	 * @param array<string, mixed> $data     Raw input (`inputs_hash`).
	 * @param int                  $owner_id Signature owner.
	 *
	 * @return array<string, mixed>
	 */
	private function flag_html_from_old_inputs( array $prepared, array $data, int $owner_id ): array {
		$sent = $data['inputs_hash'] ?? null;
		if ( ! array_key_exists( 'html_cache', $prepared ) || ! is_string( $sent ) || '' === $sent ) {
			return $prepared;
		}
		$owner = get_userdata( $owner_id );
		if ( ! $owner instanceof \WP_User ) {
			return $prepared;
		}
		if ( ! hash_equals( RenderInputs::fingerprint( RenderInputs::for_user( $owner ) ), $sent ) ) {
			$prepared['html_outdated'] = true;
		}
		return $prepared;
	}

	/**
	 * Applies the linked-signature rules to an employee's save (1.3.0):
	 *
	 *  - a detached signature can't be linked by its owner;
	 *  - a linked signature keeps its template (`template_id` changes
	 *    are dropped) and can only be detached when the template's
	 *    employee mode is `free`;
	 *  - `fields_only` / `locked_design`: the design is rebuilt from the
	 *    template ({@see TemplateLink::enforce()}). When that changes
	 *    what was sent, the HTML compiled from it is not stored (the row
	 *    becomes stale until it is recompiled from the stored design);
	 *    an `html` sent without the design it was compiled from is never
	 *    stored either.
	 *
	 * @since 1.3.0
	 *
	 * @param Signature            $existing Stored row.
	 * @param array<string, mixed> $prepared Sanitised change set.
	 *
	 * @return array<string, mixed>
	 *
	 * @throws ValidationException When detaching isn't allowed.
	 */
	private function enforce_link_rules( Signature $existing, array $prepared ): array {
		$requested = $prepared['link_mode'] ?? null;

		if ( ! $existing->is_linked() ) {
			if ( Signature::LINK_LINKED === $requested ) {
				unset( $prepared['link_mode'] );
			}
			return $prepared;
		}

		// The template of a linked signature is chosen by an administrator.
		unset( $prepared['template_id'] );

		$template        = null !== $this->templates ? $this->templates->find( (int) $existing->template_id ) : null;
		$template_schema = null !== $template ? json_decode( $template->json_content, true ) : null;
		if ( ! is_array( $template_schema ) ) {
			// Orphaned link: nothing to enforce against.
			return $prepared;
		}
		$mode = TemplateLink::employee_mode( $template_schema );

		if ( Signature::LINK_DETACHED === $requested ) {
			if ( TemplateLink::MODE_FREE !== $mode ) {
				throw new ValidationException(
					__( 'This signature follows a company template and cannot be detached from it.', 'imagina-signatures' ),
					[
						[
							'path'    => 'link_mode',
							'message' => __( 'Ask an administrator to detach it.', 'imagina-signatures' ),
						],
					]
				);
			}
			if ( isset( $prepared['json_content'] ) ) {
				$decoded = json_decode( (string) $prepared['json_content'], true );
				if ( is_array( $decoded ) ) {
					$prepared['json_content'] = TemplateLink::encode( TemplateLink::detach( $decoded ) );
				}
			}
			return $prepared;
		}

		unset( $prepared['link_mode'] );

		if ( TemplateLink::MODE_FREE === $mode ) {
			return $prepared;
		}

		if ( ! array_key_exists( 'json_content', $prepared ) ) {
			unset( $prepared['html_cache'], $prepared['html_hash'], $prepared['html_text'] );
			return $prepared;
		}

		$incoming = json_decode( (string) $prepared['json_content'], true );
		$stored   = json_decode( $existing->json_content, true );
		$enforced = TemplateLink::enforce( $template_schema, is_array( $incoming ) ? $incoming : [], is_array( $stored ) ? $stored : [] );

		if ( ! TemplateLink::equivalent( $enforced, $incoming ) ) {
			unset( $prepared['html_cache'], $prepared['html_hash'], $prepared['html_text'] );
		}

		$prepared['json_content']   = TemplateLink::encode( $enforced );
		$prepared['schema_version'] = (string) ( $enforced['schema_version'] ?? SchemaMigration::CURRENT_VERSION );

		return $prepared;
	}

	/**
	 * Verifies that the JSON we asked the DB to store round-tripped
	 * intact. The repository now re-fetches the row after every write,
	 * so `$persisted->json_content` is the canonical "what's actually
	 * on disk" string. We compare its SHA-256 against the SHA-256 of
	 * the JSON we just sent to the DB.
	 *
	 * Throws on mismatch instead of silently letting the user think
	 * their save landed — that's the false positive the autosave was
	 * producing in 1.0.22 / 1.0.23 (the topbar showed "Saved · HH:MM"
	 * while the listing stayed empty).
	 *
	 * @since 1.0.26
	 *
	 * @param Signature            $persisted Row freshly read from disk.
	 * @param array<string, mixed> $prepared  Field map handed to repo.
	 * @param string               $context   `create` or `update`.
	 *
	 * @throws \RuntimeException When the hashes don't match.
	 *
	 * @return void
	 */
	private function assert_persisted_json( Signature $persisted, array $prepared, string $context ): void {
		if ( ! array_key_exists( 'json_content', $prepared ) ) {
			return;
		}

		$expected = (string) $prepared['json_content'];
		$actual   = (string) $persisted->json_content;

		if ( '' === $actual ) {
			throw new \RuntimeException(
				sprintf( 'Signature %d %s: stored json_content is empty after write.', $persisted->id, $context )
			);
		}

		// Normalise both sides through decode→encode so insertion-order
		// equivalent JSON compares equal even if the DB driver
		// reformatted whitespace (it shouldn't for LONGTEXT, but defence
		// in depth — we want the verify to fail on real mismatches, not
		// formatting artefacts).
		$expected_canonical = self::canonicalise( $expected );
		$actual_canonical   = self::canonicalise( $actual );

		if ( $expected_canonical !== $actual_canonical ) {
			$expected_hash = substr( hash( 'sha256', $expected_canonical ), 0, 12 );
			$actual_hash   = substr( hash( 'sha256', $actual_canonical ), 0, 12 );
			throw new \RuntimeException(
				sprintf(
					'Signature %d %s: persisted json_content does not match the input. expected=%s actual=%s expected_len=%d actual_len=%d',
					$persisted->id,
					$context,
					$expected_hash,
					$actual_hash,
					strlen( $expected_canonical ),
					strlen( $actual_canonical )
				)
			);
		}
	}

	/**
	 * Decodes a JSON string and re-encodes it so insertion-order
	 * equivalent inputs produce identical bytes. Used to compare a
	 * payload we just wrote to the DB against what the DB returned.
	 *
	 * @since 1.0.26
	 *
	 * @param string $json Raw JSON string.
	 *
	 * @return string
	 */
	private static function canonicalise( string $json ): string {
		$decoded = json_decode( $json, true );
		if ( ! is_array( $decoded ) ) {
			return $json;
		}
		$encoded = wp_json_encode( $decoded );
		return is_string( $encoded ) ? $encoded : $json;
	}

	/**
	 * Deletes a signature.
	 *
	 * @since 1.0.0
	 *
	 * @param int $signature_id Primary key.
	 * @param int $user_id      Caller's user ID.
	 *
	 * @return void
	 *
	 * @throws OwnershipException When the row is missing or owned by someone else.
	 */
	public function delete( int $signature_id, int $user_id ): void {
		$existing = $this->repo->find_owned_by( $signature_id, $user_id );
		if ( null === $existing ) {
			throw new OwnershipException( __( 'Signature not found or not owned by the caller.', 'imagina-signatures' ) );
		}

		do_action( 'imgsig/signature/before_delete', $existing );

		$this->repo->delete( $signature_id );

		do_action( 'imgsig/signature/deleted', $signature_id );
	}

	/**
	 * Duplicates a signature owned by the caller.
	 *
	 * The copy is named "<original> (copy)" and gets fresh timestamps
	 * + a fresh primary key. Status defaults to `draft` regardless of
	 * the source's status so a duplicated `ready` row needs explicit
	 * approval.
	 *
	 * @since 1.0.0
	 *
	 * @param int $signature_id Primary key.
	 * @param int $user_id      Caller's user ID.
	 *
	 * @return Signature The newly inserted copy.
	 *
	 * @throws OwnershipException When the source row is missing.
	 */
	public function duplicate( int $signature_id, int $user_id ): Signature {
		$source = $this->repo->find_owned_by( $signature_id, $user_id );
		if ( null === $source ) {
			throw new OwnershipException( __( 'Signature not found or not owned by the caller.', 'imagina-signatures' ) );
		}

		// Re-sanitise on the way through: rows saved before server-side
		// sanitisation existed may still carry unsafe values.
		$json_content = $source->json_content;
		$decoded      = json_decode( $json_content, true );
		if ( is_array( $decoded ) ) {
			$encoded      = wp_json_encode( $this->sanitizer->sanitize( $decoded ) );
			$json_content = is_string( $encoded ) ? $encoded : $json_content;
		}

		$copy = $this->repo->insert(
			[
				'user_id'        => $user_id,
				'name'           => sprintf(
					/* translators: %s: original signature name. */
					__( '%s (copy)', 'imagina-signatures' ),
					$source->name
				),
				'json_content'   => $json_content,
				'template_id'    => $source->template_id,
				// A copy of a linked signature stays linked (1.3.0) — duplicating
				// must not be a way around the template's employee mode.
				'link_mode'      => $source->link_mode,
				'status'         => Signature::STATUS_DRAFT,
				'schema_version' => $source->schema_version,
			]
		);

		do_action( 'imgsig/signature/created', $copy );

		return $copy;
	}

	/**
	 * Sanitises and validates an incoming field map before persisting.
	 *
	 * The `imgsig/signature/data_before_save` filter runs after
	 * sanitisation so listeners can mutate the prepared payload.
	 *
	 * @since 1.0.0
	 *
	 * @param array<string, mixed> $data    Raw input.
	 * @param string               $context `create` or `update` — passed to listeners.
	 *
	 * @return array<string, mixed>
	 *
	 * @throws ValidationException When validation fails.
	 */
	private function prepare_for_save( array $data, string $context ): array {
		$prepared         = [];
		$this->last_notes = [];

		if ( array_key_exists( 'name', $data ) ) {
			$prepared['name'] = sanitize_text_field( (string) $data['name'] );
		}

		if ( array_key_exists( 'status', $data ) ) {
			$status = (string) $data['status'];
			if ( ! in_array( $status, Signature::STATUSES, true ) ) {
				throw new ValidationException(
					__( 'Invalid status value.', 'imagina-signatures' ),
					[
						[
							'path'    => 'status',
							'message' => __( 'Status must be one of: draft, ready, archived.', 'imagina-signatures' ),
						],
					]
				);
			}
			$prepared['status'] = $status;
		}

		if ( array_key_exists( 'template_id', $data ) ) {
			$prepared['template_id'] = (int) $data['template_id'];
		}

		if ( array_key_exists( 'link_mode', $data ) ) {
			$link_mode = (string) $data['link_mode'];
			if ( ! in_array( $link_mode, Signature::LINK_MODES, true ) ) {
				throw new ValidationException(
					__( 'Invalid link mode.', 'imagina-signatures' ),
					[
						[
							'path'    => 'link_mode',
							'message' => __( 'link_mode must be "linked" or "detached".', 'imagina-signatures' ),
						],
					]
				);
			}
			$prepared['link_mode'] = $link_mode;
		}

		// Compiled output from the editor (1.3.0). The browser is the only
		// compiler; the server stores a sanitised copy so it can deploy
		// the signature (Gmail, Outlook, install links) on its own.
		if ( array_key_exists( 'html', $data ) && is_string( $data['html'] ) ) {
			$raw_html = $data['html'];
			if ( strlen( $raw_html ) > self::MAX_HTML_BYTES ) {
				throw new ValidationException(
					__( 'The compiled signature is too large to store.', 'imagina-signatures' ),
					[
						[
							'path'    => 'html',
							'message' => sprintf(
								/* translators: %d: maximum size in KB. */
								__( 'Maximum %d KB.', 'imagina-signatures' ),
								(int) ( self::MAX_HTML_BYTES / 1024 )
							),
						],
					]
				);
			}
			$html                   = '' === trim( $raw_html ) ? '' : $this->html_sanitizer->sanitize_email_document( $raw_html );
			$prepared['html_cache'] = $html;
			$prepared['html_hash']  = '' === $html ? null : hash( 'sha256', $html );

			$text = array_key_exists( 'text', $data ) && is_string( $data['text'] ) ? $data['text'] : $this->html_sanitizer->to_plain_text( $html );
			$text = wp_strip_all_tags( $text );
			if ( strlen( $text ) > self::MAX_TEXT_BYTES ) {
				$text = substr( $text, 0, self::MAX_TEXT_BYTES );
			}
			$prepared['html_text'] = $text;
		}

		if ( array_key_exists( 'json_content', $data ) ) {
			$json    = $data['json_content'];
			$decoded = is_array( $json ) ? $json : json_decode( (string) $json, true );

			if ( ! is_array( $decoded ) ) {
				throw new ValidationException(
					__( 'json_content must be a JSON object.', 'imagina-signatures' ),
					[
						[
							'path'    => 'json_content',
							'message' => __( 'Could not decode payload.', 'imagina-signatures' ),
						],
					]
				);
			}

			// Structure + limits first (throws a 400), then strip unsafe
			// values (never throws — records notes instead).
			$this->validator->validate( $decoded );
			$decoded          = $this->sanitizer->sanitize( $decoded );
			$this->last_notes = $this->sanitizer->notes();

			$prepared['json_content']   = (string) wp_json_encode( $decoded );
			$prepared['schema_version'] = (string) ( $decoded['schema_version'] ?? '1.0' );
		}

		/** This filter is documented in CLAUDE.md §26.2. */
		$prepared = apply_filters( 'imgsig/signature/data_before_save', $prepared, $context );

		return is_array( $prepared ) ? $prepared : [];
	}
}
