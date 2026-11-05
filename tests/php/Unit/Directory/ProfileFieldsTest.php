<?php
/**
 * Unit tests for profile field sanitisation, mapping and storage.
 *
 * @package ImaginaSignatures\Tests\Unit\Directory
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Directory;

use Brain\Monkey;
use Brain\Monkey\Actions;
use Brain\Monkey\Filters;
use ImaginaSignatures\Directory\ProfileFields;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/DirectoryStubs.php';

/**
 * @covers \ImaginaSignatures\Directory\ProfileFields
 */
final class ProfileFieldsTest extends TestCase {

	use DirectoryStubs;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_directory();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_sanitize_value_per_type(): void {
		$this->assertSame( 'Head of Sales', ProfileFields::sanitize_value( 'text', "  Head <b>of</b>\tSales " ) );
		$this->assertSame( 255, mb_strlen( ProfileFields::sanitize_value( 'text', str_repeat( 'é', 400 ) ) ) );

		$this->assertSame( '+34 (600) 123-456', ProfileFields::sanitize_value( 'phone', '+34 (600) 123-456' ) );
		$this->assertSame( '+1 555 0100 ext. 42', ProfileFields::sanitize_value( 'phone', '+1 555 0100 x42' ) );
		$this->assertSame( '600456', ProfileFields::sanitize_value( 'phone', '600<script>123</script>456' ) );
		$this->assertSame( '+34 600 123 456', ProfileFields::sanitize_value( 'phone', 'Tel: +34 600 123 456' ) );
		$this->assertSame( '', ProfileFields::sanitize_value( 'phone', 'call me' ) );

		$this->assertSame( 'https://linkedin.com/in/jane', ProfileFields::sanitize_value( 'url', 'linkedin.com/in/jane' ) );
		$this->assertSame( 'https://cal.example/jane', ProfileFields::sanitize_value( 'url', 'https://cal.example/jane' ) );
		$this->assertSame( '', ProfileFields::sanitize_value( 'url', 'javascript:alert(1)' ) );
		$this->assertSame( '', ProfileFields::sanitize_value( 'url', 'just some words' ) );

		$this->assertSame( 'jane@acme.com', ProfileFields::sanitize_value( 'email', ' jane@acme.com ' ) );
		$this->assertSame( '', ProfileFields::sanitize_value( 'email', 'not-an-email' ) );
	}

	public function test_sanitize_config_validates_custom_fields_and_sources(): void {
		$custom = [
			[
				'key'   => 'Employee_ID',
				'label' => 'Employee <i>ID</i>',
				'type'  => 'text',
			],
			[
				'key'  => 'employee_id',
				'type' => 'url',
			], // Duplicate.
			[ 'key' => 'job_title' ], // Canonical.
			[ 'key' => 'wp_secret' ], // Reserved prefix.
			[ 'key' => 'company_size' ], // Reserved prefix.
			[ 'key' => '9lives' ], // Must start with a letter.
			[
				'key'  => 'whatsapp',
				'type' => 'bogus',
			],
		];
		for ( $i = 0; $i < 12; $i++ ) {
			$custom[] = [ 'key' => 'extra_' . $i ];
		}

		$config = ProfileFields::sanitize_config(
			[
				'custom'  => $custom,
				'mapping' => [
					'phone'        => [
						'source'   => 'meta',
						'meta_key' => 'billing_phone',
					],
					'mobile'       => [
						'source'   => 'meta',
						'meta_key' => 'session_tokens',
					], // Denied.
					'website_url'  => [
						'source'   => 'meta',
						'meta_key' => 'user_url',
					],
					'department'   => [
						'source'   => 'meta',
						'meta_key' => 'bad key!',
					],
					'linkedin_url' => [
						'source'   => 'meta',
						'meta_key' => 'wp_capabilities',
					],
					'employee_id'  => [
						'source'   => 'meta',
						'meta_key' => 'hr_employee_number',
					],
				],
			]
		);

		$keys = array_column( $config['custom'], 'key' );
		$this->assertSame( 'employee_id', $keys[0] );
		$this->assertSame( 'Employee ID', $config['custom'][0]['label'] );
		$this->assertSame( 'whatsapp', $keys[1] );
		$this->assertSame( 'text', $config['custom'][1]['type'] );
		$this->assertCount( ProfileFields::MAX_CUSTOM, $config['custom'] );
		$this->assertNotContains( 'job_title', $keys );
		$this->assertNotContains( 'wp_secret', $keys );
		$this->assertNotContains( 'company_size', $keys );

		$this->assertSame(
			[
				'source'   => 'meta',
				'meta_key' => 'billing_phone',
			],
			$config['mapping']['phone']
		);
		$this->assertSame( 'plugin', $config['mapping']['mobile']['source'] );
		$this->assertSame( 'user_url', $config['mapping']['website_url']['meta_key'] );
		$this->assertSame( 'plugin', $config['mapping']['department']['source'] );
		$this->assertSame( 'plugin', $config['mapping']['linkedin_url']['source'] );
		$this->assertSame( 'hr_employee_number', $config['mapping']['employee_id']['meta_key'] );
		// Every field gets a mapping entry.
		$this->assertCount( 10 + ProfileFields::MAX_CUSTOM, $config['mapping'] );
	}

