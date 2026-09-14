// Punctuation repair for assistant text.
//
// Haiku drops the space after a full stop often enough that it is a visible
// tell in the chat panel: "Moved it to delivered.Invoice is drafted." The
// prompt asks for the space, and prompts are a preference rather than a
// control, so the text is repaired on the way out as well.
//
// Deliberately narrow. It only fires on a sentence-ending mark followed
// immediately by a CAPITAL letter, which is the shape the mistake actually
// takes, and never on a lowercase one — so tuimedia.nz, hello@tuimedia.nz,
// 14.09 and $1.5k all pass through untouched. The comma rule is letter to
// letter for the same reason: 1,200 is left alone.
export function tidyPunctuation(text: string): string {
  return text
    .replace(/([A-Za-z0-9)\]"'])([.!?])([A-Z])/g, '$1$2 $3')
    .replace(/([A-Za-z]),([A-Za-z])/g, '$1, $2')
}
