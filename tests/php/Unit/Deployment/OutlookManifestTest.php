<?php
/**
 * Unit tests for the Outlook add-in manifest.
 *
 * @package ImaginaSignatures\Tests\Unit\Deployment
 */

declare(strict_types=1);

namespace ImaginaSignatures\Tests\Unit\Deployment;

use Brain\Monkey;
use Brain\Monkey\Filters;
use Brain\Monkey\Functions;
use ImaginaSignatures\Deployment\OutlookCors;
use ImaginaSignatures\Deployment\OutlookManifest;
use ImaginaSignatures\Deployment\OutlookSettings;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/OutlookStubs.php';

/**
 * @covers \ImaginaSignatures\Deployment\OutlookManifest
 */
final class OutlookManifestTest extends TestCase {

	use OutlookStubs;

	private const KEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
	private const ID  = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->stub_outlook_wp();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * @return array<string, mixed>
	 */
	private function settings(): array {
		return OutlookSettings::sanitize(
			[
				'enabled'    => true,
				'deploy_key' => self::KEY,
				'add_in_id'  => self::ID,
				'revision'   => 3,
			]
		);
	}

	private function load( string $xml ): \DOMXPath {
		$doc = new \DOMDocument();
		$this->assertTrue( $doc->loadXML( $xml ), 'The manifest must be well-formed XML.' );
		$xpath = new \DOMXPath( $doc );
		$xpath->registerNamespace( 'o', OutlookManifest::NS_OFFICEAPP );
		$xpath->registerNamespace( 'xsi', OutlookManifest::NS_XSI );
		$xpath->registerNamespace( 'bt', OutlookManifest::NS_BT );
		$xpath->registerNamespace( 'v0', OutlookManifest::NS_VO_1_0 );
		$xpath->registerNamespace( 'v1', OutlookManifest::NS_VO_1_1 );
		return $xpath;
	}

	private function value( \DOMXPath $xpath, string $query ): string {
		$nodes = $xpath->query( $query );
		$this->assertNotFalse( $nodes );
		$this->assertSame( 1, $nodes->length, "Expected exactly one node for {$query}" );
		return (string) $nodes->item( 0 )->nodeValue;
	}

	public function test_manifest_is_a_well_formed_mail_app_with_the_required_elements(): void {
		$this->options['imgsig_brand_kit'] = [ 'company' => [ 'name' => 'ACME Corp' ] ];

		$xpath = $this->load( OutlookManifest::for_site( $this->settings() )->to_xml() );

		$this->assertSame( 'MailApp', $this->value( $xpath, '/o:OfficeApp/@xsi:type' ) );
		$this->assertSame( self::ID, $this->value( $xpath, '/o:OfficeApp/o:Id' ) );
		$this->assertMatchesRegularExpression( '/^\d+\.\d+\.\d+\.3$/', $this->value( $xpath, '/o:OfficeApp/o:Version' ) );
		$this->assertSame( 'ACME Corp', $this->value( $xpath, '/o:OfficeApp/o:ProviderName' ) );
		$this->assertSame( 'es-ES', $this->value( $xpath, '/o:OfficeApp/o:DefaultLocale' ) );
		$this->assertSame( 'ACME Corp signature', $this->value( $xpath, '/o:OfficeApp/o:DisplayName/@DefaultValue' ) );
		$this->assertNotSame( '', $this->value( $xpath, '/o:OfficeApp/o:Description/@DefaultValue' ) );
		$this->assertStringEndsWith( '/assets/outlook/icon-64.png', $this->value( $xpath, '/o:OfficeApp/o:IconUrl/@DefaultValue' ) );
		$this->assertStringEndsWith( '/assets/outlook/icon-128.png', $this->value( $xpath, '/o:OfficeApp/o:HighResolutionIconUrl/@DefaultValue' ) );
		$this->assertSame( 'https://acme.example', $this->value( $xpath, '/o:OfficeApp/o:AppDomains/o:AppDomain' ) );
		$this->assertSame( 'Mailbox', $this->value( $xpath, '/o:OfficeApp/o:Hosts/o:Host/@Name' ) );
		$this->assertSame( 'ReadWriteItem', $this->value( $xpath, '/o:OfficeApp/o:Permissions' ) );
		$this->assertSame( 'ItemEdit', $this->value( $xpath, '/o:OfficeApp/o:FormSettings/o:Form/@xsi:type' ) );
		$this->assertSame( 'VersionOverridesV1_0', $this->value( $xpath, '/o:OfficeApp/v0:VersionOverrides/@xsi:type' ) );
		$this->assertSame( 'VersionOverridesV1_1', $this->value( $xpath, '/o:OfficeApp/v0:VersionOverrides/v1:VersionOverrides/@xsi:type' ) );
	}

