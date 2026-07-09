/**
 * Class-name concatenation helper.
 * Trivial version — swap for `clsx` + `tailwind-merge` in the real app.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
