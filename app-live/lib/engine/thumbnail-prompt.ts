// Shared thumbnail prompt construction — used by both the Thumbnail Studio
// (app/api/thumbnail) and the in-chat generateThumbnail tool, so a thumbnail made in
// either place comes out of the same recipe.

// AI33 uploads every reference as an `assets` file, so the ceiling is about payload size
// and how many @imgN tokens the model can actually honour — a handful is plenty.
export const MAX_THUMBNAIL_REFS = 4

/**
 * Build a click-optimized YouTube thumbnail prompt for nano-banana-pro.
 *
 * The two reference kinds mean different things and are labelled separately: the user's
 * images supply subject identity, competitors' supply visual language. Without that
 * split the model treats a rival's thumbnail as something to copy wholesale.
 */
export function buildThumbnailPrompt(
  concept: string,
  titleText: string | undefined,
  userRefCount: number,
  competitorRefCount: number
): string {
  const parts = [
    'YouTube thumbnail, 16:9, ultra high contrast, bold saturated colors, dramatic rim lighting,',
    'sharp focus on the subject, shallow depth of field, punchy and eye-catching for a small preview size.',
    concept.trim()
  ]

  if (titleText?.trim()) {
    parts.push(
      `Render the exact text "${titleText.trim()}" as a large, bold, legible headline with a strong outline/shadow so it pops. Do not misspell it.`
    )
  }

  if (userRefCount > 0) {
    const tokens = Array.from({ length: userRefCount }, (_, i) => `@img${i + 1}`)
    parts.push(
      `${tokens.join(', ')} ${userRefCount > 1 ? 'are' : 'is'} the supplied reference — keep the subject/branding shown there visually consistent.`
    )
  }

  if (competitorRefCount > 0) {
    const tokens = Array.from(
      { length: competitorRefCount },
      (_, i) => `@img${userRefCount + i + 1}`
    )
    parts.push(
      `${tokens.join(', ')} ${competitorRefCount > 1 ? 'are' : 'is'} a competitor thumbnail for STYLE reference only — match its composition energy, color grading, text weight and framing, but do not copy its subject, faces or wording.`
    )
  }

  return parts.join(' ')
}