	public function test_launch_events_and_handlers(): void {
		$xpath = $this->load( OutlookManifest::for_site( $this->settings() )->to_xml() );
		$host  = '/o:OfficeApp/v0:VersionOverrides/v1:VersionOverrides/v1:Hosts/v1:Host[@xsi:type="MailHost"]';

		$desktop = [];
		foreach ( $xpath->query( $host . '/v1:DesktopFormFactor/v1:ExtensionPoint[@xsi:type="LaunchEvent"]/v1:LaunchEvents/v1:LaunchEvent' ) as $node ) {
			$desktop[ $node->getAttribute( 'Type' ) ] = $node->getAttribute( 'FunctionName' );
		}
		$this->assertSame(
			[
				'OnNewMessageCompose'       => 'onNewMessageComposeHandler',
				'OnNewAppointmentOrganizer' => 'onNewAppointmentOrganizerHandler',
			],
			$desktop
		);

		$mobile = $xpath->query( $host . '/v1:MobileFormFactor/v1:ExtensionPoint[@xsi:type="LaunchEvent"]/v1:LaunchEvents/v1:LaunchEvent' );
		$this->assertSame( 1, $mobile->length );
		$this->assertSame( 'OnNewMessageCompose', $mobile->item( 0 )->getAttribute( 'Type' ) );

		$this->assertSame(
			'WebViewRuntime.Url',
			$this->value( $xpath, $host . '/v1:DesktopFormFactor/v1:ExtensionPoint[@xsi:type="LaunchEvent"]/v1:SourceLocation/@resid' )
		);
		$this->assertSame( 'javascript', $this->value( $xpath, $host . '/v1:Runtimes/v1:Runtime[@resid="WebViewRuntime.Url"]/v1:Override/@type' ) );
		$this->assertSame( 'JSRuntime.Url', $this->value( $xpath, $host . '/v1:Runtimes/v1:Runtime/v1:Override/@resid' ) );

		// The manual "Insert signature" command calls the same runtime.
		$this->assertSame(
			'insertImaginaSignature',
			$this->value( $xpath, $host . '/v1:DesktopFormFactor/v1:ExtensionPoint[@xsi:type="MessageComposeCommandSurface"]//v1:Action[@xsi:type="ExecuteFunction"]/v1:FunctionName' )
		);

		// Mobile-eligible requirement on the V1_1 override; V1_0 for the button only.
		$this->assertSame( '1.5', $this->value( $xpath, '/o:OfficeApp/v0:VersionOverrides/v1:VersionOverrides/v1:Requirements/bt:Sets/@DefaultMinVersion' ) );
		$this->assertSame( 'Mailbox', $this->value( $xpath, '/o:OfficeApp/v0:VersionOverrides/v1:VersionOverrides/v1:Requirements/bt:Sets/bt:Set/@Name' ) );
	}

	public function test_both_runtime_urls_carry_the_key_and_the_signature_endpoint(): void {
		$xpath     = $this->load( OutlookManifest::for_site( $this->settings() )->to_xml() );
		$resources = '/o:OfficeApp/v0:VersionOverrides/v1:VersionOverrides/v1:Resources/bt:Urls/bt:Url';
		$api       = rawurlencode( 'https://acme.example/wp-json/imagina-signatures/v1/outlook/signature' );

		$this->assertSame(
			'https://acme.example/wp-content/plugins/imagina-signatures/assets/outlook/commands.html?key=' . self::KEY . '&api=' . $api,
			$this->value( $xpath, $resources . '[@id="WebViewRuntime.Url"]/@DefaultValue' )
		);
		$this->assertSame(
			'https://acme.example/wp-content/plugins/imagina-signatures/assets/outlook/launchevent.js?key=' . self::KEY . '&api=' . $api,
			$this->value( $xpath, $resources . '[@id="JSRuntime.Url"]/@DefaultValue' )
		);
		$this->assertStringContainsString( 'key=' . self::KEY, $this->value( $xpath, $resources . '[@id="Commands.Url"]/@DefaultValue' ) );

		// Every resource referenced by resid exists.
		foreach ( [ 'Icon.16x16', 'Icon.32x32', 'Icon.80x80' ] as $id ) {
			$this->assertStringEndsWith( '.png', $this->value( $xpath, '/o:OfficeApp/v0:VersionOverrides/v1:VersionOverrides/v1:Resources/bt:Images/bt:Image[@id="' . $id . '"]/@DefaultValue' ) );
		}
		foreach ( [ 'Group.Label', 'InsertButton.Label' ] as $id ) {
			$this->value( $xpath, '/o:OfficeApp/v0:VersionOverrides/v1:VersionOverrides/v1:Resources/bt:ShortStrings/bt:String[@id="' . $id . '"]/@DefaultValue' );
		}
	}