	public function test_values_for_applies_the_mapping(): void {
		$this->add_user( 7, 'jane@acme.com', [ 'user_url' => 'https://jane.dev' ] );
		$this->user_meta[7] = [
			ProfileFields::META_KEY => [
				'job_title' => 'CTO',
				'phone'     => '+34 600 000 000', // Ignored: mapped below.
				'badge'     => 'Gold',
			],
			'billing_phone'         => '+34 911 222 333',
			'hr_badge'              => [ 'not', 'a', 'string' ],
		];
		$this->options[ ProfileFields::OPTION ] = [
			'custom'  => [
				[
					'key'   => 'badge',
					'label' => 'Badge',
				],
			],
			'mapping' => [
				'phone'       => [
					'source'   => 'meta',
					'meta_key' => 'billing_phone',
				],
				'website_url' => [
					'source'   => 'meta',
					'meta_key' => 'user_url',
				],
			],
		];

		$values = ProfileFields::values_for( 7 );

		$this->assertSame( 'CTO', $values['job_title'] );
		$this->assertSame( '+34 911 222 333', $values['phone'] );
		$this->assertSame( 'https://jane.dev', $values['website_url'] );
		$this->assertSame( 'Gold', $values['badge'] );
		$this->assertSame( '', $values['pronouns'] );
		$this->assertCount( 11, $values );

		// A meta-sourced field returning a non-scalar resolves to ''.
		$this->options[ ProfileFields::OPTION ]['mapping']['badge'] = [
			'source'   => 'meta',
			'meta_key' => 'hr_badge',
		];
		$this->assertSame( '', ProfileFields::values_for( 7 )['badge'] );
	}

	public function test_values_filter_can_override_and_is_coerced(): void {
		Filters\expectApplied( 'imgsig/profile/values' )
			->once()
			->andReturnUsing(
				static function ( array $values ): array {
					$values['job_title'] = 'Override';
					$values['bad']       = [ 'x' ];
					return $values;
				}
			);

		$values = ProfileFields::values_for( 3 );
		$this->assertSame( 'Override', $values['job_title'] );
		$this->assertArrayNotHasKey( 'bad', $values );
	}

	public function test_save_sanitises_ignores_mapped_and_clears_empty(): void {
		$this->user_meta[5][ ProfileFields::META_KEY ] = [
			'department' => 'Old',
			'pronouns'   => 'she/her',
		];
		$this->options[ ProfileFields::OPTION ]        = [
			'mapping' => [
				'phone' => [
					'source'   => 'meta',
					'meta_key' => 'billing_phone',
				],
			],
		];

		Actions\expectDone( 'imgsig/profile/updated' )
			->once()
			->with( 5, [ 'job_title', 'linkedin_url', 'pronouns' ], 'rest' );

		$result = ProfileFields::save(
			5,
			[
				'job_title'    => ' <b>Engineer</b> ',
				'linkedin_url' => 'linkedin.com/in/x',
				'pronouns'     => '',
				'department'   => 'Old',
				'phone'        => '+1 555',
				'nope'         => 'x',
			]
		);

		$this->assertSame( [ 'job_title', 'linkedin_url', 'pronouns' ], $result['changed'] );
		$this->assertSame( [ 'phone', 'nope' ], $result['ignored'] );
		$this->assertSame(
			[
				'department'   => 'Old',
				'job_title'    => 'Engineer',
				'linkedin_url' => 'https://linkedin.com/in/x',
			],
			$this->user_meta[5][ ProfileFields::META_KEY ]
		);
	}

	public function test_save_without_changes_writes_nothing(): void {
		$this->user_meta[5][ ProfileFields::META_KEY ] = [ 'department' => 'Sales' ];
		Actions\expectDone( 'imgsig/profile/updated' )->never();

		$result = ProfileFields::save( 5, [ 'department' => 'Sales' ] );
		$this->assertSame( [], $result['changed'] );
	}

	public function test_clearing_the_last_value_deletes_the_meta(): void {
		$this->user_meta[5][ ProfileFields::META_KEY ] = [ 'department' => 'Sales' ];
		ProfileFields::save( 5, [ 'department' => '' ] );
		$this->assertArrayNotHasKey( ProfileFields::META_KEY, $this->user_meta[5] );
	}

	public function test_public_definitions_hide_meta_keys(): void {
		$this->options[ ProfileFields::OPTION ] = [
			'mapping' => [
				'phone' => [
					'source'   => 'meta',
					'meta_key' => 'billing_phone',
				],
			],
		];
		$defs = ProfileFields::public_definitions();

		$this->assertSame( array_keys( ProfileFields::CANONICAL ), array_column( $defs, 'key' ) );
		$phone = $defs[2];
		$this->assertSame( 'phone', $phone['key'] );
		$this->assertTrue( $phone['readonly'] );
		$this->assertArrayNotHasKey( 'meta_key', $phone );
		$this->assertFalse( $defs[0]['readonly'] );
	}

	public function test_meta_key_suggestions_filter_denied_keys(): void {
		$GLOBALS['wpdb'] = new class() extends \wpdb {
			/**
			 * @param string|null $query SQL.
			 * @return array<int, string>
			 */
			public function get_col( $query = null ) {
				return [ 'billing_phone', 'session_tokens', 'wp_capabilities', 'first_name', 'imgsig_profile', 'description' ];
			}
		};

		$this->assertSame( [ 'user_url', 'user_email', 'display_name', 'billing_phone', 'first_name', 'description' ], ProfileFields::meta_key_suggestions() );
		$this->assertSame( [ 'billing_phone' ], ProfileFields::meta_key_suggestions( 'phone' ) );

		unset( $GLOBALS['wpdb'] );
	}
}
