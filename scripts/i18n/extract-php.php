<?php
/**
 * Extracts gettext calls for the `imagina-signatures` text domain from
 * the plugin's PHP sources using the PHP tokenizer (no WP-CLI needed).
 *
 * Usage (from the repo root):
 *
 *   php scripts/i18n/extract-php.php            # JSON on stdout
 *   php scripts/i18n/extract-php.php --report   # human-readable summary
 *
 * Recognised functions: __, _e, esc_html__, esc_html_e, esc_attr__,
 * esc_attr_e, _x, _ex, esc_html_x, esc_attr_x, _n, _nx, _n_noop,
 * _nx_noop. Calls whose domain argument isn't the literal
 * 'imagina-signatures' are ignored. Calls whose text argument isn't a
 * string literal (or a concatenation of literals) are reported under
 * `dynamic` so they can be fixed or backed by a literal list.
 *
 * A `translators:` comment within the three lines above a call is
 * attached as an extracted comment.
 *
 * Dev tooling only — never loaded by WordPress.
 *
 * @package ImaginaSignatures
 */

declare(strict_types=1);

// phpcs:disable -- CLI build script, not plugin runtime code.

const IMGSIG_I18N_DOMAIN = 'imagina-signatures';

/**
 * Argument positions per function: text, plural, context, domain (0-based; null = absent).
 */
const IMGSIG_I18N_FUNCTIONS = [
	'__'          => [ 'text' => 0, 'plural' => null, 'context' => null, 'domain' => 1 ],
	'_e'          => [ 'text' => 0, 'plural' => null, 'context' => null, 'domain' => 1 ],
	'esc_html__'  => [ 'text' => 0, 'plural' => null, 'context' => null, 'domain' => 1 ],
	'esc_html_e'  => [ 'text' => 0, 'plural' => null, 'context' => null, 'domain' => 1 ],
	'esc_attr__'  => [ 'text' => 0, 'plural' => null, 'context' => null, 'domain' => 1 ],
	'esc_attr_e'  => [ 'text' => 0, 'plural' => null, 'context' => null, 'domain' => 1 ],
	'_x'          => [ 'text' => 0, 'plural' => null, 'context' => 1, 'domain' => 2 ],
	'_ex'         => [ 'text' => 0, 'plural' => null, 'context' => 1, 'domain' => 2 ],
	'esc_html_x'  => [ 'text' => 0, 'plural' => null, 'context' => 1, 'domain' => 2 ],
	'esc_attr_x'  => [ 'text' => 0, 'plural' => null, 'context' => 1, 'domain' => 2 ],
	'_n'          => [ 'text' => 0, 'plural' => 1, 'context' => null, 'domain' => 3 ],
	'_nx'         => [ 'text' => 0, 'plural' => 1, 'context' => 3, 'domain' => 4 ],
	'_n_noop'     => [ 'text' => 0, 'plural' => 1, 'context' => null, 'domain' => 2 ],
	'_nx_noop'    => [ 'text' => 0, 'plural' => 1, 'context' => 2, 'domain' => 3 ],
];

/**
 * Decodes a T_CONSTANT_ENCAPSED_STRING token into its runtime value.
 *
 * @param string $token Raw token text including quotes.
 *
 * @return string
 */
function imgsig_i18n_decode_string( string $token ): string {
	$quote = $token[0];
	$body  = substr( $token, 1, -1 );
	if ( "'" === $quote ) {
		return strtr( $body, [ '\\\\' => '\\', "\\'" => "'" ] );
	}
	return stripcslashes( str_replace( '\\$', '$', $body ) );
}

/**
 * Evaluates an argument token list when it is a literal or a `.`
 * concatenation of literals. Returns null otherwise.
 *
 * @param array<int, array{0:int|string,1:string,2:int}|string> $tokens Argument tokens.
 *
 * @return string|null
 */
