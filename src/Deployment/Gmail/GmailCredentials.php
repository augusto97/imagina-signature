<?php
/**
 * Decrypted service-account credentials.
 *
 * @package ImaginaSignatures\Deployment\Gmail
 */

declare(strict_types=1);

namespace ImaginaSignatures\Deployment\Gmail;

defined( 'ABSPATH' ) || exit;

/**
 * The parts of a Google service-account key the token client needs,
 * with the private key in clear (PEM). Lives only in memory for the
 * duration of a request — {@see GmailSettings} stores the key
 * encrypted and never returns it over REST.
 *
 * `__debugInfo()` redacts the key so a stray `var_dump()` / `print_r()`
 * or an error tracker that serialises arguments can't leak it.
 *
 * @since 1.3.0
 */
final class GmailCredentials {

	/**
	 * Service-account email (`name@project.iam.gserviceaccount.com`) —
	 * the JWT `iss`.
	 *
	 * @var string
	 */
	public string $client_email;

	/**
	 * Numeric OAuth client ID — what the Workspace admin authorises
	 * for domain-wide delegation.
	 *
	 * @var string
	 */
	public string $client_id;

	/**
	 * Google Cloud project ID.
	 *
	 * @var string
	 */
	public string $project_id;

	/**
	 * Key ID (JWT `kid`), '' when the JSON had none.
	 *
	 * @var string
	 */
	public string $private_key_id;

	/**
	 * RSA private key, PEM.
	 *
	 * @var string
	 */
	public string $private_key;

	/**
	 * @param string $client_email   Service-account email.
	 * @param string $client_id      OAuth client ID.
	 * @param string $project_id     Cloud project ID.
	 * @param string $private_key_id Key ID.
	 * @param string $private_key    PEM private key.
	 */
	public function __construct( string $client_email, string $client_id, string $project_id, string $private_key_id, string $private_key ) {
		$this->client_email   = $client_email;
		$this->client_id      = $client_id;
		$this->project_id     = $project_id;
		$this->private_key_id = $private_key_id;
		$this->private_key    = $private_key;
	}

	/**
	 * Debug representation without the private key.
	 *
	 * @return array<string, string>
	 */
	public function __debugInfo(): array {
		return [
			'client_email'   => $this->client_email,
			'client_id'      => $this->client_id,
			'project_id'     => $this->project_id,
			'private_key_id' => $this->private_key_id,
			'private_key'    => '[redacted]',
		];
	}
}
