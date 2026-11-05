import { Node } from '@tiptap/react';

/**
 * Top-level document node that holds exactly one paragraph — for
 * single-line rich text such as the Heading block. Enter can't split
 * the paragraph (Shift+Enter still inserts a `<br>`), and pasted
 * multi-paragraph content is joined into the one paragraph.
 */
export const SingleParagraphDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: 'paragraph',
});
