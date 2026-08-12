export interface HiddenFieldProps {
  name: string
  value: string | number
}

/** Champ technique de formulaire sans interface visible, centralisé pour éviter les primitives dispersées dans les pages. */
export default function HiddenField({ name, value }: HiddenFieldProps) {
  return <input type="hidden" name={name} value={value} />
}