function imgsig_i18n_literal( array $tokens ): ?string {
	$value     = '';
	$expecting = 'string';
	$seen      = false;
	foreach ( $tokens as $tok ) {
		if ( is_array( $tok ) && in_array( $tok[0], [ T_WHITESPACE, T_COMMENT, T_DOC_COMMENT ], true ) ) {
			continue;
		}
		if ( 'string' === $expecting && is_array( $tok ) && T_CONSTANT_ENCAPSED_STRING === $tok[0] ) {
			$value    .= imgsig_i18n_decode_string( $tok[1] );
			$expecting = 'dot';
			$seen      = true;
			continue;
		}
		if ( 'dot' === $expecting && '.' === $tok ) {
			$expecting = 'string';
			continue;
		}
		return null;
	}
	return $seen && 'dot' === $expecting ? $value : null;
}

/**
 * Text of a token list (for reporting non-literal calls).
 *
 * @param array<int, mixed> $tokens Tokens.
 *
 * @return string
 */
function imgsig_i18n_source( array $tokens ): string {
	$out = '';
	foreach ( $tokens as $tok ) {
		$out .= is_array( $tok ) ? $tok[1] : $tok;
	}
	return trim( (string) preg_replace( '/\s+/', ' ', $out ) );
}

/**
 * Extracts gettext calls from one PHP file.
 *
 * @param string $file     Absolute path.
 * @param string $rel_path Path relative to the repo root (for references).
 *
 * @return array{entries: array<int, array<string, mixed>>, dynamic: array<int, array<string, mixed>>}
 */
function imgsig_i18n_extract_file( string $file, string $rel_path ): array {
	$tokens  = token_get_all( (string) file_get_contents( $file ) );
	$count   = count( $tokens );
	$entries = [];
	$dynamic = [];

	// Most recent `translators:` comment: [ text, end line ].
	$note = null;

	for ( $i = 0; $i < $count; $i++ ) {
		$tok = $tokens[ $i ];
		if ( ! is_array( $tok ) ) {
			continue;
		}

		if ( T_COMMENT === $tok[0] || T_DOC_COMMENT === $tok[0] ) {
			if ( preg_match( '/translators:\s*(.+?)\s*(?:\*\/)?$/is', $tok[1], $m ) ) {
				$text = trim( (string) preg_replace( '/\s*\n\s*\*?\s*/', ' ', $m[1] ) );
				$note = [ 'translators: ' . $text, $tok[2] + substr_count( $tok[1], "\n" ) ];
			}
			continue;
		}

		$name = null;
		if ( T_STRING === $tok[0] ) {
			$name = $tok[1];
		} elseif ( defined( 'T_NAME_FULLY_QUALIFIED' ) && T_NAME_FULLY_QUALIFIED === $tok[0] ) {
			$name = ltrim( $tok[1], '\\' );
		}
		if ( null === $name || ! isset( IMGSIG_I18N_FUNCTIONS[ $name ] ) ) {
			continue;
		}

		// Previous significant token must not make this a method,
		// static call, declaration or `new`.
		for ( $p = $i - 1; $p >= 0 && is_array( $tokens[ $p ] ) && T_WHITESPACE === $tokens[ $p ][0]; $p-- ) {
			// Skip whitespace.
		}
		if ( $p >= 0 && is_array( $tokens[ $p ] ) && in_array( $tokens[ $p ][0], [ T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_FUNCTION, T_NEW ], true ) ) {
			continue;
		}
		if ( $p >= 0 && defined( 'T_NULLSAFE_OBJECT_OPERATOR' ) && is_array( $tokens[ $p ] ) && T_NULLSAFE_OBJECT_OPERATOR === $tokens[ $p ][0] ) {
			continue;
		}

		// Next significant token must be `(`.
		for ( $j = $i + 1; $j < $count && is_array( $tokens[ $j ] ) && T_WHITESPACE === $tokens[ $j ][0]; $j++ ) {
			// Skip whitespace.
		}
		if ( $j >= $count || '(' !== $tokens[ $j ] ) {
			continue;
		}

		// Split the argument list at depth-1 commas.
		$args  = [ [] ];
		$depth = 0;
		for ( $k = $j; $k < $count; $k++ ) {
			$t = $tokens[ $k ];
			$c = is_array( $t ) ? $t[1] : $t;
			if ( in_array( $c, [ '(', '[', '{' ], true ) || ( is_array( $t ) && in_array( $t[0], [ T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES ], true ) ) ) {
				$depth++;
				if ( 1 === $depth ) {
					continue;
				}
			} elseif ( in_array( $c, [ ')', ']', '}' ], true ) ) {
				$depth--;
				if ( 0 === $depth ) {
					break;
				}
			} elseif ( ',' === $c && 1 === $depth ) {
				$args[] = [];
				continue;
			}
			$args[ count( $args ) - 1 ][] = $t;
		}

		$spec   = IMGSIG_I18N_FUNCTIONS[ $name ];
		$line   = $tok[2];
		$domain = isset( $args[ $spec['domain'] ] ) ? imgsig_i18n_literal( $args[ $spec['domain'] ] ) : null;
		if ( IMGSIG_I18N_DOMAIN !== $domain ) {
			continue;
		}

		$text    = isset( $args[ $spec['text'] ] ) ? imgsig_i18n_literal( $args[ $spec['text'] ] ) : null;
		$plural  = null !== $spec['plural'] && isset( $args[ $spec['plural'] ] ) ? imgsig_i18n_literal( $args[ $spec['plural'] ] ) : null;
		$context = null !== $spec['context'] && isset( $args[ $spec['context'] ] ) ? imgsig_i18n_literal( $args[ $spec['context'] ] ) : null;

		if ( null === $text || ( null !== $spec['plural'] && null === $plural ) || ( null !== $spec['context'] && null === $context ) ) {
			$dynamic[] = [
				'file' => $rel_path,
				'line' => $line,
				'expr' => $name . '( ' . imgsig_i18n_source( $args[0] ?? [] ) . ', … )',
			];
			continue;
		}
		if ( '' === $text ) {
			continue;
		}

		$entry = [
			'msgid'      => $text,
			'msgctxt'    => $context,
			'msgidPlural' => $plural,
			'reference'  => $rel_path . ':' . $line,
			'note'       => null,
		];
		if ( null !== $note && $note[1] >= $line - 3 && $note[1] <= $line ) {
			$entry['note'] = $note[0];
			$note          = null;
		}
		$entries[] = $entry;
	}

	return [ 'entries' => $entries, 'dynamic' => $dynamic ];
}

