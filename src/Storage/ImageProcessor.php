<?php
/**
 * Pre-storage image normalisation (metadata strip + downscale).
 *
 * @package ImaginaSignatures\Storage
 */

declare(strict_types=1);

namespace ImaginaSignatures\Storage;

defined( 'ABSPATH' ) || exit;

/**
 * Prepares an uploaded image before the Media Library driver stores it.
 *
 *  - JPEGs are re-encoded through `wp_get_image_editor()` (GD preferred,
 *    since GD never writes EXIF), after applying the EXIF orientation,
 *    so camera / GPS metadata never reaches a publicly reachable URL.
 *    A lossless APP1 / APP13 / COM segment strip runs on the result as
 *    a belt-and-braces pass for editors (Imagick) that can carry
 *    metadata through a plain save.
 *  - Anything wider than 1600 px (`imgsig/upload/max_image_width`) is
 *    downscaled — signatures render at ≤ 800 px, so bigger originals
 *    only cost storage and bandwidth.
 *  - GIFs are never touched (re-encoding would flatten animations).
 *
 * Every step is best-effort: when no image editor is available the
 * original file is used unchanged.
 *
 * @since 1.0.40
 */
final class ImageProcessor {

	/**
	 * Default maximum stored width in pixels.
	 */
	public const DEFAULT_MAX_WIDTH = 1600;

	/**
	 * Types eligible for processing.
	 *
	 * @var string[]
	 */
	private const PROCESSABLE = [ 'image/jpeg', 'image/png', 'image/webp' ];

	/**
	 * Processes `$path` and returns the path of the file to store — the
	 * original when nothing needed to change, otherwise a new temporary
	 * file (the caller's sideload moves / deletes it).
	 *
	 * @since 1.0.40
	 *
	 * @param string $path Absolute path of the uploaded file.
	 * @param string $mime Canonical mime type.
	 *
	 * @return string
	 */
	public function prepare( string $path, string $mime ): string {
		if ( ! in_array( $mime, self::PROCESSABLE, true ) || ! function_exists( 'wp_get_image_editor' ) ) {
			return $path;
		}

		$prefer_gd = static function ( $editors ) {
			if ( ! is_array( $editors ) ) {
				return $editors;
			}
			usort(
				$editors,
				static function ( $a, $b ): int {
					return (int) ( 'WP_Image_Editor_GD' !== $a ) - (int) ( 'WP_Image_Editor_GD' !== $b );
				}
			);
			return $editors;
		};

		add_filter( 'wp_image_editors', $prefer_gd );

		try {
			$editor = wp_get_image_editor( $path );
			if ( is_wp_error( $editor ) ) {
				return $this->strip_if_jpeg( $path, $mime );
			}

			$changed = false;

			if ( 'image/jpeg' === $mime ) {
				// Orientation lives in EXIF, which the re-encode drops —
				// bake it into the pixels first.
				if ( method_exists( $editor, 'maybe_exif_rotate' ) ) {
					$editor->maybe_exif_rotate();
				}
				$changed = true;
			}

			$size      = $editor->get_size();
			$max_width = $this->max_width();
			if ( is_array( $size ) && isset( $size['width'] ) && (int) $size['width'] > $max_width ) {
				$resized = $editor->resize( $max_width, null, false );
				if ( ! is_wp_error( $resized ) ) {
					$changed = true;
				}
			}

			if ( ! $changed ) {
				return $path;
			}

			$target = trailingslashit( get_temp_dir() ) . 'imgsig-' . bin2hex( random_bytes( 8 ) ) . '.' . UploadPolicy::extension_for( $mime );
			$saved  = $editor->save( $target, $mime );

			if ( is_wp_error( $saved ) || empty( $saved['path'] ) || ! file_exists( (string) $saved['path'] ) ) {
				return $this->strip_if_jpeg( $path, $mime );
			}

			return $this->strip_if_jpeg( (string) $saved['path'], $mime );
		} finally {
			remove_filter( 'wp_image_editors', $prefer_gd );
		}
	}

