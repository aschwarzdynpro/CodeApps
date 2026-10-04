import type { ExplorerItem } from '../../utils/designerTree'
import { S } from '../../strings'

/** Type of a form (Hauptformular, Schnellansicht …) for the line under its name. */
export const formType = (f: ExplorerItem) => (f.type !== undefined ? (S.preview.formTypes[f.type] ?? S.preview.formTypeOther) : undefined)

/** Type of a view (Öffentlich, Schnellsuche …) once its definition is loaded. */
export const viewType = (types: ReadonlyMap<string, number>, id: string) => {
  const t = types.get(id)
  return t !== undefined ? (S.preview.viewTypes[t] ?? S.designer.kinds.view) : undefined
}