/**
 * Lists the PHP files to scan.
 *
 * @param string $root Repo root.
 *
 * @return string[]
 */
function imgsig_i18n_files( string $root ): array {
	$files = [];
	foreach ( [ 'imagina-signatures.php', 'uninstall.php' ] as $top ) {
		if ( is_file( $root . '/' . $top ) ) {
			$files[] = $root . '/' . $top;
		}
	}
	$iterator = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator( $root . '/src', FilesystemIterator::SKIP_DOTS )
	);
	foreach ( $iterator as $info ) {
		if ( $info->isFile() && 'php' === $info->getExtension() ) {
			$files[] = $info->getPathname();
		}
	}
	sort( $files );
	return $files;
}

$root    = dirname( __DIR__, 2 );
$report  = in_array( '--report', $argv, true );
$all     = [];
$dynamic = [];
$files   = imgsig_i18n_files( $root );

foreach ( $files as $file ) {
	$rel    = ltrim( str_replace( '\\', '/', substr( $file, strlen( $root ) ) ), '/' );
	$result = imgsig_i18n_extract_file( $file, $rel );
	$all    = array_merge( $all, $result['entries'] );
	$dynamic = array_merge( $dynamic, $result['dynamic'] );
}

if ( $report ) {
	$unique = [];
	foreach ( $all as $e ) {
		$unique[ ( $e['msgctxt'] ?? '' ) . "\x04" . $e['msgid'] ] = true;
	}
	printf( "PHP: %d calls, %d unique msgids in %d files.\n", count( $all ), count( $unique ), count( $files ) );
	if ( ! empty( $dynamic ) ) {
		printf( "\nNon-literal gettext calls (%d):\n", count( $dynamic ) );
		foreach ( $dynamic as $d ) {
			printf( "  %s:%d  %s\n", $d['file'], $d['line'], $d['expr'] );
		}
	}
	exit( 0 );
}

echo json_encode(
	[
		'entries' => $all,
		'dynamic' => $dynamic,
	],
	JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
), "\n";
