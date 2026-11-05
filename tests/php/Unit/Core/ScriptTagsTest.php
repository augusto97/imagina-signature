<?php
/**
 * Rocket Loader opt-out on the plugin's script tags.
 *
 * @package ImaginaSignatures\Tests\Unit\Core
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Core;

use ImaginaSignatures\Admin\AdminAssetEnqueuer;
use ImaginaSignatures\Admin\EditorAssetEnqueuer;
use ImaginaSignatures\Core\ScriptTags;
use PHPUnit\Framework\TestCase;

/**
 * Cloudflare Rocket Loader re-creates scripts without their CSP nonce,
 * which blocked the public route's bootstrap; every tag we print opts out.
 */
final class ScriptTagsTest extends TestCase {

	public function test_adds_the_opt_out_to_every_script_tag_once(): void {
		$wp_tag = "<script id='imgsig-admin-js-before'>\nwindow.IMGSIG_ADMIN_CONFIG = {};\n</script>\n"
			. "<script src='https://example.com/admin.js' id='imgsig-admin-js'></script>\n";

		$once = ScriptTags::opt_out_of_optimizers( $wp_tag );

		$this->assertSame( 2, substr_count( $once, 'data-cfasync="false"' ) );
		$this->assertStringContainsString( "<script data-cfasync=\"false\" id='imgsig-admin-js-before'>", $once );
		$this->assertSame( $once, ScriptTags::opt_out_of_optimizers( $once ), 'Idempotent.' );
	}

	public function test_leaves_an_explicit_choice_and_other_markup_alone(): void {
		$this->assertSame(
			'<script data-cfasync="true" src="x.js"></script>',
			ScriptTags::opt_out_of_optimizers( '<script data-cfasync="true" src="x.js"></script>' )
		);
		$this->assertSame( '<noscript>x</noscript>', ScriptTags::opt_out_of_optimizers( '<noscript>x</noscript>' ) );
	}

	public function test_enqueuers_tag_the_bundle_and_its_inline_bootstrap(): void {
		$tag = "<script id='h-js-before'>window.X = {};</script>\n<script src='https://example.com/a.js' id='h-js'></script>\n";

		foreach ( [ AdminAssetEnqueuer::class, EditorAssetEnqueuer::class ] as $class ) {
			$handle = ( new \ReflectionClass( $class ) )->getConstant( 'HANDLE' );
			$out    = ( new \ReflectionClass( $class ) )->newInstanceWithoutConstructor()->tag_as_module( $tag, $handle );

			$this->assertStringContainsString( 'type="module" src=', $out, $class );
			$this->assertSame( 2, substr_count( $out, 'data-cfasync="false"' ), $class );
			// Idempotent when several enqueuer instances filter the same tag.
			$again = ( new \ReflectionClass( $class ) )->newInstanceWithoutConstructor()->tag_as_module( $out, $handle );
			$this->assertSame( $out, $again, $class );
			// Other handles untouched.
			$this->assertSame( $tag, ( new \ReflectionClass( $class ) )->newInstanceWithoutConstructor()->tag_as_module( $tag, 'jquery' ), $class );
		}
	}
}