	public function test_assets_on_another_origin_are_trusted_by_app_domains_and_cors(): void {
		Functions\when( 'plugins_url' )->alias(
			static function ( $path = '' ): string {
				return 'https://cdn.acme-static.example/wp-content/plugins/imagina-signatures/' . ltrim( (string) $path, '/' );
			}
		);

		$xpath   = $this->load( OutlookManifest::for_site( $this->settings() )->to_xml() );
		$domains = [];
		foreach ( $xpath->query( '/o:OfficeApp/o:AppDomains/o:AppDomain' ) as $node ) {
			$domains[] = $node->nodeValue;
		}
		$this->assertSame( [ 'https://acme.example', 'https://cdn.acme-static.example' ], $domains );

		$this->assertSame( [ 'https://acme.example', 'https://cdn.acme-static.example' ], OutlookCors::own_origins() );
		$this->assertSame(
			'https://cdn.acme-static.example',
			OutlookCors::headers_for( 'https://cdn.acme-static.example', OutlookCors::own_origins() )['Access-Control-Allow-Origin']
		);
	}

	public function test_display_name_falls_back_to_the_site_name(): void {
		$xpath = $this->load( OutlookManifest::for_site( $this->settings() )->to_xml() );

		$this->assertSame( 'Acme Blog signature', $this->value( $xpath, '/o:OfficeApp/o:DisplayName/@DefaultValue' ) );
		$this->assertSame( 'Acme Blog', $this->value( $xpath, '/o:OfficeApp/o:ProviderName' ) );
	}

	public function test_hostile_company_names_are_escaped_and_clipped(): void {
		$this->options['imgsig_brand_kit'] = [ 'company' => [ 'name' => 'Smith & "Sons" <Ltd>' ] ];
		$xml = OutlookManifest::for_site( $this->settings() )->to_xml();

		$xpath = $this->load( $xml );
		$this->assertSame( 'Smith & "Sons" signature', $this->value( $xpath, '/o:OfficeApp/o:DisplayName/@DefaultValue' ) );

		$ctx                 = OutlookManifest::context( $this->settings() );
		$ctx['display_name'] = str_repeat( 'é', 300 ) . "\x01";
		$clipped             = $this->load( ( new OutlookManifest( $ctx ) )->to_xml() );
		$name                = $this->value( $clipped, '/o:OfficeApp/o:DisplayName/@DefaultValue' );
		$this->assertLessThanOrEqual( 125, mb_strlen( $name ) );
	}

	public function test_min_mailbox_is_filterable_and_validated(): void {
		Filters\expectApplied( 'imgsig/outlook/manifest_min_mailbox' )->once()->andReturn( '1.12' );
		$xpath = $this->load( OutlookManifest::for_site( $this->settings() )->to_xml() );
		$this->assertSame( '1.12', $this->value( $xpath, '/o:OfficeApp/v0:VersionOverrides/v1:VersionOverrides/v1:Requirements/bt:Sets/@DefaultMinVersion' ) );
	}

	public function test_invalid_min_mailbox_falls_back_to_the_default(): void {
		Filters\expectApplied( 'imgsig/outlook/manifest_min_mailbox' )->once()->andReturn( '"/><evil/>' );
		$ctx = OutlookManifest::context( $this->settings() );
		$this->assertSame( OutlookManifest::DEFAULT_OVERRIDE_MIN_MAILBOX, $ctx['min_mailbox'] );
	}

	public function test_version_string_and_locale_helpers(): void {
		$this->assertSame( '1.3.0.2', OutlookManifest::version_string( '1.3.0', 2 ) );
		$this->assertSame( '1.3.0.1', OutlookManifest::version_string( '1.3.0-beta.4', 1 ) );
		$this->assertSame( '2.0.0.5', OutlookManifest::version_string( '2', 5 ) );
		$this->assertSame( '1.2.3.1', OutlookManifest::version_string( '1.2.3', 0 ) );

		$this->assertSame( 'es-ES', OutlookManifest::office_locale( 'es_ES' ) );
		$this->assertSame( 'de-DE', OutlookManifest::office_locale( 'de_DE_formal' ) );
		$this->assertSame( 'ja', OutlookManifest::office_locale( 'ja' ) );
		$this->assertSame( 'en-US', OutlookManifest::office_locale( '' ) );
	}
}
