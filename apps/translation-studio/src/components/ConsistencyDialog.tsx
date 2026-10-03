import type { CellEdit } from '../types/translation'
import type { Inconsistency } from '../utils/glossary'
import { languageName } from '../utils/languages'
import { Modal } from './Modal'
import { Btn } from './ui'
import { S } from '../strings'

/** Same base text, different translations — unify to one variant or jump to the rows. */
export function ConsistencyDialog({
  report,
  readOnly,
  onClose,
  onUnify,
  onShow,
}: {
  report: Inconsistency[]
  readOnly: boolean
  onClose: () => void
  onUnify: (edits: CellEdit[]) => void
  onShow: (base: string) => void
}) {
  const unify = (item: Inconsistency, value: string) =>
    onUnify(item.variants.filter((v) => v.value !== value).flatMap((v) => v.rowKeys.map((rowKey) => ({ rowKey, lcid: item.lcid, value }))))

  return (
    <Modal title={S.consistency.title} onClose={onClose} wide footer={<Btn onClick={onClose}>{S.common.close}</Btn>}>
      <p className="muted small">{S.consistency.intro}</p>
      {report.length === 0 ? <p>{S.consistency.none}</p> : null}
      <div className="diff">
        <table className="diff__table">
          <tbody>
            {report.map((item) => (
              <tr key={`${item.lcid}|${item.base}`}>
                <td>
                  <strong>{item.base}</strong>
                  <div className="muted small">{languageName(item.lcid)}</div>
                </td>
                <td>
                  <ul className="variants">
                    {item.variants.map((v) => (
                      <li key={v.value}>
                        <span>„{v.value}“</span> <span className="muted small">× {v.count}</span>{' '}
                        {!readOnly ? (
                          <Btn small kind="ghost" onClick={() => unify(item, v.value)}>
                            {S.consistency.unify}
                          </Btn>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </td>
                <td>
                  <Btn small onClick={() => onShow(item.base)}>
                    {S.consistency.show}
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
