import {useCallback, useMemo} from "react"
import {computed} from "mobx"
import {observer} from "mobx-react-lite"
import {FSItem, FSViewModel} from "./file-system"
import {Virtualizer} from "./virtualizer"

export let DirectoryView = ({view}: {view: FSViewModel}) => {
    const renderItem = useCallback(
        (row: FSItem[], style: React.CSSProperties) => {
            return (
                <div key={row[0].name} style={{display: "flex", ...style}}>
                    {row.map((item) => {
                        return (
                            <DirectoryViewItem
                                key={item.name}
                                item={item}
                                view={view}
                            />
                        )
                    })}
                </div>
            )
        },
        [],
    )

    const columns = 9 // TODO: compute based on available space
    const rows = useMemo(() => {
        const rows: FSItem[][] = []
        let row: FSItem[] = []
        for (let i = 0; i < view.cwd.children.length; i++) {
            row.push(view.cwd.children[i])
            if (row.length === columns) {
                rows.push(row)
                row = []
            }
        }
        if (row.length) {
            rows.push(row)
        }
        return rows
    }, [columns, view.cwd.children, view.cwd.children.length])

    return (
        <div
            style={{flex: 1}}
            onClick={(e) => {
                // the user can click on the canvas to clear the current
                // selection. Do not clear the selection if a modifier key
                // is pressed since that may just be a misclick.
                if (!e.ctrlKey && !e.shiftKey) {
                    view.selection.clear()
                }
            }}
        >
            <Virtualizer items={rows} itemHeight={24} renderItem={renderItem} />
        </div>
    )
}
DirectoryView = observer(DirectoryView)

let DirectoryViewItem = ({item, view}: {item: FSItem; view: FSViewModel}) => {
    const selected = computed(() => view.selected(item)).get()
    return (
        <div
            tabIndex={0}
            style={{
                background: selected ? "#aaf" : "#fff",
                userSelect: "none",
            }}
            onClick={(e) => {
                e.stopPropagation()
                view.selection.fromClickEvent(item, e.nativeEvent)
            }}
            onKeyDown={(e) => {
                if (selected && e.ctrlKey && e.key === "Delete") {
                    view.deleteSelection()
                }
            }}
        >
            <span>{item.name}</span>
        </div>
    )
}
DirectoryViewItem = observer(DirectoryViewItem)