	/**
	 * Removes APP1 (EXIF / XMP), APP13 (IPTC / Photoshop) and COM segments
	 * from a JPEG in place, without re-encoding. JFIF, ICC (APP2) and
	 * Adobe (APP14) segments are kept so colours render correctly.
	 *
	 * @since 1.0.40
	 *
	 * @param string $path JPEG file.
	 *
	 * @return bool True when the file was rewritten.
	 */
	public static function strip_jpeg_metadata( string $path ): bool {
		$data = @file_get_contents( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local temp file.
		if ( ! is_string( $data ) ) {
			return false;
		}

		$stripped = self::strip_jpeg_metadata_bytes( $data );
		if ( null === $stripped || $stripped === $data ) {
			return false;
		}

		return false !== @file_put_contents( $path, $stripped ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- local temp file.
	}

	/**
	 * Pure-bytes implementation of {@see strip_jpeg_metadata()}.
	 *
	 * @since 1.0.40
	 *
	 * @param string $data JPEG bytes.
	 *
	 * @return string|null Stripped bytes, or null when the stream isn't a
	 *                     JPEG we can parse safely (caller keeps the original).
	 */
	public static function strip_jpeg_metadata_bytes( string $data ): ?string {
		$length = strlen( $data );
		if ( $length < 4 || "\xFF\xD8" !== substr( $data, 0, 2 ) ) {
			return null;
		}

		$out = "\xFF\xD8";
		$pos = 2;

		while ( $pos + 1 < $length ) {
			if ( "\xFF" !== $data[ $pos ] ) {
				return null;
			}

			$marker = ord( $data[ $pos + 1 ] );

			// Fill bytes.
			if ( 0xFF === $marker ) {
				++$pos;
				continue;
			}

			// Start of scan: the rest is entropy-coded image data.
			if ( 0xDA === $marker ) {
				return $out . substr( $data, $pos );
			}

			// Stand-alone markers (no length): TEM, RST0-7, EOI.
			if ( 0x01 === $marker || ( $marker >= 0xD0 && $marker <= 0xD7 ) || 0xD9 === $marker ) {
				$out .= substr( $data, $pos, 2 );
				$pos += 2;
				if ( 0xD9 === $marker ) {
					return $out;
				}
				continue;
			}

			if ( $pos + 4 > $length ) {
				return null;
			}

			$segment_length = ( ord( $data[ $pos + 2 ] ) << 8 ) | ord( $data[ $pos + 3 ] );
			if ( $segment_length < 2 || $pos + 2 + $segment_length > $length ) {
				return null;
			}

			$is_metadata = 0xE1 === $marker || 0xED === $marker || 0xFE === $marker;
			if ( ! $is_metadata ) {
				$out .= substr( $data, $pos, 2 + $segment_length );
			}

			$pos += 2 + $segment_length;
		}

		return $out;
	}

	/**
	 * Runs the lossless strip on JPEGs; returns the path either way.
	 *
	 * @param string $path File.
	 * @param string $mime Type.
	 *
	 * @return string
	 */
	private function strip_if_jpeg( string $path, string $mime ): string {
		if ( 'image/jpeg' === $mime ) {
			self::strip_jpeg_metadata( $path );
		}
		return $path;
	}

	/**
	 * Maximum stored width.
	 *
	 * @return int
	 */
	private function max_width(): int {
		/**
		 * Filters the maximum width (px) of images stored by the Media
		 * Library driver; wider uploads are downscaled.
		 *
		 * @since 1.0.40
		 *
		 * @param int $width Default 1600.
		 */
		$width = (int) apply_filters( 'imgsig/upload/max_image_width', self::DEFAULT_MAX_WIDTH );
		return $width > 0 ? $width : self::DEFAULT_MAX_WIDTH;
	}
}
