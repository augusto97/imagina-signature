<?php
/**
 * Unit tests for the guarded in-place upgrade.
 *
 * @package ImaginaSignatures\Tests\Unit\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Core;

use Brain\Monkey;
use Brain\Monkey\Functions;
use ImaginaSignatures\Core\Plugin;
use PHPUnit\Framework\TestCase;

/**
 * @covers \ImaginaSignatures\Core\Plugin::maybe_upgrade
 * @covers \ImaginaSignatures\Core\Plugin::maybe_upgrade_for_rest
 */
final class UpgradeGuardTest extends TestCase {

	/** @var array<string, mixed> */
	private array $options = [];

	/** @var array<string, mixed> */
	private array $transients = [];

	private int $install_attempts = 0;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		if ( ! defined( 'IMGSIG_VERSION' ) ) {
			define( 'IMGSIG_VERSION', '1.0.40' );
		}

		$this->options          = [ 'imgsig_schema_version' => '99.0.0' ];
		$this->transients       = [];
		$this->install_attempts = 0;

		Functions\when( 'get_option' )->alias(
			function ( $name, $default = false ) {
				return array_key_exists( $name, $this->options ) ? $this->options[ $name ] : $default;
			}
		);
		Functions\when( 'add_option' )->alias(
			function ( $name, $value ): bool {
				if ( array_key_exists( $name, $this->options ) ) {
					return false;
				}
				$this->options[ $name ] = $value;
				return true;
			}
		);
		Functions\when( 'update_option' )->alias(
			function ( $name, $value ): bool {
				$this->options[ $name ] = $value;
				return true;
			}
		);
		Functions\when( 'delete_option' )->alias(
			function ( $name ): bool {
				unset( $this->options[ $name ] );
				return true;
			}
		);
		Functions\when( 'get_transient' )->alias(
			function ( $key ) {
				return $this->transients[ $key ] ?? false;
			}
		);
		Functions\when( 'set_transient' )->alias(
			function ( $key, $value ): bool {
				$this->transients[ $key ] = $value;
				return true;
			}
		);
		// Installer::install() → CapabilitiesInstaller → wp_roles(): make
		// the install fail deterministically so we can observe the guard.
		Functions\when( 'get_role' )->alias(
			function () {
				++$this->install_attempts;
				throw new \RuntimeException( 'simulated install failure' );
			}
		);
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_current_version_does_nothing(): void {
		$this->options['imgsig_version'] = IMGSIG_VERSION;

		Plugin::instance()->maybe_upgrade();

		$this->assertSame( 0, $this->install_attempts );
	}

	public function test_missing_version_on_network_subsite_triggers_install_and_failure_backs_off(): void {
		// No `imgsig_version` at all (= '0.0.0'): previously skipped.
		Plugin::instance()->maybe_upgrade();

		$this->assertSame( 1, $this->install_attempts );
		$this->assertArrayHasKey( 'imgsig_upgrade_backoff', $this->transients );
		$this->assertArrayNotHasKey( 'imgsig_upgrade_lock', $this->options, 'Lock is released.' );

		// Backed off: no retry on the next request.
		Plugin::instance()->maybe_upgrade();
		$this->assertSame( 1, $this->install_attempts );
	}

	public function test_fresh_lock_held_by_another_request_skips(): void {
		$this->options['imgsig_version']      = '1.0.0';
		$this->options['imgsig_upgrade_lock'] = time();

		Plugin::instance()->maybe_upgrade();

		$this->assertSame( 0, $this->install_attempts );
		$this->assertArrayHasKey( 'imgsig_upgrade_lock', $this->options, 'Foreign lock untouched.' );
	}

	public function test_stale_lock_is_taken_over(): void {
		$this->options['imgsig_version']      = '1.0.0';
		$this->options['imgsig_upgrade_lock'] = time() - 3600;

		Plugin::instance()->maybe_upgrade();

		$this->assertSame( 1, $this->install_attempts );
	}

	public function test_anonymous_rest_requests_never_upgrade(): void {
		Functions\when( 'is_user_logged_in' )->justReturn( false );

		Plugin::instance()->maybe_upgrade_for_rest();

		$this->assertSame( 0, $this->install_attempts );
	}
}
